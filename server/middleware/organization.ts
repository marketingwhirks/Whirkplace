import type { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/authService";
import { storage } from "../storage";

// Extend Express Request to include orgId
declare global {
  namespace Express {
    interface Request {
      orgId: string;
    }
  }
}

// Instantiate the auth service
const authService = new AuthService();

/**
 * Organization Resolution Middleware
 * 
 * Resolves organization from authenticated user's session.
 * Falls back to default organization for public routes.
 */
export function resolveOrganization() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // First priority: Get organization from authenticated user
      if (req.session?.userId && req.session?.organizationId) {
        // Validate that the user still belongs to this organization
        const user = await authService.getCurrentUser(req);
        if (user && user.organizationId === req.session.organizationId) {
          const organization = await storage.getOrganization(req.session.organizationId);
          if (organization && organization.isActive) {
            req.orgId = organization.id;
            (req as any).organization = organization;
            return next();
          }
        }
        
        // If validation failed, clear invalid session data
        delete req.session.organizationId;
        delete req.session.organizationSlug;
      }
      
      // Second priority: Domain-based resolution for subdomain routing
      const host = req.get('Host') || '';
      if (host) {
        const hostWithoutPort = host.split(':')[0];
        const hostParts = hostWithoutPort.split('.');
        
        // Check for subdomain (not www, not localhost)
        if (hostParts.length >= 2 && hostParts[0] !== 'www' && hostParts[0] !== 'localhost') {
          let subdomain: string | null = null;
          
          // Handle whirkplace.com domains
          if (host.includes('whirkplace.com') && hostParts.length > 2) {
            subdomain = hostParts[0]; // e.g., "company" from "company.whirkplace.com"
          }
          
          if (subdomain) {
            const organization = await storage.getOrganizationBySlug(subdomain);
            if (organization && organization.isActive) {
              req.orgId = organization.id;
              (req as any).organization = organization;
              return next();
            }
          }
        }
      }
      
      // Third priority: Default to enterprise organization for public/root access
      let defaultOrg = await storage.getOrganizationBySlug('whirkplace');
      if (!defaultOrg) {
        // Create default organization if it doesn't exist
        defaultOrg = await storage.createOrganization({
          id: "enterprise-whirkplace",
          name: "Whirkplace Enterprise",
          slug: "whirkplace",
          plan: "enterprise",
          customValues: ["Own It", "Challenge It", "Team First", "Empathy for Others", "Passion for Our Purpose"],
          enableSlackIntegration: true,
          enableMicrosoftAuth: true,
        });
      }
      
      if (defaultOrg) {
        req.orgId = defaultOrg.id;
        (req as any).organization = defaultOrg;
        return next();
      }
      
      // No organization could be resolved
      return res.status(404).json({ message: "Organization not found" });
    } catch (error) {
      console.error("Error resolving organization:", error);
      res.status(500).json({ message: "Failed to resolve organization context" });
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