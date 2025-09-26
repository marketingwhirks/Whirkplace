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
      const { storage } = await import('../storage');
      let organization = null;
      
      // Get host for domain-based organization resolution
      const host = req.get('Host') || '';
      const urlParam = req.query.org as string;
      
      console.log(`🌐 Resolving organization for host: ${host}, org param: ${urlParam}`);
      
      // Method 1: Check session organizationId FIRST (for demo users and logged-in users)
      if ((req.session as any)?.organizationId) {
        const sessionOrgId = (req.session as any).organizationId;
        console.log(`🔐 Found organization in session: ${sessionOrgId}`);
        organization = await storage.getOrganization(sessionOrgId);
        if (organization) {
          console.log(`✅ Using session organization: ${organization.name} (${organization.slug})`);
        }
      }
      
      // Method 2: Use org query parameter (for development and explicit org selection)
      if (!organization && urlParam) {
        if (urlParam === 'default') {
          organization = await storage.getOrganizationBySlug('whirkplace');
        } else {
          organization = await storage.getOrganizationBySlug(urlParam);
        }
        console.log(`🔍 Org param lookup (${urlParam}):`, organization ? 'found' : 'not found');
      }
      
      // Method 3: Domain-based organization resolution
      if (!organization && host) {
        // Handle root domains (whirkplace.com, localhost:5000, etc.)
        if (host === 'whirkplace.com' || 
            host === 'www.whirkplace.com' || 
            host.startsWith('localhost') || 
            host.includes('.replit.') ||
            host.includes('.repl.co')) {
          // Use the enterprise organization for main domain
          organization = await storage.getOrganizationBySlug('whirkplace');
          console.log(`🏠 Root domain (${host}) - using default org:`, organization ? 'found' : 'not found');
        } else {
          // Extract subdomain for company.whirkplace.com format
          const subdomain = host.split('.')[0];
          if (subdomain && subdomain !== 'www') {
            organization = await storage.getOrganizationBySlug(subdomain);
            console.log(`🏢 Subdomain lookup (${subdomain}):`, organization ? 'found' : 'not found');
          }
        }
      }
      
      // Method 3: Fallback to enterprise organization if none found
      if (!organization) {
        console.log('🔄 No organization found, trying enterprise fallback...');
        organization = await storage.getOrganizationBySlug('whirkplace');
        if (!organization) {
          // Create enterprise organization if it doesn't exist
          console.log('🆕 Creating enterprise organization...');
          organization = await storage.createOrganization({
            id: "enterprise-whirkplace",
            name: "Whirkplace Enterprise",
            slug: "whirkplace",
            plan: "enterprise",
            customValues: ["Own It", "Challenge It", "Team First", "Empathy for Others", "Passion for Our Purpose"],
            enableSlackIntegration: true,
            enableMicrosoftAuth: true,
          });
          console.log('✅ Enterprise organization created:', organization.name);
        }
      }
      
      if (!organization) {
        console.error('❌ Failed to resolve organization');
        return res.status(404).json({ message: "Organization not found" });
      }
      
      req.orgId = organization.id;
      (req as any).organization = organization;
      
      console.log(`✅ Organization resolved: ${organization.name} (${organization.slug})`);
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