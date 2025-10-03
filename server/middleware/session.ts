import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import type { Request, Response } from 'express';

// Extend session data with our custom properties
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    organizationId?: string;
    organizationSlug?: string;
    oauthState?: string;
    returnTo?: string;
  }
}

// Create PostgreSQL session store
const PgSession = connectPgSimple(session);

/**
 * Get proper session configuration based on environment
 */
export function getSessionConfig() {
  // CRITICAL FIX: Simplified and reliable environment detection
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const isDevelopment = nodeEnv === 'development' || nodeEnv !== 'production';
  const port = process.env.PORT || '5000';
  const isReplit = !!process.env.REPL_SLUG;
  
  // CRITICAL FIX: Simple and clear detection logic
  // Development = explicitly development mode OR port 5000 (dev default) OR explicit localhost flag
  // Production = NODE_ENV is production OR we're in Replit and NOT on port 5000
  const isLocalDevelopment = 
    isDevelopment && (port === '5000' || process.env.TESTING_LOCALHOST === 'true');
  
  // CRITICAL FIX: Properly detect production environments
  // This includes:
  // - NODE_ENV=production
  // - Replit apps that are published (not on port 5000)
  // - Any HTTPS sites (custom domains, etc)
  const isProductionEnvironment = 
    isProduction || // Explicit production
    (isReplit && port !== '5000' && !process.env.TESTING_LOCALHOST); // Published Replit app
  
  // Log detection details for debugging
  console.log('🔍 Session environment detection (FIXED):', {
    NODE_ENV: nodeEnv,
    PORT: port,
    REPL_SLUG: isReplit ? 'present' : 'absent',
    isLocalDevelopment,
    isProductionEnvironment,
    decision: isProductionEnvironment ? 'PRODUCTION (secure cookies)' : 'DEVELOPMENT (non-secure cookies)'
  });
  
  // Session store configuration
  const sessionStore = new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'user_sessions',
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 15, // Prune every 15 minutes
    errorLog: (error) => {
      console.error('📦 Session store error:', error);
    }
  });

  // CRITICAL FIX: Simplified cookie configuration based on environment
  let cookieConfig;
  
  if (isProductionEnvironment) {
    // PRODUCTION: All HTTPS sites (custom domains, published Replit apps, etc.)
    // MUST use secure cookies with sameSite='none' for HTTPS to work
    cookieConfig = {
      secure: true, // REQUIRED for HTTPS
      httpOnly: true, // Security best practice
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: 'none' as const, // Required for cross-origin contexts (iframes, OAuth)
      domain: undefined, // Let browser handle domain automatically
      path: '/',
      partitioned: true // Chrome's CHIPS for iframe contexts
    } as any;
    
    console.log('🔒 PRODUCTION COOKIES: secure=true, sameSite=none (for HTTPS sites)');
  } else {
    // DEVELOPMENT: Local development, HTTP localhost
    // Cannot use secure cookies over HTTP
    cookieConfig = {
      secure: false, // MUST be false for HTTP
      httpOnly: true, // Security best practice
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: 'lax' as const, // Allows same-site requests
      domain: undefined, // Let browser handle domain automatically
      path: '/'
      // No partitioned flag in development
    } as any;
    
    console.log('🔓 DEVELOPMENT COOKIES: secure=false, sameSite=lax (for HTTP/localhost)');
  }
  
  // Enhanced logging for cookie configuration
  console.log('🍪 Cookie configuration details:', {
    environment: isProductionEnvironment ? 'PRODUCTION' : 'DEVELOPMENT',
    nodeEnv,
    port,
    isReplit,
    cookie: {
      secure: cookieConfig.secure,
      httpOnly: cookieConfig.httpOnly,
      sameSite: cookieConfig.sameSite,
      domain: cookieConfig.domain || '[browser-default]',
      path: cookieConfig.path,
      maxAge: `${cookieConfig.maxAge / (24 * 60 * 60 * 1000)} days`,
      partitioned: cookieConfig.partitioned || false
    }
  });

  // Session configuration
  return {
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'whirkplace-default-secret-change-in-production',
    resave: false,
    saveUninitialized: false, // Don't create sessions until we store data
    name: 'whirkplace.sid', // Custom session name to avoid conflicts
    proxy: true, // Trust proxy headers
    cookie: cookieConfig
  };
}

/**
 * Helper to get the current session user
 */
export function getSessionUser(req: Request) {
  if (!req.session) {
    return null;
  }
  
  return {
    userId: req.session.userId,
    organizationId: req.session.organizationId,
    organizationSlug: req.session.organizationSlug
  };
}

/**
 * Helper to set session user data
 * FIXED: Skip regeneration in development to avoid session persistence issues
 */
