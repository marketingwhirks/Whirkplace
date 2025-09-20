import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { 
  insertUserSchema, insertTeamSchema, insertCheckinSchema, 
  insertQuestionSchema, insertWinSchema, insertCommentSchema, insertShoutoutSchema, updateShoutoutSchema,
  insertVacationSchema, reviewCheckinSchema, ReviewStatus,
  type AnalyticsScope, type AnalyticsPeriod, type ShoutoutDirection, type ShoutoutVisibility, type LeaderboardMetric,
  type ReviewStatusType, type Checkin
} from "@shared/schema";
import { sendCheckinReminder, announceWin, sendTeamHealthUpdate, announceShoutout, notifyCheckinSubmitted, notifyCheckinReviewed, generateOAuthURL, validateOAuthState, exchangeOIDCCode, validateOIDCToken } from "./services/slack";
import { randomBytes } from "crypto";
import { aggregationService } from "./services/aggregation";
import { requireOrganization, sanitizeForOrganization } from "./middleware/organization";
import { authenticateUser, requireAuth, requireRole, requireTeamLead, ensureBackdoorUser } from "./middleware/auth";
import { authorizeAnalyticsAccess } from "./middleware/authorization";

export async function registerRoutes(app: Express): Promise<Server> {
  // Backdoor login endpoint (for development/testing when Slack is unavailable)
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
      
      // Set session
      req.session.userId = matthewUser.id;
      
      // Also set authentication cookies for fallback (like Slack OAuth)
      const sessionToken = randomBytes(32).toString('hex');
      
      res.cookie('auth_user_id', matthewUser.id, {
        httpOnly: true,
        secure: false, // Allow HTTP in development
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      
      res.cookie('auth_org_id', req.orgId, {
        httpOnly: true,
        secure: false, // Allow HTTP in development
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      
      res.cookie('auth_session_token', sessionToken, {
        httpOnly: true,
        secure: false, // Allow HTTP in development
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      
      res.json({ 
        message: "Backdoor login successful", 
        user: { 
          id: matthewUser.id, 
          name: matthewUser.name, 
          email: matthewUser.email, 
          role: matthewUser.role 
        } 
      });
    } catch (error) {
      console.error("Backdoor login error:", error);
      res.status(500).json({ message: "Backdoor login failed" });
    }
  });

  // OAuth endpoints (before organization middleware as they need to work without org context)
  
  // GET /auth/slack/login - Initiate Slack OAuth flow
  app.get("/auth/slack/login", async (req, res) => {
    try {
      const { org } = req.query;
      
      // Validate organization slug parameter
      if (!org || typeof org !== 'string') {
        return res.status(400).json({ 
          message: "Organization slug is required. Use ?org=your-organization-slug" 
        });
      }
      
      // Generate OAuth URL with organization context
      const oauthUrl = generateOAuthURL(org);
      
      // Redirect to Slack OAuth
      res.redirect(oauthUrl);
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
      
      // Check for OAuth errors from Slack
      if (oauthError) {
        console.error("Slack OAuth error:", oauthError);
        return res.status(400).json({ 
          message: `OAuth error: ${oauthError}` 
        });
      }
      
      // Validate required parameters
      if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
        return res.status(400).json({ 
          message: "Invalid OAuth callback parameters" 
        });
      }
      
      // Validate state parameter and get organization slug
      const organizationSlug = validateOAuthState(state);
      if (!organizationSlug) {
        return res.status(400).json({ 
          message: "Invalid or expired OAuth state. Please try again." 
        });
      }
      
      // Exchange code for OpenID Connect tokens
      const tokenResponse = await exchangeOIDCCode(code);
      if (!tokenResponse.ok || !tokenResponse.id_token) {
        console.error("OIDC token exchange failed:", tokenResponse.error);
        return res.status(400).json({ 
          message: "Failed to exchange OAuth code for tokens" 
        });
      }
      
      // Validate and decode the ID token
      const userInfoResponse = await validateOIDCToken(tokenResponse.id_token);
      if (!userInfoResponse.ok || !userInfoResponse.user) {
        console.error("Failed to validate ID token:", userInfoResponse.error);
        return res.status(400).json({ 
          message: "Failed to validate user identity token" 
        });
      }
      
      const user = userInfoResponse.user;
      const team = tokenResponse.team;
      
      // Resolve organization (we know the slug from state validation)
      // Note: We need to manually resolve the organization here since we're before the org middleware
      let organization;
      try {
        const allOrgs = await storage.getAllOrganizations();
        organization = allOrgs.find(org => org.slug === organizationSlug);
        if (!organization) {
          return res.status(404).json({ 
            message: `Organization '${organizationSlug}' not found` 
          });
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
      let existingUser;
      try {
        // First try to find by Slack user ID using indexed query
        if (user.sub) {
          existingUser = await storage.getUserBySlackId(organization.id, user.sub);
        }
        
        // If not found by Slack ID, try by email using indexed query
        if (!existingUser && user.email) {
          existingUser = await storage.getUserByEmail(organization.id, user.email);
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
          
          authenticatedUser = await storage.updateUser(organization.id, existingUser.id, {
            slackUserId: slackUserId,
            slackUsername: slackUserId, // OIDC doesn't provide username, use ID
            slackDisplayName: displayName,
            slackEmail: user.email,
            slackAvatar: user.picture,
            slackWorkspaceId: team?.id || user["https://slack.com/team_id"],
            authProvider: "slack" as const,
            avatar: user.picture || existingUser.avatar,
            // Update email if not set and Slack provides one
            email: existingUser.email || user.email || existingUser.email,
            // Update name if it's just the default email
            name: existingUser.name === existingUser.email && displayName ? 
                  displayName : existingUser.name
          });
        } catch (error) {
          console.error("Failed to update user with Slack data:", error);
          return res.status(500).json({ 
            message: "Failed to update user account" 
          });
        }
      } else {
        // Create new user with Slack OIDC data
        try {
          // Generate secure random password for Slack users (never used for login)
          const securePassword = randomBytes(32).toString('hex');
          const slackUserId = user.sub;
          const displayName = user.name || user.given_name || slackUserId;
          
          const userData = {
            username: slackUserId, // Use Slack user ID as username for uniqueness
            password: securePassword, // Secure random password for Slack users
            name: displayName,
            email: user.email || `${slackUserId}@slack.local`,
            role: "member",
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
          
          authenticatedUser = await storage.createUser(organization.id, userData);
        } catch (error) {
          console.error("Failed to create user from Slack:", error);
          return res.status(500).json({ 
            message: "Failed to create user account" 
          });
        }
      }
      
      if (!authenticatedUser) {
        return res.status(500).json({ 
          message: "Failed to authenticate user" 
        });
      }
      
      // Establish authentication session
      try {
        // Set HTTP-only secure cookies for authentication
        const sessionToken = randomBytes(32).toString('hex');
        
        res.cookie('auth_user_id', authenticatedUser.id, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });
        
        res.cookie('auth_org_id', organization.id, {
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
        
        console.log(`User ${authenticatedUser.name} (${authenticatedUser.email}) successfully authenticated via Slack OAuth for organization ${organization.name}`);
      } catch (error) {
        console.error("Failed to establish session:", error);
        // Continue anyway - user is authenticated, just session might not be optimal
      }
      
      // Redirect to the organization's dashboard
      const appUrl = process.env.REPL_URL || process.env.REPLIT_URL || 'http://localhost:5000';
      const dashboardUrl = `${appUrl}/#/dashboard?org=${organizationSlug}`;
      
      res.redirect(dashboardUrl);
    } catch (error) {
      console.error("OAuth callback error:", error);
      res.status(500).json({ 
        message: "Authentication failed. Please try again." 
      });
    }
  });
  
  // Apply organization middleware to all API routes
  app.use("/api", requireOrganization());
  
  // Authentication endpoints (before global auth middleware)
  app.post("/api/auth/logout", (req, res) => {
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destroy error:", err);
          return res.status(500).json({ message: "Failed to logout" });
        }
        res.clearCookie('connect.sid'); // Clear session cookie
        // Also clear auth cookies used by cookie-based authentication
        res.clearCookie('auth_user_id');
        res.clearCookie('auth_org_id');
        res.clearCookie('auth_session_token');
        res.json({ message: "Logged out successfully" });
      });
    } else {
      // If no session exists, just clear cookies and respond
      res.clearCookie('connect.sid');
      res.clearCookie('auth_user_id');
      res.clearCookie('auth_org_id');
      res.clearCookie('auth_session_token');
      res.json({ message: "Logged out successfully" });
    }
  });
  
  // Apply authentication middleware to all other API routes
  app.use("/api", authenticateUser());
  
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
  
  // Users
  app.get("/api/users", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      // Admins can see all users including inactive, others see only active
      const includeInactive = currentUser.role === "admin";
      const users = await storage.getAllUsers(req.orgId, includeInactive);
      res.json(users);
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
      res.json(user);
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
      res.json(user);
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
      res.json(reports);
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
      // Create team schema that excludes organizationId from client validation
      const createTeamSchema = insertTeamSchema.omit({ organizationId: true });
      
      const teamData = createTeamSchema.parse(req.body);
      const sanitizedData = sanitizeForOrganization(teamData, req.orgId);
      const team = await storage.createTeam(req.orgId, sanitizedData);
      res.status(201).json(team);
    } catch (error) {
      console.error("POST /api/teams - Validation error:", error);
      res.status(400).json({ message: "Invalid team data" });
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
      } else {
        // Non-admin users: Get authorized user IDs they can view (include inactive for historical data)
        const directReports = await storage.getUsersByManager(req.orgId, currentUser.id, true);
        const teamMembers = await storage.getUsersByTeamLeadership(req.orgId, currentUser.id, true);
        
        // Include the current user's own ID and combine with authorized users
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
      const checkinData = insertCheckinSchema.parse(req.body);
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
      const questionData = insertQuestionSchema.parse(req.body);
      const sanitizedData = sanitizeForOrganization(questionData, req.orgId);
      const question = await storage.createQuestion(req.orgId, sanitizedData);
      res.status(201).json(question);
    } catch (error) {
      res.status(400).json({ message: "Invalid question data" });
    }
  });

  app.patch("/api/questions/:id", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const updates = insertQuestionSchema.partial().parse(req.body);
      const sanitizedUpdates = sanitizeForOrganization(updates, req.orgId);
      const question = await storage.updateQuestion(req.orgId, req.params.id, sanitizedUpdates);
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }
      res.json(question);
    } catch (error) {
      res.status(400).json({ message: "Invalid question data" });
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

  // Wins
  app.get("/api/wins", async (req, res) => {
    try {
      const { public: isPublic, limit } = req.query;
      let wins;
      
      if (isPublic === "true") {
        wins = await storage.getPublicWins(req.orgId, limit ? parseInt(limit as string) : undefined);
      } else {
        wins = await storage.getRecentWins(req.orgId, limit ? parseInt(limit as string) : undefined);
      }
      
      res.json(wins);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch wins" });
    }
  });

  app.post("/api/wins", requireAuth(), async (req, res) => {
    try {
      const winData = insertWinSchema.parse(req.body);
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

  app.delete("/api/wins/:id", requireAuth(), async (req, res) => {
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
  app.get("/api/shoutouts", async (req, res) => {
    try {
      const { public: isPublic, userId, type, limit } = req.query;
      // TODO: Replace with actual authenticated user ID when auth is implemented
      const currentUserId = "current-user-id";
      let shoutouts;
      
      if (userId) {
        shoutouts = await storage.getShoutoutsByUser(req.orgId, userId as string, type as 'received' | 'given' | undefined);
      } else if (isPublic === "true") {
        shoutouts = await storage.getPublicShoutouts(req.orgId, limit ? parseInt(limit as string) : undefined);
      } else {
        shoutouts = await storage.getRecentShoutouts(req.orgId, limit ? parseInt(limit as string) : undefined);
      }
      
      // Filter private shoutouts based on user permissions
      const filteredShoutouts = shoutouts.filter(k => canAccessShoutouts(k, currentUserId));
      
      res.json(filteredShoutouts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch shoutouts" });
    }
  });

  app.get("/api/shoutouts/:id", async (req, res) => {
    try {
      const shoutout = await storage.getShoutout(req.orgId, req.params.id);
      if (!shoutout) {
        return res.status(404).json({ message: "Shoutout not found" });
      }
      
      // TODO: Replace with actual authenticated user ID when auth is implemented
      const currentUserId = "current-user-id";
      
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
      const shoutoutData = insertShoutoutSchema.parse(req.body);
      
      // TODO: Replace with actual authenticated user ID when auth is implemented
      const currentUserId = "current-user-id";
      
      // SECURITY: Never accept fromUserId from client - set server-side
      const shoutoutWithSender = {
        ...shoutoutData,
        fromUserId: currentUserId
      };
      
      const sanitizedData = sanitizeForOrganization(shoutoutWithSender, req.orgId);
      const shoutout = await storage.createShoutout(req.orgId, sanitizedData);
      
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
      
      res.status(201).json(shoutout);
    } catch (error) {
      console.error("Shoutout creation validation error:", error);
      res.status(400).json({ 
        message: "Invalid shoutout data",
        details: error instanceof Error ? error.message : "Unknown validation error"
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

  app.delete("/api/shoutouts/:id", requireAuth(), async (req, res) => {
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
      const recentCheckins = await storage.getRecentCheckins(req.orgId, 100);
      const totalCheckins = recentCheckins.length;
      
      // Get compliance metrics for the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const [checkinCompliance, reviewCompliance] = await Promise.all([
        storage.getCheckinComplianceMetrics(req.orgId, {
          scope: 'organization',
          from: thirtyDaysAgo
        }),
        storage.getReviewComplianceMetrics(req.orgId, {
          scope: 'organization', 
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
      
      // Calculate completion rate for current week
      const allUsers = await storage.getAllUsers(req.orgId);
      const activeUsers = allUsers.filter(user => user.isActive);
      const completedThisWeek = recentCheckins.filter(checkin => {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        return checkin.weekOf >= weekStart && checkin.isComplete;
      }).length;
      
      const completionRate = Math.round((completedThisWeek / activeUsers.length) * 100);
      
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
  app.post("/api/slack/send-checkin-reminder", async (req, res) => {
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

  app.post("/api/slack/send-team-health-update", async (req, res) => {
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
  app.post("/api/slack/send-weekly-reminders", requireOrganization(), requireAuth(), requireRole('admin'), async (req, res) => {
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
  app.post("/api/slack/send-personal-reminder", requireOrganization(), requireAuth(), requireRole('admin'), async (req, res) => {
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
  app.get("/api/slack/reminder-stats", requireOrganization(), requireAuth(), async (req, res) => {
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
  app.post("/api/slack/test-weekly-reminders", requireOrganization(), requireAuth(), requireRole('admin'), async (req, res) => {
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
        const response = await handleSlackSlashCommand(command, text, userId || '', userName || '', triggerId || '', organizationId, storage);
        
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
  app.post("/api/admin/sync-users", requireAuth(), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { syncUsersFromSlack } = await import("./services/slack");
      const result = await syncUsersFromSlack(req.orgId, storage);
      
      res.json({
        message: "User sync completed successfully",
        ...result
      });
    } catch (error) {
      console.error("Manual user sync failed:", error);
      res.status(500).json({ message: "User sync failed" });
    }
  });

  app.get("/api/admin/channel-members", requireAuth(), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { getChannelMembers } = await import("./services/slack");
      const members = await getChannelMembers();
      
      res.json({
        members,
        count: members.length,
        channelName: "whirkplace-pulse"
      });
    } catch (error) {
      console.error("Failed to fetch channel members:", error);
      res.status(500).json({ message: "Failed to fetch channel members" });
    }
  });

  // Debug endpoint to list all Slack channels the bot can see
  app.get("/api/admin/slack-channels", requireAuth(), async (req, res) => {
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

  const httpServer = createServer(app);
  return httpServer;
}
