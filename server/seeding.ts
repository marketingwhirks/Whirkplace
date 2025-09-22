import { storage } from "./storage";
import type { User, Organization } from "@shared/schema";

/**
 * Test User Seeding for Development Environment
 * 
 * SECURITY: This module is only available in development environments
 * Creates consistent test users for development and testing purposes
 */

/**
 * Ensure the default organization exists for development
 * This creates a default organization with ID "default-org" that's used as the
 * hardcoded organization ID in the organization middleware
 */
export async function ensureDefaultOrganization(): Promise<Organization> {
  // SECURITY: Only allow in development environment
  if (process.env.NODE_ENV === 'production') {
    throw new Error("Test organization creation not allowed in production");
  }

  try {
    // Check if default organization already exists
    let defaultOrg = await storage.getOrganization("default-org");
    
    if (defaultOrg) {
      console.log("Default organization already exists:", defaultOrg.id);
      return defaultOrg;
    }

    // Also check by slug in case it exists with a different ID
    defaultOrg = await storage.getOrganizationBySlug("default");
    if (defaultOrg) {
      console.log("Default organization found by slug:", defaultOrg.id);
      return defaultOrg;
    }

    // Create default organization with specific ID
    defaultOrg = await storage.createOrganization({
      id: "default-org",
      name: "Default Organization",
      slug: "default",
      plan: "starter",
      isActive: true
    });

    console.log("Created default organization:", defaultOrg.id);
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


