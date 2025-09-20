import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import rateLimit from 'express-rate-limit';
import connectPgSimple from 'connect-pg-simple';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { resolveOrganization } from "./middleware/organization";
import { runDevelopmentSeeding } from "./seeding";

const app = express();

// Enable trust proxy for proper header handling in production
app.set('trust proxy', true);

// Security headers middleware
app.use((req, res, next) => {
  // HSTS - Force HTTPS for 1 year (production only)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  // Content Security Policy - allow embedding for Teams/Slack tabs but restrict sources
  const cspFrameAncestors = process.env.NODE_ENV === 'production' 
    ? "'self' https://teams.microsoft.com https://slack.com" 
    : "'self' https://teams.microsoft.com https://slack.com http://localhost:*";
  
  res.setHeader('Content-Security-Policy', `frame-ancestors ${cspFrameAncestors};`);
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
});

// Rate limiting for authentication endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    message: "Too many authentication attempts, please try again later.",
    code: "RATE_LIMIT_EXCEEDED"
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in development
    return process.env.NODE_ENV === 'development';
  }
});

// Apply rate limiting to auth routes
app.use('/auth/', authRateLimit);
app.use('/api/auth/', authRateLimit);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Session middleware configuration - Use PostgreSQL store for production scalability
const PgSession = connectPgSimple(session);
const sessionStore = new PgSession({
  conString: process.env.DATABASE_URL,
  tableName: 'user_sessions', // Use custom table name to avoid conflicts
  createTableIfMissing: true,
  pruneSessionInterval: 60 * 15, // Prune expired sessions every 15 minutes
  errorLog: (error) => {
    console.error('Session store error:', error);
  }
});

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'whirkplace-default-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'connect.sid',
  proxy: true, // Trust proxy for Replit's TLS terminator
  cookie: {
    secure: process.env.NODE_ENV === 'production' || !!process.env.REPL_SLUG, // Use secure for production or Replit environment
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: (process.env.NODE_ENV === 'production' || !!process.env.REPL_SLUG) ? 'none' : 'lax', // Allow iframe for Replit/production
    domain: undefined // Let browser set domain automatically
  }
}));

// Organization resolution middleware - must be before API routes
app.use(resolveOrganization());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Run development seeding before setting up routes
  await runDevelopmentSeeding();
  
  const server = await registerRoutes(app);
  
  // Initialize Slack weekly reminder scheduler (runs every Monday at 9:05 AM)
  try {
    const { initializeWeeklyReminderScheduler } = await import("./services/slack");
    const { storage } = await import("./storage");
    initializeWeeklyReminderScheduler(storage);
    console.log('✅ Weekly reminder scheduler initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize weekly reminder scheduler:', error);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
