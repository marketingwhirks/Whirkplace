import { storage } from "./storage";
import type { User, Organization } from "@shared/schema";
import * as bcrypt from "bcryptjs";

/**
 * Test User Seeding for Development Environment
 * 
 * SECURITY: This module is only available in development environments
 * Creates consistent test users for development and testing purposes
 */

/**
 * Ensure Patrick Accounting organization exists for development
 * This creates a test version of the Patrick Accounting organization with Slack configuration
 */
export async function ensurePatrickAccountingOrganization(): Promise<Organization> {
  // SECURITY: Only allow in development environment
  if (process.env.NODE_ENV === 'production') {
    throw new Error("Patrick Accounting test organization creation not allowed in production");
  }

  try {
    // Use the same ID as production for consistency
    const patrickAccountingId = "patrick-accounting-prod-id";
    const patrickAccountingSlug = "patrick-accounting";

    // Check if Patrick Accounting organization already exists
    let patrickAccountingOrg = await storage.getOrganization(patrickAccountingId);
    
    if (patrickAccountingOrg) {
      console.log("Patrick Accounting organization already exists:", patrickAccountingOrg.id);
      return patrickAccountingOrg;
    }

    // Also check by slug in case it exists with a different ID
    patrickAccountingOrg = await storage.getOrganizationBySlug(patrickAccountingSlug);
    if (patrickAccountingOrg) {
      console.log("Patrick Accounting organization found by slug:", patrickAccountingOrg.id);
      return patrickAccountingOrg;
    }

    // Create Patrick Accounting organization with Slack configuration
    console.log("Creating Patrick Accounting test organization...");
    
    // Get Slack bot token from environment (set a test token for dev if not available)
    const slackBotToken = process.env.SLACK_BOT_TOKEN || "xoxb-test-token-for-development";
    
    patrickAccountingOrg = await storage.createOrganization({
      id: patrickAccountingId,
      name: "Patrick Accounting",
      slug: patrickAccountingSlug,
      plan: "enterprise",
      isActive: true,
      // Slack Integration Configuration
      slackWorkspaceId: "T3SEH2T9C",
      slackChannelId: "C09JR9655B7",
      slackBotToken: slackBotToken,
      enableSlackIntegration: true,
      slackConnectionStatus: "connected",
      slackLastConnected: new Date()
    });

    console.log("✅ Created Patrick Accounting organization:", patrickAccountingOrg.id);

    // Create the admin user for Patrick Accounting
    const testPassword = "testpassword123";
    const hashedPassword = await bcrypt.hash(testPassword, 10);
    
    // Check if user already exists
    let adminUser = await storage.getUserByEmail(patrickAccountingId, "mpatrick@patrickaccounting.com");
    
    if (!adminUser) {
      adminUser = await storage.createUser(patrickAccountingId, {
        email: "mpatrick@patrickaccounting.com",
        username: "mpatrick_test",
        name: "Matthew Patrick (Test)",
        password: hashedPassword,
        role: "admin",
        organizationId: patrickAccountingId,
        authProvider: "local",
        isActive: true,
        isAccountOwner: true,
        // Slack user ID can be added if needed for testing
        slackUserId: "U12345TEST"
      });
      
      console.log("✅ Created Patrick Accounting admin user: mpatrick@patrickaccounting.com");
      console.log("   Password: testpassword123 (development only)");
    } else {
      console.log("Patrick Accounting admin user already exists");
    }

    return patrickAccountingOrg;
  } catch (error) {
    // If error is due to duplicate key, try to get the existing organization
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      console.log("Patrick Accounting organization already exists (duplicate key), attempting to retrieve it...");
      try {
        const existingOrg = await storage.getOrganization("patrick-accounting-prod-id") || 
                           await storage.getOrganizationBySlug("patrick-accounting");
        if (existingOrg) {
          console.log("Successfully retrieved existing Patrick Accounting organization:", existingOrg.id);
          return existingOrg;
        }
      } catch (retrieveError) {
        console.error("Failed to retrieve existing Patrick Accounting organization:", retrieveError);
      }
    }
    
    console.error("Failed to ensure Patrick Accounting organization:", error);
    throw error;
  }
}

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
    
    // Ensure Patrick Accounting organization exists for Slack testing
    const patrickAccountingOrg = await ensurePatrickAccountingOrganization();
    
    console.log(`Development seeding completed:`);
    console.log(`  - Default organization: ${defaultOrg.id}`);
    console.log(`  - Patrick Accounting: ${patrickAccountingOrg.id}`);
  } catch (error) {
    console.error("Development seeding failed:", error);
    // Don't throw - let the server continue to start even if seeding fails
  }
}


