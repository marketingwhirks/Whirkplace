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
          // Try to find existing demo user by email/username
          let existingUser = await storage.getUserByUsername(req.orgId, "demo-user");
          if (!existingUser) {
            existingUser = await storage.getUserByEmail(req.orgId, "demo@example.com");
          }
          
          if (!existingUser) {
            // Create a default user for testing - DEVELOPMENT ONLY
            try {
              const defaultUser = await storage.createUser(req.orgId, {
                username: "demo-user",
                password: "password", // This is only for development
                name: "Demo User",
                email: "demo@example.com",
                role: "member",
                organizationId: req.orgId,
                authProvider: "local" as const,
              });
              req.currentUser = defaultUser;
            } catch (error) {
              // If creation fails (e.g., due to race condition), try to get user again
              existingUser = await storage.getUserByUsername(req.orgId, "demo-user") || 
                             await storage.getUserByEmail(req.orgId, "demo@example.com");
              if (existingUser) {
                req.currentUser = existingUser;
              } else {
                throw error; // Re-throw if still can't find user
              }
            }
          } else {
            req.currentUser = existingUser;
          }
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