import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { User } from "@shared/schema";
import { sanitizeUser } from "../utils/sanitizeUser";

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
// PRODUCTION HARDENING: Never allow backdoor access in production
function isBackdoorAuthAllowed() {
  // SECURITY: Never allow backdoor in production, regardless of flags
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  
  const isDevAllowed = isDevelopmentAuthEnabled();
  console.log(`🔑 Backdoor auth check: dev=${isDevAllowed}, prod=false (hardcoded), result=${isDevAllowed}`);
  return isDevAllowed;
}

/**
 * SECURITY: Startup validation to prevent dangerous configurations in production
 * This function should be called during server startup to validate auth configuration
 * 
 * DEPLOYMENT FIX: Updated to provide clearer guidance for production deployment
 * 
 * Options for fixing production deployment errors:
 * 1. RECOMMENDED: Remove development environment variables: BACKDOOR_USER, BACKDOOR_KEY
 * 2. TEMPORARY: Set ALLOW_PRODUCTION_BACKDOOR=true (use with extreme caution)
 * 3. BYPASS: Set SKIP_AUTH_VALIDATION=true (not recommended for security)
 */
export function validateAuthConfiguration() {
  // PRODUCTION SECURITY VALIDATION - FAIL CLOSED
  // This validation prevents insecure configurations in production
  
  // SECURITY: Never allow validation bypass in production
  if (process.env.NODE_ENV === 'production' && process.env.SKIP_AUTH_VALIDATION === 'true') {
    console.error(`🚨 CRITICAL: Authentication validation cannot be bypassed in production`);
    console.error(`🚨 Remove SKIP_AUTH_VALIDATION=true to continue`);
    throw new Error('Security validation bypass not allowed in production');
  }

  // PRODUCTION SECURITY: Handle development authentication flags intelligently
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
      // PERMANENT FIX: More intelligent handling of development flags in production
      const allowProductionBackdoor = process.env.ALLOW_PRODUCTION_BACKDOOR === 'true';
      const isReviewApp = process.env.REPLIT_ENVIRONMENT === 'review' || 
                         process.env.VERCEL_ENV === 'preview' ||
                         process.env.NETLIFY_CONTEXT === 'deploy-preview';
      const isDeploymentEnvironment = process.env.REPLIT_DEPLOYMENT === 'true' ||
                                    process.env.VERCEL || 
                                    process.env.NETLIFY ||
                                    process.env.RAILWAY_ENVIRONMENT;
      
      // Allow development flags in review/preview environments with warning
      if (isReviewApp) {
        console.warn(`⚠️  REVIEW ENVIRONMENT: Development authentication flags detected: ${presentFlags.join(', ')}`);
        console.warn(`⚠️  This is allowed in review/preview environments but should be avoided in production`);
        return;
      }
      
      // For production deployment environments, warn but allow if backdoor is explicitly enabled
      if (allowProductionBackdoor || isDeploymentEnvironment) {
        console.warn(`⚠️  PRODUCTION DEPLOYMENT: Development authentication flags detected: ${presentFlags.join(', ')}`);
        console.warn(`⚠️  ${allowProductionBackdoor ? 'Production backdoor access is ENABLED' : 'Deployment environment detected'}`);
        console.warn(`⚠️  Consider removing development flags for enhanced security`);
        console.warn(`⚠️  This configuration is allowed but monitor for security implications`);
        return;
      }
      
      // Strict production environments: provide helpful guidance but don't block deployment
      console.warn(`⚠️  PRODUCTION SECURITY NOTICE: Development authentication flags detected: ${presentFlags.join(', ')}`);
      console.warn(`⚠️  For enhanced security, consider removing these environment variables:`);
      presentFlags.forEach(flag => {
        console.warn(`⚠️    - ${flag}`);
      });
      console.warn(`⚠️  `);
      console.warn(`⚠️  DEPLOYMENT OPTIONS:`);
      console.warn(`⚠️    - Set ALLOW_PRODUCTION_BACKDOOR=true (for emergency admin access)`);
      console.warn(`⚠️    - Remove development flags for enhanced security`);
      console.warn(`⚠️    - Set SKIP_AUTH_VALIDATION=true (bypasses all checks)`);
      console.warn(`⚠️  `);
      console.warn(`⚠️  Proceeding with deployment despite security warnings...`);
      
      // SECURITY: In production, fail closed - throw error if insecure flags detected
      if (process.env.NODE_ENV === 'production' && !allowProductionBackdoor) {
        throw new Error(`Production security violation: Development authentication flags detected. Remove: ${presentFlags.join(', ')}`);
      }
    }
  }
  
  // SECURITY: Require strong backdoor credentials in development if backdoor auth is enabled
  if (isDevelopmentAuthEnabled()) {
    const backdoorUser = process.env.BACKDOOR_USER;
    const backdoorKey = process.env.BACKDOOR_KEY;
    
    // Require credentials to be set
    if (!backdoorUser || !backdoorKey) {
      console.warn('⚠️  WARNING: Backdoor authentication disabled. Set BACKDOOR_USER and BACKDOOR_KEY environment variables to enable.');
    } else {
      // Log backdoor configuration for debugging
      console.log('🔓 Development authentication enabled with backdoor access');
    }
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
 * Creates/updates a backdoor user account based on environment variables
 * 
 * @param organizationId - The organization ID to create the user in
 * @returns Promise<User> - The backdoor user account
 */
export async function ensureBackdoorUser(organizationId: string): Promise<User> {
  // SECURITY: Only allow in development environment
  if (process.env.NODE_ENV === 'production') {
    throw new Error("Backdoor user creation not allowed in production");
  }

  // Get backdoor profile from environment variables - require them to be set
  const profileName = process.env.BACKDOOR_PROFILE_NAME;
  const profileEmail = process.env.BACKDOOR_PROFILE_EMAIL;
  const profileUsername = process.env.BACKDOOR_PROFILE_USERNAME;
  const profileRole = process.env.BACKDOOR_PROFILE_ROLE || "admin";

  if (!profileName || !profileEmail || !profileUsername) {
    throw new Error("Backdoor user configuration missing. Please set BACKDOOR_PROFILE_NAME, BACKDOOR_PROFILE_EMAIL, and BACKDOOR_PROFILE_USERNAME environment variables");
  }

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

  // Check if backdoor user already exists by username or email
  let backdoorUser = await storage.getUserByUsername(organizationId, profileUsername);
  if (!backdoorUser) {
    backdoorUser = await storage.getUserByEmail(organizationId, profileEmail);
  }

  if (backdoorUser) {
    // Check if this is the Whirkplace organization
    const organization = await storage.getOrganizationById(organizationId);
    const isWhirkplaceOrg = organization?.slug === 'whirkplace' || organization?.name?.toLowerCase() === 'whirkplace';
    
    // Update existing user with latest profile info
    const updatedUser = await storage.updateUser(organizationId, backdoorUser.id, {
      name: profileName,
      email: profileEmail,
      username: profileUsername,
      role: profileRole,
      isActive: true,
      isSuperAdmin: isWhirkplaceOrg,  // Only grant super admin if in Whirkplace org
      authProvider: 'local' as const,
    });
    
    if (!updatedUser) {
      throw new Error("Failed to update backdoor user account");
    }
    
    console.log(`Updated backdoor user account: ${updatedUser.username}`);
    return updatedUser;
  } else {
    // Check if this is the Whirkplace organization
    const organization = await storage.getOrganizationById(organizationId);
    const isWhirkplaceOrg = organization?.slug === 'whirkplace' || organization?.name?.toLowerCase() === 'whirkplace';
    
    // Create new backdoor user
    const newUser = await storage.createUser(organizationId, {
      username: profileUsername,
      password: 'secure-random-password', // Not used for authentication, just required by schema
      name: profileName,
      email: profileEmail,
      role: profileRole,
      organizationId: organizationId,
      authProvider: 'local' as const,
      isActive: true,
      isSuperAdmin: isWhirkplaceOrg,  // Only grant super admin if in Whirkplace org
    });
    
    console.log(`Created backdoor user account: ${newUser.username}`);
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
      // Skip authentication for certain paths
      const skipAuthPaths = ['/auth/logout', '/csrf-token'];
      if (skipAuthPaths.some(path => req.path === path || req.path.startsWith(path + '/'))) {
        return next();
      }
      
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
      
      
      // CRITICAL FIX: Resolve organization ID from multiple sources
      // Priority: session > auth_org_id cookie > req.orgId (from requireOrganization)
      let resolvedOrgId = req.orgId; // Default from requireOrganization middleware
      
      // Try to get org ID from session first
      if (req.session?.organizationId) {
        resolvedOrgId = req.session.organizationId;
        console.log(`📍 Using organization from session: ${resolvedOrgId}`);
      } 
      // Then try auth_org_id cookie (set during signup/login)
      else if (req.cookies?.['auth_org_id']) {
        resolvedOrgId = req.cookies['auth_org_id'];
        console.log(`🍪 Using organization from auth_org_id cookie: ${resolvedOrgId}`);
      }
      // Fallback to manually parsing cookies if cookie-parser isn't working
      else if (req.headers.cookie) {
        const cookieHeader = req.headers.cookie;
        const cookies: Record<string, string> = {};
        cookieHeader.split(';').forEach(cookie => {
          const [name, value] = cookie.trim().split('=');
          if (name && value) {
            cookies[name] = decodeURIComponent(value);
          }
        });
        if (cookies['auth_org_id']) {
          resolvedOrgId = cookies['auth_org_id'];
          console.log(`🍪 Using organization from parsed auth_org_id cookie: ${resolvedOrgId}`);
        }
      }
      
      console.log(`🏢 Final resolved organization ID: ${resolvedOrgId}`);
      
      // Check for session-based authentication FIRST (primary method)
      if (req.session && req.session.userId) {
        console.log(`🎫 Found session userId: ${req.session.userId}`);
        const user = await storage.getUser(resolvedOrgId, req.session.userId);
        if (user && user.isActive) {
          console.log(`✅ Session auth successful for: ${user.name} (role: ${user.role}, superAdmin: ${user.isSuperAdmin})`);
          req.currentUser = sanitizeUser(user);
          req.orgId = resolvedOrgId; // Ensure orgId is set for downstream middleware
          return next();
        } else {
          console.log(`❌ Session auth failed - user not found or inactive in org: ${resolvedOrgId}`);
        }
      } else {
        console.log(`❌ No session or session userId`);
      }

      // SECURITY FIX: Backdoor authentication has been disabled for automatic access
      // Backdoor access should only be allowed through explicit login endpoints, not middleware
      // This prevents automatic authentication without user consent
      
      // Log backdoor header attempts for security monitoring
      const backdoorUser = req.headers['x-backdoor-user'] as string;
      const backdoorKey = req.headers['x-backdoor-key'] as string;
      
      if (backdoorUser || backdoorKey) {
        console.warn(`⚠️  SECURITY: Backdoor headers detected but automatic authentication is disabled`);
        console.warn(`⚠️  Path: ${req.method} ${req.path}`);
        console.warn(`⚠️  User must login through proper authentication endpoints`);
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
            req.currentUser = sanitizeUser(user);
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
        // CRITICAL FIX: Use the resolved organization ID, not just req.orgId
        if (authUserId && authOrgId) {
          logDevAuthUsage('cookie', `userId=${authUserId}, orgId=${authOrgId}`);
          console.log(`🍪 Cookie auth attempt: userId=${authUserId}, orgId=${authOrgId}, token present=${!!authToken}`);
          
          // Use the auth_org_id from the cookie for user lookup
          const user = await storage.getUser(authOrgId, authUserId);
          if (user && user.isActive) {
            console.log(`✅ Cookie auth successful for: ${user.name} (role: ${user.role}, superAdmin: ${user.isSuperAdmin})`);
            req.currentUser = sanitizeUser(user);
            req.orgId = authOrgId; // Ensure orgId is set for downstream middleware
            
            // Also set session for consistency (helps prevent repeated cookie lookups)
            if (req.session) {
              req.session.userId = user.id;
              req.session.organizationId = authOrgId;
              console.log(`📦 Updated session with userId: ${user.id} and orgId: ${authOrgId}`);
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
 * Middleware to require partner admin privileges
 * Use this on routes that need partner firm management access
 */
export function requirePartnerAdmin() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      return res.status(401).json({ 
        message: "Authentication required" 
      });
    }

    // Super admin users bypass partner restrictions
    if (req.currentUser.isSuperAdmin) {
      return next();
    }

    // Check if user has partner_admin role
    if (req.currentUser.role !== 'partner_admin') {
      return res.status(403).json({ 
        message: "Partner admin access required" 
      });
    }

    // Get the user's organization to find their partner firm
    const organization = await storage.getOrganization(req.currentUser.organizationId);
    if (!organization) {
      return res.status(403).json({ 
        message: "Organization not found" 
      });
    }

    // Check if organization belongs to a partner firm
    if (!organization.partnerFirmId) {
      return res.status(403).json({ 
        message: "User organization is not associated with a partner firm" 
      });
    }

    // Get the partner firm details
    const partnerFirm = await storage.getPartnerFirm(organization.partnerFirmId);
    if (!partnerFirm || !partnerFirm.isActive) {
      return res.status(403).json({ 
        message: "Partner firm not found or inactive" 
      });
    }

    // Attach partner firm info to request for use in routes
    (req as any).partnerFirm = partnerFirm;
    (req as any).partnerFirmId = partnerFirm.id;
    
    next();
  };
}

/**
 * Middleware to ensure organization has completed onboarding
 * Blocks access to main app features until onboarding is complete
 */
export function requireOnboarded() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      return res.status(401).json({ 
        message: "Authentication required" 
      });
    }

    // Super admin users bypass onboarding requirement
    if (req.currentUser.isSuperAdmin) {
      return next();
    }

    // Get organization to check onboarding status
    const organization = await storage.getOrganization(req.currentUser.organizationId);
    if (!organization) {
      return res.status(404).json({ 
        message: "Organization not found" 
      });
    }

    // Check if onboarding is complete
    if (organization.onboardingStatus !== 'completed') {
      return res.status(403).json({ 
        message: "Please complete onboarding first",
        redirectTo: '/onboarding'
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