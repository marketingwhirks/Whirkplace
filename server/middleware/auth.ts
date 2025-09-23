import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { User } from "@shared/schema";

/**
 * SECURITY: Additional authentication security guards
 * These guards prevent development-only authentication methods from being used inappropriately
 */

// SECURITY: Feature flag for development authentication methods
// We check this dynamically because it may be set after module load
function isDevelopmentAuthEnabled() {
  const isDevEnv = process.env.NODE_ENV === 'development';
  const isAuthEnabled = process.env.DEV_AUTH_ENABLED === 'true';
  console.log(`🔧 Dev auth check: NODE_ENV=${process.env.NODE_ENV}, DEV_AUTH_ENABLED=${process.env.DEV_AUTH_ENABLED}, result=${isDevEnv && isAuthEnabled}`);
  return isDevEnv && isAuthEnabled;
}

// SECURITY: Check if backdoor authentication is allowed in current environment
// This allows backdoor access in development OR production with explicit flag
function isBackdoorAuthAllowed() {
  const isDevAllowed = isDevelopmentAuthEnabled();
  const isProdAllowed = process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_BACKDOOR === 'true';
  const result = isDevAllowed || isProdAllowed;
  
  if (isProdAllowed) {
    console.log(`⚠️  Production backdoor access is ENABLED via ALLOW_PRODUCTION_BACKDOOR=true`);
  }
  
  console.log(`🔑 Backdoor auth check: dev=${isDevAllowed}, prod=${isProdAllowed}, result=${result}`);
  return result;
}

/**
 * SECURITY: Startup validation to prevent dangerous configurations in production
 * This function should be called during server startup to validate auth configuration
 * 
 * To allow backdoor access in production (USE WITH EXTREME CAUTION), set:
 * ALLOW_PRODUCTION_BACKDOOR=true
 */
export function validateAuthConfiguration() {
  // SECURITY: In production, check for development authentication flags
  if (process.env.NODE_ENV === 'production') {
    const dangerousFlags = [
      'DEV_AUTH_ENABLED',
      'BACKDOOR_USER', 
      'BACKDOOR_KEY',
      'BACKDOOR_PROFILE_NAME',
      'BACKDOOR_PROFILE_EMAIL'
    ];
    
    const presentFlags = dangerousFlags.filter(flag => process.env[flag]);
    if (presentFlags.length > 0) {
      // Check if production backdoor access is explicitly allowed
      const allowProductionBackdoor = process.env.ALLOW_PRODUCTION_BACKDOOR === 'true';
      
      if (allowProductionBackdoor) {
        console.warn(`⚠️  SECURITY WARNING: Development authentication flags detected in production: ${presentFlags.join(', ')}`);
        console.warn(`⚠️  Production backdoor access is ENABLED via ALLOW_PRODUCTION_BACKDOOR=true`);
        console.warn(`⚠️  This should only be used for emergency administrative access`);
        console.warn(`⚠️  Remove ALLOW_PRODUCTION_BACKDOOR and development flags when not needed`);
      } else {
        console.error(`🚨 CRITICAL SECURITY ERROR: Development authentication flags found in production: ${presentFlags.join(', ')}`);
        console.error(`🚨 To allow this (NOT RECOMMENDED), set ALLOW_PRODUCTION_BACKDOOR=true`);
        console.error(`🚨 Otherwise, remove these environment variables: ${presentFlags.join(', ')}`);
        throw new Error(`SECURITY: Development authentication flags not allowed in production: ${presentFlags.join(', ')}`);
      }
    }
  }
  
  // SECURITY: Require strong backdoor credentials in development if backdoor auth is enabled
  if (isDevelopmentAuthEnabled()) {
    const backdoorUser = process.env.BACKDOOR_USER || "Matthew";
    const backdoorKey = process.env.BACKDOOR_KEY || "Dev123";
    
    // Warn about default credentials (but don't block - this is development)
    if (backdoorUser === "Matthew" && backdoorKey === "Dev123") {
      console.warn('⚠️  WARNING: Using default backdoor credentials. Set BACKDOOR_USER and BACKDOOR_KEY environment variables for stronger security.');
    }
    
    // Log backdoor configuration for debugging
    console.log('🔓 Development authentication enabled with backdoor access');
  }
  
  console.log('✅ Authentication configuration validated');
}

