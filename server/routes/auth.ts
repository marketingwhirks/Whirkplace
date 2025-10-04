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

  // Get all organizations the current user belongs to
  app.get("/api/auth/my-organizations", requireAuth, async (req, res) => {
    try {
      const sessionUser = getSessionUser(req);
      if (!sessionUser?.userId) {
          return res.status(401).json({ message: "Not authenticated" });
      }

      // Get the current user to find their email
      const currentUser = await storage.getUserGlobal(sessionUser.userId);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get all organizations this user (by email) belongs to
      const userOrganizations = await storage.getUserOrganizations(currentUser.email);
      
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
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Import the centralized AuthService
      const { authService } = await import('../services/authService');

      // Validate request body
      const validationResult = switchOrganizationSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: validationResult.error.errors 
        });
      }

      const { organizationId } = validationResult.data;

      // Check if already in the target organization
      if (sessionUser.organizationId === organizationId) {
        return res.json({ 
          message: "Already in this organization",
          organization: await storage.getOrganization(organizationId)
        });
      }

      // Use the centralized AuthService to switch organization
      const sessionData = await authService.switchOrganization(req, sessionUser.userId, organizationId);
      
      if (!sessionData) {
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

}