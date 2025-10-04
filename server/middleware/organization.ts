import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { setSessionUser } from "./session";

// Extend Express Request to include orgId and organization
declare global {
  namespace Express {
    interface Request {
      orgId: string;
      organization?: any;
    }
  }
}

/**
 * Organization Resolution Middleware
 * 
 * Validates and sets the organization context for authenticated users.
 * Always validates that users belong to the organization they're accessing.
 */
export function resolveOrganization() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // For authenticated users, validate organization membership
      if (req.currentUser) {
        const userId = req.currentUser.id;
        const userEmail = req.currentUser.email;
        
        // If session has an organizationId, validate user belongs to it
        if (req.session?.organizationId) {
          const sessionOrgId = req.session.organizationId;
          
          // Get all organizations the user belongs to
          const userOrganizations = await storage.getUserOrganizations(userEmail);
          const validOrg = userOrganizations.find(
            ({ organization }) => organization.id === sessionOrgId && organization.isActive
          );
          
          if (validOrg) {
            // User belongs to the organization in session
            req.orgId = validOrg.organization.id;
            req.organization = validOrg.organization;
            req.currentUser.organizationId = validOrg.organization.id;
            return next();
          }
          
          // User doesn't belong to the organization in session - clear it
          delete req.session.organizationId;
          delete req.session.organizationSlug;
          await new Promise<void>((resolve) => {
            req.session!.save(() => resolve());
          });
        }
        
        // No valid organization in session - use user's default organization
        const userOrganizations = await storage.getUserOrganizations(userEmail);
        
        if (userOrganizations.length > 0) {
          // Use the first active organization
          const defaultOrg = userOrganizations.find(
            ({ organization }) => organization.isActive
          );
          
          if (defaultOrg) {
            // Set the organization in session for future requests
            await setSessionUser(
              req,
              defaultOrg.user.id,
              defaultOrg.organization.id,
              defaultOrg.organization.slug
            );
            
            req.orgId = defaultOrg.organization.id;
            req.organization = defaultOrg.organization;
            req.currentUser.organizationId = defaultOrg.organization.id;
            return next();
          }
        }
        
        // User has no active organizations
        return res.status(403).json({ 
          message: "You don't belong to any active organizations" 
        });
      }
      
      // For unauthenticated requests (public routes), use default organization
      const defaultOrg = await storage.getOrganizationBySlug('whirkplace');
      
      if (defaultOrg && defaultOrg.isActive) {
        req.orgId = defaultOrg.id;
        req.organization = defaultOrg;
        return next();
      }
      
      // No default organization exists - create it
      const newDefaultOrg = await storage.createOrganization({
        id: "enterprise-whirkplace",
        name: "Whirkplace Enterprise",
        slug: "whirkplace",
        plan: "enterprise",
        customValues: ["Own It", "Challenge It", "Team First", "Empathy for Others", "Passion for Our Purpose"],
        enableSlackIntegration: true,
        enableMicrosoftAuth: true,
      });
      
      req.orgId = newDefaultOrg.id;
      req.organization = newDefaultOrg;
      next();
      
    } catch (error) {
      return res.status(500).json({ 
        message: "Failed to resolve organization context" 
      });
    }
  };
}

/**
 * Middleware to validate that an organizationId is present
 */
export function requireOrganization() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.orgId) {
      return res.status(400).json({ 
        message: "Organization context required but not found" 
      });
    }
    next();
  };
}

/**
 * Utility function to ensure organizationId is never taken from user input
 */
export function sanitizeForOrganization<T extends Record<string, any>>(
  data: T, 
  trustedOrgId: string
): T & { organizationId: string } {
  // Remove any organizationId from user input and set our trusted value
  const { organizationId: _, ...sanitized } = data;
  return {
    ...sanitized,
    organizationId: trustedOrgId
  } as T & { organizationId: string };
}