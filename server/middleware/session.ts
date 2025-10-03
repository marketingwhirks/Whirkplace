import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import type { Request, Response, NextFunction } from 'express';

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
 * Detect if we're in a production environment based on multiple signals
 * This is more reliable than just checking NODE_ENV which stays 'development' in published Replit apps
 */
function isProductionEnvironment(req?: Request): boolean {
  // Check static environment variables first
  const nodeEnv = process.env.NODE_ENV || 'development';
  const port = process.env.PORT || '5000';
  const isReplit = !!process.env.REPL_SLUG;
  
  // Check Replit-specific deployment indicators
  const replitDeployment = process.env.REPLIT_DEPLOYMENT === '1';
  const replitDevDomain = process.env.REPLIT_DEV_DOMAIN || '';
  
  // Static checks (when no request available)
  // FIXED: More specific checks for production
  const staticProduction = 
    nodeEnv === 'production' || // Explicit production
    replitDeployment === true || // Replit deployment flag (explicit check)
    (replitDevDomain.length > 0 && 
     replitDevDomain.includes('.replit.app') && 
     !replitDevDomain.includes(':5000')); // Published Replit domain without dev port
  
  // If we have a request, check dynamic indicators
  if (req) {
    // Check protocol (HTTPS indicates production)
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const isHttps = protocol === 'https';
    
    // Check hostname for production domains
    const host = req.get('host') || req.hostname || '';
    
    // FIXED: More specific domain checks to avoid false positives
    const isProductionDomain = 
      (host.includes('.replit.app') && !host.includes(':5000')) || // Published Replit app
      host.includes('whirkplace.com') || // Custom domain
      (isHttps && !host.includes('localhost') && !host.includes('127.0.0.1')); // HTTPS non-local
    
    // Special case: if we're on port 5000 with local IPs, it's always development
    const isDevelopmentOverride = 
      (host.includes(':5000') || port === '5000') && 
      (host.includes('localhost') || host.includes('127.0.0.1') || host.includes('0.0.0.0'));
    
    // If development override is true, it's definitely development
    if (isDevelopmentOverride) {
      return false;
    }
    
    // Log request-based detection for debugging (only for potential production)
    if (isProductionDomain || isHttps) {
      console.log('🔍 Request-based production detection:', {
        protocol,
        host,
        isHttps,
        isProductionDomain,
        staticProduction,
        headers: {
          'x-forwarded-proto': req.get('x-forwarded-proto'),
          'host': req.get('host')
        }
      });
    }
    
    return staticProduction || isHttps || isProductionDomain;
  }
  
  return staticProduction;
}

/**
 * Create session middleware with dynamic cookie configuration
 * Returns a middleware function that creates appropriate session based on request
 */
export function createDynamicSessionMiddleware() {
  // Session store configuration (shared for all environments)
  const sessionStore = new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'user_sessions',
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 15, // Prune every 15 minutes
    errorLog: (error) => {
      console.error('📦 Session store error:', error);
    }
  });

  // Log initial environment details
  const nodeEnv = process.env.NODE_ENV || 'development';
  const port = process.env.PORT || '5000';
  const isReplit = !!process.env.REPL_SLUG;
  const replitDeployment = process.env.REPLIT_DEPLOYMENT === '1';
  const replitDevDomain = process.env.REPLIT_DEV_DOMAIN || '';
  
  console.log('🔍 Session environment detection (ENHANCED):', {
    NODE_ENV: nodeEnv,
    PORT: port,
    REPL_SLUG: isReplit ? 'present' : 'absent',
    REPLIT_DEPLOYMENT: replitDeployment,
    REPLIT_DEV_DOMAIN: replitDevDomain || '[not set]',
    initialDetection: isProductionEnvironment() ? 'PRODUCTION' : 'DEVELOPMENT',
    note: 'Cookie settings will be determined per-request for better accuracy'
  });

  // Create two session middleware instances with different cookie configurations
  const prodSessionMiddleware = session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'whirkplace-default-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    name: 'whirkplace.sid',
    proxy: true,
    cookie: {
      secure: true,
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'none' as const,
      domain: undefined,
      path: '/',
      partitioned: true
    } as any
  });

  const devSessionMiddleware = session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'whirkplace-default-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    name: 'whirkplace.sid',
    proxy: true,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'lax' as const,
      domain: undefined,
      path: '/'
    }
  });

  // Return a middleware function that chooses the appropriate session config
  return (req: Request, res: Response, next: NextFunction) => {
    const isProd = isProductionEnvironment(req);
    
    // Log detection result for first request or environment changes
    if (!req.path.includes('/api/') || req.path === '/') {
      console.log('🍪 Dynamic session detection:', {
        path: req.path,
        isProd,
        protocol: req.get('x-forwarded-proto') || req.protocol,
        host: req.get('host'),
        usingConfig: isProd ? 'PRODUCTION (secure cookies)' : 'DEVELOPMENT (non-secure cookies)'
      });
    }
    
    // Use the appropriate session middleware
    if (isProd) {
      prodSessionMiddleware(req, res, next);
    } else {
      devSessionMiddleware(req, res, next);
    }
  };
}

/**
 * Get proper session configuration based on environment
 * Legacy function for backwards compatibility - now just returns the dynamic middleware
 */
export function getSessionConfig() {
  return createDynamicSessionMiddleware();
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
  // Use the enhanced detection logic
  const nodeEnv = process.env.NODE_ENV || 'development';
  const port = process.env.PORT || '5000';
  const isReplit = !!process.env.REPL_SLUG;
  const replitDeployment = process.env.REPLIT_DEPLOYMENT === '1';
  const replitDevDomain = process.env.REPLIT_DEV_DOMAIN || '';
  
  // Use the new isProductionEnvironment function for consistent detection
  const isProdEnvironment = isProductionEnvironment();
  const useSecureCookies = isProdEnvironment;
  const sameSite = useSecureCookies ? 'none' : 'lax';
  
  console.log('🔐 Session configuration on startup:', {
    environment: isProdEnvironment ? 'PRODUCTION' : 'DEVELOPMENT',
    nodeEnv,
    port,
    replit: isReplit,
    replitDeployment,
    replitDevDomain: replitDevDomain || '[not set]',
    isProductionEnvironment: isProdEnvironment,
    secureCookies: useSecureCookies,
    sameSite: sameSite,
    partitioned: useSecureCookies,
    sessionName: 'whirkplace.sid',
    trustProxy: true,
    maxAge: '30 days',
    decision: isProdEnvironment ? '🔒 Using SECURE cookies for HTTPS' : '🔓 Using NON-SECURE cookies for HTTP/localhost',
    note: 'Actual cookie settings will be determined per-request for better accuracy'
  });
  
  // Extra warning for common misconfigurations
  if (!isProdEnvironment && useSecureCookies) {
    console.warn('⚠️  WARNING: Secure cookies enabled in non-production environment. This will cause session failures over HTTP!');
  }
  
  if (isProdEnvironment && !useSecureCookies) {
    console.error('❌ CRITICAL ERROR: Production environment detected but secure cookies disabled! Sessions will fail on HTTPS!');
  }
}