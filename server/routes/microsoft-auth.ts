import type { Express } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { microsoftAuthService } from "../services/microsoft-auth";
import { requireOrganization } from "../middleware/organization";
import { requireAuth, requireRole } from "../middleware/auth";
import { resolveRedirectUri, isAllowedHost } from "../utils/redirect-uri";
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
  app.get("/auth/microsoft", async (req, res) => {
    try {
      const { org } = req.query;
      
      let organization;
      
      if (!org || typeof org !== 'string') {
        // Default to the default organization
        console.log("No organization parameter provided, using default organization");
        const defaultOrgSlug = 'default'; // Use the actual default slug
        organization = await storage.getOrganizationBySlug(defaultOrgSlug);
        
        if (!organization) {
          return res.status(400).json({ 
            message: "Organization parameter is required. Use ?org=default or your organization slug" 
          });
        }
      } else {
        // Handle legacy 'default-org' slug for backwards compatibility
        const orgSlug = org === 'default-org' ? 'default' : org;
        
        // Get organization by slug to validate it exists and get its ID
        organization = await storage.getOrganizationBySlug(orgSlug);
      }
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
      
      // Resolve redirect URI for current environment
      const redirectUri = resolveRedirectUri(req);
      
      // Optional: Validate host for security
      const host = req.get('X-Forwarded-Host') || req.get('host') || 'localhost:5000';
      if (!isAllowedHost(host)) {
        return res.status(400).json({ message: "Unauthorized host" });
      }
      
      // Generate random state for CSRF protection
      const state = randomBytes(32).toString('hex');
      req.session.microsoftAuthState = state;
      req.session.authOrgId = organization.id; // Store org ID for callback
      req.session.microsoftRedirectUri = redirectUri; // Store for callback validation
      
      // Save session before redirect to ensure state persistence
      req.session.save((err) => {
        if (err) {
          console.error('Failed to save session before redirect:', err);
          return res.status(500).json({ message: "Session error during authentication" });
        }
        
        microsoftAuthService.getAuthUrl(redirectUri, state)
          .then(authUrl => {
            console.log('Redirecting to Microsoft auth (URL masked for security)');
            res.redirect(authUrl);
          })
          .catch(error => {
            console.error("Microsoft auth URL generation error:", error);
            res.status(500).json({ message: "Failed to initiate Microsoft authentication" });
          });
      });
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
      
      // Get organization ID and redirect URI from session
      const orgId = req.session.authOrgId;
      const storedRedirectUri = req.session.microsoftRedirectUri;
      if (!orgId || !storedRedirectUri) {
        return res.status(400).json({ message: "Organization context or redirect URI lost" });
      }
      
      // Exchange authorization code for access token using stored redirect URI
      const tokenData = await microsoftAuthService.exchangeCodeForToken(code, storedRedirectUri);
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
        // Check if this is the Whirkplace master organization
        const isMasterOrg = orgId === '6c070124-fae2-472a-a826-cd460dd6f6ea';
        
        // Security: Only allow super admin creation for specific domains
        const userEmail = userProfile.mail || userProfile.userPrincipalName || "";
        // Only whirkplace.com domain gets automatic super admin
        const allowedSuperAdminDomains = ['whirkplace.com'];
        
        // Check if user is from whirkplace.com domain
        const isAllowedSuperAdmin = 
          allowedSuperAdminDomains.some(domain => userEmail.toLowerCase().endsWith(`@${domain}`));
        
        // Only grant super admin if in master org AND specifically allowed
        const shouldBeSuperAdmin = isMasterOrg && isAllowedSuperAdmin;
        
        // Create new user
        const newUser: InsertUser = {
          username: userProfile.userPrincipalName || userProfile.mail || userProfile.id,
          password: randomBytes(32).toString('hex'), // Random password since they use Microsoft auth
          name: userProfile.displayName || userProfile.userPrincipalName || "Unknown User",
          email: userEmail,
          organizationId: orgId, // Critical: Must include organization ID
          microsoftUserId: userProfile.id,
          authProvider: "microsoft",
          role: shouldBeSuperAdmin ? "admin" : "member", // Admin role only for verified users
          isSuperAdmin: shouldBeSuperAdmin // Super admin only for verified users
        };
        
        user = await storage.createUser(orgId, newUser);
        
        if (shouldBeSuperAdmin) {
          console.log(`🚀 Created super admin user in Whirkplace master organization: ${user.email}`);
        } else if (isMasterOrg) {
          console.log(`⚠️ Created regular user in master org (domain not in allowlist): ${user.email}`);
        }
      } else {
        // Update existing user with Microsoft details (account linking)
        const updateData: Partial<InsertUser> = {
          microsoftUserId: userProfile.id
        };
        
        // Smart authProvider handling: preserve existing provider or set Microsoft
        if (!user.authProvider || user.authProvider === 'local') {
          updateData.authProvider = 'microsoft';
        }
        // If user already has Slack auth, don't overwrite - they can use either method
        
        user = await storage.updateUser(orgId, user.id, updateData) || user;
      }
      
      // Get organization slug for proper session handling
      const organization = await storage.getOrganization(orgId);
      const orgSlug = organization?.slug || undefined;
      
      // CRITICAL FIX: Use setSessionUser from session middleware to properly set ALL required session data
      // This ensures userId, organizationId, and organizationSlug are all set correctly
      const { setSessionUser } = require('../middleware/session');
      
      try {
        // Use the centralized setSessionUser function which properly handles:
        // - Session regeneration (prevents session fixation)
        // - Setting userId, organizationId, and organizationSlug
        // - Saving the session
        await setSessionUser(req, user.id, orgId, orgSlug);
        
        console.log(`✅ Microsoft OAuth login successful for ${user.email}`);
        console.log(`✅ Session properly set with userId: ${user.id}, organizationId: ${orgId}, orgSlug: ${orgSlug}`);
        
        // Store Microsoft access token in session (for calendar/teams integration)
        req.session.microsoftAccessToken = tokenData.accessToken;
        
        // Clear temporary OAuth state
        req.session.microsoftAuthState = undefined;
        req.session.authOrgId = undefined;
        req.session.microsoftRedirectUri = undefined;
        
        // Save session with Microsoft token
        await new Promise<void>((resolve, reject) => {
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error('❌ Failed to save session with Microsoft token:', saveErr);
              reject(saveErr);
            } else {
              console.log('✅ Session saved with Microsoft access token');
              resolve();
            }
          });
        });
        
        // SECURITY: Session-based authentication only - no auth cookies
        // Removed dangerous auth_user_id cookies that allowed user impersonation
        
        // Redirect to dashboard
        const protocol = req.get('X-Forwarded-Proto') || req.protocol || 'http';
        const host = req.get('X-Forwarded-Host') || req.get('host') || 'localhost:5000';
        const baseUrl = `${protocol}://${host}`;
        const dashboardUrl = `${baseUrl}/#/dashboard?org=${organization?.slug}`;
        
        res.redirect(dashboardUrl);
      } catch (sessionError) {
        console.error('❌ Failed to set session for Microsoft OAuth:', sessionError);
        res.status(500).json({ message: "Authentication failed - session creation error" });
      }
    } catch (error) {
      console.error("Microsoft OAuth callback error:", error);
      res.status(500).json({ message: "Authentication failed" });
    }
  });

  // Get current Microsoft auth status
  app.get("/api/auth/microsoft/status", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const user = await storage.getUser(req.orgId, req.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check token from session since we store tokens in session only
      const connected = Boolean(req.session.microsoftAccessToken && user.microsoftUserId);
      
      res.json({
        connected,
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
      // Clear Microsoft tokens from session only (since we're not storing them in database)
      req.session.microsoftAccessToken = undefined;
      
      res.json({ message: "Microsoft account disconnected successfully" });
    } catch (error) {
      console.error("Microsoft disconnect error:", error);
      res.status(500).json({ message: "Failed to disconnect Microsoft account" });
    }
  });
}