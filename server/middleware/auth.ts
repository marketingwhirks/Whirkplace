import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { User } from "@shared/schema";
import { sanitizeUser } from "../utils/sanitizeUser";
import { getSessionUser } from "./session";
import { AuthService } from "../services/authService";

// Instantiate the auth service
const authService = new AuthService();

/**
 * Express middleware to authenticate users via session
 * Sets req.currentUser if authentication succeeds
 */
export function authenticateUser() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check for demo token authentication (Bearer token)
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const { verifyDemoToken, getDemoUserById } = await import('../demo-auth');
        const decoded = verifyDemoToken(token);
        if (decoded && decoded.isDemo) {
          const demoUser = getDemoUserById(decoded.userId);
          if (demoUser) {
            req.currentUser = {
              id: demoUser.id,
              name: demoUser.name,
              email: demoUser.email,
              role: demoUser.role,
              teamId: demoUser.teamId,
              isActive: true,
              isSuperAdmin: false,
              organizationId: demoUser.organizationId
            };
            req.orgId = demoUser.organizationId;
            return next();
          }
        }
      }
      
      // Check for demo token authentication via cookie
      const demoToken = req.cookies?.['demo_token'];
      if (demoToken) {
        const { verifyDemoToken, getDemoUserById } = await import('../demo-auth');
        const decoded = verifyDemoToken(demoToken);
        if (decoded && decoded.isDemo) {
          const demoUser = getDemoUserById(decoded.userId);
          if (demoUser) {
            req.currentUser = {
              id: demoUser.id,
              name: demoUser.name,
              email: demoUser.email,
              role: demoUser.role,
              teamId: demoUser.teamId,
              isActive: true,
              isSuperAdmin: false,
              organizationId: demoUser.organizationId
            };
            req.orgId = demoUser.organizationId;
            return next();
          }
        }
      }
      
      // Use AuthService to get current user from session
      const user = await authService.getCurrentUser(req);
      if (user && user.isActive) {
        const sessionData = getSessionUser(req);
        req.currentUser = sanitizeUser(user);
        req.currentUser.organizationId = sessionData?.organizationId || user.organizationId;
        req.orgId = req.currentUser.organizationId;
        return next();
      }
      
      // No valid authentication found
      return res.status(401).json({ 
        message: "Authentication required. Please sign in." 
      });
    } catch (error) {
      console.error("Authentication error:", error);
      res.status(401).json({ message: "Authentication failed" });
    }
  };
}

/**
 * Middleware to require authentication
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
 */
export function requireRole(roles: string[] | string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      return res.status(401).json({ 
        message: "Authentication required" 
      });
    }

    // Super admin users bypass all role restrictions
    if (req.currentUser.isSuperAdmin) {
      return next();
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
 * Middleware to require partner admin privileges
 */
export function requirePartnerAdmin() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      return res.status(401).json({ 
        message: "Authentication required" 
      });
    }

    // Super admin users bypass partner restrictions
    if (req.currentUser.isSuperAdmin) {
      return next();
    }

    // Check if user has partner_admin role
    if (req.currentUser.role !== 'partner_admin') {
      return res.status(403).json({ 
        message: "Partner admin access required" 
      });
    }

    // Get the user's organization to find their partner firm
    const organization = await storage.getOrganization(req.currentUser.organizationId);
    if (!organization) {
      return res.status(403).json({ 
        message: "Organization not found" 
      });
    }

    // Check if organization belongs to a partner firm
    if (!organization.partnerFirmId) {
      return res.status(403).json({ 
        message: "User organization is not associated with a partner firm" 
      });
    }

    // Get the partner firm details
    const partnerFirm = await storage.getPartnerFirm(organization.partnerFirmId);
    if (!partnerFirm || !partnerFirm.isActive) {
      return res.status(403).json({ 
        message: "Partner firm not found or inactive" 
      });
    }

    // Attach partner firm info to request for use in routes
    (req as any).partnerFirm = partnerFirm;
    (req as any).partnerFirmId = partnerFirm.id;
    
    next();
  };
}

/**
 * Middleware to ensure organization has completed onboarding
 */
export function requireOnboarded() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      return res.status(401).json({ 
        message: "Authentication required" 
      });
    }

    // Super admin users bypass onboarding requirement
    if (req.currentUser.isSuperAdmin) {
      return next();
    }

    // Get organization to check onboarding status
    const organization = await storage.getOrganization(req.currentUser.organizationId);
    if (!organization) {
      return res.status(404).json({ 
        message: "Organization not found" 
      });
    }

    // Check if onboarding is complete
    if (organization.onboardingStatus !== 'completed') {
      return res.status(403).json({ 
        message: "Please complete onboarding first",
        redirectTo: '/onboarding'
      });
    }
    
    next();
  };
}

/**
 * Middleware to require team lead authorization
 */
export function requireTeamLead() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      return res.status(401).json({ 
        message: "Authentication required" 
      });
    }

    const user = req.currentUser;
    
    // Super admins and admins can access everything
    if (user.isSuperAdmin || user.role === "admin") {
      return next();
    }
    
    // Managers with team IDs can access
    if (user.role === "manager" && user.teamId) {
      return next();
    }
    
    // Check if user is a team leader
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

/**
 * Middleware to require super admin privileges
 */
export function requireSuperAdmin() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      return res.status(401).json({ 
        message: "Authentication required" 
      });
    }

    if (!req.currentUser.isSuperAdmin) {
      return res.status(403).json({ 
        message: "Super admin privileges required" 
      });
    }
    
    next();
  };
}