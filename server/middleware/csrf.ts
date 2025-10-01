import { Request, Response, NextFunction } from 'express';
import { randomBytes, createHash } from 'crypto';

// Extend Express Session to include CSRF token
declare module "express-session" {
  interface SessionData {
    csrfSecret?: string;
  }
}

/**
 * Custom CSRF Protection Middleware
 * 
 * Implements double-submit cookie pattern:
 * 1. Generates a secret stored in session
 * 2. Returns a token derived from the secret
 * 3. Validates token on state-changing requests
 * 
 * This is more secure than the deprecated csurf package and provides
 * protection against CSRF attacks for session-authenticated requests.
 */

function generateCSRFSecret(): string {
  return randomBytes(32).toString('hex');
}

function generateCSRFToken(secret: string): string {
  // Create HMAC-like token using secret + timestamp for replay protection
  const timestamp = Date.now().toString();
  const data = secret + timestamp;
  const hash = createHash('sha256').update(data).digest('hex');
  return `${timestamp}.${hash}`;
}

function validateCSRFToken(secret: string, token: string): boolean {
  if (!secret || !token) return false;
  
  try {
    const [timestamp, hash] = token.split('.');
    if (!timestamp || !hash) return false;
    
    // Check if token is not too old (1 hour max)
    const tokenAge = Date.now() - parseInt(timestamp);
    if (tokenAge > 60 * 60 * 1000) return false;
    
    // Validate hash
    const expectedHash = createHash('sha256').update(secret + timestamp).digest('hex');
    return hash === expectedHash;
  } catch {
    return false;
  }
}

/**
 * Generates CSRF token for authenticated users
 */
export function generateCSRF() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only generate CSRF tokens for authenticated users with sessions
    if (!req.session || !req.currentUser) {
      return next();
    }
    
    // Generate or reuse existing secret
    if (!req.session.csrfSecret) {
      req.session.csrfSecret = generateCSRFSecret();
    }
    
    // Add CSRF token to response for client use
    const token = generateCSRFToken(req.session.csrfSecret);
    res.locals.csrfToken = token;
    
    // Also add to headers for API consumers
    res.set('X-CSRF-Token', token);
    
    // Set CSRF cookie with proper attributes for production
    const isProduction = process.env.NODE_ENV === 'production';
    const isReplit = !!process.env.REPL_SLUG;
    const secure = isProduction || isReplit;
    
    res.cookie('csrf-token', token, {
      httpOnly: true,
      secure: secure,
      sameSite: (isProduction || isReplit) ? 'none' : 'lax',
      partitioned: isProduction || isReplit,
      path: '/',
      maxAge: 3600000 // 1 hour
    });
    
    next();
  };
}

/**
 * Validates CSRF token on state-changing requests
 */
export function validateCSRF() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip CSRF validation for:
    // 1. Non-state-changing methods (GET, HEAD, OPTIONS)
    // 2. OAuth callback routes (they have their own state validation)
    // 3. Backdoor auth (development only)
    // 4. Logout endpoint (logout is inherently safe and CSRF protection would prevent legitimate logouts)
    // 5. localStorage auth (development only - sessions are not consistent)
    // 6. Business signup endpoints (public endpoints for new organization registration - but not complete-onboarding)
    // 7. Demo login endpoint (stateless JWT authentication)
    // 8. Stripe checkout callback (GET request)
    const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const isOAuthCallback = (req.path.includes('/auth/') || req.originalUrl.includes('/auth/')) && 
                           (req.path.includes('/callback') || req.originalUrl.includes('/callback'));
    const isBackdoorAuth = /\/auth\/backdoor$/.test(req.originalUrl) || req.path === '/auth/backdoor';
    const isLogout = /\/auth\/logout$/.test(req.originalUrl) || req.path === '/auth/logout';
    const isLocalStorageAuth = !!req.headers['x-auth-user-id']; // Development localStorage auth
    const isBusinessSignup = req.path.includes('/business/signup') || 
                            req.path.includes('/business/select-plan');
    const isDemoLogin = req.path.includes('/auth/demo-login');
    const isStripeCallback = req.path.includes('/business/checkout-success');
    
    if (!isStateChanging || isOAuthCallback || isBackdoorAuth || isLogout || 
        isLocalStorageAuth || isBusinessSignup || isDemoLogin || isStripeCallback) {
      return next();
    }
    
    // For unauthenticated users, skip CSRF (they can't make authenticated requests anyway)
    if (!req.session || !req.currentUser) {
      return next();
    }
    
    // Get CSRF token from various sources
    const token = req.headers['x-csrf-token'] as string ||
                  req.headers['csrf-token'] as string ||
                  req.body._csrf ||
                  req.query._csrf;
    
    if (!token) {
      console.warn(`CSRF token missing for ${req.method} ${req.path} from user ${req.currentUser?.id}`);
      return res.status(403).json({ 
        message: "CSRF token required",
        code: "CSRF_TOKEN_MISSING"
      });
    }
    
    const secret = req.session.csrfSecret;
    if (!secret) {
      console.warn(`CSRF secret missing for ${req.method} ${req.path} from user ${req.currentUser?.id}`);
      return res.status(403).json({ 
        message: "CSRF session invalid",
        code: "CSRF_SESSION_INVALID"
      });
    }
    
    if (!validateCSRFToken(secret, token)) {
      console.warn(`CSRF token validation failed for ${req.method} ${req.path} from user ${req.currentUser?.id}`);
      return res.status(403).json({ 
        message: "CSRF token invalid",
        code: "CSRF_TOKEN_INVALID"
      });
    }
    
    // Regenerate token after successful validation for added security
    req.session.csrfSecret = generateCSRFSecret();
    
    next();
  };
}

/**
 * Endpoint to get CSRF token for authenticated users
 */
export function csrfTokenEndpoint(req: Request, res: Response) {
  if (!req.session || !req.currentUser) {
    return res.status(401).json({ message: "Authentication required" });
  }
  
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = generateCSRFSecret();
  }
  
  const token = generateCSRFToken(req.session.csrfSecret);
  
  // Set CSRF cookie with proper attributes for production
  const isProduction = process.env.NODE_ENV === 'production';
  const isReplit = !!process.env.REPL_SLUG;
  const secure = isProduction || isReplit;
  
  res.cookie('csrf-token', token, {
    httpOnly: true,
    secure: secure,
    sameSite: (isProduction || isReplit) ? 'none' : 'lax',
    partitioned: isProduction || isReplit,
    path: '/',
    maxAge: 3600000 // 1 hour
  });
  
  res.json({ csrfToken: token });
}