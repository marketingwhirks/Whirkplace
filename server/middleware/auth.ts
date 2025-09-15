import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { User } from "@shared/schema";

// Extend Express Request to include current user
declare global {
  namespace Express {
    interface Request {
      currentUser?: User;
    }
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
      // SECURITY: Only allow demo authentication in development mode
      if (process.env.NODE_ENV === 'development') {
        // DEVELOPMENT ONLY: Use hardcoded user for local testing
        const hardcodedUserId = "current-user-id";
        
        // Try to find an existing user in the organization, or create a default one
        const user = await storage.getUser(req.orgId, hardcodedUserId);
        
        if (!user) {
          // Create a default user for testing - DEVELOPMENT ONLY
          const defaultUser = await storage.createUser(req.orgId, {
            username: "demo-user",
            password: "password", // This is only for development
            name: "Demo User",
            email: "demo@example.com",
            role: "member",
            organizationId: req.orgId,
          });
          req.currentUser = defaultUser;
        } else {
          req.currentUser = user;
        }
        
        next();
      } else {
        // PRODUCTION: Require proper authentication
        // In production, extract user from JWT token, session, or auth headers
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
          return res.status(401).json({ 
            message: "Authentication required. Please provide a valid authorization header." 
          });
        }
        
        // TODO: Implement proper JWT/session validation here
        // Example implementation:
        // const token = authHeader.replace('Bearer ', '');
        // const decoded = jwt.verify(token, JWT_SECRET);
        // const user = await storage.getUser(req.orgId, decoded.userId);
        // req.currentUser = user;
        
        // For now, return 401 in production until proper auth is implemented
        return res.status(401).json({ 
          message: "Authentication system not yet implemented for production. Please implement JWT or session-based authentication." 
        });
      }
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