/**
 * SECURITY: Runtime monitoring for development authentication usage
 * Logs any usage of development authentication methods for monitoring
 */
function logDevAuthUsage(method: string, details: string) {
  if (process.env.NODE_ENV !== 'development') {
    console.error(`🚨 SECURITY ALERT: Development authentication method '${method}' used in non-development environment: ${details}`);
  } else {
    console.log(`🔓 Development auth used: ${method} - ${details}`);
  }
}

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

// Extend Express Session to include userId and auth fields
declare module "express-session" {
  interface SessionData {
    userId?: string;
    microsoftAuthState?: string;
    authOrgId?: string;
    microsoftAccessToken?: string;
    microsoftRedirectUri?: string;
    slackOAuthState?: string;
    slackOrgSlug?: string;
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
      // SECURITY FIX: Removed automatic backdoor authentication based on session existence
      // This was a critical vulnerability that bypassed real authentication
      
      // SECURITY: Gate sensitive logging to avoid leaking session IDs and cookies in production
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 Auth check for ${req.method} ${req.path}`);
        console.log(`🍪 Raw cookies: ${req.headers.cookie}`);
        console.log(`📦 Session ID: ${req.session?.id}`);
        console.log(`👤 Session userId: ${req.session?.userId}`);
      }
      
      // SECURITY: Enhanced production environment check for cookie-based auth
      if (process.env.NODE_ENV === 'production') {
        // In production, NEVER use cookie-based authentication - log any attempts
        const cookieHeader = req.headers.cookie;
        if (cookieHeader && (cookieHeader.includes('auth_user_id') || cookieHeader.includes('auth_session_token'))) {
          console.error(`🚨 SECURITY ALERT: Cookie-based authentication attempted in production for ${req.method} ${req.path}`);
          console.error(`🚨 User agent: ${req.headers['user-agent']}`);
          console.error(`🚨 IP: ${req.ip}`);
        }
      }
      
      
      // Check for session-based authentication FIRST (primary method)
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

      // Check for backdoor authentication (development with feature flag)
      // Express automatically lowercases header names
      const backdoorUser = req.headers['x-backdoor-user'] as string;
      const backdoorKey = req.headers['x-backdoor-key'] as string;
      const backdoorImpersonate = req.headers['x-backdoor-impersonate'] as string;
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔓 Backdoor headers: user=${backdoorUser}, key=${backdoorKey ? '[REDACTED]' : 'undefined'}, env=${process.env.NODE_ENV}`);
        console.log(`🔑 Environment backdoor: user=${process.env.BACKDOOR_USER}, key=${process.env.BACKDOOR_KEY ? '[REDACTED]' : 'undefined'}`);
        console.log(`🔧 DEV_AUTH_ENABLED=${isDevelopmentAuthEnabled()}`);
      }
      
      // SECURITY: Backdoor authentication with environment-specific handling
      if (backdoorUser && backdoorKey && isBackdoorAuthAllowed()) {
        logDevAuthUsage('backdoor', `user=${backdoorUser}, impersonate=${backdoorImpersonate || 'none'}`);
        
        // Verify backdoor credentials - use environment variables for security
        const validBackdoorUser = process.env.BACKDOOR_USER;
        const validBackdoorKey = process.env.BACKDOOR_KEY;
        
        console.log(`🔑 Credential check: validUser=${validBackdoorUser}, validKey=${validBackdoorKey ? '[REDACTED]' : 'undefined'}`);
        console.log(`🔑 Header check: backdoorUser=${backdoorUser}, backdoorKey=${backdoorKey ? '[REDACTED]' : 'undefined'}`);
        console.log(`🔑 Match check: userMatch=${backdoorUser === validBackdoorUser}, keyMatch=${backdoorKey === validBackdoorKey}`);
        
        if (validBackdoorUser && validBackdoorKey && 
            backdoorUser === validBackdoorUser && backdoorKey === validBackdoorKey) {
          
          // Backdoor impersonation is no longer supported
          if (backdoorImpersonate) {
            return res.status(400).json({ 
              message: 'User impersonation has been removed from the system' 
            });
          }
          
          // Handle development vs production backdoor access differently
          if (process.env.NODE_ENV === 'development') {
            // Development: use Matthew Patrick's admin account (creates if needed)
            const matthewUser = await ensureBackdoorUser(req.orgId);
            req.currentUser = matthewUser;
            return next();
          } else {
            // Production: find existing admin user matching BACKDOOR_USER (no creation)
            console.log(`🔓 Production backdoor access: looking for existing user ${validBackdoorUser}`);
            const existingUser = await storage.getUserByUsername(req.orgId, validBackdoorUser) || 
                                await storage.getUserByEmail(req.orgId, validBackdoorUser);
            
            if (existingUser && existingUser.isActive && (existingUser.role === 'admin' || existingUser.isSuperAdmin)) {
              console.log(`✅ Production backdoor access granted to existing admin: ${existingUser.username}`);
              req.currentUser = existingUser;
              return next();
            } else {
              console.error(`🚨 Production backdoor failed: no active admin user found for ${validBackdoorUser}`);
              return res.status(401).json({ 
                message: 'Backdoor authentication failed: admin user not found' 
              });
            }
          }
        }
      }

      // Check for localStorage-based authentication as development fallback only
      if (isDevelopmentAuthEnabled()) {
        const authUserId = req.headers['x-auth-user-id'] as string;
        console.log(`🔍 localStorage header check: x-auth-user-id = ${authUserId}`);
        if (authUserId) {
          logDevAuthUsage('localStorage', `userId=${authUserId}`);
          console.log(`📱 Found localStorage auth userId: ${authUserId}`);
          const user = await storage.getUser(req.orgId, authUserId);
          if (user && user.isActive) {
            console.log(`✅ localStorage auth successful for: ${user.name}`);
            req.currentUser = user;
            return next();
          } else {
            console.log(`❌ localStorage auth failed - user not found or inactive`);
          }
        } else {
          console.log(`❌ No localStorage auth header found`);
        }
      }
      
      // SECURITY: Cookie-based authentication disabled in production due to security risks
      // The previous implementation trusted client-provided user IDs without proper token validation
      if (isDevelopmentAuthEnabled()) {
        // isDevelopmentAuthEnabled() already includes development environment check
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
          logDevAuthUsage('cookie', `userId=${authUserId}, orgId=${authOrgId}`);
          console.log(`🍪 Cookie auth attempt: userId=${authUserId}, orgId=${authOrgId}, token present=${!!authToken}`);
          const user = await storage.getUser(req.orgId, authUserId);
          if (user && user.isActive) {
            console.log(`✅ Cookie auth successful for: ${user.name}`);
            req.currentUser = user;
            // Also set session for consistency (helps prevent repeated cookie lookups)
            if (req.session) {
              req.session.userId = user.id;
              console.log(`📦 Updated session with userId: ${user.id}`);
            }
            return next();
          } else {
            console.log(`❌ Cookie auth failed - user not found or inactive`);
          }
        } else if (authUserId) {
          console.log(`❌ Cookie auth failed - missing data or org mismatch. userId=${!!authUserId}, orgId=${authOrgId}, expectedOrg=${req.orgId}, token=${!!authToken}`);
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

    // Super admin users bypass all role restrictions
    if (req.currentUser.isSuperAdmin) {
      return next();
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
    
    // Super admins can access everything
    if (user.isSuperAdmin) {
      return next();
    }
    
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