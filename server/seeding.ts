import { storage } from "./storage";
import type { User, Organization } from "@shared/schema";

/**
 * Test User Seeding for Development Environment
 * 
 * SECURITY: This module is only available in development environments
 * Creates consistent test users for development and testing purposes
 */

/**
 * Ensure the enterprise organization exists for development
 * This checks for the enterprise organization and returns it if it exists
 */
export async function ensureDefaultOrganization(): Promise<Organization> {
  // SECURITY: Only allow in development environment
  if (process.env.NODE_ENV === 'production') {
    throw new Error("Test organization creation not allowed in production");
  }

  try {
    // Check if enterprise organization already exists
    let defaultOrg = await storage.getOrganization("enterprise-whirkplace");
    
    if (defaultOrg) {
      console.log("Enterprise organization already exists:", defaultOrg.id);
      return defaultOrg;
    }

    // Also check by slug in case it exists with a different ID
    defaultOrg = await storage.getOrganizationBySlug("whirkplace");
    if (defaultOrg) {
      console.log("Enterprise organization found by slug:", defaultOrg.id);
      return defaultOrg;
    }

    // Create enterprise organization with specific ID
    defaultOrg = await storage.createOrganization({
      id: "enterprise-whirkplace",
      name: "Whirkplace Enterprise",
      slug: "whirkplace",
      plan: "enterprise",
      isActive: true
    });

    console.log("Created enterprise organization:", defaultOrg.id);
    return defaultOrg;
  } catch (error) {
    // If error is due to duplicate key, try to get the existing organization
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      console.log("Organization already exists, attempting to retrieve it...");
      try {
        const existingOrg = await storage.getOrganization("default-org") || 
                           await storage.getOrganizationBySlug("default");
        if (existingOrg) {
          console.log("Successfully retrieved existing organization:", existingOrg.id);
          return existingOrg;
        }
      } catch (retrieveError) {
        console.error("Failed to retrieve existing organization:", retrieveError);
      }
    }
    
    console.error("Failed to ensure default organization:", error);
    throw error;
  }
}



/**
 * Run all seeding operations for development environment
 * This is the main function that should be called at server startup
 */
export async function runDevelopmentSeeding(): Promise<void> {
  // SECURITY: Only allow in development environment
  if (process.env.NODE_ENV !== 'development') {
    console.log("Seeding skipped - not in development environment");
    return;
  }

  try {
    console.log("Starting development seeding...");
    
    // Ensure default organization exists
    const defaultOrg = await ensureDefaultOrganization();
    
    console.log(`Development seeding completed for organization ${defaultOrg.id}`);
  } catch (error) {
    console.error("Development seeding failed:", error);
    // Don't throw - let the server continue to start even if seeding fails
  }
}


