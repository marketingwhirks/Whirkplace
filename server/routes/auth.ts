import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { setSessionUser, getSessionUser } from "../middleware/session";
import { requireAuth } from "../middleware/auth";
import { sanitizeUser } from "../utils/sanitizeUser";

// Schema for switching organization request
const switchOrganizationSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
});

export function registerAuthRoutes(app: Express) {
  console.log("🔐 Registering auth routes");

  // Get all organizations the current user belongs to
  app.get("/api/auth/my-organizations", requireAuth, async (req, res) => {
    try {
      const sessionUser = getSessionUser(req);
      if (!sessionUser?.userId) {
        console.log("❌ No authenticated user in session for my-organizations");
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Get the current user to find their email
      const currentUser = await storage.getUserGlobal(sessionUser.userId);
      if (!currentUser) {
        console.log(`❌ User ${sessionUser.userId} not found in database`);
        return res.status(404).json({ message: "User not found" });
      }

      console.log(`📋 Fetching organizations for user ${currentUser.email}`);
      
      // Get all organizations this user (by email) belongs to
      const userOrganizations = await storage.getUserOrganizations(currentUser.email);
      
      console.log(`✅ Found ${userOrganizations.length} organizations for ${currentUser.email}`);
      
      // Format the response with current organization marked
      const organizationsWithCurrent = userOrganizations.map(({ user, organization }) => ({
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          plan: organization.plan,
          customValues: organization.customValues,
        },
        user: sanitizeUser(user),
        isCurrent: organization.id === sessionUser.organizationId,
      }));

      // Log the organizations found
      console.log(`🏢 Organizations for ${currentUser.email}:`, 
        organizationsWithCurrent.map(o => `${o.organization.name} (${o.organization.slug}) - ${o.isCurrent ? 'CURRENT' : ''}`).join(", ")
      );

      res.json({
        organizations: organizationsWithCurrent,
        currentOrganizationId: sessionUser.organizationId,
      });
    } catch (error) {
      console.error("Error fetching user organizations:", error);
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });

  // Switch to a different organization using centralized AuthService
  app.post("/api/auth/switch-organization", requireAuth, async (req, res) => {
    try {
      const sessionUser = getSessionUser(req);
      if (!sessionUser?.userId) {
        console.log("❌ No authenticated user in session for switch-organization");
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Import the centralized AuthService
      const { authService } = await import('../services/authService');

      // Validate request body
      const validationResult = switchOrganizationSchema.safeParse(req.body);
      if (!validationResult.success) {
        console.log("❌ Invalid request body:", validationResult.error);
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: validationResult.error.errors 
        });
      }

      const { organizationId } = validationResult.data;
      
      console.log(`🔄 User ${sessionUser.userId} attempting to switch to organization ${organizationId}`);
      console.log(`📍 Current organization: ${sessionUser.organizationId}`);

      // Check if already in the target organization
      if (sessionUser.organizationId === organizationId) {
        console.log(`ℹ️ User is already in organization ${organizationId}`);
        return res.json({ 
          message: "Already in this organization",
          organization: await storage.getOrganization(organizationId)
        });
      }

      // Use the centralized AuthService to switch organization
      const sessionData = await authService.switchOrganization(req, sessionUser.userId, organizationId);
      
      if (!sessionData) {
        console.log(`❌ Failed to switch organization`);
        return res.status(403).json({ 
          message: "You do not have access to this organization" 
        });
      }

      // Get the organization details for the response
      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(500).json({ message: "Failed to get organization details" });
      }

      // Get the user in the new organization context
      const user = await storage.getUser(organizationId, sessionData.userId);
      if (!user) {
        return res.status(500).json({ message: "Failed to get user details" });
      }

      // Return success with the new organization details
      res.json({
        message: "Successfully switched organization",
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          plan: organization.plan,
          customValues: organization.customValues,
        },
        user: authService.getSanitizedUser(user),
      });

      console.log(`🎉 Organization switch completed: ${sessionData.email} switched to ${organization.name}`);
      
      // Log for audit purposes
      console.log(`[AUDIT] Organization switch:`, {
        timestamp: new Date().toISOString(),
        userEmail: sessionData.email,
        fromOrganizationId: sessionUser.organizationId,
        toOrganizationId: organizationId,
        toOrganizationName: organization.name,
        userIdInNewOrg: sessionData.userId,
      });
      
    } catch (error) {
      console.error("Error switching organization:", error);
      res.status(500).json({ message: "Failed to switch organization" });
    }
  });

  // Get current session information (for debugging/verification)
  app.get("/api/auth/session-info", requireAuth, async (req, res) => {
    try {
      const sessionUser = getSessionUser(req);
      if (!sessionUser?.userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await storage.getUserGlobal(sessionUser.userId);
      const organization = sessionUser.organizationId 
        ? await storage.getOrganization(sessionUser.organizationId)
        : null;

      res.json({
        session: {
          userId: sessionUser.userId,
          organizationId: sessionUser.organizationId,
          organizationSlug: sessionUser.organizationSlug,
          hasOrganizationOverride: !!(req.session as any).organizationOverride,
          organizationOverride: (req.session as any).organizationOverride,
        },
        user: user ? sanitizeUser(user) : null,
        organization: organization || null,
      });
    } catch (error) {
      console.error("Error fetching session info:", error);
      res.status(500).json({ message: "Failed to fetch session info" });
    }
  });

  // Cleanup endpoint to detect and fix corrupted sessions
  app.post("/api/auth/cleanup-session", async (req, res) => {
    try {
      const sessionUser = getSessionUser(req);
      const corruptedIds = [
        'c7008be0-1307-48c9-825c-a01ef11cc682',
        'c70086e0-1307-48c9-825c-a01ef11cc682'
      ];

      // Check if session has a corrupted organization ID
      if (sessionUser?.organizationId && corruptedIds.includes(sessionUser.organizationId)) {
        console.log(`[CLEANUP] Detected corrupted organization ID in session: ${sessionUser.organizationId}`);
        console.log(`[CLEANUP] User ID: ${sessionUser.userId}`);
        console.log(`[CLEANUP] Clearing corrupted session...`);

        // Clear the session completely
        req.session.destroy((err) => {
          if (err) {
            console.error("[CLEANUP] Failed to destroy session:", err);
          }
        });

        return res.json({
          cleaned: true,
          message: "Corrupted session detected and cleared. Please log in again.",
          corruptedOrgId: sessionUser.organizationId
        });
      }

      // Check if the organization ID exists in the database
      if (sessionUser?.organizationId) {
        try {
          const org = await storage.getOrganization(sessionUser.organizationId);
          if (!org) {
            console.log(`[CLEANUP] Organization ID ${sessionUser.organizationId} not found in database`);
            console.log(`[CLEANUP] Clearing invalid session...`);

            // Clear the session
            req.session.destroy((err) => {
              if (err) {
                console.error("[CLEANUP] Failed to destroy session:", err);
              }
            });

            return res.json({
              cleaned: true,
              message: "Invalid organization in session. Session cleared.",
              invalidOrgId: sessionUser.organizationId
            });
          }
        } catch (error) {
          console.error(`[CLEANUP] Error checking organization:`, error);
        }
      }

      // Session is clean
      return res.json({
        cleaned: false,
        message: "Session is valid.",
        organizationId: sessionUser?.organizationId
      });
    } catch (error) {
      console.error("Error in cleanup-session:", error);
      res.status(500).json({ message: "Failed to cleanup session" });
    }
  });
}