export async function setSessionUser(
  req: Request,
  userId: string,
  organizationId: string,
  organizationSlug?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      console.error('❌ CRITICAL: Session not initialized in setSessionUser');
      return reject(new Error('Session not initialized'));
    }

    // Enhanced logging for session operations
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 setSessionUser START:', {
      sessionId: req.sessionID,
      newUserId: userId,
      newOrganizationId: organizationId,
      newOrganizationSlug: organizationSlug,
      existingUserId: req.session.userId,
      existingOrgId: req.session.organizationId,
      existingOrgSlug: req.session.organizationSlug,
      caller: new Error().stack?.split('\n')[2]?.trim() // Get calling function for debugging
    });

    // In development, skip regeneration to avoid session loss issues
    const saveSession = () => {
      // Log before setting data
      console.log('🔧 Setting session data:', {
        sessionId: req.sessionID,
        userId,
        organizationId,
        organizationSlug
      });

      req.session.userId = userId;
      req.session.organizationId = organizationId;
      if (organizationSlug) {
        req.session.organizationSlug = organizationSlug;
      }

      // Log actual session object before save
      console.log('💾 Session object before save:', {
        sessionId: req.sessionID,
        sessionData: {
          userId: req.session.userId,
          organizationId: req.session.organizationId,
          organizationSlug: req.session.organizationSlug
        }
      });

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('❌ Failed to save session:', saveErr);
          return reject(saveErr);
        }
        
        // Verify session data after save with enhanced logging
        console.log('✅ SESSION SAVE SUCCESSFUL!', {
          sessionId: req.sessionID,
          userId: req.session.userId,
          organizationId: req.session.organizationId,
          organizationSlug: req.session.organizationSlug,
          cookie: {
            maxAge: req.session.cookie.maxAge,
            httpOnly: req.session.cookie.httpOnly,
            secure: req.session.cookie.secure,
            sameSite: req.session.cookie.sameSite
          }
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        resolve();
      });
    };

    // Only regenerate in production for security
    if (process.env.NODE_ENV === 'production') {
      console.log('🔒 Production mode: Regenerating session for security');
      req.session.regenerate((err) => {
        if (err) {
          console.error('❌ Failed to regenerate session:', err);
          return reject(err);
        }
        console.log('🆕 Session regenerated, new ID:', req.sessionID);
        saveSession();
      });
    } else {
      console.log('🔓 Development mode: Skipping regeneration for stability');
      // In development, just save without regenerating
      saveSession();
    }
  });
}

/**
 * Helper to clear session user data
 */
export async function clearSessionUser(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      return resolve();
    }

    // Clear user data
    delete req.session.userId;
    delete req.session.organizationId;
    delete req.session.organizationSlug;
    
    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        console.error('❌ Failed to destroy session:', err);
        return reject(err);
      }
      
      console.log('✅ Session cleared');
      resolve();
    });
  });
}

/**
 * Log session configuration on startup
 */
export function logSessionConfig() {
  // Match the exact detection logic from getSessionConfig
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const isDevelopment = nodeEnv === 'development' || nodeEnv !== 'production';
  const port = process.env.PORT || '5000';
  const isReplit = !!process.env.REPL_SLUG;
  
  // Match detection from getSessionConfig
  const isLocalDevelopment = 
    isDevelopment && (port === '5000' || process.env.TESTING_LOCALHOST === 'true');
  
  const isProductionEnvironment = 
    isProduction || // Explicit production
    (isReplit && port !== '5000' && !process.env.TESTING_LOCALHOST); // Published Replit app
  
  const useSecureCookies = isProductionEnvironment;
  const sameSite = useSecureCookies ? 'none' : 'lax';
  
  console.log('🔐 Session configuration on startup:', {
    environment: isProductionEnvironment ? 'PRODUCTION' : 'DEVELOPMENT',
    nodeEnv,
    port,
    replit: isReplit,
    isLocalDevelopment,
    isProductionEnvironment,
    secureCookies: useSecureCookies,
    sameSite: sameSite,
    partitioned: useSecureCookies,
    sessionName: 'whirkplace.sid',
    trustProxy: true,
    maxAge: '30 days',
    decision: isProductionEnvironment ? '🔒 Using SECURE cookies for HTTPS' : '🔓 Using NON-SECURE cookies for HTTP/localhost'
  });
  
  // Extra warning for common misconfigurations
  if (!isProductionEnvironment && useSecureCookies) {
    console.warn('⚠️  WARNING: Secure cookies enabled in non-production environment. This will cause session failures over HTTP!');
  }
  
  if (isProductionEnvironment && !useSecureCookies) {
    console.error('❌ CRITICAL ERROR: Production environment detected but secure cookies disabled! Sessions will fail on HTTPS!');
  }
}