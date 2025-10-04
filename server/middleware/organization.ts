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
      
      console.log(`🌐 [ORG RESOLUTION] Starting organization resolution for ${req.method} ${req.path}`);
      console.log(`🌐 [ORG RESOLUTION] Host: ${host}, org param: ${urlParam}`);
      
      // CRITICAL FIX: Only trust session organizationId if we have an authenticated user
      // This prevents stale organization data from being used before authentication
      const userId = (req.session as any)?.userId;
      const sessionOrgId = (req.session as any)?.organizationId;
      
      if (userId && sessionOrgId) {
        console.log(`🔐 [ORG RESOLUTION] Authenticated user ${userId} has session organization: ${sessionOrgId}`);
        
        // Verify the user actually belongs to this organization
        const user = await storage.getUser(sessionOrgId, userId);
        if (user) {
          organization = await storage.getOrganization(sessionOrgId);
          if (organization) {
            console.log(`✅ [ORG RESOLUTION] Using verified session organization: ${organization.name} (${organization.slug})`);
          } else {
            console.log(`⚠️ [ORG RESOLUTION] Session organization ${sessionOrgId} not found, will resolve fresh`);
            // Clear invalid organization from session
            delete (req.session as any).organizationId;
            delete (req.session as any).organizationSlug;
          }
        } else {
          console.log(`⚠️ [ORG RESOLUTION] User ${userId} not found in organization ${sessionOrgId}, will resolve fresh`);
          // Clear invalid organization from session
          delete (req.session as any).organizationId;
          delete (req.session as any).organizationSlug;
        }
      } else if (!userId) {
        console.log(`🔓 [ORG RESOLUTION] No authenticated user, skipping session organization check`);
      }
      
      // Method 2: Use org query parameter (ONLY in development for testing)
      // SECURITY: Disable query parameter in production to prevent org injection
      if (!organization && urlParam && process.env.NODE_ENV !== 'production') {
        if (urlParam === 'default') {
          organization = await storage.getOrganizationBySlug('whirkplace');
        } else {
          organization = await storage.getOrganizationBySlug(urlParam);
        }
        console.log(`🔍 [DEV ONLY] Org param lookup (${urlParam}):`, organization ? 'found' : 'not found');
      }
      
      // Method 3: Domain-based organization resolution
      if (!organization && host) {
        // Extract subdomain from the host
        const hostParts = host.split('.');
        const hostWithoutPort = host.split(':')[0];
        const hostPartsNoPort = hostWithoutPort.split('.');
        
        // Check if this is a subdomain (not www and has at least 2 parts)
        let subdomain = null;
        
        // For production: organization.whirkplace.com
        if (hostPartsNoPort.length >= 2 && hostPartsNoPort[0] !== 'www') {
          // For whirkplace.com domains
          if (host.includes('whirkplace.com')) {
            if (hostPartsNoPort.length > 2) {
              subdomain = hostPartsNoPort[0]; // e.g., "patrickaccounting" from "patrickaccounting.whirkplace.com"
            }
          }
          // For development: In Replit, we can simulate with org query param or use subdomain if configured
          else if (host.includes('.replit.') || host.includes('.repl.co')) {
            // In Replit dev environment, extract first part of domain if it's not a system subdomain
            const firstPart = hostPartsNoPort[0];
            // Only treat as subdomain if it's not a Replit system identifier (UUIDs, etc)
            if (firstPart && !firstPart.match(/^[a-f0-9]{8}-/) && firstPart !== 'www') {
              subdomain = firstPart;
            }
          }
          // For localhost development with port: subdomain.localhost:5000
          else if (hostWithoutPort === 'localhost' || hostWithoutPort.startsWith('subdomain.')) {
            if (hostPartsNoPort.length > 1 && hostPartsNoPort[0] !== 'localhost') {
              subdomain = hostPartsNoPort[0]; // e.g., "patrickaccounting" from "patrickaccounting.localhost"
            }
          }
        }
        
        // Try to find organization by subdomain
        if (subdomain) {
          organization = await storage.getOrganizationBySlug(subdomain);
          console.log(`🏢 Subdomain lookup (${subdomain}):`, organization ? 'found' : 'not found');
        }
        
        // If no subdomain or organization not found, check if this is the root domain
        if (!organization) {
          const isRootDomain = host === 'whirkplace.com' || 
                               host === 'www.whirkplace.com' ||
                               host.startsWith('localhost') ||
                               (host.includes('.replit.') && !subdomain) ||
                               (host.includes('.repl.co') && !subdomain);
          
          if (isRootDomain) {
            // Use the enterprise organization for main domain
            organization = await storage.getOrganizationBySlug('whirkplace');
            console.log(`🏠 Root domain (${host}) - using default org:`, organization ? 'found' : 'not found');
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