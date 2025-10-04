import { Request } from 'express';
import bcrypt from 'bcryptjs';
import { storage } from '../storage';
import { User, Organization } from '@shared/schema';
import { setSessionUser, clearSessionUser, getSessionUser } from '../middleware/session';
import { sanitizeUser } from '../utils/sanitizeUser';

/**
 * Clean session data structure for consistent session management
 */
export interface SessionData {
  userId: string;
  organizationId: string;
  organizationSlug: string;
  email: string;
  role: string;
}

/**
 * Authentication result containing user and organization data
 */
export interface AuthResult {
  user: User;
  organization: Organization;
}

/**
 * Centralized Authentication Service
 * Single source of truth for all authentication operations
 */
export class AuthService {
  /**
   * Authenticates a user by email and password
   * Searches across all organizations to find the user
   * 
   * @param email - User's email address
   * @param password - User's password (plain text)
   * @returns Authenticated user and their organization, or null if authentication fails
   */
  async authenticateUser(email: string, password: string): Promise<AuthResult | null> {
    try {
      // Validate input
      if (!email || !password) {
        console.log('❌ AuthService: Missing email or password');
        return null;
      }

      console.log(`🔐 AuthService: Authentication attempt for ${email}`);

      // Search for user across all organizations
      let user: User | null = null;
      let organization: Organization | null = null;

      const allOrganizations = await storage.getAllOrganizations();
      
      for (const org of allOrganizations) {
        const foundUser = await storage.getUserByEmail(org.id, email);
        if (foundUser) {
          user = foundUser as User;
          organization = org;
          console.log(`✅ AuthService: User found in organization: ${org.name} (${org.id})`);
          break;
        }
      }

      // User not found
      if (!user || !organization) {
        console.log(`❌ AuthService: User not found: ${email}`);
        return null;
      }

      // Check if user has a password (local auth enabled)
      if (!user.password) {
        console.log(`❌ AuthService: Local authentication not enabled for ${email}`);
        return null;
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        console.log(`❌ AuthService: Invalid password for ${email}`);
        return null;
      }

      // Check if user is active
      if (!user.isActive) {
        console.log(`❌ AuthService: User account is disabled: ${email}`);
        return null;
      }

      console.log(`✅ AuthService: Authentication successful for ${email}`);
      return { user, organization };
    } catch (error) {
      console.error('❌ AuthService: Authentication error:', error);
      return null;
    }
  }

