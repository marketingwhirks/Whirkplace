import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import MicrosoftTeamsService from "../services/microsoft-teams";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireOrganization } from "../middleware/organization";
import { requireFeatureAccess } from "../middleware/plan-access";

export function registerMicrosoftTeamsRoutes(app: Express): void {
  
  // Get Teams integration status
  app.get("/api/teams-integration/status", requireOrganization(), requireFeatureAccess('teams_integration'), async (req, res) => {
    try {
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json({
        enabled: organization.enableTeamsIntegration,
        configured: MicrosoftTeamsService.isConfigured(organization.microsoftTeamsWebhookUrl),
        webhookUrl: organization.microsoftTeamsWebhookUrl ? '***configured***' : null
      });
    } catch (error) {
      console.error("Teams integration status error:", error);
      res.status(500).json({ message: "Failed to get Teams integration status" });
    }
  });
  
  // Configure Teams integration (admin only)
  app.put("/api/teams-integration/settings", requireAuth(), requireRole('admin'), requireOrganization(), requireFeatureAccess('teams_integration'), async (req, res) => {
    try {
      const settingsSchema = z.object({
        enableTeamsIntegration: z.boolean().optional(),
        microsoftTeamsWebhookUrl: z.string().url().optional().or(z.literal(''))
      });
      
      const validatedData = settingsSchema.parse(req.body);
      
      const updateData: any = {};
      if (typeof validatedData.enableTeamsIntegration === 'boolean') {
        updateData.enableTeamsIntegration = validatedData.enableTeamsIntegration;
      }
      if (validatedData.microsoftTeamsWebhookUrl !== undefined) {
        updateData.microsoftTeamsWebhookUrl = validatedData.microsoftTeamsWebhookUrl || null;
      }
      
      const organization = await storage.updateOrganization(req.orgId, updateData);
      
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json({
        enableTeamsIntegration: organization.enableTeamsIntegration,
        webhookConfigured: !!organization.microsoftTeamsWebhookUrl
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid settings data", errors: error.errors });
      }
      console.error("Teams integration settings error:", error);
      res.status(500).json({ message: "Failed to update Teams integration settings" });
    }
  });
  
  // Test Teams webhook
  app.post("/api/teams-integration/test", requireAuth(), requireRole('admin'), requireOrganization(), requireFeatureAccess('teams_integration'), async (req, res) => {
    try {
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      if (!organization.enableTeamsIntegration || !organization.microsoftTeamsWebhookUrl) {
        return res.status(400).json({ message: "Teams integration not configured" });
      }
      
      const teamsService = new MicrosoftTeamsService();
      const success = await teamsService.validateWebhookUrl(organization.microsoftTeamsWebhookUrl);
      
      if (success) {
        res.json({ success: true, message: "Test message sent successfully to Teams" });
      } else {
        res.status(400).json({ success: false, message: "Failed to send test message to Teams" });
      }
    } catch (error) {
      console.error("Teams webhook test error:", error);
      res.status(500).json({ message: "Failed to test Teams webhook" });
    }
  });
  
  // Send custom message to Teams (admin only)
  app.post("/api/teams-integration/message", requireAuth(), requireRole('admin'), requireOrganization(), requireFeatureAccess('teams_integration'), async (req, res) => {
    try {
      const messageSchema = z.object({
        title: z.string().optional(),
        text: z.string().min(1),
        themeColor: z.string().optional()
      });
      
      const validatedData = messageSchema.parse(req.body);
      
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      if (!organization.enableTeamsIntegration || !organization.microsoftTeamsWebhookUrl) {
        return res.status(400).json({ message: "Teams integration not configured" });
      }
      
      const teamsService = new MicrosoftTeamsService();
      const success = await teamsService.sendMessageToWebhook(
        organization.microsoftTeamsWebhookUrl,
        validatedData
      );
      
      if (success) {
        res.json({ success: true, message: "Message sent successfully to Teams" });
      } else {
        res.status(400).json({ success: false, message: "Failed to send message to Teams" });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid message data", errors: error.errors });
      }
      console.error("Teams message send error:", error);
      res.status(500).json({ message: "Failed to send message to Teams" });
    }
  });
  
  // Get available Teams channels (requires user authentication with Microsoft)
  app.get("/api/teams-integration/channels", requireAuth(), requireOrganization(), requireFeatureAccess('teams_integration'), async (req, res) => {
    try {
      // Check if user has Microsoft tokens in session
      const microsoftTokens = req.session.microsoftTokens;
      if (!microsoftTokens) {
        return res.status(401).json({ 
          message: "Microsoft authentication required",
          redirectUrl: `/auth/microsoft`
        });
      }
      
      const teamsService = new MicrosoftTeamsService(microsoftTokens.accessToken);
      const channels = await teamsService.getUserTeamsChannels();
      
      res.json(channels);
    } catch (error) {
      console.error("Teams channels fetch error:", error);
      if (error.message.includes('authentication')) {
        return res.status(401).json({ 
          message: "Microsoft authentication expired",
          redirectUrl: `/auth/microsoft`
        });
      }
      res.status(500).json({ message: "Failed to fetch Teams channels" });
    }
  });
}