import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { User } from "@shared/schema";
import { getTestUser, getAvailableTestUsers } from "../seeding";

/**
 * Helper function to ensure backdoor admin user exists for development
 * 
 * SECURITY: This function is only available in development environments
 * Creates/updates Matthew Patrick's user account and deactivates legacy backdoor-admin user
 * 
 * @param organizationId - The organization ID to create the user in
 * @returns Promise<User> - Matthew Patrick's user account
 */
export async function ensureBackdoorUser(organizationId: string): Promise<User> {
  // SECURITY: Only allow in development environment
  if (process.env.NODE_ENV === 'production') {
    throw new Error("Backdoor user creation not allowed in production");
  }

  // Get backdoor profile from environment variables
  const profileName = process.env.BACKDOOR_PROFILE_NAME || "Matthew Patrick";
  const profileEmail = process.env.BACKDOOR_PROFILE_EMAIL || "mpatrick@patrickaccounting.com";
  const profileUsername = process.env.BACKDOOR_PROFILE_USERNAME || "mpatrick";
  const profileRole = process.env.BACKDOOR_PROFILE_ROLE || "admin";

  // First, deactivate the legacy backdoor-admin user if it exists
  try {
    const legacyUser = await storage.getUserByUsername(organizationId, 'backdoor-admin');
    if (legacyUser && legacyUser.isActive) {
      await storage.updateUser(organizationId, legacyUser.id, { 
        isActive: false 
      });
      console.log("Deactivated legacy backdoor-admin user");
    }
  } catch (error) {
    // Ignore errors when deactivating legacy user
    console.log("No legacy backdoor-admin user found or error deactivating:", error);
  }

  // Check if Matthew's user already exists by username or email
  let matthewUser = await storage.getUserByUsername(organizationId, profileUsername);
  if (!matthewUser) {
    matthewUser = await storage.getUserByEmail(organizationId, profileEmail);
  }

  if (matthewUser) {
    // Update existing user with latest profile info
    const updatedUser = await storage.updateUser(organizationId, matthewUser.id, {
      name: profileName,
      email: profileEmail,
      username: profileUsername,
      role: profileRole,
      isActive: true,
      isSuperAdmin: true,  // Grant super admin privileges to Matthew Patrick
      authProvider: 'local' as const,
    });
    
    if (!updatedUser) {
      throw new Error("Failed to update Matthew Patrick's user account");
    }
    
    console.log(`Updated Matthew Patrick's backdoor user account: ${updatedUser.username}`);
    return updatedUser;
  } else {
    // Create new user for Matthew Patrick
    const newUser = await storage.createUser(organizationId, {
      username: profileUsername,
      password: 'secure-random-password', // Not used for authentication, just required by schema
      name: profileName,
      email: profileEmail,
      role: profileRole,
      organizationId: organizationId,
      authProvider: 'local' as const,
      isActive: true,
      isSuperAdmin: true,  // Grant super admin privileges to Matthew Patrick
    });
    
    console.log(`Created Matthew Patrick's backdoor user account: ${newUser.username}`);
    return newUser;
  }
}

// Extend Express Request to include current user
declare global {
  namespace Express {
    interface Request {
      currentUser?: User;
    }
  }
}

// Extend Express Request to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      orgId: string;
      currentUser?: User;
    }
  }
}

// Extend Express Session to include userId and Microsoft auth fields
declare module "express-session" {
  interface SessionData {
    userId?: string;
    microsoftAuthState?: string;
    authOrgId?: string;
    microsoftAccessToken?: string;
    microsoftRedirectUri?: string;
  }
}

/**
 * Authentication Middleware
 * 
 * SECURITY: This middleware safely handles authentication for both development and production environments:
 * - DEVELOPMENT: Uses hardcoded demo user for local testing (NODE_ENV === 'development' only)
 * - PRODUCTION: Requires proper authentication headers and returns 401 when missing
 * 
 * CRITICAL SECURITY FIX: Demo user creation is now gated behind NODE_ENV checks to prevent
 * hardcoded users and plaintext passwords from being created in production environments.
 * 
 * TODO: Implement JWT or session-based authentication for production use
 */
