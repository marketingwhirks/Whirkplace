import type { Express } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { microsoftAuthService } from "../services/microsoft-auth";
import { requireOrganization } from "../middleware/organization";
import { requireAuth, requireRole } from "../middleware/auth";
import type { InsertUser } from "@shared/schema";

interface MicrosoftTokenData {
  accessToken: string;
  account: {
    homeAccountId: string;
    localAccountId: string;
    username: string;
    name: string;
    tenantId: string;
  };
}

export function registerMicrosoftAuthRoutes(app: Express): void {
  
  // Microsoft OAuth initiation
  app.get("/auth/microsoft", requireOrganization(), async (req, res) => {
    try {
      // Check if Microsoft auth is configured and enabled for this organization
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      if (!organization.enableMicrosoftAuth) {
        return res.status(403).json({ 
          message: "Microsoft authentication is not enabled for this organization" 
        });
      }
      
      if (!microsoftAuthService.isConfigured()) {
        return res.status(500).json({ 
          message: "Microsoft authentication is not configured on this server" 
        });
      }
      
      // Generate random state for CSRF protection
      const state = randomBytes(32).toString('hex');
      req.session.microsoftAuthState = state;
      req.session.authOrgId = req.orgId; // Store org ID for callback
      
      const authUrl = await microsoftAuthService.getAuthUrl(state);
      res.redirect(authUrl);
    } catch (error) {
      console.error("Microsoft auth initiation error:", error);
      res.status(500).json({ message: "Failed to initiate Microsoft authentication" });
    }
  });

  // Microsoft OAuth callback
  app.get("/auth/microsoft/callback", async (req, res) => {
    try {
      const { code, state, error: authError } = req.query;
      
      // Check for OAuth errors
      if (authError) {
        console.error("Microsoft OAuth error:", authError);
        return res.status(400).json({ message: `OAuth error: ${authError}` });
      }
      
      // Validate required parameters
      if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
        return res.status(400).json({ message: "Invalid OAuth callback parameters" });
      }
      
      // Validate state parameter
      if (!req.session.microsoftAuthState || req.session.microsoftAuthState !== state) {
        return res.status(400).json({ message: "Invalid or expired OAuth state" });
      }
      
      // Get organization ID from session
      const orgId = req.session.authOrgId;
      if (!orgId) {
        return res.status(400).json({ message: "Organization context lost" });
      }
      
      // Exchange authorization code for access token
      const tokenData = await microsoftAuthService.getTokenFromCode(code);
      if (!tokenData) {
        return res.status(400).json({ message: "Failed to exchange authorization code" });
      }
      
      // Get user profile from Microsoft Graph
      const userProfile = await microsoftAuthService.getUserProfile(tokenData.accessToken);
      if (!userProfile) {
        return res.status(400).json({ message: "Failed to get user profile" });
      }
      
      // Find or create user in our system - Check Microsoft ID first, then email
      let user = await storage.getUserByMicrosoftId(orgId, userProfile.id);
      
      if (!user) {
        // Try to find existing user by email (for account linking)
        const email = userProfile.mail || userProfile.userPrincipalName || "";
        if (email) {
          user = await storage.getUserByEmail(orgId, email);
        }
      }
      
      if (!user) {
        // Create new user
        const newUser: InsertUser = {
          username: userProfile.userPrincipalName || userProfile.mail || userProfile.id,
          password: randomBytes(32).toString('hex'), // Random password since they use Microsoft auth
          name: userProfile.displayName || userProfile.userPrincipalName || "Unknown User",
          email: userProfile.mail || userProfile.userPrincipalName || "",
          microsoftUserId: userProfile.id,
          microsoftAccessToken: tokenData.accessToken,
          microsoftRefreshToken: tokenData.refreshToken,
          authProvider: "microsoft",
          role: "member"
        };
        
        user = await storage.createUser(orgId, newUser);
      } else {
        // Update existing user with Microsoft details (account linking)
        const updateData: Partial<InsertUser> = {
          microsoftUserId: userProfile.id,
          microsoftAccessToken: tokenData.accessToken,
          microsoftRefreshToken: tokenData.refreshToken
        };
        
        // If this user was originally created through Slack, keep their auth provider as 'slack'
        // This allows them to continue using either authentication method
        if (!user.authProvider || user.authProvider === 'local') {
          updateData.authProvider = 'microsoft';
        }
        
        user = await storage.updateUser(orgId, user.id, updateData) || user;
      }
      
      // Set session
      req.session.userId = user.id;
      req.session.microsoftAuthState = undefined; // Clear state
      req.session.authOrgId = undefined; // Clear temp org ID
      
      // Set authentication cookies
      const sessionToken = randomBytes(32).toString('hex');
      
      res.cookie('auth_user_id', user.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      
      res.cookie('auth_org_id', orgId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      
      res.cookie('auth_session_token', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      
      // Redirect to dashboard
      const organization = await storage.getOrganization(orgId);
      const appUrl = process.env.REPL_URL || process.env.REPLIT_URL || 'http://localhost:5000';
      const dashboardUrl = `${appUrl}/#/dashboard?org=${organization?.slug}`;
      
      res.redirect(dashboardUrl);
    } catch (error) {
      console.error("Microsoft OAuth callback error:", error);
      res.status(500).json({ message: "Authentication failed" });
    }
  });

  // Get current Microsoft auth status
  app.get("/api/auth/microsoft/status", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const hasValidToken = user.microsoftAccessToken && user.microsoftUserId;
      
      res.json({
        connected: hasValidToken,
        email: user.email,
        name: user.name,
        microsoftUserId: user.microsoftUserId
      });
    } catch (error) {
      console.error("Microsoft auth status error:", error);
      res.status(500).json({ message: "Failed to get authentication status" });
    }
  });

  // Disconnect Microsoft account
  app.post("/api/auth/microsoft/disconnect", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      await storage.clearUserMicrosoftTokens(req.userId!);
      
      res.json({ message: "Microsoft account disconnected successfully" });
    } catch (error) {
      console.error("Microsoft disconnect error:", error);
      res.status(500).json({ message: "Failed to disconnect Microsoft account" });
    }
  });
}