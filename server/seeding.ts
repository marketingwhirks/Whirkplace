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
 * Test users data - consistent across environments
 */
const TEST_USERS = [
  {
    username: "sarah.johnson",
    name: "Sarah Johnson", 
    email: "sarah.johnson@example.com",
    role: "manager",
    password: "test-password-not-used"
  },
  {
    username: "mike.chen",
    name: "Mike Chen",
    email: "mike.chen@example.com", 
    role: "member",
    password: "test-password-not-used"
  }
] as const;

/**
 * Ensure test users exist for development
 * Creates Sarah Johnson (manager) and Mike Chen (member) for testing purposes
 * 
 * @param organizationId - The organization ID to create users in
 * @returns Promise<User[]> - Array of created/updated test users
 */
export async function ensureTestUsers(organizationId: string): Promise<User[]> {
  // SECURITY: Only allow in development environment
  if (process.env.NODE_ENV === 'production') {
    throw new Error("Test user creation not allowed in production");
  }

  const createdUsers: User[] = [];

  for (const testUserData of TEST_USERS) {
    try {
      // Check if user already exists by username or email
      let existingUser = await storage.getUserByUsername(organizationId, testUserData.username);
      if (!existingUser) {
        existingUser = await storage.getUserByEmail(organizationId, testUserData.email);
      }

      if (existingUser) {
        // Update existing user with latest test data
        const updatedUser = await storage.updateUser(organizationId, existingUser.id, {
          name: testUserData.name,
          email: testUserData.email,
          username: testUserData.username,
          role: testUserData.role,
          isActive: true,
          authProvider: 'local' as const,
        });
        
        if (updatedUser) {
          console.log(`Updated test user: ${updatedUser.username} (${updatedUser.role})`);
          createdUsers.push(updatedUser);
        }
      } else {
        // Create new test user
        const newUser = await storage.createUser(organizationId, {
          username: testUserData.username,
          password: testUserData.password, // Not used for authentication
          name: testUserData.name,
          email: testUserData.email,
          role: testUserData.role,
          organizationId: organizationId,
          authProvider: 'local' as const,
          isActive: true,
        });
        
        console.log(`Created test user: ${newUser.username} (${newUser.role})`);
        createdUsers.push(newUser);
      }
    } catch (error) {
      console.error(`Failed to ensure test user ${testUserData.username}:`, error);
      // Continue with other users even if one fails
    }
  }

  return createdUsers;
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
    
    // Ensure test users exist
    const testUsers = await ensureTestUsers(defaultOrg.id);
    
    console.log(`Development seeding completed. Created/updated ${testUsers.length} test users in organization ${defaultOrg.id}`);
  } catch (error) {
    console.error("Development seeding failed:", error);
    // Don't throw - let the server continue to start even if seeding fails
  }
}

/**
 * Get test user by username for backdoor authentication
 * Used by the backdoor authentication system to impersonate test users
 * 
 * @param organizationId - The organization ID
 * @param username - The test user username
 * @returns Promise<User | undefined> - The test user if found
 */
export async function getTestUser(organizationId: string, username: string): Promise<User | undefined> {
  // SECURITY: Only allow in development environment
  if (process.env.NODE_ENV !== 'development') {
    return undefined;
  }

  // Only allow access to our predefined test users
  const validTestUsernames = TEST_USERS.map(u => u.username);
  if (!validTestUsernames.includes(username as any)) {
    return undefined;
  }

  try {
    return await storage.getUserByUsername(organizationId, username);
  } catch (error) {
    console.error(`Failed to get test user ${username}:`, error);
    return undefined;
  }
}

/**
 * Get all available test users for development
 * Returns information about available test users for backdoor authentication
 */
export function getAvailableTestUsers(): typeof TEST_USERS {
  return TEST_USERS;
}