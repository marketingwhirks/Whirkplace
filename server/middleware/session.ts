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
    microsoftAuthState?: string;
    microsoftRedirectUri?: string;
    authOrgId?: string;
  }
}

// Create PostgreSQL session store
const PgSession = connectPgSimple(session);

/**
 * Deterministically detect if we're in production environment
 * Simple rule: HTTPS = production, HTTP = development
 */
function isProduction(req: Request): boolean {
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  return protocol === 'https';
}

/**
 * Create session middleware with appropriate cookie configuration
 */
export function createDynamicSessionMiddleware() {
  // Validate SESSION_SECRET is set
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET environment variable is required for security. Please set a strong, random secret.');
  }
  // Session store configuration (shared for all environments)
  const sessionStore = new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'user_sessions',
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 15, // Prune every 15 minutes
    errorLog: console.error
  });

  // Create production session middleware (secure cookies)
  const prodSessionMiddleware = session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: true, // Important for OAuth flows
    name: 'connect.sid',
    proxy: true,
    cookie: {
      secure: true,
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: 'lax' as const, // Changed from 'none' to 'lax' for better OAuth compatibility
      path: '/',
      domain: undefined // Let the browser handle the domain
    }
  });

  // Create development session middleware (non-secure cookies)
  const devSessionMiddleware = session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: true, // Important for OAuth flows
    name: 'connect.sid',
    proxy: true,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: 'lax' as const,
      path: '/',
      domain: undefined // Let the browser handle the domain
    }
  });

  // Return middleware that chooses configuration based on protocol
  return (req: Request, res: Response, next: NextFunction) => {
    if (isProduction(req)) {
      prodSessionMiddleware(req, res, next);
    } else {
      devSessionMiddleware(req, res, next);
    }
  };
}

/**
 * Get session configuration (for backwards compatibility)
 */
export function getSessionConfig() {
  return createDynamicSessionMiddleware();
}

/**
 * Get the current session user
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
 * Set session user data atomically
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

    // Function to save session data
    const saveSession = () => {
      req.session.userId = userId;
      req.session.organizationId = organizationId;
      if (organizationSlug) {
        req.session.organizationSlug = organizationSlug;
      }

      req.session.save((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    };

    // In production with new user login, regenerate session for security
    const shouldRegenerate = isProduction(req) && !req.session.userId;
    
    if (shouldRegenerate) {
      req.session.regenerate((err) => {
        if (err) {
          // Fallback to saving without regeneration
          saveSession();
        } else {
          saveSession();
        }
      });
    } else {
      saveSession();
    }
  });
}

/**
 * Clear session user data atomically
 */
export async function clearSessionUser(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      return resolve();
    }

    // Destroy the entire session
    req.session.destroy((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}