import type { Request, Response, NextFunction } from "express";

// Extend Express Request to include orgId
declare global {
  namespace Express {
    interface Request {
      orgId: string;
    }
  }
}

/**
 * Organization Resolution Middleware
 * 
 * This middleware derives the organizationId from a trusted source and attaches it to req.orgId.
 * Currently uses a hardcoded "default-org" until subdomain routing is implemented.
 * 
 * Security Note: The organizationId must NEVER come from client input (headers, body, params).
 * It should be derived from:
 * - Subdomain routing (future: company.whirkplace.com)
 * - JWT token claims (future: when auth is implemented)
 * - Session data (future: when session-based auth is implemented)
 */
export function resolveOrganization() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // TODO: In production, derive organizationId from:
      // 1. Subdomain extraction from req.get('Host')
      // 2. JWT token claims
      // 3. Session data
      // 4. Database lookup based on authenticated user
      
      // For now, use the actual default organization ID from the database
      // This establishes the security pattern while we implement proper routing
      const orgId = "6c070124-fae2-472a-a826-cd460dd6f6ea";
      req.orgId = orgId;
      
      // Fetch the full organization object for plan access checks
      const { storage } = await import('../storage');
      const organization = await storage.getOrganization(orgId);
      
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      (req as any).organization = organization;
      
      // Future implementation example:
      // const host = req.get('Host');
      // if (host) {
      //   const subdomain = host.split('.')[0];
      //   if (subdomain && subdomain !== 'www') {
      //     // Validate subdomain exists in organizations table
      //     const org = await storage.getOrganizationBySlug(subdomain);
      //     if (org && org.isActive) {
      //       req.orgId = org.id;
      //       (req as any).organization = org;
      //     } else {
      //       return res.status(404).json({ message: "Organization not found" });
      //     }
      //   }
      // }
      
      next();
    } catch (error) {
      console.error("Error resolving organization:", error);
      res.status(500).json({ message: "Failed to resolve organization context" });
    }
  };
}

/**
 * Middleware to validate that an organizationId is present
 * This should be used on all API routes that require organization context
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
 * This function should be used whenever setting organizationId on create/update operations
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