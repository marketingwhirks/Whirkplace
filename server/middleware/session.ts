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
  
  // Determine if we should use secure cookies
  // In production OR Replit (which runs in iframe), use secure cookies
  const useSecureCookies = isProduction || isReplit;
  
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
  // Replit runs in iframe (third-party context), needs sameSite=none
  const sameSite = (isProduction || isReplit) ? 'none' as const : 'lax' as const;
  
  const cookieConfig = {
    secure: useSecureCookies,
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: sameSite,
    domain: undefined, // Let browser set domain automatically
    path: '/',
    // Add partitioned flag for Replit to handle Chrome's CHIPS
    ...(isReplit ? { partitioned: true } : {})
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

    // Regenerate session ID to prevent session fixation
    req.session.regenerate((err) => {
      if (err) {
        console.error('❌ Failed to regenerate session:', err);
        return reject(err);
      }

      // Set user data on new session
      req.session.userId = userId;
      req.session.organizationId = organizationId;
      if (organizationSlug) {
        req.session.organizationSlug = organizationSlug;
      }

      // Save session
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('❌ Failed to save session:', saveErr);
          return reject(saveErr);
        }
        
        console.log(`✅ Session created for user ${userId} in org ${organizationId}`);
        resolve();
      });
    });
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
  const useSecureCookies = isProduction || isReplit;
  const sameSite = (isProduction || isReplit) ? 'none' : 'lax';
  
  console.log('🔐 Session configuration:', {
    environment: isProduction ? 'production' : 'development',
    replit: isReplit,
    secureCookies: useSecureCookies,
    sameSite: sameSite,
    partitioned: isReplit,
    sessionName: 'whirkplace.sid',
    trustProxy: true,
    maxAge: '30 days'
  });
}