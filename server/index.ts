// Enable development authentication features BEFORE importing any modules that use it
// This is required for backdoor authentication to work
if (process.env.NODE_ENV === 'development') {
  process.env.DEV_AUTH_ENABLED = 'true';
  console.log('🔓 Development authentication enabled (DEV_AUTH_ENABLED=true)');
}

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import rateLimit from 'express-rate-limit';
import connectPgSimple from 'connect-pg-simple';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { resolveOrganization } from "./middleware/organization";
import { runDevelopmentSeeding } from "./seeding";

// Add process error handlers to catch unhandled exceptions
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Promise Rejection at:', promise);
  console.error('Reason:', reason);
  process.exit(1);
});

// Add startup logging
console.log('🚀 Starting application...');
console.log('📊 Environment:', process.env.NODE_ENV || 'development');
console.log('🌍 Platform:', process.platform);
console.log('📡 Node version:', process.version);

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

// Session configuration with proper production support
const isReplit = !!process.env.REPL_SLUG;
const isProduction = process.env.NODE_ENV === 'production';
const isSecureEnvironment = isProduction || isReplit;

// For production OAuth, we'd normally need SameSite=None for cross-site redirects
// But for demo login and same-origin requests, 'lax' works better
const sameSiteValue = isProduction && !isReplit ? 'none' : 'lax';

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'whirkplace-default-secret-change-in-production',
  resave: false,
  saveUninitialized: true, // Allow creating sessions for OAuth state storage
  name: 'connect.sid',
  proxy: true, // Trust proxy for production TLS terminator
  cookie: {
    secure: isSecureEnvironment, // Required when sameSite is 'none'
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: sameSiteValue, // Must be 'none' for OAuth to work in production
    domain: undefined // Let browser set domain automatically
  }
}));

// Log session configuration on startup
console.log('🔐 Session configuration:', {
  environment: isProduction ? 'production' : (isReplit ? 'replit' : 'development'),
  secure: isSecureEnvironment,
  sameSite: sameSiteValue,
  trustProxy: true
});

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
  try {
    console.log('🔧 Starting application setup...');
    
    // SECURITY: Validate authentication configuration before startup
    console.log('🔒 Validating authentication configuration...');
    const { validateAuthConfiguration } = await import("./middleware/auth");
    validateAuthConfiguration();
    console.log('✅ Authentication configuration validated');
    
    // Run development seeding before setting up routes
    console.log('🌱 Running development seeding...');
    await runDevelopmentSeeding();
    console.log('✅ Development seeding completed');
    
    // Register routes
    console.log('🛣️  Registering routes...');
    const server = await registerRoutes(app);
    console.log('✅ Routes registered successfully');
    
    // Initialize Slack weekly reminder scheduler (runs every Monday at 9:05 AM)
    console.log('⏰ Initializing weekly reminder scheduler...');
    try {
      const { initializeWeeklyReminderScheduler } = await import("./services/slack");
      const { storage } = await import("./storage");
      initializeWeeklyReminderScheduler(storage);
      console.log('✅ Weekly reminder scheduler initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize weekly reminder scheduler:', error);
      // Don't throw here, as this is not critical for startup
    }

    // Global error handler
    console.log('🛡️  Setting up global error handler...');
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      
      console.error('🚨 Express error handler caught:', {
        status,
        message,
        stack: err.stack,
        url: _req.url,
        method: _req.method
      });

      res.status(status).json({ message });
      // Don't throw the error here as it would crash the server
    });
    console.log('✅ Global error handler configured');

    // CRITICAL: Add terminal catch-all for /auth and /api routes BEFORE Vite
    // This prevents these routes from falling through to Vite's catch-all
    app.all(['/auth/*', '/api/*'], (req, res) => {
      console.log(`🚫 Unmatched route: ${req.method} ${req.path}`);
      res.status(404).json({ 
        message: 'Route not found',
        path: req.path,
        method: req.method 
      });
    });
    console.log('✅ Terminal catch-alls configured for /auth/* and /api/*');

    // Setup Vite or static serving
    console.log('📦 Setting up frontend serving...');
    if (app.get("env") === "development") {
      console.log('🔧 Setting up Vite development server...');
      await setupVite(app, server);
      console.log('✅ Vite development server setup complete');
    } else {
      console.log('📁 Setting up static file serving...');
      serveStatic(app);
      console.log('✅ Static file serving setup complete');
    }

    // Start the server
    const port = parseInt(process.env.PORT || '5000', 10);
    console.log(`🌐 Starting server on port ${port}...`);
    
    server.listen({
      port,
      host: "0.0.0.0",
    }, () => {
      console.log('🎉 Server started successfully!');
      console.log(`🌍 Server is listening on http://0.0.0.0:${port}`);
      console.log('✅ Application startup completed successfully');
      log(`serving on port ${port}`);
    });
    
  } catch (error) {
    console.error('💥 FATAL: Application startup failed!');
    console.error('Error details:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
    
    // Log environment details for debugging
    console.error('Environment details:', {
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT,
      databaseUrl: process.env.DATABASE_URL ? '[PRESENT]' : '[MISSING]',
      sessionSecret: process.env.SESSION_SECRET ? '[PRESENT]' : '[MISSING]'
    });
    
    // Exit with error code
    process.exit(1);
  }
})().catch((error) => {
  console.error('💥 CRITICAL: Unhandled error in startup function!');
  console.error('Error:', error);
  console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace available');
  process.exit(1);
});