  /**
   * Creates a clean session with user data
   * 
   * @param req - Express request object
   * @param user - Authenticated user
   * @param organization - User's organization
   * @returns Session data that was created
   */
  async createSession(req: Request, user: User, organization?: Organization): Promise<SessionData> {
    try {
      // If organization not provided, fetch it
      let org = organization;
      if (!org) {
        org = await storage.getOrganization(user.organizationId);
        if (!org) {
          throw new Error(`Organization not found: ${user.organizationId}`);
        }
      }

      console.log(`📝 AuthService: Creating session for user ${user.email} in org ${org.name}`);

      // Set session data using the session helper
      await setSessionUser(
        req,
        user.id,
        org.id,
        org.slug
      );

      // Also store additional user info in session for quick access
      // Note: This is stored directly on session, not through setSessionUser
      if (req.session) {
        (req.session as any).userEmail = user.email;
        (req.session as any).userRole = user.role;
        (req.session as any).userName = user.name;
        
        // Save session to ensure additional data is persisted
        await new Promise<void>((resolve, reject) => {
          req.session!.save((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      const sessionData: SessionData = {
        userId: user.id,
        organizationId: org.id,
        organizationSlug: org.slug,
        email: user.email,
        role: user.role
      };

      console.log(`✅ AuthService: Session created successfully for ${user.email}`);
      return sessionData;
    } catch (error) {
      console.error('❌ AuthService: Failed to create session:', error);
      throw new Error('Failed to create session');
    }
  }

  /**
   * Completely destroys a session
   * 
   * @param req - Express request object
   */
  async destroySession(req: Request): Promise<void> {
    try {
      console.log('🗑️ AuthService: Destroying session');
      await clearSessionUser(req);
      console.log('✅ AuthService: Session destroyed successfully');
    } catch (error) {
      console.error('❌ AuthService: Failed to destroy session:', error);
      throw new Error('Failed to destroy session');
    }
  }

  /**
   * Gets the current user from session
   * 
   * @param req - Express request object
   * @returns Current user data or null if not authenticated
   */
  async getCurrentUser(req: Request): Promise<User | null> {
    try {
      const sessionUser = getSessionUser(req);
      
      if (!sessionUser?.userId || !sessionUser?.organizationId) {
        console.log('🔍 AuthService: No user in session');
        return null;
      }

      console.log(`🔍 AuthService: Getting user ${sessionUser.userId} from org ${sessionUser.organizationId}`);
      
      const user = await storage.getUser(sessionUser.organizationId, sessionUser.userId);
      
      if (!user) {
        console.log(`❌ AuthService: User ${sessionUser.userId} not found in database`);
        return null;
      }

      return user as User;
    } catch (error) {
      console.error('❌ AuthService: Failed to get current user:', error);
      return null;
    }
  }

  /**
   * Determines which organization a user should be in
   * Useful for users who belong to multiple organizations
   * 
   * @param user - User to resolve organization for
   * @returns The primary organization for the user
   */
  async resolveUserOrganization(user: User): Promise<Organization | null> {
    try {
      console.log(`🔍 AuthService: Resolving organization for user ${user.email}`);

      // First, try to get the user's current organization
      const currentOrg = await storage.getOrganization(user.organizationId);
      if (currentOrg && currentOrg.isActive) {
        console.log(`✅ AuthService: Using current organization ${currentOrg.name}`);
        return currentOrg;
      }

      // If current org is not active or not found, find the first active organization
      const userOrganizations = await storage.getUserOrganizations(user.email);
      
      for (const { organization } of userOrganizations) {
        if (organization.isActive) {
          console.log(`✅ AuthService: Found active organization ${organization.name}`);
          return organization;
        }
      }

      console.log(`❌ AuthService: No active organization found for user ${user.email}`);
      return null;
    } catch (error) {
      console.error('❌ AuthService: Failed to resolve user organization:', error);
      return null;
    }
  }

  /**
   * Switches user to a different organization
   * 
   * @param req - Express request object
   * @param userId - Current user's ID
   * @param targetOrgId - Target organization ID to switch to
   * @returns Updated session data or null if switch fails
   */
  async switchOrganization(req: Request, userId: string, targetOrgId: string): Promise<SessionData | null> {
    try {
      console.log(`🔄 AuthService: Switching user ${userId} to organization ${targetOrgId}`);

      // Get the current user to find their email
      const currentUser = await storage.getUserGlobal(userId);
      if (!currentUser) {
        console.log(`❌ AuthService: User ${userId} not found`);
        return null;
      }

      // Verify the user has access to the target organization
      const userOrganizations = await storage.getUserOrganizations(currentUser.email);
      const targetOrgAccess = userOrganizations.find(
        ({ organization }) => organization.id === targetOrgId
      );

      if (!targetOrgAccess) {
        console.log(`❌ AuthService: User ${currentUser.email} does not have access to organization ${targetOrgId}`);
        return null;
      }

      const { user: targetUser, organization: targetOrg } = targetOrgAccess;

      console.log(`✅ AuthService: User has valid access to ${targetOrg.name}`);

      // Clear any existing organization overrides
      if (req.session && (req.session as any).organizationOverride) {
        console.log(`🧹 AuthService: Clearing organization override`);
        delete (req.session as any).organizationOverride;
      }

      // Update the session with new organization context
      await setSessionUser(
        req,
        targetUser.id, // Use the user ID from the target organization
        targetOrg.id,
        targetOrg.slug
      );

      // Store additional user info
      if (req.session) {
        (req.session as any).userEmail = targetUser.email;
        (req.session as any).userRole = targetUser.role;
        (req.session as any).userName = targetUser.name;
        
        await new Promise<void>((resolve, reject) => {
          req.session!.save((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      const sessionData: SessionData = {
        userId: targetUser.id,
        organizationId: targetOrg.id,
        organizationSlug: targetOrg.slug,
        email: targetUser.email,
        role: targetUser.role
      };

      console.log(`✅ AuthService: Successfully switched to organization ${targetOrg.name}`);
      return sessionData;
    } catch (error) {
      console.error('❌ AuthService: Failed to switch organization:', error);
      return null;
    }
  }

  /**
   * Gets sanitized user data safe for client transmission
   * 
   * @param user - User object to sanitize
   * @returns Sanitized user data without sensitive fields
   */
  getSanitizedUser(user: User): any {
    return sanitizeUser(user);
  }

  /**
   * Validates if a session is still valid
   * 
   * @param req - Express request object
   * @returns True if session is valid, false otherwise
   */
  async isSessionValid(req: Request): Promise<boolean> {
    try {
      const sessionUser = getSessionUser(req);
      
      if (!sessionUser?.userId || !sessionUser?.organizationId) {
        return false;
      }

      // Verify user still exists and is active
      const user = await storage.getUser(sessionUser.organizationId, sessionUser.userId);
      
      if (!user || !user.isActive) {
        return false;
      }

      // Verify organization still exists and is active
      const org = await storage.getOrganization(sessionUser.organizationId);
      
      if (!org || !org.isActive) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ AuthService: Error validating session:', error);
      return false;
    }
  }

  /**
   * Refreshes session data with latest user information
   * Useful after user profile updates
   * 
   * @param req - Express request object
   * @returns Updated session data or null if refresh fails
   */
  async refreshSession(req: Request): Promise<SessionData | null> {
    try {
      const currentUser = await this.getCurrentUser(req);
      
      if (!currentUser) {
        console.log('❌ AuthService: Cannot refresh - no user in session');
        return null;
      }

      const organization = await storage.getOrganization(currentUser.organizationId);
      
      if (!organization) {
        console.log('❌ AuthService: Cannot refresh - organization not found');
        return null;
      }

      console.log(`🔄 AuthService: Refreshing session for ${currentUser.email}`);
      
      // Re-create the session with updated data
      return await this.createSession(req, currentUser, organization);
    } catch (error) {
      console.error('❌ AuthService: Failed to refresh session:', error);
      return null;
    }
  }
}

// Export a singleton instance
export const authService = new AuthService();