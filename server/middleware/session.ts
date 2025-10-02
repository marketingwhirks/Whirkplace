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
  const isProduction = process.env.NODE_ENV === 'production';
  const isReplit = !!process.env.REPL_SLUG;
  const isDevelopment = process.env.NODE_ENV === 'development';
  const port = process.env.PORT || '5000';
  
  // CRITICAL FIX: Comprehensive localhost detection
  // In Replit development, we're still on localhost even though REPL_SLUG is set
  // We need to detect when we're running on HTTP localhost vs HTTPS production
  const isLocalhost = 
    process.env.TESTING_LOCALHOST === 'true' || // Explicit env var
    isDevelopment || // Development mode always means localhost
    port === '5000' || // Default dev port indicates localhost
    (!isProduction); // Any non-production is treated as localhost for cookies
  
  // Log detection details for debugging
  console.log('🔍 Session environment detection:', {
    NODE_ENV: process.env.NODE_ENV,
    REPL_SLUG: !!process.env.REPL_SLUG,
    PORT: port,
    isProduction,
    isDevelopment,
    isReplit,
    isLocalhost
  });
  
  // Determine if we should use secure cookies
  // CRITICAL FIX: Only use secure cookies for actual HTTPS production
  // In Replit development (localhost:5000), we're on HTTP, not HTTPS
  // Browsers refuse to set secure cookies over HTTP, causing sessions to fail
  // Logic: If we're on localhost, NEVER use secure cookies (they don't work over HTTP)
  // Otherwise, use secure cookies if we're in production Replit (for iframe context)
  const useSecureCookies = !isLocalhost && (isReplit && isProduction);
  
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

  // Cookie configuration
  // Production Replit (iframe) needs sameSite=none with secure
  // Development/localhost needs sameSite=lax without secure
  const sameSite = useSecureCookies ? 'none' as const : 'lax' as const;
  
  const cookieConfig = {
    secure: useSecureCookies,
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: sameSite,
    domain: undefined, // Let browser set domain automatically
    path: '/',
    // Add partitioned flag only when using secure cookies for Chrome's CHIPS
    ...(useSecureCookies ? { partitioned: true } : {})
  } as any;

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
      return reject(new Error('Session not initialized'));
    }

    // Log initial session state
    console.log('📝 setSessionUser called:', {
      sessionId: req.sessionID,
      userId,
      organizationId,
      organizationSlug,
      existingUserId: req.session.userId,
      existingOrgId: req.session.organizationId
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
        
        // Verify session data after save
        console.log('✅ Session saved successfully:', {
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
  const isProduction = process.env.NODE_ENV === 'production';
  const isReplit = !!process.env.REPL_SLUG;
  const isDevelopment = process.env.NODE_ENV === 'development';
  const port = process.env.PORT || '5000';
  
  // Match the detection logic from getSessionConfig  
  const isLocalhost = 
    process.env.TESTING_LOCALHOST === 'true' || 
    isDevelopment || 
    port === '5000' || 
    (!isProduction);
  
  const useSecureCookies = !isLocalhost && (isReplit && isProduction);
  const sameSite = useSecureCookies ? 'none' : 'lax';
  
  console.log('🔐 Session configuration:', {
    environment: isProduction ? 'production' : 'development',
    replit: isReplit,
    localhost: isLocalhost,
    secureCookies: useSecureCookies,
    sameSite: sameSite,
    partitioned: useSecureCookies,
    sessionName: 'whirkplace.sid',
    trustProxy: true,
    maxAge: '30 days',
    port: process.env.PORT || '5000'
  });
}