export function authenticateUser() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // DEVELOPMENT MODE BYPASS - automatically authenticate as Matthew Patrick
      // BUT only if there's a valid session or explicit backdoor headers
      if (process.env.NODE_ENV === 'development') {
        // Check if user explicitly logged out (no session and no backdoor headers)
        const hasBackdoorHeaders = req.headers['x-backdoor-user'] && req.headers['x-backdoor-key'];
        const hasValidSession = req.session && req.session.userId;
        
        // Only return backdoor user if there's a session or explicit backdoor auth
        if (hasValidSession || hasBackdoorHeaders) {
          const matthewUser = await ensureBackdoorUser(req.orgId);
          req.currentUser = matthewUser;
          return next();
        }
        // If no session and no backdoor headers, continue to regular auth checks
      }
      
      // SECURITY: Gate sensitive logging to avoid leaking session IDs and cookies in production
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 Auth check for ${req.method} ${req.path}`);
        console.log(`🍪 Raw cookies: ${req.headers.cookie}`);
        console.log(`📦 Session ID: ${req.session?.id}`);
        console.log(`👤 Session userId: ${req.session?.userId}`);
      }
      
      // Check for backdoor authentication (development environment only)
      const backdoorUser = req.headers['x-backdoor-user'] as string;
      const backdoorKey = req.headers['x-backdoor-key'] as string;
      const backdoorImpersonate = req.headers['x-backdoor-impersonate'] as string;
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔓 Backdoor headers: user=${backdoorUser}, key=${backdoorKey}, env=${process.env.NODE_ENV}`);
      }
      
      // SECURITY: Backdoor only works in development environment with explicit env vars
      if (backdoorUser && backdoorKey && process.env.NODE_ENV === 'development') {
        // Verify backdoor credentials - use defaults for development if env vars not set (like routes.ts)
        const validBackdoorUser = process.env.BACKDOOR_USER || "Matthew";
        const validBackdoorKey = process.env.BACKDOOR_KEY || "Dev123";
        
        if (validBackdoorUser && validBackdoorKey && 
            backdoorUser === validBackdoorUser && backdoorKey === validBackdoorKey) {
          
          // Check if impersonation is requested
          if (backdoorImpersonate) {
            // Try to get test user for impersonation
            const testUser = await getTestUser(req.orgId, backdoorImpersonate);
            if (testUser && testUser.isActive) {
              req.currentUser = testUser;
              console.log(`Backdoor impersonating test user: ${testUser.username} (${testUser.role})`);
              return next();
            } else {
              // Log available test users for debugging
              const availableUsers = getAvailableTestUsers();
              console.log(`Test user '${backdoorImpersonate}' not found. Available test users:`, availableUsers.map(u => u.username));
              return res.status(400).json({ 
                message: `Test user '${backdoorImpersonate}' not found. Available: ${availableUsers.map(u => u.username).join(', ')}` 
              });
            }
          }
          
          // Default: use Matthew Patrick's admin account
          const matthewUser = await ensureBackdoorUser(req.orgId);
          req.currentUser = matthewUser;
          return next();
        }
      }
      
      // Check for session-based authentication first
      if (req.session && req.session.userId) {
        console.log(`🎫 Found session userId: ${req.session.userId}`);
        const user = await storage.getUser(req.orgId, req.session.userId);
        if (user && user.isActive) {
          console.log(`✅ Session auth successful for: ${user.name}`);
          req.currentUser = user;
          return next();
        } else {
          console.log(`❌ Session auth failed - user not found or inactive`);
        }
      } else {
        console.log(`❌ No session or session userId`);
      }
      
      // SECURITY: Cookie-based authentication disabled in production due to security risks
      // The previous implementation trusted client-provided user IDs without proper token validation
      if (process.env.NODE_ENV === 'development') {
        // Check for cookie-based authentication (development only)
        let authUserId, authOrgId, authToken;
        
        if (req.cookies) {
          // cookie-parser is working
          authUserId = req.cookies['auth_user_id'];
          authOrgId = req.cookies['auth_org_id'];
          authToken = req.cookies['auth_session_token'];
        } else {
          // Fallback: manually parse cookies from header
          const cookieHeader = req.headers.cookie;
          if (cookieHeader) {
            const cookies: Record<string, string> = {};
            cookieHeader.split(';').forEach(cookie => {
              const [name, value] = cookie.trim().split('=');
              if (name && value) {
                cookies[name] = decodeURIComponent(value);
              }
            });
            authUserId = cookies['auth_user_id'];
            authOrgId = cookies['auth_org_id'];
            authToken = cookies['auth_session_token'];
          }
        }
        
        // TODO: Implement proper token validation instead of trusting client-provided user IDs
        if (authUserId && authOrgId && authToken && authOrgId === req.orgId) {
          const user = await storage.getUser(req.orgId, authUserId);
          if (user && user.isActive) {
            req.currentUser = user;
            // Also set session for consistency
            if (req.session) {
              req.session.userId = authUserId;
            }
            return next();
          }
        }
      }
      
      // No valid authentication found
      return res.status(401).json({ 
        message: "Authentication required. Please sign in with Slack or use backdoor headers." 
      });
    } catch (error) {
      console.error("Authentication error:", error);
      res.status(401).json({ message: "Authentication failed" });
    }
  };
}

/**
 * Middleware to require authentication
 * Use this on routes that need a current user
 */
export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      return res.status(401).json({ 
        message: "Authentication required" 
      });
    }
    next();
  };
}

/**
 * Middleware to require specific role(s)
 * Use this on routes that need specific user roles
 */
export function requireRole(roles: string[] | string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      return res.status(401).json({ 
        message: "Authentication required" 
      });
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(req.currentUser.role)) {
      return res.status(403).json({ 
        message: `Access denied. Required role(s): ${allowedRoles.join(', ')}` 
      });
    }
    
    next();
  };
}

/**
 * Middleware to require team lead authorization
 * User must be either:
 * - Admin role (can access all)
 * - Manager role with teamId matching the resource
 * - Team leader (leaderId) for the specific team
 */
export function requireTeamLead() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      return res.status(401).json({ 
        message: "Authentication required" 
      });
    }

    const user = req.currentUser;
    
    // Admins can access everything
    if (user.role === "admin") {
      return next();
    }
    
    // For other operations, we need to check if user is a team lead
    // This can be used in conjunction with route-specific logic
    if (user.role === "manager" && user.teamId) {
      return next();
    }
    
    // Check if user is a team leader by looking up teams they lead
    try {
      const teams = await storage.getAllTeams(req.orgId);
      const isTeamLeader = teams.some(team => team.leaderId === user.id);
      
      if (isTeamLeader) {
        return next();
      }
      
      return res.status(403).json({ 
        message: "Access denied. Team leadership role required." 
      });
    } catch (error) {
      console.error("Team leadership check error:", error);
      return res.status(500).json({ message: "Authorization check failed" });
    }
  };
}

/**
 * Middleware to require super admin privileges
 * Use this on routes that need system-wide admin access
 */
export function requireSuperAdmin() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      return res.status(401).json({ 
        message: "Authentication required" 
      });
    }

    if (!req.currentUser.isSuperAdmin) {
      return res.status(403).json({ 
        message: "Super admin privileges required" 
      });
    }
    
    next();
  };
}