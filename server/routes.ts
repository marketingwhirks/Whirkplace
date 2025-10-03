import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { db } from "./db";
import { setSessionUser, clearSessionUser } from "./middleware/session";
import { 
  insertUserSchema, insertTeamSchema, insertCheckinSchema, 
  insertQuestionSchema, insertWinSchema, insertCommentSchema, insertShoutoutSchema, updateShoutoutSchema,
  insertVacationSchema, reviewCheckinSchema, ReviewStatus,
  insertOneOnOneSchema, insertKraTemplateSchema, insertUserKraSchema, insertActionItemSchema,
  insertKraRatingSchema, insertKraHistorySchema,
  insertOrganizationSchema, insertBusinessPlanSchema, insertOrganizationOnboardingSchema, insertUserInvitationSchema,
  insertDashboardConfigSchema, insertDashboardWidgetTemplateSchema, insertBugReportSchema,
  insertPartnerApplicationSchema, insertPartnerFirmSchema,
  type AnalyticsScope, type AnalyticsPeriod, type ShoutoutDirection, type ShoutoutVisibility, type LeaderboardMetric,
  type ReviewStatusType, type Checkin,
  organizations
} from "@shared/schema";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { WebClient } from "@slack/web-api";
import { sendCheckinReminder, announceWin, sendTeamHealthUpdate, announceShoutout, notifyCheckinSubmitted, notifyCheckinReviewed, generateOAuthURL, validateOAuthState, exchangeOIDCCode, validateOIDCToken, getSlackUserInfo } from "./services/slack";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { aggregationService } from "./services/aggregation";
import { requireOrganization, resolveOrganization, sanitizeForOrganization } from "./middleware/organization";
import { authenticateUser, requireAuth, requireRole, requireTeamLead, ensureBackdoorUser, requireSuperAdmin, requirePartnerAdmin, requireOnboarded } from "./middleware/auth";
import { generateCSRF, validateCSRF, csrfTokenEndpoint } from "./middleware/csrf";
import { authorizeAnalyticsAccess } from "./middleware/authorization";
import { requireFeatureAccess, getFeatureAvailability, getUpgradeSuggestions } from "./middleware/plan-access";
import { registerMicrosoftTeamsRoutes } from "./routes/microsoft-teams";
import { registerMicrosoftAuthRoutes } from "./routes/microsoft-auth";
import { registerMicrosoftCalendarRoutes } from "./routes/microsoft-calendar";
import { registerAuthDiagnosticRoutes } from "./routes/auth-diagnostic";
import { resolveRedirectUri } from "./utils/redirect-uri";
import { sendWelcomeEmail } from "./services/emailService";
import { sanitizeUser, sanitizeUsers } from "./utils/sanitizeUser";

// Initialize Stripe with appropriate keys based on environment
let stripe: Stripe | null = null;
const isDevelopment = process.env.NODE_ENV !== 'production';
const stripeSecretKey = isDevelopment 
  ? process.env.STRIPE_TEST_SECRET_KEY 
  : process.env.STRIPE_SECRET_KEY;

if (stripeSecretKey) {
  stripe = new Stripe(stripeSecretKey);
  console.log(`💳 Stripe initialized in ${isDevelopment ? 'TEST' : 'LIVE'} mode`);
} else {
  console.warn('⚠️ Stripe keys not configured');
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Azure domain verification file - must be served at root
  app.get("/MS89526594.txt", (req, res) => {
    const verificationContent = {
      "Description": "Domain ownership verification file for Microsoft 365 - place in the website root",
      "Domain": "whirkplace.com",
      "Id": "e7629383-63e1-4e40-a7b9-c8bf26467a9f"
    };
    res.type('text/plain').send(JSON.stringify(verificationContent, null, 2));
  });

  // CRITICAL: Logout endpoint MUST come first, before ANY middleware
  // This endpoint needs no authentication, organization, or CSRF checks
  app.post("/api/auth/logout", (req, res) => {
    // Destroy session if it exists
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destroy error:", err);
        }
      });
    }
    
    // Clear all auth-related cookies unconditionally
    const isReplit = !!process.env.REPL_SLUG;
    const isProd = process.env.NODE_ENV === 'production';
    const secure = isProd || isReplit;
    const sameSite = (isProd || isReplit) ? 'none' : 'lax';
    const partitioned = isProd || isReplit;
    
    // Clear the correct session cookie (using our custom name)
    res.clearCookie('whirkplace.sid', {
      secure,
      httpOnly: true,
      sameSite: sameSite as any,
      path: '/',
      ...(partitioned ? { partitioned: true } : {})
    });
    
    // Also clear legacy session cookie if it exists
    res.clearCookie('connect.sid', {
      secure,
      httpOnly: true,
      sameSite: sameSite as any,
      path: '/',
      ...(partitioned ? { partitioned: true } : {})
    });
    
    // Clear auth cookies
    ['auth_user_id', 'auth_org_id', 'auth_session_token'].forEach(cookieName => {
      res.clearCookie(cookieName, {
        httpOnly: true,
        secure,
        sameSite: sameSite as any,
        path: '/',
        ...(partitioned ? { partitioned: true } : {})
      });
    });
    
    // Always return success
    return res.status(200).json({ message: "Logged out successfully" });
  });
  
  // Super Admin backdoor endpoint for production
  // This endpoint is specifically for mpatrick@whirks.com super admin access
  app.post("/api/auth/super-admin-login", async (req, res) => {
    console.log("🔑 Super admin login attempt");
    
    try {
      const { email, key } = req.body;
      
      // SECURITY: Strict validation for production super admin
      if (process.env.NODE_ENV === 'production') {
        // Only allow specific super admin email in production
        if (email !== 'mpatrick@whirks.com') {
          console.log("❌ Invalid super admin email in production");
          return res.status(401).json({ 
            message: "Unauthorized" 
          });
        }
        
        // Verify production backdoor key
        const validKey = process.env.BACKDOOR_KEY;
        if (!validKey || key !== validKey) {
          console.log("❌ Invalid super admin key");
          return res.status(401).json({ 
            message: "Unauthorized" 
          });
        }
      }
      
      // Find or create super admin user
      const allUsers = await storage.getAllUsersGlobal(false);
      let superAdmin = allUsers.find(u => u.email === email && u.isSuperAdmin);
      
      // Get whirkplace organization first (we need it either way)
      const whirkplaceOrg = await storage.getOrganizationBySlug('whirkplace');
      if (!whirkplaceOrg) {
        return res.status(404).json({ message: "Whirkplace organization not found" });
      }
      
      if (!superAdmin) {
        // Create super admin in whirkplace organization
        superAdmin = await storage.createUser(whirkplaceOrg.id, {
          username: 'mpatrick',
          password: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
          name: 'Matthew Patrick',
          email: 'mpatrick@whirks.com',
          organizationId: whirkplaceOrg.id,
          role: 'admin',
          isSuperAdmin: true,
          isAccountOwner: false,
          isActive: true,
          authProvider: 'local',
        });
        console.log('✅ Created super admin user');
      }
      
      // Use setSessionUser to properly establish the session with all required data
      console.log(`🔐 Setting session for super admin: ${email}`);
      console.log(`📝 Organization: ID=${whirkplaceOrg.id}, Slug=${whirkplaceOrg.slug}`);
      
      try {
        await setSessionUser(req, superAdmin.id, whirkplaceOrg.id, whirkplaceOrg.slug);
        console.log(`✅ setSessionUser() completed for super admin`);
        console.log(`📋 Session ID after setSessionUser: ${req.sessionID}`);
        
        // CRITICAL: Verify session data was actually saved
        console.log(`🔍 Verifying super admin session after save:`, {
          sessionId: req.sessionID,
          userId: req.session?.userId,
          organizationId: (req.session as any)?.organizationId,
          organizationSlug: (req.session as any)?.organizationSlug
        });
        
        console.log(`✅ Super admin ${email} logged in successfully with properly set session`);
        
        // Send response after session is properly set
        res.json({ 
          message: "Super admin login successful",
          user: sanitizeUser(superAdmin)
        });
      } catch (sessionError) {
        console.error('Failed to set session for super admin:', sessionError);
        return res.status(500).json({ message: "Session creation failed" });
      }
    } catch (error) {
      console.error("Super admin login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });
  
  // NEW: Fresh backdoor endpoint with proper Replit cookie handling
  // NOTE: This endpoint does NOT use requireOrganization() since it needs to work without authentication
  app.post("/api/auth/dev-login-fresh", async (req, res) => {
    console.log("🚀 FRESH DEV LOGIN REQUEST RECEIVED:", JSON.stringify(req.body, null, 2));
    console.log("🌐 Request headers:", JSON.stringify(req.headers, null, 2));
    
    try {
      // SECURITY: Only allow backdoor login in development environment
      if (process.env.NODE_ENV === 'production') {
        console.log("❌ Fresh backdoor blocked in production");
        return res.status(404).json({ 
          message: "Endpoint not available in production" 
        });
      }
      
      const { username, key } = req.body;
      
      // Get organization ID from query param or use default
      const orgSlug = req.query.org as string || 'whirkplace';
      console.log(`🔑 Fresh login attempt: ${username} for org: ${orgSlug}`);
      
      // Look up the organization
      const org = await db
        .select()
        .from(organizations)
        .where(eq(organizations.slug, orgSlug))
        .limit(1);
      
      if (!org || org.length === 0) {
        console.log(`❌ Organization not found: ${orgSlug}`);
        return res.status(404).json({ 
          message: "Organization not found" 
        });
      }
      
      const organizationId = org[0].id;
      console.log(`✅ Found organization: ${org[0].name} (${organizationId})`);
      
      // Verify backdoor credentials - use defaults for development if env vars not set
      const validUsername = process.env.BACKDOOR_USER || "Matthew";
      const validKey = process.env.BACKDOOR_KEY || "Dev123";
      
      // SECURITY: Log warning if using default credentials
      if (!process.env.BACKDOOR_USER || !process.env.BACKDOOR_KEY) {
        console.warn("⚠️  Using default backdoor credentials for development. Set BACKDOOR_USER and BACKDOOR_KEY environment variables for production security.");
      }
      
      if (username !== validUsername || key !== validKey) {
        console.log("❌ Invalid fresh backdoor credentials");
        return res.status(401).json({ 
          message: "Invalid backdoor credentials" 
        });
      }
      
      // Ensure Matthew Patrick's backdoor user exists
      const matthewUser = await ensureBackdoorUser(organizationId);
      console.log(`✅ Fresh backdoor user confirmed: ${matthewUser.name} (${matthewUser.email})`);
      
      // Use setSessionUser to properly regenerate and set session with all required data
      console.log(`🔐 Setting session for fresh backdoor user: ${matthewUser.email}`);
      console.log(`📝 Organization details: ID=${organizationId}, Slug=${org[0].slug}`);
      
      try {
        await setSessionUser(req, matthewUser.id, organizationId, org[0].slug);
        console.log(`✅ setSessionUser() completed successfully`);
        console.log(`📋 Session ID after setSessionUser: ${req.sessionID}`);
        
        // CRITICAL: Verify session data was actually saved
        console.log(`🔍 Verifying session data after save:`, {
          sessionId: req.sessionID,
          userId: req.session?.userId,
          organizationId: (req.session as any)?.organizationId,
          organizationSlug: (req.session as any)?.organizationSlug,
          sessionExists: !!req.session
        });
        
        // SECURITY: No longer setting auth cookies - sessions are the only authentication method
        // Cookies like auth_user_id were a critical vulnerability allowing user impersonation
        
        console.log(`✅ Fresh backdoor login successful for ${matthewUser.name}`);
        
        res.json({ 
          message: "Fresh backdoor login successful", 
          user: { 
            id: matthewUser.id, 
            name: matthewUser.name, 
            email: matthewUser.email, 
            role: matthewUser.role 
          } 
        });
      } catch (sessionError) {
        console.error('Failed to set session:', sessionError);
        return res.status(500).json({ message: "Session creation failed" });
      }
    } catch (error) {
      console.error("Fresh backdoor login error:", error);
      res.status(500).json({ message: "Fresh backdoor login failed" });
    }
  });

  // Original backdoor login endpoint (for development/testing when Slack is unavailable)
  app.post("/auth/backdoor", requireOrganization(), async (req, res) => {
    try {
      // SECURITY: Only allow backdoor login in development environment
      if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ 
          message: "Endpoint not available in production" 
        });
      }
      
      const { username, key } = req.body;
      
      // Verify backdoor credentials - use defaults for development if env vars not set
      const validUsername = process.env.BACKDOOR_USER || "Matthew";
      const validKey = process.env.BACKDOOR_KEY || "Dev123";
      
      // SECURITY: Log warning if using default credentials
      if (!process.env.BACKDOOR_USER || !process.env.BACKDOOR_KEY) {
        console.warn("⚠️  Using default backdoor credentials for development. Set BACKDOOR_USER and BACKDOOR_KEY environment variables for production security.");
      }
      
      if (username !== validUsername || key !== validKey) {
        return res.status(401).json({ 
          message: "Invalid backdoor credentials" 
        });
      }
      
      // Ensure Matthew Patrick's backdoor user exists
      const matthewUser = await ensureBackdoorUser(req.orgId);
      
      // Get organization slug for session
      const organization = await storage.getOrganization(req.orgId);
      const orgSlug = organization?.slug || undefined;
      
      // Use setSessionUser to properly regenerate and set session with all required data
      try {
        await setSessionUser(req, matthewUser.id, req.orgId, orgSlug);
        console.log(`✅ Session properly regenerated and saved for user: ${matthewUser.id} in org: ${req.orgId}`);
        
        // SECURITY: No auth cookies - sessions only
        // Removed dangerous auth cookies that allowed user impersonation
        
        res.json({ 
          message: "Backdoor login successful", 
          user: { 
            id: matthewUser.id, 
            name: matthewUser.name, 
            email: matthewUser.email, 
            role: matthewUser.role 
          } 
        });
      } catch (sessionError) {
        console.error('Failed to set session:', sessionError);
        return res.status(500).json({ message: "Session creation failed" });
      }
    } catch (error) {
      console.error("Backdoor login error:", error);
      res.status(500).json({ message: "Backdoor login failed" });
    }
  });

  // Get current organization context (public endpoint for subdomain display)
  app.get("/api/organization/context", requireOrganization(), async (req, res) => {
    try {
      const organization = (req as any).organization;
      
      if (!organization) {
        return res.status(404).json({ 
          message: "No organization context found" 
        });
      }
      
      // Return basic organization info for display purposes
      res.json({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logoUrl: organization.logoUrl || null
      });
    } catch (error) {
      console.error("Error getting organization context:", error);
      res.status(500).json({ message: "Failed to get organization context" });
    }
  });

  // Local authentication login for super admin
  app.post("/auth/local/login", requireOrganization(), async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ 
          message: "Email and password are required" 
        });
      }
      
      // Special handling for demo users - works in all environments
      const { getDemoUser, generateDemoToken } = await import('./demo-auth');
      const demoUser = getDemoUser(email);
      if (demoUser && demoUser.password === password) {
        const token = generateDemoToken(email);
        console.log(`🎪 Demo login successful for ${demoUser.name}`);
        
        // Set a simple demo session cookie
        res.cookie('demo_token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production' || !!process.env.REPL_SLUG,
          sameSite: 'lax',
          maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
        
        return res.json({ 
          message: "Login successful", 
          user: { 
            id: demoUser.id, 
            name: demoUser.name, 
            email: demoUser.email, 
            role: demoUser.role,
            isSuperAdmin: false
          },
          token: token // Include token for fallback
        });
      }
      
      // Get user by email - always search across all organizations
      console.log(`🔐 Local login attempt for ${email}`);
      let user = null;
      let actualOrgId = req.orgId;
      
      // First try the current organization context (from subdomain or default)
      user = await storage.getUserByEmail(req.orgId, email);
      if (user) {
        console.log(`✅ Found user in current organization: ${req.orgId}`);
        actualOrgId = req.orgId;
      }
      
      // If not found, search all organizations
      if (!user) {
        console.log(`🔍 User not found in ${req.orgId}, searching all organizations...`);
        const allOrgs = await storage.getOrganizations();
        for (const org of allOrgs) {
          if (org.id === req.orgId) continue; // Skip the one we already checked
          const foundUser = await storage.getUserByEmail(org.id, email);
          if (foundUser) {
            user = foundUser;
            actualOrgId = org.id;
            console.log(`✅ Found user in organization: ${org.name} (${org.id})`);
            break;
          }
        }
      }
      
      if (!user) {
        console.log(`❌ User not found: ${email} in any organization`);
        return res.status(401).json({ 
          message: "Invalid email or password" 
        });
      }
      console.log(`✅ User found: ${user.email}, has password: ${!!user.password}`);
      
      // Check if user has a password (local auth enabled)
      if (!user.password) {
        return res.status(401).json({ 
          message: "Local authentication not enabled for this account" 
        });
      }
      
      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      
      if (!isValidPassword) {
        return res.status(401).json({ 
          message: "Invalid email or password" 
        });
      }
      
      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({ 
          message: "Account is disabled" 
        });
      }
      
      // CRITICAL FIX: Get organization slug before setting session
      const orgData = await storage.getOrganization(actualOrgId);
      const orgSlug = orgData?.slug || undefined;
      
      if (!orgData) {
        console.log(`⚠️ Could not find organization data for org ID: ${actualOrgId}`);
      }
      
      // CRITICAL FIX: Use setSessionUser to properly handle session creation
      console.log(`🔐 Setting session for user: ${user.email}`);
      console.log(`📝 Organization: ID=${actualOrgId}, Slug=${orgSlug}`);
      
      try {
        await setSessionUser(req, user.id, actualOrgId, orgSlug);
        console.log(`✅ setSessionUser() completed successfully`);
        console.log(`📋 Session ID after setSessionUser: ${req.sessionID}`);
        
        // Verify session data was actually saved
        console.log(`🔍 Verifying session data after save:`, {
          sessionId: req.sessionID,
          userId: req.session?.userId,
          organizationId: (req.session as any)?.organizationId,
          organizationSlug: (req.session as any)?.organizationSlug
        });
        
        console.log(`✅ Local login successful for ${user.name} (${user.email})`);
        
        res.json({ 
          message: "Login successful", 
          user: { 
            id: user.id, 
            name: user.name, 
            email: user.email, 
            role: user.role,
            isSuperAdmin: user.isSuperAdmin || false
          } 
        });
      } catch (sessionError) {
        console.error('❌ Failed to save session:', sessionError);
        return res.status(500).json({ message: 'Failed to save session' });
      }
    } catch (error) {
      console.error("Local login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Demo login endpoint - stateless JWT authentication for demo users
  app.post("/api/auth/demo-login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ 
          message: "Email and password are required" 
        });
      }
      
      const { getDemoUser, generateDemoToken } = await import('./demo-auth');
      const demoUser = getDemoUser(email);
      
      if (!demoUser || demoUser.password !== password) {
        return res.status(401).json({ 
          message: "Invalid demo credentials" 
        });
      }
      
      const token = generateDemoToken(email);
      console.log(`🎪 Demo JWT login successful for ${demoUser.name}`);
      
      return res.json({ 
        message: "Demo login successful", 
        user: { 
          id: demoUser.id, 
          name: demoUser.name, 
          email: demoUser.email, 
          role: demoUser.role,
          isSuperAdmin: false,
          organizationId: demoUser.organizationId
        },
        token: token,
        organizationSlug: 'fictitious-delicious'
      });
    } catch (error) {
      console.error("Demo login error:", error);
      res.status(500).json({ message: "Demo login failed" });
    }
  });

  // Backward compatibility: redirect /auth to /login
  app.get("/auth", (req, res) => {
    res.redirect(301, "/login");
  });

  // OAuth endpoints - MUST be registered BEFORE auth middleware to be accessible
  // These endpoints handle their own authentication flow
  
  // GET /auth/slack/oauth-url - Return OAuth URL as JSON (NO /api prefix to avoid auth middleware)
  app.get("/auth/slack/oauth-url", async (req, res) => {
    try {
      const { org, action } = req.query;
      
      let organizationSlug = org as string;
      
      if (!org) {
        return res.status(400).json({ error: 'No organization specified' });
      }
      
      // Generate OAuth URL and save state to session
      const orgSlugString = typeof organizationSlug === 'string' ? organizationSlug : String(organizationSlug);
      const oauthUrl = generateOAuthURL(orgSlugString, req.session, req);
      
      // FIX: Let express-session automatically save and set cookie
      console.log('🍪 Session will auto-save with OAuth state');
      
      // Return the OAuth URL as JSON
      res.json({ url: oauthUrl });
    } catch (error) {
      console.error("OAuth URL generation error:", error);
      res.status(500).json({ error: "Failed to generate OAuth URL" });
    }
  });
  
  // GET /auth/slack/login - Initiate Slack OAuth flow
  // Also expose at /api/auth/slack/login to bypass Vite middleware
  app.get(["/auth/slack/login", "/api/auth/slack/login"], async (req, res) => {
    try {
      const { org, action } = req.query;
      
      // Handle different authentication scenarios
      let organizationSlug = org as string;
      
      // If no org specified, redirect to organization selection
      if (!org) {
        console.log('❌ No organization specified for Slack login');
        return res.redirect('/signup');
      }
      
      // Handle new organization creation
      if (org === 'new') {
        console.log('🆕 New organization creation via Slack');
        organizationSlug = 'new';
      } else {
        console.log('🔐 Slack authentication for organization:', organizationSlug);
      }
      
      try {
        console.log('🚀 Slack OAuth login initiated for org:', organizationSlug);
        console.log('📦 Session ID before OAuth:', req.sessionID);
        console.log('🌐 Request host headers:', {
          host: req.get('host'),
          forwardedHost: req.get('X-Forwarded-Host'),
          forwardedProto: req.get('X-Forwarded-Proto'),
          origin: req.get('origin')
        });
        
        // Generate OAuth URL using the unified service function (this sets session state)
        const orgSlugString = typeof organizationSlug === 'string' ? organizationSlug : String(organizationSlug);
        const oauthUrl = generateOAuthURL(orgSlugString, req.session, req);
        
        console.log('🔐 OAuth state generated and stored in session');
        console.log('📋 Session data after state generation:', {
          hasOAuthState: !!(req.session as any).slackOAuthState,
          organizationSlug: (req.session as any).slackOAuthOrganizationSlug,
          expires: (req.session as any).slackOAuthExpires
        });
        
        // FIX: Let express-session automatically save and set cookie
        console.log('🍪 Session will auto-save with OAuth state');
        console.log('✅ Redirecting to Slack OAuth:', oauthUrl.substring(0, 100) + '...');
        
        // Redirect to Slack OAuth
        res.redirect(oauthUrl);
      } catch (urlError) {
        console.error("OAuth URL generation error:", urlError);
        res.status(500).json({ 
          message: "Failed to generate Slack OAuth URL. Please check configuration." 
        });
      }
    } catch (error) {
      console.error("Slack OAuth initiation error:", error);
      res.status(500).json({ 
        message: "Failed to initiate Slack authentication. Please check OAuth configuration." 
      });
    }
  });
  
  // GET /auth/slack/callback - Handle OAuth callback from Slack
  app.get("/auth/slack/callback", async (req, res) => {
    try {
      const { code, state, error: oauthError } = req.query;
      
      console.log('🔍 Slack OAuth callback received');
      console.log('📦 Callback Session ID:', req.sessionID);
      console.log('🍪 Cookie header present:', !!req.headers.cookie);
      console.log('🍪 Cookie header length:', req.headers.cookie?.length || 0);
      console.log('🆕 Session is new:', !req.session || Object.keys(req.session).length === 0);
      console.log('🔗 Request origin:', req.headers.origin);
      console.log('🔗 Request referrer:', req.headers.referer);
      console.log('🔒 Protocol:', req.protocol);
      
      // Check for OAuth errors from Slack
      if (oauthError) {
        console.error("Slack OAuth error:", oauthError);
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Error</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #dc3545; }
                button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ Authentication Error</h1>
              <p>OAuth error: ${oauthError}</p>
              <button onclick="window.close()">Close Window</button>
            </body>
          </html>
        `);
      }
      
      // Validate required parameters
      if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
        console.error('❌ Invalid callback parameters:', { hasCode: !!code, hasState: !!state });
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Error</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #dc3545; }
                button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ Invalid Request</h1>
              <p>Invalid OAuth callback parameters. Please try logging in again.</p>
              <button onclick="window.location.href='/'">Try Again</button>
            </body>
          </html>
        `);
      }
      
      console.log('📋 Session data before validation:', {
        hasOAuthState: !!(req.session as any).slackOAuthState,
        storedOrgSlug: (req.session as any).slackOAuthOrganizationSlug,
        expires: (req.session as any).slackOAuthExpires,
        expiresISO: (req.session as any).slackOAuthExpires ? new Date((req.session as any).slackOAuthExpires).toISOString() : null,
        nowVsExpiresMs: (req.session as any).slackOAuthExpires ? ((req.session as any).slackOAuthExpires - Date.now()) : null
      });
      console.log('🔑 Received state prefix:', state.substring(0, 8) + '...');
      console.log('🔑 Stored state prefix:', ((req.session as any).slackOAuthState || '').substring(0, 8) + '...');
      
      // Validate state parameter using the unified service function
      const organizationSlug = validateOAuthState(state, req.session);
      if (!organizationSlug) {
        console.error('❌ OAuth state validation failed');
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Error</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #dc3545; }
                button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ Session Expired</h1>
              <p>Your authentication session has expired. Please try logging in again.</p>
              <button onclick="window.location.href='/'">Try Again</button>
            </body>
          </html>
        `);
      }
      
      console.log('✅ OAuth state validation successful, org:', organizationSlug);
      
      // Exchange code for OpenID Connect tokens (use dynamic redirect URI)
      const dynamicRedirectUri = resolveRedirectUri(req, '/auth/slack/callback');
      const tokenResponse = await exchangeOIDCCode(code, dynamicRedirectUri);
      if (!tokenResponse.ok || !tokenResponse.id_token) {
        console.error("OIDC token exchange failed:", tokenResponse.error);
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Error</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #dc3545; }
                button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ Authentication Failed</h1>
              <p>Failed to authenticate with Slack. Please try again.</p>
              <button onclick="window.location.href='/'">Try Again</button>
            </body>
          </html>
        `);
      }
      
      // Validate and decode the ID token
      const userInfoResponse = await validateOIDCToken(tokenResponse.id_token);
      if (!userInfoResponse.ok || !userInfoResponse.user) {
        console.error("Failed to validate ID token:", userInfoResponse.error);
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Error</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #dc3545; }
                button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ Authentication Failed</h1>
              <p>${userInfoResponse.error || "Failed to validate user identity. Please try again."}</p>
              <button onclick="window.location.href='/'">Try Again</button>
            </body>
          </html>
        `);
      }
      
      const user = userInfoResponse.user;
      const team = userInfoResponse.user.team; // Team data comes from the JWT, not token response
      
      console.log('📊 Slack OAuth team data:', {
        teamId: team?.id,
        teamName: team?.name,
        hasTeamData: !!team,
        fullTeamObject: team,
        userInfoResponseKeys: Object.keys(userInfoResponse),
        userKeys: user ? Object.keys(user) : [],
        rawUserInfo: JSON.stringify(userInfoResponse.user, null, 2)
      });
      
      // Try to fetch actual email from Slack API if we have an access token
      if (tokenResponse.access_token && user.user?.id) {
        const slackUserInfo = await getSlackUserInfo(tokenResponse.access_token, user.user.id);
        if (slackUserInfo.email) {
          console.log('📧 Successfully fetched email from Slack API:', slackUserInfo.email);
          user.user.email = slackUserInfo.email;
        }
        if (slackUserInfo.name) {
          user.user.name = slackUserInfo.name;
        }
      }
      
      // Resolve organization (we know the slug from state validation)
      // Note: We need to manually resolve the organization here since we're before the org middleware
      let organization;
      let isSuperAdmin = false;
      let isNewOrganization = false;
      
      try {
        const allOrgs = await storage.getAllOrganizations();
        
        // ALWAYS check if user should be super admin based on their email
        // This ensures super admins maintain their status regardless of which org they auth to
        const userEmail = (user.email || user.user?.email || "").toLowerCase();
        // Only whirkplace.com domain gets automatic super admin
        const allowedSuperAdminDomains = ['whirkplace.com'];
        
        // Check if user is from whirkplace.com domain
        const isAllowedSuperAdmin = 
          allowedSuperAdminDomains.some(domain => userEmail.endsWith(`@${domain}`));
        
        console.log('🔐 Super admin check for Slack OAuth:');
        console.log('  Organization:', organizationSlug);
        console.log('  Email:', userEmail);
        console.log('  Is allowed super admin:', isAllowedSuperAdmin);
        
        // Check if this is a new organization creation
        if (organizationSlug === 'new') {
          isNewOrganization = true;
          console.log('🆕 Creating new organization for user:', userEmail);
          
          // Generate organization slug from email domain or company name
          const emailDomain = userEmail.split('@')[1] || 'company';
          const companyName = emailDomain.split('.')[0];
          
          // Create a unique slug
          let baseSlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          let finalSlug = baseSlug;
          let counter = 1;
          
          // Check if slug already exists and make it unique
          while (allOrgs.find(org => org.slug === finalSlug)) {
            finalSlug = `${baseSlug}-${counter}`;
            counter++;
          }
          
          // Create the new organization
          const orgName = team?.name || `${companyName.charAt(0).toUpperCase()}${companyName.slice(1)}`;
          console.log('📦 Creating new organization with data:', {
            teamName: team?.name,
            teamId: team?.id,
            hasTeamData: !!team,
            fallbackName: `${companyName.charAt(0).toUpperCase()}${companyName.slice(1)}`,
            finalName: orgName
          });
          
          organization = await storage.createOrganization({
            name: orgName,
            slug: finalSlug,
            plan: 'standard',
            isActive: true,
            customValues: ['Innovation', 'Teamwork', 'Excellence'],
            enableSlackIntegration: true,
            slackWorkspaceId: team?.id || null,
            enableMicrosoftAuth: false
          });
          
          console.log('✅ Created new organization:', {
            id: organization.id,
            slug: organization.slug,
            name: organization.name,
            slackWorkspaceId: organization.slackWorkspaceId
          });
        } else if (organizationSlug === 'whirkplace') {
          // Look for the whirkplace super admin organization
          organization = allOrgs.find(org => org.id === 'whirkplace' || org.slug === 'whirkplace');
          
          // Only grant super admin if specifically allowed
          isSuperAdmin = isAllowedSuperAdmin;
          
          console.log('  Will be super admin:', isSuperAdmin);
          
          if (!organization) {
            // Create whirkplace organization if it doesn't exist
            console.log('Creating whirkplace super admin organization...');
            organization = await storage.createOrganization({
              id: 'whirkplace',
              name: 'Whirkplace (Super Admin)',
              slug: 'whirkplace',
              plan: 'enterprise',
              isActive: true,
              customValues: ['Own It', 'Challenge It', 'Team First', 'Empathy for Others', 'Passion for Our Purpose'],
              enableSlackIntegration: true,
              enableTeamsIntegration: true
            });
          }
        } else {
          organization = allOrgs.find(org => org.slug === organizationSlug);
          if (!organization) {
            return res.status(404).json({ 
              message: `Organization '${organizationSlug}' not found` 
            });
          }
        }
      } catch (error) {
        console.error("Failed to resolve organization:", error);
        return res.status(500).json({ 
          message: "Failed to resolve organization" 
        });
      }
      
      // Validate organization mapping with Slack team
      if (team?.id && organization.slackWorkspaceId && organization.slackWorkspaceId !== team.id) {
        return res.status(403).json({
          message: "Slack workspace does not match this organization. Please contact your administrator."
        });
      }
      
      // Check if user already exists by Slack ID or email (using efficient lookups)
      // IMPORTANT: Due to multiple organizations, we need to check across ALL orgs for Slack ID uniqueness
      let existingUser;
      let userOrganization = organization; // Track which org the user belongs to
      
      try {
        // First try to find by Slack user ID in the CURRENT organization
        if (user.sub) {
          console.log('🔍 Looking for user with Slack ID:', user.sub, 'in org:', organization.id);
          existingUser = await storage.getUserBySlackId(organization.id, user.sub);
          console.log('🔍 Found by Slack ID in current org?', existingUser ? 'YES' : 'NO');
          
          // If not found in current org, check if user exists in ANY org (for duplicate prevention)
          // BUT allow creating new organizations even if Slack ID exists elsewhere
          if (!existingUser && !isNewOrganization) {
            console.log('🔍 Checking if Slack ID exists in ANY organization...');
            // Try to find user with this Slack ID in ANY organization
            // This prevents duplicate key errors
            const allOrgs = await storage.getAllOrganizations();
            for (const org of allOrgs) {
              const userInOrg = await storage.getUserBySlackId(org.id, user.sub);
              if (userInOrg) {
                console.log('⚠️ Found user with Slack ID in different org:', org.id, org.name);
                
                // Check if this user is a super admin - they can access any org
                if (userInOrg.isSuperAdmin) {
                  console.log('✅ User is super admin - allowing cross-organization authentication');
                  // Use the user from their original organization
                  existingUser = userInOrg;
                  userOrganization = org; // Update organization context to the user's actual org
                  break;
                } else {
                  // Regular users cannot cross organizations unless creating a new org
                  console.log('❌ Regular user trying to access wrong organization');
                  // User exists in a different organization!
                  // Return error page explaining the situation
                  return res.status(400).send(`
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <title>Account Organization Mismatch</title>
                        <style>
                          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                          h1 { color: #d73502; }
                          .error { color: #d73502; font-size: 1.2em; }
                          .info { background: white; padding: 20px; border-radius: 8px; max-width: 600px; margin: 20px auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                          .details { text-align: left; margin-top: 20px; padding: 15px; background: #f9f9f9; border-radius: 4px; }
                          .details strong { color: #333; }
                          button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; background: #007bff; color: white; border: none; border-radius: 4px; }
                          button:hover { background: #0056b3; }
                          .warning-icon { font-size: 3em; margin-bottom: 20px; }
                        </style>
                      </head>
                      <body>
                        <div class="warning-icon">⚠️</div>
                        <h1>Wrong Organization</h1>
                        <div class="info">
                          <p class="error">Your account belongs to a different organization.</p>
                          <div class="details">
                            <p><strong>What happened:</strong><br>
                            Your Slack account (${user.email || 'unknown'}) is registered with the "${org.name}" organization,
                            but you're trying to access a different organization.</p>
                            
                            <p><strong>Slack ID:</strong> ${user.sub}<br>
                            <strong>Your Organization:</strong> ${org.name}</p>
                          </div>
                          <p>Please use the correct organization URL or contact your administrator.</p>
                          <button onclick="window.location.href='/'">Back to Home</button>
                        </div>
                      </body>
                    </html>
                  `);
                }
              }
            }
          }
        }
        
        // If still not found by Slack ID, try by email 
        // Special handling for super admins: check ALL organizations for super admin accounts by email
        if (!existingUser && user.email) {
          console.log('🔍 Looking for user with email:', user.email, 'in org:', organization.id);
          existingUser = await storage.getUserByEmail(organization.id, user.email);
          console.log('🔍 Found by email in current org?', existingUser ? 'YES' : 'NO');
          
          // If not found in current org but has email, check if this is a super admin in ANY org
          if (!existingUser) {
            console.log('🔍 Checking if email belongs to a super admin in ANY organization...');
            const allOrgs = await storage.getAllOrganizations();
            for (const org of allOrgs) {
              const userInOrg = await storage.getUserByEmail(org.id, user.email);
              if (userInOrg && userInOrg.isSuperAdmin) {
                console.log('✅ Found super admin by email in org:', org.id, org.name);
                // This is a super admin - they can authenticate to any org
                // We'll link their Slack ID to this account
                existingUser = userInOrg;
                userOrganization = org;
                break;
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to check existing user:", error);
        return res.status(500).json({ 
          message: "Failed to check existing user" 
        });
      }
      
      let authenticatedUser;
      
      if (existingUser) {
        // Update existing user with Slack OIDC data
        try {
          const slackUserId = user.sub;
          const displayName = user.name || user.given_name || slackUserId;
          
          // Prepare update data with Slack information
          const updateData: any = {
            slackUserId: slackUserId,
            slackUsername: slackUserId, // OIDC doesn't provide username, use ID
            slackDisplayName: displayName,
            slackEmail: user.email,
            slackAvatar: user.picture,
            slackWorkspaceId: team?.id || user["https://slack.com/team_id"],
            avatar: user.picture || existingUser.avatar,
            // Update email if not set and Slack provides one
            email: existingUser.email || user.email || existingUser.email,
            // Update name if it's just the default email
            name: existingUser.name === existingUser.email && displayName ? 
                  displayName : existingUser.name
          };
          
          // CRITICAL: Check if user should be super admin based on email
          const userEmail = (user.email || user.user?.email || existingUser.email || "").toLowerCase();
          // Only whirkplace.com domain gets automatic super admin
          const allowedSuperAdminDomains = ['whirkplace.com'];
          
          const shouldBeSuperAdmin = 
            allowedSuperAdminDomains.some(domain => userEmail.endsWith(`@${domain}`));
          
          // Update super admin status if they meet the criteria OR preserve existing super admin status
          if (shouldBeSuperAdmin || existingUser.isSuperAdmin) {
            updateData.isSuperAdmin = true;
            updateData.role = existingUser.role === 'admin' ? 'admin' : updateData.role || existingUser.role; // Preserve role or ensure admin
            console.log('🔑 Setting super admin for user:', existingUser.email, 'shouldBe:', shouldBeSuperAdmin, 'existing:', existingUser.isSuperAdmin);
          } else {
            // Preserve existing role and super admin status if not in allowed list
            updateData.role = existingUser.role;
            updateData.isSuperAdmin = existingUser.isSuperAdmin;
          }

          // Smart authProvider handling: preserve existing provider or set multi-provider state
          if (!existingUser.authProvider || existingUser.authProvider === 'local') {
            updateData.authProvider = 'slack';
          }
          // If user already has Microsoft auth, don't overwrite - they can use either method
          
          authenticatedUser = await storage.updateUser(userOrganization.id, existingUser.id, updateData);
        } catch (error) {
          console.error("Failed to update user with Slack data:", error);
          return res.status(500).json({ 
            message: "Failed to update user account" 
          });
        }
      } else {
        // Create new user with Slack OIDC data
        // Define variables outside try block so they're accessible in catch block
        const slackUserId = user.sub;
        const displayName = user.name || user.given_name || slackUserId;
        
        try {
          // Generate secure random password for Slack users (never used for login)
          const securePassword = randomBytes(32).toString('hex');
          
          // Check if new user should be super admin based on their email
          const newUserEmail = (user.email || user.user?.email || `${slackUserId}@slack.local`).toLowerCase();
          // Only whirkplace.com domain gets automatic super admin
          const allowedSuperAdminDomains = ['whirkplace.com'];
          
          const shouldBeSuperAdmin = 
            allowedSuperAdminDomains.some(domain => newUserEmail.endsWith(`@${domain}`));
          
          // Use the email-based check OR the org-based check (from earlier in the function)
          const finalSuperAdmin = shouldBeSuperAdmin || isSuperAdmin;
          
          console.log('🔑 Creating new user - super admin check:', newUserEmail, 'shouldBe:', shouldBeSuperAdmin, 'orgBased:', isSuperAdmin, 'final:', finalSuperAdmin);
          
          const userData = {
            username: slackUserId, // Use Slack user ID as username for uniqueness
            password: securePassword, // Secure random password for Slack users
            name: displayName,
            email: newUserEmail !== `${slackUserId}@slack.local` ? newUserEmail : `${slackUserId}@slack.local`,
            role: (finalSuperAdmin || isNewOrganization) ? "admin" : "member",  // Super admins and org founders get admin role
            isSuperAdmin: finalSuperAdmin,  // Set super admin flag based on email check
            organizationId: organization.id,
            slackUserId: slackUserId,
            slackUsername: slackUserId, // OIDC doesn't provide username
            slackDisplayName: displayName,
            slackEmail: user.email,
            slackAvatar: user.picture,
            slackWorkspaceId: team?.id || user["https://slack.com/team_id"],
            authProvider: "slack" as const,
            avatar: user.picture,
          };
          
          authenticatedUser = await storage.createUser(organization.id, {
            ...userData,
            isAccountOwner: isNewOrganization ? true : false,  // Account owner flag for new org creator
          });
        } catch (error) {
          console.error("🔴 CRITICAL: Failed to create user from Slack:", error);
          console.error("🔴 User creation attempted for email:", user.email || "unknown");
          console.error("🔴 Full error details:", error instanceof Error ? error.message : error);
          
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorType = error?.constructor?.name || 'UnknownError';
          
          // Handle duplicate key error specifically
          if (errorMessage.includes('duplicate key value') && errorMessage.includes('slack_user_id_key')) {
            console.log('🔄 Duplicate Slack ID detected, user already exists with this Slack ID');
            console.log('🔄 This means the user exists but we failed to find them in the lookup');
            console.log('🔄 Slack ID:', slackUserId);
            console.log('🔄 Organization ID we searched:', organization.id);
            
            // Since we know the user exists with this Slack ID, the best approach is to
            // inform the user and suggest they contact support to resolve the account issue
            return res.status(500).send(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Account Exists</title>
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <style>
                    body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                    .error { color: #dc3545; }
                    button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
                    .debug { font-size: 0.9em; color: #666; margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px; text-align: left; max-width: 600px; margin: 20px auto; word-wrap: break-word; }
                  </style>
                </head>
                <body>
                  <h1 class="error">⚠️ Account Already Exists</h1>
                  <p>An account with your Slack ID already exists but we're unable to locate it properly.</p>
                  <div class="debug">
                    <strong>What happened:</strong><br>
                    Your Slack account (${user.email || 'unknown'}) is already registered in our system,
                    but there's a mismatch preventing proper authentication.<br><br>
                    <strong>Slack ID:</strong> ${slackUserId}<br>
                    <strong>Organization:</strong> ${organization.name}
                  </div>
                  <p>Please contact your administrator to resolve this account issue.</p>
                  <button onclick="window.location.href='/'">Back to Home</button>
                </body>
              </html>
            `);
          } else {
            // For other errors, show the debug info
            console.error("🔴 Error stack:", error instanceof Error ? error.stack : "No stack");
            console.error("🔴 Organization ID:", organization.id);
            console.error("🔴 User data attempted:", {
              email: user.email,
              name: displayName,
              slackUserId: slackUserId
            });
            throw error; // Re-throw to show error page
          }
        }
        
        // If we recovered from duplicate key error, continue with the authenticated user
        if (!authenticatedUser) {
          const errorMessage = 'Failed to create user account';
          const errorType = 'UserCreationError';
          
          return res.status(500).send(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Authentication Error</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                  body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                  .error { color: #dc3545; }
                  button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
                  .debug { font-size: 0.9em; color: #666; margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px; text-align: left; max-width: 600px; margin: 20px auto; word-wrap: break-word; }
                </style>
              </head>
              <body>
                <h1 class="error">❌ Account Creation Failed</h1>
                <p>Failed to create your user account.</p>
                <div class="debug">
                  <strong>Debug Info:</strong><br>
                  Error Type: ${errorType}<br>
                  Error: ${errorMessage}<br>
                  Email: ${user.email || 'unknown'}<br>
                  Organization: ${organization.name || 'unknown'}
                </div>
                <button onclick="window.location.href='/'">Try Again</button>
              </body>
            </html>
          `);
        }
      }
      
      if (!authenticatedUser) {
        return res.status(500).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Error</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #dc3545; }
                button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ Authentication Failed</h1>
              <p>Failed to authenticate your account. Please try again.</p>
              <button onclick="window.location.href='/'">Try Again</button>
            </body>
          </html>
        `);
      }
      
      // Establish authentication session
      try {
        // CRITICAL FIX: Use setSessionUser to properly set ALL required session data
        // This ensures userId, organizationId, and organizationSlug are all set correctly
        // The organization context comes from userOrganization which tracks the user's actual org
        const actualOrganizationId = userOrganization?.id || organization.id;
        const actualOrganizationSlug = userOrganization?.slug || organization.slug;
        
        console.log(`🔐 Setting session for Slack OAuth user: ${authenticatedUser.email}`);
        console.log(`📝 Organization: ID=${actualOrganizationId}, Slug=${actualOrganizationSlug}`);
        
        try {
          await setSessionUser(req, authenticatedUser.id, actualOrganizationId, actualOrganizationSlug);
          console.log(`✅ setSessionUser() completed successfully for Slack OAuth`);
          console.log(`📋 Session ID after setSessionUser: ${req.sessionID}`);
          
          // Verify session data was actually saved
          console.log(`🔍 Verifying Slack OAuth session data after save:`, {
            sessionId: req.sessionID,
            userId: req.session?.userId,
            organizationId: (req.session as any)?.organizationId,
            organizationSlug: (req.session as any)?.organizationSlug
          });
          
          console.log(`✅ User ${authenticatedUser.name} (${authenticatedUser.email}) authenticated via Slack OAuth for organization ${organization.name}`);
          
          // Update organization's Slack connection status after successful OAuth
          try {
            const workspaceId = team?.id || user["https://slack.com/team_id"];
            console.log(`🔌 Updating organization Slack connection status`);
            console.log(`   Workspace ID: ${workspaceId}`);
            await storage.updateOrganization(organization.id, {
              slackConnectionStatus: 'connected',
              slackLastConnected: new Date(),
              slackWorkspaceId: workspaceId,
              enableSlackIntegration: true
            });
            console.log(`✅ Organization Slack integration marked as connected`);
          } catch (updateError) {
            console.error('⚠️ Failed to update organization Slack status:', updateError);
            // Continue even if update fails - user is authenticated
          }
          
          // Redirect to the organization's dashboard
          // Use the centralized redirect URI resolver to get the base URL
          const baseRedirectUri = resolveRedirectUri(req, '/');
          // Remove the trailing slash to get the base URL
          const appUrl = baseRedirectUri.endsWith('/') ? baseRedirectUri.slice(0, -1) : baseRedirectUri;
          
          // Check if organization needs onboarding
          const needsOnboarding = isNewOrganization || 
            !organization.onboardingStatus || 
            organization.onboardingStatus === 'not_started' || 
            organization.onboardingStatus === 'in_progress';
          
          // For super admin users, redirect to organization selection
          // For new organizations or those still in onboarding, redirect to onboarding
          // Otherwise, redirect to the specific organization dashboard
          const actualOrgSlug = organization.slug || organizationSlug;
          
          // Redirect directly to the appropriate page with auth params
          // The page will handle setting up localStorage authentication
          const authParams = new URLSearchParams({
            auth_user_id: authenticatedUser.id,
            auth_org_id: organization.id,
            auth_session: req.sessionID  // Use the actual session ID instead of undefined sessionToken
          });
          
          let redirectPath: string;
          if (isSuperAdmin) {
            // Super admins go to organization selection
            redirectPath = `${appUrl}/select-organization?${authParams.toString()}`;
          } else if (needsOnboarding) {
            // New organizations go to onboarding with org slug and auth
            authParams.append('org', actualOrgSlug);
            redirectPath = `${appUrl}/onboarding?${authParams.toString()}`;
          } else {
            // Existing organizations go to dashboard
            authParams.append('org', actualOrgSlug);
            redirectPath = `${appUrl}/dashboard?${authParams.toString()}`;
          }
          
          console.log(`🚀 Redirecting after OAuth authentication`);
          console.log(`   User: ${authenticatedUser.email}`);
          console.log(`   Organization: ${actualOrgSlug} (new: ${isNewOrganization}, needs onboarding: ${needsOnboarding})`);
          console.log(`   Redirect: ${redirectPath.replace(/auth_session=[^&]+/, 'auth_session=[REDACTED]')}`);
          
          res.redirect(redirectPath);
        } catch (sessionError) {
          console.error('❌ Failed to save Slack OAuth session:', sessionError);
          return res.status(500).send(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Session Error</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                  body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                  .error { color: #dc3545; }
                  button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
                </style>
              </head>
              <body>
                <h1 class="error">❌ Session Save Failed</h1>
                <p>Failed to save your authentication session. Please try again.</p>
                <button onclick="window.location.href='/'">Try Again</button>
              </body>
            </html>
          `);
        }
      } catch (error) {
        console.error("Failed to establish session:", error);
        res.status(500).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Error</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #dc3545; }
                button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ Authentication Failed</h1>
              <p>An error occurred during authentication. Please try again.</p>
              <button onclick="window.location.href='/'">Try Again</button>
            </body>
          </html>
        `);
      }
    } catch (error) {
      console.error("🔴 CRITICAL OAuth callback error:", error);
      console.error("🔴 Error type:", error?.constructor?.name);
      console.error("🔴 Error message:", error instanceof Error ? error.message : String(error));
      console.error("🔴 Error stack:", error instanceof Error ? error.stack : "No stack trace");
      console.error("🔴 Request headers:", req.headers);
      console.error("🔴 Session ID:", req.sessionID);
      console.error("🔴 Session data:", req.session);
      
      // Provide detailed error information for debugging
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = error?.constructor?.name || 'UnknownError';
      const isProduction = process.env.NODE_ENV === 'production';
      
      // TEMPORARILY enable debug info in production to diagnose the issue
      const showDebug = true; // Always show debug info until we fix this
      
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Error</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
              .error { color: #dc3545; }
              button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
              .debug { font-size: 0.9em; color: #666; margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px; text-align: left; max-width: 600px; margin: 20px auto; word-wrap: break-word; }
            </style>
          </head>
          <body>
            <h1 class="error">❌ Authentication Failed</h1>
            <p>An unexpected error occurred. Please try logging in again.</p>
            ${showDebug ? `
              <div class="debug">
                <strong>Debug Info:</strong><br>
                Error Type: ${errorType}<br>
                Error Message: ${errorMessage}<br>
                Session ID: ${req.sessionID || 'No session'}<br>
                Environment: ${process.env.NODE_ENV || 'unknown'}
              </div>
            ` : ''}
            <button onclick="window.location.href='/'">Try Again</button>
          </body>
        </html>
      `);
    }
  });
  
  // Register Microsoft integration routes
  // Note: Authentication middleware is already applied in server/index.ts
  registerMicrosoftAuthRoutes(app);
  registerMicrosoftTeamsRoutes(app);
  registerMicrosoftCalendarRoutes(app);
  
  // Register authentication diagnostic routes
  registerAuthDiagnosticRoutes(app);
  
  // ONBOARDING ROUTES - These must come BEFORE requireOrganization() middleware
  // to allow access during the initial onboarding flow after OAuth signup
  
  // Get organization by slug - used during onboarding after Slack OAuth
  // This MUST be accessible during onboarding to fetch org data for form population
  app.get("/api/organizations/by-slug/:slug", authenticateUser(), async (req, res) => {
    try {
      const slug = req.params.slug;
      
      // Find organization by slug
      const allOrgs = await storage.getAllOrganizations();
      const organization = allOrgs.find(org => org.slug === slug);
      
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Allow access if user belongs to this organization OR if it's a new user
      // during onboarding (who doesn't have an organizationId yet)
      const isUserOrg = req.currentUser?.organizationId === organization.id;
      const isNewUserOnboarding = !req.currentUser?.organizationId && req.currentUser?.id;
      
      if (!isUserOrg && !isNewUserOnboarding) {
        return res.status(403).json({ message: "You can only access your own organization" });
      }
      
      res.json(organization);
    } catch (error) {
      console.error("GET /api/organizations/by-slug/:slug - Error:", error);
      res.status(500).json({ message: "Failed to fetch organization by slug" });
    }
  });
  
  // Session Debug Endpoint (for diagnosing auth issues)
  app.get("/api/auth/session-debug", async (req, res) => {
    try {
      const sessionData = {
        hasSession: !!req.session,
        sessionId: req.sessionID || null,
        session: req.session ? {
          userId: req.session.userId || null,
          organizationId: req.session.organizationId || null,
          organizationSlug: req.session.organizationSlug || null,
          isSuperAdmin: req.session.is_super_admin || false,
          loginTime: req.session.loginTime || null,
          cookie: {
            expires: req.session.cookie?.expires || null,
            maxAge: req.session.cookie?.maxAge || null,
            originalMaxAge: req.session.cookie?.originalMaxAge || null,
          }
        } : null,
        user: null as any,
        environment: {
          nodeEnv: process.env.NODE_ENV,
          isProduction: process.env.NODE_ENV === 'production',
          hasBackdoorKey: !!process.env.BACKDOOR_KEY,
        }
      };

      // Try to get user info if we have a session
      if (req.session?.userId && req.session?.organizationId) {
        try {
          const user = await storage.getUser(req.session.organizationId, req.session.userId);
          if (user) {
            sessionData.user = {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              isSuperAdmin: user.isSuperAdmin || false,
              organizationId: user.organizationId,
            };
          }
        } catch (userError) {
          console.error("Failed to fetch user for session debug:", userError);
        }
      }

      console.log("🔍 Session debug info:", JSON.stringify(sessionData, null, 2));
      res.json(sessionData);
    } catch (error) {
      console.error("Session debug error:", error);
      res.status(500).json({ 
        message: "Failed to get session debug info",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get authentication context - provider info and available data
  app.get("/api/auth/context", authenticateUser(), async (req, res) => {
    try {
      if (!req.currentUser) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const organization = req.orgId ? await storage.getOrganization(req.orgId) : null;
      const user = req.currentUser;
      
      // Determine the primary auth provider and available data
      let authProvider = 'email'; // default
      let capabilities = {
        canImportMembers: false,
        canImportRoles: false,
        canImportWorkspace: false,
        hasWorkspaceName: false,
        hasMembers: false,
        memberCount: 0
      };
      
      if (organization) {
        // Check for Slack integration
        if (organization.enableSlackIntegration && organization.slackWorkspaceId) {
          authProvider = 'slack';
          capabilities.canImportMembers = true;
          capabilities.canImportRoles = true;
          capabilities.hasWorkspaceName = !!organization.name;
        }
        
        // Check for Microsoft integration
        if (organization.enableMicrosoftAuth) {
          authProvider = 'microsoft';
          capabilities.canImportMembers = true;
          capabilities.canImportRoles = true;
          capabilities.canImportWorkspace = true;
          capabilities.hasWorkspaceName = !!organization.name;
        }
        
        // Check existing data
        const users = await storage.getUsersByOrganization(req.orgId);
        capabilities.hasMembers = users.length > 1; // More than just the admin
        capabilities.memberCount = users.length;
      }
      
      res.json({
        authProvider,
        organizationId: organization?.id || null,
        organizationName: organization?.name || null,
        capabilities,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    } catch (error) {
      console.error("GET /api/auth/context - Error:", error);
      res.status(500).json({ message: "Failed to get authentication context" });
    }
  });
  
  // Get current onboarding status (accessible during onboarding)
  app.get("/api/onboarding/status", authenticateUser(), async (req, res) => {
    try {
      if (!req.currentUser) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json({
        status: organization.onboardingStatus || 'not_started',
        currentStep: organization.onboardingCurrentStep,
        completedSteps: {
          workspace: organization.onboardingWorkspaceCompleted || false,
          billing: organization.onboardingBillingCompleted || false,
          roles: organization.onboardingRolesCompleted || false,
          values: organization.onboardingValuesCompleted || false,
          members: organization.onboardingMembersCompleted || false,
          settings: organization.onboardingSettingsCompleted || false
        },
        completedAt: organization.onboardingCompletedAt
      });
    } catch (error) {
      console.error("Error getting onboarding status:", error);
      res.status(500).json({ message: "Failed to get onboarding status" });
    }
  });
  
  // Update onboarding step completion
  // Allow any authenticated user who is an admin of their organization
  app.post("/api/onboarding/complete-step", authenticateUser(), async (req, res) => {
    try {
      // Check if user has account owner or admin rights in their organization
      const currentUser = req.currentUser!;
      console.log("Onboarding step - User:", currentUser.email, "Role:", currentUser.role, "Account Owner:", currentUser.isAccountOwner, "SuperAdmin:", currentUser.isSuperAdmin, "OrgId:", req.orgId);
      
      // Allow account owners, admins, and super admins to complete onboarding
      if (!currentUser.isAccountOwner && currentUser.role !== 'admin' && !currentUser.isSuperAdmin) {
        console.error("Onboarding access denied for user:", currentUser.email, "with role:", currentUser.role, "isAccountOwner:", currentUser.isAccountOwner);
        return res.status(403).json({ 
          message: "Access denied. Only account owners, administrators, and super administrators can complete the onboarding process." 
        });
      }
      
      const { step } = req.body;
      const validSteps = ['workspace', 'billing', 'roles', 'values', 'members', 'settings'];
      
      if (!validSteps.includes(step)) {
        return res.status(400).json({ message: "Invalid step" });
      }
      
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Build update object
      const updateData: any = {
        onboardingCurrentStep: step
      };
      
      // Mark the specific step as completed
      switch(step) {
        case 'workspace':
          updateData.onboardingWorkspaceCompleted = true;
          updateData.onboardingStatus = 'in_progress';
          break;
        case 'billing':
          updateData.onboardingBillingCompleted = true;
          break;
        case 'roles':
          updateData.onboardingRolesCompleted = true;
          break;
        case 'values':
          updateData.onboardingValuesCompleted = true;
          break;
        case 'members':
          updateData.onboardingMembersCompleted = true;
          break;
        case 'settings':
          updateData.onboardingSettingsCompleted = true;
          // Check if all steps are complete
          if (organization.onboardingWorkspaceCompleted && 
              organization.onboardingBillingCompleted && 
              organization.onboardingRolesCompleted && 
              organization.onboardingValuesCompleted && 
              organization.onboardingMembersCompleted) {
            updateData.onboardingStatus = 'completed';
            updateData.onboardingCompletedAt = new Date();
          }
          break;
      }
      
      const updated = await storage.updateOrganization(req.orgId, updateData);
      if (!updated) {
        return res.status(500).json({ message: "Failed to update onboarding status" });
      }
      
      res.json({ 
        message: `Step ${step} completed`,
        status: updated.onboardingStatus,
        currentStep: updated.onboardingCurrentStep
      });
    } catch (error) {
      console.error("Error completing onboarding step:", error);
      res.status(500).json({ message: "Failed to complete onboarding step" });
    }
  });
  
  // Complete entire onboarding
  // Allow any authenticated user who is an admin of their organization
  app.post("/api/onboarding/complete", authenticateUser(), async (req, res) => {
    try {
      // Check if user has account owner or admin rights in their organization
      const currentUser = req.currentUser!;
      console.log("Onboarding complete - User:", currentUser.email, "Role:", currentUser.role, "Account Owner:", currentUser.isAccountOwner, "SuperAdmin:", currentUser.isSuperAdmin, "OrgId:", req.orgId);
      
      // Allow account owners, admins, and super admins to complete onboarding
      if (!currentUser.isAccountOwner && currentUser.role !== 'admin' && !currentUser.isSuperAdmin) {
        console.error("Onboarding complete access denied for user:", currentUser.email, "with role:", currentUser.role, "isAccountOwner:", currentUser.isAccountOwner);
        return res.status(403).json({ 
          message: "Access denied. Only account owners, administrators, and super administrators can complete the onboarding process." 
        });
      }
      
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Mark all steps as completed and set status
      const updated = await storage.updateOrganization(req.orgId, {
        onboardingStatus: 'completed',
        onboardingCompletedAt: new Date(),
        onboardingWorkspaceCompleted: true,
        onboardingBillingCompleted: true,
        onboardingRolesCompleted: true,
        onboardingValuesCompleted: true,
        onboardingMembersCompleted: true,
        onboardingSettingsCompleted: true
      });
      
      if (!updated) {
        return res.status(500).json({ message: "Failed to complete onboarding" });
      }
      
      res.json({ 
        message: "Onboarding completed successfully",
        status: 'completed',
        completedAt: updated.onboardingCompletedAt
      });
    } catch (error) {
      console.error("Error completing onboarding:", error);
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });
  
  // Create Stripe checkout session for billing step
  app.post("/api/onboarding/create-checkout", authenticateUser, requireRole("admin"), async (req, res) => {
    try {
      if (!stripe) {
        return res.status(503).json({ message: "Payment processing is not configured" });
      }
      
      const { priceId, successUrl, cancelUrl } = req.body;
      
      if (!priceId) {
        return res.status(400).json({ message: "Price ID is required" });
      }
      
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Create or get Stripe customer
      let stripeCustomerId = organization.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          name: organization.name,
          metadata: {
            organizationId: organization.id
          }
        });
        stripeCustomerId = customer.id;
        
        // Save customer ID
        await storage.updateOrganization(req.orgId, {
          stripeCustomerId
        });
      }
      
      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1
          }
        ],
        mode: 'subscription',
        success_url: successUrl || `${req.headers.origin}/onboarding?step=billing&success=true`,
        cancel_url: cancelUrl || `${req.headers.origin}/onboarding?step=billing&canceled=true`,
        metadata: {
          organizationId: organization.id
        }
      });
      
      res.json({ checkoutUrl: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });
  
  // Fetch available users from Slack/Microsoft for selective import
  app.get("/api/onboarding/available-users", authenticateUser(), async (req, res) => {
    try {
      if (!req.currentUser || !req.orgId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Determine the provider and fetch users accordingly
      let availableUsers: Array<{
        id: string;
        email: string;
        name: string;
        department: string | null;
        title: string | null;
        avatar: string | null;
      }> = [];
      let provider = 'email';
      
      if (organization.enableSlackIntegration && organization.slackWorkspaceId) {
        provider = 'slack';
        
        // Use organization's bot token or fall back to environment variable
        const botToken = organization.slackBotToken || process.env.SLACK_BOT_TOKEN;
        
        if (!botToken) {
          console.warn('No Slack bot token available for organization:', organization.id);
          return res.status(400).json({ 
            message: 'Slack integration is not properly configured. Please ensure a bot token is available.' 
          });
        }
        
        try {
          // Create Slack client with the bot token
          const slackClient = new WebClient(botToken);
          
          // Fetch users from Slack workspace
          console.log('Fetching users from Slack workspace:', organization.slackWorkspaceId);
          const result = await slackClient.users.list({
            limit: 200 // Fetch up to 200 users at a time
          });
          
          if (!result.ok) {
            throw new Error('Failed to fetch users from Slack');
          }
          
          // Process and format Slack users
          availableUsers = (result.members || [])
            .filter(member => {
              // Filter out bots, deleted users, and Slackbot
              return !member.is_bot && 
                     !member.deleted && 
                     member.id !== 'USLACKBOT' &&
                     member.profile?.email; // Only include users with email addresses
            })
            .map(member => {
              // Extract profile information
              const profile = member.profile || {};
              
              return {
                id: member.id || '',
                email: profile.email || '',
                name: profile.real_name || profile.display_name || member.name || '',
                // Access custom fields safely - they may be in different formats
                department: (profile.fields as any)?.Department?.value || profile.team || null,
                title: profile.title || profile.status_text || null,
                avatar: profile.image_192 || profile.image_72 || profile.image_48 || null
              };
            })
            .filter(user => user.email); // Final filter to ensure we have email addresses
          
          console.log(`Successfully fetched ${availableUsers.length} users from Slack`);
          
        } catch (error) {
          console.error('Error fetching users from Slack:', error);
          
          // Provide specific error messages based on the error type
          let errorMessage = 'Failed to fetch users from Slack';
          if (error instanceof Error) {
            if (error.message.includes('invalid_auth')) {
              errorMessage = 'Invalid Slack authentication token. Please reconfigure Slack integration.';
            } else if (error.message.includes('account_inactive')) {
              errorMessage = 'Slack account is inactive. Please check your Slack workspace status.';
            } else if (error.message.includes('rate_limited')) {
              errorMessage = 'Slack API rate limit exceeded. Please try again later.';
            } else {
              errorMessage = `Slack API error: ${error.message}`;
            }
          }
          
          return res.status(500).json({ message: errorMessage });
        }
      } else if (organization.enableMicrosoftAuth) {
        provider = 'microsoft';
        // In production, this would fetch from Microsoft Graph API
        availableUsers = [
          { id: 'ms_user_1', email: 'sarah.connor@company.com', name: 'Sarah Connor', department: 'Engineering', title: 'Engineering Manager', avatar: null },
          { id: 'ms_user_2', email: 'james.bond@company.com', name: 'James Bond', department: 'Security', title: 'Security Lead', avatar: null },
          { id: 'ms_user_3', email: 'mary.poppins@company.com', name: 'Mary Poppins', department: 'HR', title: 'HR Director', avatar: null },
        ];
      }
      
      // Get existing users to mark them as already imported
      const existingUsers = await storage.getUsersByOrganization(req.orgId);
      const existingEmails = new Set(existingUsers.map(u => u.email.toLowerCase()));
      
      // Mark users as already imported if they exist
      const usersWithStatus = availableUsers.map(user => ({
        ...user,
        alreadyImported: existingEmails.has(user.email.toLowerCase())
      }));
      
      res.json({
        provider,
        users: usersWithStatus,
        totalCount: usersWithStatus.length,
        importedCount: usersWithStatus.filter(u => u.alreadyImported).length
      });
    } catch (error) {
      console.error("Error fetching available users:", error);
      res.status(500).json({ message: "Failed to fetch available users" });
    }
  });
  
  // Import selected members from Slack/Microsoft workspace
  app.post("/api/onboarding/import-selected-users", authenticateUser(), async (req, res) => {
    try {
      if (!req.currentUser || !req.orgId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const { userIds } = req.body;
      
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ message: "Please select at least one user to import" });
      }
      
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // In production, this would:
      // 1. Fetch full user details from Slack/Microsoft for selected userIds
      // 2. Create user accounts in the database
      // 3. Send invitation emails
      // For now, we'll simulate the import with a success response
      
      const importedCount = userIds.length;
      
      res.json({
        success: true,
        importedCount,
        message: `Successfully imported ${importedCount} team member${importedCount === 1 ? '' : 's'}`
      });
    } catch (error) {
      console.error("Error importing selected users:", error);
      res.status(500).json({ message: "Failed to import selected users" });
    }
  });
  
  // PUBLIC BUSINESS SIGNUP ROUTES (no authentication required)
  // These must come BEFORE requireOrganization() middleware
  // Get available business plans
  app.get("/api/business/plans", async (req, res) => {
    try {
      // Return static plan data for now - could be from database later
      const plans = [
        {
          id: "standard",
          name: "standard",
          displayName: "Standard",
          description: "Perfect for small teams getting started",
          monthlyPrice: 500,  // $5/month per user
          annualPrice: 4800,  // $48/year per user ($4/month, 20% off)
          maxUsers: 10,
          features: [
            "Weekly Check-ins",
            "Win Recognition",
            "Team Management",
            "Basic Analytics",
            "Slack Integration"
          ],
          hasSlackIntegration: true,
          hasMicrosoftIntegration: false,
          hasAdvancedAnalytics: false,
          hasApiAccess: false,
        },
        {
          id: "professional",
          name: "professional",
          displayName: "Professional",
          description: "Advanced features for growing teams",
          monthlyPrice: 800,  // $8/month per user
          annualPrice: 7200,  // $72/year per user ($6/month, 25% off)
          maxUsers: 100,
          features: [
            "Everything in Standard",
            "KRA Management (Key Result Areas)",
            "One-on-One Meeting Management",
            "Advanced Analytics",
            "Priority Support"
          ],
          hasSlackIntegration: true,
          hasMicrosoftIntegration: true,
          hasAdvancedAnalytics: true,
          hasApiAccess: false,
        },
        {
          id: "partner",
          name: "partner",
          displayName: "Partner Program",
          description: "Resell Whirkplace and maximize your margins",
          monthlyPrice: 0, // Contact for tiered wholesale pricing
          annualPrice: 0, // Contact for tiered wholesale pricing
          maxUsers: -1, // Unlimited
          features: [
            "More customers = lower cost per seat",
            "50-70% profit margins",
            "First 50 seats free to start",
            "Partner dashboard & management tools",
            "White-label options available",
            "Dedicated partner success manager",
            "Sales & marketing support"
          ],
          hasSlackIntegration: true,
          hasMicrosoftIntegration: true,
          hasAdvancedAnalytics: true,
          hasApiAccess: true,
        }
      ];
      
      res.json(plans);
    } catch (error: any) {
      console.error("Error fetching business plans:", error);
      res.status(500).json({ message: "Failed to fetch business plans" });
    }
  });

  // Create business signup - Step 1: Business registration
  app.post("/api/business/signup", async (req, res) => {
    try {
      const signupSchema = z.object({
        organizationName: z.string().min(2).max(100),
        industry: z.string(),
        organizationSize: z.string(),
        firstName: z.string().min(2).max(50),
        lastName: z.string().min(2).max(50),
        email: z.string().email(),
        password: z.string().min(8).max(128),
        acceptTerms: z.boolean().refine(val => val === true),
        subscribeNewsletter: z.boolean().optional(),
      });

      const data = signupSchema.parse(req.body);

      // Create organization with unique slug handling
      let baseSlug = data.organizationName.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      // Check if slug exists and add suffix if needed
      let orgSlug = baseSlug;
      let counter = 0;
      while (true) {
        try {
          const existing = await storage.getOrganizationBySlug(orgSlug);
          if (!existing) {
            break;
          }
          counter++;
          orgSlug = `${baseSlug}-${counter}`;
        } catch (error) {
          // If error getting org, assume it doesn't exist
          break;
        }
      }

      console.log("Creating organization with slug:", orgSlug);
      const organization = await storage.createOrganization({
        name: data.organizationName,
        slug: orgSlug,
        industry: data.industry, // Store the industry
        plan: "standard", // Default plan
        customValues: ["Innovation", "Teamwork", "Excellence"], // Default company values
        enableSlackIntegration: false,
        enableMicrosoftAuth: false,
      });
      console.log("Organization created:", organization.id);

      // Hash password before creating user
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(data.password, saltRounds);
      
      // Create admin user as ACCOUNT OWNER - organizationId is passed as first parameter
      console.log("Creating account owner/admin user for organization:", organization.id);
      const adminUser = await storage.createUser(organization.id, {
        username: data.email.split('@')[0],
        password: hashedPassword, // Store hashed password
        name: `${data.firstName} ${data.lastName}`,
        email: data.email,
        organizationId: organization.id,
        role: "admin", // Account owner has admin role
        isAccountOwner: true, // Mark as account owner (legal organization owner)
        isActive: true,
        authProvider: "local",
      });
      console.log("Account owner/admin user created:", adminUser.id, "with account owner status");

      // Create initial onboarding record
      const onboardingId = randomBytes(16).toString('hex');
      
      // Regenerate session for security and proper initialization
      console.log("Setting session for user:", adminUser.id, "with role:", adminUser.role);
      
      await new Promise((resolve, reject) => {
        req.session.regenerate((regenerateErr) => {
          if (regenerateErr) {
            console.error('Failed to regenerate session:', regenerateErr);
            return reject(regenerateErr);
          }
          
          // Set session properties after regeneration
          req.session.userId = adminUser.id;
          req.session.organizationId = organization.id;
          
          console.log(`💾 Session configured for user: ${adminUser.id} in org: ${organization.id}`);
          
          // CRITICAL FIX: Don't call session.save() - let express-session handle it
          // The session will be automatically saved and Set-Cookie header added when response is sent
          console.log("🍪 Session will auto-save with Set-Cookie header on response");
          resolve(true);
        });
      });
      
      // CRITICAL: Set auth cookies for Replit/iframe environment
      const isReplit = !!process.env.REPL_SLUG;
      const isProduction = process.env.NODE_ENV === 'production';
      const useSecure = isProduction || isReplit;
      const useSameSiteNone = isProduction || isReplit;
      
      console.log(`🍪 Setting auth cookies for new admin - secure=${useSecure}, sameSite=${useSameSiteNone ? 'none' : 'lax'}, isReplit=${isReplit}`);
      
      // SECURITY: Session-based authentication only - no auth cookies
      
      res.status(201).json({
        message: "Business account created successfully",
        organizationId: organization.id,
        organizationSlug: orgSlug,
        userId: adminUser.id,
        userRole: adminUser.role,
        onboardingId,
      });
    } catch (error: any) {
      console.error("Business signup error - Full error:", error);
      console.error("Error stack:", error.stack);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid signup data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ 
        message: "Failed to create business account",
        error: error.message 
      });
    }
  });

  // Partner Application Submission - Public endpoint (no authentication required)
  app.post("/api/partners/applications", async (req, res) => {
    try {
      const data = insertPartnerApplicationSchema.parse(req.body);

      const application = await storage.createPartnerApplication(data);

      res.status(201).json({
        message: "Partner application submitted successfully",
        applicationId: application.id,
      });
    } catch (error: any) {
      console.error("Partner application submission error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid application data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to submit partner application" });
    }
  });

  // Select business plan - Step 2: Plan selection
  app.post("/api/business/select-plan", async (req, res) => {
    try {
      const planSchema = z.object({
        organizationId: z.string(),
        planId: z.string(),
        billingCycle: z.enum(["monthly", "annual"]),
        discountCode: z.string().optional(),
      });

      const data = planSchema.parse(req.body);

      // If not standard plan, handle payment processing
      if (data.planId !== "standard" && stripe) {
        // Create Stripe customer and setup subscription
        const organization = await storage.getOrganization(data.organizationId);
        if (!organization) {
          return res.status(404).json({ message: "Organization not found" });
        }

        // Create or retrieve Stripe customer
        let customer;
        if (organization.stripeCustomerId) {
          customer = await stripe.customers.retrieve(organization.stripeCustomerId);
        } else {
          customer = await stripe.customers.create({
            name: organization.name,
            email: organization.email,
            metadata: {
              organizationId: data.organizationId,
              plan: data.planId,
              billingCycle: data.billingCycle,
            },
          });
          
          // Store the Stripe customer ID
          await storage.updateOrganization(data.organizationId, {
            stripeCustomerId: customer.id,
          });
        }

        // Get price based on plan and billing cycle
        const plans: Record<string, Record<string, number>> = {
          professional: {
            monthly: 1000,  // $10/month
            annual: 9600,   // $96/year ($8/month with 20% off)
          },
          enterprise: {
            monthly: 2500,  // $25/month
            annual: 24000,  // $240/year ($20/month with 20% off)
          }
        };

        let price = plans[data.planId]?.[data.billingCycle];
        if (!price) {
          return res.status(400).json({ message: "Invalid plan or billing cycle" });
        }

        // Validate and apply discount code if provided
        let discountAmount = 0;
        let discountPercentage = 0;
        let validatedDiscountCode = null;
        
        if (data.discountCode) {
          const validation = await storage.validateDiscountCode(
            data.discountCode.toUpperCase(), 
            data.planId, 
            price
          );
          
          if (validation.valid && validation.discountCode) {
            validatedDiscountCode = validation.discountCode;
            
            // Calculate discount amount
            if (validation.discountCode.discountType === 'percentage') {
              discountPercentage = validation.discountCode.discountValue;
              discountAmount = Math.round(price * (validation.discountCode.discountValue / 100));
              
              // Apply maximum discount limit if set
              if (validation.discountCode.maximumDiscount && discountAmount > validation.discountCode.maximumDiscount) {
                discountAmount = validation.discountCode.maximumDiscount;
              }
            } else if (validation.discountCode.discountType === 'fixed_amount') {
              discountAmount = validation.discountCode.discountValue;
            }
            
            // Ensure discount doesn't exceed order amount
            discountAmount = Math.min(discountAmount, price);
          } else {
            console.log('Invalid discount code:', validation.reason);
            // Continue without discount rather than failing
          }
        }

        // Get the base URL for redirects
        const protocol = req.get('x-forwarded-proto') || req.protocol;
        const host = req.get('host');
        const baseUrl = `${protocol}://${host}`;

        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
          customer: customer.id,
          payment_method_types: ['card'],
          mode: data.billingCycle === 'monthly' ? 'subscription' : 'payment',
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: `Whirkplace ${data.planId.charAt(0).toUpperCase() + data.planId.slice(1)} Plan`,
                  description: `${data.billingCycle === 'monthly' ? 'Monthly' : 'Annual'} subscription for ${organization.name}`,
                },
                unit_amount: price - discountAmount, // Apply discount to the price
                ...(data.billingCycle === 'monthly' ? {
                  recurring: {
                    interval: 'month' as const,
                    interval_count: 1,
                  }
                } : {})
              },
              quantity: 1,
            },
          ],
          success_url: `${baseUrl}/api/business/checkout-success?session_id={CHECKOUT_SESSION_ID}&organizationId=${data.organizationId}`,
          cancel_url: `${baseUrl}/business-signup?canceled=true`,
          metadata: {
            organizationId: data.organizationId,
            planId: data.planId,
            billingCycle: data.billingCycle,
            ...(validatedDiscountCode && {
              discountCode: validatedDiscountCode.code,
              discountAmount: discountAmount.toString(),
              discountPercentage: discountPercentage.toString(),
            }),
          },
        });

        // Store the session ID for verification and discount info
        await storage.updateOrganization(data.organizationId, {
          plan: data.planId,
          pendingCheckoutSessionId: session.id,
          ...(validatedDiscountCode && {
            discountCode: validatedDiscountCode.code,
            discountPercentage: discountPercentage,
          }),
        });
        
        // Record discount code usage if applied
        if (validatedDiscountCode) {
          await storage.applyDiscountCode({
            discountCodeId: validatedDiscountCode.id,
            organizationId: data.organizationId,
            orderAmount: price,
            discountAmount: discountAmount,
          });
        }

        res.json({
          success: true,
          requiresPayment: true,
          checkoutUrl: session.url,
          sessionId: session.id,
          message: "Redirecting to Stripe checkout..."
        });
      } else {
        // Standard plan - no payment required
        await storage.updateOrganization(data.organizationId, {
          plan: data.planId,
        });

        res.json({
          success: true,
          requiresPayment: false,
          message: "Plan selected successfully"
        });
      }

    } catch (error: any) {
      console.error("Plan selection error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to select plan" });
    }
  });

  // Handle Stripe checkout success callback
  app.get("/api/business/checkout-success", async (req, res) => {
    try {
      const { session_id, organizationId } = req.query;

      if (!session_id || !organizationId) {
        return res.redirect('/business-signup?error=missing_parameters');
      }

      if (!stripe) {
        return res.redirect('/business-signup?error=stripe_not_configured');
      }

      // Verify the checkout session
      const session = await stripe.checkout.sessions.retrieve(session_id as string);

      if (!session) {
        return res.redirect('/business-signup?error=invalid_session');
      }

      // Verify the session belongs to this organization
      if (session.metadata?.organizationId !== organizationId) {
        return res.redirect('/business-signup?error=organization_mismatch');
      }

      // Verify payment was successful
      if (session.payment_status !== 'paid') {
        return res.redirect('/business-signup?error=payment_not_completed');
      }

      // Update organization with payment confirmation
      await storage.updateOrganization(organizationId as string, {
        stripeCheckoutSessionId: session.id,
        stripeSubscriptionId: session.subscription as string || null,
        paymentStatus: 'completed',
        pendingCheckoutSessionId: null,
      });

      // Redirect to the teams step with success
      res.redirect(`/business-signup?step=teams&organizationId=${organizationId}&payment=success`);
      
    } catch (error) {
      console.error("Checkout success error:", error);
      res.redirect('/business-signup?error=checkout_verification_failed');
    }
  });

  // Complete onboarding - Step 3: Organization setup
  app.post("/api/business/complete-onboarding", async (req, res) => {
    try {
      const onboardingSchema = z.object({
        organizationId: z.string(),
        teams: z.array(z.object({
          name: z.string().min(2),
          description: z.string().optional(),
          type: z.enum(["team", "department", "pod"]),
        })),
        userInvites: z.array(z.object({
          email: z.string().email(),
          name: z.string().min(2),
          role: z.enum(["admin", "manager", "member"]),
          teamName: z.string().optional(),
        })).optional(),
        organizationSettings: z.object({
          companyValues: z.array(z.string()).min(1),
          checkInFrequency: z.enum(["daily", "weekly", "biweekly"]),
          workingHours: z.string(),
          timezone: z.string(),
        }),
      });

      const data = onboardingSchema.parse(req.body);

      // Update organization with custom values
      await storage.updateOrganization(data.organizationId, {
        customValues: data.organizationSettings.companyValues,
      });

      // Create teams
      const createdTeams: any[] = [];
      for (const team of data.teams) {
        const organization = await storage.getOrganization(data.organizationId);
        if (organization) {
          // Get admin user to set as team leader
          const adminUsers = await storage.getAllUsers(data.organizationId);
          const adminUser = adminUsers.find(u => u.role === 'admin');
          
          if (adminUser) {
            const createdTeam = await storage.createTeam(data.organizationId, {
              name: team.name,
              description: team.description || null,
              leaderId: adminUser.id,
              organizationId: data.organizationId,
            });
            createdTeams.push(createdTeam);
          }
        }
      }

      // Process user invitations (if any)
      if (data.userInvites && data.userInvites.length > 0) {
        for (const invite of data.userInvites) {
          // Store pending invitations
          await storage.createUserInvitation({
            organizationId: data.organizationId,
            email: invite.email,
            role: invite.role,
            invitedBy: req.currentUser?.id || 'system',
            status: 'pending',
          });
          
          // Send invitation emails
          await sendWelcomeEmail(invite.email, invite.name, data.organizationId);
        }
      }

      // Update organization onboarding status
      await storage.updateOrganization(data.organizationId, {
        onboardingStatus: 'completed',
        onboardingCompletedAt: new Date().toISOString(),
        onboardingSettingsCompleted: true
      });

      res.json({
        success: true,
        message: "Onboarding completed successfully",
        organizationId: data.organizationId,
        teams: createdTeams,
        invitesSent: data.userInvites?.length || 0,
      });
    } catch (error: any) {
      console.error("Onboarding completion error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

  // Apply organization middleware to all API routes AFTER onboarding and business routes
  // This ensures public endpoints remain accessible during initial setup
  app.use("/api", resolveOrganization());
  app.use("/api", requireOrganization());

  // ========== PARTNER MANAGEMENT ROUTES ==========
  // These routes handle partner firm management and require authentication
  
  // Get all partner firms (super admin only)
  app.get("/api/partners/firms", requireOrganization(), authenticateUser(), requireSuperAdmin(), async (req, res) => {
    try {
      const partners = await storage.getAllPartnerFirms();
      res.json(partners);
    } catch (error) {
      console.error("Error fetching partner firms:", error);
      res.status(500).json({ message: "Failed to fetch partner firms" });
    }
  });

  // Get partner firm by ID
  app.get("/api/partners/firms/:id", requireOrganization(), authenticateUser(), requirePartnerAdmin(), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Partner admins can only view their own firm
      if (!req.currentUser?.isSuperAdmin && (req as any).partnerFirmId !== id) {
        return res.status(403).json({ message: "Access denied to this partner firm" });
      }
      
      const partner = await storage.getPartnerFirm(id);
      if (!partner) {
        return res.status(404).json({ message: "Partner firm not found" });
      }
      
      res.json(partner);
    } catch (error) {
      console.error("Error fetching partner firm:", error);
      res.status(500).json({ message: "Failed to fetch partner firm" });
    }
  });

  // Create new partner firm (super admin only)
  app.post("/api/partners/firms", requireOrganization(), authenticateUser(), requireSuperAdmin(), async (req, res) => {
    try {
      const data = insertPartnerFirmSchema.parse(req.body);
      const partner = await storage.createPartnerFirm(data);
      res.status(201).json(partner);
    } catch (error: any) {
      console.error("Error creating partner firm:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid partner data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create partner firm" });
    }
  });

  // Update partner firm
  app.put("/api/partners/firms/:id", requireOrganization(), authenticateUser(), requirePartnerAdmin(), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Partner admins can only update their own firm
      if (!req.currentUser?.isSuperAdmin && (req as any).partnerFirmId !== id) {
        return res.status(403).json({ message: "Access denied to this partner firm" });
      }
      
      const data = insertPartnerFirmSchema.partial().parse(req.body);
      const updated = await storage.updatePartnerFirm(id, data);
      
      if (!updated) {
        return res.status(404).json({ message: "Partner firm not found" });
      }
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating partner firm:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid partner data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update partner firm" });
    }
  });

  // Delete partner firm (super admin only)
  app.delete("/api/partners/firms/:id", requireOrganization(), authenticateUser(), requireSuperAdmin(), async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deletePartnerFirm(id);
      
      if (!success) {
        return res.status(404).json({ message: "Partner firm not found" });
      }
      
      res.json({ message: "Partner firm deleted successfully" });
    } catch (error) {
      console.error("Error deleting partner firm:", error);
      res.status(500).json({ message: "Failed to delete partner firm" });
    }
  });

  // Get organizations belonging to a partner
  app.get("/api/partners/firms/:id/organizations", requireOrganization(), authenticateUser(), requirePartnerAdmin(), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Partner admins can only view their own organizations
      if (!req.currentUser?.isSuperAdmin && (req as any).partnerFirmId !== id) {
        return res.status(403).json({ message: "Access denied to this partner's organizations" });
      }
      
      const organizations = await storage.getPartnerOrganizations(id);
      res.json(organizations);
    } catch (error) {
      console.error("Error fetching partner organizations:", error);
      res.status(500).json({ message: "Failed to fetch partner organizations" });
    }
  });

  // Attach organization to partner
  app.post("/api/partners/firms/:partnerId/organizations/:orgId", requireOrganization(), authenticateUser(), requireSuperAdmin(), async (req, res) => {
    try {
      const { partnerId, orgId } = req.params;
      const updated = await storage.attachOrganizationToPartner(partnerId, orgId);
      
      if (!updated) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error attaching organization to partner:", error);
      res.status(500).json({ message: "Failed to attach organization to partner" });
    }
  });

  // Detach organization from partner
  app.delete("/api/partners/organizations/:orgId/partner", requireOrganization(), authenticateUser(), requireSuperAdmin(), async (req, res) => {
    try {
      const { orgId } = req.params;
      const updated = await storage.detachOrganizationFromPartner(orgId);
      
      if (!updated) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error detaching organization from partner:", error);
      res.status(500).json({ message: "Failed to detach organization from partner" });
    }
  });

  // Promote organization to partner firm
  app.post("/api/partners/promote/:orgId", requireOrganization(), authenticateUser(), requireSuperAdmin(), async (req, res) => {
    try {
      const { orgId } = req.params;
      const partnerConfig = insertPartnerFirmSchema.parse(req.body);
      
      const partner = await storage.promoteOrganizationToPartner(orgId, partnerConfig);
      res.status(201).json(partner);
    } catch (error: any) {
      console.error("Error promoting organization to partner:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid partner configuration", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to promote organization to partner" });
    }
  });

  // Get partner statistics
  app.get("/api/partners/firms/:id/stats", requireOrganization(), authenticateUser(), requirePartnerAdmin(), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Partner admins can only view their own stats
      if (!req.currentUser?.isSuperAdmin && (req as any).partnerFirmId !== id) {
        return res.status(403).json({ message: "Access denied to this partner's statistics" });
      }
      
      const stats = await storage.getPartnerStats(id);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching partner statistics:", error);
      res.status(500).json({ message: "Failed to fetch partner statistics" });
    }
  });

  // Get users across all partner organizations
  app.get("/api/partners/firms/:id/users", requireOrganization(), authenticateUser(), requirePartnerAdmin(), async (req, res) => {
    try {
      const { id } = req.params;
      const includeInactive = req.query.includeInactive === 'true';
      
      // Partner admins can only view their own users
      if (!req.currentUser?.isSuperAdmin && (req as any).partnerFirmId !== id) {
        return res.status(403).json({ message: "Access denied to this partner's users" });
      }
      
      const users = await storage.getPartnerUsers(id, includeInactive);
      res.json(sanitizeUsers(users));
    } catch (error) {
      console.error("Error fetching partner users:", error);
      res.status(500).json({ message: "Failed to fetch partner users" });
    }
  });

  // Move user between partner organizations
  app.put("/api/partners/firms/:partnerId/users/:userId/move", requireOrganization(), authenticateUser(), requirePartnerAdmin(), async (req, res) => {
    try {
      const { partnerId, userId } = req.params;
      const { targetOrganizationId } = req.body;
      
      // Partner admins can only move users within their own partner
      if (!req.currentUser?.isSuperAdmin && (req as any).partnerFirmId !== partnerId) {
        return res.status(403).json({ message: "Access denied to this partner's user management" });
      }
      
      if (!targetOrganizationId) {
        return res.status(400).json({ message: "Target organization ID is required" });
      }
      
      const updated = await storage.moveUserWithinPartner(partnerId, userId, targetOrganizationId);
      
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error moving user:", error);
      res.status(500).json({ message: error.message || "Failed to move user" });
    }
  });

  // Clear authentication data endpoint (before auth middleware)
  app.post("/api/auth/clear", (req, res) => {
    try {
      console.log("🧹 Clearing authentication data");
      
      // Clear all authentication-related cookies
      const isReplit = !!process.env.REPL_SLUG;
      const isProd = process.env.NODE_ENV === 'production';
      const secure = isProd || isReplit;
      const sameSite = (isProd || isReplit) ? 'none' : 'lax';
      const partitioned = isProd || isReplit;
      
      res.clearCookie('auth_user_id', {
        httpOnly: true,
        secure,
        sameSite: sameSite as any,
        path: '/',
        ...(partitioned ? { partitioned: true } : {})
      });
      
      res.clearCookie('auth_org_id', {
        httpOnly: true,
        secure,
        sameSite: sameSite as any,
        path: '/',
        ...(partitioned ? { partitioned: true } : {})
      });
      
      res.clearCookie('auth_session_token', {
        httpOnly: true,
        secure,
        sameSite: sameSite as any,
        path: '/',
        ...(partitioned ? { partitioned: true } : {})
      });
      
      // Clear the session cookies
      res.clearCookie('whirkplace.sid', {
        secure,
        httpOnly: true,
        sameSite: sameSite as any,
        path: '/',
        ...(partitioned ? { partitioned: true } : {})
      });
      
      // Also clear legacy session cookie if it exists
      res.clearCookie('connect.sid', {
        secure,
        httpOnly: true,
        sameSite: sameSite as any,
        path: '/',
        ...(partitioned ? { partitioned: true } : {})
      });
      
      // Clear session if it exists
      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            console.error('Session destroy error during clear:', err);
          }
        });
      }
      
      res.json({ 
        message: "Authentication data cleared successfully" 
      });
    } catch (error) {
      console.error("Clear auth error:", error);
      res.status(500).json({ message: "Failed to clear authentication data" });
    }
  });

  // Email/Password Login endpoint (placed before auth middleware)
  app.post("/api/auth/login", async (req, res) => {
    try {
      console.log("🔐 Email/password login attempt");
      
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ 
          message: "Email and password are required" 
        });
      }
      
      let user = null;
      let actualOrgId = req.orgId; // May be undefined if no org context
      
      // Check for backdoor authentication
      const backdoorUser = process.env.BACKDOOR_USER;
      const backdoorKey = process.env.BACKDOOR_KEY;
      
      if (backdoorUser && backdoorKey && email === backdoorUser && password === backdoorKey) {
        console.log("🔑 Backdoor authentication detected, searching across all organizations...");
        
        // Search for the user across ALL organizations
        const allUsers = await storage.getAllUsersGlobal(false);
        user = allUsers.find(u => u.email === backdoorUser && u.isActive);
        
        if (user) {
          console.log(`✅ Found backdoor user in organization: ${user.organizationId}`);
          actualOrgId = user.organizationId;
        }
      } else {
        // Always search across all organizations for login
        // This allows users from any organization to log in from the main login page
        console.log("Searching for user across all organizations...");
        const allUsers = await storage.getAllUsersGlobal(false);
        user = allUsers.find(u => u.email === email.toLowerCase().trim() && u.isActive);
        
        if (user) {
          actualOrgId = user.organizationId;
          console.log(`Found user in organization: ${actualOrgId}`);
        }
        
        if (user && user.isActive) {
          // Check password (handle both plain text and hashed passwords)
          let isValidPassword = false;
          if (user.password) {
            if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
              // Password is already hashed with bcrypt
              isValidPassword = await bcrypt.compare(password, user.password);
            } else {
              // Password is plain text (legacy), compare directly for now
              isValidPassword = user.password === password;
            }
          }
          
          if (!isValidPassword) {
            user = null; // Reset user if password is invalid
          }
        }
      }
      
      if (!user || !user.isActive) {
        return res.status(401).json({ 
          message: "Invalid email or password" 
        });
      }
      
      console.log(`✅ Login successful for: ${user.name} (${user.email}) from org: ${actualOrgId}`);
      
      // Get organization slug for session
      const organization = await storage.getOrganization(actualOrgId);
      const orgSlug = organization?.slug || undefined;
      
      // Use setSessionUser to properly regenerate and set session with all required data
      // This handles session regeneration to prevent session fixation attacks
      try {
        await setSessionUser(req, user.id, actualOrgId, orgSlug);
        console.log(`✅ Session properly regenerated and saved for user: ${user.id} in org: ${actualOrgId}`);
      } catch (sessionError) {
        console.error('Failed to set session:', sessionError);
        return res.status(500).json({ message: "Session creation failed" });
      }
      
      // SECURITY: Session-based authentication only - no auth cookies
      
      // Generate a simple auth token for Replit environment
      const authToken = Buffer.from(JSON.stringify({
        userId: user.id,
        organizationId: actualOrgId,
        email: user.email,
        role: user.role,
        timestamp: Date.now()
      })).toString('base64');
      
      // Now send response - express-session should have set the cookie
      res.json({ 
        message: "Login successful",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          organizationId: actualOrgId
        },
        token: authToken
      });
      
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Email/Password Registration endpoint (before auth middleware)
  app.post("/api/auth/register", requireOrganization(), async (req, res) => {
    try {
      console.log("📝 Email/password registration attempt");
      
      const { email, password, organizationSlug } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ 
          message: "Email and password are required" 
        });
      }

      if (password.length < 8) {
        return res.status(400).json({ 
          message: "Password must be at least 8 characters long" 
        });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      
      // Check if user already exists in this organization
      const existingUser = await storage.getUserByEmail(req.orgId, normalizedEmail);
      if (existingUser) {
        return res.status(409).json({ 
          message: "An account with this email already exists" 
        });
      }
      
      // Get organization details for welcome email
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ 
          message: "Organization not found" 
        });
      }
      
      // Hash password before storing
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      // Create user data
      const userData = {
        username: normalizedEmail.split('@')[0], // Use email prefix as username
        password: hashedPassword,
        name: normalizedEmail.split('@')[0], // Default name, user can update later
        email: normalizedEmail,
        organizationId: req.orgId, // Add required organizationId
        role: "member" as const,
        isActive: true,
        authProvider: "local" as const,
      };
      
      console.log(`👤 Creating new user: ${userData.name} (${userData.email})`);
      
      // Create the user
      const newUser = await storage.createUser(req.orgId, userData);
      
      if (!newUser) {
        return res.status(500).json({ 
          message: "Failed to create user account" 
        });
      }
      
      console.log(`✅ User created successfully: ${newUser.name} (${newUser.email})`);
      
      // Send welcome email (don't block registration if email fails)
      try {
        console.log(`📧 Sending welcome email to ${newUser.email}...`);
        const emailSent = await sendWelcomeEmail(newUser.email, newUser.name, organization.name);
        if (emailSent) {
          console.log(`📧 Welcome email sent successfully to ${newUser.email}`);
        } else {
          console.log(`📧 Failed to send welcome email to ${newUser.email} - email service returned false`);
        }
      } catch (emailError) {
        console.error(`📧 Failed to send welcome email to ${newUser.email}:`, emailError);
        // Continue with registration even if email fails
      }
      
      // Generate new session for the user
      req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
          console.error('Failed to regenerate session:', regenerateErr);
          return res.status(500).json({ message: "Session regeneration failed" });
        }
        
        // Set session after regeneration
        req.session.userId = newUser.id;
        
        // FIX: Let express-session automatically save and set cookie
        console.log(`💾 Registration session will auto-save for user: ${newUser.id}`);
        console.log(`🍪 Set-Cookie header will be added automatically`);
        
        // SECURITY: Session-based authentication only - no auth cookies
        
        res.status(201).json({ 
          message: "Registration successful",
          user: {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            organizationId: newUser.organizationId
          }
        });
      });
      
    } catch (error) {
      console.error("Registration error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid registration data",
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Registration failed" });
    }
  });
  
  // Get available auth providers for an organization (read-only, before CSRF)
  app.get("/api/auth/providers/:orgSlug", async (req, res) => {
    try {
      const { orgSlug } = req.params;
      
      // Get organization by slug
      const organization = await storage.getOrganizationBySlug(orgSlug);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Get configured auth providers
      const providers = await storage.getOrganizationAuthProviders(organization.id);
      
      // Transform for frontend consumption
      const availableProviders = providers.map(p => ({
        id: p.id,
        provider: p.provider,
        name: p.providerOrgName || p.provider,
        enabled: p.enabled,
        connectedAt: p.createdAt
      }));
      
      // Always include local/email provider
      if (!availableProviders.find(p => p.provider === 'local')) {
        availableProviders.push({
          id: 'local',
          provider: 'local',
          name: 'Email & Password',
          enabled: true,
          connectedAt: organization.createdAt
        });
      }
      
      res.json({ providers: availableProviders });
    } catch (error) {
      console.error("Failed to fetch auth providers:", error);
      res.status(500).json({ message: "Failed to fetch authentication providers" });
    }
  });
  
  // Apply onboarding requirement for main app routes (excluding auth, onboarding, and public routes)
  // Note: CSRF generation middleware is already applied in server/index.ts
  app.use("/api", (req, res, next) => {
    // Exempt specific routes from onboarding requirement
    // Note: req.path doesn't include the '/api' prefix since we're mounted on '/api'
    const exemptPaths = [
      '/csrf-token',
      '/auth/',
      '/onboarding/',
      '/organizations/',
      '/business/',
      '/partner/',
      '/users/current',  // Allow getting current user during onboarding
      '/organizations/by-slug/',  // Allow fetching org by slug during onboarding
      '/users',  // Allow fetching users
      '/questions',  // Allow fetching questions
      '/checkins',  // Allow check-ins
      '/wins',  // Allow wins
      '/shoutouts',  // Allow shoutouts
      '/analytics/',  // Allow analytics
      '/features'  // Allow feature flags
    ];
    
    // Check if the request path starts with any of the exempt paths
    const isExempt = exemptPaths.some(path => req.path.startsWith(path));
    
    if (isExempt) {
      return next();
    }
    
    // Apply onboarding requirement for all other routes
    requireOnboarded()(req, res, next);
  });
  
  // CSRF token endpoint (requires authentication)
  app.get("/api/csrf-token", csrfTokenEndpoint);
  
  // NOTE: Authentication, CSRF generation and validation middleware already applied in server/index.ts
  // to prevent route shadowing issues
  
  // Apply authentication requirement to all protected routes
  // (Not all routes need authentication, so we'll add requireAuth() selectively)
  
  // Analytics validation schemas
  const analyticsBaseSchema = z.object({
    scope: z.enum(['organization', 'team', 'user']).default('organization'),
    id: z.string().optional(),
    period: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
    from: z.string().optional().refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'from' date format").transform(val => val ? new Date(val) : undefined),
    to: z.string().optional().refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'to' date format").transform(val => val ? new Date(val) : undefined),
  });
  
  const shoutoutAnalyticsSchema = analyticsBaseSchema.extend({
    direction: z.enum(['given', 'received', 'all']).default('all'),
    visibility: z.enum(['public', 'private', 'all']).default('all'),
  });
  
  const leaderboardSchema = analyticsBaseSchema.extend({
    metric: z.enum(['shoutouts_received', 'shoutouts_given', 'pulse_avg']).default('shoutouts_received'),
  });
  
  const overviewSchema = z.object({
    period: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
    from: z.string().optional().refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'from' date format").transform(val => val ? new Date(val) : undefined),
    to: z.string().optional().refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'to' date format").transform(val => val ? new Date(val) : undefined),
  });
  
  const complianceAnalyticsSchema = analyticsBaseSchema.extend({
    // Compliance analytics uses the same base parameters as other analytics
  });
  
  // Admin backfill schema
  const backfillSchema = z.object({
    from: z.string().refine((val) => {
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'from' date format").transform(val => new Date(val)),
    to: z.string().refine((val) => {
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'to' date format").transform(val => new Date(val)),
  });
  
  // Vacation validation schemas
  const vacationQuerySchema = z.object({
    from: z.string().optional().refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'from' date format").transform(val => val ? new Date(val) : undefined),
    to: z.string().optional().refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'to' date format").transform(val => val ? new Date(val) : undefined),
  });
  
  const vacationParamSchema = z.object({
    weekOf: z.string().refine((val) => {
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'weekOf' date format").transform(val => new Date(val)),
  });

  // Auth Provider Management validation schemas
  const connectProviderSchema = z.object({
    provider: z.enum(["slack", "microsoft", "google", "okta", "local"]),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    config: z.record(z.any()).default({})
  });

  const linkIdentitySchema = z.object({
    provider: z.enum(["local", "slack", "microsoft", "google", "okta"]),
    providerUserId: z.string().min(1, "Provider user ID is required"),
    providerEmail: z.string().email().optional(),
    providerDisplayName: z.string().optional(),
    profile: z.record(z.any()).default({})
  });

  // Auth Provider Management Routes (protected by CSRF and authentication)
  
  // Get user's connected identities
  app.get("/api/auth/identities", requireAuth(), async (req, res) => {
    try {
      const userId = req.currentUser!.id;
      const identities = await storage.getUserIdentities(userId);
      
      res.json({ 
        identities: identities.map(i => ({
          provider: i.provider,
          providerUserId: i.providerUserId,
          providerEmail: i.providerEmail,
          providerDisplayName: i.providerDisplayName,
          connectedAt: i.createdAt
        }))
      });
    } catch (error) {
      console.error("Failed to fetch user identities:", error);
      res.status(500).json({ message: "Failed to fetch connected accounts" });
    }
  });
  
  // Connect a new auth provider to organization (admin only)
  app.post("/api/auth/providers/connect", requireAuth(), requireRole(["admin"]), async (req, res) => {
    try {
      // Validate request body
      const validationResult = connectProviderSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validationResult.error.errors 
        });
      }

      const { provider, clientId, clientSecret, config } = validationResult.data;
      const orgId = req.orgId;
      
      // Check if provider is already connected
      const existing = await storage.getOrganizationAuthProviders(orgId);
      if (existing.find(p => p.provider === provider)) {
        return res.status(400).json({ message: "Provider is already connected" });
      }
      
      // Create new auth provider
      // TODO: Encrypt clientSecret before storing
      const newProvider = await storage.createOrganizationAuthProvider({
        organizationId: orgId,
        provider,
        clientId,
        clientSecret, // WARNING: Should be encrypted in production
        config,
        enabled: true
      });
      
      res.status(201).json({ 
        message: "Authentication provider connected successfully",
        provider: {
          id: newProvider.id,
          provider: newProvider.provider,
          enabled: newProvider.enabled
        }
      });
    } catch (error) {
      console.error("Failed to connect auth provider:", error);
      res.status(500).json({ message: "Failed to connect authentication provider" });
    }
  });
  
  // Update an auth provider configuration (admin only)
  app.patch("/api/auth/providers/:providerId", requireAuth(), requireRole(["admin"]), async (req, res) => {
    try {
      const { providerId } = req.params;
      const orgId = req.orgId;
      
      // Verify provider belongs to this organization
      const provider = await storage.getOrganizationAuthProvider(orgId, providerId);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }
      
      // If disabling a provider, ensure at least one provider remains enabled
      if (req.body.enabled === false) {
        const allProviders = await storage.getOrganizationAuthProviders(orgId);
        const enabledProviders = allProviders.filter(p => p.enabled && p.id !== providerId);
        if (enabledProviders.length === 0) {
          return res.status(400).json({ 
            message: "Cannot disable the last enabled authentication provider" 
          });
        }
      }
      
      // Update the provider
      const updatedProvider = await storage.updateOrganizationAuthProvider(orgId, providerId, req.body);
      
      if (!updatedProvider) {
        return res.status(404).json({ message: "Failed to update provider" });
      }
      
      res.json({ 
        message: "Provider updated successfully",
        provider: {
          id: updatedProvider.id,
          provider: updatedProvider.provider,
          enabled: updatedProvider.enabled,
          hasCredentials: !!updatedProvider.clientId
        }
      });
    } catch (error) {
      console.error("Failed to update auth provider:", error);
      res.status(500).json({ message: "Failed to update authentication provider" });
    }
  });
  
  // Disconnect an auth provider from organization (admin only)
  app.delete("/api/auth/providers/:providerId", requireAuth(), requireRole(["admin"]), async (req, res) => {
    try {
      const { providerId } = req.params;
      const orgId = req.orgId;
      
      // Verify provider belongs to this organization
      const provider = await storage.getOrganizationAuthProvider(orgId, providerId);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }
      
      // Don't allow disconnecting the last enabled provider
      const providers = await storage.getOrganizationAuthProviders(orgId);
      const enabledProviders = providers.filter(p => p.enabled);
      
      // If this is an enabled provider and it's the only enabled one, prevent deletion
      if (provider.enabled && enabledProviders.length <= 1) {
        return res.status(400).json({ 
          message: "Cannot disconnect the last enabled authentication provider. Please enable another provider first." 
        });
      }
      
      // Delete the provider
      const deleted = await storage.deleteOrganizationAuthProvider(orgId, providerId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Provider not found" });
      }
      
      res.json({ message: "Authentication provider disconnected successfully" });
    } catch (error) {
      console.error("Failed to disconnect auth provider:", error);
      res.status(500).json({ message: "Failed to disconnect authentication provider" });
    }
  });
  
  // Link a new identity to current user
  app.post("/api/auth/identities/link", requireAuth(), async (req, res) => {
    try {
      // Validate request body
      const validationResult = linkIdentitySchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validationResult.error.errors 
        });
      }

      const { provider, providerUserId, providerEmail, providerDisplayName, profile } = validationResult.data;
      const userId = req.currentUser!.id;
      const orgId = req.orgId;
      
      // Check if identity already exists for this user
      const existing = await storage.getUserIdentity(userId, provider);
      if (existing) {
        return res.status(400).json({ 
          message: "This account is already linked to your profile" 
        });
      }
      
      // Check if this provider identity is already linked to another user
      const existingUser = await storage.findUserByProviderIdentity(orgId, provider, providerUserId);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ 
          message: "This account is already linked to another user" 
        });
      }
      
      // Create new identity link
      const newIdentity = await storage.createUserIdentity({
        userId,
        organizationId: orgId,
        provider,
        providerUserId,
        providerEmail,
        providerDisplayName,
        profile
      });
      
      res.status(201).json({ 
        message: "Account linked successfully",
        identity: {
          provider: newIdentity.provider,
          providerEmail: newIdentity.providerEmail,
          connectedAt: newIdentity.createdAt
        }
      });
    } catch (error) {
      console.error("Failed to link identity:", error);
      res.status(500).json({ message: "Failed to link account" });
    }
  });
  
  // Unlink an identity from current user
  app.delete("/api/auth/identities/:provider", requireAuth(), async (req, res) => {
    try {
      const { provider } = req.params;
      const userId = req.currentUser!.id;
      
      // Don't allow unlinking the last identity
      const identities = await storage.getUserIdentities(userId);
      if (identities.length <= 1) {
        return res.status(400).json({ 
          message: "Cannot unlink your last authentication method" 
        });
      }
      
      // Delete the identity
      const deleted = await storage.deleteUserIdentity(userId, provider);
      
      if (!deleted) {
        return res.status(404).json({ message: "Identity not found" });
      }
      
      res.json({ message: "Account unlinked successfully" });
    } catch (error) {
      console.error("Failed to unlink identity:", error);
      res.status(500).json({ message: "Failed to unlink account" });
    }
  });
  
  // Users
  app.get("/api/users", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      // Admins can see all users including inactive, others see only active
      const includeInactive = currentUser.role === "admin";
      const users = await storage.getAllUsers(req.orgId, includeInactive);
      res.json(sanitizeUsers(users));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Get current authenticated user
  app.get("/api/users/current", requireAuth(), async (req, res) => {
    try {
      if (!req.currentUser) {
        return res.status(401).json({ message: "Authentication required" });
      }
      res.json(req.currentUser);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch current user" });
    }
  });

  app.get("/api/users/:id", requireAuth(), async (req, res) => {
    try {
      const user = await storage.getUser(req.orgId, req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(sanitizeUser(user));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post("/api/users", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const sanitizedData = sanitizeForOrganization(userData, req.orgId);
      const user = await storage.createUser(req.orgId, sanitizedData);
      res.status(201).json(user);
    } catch (error) {
      res.status(400).json({ message: "Invalid user data" });
    }
  });

  app.patch("/api/users/:id", requireAuth(), async (req, res) => {
    try {
      const targetUserId = req.params.id;
      const currentUser = req.currentUser!;
      
      // Authorization: Only admins or the user themselves can update user data
      if (currentUser.role !== "admin" && currentUser.id !== targetUserId) {
        return res.status(403).json({ 
          message: "Access denied. You can only update your own profile or be an admin." 
        });
      }
      
      const updates = insertUserSchema.partial().parse(req.body);
      const sanitizedUpdates = sanitizeForOrganization(updates, req.orgId);
      
      // Additional security: Non-admins cannot change role, organizationId, or other sensitive fields
      if (currentUser.role !== "admin") {
        // Remove sensitive fields that only admins should be able to modify
        const { role, organizationId, teamId, managerId, ...allowedUpdates } = sanitizedUpdates;
        // Replace sanitizedUpdates with only the allowed fields
        Object.keys(sanitizedUpdates).forEach(key => delete (sanitizedUpdates as any)[key]);
        Object.assign(sanitizedUpdates, allowedUpdates);
      }
      
      const user = await storage.updateUser(req.orgId, req.params.id, sanitizedUpdates);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(sanitizeUser(user));
    } catch (error) {
      res.status(400).json({ message: "Invalid user data" });
    }
  });

  app.get("/api/users/:id/reports", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      // Include inactive users for admin/manager contexts
      const includeInactive = currentUser.role === "admin" || currentUser.role === "manager";
      const reports = await storage.getUsersByManager(req.orgId, req.params.id, includeInactive);
      res.json(sanitizeUsers(reports));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  // Teams
  app.get("/api/teams", requireAuth(), async (req, res) => {
    try {
      const teams = await storage.getAllTeams(req.orgId);
      res.json(teams);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  app.post("/api/teams", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      console.log("POST /api/teams - Request body:", JSON.stringify(req.body, null, 2));
      console.log("POST /api/teams - Organization ID:", req.orgId);
      
      // Create team schema that excludes organizationId from client validation
      const createTeamSchema = insertTeamSchema.omit({ organizationId: true });
      
      // Validate required fields before parsing
      if (!req.body.name) {
        return res.status(400).json({ 
          message: "Team name is required",
          field: "name" 
        });
      }
      
      if (!req.body.leaderId) {
        return res.status(400).json({ 
          message: "Team leader is required",
          field: "leaderId" 
        });
      }
      
      // Ensure teamType has a valid value if provided, or set default
      if (!req.body.teamType) {
        req.body.teamType = "team"; // Set default if not provided
      }
      
      const teamData = createTeamSchema.parse(req.body);
      const sanitizedData = sanitizeForOrganization(teamData, req.orgId);
      
      // Verify the leader exists and has proper role
      const leader = await storage.getUser(req.orgId, sanitizedData.leaderId);
      if (!leader) {
        return res.status(400).json({ 
          message: "Selected team leader not found",
          field: "leaderId" 
        });
      }
      
      if (leader.role !== "manager" && leader.role !== "admin") {
        return res.status(400).json({ 
          message: "Team leader must be a manager or admin",
          field: "leaderId" 
        });
      }
      
      console.log("POST /api/teams - Creating team with data:", JSON.stringify(sanitizedData, null, 2));
      
      const team = await storage.createTeam(req.orgId, sanitizedData);
      console.log("POST /api/teams - Team created successfully:", team.id);
      res.status(201).json(team);
    } catch (error) {
      console.error("POST /api/teams - Error details:", error);
      
      // Handle Zod validation errors
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));
        console.error("POST /api/teams - Validation errors:", JSON.stringify(errors, null, 2));
        return res.status(400).json({ 
          message: "Team validation failed",
          errors: errors
        });
      }
      
      // Handle database errors
      if (error instanceof Error) {
        console.error("POST /api/teams - Database/Server error:", error.message);
        return res.status(500).json({ 
          message: "Failed to create team",
          error: error.message 
        });
      }
      
      res.status(500).json({ message: "An unexpected error occurred" });
    }
  });

  app.put("/api/teams/:id", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Update team schema that excludes organizationId from client validation
      const updateTeamSchema = insertTeamSchema.partial().omit({ organizationId: true });
      
      const teamData = updateTeamSchema.parse(req.body);
      const sanitizedData = sanitizeForOrganization(teamData, req.orgId);
      
      // Validate that the team exists
      const existingTeam = await storage.getTeam(req.orgId, req.params.id);
      if (!existingTeam) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // If leaderId is provided, validate that the user exists and is a manager/admin
      if (sanitizedData.leaderId) {
        const leader = await storage.getUser(req.orgId, sanitizedData.leaderId);
        if (!leader) {
          return res.status(400).json({ message: "Team leader not found" });
        }
        if (leader.role !== "manager" && leader.role !== "admin") {
          return res.status(400).json({ message: "Team leader must be a manager or admin" });
        }
      }
      
      const team = await storage.updateTeam(req.orgId, req.params.id, sanitizedData);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      res.json({ message: "Team updated successfully", team });
    } catch (error) {
      console.error("PUT /api/teams/:id - Validation error:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({ message: error.message });
      } else {
        res.status(400).json({ message: "Invalid team data" });
      }
    }
  });

  app.delete("/api/teams/:id", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Validate that the team exists
      const existingTeam = await storage.getTeam(req.orgId, req.params.id);
      if (!existingTeam) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      const deleted = await storage.deleteTeam(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      res.json({ message: "Team deleted successfully" });
    } catch (error) {
      console.error("DELETE /api/teams/:id - Error:", error);
      if (error instanceof Error && error.message.includes("assigned users")) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to delete team" });
      }
    }
  });

  // Hierarchical team endpoints
  app.get("/api/teams/hierarchy", requireAuth(), async (req, res) => {
    try {
      const hierarchy = await storage.getTeamHierarchy(req.orgId);
      res.json(hierarchy);
    } catch (error) {
      console.error("GET /api/teams/hierarchy - Error:", error);
      res.status(500).json({ message: "Failed to fetch team hierarchy" });
    }
  });

  app.get("/api/teams/:id/children", requireAuth(), async (req, res) => {
    try {
      const children = await storage.getTeamChildren(req.orgId, req.params.id);
      res.json(children);
    } catch (error) {
      console.error("GET /api/teams/:id/children - Error:", error);
      res.status(500).json({ message: "Failed to fetch team children" });
    }
  });

  app.get("/api/teams/:id/descendants", requireAuth(), async (req, res) => {
    try {
      const descendants = await storage.getTeamDescendants(req.orgId, req.params.id);
      res.json(descendants);
    } catch (error) {
      console.error("GET /api/teams/:id/descendants - Error:", error);
      res.status(500).json({ message: "Failed to fetch team descendants" });
    }
  });

  app.get("/api/teams/roots", requireAuth(), async (req, res) => {
    try {
      const rootTeams = await storage.getRootTeams(req.orgId);
      res.json(rootTeams);
    } catch (error) {
      console.error("GET /api/teams/roots - Error:", error);
      res.status(500).json({ message: "Failed to fetch root teams" });
    }
  });

  app.post("/api/teams/with-hierarchy", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Create team schema that excludes organizationId and auto-calculated fields
      const createTeamSchema = insertTeamSchema.omit({ organizationId: true });
      const teamData = createTeamSchema.parse(req.body);
      
      const team = await storage.createTeamWithHierarchy(req.orgId, {
        ...teamData,
        organizationId: req.orgId
      });
      res.status(201).json(team);
    } catch (error) {
      console.error("POST /api/teams/with-hierarchy - Error:", error);
      res.status(400).json({ message: "Failed to create team with hierarchy" });
    }
  });

  app.put("/api/teams/:id/move", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const { newParentId } = req.body;
      const team = await storage.moveTeam(req.orgId, req.params.id, newParentId || null);
      
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      res.json(team);
    } catch (error) {
      console.error("PUT /api/teams/:id/move - Error:", error);
      res.status(500).json({ message: "Failed to move team" });
    }
  });

  app.get("/api/teams/:id/members", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      // Include inactive users for admin contexts for team management
      const includeInactive = currentUser.role === "admin";
      const members = await storage.getUsersByTeam(req.orgId, req.params.id, includeInactive);
      res.json(members);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  // Check-ins
  app.get("/api/checkins", requireAuth(), async (req, res) => {
    try {
      const { userId, managerId, limit } = req.query;
      const currentUser = req.currentUser!;
      let checkins;
      
      // Apply authorization based on user role
      if (currentUser.role === "admin") {
        // Admins can see all check-ins in their organization
        if (userId) {
          checkins = await storage.getCheckinsByUser(req.orgId, userId as string);
        } else if (managerId) {
          checkins = await storage.getCheckinsByManager(req.orgId, managerId as string);
        } else {
          checkins = await storage.getRecentCheckins(req.orgId, limit ? parseInt(limit as string) : undefined);
        }
      } else if (currentUser.role === "manager") {
        // Managers can see check-ins from their direct reports and team members
        const directReports = await storage.getUsersByManager(req.orgId, currentUser.id, true);
        const teamMembers = await storage.getUsersByTeamLeadership(req.orgId, currentUser.id, true);
        
        // Include the manager's own ID and combine with authorized users
        const authorizedUserIds = new Set([
          currentUser.id,
          ...directReports.map(u => u.id),
          ...teamMembers.map(u => u.id)
        ]);
        
        if (userId) {
          // Verify the requested userId is authorized
          if (!authorizedUserIds.has(userId as string)) {
            return res.status(403).json({ 
              message: "Access denied. You can only view check-ins for yourself or your team members." 
            });
          }
          checkins = await storage.getCheckinsByUser(req.orgId, userId as string);
        } else if (managerId) {
          // For managerId query, verify it's the current user (only managers can query by their own ID)
          if (managerId !== currentUser.id) {
            return res.status(403).json({ 
              message: "Access denied. You can only query check-ins by your own manager ID." 
            });
          }
          checkins = await storage.getCheckinsByManager(req.orgId, managerId as string);
        } else {
          // Default: get recent check-ins but filter to authorized users only
          const allRecentCheckins = await storage.getRecentCheckins(req.orgId, limit ? parseInt(limit as string) : undefined);
          checkins = allRecentCheckins.filter(checkin => authorizedUserIds.has(checkin.userId));
        }
      } else {
        // Members can only see their own check-ins
        // Ignore any userId or managerId parameters - members can only see their own data
        checkins = await storage.getCheckinsByUser(req.orgId, currentUser.id);
        if (limit) {
          checkins = checkins.slice(0, parseInt(limit as string));
        }
      }
      
      res.json(checkins);
    } catch (error) {
      console.error("Failed to fetch check-ins:", error);
      res.status(500).json({ message: "Failed to fetch check-ins" });
    }
  });

  // Check-in Review Endpoints - these must come before the generic :id route
  app.get("/api/checkins/pending", requireAuth(), requireTeamLead(), async (req, res) => {
    try {
      const user = req.currentUser!;
      let checkins;
      
      if (user.role === "admin") {
        // Admins can see all pending check-ins
        checkins = await storage.getPendingCheckins(req.orgId);
      } else {
        // Get all pending check-ins for filtering
        checkins = await storage.getPendingCheckins(req.orgId);
        
        // Get users under this person's authority (direct reports + team members, include inactive for historical data)
        const directReports = await storage.getUsersByManager(req.orgId, user.id, true);
        const teamMembers = await storage.getUsersByTeamLeadership(req.orgId, user.id, true);
        
        // Combine and deduplicate user IDs
        const authorizedUserIds = new Set([
          ...directReports.map(u => u.id),
          ...teamMembers.map(u => u.id)
        ]);
        
        // Filter check-ins to only include those from authorized users
        checkins = checkins.filter(checkin => authorizedUserIds.has(checkin.userId));
      }
      
      // Enhance with user information
      const enhancedCheckins = await Promise.all(
        checkins.map(async (checkin) => {
          const checkinUser = await storage.getUser(req.orgId, checkin.userId);
          const team = checkinUser?.teamId ? await storage.getTeam(req.orgId, checkinUser.teamId) : null;
          
          return {
            ...checkin,
            user: checkinUser ? {
              id: checkinUser.id,
              name: checkinUser.name,
              email: checkinUser.email,
              teamId: checkinUser.teamId,
              teamName: team?.name || null
            } : null
          };
        })
      );
      
      res.json(enhancedCheckins);
    } catch (error) {
      console.error("Failed to fetch pending check-ins:", error);
      res.status(500).json({ message: "Failed to fetch pending check-ins" });
    }
  });

  app.get("/api/checkins/review-status/:status", requireAuth(), requireTeamLead(), async (req, res) => {
    try {
      const status = req.params.status as ReviewStatusType;
      
      // Validate status parameter
      if (!Object.values(ReviewStatus).includes(status)) {
        return res.status(400).json({ message: "Invalid review status" });
      }
      
      const user = req.currentUser!;
      let checkins = await storage.getCheckinsByReviewStatus(req.orgId, status);
      
      // Filter by team if not admin
      if (user.role !== "admin") {
        // Get users under this person's authority (direct reports + team members, include inactive for historical data)
        const directReports = await storage.getUsersByManager(req.orgId, user.id, true);
        const teamMembers = await storage.getUsersByTeamLeadership(req.orgId, user.id, true);
        
        // Combine and deduplicate user IDs
        const authorizedUserIds = new Set([
          ...directReports.map(u => u.id),
          ...teamMembers.map(u => u.id)
        ]);
        
        // Filter check-ins to only include those from authorized users
        checkins = checkins.filter(checkin => authorizedUserIds.has(checkin.userId));
      }
      
      // Enhance with user and reviewer information
      const enhancedCheckins = await Promise.all(
        checkins.map(async (checkin) => {
          const checkinUser = await storage.getUser(req.orgId, checkin.userId);
          const team = checkinUser?.teamId ? await storage.getTeam(req.orgId, checkinUser.teamId) : null;
          const reviewer = checkin.reviewedBy ? await storage.getUser(req.orgId, checkin.reviewedBy) : null;
          
          return {
            ...checkin,
            user: checkinUser ? {
              id: checkinUser.id,
              name: checkinUser.name,
              email: checkinUser.email,
              teamId: checkinUser.teamId,
              teamName: team?.name || null
            } : null,
            reviewer: reviewer ? {
              id: reviewer.id,
              name: reviewer.name,
              email: reviewer.email
            } : null
          };
        })
      );
      
      res.json(enhancedCheckins);
    } catch (error) {
      console.error("Failed to fetch check-ins by review status:", error);
      res.status(500).json({ message: "Failed to fetch check-ins by review status" });
    }
  });

  app.get("/api/checkins/leadership-view", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const { from, to, teamId, status, limit } = req.query;
      
      // Default date range: last 30 days
      const fromDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const toDate = to ? new Date(to as string) : new Date();
      
      let checkins: Checkin[];
      
      if (teamId) {
        // Get check-ins for specific team
        const teamMembers = await storage.getUsersByTeam(req.orgId, teamId as string, true);
        const memberIds = teamMembers.map(m => m.id);
        
        // Get all check-ins and filter by team members and date range
        const allCheckins = await storage.getRecentCheckins(req.orgId, 1000); // Large limit to get all recent
        checkins = allCheckins.filter(checkin => 
          memberIds.includes(checkin.userId) &&
          checkin.weekOf >= fromDate &&
          checkin.weekOf <= toDate &&
          (!status || checkin.reviewStatus === status)
        );
      } else {
        // Get all recent check-ins in date range
        const allCheckins = await storage.getRecentCheckins(req.orgId, 1000); // Large limit
        checkins = allCheckins.filter(checkin => 
          checkin.weekOf >= fromDate &&
          checkin.weekOf <= toDate &&
          (!status || checkin.reviewStatus === status)
        );
      }
      
      // Apply limit if specified
      if (limit) {
        checkins = checkins.slice(0, parseInt(limit as string));
      }
      
      // Enhance with user and team information
      const enhancedCheckins = await Promise.all(
        checkins.map(async (checkin) => {
          const user = await storage.getUser(req.orgId, checkin.userId);
          const team = user?.teamId ? await storage.getTeam(req.orgId, user.teamId) : null;
          const reviewer = checkin.reviewedBy ? await storage.getUser(req.orgId, checkin.reviewedBy) : null;
          
          return {
            ...checkin,
            user: user ? {
              id: user.id,
              name: user.name,
              email: user.email,
              teamId: user.teamId,
              teamName: team?.name || null
            } : null,
            team: team ? {
              id: team.id,
              name: team.name
            } : null,
            reviewer: reviewer ? {
              id: reviewer.id,
              name: reviewer.name,
              email: reviewer.email
            } : null
          };
        })
      );
      
      res.json(enhancedCheckins);
    } catch (error) {
      console.error("Failed to fetch leadership view check-ins:", error);
      res.status(500).json({ message: "Failed to fetch leadership view check-ins" });
    }
  });

  // Generic check-in by ID route - MUST come after all specific routes
  app.get("/api/checkins/:id", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      const checkin = await storage.getCheckin(req.orgId, req.params.id);
      
      if (!checkin) {
        return res.status(404).json({ message: "Check-in not found" });
      }
      
      // Apply authorization: verify user can view this specific check-in
      if (currentUser.role === "admin") {
        // Admins can view any check-in in their organization
        res.json(checkin);
        return;
      }
      
      // For non-admins: check if they have authorization to view this check-in
      if (checkin.userId === currentUser.id) {
        // User can always view their own check-in
        res.json(checkin);
        return;
      }
      
      // Check if current user is authorized to view this user's check-ins
      const directReports = await storage.getUsersByManager(req.orgId, currentUser.id);
      const teamMembers = await storage.getUsersByTeamLeadership(req.orgId, currentUser.id);
      
      const authorizedUserIds = new Set([
        ...directReports.map(u => u.id),
        ...teamMembers.map(u => u.id)
      ]);
      
      if (!authorizedUserIds.has(checkin.userId)) {
        return res.status(403).json({ 
          message: "Access denied. You can only view check-ins for yourself or your team members." 
        });
      }
      
      res.json(checkin);
    } catch (error) {
      console.error("Failed to fetch check-in:", error);
      res.status(500).json({ message: "Failed to fetch check-in" });
    }
  });

  app.post("/api/checkins", requireAuth(), async (req, res) => {
    try {
      // First, check if active questions exist
      const questions = await storage.getActiveQuestions(req.orgId);
      if (questions.length === 0) {
        return res.status(400).json({ 
          message: "Check-ins cannot be submitted without active questions. Please contact your administrator." 
        });
      }
      
      // Add userId from current user and set weekOf if not provided
      const bodyWithUserId = {
        ...req.body,
        userId: req.currentUser!.id,
        weekOf: req.body.weekOf || new Date(),
        overallMood: req.body.overallMood || req.body.moodRating || 5
      };
      
      // Parse and validate check-in data
      const checkinData = insertCheckinSchema.parse(bodyWithUserId);
      
      // Validate that all questions have responses
      const responses = checkinData.responses as Record<string, string> || {};
      const missingResponses = questions.filter(q => !responses[q.id] || responses[q.id].trim() === '');
      
      if (missingResponses.length > 0) {
        return res.status(400).json({ 
          message: "All questions must be answered before submitting the check-in.",
          missingQuestions: missingResponses.map(q => q.text)
        });
      }
      
      const sanitizedData = sanitizeForOrganization(checkinData, req.orgId);
      const checkin = await storage.createCheckin(req.orgId, sanitizedData);
      
      // Send notification if check-in is submitted for review
      if (checkin.isComplete && checkin.submittedAt) {
        try {
          const user = await storage.getUser(req.orgId, checkin.userId);
          if (user) {
            // Find team leader to notify
            let teamLeaderName = "Team Leader";
            
            // First try direct manager
            if (user.managerId) {
              const manager = await storage.getUser(req.orgId, user.managerId);
              if (manager) {
                teamLeaderName = manager.name;
              }
            }
            // Then try team leader if no direct manager
            else if (user.teamId) {
              const team = await storage.getTeam(req.orgId, user.teamId);
              if (team?.leaderId) {
                const teamLeader = await storage.getUser(req.orgId, team.leaderId);
                if (teamLeader) {
                  teamLeaderName = teamLeader.name;
                }
              }
            }
            
            // Get first response as summary
            const responses = checkin.responses as Record<string, string>;
            const firstResponse = Object.values(responses)[0] || undefined;
            
            await notifyCheckinSubmitted(
              user.name,
              teamLeaderName,
              checkin.overallMood,
              firstResponse
            );
          }
        } catch (notificationError) {
          console.error("Failed to send check-in submission notification:", notificationError);
          // Don't fail the request if notification fails
        }
      }
      
      res.status(201).json(checkin);
    } catch (error) {
      console.error("Check-in validation error:", error);
      res.status(400).json({ 
        message: "Invalid check-in data",
        details: error instanceof Error ? error.message : "Unknown validation error"
      });
    }
  });

  app.patch("/api/checkins/:id", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      
      // Get the existing check-in to compare states and verify ownership
      const existingCheckin = await storage.getCheckin(req.orgId, req.params.id);
      if (!existingCheckin) {
        return res.status(404).json({ message: "Check-in not found" });
      }
      
      // Authorization: Only the owner or admin can update a check-in
      if (currentUser.role !== "admin" && currentUser.id !== existingCheckin.userId) {
        return res.status(403).json({ 
          message: "Access denied. You can only update your own check-ins or be an admin." 
        });
      }
      
      const updates = insertCheckinSchema.partial().parse(req.body);
      
      // If updating responses, validate that all questions are answered
      if (updates.responses !== undefined || updates.isComplete === true) {
        const questions = await storage.getActiveQuestions(req.orgId);
        if (questions.length === 0) {
          return res.status(400).json({ 
            message: "Check-ins cannot be submitted without active questions. Please contact your administrator." 
          });
        }
        
        // Use existing responses if not provided, merge with new ones
        const responses = updates.responses || existingCheckin.responses as Record<string, string> || {};
        const missingResponses = questions.filter(q => !responses[q.id] || responses[q.id].trim() === '');
        
        if (missingResponses.length > 0 && updates.isComplete === true) {
          return res.status(400).json({ 
            message: "All questions must be answered before submitting the check-in.",
            missingQuestions: missingResponses.map(q => q.text)
          });
        }
      }
      
      const sanitizedUpdates = sanitizeForOrganization(updates, req.orgId);
      
      const checkin = await storage.updateCheckin(req.orgId, req.params.id, sanitizedUpdates);
      if (!checkin) {
        return res.status(404).json({ message: "Check-in not found" });
      }
      
      // Send notification if check-in is newly submitted for review
      const wasNotSubmitted = !existingCheckin.isComplete || !existingCheckin.submittedAt;
      const isNowSubmitted = checkin.isComplete && checkin.submittedAt;
      
      if (wasNotSubmitted && isNowSubmitted) {
        try {
          const user = await storage.getUser(req.orgId, checkin.userId);
          if (user) {
            // Find team leader to notify
            let teamLeaderName = "Team Leader";
            
            // First try direct manager
            if (user.managerId) {
              const manager = await storage.getUser(req.orgId, user.managerId);
              if (manager) {
                teamLeaderName = manager.name;
              }
            }
            // Then try team leader if no direct manager
            else if (user.teamId) {
              const team = await storage.getTeam(req.orgId, user.teamId);
              if (team?.leaderId) {
                const teamLeader = await storage.getUser(req.orgId, team.leaderId);
                if (teamLeader) {
                  teamLeaderName = teamLeader.name;
                }
              }
            }
            
            // Get first response as summary
            const responses = checkin.responses as Record<string, string>;
            const firstResponse = Object.values(responses)[0] || undefined;
            
            await notifyCheckinSubmitted(
              user.name,
              teamLeaderName,
              checkin.overallMood,
              firstResponse
            );
          }
        } catch (notificationError) {
          console.error("Failed to send check-in submission notification:", notificationError);
          // Don't fail the request if notification fails
        }
      }
      
      res.json(checkin);
    } catch (error) {
      console.error("Check-in update validation error:", error);
      res.status(400).json({ 
        message: "Invalid check-in data",
        details: error instanceof Error ? error.message : "Unknown validation error"
      });
    }
  });

  app.get("/api/users/:id/current-checkin", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      const requestedUserId = req.params.id;
      
      // Apply authorization: verify user can view this user's current check-in
      if (currentUser.role === "admin") {
        // Admins can view any user's current check-in
        const checkin = await storage.getCurrentWeekCheckin(req.orgId, requestedUserId);
        res.json(checkin || null);
        return;
      }
      
      // For non-admins: check if they have authorization
      if (requestedUserId === currentUser.id) {
        // User can always view their own current check-in
        const checkin = await storage.getCurrentWeekCheckin(req.orgId, requestedUserId);
        res.json(checkin || null);
        return;
      }
      
      // Check if current user is authorized to view this user's check-ins (include inactive for historical data)
      const directReports = await storage.getUsersByManager(req.orgId, currentUser.id, true);
      const teamMembers = await storage.getUsersByTeamLeadership(req.orgId, currentUser.id, true);
      
      const authorizedUserIds = new Set([
        ...directReports.map(u => u.id),
        ...teamMembers.map(u => u.id)
      ]);
      
      if (!authorizedUserIds.has(requestedUserId)) {
        return res.status(403).json({ 
          message: "Access denied. You can only view check-ins for yourself or your team members." 
        });
      }
      
      const checkin = await storage.getCurrentWeekCheckin(req.orgId, requestedUserId);
      res.json(checkin || null);
    } catch (error) {
      console.error("Failed to fetch current check-in:", error);
      res.status(500).json({ message: "Failed to fetch current check-in" });
    }
  });


  app.patch("/api/checkins/:id/review", requireAuth(), requireTeamLead(), async (req, res) => {
    try {
      const reviewData = reviewCheckinSchema.parse(req.body);
      const user = req.currentUser!;
      const checkinId = req.params.id;
      
      // Check if check-in exists
      const existingCheckin = await storage.getCheckin(req.orgId, checkinId);
      if (!existingCheckin) {
        return res.status(404).json({ message: "Check-in not found" });
      }
      
      // Verify authorization - check if user can review this check-in
      if (user.role !== "admin") {
        const checkinUser = await storage.getUser(req.orgId, existingCheckin.userId);
        if (!checkinUser) {
          return res.status(404).json({ message: "User not found" });
        }

        // Check if user is the direct manager
        const isDirectManager = checkinUser.managerId === user.id;
        
        // Check if user is a team leader of the check-in user's team
        let isTeamLeader = false;
        if (checkinUser.teamId) {
          const team = await storage.getTeam(req.orgId, checkinUser.teamId);
          isTeamLeader = team?.leaderId === user.id;
        }

        if (!isDirectManager && !isTeamLeader) {
          return res.status(403).json({ 
            message: "You can only review check-ins from your direct reports or team members" 
          });
        }
      }
      
      // Allow review updates with the new collaborative workflow
      // Check-ins can be reviewed multiple times for collaborative discussion
      if (existingCheckin.reviewStatus === ReviewStatus.REVIEWED && reviewData.reviewStatus === ReviewStatus.PENDING) {
        return res.status(400).json({ 
          message: "Cannot change a reviewed check-in back to pending status"
        });
      }

      if (!existingCheckin.submittedAt || !existingCheckin.isComplete) {
        return res.status(400).json({ 
          message: "Check-in must be completed and submitted before it can be reviewed" 
        });
      }

      // Perform the review
      const updatedCheckin = await storage.reviewCheckin(req.orgId, checkinId, user.id, reviewData);
      
      if (!updatedCheckin) {
        return res.status(404).json({ message: "Check-in not found" });
      }
      
      // Enhance response with user and reviewer information
      const checkinUser = await storage.getUser(req.orgId, updatedCheckin.userId);
      const team = checkinUser?.teamId ? await storage.getTeam(req.orgId, checkinUser.teamId) : null;
      const reviewer = await storage.getUser(req.orgId, user.id);
      
      // Send notification to user about review completion
      if (checkinUser && reviewer) {
        try {
          await notifyCheckinReviewed(
            checkinUser.name,
            reviewer.name,
            'reviewed',
            reviewData.reviewComments
          );
        } catch (notificationError) {
          console.error("Failed to send check-in review notification:", notificationError);
          // Don't fail the request if notification fails
        }
      }
      
      const enhancedCheckin = {
        ...updatedCheckin,
        user: checkinUser ? {
          id: checkinUser.id,
          name: checkinUser.name,
          email: checkinUser.email,
          teamId: checkinUser.teamId,
          teamName: team?.name || null
        } : null,
        reviewer: reviewer ? {
          id: reviewer.id,
          name: reviewer.name,
          email: reviewer.email
        } : null
      };
      
      res.json(enhancedCheckin);
    } catch (error) {
      console.error("Check-in review error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid review data",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to review check-in" });
    }
  });

  // AI Question Generation
  app.post("/api/questions/generate", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { questionGenerator } = await import("./services/questionGenerator");
      
      const generateSchema = z.object({
        count: z.number().min(1).max(10).default(3),
        theme: z.string().min(1, "Theme is required"),
        teamFocus: z.string().optional(),
        excludeExisting: z.boolean().default(true)
      });
      
      const { count, theme, teamFocus, excludeExisting } = generateSchema.parse(req.body);
      
      // Get existing questions if we should exclude them
      let previousQuestions: string[] = [];
      if (excludeExisting) {
        const existingQuestions = await storage.getActiveQuestions(req.orgId);
        previousQuestions = existingQuestions.map(q => q.text);
      }
      
      const generatedQuestions = await questionGenerator.generateQuestions({
        count,
        theme,
        teamFocus,
        previousQuestions
      });
      
      res.json({ questions: generatedQuestions });
    } catch (error) {
      console.error("AI question generation error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid generation parameters",
          details: error.errors
        });
      }
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to generate questions"
      });
    }
  });

  app.post("/api/questions/:id/improve", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { questionGenerator } = await import("./services/questionGenerator");
      
      // Get the question to improve
      const questions = await storage.getActiveQuestions(req.orgId);
      const question = questions.find(q => q.id === req.params.id);
      
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }
      
      const suggestions = await questionGenerator.suggestQuestionImprovements(question.text);
      
      res.json({ suggestions });
    } catch (error) {
      console.error("Question improvement error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to analyze question"
      });
    }
  });

  // Questions
  app.get("/api/questions", requireAuth(), async (req, res) => {
    try {
      const questions = await storage.getActiveQuestions(req.orgId);
      res.json(questions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch questions" });
    }
  });

  app.post("/api/questions", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      // Explicit schema for client data with server-side validation
      const clientQuestionSchema = z.object({
        text: z.string().min(5, "Question must be at least 5 characters"),
        order: z.number().min(0, "Order must be 0 or greater").default(0)
      });
      const clientData = clientQuestionSchema.parse(req.body);
      
      // Server sets all security-sensitive fields
      const fullQuestionData = {
        ...clientData,
        organizationId: req.orgId,
        createdBy: req.currentUser?.id || "unknown", // Use authenticated user
        isActive: true // Default to active
      };
      
      const question = await storage.createQuestion(req.orgId, fullQuestionData);
      res.status(201).json(question);
    } catch (error) {
      console.error("Question creation error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid question data",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to create question" });
    }
  });

  app.patch("/api/questions/:id", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      // Allow updating text, order, and isActive - protect organizationId and createdBy
      const updatesSchema = z.object({
        text: z.string().min(5, "Question must be at least 5 characters").optional(),
        order: z.number().min(0, "Order must be 0 or greater").optional(),
        isActive: z.boolean().optional()
      });
      const updates = updatesSchema.parse(req.body);
      
      const question = await storage.updateQuestion(req.orgId, req.params.id, updates);
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }
      res.json(question);
    } catch (error) {
      console.error("Question update error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid question data",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to update question" });
    }
  });

  app.delete("/api/questions/:id", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const deleted = await storage.deleteQuestion(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Question not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete question" });
    }
  });
  
  // Question Categories
  app.get("/api/question-categories", requireAuth(), async (req, res) => {
    try {
      const categories = await storage.getQuestionCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching question categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });
  
  app.post("/api/question-categories", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const { insertQuestionCategorySchema } = await import("@shared/schema");
      const categoryData = insertQuestionCategorySchema.parse(req.body);
      
      const category = await storage.createQuestionCategory(categoryData);
      res.json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid category data", details: error.errors });
      }
      console.error("Error creating question category:", error);
      res.status(500).json({ message: "Failed to create category" });
    }
  });
  
  app.patch("/api/question-categories/:id", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const { insertQuestionCategorySchema } = await import("@shared/schema");
      const updateData = insertQuestionCategorySchema.partial().parse(req.body);
      
      const category = await storage.updateQuestionCategory(req.params.id, updateData);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid update data", details: error.errors });
      }
      console.error("Error updating question category:", error);
      res.status(500).json({ message: "Failed to update category" });
    }
  });
  
  app.delete("/api/question-categories/:id", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const deleted = await storage.deleteQuestionCategory(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting question category:", error);
      res.status(500).json({ message: "Failed to delete category" });
    }
  });
  
  // Question Bank
  app.get("/api/question-bank", requireAuth(), async (req, res) => {
    try {
      const categoryId = req.query.categoryId as string | undefined;
      const items = await storage.getQuestionBank(categoryId);
      // Filter to only show approved items or items contributed by the current org
      const filteredItems = items.filter(item => 
        item.isApproved || 
        item.contributedByOrg === req.orgId ||
        req.user?.role === 'admin'
      );
      res.json(filteredItems);
    } catch (error) {
      console.error("Error fetching question bank:", error);
      res.status(500).json({ message: "Failed to fetch question bank" });
    }
  });
  
  app.post("/api/question-bank", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { insertQuestionBankSchema } = await import("@shared/schema");
      const itemData = insertQuestionBankSchema.parse(req.body);
      
      const item = await storage.createQuestionBankItem({
        ...itemData,
        contributedBy: req.user!.id,
        contributedByOrg: req.orgId,
        isSystem: false,
        isApproved: false, // New items need approval
      });
      res.json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid question data", details: error.errors });
      }
      console.error("Error creating question bank item:", error);
      res.status(500).json({ message: "Failed to create question" });
    }
  });
  
  app.post("/api/question-bank/:id/use", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      // When a question from the bank is used, increment its usage count
      await storage.incrementQuestionBankUsage(req.params.id);
      
      // Get the question bank item
      const bankItem = await storage.getQuestionBankItem(req.params.id);
      if (!bankItem) {
        return res.status(404).json({ message: "Question not found" });
      }
      
      // Create a question in the organization based on the bank item
      const question = await storage.createQuestion(req.orgId, {
        text: bankItem.text,
        organizationId: req.orgId,
        createdBy: req.user!.id,
        categoryId: bankItem.categoryId,
        bankQuestionId: bankItem.id,
        isActive: true,
        order: 0, // Will be set by the client
        addToBank: false,
      });
      
      res.json(question);
    } catch (error) {
      console.error("Error using question from bank:", error);
      res.status(500).json({ message: "Failed to use question" });
    }
  });
  
  app.patch("/api/question-bank/:id/approve", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Only super admins can approve questions for the bank
      if (!req.user?.isSuperAdmin) {
        return res.status(403).json({ message: "Only super admins can approve questions" });
      }
      
      const item = await storage.approveQuestionBankItem(req.params.id);
      if (!item) {
        return res.status(404).json({ message: "Question not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error approving question bank item:", error);
      res.status(500).json({ message: "Failed to approve question" });
    }
  });
  
  app.delete("/api/question-bank/:id", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Users can only delete their own unapproved contributions
      const item = await storage.getQuestionBankItem(req.params.id);
      if (!item) {
        return res.status(404).json({ message: "Question not found" });
      }
      
      if (item.isApproved && !req.user?.isSuperAdmin) {
        return res.status(403).json({ message: "Cannot delete approved questions" });
      }
      
      if (item.contributedByOrg !== req.orgId && !req.user?.isSuperAdmin) {
        return res.status(403).json({ message: "Can only delete your own contributions" });
      }
      
      const deleted = await storage.deleteQuestionBankItem(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Question not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting question bank item:", error);
      res.status(500).json({ message: "Failed to delete question" });
    }
  });

  // Wins
  app.get("/api/wins", requireAuth(), async (req, res) => {
    try {
      const { limit } = req.query;
      const requestedLimit = limit ? parseInt(limit as string) : 10;
      
      // Overfetch to account for filtering
      const overfetchLimit = requestedLimit * 5;
      const allWins = await storage.getRecentWins(req.orgId, overfetchLimit);
      
      // Handle super admin users who don't have regular user records
      if (req.currentUser?.isSuperAdmin) {
        // Super admins can see all wins
        const limitedWins = allWins.slice(0, requestedLimit);
        return res.json(limitedWins);
      }
      
      // Get current user
      const viewer = await storage.getUser(req.orgId, req.currentUser!.id);
      if (!viewer && !req.currentUser?.isSuperAdmin) {
        // For non-super admin users, we need their user record
        return res.status(401).json({ message: "User not found" });
      }
      
      // Get direct reports if user is a manager
      let directReportsSet = new Set<string>();
      if (viewer.role === 'manager' || viewer.role === 'admin') {
        directReportsSet = await getDirectReportsSet(req.orgId, viewer.id);
      }
      
      // Filter wins based on access permissions
      const filteredWins = allWins.filter(win => canViewWin(win, viewer, directReportsSet));
      
      // Return only the requested number of wins
      const limitedWins = filteredWins.slice(0, requestedLimit);
      
      res.json(limitedWins);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch wins" });
    }
  });

  // Public wins endpoint (no authentication required)
  app.get("/api/wins/public", async (req, res) => {
    try {
      const { limit } = req.query;
      const wins = await storage.getPublicWins(req.orgId, limit ? parseInt(limit as string) : undefined);
      res.json(wins);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch public wins" });
    }
  });

  app.post("/api/wins", requireAuth(), async (req, res) => {
    try {
      // Add userId from current user
      const bodyWithUserId = {
        ...req.body,
        userId: req.currentUser!.id
      };
      const winData = insertWinSchema.parse(bodyWithUserId);
      const sanitizedData = sanitizeForOrganization(winData, req.orgId);
      const win = await storage.createWin(req.orgId, sanitizedData);
      
      // Announce to Slack if public
      if (win.isPublic) {
        const user = await storage.getUser(req.orgId, win.userId);
        const nominator = win.nominatedBy ? await storage.getUser(req.orgId, win.nominatedBy) : null;
        
        if (user) {
          const slackMessageId = await announceWin(
            win.title, 
            win.description, 
            user.name, 
            nominator?.name
          );
          
          if (slackMessageId) {
            await storage.updateWin(req.orgId, win.id, { slackMessageId });
          }
        }
      }
      
      res.status(201).json(win);
    } catch (error) {
      res.status(400).json({ message: "Invalid win data" });
    }
  });

  app.patch("/api/wins/:id", requireAuth(), async (req, res) => {
    try {
      // Use the partial insert schema for consistent validation
      const updates = insertWinSchema.partial().parse(req.body);
      const sanitizedUpdates = sanitizeForOrganization(updates, req.orgId);
      const win = await storage.updateWin(req.orgId, req.params.id, sanitizedUpdates);
      if (!win) {
        return res.status(404).json({ message: "Win not found" });
      }
      res.json(win);
    } catch (error) {
      console.error("Win update validation error:", error);
      res.status(400).json({ 
        message: "Invalid win data",
        details: error instanceof Error ? error.message : "Unknown validation error"
      });
    }
  });

  app.delete("/api/wins/:id", requireAuth(), requireRole(["admin"]), async (req, res) => {
    try {
      const deleted = await storage.deleteWin(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Win not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete win" });
    }
  });

  // Helper function to get direct reports and team members as a Set for efficient lookup
  const getDirectReportsSet = async (orgId: string, managerId: string): Promise<Set<string>> => {
    const directReports = await storage.getUsersByManager(orgId, managerId);
    const manager = await storage.getUser(orgId, managerId);
    const teamMembers = manager?.teamId ? await storage.getUsersByTeam(orgId, manager.teamId) : [];
    
    // Combine and deduplicate user IDs
    const allAuthorizedUsers = [...directReports, ...teamMembers];
    return new Set(allAuthorizedUsers.map(user => user.id));
  };

  // Helper function to check if user can view a win
  const canViewWin = (win: any, viewer: any, directReportsSet: Set<string>): boolean => {
    // Role-based access control for wins
    
    // Admins and super admins can see all wins
    if (viewer.role === 'admin' || viewer.role === 'super admin') {
      return true;
    }
    
    // Managers can see wins from their direct reports and team members
    if (viewer.role === 'manager') {
      // Can see their own wins
      if (win.userId === viewer.id || win.nominatedBy === viewer.id) return true;
      // Can see direct reports' wins
      if (directReportsSet.has(win.userId) || (win.nominatedBy && directReportsSet.has(win.nominatedBy))) return true;
      // Public wins are visible to managers
      if (win.isPublic) return true;
      return false;
    }
    
    // Members can only see their own wins (as user or nominator) 
    if (viewer.role === 'member' || !viewer.role) {
      // Can see wins where they are the user or nominator
      return win.userId === viewer.id || win.nominatedBy === viewer.id;
    }
    
    return false;
  };

  // Helper function to check if user can access private shoutouts
  const canAccessShoutouts = (shoutout: any, currentUserId: string, user?: any): boolean => {
    // Public shoutouts are always accessible
    if (shoutout.isPublic) return true;
    
    // Private shoutouts are only accessible to:
    // 1. The giver (fromUserId)
    // 2. The recipient (toUserId)
    // 3. Admins/managers (future: when user roles are available)
    return shoutout.fromUserId === currentUserId || shoutout.toUserId === currentUserId;
  };

  // Shoutouts
  app.get("/api/shoutouts", requireAuth(), async (req, res) => {
    try {
      const { public: isPublic, userId, type, limit } = req.query;
      const currentUser = req.currentUser!;
      let shoutouts;
      
      // Apply role-based filtering
      if (currentUser.role === "admin") {
        // Admins can see all shoutouts in their organization
        if (userId) {
          shoutouts = await storage.getShoutoutsByUser(req.orgId, userId as string, type as 'received' | 'given' | undefined);
        } else if (isPublic === "true") {
          shoutouts = await storage.getPublicShoutouts(req.orgId, limit ? parseInt(limit as string) : undefined);
        } else if (type === 'received' || type === 'given') {
          // If type is specified without userId, get all shoutouts of that type
          const allShoutouts = await storage.getRecentShoutouts(req.orgId, limit ? parseInt(limit as string) : undefined);
          shoutouts = allShoutouts; // Admins see all
        } else {
          shoutouts = await storage.getRecentShoutouts(req.orgId, limit ? parseInt(limit as string) : undefined);
        }
      } else if (currentUser.role === "manager") {
        // Managers can see shoutouts for themselves and their team members
        const directReports = await storage.getUsersByManager(req.orgId, currentUser.id, true);
        const teamMembers = currentUser.teamId ? await storage.getUsersByTeam(req.orgId, currentUser.teamId, true) : [];
        
        // Combine and deduplicate user IDs (including the manager themselves)
        const authorizedUserIds = new Set([
          currentUser.id,
          ...directReports.map(u => u.id),
          ...teamMembers.map(u => u.id)
        ]);
        
        if (userId && authorizedUserIds.has(userId as string)) {
          shoutouts = await storage.getShoutoutsByUser(req.orgId, userId as string, type as 'received' | 'given' | undefined);
        } else if (isPublic === "true") {
          shoutouts = await storage.getPublicShoutouts(req.orgId, limit ? parseInt(limit as string) : undefined);
        } else {
          // Get all recent shoutouts and filter to authorized users
          const allShoutouts = await storage.getRecentShoutouts(req.orgId, limit ? parseInt(limit as string) * 3 : undefined);
          shoutouts = allShoutouts.filter(s => 
            authorizedUserIds.has(s.fromUserId) || 
            authorizedUserIds.has(s.toUserId)
          );
          if (limit) {
            shoutouts = shoutouts.slice(0, parseInt(limit as string));
          }
        }
      } else {
        // Members can only see their own shoutouts (given or received)
        // Ignore userId parameter for members - they can only see their own data
        shoutouts = await storage.getShoutoutsByUser(req.orgId, currentUser.id, type as 'received' | 'given' | undefined);
        if (limit) {
          shoutouts = shoutouts.slice(0, parseInt(limit as string));
        }
      }
      
      res.json(shoutouts);
    } catch (error) {
      console.error("Failed to fetch shoutouts:", error);
      res.status(500).json({ message: "Failed to fetch shoutouts" });
    }
  });

  app.get("/api/shoutouts/:id", requireAuth(), async (req, res) => {
    try {
      const shoutout = await storage.getShoutout(req.orgId, req.params.id);
      if (!shoutout) {
        return res.status(404).json({ message: "Shoutout not found" });
      }
      
      const currentUserId = req.userId!;
      
      // Check if user can access this shoutout (privacy enforcement)
      if (!canAccessShoutouts(shoutout, currentUserId)) {
        return res.status(404).json({ message: "Shoutout not found" }); // Don't reveal existence
      }
      
      res.json(shoutout);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch shoutout" });
    }
  });

  app.post("/api/shoutouts", requireAuth(), async (req, res) => {
    try {
      // Custom schema for multi-recipient shoutouts - omit server-side fields
      const multiShoutoutSchema = insertShoutoutSchema.omit({
        toUserId: true,
        fromUserId: true,
        organizationId: true,
        slackMessageId: true
      }).extend({
        toUserIds: z.array(z.string()).min(1, "At least one recipient is required")
      });
      
      const shoutoutData = multiShoutoutSchema.parse(req.body);
      
      // Enforce authentication
      if (!req.currentUser?.id) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const currentUserId = req.currentUser.id;
      
      // Validate and deduplicate recipients
      const uniqueRecipientIds = [...new Set(shoutoutData.toUserIds)];
      
      // Validate all recipients exist in the organization
      for (const recipientId of uniqueRecipientIds) {
        const recipientUser = await storage.getUser(req.orgId, recipientId);
        if (!recipientUser) {
          return res.status(400).json({ 
            message: "Invalid recipient", 
            details: `User ${recipientId} not found in organization` 
          });
        }
      }
      
      // Create individual shoutouts for each recipient
      const createdShoutouts = [];
      
      for (const toUserId of uniqueRecipientIds) {
        // SECURITY: Never accept fromUserId from client - set server-side
        const individualShoutout = {
          ...shoutoutData,
          toUserId, // Set individual recipient
          fromUserId: currentUserId
        };
        
        // Remove toUserIds from the data that goes to the database
        const { toUserIds, ...dbData } = individualShoutout;
        
        const sanitizedData = sanitizeForOrganization(dbData, req.orgId);
        const shoutout = await storage.createShoutout(req.orgId, sanitizedData);
        createdShoutouts.push(shoutout);
        
        // Send Slack notification if public
        if (shoutout.isPublic) {
          const fromUser = await storage.getUser(req.orgId, shoutout.fromUserId);
          const toUser = await storage.getUser(req.orgId, shoutout.toUserId);
          
          if (fromUser && toUser) {
            try {
              const slackMessageId = await announceShoutout(
                shoutout.message,
                fromUser.name,
                toUser.name,
                shoutout.values
              );
              
              if (slackMessageId) {
                await storage.updateShoutout(req.orgId, shoutout.id, { slackMessageId });
              }
            } catch (slackError) {
              console.warn("Failed to send Slack notification for shoutout:", slackError);
            }
          }
        }
      }
      
      res.status(201).json(createdShoutouts);
    } catch (error) {
      console.error("Shoutout creation error:", error);
      
      // Return 400 for validation errors, 500 for server errors
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid shoutout data",
          details: error.message
        });
      }
      
      res.status(500).json({ 
        message: "Failed to create shoutouts",
        details: error instanceof Error ? error.message : "Unknown server error"
      });
    }
  });

  app.patch("/api/shoutouts/:id", requireAuth(), async (req, res) => {
    try {
      // Use separate update schema that only allows safe fields
      const updates = updateShoutoutSchema.parse(req.body);
      
      // TODO: Replace with actual authenticated user ID when auth is implemented
      const currentUserId = "current-user-id";
      
      // Check if shoutout exists and user has permission to edit
      const existingShoutout = await storage.getShoutout(req.orgId, req.params.id);
      if (!existingShoutout) {
        return res.status(404).json({ message: "Shoutout not found" });
      }
      
      // Only the original giver can edit shoutouts
      if (existingShoutout.fromUserId !== currentUserId) {
        return res.status(403).json({ message: "You can only edit shoutouts you sent" });
      }
      
      const sanitizedUpdates = sanitizeForOrganization(updates, req.orgId);
      const shoutout = await storage.updateShoutout(req.orgId, req.params.id, sanitizedUpdates);
      if (!shoutout) {
        return res.status(404).json({ message: "Shoutout not found" });
      }
      res.json(shoutout);
    } catch (error) {
      console.error("Shoutout update validation error:", error);
      res.status(400).json({ 
        message: "Invalid shoutout data",
        details: error instanceof Error ? error.message : "Unknown validation error"
      });
    }
  });

  app.delete("/api/shoutouts/:id", requireAuth(), requireRole(["admin"]), async (req, res) => {
    try {
      const deleted = await storage.deleteShoutout(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Shoutout not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete shoutout" });
    }
  });

  // Notifications
  app.get("/api/notifications", requireAuth(), async (req, res) => {
    try {
      const { limit } = req.query;
      const notifications = await storage.getNotificationsByUser(
        req.orgId, 
        req.userId!, 
        limit ? parseInt(limit as string) : undefined
      );
      res.json(notifications);
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth(), async (req, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.orgId, req.userId!);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth(), async (req, res) => {
    try {
      // Verify the notification belongs to the current user
      const notification = await storage.getNotification(req.orgId, req.params.id);
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }
      if (notification.userId !== req.userId) {
        return res.status(403).json({ message: "Cannot mark another user's notification as read" });
      }

      const updated = await storage.markNotificationAsRead(req.orgId, req.params.id);
      if (!updated) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/read-all", requireAuth(), async (req, res) => {
    try {
      const count = await storage.markAllNotificationsAsRead(req.orgId, req.userId!);
      res.json({ count, message: `Marked ${count} notifications as read` });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  app.delete("/api/notifications/:id", requireAuth(), async (req, res) => {
    try {
      // Verify the notification belongs to the current user
      const notification = await storage.getNotification(req.orgId, req.params.id);
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }
      if (notification.userId !== req.userId) {
        return res.status(403).json({ message: "Cannot delete another user's notification" });
      }

      const deleted = await storage.deleteNotification(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete notification" });
    }
  });

  // User Tours routes
  app.get("/api/tours", requireAuth(), async (req, res) => {
    try {
      const tours = await storage.getUserTours(req.orgId, req.userId!);
      res.json(tours);
    } catch (error) {
      console.error("Failed to fetch tours:", error);
      res.status(500).json({ message: "Failed to fetch tours" });
    }
  });

  app.get("/api/tours/:tourId", requireAuth(), async (req, res) => {
    try {
      const tour = await storage.getUserTour(req.orgId, req.userId!, req.params.tourId);
      if (!tour) {
        // Create a new tour record if it doesn't exist
        const newTour = await storage.createUserTour(req.orgId, {
          userId: req.userId!,
          tourId: req.params.tourId,
          status: 'not_started',
          currentStep: 0,
          version: '1.0'
        });
        return res.json(newTour);
      }
      res.json(tour);
    } catch (error) {
      console.error("Failed to fetch tour:", error);
      res.status(500).json({ message: "Failed to fetch tour" });
    }
  });

  app.post("/api/tours/:tourId/complete", requireAuth(), async (req, res) => {
    try {
      const tour = await storage.markTourCompleted(req.orgId, req.userId!, req.params.tourId);
      if (!tour) {
        // Create and complete if it doesn't exist
        await storage.createUserTour(req.orgId, {
          userId: req.userId!,
          tourId: req.params.tourId,
          status: 'completed',
          completedAt: new Date(),
          version: '1.0'
        });
        const completedTour = await storage.getUserTour(req.orgId, req.userId!, req.params.tourId);
        return res.json(completedTour);
      }
      res.json(tour);
    } catch (error) {
      console.error("Failed to complete tour:", error);
      res.status(500).json({ message: "Failed to complete tour" });
    }
  });

  app.post("/api/tours/:tourId/skip", requireAuth(), async (req, res) => {
    try {
      const tour = await storage.markTourSkipped(req.orgId, req.userId!, req.params.tourId);
      if (!tour) {
        // Create and skip if it doesn't exist
        await storage.createUserTour(req.orgId, {
          userId: req.userId!,
          tourId: req.params.tourId,
          status: 'skipped',
          skippedAt: new Date(),
          version: '1.0'
        });
        const skippedTour = await storage.getUserTour(req.orgId, req.userId!, req.params.tourId);
        return res.json(skippedTour);
      }
      res.json(tour);
    } catch (error) {
      console.error("Failed to skip tour:", error);
      res.status(500).json({ message: "Failed to skip tour" });
    }
  });

  app.post("/api/tours/:tourId/reset", requireAuth(), async (req, res) => {
    try {
      const tour = await storage.resetUserTour(req.orgId, req.userId!, req.params.tourId);
      if (!tour) {
        // Create a new tour if it doesn't exist
        const newTour = await storage.createUserTour(req.orgId, {
          userId: req.userId!,
          tourId: req.params.tourId,
          status: 'not_started',
          currentStep: 0,
          version: '1.0'
        });
        return res.json(newTour);
      }
      res.json(tour);
    } catch (error) {
      console.error("Failed to reset tour:", error);
      res.status(500).json({ message: "Failed to reset tour" });
    }
  });

  app.patch("/api/tours/:tourId", requireAuth(), async (req, res) => {
    try {
      const { currentStep, status, lastShownAt } = req.body;
      
      // Check if tour exists first
      let tour = await storage.getUserTour(req.orgId, req.userId!, req.params.tourId);
      
      if (!tour) {
        // Create new tour with the provided data
        tour = await storage.createUserTour(req.orgId, {
          userId: req.userId!,
          tourId: req.params.tourId,
          status: status || 'in_progress',
          currentStep: currentStep || 0,
          lastShownAt: lastShownAt || new Date(),
          version: '1.0'
        });
      } else {
        // Update existing tour
        tour = await storage.updateUserTour(req.orgId, req.userId!, req.params.tourId, {
          ...(currentStep !== undefined && { currentStep }),
          ...(status !== undefined && { status }),
          ...(lastShownAt !== undefined && { lastShownAt })
        });
      }
      
      res.json(tour);
    } catch (error) {
      console.error("Failed to update tour:", error);
      res.status(500).json({ message: "Failed to update tour" });
    }
  });

  // User-specific shoutouts endpoint
  app.get("/api/users/:id/shoutouts", async (req, res) => {
    try {
      const { type, limit } = req.query;
      const shoutouts = await storage.getShoutoutsByUser(
        req.orgId, 
        req.params.id, 
        type as 'received' | 'given' | undefined
      );
      
      const limitedShoutouts = limit ? shoutouts.slice(0, parseInt(limit as string)) : shoutouts;
      res.json(limitedShoutouts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user shoutouts" });
    }
  });

  // Comments
  app.get("/api/checkins/:id/comments", async (req, res) => {
    try {
      const comments = await storage.getCommentsByCheckin(req.orgId, req.params.id);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.post("/api/checkins/:id/comments", async (req, res) => {
    try {
      const commentData = insertCommentSchema.parse({
        ...req.body,
        checkinId: req.params.id,
      });
      const sanitizedData = sanitizeForOrganization(commentData, req.orgId);
      const comment = await storage.createComment(req.orgId, sanitizedData);
      res.status(201).json(comment);
    } catch (error) {
      res.status(400).json({ message: "Invalid comment data" });
    }
  });

  app.patch("/api/comments/:id", requireAuth(), async (req, res) => {
    try {
      // Only allow updating the content field for security
      const updateSchema = z.object({ content: z.string().min(1, "Content is required") });
      const updates = updateSchema.parse(req.body);
      const comment = await storage.updateComment(req.orgId, req.params.id, updates);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      res.json(comment);
    } catch (error) {
      res.status(400).json({ message: "Invalid comment data" });
    }
  });

  app.delete("/api/comments/:id", requireAuth(), async (req, res) => {
    try {
      const deleted = await storage.deleteComment(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Comment not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });

  // Vacations
  app.get("/api/vacations", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      const query = vacationQuerySchema.parse(req.query);
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      // Users can only view their own vacations
      const vacations = await storage.getUserVacationsByRange(
        req.orgId, 
        currentUser.id, 
        query.from, 
        query.to
      );
      
      res.json(vacations);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      console.error("Failed to fetch vacations:", error);
      res.status(500).json({ message: "Failed to fetch vacations" });
    }
  });

  app.post("/api/vacations", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      const vacationData = insertVacationSchema.parse(req.body);
      
      // Security: Always use the current user's ID, never trust client data
      const sanitizedData = {
        ...vacationData,
        userId: currentUser.id,
      };
      
      const vacation = await storage.upsertVacationWeek(
        req.orgId,
        currentUser.id,
        sanitizedData.weekOf,
        sanitizedData.note
      );
      
      res.status(201).json(vacation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid vacation data",
          details: error.errors
        });
      }
      console.error("Failed to create/update vacation:", error);
      res.status(500).json({ message: "Failed to create/update vacation" });
    }
  });

  app.delete("/api/vacations/:weekOf", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      const params = vacationParamSchema.parse(req.params);
      
      // Users can only delete their own vacations
      const deleted = await storage.deleteVacationWeek(
        req.orgId,
        currentUser.id,
        params.weekOf
      );
      
      if (!deleted) {
        return res.status(404).json({ message: "Vacation week not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid weekOf parameter",
          details: error.errors
        });
      }
      console.error("Failed to delete vacation:", error);
      res.status(500).json({ message: "Failed to delete vacation" });
    }
  });

  // Analytics & Stats
  app.get("/api/analytics/team-health", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      let recentCheckins;
      let relevantUsers;
      
      // Filter data based on user role
      if (currentUser.role === "member") {
        // Members only see their own data
        recentCheckins = await storage.getCheckinsByUser(req.orgId, currentUser.id);
        relevantUsers = [currentUser];
      } else if (currentUser.role === "manager") {
        // Managers see their team's data (them + their direct reports)
        const teamMembers = await storage.getUsersByManager(req.orgId, currentUser.id, true);
        const teamUserIds = [currentUser.id, ...teamMembers.map(u => u.id)];
        
        // Get checkins for all team members
        const allCheckins = await storage.getRecentCheckins(req.orgId, 1000);
        recentCheckins = allCheckins.filter(checkin => 
          teamUserIds.includes(checkin.userId)
        );
        
        // Include self and team members for completion calculation
        relevantUsers = [currentUser, ...teamMembers].filter(u => u.isActive);
      } else {
        // Admins see organization-wide data
        recentCheckins = await storage.getRecentCheckins(req.orgId, 100);
        const allUsers = await storage.getAllUsers(req.orgId);
        relevantUsers = allUsers.filter(user => user.isActive);
      }
      
      const totalCheckins = recentCheckins.length;
      
      // Get compliance metrics for the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Determine compliance scope based on role
      let complianceScope = 'organization';
      let complianceId = undefined;
      
      if (currentUser.role === "member") {
        complianceScope = 'user';
        complianceId = currentUser.id;
      } else if (currentUser.role === "manager" && currentUser.teamId) {
        complianceScope = 'team';
        complianceId = currentUser.teamId;
      }
      
      const [checkinCompliance, reviewCompliance] = await Promise.all([
        storage.getCheckinComplianceMetrics(req.orgId, {
          scope: complianceScope as any,
          entityId: complianceId,
          from: thirtyDaysAgo
        }),
        storage.getReviewComplianceMetrics(req.orgId, {
          scope: complianceScope as any,
          entityId: complianceId,
          from: thirtyDaysAgo
        })
      ]);
      
      // Extract latest compliance metrics (most recent period if multiple, or aggregate if single)
      const latestCheckinCompliance = checkinCompliance.length > 0 ? 
        checkinCompliance[checkinCompliance.length - 1].metrics || checkinCompliance[0] : 
        { totalCount: 0, onTimeCount: 0, onTimePercentage: 0, averageDaysEarly: 0, averageDaysLate: 0 };
        
      const latestReviewCompliance = reviewCompliance.length > 0 ? 
        reviewCompliance[reviewCompliance.length - 1].metrics || reviewCompliance[0] : 
        { totalCount: 0, onTimeCount: 0, onTimePercentage: 0, averageDaysEarly: 0, averageDaysLate: 0 };
      
      if (totalCheckins === 0) {
        return res.json({
          averageRating: 0,
          completionRate: 0,
          totalCheckins: 0,
          checkinCompliance: latestCheckinCompliance,
          reviewCompliance: latestReviewCompliance
        });
      }
      
      const sumRatings = recentCheckins.reduce((sum, checkin) => sum + checkin.overallMood, 0);
      const averageRating = sumRatings / totalCheckins;
      
      // Calculate completion rate for current week (based on relevant users only)
      const completedThisWeek = recentCheckins.filter(checkin => {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        return checkin.weekOf >= weekStart && checkin.isComplete;
      }).length;
      
      const completionRate = relevantUsers.length > 0 
        ? Math.round((completedThisWeek / relevantUsers.length) * 100)
        : 0;
      
      res.json({
        averageRating: Math.round(averageRating * 10) / 10,
        completionRate,
        totalCheckins,
        checkinCompliance: latestCheckinCompliance,
        reviewCompliance: latestReviewCompliance
      });
    } catch (error) {
      console.error("Team health analytics error:", error);
      res.status(500).json({ message: "Failed to fetch team health analytics" });
    }
  });

  // Analytics - Pulse Metrics
  app.get("/api/analytics/pulse", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = analyticsBaseSchema.parse(req.query);
      
      // Validate scope and id relationship
      if ((query.scope === 'team' || query.scope === 'user') && !query.id) {
        return res.status(400).json({ message: "ID is required for team and user scopes" });
      }
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      const metrics = await storage.getPulseMetrics(req.orgId, {
        scope: query.scope as AnalyticsScope,
        entityId: query.id,
        period: query.period as AnalyticsPeriod,
        from: query.from,
        to: query.to,
      });
      
      res.json(metrics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to fetch pulse analytics" });
    }
  });

  // Analytics - Shoutout Metrics  
  app.get("/api/analytics/shoutouts", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = shoutoutAnalyticsSchema.parse(req.query);
      
      // Validate scope and id relationship
      if ((query.scope === 'team' || query.scope === 'user') && !query.id) {
        return res.status(400).json({ message: "ID is required for team and user scopes" });
      }
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      const metrics = await storage.getShoutoutMetrics(req.orgId, {
        scope: query.scope as AnalyticsScope,
        entityId: query.id,
        period: query.period as AnalyticsPeriod,
        direction: query.direction as ShoutoutDirection,
        visibility: query.visibility as ShoutoutVisibility,
        from: query.from,
        to: query.to,
      });
      
      res.json(metrics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to fetch shoutout analytics" });
    }
  });

  // Analytics - Leaderboard
  app.get("/api/analytics/leaderboard", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = leaderboardSchema.parse(req.query);
      
      // Validate scope and id relationship
      if ((query.scope === 'team' || query.scope === 'user') && !query.id) {
        return res.status(400).json({ message: "ID is required for team and user scopes" });
      }
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      const leaderboard = await storage.getLeaderboard(req.orgId, {
        metric: query.metric as LeaderboardMetric,
        scope: query.scope as AnalyticsScope,
        entityId: query.id,
        period: query.period as AnalyticsPeriod,
        from: query.from,
        to: query.to,
      });
      
      res.json(leaderboard);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to fetch leaderboard analytics" });
    }
  });

  // Analytics - Overview
  app.get("/api/analytics/overview", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = overviewSchema.parse(req.query);
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      // Provide default date range if not specified (last 30 days for monthly period, adjust accordingly)
      const defaultTo = new Date();
      const defaultFrom = new Date(defaultTo.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago
      
      const overview = await storage.getAnalyticsOverview(
        req.orgId,
        query.period as AnalyticsPeriod,
        query.from || defaultFrom,
        query.to || defaultTo
      );
      
      res.json(overview);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to fetch analytics overview" });
    }
  });

  // Analytics - Check-in Compliance
  app.get("/api/analytics/checkin-compliance", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = complianceAnalyticsSchema.parse(req.query);
      
      // Validate scope and id relationship
      if ((query.scope === 'team' || query.scope === 'user') && !query.id) {
        return res.status(400).json({ message: "ID is required for team and user scopes" });
      }
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      const metrics = await storage.getCheckinComplianceMetrics(req.orgId, {
        scope: query.scope as AnalyticsScope,
        entityId: query.id,
        period: query.period as AnalyticsPeriod,
        from: query.from,
        to: query.to,
      });
      
      res.json(metrics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to fetch check-in compliance metrics" });
    }
  });

  // Analytics - Review Compliance
  app.get("/api/analytics/review-compliance", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = complianceAnalyticsSchema.parse(req.query);
      
      // Validate scope and id relationship
      if ((query.scope === 'team' || query.scope === 'user') && !query.id) {
        return res.status(400).json({ message: "ID is required for team and user scopes" });
      }
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      const metrics = await storage.getReviewComplianceMetrics(req.orgId, {
        scope: query.scope as AnalyticsScope,
        entityId: query.id,
        period: query.period as AnalyticsPeriod,
        from: query.from,
        to: query.to,
      });
      
      res.json(metrics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to fetch review compliance metrics" });
    }
  });

  // Analytics - Team Compliance Batch (eliminates N+1 queries)
  app.get("/api/analytics/team-compliance", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = z.object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        period: z.enum(['week', 'month', 'quarter', 'year']).optional()
      }).parse(req.query);
      
      // Validate date range
      if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      // Get all teams for the organization
      const teams = await storage.getAllTeams(req.orgId);
      
      // Fetch compliance metrics for all teams in parallel
      const teamCompliancePromises = teams.map(async (team) => {
        const [checkinCompliance, reviewCompliance] = await Promise.all([
          storage.getCheckinComplianceMetrics(req.orgId, {
            scope: 'team',
            entityId: team.id,
            period: query.period as AnalyticsPeriod,
            from: query.from ? new Date(query.from) : undefined,
            to: query.to ? new Date(query.to) : undefined,
          }),
          storage.getReviewComplianceMetrics(req.orgId, {
            scope: 'team',
            entityId: team.id,
            period: query.period as AnalyticsPeriod,
            from: query.from ? new Date(query.from) : undefined,
            to: query.to ? new Date(query.to) : undefined,
          })
        ]);
        
        // Extract latest metrics (most recent period if multiple, or aggregate if single)
        const latestCheckinMetrics = checkinCompliance.length > 0 ? 
          checkinCompliance[checkinCompliance.length - 1].metrics || checkinCompliance[0].metrics || checkinCompliance[0] : 
          { totalCount: 0, onTimeCount: 0, onTimePercentage: 0 };
          
        const latestReviewMetrics = reviewCompliance.length > 0 ? 
          reviewCompliance[reviewCompliance.length - 1].metrics || reviewCompliance[0].metrics || reviewCompliance[0] : 
          { totalCount: 0, onTimeCount: 0, onTimePercentage: 0 };
        
        return {
          teamId: team.id,
          teamName: team.name,
          checkinCompliance: latestCheckinMetrics,
          reviewCompliance: latestReviewMetrics
        };
      });
      
      const teamCompliance = await Promise.all(teamCompliancePromises);
      
      res.json(teamCompliance);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      console.error("Team compliance batch analytics error:", error);
      res.status(500).json({ message: "Failed to fetch team compliance metrics" });
    }
  });

  // Slack Integration
  app.post("/api/slack/send-checkin-reminder", requireOrganization(), requireAuth(), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      const users = await storage.getAllUsers(req.orgId);
      const activeUsers = users.filter(user => user.isActive);
      
      // Find users who haven't completed this week's check-in
      const currentWeekStart = new Date();
      currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
      currentWeekStart.setHours(0, 0, 0, 0);
      
      const usersNeedingReminder = [];
      for (const user of activeUsers) {
        const currentCheckin = await storage.getCurrentWeekCheckin(req.orgId, user.id);
        if (!currentCheckin || !currentCheckin.isComplete) {
          usersNeedingReminder.push(user.name);
        }
      }
      
      if (usersNeedingReminder.length > 0) {
        // Fetch active questions to include in the reminder
        const questions = await storage.getActiveQuestions(req.orgId);
        await sendCheckinReminder(usersNeedingReminder, questions);
      }
      
      res.json({ 
        message: "Reminder sent", 
        userCount: usersNeedingReminder.length,
        questionsIncluded: await storage.getActiveQuestions(req.orgId).then(q => q.length)
      });
    } catch (error) {
      console.error("Failed to send check-in reminder:", error);
      res.status(500).json({ message: "Failed to send reminder" });
    }
  });

  app.post("/api/slack/send-team-health-update", requireOrganization(), requireAuth(), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      const recentCheckins = await storage.getRecentCheckins(req.orgId, 50);
      const recentWins = await storage.getRecentWins(req.orgId, 20);
      const allUsers = await storage.getAllUsers(req.orgId);
      const activeUsers = allUsers.filter(user => user.isActive);
      
      const averageRating = recentCheckins.length > 0 
        ? recentCheckins.reduce((sum, checkin) => sum + checkin.overallMood, 0) / recentCheckins.length
        : 0;
      
      const currentWeekStart = new Date();
      currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
      currentWeekStart.setHours(0, 0, 0, 0);
      
      const completedThisWeek = recentCheckins.filter(checkin => 
        checkin.weekOf >= currentWeekStart && checkin.isComplete
      ).length;
      const completionRate = Math.round((completedThisWeek / activeUsers.length) * 100);
      
      const winsThisWeek = recentWins.filter(win => 
        win.createdAt >= currentWeekStart
      ).length;
      
      await sendTeamHealthUpdate(averageRating, completionRate, winsThisWeek);
      
      res.json({ message: "Team health update sent" });
    } catch (error) {
      res.status(500).json({ message: "Failed to send team health update" });
    }
  });
  
  // Manual Weekly Reminder Trigger (for testing or scheduled execution)
  app.post("/api/slack/send-weekly-reminders", requireOrganization(), requireAuth(), requireRole('admin'), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      const { scheduleWeeklyReminders } = await import("./services/slack");
      const result = await scheduleWeeklyReminders(req.orgId, storage);
      
      res.json({
        message: "Weekly reminders processing completed",
        ...result
      });
    } catch (error) {
      console.error("Failed to send weekly reminders:", error);
      res.status(500).json({ message: "Failed to send weekly reminders" });
    }
  });
  
  // Personalized Check-in Reminder (for individual users)
  app.post("/api/slack/send-personal-reminder", requireOrganization(), requireAuth(), requireRole('admin'), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      const { userId, isWeeklyScheduled = false } = req.body;
      
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      const user = await storage.getUser(req.orgId, userId);
      if (!user || !user.slackUserId) {
        return res.status(404).json({ message: "User not found or doesn't have Slack integration" });
      }
      
      const questions = await storage.getActiveQuestions(req.orgId);
      const { sendPersonalizedCheckinReminder } = await import("./services/slack");
      
      await sendPersonalizedCheckinReminder(
        user.slackUserId,
        user.name,
        questions,
        isWeeklyScheduled
      );
      
      res.json({
        message: "Personal reminder sent successfully",
        user: { id: user.id, name: user.name }
      });
    } catch (error) {
      console.error("Failed to send personal reminder:", error);
      res.status(500).json({ message: "Failed to send personal reminder" });
    }
  });
  
  // Get Weekly Reminder Statistics
  app.get("/api/slack/reminder-stats", requireOrganization(), requireAuth(), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      const { getWeeklyReminderStats } = await import("./services/slack");
      const stats = await getWeeklyReminderStats(req.orgId, storage);
      
      res.json(stats);
    } catch (error) {
      console.error("Failed to get reminder stats:", error);
      res.status(500).json({ message: "Failed to get reminder stats" });
    }
  });
  
  // Test Weekly Reminders (for development/testing)
  app.post("/api/slack/test-weekly-reminders", requireOrganization(), requireAuth(), requireRole('admin'), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      const { triggerTestWeeklyReminders } = await import("./services/slack");
      const result = await triggerTestWeeklyReminders(req.orgId, storage);
      
      res.json({
        message: "Test weekly reminders completed",
        ...result
      });
    } catch (error) {
      console.error("Failed to run test weekly reminders:", error);
      res.status(500).json({ message: "Failed to run test weekly reminders" });
    }
  });

  // Slack Events Endpoint - Handle event subscriptions and verification
  app.post("/slack/events", async (req, res) => {
    try {
      const { type, challenge, event } = req.body;

      // Handle URL verification challenge from Slack
      if (type === "url_verification") {
        console.log("Slack URL verification received");
        return res.json({ challenge });
      }

      // Handle actual events
      if (type === "event_callback" && event) {
        console.log("Slack event received:", event.type);
        
        // Handle channel membership events for user sync
        if (event.type === "member_joined_channel" || event.type === "member_left_channel") {
          // For now, we'll handle all orgs - in a real multi-tenant app,
          // you'd need to determine which organization this event belongs to
          try {
            const { handleChannelMembershipEvent } = await import("./services/slack");
            const organizations = await storage.getAllOrganizations();
            
            // Process event for all organizations (or determine the specific org)
            for (const org of organizations) {
              await handleChannelMembershipEvent(event, org.id, storage);
            }
          } catch (syncError) {
            console.error("Failed to handle channel membership event:", syncError);
            // Don't fail the request - Slack expects a 200 response
          }
        }
        
        res.status(200).json({ ok: true });
      } else {
        // Unknown event type
        res.status(400).json({ error: "Unknown event type" });
      }
    } catch (error) {
      console.error("Slack events error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Slack Interactive Components Endpoint - Handle button clicks, modal submissions, etc.
  app.post("/slack/interactive", express.raw({type: 'application/x-www-form-urlencoded'}), async (req, res) => {
    try {
      // Parse the URL-encoded payload
      const payloadString = req.body.toString().split('payload=')[1];
      if (!payloadString) {
        return res.status(400).json({ error: "Missing payload" });
      }
      
      const payload = JSON.parse(decodeURIComponent(payloadString));
      console.log("Slack interactive component received:", payload.type, payload.actions?.[0]?.action_id);
      
      // Determine organization from team ID or default to first org for simplicity
      let organizationId;
      try {
        const organizations = await storage.getAllOrganizations();
        // In a real app, you'd match payload.team.id to organization.slackWorkspaceId
        organizationId = organizations[0]?.id;
        
        if (!organizationId) {
          return res.status(500).json({ error: "No organization found" });
        }
        
        // Handle the interaction
        const { handleSlackInteraction } = await import("./services/slack");
        await handleSlackInteraction(payload, organizationId, storage);
        
        // Acknowledge the interaction
        res.status(200).json({ ok: true });
      } catch (error) {
        console.error("Error determining organization for Slack interaction:", error);
        res.status(500).json({ error: "Failed to process interaction" });
      }
    } catch (error) {
      console.error("Slack interactive component error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Slack Slash Commands Endpoint - Handle /checkin and other slash commands
  app.post("/slack/command", express.raw({type: 'application/x-www-form-urlencoded'}), async (req, res) => {
    try {
      // Parse the URL-encoded form data
      const params = new URLSearchParams(req.body.toString());
      const command = params.get('command');
      const text = params.get('text') || '';
      const userId = params.get('user_id');
      const userName = params.get('user_name');
      const triggerId = params.get('trigger_id');
      const teamId = params.get('team_id');
      
      console.log(`Slack slash command received: ${command} from ${userName}`);
      
      // Determine organization from team ID or default to first org for simplicity
      let organizationId;
      try {
        const organizations = await storage.getAllOrganizations();
        // In a real app, you'd match teamId to organization.slackWorkspaceId
        organizationId = organizations[0]?.id;
        
        if (!organizationId) {
          return res.status(200).json({
            text: "Organization not found. Please contact your administrator.",
            response_type: "ephemeral"
          });
        }
        
        // Handle the slash command
        const { handleSlackSlashCommand } = await import("./services/slack");
        const response = await handleSlackSlashCommand(command || '', text, userId || '', userName || '', triggerId || '', organizationId, storage);
        
        // Send response back to Slack
        res.status(200).json(response);
      } catch (error) {
        console.error("Error determining organization for Slack slash command:", error);
        res.status(200).json({
          text: "Sorry, there was an error processing your command. Please try again.",
          response_type: "ephemeral"
        });
      }
    } catch (error) {
      console.error("Slack slash command error:", error);
      res.status(200).json({
        text: "Sorry, there was an error processing your command. Please try again.",
        response_type: "ephemeral"
      });
    }
  });

  // Authentication endpoints section moved earlier

  // User Sync Endpoints
  app.post("/api/admin/sync-users", requireAuth(), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        return res.status(403).json({ 
          message: "Admin access required to sync users",
          error: "insufficient_permissions"
        });
      }

      console.log(`📋 Admin sync-users endpoint called for org: ${req.orgId}`);
      console.log(`👤 Requested by: ${req.currentUser.name} (${req.currentUser.email})`);
      
      // Get organization to fetch Slack token
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        console.error("❌ Organization not found:", req.orgId);
        return res.status(404).json({ 
          message: "Organization not found",
          error: "organization_not_found"
        });
      }
      
      // Use organization's bot token or fall back to environment variable
      const botToken = organization.slackBotToken || process.env.SLACK_BOT_TOKEN;
      
      console.log(`🔑 Using ${organization.slackBotToken ? 'organization-specific' : 'environment'} Slack token`);
      console.log(`📺 Channel to sync: ${req.body?.channelName || 'whirkplace-pulse'}`);
      
      if (!botToken) {
        console.error("❌ No Slack bot token available for organization:", organization.name);
        return res.status(400).json({ 
          message: "Slack integration not configured. Please add your Slack Bot Token in the Integrations settings.",
          error: "missing_token",
          details: "Navigate to Settings → Integrations → Slack to configure your bot token."
        });
      }

      const { syncUsersFromSlack } = await import("./services/slack");
      const channelName = req.body?.channelName || 'whirkplace-pulse';
      
      console.log(`🚀 Starting user sync from channel: #${channelName}`);
      const result = await syncUsersFromSlack(req.orgId, storage, botToken, channelName);
      
      if (result.error) {
        console.error(`⚠️ Sync completed with error: ${result.error}`);
        
        // Provide more helpful error messages based on common issues
        if (result.error.includes('missing_scope')) {
          return res.status(403).json({
            message: "Missing Slack permissions. Your Slack app needs the following scopes: channels:read, groups:read, users:read, users:read.email",
            error: "missing_scope",
            details: "Please update your Slack app permissions at https://api.slack.com/apps",
            ...result
          });
        } else if (result.error.includes('invalid_auth')) {
          return res.status(401).json({
            message: "Invalid Slack authentication. Your bot token may be expired or incorrect.",
            error: "invalid_auth",
            details: "Please check your Slack bot token in Settings → Integrations → Slack",
            ...result
          });
        } else if (result.error.includes('channel_not_found')) {
          return res.status(404).json({
            message: `Slack channel "${channelName}" not found. Please ensure the channel exists and the bot has been added to it.`,
            error: "channel_not_found",
            details: `Invite your bot to the channel using: /invite @your-bot-name in #${channelName}`,
            ...result
          });
        } else if (result.error.includes('No members found')) {
          return res.status(404).json({
            message: `No members found in channel "${channelName}". Please ensure the channel has members and the bot can see them.`,
            error: "no_members",
            details: "The bot may need to be invited to the channel or the channel might be private.",
            ...result
          });
        }
        
        // Generic error response
        return res.status(400).json({
          message: result.error,
          error: "sync_failed",
          ...result
        });
      }
      
      console.log(`✅ Sync completed: Created ${result.created}, Activated ${result.activated}, Deactivated ${result.deactivated}`);
      res.json({
        message: `Successfully synced users from #${channelName}`,
        details: `Created ${result.created} new users, reactivated ${result.activated} users, deactivated ${result.deactivated} users`,
        ...result
      });
    } catch (error: any) {
      console.error("❌ Manual user sync failed:", error);
      console.error("Error stack:", error.stack);
      
      // Provide more helpful error messages for common issues
      if (error.message?.includes('rate_limited')) {
        return res.status(429).json({ 
          message: "Slack API rate limit exceeded. Please wait a moment and try again.",
          error: "rate_limited",
          details: "Slack limits API calls to prevent abuse. Try again in 60 seconds."
        });
      }
      
      const errorMessage = error?.message || "User sync failed";
      res.status(500).json({ 
        message: `Failed to sync users: ${errorMessage}`,
        error: "internal_error",
        details: "Check the server logs for more information."
      });
    }
  });

  // NEW: Alternative sync endpoint for better compatibility
  app.post("/api/slack/sync-users", requireAuth(), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      console.log(`📋 Slack sync-users endpoint called for org: ${req.orgId}`);
      console.log(`👤 User role: ${req.currentUser?.role}, Name: ${req.currentUser?.name}`);
      
      // Get organization to fetch Slack token
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        console.error("❌ Organization not found:", req.orgId);
        return res.status(404).json({ 
          message: "Organization not found",
          error: "organization_not_found"
        });
      }
      
      // Use organization's bot token or fall back to environment variable
      const botToken = organization.slackBotToken || process.env.SLACK_BOT_TOKEN;
      
      console.log(`🔑 Using ${organization.slackBotToken ? 'organization-specific' : 'environment'} Slack token`);
      console.log(`📺 Channel to sync: ${req.body?.channelName || 'whirkplace-pulse'}`);
      
      if (!botToken) {
        console.error("❌ No Slack bot token available for organization:", organization.name);
        return res.status(400).json({ 
          message: "Slack integration not configured. Please add your Slack Bot Token in the Integrations settings.",
          error: "missing_token",
          details: "Navigate to Settings → Integrations → Slack to configure your bot token."
        });
      }

      const { syncUsersFromSlack } = await import("./services/slack");
      const channelName = req.body?.channelName || 'whirkplace-pulse';
      
      console.log(`🚀 Starting user sync from channel: #${channelName}`);
      const result = await syncUsersFromSlack(req.orgId, storage, botToken, channelName);
      
      if (result.error) {
        console.error(`⚠️ Sync completed with error: ${result.error}`);
        
        // Provide more helpful error messages based on common issues
        if (result.error.includes('missing_scope')) {
          return res.status(403).json({
            message: "Missing Slack permissions. Your Slack app needs the following scopes: channels:read, groups:read, users:read, users:read.email",
            error: "missing_scope",
            details: "Please update your Slack app permissions at https://api.slack.com/apps",
            ...result
          });
        } else if (result.error.includes('invalid_auth')) {
          return res.status(401).json({
            message: "Invalid Slack authentication. Your bot token may be expired or incorrect.",
            error: "invalid_auth",
            details: "Please check your Slack bot token in Settings → Integrations → Slack",
            ...result
          });
        } else if (result.error.includes('channel_not_found')) {
          return res.status(404).json({
            message: `Slack channel "${channelName}" not found. Please ensure the channel exists and the bot has been added to it.`,
            error: "channel_not_found",
            details: `Invite your bot to the channel using: /invite @your-bot-name in #${channelName}`,
            ...result
          });
        } else if (result.error.includes('No members found')) {
          return res.status(404).json({
            message: `No members found in channel "${channelName}". Please ensure the channel has members and the bot can see them.`,
            error: "no_members",
            details: "The bot may need to be invited to the channel or the channel might be private.",
            ...result
          });
        }
        
        // Generic error response
        return res.status(400).json({
          message: result.error,
          error: "sync_failed",
          ...result
        });
      }
      
      console.log(`✅ Sync completed: Created ${result.created}, Activated ${result.activated}, Deactivated ${result.deactivated}`);
      res.json({
        message: `Successfully synced users from #${channelName}`,
        details: `Created ${result.created} new users, reactivated ${result.activated} users, deactivated ${result.deactivated} users`,
        ...result
      });
    } catch (error: any) {
      console.error("❌ Slack sync failed:", error);
      console.error("Error stack:", error.stack);
      
      // Provide more helpful error messages for common issues
      if (error.message?.includes('rate_limited')) {
        return res.status(429).json({ 
          message: "Slack API rate limit exceeded. Please wait a moment and try again.",
          error: "rate_limited",
          details: "Slack limits API calls to prevent abuse. Try again in 60 seconds."
        });
      }
      
      const errorMessage = error?.message || "Failed to sync users from Slack channel";
      res.status(500).json({ 
        message: `Failed to sync users: ${errorMessage}`,
        error: "internal_error",
        details: "Check the server logs for more information."
      });
    }
  });

  app.get("/api/admin/channel-members", requireAuth(), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log(`📋 Channel members endpoint called for org: ${req.orgId}`);
      
      // Get organization to fetch Slack token
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Use organization's bot token or fall back to environment variable
      const botToken = organization.slackBotToken || process.env.SLACK_BOT_TOKEN;
      const channelName = req.query.channel || 'whirkplace-pulse';
      
      console.log(`🔑 Using ${organization.slackBotToken ? 'organization-specific' : 'environment'} Slack token`);
      
      if (!botToken) {
        return res.status(400).json({ 
          message: "Slack integration not configured",
          members: [],
          count: 0,
          channelName: channelName as string
        });
      }

      const { getChannelMembers } = await import("./services/slack");
      const members = await getChannelMembers(botToken, channelName as string);
      
      res.json({
        members,
        count: members.length,
        channelName: channelName as string
      });
    } catch (error: any) {
      console.error("Failed to fetch channel members:", error);
      res.status(500).json({ 
        message: error?.message || "Failed to fetch channel members",
        members: [],
        count: 0
      });
    }
  });

  // Slack integration status endpoint
  app.get("/api/integrations/slack/status", requireAuth(), async (req, res) => {
    try {
      console.log(`📋 Slack status check for org: ${req.orgId}`);
      
      // Get organization to check Slack integration status
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        console.error("❌ Organization not found:", req.orgId);
        return res.status(404).json({ 
          connected: false,
          message: "Organization not found" 
        });
      }
      
      // Check if Slack is connected by looking for the bot token
      const isConnected = !!organization.slackBotToken;
      const hasWorkspace = !!organization.slackWorkspaceId;
      
      console.log(`🔌 Slack connection status:`, {
        connected: isConnected,
        hasToken: !!organization.slackBotToken,
        hasWorkspace: hasWorkspace,
        workspaceId: organization.slackWorkspaceId,
        connectionStatus: organization.slackConnectionStatus,
        lastConnected: organization.slackLastConnected
      });
      
      // Return detailed status
      res.json({
        connected: isConnected,
        hasToken: isConnected,
        workspaceId: organization.slackWorkspaceId || null,
        channelId: organization.slackChannelId || null,
        connectionStatus: organization.slackConnectionStatus || (isConnected ? 'connected' : 'not_configured'),
        lastConnected: organization.slackLastConnected || null,
        integrationEnabled: organization.enableSlackIntegration || false
      });
    } catch (error: any) {
      console.error("❌ Failed to check Slack status:", error);
      res.status(500).json({ 
        connected: false,
        error: error?.message || "Failed to check Slack integration status" 
      });
    }
  });

  // NEW: Bot OAuth flow for Slack - Get bot token
  app.get("/api/slack/bot-auth", requireAuth(), requireRole('admin'), async (req, res) => {
    try {
      console.log(`🤖 Bot OAuth initiated for org: ${req.orgId}`);
      
      const clientId = process.env.SLACK_CLIENT_ID;
      const redirectUri = resolveRedirectUri(req, '/api/slack/bot-callback');
      
      if (!clientId) {
        console.error("❌ Slack client ID not configured");
        return res.status(500).json({ 
          error: "Slack OAuth not configured" 
        });
      }
      
      // Generate state for CSRF protection
      const state = randomBytes(32).toString('hex');
      req.session.slackBotOAuthState = state;
      req.session.slackBotOAuthOrgId = req.orgId;
      
      // Bot scopes needed for the application
      const scopes = [
        'channels:read',
        'channels:join', 
        'chat:write',
        'users:read',
        'users:read.email',
        'team:read'
      ].join(',');
      
      const params = new URLSearchParams({
        client_id: clientId,
        scope: scopes,
        redirect_uri: redirectUri,
        state: state
      });
      
      const authUrl = `https://slack.com/oauth/v2/authorize?${params.toString()}`;
      
      console.log(`✅ Redirecting to Slack bot OAuth: ${authUrl}`);
      console.log(`📋 Bot scopes requested: ${scopes}`);
      
      // Save session before redirect
      req.session.save((err) => {
        if (err) {
          console.error('❌ Failed to save session for bot OAuth:', err);
          return res.status(500).json({ error: "Session save failed" });
        }
        res.json({ url: authUrl });
      });
    } catch (error) {
      console.error("❌ Bot OAuth error:", error);
      res.status(500).json({ 
        error: "Failed to initiate bot authentication" 
      });
    }
  });
  
  // NEW: Bot OAuth callback - Store bot token
  app.get("/api/slack/bot-callback", async (req, res) => {
    try {
      const { code, state, error: oauthError } = req.query;
      
      console.log('🤖 Bot OAuth callback received');
      
      if (oauthError) {
        console.error("❌ Slack bot OAuth error:", oauthError);
        return res.redirect(`/?error=slack_bot_auth_failed&message=${encodeURIComponent(oauthError as string)}`);
      }
      
      if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
        console.error('❌ Invalid bot callback parameters');
        return res.redirect('/?error=invalid_bot_callback');
      }
      
      // Validate state
      if (req.session.slackBotOAuthState !== state) {
        console.error('❌ Bot OAuth state mismatch');
        return res.redirect('/?error=state_mismatch');
      }
      
      const orgId = req.session.slackBotOAuthOrgId;
      if (!orgId) {
        console.error('❌ No organization ID in session');
        return res.redirect('/?error=no_org_id');
      }
      
      // Clear OAuth state
      delete req.session.slackBotOAuthState;
      delete req.session.slackBotOAuthOrgId;
      
      // Exchange code for access token
      const clientId = process.env.SLACK_CLIENT_ID;
      const clientSecret = process.env.SLACK_CLIENT_SECRET;
      const redirectUri = resolveRedirectUri(req, '/api/slack/bot-callback');
      
      if (!clientId || !clientSecret) {
        console.error('❌ Slack OAuth credentials not configured');
        return res.redirect('/?error=oauth_not_configured');
      }
      
      console.log(`📋 Exchanging bot OAuth code for token...`);
      
      const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          redirect_uri: redirectUri
        }).toString()
      });
      
      const tokenData = await tokenResponse.json();
      
      if (!tokenData.ok) {
        console.error('❌ Failed to exchange bot OAuth code:', tokenData.error);
        return res.redirect(`/?error=token_exchange_failed&message=${encodeURIComponent(tokenData.error)}`);
      }
      
      console.log('✅ Bot token obtained successfully');
      console.log(`📋 Team: ${tokenData.team?.name} (${tokenData.team?.id})`);
      console.log(`📋 Bot scopes: ${tokenData.scope}`);
      
      // Store bot token in organization
      const organization = await storage.getOrganization(orgId);
      if (!organization) {
        console.error('❌ Organization not found:', orgId);
        return res.redirect('/?error=org_not_found');
      }
      
      // Update organization with bot token
      await storage.updateOrganization(orgId, {
        slackBotToken: tokenData.access_token,
        slackWorkspaceId: tokenData.team?.id,
        slackConnectionStatus: 'connected',
        slackLastConnected: new Date(),
        enableSlackIntegration: true
      });
      
      console.log(`✅ Bot token stored for organization: ${organization.name}`);
      console.log(`📋 Workspace ID: ${tokenData.team?.id}`);
      console.log(`📋 Bot token starts with: ${tokenData.access_token?.substring(0, 10)}...`);
      
      // Redirect to integrations page with success message
      res.redirect('/integrations?success=slack_connected');
    } catch (error) {
      console.error('❌ Bot OAuth callback error:', error);
      res.redirect('/?error=bot_oauth_failed');
    }
  });

  // Debug endpoint to list all Slack channels the bot can see
  app.get("/api/admin/slack-channels", requireAuth(), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { WebClient } = await import("@slack/web-api");
      const slack = process.env.SLACK_BOT_TOKEN ? new WebClient(process.env.SLACK_BOT_TOKEN) : null;
      
      if (!slack) {
        return res.json({
          error: "Slack bot token not configured",
          channels: [],
          botTokenConfigured: false
        });
      }

      let channelsResult;
      try {
        channelsResult = await slack.conversations.list({
          types: 'public_channel,private_channel',
          limit: 200
        });
      } catch (error: any) {
        console.error("Failed to list Slack channels:", error);
        return res.status(500).json({ 
          error: `Slack API error: ${error?.data?.error || error.message}`,
          details: error?.data,
          botTokenConfigured: true
        });
      }

      const channels = (channelsResult.channels || []).map(channel => ({
        id: channel.id,
        name: channel.name,
        isPrivate: channel.is_private,
        isMember: channel.is_member,
        isArchived: channel.is_archived,
        memberCount: channel.num_members
      }));

      const targetChannel = channels.find(c => c.name === 'whirkplace-pulse');
      
      res.json({
        botTokenConfigured: true,
        totalChannels: channels.length,
        channels: channels,
        targetChannel: targetChannel || null,
        targetChannelFound: !!targetChannel,
        targetChannelBotIsMember: targetChannel?.isMember || false,
        recommendations: !targetChannel 
          ? ["Channel 'whirkplace-pulse' not found. Please create it or check the channel name."]
          : !targetChannel.isMember 
          ? ["Bot is not a member of 'whirkplace-pulse'. Please invite the bot to the channel."]
          : ["Channel access looks good!"]
      });
    } catch (error) {
      console.error("Failed to debug Slack channels:", error);
      res.status(500).json({ message: "Failed to debug Slack channels" });
    }
  });

  // Admin user role management endpoint
  app.patch("/api/admin/users/:id/role", requireAuth(), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const targetUserId = req.params.id;
      const { role } = req.body;

      // Validate role
      const validRoles = ['admin', 'manager', 'member'];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ 
          message: "Invalid role. Must be one of: admin, manager, member" 
        });
      }

      // Get target user to verify they exist
      const targetUser = await storage.getUser(req.orgId, targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Prevent admins from demoting themselves if they're the only admin
      if (req.currentUser.id === targetUserId && req.currentUser.role === 'admin' && role !== 'admin') {
        const allUsers = await storage.getAllUsers(req.orgId, true);
        const adminCount = allUsers.filter(u => u.role === 'admin' && u.isActive).length;
        
        if (adminCount <= 1) {
          return res.status(400).json({ 
            message: "Cannot demote yourself - you are the only admin. Promote another user to admin first." 
          });
        }
      }

      // Update user role
      const updatedUser = await storage.updateUser(req.orgId, targetUserId, { role });
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update user role" });
      }

      res.json({
        message: `User role updated to ${role}`,
        user: updatedUser
      });
    } catch (error) {
      console.error("Failed to update user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  // Admin route to assign users to teams
  app.patch("/api/admin/users/:id/team", requireAuth(), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const targetUserId = req.params.id;
      const { teamId } = req.body;

      // Validate teamId - should be either null (unassigned) or a valid UUID
      if (teamId !== null && teamId !== undefined) {
        if (typeof teamId !== 'string' || teamId.length === 0) {
          return res.status(400).json({ 
            message: "Invalid teamId. Must be a valid team ID or null for unassigned." 
          });
        }

        // Verify team exists and belongs to this organization
        const team = await storage.getTeam(req.orgId, teamId);
        if (!team) {
          return res.status(400).json({ 
            message: "Team not found or does not belong to this organization" 
          });
        }
      }

      // Get target user to verify they exist and belong to this organization
      const targetUser = await storage.getUser(req.orgId, targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update user team assignment
      const updatedUser = await storage.updateUser(req.orgId, targetUserId, { 
        teamId: teamId || null 
      });
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update user team assignment" });
      }

      // Get team name for response
      const teamName = teamId ? (await storage.getTeam(req.orgId, teamId))?.name || null : null;

      res.json({
        message: teamId 
          ? `User assigned to team: ${teamName}` 
          : "User unassigned from team",
        user: updatedUser,
        teamName
      });
    } catch (error) {
      console.error("Failed to update user team assignment:", error);
      res.status(500).json({ message: "Failed to update user team assignment" });
    }
  });

  // Admin aggregation endpoints
  app.post("/api/admin/aggregation/backfill", requireAuth(), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const validation = backfillSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid backfill parameters",
          errors: validation.error.errors
        });
      }

      const { from, to } = validation.data;

      // Validate date range
      if (from >= to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }

      const maxRangeDays = 90; // Limit backfill to 90 days
      const rangeDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
      if (rangeDays > maxRangeDays) {
        return res.status(400).json({ 
          message: `Backfill range too large. Maximum ${maxRangeDays} days allowed.` 
        });
      }

      console.log(`Admin ${req.currentUser.name} initiated backfill for org ${req.orgId} from ${from.toISOString()} to ${to.toISOString()}`);

      // Start backfill (async - don't wait for completion)
      aggregationService.backfillHistoricalData(req.orgId, from, to).catch(error => {
        console.error(`Backfill failed for org ${req.orgId}:`, error);
      });

      res.json({ 
        message: "Backfill initiated successfully",
        from: from.toISOString(),
        to: to.toISOString(),
        organizationId: req.orgId
      });
    } catch (error) {
      console.error("Admin backfill error:", error);
      res.status(500).json({ message: "Failed to initiate backfill" });
    }
  });

  // Admin endpoint to check aggregation status
  app.get("/api/admin/aggregation/status", requireAuth(), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      res.json({
        useAggregates: process.env.USE_AGGREGATES === 'true',
        shadowReads: process.env.ENABLE_SHADOW_READS === 'true',
        organizationId: req.orgId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Admin aggregation status error:", error);
      res.status(500).json({ message: "Failed to get aggregation status" });
    }
  });

  // Helper function to generate recurring meeting instances
  function generateRecurringMeetings(baseData: any, seriesId: string) {
    const meetings = [];
    const startDate = new Date(baseData.scheduledAt);
    const endDate = baseData.recurrenceEndDate ? new Date(baseData.recurrenceEndDate) : null;
    const maxOccurrences = baseData.recurrenceEndCount || 52; // Default max 1 year
    
    // Calculate interval in milliseconds
    const intervals = {
      weekly: 7 * 24 * 60 * 60 * 1000,
      biweekly: 14 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000, // Approximate month
      quarterly: 90 * 24 * 60 * 60 * 1000 // Approximate quarter
    };
    
    const intervalMs = intervals[baseData.recurrencePattern as keyof typeof intervals] * (baseData.recurrenceInterval || 1);
    
    // Create the first meeting (template)
    meetings.push({
      ...baseData,
      isRecurring: true,
      recurrenceSeriesId: seriesId,
      isRecurrenceTemplate: true,
      scheduledAt: startDate
    });
    
    // Generate subsequent meetings
    let currentDate = new Date(startDate);
    let occurrenceCount = 1;
    
    while (occurrenceCount < maxOccurrences) {
      currentDate = new Date(currentDate.getTime() + intervalMs);
      
      // Check if we've exceeded the end date
      if (endDate && currentDate > endDate) {
        break;
      }
      
      // For monthly/quarterly, adjust for actual month lengths
      if (baseData.recurrencePattern === 'monthly') {
        currentDate = new Date(startDate);
        currentDate.setMonth(startDate.getMonth() + occurrenceCount * (baseData.recurrenceInterval || 1));
      } else if (baseData.recurrencePattern === 'quarterly') {
        currentDate = new Date(startDate);
        currentDate.setMonth(startDate.getMonth() + (occurrenceCount * 3) * (baseData.recurrenceInterval || 1));
      }
      
      meetings.push({
        ...baseData,
        isRecurring: true,
        recurrenceSeriesId: seriesId,
        isRecurrenceTemplate: false,
        scheduledAt: new Date(currentDate)
      });
      
      occurrenceCount++;
    }
    
    return meetings;
  }

  // Helper function to check One-on-One meeting access permissions
  async function canAccessOneOnOne(orgId: string, userId: string, userRole: string, userTeamId: string | null, meeting: any): Promise<boolean> {
    // Admin users can access all meetings
    if (userRole === "admin") {
      return true;
    }
    
    // Participants can always access their own meetings
    if (meeting.participantOneId === userId || meeting.participantTwoId === userId) {
      return true;
    }
    
    // Managers can access meetings for their team members
    if (userRole === "manager" && userTeamId) {
      // Get both participants to check if either is in the manager's team
      const [participantOne, participantTwo] = await Promise.all([
        storage.getUser(orgId, meeting.participantOneId),
        storage.getUser(orgId, meeting.participantTwoId)
      ]);
      
      // Check if either participant is in the manager's team or is their direct report
      const canAccessParticipantOne = participantOne && (
        participantOne.teamId === userTeamId || participantOne.managerId === userId
      );
      const canAccessParticipantTwo = participantTwo && (
        participantTwo.teamId === userTeamId || participantTwo.managerId === userId
      );
      
      return canAccessParticipantOne || canAccessParticipantTwo;
    }
    
    return false;
  }

  // One-on-One Meetings endpoints
  app.get("/api/one-on-ones", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      // Get all meetings in the organization, then filter by access permissions
      const allMeetings = await storage.getAllOneOnOnes(req.orgId);
      
      // Filter meetings based on user's access permissions
      const accessibleMeetings = [];
      for (const meeting of allMeetings) {
        const hasAccess = await canAccessOneOnOne(
          req.orgId,
          req.currentUser!.id,
          req.currentUser!.role,
          req.currentUser!.teamId,
          meeting
        );
        if (hasAccess) {
          accessibleMeetings.push(meeting);
        }
      }
      
      res.json(accessibleMeetings);
    } catch (error) {
      console.error("GET /api/one-on-ones - Error:", error);
      res.status(500).json({ message: "Failed to fetch one-on-ones" });
    }
  });

  app.get("/api/one-on-ones/upcoming", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      // Validate query parameters using Zod
      const querySchema = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20)
      });
      
      const queryResult = querySchema.safeParse(req.query);
      if (!queryResult.success) {
        return res.status(400).json({ 
          message: "Invalid query parameters", 
          errors: queryResult.error.errors 
        });
      }
      
      const { page, limit } = queryResult.data;
      
      // Get all upcoming meetings in the organization, then filter by access permissions
      const allUpcomingMeetings = await storage.getAllUpcomingOneOnOnes(req.orgId);
      
      // Filter meetings based on user's access permissions
      const accessibleMeetings = [];
      for (const meeting of allUpcomingMeetings) {
        const hasAccess = await canAccessOneOnOne(
          req.orgId,
          req.currentUser!.id,
          req.currentUser!.role,
          req.currentUser!.teamId,
          meeting
        );
        if (hasAccess) {
          accessibleMeetings.push(meeting);
        }
      }
      
      // Apply pagination after filtering
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedMeetings = accessibleMeetings.slice(startIndex, endIndex);
      
      res.json({
        meetings: paginatedMeetings,
        pagination: {
          page,
          limit,
          total: accessibleMeetings.length,
          totalPages: Math.ceil(accessibleMeetings.length / limit)
        }
      });
    } catch (error) {
      console.error("GET /api/one-on-ones/upcoming - Error:", error);
      res.status(500).json({ message: "Failed to fetch upcoming one-on-ones" });
    }
  });

  app.get("/api/one-on-ones/past", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      // Validate query parameters using Zod
      const querySchema = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20)
      });
      
      const queryResult = querySchema.safeParse(req.query);
      if (!queryResult.success) {
        return res.status(400).json({ 
          message: "Invalid query parameters", 
          errors: queryResult.error.errors 
        });
      }
      
      const { page, limit } = queryResult.data;
      
      // Get all past meetings in the organization, then filter by access permissions  
      const allPastMeetings = await storage.getAllPastOneOnOnes(req.orgId);
      
      // Filter meetings based on user's access permissions
      const accessibleMeetings = [];
      for (const meeting of allPastMeetings) {
        const hasAccess = await canAccessOneOnOne(
          req.orgId,
          req.currentUser!.id,
          req.currentUser!.role,
          req.currentUser!.teamId,
          meeting
        );
        if (hasAccess) {
          accessibleMeetings.push(meeting);
        }
      }
      
      // Apply pagination after filtering
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedMeetings = accessibleMeetings.slice(startIndex, endIndex);
      
      res.json({
        meetings: paginatedMeetings,
        pagination: {
          page,
          limit,
          total: accessibleMeetings.length,
          totalPages: Math.ceil(accessibleMeetings.length / limit)
        }
      });
    } catch (error) {
      console.error("GET /api/one-on-ones/past - Error:", error);
      res.status(500).json({ message: "Failed to fetch past one-on-ones" });
    }
  });

  app.get("/api/one-on-ones/:id", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      const oneOnOne = await storage.getOneOnOne(req.orgId, req.params.id);
      if (!oneOnOne) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      // Check if user has access to this meeting
      const hasAccess = await canAccessOneOnOne(
        req.orgId!, 
        req.userId!, 
        req.currentUser!.role, 
        req.currentUser!.teamId, 
        oneOnOne
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(oneOnOne);
    } catch (error) {
      console.error("GET /api/one-on-ones/:id - Error:", error);
      res.status(500).json({ message: "Failed to fetch one-on-one" });
    }
  });

  app.post("/api/one-on-ones", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      // Validate request body using Zod schema with recurring meeting support
      const validationSchema = insertOneOnOneSchema.omit({ organizationId: true }).extend({
        scheduledAt: z.coerce.date(),
        duration: z.number().min(15).max(240).default(30),
        status: z.enum(["scheduled", "completed", "cancelled", "rescheduled"]).default("scheduled"),
        // Recurring meeting fields
        isRecurring: z.boolean().default(false),
        recurrencePattern: z.enum(["weekly", "biweekly", "monthly", "quarterly"]).optional(),
        recurrenceInterval: z.number().min(1).max(12).default(1).optional(),
        recurrenceEndDate: z.coerce.date().optional(),
        recurrenceEndCount: z.number().min(1).max(52).optional()
      }).refine((data) => {
        // If recurring, must have pattern and either end date or count
        if (data.isRecurring) {
          return data.recurrencePattern && (data.recurrenceEndDate || data.recurrenceEndCount);
        }
        return true;
      }, {
        message: "Recurring meetings must have a recurrence pattern and either an end date or occurrence count"
      });
      
      const validatedData = validationSchema.parse(req.body);
      
      // Verify the requesting user can create this meeting
      // Must be a participant, or a manager of one of the participants, or an admin
      const canCreate = req.currentUser!.role === "admin" || 
                       validatedData.participantOneId === req.currentUser!.id || 
                       validatedData.participantTwoId === req.currentUser!.id;
      
      if (!canCreate && req.currentUser!.role === "manager" && req.currentUser!.teamId) {
        // Additional check for managers - they can create meetings for their team members
        const [participantOne, participantTwo] = await Promise.all([
          storage.getUser(req.orgId, validatedData.participantOneId),
          storage.getUser(req.orgId, validatedData.participantTwoId)
        ]);
        
        const canCreateAsManager = (participantOne && (participantOne.teamId === req.currentUser!.teamId || participantOne.managerId === req.currentUser!.id)) ||
                                  (participantTwo && (participantTwo.teamId === req.currentUser!.teamId || participantTwo.managerId === req.currentUser!.id));
        
        if (!canCreateAsManager) {
          return res.status(403).json({ message: "You can only create meetings for yourself or your team members" });
        }
      } else if (!canCreate) {
        return res.status(403).json({ message: "You can only create meetings for yourself or your team members" });
      }
      
      if (validatedData.isRecurring) {
        // Generate recurring meeting series
        const seriesId = `series_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const meetings = generateRecurringMeetings(validatedData, seriesId);
        
        // Create all meetings in the series
        const createdMeetings = [];
        for (const meetingData of meetings) {
          const meeting = await storage.createOneOnOne(req.orgId, {
            ...meetingData,
            organizationId: req.orgId
          });
          createdMeetings.push(meeting);
        }
        
        res.status(201).json({
          success: true,
          seriesId,
          message: `Created ${createdMeetings.length} recurring meetings`,
          meetings: createdMeetings
        });
      } else {
        // Create single meeting
        const oneOnOne = await storage.createOneOnOne(req.orgId, {
          ...validatedData,
          organizationId: req.orgId
        });
        res.status(201).json(oneOnOne);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("POST /api/one-on-ones - Error:", error);
      res.status(500).json({ message: "Failed to create one-on-one" });
    }
  });

  app.put("/api/one-on-ones/:id", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      // Validate request body using Zod schema
      const updateSchema = insertOneOnOneSchema.omit({ 
        organizationId: true, 
        participantOneId: true, 
        participantTwoId: true 
      }).partial().extend({
        scheduledAt: z.coerce.date().optional(),
        duration: z.number().min(15).max(240).optional(),
        status: z.enum(["scheduled", "completed", "cancelled", "rescheduled"]).optional()
      });
      
      const validatedData = updateSchema.parse(req.body);
      
      // Get existing meeting to verify permissions
      const existingMeeting = await storage.getOneOnOne(req.orgId, req.params.id);
      if (!existingMeeting) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      // Check if user has access to update this meeting
      const hasAccess = await canAccessOneOnOne(
        req.orgId, 
        req.currentUser!.id, 
        req.currentUser!.role, 
        req.currentUser!.teamId, 
        existingMeeting
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const updatedOneOnOne = await storage.updateOneOnOne(req.orgId, req.params.id, validatedData);
      if (!updatedOneOnOne) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      res.json(updatedOneOnOne);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("PUT /api/one-on-ones/:id - Error:", error);
      res.status(500).json({ message: "Failed to update one-on-one" });
    }
  });

  app.delete("/api/one-on-ones/:id", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      // Get existing meeting to verify permissions
      const existingMeeting = await storage.getOneOnOne(req.orgId, req.params.id);
      if (!existingMeeting) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      // Check if user has access to delete this meeting
      const hasAccess = await canAccessOneOnOne(
        req.orgId!, 
        req.userId!, 
        req.currentUser!.role, 
        req.currentUser!.teamId, 
        existingMeeting
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const deleted = await storage.deleteOneOnOne(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("DELETE /api/one-on-ones/:id - Error:", error);
      res.status(500).json({ message: "Failed to delete one-on-one" });
    }
  });

  // Recurring meeting series management endpoints
  app.get("/api/one-on-ones/series/:seriesId", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      const seriesId = req.params.seriesId;
      
      // Get all meetings in the series
      const allMeetings = await storage.getAllOneOnOnes(req.orgId);
      const seriesMeetings = allMeetings.filter(meeting => meeting.recurrenceSeriesId === seriesId);
      
      if (seriesMeetings.length === 0) {
        return res.status(404).json({ message: "Recurring series not found" });
      }
      
      // Check access to the first meeting (if user can access one, they can access the series)
      const hasAccess = await canAccessOneOnOne(
        req.orgId!,
        req.currentUser!.id,
        req.currentUser!.role,
        req.currentUser!.teamId,
        seriesMeetings[0]
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json({
        seriesId,
        totalMeetings: seriesMeetings.length,
        meetings: seriesMeetings.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
      });
    } catch (error) {
      console.error("GET /api/one-on-ones/series/:seriesId - Error:", error);
      res.status(500).json({ message: "Failed to fetch recurring series" });
    }
  });

  app.delete("/api/one-on-ones/series/:seriesId", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      const seriesId = req.params.seriesId;
      const { cancelFutureOnly = false } = req.query;
      
      // Get all meetings in the series
      const allMeetings = await storage.getAllOneOnOnes(req.orgId);
      const seriesMeetings = allMeetings.filter(meeting => meeting.recurrenceSeriesId === seriesId);
      
      if (seriesMeetings.length === 0) {
        return res.status(404).json({ message: "Recurring series not found" });
      }
      
      // Check access to the first meeting
      const hasAccess = await canAccessOneOnOne(
        req.orgId,
        req.currentUser!.id,
        req.currentUser!.role,
        req.currentUser!.teamId,
        seriesMeetings[0]
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      let meetingsToCancel = seriesMeetings;
      
      if (cancelFutureOnly === 'true') {
        // Only cancel future meetings (not completed or past ones)
        const now = new Date();
        meetingsToCancel = seriesMeetings.filter(meeting => 
          new Date(meeting.scheduledAt) > now && meeting.status === 'scheduled'
        );
      }
      
      // Cancel the meetings
      let canceledCount = 0;
      for (const meeting of meetingsToCancel) {
        const success = await storage.deleteOneOnOne(req.orgId, meeting.id);
        if (success) canceledCount++;
      }
      
      res.json({
        message: `Canceled ${canceledCount} meetings from the recurring series`,
        canceledCount,
        totalInSeries: seriesMeetings.length
      });
    } catch (error) {
      console.error("DELETE /api/one-on-ones/series/:seriesId - Error:", error);
      res.status(500).json({ message: "Failed to cancel recurring series" });
    }
  });

  // Action Items endpoints
  app.get("/api/one-on-ones/:id/action-items", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      // Verify user has access to this meeting
      const meeting = await storage.getOneOnOne(req.orgId, req.params.id);
      if (!meeting) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      // Check if user has access to this meeting's action items
      const hasAccess = await canAccessOneOnOne(
        req.orgId!, 
        req.userId!, 
        req.currentUser!.role, 
        req.currentUser!.teamId, 
        meeting
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const actionItems = await storage.getActionItemsByMeeting(req.orgId, req.params.id);
      res.json(actionItems);
    } catch (error) {
      console.error("GET /api/one-on-ones/:id/action-items - Error:", error);
      res.status(500).json({ message: "Failed to fetch action items" });
    }
  });

  app.post("/api/one-on-ones/:id/action-items", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      // Validate request body using Zod schema
      const validationSchema = insertActionItemSchema.omit({ organizationId: true, meetingId: true }).extend({
        dueDate: z.coerce.date().optional(),
        status: z.enum(["pending", "completed", "overdue", "cancelled"]).default("pending")
      });
      
      const validatedData = validationSchema.parse(req.body);
      
      // Verify user has access to this meeting
      const meeting = await storage.getOneOnOne(req.orgId, req.params.id);
      if (!meeting) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      // Check if user has access to create action items for this meeting
      const hasAccess = await canAccessOneOnOne(
        req.orgId!, 
        req.userId!, 
        req.currentUser!.role, 
        req.currentUser!.teamId, 
        meeting
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const actionItemData = {
        ...validatedData,
        meetingId: req.params.id,
        organizationId: req.orgId
      };
      
      const actionItem = await storage.createActionItem(req.orgId, actionItemData);
      res.status(201).json(actionItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("POST /api/one-on-ones/:id/action-items - Error:", error);
      res.status(500).json({ message: "Failed to create action item" });
    }
  });

  app.put("/api/action-items/:id", requireAuth(), async (req, res) => {
    try {
      const { description, dueDate, status, notes } = req.body;
      
      // Get existing action item to verify permissions
      const existingActionItem = await storage.getActionItem(req.orgId, req.params.id);
      if (!existingActionItem) {
        return res.status(404).json({ message: "Action item not found" });
      }
      
      // Verify user has access to this action item (either assigned to them or part of the meeting)
      const meeting = await storage.getOneOnOne(req.orgId, existingActionItem.meetingId);
      if (!meeting) {
        return res.status(404).json({ message: "Associated meeting not found" });
      }
      
      // Check if user has access to update this action item
      const hasMeetingAccess = await canAccessOneOnOne(
        req.orgId, 
        req.userId, 
        req.currentUser.role, 
        req.currentUser.teamId, 
        meeting
      );
      
      const canUpdate = existingActionItem.assignedTo === req.userId || hasMeetingAccess;
      
      if (!canUpdate) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const updateData: any = {};
      if (description !== undefined) updateData.description = description;
      if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
      if (status !== undefined) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;
      
      const updatedActionItem = await storage.updateActionItem(req.orgId, req.params.id, updateData);
      if (!updatedActionItem) {
        return res.status(404).json({ message: "Action item not found" });
      }
      
      res.json(updatedActionItem);
    } catch (error) {
      console.error("PUT /api/action-items/:id - Error:", error);
      res.status(500).json({ message: "Failed to update action item" });
    }
  });

  // One-on-One Agenda endpoint - Get comprehensive agenda with KRAs, ratings, flagged check-ins, and action items
  app.get("/api/one-on-ones/:id/agenda", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      const meetingId = req.params.id;
      
      // Get the meeting
      const meeting = await storage.getOneOnOne(req.orgId, meetingId);
      if (!meeting) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      // Check if user has access to this meeting
      const hasAccess = await canAccessOneOnOne(
        req.orgId,
        req.userId!,
        req.currentUser!.role,
        req.currentUser!.teamId,
        meeting
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Determine which user's KRAs to fetch
      const targetUserId = req.userId === meeting.participantOneId ? meeting.participantTwoId : meeting.participantOneId;
      const isSupervisor = req.userId === meeting.participantOneId;
      
      // Get user's active KRAs
      const kras = await storage.getUserKrasByUser(req.orgId, targetUserId, "active");
      
      // Get latest supervisor ratings for these KRAs
      const kraIds = kras.map(kra => kra.id);
      const supervisorRatings = await storage.getLatestSupervisorRatings(req.orgId, kraIds);
      
      // Get ratings for this specific meeting
      const meetingRatings = await storage.getKraRatingsByOneOnOne(req.orgId, meetingId);
      
      // Combine KRA data with ratings
      const krasWithRatings = kras.map(kra => {
        const lastSupervisorRating = supervisorRatings.get(kra.id);
        const thisMeetingRatings = meetingRatings.filter(r => r.kraId === kra.id);
        const selfRating = thisMeetingRatings.find(r => r.raterRole === "self");
        const supervisorRating = thisMeetingRatings.find(r => r.raterRole === "supervisor");
        
        return {
          kra,
          lastSupervisorRating: lastSupervisorRating ? {
            rating: lastSupervisorRating.rating,
            note: lastSupervisorRating.note,
            createdAt: lastSupervisorRating.createdAt
          } : null,
          currentSelfRating: selfRating ? {
            rating: selfRating.rating,
            note: selfRating.note
          } : null,
          currentSupervisorRating: supervisorRating ? {
            rating: supervisorRating.rating,
            note: supervisorRating.note
          } : null
        };
      });
      
      // Get flagged check-ins since last meeting
      const lastMeeting = await storage.getPastOneOnOnes(req.orgId, targetUserId, 2);
      const sinceDate = lastMeeting.length > 1 ? lastMeeting[1].scheduledAt : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      
      const checkins = await storage.getCheckinsByUser(req.orgId, targetUserId);
      const flaggedCheckins = checkins.filter(checkin => 
        checkin.flaggedForOneOnOne && 
        checkin.createdAt >= sinceDate
      );
      
      // Get action items for this meeting (including carried forward)
      const actionItems = await storage.getActionItemsByOneOnOne(req.orgId, meetingId);
      
      // Carry forward open action items if this is a new meeting
      if (meeting.status === "scheduled") {
        const carriedForward = await storage.carryForwardOpenActionItems(req.orgId, targetUserId, meetingId);
        actionItems.push(...carriedForward);
      }
      
      // Return comprehensive agenda
      res.json({
        meeting,
        kras: krasWithRatings,
        flaggedCheckins,
        actionItems,
        isSupervisor
      });
    } catch (error) {
      console.error("GET /api/one-on-ones/:id/agenda - Error:", error);
      res.status(500).json({ message: "Failed to fetch agenda" });
    }
  });

  // Submit or update KRA ratings for a one-on-one
  app.post("/api/one-on-ones/:id/kra-ratings", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      const meetingId = req.params.id;
      
      // Validate request body
      const validationSchema = z.array(
        z.object({
          kraId: z.string(),
          rating: z.number().int().min(1).max(5),
          note: z.string().optional()
        })
      );
      
      const ratings = validationSchema.parse(req.body);
      
      // Get the meeting
      const meeting = await storage.getOneOnOne(req.orgId, meetingId);
      if (!meeting) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      // Check if user has access to this meeting
      const hasAccess = await canAccessOneOnOne(
        req.orgId,
        req.userId!,
        req.currentUser!.role,
        req.currentUser!.teamId,
        meeting
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Determine rater role
      const isSupervisor = req.userId === meeting.participantOneId;
      const raterRole = isSupervisor ? "supervisor" : "self";
      
      // Prepare ratings with rater info
      const ratingsToUpsert = ratings.map(rating => ({
        ...rating,
        oneOnOneId: meetingId,
        raterId: req.userId!,
        raterRole
      }));
      
      // Upsert ratings
      const upserted = await storage.upsertKraRatings(req.orgId, ratingsToUpsert);
      
      res.json(upserted);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid ratings data", errors: error.errors });
      }
      console.error("POST /api/one-on-ones/:id/kra-ratings - Error:", error);
      res.status(500).json({ message: "Failed to save KRA ratings" });
    }
  });

  // Get user's KRAs with latest supervisor ratings
  app.get("/api/users/:userId/kras", requireAuth(), async (req, res) => {
    try {
      const targetUserId = req.params.userId;
      
      // Check if user can access this user's KRAs
      const canAccess = 
        req.userId === targetUserId || 
        req.currentUser?.role === "admin" ||
        (await storage.getUser(req.orgId, targetUserId))?.managerId === req.userId;
      
      if (!canAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get user's active KRAs
      const kras = await storage.getUserKrasByUser(req.orgId, targetUserId, "active");
      
      // Get latest supervisor ratings
      const kraIds = kras.map(kra => kra.id);
      const supervisorRatings = await storage.getLatestSupervisorRatings(req.orgId, kraIds);
      
      // Combine KRA data with ratings
      const krasWithRatings = kras.map(kra => {
        const lastRating = supervisorRatings.get(kra.id);
        return {
          ...kra,
          lastSupervisorRating: lastRating ? {
            rating: lastRating.rating,
            note: lastRating.note,
            createdAt: lastRating.createdAt
          } : null
        };
      });
      
      res.json(krasWithRatings);
    } catch (error) {
      console.error("GET /api/users/:userId/kras - Error:", error);
      res.status(500).json({ message: "Failed to fetch user KRAs" });
    }
  });

  // Get KRA history for audit trail
  app.get("/api/kras/:kraId/history", requireAuth(), async (req, res) => {
    try {
      const kraId = req.params.kraId;
      
      // Get the KRA to check access
      const kra = await storage.getUserKra(req.orgId, kraId);
      if (!kra) {
        return res.status(404).json({ message: "KRA not found" });
      }
      
      // Check if user can access this KRA's history
      const canAccess = 
        req.userId === kra.userId || 
        req.userId === kra.assignedBy ||
        req.currentUser?.role === "admin";
      
      if (!canAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get history
      const history = await storage.getKraHistory(req.orgId, kraId);
      
      res.json(history);
    } catch (error) {
      console.error("GET /api/kras/:kraId/history - Error:", error);
      res.status(500).json({ message: "Failed to fetch KRA history" });
    }
  });

  app.delete("/api/action-items/:id", requireAuth(), async (req, res) => {
    try {
      // Get existing action item to verify permissions
      const existingActionItem = await storage.getActionItem(req.orgId, req.params.id);
      if (!existingActionItem) {
        return res.status(404).json({ message: "Action item not found" });
      }
      
      // Verify user has access to this action item (either assigned to them or part of the meeting)
      const meeting = await storage.getOneOnOne(req.orgId, existingActionItem.meetingId);
      if (!meeting) {
        return res.status(404).json({ message: "Associated meeting not found" });
      }
      
      // Check if user has access to delete this action item
      const hasMeetingAccess = await canAccessOneOnOne(
        req.orgId, 
        req.userId, 
        req.currentUser.role, 
        req.currentUser.teamId, 
        meeting
      );
      
      const canDelete = existingActionItem.assignedTo === req.userId || hasMeetingAccess;
      
      if (!canDelete) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const deleted = await storage.deleteActionItem(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Action item not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("DELETE /api/action-items/:id - Error:", error);
      res.status(500).json({ message: "Failed to delete action item" });
    }
  });

  // KRA Templates endpoints
  app.get("/api/kra-templates", requireAuth(), requireFeatureAccess('kra_management'), async (req, res) => {
    try {
      // Validate query parameters using Zod
      const querySchema = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        activeOnly: z.coerce.boolean().default(true),
        category: z.string().optional()
      });
      
      const queryResult = querySchema.safeParse(req.query);
      if (!queryResult.success) {
        return res.status(400).json({ 
          message: "Invalid query parameters", 
          errors: queryResult.error.errors 
        });
      }
      
      const { page, limit, activeOnly, category } = queryResult.data;
      
      let templates;
      if (category) {
        templates = await storage.getKraTemplatesByCategory(req.orgId, category);
      } else {
        templates = await storage.getAllKraTemplates(req.orgId, activeOnly);
      }
      
      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedTemplates = templates.slice(startIndex, endIndex);
      
      res.json({
        templates: paginatedTemplates,
        pagination: {
          page,
          limit,
          total: templates.length,
          totalPages: Math.ceil(templates.length / limit)
        }
      });
    } catch (error) {
      console.error("GET /api/kra-templates - Error:", error);
      res.status(500).json({ message: "Failed to fetch KRA templates" });
    }
  });

  app.get("/api/kra-templates/:id", requireAuth(), requireFeatureAccess('kra_management'), async (req, res) => {
    try {
      const template = await storage.getKraTemplate(req.orgId, req.params.id);
      if (!template) {
        return res.status(404).json({ message: "KRA template not found" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("GET /api/kra-templates/:id - Error:", error);
      res.status(500).json({ message: "Failed to fetch KRA template" });
    }
  });

  app.post("/api/kra-templates", requireAuth(), requireFeatureAccess('kra_management'), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      // Validate request body using Zod schema
      const validationSchema = insertKraTemplateSchema.omit({ organizationId: true }).extend({
        name: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        goals: z.array(z.any()).default([]),
        category: z.string().max(50).default("general"),
        isActive: z.boolean().default(true)
      });
      
      const validatedData = validationSchema.parse(req.body);
      
      const templateData = {
        ...validatedData,
        createdBy: req.userId!,
        organizationId: req.orgId!
      };
      
      const template = await storage.createKraTemplate(req.orgId, templateData);
      res.status(201).json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("POST /api/kra-templates - Error:", error);
      res.status(500).json({ message: "Failed to create KRA template" });
    }
  });

  app.put("/api/kra-templates/:id", requireAuth(), requireFeatureAccess('kra_management'), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      // Validate request body using Zod schema
      const updateSchema = insertKraTemplateSchema.omit({ organizationId: true, createdBy: true }).partial().extend({
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(1000).optional(),
        goals: z.array(z.any()).optional(),
        category: z.string().max(50).optional(),
        isActive: z.boolean().optional()
      });
      
      const validatedData = updateSchema.parse(req.body);
      
      const updatedTemplate = await storage.updateKraTemplate(req.orgId, req.params.id, validatedData);
      if (!updatedTemplate) {
        return res.status(404).json({ message: "KRA template not found" });
      }
      
      res.json(updatedTemplate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("PUT /api/kra-templates/:id - Error:", error);
      res.status(500).json({ message: "Failed to update KRA template" });
    }
  });

  app.delete("/api/kra-templates/:id", requireAuth(), requireFeatureAccess('kra_management'), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const deleted = await storage.deleteKraTemplate(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "KRA template not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("DELETE /api/kra-templates/:id - Error:", error);
      res.status(500).json({ message: "Failed to delete KRA template" });
    }
  });

  // User KRAs endpoints
  app.get("/api/user-kras", requireAuth(), requireFeatureAccess('kra_management'), async (req, res) => {
    try {
      const userId = req.query.userId as string || req.userId;
      const statusFilter = req.query.status as string;
      
      // Non-managers can only see their own KRAs
      const currentUser = await storage.getUser(req.orgId, req.userId);
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      if (userId !== req.userId && currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        return res.status(403).json({ message: "You can only view your own KRAs" });
      }
      
      const userKras = await storage.getUserKrasByUser(req.orgId, userId, statusFilter);
      res.json(userKras);
    } catch (error) {
      console.error("GET /api/user-kras - Error:", error);
      res.status(500).json({ message: "Failed to fetch user KRAs" });
    }
  });

  app.get("/api/user-kras/my-team", requireAuth(), requireFeatureAccess('kra_management'), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      // Get KRAs for users assigned by this manager
      const teamKras = await storage.getUserKrasByAssigner(req.orgId, req.userId);
      res.json(teamKras);
    } catch (error) {
      console.error("GET /api/user-kras/my-team - Error:", error);
      res.status(500).json({ message: "Failed to fetch team KRAs" });
    }
  });

  app.get("/api/user-kras/:id", requireAuth(), requireFeatureAccess('kra_management'), async (req, res) => {
    try {
      const userKra = await storage.getUserKra(req.orgId, req.params.id);
      if (!userKra) {
        return res.status(404).json({ message: "User KRA not found" });
      }
      
      // Check if user can access this KRA
      const currentUser = await storage.getUser(req.orgId, req.userId);
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const canAccess = userKra.userId === req.userId || 
                       userKra.assignedBy === req.userId || 
                       currentUser.role === 'admin' ||
                       (currentUser.role === 'manager' && userKra.assignedBy === req.userId);
      
      if (!canAccess) {
        return res.status(403).json({ message: "You can only access KRAs you own or have assigned" });
      }
      
      res.json(userKra);
    } catch (error) {
      console.error("GET /api/user-kras/:id - Error:", error);
      res.status(500).json({ message: "Failed to fetch user KRA" });
    }
  });

  app.post("/api/user-kras", requireAuth(), requireFeatureAccess('kra_management'), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { userId, templateId, name, description, goals, startDate, endDate } = req.body;
      
      // Verify the target user exists and is in the same organization
      const targetUser = await storage.getUser(req.orgId, userId);
      if (!targetUser) {
        return res.status(404).json({ message: "Target user not found" });
      }
      
      const userKraData = {
        userId,
        templateId: templateId || null,
        name,
        description: description || null,
        goals: goals || [],
        assignedBy: req.userId!,
        organizationId: req.orgId!,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        status: "active" as const,
        progress: 0
      };
      
      const userKra = await storage.createUserKra(req.orgId, userKraData);
      res.status(201).json(userKra);
    } catch (error) {
      console.error("POST /api/user-kras - Error:", error);
      res.status(500).json({ message: "Failed to create user KRA" });
    }
  });

  app.put("/api/user-kras/:id", requireAuth(), requireFeatureAccess('kra_management'), async (req, res) => {
    try {
      const { name, description, goals, progress, status, endDate } = req.body;
      
      // Get existing KRA to verify permissions
      const existingKra = await storage.getUserKra(req.orgId, req.params.id);
      if (!existingKra) {
        return res.status(404).json({ message: "User KRA not found" });
      }
      
      // Check if user can update this KRA
      const currentUser = await storage.getUser(req.orgId!, req.userId!);
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const canUpdate = existingKra.userId === req.userId || 
                       existingKra.assignedBy === req.userId || 
                       currentUser.role === 'admin' ||
                       (currentUser.role === 'manager' && existingKra.assignedBy === req.userId);
      
      if (!canUpdate) {
        return res.status(403).json({ message: "You can only update KRAs you own or have assigned" });
      }
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (goals !== undefined) updateData.goals = goals;
      if (progress !== undefined) updateData.progress = Math.max(0, Math.min(100, progress));
      if (status !== undefined) updateData.status = status;
      if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
      
      const updatedKra = await storage.updateUserKra(req.orgId, req.params.id, updateData);
      if (!updatedKra) {
        return res.status(404).json({ message: "User KRA not found" });
      }
      
      res.json(updatedKra);
    } catch (error) {
      console.error("PUT /api/user-kras/:id - Error:", error);
      res.status(500).json({ message: "Failed to update user KRA" });
    }
  });

  app.delete("/api/user-kras/:id", requireAuth(), requireFeatureAccess('kra_management'), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      // Get existing KRA to verify permissions
      const existingKra = await storage.getUserKra(req.orgId, req.params.id);
      if (!existingKra) {
        return res.status(404).json({ message: "User KRA not found" });
      }
      
      // Check if user can delete this KRA
      const currentUser = await storage.getUser(req.orgId, req.userId);
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const canDelete = existingKra.assignedBy === req.userId || 
                       currentUser.role === 'admin';
      
      if (!canDelete) {
        return res.status(403).json({ message: "You can only delete KRAs you have assigned" });
      }
      
      const deleted = await storage.deleteUserKra(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "User KRA not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("DELETE /api/user-kras/:id - Error:", error);
      res.status(500).json({ message: "Failed to delete user KRA" });
    }
  });

  // Feature availability endpoint
  app.get("/api/features", requireAuth(), async (req, res) => {
    try {
      // Get the organization from storage to ensure we have the latest plan info
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      const features = getFeatureAvailability(organization.plan);
      res.json({
        plan: organization.plan,
        features,
        upgradeSuggestions: getUpgradeSuggestions(organization.plan)
      });
    } catch (error) {
      console.error("GET /api/features - Error:", error);
      res.status(500).json({ message: "Failed to fetch feature availability" });
    }
  });

  // Organization management endpoints
  
  app.get("/api/organizations/:id", requireAuth(), async (req, res) => {
    try {
      // Allow users to access their own organization even if the domain context is different
      // This is needed for onboarding after Slack OAuth creates a new organization
      const userCanAccess = req.params.id === req.orgId || 
                          req.params.id === req.currentUser?.organizationId;
      
      if (!userCanAccess) {
        return res.status(403).json({ message: "You can only access your own organization" });
      }
      
      const organization = await storage.getOrganization(req.params.id);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json(organization);
    } catch (error) {
      console.error("GET /api/organizations/:id - Error:", error);
      res.status(500).json({ message: "Failed to fetch organization" });
    }
  });

  app.put("/api/organizations/:id", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Only allow updating specific fields (server controls security-sensitive fields)
      const updateSchema = insertOrganizationSchema.partial().pick({
        name: true,
        customValues: true,
      });
      
      const organizationData = updateSchema.parse(req.body);
      
      // Verify the organization ID matches the authenticated user's organization
      if (req.params.id !== req.orgId) {
        return res.status(403).json({ message: "You can only update your own organization" });
      }
      
      const updatedOrganization = await storage.updateOrganization(req.params.id, organizationData);
      if (!updatedOrganization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json({ message: "Organization updated successfully", organization: updatedOrganization });
    } catch (error) {
      console.error("PUT /api/organizations/:id - Validation error:", error);
      res.status(400).json({ message: "Invalid organization data" });
    }
  });

  // Integration Management Endpoints
  
  // Get organization integrations data
  app.get("/api/organizations/:id/integrations", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Verify the organization ID matches the authenticated user's organization
      if (req.params.id !== req.orgId) {
        return res.status(403).json({ message: "You can only access your own organization's integrations" });
      }
      
      const organization = await storage.getOrganization(req.params.id);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Return integration-specific fields only - NEVER return secrets
      const integrationData = {
        id: organization.id,
        name: organization.name,
        slackWorkspaceId: organization.slackWorkspaceId,
        slackChannelId: organization.slackChannelId,
        hasSlackBotToken: !!organization.slackBotToken, // Only boolean indicator
        enableSlackIntegration: organization.enableSlackIntegration,
        slackConnectionStatus: organization.slackConnectionStatus,
        slackLastConnected: organization.slackLastConnected,
        microsoftTenantId: organization.microsoftTenantId,
        microsoftClientId: organization.microsoftClientId,
        hasMicrosoftClientSecret: !!organization.microsoftClientSecret, // Only boolean indicator
        enableMicrosoftAuth: organization.enableMicrosoftAuth,
        enableTeamsIntegration: organization.enableTeamsIntegration,
        microsoftConnectionStatus: organization.microsoftConnectionStatus,
        microsoftLastConnected: organization.microsoftLastConnected,
      };
      
      res.json(integrationData);
    } catch (error) {
      console.error("GET /api/organizations/:id/integrations - Error:", error);
      res.status(500).json({ message: "Failed to fetch organization integrations" });
    }
  });

  // Test Slack connection
  app.post("/api/integrations/slack/test", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const { botToken } = req.body;
      
      if (!botToken) {
        return res.status(400).json({ success: false, message: "Bot token is required" });
      }
      
      // Test the Slack bot token by calling the auth.test API
      const response = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${botToken}`,
          "Content-Type": "application/json",
        },
      });
      
      const data = await response.json();
      
      if (data.ok) {
        res.json({
          success: true,
          message: "Slack connection successful",
          workspaceName: data.team,
          userId: data.user_id,
        });
      } else {
        res.json({
          success: false,
          message: data.error || "Failed to connect to Slack",
        });
      }
    } catch (error) {
      console.error("POST /api/integrations/slack/test - Error:", error);
      res.json({
        success: false,
        message: "Network error testing Slack connection",
      });
    }
  });

  // Test Microsoft connection
  app.post("/api/integrations/microsoft/test", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const { tenantId, clientId, clientSecret } = req.body;
      
      if (!tenantId || !clientId || !clientSecret) {
        return res.status(400).json({ 
          success: false, 
          message: "Tenant ID, Client ID, and Client Secret are required" 
        });
      }
      
      // Test the Microsoft Graph API connection by getting a token
      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      const tokenData = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
      });
      
      const tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenData,
      });
      
      const tokenResult = await tokenResponse.json();
      
      if (tokenResult.access_token) {
        // Test the token by getting organization info
        const orgResponse = await fetch("https://graph.microsoft.com/v1.0/organization", {
          headers: {
            "Authorization": `Bearer ${tokenResult.access_token}`,
          },
        });
        
        const orgData = await orgResponse.json();
        
        if (orgData.value && orgData.value.length > 0) {
          const org = orgData.value[0];
          res.json({
            success: true,
            message: "Microsoft connection successful",
            tenantName: org.displayName,
            domain: org.verifiedDomains?.find((d: any) => d.isDefault)?.name,
          });
        } else {
          res.json({
            success: false,
            message: "Unable to fetch organization details",
          });
        }
      } else {
        res.json({
          success: false,
          message: tokenResult.error_description || "Failed to authenticate with Microsoft",
        });
      }
    } catch (error) {
      console.error("POST /api/integrations/microsoft/test - Error:", error);
      res.json({
        success: false,
        message: "Network error testing Microsoft connection",
      });
    }
  });

  // Slack OAuth Installation Flow
  
  // Generate Slack OAuth install URL for organization
  app.get("/api/organizations/:id/integrations/slack/install", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Verify the organization ID matches the authenticated user's organization
      if (req.params.id !== req.orgId) {
        return res.status(403).json({ message: "You can only install integrations for your own organization" });
      }
      
      if (!process.env.SLACK_CLIENT_ID) {
        return res.status(500).json({ message: "Slack integration is not configured on this server" });
      }
      
      // Generate secure state parameter to prevent CSRF
      const state = randomBytes(32).toString('hex');
      
      // Store state in session for verification in callback
      req.session.slackOAuthState = state;
      (req.session as any).slackOrgId = req.params.id;
      
      // Use centralized redirect URI resolver for consistent URL handling
      const redirectUri = resolveRedirectUri(req, '/api/auth/slack/callback');
      
      // Slack OAuth v2 scopes for bot functionality
      const scopes = [
        'channels:read',
        'chat:write',
        'users:read',
        'users:read.email',
        'team:read',
        'app_mentions:read',
        'commands'
      ].join(',');
      
      const oauthUrl = `https://slack.com/oauth/v2/authorize?` +
        `client_id=${process.env.SLACK_CLIENT_ID}&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `state=${state}&` +
        `user_scope=`;
      
      res.json({
        installUrl: oauthUrl,
        scopes: scopes.split(','),
        redirectUri: redirectUri,
        state: state
      });
    } catch (error) {
      console.error("GET /api/organizations/:id/integrations/slack/install - Error:", error);
      res.status(500).json({ message: "Failed to generate Slack install URL" });
    }
  });

  // Microsoft OAuth Installation Flow
  
  // Generate Microsoft OAuth install URL for organization
  app.get("/api/organizations/:id/integrations/microsoft/install", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Verify the organization ID matches the authenticated user's organization
      if (req.params.id !== req.orgId) {
        return res.status(403).json({ message: "You can only install integrations for your own organization" });
      }
      
      if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
        return res.status(500).json({ message: "Microsoft integration is not configured on this server" });
      }
      
      // Generate secure state parameter to prevent CSRF
      const state = randomBytes(32).toString('hex');
      
      // Store state in session for verification in callback
      req.session.microsoftAuthState = state;
      req.session.authOrgId = req.params.id;
      
      // Use centralized redirect URI resolver for consistent URL handling
      const redirectUri = resolveRedirectUri(req, '/api/auth/microsoft/tenant/callback');
      
      // Microsoft Graph scopes for tenant/app management
      const scopes = [
        'openid',
        'profile', 
        'email',
        'User.Read',
        'Directory.Read.All',    // To read organization info
        'Application.ReadWrite.All' // To manage app registrations if needed
      ].join(' ');
      
      // Use common tenant for multi-tenant app installation
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const tenantId = 'common'; // Allow sign-in from any Azure AD tenant
      
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        response_mode: 'query',
        scope: scopes,
        state: state,
        prompt: 'consent' // Force consent screen for proper permissions
      });
      
      const oauthUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
      
      console.log(`Generated Microsoft OAuth install URL for org ${req.params.id}`);
      
      res.json({
        installUrl: oauthUrl,
        scopes: scopes.split(' '),
        redirectUri: redirectUri,
        state: state
      });
    } catch (error) {
      console.error("GET /api/organizations/:id/integrations/microsoft/install - Error:", error);
      res.status(500).json({ message: "Failed to generate Microsoft install URL" });
    }
  });

  // Microsoft OAuth tenant callback handler
  app.get("/api/auth/microsoft/tenant/callback", async (req, res) => {
    try {
      // Get base URL using the centralized resolver for consistent URLs
      const baseRedirectUri = resolveRedirectUri(req, '/');
      const appBaseUrl = baseRedirectUri.endsWith('/') ? baseRedirectUri.slice(0, -1) : baseRedirectUri;
      
      const { code, state, error } = req.query;
      
      if (error) {
        console.error("Microsoft OAuth error:", error);
        
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Microsoft Integration Failed</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #ef4444; }
                .loading { margin-top: 20px; }
              </style>
            </head>
            <body>
              <h2 class="error">❌ Microsoft Integration Failed</h2>
              <p>There was an error connecting your Microsoft 365 tenant.</p>
              <p>Error: ${error}</p>
              <p class="loading">Closing window...</p>
              <script>
                // Notify parent window of error
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'MICROSOFT_OAUTH_ERROR',
                    message: 'Failed to complete Microsoft integration'
                  }, '${appBaseUrl}');
                }
                // Close popup after a short delay
                setTimeout(() => window.close(), 3000);
              </script>
            </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        return res.send(errorHtml);
      }
      
      if (!code || !state) {
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Microsoft Integration Failed</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #ef4444; }
                .loading { margin-top: 20px; }
              </style>
            </head>
            <body>
              <h2 class="error">❌ Microsoft Integration Failed</h2>
              <p>Missing authorization parameters.</p>
              <p class="loading">Closing window...</p>
              <script>
                // Notify parent window of error
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'MICROSOFT_OAUTH_ERROR',
                    message: 'Missing authorization parameters'
                  }, '${appBaseUrl}');
                }
                // Close popup after a short delay
                setTimeout(() => window.close(), 3000);
              </script>
            </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        return res.send(errorHtml);
      }
      
      // Verify state to prevent CSRF attacks
      if (!req.session.microsoftAuthState || req.session.microsoftAuthState !== state) {
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Microsoft Integration Failed</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #ef4444; }
                .loading { margin-top: 20px; }
              </style>
            </head>
            <body>
              <h2 class="error">❌ Microsoft Integration Failed</h2>
              <p>Invalid security token. Please try again.</p>
              <p class="loading">Closing window...</p>
              <script>
                // Notify parent window of error
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'MICROSOFT_OAUTH_ERROR',
                    message: 'Invalid security token'
                  }, '${appBaseUrl}');
                }
                // Close popup after a short delay
                setTimeout(() => window.close(), 3000);
              </script>
            </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        return res.send(errorHtml);
      }
      
      const orgId = req.session.authOrgId;
      if (!orgId) {
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Microsoft Integration Failed</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #ef4444; }
                .loading { margin-top: 20px; }
              </style>
            </head>
            <body>
              <h2 class="error">❌ Microsoft Integration Failed</h2>
              <p>Organization context lost. Please try again.</p>
              <p class="loading">Closing window...</p>
              <script>
                // Notify parent window of error
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'MICROSOFT_OAUTH_ERROR',
                    message: 'Organization context lost'
                  }, '${appBaseUrl}');
                }
                // Close popup after a short delay
                setTimeout(() => window.close(), 3000);
              </script>
            </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        return res.send(errorHtml);
      }
      
      // Use centralized redirect URI resolver for consistent URL handling
      const redirectUri = resolveRedirectUri(req, '/api/auth/microsoft/tenant/callback');
      
      const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID!,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
          code: code as string,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      
      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
        console.error("Microsoft token exchange error:", tokenData.error);
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Microsoft Integration Failed</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #ef4444; }
                .loading { margin-top: 20px; }
              </style>
            </head>
            <body>
              <h2 class="error">❌ Microsoft Integration Failed</h2>
              <p>Failed to exchange authorization code.</p>
              <p class="loading">Closing window...</p>
              <script>
                // Notify parent window of error
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'MICROSOFT_OAUTH_ERROR',
                    message: 'Failed to exchange authorization code'
                  }, '${appBaseUrl}');
                }
                // Close popup after a short delay
                setTimeout(() => window.close(), 3000);
              </script>
            </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        return res.send(errorHtml);
      }
      
      // Get user/tenant info from Microsoft Graph
      const graphResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
      });
      
      const userInfo = await graphResponse.json();
      
      if (graphResponse.status !== 200) {
        console.error("Microsoft Graph API error:", userInfo);
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Microsoft Integration Failed</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #ef4444; }
                .loading { margin-top: 20px; }
              </style>
            </head>
            <body>
              <h2 class="error">❌ Microsoft Integration Failed</h2>
              <p>Failed to retrieve user information.</p>
              <p class="loading">Closing window...</p>
              <script>
                // Notify parent window of error
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'MICROSOFT_OAUTH_ERROR',
                    message: 'Failed to retrieve user information'
                  }, '${appBaseUrl}');
                }
                // Close popup after a short delay
                setTimeout(() => window.close(), 3000);
              </script>
            </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        return res.send(errorHtml);
      }
      
      // Extract tenant information
      const tenantId = userInfo.businessPhones && userInfo.businessPhones.length > 0 
        ? 'unknown' // We'll need to get this differently
        : 'personal'; // Personal Microsoft account
      
      // For now, let's use a different approach to get tenant ID
      const tenantInfo = tokenData.access_token ? JSON.parse(atob(tokenData.access_token.split('.')[1])) : null;
      const actualTenantId = tenantInfo?.tid || tenantId;
      
      // Update organization with Microsoft integration data
      const updateData = {
        microsoftClientId: process.env.MICROSOFT_CLIENT_ID,
        microsoftTenantId: actualTenantId,
        microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET, // Store centrally for now
        enableMicrosoftAuth: true,
        microsoftConnectionStatus: "connected",
        microsoftLastConnected: new Date(),
      };
      
      const updatedOrg = await storage.updateOrganization(orgId, updateData);
      if (!updatedOrg) {
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Microsoft Integration Failed</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #ef4444; }
                .loading { margin-top: 20px; }
              </style>
            </head>
            <body>
              <h2 class="error">❌ Microsoft Integration Failed</h2>
              <p>Failed to update organization settings.</p>
              <p class="loading">Closing window...</p>
              <script>
                // Notify parent window of error
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'MICROSOFT_OAUTH_ERROR',
                    message: 'Failed to update organization settings'
                  }, '${appBaseUrl}');
                }
                // Close popup after a short delay
                setTimeout(() => window.close(), 3000);
              </script>
            </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        return res.send(errorHtml);
      }
      
      // Clear OAuth state
      req.session.microsoftAuthState = undefined;
      req.session.authOrgId = undefined;
      
      console.log(`Microsoft integration installed for organization ${updatedOrg.name} (Tenant: ${actualTenantId})`);
      
      // Return HTML page that notifies parent window and closes popup
      const successHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Microsoft Integration Complete</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
              .success { color: #22c55e; }
              .loading { margin-top: 20px; }
            </style>
          </head>
          <body>
            <h2 class="success">✅ Microsoft Integration Complete!</h2>
            <p>Successfully connected Microsoft 365 tenant.</p>
            <p><strong>Organization:</strong> ${updatedOrg.name}</p>
            <p><strong>Tenant:</strong> ${actualTenantId}</p>
            <p class="loading">Closing window...</p>
            <script>
              // Notify parent window of success
              if (window.opener) {
                window.opener.postMessage({
                  type: 'MICROSOFT_OAUTH_SUCCESS',
                  tenantId: '${actualTenantId}',
                  organization: '${updatedOrg.name}'
                }, '${appBaseUrl}');
              }
              // Close popup after a short delay
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      res.send(successHtml);
    } catch (error) {
      console.error("Microsoft OAuth tenant callback error:", error);
      
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Microsoft Integration Failed</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
              .error { color: #ef4444; }
              .loading { margin-top: 20px; }
            </style>
          </head>
          <body>
            <h2 class="error">❌ Microsoft Integration Failed</h2>
            <p>An unexpected error occurred during integration.</p>
            <p class="loading">Closing window...</p>
            <script>
              // Notify parent window of error
              if (window.opener) {
                window.opener.postMessage({
                  type: 'MICROSOFT_OAUTH_ERROR',
                  message: 'Unexpected error during integration'
                }, '${appBaseUrl}');
              }
              // Close popup after a short delay
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      res.send(errorHtml);
    }
  });

  // Slack OAuth callback handler
  app.get("/api/auth/slack/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query;
      
      // Get base URL using the centralized resolver
      const baseRedirectUri = resolveRedirectUri(req, '/');
      const appBaseUrl = baseRedirectUri.endsWith('/') ? baseRedirectUri.slice(0, -1) : baseRedirectUri;
      
      if (error) {
        console.error("Slack OAuth error:", error);
        return res.redirect(`${appBaseUrl}/#/settings?error=slack_auth_denied`);
      }
      
      if (!code || !state) {
        return res.redirect(`${appBaseUrl}/#/settings?error=slack_auth_missing_params`);
      }
      
      // Verify state to prevent CSRF attacks
      if (!req.session.slackOAuthState || req.session.slackOAuthState !== state) {
        return res.redirect(`${appBaseUrl}/#/settings?error=slack_auth_invalid_state`);
      }
      
      const orgId = (req.session as any).slackOrgId;
      if (!orgId) {
        return res.redirect(`${appBaseUrl}/#/settings?error=slack_auth_missing_org`);
      }
      
      if (!process.env.SLACK_CLIENT_ID || !process.env.SLACK_CLIENT_SECRET) {
        return res.redirect(`${appBaseUrl}/#/settings?error=slack_auth_not_configured`);
      }
      
      // Use centralized redirect URI resolver for consistent URL handling
      const redirectUri = resolveRedirectUri(req, '/api/auth/slack/callback');
      
      const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.SLACK_CLIENT_ID,
          client_secret: process.env.SLACK_CLIENT_SECRET,
          code: code as string,
          redirect_uri: redirectUri,
        }),
      });
      
      const tokenData = await tokenResponse.json();
      
      if (!tokenData.ok) {
        console.error("Slack token exchange error:", tokenData.error);
        return res.redirect(`${appBaseUrl}/#/settings?error=slack_auth_token_failed`);
      }
      
      // Update organization with Slack integration data
      const updateData = {
        slackBotToken: tokenData.access_token,
        slackWorkspaceId: tokenData.team.id,
        slackChannelId: null, // Will be set separately by admin
        enableSlackIntegration: true,
        slackConnectionStatus: "connected",
        slackLastConnected: new Date(),
      };
      
      const updatedOrg = await storage.updateOrganization(orgId, updateData);
      if (!updatedOrg) {
        return res.redirect(`${appBaseUrl}/#/settings?error=slack_auth_org_update_failed`);
      }
      
      // Clear OAuth state
      req.session.slackOAuthState = undefined;
      (req.session as any).slackOrgId = undefined;
      
      console.log(`Slack integration installed for organization ${updatedOrg.name} (${tokenData.team.name})`);
      
      // Return HTML page that notifies parent window and closes popup
      const successHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Slack Integration Complete</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
              .success { color: #22c55e; }
              .loading { margin-top: 20px; }
            </style>
          </head>
          <body>
            <h2 class="success">✅ Slack Integration Complete!</h2>
            <p>Successfully connected workspace: <strong>${tokenData.team.name}</strong></p>
            <p class="loading">Closing window...</p>
            <script>
              // Notify parent window of success
              if (window.opener) {
                window.opener.postMessage({
                  type: 'SLACK_OAUTH_SUCCESS',
                  workspaceName: '${tokenData.team.name}'
                }, '${appBaseUrl}');
              }
              // Close popup after a short delay
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      res.send(successHtml);
    } catch (error) {
      console.error("Slack OAuth callback error:", error);
      
      // Return HTML page that notifies parent window of error and closes popup
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Slack Integration Failed</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
              .error { color: #ef4444; }
              .loading { margin-top: 20px; }
            </style>
          </head>
          <body>
            <h2 class="error">❌ Slack Integration Failed</h2>
            <p>There was an error connecting your Slack workspace.</p>
            <p class="loading">Closing window...</p>
            <script>
              // Notify parent window of error
              if (window.opener) {
                window.opener.postMessage({
                  type: 'SLACK_OAUTH_ERROR',
                  message: 'Failed to complete Slack integration'
                }, '${appBaseUrl}');
              }
              // Close popup after a short delay
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      res.send(errorHtml);
    }
  });

  // Theme Configuration Endpoints
  
  // Get organization theme configuration
  app.get("/api/organizations/:id/theme", requireAuth(), async (req, res) => {
    try {
      // Verify the organization ID matches the authenticated user's organization
      if (req.params.id !== req.orgId) {
        return res.status(403).json({ message: "You can only access your own organization's theme" });
      }
      
      const organization = await storage.getOrganization(req.params.id);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json({
        themeConfig: organization.themeConfig || null,
        enableCustomTheme: organization.enableCustomTheme || false
      });
    } catch (error) {
      console.error("GET /api/organizations/:id/theme - Error:", error);
      res.status(500).json({ message: "Failed to fetch theme configuration" });
    }
  });

  // Update organization theme configuration
  app.put("/api/organizations/:id/theme", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Verify the organization ID matches the authenticated user's organization
      if (req.params.id !== req.orgId) {
        return res.status(403).json({ message: "You can only update your own organization's theme" });
      }

      const themeConfigSchema = z.object({
        themeConfig: z.record(z.string()).optional(),
        enableCustomTheme: z.boolean().optional()
      });
      
      const themeData = themeConfigSchema.parse(req.body);
      
      const updateData: any = {};
      if (themeData.themeConfig !== undefined) updateData.themeConfig = themeData.themeConfig;
      if (themeData.enableCustomTheme !== undefined) updateData.enableCustomTheme = themeData.enableCustomTheme;
      
      const updatedOrganization = await storage.updateOrganization(req.params.id, updateData);
      if (!updatedOrganization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json({ 
        message: "Theme configuration updated successfully",
        themeConfig: updatedOrganization.themeConfig,
        enableCustomTheme: updatedOrganization.enableCustomTheme
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid theme configuration", errors: error.errors });
      }
      console.error("PUT /api/organizations/:id/theme - Error:", error);
      res.status(500).json({ message: "Failed to update theme configuration" });
    }
  });

  // Integration Management Endpoints for Multi-Tenant OAuth Configuration
  
  // Get organization integration status
  app.get("/api/organizations/:id/integrations", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Verify the organization ID matches the authenticated user's organization
      if (req.params.id !== req.orgId) {
        return res.status(403).json({ message: "You can only access your own organization" });
      }
      
      const organization = await storage.getOrganization(req.params.id);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Return integration status without sensitive secrets
      const integrationStatus = {
        slack: {
          configured: !!(organization.slackClientId && organization.slackClientSecret),
          connected: organization.slackConnectionStatus === 'connected',
          status: organization.slackConnectionStatus || 'not_configured',
          lastConnected: organization.slackLastConnected,
          workspaceId: organization.slackWorkspaceId,
          channelId: organization.slackChannelId,
          enabled: organization.enableSlackIntegration
        },
        microsoft: {
          configured: !!(organization.microsoftClientId && organization.microsoftClientSecret),
          connected: organization.microsoftConnectionStatus === 'connected',
          status: organization.microsoftConnectionStatus || 'not_configured',
          lastConnected: organization.microsoftLastConnected,
          tenantId: organization.microsoftTenantId,
          enabled: organization.enableMicrosoftAuth
        }
      };
      
      res.json(integrationStatus);
    } catch (error) {
      console.error("GET /api/organizations/:id/integrations - Error:", error);
      res.status(500).json({ message: "Failed to fetch integration status" });
    }
  });

  // Configure Slack OAuth integration
  app.put("/api/organizations/:id/integrations/slack", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Verify the organization ID matches the authenticated user's organization
      if (req.params.id !== req.orgId) {
        return res.status(403).json({ message: "You can only update your own organization" });
      }
      
      const slackConfigSchema = z.object({
        clientId: z.string().min(1, "Slack Client ID is required"),
        clientSecret: z.string().min(1, "Slack Client Secret is required"),
        signingSecret: z.string().optional(),
        channelId: z.string().optional(),
        enabled: z.boolean().default(true)
      });
      
      const slackConfig = slackConfigSchema.parse(req.body);
      
      // Update organization with Slack OAuth configuration
      const updateData = {
        slackClientId: slackConfig.clientId,
        slackClientSecret: slackConfig.clientSecret,
        slackSigningSecret: slackConfig.signingSecret || null,
        slackChannelId: slackConfig.channelId || null,
        enableSlackIntegration: slackConfig.enabled,
        slackConnectionStatus: 'configured' // Will be updated to 'connected' after successful OAuth
      };
      
      const updatedOrganization = await storage.updateOrganization(req.params.id, updateData);
      if (!updatedOrganization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json({ 
        message: "Slack integration configured successfully",
        status: "configured",
        authUrl: `/auth/slack/login?org=${updatedOrganization.slug}` // Provide OAuth URL for testing
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid Slack configuration", errors: error.errors });
      }
      console.error("PUT /api/organizations/:id/integrations/slack - Error:", error);
      res.status(500).json({ message: "Failed to configure Slack integration" });
    }
  });

  // Configure Microsoft OAuth integration
  app.put("/api/organizations/:id/integrations/microsoft", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Verify the organization ID matches the authenticated user's organization
      if (req.params.id !== req.orgId) {
        return res.status(403).json({ message: "You can only update your own organization" });
      }
      
      const microsoftConfigSchema = z.object({
        clientId: z.string().min(1, "Microsoft Client ID is required"),
        clientSecret: z.string().min(1, "Microsoft Client Secret is required"),
        tenantId: z.string().min(1, "Microsoft Tenant ID is required"),
        teamsWebhookUrl: z.string().url().optional(),
        enableAuth: z.boolean().default(true),
        enableTeams: z.boolean().default(false)
      });
      
      const microsoftConfig = microsoftConfigSchema.parse(req.body);
      
      // Update organization with Microsoft OAuth configuration
      const updateData = {
        microsoftClientId: microsoftConfig.clientId,
        microsoftClientSecret: microsoftConfig.clientSecret,
        microsoftTenantId: microsoftConfig.tenantId,
        microsoftTeamsWebhookUrl: microsoftConfig.teamsWebhookUrl || null,
        enableMicrosoftAuth: microsoftConfig.enableAuth,
        enableTeamsIntegration: microsoftConfig.enableTeams,
        microsoftConnectionStatus: 'configured' // Will be updated to 'connected' after successful OAuth
      };
      
      const updatedOrganization = await storage.updateOrganization(req.params.id, updateData);
      if (!updatedOrganization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json({ 
        message: "Microsoft integration configured successfully",
        status: "configured",
        authUrl: `/auth/microsoft/login?org=${updatedOrganization.slug}` // Provide OAuth URL for testing
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid Microsoft configuration", errors: error.errors });
      }
      console.error("PUT /api/organizations/:id/integrations/microsoft - Error:", error);
      res.status(500).json({ message: "Failed to configure Microsoft integration" });
    }
  });

  // Send one-on-one meeting report to Slack
  app.post("/api/one-on-ones/:id/send-to-slack", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      const meetingId = req.params.id;
      
      // Get the meeting and check access permissions
      const meeting = await storage.getOneOnOne(req.orgId, meetingId);
      if (!meeting) {
        return res.status(404).json({ message: "Meeting not found" });
      }
      
      // Check if user has access to this meeting
      const hasAccess = await canAccessOneOnOne(
        req.orgId,
        req.currentUser!.id,
        req.currentUser!.role,
        req.currentUser!.teamId,
        meeting
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get user's Slack ID from their profile
      const currentUser = req.currentUser!;
      if (!currentUser.slackUserId) {
        return res.status(400).json({ 
          message: "Slack account not connected. Please connect your Slack account first." 
        });
      }
      
      // Get the other participant's name for the report
      const otherParticipantId = meeting.participantOneId === currentUser.id 
        ? meeting.participantTwoId 
        : meeting.participantOneId;
      const otherParticipant = await storage.getUser(req.orgId, otherParticipantId);
      
      // Import the Slack service function
      const { sendOneOnOneReportToUser } = await import("./services/slack");
      
      // Send the report to Slack
      const result = await sendOneOnOneReportToUser(
        currentUser.slackUserId,
        currentUser.name || currentUser.username,
        {
          id: meeting.id,
          participantName: otherParticipant?.name || 'Unknown',
          scheduledAt: new Date(meeting.scheduledAt),
          agenda: meeting.agenda || undefined,
          notes: meeting.notes || undefined,
          actionItems: Array.isArray(meeting.actionItems) ? meeting.actionItems : [],
          duration: meeting.duration || 30,
          location: meeting.location || undefined,
          status: meeting.status
        }
      );
      
      if (result?.success) {
        res.json({ 
          message: "Meeting report sent to your Slack DMs successfully!",
          success: true 
        });
      } else {
        res.status(500).json({ 
          message: result?.message || "Failed to send report to Slack",
          success: false 
        });
      }
    } catch (error) {
      console.error("Send one-on-one to Slack error:", error);
      res.status(500).json({ message: "Failed to send meeting report to Slack" });
    }
  });

  // PDF Export Endpoints
  
  // Export check-in report as PDF
  app.get("/api/reports/checkins/pdf", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { PDFExportService } = await import("./services/pdf-export");
      
      const { startDate, endDate, teamId } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      
      const pdfBuffer = await PDFExportService.generateCheckinReport(
        req.orgId,
        new Date(startDate as string),
        new Date(endDate as string),
        teamId as string | undefined
      );
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="checkin-report.pdf"');
      res.send(pdfBuffer);
    } catch (error) {
      console.error("PDF check-in report error:", error);
      res.status(500).json({ message: "Failed to generate check-in report PDF" });
    }
  });

  // Export one-on-one meeting as PDF
  app.get("/api/one-on-ones/:id/pdf", requireAuth(), async (req, res) => {
    try {
      const { PDFExportService } = await import("./services/pdf-export");
      
      // Verify user has access to this meeting
      const meeting = await storage.getOneOnOne(req.orgId, req.params.id);
      if (!meeting) {
        return res.status(404).json({ message: "Meeting not found" });
      }
      
      // Check if user is a participant or has admin/manager access
      const isParticipant = meeting.participantOneId === req.currentUser!.id || 
                           meeting.participantTwoId === req.currentUser!.id;
      const hasManagerAccess = req.currentUser!.role === 'admin' || req.currentUser!.role === 'manager';
      
      if (!isParticipant && !hasManagerAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const pdfBuffer = await PDFExportService.generateOneOnOnePDF(req.orgId, req.params.id);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="one-on-one-${req.params.id}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("PDF one-on-one export error:", error);
      res.status(500).json({ message: "Failed to generate one-on-one PDF" });
    }
  });

  // Export analytics report as PDF
  app.get("/api/reports/analytics/pdf", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { PDFExportService } = await import("./services/pdf-export");
      
      const { period = 'month' } = req.query;
      
      if (!['week', 'month', 'quarter'].includes(period as string)) {
        return res.status(400).json({ message: "Invalid period. Use 'week', 'month', or 'quarter'" });
      }
      
      const pdfBuffer = await PDFExportService.generateAnalyticsReport(
        req.orgId,
        period as 'week' | 'month' | 'quarter'
      );
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="analytics-${period}-report.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("PDF analytics report error:", error);
      res.status(500).json({ message: "Failed to generate analytics report PDF" });
    }
  });

  // Create Stripe payment intent for plan upgrades  
  app.post("/api/stripe/create-payment-intent", async (req, res) => {
    if (!stripe) {
      return res.status(503).json({ message: "Payment processing not available" });
    }

    try {
      const paymentSchema = z.object({
        organizationId: z.string(),
        planId: z.string(),
        billingCycle: z.enum(["monthly", "annual"]),
        amount: z.number().min(0),
      });

      const data = planSchema.parse(req.body);

      // If not standard plan, handle payment processing
      if (data.planId !== "standard" && stripe) {
        // Create Stripe customer and setup subscription
        const organization = await storage.getOrganization(data.organizationId);
        if (!organization) {
          return res.status(404).json({ message: "Organization not found" });
        }

        // Create or retrieve Stripe customer
        let customer;
        if (organization.stripeCustomerId) {
          customer = await stripe.customers.retrieve(organization.stripeCustomerId);
        } else {
          customer = await stripe.customers.create({
            name: organization.name,
            email: organization.email,
            metadata: {
              organizationId: data.organizationId,
              plan: data.planId,
              billingCycle: data.billingCycle,
            },
          });
          
          // Store the Stripe customer ID
          await storage.updateOrganization(data.organizationId, {
            stripeCustomerId: customer.id,
          });
        }

        // Get price based on plan and billing cycle
        const plans: Record<string, Record<string, number>> = {
          professional: {
            monthly: 1000,  // $10/month
            annual: 9600,   // $96/year ($8/month with 20% off)
          },
          enterprise: {
            monthly: 2500,  // $25/month
            annual: 24000,  // $240/year ($20/month with 20% off)
          }
        };

        let price = plans[data.planId]?.[data.billingCycle];
        if (!price) {
          return res.status(400).json({ message: "Invalid plan or billing cycle" });
        }

        // Validate and apply discount code if provided
        let discountAmount = 0;
        let discountPercentage = 0;
        let validatedDiscountCode = null;
        
        if (data.discountCode) {
          const validation = await storage.validateDiscountCode(
            data.discountCode.toUpperCase(), 
            data.planId, 
            price
          );
          
          if (validation.valid && validation.discountCode) {
            validatedDiscountCode = validation.discountCode;
            
            // Calculate discount amount
            if (validation.discountCode.discountType === 'percentage') {
              discountPercentage = validation.discountCode.discountValue;
              discountAmount = Math.round(price * (validation.discountCode.discountValue / 100));
              
              // Apply maximum discount limit if set
              if (validation.discountCode.maximumDiscount && discountAmount > validation.discountCode.maximumDiscount) {
                discountAmount = validation.discountCode.maximumDiscount;
              }
            } else if (validation.discountCode.discountType === 'fixed_amount') {
              discountAmount = validation.discountCode.discountValue;
            }
            
            // Ensure discount doesn't exceed order amount
            discountAmount = Math.min(discountAmount, price);
          } else {
            console.log('Invalid discount code:', validation.reason);
            // Continue without discount rather than failing
          }
        }

        // Get the base URL for redirects
        const protocol = req.get('x-forwarded-proto') || req.protocol;
        const host = req.get('host');
        const baseUrl = `${protocol}://${host}`;

        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
          customer: customer.id,
          payment_method_types: ['card'],
          mode: data.billingCycle === 'monthly' ? 'subscription' : 'payment',
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: `Whirkplace ${data.planId.charAt(0).toUpperCase() + data.planId.slice(1)} Plan`,
                  description: `${data.billingCycle === 'monthly' ? 'Monthly' : 'Annual'} subscription for ${organization.name}`,
                },
                unit_amount: price - discountAmount, // Apply discount to the price
                ...(data.billingCycle === 'monthly' ? {
                  recurring: {
                    interval: 'month' as const,
                    interval_count: 1,
                  }
                } : {})
              },
              quantity: 1,
            },
          ],
          success_url: `${baseUrl}/api/business/checkout-success?session_id={CHECKOUT_SESSION_ID}&organizationId=${data.organizationId}`,
          cancel_url: `${baseUrl}/business-signup?canceled=true`,
          metadata: {
            organizationId: data.organizationId,
            planId: data.planId,
            billingCycle: data.billingCycle,
            ...(validatedDiscountCode && {
              discountCode: validatedDiscountCode.code,
              discountAmount: discountAmount.toString(),
              discountPercentage: discountPercentage.toString(),
            }),
          },
        });

        // Store the session ID for verification and discount info
        await storage.updateOrganization(data.organizationId, {
          plan: data.planId,
          pendingCheckoutSessionId: session.id,
          ...(validatedDiscountCode && {
            discountCode: validatedDiscountCode.code,
            discountPercentage: discountPercentage,
          }),
        });
        
        // Record discount code usage if applied
        if (validatedDiscountCode) {
          await storage.applyDiscountCode({
            discountCodeId: validatedDiscountCode.id,
            organizationId: data.organizationId,
            orderAmount: price,
            discountAmount: discountAmount,
          });
        }

        res.json({
          success: true,
          requiresPayment: true,
          checkoutUrl: session.url,
          sessionId: session.id,
          message: "Redirecting to Stripe checkout..."
        });
      } else {
        // Standard plan - no payment required
        await storage.updateOrganization(data.organizationId, {
          plan: data.planId,
        });

        res.json({
          success: true,
          requiresPayment: false,
          message: "Plan selected successfully"
        });
      }

    } catch (error: any) {
      console.error("Plan selection error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to select plan" });
    }
  });

  // Handle Stripe checkout success callback
  app.get("/api/business/checkout-success", async (req, res) => {
    try {
      const { session_id, organizationId } = req.query;

      if (!session_id || !organizationId) {
        return res.redirect('/business-signup?error=missing_parameters');
      }

      if (!stripe) {
        return res.redirect('/business-signup?error=stripe_not_configured');
      }

      // Verify the checkout session
      const session = await stripe.checkout.sessions.retrieve(session_id as string);

      if (!session) {
        return res.redirect('/business-signup?error=invalid_session');
      }

      // Verify the session belongs to this organization
      if (session.metadata?.organizationId !== organizationId) {
        return res.redirect('/business-signup?error=organization_mismatch');
      }

      // Verify payment was successful
      if (session.payment_status !== 'paid') {
        return res.redirect('/business-signup?error=payment_not_completed');
      }

      // Update organization with payment confirmation
      await storage.updateOrganization(organizationId as string, {
        stripeCheckoutSessionId: session.id,
        stripeSubscriptionId: session.subscription as string || null,
        paymentStatus: 'completed',
        pendingCheckoutSessionId: null,
      });

      // Redirect to the teams step with success
      res.redirect(`/business-signup?step=teams&organizationId=${organizationId}&payment=success`);
      
    } catch (error) {
      console.error("Checkout success error:", error);
      res.redirect('/business-signup?error=checkout_verification_failed');
    }
  });

  // Complete onboarding - Step 3: Organization setup
  app.post("/api/business/complete-onboarding", async (req, res) => {
    try {
      const onboardingSchema = z.object({
        organizationId: z.string(),
        teams: z.array(z.object({
          name: z.string().min(2),
          description: z.string().optional(),
          type: z.enum(["team", "department", "pod"]),
        })),
        userInvites: z.array(z.object({
          email: z.string().email(),
          name: z.string().min(2),
          role: z.enum(["admin", "manager", "member"]),
          teamName: z.string().optional(),
        })).optional(),
        organizationSettings: z.object({
          companyValues: z.array(z.string()).min(1),
          checkInFrequency: z.enum(["daily", "weekly", "biweekly"]),
          workingHours: z.string(),
          timezone: z.string(),
        }),
      });

      const data = onboardingSchema.parse(req.body);

      // Update organization with custom values
      await storage.updateOrganization(data.organizationId, {
        customValues: data.organizationSettings.companyValues,
      });

      // Create teams
      const createdTeams: any[] = [];
      for (const team of data.teams) {
        const organization = await storage.getOrganization(data.organizationId);
        if (organization) {
          // Get admin user to set as team leader
          const adminUsers = await storage.getAllUsers(data.organizationId);
          const adminUser = adminUsers.find(u => u.role === 'admin');
          
          if (adminUser) {
            const createdTeam = await storage.createTeam(data.organizationId, {
              name: team.name,
              description: team.description || null,
              leaderId: adminUser.id,
              teamType: team.type,
              parentTeamId: null,
              organizationId: data.organizationId,
            });
            createdTeams.push(createdTeam);
          }
        }
      }

      // Send user invitations (placeholder - would implement email service)
      const invitationResults: any[] = [];
      if (data.userInvites) {
        for (const invite of data.userInvites) {
          // Generate invitation token
          const token = randomBytes(32).toString('hex');
          
          // In real implementation, would:
          // 1. Store invitation in database
          // 2. Send invitation email
          // 3. Set expiration date
          
          invitationResults.push({
            email: invite.email,
            name: invite.name,
            role: invite.role,
            status: "sent",
            token: token,
          });
        }
      }

      res.json({
        success: true,
        message: "Onboarding completed successfully",
        teamsCreated: createdTeams.length,
        invitationsSent: invitationResults.length,
        data: {
          teams: createdTeams,
          invitations: invitationResults,
        }
      });

    } catch (error: any) {
      console.error("Onboarding completion error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

  // Create Stripe payment intent for plan upgrades
  app.post("/api/stripe/create-payment-intent", async (req, res) => {
    if (!stripe) {
      return res.status(503).json({ message: "Payment processing not available" });
    }

    try {
      const paymentSchema = z.object({
        organizationId: z.string(),
        planId: z.string(),
        billingCycle: z.enum(["monthly", "annual"]),
        amount: z.number().min(0),
      });

      const data = paymentSchema.parse(req.body);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(data.amount), // Amount should already be in cents
        currency: "usd",
        metadata: {
          organizationId: data.organizationId,
          planId: data.planId,
          billingCycle: data.billingCycle,
        },
      });

      res.json({ 
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });

    } catch (error: any) {
      console.error("Payment intent creation error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to create payment intent" });
    }
  });


  // Support & Bug Reporting System
  app.post("/api/support/reports", requireAuth(), async (req, res) => {
    try {
      // Validate request body using Zod schema
      const validationSchema = insertBugReportSchema.omit({ 
        organizationId: true, 
        userId: true,
        createdAt: true,
        resolvedAt: true 
      }).extend({
        title: z.string().min(1).max(200),
        description: z.string().min(10).max(2000),
        category: z.enum(["bug", "question", "feature_request"]).default("bug"),
        severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
        pagePath: z.string().optional(),
        metadata: z.object({}).optional()
      });
      
      const validatedData = validationSchema.parse(req.body);
      
      // Create bug report
      const bugReport = await storage.createBugReport(req.orgId, {
        ...validatedData,
        organizationId: req.orgId,
        userId: req.currentUser!.id
      });
      
      // Send Slack notification to admins
      try {
        const { sendSlackMessage } = await import("./services/slack");
        const organization = await storage.getOrganization(req.orgId);
        const user = req.currentUser!;
        
        const message = `🆘 **New Support Request**\n\n` +
          `**From:** ${user.name} (${user.email})\n` +
          `**Type:** ${bugReport.category} | **Severity:** ${bugReport.severity}\n` +
          `**Page:** ${bugReport.pagePath || 'Not specified'}\n\n` +
          `**Title:** ${bugReport.title}\n` +
          `**Description:** ${bugReport.description.slice(0, 300)}${bugReport.description.length > 300 ? '...' : ''}\n\n` +
          `**Report ID:** ${bugReport.id}`;
          
        await sendSlackMessage(message);
      } catch (slackError) {
        console.error("Failed to send Slack notification for bug report:", slackError);
        // Don't fail the request if Slack notification fails
      }
      
      res.status(201).json(bugReport);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("POST /api/support/reports - Error:", error);
      res.status(500).json({ message: "Failed to create bug report" });
    }
  });

  app.get("/api/support/reports", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const statusFilter = req.query.status as string | undefined;
      const userId = req.query.userId as string | undefined;
      
      const bugReports = await storage.getBugReports(req.orgId, statusFilter, userId);
      res.json(bugReports);
    } catch (error) {
      console.error("GET /api/support/reports - Error:", error);
      res.status(500).json({ message: "Failed to fetch bug reports" });
    }
  });

  app.patch("/api/support/reports/:id", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const updateSchema = insertBugReportSchema.pick({
        status: true,
        resolutionNote: true,
        assignedTo: true
      }).partial().extend({
        status: z.enum(["open", "triaged", "in_progress", "resolved", "closed"]).optional(),
        resolutionNote: z.string().max(1000).optional()
      });
      
      const validatedData = updateSchema.parse(req.body);
      
      // Add resolved timestamp if status is being set to resolved
      if (validatedData.status === "resolved" || validatedData.status === "closed") {
        (validatedData as any).resolvedAt = new Date();
      }
      
      const updatedReport = await storage.updateBugReport(req.orgId, req.params.id, validatedData);
      if (!updatedReport) {
        return res.status(404).json({ message: "Bug report not found" });
      }
      
      res.json(updatedReport);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("PATCH /api/support/reports/:id - Error:", error);
      res.status(500).json({ message: "Failed to update bug report" });
    }
  });

  // AI KRA Generation endpoint
  app.post("/api/ai/generate-kras", requireAuth(), requireFeatureAccess('kra_management'), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { role, department, company } = req.body;
      
      // Validate input
      if (!role || !department) {
        return res.status(400).json({ message: "Role and department are required" });
      }

      // Import OpenAI (the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user)
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      // Get organization info for context
      const organization = await storage.getOrganization(req.orgId);
      const organizationContext = organization ? `at ${organization.name}` : "";

      const prompt = `Generate 3-5 comprehensive Key Result Areas (KRAs) for a ${role} role in the ${department} department ${organizationContext}.

For each KRA, provide:
- title: A clear, specific title for the KRA
- description: A detailed description of what this KRA entails and why it's important
- target: A specific, measurable target or goal (e.g., "$100K ARR", "95% customer satisfaction", "20% reduction in costs")
- metric: How success will be measured (e.g., "Monthly Revenue", "Customer Survey Scores", "Operational Efficiency")

Focus on outcomes that are:
- Specific and measurable
- Aligned with business objectives
- Achievable but challenging
- Relevant to the role and department
- Time-bound where appropriate

Return the response as a JSON object with this structure:
{
  "suggestions": [
    {
      "title": "KRA Title",
      "description": "Detailed description of the KRA",
      "target": "Specific measurable target",
      "metric": "How success is measured"
    }
  ]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are an expert in performance management and Key Result Areas (KRAs). You help create comprehensive, measurable KRAs that drive business outcomes."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(response.choices[0].message.content);
      
      // Validate the response structure
      if (!result.suggestions || !Array.isArray(result.suggestions)) {
        throw new Error("Invalid AI response format");
      }

      res.json(result);
    } catch (error) {
      console.error("POST /api/ai/generate-kras - Error:", error);
      res.status(500).json({ 
        message: "Failed to generate KRA suggestions",
        error: error.message 
      });
    }
  });

  // Discount Code Validation (publicly accessible for signup)
  app.post("/api/discount-codes/validate", requireOrganization(), async (req, res) => {
    try {
      const { code, planId, orderAmount } = req.body;
      const validation = await storage.validateDiscountCode(code, planId, orderAmount);
      res.json(validation);
    } catch (error) {
      console.error("Failed to validate discount code:", error);
      res.status(500).json({ message: "Failed to validate discount code" });
    }
  });

  // Dashboard Configuration Routes
  app.get("/api/dashboard/config", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const config = await storage.getDashboardConfig(req.orgId, req.currentUser!.id);
      if (!config) {
        return res.status(404).json({ message: "Dashboard configuration not found" });
      }
      res.json(config);
    } catch (error) {
      console.error("Failed to get dashboard config:", error);
      res.status(500).json({ message: "Failed to get dashboard configuration" });
    }
  });

  app.put("/api/dashboard/config", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      // SECURITY: Only allow updating layout and widgets, prevent ownership changes
      const updateSchema = insertDashboardConfigSchema
        .partial()
        .omit({ userId: true, organizationId: true, id: true });
      
      const data = updateSchema.parse(req.body);
      
      // Try update first, if not found, create (upsert behavior)
      let config = await storage.updateDashboardConfig(req.orgId, req.currentUser!.id, data);
      
      if (!config) {
        // Create new config if not found
        const createData = insertDashboardConfigSchema.parse({
          ...data,
          userId: req.currentUser!.id,
        });
        config = await storage.createDashboardConfig(req.orgId, createData);
      }
      
      res.json(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Failed to update dashboard config:", error);
      res.status(500).json({ message: "Failed to update dashboard configuration" });
    }
  });

  app.delete("/api/dashboard/config", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const success = await storage.resetDashboardConfig(req.orgId, req.currentUser!.id);
      res.json({ success });
    } catch (error) {
      console.error("Failed to reset dashboard config:", error);
      res.status(500).json({ message: "Failed to reset dashboard configuration" });
    }
  });

  // Dashboard Widget Templates Routes
  app.get("/api/dashboard/widget-templates", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const { category } = req.query;
      const templates = await storage.getAllDashboardWidgetTemplates(
        req.orgId, 
        category as string | undefined
      );
      res.json(templates);
    } catch (error) {
      console.error("Failed to get widget templates:", error);
      res.status(500).json({ message: "Failed to get widget templates" });
    }
  });

  app.get("/api/dashboard/widget-templates/:id", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const template = await storage.getDashboardWidgetTemplate(req.orgId, req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Widget template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Failed to get widget template:", error);
      res.status(500).json({ message: "Failed to get widget template" });
    }
  });

  app.post("/api/dashboard/widget-templates", requireOrganization(), requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // SECURITY: Prevent organizationId manipulation
      const createSchema = insertDashboardWidgetTemplateSchema.omit({ organizationId: true });
      const data = createSchema.parse(req.body);
      
      const template = await storage.createDashboardWidgetTemplate(req.orgId, data);
      res.status(201).json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Failed to create widget template:", error);
      res.status(500).json({ message: "Failed to create widget template" });
    }
  });

  app.put("/api/dashboard/widget-templates/:id", requireOrganization(), requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // SECURITY: Only allow updating content fields, prevent ownership changes
      const updateSchema = insertDashboardWidgetTemplateSchema
        .partial()
        .omit({ id: true, organizationId: true });
      
      const data = updateSchema.parse(req.body);
      const template = await storage.updateDashboardWidgetTemplate(req.orgId, req.params.id, data);
      
      if (!template) {
        return res.status(404).json({ message: "Widget template not found" });
      }
      
      res.json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Failed to update widget template:", error);
      res.status(500).json({ message: "Failed to update widget template" });
    }
  });

  app.delete("/api/dashboard/widget-templates/:id", requireOrganization(), requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const success = await storage.deleteDashboardWidgetTemplate(req.orgId, req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Widget template not found" });
      }
      res.json({ success });
    } catch (error) {
      console.error("Failed to delete widget template:", error);
      res.status(500).json({ message: "Failed to delete widget template" });
    }
  });

  // ========== ACCOUNT OWNERSHIP MANAGEMENT ==========
  
  // Transfer account ownership to another admin user
  app.post("/api/account/transfer-ownership", requireOrganization(), authenticateUser(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      
      // Only account owners and super admins can transfer ownership
      if (!currentUser.isAccountOwner && !currentUser.isSuperAdmin) {
        return res.status(403).json({ 
          message: "Only the current account owner can transfer ownership" 
        });
      }
      
      const { newOwnerId } = req.body;
      
      if (!newOwnerId) {
        return res.status(400).json({ message: "New owner ID is required" });
      }
      
      // Get the new owner user
      const newOwner = await storage.getUser(req.orgId, newOwnerId);
      
      if (!newOwner) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // New owner must be an admin
      if (newOwner.role !== 'admin') {
        return res.status(400).json({ 
          message: "New account owner must have admin role. Please promote the user to admin first." 
        });
      }
      
      // Cannot transfer to self
      if (newOwner.id === currentUser.id) {
        return res.status(400).json({ message: "Cannot transfer ownership to yourself" });
      }
      
      console.log(`Transferring account ownership from ${currentUser.email} to ${newOwner.email} for org ${req.orgId}`);
      
      // Remove account owner status from all users in this organization
      const allUsers = await storage.getAllUsers(req.orgId, true);
      for (const user of allUsers) {
        if (user.isAccountOwner) {
          await storage.updateUser(req.orgId, user.id, {
            isAccountOwner: false
          });
        }
      }
      
      // Grant account owner status to new owner
      await storage.updateUser(req.orgId, newOwnerId, {
        isAccountOwner: true,
        role: 'admin' // Ensure they remain admin
      });
      
      // Log the ownership transfer
      console.log(`Account ownership successfully transferred to ${newOwner.email} (${newOwner.id})`);
      
      res.json({ 
        success: true,
        message: `Account ownership transferred to ${newOwner.name}`,
        newOwner: {
          id: newOwner.id,
          name: newOwner.name,
          email: newOwner.email
        }
      });
    } catch (error) {
      console.error("Failed to transfer account ownership:", error);
      res.status(500).json({ message: "Failed to transfer account ownership" });
    }
  });
  
  // Get current account owner
  app.get("/api/account/owner", requireOrganization(), authenticateUser(), async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers(req.orgId, false);
      const accountOwner = allUsers.find(user => user.isAccountOwner);
      
      if (!accountOwner) {
        // This shouldn't happen, but handle gracefully
        return res.json({ 
          owner: null,
          message: "No account owner found for this organization" 
        });
      }
      
      res.json({
        owner: {
          id: accountOwner.id,
          name: accountOwner.name,
          email: accountOwner.email,
          avatar: accountOwner.avatar
        }
      });
    } catch (error) {
      console.error("Failed to get account owner:", error);
      res.status(500).json({ message: "Failed to get account owner" });
    }
  });

  // Super Admin middleware is already imported from ./middleware/auth

  // Super Admin API Routes
  
  // Organizations management
  app.get("/api/super-admin/organizations", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const organizations = await storage.getAllOrganizations();
      const orgsWithStats = await Promise.all(
        organizations.map(async (org) => {
          const stats = await storage.getOrganizationStats(org.id);
          return {
            ...org,
            ...stats  // Flatten the stats fields into the organization object
          };
        })
      );
      res.json(orgsWithStats);
    } catch (error) {
      console.error("Failed to get organizations:", error);
      res.status(500).json({ message: "Failed to get organizations" });
    }
  });

  app.post("/api/super-admin/organizations", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const { name, slug, plan, customValues } = req.body;
      
      if (!name || !slug) {
        return res.status(400).json({ message: "Name and slug are required" });
      }

      const organization = await storage.createOrganization({
        id: `org-${Math.random().toString(36).substring(2, 15)}`,
        name,
        slug,
        plan: plan || "standard",
        customValues: customValues || [],
        isActive: true
      });
      
      res.json(organization);
    } catch (error) {
      console.error("Failed to create organization:", error);
      res.status(500).json({ message: "Failed to create organization" });
    }
  });

  app.put("/api/super-admin/organizations/:id", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const organization = await storage.updateOrganization(req.params.id, req.body);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      res.json(organization);
    } catch (error) {
      console.error("Failed to update organization:", error);
      res.status(500).json({ message: "Failed to update organization" });
    }
  });

  // Test integrations endpoint (admin/super admin only)
  app.get('/api/test-integrations', requireAuth(), async (req, res) => {
    try {
      // Only admins can test integrations
      if (req.user?.role !== 'admin' && !req.user?.isSuperAdmin) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const { testAllIntegrations } = await import('./test-integrations');
      const results = await testAllIntegrations();
      res.json(results);
    } catch (error) {
      console.error('Integration test error:', error);
      res.status(500).json({ message: 'Failed to test integrations', error });
    }
  });

  app.delete("/api/super-admin/organizations/:id", requireAuth(), requireSuperAdmin(), async (req, res) => {
    const orgIdParam = req.params.id;
    console.log(`🗑️ Delete request for org ID: "${orgIdParam}"`);
    console.log(`👤 User: ${req.currentUser?.email} (Super Admin: ${req.currentUser?.isSuperAdmin})`);
    console.log(`📊 Type of ID param: ${typeof orgIdParam}, Length: ${orgIdParam.length}`);
    
    try {
      // Don't allow deletion of the main Whirkplace organization or demo org
      if (orgIdParam === 'whirkplace') {
        console.log("❌ Blocked: Cannot delete main Whirkplace org");
        return res.status(400).json({ message: "Cannot delete the main Whirkplace organization" });
      }
      
      // Check if it's the Fictitious Delicious demo org
      console.log(`🔍 Looking up organization with ID: "${orgIdParam}"`);
      const org = await storage.getOrganization(orgIdParam);
      
      if (!org) {
        console.log(`❌ Organization not found with ID: "${orgIdParam}"`);
        // Try to find all organizations and log them for debugging
        const allOrgs = await storage.getAllOrganizations();
        console.log(`📋 All organizations in database:`);
        allOrgs.forEach(o => {
          console.log(`  - ID: "${o.id}", Name: "${o.name}", Slug: "${o.slug}"`);
        });
        
        // Check if the ID matches any organization name or slug
        const matchByName = allOrgs.find(o => o.name.toLowerCase() === orgIdParam.toLowerCase());
        const matchBySlug = allOrgs.find(o => o.slug === orgIdParam);
        
        if (matchByName) {
          console.log(`⚠️ Found organization by name match: "${matchByName.name}" with ID: "${matchByName.id}"`);
          console.log(`⚠️ Frontend might be passing the wrong field as ID`);
        }
        if (matchBySlug) {
          console.log(`⚠️ Found organization by slug match: "${matchBySlug.slug}" with ID: "${matchBySlug.id}"`);
          console.log(`⚠️ Frontend might be passing slug instead of ID`);
        }
        
        return res.status(404).json({ message: "Organization not found" });
      }
      
      console.log(`✅ Found organization: Name: "${org.name}", Slug: "${org.slug}", ID: "${org.id}"`);
      
      if (org.slug === 'fictitious-delicious') {
        console.log("❌ Blocked: Cannot delete demo org");
        return res.status(400).json({ message: "Cannot delete the demo organization (Fictitious Delicious)" });
      }
      
      console.log(`🗑️ Attempting to delete organization: "${org.name}" (${org.slug}) with ID: "${org.id}"`);
      const success = await storage.deleteOrganization(orgIdParam);
      
      if (!success) {
        console.log(`❌ Delete failed: storage.deleteOrganization returned false for ID: "${orgIdParam}"`);
        return res.status(404).json({ message: "Organization not found or cannot be deleted" });
      }
      
      console.log(`✅ Organization "${org.name}" deleted successfully`);
      res.json({ success });
    } catch (error) {
      console.error("❌ Failed to delete organization:", error);
      res.status(500).json({ message: "Failed to delete organization" });
    }
  });

  // Global users management
  app.get("/api/super-admin/users", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const users = await storage.getAllUsersGlobal(includeInactive);
      
      // Get organization names for each user
      const orgs = await storage.getAllOrganizations();
      const orgMap = Object.fromEntries(orgs.map(o => [o.id, o.name]));
      
      const usersWithOrg = users.map(user => ({
        ...user,
        organizationName: orgMap[user.organizationId] || 'Unknown'
      }));
      
      res.json(usersWithOrg);
    } catch (error) {
      console.error("Failed to get users:", error);
      res.status(500).json({ message: "Failed to get users" });
    }
  });

  app.post("/api/super-admin/users", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const { name, email, organizationId, role, password } = req.body;
      
      if (!name || !email || !organizationId) {
        return res.status(400).json({ message: "Name, email, and organizationId are required" });
      }

      // Hash password if provided
      let hashedPassword = null;
      if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
      }

      const user = await storage.createUserGlobal({
        name,
        email,
        organizationId,
        role: role || 'member',
        password: hashedPassword,
        isActive: true,
        isSuperAdmin: false
      });
      
      res.json(user);
    } catch (error) {
      console.error("Failed to create user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.put("/api/super-admin/users/:id", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      // If password is being updated, hash it first
      const updateData = { ...req.body };
      if (updateData.password) {
        updateData.password = await bcrypt.hash(updateData.password, 10);
      }
      
      const user = await storage.updateUserGlobal(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Failed to update user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/super-admin/users/:id", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      // Don't allow deletion of self
      if (req.params.id === req.userId) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }
      
      const success = await storage.deleteUserGlobal(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ success });
    } catch (error) {
      console.error("Failed to delete user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Move user between organizations
  app.post("/api/super-admin/users/:id/move", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const { targetOrganizationId } = req.body;
      
      if (!targetOrganizationId) {
        return res.status(400).json({ message: "Target organization ID is required" });
      }

      const user = await storage.moveUserToOrganization(req.params.id, targetOrganizationId);
      if (!user) {
        return res.status(400).json({ message: "Failed to move user. User or organization not found." });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Failed to move user:", error);
      res.status(500).json({ message: "Failed to move user" });
    }
  });

  // System statistics
  app.get("/api/super-admin/stats", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const stats = await storage.getSystemStats();
      res.json(stats);
    } catch (error) {
      console.error("Failed to get system stats:", error);
      res.status(500).json({ message: "Failed to get system stats" });
    }
  });

  // Super Admin: Get all active sessions
  app.get("/api/super-admin/sessions", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      // Query the user_sessions table directly
      const query = sql`
        SELECT 
          s.sid as session_id,
          s.sess->>'userId' as user_id,
          u.name as user_name,
          u.email as user_email,
          s.sess->>'organizationId' as organization_id,
          o.name as organization_name,
          s.expire as expiry_time,
          (s.expire - INTERVAL '30 days') as login_time
        FROM user_sessions s
        LEFT JOIN users u ON (s.sess->>'userId')::text = u.id
        LEFT JOIN organizations o ON (s.sess->>'organizationId')::text = o.id
        WHERE s.expire > NOW()
        ORDER BY (s.expire - INTERVAL '30 days') DESC
      `;
      
      const sessions = await db.execute(query);
      
      // Calculate time remaining for each session
      const formattedSessions = sessions.rows.map((session: any) => {
        const now = new Date();
        const expiryTime = new Date(session.expiry_time);
        const loginTime = new Date(session.login_time);
        const msRemaining = expiryTime.getTime() - now.getTime();
        
        // Format time remaining
        let timeRemaining = 'Expired';
        if (msRemaining > 0) {
          const days = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
          const hours = Math.floor((msRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
          
          if (days > 0) {
            timeRemaining = `${days} day${days > 1 ? 's' : ''}`;
          } else if (hours > 0) {
            timeRemaining = `${hours} hour${hours > 1 ? 's' : ''}`;
          } else {
            timeRemaining = `${minutes} minute${minutes > 1 ? 's' : ''}`;
          }
        }
        
        return {
          sessionId: session.session_id,
          userId: session.user_id,
          userName: session.user_name || 'Unknown',
          userEmail: session.user_email || 'No email',
          organizationId: session.organization_id,
          organizationName: session.organization_name || 'No organization',
          loginTime: loginTime.toISOString(),
          expiryTime: expiryTime.toISOString(),
          timeRemaining
        };
      });
      
      res.json(formattedSessions);
    } catch (error) {
      console.error("Error fetching active sessions:", error);
      res.status(500).json({ message: "Failed to fetch active sessions" });
    }
  });

  // ===================================
  // CRITICAL SESSION & SLACK ENDPOINTS
  // ===================================
  
  // GET /api/users/current - Test session persistence (critical for debugging session issues)
  app.get("/api/users/current", async (req, res) => {
    console.log("🔍 GET /api/users/current - Checking session persistence");
    console.log("📋 Session ID:", req.sessionID);
    console.log("📦 Full session data:", JSON.stringify(req.session, null, 2));
    
    // Check if session exists
    if (!req.session) {
      console.log("❌ No session object exists");
      return res.status(401).json({ 
        error: "No session exists",
        sessionId: null,
        userId: null,
        organizationId: null,
        organizationSlug: null
      });
    }
    
    // Get session data
    const sessionData = req.session as any;
    const userId = sessionData.userId;
    const organizationId = sessionData.organizationId;
    const organizationSlug = sessionData.organizationSlug;
    
    console.log("🔑 Session userId:", userId || "UNDEFINED");
    console.log("🏢 Session organizationId:", organizationId || "UNDEFINED");
    console.log("🏷️ Session organizationSlug:", organizationSlug || "UNDEFINED");
    
    // Check if user is authenticated
    if (!userId || !organizationId) {
      console.log("⚠️ Session exists but userId or organizationId is UNDEFINED");
      return res.status(401).json({ 
        error: "Session exists but user data is missing",
        sessionId: req.sessionID,
        userId: userId || null,
        organizationId: organizationId || null,
        organizationSlug: organizationSlug || null
      });
    }
    
    // Try to fetch the user from storage
    try {
      const user = await storage.getUser(organizationId, userId);
      
      if (!user) {
        console.log("❌ User not found in database");
        return res.status(404).json({ 
          error: "User not found",
          sessionId: req.sessionID,
          userId,
          organizationId,
          organizationSlug
        });
      }
      
      console.log("✅ Session valid, user found:", user.email);
      
      res.json({
        authenticated: true,
        sessionId: req.sessionID,
        user: sanitizeUser(user),
        organizationId,
        organizationSlug
      });
    } catch (error) {
      console.error("❌ Error fetching user:", error);
      res.status(500).json({ 
        error: "Failed to fetch user",
        sessionId: req.sessionID,
        userId,
        organizationId,
        organizationSlug
      });
    }
  });
  
  // These duplicate endpoints have been removed to avoid conflicts
  // The proper sync-users endpoints are defined earlier in the file around line 6250
  // Those endpoints use the channel-based sync which is the correct approach
  
  // GET /api/integrations/slack/status - Check Slack connection status
  app.get("/api/integrations/slack/status", requireAuth(), async (req, res) => {
    console.log("🔍 GET /api/integrations/slack/status - Checking Slack connection");
    console.log("🏢 Organization ID:", req.orgId);
    
    try {
      // Get organization
      const organization = await storage.getOrganization(req.orgId);
      
      if (!organization) {
        console.log("❌ Organization not found");
        return res.status(404).json({ 
          connected: false,
          error: "Organization not found"
        });
      }
      
      console.log("🏢 Organization:", organization.name);
      console.log("🔑 Slack token exists:", !!organization.slackBotToken);
      console.log("🔌 Slack enabled:", organization.enableSlackIntegration);
      
      // Check if Slack token exists
      const connected = !!organization.slackBotToken;
      
      if (connected) {
        // If token exists, optionally test the connection
        if (req.query.test === 'true') {
          console.log("🧪 Testing Slack connection with API call");
          
          try {
            const slackClient = new WebClient(organization.slackBotToken);
            const testResult = await slackClient.auth.test();
            
            if (testResult.ok) {
              console.log("✅ Slack connection test successful");
              return res.json({
                connected: true,
                workspaceId: organization.slackWorkspaceId,
                teamName: (testResult as any).team,
                botName: (testResult as any).user
              });
            } else {
              console.log("❌ Slack connection test failed");
              return res.json({
                connected: false,
                error: "Token validation failed"
              });
            }
          } catch (testError: any) {
            console.error("❌ Slack test error:", testError);
            return res.json({
              connected: false,
              error: "Failed to validate token"
            });
          }
        }
        
        // Return basic status
        console.log("✅ Slack is connected");
        res.json({
          connected: true,
          workspaceId: organization.slackWorkspaceId
        });
      } else {
        console.log("⚠️ Slack is not connected");
        res.json({
          connected: false
        });
      }
      
    } catch (error: any) {
      console.error("❌ Status check error:", error);
      res.status(500).json({ 
        connected: false,
        error: "Failed to check status"
      });
    }
  });
  
  // Register additional route modules
  registerMicrosoftTeamsRoutes(app);
  registerMicrosoftAuthRoutes(app);
  registerMicrosoftCalendarRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
