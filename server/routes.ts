import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { db } from "./db";
import { setSessionUser, clearSessionUser } from "./middleware/session";
import { 
  insertUserSchema, insertTeamSchema, insertCheckinSchema, 
  insertQuestionSchema, insertWinSchema, insertCommentSchema, insertShoutoutSchema, updateShoutoutSchema,
  insertVacationSchema, reviewCheckinSchema, ReviewStatus,
  insertOneOnOneSchema, insertKraTemplateSchema, insertUserKraSchema, insertActionItemSchema,
  insertKraRatingSchema, insertKraHistorySchema,
  insertOrganizationSchema, insertBusinessPlanSchema, insertOrganizationOnboardingSchema, insertUserInvitationSchema,
  insertDashboardConfigSchema, insertDashboardWidgetTemplateSchema, insertBugReportSchema,
  insertPartnerApplicationSchema, insertPartnerFirmSchema, insertNotificationSchema,
  type AnalyticsScope, type AnalyticsPeriod, type ShoutoutDirection, type ShoutoutVisibility, type LeaderboardMetric,
  type ReviewStatusType, type Checkin, type InsertNotification,
  organizations, billingEvents
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import Stripe from "stripe";
import { WebClient } from "@slack/web-api";
import { sendCheckinReminder, announceWin, sendPrivateWinNotification, sendTeamHealthUpdate, announceShoutout, notifyCheckinSubmitted, notifyCheckinReviewed, generateOAuthURL, validateOAuthState, exchangeOIDCCode, validateOIDCToken, getSlackUserInfo, sendPasswordSetupViaSlackDM, testSlackConnection } from "./services/slack";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import Papa from "papaparse";
import { aggregationService } from "./services/aggregation";
import { billingService } from "./services/billing";
import { requireOrganization, resolveOrganization, sanitizeForOrganization } from "./middleware/organization";
import { authenticateUser, requireAuth, requireRole, requireTeamLead, requireSuperAdmin, requirePartnerAdmin, requireOnboarded } from "./middleware/auth";
import { generateCSRF, validateCSRF, csrfTokenEndpoint } from "./middleware/csrf";
import { authorizeAnalyticsAccess } from "./middleware/authorization";
import { requireFeatureAccess, getFeatureAvailability, getUpgradeSuggestions } from "./middleware/plan-access";
import { registerMicrosoftTeamsRoutes } from "./routes/microsoft-teams";
import { registerMicrosoftAuthRoutes } from "./routes/microsoft-auth";
import { registerMicrosoftCalendarRoutes } from "./routes/microsoft-calendar";
// import { registerAuthDiagnosticRoutes } from "./routes/auth-diagnostic"; // Disabled - temporary debugging endpoint
import { registerAuthRoutes } from "./routes/auth";
import { resolveRedirectUri } from "./utils/redirect-uri";
import { sendWelcomeEmail, sendSlackPasswordSetupEmail } from "./services/emailService";
import { sanitizeUser, sanitizeUsers } from "./utils/sanitizeUser";
import { getWeekStartCentral } from "@shared/utils/dueDates";
import { WeeklySummaryService } from "./services/weeklySummaryService";

// Initialize Stripe with appropriate keys based on environment
let stripe: Stripe | null = null;
const isDevelopment = process.env.NODE_ENV !== 'production';
const stripeSecretKey = isDevelopment 
  ? process.env.STRIPE_TEST_SECRET_KEY 
  : process.env.STRIPE_SECRET_KEY;

if (stripeSecretKey) {
  stripe = new Stripe(stripeSecretKey);
  console.log(`💳 Stripe initialized in ${isDevelopment ? 'TEST' : 'LIVE'} mode`);
} else {
  console.warn('⚠️ Stripe keys not configured');
}

// Helper function to generate recurring meetings
function generateRecurringMeetings(baseData: any, seriesId: string): any[] {
  const meetings: any[] = [];
  const startDate = new Date(baseData.scheduledAt);
  const maxOccurrences = baseData.recurrenceEndCount || 52; // Default to 52 occurrences if no end count specified
  const endDate = baseData.recurrenceEndDate ? new Date(baseData.recurrenceEndDate) : null;
  
  // Calculate interval in days based on recurrence pattern
  let intervalDays = 7; // Default to weekly
  switch (baseData.recurrencePattern) {
    case 'weekly':
      intervalDays = 7 * (baseData.recurrenceInterval || 1);
      break;
    case 'biweekly':
      intervalDays = 14 * (baseData.recurrenceInterval || 1);
      break;
    case 'monthly':
      intervalDays = 30 * (baseData.recurrenceInterval || 1); // Approximate month
      break;
    case 'quarterly':
      intervalDays = 90 * (baseData.recurrenceInterval || 1); // Approximate quarter
      break;
  }
  
  // Generate meetings
  let currentDate = new Date(startDate);
  let occurrenceCount = 0;
  
  while (occurrenceCount < maxOccurrences) {
    // Check if we've passed the end date
    if (endDate && currentDate > endDate) {
      break;
    }
    
    // Create meeting object for this occurrence
    const meetingData = {
      participantOneId: baseData.participantOneId,
      participantTwoId: baseData.participantTwoId,
      scheduledAt: new Date(currentDate),
      duration: baseData.duration,
      agenda: baseData.agenda,
      notes: baseData.notes,
      location: baseData.location,
      isOnlineMeeting: baseData.isOnlineMeeting,
      status: baseData.status || "scheduled",
      isRecurring: true,
      recurrenceSeriesId: seriesId,
      recurrencePattern: baseData.recurrencePattern,
      recurrenceInterval: baseData.recurrenceInterval,
      isRecurrenceTemplate: occurrenceCount === 0 // First one is the template
    };
    
    meetings.push(meetingData);
    
    // Calculate next occurrence
    if (baseData.recurrencePattern === 'monthly') {
      // For monthly, add months properly
      currentDate = new Date(currentDate);
      currentDate.setMonth(currentDate.getMonth() + (baseData.recurrenceInterval || 1));
    } else {
      // For other patterns, add days
      currentDate = new Date(currentDate.getTime() + intervalDays * 24 * 60 * 60 * 1000);
    }
    
    occurrenceCount++;
  }
  
  return meetings;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Azure domain verification file - must be served at root
  app.get("/MS89526594.txt", (req, res) => {
    const verificationContent = {
      "Description": "Domain ownership verification file for Microsoft 365 - place in the website root",
      "Domain": "whirkplace.com",
      "Id": "e7629383-63e1-4e40-a7b9-c8bf26467a9f"
    };
    res.type('text/plain').send(JSON.stringify(verificationContent, null, 2));
  });

  // Version endpoint to verify deployments
  app.get('/api/version', (req, res) => {
    res.json({
      version: '1.0.1',
      buildTime: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      message: 'Build from October 21, 2025 - Fixed CSRF for emoji reactions, vacations, team goals'
    });
  });

  // Logout endpoint using centralized AuthService
  app.post("/api/auth/logout", async (req, res) => {
    try {
      // Import the centralized AuthService
      const { authService } = await import('./services/authService');
      
      // Use AuthService to destroy session
      await authService.destroySession(req, res);
      
      // Return success
      res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
      console.error("Logout error:", error);
      // Even if there's an error, we should still return success for logout
      res.status(200).json({ message: "Logged out" });
    }
  });

  // Get current organization context (public endpoint for subdomain display)
  app.get("/api/organization/context", requireOrganization(), async (req, res) => {
    try {
      const organization = (req as any).organization;
      
      if (!organization) {
        return res.status(404).json({ 
          message: "No organization context found" 
        });
      }
      
      // Return basic organization info for display purposes
      res.json({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logoUrl: organization.logoUrl || null
      });
    } catch (error) {
      console.error("Error getting organization context:", error);
      res.status(500).json({ message: "Failed to get organization context" });
    }
  });

  // DEPRECATED: Database sync now happens automatically on application startup
  // The sync logic has been moved to server/services/databaseSync.ts and runs
  // automatically when the application starts, ensuring the schema is always in sync.
  // This endpoint is kept commented out for historical reference only.
  
  /*
  // COMPREHENSIVE DATABASE SYNC ENDPOINT - Ensures production matches development schema
  app.get("/api/emergency-fix-production", async (req, res) => {
    try {
      console.log("🚨 COMPREHENSIVE DATABASE SYNC: Starting at", new Date().toISOString());
      
      // Log request source for security
      const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      console.log("Request from IP:", clientIp);
      
      // Import db directly to ensure fresh connection
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      
      // Track results
      const results: { [table: string]: any[] } = {};
      const errors: { [table: string]: any[] } = {};
      const summary = {
        tablesChecked: 0,
        tablesCreated: 0,
        columnsAdded: 0,
        columnsExisting: 0,
        columnsErrored: 0,
        indexesCreated: 0
      };
      
      // Test database connectivity first
      try {
        const testResult = await db.execute(sql`SELECT 1 as test`);
        console.log("✅ Database connection OK");
      } catch (dbError: any) {
        console.error("Database connection failed:", dbError);
        return res.status(500).json({ 
          error: "Database connection failed", 
          message: dbError.message 
        });
      }

      // Helper function to check if table exists
      const tableExists = async (tableName: string): Promise<boolean> => {
        const result = await db.execute(sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = ${tableName}
          )
        `);
        return result.rows[0]?.exists === true;
      };

      // Helper function to check if column exists
      const columnExists = async (tableName: string, columnName: string): Promise<boolean> => {
        const result = await db.execute(sql`
          SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = ${tableName} AND column_name = ${columnName}
          )
        `);
        return result.rows[0]?.exists === true;
      };

      // Helper function to add column
      const addColumn = async (tableName: string, columnName: string, columnDef: string): Promise<string> => {
        try {
          const exists = await columnExists(tableName, columnName);
          if (!exists) {
            await db.execute(sql.raw(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${columnName} ${columnDef}`));
            summary.columnsAdded++;
            return "ADDED";
          } else {
            summary.columnsExisting++;
            return "EXISTS";
          }
        } catch (error: any) {
          if (error.message.includes('already exists')) {
            summary.columnsExisting++;
            return "EXISTS";
          }
          summary.columnsErrored++;
          throw error;
        }
      };

      // Define all tables and their columns
      const tableDefinitions = {
        // Core organizational tables
        partner_firms: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'name', def: 'TEXT NOT NULL' },
            { name: 'slug', def: 'TEXT NOT NULL UNIQUE' },
            { name: 'branding_config', def: 'JSONB' },
            { name: 'plan', def: "TEXT NOT NULL DEFAULT 'partner'" },
            { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
            { name: 'home_organization_id', def: 'VARCHAR' },
            { name: 'wholesale_rate', def: 'INTEGER NOT NULL DEFAULT 70' },
            { name: 'stripe_account_id', def: 'TEXT' },
            { name: 'billing_email', def: 'TEXT' },
            { name: 'enable_cobranding', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
            { name: 'max_client_organizations', def: 'INTEGER NOT NULL DEFAULT -1' },
            { name: 'custom_domain', def: 'TEXT' }
          ]
        },
        organizations: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'name', def: 'TEXT NOT NULL' },
            { name: 'slug', def: 'TEXT NOT NULL UNIQUE' },
            { name: 'industry', def: 'TEXT' },
            { name: 'custom_values', def: "TEXT[] NOT NULL DEFAULT ARRAY['own it', 'challenge it', 'team first', 'empathy for others', 'passion for our purpose']" },
            { name: 'plan', def: "TEXT NOT NULL DEFAULT 'standard'" },
            { name: 'discount_code', def: 'TEXT' },
            { name: 'discount_percentage', def: 'INTEGER' },
            { name: 'partner_firm_id', def: 'VARCHAR' },
            // Slack Integration fields
            { name: 'slack_client_id', def: 'TEXT' },
            { name: 'slack_client_secret', def: 'TEXT' },
            { name: 'slack_workspace_id', def: 'TEXT' },
            { name: 'slack_channel_id', def: 'TEXT' },
            { name: 'slack_wins_channel_id', def: 'TEXT' },
            { name: 'slack_bot_token', def: 'TEXT' },
            { name: 'slack_access_token', def: 'TEXT' },
            { name: 'slack_refresh_token', def: 'TEXT' },
            { name: 'slack_token_expires_at', def: 'TIMESTAMP' },
            { name: 'slack_signing_secret', def: 'TEXT' },
            { name: 'enable_slack_integration', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'slack_connection_status', def: "TEXT DEFAULT 'not_configured'" },
            { name: 'slack_last_connected', def: 'TIMESTAMP' },
            // Microsoft Integration fields
            { name: 'microsoft_client_id', def: 'TEXT' },
            { name: 'microsoft_client_secret', def: 'TEXT' },
            { name: 'microsoft_tenant_id', def: 'TEXT' },
            { name: 'microsoft_teams_webhook_url', def: 'TEXT' },
            { name: 'enable_microsoft_auth', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'enable_teams_integration', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'microsoft_connection_status', def: "TEXT DEFAULT 'not_configured'" },
            { name: 'microsoft_last_connected', def: 'TIMESTAMP' },
            // Theme Configuration
            { name: 'theme_config', def: 'JSONB' },
            { name: 'enable_custom_theme', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            // Onboarding Status
            { name: 'onboarding_status', def: "TEXT NOT NULL DEFAULT 'not_started'" },
            { name: 'onboarding_current_step', def: 'TEXT' },
            { name: 'onboarding_completed_at', def: 'TIMESTAMP' },
            { name: 'onboarding_workspace_completed', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'onboarding_billing_completed', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'onboarding_roles_completed', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'onboarding_values_completed', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'onboarding_members_completed', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'onboarding_settings_completed', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            // Stripe Billing
            { name: 'stripe_customer_id', def: 'TEXT' },
            { name: 'stripe_subscription_id', def: 'TEXT' },
            { name: 'stripe_subscription_status', def: 'TEXT' },
            { name: 'stripe_price_id', def: 'TEXT' },
            { name: 'trial_ends_at', def: 'TIMESTAMP' },
            // User-Based Billing
            { name: 'billing_user_count', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'billing_price_per_user', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'billing_period_start', def: 'TIMESTAMP' },
            { name: 'billing_period_end', def: 'TIMESTAMP' },
            { name: 'pending_billing_changes', def: 'JSONB' },
            // Organization Settings
            { name: 'timezone', def: "TEXT NOT NULL DEFAULT 'America/Chicago'" },
            { name: 'checkin_due_day', def: 'INTEGER NOT NULL DEFAULT 5' },
            { name: 'checkin_due_time', def: "TEXT NOT NULL DEFAULT '17:00'" },
            { name: 'checkin_reminder_day', def: 'INTEGER' },
            { name: 'checkin_reminder_time', def: "TEXT NOT NULL DEFAULT '09:00'" },
            // Legacy fields
            { name: 'weekly_check_in_schedule', def: 'TEXT' },
            { name: 'review_reminder_day', def: 'TEXT' },
            { name: 'review_reminder_time', def: 'TEXT' },
            { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        users: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'username', def: 'TEXT NOT NULL' },
            { name: 'password', def: 'TEXT NOT NULL' },
            { name: 'name', def: 'TEXT NOT NULL' },
            { name: 'email', def: 'TEXT NOT NULL' },
            { name: 'role', def: "TEXT NOT NULL DEFAULT 'member'" },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'team_id', def: 'VARCHAR' },
            { name: 'manager_id', def: 'VARCHAR' },
            { name: 'avatar', def: 'TEXT' },
            { name: 'is_account_owner', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            // Slack integration fields
            { name: 'slack_user_id', def: 'TEXT' },
            { name: 'slack_username', def: 'TEXT' },
            { name: 'slack_display_name', def: 'TEXT' },
            { name: 'slack_email', def: 'TEXT' },
            { name: 'slack_avatar', def: 'TEXT' },
            { name: 'slack_workspace_id', def: 'TEXT' },
            // Microsoft integration fields
            { name: 'microsoft_user_id', def: 'TEXT' },
            { name: 'microsoft_user_principal_name', def: 'TEXT' },
            { name: 'microsoft_display_name', def: 'TEXT' },
            { name: 'microsoft_email', def: 'TEXT' },
            { name: 'microsoft_avatar', def: 'TEXT' },
            { name: 'microsoft_tenant_id', def: 'TEXT' },
            { name: 'microsoft_access_token', def: 'TEXT' },
            { name: 'microsoft_refresh_token', def: 'TEXT' },
            { name: 'auth_provider', def: "TEXT NOT NULL DEFAULT 'local'" },
            // Personal preferences
            { name: 'personal_review_reminder_day', def: 'TEXT' },
            { name: 'personal_review_reminder_time', def: 'TEXT' },
            { name: 'can_view_all_teams', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
            { name: 'is_super_admin', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        teams: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'name', def: 'TEXT NOT NULL' },
            { name: 'description', def: 'TEXT' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'leader_id', def: 'VARCHAR' },
            { name: 'parent_team_id', def: 'VARCHAR' },
            { name: 'team_type', def: "TEXT NOT NULL DEFAULT 'team'" },
            { name: 'depth', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'path', def: 'TEXT' },
            { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        checkins: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'user_id', def: 'VARCHAR NOT NULL' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'week_of', def: 'TIMESTAMP NOT NULL' },
            { name: 'overall_mood', def: 'INTEGER NOT NULL' },
            { name: 'responses', def: 'JSONB NOT NULL DEFAULT \'{}\'::jsonb' },
            { name: 'response_emojis', def: 'JSONB NOT NULL DEFAULT \'{}\'::jsonb' },
            { name: 'response_flags', def: 'JSONB NOT NULL DEFAULT \'{}\'::jsonb' },
            { name: 'winning_next_week', def: 'TEXT' },
            { name: 'is_complete', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'submitted_at', def: 'TIMESTAMP' },
            { name: 'due_date', def: 'TIMESTAMP NOT NULL' },
            { name: 'submitted_on_time', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'review_status', def: "TEXT NOT NULL DEFAULT 'pending'" },
            { name: 'reviewed_by', def: 'VARCHAR' },
            { name: 'reviewed_at', def: 'TIMESTAMP' },
            { name: 'review_due_date', def: 'TIMESTAMP NOT NULL' },
            { name: 'reviewed_on_time', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'review_comments', def: 'TEXT' },
            { name: 'response_comments', def: 'JSONB NOT NULL DEFAULT \'{}\'::jsonb' },
            { name: 'add_to_one_on_one', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'flag_for_follow_up', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        question_categories: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'name', def: 'TEXT NOT NULL' },
            { name: 'description', def: 'TEXT' },
            { name: 'icon', def: 'TEXT' },
            { name: 'order', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'is_default', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        question_bank: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'text', def: 'TEXT NOT NULL' },
            { name: 'category_id', def: 'VARCHAR NOT NULL' },
            { name: 'description', def: 'TEXT' },
            { name: 'tags', def: "TEXT[] NOT NULL DEFAULT '{}'" },
            { name: 'usage_count', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'is_system', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'contributed_by', def: 'VARCHAR' },
            { name: 'contributed_by_org', def: 'VARCHAR' },
            { name: 'is_approved', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        questions: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'text', def: 'TEXT NOT NULL' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'created_by', def: 'VARCHAR NOT NULL' },
            { name: 'category_id', def: 'VARCHAR' },
            { name: 'bank_question_id', def: 'VARCHAR' },
            { name: 'assigned_to_user_id', def: 'VARCHAR' },
            { name: 'team_id', def: 'VARCHAR' },
            { name: 'is_from_bank', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
            { name: 'order', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'add_to_bank', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        team_question_settings: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'team_id', def: 'VARCHAR NOT NULL' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'question_id', def: 'VARCHAR NOT NULL' },
            { name: 'is_disabled', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'disabled_by', def: 'VARCHAR' },
            { name: 'disabled_at', def: 'TIMESTAMP' },
            { name: 'reason', def: 'TEXT' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
            { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        wins: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'title', def: 'TEXT NOT NULL' },
            { name: 'description', def: 'TEXT NOT NULL' },
            { name: 'user_id', def: 'VARCHAR NOT NULL' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'nominated_by', def: 'VARCHAR' },
            { name: 'is_public', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'slack_message_id', def: 'TEXT' },
            { name: 'values', def: "TEXT[] NOT NULL DEFAULT '{}'" },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        comments: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'checkin_id', def: 'VARCHAR NOT NULL' },
            { name: 'user_id', def: 'VARCHAR NOT NULL' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'content', def: 'TEXT NOT NULL' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        shoutouts: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'from_user_id', def: 'VARCHAR NOT NULL' },
            { name: 'to_user_id', def: 'VARCHAR NOT NULL' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'message', def: 'TEXT NOT NULL' },
            { name: 'values', def: "TEXT[] NOT NULL DEFAULT '{}'" },
            { name: 'is_public', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
            { name: 'slack_message_id', def: 'TEXT' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        vacations: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'user_id', def: 'VARCHAR NOT NULL' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'start_date', def: 'DATE NOT NULL' },
            { name: 'end_date', def: 'DATE NOT NULL' },
            { name: 'reason', def: 'TEXT' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        notifications: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'user_id', def: 'VARCHAR NOT NULL' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'type', def: 'TEXT NOT NULL' },
            { name: 'title', def: 'TEXT NOT NULL' },
            { name: 'message', def: 'TEXT NOT NULL' },
            { name: 'data', def: "JSONB NOT NULL DEFAULT '{}'" },
            { name: 'read', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'read_at', def: 'TIMESTAMP' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        tours: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'user_id', def: 'VARCHAR NOT NULL' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'tour_id', def: 'VARCHAR NOT NULL' },
            { name: 'status', def: "TEXT NOT NULL DEFAULT 'not_started'" },
            { name: 'current_step', def: 'INTEGER DEFAULT 0' },
            { name: 'completed_steps', def: "TEXT[] DEFAULT '{}'" },
            { name: 'started_at', def: 'TIMESTAMP' },
            { name: 'completed_at', def: 'TIMESTAMP' },
            { name: 'skipped_at', def: 'TIMESTAMP' },
            { name: 'last_interaction', def: 'TIMESTAMP' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
            { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        team_goals: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'team_id', def: 'VARCHAR' },
            { name: 'title', def: 'TEXT NOT NULL' },
            { name: 'description', def: 'TEXT' },
            { name: 'target_value', def: 'INTEGER NOT NULL' },
            { name: 'current_value', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'goal_type', def: 'TEXT NOT NULL' },
            { name: 'metric', def: 'TEXT NOT NULL' },
            { name: 'prize', def: 'TEXT' },
            { name: 'start_date', def: 'TIMESTAMP NOT NULL' },
            { name: 'end_date', def: 'TIMESTAMP NOT NULL' },
            { name: 'status', def: "TEXT NOT NULL DEFAULT 'active'" },
            { name: 'completed_at', def: 'TIMESTAMP' },
            { name: 'created_by', def: 'VARCHAR NOT NULL' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
            { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        // Analytics and metrics tables
        pulse_metrics_daily: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'metric_date', def: 'DATE NOT NULL' },
            { name: 'total_checkins', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'average_mood', def: 'NUMERIC(3,2)' },
            { name: 'mood_1_count', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'mood_2_count', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'mood_3_count', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'mood_4_count', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'mood_5_count', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'unique_users', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'team_breakdown', def: "JSONB NOT NULL DEFAULT '{}'" },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        shoutout_metrics_daily: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'metric_date', def: 'DATE NOT NULL' },
            { name: 'total_shoutouts', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'public_shoutouts', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'private_shoutouts', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'unique_senders', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'unique_receivers', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'value_counts', def: "JSONB NOT NULL DEFAULT '{}'" },
            { name: 'top_senders', def: "JSONB NOT NULL DEFAULT '[]'" },
            { name: 'top_receivers', def: "JSONB NOT NULL DEFAULT '[]'" },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        compliance_metrics_daily: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'metric_date', def: 'DATE NOT NULL' },
            { name: 'total_due', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'on_time_submissions', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'late_submissions', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'missing_submissions', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'on_time_reviews', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'late_reviews', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'pending_reviews', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'team_breakdown', def: "JSONB NOT NULL DEFAULT '{}'" },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        aggregation_watermarks: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'aggregation_type', def: 'TEXT NOT NULL' },
            { name: 'last_processed_date', def: 'DATE NOT NULL' },
            { name: 'last_processed_id', def: 'VARCHAR' },
            { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        // Billing tables
        billing_events: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'event_type', def: 'TEXT NOT NULL' },
            { name: 'description', def: 'TEXT' },
            { name: 'user_count', def: 'INTEGER' },
            { name: 'price_per_user', def: 'INTEGER' },
            { name: 'total_amount', def: 'INTEGER' },
            { name: 'stripe_event_id', def: 'TEXT' },
            { name: 'metadata', def: "JSONB NOT NULL DEFAULT '{}'" },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        // Auth provider tables
        organization_auth_providers: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'provider', def: 'TEXT NOT NULL' },
            { name: 'provider_org_id', def: 'TEXT' },
            { name: 'provider_org_name', def: 'TEXT' },
            { name: 'config', def: "JSONB NOT NULL DEFAULT '{}'" },
            { name: 'enabled', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
            { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        user_identities: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'user_id', def: 'VARCHAR NOT NULL' },
            { name: 'provider', def: 'TEXT NOT NULL' },
            { name: 'provider_user_id', def: 'TEXT NOT NULL' },
            { name: 'provider_email', def: 'TEXT' },
            { name: 'profile', def: "JSONB NOT NULL DEFAULT '{}'" },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        password_reset_tokens: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'user_id', def: 'VARCHAR NOT NULL' },
            { name: 'token', def: 'TEXT NOT NULL UNIQUE' },
            { name: 'expires_at', def: 'TIMESTAMP NOT NULL' },
            { name: 'used', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        // Dashboard configuration tables
        dashboard_configs: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'user_id', def: 'VARCHAR' },
            { name: 'role', def: 'TEXT' },
            { name: 'is_default', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'layout', def: "JSONB NOT NULL DEFAULT '[]'" },
            { name: 'theme', def: "JSONB DEFAULT '{}'" },
            { name: 'created_by', def: 'VARCHAR NOT NULL' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
            { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        dashboard_widget_templates: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'name', def: 'TEXT NOT NULL' },
            { name: 'description', def: 'TEXT' },
            { name: 'category', def: 'TEXT NOT NULL' },
            { name: 'component', def: 'TEXT NOT NULL' },
            { name: 'default_config', def: "JSONB NOT NULL DEFAULT '{}'" },
            { name: 'min_width', def: 'INTEGER DEFAULT 1' },
            { name: 'min_height', def: 'INTEGER DEFAULT 1' },
            { name: 'max_width', def: 'INTEGER' },
            { name: 'max_height', def: 'INTEGER' },
            { name: 'required_features', def: "TEXT[] DEFAULT '{}'" },
            { name: 'required_role', def: 'TEXT' },
            { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        dashboard_widget_configs: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'dashboard_id', def: 'VARCHAR NOT NULL' },
            { name: 'template_id', def: 'VARCHAR NOT NULL' },
            { name: 'position', def: 'JSONB NOT NULL' },
            { name: 'size', def: 'JSONB NOT NULL' },
            { name: 'config', def: "JSONB NOT NULL DEFAULT '{}'" },
            { name: 'is_visible', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
            { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        // One-on-One and KRA tables
        one_on_ones: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'participant_one_id', def: 'VARCHAR NOT NULL' },
            { name: 'participant_two_id', def: 'VARCHAR NOT NULL' },
            { name: 'scheduled_at', def: 'TIMESTAMP NOT NULL' },
            { name: 'status', def: "TEXT NOT NULL DEFAULT 'scheduled'" },
            { name: 'agenda', def: 'TEXT' },
            { name: 'notes', def: 'TEXT' },
            { name: 'action_items', def: "JSONB NOT NULL DEFAULT '[]'" },
            { name: 'kra_ids', def: "TEXT[] DEFAULT '{}'" },
            { name: 'duration', def: 'INTEGER DEFAULT 30' },
            { name: 'location', def: 'TEXT' },
            { name: 'is_recurring', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'recurrence_series_id', def: 'VARCHAR' },
            { name: 'recurrence_pattern', def: 'TEXT' },
            { name: 'recurrence_interval', def: 'INTEGER DEFAULT 1' },
            { name: 'recurrence_end_date', def: 'TIMESTAMP' },
            { name: 'recurrence_end_count', def: 'INTEGER' },
            { name: 'is_recurrence_template', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'outlook_event_id', def: 'TEXT' },
            { name: 'meeting_url', def: 'TEXT' },
            { name: 'is_online_meeting', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'sync_with_outlook', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
            { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        kra_templates: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'name', def: 'TEXT NOT NULL' },
            { name: 'description', def: 'TEXT' },
            { name: 'goals', def: "JSONB NOT NULL DEFAULT '[]'" },
            { name: 'category', def: "TEXT NOT NULL DEFAULT 'general'" },
            { name: 'job_title', def: 'TEXT' },
            { name: 'industries', def: "TEXT[] NOT NULL DEFAULT '{}'" },
            { name: 'is_global', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
            { name: 'created_by', def: 'VARCHAR NOT NULL' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        user_kras: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'user_id', def: 'VARCHAR NOT NULL' },
            { name: 'template_id', def: 'VARCHAR' },
            { name: 'name', def: 'TEXT NOT NULL' },
            { name: 'description', def: 'TEXT' },
            { name: 'goals', def: "JSONB NOT NULL DEFAULT '[]'" },
            { name: 'assigned_by', def: 'VARCHAR NOT NULL' },
            { name: 'start_date', def: 'TIMESTAMP NOT NULL' },
            { name: 'end_date', def: 'TIMESTAMP' },
            { name: 'status', def: "TEXT NOT NULL DEFAULT 'active'" },
            { name: 'progress', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'last_updated', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        action_items: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'meeting_id', def: 'VARCHAR' },
            { name: 'one_on_one_id', def: 'VARCHAR' },
            { name: 'description', def: 'TEXT NOT NULL' },
            { name: 'assigned_to', def: 'VARCHAR NOT NULL' },
            { name: 'assigned_by', def: 'VARCHAR NOT NULL' },
            { name: 'due_date', def: 'TIMESTAMP' },
            { name: 'status', def: "TEXT NOT NULL DEFAULT 'open'" },
            { name: 'notes', def: 'TEXT' },
            { name: 'carry_forward', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
            { name: 'completed_at', def: 'TIMESTAMP' }
          ]
        },
        kra_ratings: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'kra_id', def: 'VARCHAR NOT NULL' },
            { name: 'one_on_one_id', def: 'VARCHAR' },
            { name: 'rater_id', def: 'VARCHAR NOT NULL' },
            { name: 'rater_role', def: 'TEXT NOT NULL' },
            { name: 'rating', def: 'INTEGER NOT NULL' },
            { name: 'note', def: 'TEXT' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        kra_history: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'kra_id', def: 'VARCHAR NOT NULL' },
            { name: 'user_id', def: 'VARCHAR NOT NULL' },
            { name: 'change_type', def: 'TEXT NOT NULL' },
            { name: 'old_value', def: 'JSONB' },
            { name: 'new_value', def: 'JSONB' },
            { name: 'reason', def: 'TEXT' },
            { name: 'changed_by_id', def: 'VARCHAR NOT NULL' },
            { name: 'changed_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        // Support and other tables
        bug_reports: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'user_id', def: 'VARCHAR NOT NULL' },
            { name: 'title', def: 'TEXT NOT NULL' },
            { name: 'description', def: 'TEXT NOT NULL' },
            { name: 'category', def: "TEXT NOT NULL DEFAULT 'bug'" },
            { name: 'severity', def: "TEXT NOT NULL DEFAULT 'medium'" },
            { name: 'page_path', def: 'TEXT' },
            { name: 'metadata', def: "JSONB DEFAULT '{}'" },
            { name: 'status', def: "TEXT NOT NULL DEFAULT 'open'" },
            { name: 'resolution_note', def: 'TEXT' },
            { name: 'assigned_to', def: 'VARCHAR' },
            { name: 'screenshot_url', def: 'TEXT' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
            { name: 'resolved_at', def: 'TIMESTAMP' }
          ]
        },
        business_plans: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'name', def: 'TEXT NOT NULL' },
            { name: 'display_name', def: 'TEXT NOT NULL' },
            { name: 'description', def: 'TEXT' },
            { name: 'price', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'billing_period', def: "TEXT NOT NULL DEFAULT 'monthly'" },
            { name: 'features', def: "TEXT[] NOT NULL DEFAULT '{}'" },
            { name: 'max_users', def: 'INTEGER' },
            { name: 'max_teams', def: 'INTEGER' },
            { name: 'has_slack_integration', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'has_microsoft_integration', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'has_advanced_analytics', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'has_api_access', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'priority', def: 'INTEGER NOT NULL DEFAULT 0' },
            { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
            { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        organization_onboarding: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'step', def: "TEXT NOT NULL DEFAULT 'signup'" },
            { name: 'is_completed', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
            { name: 'completed_steps', def: "TEXT[] NOT NULL DEFAULT '{}'" },
            { name: 'current_step_data', def: 'JSONB' },
            { name: 'started_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
            { name: 'completed_at', def: 'TIMESTAMP' },
            { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        user_invitations: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'organization_id', def: 'VARCHAR NOT NULL' },
            { name: 'email', def: 'TEXT NOT NULL' },
            { name: 'name', def: 'TEXT' },
            { name: 'role', def: "TEXT NOT NULL DEFAULT 'member'" },
            { name: 'team_id', def: 'VARCHAR' },
            { name: 'invited_by', def: 'VARCHAR NOT NULL' },
            { name: 'status', def: "TEXT NOT NULL DEFAULT 'pending'" },
            { name: 'token', def: 'TEXT NOT NULL UNIQUE' },
            { name: 'expires_at', def: 'TIMESTAMP NOT NULL' },
            { name: 'accepted_at', def: 'TIMESTAMP' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        },
        partner_applications: {
          columns: [
            { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
            { name: 'company_name', def: 'TEXT NOT NULL' },
            { name: 'contact_name', def: 'TEXT NOT NULL' },
            { name: 'contact_email', def: 'TEXT NOT NULL' },
            { name: 'contact_phone', def: 'TEXT' },
            { name: 'company_size', def: 'TEXT' },
            { name: 'industry', def: 'TEXT' },
            { name: 'expected_clients', def: 'TEXT' },
            { name: 'use_case', def: 'TEXT' },
            { name: 'additional_info', def: 'TEXT' },
            { name: 'status', def: "TEXT NOT NULL DEFAULT 'pending'" },
            { name: 'reviewed_by', def: 'VARCHAR' },
            { name: 'reviewed_at', def: 'TIMESTAMP' },
            { name: 'notes', def: 'TEXT' },
            { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
            { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
          ]
        }
      };

      // Process each table
      console.log("🔍 Starting comprehensive database synchronization...\n");
      
      for (const [tableName, tableConfig] of Object.entries(tableDefinitions)) {
        summary.tablesChecked++;
        results[tableName] = [];
        errors[tableName] = [];

        console.log(`📊 Processing table: ${tableName}`);
        
        try {
          // Check if table exists
          const exists = await tableExists(tableName);
          
          if (!exists) {
            console.log(`   ⚠️  Table '${tableName}' does not exist - Creating...`);
            try {
              // Create table with primary key column only first
              const primaryCol = tableConfig.columns.find(c => c.def.includes('PRIMARY KEY'));
              if (primaryCol) {
                await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS ${tableName} (${primaryCol.name} ${primaryCol.def})`));
                summary.tablesCreated++;
                results[tableName].push({ action: "TABLE_CREATED", status: "SUCCESS" });
                console.log(`   ✅ Table '${tableName}' created successfully`);
              }
            } catch (createError: any) {
              errors[tableName].push({ action: "TABLE_CREATE", error: createError.message });
              console.error(`   ❌ Failed to create table '${tableName}':`, createError.message);
              continue;
            }
          }
          
          // Process each column
          for (const column of tableConfig.columns) {
            // Skip primary key if we just created it
            if (!exists && column.def.includes('PRIMARY KEY')) {
              continue;
            }
            
            try {
              const status = await addColumn(tableName, column.name, column.def);
              results[tableName].push({ column: column.name, status });
              
              if (status === "ADDED") {
                console.log(`   ✅ Added column: ${column.name}`);
              }
            } catch (colError: any) {
              errors[tableName].push({ column: column.name, error: colError.message });
              console.error(`   ❌ Error with column '${column.name}':`, colError.message);
            }
          }
          
        } catch (tableError: any) {
          errors[tableName].push({ action: "TABLE_CHECK", error: tableError.message });
          console.error(`   ❌ Error processing table '${tableName}':`, tableError.message);
        }
        
        console.log(`   📋 Table '${tableName}' processing complete\n`);
      }

      // Generate final verification report
      console.log("🔍 Generating verification report...\n");
      
      const verificationReport: any = {};
      
      for (const tableName of Object.keys(tableDefinitions)) {
        try {
          const columnResult = await db.execute(sql`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = ${tableName}
            ORDER BY ordinal_position
          `);
          
          verificationReport[tableName] = {
            exists: columnResult.rows.length > 0,
            columnCount: columnResult.rows.length,
            columns: columnResult.rows
          };
        } catch (verifyError: any) {
          verificationReport[tableName] = {
            exists: false,
            error: verifyError.message
          };
        }
      }

      // Log summary
      console.log("\n📊 SYNCHRONIZATION SUMMARY:");
      console.log(`   Tables Checked: ${summary.tablesChecked}`);
      console.log(`   Tables Created: ${summary.tablesCreated}`);
      console.log(`   Columns Added: ${summary.columnsAdded}`);
      console.log(`   Columns Existing: ${summary.columnsExisting}`);
      console.log(`   Columns Errored: ${summary.columnsErrored}`);
      
      const hasErrors = Object.values(errors).some(e => e.length > 0);
      
      res.json({
        success: !hasErrors,
        message: "Comprehensive database synchronization completed",
        summary,
        results,
        errors: Object.keys(errors).reduce((acc, key) => {
          if (errors[key].length > 0) acc[key] = errors[key];
          return acc;
        }, {} as any),
        verificationReport,
        timestamp: new Date().toISOString(),
        note: hasErrors 
          ? "Some errors occurred during synchronization. Review the errors section." 
          : "All tables and columns successfully synchronized!"
      });
      
    } catch (error) {
      console.error("❌ Database synchronization failed:", error);
      res.status(500).json({ 
        success: false,
        error: "Database synchronization failed",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      });
    }
  });
  */
  // END OF DEPRECATED EMERGENCY SYNC ENDPOINT

  // Local authentication login using centralized AuthService
  app.post("/auth/local/login", requireOrganization(), async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ 
          message: "Email and password are required" 
        });
      }
      
      // Import the centralized AuthService
      const { authService } = await import('./services/authService');
      
      // Use the centralized AuthService to authenticate user
      const authResult = await authService.authenticateUser(email, password);
      
      if (!authResult) {
        return res.status(401).json({ 
          message: "Invalid email or password" 
        });
      }
      
      const { user, organization } = authResult;
      
      // Create session using the centralized AuthService
      try {
        await authService.createSession(req, user, organization);
        
        // Return sanitized user data
        res.json({ 
          message: "Login successful", 
          user: authService.getSanitizedUser(user)
        });
      } catch (sessionError) {
        console.error('Failed to create session:', sessionError);
        return res.status(500).json({ message: 'Failed to create session' });
      }
    } catch (error) {
      console.error("Local login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Password Reset Request - for dev environment
  app.post("/api/auth/password-reset/request", requireOrganization(), async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ 
          message: "Email is required" 
        });
      }
      
      // Get organization from middleware
      const organization = (req as any).organization;
      if (!organization) {
        return res.status(404).json({ message: "Organization context not found" });
      }
      
      // Find user by email in the current organization
      const user = await storage.getUserByEmail(organization.id, email);
      
      if (user) {
        // Create password reset token
        const token = await storage.createPasswordResetToken(user.id);
        
        // In development, log the token to console
        if (isDevelopment) {
          const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${token}`;
          console.log('🔐 Password Reset Token Generated:');
          console.log('   Email:', email);
          console.log('   Token:', token);
          console.log('   Reset URL:', resetUrl);
          console.log('   Expires in: 1 hour');
        }
      }
      
      // Always return success to avoid user enumeration
      res.json({ 
        message: "If an account exists with this email, a password reset link has been sent.",
        development: isDevelopment ? "Check the console for the reset token" : undefined
      });
    } catch (error) {
      console.error("Password reset request error:", error);
      res.status(500).json({ message: "Failed to process password reset request" });
    }
  });

  // Password Reset Confirmation
  app.post("/api/auth/password-reset/confirm", async (req, res) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ 
          message: "Token and password are required" 
        });
      }
      
      // Validate password length
      if (password.length < 8) {
        return res.status(400).json({ 
          message: "Password must be at least 8 characters long" 
        });
      }
      
      // Get token info
      const tokenInfo = await storage.getPasswordResetToken(token);
      
      if (!tokenInfo) {
        return res.status(400).json({ 
          message: "Invalid or expired password reset token" 
        });
      }
      
      // Hash the new password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Update user's password
      await storage.updateUserPassword(tokenInfo.userId, hashedPassword);
      
      // Delete the used token
      await storage.deletePasswordResetToken(token);
      
      res.json({ 
        message: "Password has been successfully reset. You can now log in with your new password." 
      });
    } catch (error) {
      console.error("Password reset confirmation error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Backward compatibility: redirect /auth to /login
  app.get("/auth", (req, res) => {
    res.redirect(301, "/login");
  });

  // OAuth endpoints - MUST be registered BEFORE auth middleware to be accessible
  // These endpoints handle their own authentication flow
  
  // GET /auth/slack/oauth-url - Return OAuth URL as JSON (NO /api prefix to avoid auth middleware)
  app.get("/auth/slack/oauth-url", async (req, res) => {
    try {
      const { org, action } = req.query;
      
      let organizationSlug = org as string;
      
      if (!org) {
        return res.status(400).json({ error: 'No organization specified' });
      }
      
      // Generate OAuth URL and save state to session
      const orgSlugString = typeof organizationSlug === 'string' ? organizationSlug : String(organizationSlug);
      const oauthUrl = generateOAuthURL(orgSlugString, req.session, req);
      
      // FIX: Let express-session automatically save and set cookie
      console.log('🍪 Session will auto-save with OAuth state');
      
      // Return the OAuth URL as JSON
      res.json({ url: oauthUrl });
    } catch (error) {
      console.error("OAuth URL generation error:", error);
      res.status(500).json({ error: "Failed to generate OAuth URL" });
    }
  });
  
  // GET /auth/slack/login - Initiate Slack OAuth flow
  // Also expose at /api/auth/slack/login to bypass Vite middleware
  app.get(["/auth/slack/login", "/api/auth/slack/login"], async (req, res) => {
    try {
      const { org, action } = req.query;
      
      // Handle different authentication scenarios
      let organizationSlug = org as string;
      
      // If no org specified, redirect to organization selection
      if (!org) {
        console.log('❌ No organization specified for Slack login');
        return res.redirect('/signup');
      }
      
      // Handle new organization creation
      if (org === 'new') {
        console.log('🆕 New organization creation via Slack');
        organizationSlug = 'new';
      } else {
        console.log('🔐 Slack authentication for organization:', organizationSlug);
      }
      
      try {
        console.log('🚀 Slack OAuth login initiated for org:', organizationSlug);
        console.log('📦 Session ID before OAuth:', req.sessionID);
        console.log('🌐 Request host headers:', {
          host: req.get('host'),
          forwardedHost: req.get('X-Forwarded-Host'),
          forwardedProto: req.get('X-Forwarded-Proto'),
          origin: req.get('origin')
        });
        
        // Generate OAuth URL using the unified service function (this sets session state)
        const orgSlugString = typeof organizationSlug === 'string' ? organizationSlug : String(organizationSlug);
        const oauthUrl = generateOAuthURL(orgSlugString, req.session, req);
        
        console.log('🔐 OAuth state generated and stored in session');
        console.log('📋 Session data after state generation:', {
          hasOAuthState: !!(req.session as any).slackOAuthState,
          organizationSlug: (req.session as any).slackOAuthOrganizationSlug,
          expires: (req.session as any).slackOAuthExpires
        });
        
        // FIX: Let express-session automatically save and set cookie
        console.log('🍪 Session will auto-save with OAuth state');
        console.log('✅ Redirecting to Slack OAuth:', oauthUrl.substring(0, 100) + '...');
        
        // Redirect to Slack OAuth
        res.redirect(oauthUrl);
      } catch (urlError) {
        console.error("OAuth URL generation error:", urlError);
        res.status(500).json({ 
          message: "Failed to generate Slack OAuth URL. Please check configuration." 
        });
      }
    } catch (error) {
      console.error("Slack OAuth initiation error:", error);
      res.status(500).json({ 
        message: "Failed to initiate Slack authentication. Please check OAuth configuration." 
      });
    }
  });
  
  // GET /auth/slack/callback - Handle OAuth callback from Slack
  app.get("/auth/slack/callback", async (req, res) => {
    try {
      const { code, state, error: oauthError } = req.query;
      
      console.log('🔍 Slack OAuth callback received');
      console.log('📦 Callback Session ID:', req.sessionID);
      console.log('🍪 Cookie header present:', !!req.headers.cookie);
      console.log('🍪 Cookie header length:', req.headers.cookie?.length || 0);
      console.log('🆕 Session is new:', !req.session || Object.keys(req.session).length === 0);
      console.log('🔗 Request origin:', req.headers.origin);
      console.log('🔗 Request referrer:', req.headers.referer);
      console.log('🔒 Protocol:', req.protocol);
      
      // Check for OAuth errors from Slack
      if (oauthError) {
        console.error("Slack OAuth error:", oauthError);
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Error</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #dc3545; }
                button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ Authentication Error</h1>
              <p>OAuth error: ${oauthError}</p>
              <button onclick="window.close()">Close Window</button>
            </body>
          </html>
        `);
      }
      
      // Validate required parameters
      if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
        console.error('❌ Invalid callback parameters:', { hasCode: !!code, hasState: !!state });
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Error</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #dc3545; }
                button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ Invalid Request</h1>
              <p>Invalid OAuth callback parameters. Please try logging in again.</p>
              <button onclick="window.location.href='/'">Try Again</button>
            </body>
          </html>
        `);
      }
      
      console.log('📋 Session data before validation:', {
        hasOAuthState: !!(req.session as any).slackOAuthState,
        storedOrgSlug: (req.session as any).slackOAuthOrganizationSlug,
        expires: (req.session as any).slackOAuthExpires,
        expiresISO: (req.session as any).slackOAuthExpires ? new Date((req.session as any).slackOAuthExpires).toISOString() : null,
        nowVsExpiresMs: (req.session as any).slackOAuthExpires ? ((req.session as any).slackOAuthExpires - Date.now()) : null
      });
      console.log('🔑 Received state prefix:', state.substring(0, 8) + '...');
      console.log('🔑 Stored state prefix:', ((req.session as any).slackOAuthState || '').substring(0, 8) + '...');
      
      // Validate state parameter using the unified service function
      const organizationSlug = validateOAuthState(state, req.session);
      if (!organizationSlug) {
        console.error('❌ OAuth state validation failed');
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Error</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #dc3545; }
                button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ Session Expired</h1>
              <p>Your authentication session has expired. Please try logging in again.</p>
              <button onclick="window.location.href='/'">Try Again</button>
            </body>
          </html>
        `);
      }
      
      console.log('✅ OAuth state validation successful, org:', organizationSlug);
      
      // Exchange code for OpenID Connect tokens (use dynamic redirect URI)
      const dynamicRedirectUri = resolveRedirectUri(req, '/auth/slack/callback');
      const tokenResponse = await exchangeOIDCCode(code, dynamicRedirectUri);
      if (!tokenResponse.ok || !tokenResponse.id_token) {
        console.error("OIDC token exchange failed:", tokenResponse.error);
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Error</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #dc3545; }
                button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ Authentication Failed</h1>
              <p>Failed to authenticate with Slack. Please try again.</p>
              <button onclick="window.location.href='/'">Try Again</button>
            </body>
          </html>
        `);
      }
      
      // Validate and decode the ID token
      const userInfoResponse = await validateOIDCToken(tokenResponse.id_token);
      if (!userInfoResponse.ok || !userInfoResponse.user) {
        console.error("Failed to validate ID token:", userInfoResponse.error);
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Error</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #dc3545; }
                button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ Authentication Failed</h1>
              <p>${userInfoResponse.error || "Failed to validate user identity. Please try again."}</p>
              <button onclick="window.location.href='/'">Try Again</button>
            </body>
          </html>
        `);
      }
      
      const user = userInfoResponse.user;
      const team = userInfoResponse.user.team; // Team data comes from the JWT, not token response
      
      console.log('📊 Slack OAuth team data:', {
        teamId: team?.id,
        teamName: team?.name,
        hasTeamData: !!team,
        fullTeamObject: team,
        userInfoResponseKeys: Object.keys(userInfoResponse),
        userKeys: user ? Object.keys(user) : [],
        rawUserInfo: JSON.stringify(userInfoResponse.user, null, 2)
      });
      
      // Try to fetch actual email from Slack API if we have an access token
      if (tokenResponse.access_token && user.user?.id) {
        const slackUserInfo = await getSlackUserInfo(tokenResponse.access_token, user.user.id);
        if (slackUserInfo.email) {
          console.log('📧 Successfully fetched email from Slack API:', slackUserInfo.email);
          user.user.email = slackUserInfo.email;
        }
        if (slackUserInfo.name) {
          user.user.name = slackUserInfo.name;
        }
      }
      
      // Resolve organization (we know the slug from state validation)
      // Note: We need to manually resolve the organization here since we're before the org middleware
      let organization;
      let isSuperAdmin = false;
      let isNewOrganization = false;
      
      try {
        const allOrgs = await storage.getAllOrganizations();
        
        // ALWAYS check if user should be super admin based on their email
        // This ensures super admins maintain their status regardless of which org they auth to
        const userEmail = (user.email || user.user?.email || "").toLowerCase();
        // Only whirkplace.com domain gets automatic super admin
        const allowedSuperAdminDomains = ['whirkplace.com'];
        
        // Check if user is from whirkplace.com domain
        const isAllowedSuperAdmin = 
          allowedSuperAdminDomains.some(domain => userEmail.endsWith(`@${domain}`));
        
        console.log('🔐 Super admin check for Slack OAuth:');
        console.log('  Organization:', organizationSlug);
        console.log('  Email:', userEmail);
        console.log('  Is allowed super admin:', isAllowedSuperAdmin);
        
        // Check if this is a new organization creation
        if (organizationSlug === 'new') {
          isNewOrganization = true;
          console.log('🆕 Creating new organization for user:', userEmail);
          
          // Generate organization slug from email domain or company name
          const emailDomain = userEmail.split('@')[1] || 'company';
          const companyName = emailDomain.split('.')[0];
          
          // Create a unique slug
          let baseSlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          let finalSlug = baseSlug;
          let counter = 1;
          
          // Check if slug already exists and make it unique
          while (allOrgs.find(org => org.slug === finalSlug)) {
            finalSlug = `${baseSlug}-${counter}`;
            counter++;
          }
          
          // Create the new organization
          const orgName = team?.name || `${companyName.charAt(0).toUpperCase()}${companyName.slice(1)}`;
          console.log('📦 Creating new organization with data:', {
            teamName: team?.name,
            teamId: team?.id,
            hasTeamData: !!team,
            fallbackName: `${companyName.charAt(0).toUpperCase()}${companyName.slice(1)}`,
            finalName: orgName
          });
          
          organization = await storage.createOrganization({
            name: orgName,
            slug: finalSlug,
            plan: 'standard',
            isActive: true,
            customValues: ['Innovation', 'Teamwork', 'Excellence'],
            enableSlackIntegration: true,
            slackWorkspaceId: team?.id || null,
            enableMicrosoftAuth: false
          });
          
          console.log('✅ Created new organization:', {
            id: organization.id,
            slug: organization.slug,
            name: organization.name,
            slackWorkspaceId: organization.slackWorkspaceId
          });
        } else if (organizationSlug === 'whirkplace') {
          // Look for the whirkplace super admin organization
          organization = allOrgs.find(org => org.id === 'whirkplace' || org.slug === 'whirkplace');
          
          // Only grant super admin if specifically allowed
          isSuperAdmin = isAllowedSuperAdmin;
          
          console.log('  Will be super admin:', isSuperAdmin);
          
          if (!organization) {
            // Create whirkplace organization if it doesn't exist
            console.log('Creating whirkplace super admin organization...');
            organization = await storage.createOrganization({
              id: 'whirkplace',
              name: 'Whirkplace (Super Admin)',
              slug: 'whirkplace',
              plan: 'enterprise',
              isActive: true,
              customValues: ['Own It', 'Challenge It', 'Team First', 'Empathy for Others', 'Passion for Our Purpose'],
              enableSlackIntegration: true,
              enableTeamsIntegration: true
            });
          }
        } else {
          organization = allOrgs.find(org => org.slug === organizationSlug);
          if (!organization) {
            return res.status(404).json({ 
              message: `Organization '${organizationSlug}' not found` 
            });
          }
        }
      } catch (error) {
        console.error("Failed to resolve organization:", error);
        return res.status(500).json({ 
          message: "Failed to resolve organization" 
        });
      }
      
      // Validate organization mapping with Slack team
      if (team?.id && organization.slackWorkspaceId && organization.slackWorkspaceId !== team.id) {
        return res.status(403).json({
          message: "Slack workspace does not match this organization. Please contact your administrator."
        });
      }
      
      // Check if user already exists by Slack ID or email (using efficient lookups)
      // IMPORTANT: Due to multiple organizations, we need to check across ALL orgs for Slack ID uniqueness
      let existingUser;
      let userOrganization = organization; // Track which org the user belongs to
      
      try {
        // First try to find by Slack user ID in the CURRENT organization
        if (user.sub) {
          console.log('🔍 Looking for user with Slack ID:', user.sub, 'in org:', organization.id);
          existingUser = await storage.getUserBySlackId(organization.id, user.sub);
          console.log('🔍 Found by Slack ID in current org?', existingUser ? 'YES' : 'NO');
          
          // CRITICAL FIX: If user found in current org, ensure userOrganization is set properly
          if (existingUser) {
            userOrganization = organization; // User belongs to this organization
            console.log('✅ User found in current organization:', organization.id, organization.name);
          }
          
          // If not found in current org, check if user exists in ANY org (for duplicate prevention)
          // BUT allow creating new organizations even if Slack ID exists elsewhere
          if (!existingUser && !isNewOrganization) {
            console.log('🔍 Checking if Slack ID exists in ANY organization...');
            // Try to find user with this Slack ID in ANY organization
            // This prevents duplicate key errors
            const allOrgs = await storage.getAllOrganizations();
            for (const org of allOrgs) {
              const userInOrg = await storage.getUserBySlackId(org.id, user.sub);
              if (userInOrg) {
                console.log('⚠️ Found user with Slack ID in different org:', org.id, org.name);
                
                // Check if this user is a super admin - they can access any org
                if (userInOrg.isSuperAdmin) {
                  console.log('✅ User is super admin - allowing cross-organization authentication');
                  // Use the user from their original organization
                  existingUser = userInOrg;
                  userOrganization = org; // Update organization context to the user's actual org
                  break;
                } else {
                  // Regular users cannot cross organizations unless creating a new org
                  console.log('❌ Regular user trying to access wrong organization');
                  // User exists in a different organization!
                  // Return error page explaining the situation
                  return res.status(400).send(`
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <title>Account Organization Mismatch</title>
                        <style>
                          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                          h1 { color: #d73502; }
                          .error { color: #d73502; font-size: 1.2em; }
                          .info { background: white; padding: 20px; border-radius: 8px; max-width: 600px; margin: 20px auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                          .details { text-align: left; margin-top: 20px; padding: 15px; background: #f9f9f9; border-radius: 4px; }
                          .details strong { color: #333; }
                          button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; background: #007bff; color: white; border: none; border-radius: 4px; }
                          button:hover { background: #0056b3; }
                          .warning-icon { font-size: 3em; margin-bottom: 20px; }
                        </style>
                      </head>
                      <body>
                        <div class="warning-icon">⚠️</div>
                        <h1>Wrong Organization</h1>
                        <div class="info">
                          <p class="error">Your account belongs to a different organization.</p>
                          <div class="details">
                            <p><strong>What happened:</strong><br>
                            Your Slack account (${user.email || 'unknown'}) is registered with the "${org.name}" organization,
                            but you're trying to access a different organization.</p>
                            
                            <p><strong>Slack ID:</strong> ${user.sub}<br>
                            <strong>Your Organization:</strong> ${org.name}</p>
                          </div>
                          <p>Please use the correct organization URL or contact your administrator.</p>
                          <button onclick="window.location.href='/'">Back to Home</button>
                        </div>
                      </body>
                    </html>
                  `);
                }
              }
            }
          }
        }
        
        // If still not found by Slack ID, try by email 
        // Special handling for super admins: check ALL organizations for super admin accounts by email
        if (!existingUser && user.email) {
          console.log('🔍 Looking for user with email:', user.email, 'in org:', organization.id);
          existingUser = await storage.getUserByEmail(organization.id, user.email);
          console.log('🔍 Found by email in current org?', existingUser ? 'YES' : 'NO');
          
          // CRITICAL FIX: If user found by email in current org, ensure userOrganization is set properly
          if (existingUser) {
            userOrganization = organization; // User belongs to this organization  
            console.log('✅ User found by email in current organization:', organization.id, organization.name);
          }
          
          // If not found in current org but has email, check if this is a super admin in ANY org
          if (!existingUser) {
            console.log('🔍 Checking if email belongs to a super admin in ANY organization...');
            const allOrgs = await storage.getAllOrganizations();
            for (const org of allOrgs) {
              const userInOrg = await storage.getUserByEmail(org.id, user.email);
              if (userInOrg && userInOrg.isSuperAdmin) {
                console.log('✅ Found super admin by email in org:', org.id, org.name);
                // This is a super admin - they can authenticate to any org
                // We'll link their Slack ID to this account
                existingUser = userInOrg;
                userOrganization = org;
                break;
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to check existing user:", error);
        return res.status(500).json({ 
          message: "Failed to check existing user" 
        });
      }
      
      let authenticatedUser;
      
      if (existingUser) {
        // Update existing user with Slack OIDC data
        try {
          const slackUserId = user.sub;
          const displayName = user.name || user.given_name || slackUserId;
          
          // Prepare update data with Slack information
          const updateData: any = {
            slackUserId: slackUserId,
            slackUsername: slackUserId, // OIDC doesn't provide username, use ID
            slackDisplayName: displayName,
            slackEmail: user.email,
            slackAvatar: user.picture,
            slackWorkspaceId: team?.id || user["https://slack.com/team_id"],
            avatar: user.picture || existingUser.avatar,
            // Update email if not set and Slack provides one
            email: existingUser.email || user.email || existingUser.email,
            // Update name if it's just the default email
            name: existingUser.name === existingUser.email && displayName ? 
                  displayName : existingUser.name
          };
          
          // CRITICAL: Check if user should be super admin based on email
          const userEmail = (user.email || user.user?.email || existingUser.email || "").toLowerCase();
          // Only whirkplace.com domain gets automatic super admin
          const allowedSuperAdminDomains = ['whirkplace.com'];
          
          const shouldBeSuperAdmin = 
            allowedSuperAdminDomains.some(domain => userEmail.endsWith(`@${domain}`));
          
          // Update super admin status if they meet the criteria OR preserve existing super admin status
          if (shouldBeSuperAdmin || existingUser.isSuperAdmin) {
            updateData.isSuperAdmin = true;
            updateData.role = existingUser.role === 'admin' ? 'admin' : updateData.role || existingUser.role; // Preserve role or ensure admin
            console.log('🔑 Setting super admin for user:', existingUser.email, 'shouldBe:', shouldBeSuperAdmin, 'existing:', existingUser.isSuperAdmin);
          } else {
            // Preserve existing role and super admin status if not in allowed list
            updateData.role = existingUser.role;
            updateData.isSuperAdmin = existingUser.isSuperAdmin;
          }

          // Smart authProvider handling: preserve existing provider or set multi-provider state
          if (!existingUser.authProvider || existingUser.authProvider === 'local') {
            updateData.authProvider = 'slack';
          }
          // If user already has Microsoft auth, don't overwrite - they can use either method
          
          authenticatedUser = await storage.updateUser(userOrganization.id, existingUser.id, updateData);
        } catch (error) {
          console.error("Failed to update user with Slack data:", error);
          return res.status(500).json({ 
            message: "Failed to update user account" 
          });
        }
      } else {
        // Create new user with Slack OIDC data
        // Define variables outside try block so they're accessible in catch block
        const slackUserId = user.sub;
        const displayName = user.name || user.given_name || slackUserId;
        
        try {
          // Generate secure random password for Slack users (never used for login)
          const securePassword = randomBytes(32).toString('hex');
          
          // Check if new user should be super admin based on their email
          const newUserEmail = (user.email || user.user?.email || `${slackUserId}@slack.local`).toLowerCase();
          // Only whirkplace.com domain gets automatic super admin
          const allowedSuperAdminDomains = ['whirkplace.com'];
          
          const shouldBeSuperAdmin = 
            allowedSuperAdminDomains.some(domain => newUserEmail.endsWith(`@${domain}`));
          
          // Use the email-based check OR the org-based check (from earlier in the function)
          const finalSuperAdmin = shouldBeSuperAdmin || isSuperAdmin;
          
          console.log('🔑 Creating new user - super admin check:', newUserEmail, 'shouldBe:', shouldBeSuperAdmin, 'orgBased:', isSuperAdmin, 'final:', finalSuperAdmin);
          
          const userData = {
            username: slackUserId, // Use Slack user ID as username for uniqueness
            password: securePassword, // Secure random password for Slack users
            name: displayName,
            email: newUserEmail !== `${slackUserId}@slack.local` ? newUserEmail : `${slackUserId}@slack.local`,
            role: (finalSuperAdmin || isNewOrganization) ? "admin" : "member",  // Super admins and org founders get admin role
            isSuperAdmin: finalSuperAdmin,  // Set super admin flag based on email check
            organizationId: organization.id,
            slackUserId: slackUserId,
            slackUsername: slackUserId, // OIDC doesn't provide username
            slackDisplayName: displayName,
            slackEmail: user.email,
            slackAvatar: user.picture,
            slackWorkspaceId: team?.id || user["https://slack.com/team_id"],
            authProvider: "slack" as const,
            avatar: user.picture,
          };
          
          authenticatedUser = await storage.createUser(organization.id, {
            ...userData,
            isAccountOwner: isNewOrganization ? true : false,  // Account owner flag for new org creator
          });
          
          // Send welcome message via Slack DM if user has Slack ID
          if (authenticatedUser.slackUserId) {
            try {
              const { sendWelcomeMessage } = await import("./services/slack");
              await sendWelcomeMessage(
                authenticatedUser.slackUserId,
                authenticatedUser.name || authenticatedUser.username,
                null, // Channel ID not needed for DM
                organization.name
              );
              console.log(`✅ Welcome message sent to new user: ${authenticatedUser.name}`);
            } catch (welcomeError) {
              console.error(`Failed to send welcome message to ${authenticatedUser.name}:`, welcomeError);
            }
          }
        } catch (error) {
          console.error("🔴 CRITICAL: Failed to create user from Slack:", error);
          console.error("🔴 User creation attempted for email:", user.email || "unknown");
          console.error("🔴 Full error details:", error instanceof Error ? error.message : error);
          
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorType = error?.constructor?.name || 'UnknownError';
          
          // Handle duplicate key error specifically
          if (errorMessage.includes('duplicate key value') && errorMessage.includes('slack_user_id_key')) {
            console.log('🔄 Duplicate Slack ID detected, user already exists with this Slack ID');
            console.log('🔄 This means the user exists but we failed to find them in the lookup');
            console.log('🔄 Slack ID:', slackUserId);
            console.log('🔄 Organization ID we searched:', organization.id);
            
            // Since we know the user exists with this Slack ID, the best approach is to
            // inform the user and suggest they contact support to resolve the account issue
            return res.status(500).send(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Account Exists</title>
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <style>
                    body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                    .error { color: #dc3545; }
                    button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
                    .debug { font-size: 0.9em; color: #666; margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px; text-align: left; max-width: 600px; margin: 20px auto; word-wrap: break-word; }
                  </style>
                </head>
                <body>
                  <h1 class="error">⚠️ Account Already Exists</h1>
                  <p>An account with your Slack ID already exists but we're unable to locate it properly.</p>
                  <div class="debug">
                    <strong>What happened:</strong><br>
                    Your Slack account (${user.email || 'unknown'}) is already registered in our system,
                    but there's a mismatch preventing proper authentication.<br><br>
                    <strong>Slack ID:</strong> ${slackUserId}<br>
                    <strong>Organization:</strong> ${organization.name}
                  </div>
                  <p>Please contact your administrator to resolve this account issue.</p>
                  <button onclick="window.location.href='/'">Back to Home</button>
                </body>
              </html>
            `);
          } else {
            // For other errors, show the debug info
            console.error("🔴 Error stack:", error instanceof Error ? error.stack : "No stack");
            console.error("🔴 Organization ID:", organization.id);
            console.error("🔴 User data attempted:", {
              email: user.email,
              name: displayName,
              slackUserId: slackUserId
            });
            throw error; // Re-throw to show error page
          }
        }
        
        // If we recovered from duplicate key error, continue with the authenticated user
        if (!authenticatedUser) {
          const errorMessage = 'Failed to create user account';
          const errorType = 'UserCreationError';
          
          return res.status(500).send(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Authentication Error</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                  body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                  .error { color: #dc3545; }
                  button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
                  .debug { font-size: 0.9em; color: #666; margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px; text-align: left; max-width: 600px; margin: 20px auto; word-wrap: break-word; }
                </style>
              </head>
              <body>
                <h1 class="error">❌ Account Creation Failed</h1>
                <p>Failed to create your user account.</p>
                <div class="debug">
                  <strong>Debug Info:</strong><br>
                  Error Type: ${errorType}<br>
                  Error: ${errorMessage}<br>
                  Email: ${user.email || 'unknown'}<br>
                  Organization: ${organization.name || 'unknown'}
                </div>
                <button onclick="window.location.href='/'">Try Again</button>
              </body>
            </html>
          `);
        }
      }
      
      if (!authenticatedUser) {
        return res.status(500).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Error</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #dc3545; }
                button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ Authentication Failed</h1>
              <p>Failed to authenticate your account. Please try again.</p>
              <button onclick="window.location.href='/'">Try Again</button>
            </body>
          </html>
        `);
      }
      
      // Establish authentication session
      try {
        // CRITICAL FIX: Use setSessionUser to properly set ALL required session data
        // This ensures userId, organizationId, and organizationSlug are all set correctly
        // The organization context comes from userOrganization which tracks the user's actual org
        // IMPORTANT: Get the actual organization ID from multiple sources
        // Priority: session authOrgId > userOrganization > organization from state
        // authOrgId is set when initiating the OAuth from the integrations page
        const sessionOrgId = (req.session as any).authOrgId;
        const actualOrganizationId = sessionOrgId || userOrganization?.id || organization.id;
        const actualOrganizationSlug = userOrganization?.slug || organization.slug;
        
        if (sessionOrgId) {
          console.log(`📍 Using organization ID from session authOrgId: ${sessionOrgId}`);
        }
        
        console.log(`🔐 DETERMINING CORRECT ORGANIZATION FOR SESSION AND UPDATE`);
        console.log(`   Authenticated User Org ID: ${authenticatedUser.organizationId}`);
        console.log(`   UserOrganization ID: ${userOrganization?.id}`);
        console.log(`   OAuth State Organization ID: ${organization.id}`);
        console.log(`   Final Actual Org ID to use: ${actualOrganizationId}`);
        console.log(`   Final Actual Org Slug: ${actualOrganizationSlug}`);
        
        try {
          await setSessionUser(req, authenticatedUser.id, actualOrganizationId, actualOrganizationSlug);
          console.log(`✅ setSessionUser() completed successfully for Slack OAuth`);
          console.log(`📋 Session ID after setSessionUser: ${req.sessionID}`);
          
          // Verify session data was actually saved
          console.log(`🔍 Verifying Slack OAuth session data after save:`, {
            sessionId: req.sessionID,
            userId: req.session?.userId,
            organizationId: (req.session as any)?.organizationId,
            organizationSlug: (req.session as any)?.organizationSlug
          });
          
          console.log(`✅ User ${authenticatedUser.name} (${authenticatedUser.email}) authenticated via Slack OAuth for organization ${organization.name}`);
          
          // CRITICAL FIX: Update the CORRECT organization's Slack connection status
          // Use actualOrganizationId (which tracks the user's actual org) instead of organization.id
          try {
            const workspaceId = team?.id || user["https://slack.com/team_id"];
            const workspaceName = team?.name || 'Unknown Workspace';
            
            console.log(`🔌 UPDATING ORGANIZATION SLACK CONNECTION STATUS`);
            console.log(`   User: ${authenticatedUser.email} (ID: ${authenticatedUser.id})`);
            console.log(`   User's Organization ID: ${authenticatedUser.organizationId}`);
            console.log(`   UserOrganization Object: ${userOrganization?.id} (${userOrganization?.name})`);
            console.log(`   Original OAuth Organization: ${organization.id} (${organization.name})`);
            console.log(`   Actual Organization to update: ${actualOrganizationId} (${actualOrganizationSlug})`);
            console.log(`   Slack Workspace ID: ${workspaceId}`);
            console.log(`   Slack Workspace Name: ${workspaceName}`);
            console.log(`   Timestamp: ${new Date().toISOString()}`);
            
            // CRITICAL: Update the actual organization the user belongs to
            // Ensure we await the update properly before proceeding
            
            // Calculate token expiration (OIDC tokens typically expire in 12 hours)
            // Note: OIDC doesn't provide expires_in, so we default to 12 hours for Slack
            const expiresIn = tokenResponse.expires_in || 43200; // Default to 12 hours
            const tokenExpiresAt = new Date();
            tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + expiresIn);
            
            console.log(`🔐 Storing OAuth tokens for organization ${actualOrganizationId}`);
            console.log(`   Access token: ${tokenResponse.access_token ? '✅ Present' : '❌ Missing'}`);
            console.log(`   Refresh token: ${tokenResponse.refresh_token ? '✅ Present' : '❌ Missing (OIDC flow may not provide refresh tokens)'}`);
            console.log(`   Token expires at: ${tokenExpiresAt.toISOString()}`);
            
            const updateResult = await storage.updateOrganization(actualOrganizationId, {
              slackConnectionStatus: 'connected',
              slackLastConnected: new Date(),
              slackWorkspaceId: workspaceId,
              enableSlackIntegration: true,
              // Store OAuth tokens for API access and refresh
              slackAccessToken: tokenResponse.access_token || null,
              slackRefreshToken: tokenResponse.refresh_token || null, // May not be provided in OIDC flow
              slackTokenExpiresAt: tokenResponse.access_token ? tokenExpiresAt : null
            });
            
            if (updateResult) {
              console.log(`✅ ORGANIZATION SLACK INTEGRATION SUCCESSFULLY UPDATED`);
              console.log(`   Updated org ID: ${updateResult.id}`);
              console.log(`   Updated org Name: ${updateResult.name}`);
              console.log(`   Slack Connection Status: ${updateResult.slackConnectionStatus}`);
              console.log(`   Slack Workspace ID: ${updateResult.slackWorkspaceId}`);
              console.log(`   Slack Integration Enabled: ${updateResult.enableSlackIntegration}`);
              console.log(`   Last Connected: ${updateResult.slackLastConnected}`);
              
              // Verify the update actually persisted
              const verifyUpdate = await storage.getOrganization(actualOrganizationId);
              if (verifyUpdate?.slackWorkspaceId !== workspaceId) {
                console.error(`❌ CRITICAL: Slack workspace ID not persisted! Expected: ${workspaceId}, Got: ${verifyUpdate?.slackWorkspaceId}`);
              } else {
                console.log(`✅ VERIFIED: Slack workspace ID ${workspaceId} successfully persisted to organization ${actualOrganizationId}`);
              }
              
              if (verifyUpdate) {
                console.log(`🔍 VERIFICATION: Organization re-fetched from database`);
                console.log(`   Verified Status: ${verifyUpdate.slackConnectionStatus}`);
                console.log(`   Verified Workspace ID: ${verifyUpdate.slackWorkspaceId}`);
                
                if (verifyUpdate.slackConnectionStatus !== 'connected') {
                  console.error(`❌ WARNING: Database verification shows status is still: ${verifyUpdate.slackConnectionStatus}`);
                } else {
                  console.log(`✅ Database verification confirmed: Status is 'connected'`);
                }
              }
            } else {
              console.error(`❌ CRITICAL: Failed to update organization - no result returned`);
              console.error(`   Attempted to update org ID: ${actualOrganizationId}`);
            }
          } catch (updateError) {
            console.error('❌ CRITICAL: Failed to update organization Slack status:', updateError);
            console.error('   Organization ID attempted:', actualOrganizationId);
            console.error('   Error type:', updateError?.constructor?.name);
            console.error('   Error message:', updateError instanceof Error ? updateError.message : String(updateError));
            console.error('   Error stack:', updateError instanceof Error ? updateError.stack : 'No stack trace');
            // Continue even if update fails - user is authenticated
          }
          
          // Redirect to the organization's dashboard
          // Use the centralized redirect URI resolver to get the base URL
          const baseRedirectUri = resolveRedirectUri(req, '/');
          // Remove the trailing slash to get the base URL
          const appUrl = baseRedirectUri.endsWith('/') ? baseRedirectUri.slice(0, -1) : baseRedirectUri;
          
          // DISABLED: Old onboarding check - users now go directly to dashboard after signup
          // const needsOnboarding = isNewOrganization || 
          //   !organization.onboardingStatus || 
          //   organization.onboardingStatus === 'not_started' || 
          //   organization.onboardingStatus === 'in_progress';
          
          // For super admin users, redirect to organization selection
          // All other users go directly to dashboard (onboarding is now handled in signup flow)
          const actualOrgSlug = organization.slug || organizationSlug;
          
          // Redirect directly to the appropriate page with auth params
          // The page will handle setting up localStorage authentication
          const authParams = new URLSearchParams({
            auth_user_id: authenticatedUser.id,
            auth_org_id: organization.id,
            auth_session: req.sessionID  // Use the actual session ID instead of undefined sessionToken
          });
          
          let redirectPath: string;
          if (isSuperAdmin) {
            // Super admins go to organization selection
            redirectPath = `${appUrl}/select-organization?${authParams.toString()}`;
          } else {
            // All users now go directly to dashboard (onboarding handled in signup)
            authParams.append('org', actualOrgSlug);
            redirectPath = `${appUrl}/dashboard?${authParams.toString()}`;
          }
          
          console.log(`🚀 Redirecting after OAuth authentication`);
          console.log(`   User: ${authenticatedUser.email}`);
          console.log(`   Organization: ${actualOrgSlug} (new: ${isNewOrganization})`);
          console.log(`   Redirect: ${redirectPath.replace(/auth_session=[^&]+/, 'auth_session=[REDACTED]')}`);
          
          res.redirect(redirectPath);
        } catch (sessionError) {
          console.error('❌ Failed to save Slack OAuth session:', sessionError);
          return res.status(500).send(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Session Error</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                  body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                  .error { color: #dc3545; }
                  button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
                </style>
              </head>
              <body>
                <h1 class="error">❌ Session Save Failed</h1>
                <p>Failed to save your authentication session. Please try again.</p>
                <button onclick="window.location.href='/'">Try Again</button>
              </body>
            </html>
          `);
        }
      } catch (error) {
        console.error("Failed to establish session:", error);
        res.status(500).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Error</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #dc3545; }
                button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ Authentication Failed</h1>
              <p>An error occurred during authentication. Please try again.</p>
              <button onclick="window.location.href='/'">Try Again</button>
            </body>
          </html>
        `);
      }
    } catch (error) {
      console.error("🔴 CRITICAL OAuth callback error:", error);
      console.error("🔴 Error type:", error?.constructor?.name);
      console.error("🔴 Error message:", error instanceof Error ? error.message : String(error));
      console.error("🔴 Error stack:", error instanceof Error ? error.stack : "No stack trace");
      console.error("🔴 Request headers:", req.headers);
      console.error("🔴 Session ID:", req.sessionID);
      console.error("🔴 Session data:", req.session);
      
      // Provide detailed error information for debugging
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = error?.constructor?.name || 'UnknownError';
      const isProduction = process.env.NODE_ENV === 'production';
      
      // TEMPORARILY enable debug info in production to diagnose the issue
      const showDebug = true; // Always show debug info until we fix this
      
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Error</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
              .error { color: #dc3545; }
              button { padding: 10px 20px; font-size: 16px; margin-top: 20px; cursor: pointer; }
              .debug { font-size: 0.9em; color: #666; margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px; text-align: left; max-width: 600px; margin: 20px auto; word-wrap: break-word; }
            </style>
          </head>
          <body>
            <h1 class="error">❌ Authentication Failed</h1>
            <p>An unexpected error occurred. Please try logging in again.</p>
            ${showDebug ? `
              <div class="debug">
                <strong>Debug Info:</strong><br>
                Error Type: ${errorType}<br>
                Error Message: ${errorMessage}<br>
                Session ID: ${req.sessionID || 'No session'}<br>
                Environment: ${process.env.NODE_ENV || 'unknown'}
              </div>
            ` : ''}
            <button onclick="window.location.href='/'">Try Again</button>
          </body>
        </html>
      `);
    }
  });
  
  // Register Microsoft integration routes
  // Note: Authentication middleware is already applied in server/index.ts
  registerMicrosoftAuthRoutes(app);
  registerMicrosoftTeamsRoutes(app);
  registerMicrosoftCalendarRoutes(app);
  
  // Register authentication diagnostic routes
  // Diagnostic routes disabled - cleanup of temporary debugging endpoints
  // registerAuthDiagnosticRoutes(app);
  
  // Register organization switching and auth routes
  registerAuthRoutes(app);
  
  // ONBOARDING ROUTES - These must come BEFORE requireOrganization() middleware
  // to allow access during the initial onboarding flow after OAuth signup
  
  // Get organization by slug - used during onboarding after Slack OAuth
  // This MUST be accessible during onboarding to fetch org data for form population
  app.get("/api/organizations/by-slug/:slug", authenticateUser(), async (req, res) => {
    try {
      const slug = req.params.slug;
      
      // Find organization by slug
      const allOrgs = await storage.getAllOrganizations();
      const organization = allOrgs.find(org => org.slug === slug);
      
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Allow access if user belongs to this organization OR if it's a new user
      // during onboarding (who doesn't have an organizationId yet)
      const isUserOrg = req.currentUser?.organizationId === organization.id;
      const isNewUserOnboarding = !req.currentUser?.organizationId && req.currentUser?.id;
      
      if (!isUserOrg && !isNewUserOnboarding) {
        return res.status(403).json({ message: "You can only access your own organization" });
      }
      
      res.json(organization);
    } catch (error) {
      console.error("GET /api/organizations/by-slug/:slug - Error:", error);
      res.status(500).json({ message: "Failed to fetch organization by slug" });
    }
  });
  
  // Test Session Endpoint - Simple test to verify sessions work
  app.post("/api/auth/test-session", async (req, res) => {
    const { action, data } = req.body;
    
    if (action === 'set') {
      // Test setting session data
      req.session.testData = data || 'test-value-' + Date.now();
      req.session.testTime = new Date().toISOString();
      
      // Force save the session
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Failed to save session' });
        }
        
        res.json({
          message: 'Session data set',
          sessionId: req.sessionID,
          data: req.session.testData,
          time: req.session.testTime
        });
      });
    } else if (action === 'get') {
      // Test retrieving session data
      res.json({
        message: 'Session data retrieved',
        sessionId: req.sessionID,
        data: req.session.testData || null,
        time: req.session.testTime || null,
        userId: req.session.userId || null,
        organizationId: req.session.organizationId || null
      });
    } else {
      res.status(400).json({ error: 'Invalid action. Use "set" or "get"' });
    }
  });
  
  // Cookie Diagnostic Endpoint - CRITICAL for debugging production issues
  app.get("/api/auth/cookie-diagnostic", async (req, res) => {
    const protocol = req.protocol;
    const forwardedProto = req.get('x-forwarded-proto');
    const host = req.get('host');
    const origin = req.get('origin');
    const referer = req.get('referer');
    const cookie = req.get('cookie');
    
    // Test setting a simple cookie to see if browser accepts it
    const testCookieName = 'test_cookie';
    const testCookieValue = `test_${Date.now()}`;
    
    // Set test cookie with same config as session cookie
    const isProduction = forwardedProto === 'https' || 
                        (host && (host.includes('.replit.app') || host.includes('whirkplace.com')));
    
    res.cookie(testCookieName, testCookieValue, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 60000, // 1 minute
      path: '/'
    });
    
    const diagnostic = {
      timestamp: new Date().toISOString(),
      request: {
        protocol,
        forwardedProto,
        host,
        origin,
        referer,
        url: req.url,
        method: req.method,
        secure: req.secure,
        hostname: req.hostname,
        baseUrl: req.baseUrl,
        originalUrl: req.originalUrl
      },
      cookies: {
        raw: cookie || 'NO COOKIES SENT',
        parsed: req.cookies || {},
        sessionId: req.sessionID || 'NO SESSION ID',
        hasSessionCookie: !!req.cookies['connect.sid'],
        testCookieSet: {
          name: testCookieName,
          value: testCookieValue,
          config: {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax',
            maxAge: 60000,
            path: '/'
          }
        }
      },
      session: {
        exists: !!req.session,
        userId: req.session?.userId || 'NO USER ID',
        organizationId: req.session?.organizationId || 'NO ORG ID',
        cookieConfig: req.session?.cookie || {}
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        isProduction,
        isReplit: !!process.env.REPL_SLUG,
        replitDomain: process.env.REPLIT_DEV_DOMAIN || 'NOT SET'
      },
      diagnosticSummary: {
        browserSendingCookies: !!cookie,
        sessionCookiePresent: !!req.cookies['connect.sid'],
        sessionDataPresent: !!req.session?.userId,
        expectedCookieConfig: isProduction ? 'PRODUCTION (secure:true, sameSite:none)' : 'DEVELOPMENT (secure:false, sameSite:lax)',
        likelyIssue: !cookie ? 'Browser not sending any cookies' : 
                     !req.cookies['connect.sid'] ? 'Session cookie not in request' :
                     !req.session?.userId ? 'Session exists but no user data' : 
                     'Session appears to be working'
      }
    };
    
    res.json(diagnostic);
  });
  
  // Session Debug Endpoint (for diagnosing auth issues)
  app.get("/api/auth/session-debug", async (req, res) => {
    try {
      const sessionData = {
        hasSession: !!req.session,
        sessionId: req.sessionID || null,
        session: req.session ? {
          userId: req.session.userId || null,
          organizationId: req.session.organizationId || null,
          organizationSlug: req.session.organizationSlug || null,
          isSuperAdmin: req.session.is_super_admin || false,
          loginTime: req.session.loginTime || null,
          cookie: {
            expires: req.session.cookie?.expires || null,
            maxAge: req.session.cookie?.maxAge || null,
            originalMaxAge: req.session.cookie?.originalMaxAge || null,
            httpOnly: req.session.cookie?.httpOnly || null,
            secure: req.session.cookie?.secure || null,
            sameSite: req.session.cookie?.sameSite || null,
            domain: req.session.cookie?.domain || null,
            path: req.session.cookie?.path || null,
          }
        } : null,
        headers: {
          cookie: req.headers.cookie ? '[PRESENT]' : '[MISSING]',
          host: req.headers.host,
          origin: req.headers.origin,
          referer: req.headers.referer,
          userAgent: req.headers['user-agent'],
        },
        request: {
          protocol: req.protocol,
          secure: req.secure,
          hostname: req.hostname,
          url: req.url,
        },
        user: null as any,
        environment: {
          nodeEnv: process.env.NODE_ENV,
          isProduction: process.env.NODE_ENV === 'production',
          hasBackdoorKey: !!process.env.BACKDOOR_KEY,
          port: process.env.PORT,
          isReplit: !!process.env.REPL_SLUG,
        }
      };

      // Try to get user info if we have a session
      if (req.session?.userId && req.session?.organizationId) {
        try {
          const user = await storage.getUser(req.session.organizationId, req.session.userId);
          if (user) {
            sessionData.user = {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              isSuperAdmin: user.isSuperAdmin || false,
              organizationId: user.organizationId,
            };
          }
        } catch (userError) {
          console.error("Failed to fetch user for session debug:", userError);
        }
      }

      console.log("🔍 Session debug info:", JSON.stringify(sessionData, null, 2));
      res.json(sessionData);
    } catch (error) {
      console.error("Session debug error:", error);
      res.status(500).json({ 
        message: "Failed to get session debug info",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Cookie Test Endpoint - Test cookie setting and reading
  app.get("/api/auth/test-cookies", async (req, res) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const isReplit = !!process.env.REPL_SLUG;
    const isDevelopment = process.env.NODE_ENV === 'development';
    const port = process.env.PORT || '5000';
    
    // Use same detection logic as session config
    const isLocalhost = 
      process.env.TESTING_LOCALHOST === 'true' || 
      isDevelopment || 
      port === '5000' || 
      (!isProduction);
    
    const useSecureCookies = !isLocalhost && (isReplit && isProduction);
    const sameSite = useSecureCookies ? 'none' as const : 'lax' as const;
    
    // Log incoming request details
    console.log('🍪 Cookie Test Request:', {
      headers: {
        cookie: req.headers.cookie ? '[PRESENT]' : '[MISSING]',
        host: req.headers.host,
        origin: req.headers.origin,
      },
      protocol: req.protocol,
      secure: req.secure,
      hostname: req.hostname,
    });
    
    // Set a test cookie with same config as session
    const testCookieName = 'whirkplace-test-cookie';
    const testValue = `test-${Date.now()}`;
    
    res.cookie(testCookieName, testValue, {
      httpOnly: true,
      secure: useSecureCookies,
      sameSite: sameSite,
      maxAge: 60 * 1000, // 1 minute
      path: '/',
    });
    
    // Also try setting a non-httpOnly cookie for browser visibility
    res.cookie('whirkplace-visible-test', testValue, {
      httpOnly: false, // Visible in browser
      secure: useSecureCookies,
      sameSite: sameSite,
      maxAge: 60 * 1000,
      path: '/',
    });
    
    res.json({
      message: 'Test cookies set',
      cookiesSet: [
        {
          name: testCookieName,
          value: testValue,
          httpOnly: true,
          secure: useSecureCookies,
          sameSite: sameSite,
        },
        {
          name: 'whirkplace-visible-test',
          value: testValue,
          httpOnly: false,
          secure: useSecureCookies,
          sameSite: sameSite,
        }
      ],
      receivedCookies: req.headers.cookie || 'none',
      sessionCookie: req.cookies?.['connect.sid'] ? '[PRESENT]' : '[MISSING]',
      testCookie: req.cookies?.[testCookieName] ? '[PRESENT]' : '[MISSING]',
      environment: {
        isProduction,
        isDevelopment,
        isReplit,
        isLocalhost,
        useSecureCookies,
        sameSite,
        port,
      },
      request: {
        protocol: req.protocol,
        secure: req.secure,
        hostname: req.hostname,
        host: req.headers.host,
        origin: req.headers.origin,
      }
    });
  });
  
  // NEW: Slack OAuth Status Verification Endpoint
  app.get("/api/auth/slack-oauth-status", async (req, res) => {
    try {
      console.log("🔍 Slack OAuth status check requested");
      
      // Get session information
      const sessionInfo = {
        hasSession: !!req.session,
        sessionId: req.sessionID,
        userId: req.session?.userId,
        organizationId: (req.session as any)?.organizationId,
        organizationSlug: (req.session as any)?.organizationSlug,
      };
      
      console.log("📋 Session info:", sessionInfo);
      
      // If we have organization ID, fetch the organization to check Slack status
      let organizationStatus = null;
      if (sessionInfo.organizationId) {
        try {
          const org = await storage.getOrganization(sessionInfo.organizationId);
          if (org) {
            organizationStatus = {
              id: org.id,
              name: org.name,
              slug: org.slug,
              slackConnectionStatus: org.slackConnectionStatus,
              slackWorkspaceId: org.slackWorkspaceId,
              slackLastConnected: org.slackLastConnected,
              enableSlackIntegration: org.enableSlackIntegration,
            };
            console.log("✅ Organization found:", organizationStatus);
          } else {
            console.log("❌ Organization not found for ID:", sessionInfo.organizationId);
          }
        } catch (orgError) {
          console.error("Error fetching organization:", orgError);
        }
      }
      
      // If we have user ID, fetch the user to check Slack fields
      let userSlackStatus = null;
      if (sessionInfo.userId && sessionInfo.organizationId) {
        try {
          const user = await storage.getUser(sessionInfo.organizationId, sessionInfo.userId);
          if (user) {
            userSlackStatus = {
              id: user.id,
              email: user.email,
              slackUserId: user.slackUserId,
              slackWorkspaceId: user.slackWorkspaceId,
              authProvider: user.authProvider,
            };
            console.log("✅ User found:", userSlackStatus);
          } else {
            console.log("❌ User not found");
          }
        } catch (userError) {
          console.error("Error fetching user:", userError);
        }
      }
      
      res.json({
        timestamp: new Date().toISOString(),
        session: sessionInfo,
        organization: organizationStatus,
        user: userSlackStatus,
        diagnostics: {
          hasValidSession: !!(sessionInfo.userId && sessionInfo.organizationId),
          isSlackConnected: organizationStatus?.slackConnectionStatus === 'connected',
          hasWorkspaceId: !!organizationStatus?.slackWorkspaceId,
        }
      });
    } catch (error) {
      console.error("Error checking Slack OAuth status:", error);
      res.status(500).json({ 
        message: "Failed to check Slack OAuth status",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get authentication context - provider info and available data
  app.get("/api/auth/context", authenticateUser(), async (req, res) => {
    try {
      if (!req.currentUser) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const organization = req.orgId ? await storage.getOrganization(req.orgId) : null;
      const user = req.currentUser;
      
      // Determine the primary auth provider and available data
      let authProvider = 'email'; // default
      let capabilities = {
        canImportMembers: false,
        canImportRoles: false,
        canImportWorkspace: false,
        hasWorkspaceName: false,
        hasMembers: false,
        memberCount: 0
      };
      
      if (organization) {
        // Check for Slack integration
        if (organization.enableSlackIntegration && organization.slackWorkspaceId) {
          authProvider = 'slack';
          capabilities.canImportMembers = true;
          capabilities.canImportRoles = true;
          capabilities.hasWorkspaceName = !!organization.name;
        }
        
        // Check for Microsoft integration
        if (organization.enableMicrosoftAuth) {
          authProvider = 'microsoft';
          capabilities.canImportMembers = true;
          capabilities.canImportRoles = true;
          capabilities.canImportWorkspace = true;
          capabilities.hasWorkspaceName = !!organization.name;
        }
        
        // Check existing data
        const users = await storage.getUsersByOrganization(req.orgId);
        capabilities.hasMembers = users.length > 1; // More than just the admin
        capabilities.memberCount = users.length;
      }
      
      res.json({
        authProvider,
        organizationId: organization?.id || null,
        organizationName: organization?.name || null,
        capabilities,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    } catch (error) {
      console.error("GET /api/auth/context - Error:", error);
      res.status(500).json({ message: "Failed to get authentication context" });
    }
  });
  
  // Get current onboarding status (accessible during onboarding)
  app.get("/api/onboarding/status", authenticateUser(), async (req, res) => {
    try {
      if (!req.currentUser) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json({
        status: organization.onboardingStatus || 'not_started',
        currentStep: organization.onboardingCurrentStep,
        completedSteps: {
          workspace: organization.onboardingWorkspaceCompleted || false,
          billing: organization.onboardingBillingCompleted || false,
          roles: organization.onboardingRolesCompleted || false,
          values: organization.onboardingValuesCompleted || false,
          members: organization.onboardingMembersCompleted || false,
          settings: organization.onboardingSettingsCompleted || false
        },
        completedAt: organization.onboardingCompletedAt
      });
    } catch (error) {
      console.error("Error getting onboarding status:", error);
      res.status(500).json({ message: "Failed to get onboarding status" });
    }
  });
  
  // Update onboarding step completion
  // Allow any authenticated user who is an admin of their organization
  app.post("/api/onboarding/complete-step", authenticateUser(), async (req, res) => {
    try {
      // Check if user has account owner or admin rights in their organization
      const currentUser = req.currentUser!;
      console.log("Onboarding step - User:", currentUser.email, "Role:", currentUser.role, "Account Owner:", currentUser.isAccountOwner, "SuperAdmin:", currentUser.isSuperAdmin, "OrgId:", req.orgId);
      
      // Allow account owners, admins, and super admins to complete onboarding
      if (!currentUser.isAccountOwner && currentUser.role !== 'admin' && !currentUser.isSuperAdmin) {
        console.error("Onboarding access denied for user:", currentUser.email, "with role:", currentUser.role, "isAccountOwner:", currentUser.isAccountOwner);
        return res.status(403).json({ 
          message: "Access denied. Only account owners, administrators, and super administrators can complete the onboarding process." 
        });
      }
      
      const { step } = req.body;
      const validSteps = ['workspace', 'billing', 'roles', 'values', 'members', 'settings'];
      
      if (!validSteps.includes(step)) {
        return res.status(400).json({ message: "Invalid step" });
      }
      
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Build update object
      const updateData: any = {
        onboardingCurrentStep: step
      };
      
      // Mark the specific step as completed
      switch(step) {
        case 'workspace':
          updateData.onboardingWorkspaceCompleted = true;
          updateData.onboardingStatus = 'in_progress';
          break;
        case 'billing':
          updateData.onboardingBillingCompleted = true;
          break;
        case 'roles':
          updateData.onboardingRolesCompleted = true;
          break;
        case 'values':
          updateData.onboardingValuesCompleted = true;
          break;
        case 'members':
          updateData.onboardingMembersCompleted = true;
          break;
        case 'settings':
          updateData.onboardingSettingsCompleted = true;
          // Check if all steps are complete
          if (organization.onboardingWorkspaceCompleted && 
              organization.onboardingBillingCompleted && 
              organization.onboardingRolesCompleted && 
              organization.onboardingValuesCompleted && 
              organization.onboardingMembersCompleted) {
            updateData.onboardingStatus = 'completed';
            updateData.onboardingCompletedAt = new Date();
          }
          break;
      }
      
      const updated = await storage.updateOrganization(req.orgId, updateData);
      if (!updated) {
        return res.status(500).json({ message: "Failed to update onboarding status" });
      }
      
      res.json({ 
        message: `Step ${step} completed`,
        status: updated.onboardingStatus,
        currentStep: updated.onboardingCurrentStep
      });
    } catch (error) {
      console.error("Error completing onboarding step:", error);
      res.status(500).json({ message: "Failed to complete onboarding step" });
    }
  });
  
  // Complete entire onboarding
  // Allow any authenticated user who is an admin of their organization
  app.post("/api/onboarding/complete", authenticateUser(), async (req, res) => {
    try {
      // Check if user has account owner or admin rights in their organization
      const currentUser = req.currentUser!;
      console.log("Onboarding complete - User:", currentUser.email, "Role:", currentUser.role, "Account Owner:", currentUser.isAccountOwner, "SuperAdmin:", currentUser.isSuperAdmin, "OrgId:", req.orgId);
      
      // Allow account owners, admins, and super admins to complete onboarding
      if (!currentUser.isAccountOwner && currentUser.role !== 'admin' && !currentUser.isSuperAdmin) {
        console.error("Onboarding complete access denied for user:", currentUser.email, "with role:", currentUser.role, "isAccountOwner:", currentUser.isAccountOwner);
        return res.status(403).json({ 
          message: "Access denied. Only account owners, administrators, and super administrators can complete the onboarding process." 
        });
      }
      
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Mark all steps as completed and set status
      const updated = await storage.updateOrganization(req.orgId, {
        onboardingStatus: 'completed',
        onboardingCompletedAt: new Date(),
        onboardingWorkspaceCompleted: true,
        onboardingBillingCompleted: true,
        onboardingRolesCompleted: true,
        onboardingValuesCompleted: true,
        onboardingMembersCompleted: true,
        onboardingSettingsCompleted: true
      });
      
      if (!updated) {
        return res.status(500).json({ message: "Failed to complete onboarding" });
      }
      
      res.json({ 
        message: "Onboarding completed successfully",
        status: 'completed',
        completedAt: updated.onboardingCompletedAt
      });
    } catch (error) {
      console.error("Error completing onboarding:", error);
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });
  
  // Create Stripe checkout session for billing step
  app.post("/api/onboarding/create-checkout", authenticateUser, requireRole("admin"), async (req, res) => {
    try {
      if (!stripe) {
        return res.status(503).json({ message: "Payment processing is not configured" });
      }
      
      const { priceId, successUrl, cancelUrl } = req.body;
      
      if (!priceId) {
        return res.status(400).json({ message: "Price ID is required" });
      }
      
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Create or get Stripe customer
      let stripeCustomerId = organization.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          name: organization.name,
          metadata: {
            organizationId: organization.id
          }
        });
        stripeCustomerId = customer.id;
        
        // Save customer ID
        await storage.updateOrganization(req.orgId, {
          stripeCustomerId
        });
      }
      
      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1
          }
        ],
        mode: 'subscription',
        success_url: successUrl || `${req.headers.origin}/onboarding?step=billing&success=true`,
        cancel_url: cancelUrl || `${req.headers.origin}/onboarding?step=billing&canceled=true`,
        metadata: {
          organizationId: organization.id
        }
      });
      
      res.json({ checkoutUrl: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });
  
  // Fetch available users from Slack/Microsoft for selective import
  app.get("/api/onboarding/available-users", authenticateUser(), async (req, res) => {
    try {
      if (!req.currentUser || !req.orgId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Determine the provider and fetch users accordingly
      let availableUsers: Array<{
        id: string;
        email: string;
        name: string;
        department: string | null;
        title: string | null;
        avatar: string | null;
      }> = [];
      let provider = 'email';
      
      if (organization.enableSlackIntegration && organization.slackWorkspaceId) {
        provider = 'slack';
        
        // Use organization's bot token or fall back to environment variable
        const botToken = organization.slackBotToken || process.env.SLACK_BOT_TOKEN;
        
        if (!botToken) {
          console.warn('No Slack bot token available for organization:', organization.id);
          return res.status(400).json({ 
            message: 'Slack integration is not properly configured. Please ensure a bot token is available.' 
          });
        }
        
        try {
          // Create Slack client with the bot token
          const slackClient = new WebClient(botToken);
          
          // Fetch users from Slack workspace
          console.log('Fetching users from Slack workspace:', organization.slackWorkspaceId);
          const result = await slackClient.users.list({
            limit: 200 // Fetch up to 200 users at a time
          });
          
          if (!result.ok) {
            throw new Error('Failed to fetch users from Slack');
          }
          
          // Process and format Slack users
          availableUsers = (result.members || [])
            .filter(member => {
              // Filter out bots, deleted users, and Slackbot
              return !member.is_bot && 
                     !member.deleted && 
                     member.id !== 'USLACKBOT' &&
                     member.profile?.email; // Only include users with email addresses
            })
            .map(member => {
              // Extract profile information
              const profile = member.profile || {};
              
              return {
                id: member.id || '',
                email: profile.email || '',
                name: profile.real_name || profile.display_name || member.name || '',
                // Access custom fields safely - they may be in different formats
                department: (profile.fields as any)?.Department?.value || profile.team || null,
                title: profile.title || profile.status_text || null,
                avatar: profile.image_192 || profile.image_72 || profile.image_48 || null
              };
            })
            .filter(user => user.email); // Final filter to ensure we have email addresses
          
          console.log(`Successfully fetched ${availableUsers.length} users from Slack`);
          
        } catch (error) {
          console.error('Error fetching users from Slack:', error);
          
          // Provide specific error messages based on the error type
          let errorMessage = 'Failed to fetch users from Slack';
          if (error instanceof Error) {
            if (error.message.includes('invalid_auth')) {
              errorMessage = 'Invalid Slack authentication token. Please reconfigure Slack integration.';
            } else if (error.message.includes('account_inactive')) {
              errorMessage = 'Slack account is inactive. Please check your Slack workspace status.';
            } else if (error.message.includes('rate_limited')) {
              errorMessage = 'Slack API rate limit exceeded. Please try again later.';
            } else {
              errorMessage = `Slack API error: ${error.message}`;
            }
          }
          
          return res.status(500).json({ message: errorMessage });
        }
      } else if (organization.enableMicrosoftAuth) {
        provider = 'microsoft';
        // In production, this would fetch from Microsoft Graph API
        availableUsers = [
          { id: 'ms_user_1', email: 'sarah.connor@company.com', name: 'Sarah Connor', department: 'Engineering', title: 'Engineering Manager', avatar: null },
          { id: 'ms_user_2', email: 'james.bond@company.com', name: 'James Bond', department: 'Security', title: 'Security Lead', avatar: null },
          { id: 'ms_user_3', email: 'mary.poppins@company.com', name: 'Mary Poppins', department: 'HR', title: 'HR Director', avatar: null },
        ];
      }
      
      // Get existing users to mark them as already imported
      const existingUsers = await storage.getUsersByOrganization(req.orgId);
      const existingEmails = new Set(existingUsers.map(u => u.email.toLowerCase()));
      
      // Mark users as already imported if they exist
      const usersWithStatus = availableUsers.map(user => ({
        ...user,
        alreadyImported: existingEmails.has(user.email.toLowerCase())
      }));
      
      res.json({
        provider,
        users: usersWithStatus,
        totalCount: usersWithStatus.length,
        importedCount: usersWithStatus.filter(u => u.alreadyImported).length
      });
    } catch (error) {
      console.error("Error fetching available users:", error);
      res.status(500).json({ message: "Failed to fetch available users" });
    }
  });
  
  // Import selected members from Slack/Microsoft workspace
  app.post("/api/onboarding/import-selected-users", authenticateUser(), async (req, res) => {
    try {
      if (!req.currentUser || !req.orgId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const { userIds } = req.body;
      
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ message: "Please select at least one user to import" });
      }
      
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // In production, this would:
      // 1. Fetch full user details from Slack/Microsoft for selected userIds
      // 2. Create user accounts in the database
      // 3. Send invitation emails
      // For now, we'll simulate the import with a success response
      
      const importedCount = userIds.length;
      
      res.json({
        success: true,
        importedCount,
        message: `Successfully imported ${importedCount} team member${importedCount === 1 ? '' : 's'}`
      });
    } catch (error) {
      console.error("Error importing selected users:", error);
      res.status(500).json({ message: "Failed to import selected users" });
    }
  });
  
  // PUBLIC BUSINESS SIGNUP ROUTES (no authentication required)
  // These must come BEFORE requireOrganization() middleware
  // Get available business plans
  app.get("/api/business/plans", async (req, res) => {
    try {
      // Return static plan data for now - could be from database later
      const plans = [
        {
          id: "standard",
          name: "standard",
          displayName: "Standard",
          description: "Perfect for small teams getting started",
          monthlyPrice: 500,  // $5/month per user
          annualPrice: 4800,  // $48/year per user ($4/month, 20% off)
          maxUsers: -1,  // Unlimited users
          features: [
            "Weekly Check-ins",
            "Win Recognition",
            "Team Management",
            "Basic Analytics",
            "Slack Integration",
            "Microsoft Teams Integration"
          ],
          hasSlackIntegration: true,
          hasMicrosoftIntegration: true,
          hasAdvancedAnalytics: false,
          hasApiAccess: false,
        },
        {
          id: "professional",
          name: "professional",
          displayName: "Professional",
          description: "Advanced features for growing teams",
          monthlyPrice: 800,  // $8/month per user
          annualPrice: 7200,  // $72/year per user ($6/month, 25% off)
          maxUsers: -1,  // Unlimited users
          features: [
            "Everything in Standard",
            "KRA Management (Key Result Areas)",
            "One-on-One Meeting Management",
            "Advanced Analytics",
            "Priority Support"
          ],
          hasSlackIntegration: true,
          hasMicrosoftIntegration: true,
          hasAdvancedAnalytics: true,
          hasApiAccess: false,
        },
        {
          id: "partner",
          name: "partner",
          displayName: "Partner Program",
          description: "Resell Whirkplace and maximize your margins",
          monthlyPrice: 0, // Contact for tiered wholesale pricing
          annualPrice: 0, // Contact for tiered wholesale pricing
          maxUsers: -1, // Unlimited
          features: [
            "More customers = lower cost per seat",
            "50-70% profit margins",
            "First 50 seats free to start",
            "Partner dashboard & management tools",
            "White-label options available",
            "Dedicated partner success manager",
            "Sales & marketing support"
          ],
          hasSlackIntegration: true,
          hasMicrosoftIntegration: true,
          hasAdvancedAnalytics: true,
          hasApiAccess: true,
        }
      ];
      
      res.json(plans);
    } catch (error: any) {
      console.error("Error fetching business plans:", error);
      res.status(500).json({ message: "Failed to fetch business plans" });
    }
  });

  // Create business signup - Step 1: Business registration
  app.post("/api/business/signup", async (req, res) => {
    try {
      const signupSchema = z.object({
        organizationName: z.string().min(2).max(100),
        industry: z.string(),
        organizationSize: z.string(),
        firstName: z.string().min(2).max(50),
        lastName: z.string().min(2).max(50),
        email: z.string().email(),
        password: z.string().min(8).max(128),
        acceptTerms: z.boolean().refine(val => val === true),
        subscribeNewsletter: z.boolean().optional(),
      });

      const data = signupSchema.parse(req.body);

      // Create organization with unique slug handling
      let baseSlug = data.organizationName.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      // Check if slug exists and add suffix if needed
      let orgSlug = baseSlug;
      let counter = 0;
      while (true) {
        try {
          const existing = await storage.getOrganizationBySlug(orgSlug);
          if (!existing) {
            break;
          }
          counter++;
          orgSlug = `${baseSlug}-${counter}`;
        } catch (error) {
          // If error getting org, assume it doesn't exist
          break;
        }
      }

      console.log("Creating organization with slug:", orgSlug);
      
      // Set default billing price based on plan (can be changed to professional later)
      const billingPricePerUser = 2000; // $20/user/month in cents (standard plan default)
      
      const organization = await storage.createOrganization({
        name: data.organizationName,
        slug: orgSlug,
        industry: data.industry, // Store the industry
        plan: "standard", // Default plan
        customValues: ["Innovation", "Teamwork", "Excellence"], // Default company values
        enableSlackIntegration: false,
        enableMicrosoftAuth: false,
        billingPricePerUser: billingPricePerUser,
        billingUserCount: 1, // Start with 1 user (the admin being created)
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now for trial/standard
      });
      console.log("Organization created:", organization.id);

      // Hash password before creating user
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(data.password, saltRounds);
      
      // Create admin user as ACCOUNT OWNER - organizationId is passed as first parameter
      console.log("Creating account owner/admin user for organization:", organization.id);
      const adminUser = await storage.createUser(organization.id, {
        username: data.email.split('@')[0],
        password: hashedPassword, // Store hashed password
        name: `${data.firstName} ${data.lastName}`,
        email: data.email,
        organizationId: organization.id,
        role: "admin", // Account owner has admin role
        isAccountOwner: true, // Mark as account owner (legal organization owner)
        isActive: true,
        authProvider: "local",
      });
      console.log("Account owner/admin user created:", adminUser.id, "with account owner status");

      // Create initial onboarding record
      const onboardingId = randomBytes(16).toString('hex');
      
      // CRITICAL FIX: Use setSessionUser to properly set and save session
      console.log(`🔐 Setting session for new business admin: ${adminUser.email}`);
      console.log(`📝 Organization: ID=${organization.id}, Slug=${orgSlug}`);
      
      try {
        await setSessionUser(req, adminUser.id, organization.id, orgSlug);
        console.log(`✅ setSessionUser() completed successfully for business signup`);
        console.log(`📋 Session ID after setSessionUser: ${req.sessionID}`);
        
        // Verify session data was actually saved
        console.log(`🔍 Verifying business signup session data after save:`, {
          sessionId: req.sessionID,
          userId: req.session?.userId,
          organizationId: req.session?.organizationId,
          organizationSlug: req.session?.organizationSlug
        });
      } catch (sessionError) {
        console.error('❌ Failed to set session for business signup:', sessionError);
        // Clean up created user and organization on session failure
        if (adminUser.id) {
          await storage.deleteUser(organization.id, adminUser.id).catch(e => console.error('Failed to clean up user:', e));
        }
        if (organization.id) {
          await storage.deleteOrganization(organization.id).catch(e => console.error('Failed to clean up organization:', e));
        }
        return res.status(500).json({ message: 'Session creation failed' });
      }
      
      // SECURITY: Session-based authentication only - no auth cookies
      
      res.status(201).json({
        message: "Business account created successfully",
        organizationId: organization.id,
        organizationSlug: orgSlug,
        userId: adminUser.id,
        userRole: adminUser.role,
        onboardingId,
      });
    } catch (error: any) {
      console.error("Business signup error - Full error:", error);
      console.error("Error stack:", error.stack);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid signup data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ 
        message: "Failed to create business account",
        error: error.message 
      });
    }
  });

  // Partner Application Submission - Public endpoint (no authentication required)
  app.post("/api/partners/applications", async (req, res) => {
    try {
      const data = insertPartnerApplicationSchema.parse(req.body);

      const application = await storage.createPartnerApplication(data);

      res.status(201).json({
        message: "Partner application submitted successfully",
        applicationId: application.id,
      });
    } catch (error: any) {
      console.error("Partner application submission error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid application data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to submit partner application" });
    }
  });

  // Select business plan - Step 2: Plan selection
  app.post("/api/business/select-plan", async (req, res) => {
    try {
      const planSchema = z.object({
        organizationId: z.string(),
        planId: z.string(),
        billingCycle: z.enum(["monthly", "annual"]),
        discountCode: z.string().optional(),
      });

      const data = planSchema.parse(req.body);

      // Set billing price per user based on selected plan
      let billingPricePerUser = 0; // Standard plan is free
      if (data.planId === "professional") {
        billingPricePerUser = data.billingCycle === "monthly" ? 2000 : 1667; // $20/month or $200/year ($16.67/month)
      } else if (data.planId === "enterprise") {
        billingPricePerUser = data.billingCycle === "monthly" ? 5000 : 4167; // $50/month or $500/year ($41.67/month)
      }
      
      // Update organization with billing price
      await storage.updateOrganization(data.organizationId, {
        billingPricePerUser: billingPricePerUser,
      });
      
      // If not standard plan, handle payment processing
      if (data.planId !== "standard" && stripe) {
        // Create Stripe customer and setup subscription
        const organization = await storage.getOrganization(data.organizationId);
        if (!organization) {
          return res.status(404).json({ message: "Organization not found" });
        }

        // Create or retrieve Stripe customer
        let customer;
        if (organization.stripeCustomerId) {
          customer = await stripe.customers.retrieve(organization.stripeCustomerId);
        } else {
          customer = await stripe.customers.create({
            name: organization.name,
            email: organization.email,
            metadata: {
              organizationId: data.organizationId,
              plan: data.planId,
              billingCycle: data.billingCycle,
            },
          });
          
          // Store the Stripe customer ID
          await storage.updateOrganization(data.organizationId, {
            stripeCustomerId: customer.id,
          });
        }

        // Get price based on plan and billing cycle
        const plans: Record<string, Record<string, number>> = {
          professional: {
            monthly: 1000,  // $10/month
            annual: 9600,   // $96/year ($8/month with 20% off)
          },
          enterprise: {
            monthly: 2500,  // $25/month
            annual: 24000,  // $240/year ($20/month with 20% off)
          }
        };

        let price = plans[data.planId]?.[data.billingCycle];
        if (!price) {
          return res.status(400).json({ message: "Invalid plan or billing cycle" });
        }

        // Validate and apply discount code if provided
        let discountAmount = 0;
        let discountPercentage = 0;
        let validatedDiscountCode = null;
        
        if (data.discountCode) {
          const validation = await storage.validateDiscountCode(
            data.discountCode.toUpperCase(), 
            data.planId, 
            price
          );
          
          if (validation.valid && validation.discountCode) {
            validatedDiscountCode = validation.discountCode;
            
            // Calculate discount amount
            if (validation.discountCode.discountType === 'percentage') {
              discountPercentage = validation.discountCode.discountValue;
              discountAmount = Math.round(price * (validation.discountCode.discountValue / 100));
              
              // Apply maximum discount limit if set
              if (validation.discountCode.maximumDiscount && discountAmount > validation.discountCode.maximumDiscount) {
                discountAmount = validation.discountCode.maximumDiscount;
              }
            } else if (validation.discountCode.discountType === 'fixed_amount') {
              discountAmount = validation.discountCode.discountValue;
            }
            
            // Ensure discount doesn't exceed order amount
            discountAmount = Math.min(discountAmount, price);
          } else {
            console.log('Invalid discount code:', validation.reason);
            // Continue without discount rather than failing
          }
        }

        // Get the base URL for redirects
        const protocol = req.get('x-forwarded-proto') || req.protocol;
        const host = req.get('host');
        const baseUrl = `${protocol}://${host}`;

        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
          customer: customer.id,
          payment_method_types: ['card'],
          mode: data.billingCycle === 'monthly' ? 'subscription' : 'payment',
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: `Whirkplace ${data.planId.charAt(0).toUpperCase() + data.planId.slice(1)} Plan`,
                  description: `${data.billingCycle === 'monthly' ? 'Monthly' : 'Annual'} subscription for ${organization.name}`,
                },
                unit_amount: price - discountAmount, // Apply discount to the price
                ...(data.billingCycle === 'monthly' ? {
                  recurring: {
                    interval: 'month' as const,
                    interval_count: 1,
                  }
                } : {})
              },
              quantity: 1,
            },
          ],
          success_url: `${baseUrl}/api/business/checkout-success?session_id={CHECKOUT_SESSION_ID}&organizationId=${data.organizationId}`,
          cancel_url: `${baseUrl}/business-signup?canceled=true`,
          metadata: {
            organizationId: data.organizationId,
            planId: data.planId,
            billingCycle: data.billingCycle,
            ...(validatedDiscountCode && {
              discountCode: validatedDiscountCode.code,
              discountAmount: discountAmount.toString(),
              discountPercentage: discountPercentage.toString(),
            }),
          },
        });

        // Store the session ID for verification and discount info
        await storage.updateOrganization(data.organizationId, {
          plan: data.planId,
          pendingCheckoutSessionId: session.id,
          ...(validatedDiscountCode && {
            discountCode: validatedDiscountCode.code,
            discountPercentage: discountPercentage,
          }),
        });
        
        // Record discount code usage if applied
        if (validatedDiscountCode) {
          await storage.applyDiscountCode({
            discountCodeId: validatedDiscountCode.id,
            organizationId: data.organizationId,
            orderAmount: price,
            discountAmount: discountAmount,
          });
        }

        res.json({
          success: true,
          requiresPayment: true,
          checkoutUrl: session.url,
          sessionId: session.id,
          message: "Redirecting to Stripe checkout..."
        });
      } else {
        // Standard plan - no payment required
        await storage.updateOrganization(data.organizationId, {
          plan: data.planId,
        });

        res.json({
          success: true,
          requiresPayment: false,
          message: "Plan selected successfully"
        });
      }

    } catch (error: any) {
      console.error("Plan selection error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to select plan" });
    }
  });

  // Handle Stripe checkout success callback
  app.get("/api/business/checkout-success", async (req, res) => {
    try {
      const { session_id, organizationId } = req.query;

      if (!session_id || !organizationId) {
        return res.redirect('/business-signup?error=missing_parameters');
      }

      if (!stripe) {
        return res.redirect('/business-signup?error=stripe_not_configured');
      }

      // Verify the checkout session
      const session = await stripe.checkout.sessions.retrieve(session_id as string);

      if (!session) {
        return res.redirect('/business-signup?error=invalid_session');
      }

      // Verify the session belongs to this organization
      if (session.metadata?.organizationId !== organizationId) {
        return res.redirect('/business-signup?error=organization_mismatch');
      }

      // Verify payment was successful
      if (session.payment_status !== 'paid') {
        return res.redirect('/business-signup?error=payment_not_completed');
      }

      // Update organization with payment confirmation
      await storage.updateOrganization(organizationId as string, {
        stripeCheckoutSessionId: session.id,
        stripeSubscriptionId: session.subscription as string || null,
        paymentStatus: 'completed',
        pendingCheckoutSessionId: null,
      });

      // Redirect to the teams step with success
      res.redirect(`/business-signup?step=teams&organizationId=${organizationId}&payment=success`);
      
    } catch (error) {
      console.error("Checkout success error:", error);
      res.redirect('/business-signup?error=checkout_verification_failed');
    }
  });

  // Complete onboarding - Step 3: Organization setup
  app.post("/api/business/complete-onboarding", async (req, res) => {
    try {
      const onboardingSchema = z.object({
        organizationId: z.string(),
        teams: z.array(z.object({
          name: z.string().min(2),
          description: z.string().optional(),
          type: z.enum(["team", "department", "pod"]),
        })),
        userInvites: z.array(z.object({
          email: z.string().email(),
          name: z.string().min(2),
          role: z.enum(["admin", "manager", "member"]),
          teamName: z.string().optional(),
        })).optional(),
        organizationSettings: z.object({
          companyValues: z.array(z.string()).min(1),
          checkInFrequency: z.enum(["daily", "weekly", "biweekly"]),
          workingHours: z.string(),
          timezone: z.string(),
        }),
      });

      const data = onboardingSchema.parse(req.body);

      // Update organization with custom values
      await storage.updateOrganization(data.organizationId, {
        customValues: data.organizationSettings.companyValues,
      });

      // Create teams
      const createdTeams: any[] = [];
      for (const team of data.teams) {
        const organization = await storage.getOrganization(data.organizationId);
        if (organization) {
          // Get admin user to set as team leader
          const adminUsers = await storage.getAllUsers(data.organizationId);
          const adminUser = adminUsers.find(u => u.role === 'admin');
          
          if (adminUser) {
            const createdTeam = await storage.createTeam(data.organizationId, {
              name: team.name,
              description: team.description || null,
              leaderId: adminUser.id,
              organizationId: data.organizationId,
            });
            createdTeams.push(createdTeam);
          }
        }
      }

      // Process user invitations (if any)
      if (data.userInvites && data.userInvites.length > 0) {
        for (const invite of data.userInvites) {
          // Store pending invitations
          await storage.createUserInvitation({
            organizationId: data.organizationId,
            email: invite.email,
            role: invite.role,
            invitedBy: req.currentUser?.id || 'system',
            status: 'pending',
          });
          
          // Send invitation emails
          await sendWelcomeEmail(invite.email, invite.name, data.organizationId);
        }
      }

      // Update organization onboarding status
      await storage.updateOrganization(data.organizationId, {
        onboardingStatus: 'completed',
        onboardingCompletedAt: new Date().toISOString(),
        onboardingSettingsCompleted: true
      });

      res.json({
        success: true,
        message: "Onboarding completed successfully",
        organizationId: data.organizationId,
        teams: createdTeams,
        invitesSent: data.userInvites?.length || 0,
      });
    } catch (error: any) {
      console.error("Onboarding completion error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

  // Apply organization middleware to all API routes AFTER onboarding and business routes
  // This ensures public endpoints remain accessible during initial setup
  app.use("/api", (req, res, next) => {
    // Exempt business signup routes from organization middleware
    if (req.path.startsWith("/business/signup") || 
        req.path.startsWith("/business/plans") ||
        req.path.startsWith("/business/select-plan") ||
        req.path.startsWith("/partners/applications")) {
      return next();
    }
    // Apply organization middleware to all other routes
    resolveOrganization()(req, res, next);
  });
  
  app.use("/api", (req, res, next) => {
    // Exempt business signup routes from requireOrganization middleware
    if (req.path.startsWith("/business/signup") || 
        req.path.startsWith("/business/plans") ||
        req.path.startsWith("/business/select-plan") ||
        req.path.startsWith("/partners/applications")) {
      return next();
    }
    // Require organization for all other routes
    requireOrganization()(req, res, next);
  });

  // ========== KRA CATEGORIES MANAGEMENT (SUPER ADMIN ONLY) ==========
  
  // Get all KRA categories
  app.get("/api/kra-categories", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const categories = await storage.getKraCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching KRA categories:", error);
      res.status(500).json({ message: "Failed to fetch KRA categories" });
    }
  });

  // Create a new KRA category
  app.post("/api/kra-categories", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const { insertKraCategorySchema } = await import("@shared/schema");
      const categoryData = insertKraCategorySchema.parse(req.body);
      
      const category = await storage.createKraCategory(categoryData);
      res.json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid category data", details: error.errors });
      }
      console.error("Error creating KRA category:", error);
      res.status(500).json({ message: "Failed to create KRA category" });
    }
  });

  // Update a KRA category
  app.patch("/api/kra-categories/:id", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const { insertKraCategorySchema } = await import("@shared/schema");
      const updateData = insertKraCategorySchema.partial().parse(req.body);
      
      const category = await storage.updateKraCategory(req.params.id, updateData);
      if (!category) {
        return res.status(404).json({ message: "KRA category not found" });
      }
      res.json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid update data", details: error.errors });
      }
      console.error("Error updating KRA category:", error);
      res.status(500).json({ message: "Failed to update KRA category" });
    }
  });

  // Delete a KRA category
  app.delete("/api/kra-categories/:id", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const deleted = await storage.deleteKraCategory(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "KRA category not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting KRA category:", error);
      res.status(500).json({ message: "Failed to delete KRA category" });
    }
  });

  // ========== PARTNER MANAGEMENT ROUTES ==========
  // These routes handle partner firm management and require authentication
  
  // Get all partner firms (super admin only)
  app.get("/api/partners/firms", requireOrganization(), authenticateUser(), requireSuperAdmin(), async (req, res) => {
    try {
      const partners = await storage.getAllPartnerFirms();
      res.json(partners);
    } catch (error) {
      console.error("Error fetching partner firms:", error);
      res.status(500).json({ message: "Failed to fetch partner firms" });
    }
  });

  // Get partner firm by ID
  app.get("/api/partners/firms/:id", requireOrganization(), authenticateUser(), requirePartnerAdmin(), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Partner admins can only view their own firm
      if (!req.currentUser?.isSuperAdmin && (req as any).partnerFirmId !== id) {
        return res.status(403).json({ message: "Access denied to this partner firm" });
      }
      
      const partner = await storage.getPartnerFirm(id);
      if (!partner) {
        return res.status(404).json({ message: "Partner firm not found" });
      }
      
      res.json(partner);
    } catch (error) {
      console.error("Error fetching partner firm:", error);
      res.status(500).json({ message: "Failed to fetch partner firm" });
    }
  });

  // Create new partner firm (super admin only)
  app.post("/api/partners/firms", requireOrganization(), authenticateUser(), requireSuperAdmin(), async (req, res) => {
    try {
      const data = insertPartnerFirmSchema.parse(req.body);
      const partner = await storage.createPartnerFirm(data);
      res.status(201).json(partner);
    } catch (error: any) {
      console.error("Error creating partner firm:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid partner data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create partner firm" });
    }
  });

  // Update partner firm
  app.put("/api/partners/firms/:id", requireOrganization(), authenticateUser(), requirePartnerAdmin(), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Partner admins can only update their own firm
      if (!req.currentUser?.isSuperAdmin && (req as any).partnerFirmId !== id) {
        return res.status(403).json({ message: "Access denied to this partner firm" });
      }
      
      const data = insertPartnerFirmSchema.partial().parse(req.body);
      const updated = await storage.updatePartnerFirm(id, data);
      
      if (!updated) {
        return res.status(404).json({ message: "Partner firm not found" });
      }
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating partner firm:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid partner data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update partner firm" });
    }
  });

  // Delete partner firm (super admin only)
  app.delete("/api/partners/firms/:id", requireOrganization(), authenticateUser(), requireSuperAdmin(), async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deletePartnerFirm(id);
      
      if (!success) {
        return res.status(404).json({ message: "Partner firm not found" });
      }
      
      res.json({ message: "Partner firm deleted successfully" });
    } catch (error) {
      console.error("Error deleting partner firm:", error);
      res.status(500).json({ message: "Failed to delete partner firm" });
    }
  });

  // Get organizations belonging to a partner
  app.get("/api/partners/firms/:id/organizations", requireOrganization(), authenticateUser(), requirePartnerAdmin(), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Partner admins can only view their own organizations
      if (!req.currentUser?.isSuperAdmin && (req as any).partnerFirmId !== id) {
        return res.status(403).json({ message: "Access denied to this partner's organizations" });
      }
      
      const organizations = await storage.getPartnerOrganizations(id);
      res.json(organizations);
    } catch (error) {
      console.error("Error fetching partner organizations:", error);
      res.status(500).json({ message: "Failed to fetch partner organizations" });
    }
  });

  // Attach organization to partner
  app.post("/api/partners/firms/:partnerId/organizations/:orgId", requireOrganization(), authenticateUser(), requireSuperAdmin(), async (req, res) => {
    try {
      const { partnerId, orgId } = req.params;
      const updated = await storage.attachOrganizationToPartner(partnerId, orgId);
      
      if (!updated) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error attaching organization to partner:", error);
      res.status(500).json({ message: "Failed to attach organization to partner" });
    }
  });

  // Detach organization from partner
  app.delete("/api/partners/organizations/:orgId/partner", requireOrganization(), authenticateUser(), requireSuperAdmin(), async (req, res) => {
    try {
      const { orgId } = req.params;
      const updated = await storage.detachOrganizationFromPartner(orgId);
      
      if (!updated) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error detaching organization from partner:", error);
      res.status(500).json({ message: "Failed to detach organization from partner" });
    }
  });

  // Promote organization to partner firm
  app.post("/api/partners/promote/:orgId", requireOrganization(), authenticateUser(), requireSuperAdmin(), async (req, res) => {
    try {
      const { orgId } = req.params;
      const partnerConfig = insertPartnerFirmSchema.parse(req.body);
      
      const partner = await storage.promoteOrganizationToPartner(orgId, partnerConfig);
      res.status(201).json(partner);
    } catch (error: any) {
      console.error("Error promoting organization to partner:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid partner configuration", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to promote organization to partner" });
    }
  });

  // Get partner statistics
  app.get("/api/partners/firms/:id/stats", requireOrganization(), authenticateUser(), requirePartnerAdmin(), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Partner admins can only view their own stats
      if (!req.currentUser?.isSuperAdmin && (req as any).partnerFirmId !== id) {
        return res.status(403).json({ message: "Access denied to this partner's statistics" });
      }
      
      const stats = await storage.getPartnerStats(id);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching partner statistics:", error);
      res.status(500).json({ message: "Failed to fetch partner statistics" });
    }
  });

  // Get users across all partner organizations
  app.get("/api/partners/firms/:id/users", requireOrganization(), authenticateUser(), requirePartnerAdmin(), async (req, res) => {
    try {
      const { id } = req.params;
      const includeInactive = req.query.includeInactive === 'true';
      
      // Partner admins can only view their own users
      if (!req.currentUser?.isSuperAdmin && (req as any).partnerFirmId !== id) {
        return res.status(403).json({ message: "Access denied to this partner's users" });
      }
      
      const users = await storage.getPartnerUsers(id, includeInactive);
      res.json(sanitizeUsers(users));
    } catch (error) {
      console.error("Error fetching partner users:", error);
      res.status(500).json({ message: "Failed to fetch partner users" });
    }
  });

  // Move user between partner organizations
  app.put("/api/partners/firms/:partnerId/users/:userId/move", requireOrganization(), authenticateUser(), requirePartnerAdmin(), async (req, res) => {
    try {
      const { partnerId, userId } = req.params;
      const { targetOrganizationId } = req.body;
      
      // Partner admins can only move users within their own partner
      if (!req.currentUser?.isSuperAdmin && (req as any).partnerFirmId !== partnerId) {
        return res.status(403).json({ message: "Access denied to this partner's user management" });
      }
      
      if (!targetOrganizationId) {
        return res.status(400).json({ message: "Target organization ID is required" });
      }
      
      const updated = await storage.moveUserWithinPartner(partnerId, userId, targetOrganizationId);
      
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error moving user:", error);
      res.status(500).json({ message: error.message || "Failed to move user" });
    }
  });

  // Clear authentication data endpoint (before auth middleware)
  app.post("/api/auth/clear", (req, res) => {
    try {
      console.log("🧹 Clearing authentication data");
      
      // Clear all authentication-related cookies
      const isReplit = !!process.env.REPL_SLUG;
      const isProd = process.env.NODE_ENV === 'production';
      const secure = isProd || isReplit;
      const sameSite = (isProd || isReplit) ? 'none' : 'lax';
      const partitioned = isProd || isReplit;
      
      res.clearCookie('auth_user_id', {
        httpOnly: true,
        secure,
        sameSite: sameSite as any,
        path: '/',
        ...(partitioned ? { partitioned: true } : {})
      });
      
      res.clearCookie('auth_org_id', {
        httpOnly: true,
        secure,
        sameSite: sameSite as any,
        path: '/',
        ...(partitioned ? { partitioned: true } : {})
      });
      
      res.clearCookie('auth_session_token', {
        httpOnly: true,
        secure,
        sameSite: sameSite as any,
        path: '/',
        ...(partitioned ? { partitioned: true } : {})
      });
      
      // Clear the session cookies
      res.clearCookie('connect.sid', {
        secure,
        httpOnly: true,
        sameSite: sameSite as any,
        path: '/',
        ...(partitioned ? { partitioned: true } : {})
      });
      
      // Also clear legacy custom session cookie if it exists
      res.clearCookie('whirkplace.sid', {
        secure,
        httpOnly: true,
        sameSite: sameSite as any,
        path: '/',
        ...(partitioned ? { partitioned: true } : {})
      });
      
      // Clear session if it exists
      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            console.error('Session destroy error during clear:', err);
          }
        });
      }
      
      res.json({ 
        message: "Authentication data cleared successfully" 
      });
    } catch (error) {
      console.error("Clear auth error:", error);
      res.status(500).json({ message: "Failed to clear authentication data" });
    }
  });

  // Main Login endpoint using centralized AuthService
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ 
          message: "Email and password are required" 
        });
      }
      
      // Import the centralized AuthService
      const { authService } = await import('./services/authService');
      
      // Use the centralized AuthService to authenticate user
      const authResult = await authService.authenticateUser(email, password);
      
      if (!authResult) {
        return res.status(401).json({ 
          message: "Invalid email or password" 
        });
      }
      
      const { user, organization } = authResult;
      
      // Create session using the centralized AuthService
      try {
        await authService.createSession(req, user, organization);
        
        // Return sanitized user data
        res.json({ 
          message: "Login successful",
          user: authService.getSanitizedUser(user),
          organizationId: organization.id
        });
      } catch (sessionError) {
        console.error('Failed to create session:', sessionError);
        return res.status(500).json({ message: "Session creation failed" });
      }
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Demo Login endpoint - specifically for demo accounts
  app.post("/api/auth/demo-login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ 
          message: "Email and password are required" 
        });
      }
      
      // Check if this is a valid demo account
      const validDemoAccounts = [
        { email: 'john@delicious.com', role: 'admin', name: 'John Delicious', isAccountOwner: true },
        { email: 'sarah@delicious.com', role: 'admin', name: 'Sarah Delicious', isAccountOwner: false },
        { email: 'mike@delicious.com', role: 'member', name: 'Mike Delicious', isAccountOwner: false }
      ];
      
      const demoAccount = validDemoAccounts.find(acc => acc.email === email.toLowerCase());
      
      if (!demoAccount) {
        return res.status(401).json({ 
          message: "Invalid demo account" 
        });
      }
      
      // Verify the demo password
      if (password !== 'Demo1234!') {
        return res.status(401).json({ 
          message: "Invalid password for demo account" 
        });
      }
      
      console.log('🎬 Demo login attempt for:', email);
      
      // Get or create the demo organization
      const demoOrgSlug = 'fictitious-delicious';
      let organization = await storage.getOrganizationBySlug(demoOrgSlug);
      
      if (!organization) {
        console.log('📝 Creating demo organization...');
        
        // Create the demo organization
        organization = await storage.createOrganization({
          id: 'b74d00fd-e1ce-41ae-afca-4a0d55cb1fe1',
          name: 'Fictitious Delicious',
          slug: demoOrgSlug,
          description: 'A fine dining restaurant showcasing Whirkplace for hospitality teams',
          isDemo: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        // Run the demo data seeder to create teams and other data
        const { ensureDemoDataExists } = await import('./seedDemoData');
        await ensureDemoDataExists();
      }
      
      // Check if user exists in the organization
      let user = await storage.getUserByEmail(organization.id, email.toLowerCase());
      
      if (!user) {
        console.log('📝 Creating demo user:', email);
        
        // Hash the demo password
        const hashedPassword = await bcrypt.hash('Demo1234!', 10);
        
        // Create the user
        user = await storage.createUser({
          organizationId: organization.id,
          email: email.toLowerCase(),
          name: demoAccount.name,
          password: hashedPassword,
          role: demoAccount.role,
          isAccountOwner: demoAccount.isAccountOwner,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      } else {
        // Update user to ensure correct role and account owner status
        if (user.role !== demoAccount.role || user.isAccountOwner !== demoAccount.isAccountOwner) {
          await storage.updateUser(organization.id, user.id, {
            role: demoAccount.role,
            isAccountOwner: demoAccount.isAccountOwner
          });
          
          // Refresh user data
          user = await storage.getUser(organization.id, user.id);
        }
      }
      
      if (!user) {
        return res.status(500).json({ 
          message: "Failed to create or retrieve demo user" 
        });
      }
      
      // Import the centralized AuthService
      const { authService } = await import('./services/authService');
      
      // Create session using the centralized AuthService
      try {
        await authService.createSession(req, user, organization);
        
        console.log('✅ Demo login successful for:', email);
        
        // Return sanitized user data with a simple demo token
        // The frontend expects a token to identify demo sessions
        res.json({ 
          message: "Login successful",
          user: authService.getSanitizedUser(user),
          token: `demo-${demoOrgId}-${user.id}` // Simple demo identifier token
        });
      } catch (sessionError) {
        console.error('Failed to create session:', sessionError);
        return res.status(500).json({ message: "Session creation failed" });
      }
    } catch (error) {
      console.error("Demo login error:", error);
      res.status(500).json({ message: "Demo login failed" });
    }
  });

  // Email/Password Registration endpoint (before auth middleware)
  app.post("/api/auth/register", requireOrganization(), async (req, res) => {
    try {
      console.log("📝 Email/password registration attempt");
      
      const { email, password, organizationSlug } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ 
          message: "Email and password are required" 
        });
      }

      if (password.length < 8) {
        return res.status(400).json({ 
          message: "Password must be at least 8 characters long" 
        });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      
      // Check if user already exists in this organization
      const existingUser = await storage.getUserByEmail(req.orgId, normalizedEmail);
      if (existingUser) {
        return res.status(409).json({ 
          message: "An account with this email already exists" 
        });
      }
      
      // Get organization details for welcome email
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ 
          message: "Organization not found" 
        });
      }
      
      // Hash password before storing
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      // Create user data
      const userData = {
        username: normalizedEmail.split('@')[0], // Use email prefix as username
        password: hashedPassword,
        name: normalizedEmail.split('@')[0], // Default name, user can update later
        email: normalizedEmail,
        organizationId: req.orgId, // Add required organizationId
        role: "member" as const,
        isActive: true,
        authProvider: "local" as const,
      };
      
      console.log(`👤 Creating new user: ${userData.name} (${userData.email})`);
      
      // Create the user
      const newUser = await storage.createUser(req.orgId, userData);
      
      if (!newUser) {
        return res.status(500).json({ 
          message: "Failed to create user account" 
        });
      }
      
      console.log(`✅ User created successfully: ${newUser.name} (${newUser.email})`);
      
      // Send welcome email (don't block registration if email fails)
      try {
        console.log(`📧 Sending welcome email to ${newUser.email}...`);
        const emailSent = await sendWelcomeEmail(newUser.email, newUser.name, organization.name);
        if (emailSent) {
          console.log(`📧 Welcome email sent successfully to ${newUser.email}`);
        } else {
          console.log(`📧 Failed to send welcome email to ${newUser.email} - email service returned false`);
        }
      } catch (emailError) {
        console.error(`📧 Failed to send welcome email to ${newUser.email}:`, emailError);
        // Continue with registration even if email fails
      }
      
      // Generate new session for the user
      req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
          console.error('Failed to regenerate session:', regenerateErr);
          return res.status(500).json({ message: "Session regeneration failed" });
        }
        
        // Set session after regeneration
        req.session.userId = newUser.id;
        
        // FIX: Let express-session automatically save and set cookie
        console.log(`💾 Registration session will auto-save for user: ${newUser.id}`);
        console.log(`🍪 Set-Cookie header will be added automatically`);
        
        // SECURITY: Session-based authentication only - no auth cookies
        
        res.status(201).json({ 
          message: "Registration successful",
          user: {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            organizationId: newUser.organizationId
          }
        });
      });
      
    } catch (error) {
      console.error("Registration error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid registration data",
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Registration failed" });
    }
  });
  
  // Get available auth providers for an organization (read-only, before CSRF)
  app.get("/api/auth/providers/:orgSlug", async (req, res) => {
    try {
      const { orgSlug } = req.params;
      
      // Get organization by slug
      const organization = await storage.getOrganizationBySlug(orgSlug);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Get configured auth providers
      const providers = await storage.getOrganizationAuthProviders(organization.id);
      
      // Transform for frontend consumption
      const availableProviders = providers.map(p => ({
        id: p.id,
        provider: p.provider,
        name: p.providerOrgName || p.provider,
        enabled: p.enabled,
        connectedAt: p.createdAt
      }));
      
      // Always include local/email provider
      if (!availableProviders.find(p => p.provider === 'local')) {
        availableProviders.push({
          id: 'local',
          provider: 'local',
          name: 'Email & Password',
          enabled: true,
          connectedAt: organization.createdAt
        });
      }
      
      res.json({ providers: availableProviders });
    } catch (error) {
      console.error("Failed to fetch auth providers:", error);
      res.status(500).json({ message: "Failed to fetch authentication providers" });
    }
  });
  
  // Apply onboarding requirement for main app routes (excluding auth, onboarding, and public routes)
  // Note: CSRF generation middleware is already applied in server/index.ts
  app.use("/api", (req, res, next) => {
    // Exempt specific routes from onboarding requirement
    // Note: req.path doesn't include the '/api' prefix since we're mounted on '/api'
    const exemptPaths = [
      '/csrf-token',
      '/auth/',
      '/onboarding/',
      '/organizations/',
      '/business/',
      '/partner/',
      '/users/current',  // Allow getting current user during onboarding
      '/organizations/by-slug/',  // Allow fetching org by slug during onboarding
      '/users',  // Allow fetching users
      '/questions',  // Allow fetching questions
      '/checkins',  // Allow check-ins
      '/wins',  // Allow wins
      '/shoutouts',  // Allow shoutouts
      '/analytics/',  // Allow analytics
      '/features',  // Allow feature flags
      '/integrations'  // Allow integrations without onboarding, including all sub-paths
    ];
    
    // Check if the request path starts with any of the exempt paths
    const isExempt = exemptPaths.some(path => req.path.startsWith(path));
    
    if (isExempt) {
      return next();
    }
    
    // DISABLED: Old onboarding requirement - now handled via signup flow
    // requireOnboarded()(req, res, next);
    
    // Continue to next middleware since onboarding is no longer required
    next();
  });
  
  // CSRF token endpoint (requires authentication)
  app.get("/api/csrf-token", csrfTokenEndpoint);
  
  // NOTE: Authentication, CSRF generation and validation middleware already applied in server/index.ts
  // to prevent route shadowing issues
  
  // Apply authentication requirement to all protected routes
  // (Not all routes need authentication, so we'll add requireAuth() selectively)
  
  // Analytics validation schemas
  const analyticsBaseSchema = z.object({
    scope: z.enum(['organization', 'team', 'user']).default('organization'),
    id: z.string().optional(),
    period: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
    from: z.string().optional().refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'from' date format").transform(val => val ? new Date(val) : undefined),
    to: z.string().optional().refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'to' date format").transform(val => val ? new Date(val) : undefined),
  });
  
  const shoutoutAnalyticsSchema = analyticsBaseSchema.extend({
    direction: z.enum(['given', 'received', 'all']).default('all'),
    visibility: z.enum(['public', 'private', 'all']).default('all'),
  });
  
  const leaderboardSchema = analyticsBaseSchema.extend({
    metric: z.enum(['shoutouts_received', 'shoutouts_given', 'pulse_avg']).default('shoutouts_received'),
  });
  
  const overviewSchema = z.object({
    period: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
    from: z.string().optional().refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'from' date format").transform(val => val ? new Date(val) : undefined),
    to: z.string().optional().refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'to' date format").transform(val => val ? new Date(val) : undefined),
  });
  
  const complianceAnalyticsSchema = analyticsBaseSchema.extend({
    // Compliance analytics uses the same base parameters as other analytics
  });
  
  // Admin backfill schema
  const backfillSchema = z.object({
    from: z.string().refine((val) => {
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'from' date format").transform(val => new Date(val)),
    to: z.string().refine((val) => {
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'to' date format").transform(val => new Date(val)),
  });
  
  // Vacation validation schemas
  const vacationQuerySchema = z.object({
    userId: z.string().optional(), // Admin can query for specific user
    from: z.string().optional().refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'from' date format").transform(val => val ? new Date(val) : undefined),
    to: z.string().optional().refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'to' date format").transform(val => val ? new Date(val) : undefined),
  });
  
  const vacationParamSchema = z.object({
    weekOf: z.string().refine((val) => {
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'weekOf' date format").transform(val => new Date(val)),
  });

  // Auth Provider Management validation schemas
  const connectProviderSchema = z.object({
    provider: z.enum(["slack", "microsoft", "google", "okta", "local"]),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    config: z.record(z.any()).default({})
  });

  const linkIdentitySchema = z.object({
    provider: z.enum(["local", "slack", "microsoft", "google", "okta"]),
    providerUserId: z.string().min(1, "Provider user ID is required"),
    providerEmail: z.string().email().optional(),
    providerDisplayName: z.string().optional(),
    profile: z.record(z.any()).default({})
  });

  // Auth Provider Management Routes (protected by CSRF and authentication)
  
  // Get user's connected identities
  app.get("/api/auth/identities", requireAuth(), async (req, res) => {
    try {
      const userId = req.currentUser!.id;
      const identities = await storage.getUserIdentities(userId);
      
      res.json({ 
        identities: identities.map(i => ({
          provider: i.provider,
          providerUserId: i.providerUserId,
          providerEmail: i.providerEmail,
          providerDisplayName: i.providerDisplayName,
          connectedAt: i.createdAt
        }))
      });
    } catch (error) {
      console.error("Failed to fetch user identities:", error);
      res.status(500).json({ message: "Failed to fetch connected accounts" });
    }
  });
  
  // Connect a new auth provider to organization (admin only)
  app.post("/api/auth/providers/connect", requireAuth(), requireRole(["admin"]), async (req, res) => {
    try {
      // Validate request body
      const validationResult = connectProviderSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validationResult.error.errors 
        });
      }

      const { provider, clientId, clientSecret, config } = validationResult.data;
      const orgId = req.orgId;
      
      // Check if provider is already connected
      const existing = await storage.getOrganizationAuthProviders(orgId);
      if (existing.find(p => p.provider === provider)) {
        return res.status(400).json({ message: "Provider is already connected" });
      }
      
      // Create new auth provider
      // TODO: Encrypt clientSecret before storing
      const newProvider = await storage.createOrganizationAuthProvider({
        organizationId: orgId,
        provider,
        clientId,
        clientSecret, // WARNING: Should be encrypted in production
        config,
        enabled: true
      });
      
      res.status(201).json({ 
        message: "Authentication provider connected successfully",
        provider: {
          id: newProvider.id,
          provider: newProvider.provider,
          enabled: newProvider.enabled
        }
      });
    } catch (error) {
      console.error("Failed to connect auth provider:", error);
      res.status(500).json({ message: "Failed to connect authentication provider" });
    }
  });
  
  // Update an auth provider configuration (admin only)
  app.patch("/api/auth/providers/:providerId", requireAuth(), requireRole(["admin"]), async (req, res) => {
    try {
      const { providerId } = req.params;
      const orgId = req.orgId;
      
      // Verify provider belongs to this organization
      const provider = await storage.getOrganizationAuthProvider(orgId, providerId);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }
      
      // If disabling a provider, ensure at least one provider remains enabled
      if (req.body.enabled === false) {
        const allProviders = await storage.getOrganizationAuthProviders(orgId);
        const enabledProviders = allProviders.filter(p => p.enabled && p.id !== providerId);
        if (enabledProviders.length === 0) {
          return res.status(400).json({ 
            message: "Cannot disable the last enabled authentication provider" 
          });
        }
      }
      
      // Update the provider
      const updatedProvider = await storage.updateOrganizationAuthProvider(orgId, providerId, req.body);
      
      if (!updatedProvider) {
        return res.status(404).json({ message: "Failed to update provider" });
      }
      
      res.json({ 
        message: "Provider updated successfully",
        provider: {
          id: updatedProvider.id,
          provider: updatedProvider.provider,
          enabled: updatedProvider.enabled,
          hasCredentials: !!updatedProvider.clientId
        }
      });
    } catch (error) {
      console.error("Failed to update auth provider:", error);
      res.status(500).json({ message: "Failed to update authentication provider" });
    }
  });
  
  // Disconnect an auth provider from organization (admin only)
  app.delete("/api/auth/providers/:providerId", requireAuth(), requireRole(["admin"]), async (req, res) => {
    try {
      const { providerId } = req.params;
      const orgId = req.orgId;
      
      // Verify provider belongs to this organization
      const provider = await storage.getOrganizationAuthProvider(orgId, providerId);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }
      
      // Don't allow disconnecting the last enabled provider
      const providers = await storage.getOrganizationAuthProviders(orgId);
      const enabledProviders = providers.filter(p => p.enabled);
      
      // If this is an enabled provider and it's the only enabled one, prevent deletion
      if (provider.enabled && enabledProviders.length <= 1) {
        return res.status(400).json({ 
          message: "Cannot disconnect the last enabled authentication provider. Please enable another provider first." 
        });
      }
      
      // Delete the provider
      const deleted = await storage.deleteOrganizationAuthProvider(orgId, providerId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Provider not found" });
      }
      
      res.json({ message: "Authentication provider disconnected successfully" });
    } catch (error) {
      console.error("Failed to disconnect auth provider:", error);
      res.status(500).json({ message: "Failed to disconnect authentication provider" });
    }
  });
  
  // Link a new identity to current user
  app.post("/api/auth/identities/link", requireAuth(), async (req, res) => {
    try {
      // Validate request body
      const validationResult = linkIdentitySchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validationResult.error.errors 
        });
      }

      const { provider, providerUserId, providerEmail, providerDisplayName, profile } = validationResult.data;
      const userId = req.currentUser!.id;
      const orgId = req.orgId;
      
      // Check if identity already exists for this user
      const existing = await storage.getUserIdentity(userId, provider);
      if (existing) {
        return res.status(400).json({ 
          message: "This account is already linked to your profile" 
        });
      }
      
      // Check if this provider identity is already linked to another user
      const existingUser = await storage.findUserByProviderIdentity(orgId, provider, providerUserId);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ 
          message: "This account is already linked to another user" 
        });
      }
      
      // Create new identity link
      const newIdentity = await storage.createUserIdentity({
        userId,
        organizationId: orgId,
        provider,
        providerUserId,
        providerEmail,
        providerDisplayName,
        profile
      });
      
      res.status(201).json({ 
        message: "Account linked successfully",
        identity: {
          provider: newIdentity.provider,
          providerEmail: newIdentity.providerEmail,
          connectedAt: newIdentity.createdAt
        }
      });
    } catch (error) {
      console.error("Failed to link identity:", error);
      res.status(500).json({ message: "Failed to link account" });
    }
  });
  
  // Unlink an identity from current user
  app.delete("/api/auth/identities/:provider", requireAuth(), async (req, res) => {
    try {
      const { provider } = req.params;
      const userId = req.currentUser!.id;
      
      // Don't allow unlinking the last identity
      const identities = await storage.getUserIdentities(userId);
      if (identities.length <= 1) {
        return res.status(400).json({ 
          message: "Cannot unlink your last authentication method" 
        });
      }
      
      // Delete the identity
      const deleted = await storage.deleteUserIdentity(userId, provider);
      
      if (!deleted) {
        return res.status(404).json({ message: "Identity not found" });
      }
      
      res.json({ message: "Account unlinked successfully" });
    } catch (error) {
      console.error("Failed to unlink identity:", error);
      res.status(500).json({ message: "Failed to unlink account" });
    }
  });
  
  // Users
  app.get("/api/users", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      // Admins can see all users including inactive, others see only active
      const includeInactive = currentUser.role === "admin";
      const users = await storage.getAllUsers(req.orgId, includeInactive);
      res.json(sanitizeUsers(users));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Get current authenticated user
  app.get("/api/users/current", requireAuth(), async (req, res) => {
    try {
      if (!req.currentUser) {
        return res.status(401).json({ message: "Authentication required" });
      }
      res.json(req.currentUser);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch current user" });
    }
  });

  app.get("/api/users/:id", requireAuth(), async (req, res) => {
    try {
      const user = await storage.getUser(req.orgId, req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(sanitizeUser(user));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post("/api/users", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const sanitizedData = sanitizeForOrganization(userData, req.orgId);
      const user = await storage.createUser(req.orgId, sanitizedData);
      
      // Handle billing for manually created user
      const organization = await storage.getOrganization(req.orgId);
      if (organization && user.isActive) {
        await billingService.handleUserAddition(organization, user.id);
        console.log(`Billing: Handled manual user creation for ${user.name}`);
      }
      
      res.status(201).json(user);
    } catch (error) {
      res.status(400).json({ message: "Invalid user data" });
    }
  });

  app.patch("/api/users/:id", requireAuth(), async (req, res) => {
    try {
      const targetUserId = req.params.id;
      const currentUser = req.currentUser!;
      
      // Authorization: Only admins or the user themselves can update user data
      if (currentUser.role !== "admin" && currentUser.id !== targetUserId) {
        return res.status(403).json({ 
          message: "Access denied. You can only update your own profile or be an admin." 
        });
      }
      
      const updates = insertUserSchema.partial().parse(req.body);
      const sanitizedUpdates = sanitizeForOrganization(updates, req.orgId);
      
      // Get the existing user to compare states for billing
      const existingUser = await storage.getUser(req.orgId, targetUserId);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Additional security: Non-admins cannot change role, organizationId, or other sensitive fields
      if (currentUser.role !== "admin") {
        // Remove sensitive fields that only admins should be able to modify
        const { role, organizationId, teamId, managerId, isActive, ...allowedUpdates } = sanitizedUpdates;
        // Replace sanitizedUpdates with only the allowed fields
        Object.keys(sanitizedUpdates).forEach(key => delete (sanitizedUpdates as any)[key]);
        Object.assign(sanitizedUpdates, allowedUpdates);
      }
      
      const user = await storage.updateUser(req.orgId, req.params.id, sanitizedUpdates);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Handle billing for user activation/deactivation changes
      if (currentUser.role === "admin" && sanitizedUpdates.isActive !== undefined) {
        const organization = await storage.getOrganization(req.orgId);
        if (organization) {
          if (sanitizedUpdates.isActive && !existingUser.isActive) {
            // User is being activated
            await billingService.handleUserAddition(organization, user.id);
            console.log(`Billing: Handled user activation for ${user.name}`);
          } else if (!sanitizedUpdates.isActive && existingUser.isActive) {
            // User is being deactivated
            await billingService.handleUserRemoval(organization, user.id);
            console.log(`Billing: Handled user deactivation for ${user.name}`);
          }
        }
      }
      
      res.json(sanitizeUser(user));
    } catch (error) {
      res.status(400).json({ message: "Invalid user data" });
    }
  });

  // Toggle canViewAllTeams permission (Admin only)
  app.patch("/api/users/:id/view-all-teams", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const targetUserId = req.params.id;
      const { canViewAllTeams } = req.body;
      
      if (typeof canViewAllTeams !== 'boolean') {
        return res.status(400).json({ 
          message: "canViewAllTeams must be a boolean value" 
        });
      }
      
      // Update only the canViewAllTeams field
      const user = await storage.updateUser(req.orgId, targetUserId, { canViewAllTeams });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      console.log(`Admin ${req.currentUser!.name} set canViewAllTeams=${canViewAllTeams} for user ${user.name}`);
      
      res.json({
        message: `Successfully ${canViewAllTeams ? 'granted' : 'revoked'} cross-team view permission`,
        user: sanitizeUser(user)
      });
    } catch (error) {
      console.error("Failed to update canViewAllTeams permission:", error);
      res.status(500).json({ message: "Failed to update permission" });
    }
  });

  app.get("/api/users/:id/reports", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      // Include inactive users for admin/manager contexts
      const includeInactive = currentUser.role === "admin" || currentUser.role === "manager";
      const reports = await storage.getUsersByManager(req.orgId, req.params.id, includeInactive);
      res.json(sanitizeUsers(reports));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  // Send password reset link to user via Slack (Admin only)
  app.post("/api/users/:userId/send-password", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const userId = req.params.userId;
      
      // Get the user
      const user = await storage.getUser(req.orgId, userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check if user has a Slack ID
      if (!user.slackUserId) {
        return res.status(400).json({ 
          message: "User does not have a Slack account connected. They need to be synced from Slack first." 
        });
      }
      
      // Get organization for the name
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Generate a password reset token
      const { sendOnboardingDM } = await import("./services/slack");
      const resetToken = await storage.createPasswordResetToken(userId);
      
      // Send the password reset link via Slack DM
      const result = await sendOnboardingDM(
        user.slackUserId,
        user.email,
        resetToken,
        organization.name,
        user.name || user.username,
        organization.slackBotToken
      );
      
      if (!result.success) {
        return res.status(500).json({ 
          message: `Failed to send password reset link via Slack: ${result.error}`,
          resetTokenCreated: true,
          slackSent: false
        });
      }
      
      res.json({ 
        message: "Password reset link successfully sent to user via Slack",
        resetTokenCreated: true,
        slackSent: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          slackUserId: user.slackUserId
        }
      });
    } catch (error) {
      console.error("Error sending password reset link via Slack:", error);
      res.status(500).json({ 
        message: "Failed to send password reset link",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Teams
  app.get("/api/teams", requireAuth(), async (req, res) => {
    try {
      const teams = await storage.getAllTeams(req.orgId);
      res.json(teams);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  app.post("/api/teams", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      console.log("POST /api/teams - Request body:", JSON.stringify(req.body, null, 2));
      console.log("POST /api/teams - Organization ID:", req.orgId);
      
      // Create team schema that excludes organizationId from client validation
      const createTeamSchema = insertTeamSchema.omit({ organizationId: true });
      
      // Validate required fields before parsing
      if (!req.body.name) {
        return res.status(400).json({ 
          message: "Team name is required",
          field: "name" 
        });
      }
      
      if (!req.body.leaderId) {
        return res.status(400).json({ 
          message: "Team leader is required",
          field: "leaderId" 
        });
      }
      
      // Ensure teamType has a valid value if provided, or set default
      if (!req.body.teamType) {
        req.body.teamType = "team"; // Set default if not provided
      }
      
      const teamData = createTeamSchema.parse(req.body);
      const sanitizedData = sanitizeForOrganization(teamData, req.orgId);
      
      // Verify the leader exists and has proper role
      const leader = await storage.getUser(req.orgId, sanitizedData.leaderId);
      if (!leader) {
        return res.status(400).json({ 
          message: "Selected team leader not found",
          field: "leaderId" 
        });
      }
      
      if (leader.role !== "manager" && leader.role !== "admin") {
        return res.status(400).json({ 
          message: "Team leader must be a manager or admin",
          field: "leaderId" 
        });
      }
      
      console.log("POST /api/teams - Creating team with data:", JSON.stringify(sanitizedData, null, 2));
      
      const team = await storage.createTeam(req.orgId, sanitizedData);
      console.log("POST /api/teams - Team created successfully:", team.id);
      res.status(201).json(team);
    } catch (error) {
      console.error("POST /api/teams - Error details:", error);
      
      // Handle Zod validation errors
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));
        console.error("POST /api/teams - Validation errors:", JSON.stringify(errors, null, 2));
        return res.status(400).json({ 
          message: "Team validation failed",
          errors: errors
        });
      }
      
      // Handle database errors
      if (error instanceof Error) {
        console.error("POST /api/teams - Database/Server error:", error.message);
        return res.status(500).json({ 
          message: "Failed to create team",
          error: error.message 
        });
      }
      
      res.status(500).json({ message: "An unexpected error occurred" });
    }
  });

  app.put("/api/teams/:id", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Update team schema that excludes organizationId from client validation
      const updateTeamSchema = insertTeamSchema.partial().omit({ organizationId: true });
      
      const teamData = updateTeamSchema.parse(req.body);
      const sanitizedData = sanitizeForOrganization(teamData, req.orgId);
      
      // Validate that the team exists
      const existingTeam = await storage.getTeam(req.orgId, req.params.id);
      if (!existingTeam) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // If leaderId is provided, validate that the user exists and is a manager/admin
      if (sanitizedData.leaderId) {
        const leader = await storage.getUser(req.orgId, sanitizedData.leaderId);
        if (!leader) {
          return res.status(400).json({ message: "Team leader not found" });
        }
        if (leader.role !== "manager" && leader.role !== "admin") {
          return res.status(400).json({ message: "Team leader must be a manager or admin" });
        }
      }
      
      const team = await storage.updateTeam(req.orgId, req.params.id, sanitizedData);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      res.json({ message: "Team updated successfully", team });
    } catch (error) {
      console.error("PUT /api/teams/:id - Validation error:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({ message: error.message });
      } else {
        res.status(400).json({ message: "Invalid team data" });
      }
    }
  });

  app.delete("/api/teams/:id", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Validate that the team exists
      const existingTeam = await storage.getTeam(req.orgId, req.params.id);
      if (!existingTeam) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      const deleted = await storage.deleteTeam(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      res.json({ message: "Team deleted successfully" });
    } catch (error) {
      console.error("DELETE /api/teams/:id - Error:", error);
      if (error instanceof Error && error.message.includes("assigned users")) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to delete team" });
      }
    }
  });

  // Hierarchical team endpoints
  app.get("/api/teams/hierarchy", requireAuth(), async (req, res) => {
    try {
      const hierarchy = await storage.getTeamHierarchy(req.orgId);
      res.json(hierarchy);
    } catch (error) {
      console.error("GET /api/teams/hierarchy - Error:", error);
      res.status(500).json({ message: "Failed to fetch team hierarchy" });
    }
  });

  app.get("/api/teams/:id/children", requireAuth(), async (req, res) => {
    try {
      const children = await storage.getTeamChildren(req.orgId, req.params.id);
      res.json(children);
    } catch (error) {
      console.error("GET /api/teams/:id/children - Error:", error);
      res.status(500).json({ message: "Failed to fetch team children" });
    }
  });

  app.get("/api/teams/:id/descendants", requireAuth(), async (req, res) => {
    try {
      const descendants = await storage.getTeamDescendants(req.orgId, req.params.id);
      res.json(descendants);
    } catch (error) {
      console.error("GET /api/teams/:id/descendants - Error:", error);
      res.status(500).json({ message: "Failed to fetch team descendants" });
    }
  });

  app.get("/api/teams/roots", requireAuth(), async (req, res) => {
    try {
      const rootTeams = await storage.getRootTeams(req.orgId);
      res.json(rootTeams);
    } catch (error) {
      console.error("GET /api/teams/roots - Error:", error);
      res.status(500).json({ message: "Failed to fetch root teams" });
    }
  });

  app.post("/api/teams/with-hierarchy", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Create team schema that excludes organizationId and auto-calculated fields
      const createTeamSchema = insertTeamSchema.omit({ organizationId: true });
      const teamData = createTeamSchema.parse(req.body);
      
      const team = await storage.createTeamWithHierarchy(req.orgId, {
        ...teamData,
        organizationId: req.orgId
      });
      res.status(201).json(team);
    } catch (error) {
      console.error("POST /api/teams/with-hierarchy - Error:", error);
      res.status(400).json({ message: "Failed to create team with hierarchy" });
    }
  });

  app.put("/api/teams/:id/move", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const { newParentId } = req.body;
      const team = await storage.moveTeam(req.orgId, req.params.id, newParentId || null);
      
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      res.json(team);
    } catch (error) {
      console.error("PUT /api/teams/:id/move - Error:", error);
      res.status(500).json({ message: "Failed to move team" });
    }
  });

  app.get("/api/teams/:id/members", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      // Include inactive users for admin contexts for team management
      const includeInactive = currentUser.role === "admin";
      const members = await storage.getUsersByTeam(req.orgId, req.params.id, includeInactive);
      res.json(members);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  // Get teams with all users and their KRAs - comprehensive view
  app.get("/api/teams/with-kras", requireAuth(), async (req, res) => {
    try {
      // Get all teams with hierarchy
      const teams = await storage.getAllTeams(req.orgId);
      const users = await storage.getAllUsers(req.orgId, false); // Only active users
      const userKras = await storage.getActiveUserKras(req.orgId);
      
      // Create a map of user KRAs
      const userKraMap = new Map<string, any[]>();
      for (const kra of userKras) {
        if (!userKraMap.has(kra.userId)) {
          userKraMap.set(kra.userId, []);
        }
        userKraMap.get(kra.userId)!.push({
          id: kra.id,
          name: kra.name,
          status: kra.status,
          progress: kra.progress,
          templateId: kra.templateId,
          startDate: kra.startDate,
          endDate: kra.endDate
        });
      }
      
      // Organize users by team
      const teamUsersMap = new Map<string, any[]>();
      for (const user of users) {
        if (user.teamId) {
          if (!teamUsersMap.has(user.teamId)) {
            teamUsersMap.set(user.teamId, []);
          }
          teamUsersMap.get(user.teamId)!.push({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            isTeamLead: false,
            kras: userKraMap.get(user.id) || []
          });
        }
      }
      
      // Build hierarchical team structure with users and KRAs
      const teamsWithUsers = teams.map(team => {
        const teamMembers = teamUsersMap.get(team.id) || [];
        
        // Identify team leader and mark them
        const leader = teamMembers.find(m => m.id === team.leaderId);
        if (leader) {
          leader.isTeamLead = true;
        }
        
        // Sort members: leader first, then alphabetically
        const sortedMembers = teamMembers.sort((a, b) => {
          if (a.isTeamLead && !b.isTeamLead) return -1;
          if (!a.isTeamLead && b.isTeamLead) return 1;
          return a.name.localeCompare(b.name);
        });
        
        return {
          id: team.id,
          name: team.name,
          description: team.description,
          leaderId: team.leaderId,
          leaderName: leader?.name || null,
          teamType: team.teamType,
          parentTeamId: team.parentTeamId,
          memberCount: teamMembers.length,
          kraCount: teamMembers.reduce((acc, m) => acc + m.kras.length, 0),
          members: sortedMembers
        };
      });
      
      // Sort teams alphabetically
      teamsWithUsers.sort((a, b) => a.name.localeCompare(b.name));
      
      res.json({
        teams: teamsWithUsers,
        summary: {
          totalTeams: teams.length,
          totalUsers: users.length,
          totalKras: userKras.length,
          teamsWithKras: teamsWithUsers.filter(t => t.kraCount > 0).length
        }
      });
    } catch (error) {
      console.error("GET /api/teams/with-kras - Error:", error);
      res.status(500).json({ message: "Failed to fetch teams with KRAs" });
    }
  });

  // Check-ins with hierarchical visibility controls
  app.get("/api/checkins", requireAuth(), async (req, res) => {
    try {
      const { userId, managerId, limit } = req.query;
      const currentUser = req.currentUser!;
      
      // Get full user data including canViewAllTeams permission
      const fullUser = await storage.getUser(req.orgId, currentUser.id);
      if (!fullUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      let checkins;
      let authorizedUserIds: Set<string>;
      
      // Apply hierarchical visibility rules
      if (fullUser.isSuperAdmin) {
        // Super admins see everything across all organizations
        if (userId) {
          checkins = await storage.getCheckinsByUser(req.orgId, userId as string);
        } else if (managerId) {
          checkins = await storage.getCheckinsByManager(req.orgId, managerId as string);
        } else {
          checkins = await storage.getRecentCheckins(req.orgId, limit ? parseInt(limit as string) : undefined);
        }
      } else if (fullUser.isAccountOwner) {
        // Account owners see everything in their organization
        if (userId) {
          checkins = await storage.getCheckinsByUser(req.orgId, userId as string);
        } else if (managerId) {
          checkins = await storage.getCheckinsByManager(req.orgId, managerId as string);
        } else {
          checkins = await storage.getRecentCheckins(req.orgId, limit ? parseInt(limit as string) : undefined);
        }
      } else if (fullUser.canViewAllTeams) {
        // Users with canViewAllTeams permission - see all teams but respect hierarchy
        const allUsers = await storage.getAllUsers(req.orgId, true);
        
        // Build hierarchy map to identify relationships
        const userMap = new Map(allUsers.map(u => [u.id, u]));
        
        // Helper to check if user is below current user in hierarchy
        const isBelow = (targetUserId: string, viewerId: string): boolean => {
          const targetUser = userMap.get(targetUserId);
          if (!targetUser) return false;
          
          // Direct report
          if (targetUser.managerId === viewerId) return true;
          
          // Indirect report (recursive check)
          if (targetUser.managerId) {
            return isBelow(targetUser.managerId, viewerId);
          }
          
          return false;
        };
        
        // Users can see: their own + all users below them in hierarchy
        authorizedUserIds = new Set([fullUser.id]);
        
        for (const user of allUsers) {
          if (isBelow(user.id, fullUser.id)) {
            authorizedUserIds.add(user.id);
          }
        }
        
        if (userId) {
          if (!authorizedUserIds.has(userId as string)) {
            return res.status(403).json({ message: "Access denied to this user's check-ins" });
          }
          checkins = await storage.getCheckinsByUser(req.orgId, userId as string);
        } else {
          const allCheckins = await storage.getRecentCheckins(req.orgId, limit ? parseInt(limit as string) : 100);
          checkins = allCheckins.filter(c => authorizedUserIds.has(c.userId));
        }
      } else if (fullUser.role === "manager" || fullUser.role === "admin") {
        // Managers and admins see only their direct reports' check-ins
        const directReports = await storage.getUsersByManager(req.orgId, fullUser.id, true);
        
        // Include the manager's own check-ins
        authorizedUserIds = new Set([
          fullUser.id,
          ...directReports.map(u => u.id)
        ]);
        
        if (userId) {
          if (!authorizedUserIds.has(userId as string)) {
            return res.status(403).json({ message: "Access denied to this user's check-ins" });
          }
          checkins = await storage.getCheckinsByUser(req.orgId, userId as string);
        } else {
          const allCheckins = await storage.getRecentCheckins(req.orgId, limit ? parseInt(limit as string) : 100);
          checkins = allCheckins.filter(c => authorizedUserIds.has(c.userId));
        }
      } else {
        // Regular users can only see their own check-ins
        if (userId && userId !== fullUser.id) {
          return res.status(403).json({ message: "Access denied to other users' check-ins" });
        }
        checkins = await storage.getCheckinsByUser(req.orgId, fullUser.id);
      }
      
      res.json(checkins);
    } catch (error) {
      console.error("Failed to fetch check-ins:", error);
      res.status(500).json({ message: "Failed to fetch check-ins" });
    }
  });

  // Check-in Review Endpoints - these must come before the generic :id route
  app.get("/api/checkins/pending", requireAuth(), async (req, res) => {
    try {
      const user = req.currentUser!;
      let checkins;
      
      // Check if user has no manager (needs self-review capability)
      const userWithManager = await storage.getUser(req.orgId, user.id);
      const needsSelfReview = userWithManager && !userWithManager.managerId;
      
      if (user.role === "admin" || user.role === "manager" || user.role === "team_lead") {
        // Admins, managers and team_leads can review their reports' check-ins
        // Pass includeOwnIfNoManager=true to include their own if they have no manager
        checkins = await storage.getPendingCheckins(req.orgId, user.id, true);
      } else if (needsSelfReview) {
        // Regular users with no manager can see their own pending check-ins for self-review
        const allCheckins = await storage.getPendingCheckins(req.orgId);
        checkins = allCheckins.filter(checkin => checkin.userId === user.id);
      } else {
        // Regular users with a manager cannot access this endpoint
        checkins = [];
      }
      
      // Enhance with user information
      const enhancedCheckins = await Promise.all(
        checkins.map(async (checkin) => {
          const checkinUser = await storage.getUser(req.orgId, checkin.userId);
          const team = checkinUser?.teamId ? await storage.getTeam(req.orgId, checkinUser.teamId) : null;
          
          return {
            ...checkin,
            user: checkinUser ? {
              id: checkinUser.id,
              name: checkinUser.name,
              email: checkinUser.email,
              teamId: checkinUser.teamId,
              teamName: team?.name || null
            } : null,
            // Mark if this is a self-review scenario
            isSelfReview: needsSelfReview && checkin.userId === user.id
          };
        })
      );
      
      res.json(enhancedCheckins);
    } catch (error) {
      console.error("Failed to fetch pending check-ins:", error);
      res.status(500).json({ message: "Failed to fetch pending check-ins" });
    }
  });

  app.get("/api/checkins/review-status/:status", requireAuth(), requireTeamLead(), async (req, res) => {
    try {
      const status = req.params.status as ReviewStatusType;
      
      // Validate status parameter
      if (!Object.values(ReviewStatus).includes(status)) {
        return res.status(400).json({ message: "Invalid review status" });
      }
      
      const user = req.currentUser!;
      let checkins = await storage.getCheckinsByReviewStatus(req.orgId, status);
      
      // Get full user data to check special permissions
      const fullUser = await storage.getUser(req.orgId, user.id);
      if (!fullUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Filter by hierarchy unless super admin or account owner
      if (!fullUser.isSuperAdmin && !fullUser.isAccountOwner) {
        // Get users under this person's authority (direct reports + team members, include inactive for historical data)
        const directReports = await storage.getUsersByManager(req.orgId, user.id, true);
        const teamMembers = await storage.getUsersByTeamLeadership(req.orgId, user.id, true);
        
        // Combine and deduplicate user IDs
        const authorizedUserIds = new Set([
          ...directReports.map(u => u.id),
          ...teamMembers.map(u => u.id)
        ]);
        
        // Filter check-ins to only include those from authorized users
        checkins = checkins.filter(checkin => authorizedUserIds.has(checkin.userId));
      }
      
      // Enhance with user and reviewer information
      const enhancedCheckins = await Promise.all(
        checkins.map(async (checkin) => {
          const checkinUser = await storage.getUser(req.orgId, checkin.userId);
          const team = checkinUser?.teamId ? await storage.getTeam(req.orgId, checkinUser.teamId) : null;
          const reviewer = checkin.reviewedBy ? await storage.getUser(req.orgId, checkin.reviewedBy) : null;
          
          return {
            ...checkin,
            user: checkinUser ? {
              id: checkinUser.id,
              name: checkinUser.name,
              email: checkinUser.email,
              teamId: checkinUser.teamId,
              teamName: team?.name || null
            } : null,
            reviewer: reviewer ? {
              id: reviewer.id,
              name: reviewer.name,
              email: reviewer.email
            } : null
          };
        })
      );
      
      res.json(enhancedCheckins);
    } catch (error) {
      console.error("Failed to fetch check-ins by review status:", error);
      res.status(500).json({ message: "Failed to fetch check-ins by review status" });
    }
  });

  app.get("/api/checkins/leadership-view", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const { from, to, teamId, status, limit } = req.query;
      
      // Default date range: last 30 days
      const fromDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const toDate = to ? new Date(to as string) : new Date();
      
      let checkins: Checkin[];
      
      if (teamId) {
        // Get check-ins for specific team
        const teamMembers = await storage.getUsersByTeam(req.orgId, teamId as string, true);
        const memberIds = teamMembers.map(m => m.id);
        
        // Get all check-ins and filter by team members and date range
        const allCheckins = await storage.getRecentCheckins(req.orgId, 1000); // Large limit to get all recent
        checkins = allCheckins.filter(checkin => 
          memberIds.includes(checkin.userId) &&
          checkin.weekOf >= fromDate &&
          checkin.weekOf <= toDate &&
          (!status || checkin.reviewStatus === status)
        );
      } else {
        // Get all recent check-ins in date range
        const allCheckins = await storage.getRecentCheckins(req.orgId, 1000); // Large limit
        checkins = allCheckins.filter(checkin => 
          checkin.weekOf >= fromDate &&
          checkin.weekOf <= toDate &&
          (!status || checkin.reviewStatus === status)
        );
      }
      
      // Apply limit if specified
      if (limit) {
        checkins = checkins.slice(0, parseInt(limit as string));
      }
      
      // Enhance with user and team information
      const enhancedCheckins = await Promise.all(
        checkins.map(async (checkin) => {
          const user = await storage.getUser(req.orgId, checkin.userId);
          const team = user?.teamId ? await storage.getTeam(req.orgId, user.teamId) : null;
          const reviewer = checkin.reviewedBy ? await storage.getUser(req.orgId, checkin.reviewedBy) : null;
          
          return {
            ...checkin,
            user: user ? {
              id: user.id,
              name: user.name,
              email: user.email,
              teamId: user.teamId,
              teamName: team?.name || null
            } : null,
            team: team ? {
              id: team.id,
              name: team.name
            } : null,
            reviewer: reviewer ? {
              id: reviewer.id,
              name: reviewer.name,
              email: reviewer.email
            } : null
          };
        })
      );
      
      res.json(enhancedCheckins);
    } catch (error) {
      console.error("Failed to fetch leadership view check-ins:", error);
      res.status(500).json({ message: "Failed to fetch leadership view check-ins" });
    }
  });

  // Generic check-in by ID route - MUST come after all specific routes
  app.get("/api/checkins/:id", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      const checkin = await storage.getCheckin(req.orgId, req.params.id);
      
      if (!checkin) {
        return res.status(404).json({ message: "Check-in not found" });
      }
      
      // Get full user data to check special permissions
      const fullUser = await storage.getUser(req.orgId, currentUser.id);
      if (!fullUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Super admins and account owners can see all check-ins
      if (fullUser.isSuperAdmin || fullUser.isAccountOwner) {
        res.json(checkin);
        return;
      }
      
      // Apply authorization: verify user can view this specific check-in
      // Check if they have authorization to view this check-in
      if (checkin.userId === currentUser.id) {
        // User can always view their own check-in
        res.json(checkin);
        return;
      }
      
      // Check if current user is authorized to view this user's check-ins
      const directReports = await storage.getUsersByManager(req.orgId, currentUser.id);
      const teamMembers = await storage.getUsersByTeamLeadership(req.orgId, currentUser.id);
      
      const authorizedUserIds = new Set([
        ...directReports.map(u => u.id),
        ...teamMembers.map(u => u.id)
      ]);
      
      if (!authorizedUserIds.has(checkin.userId)) {
        return res.status(403).json({ 
          message: "Access denied. You can only view check-ins for yourself or your team members." 
        });
      }
      
      res.json(checkin);
    } catch (error) {
      console.error("Failed to fetch check-in:", error);
      res.status(500).json({ message: "Failed to fetch check-in" });
    }
  });

  app.post("/api/checkins", requireAuth(), async (req, res) => {
    try {
      // First, check if active questions exist
      // Get questions based on user's team (includes team-specific and org-wide questions)
      const questions = req.currentUser?.teamId 
        ? await storage.getActiveQuestionsForTeam(req.orgId, req.currentUser.teamId)
        : await storage.getActiveQuestions(req.orgId);
        
      if (questions.length === 0) {
        return res.status(400).json({ 
          message: "Check-ins cannot be submitted without active questions. Please contact your administrator." 
        });
      }
      
      // Get organization for timezone settings
      const organization = await storage.getOrganization(req.orgId);
      
      // Determine the week for the check-in
      let weekOf: Date;
      if (req.body.weekStartDate) {
        // If weekStartDate is provided, use it (for late submissions)
        const providedDate = new Date(req.body.weekStartDate);
        
        // Validate that it's not in the future
        const currentWeekStart = getWeekStartCentral(new Date(), organization);
        if (providedDate > currentWeekStart) {
          return res.status(400).json({
            message: "Cannot submit check-ins for future weeks"
          });
        }
        
        // Validate that it's not more than 1 week in the past
        const previousWeekStart = new Date(currentWeekStart);
        previousWeekStart.setDate(previousWeekStart.getDate() - 7);
        const twoWeeksAgo = new Date(previousWeekStart);
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 7);
        
        if (providedDate < twoWeeksAgo) {
          return res.status(400).json({
            message: "Can only submit check-ins for the current week or the immediately previous week"
          });
        }
        
        // Normalize the week start
        weekOf = getWeekStartCentral(providedDate, organization);
      } else {
        // Default to current week
        weekOf = getWeekStartCentral(new Date(), organization);
      }
      
      // Check if a check-in already exists for this week
      const existingCheckin = await storage.getCheckinForWeek(
        req.orgId,
        req.currentUser!.id,
        weekOf
      );
      
      if (existingCheckin) {
        return res.status(400).json({
          message: "A check-in already exists for this week. Please update the existing check-in instead.",
          existingCheckinId: existingCheckin.id
        });
      }
      
      // Add userId from current user and set weekOf
      const bodyWithUserId = {
        ...req.body,
        userId: req.currentUser!.id,
        weekOf: weekOf,
        overallMood: req.body.overallMood || req.body.moodRating || 5
      };
      
      // Parse and validate check-in data
      const checkinData = insertCheckinSchema.parse(bodyWithUserId);
      
      // Validate that all questions have responses
      const responses = checkinData.responses as Record<string, string> || {};
      const missingResponses = questions.filter(q => !responses[q.id] || responses[q.id].trim() === '');
      
      if (missingResponses.length > 0) {
        return res.status(400).json({ 
          message: "All questions must be answered before submitting the check-in.",
          missingQuestions: missingResponses.map(q => q.text)
        });
      }
      
      const sanitizedData = sanitizeForOrganization(checkinData, req.orgId);
      const checkin = await storage.createCheckin(req.orgId, sanitizedData);
      
      // Log successful save for debugging production issues
      console.log(`✅ Check-in saved successfully for user ${req.currentUser?.email} (${checkin.id})`);
      
      // Send response immediately to prevent timeouts in production
      res.status(201).json(checkin);
      
      // Handle team goals and notifications asynchronously
      setImmediate(async () => {
        try {
          // Auto-increment team goals for check-ins completed metric
          if (checkin.isComplete && req.currentUser?.teamId) {
            await storage.incrementGoalsByMetric(req.orgId, "check-ins completed", req.currentUser.teamId);
          }
          
          // Send notification if check-in is submitted for review
          if (checkin.isComplete && checkin.submittedAt) {
            const user = await storage.getUser(req.orgId, checkin.userId);
            if (user) {
              // Find team leader to notify
              let teamLeaderName = "Team Leader";
              
              // First try direct manager
              if (user.managerId) {
                const manager = await storage.getUser(req.orgId, user.managerId);
                if (manager) {
                  teamLeaderName = manager.name;
                }
              }
              // Then try team leader if no direct manager
              else if (user.teamId) {
                const team = await storage.getTeam(req.orgId, user.teamId);
                if (team?.leaderId) {
                  const teamLeader = await storage.getUser(req.orgId, team.leaderId);
                  if (teamLeader) {
                    teamLeaderName = teamLeader.name;
                  }
                }
              }
              
              // Get first response as summary
              const responses = checkin.responses as Record<string, string>;
              const firstResponse = Object.values(responses)[0] || undefined;
              
              // Add timeout to Slack notification to prevent hanging
              const notificationTimeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Slack notification timeout')), 5000)
              );
              
              await Promise.race([
                notifyCheckinSubmitted(
                  user.name,
                  teamLeaderName,
                  checkin.overallMood,
                  firstResponse
                ),
                notificationTimeout
              ]);
            }
          }
        } catch (error) {
          // Log Slack notification errors but don't let them affect the user
          console.error("Failed to handle post-checkin tasks (non-critical):", error);
        }
      });
    } catch (error) {
      console.error("Check-in validation error:", error);
      res.status(400).json({ 
        message: "Invalid check-in data",
        details: error instanceof Error ? error.message : "Unknown validation error"
      });
    }
  });

  app.get("/api/users/:id/current-checkin", requireAuth(), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verify user is accessing their own check-in or is admin/manager
      if (req.currentUser!.id !== id && req.currentUser!.role !== 'admin') {
        const user = await storage.getUser(req.orgId, id);
        if (!user || user.managerId !== req.currentUser!.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      
      const checkin = await storage.getCurrentWeekCheckin(req.orgId, id);
      
      if (!checkin) {
        return res.status(404).json({ message: "No check-in found for current week" });
      }
      
      res.json(checkin);
    } catch (error) {
      console.error("Error fetching current week check-in:", error);
      res.status(500).json({ message: "Failed to fetch check-in" });
    }
  });

  app.get("/api/users/:id/previous-checkin", requireAuth(), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verify user is accessing their own check-in or is admin/manager
      if (req.currentUser!.id !== id && req.currentUser!.role !== 'admin') {
        const user = await storage.getUser(req.orgId, id);
        if (!user || user.managerId !== req.currentUser!.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      
      const checkin = await storage.getPreviousWeekCheckin(req.orgId, id);
      
      if (!checkin) {
        return res.status(404).json({ message: "No check-in found for previous week" });
      }
      
      res.json(checkin);
    } catch (error) {
      console.error("Error fetching previous week check-in:", error);
      res.status(500).json({ message: "Failed to fetch check-in" });
    }
  });

  app.patch("/api/checkins/:id", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      
      // Get the existing check-in to compare states and verify ownership
      const existingCheckin = await storage.getCheckin(req.orgId, req.params.id);
      if (!existingCheckin) {
        return res.status(404).json({ message: "Check-in not found" });
      }
      
      // Authorization: Only the owner or admin can update a check-in
      if (currentUser.role !== "admin" && currentUser.id !== existingCheckin.userId) {
        return res.status(403).json({ 
          message: "Access denied. You can only update your own check-ins or be an admin." 
        });
      }
      
      const updates = insertCheckinSchema.partial().parse(req.body);
      
      // If updating responses, validate that all questions are answered
      if (updates.responses !== undefined || updates.isComplete === true) {
        const questions = await storage.getActiveQuestions(req.orgId);
        if (questions.length === 0) {
          return res.status(400).json({ 
            message: "Check-ins cannot be submitted without active questions. Please contact your administrator." 
          });
        }
        
        // Use existing responses if not provided, merge with new ones
        const responses = updates.responses || existingCheckin.responses as Record<string, string> || {};
        const missingResponses = questions.filter(q => !responses[q.id] || responses[q.id].trim() === '');
        
        if (missingResponses.length > 0 && updates.isComplete === true) {
          return res.status(400).json({ 
            message: "All questions must be answered before submitting the check-in.",
            missingQuestions: missingResponses.map(q => q.text)
          });
        }
      }
      
      const sanitizedUpdates = sanitizeForOrganization(updates, req.orgId);
      
      const checkin = await storage.updateCheckin(req.orgId, req.params.id, sanitizedUpdates);
      if (!checkin) {
        return res.status(404).json({ message: "Check-in not found" });
      }
      
      // Log successful update for debugging production issues
      console.log(`✅ Check-in updated successfully for user ${req.currentUser?.email} (${checkin.id})`);
      
      // Send response immediately to prevent timeouts in production
      res.json(checkin);
      
      // Handle notifications asynchronously
      const wasNotSubmitted = !existingCheckin.isComplete || !existingCheckin.submittedAt;
      const isNowSubmitted = checkin.isComplete && checkin.submittedAt;
      
      if (wasNotSubmitted && isNowSubmitted) {
        setImmediate(async () => {
          try {
            const user = await storage.getUser(req.orgId, checkin.userId);
            if (user) {
              // Find team leader to notify
              let teamLeaderName = "Team Leader";
              
              // First try direct manager
              if (user.managerId) {
                const manager = await storage.getUser(req.orgId, user.managerId);
                if (manager) {
                  teamLeaderName = manager.name;
                }
              }
              // Then try team leader if no direct manager
              else if (user.teamId) {
                const team = await storage.getTeam(req.orgId, user.teamId);
                if (team?.leaderId) {
                  const teamLeader = await storage.getUser(req.orgId, team.leaderId);
                  if (teamLeader) {
                    teamLeaderName = teamLeader.name;
                  }
                }
              }
              
              // Get first response as summary
              const responses = checkin.responses as Record<string, string>;
              const firstResponse = Object.values(responses)[0] || undefined;
              
              // Add timeout to Slack notification to prevent hanging
              const notificationTimeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Slack notification timeout')), 5000)
              );
              
              await Promise.race([
                notifyCheckinSubmitted(
                  user.name,
                  teamLeaderName,
                  checkin.overallMood,
                  firstResponse
                ),
                notificationTimeout
              ]);
            }
          } catch (notificationError) {
            // Log Slack notification errors but don't let them affect the user
            console.error("Failed to send check-in submission notification (non-critical):", notificationError);
          }
        });
      }
    } catch (error) {
      console.error("Check-in update validation error:", error);
      res.status(400).json({ 
        message: "Invalid check-in data",
        details: error instanceof Error ? error.message : "Unknown validation error"
      });
    }
  });

  app.get("/api/users/:id/current-checkin", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      const requestedUserId = req.params.id;
      
      // Apply authorization: verify user can view this user's current check-in
      if (currentUser.role === "admin") {
        // Admins can view any user's current check-in
        const checkin = await storage.getCurrentWeekCheckin(req.orgId, requestedUserId);
        res.json(checkin || null);
        return;
      }
      
      // For non-admins: check if they have authorization
      if (requestedUserId === currentUser.id) {
        // User can always view their own current check-in
        const checkin = await storage.getCurrentWeekCheckin(req.orgId, requestedUserId);
        res.json(checkin || null);
        return;
      }
      
      // Check if current user is authorized to view this user's check-ins (include inactive for historical data)
      const directReports = await storage.getUsersByManager(req.orgId, currentUser.id, true);
      const teamMembers = await storage.getUsersByTeamLeadership(req.orgId, currentUser.id, true);
      
      const authorizedUserIds = new Set([
        ...directReports.map(u => u.id),
        ...teamMembers.map(u => u.id)
      ]);
      
      if (!authorizedUserIds.has(requestedUserId)) {
        return res.status(403).json({ 
          message: "Access denied. You can only view check-ins for yourself or your team members." 
        });
      }
      
      const checkin = await storage.getCurrentWeekCheckin(req.orgId, requestedUserId);
      res.json(checkin || null);
    } catch (error) {
      console.error("Failed to fetch current check-in:", error);
      res.status(500).json({ message: "Failed to fetch current check-in" });
    }
  });


  app.patch("/api/checkins/:id/review", requireAuth(), async (req, res) => {
    try {
      const reviewData = reviewCheckinSchema.parse(req.body);
      const user = req.currentUser!;
      const checkinId = req.params.id;
      
      // Check if check-in exists
      const existingCheckin = await storage.getCheckin(req.orgId, checkinId);
      if (!existingCheckin) {
        return res.status(404).json({ message: "Check-in not found" });
      }
      
      // Verify authorization - check if user can review this check-in
      if (user.role !== "admin") {
        // Check authorization - who can review this check-in
        const checkinUser = await storage.getUser(req.orgId, existingCheckin.userId);
        if (!checkinUser) {
          return res.status(404).json({ message: "User not found" });
        }

        // Determine who should review this user
        let authorizedReviewer: string | null = null;

        // 1. Check for custom reviewer
        if (checkinUser.reviewerId) {
          authorizedReviewer = checkinUser.reviewerId;
        }
        // 2. Check for team leader
        else if (checkinUser.teamId) {
          const team = await storage.getTeam(req.orgId, checkinUser.teamId);
          if (team?.leaderId) {
            authorizedReviewer = team.leaderId;
          }
        }
        // 3. Fall back to manager (backward compatibility)
        if (!authorizedReviewer && checkinUser.managerId) {
          authorizedReviewer = checkinUser.managerId;
        }

        // Check if current user is authorized
        const isSelfReview = existingCheckin.userId === user.id;
        const isAuthorizedReviewer = user.id === authorizedReviewer;

        if (!isAuthorizedReviewer && !isSelfReview) {
          return res.status(403).json({ 
            message: "You are not authorized to review this check-in" 
          });
        }

        // Self-review only allowed if no reviewer assigned
        if (isSelfReview && authorizedReviewer && authorizedReviewer !== user.id) {
          return res.status(403).json({ 
            message: "Self-review is not allowed when a reviewer is assigned" 
          });
        }
      }
      
      // Allow review updates with the new collaborative workflow
      // Check-ins can be reviewed multiple times for collaborative discussion
      if (existingCheckin.reviewStatus === ReviewStatus.REVIEWED && reviewData.reviewStatus === ReviewStatus.PENDING) {
        return res.status(400).json({ 
          message: "Cannot change a reviewed check-in back to pending status"
        });
      }

      if (!existingCheckin.submittedAt || !existingCheckin.isComplete) {
        return res.status(400).json({ 
          message: "Check-in must be completed and submitted before it can be reviewed" 
        });
      }

      // Perform the review
      const updatedCheckin = await storage.reviewCheckin(req.orgId, checkinId, user.id, reviewData);
      
      if (!updatedCheckin) {
        return res.status(404).json({ message: "Check-in not found" });
      }
      
      // Enhance response with user and reviewer information
      const checkinUser = await storage.getUser(req.orgId, updatedCheckin.userId);
      const team = checkinUser?.teamId ? await storage.getTeam(req.orgId, checkinUser.teamId) : null;
      const reviewer = await storage.getUser(req.orgId, user.id);
      
      // Send notification to user about review completion
      if (checkinUser && reviewer) {
        try {
          await notifyCheckinReviewed(
            checkinUser.name,
            reviewer.name,
            'reviewed',
            reviewData.reviewComments
          );
        } catch (notificationError) {
          console.error("Failed to send check-in review notification:", notificationError);
          // Don't fail the request if notification fails
        }
      }
      
      const enhancedCheckin = {
        ...updatedCheckin,
        user: checkinUser ? {
          id: checkinUser.id,
          name: checkinUser.name,
          email: checkinUser.email,
          teamId: checkinUser.teamId,
          teamName: team?.name || null
        } : null,
        reviewer: reviewer ? {
          id: reviewer.id,
          name: reviewer.name,
          email: reviewer.email
        } : null
      };
      
      res.json(enhancedCheckin);
    } catch (error) {
      console.error("Check-in review error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid review data",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to review check-in" });
    }
  });

  // Get users without check-ins for current week
  app.get("/api/checkins/missing", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const user = req.currentUser!;
      
      // If user is manager, pass their ID; if admin, don't pass managerId
      const managerId = user.role === 'manager' ? user.id : undefined;
      
      const usersWithoutCheckins = await storage.getUsersWithoutCheckins(req.orgId, managerId);
      
      // Enhance with team information
      const enhancedUsers = await Promise.all(
        usersWithoutCheckins.map(async (item) => {
          const team = item.user.teamId 
            ? await storage.getTeam(req.orgId, item.user.teamId)
            : null;
          
          return {
            ...item,
            user: {
              ...item.user,
              teamName: team?.name || null
            }
          };
        })
      );
      
      res.json(enhancedUsers);
    } catch (error) {
      console.error("Failed to fetch users without check-ins:", error);
      res.status(500).json({ message: "Failed to fetch users without check-ins" });
    }
  });

  // Send check-in reminders to selected users  
  app.post("/api/checkins/remind", requireAuth(), requireRole(['admin', 'manager']), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      const user = req.currentUser!;
      const { userIds } = req.body;
      
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ message: "Please provide user IDs to remind" });
      }
      
      // Rate limiting: Check if reminders were sent recently
      const recentReminders = await db
        .select()
        .from(notifications)
        .where(and(
          eq(notifications.organizationId, req.orgId),
          eq(notifications.type, 'checkin_reminder'),
          eq(notifications.createdBy, user.id),
          gte(notifications.createdAt, new Date(Date.now() - 60 * 60 * 1000)) // Within last hour
        ));
      
      if (recentReminders.length > 10) {
        return res.status(429).json({ 
          message: "Rate limit exceeded. You can only send 10 reminder batches per hour." 
        });
      }
      
      // Get users without check-ins to verify they still need reminders
      const managerId = user.role === 'manager' ? user.id : undefined;
      const usersWithoutCheckins = await storage.getUsersWithoutCheckins(req.orgId, managerId);
      const validUserIds = new Set(usersWithoutCheckins.map(item => item.user.id));
      
      // Filter to only valid users who actually need reminders
      const usersToRemind = userIds.filter(id => validUserIds.has(id));
      
      if (usersToRemind.length === 0) {
        return res.status(400).json({ 
          message: "None of the selected users need reminders (they may have already submitted check-ins)" 
        });
      }
      
      const results = {
        sent: [] as string[],
        failed: [] as { userId: string; reason: string }[]
      };
      
      // Send reminders
      for (const userId of usersToRemind) {
        try {
          const userInfo = usersWithoutCheckins.find(item => item.user.id === userId);
          if (!userInfo) continue;
          
          const { user: targetUser, daysSinceLastCheckin } = userInfo;
          
          // Skip if no Slack ID
          if (!targetUser.slackUserId) {
            results.failed.push({ 
              userId, 
              reason: `${targetUser.name} doesn't have Slack connected` 
            });
            continue;
          }
          
          // Send Slack reminder
          const { sendMissingCheckinReminder } = await import("./services/slack");
          const sent = await sendMissingCheckinReminder(
            targetUser.slackUserId,
            targetUser.name,
            daysSinceLastCheckin
          );
          
          if (sent) {
            // Track reminder in notifications
            await storage.createNotification(req.orgId, {
              userId: targetUser.id,
              type: 'checkin_reminder',
              title: 'Check-in Reminder Sent',
              message: `Reminder sent by ${user.name}`,
              createdBy: user.id,
              metadata: {
                sentBy: user.id,
                sentByName: user.name,
                daysSinceLastCheckin
              }
            });
            
            results.sent.push(targetUser.name);
          } else {
            results.failed.push({ 
              userId, 
              reason: `Failed to send Slack message to ${targetUser.name}` 
            });
          }
        } catch (error) {
          console.error(`Error sending reminder to user ${userId}:`, error);
          const userInfo = usersWithoutCheckins.find(item => item.user.id === userId);
          results.failed.push({ 
            userId, 
            reason: `Error sending to ${userInfo?.user.name || 'user'}` 
          });
        }
      }
      
      res.json({
        message: `Sent ${results.sent.length} reminders`,
        results
      });
    } catch (error) {
      console.error("Failed to send check-in reminders:", error);
      res.status(500).json({ message: "Failed to send check-in reminders" });
    }
  });

  // AI Question Generation
  app.post("/api/questions/generate", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { questionGenerator } = await import("./services/questionGenerator");
      
      const generateSchema = z.object({
        count: z.number().min(1).max(10).default(3),
        theme: z.string().min(1, "Theme is required"),
        teamFocus: z.string().optional(),
        excludeExisting: z.boolean().default(true)
      });
      
      const { count, theme, teamFocus, excludeExisting } = generateSchema.parse(req.body);
      
      // Get existing questions if we should exclude them
      let previousQuestions: string[] = [];
      if (excludeExisting) {
        const existingQuestions = await storage.getActiveQuestions(req.orgId);
        previousQuestions = existingQuestions.map(q => q.text);
      }
      
      const generatedQuestions = await questionGenerator.generateQuestions({
        count,
        theme,
        teamFocus,
        previousQuestions
      });
      
      res.json({ questions: generatedQuestions });
    } catch (error) {
      console.error("AI question generation error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid generation parameters",
          details: error.errors
        });
      }
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to generate questions"
      });
    }
  });

  app.post("/api/questions/:id/improve", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { questionGenerator } = await import("./services/questionGenerator");
      
      // Get the question to improve
      const questions = await storage.getActiveQuestions(req.orgId);
      const question = questions.find(q => q.id === req.params.id);
      
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }
      
      const suggestions = await questionGenerator.suggestQuestionImprovements(question.text);
      
      res.json({ suggestions });
    } catch (error) {
      console.error("Question improvement error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to analyze question"
      });
    }
  });

  // Questions
  app.get("/api/questions", requireAuth(), async (req, res) => {
    try {
      // Check if this is for check-in purposes and user has a team
      const forCheckin = req.query.forCheckin === 'true';
      const userTeamId = req.currentUser?.teamId;
      
      // If fetching for check-in and user has a team, get team-specific questions
      const questions = (forCheckin && userTeamId)
        ? await storage.getActiveQuestionsForTeam(req.orgId, userTeamId)
        : await storage.getActiveQuestions(req.orgId);
        
      res.json(questions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch questions" });
    }
  });

  app.post("/api/questions", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      // Explicit schema for client data with server-side validation
      const clientQuestionSchema = z.object({
        text: z.string().min(5, "Question must be at least 5 characters"),
        order: z.number().min(0, "Order must be 0 or greater").default(0)
      });
      const clientData = clientQuestionSchema.parse(req.body);
      
      // Server sets all security-sensitive fields
      const fullQuestionData = {
        ...clientData,
        organizationId: req.orgId,
        createdBy: req.currentUser?.id || "unknown", // Use authenticated user
        assignedToUserId: clientData.assignedToUserId || null, // Assign to specific user or all
        isFromBank: false, // Custom questions are not from bank
        isActive: true // Default to active
      };
      
      const question = await storage.createQuestion(req.orgId, fullQuestionData);
      res.status(201).json(question);
    } catch (error) {
      console.error("Question creation error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid question data",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to create question" });
    }
  });

  app.patch("/api/questions/:id", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      // Allow updating text, order, isActive, categoryId, and assignedToUserId - protect organizationId and createdBy
      const updatesSchema = z.object({
        text: z.string().min(5, "Question must be at least 5 characters").optional(),
        order: z.number().min(0, "Order must be 0 or greater").optional(),
        isActive: z.boolean().optional(),
        categoryId: z.string().optional().nullable(),
        assignedToUserId: z.string().optional().nullable()
      });
      const updates = updatesSchema.parse(req.body);
      
      const question = await storage.updateQuestion(req.orgId, req.params.id, updates);
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }
      res.json(question);
    } catch (error) {
      console.error("Question update error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid question data",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to update question" });
    }
  });

  app.delete("/api/questions/:id", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const deleted = await storage.deleteQuestion(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Question not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete question" });
    }
  });

  // Get all questions including inactive ones
  app.get("/api/questions/all", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const questions = await storage.getAllQuestions(req.orgId, includeInactive);
      res.json(questions);
    } catch (error) {
      console.error("Failed to fetch all questions:", error);
      res.status(500).json({ message: "Failed to fetch questions" });
    }
  });

  // Get question usage stats
  app.get("/api/questions/:id/usage-stats", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const stats = await storage.getQuestionUsageStats(req.orgId, req.params.id);
      const history = await storage.getQuestionUsageHistory(req.orgId, req.params.id);
      res.json({ stats, history });
    } catch (error) {
      console.error("Failed to fetch question usage stats:", error);
      res.status(500).json({ message: "Failed to fetch question usage stats" });
    }
  });

  // Toggle question active/inactive status
  app.patch("/api/questions/:id/toggle-active", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      // First get the current question to toggle its state
      const currentQuestion = await storage.getQuestion(req.orgId, req.params.id);
      if (!currentQuestion) {
        return res.status(404).json({ message: "Question not found" });
      }
      
      const updatedQuestion = await storage.updateQuestion(req.orgId, req.params.id, {
        isActive: !currentQuestion.isActive
      });
      res.json(updatedQuestion);
    } catch (error) {
      console.error("Failed to toggle question status:", error);
      res.status(500).json({ message: "Failed to toggle question status" });
    }
  });

  // Get organization question settings
  app.get("/api/organization/question-settings", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const settings = await storage.getOrganizationQuestionSettings(req.orgId);
      res.json(settings || {
        autoSelectEnabled: false,
        selectionStrategy: 'rotating',
        minimumQuestionsPerWeek: 3,
        maximumQuestionsPerWeek: 10,
        avoidRecentlyAskedDays: 30,
        includeTeamSpecific: true,
        prioritizeCategories: []
      });
    } catch (error) {
      console.error("Failed to fetch organization question settings:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  // Update organization question settings
  app.post("/api/organization/question-settings", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const settingsSchema = z.object({
        autoSelectEnabled: z.boolean().optional(),
        selectionStrategy: z.enum(['random', 'rotating', 'smart']).optional(),
        minimumQuestionsPerWeek: z.number().min(1).max(20).optional(),
        maximumQuestionsPerWeek: z.number().min(1).max(50).optional(),
        avoidRecentlyAskedDays: z.number().min(0).max(365).optional(),
        includeTeamSpecific: z.boolean().optional(),
        prioritizeCategories: z.array(z.string()).optional()
      });
      
      const settings = settingsSchema.parse(req.body);
      
      // Check if settings exist
      const existingSettings = await storage.getOrganizationQuestionSettings(req.orgId);
      const result = existingSettings
        ? await storage.updateOrganizationQuestionSettings(req.orgId, settings)
        : await storage.createOrganizationQuestionSettings(req.orgId, settings);
      
      res.json(result);
    } catch (error) {
      console.error("Failed to update organization question settings:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid settings data",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // Auto-select questions for a user/team
  app.get("/api/questions/auto-select", requireAuth(), async (req, res) => {
    try {
      const { userId, teamId } = req.query;
      
      // Use current user if no userId specified
      const targetUserId = userId as string || req.currentUser?.id;
      if (!targetUserId) {
        return res.status(400).json({ message: "User ID required" });
      }
      
      const questions = await storage.autoSelectQuestions(
        req.orgId, 
        targetUserId, 
        teamId as string | undefined
      );
      res.json(questions);
    } catch (error) {
      console.error("Failed to auto-select questions:", error);
      res.status(500).json({ message: "Failed to auto-select questions" });
    }
  });
  
  // Team Question Management
  app.get("/api/teams/:teamId/questions", requireAuth(), async (req, res) => {
    try {
      const { teamId } = req.params;
      
      // Verify the team exists and user has access
      const team = await storage.getTeam(req.orgId, teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // Only managers and admins can view/manage team questions
      const user = req.currentUser!;
      if (user.role !== 'admin' && !(user.role === 'manager' && (user.teamId === teamId || team.leaderId === user.id))) {
        return res.status(403).json({ message: "Insufficient permissions to manage team questions" });
      }
      
      // Get all questions for the team (including org-wide and team-specific)
      const questions = await storage.getActiveQuestionsForTeam(req.orgId, teamId);
      res.json(questions);
    } catch (error) {
      console.error("Failed to fetch team questions:", error);
      res.status(500).json({ message: "Failed to fetch team questions" });
    }
  });
  
  app.get("/api/teams/:teamId/question-settings", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { teamId } = req.params;
      
      // Verify the team exists and user has access
      const team = await storage.getTeam(req.orgId, teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // Check manager permissions for team
      const user = req.currentUser!;
      if (user.role !== 'admin' && !(user.role === 'manager' && (user.teamId === teamId || team.leaderId === user.id))) {
        return res.status(403).json({ message: "You can only manage questions for your own team" });
      }
      
      const settings = await storage.getTeamQuestionSettings(req.orgId, teamId);
      res.json(settings);
    } catch (error) {
      console.error("Failed to fetch team question settings:", error);
      res.status(500).json({ message: "Failed to fetch team question settings" });
    }
  });
  
  app.post("/api/teams/:teamId/questions", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { teamId } = req.params;
      
      // Verify the team exists and user has access
      const team = await storage.getTeam(req.orgId, teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // Check manager permissions for team
      const user = req.currentUser!;
      if (user.role !== 'admin' && !(user.role === 'manager' && (user.teamId === teamId || team.leaderId === user.id))) {
        return res.status(403).json({ message: "You can only add questions for your own team" });
      }
      
      // Schema for team question
      const teamQuestionSchema = z.object({
        text: z.string().min(5, "Question must be at least 5 characters"),
        order: z.number().min(0, "Order must be 0 or greater").default(0)
      });
      const questionData = teamQuestionSchema.parse(req.body);
      
      // Create team-specific question
      const question = await storage.createQuestion(req.orgId, {
        ...questionData,
        teamId: teamId,
        createdBy: user.id,
        isActive: true,
        isFromBank: false
      });
      
      res.status(201).json(question);
    } catch (error) {
      console.error("Failed to create team question:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid question data",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to create team question" });
    }
  });
  
  app.put("/api/teams/:teamId/question-settings/:questionId", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { teamId, questionId } = req.params;
      
      // Verify the team exists and user has access
      const team = await storage.getTeam(req.orgId, teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // Check manager permissions for team
      const user = req.currentUser!;
      if (user.role !== 'admin' && !(user.role === 'manager' && (user.teamId === teamId || team.leaderId === user.id))) {
        return res.status(403).json({ message: "You can only manage questions for your own team" });
      }
      
      // Schema for team question setting
      const settingSchema = z.object({
        isDisabled: z.boolean(),
        reason: z.string().optional()
      });
      const settingData = settingSchema.parse(req.body);
      
      // Update or create team question setting
      const setting = await storage.updateTeamQuestionSetting(req.orgId, {
        teamId,
        questionId,
        organizationId: req.orgId,
        isDisabled: settingData.isDisabled,
        disabledBy: settingData.isDisabled ? user.id : null,
        reason: settingData.reason || null
      });
      
      res.json(setting);
    } catch (error) {
      console.error("Failed to update team question setting:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid setting data",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to update team question setting" });
    }
  });
  
  app.delete("/api/teams/:teamId/question-settings/:questionId", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { teamId, questionId } = req.params;
      
      // Verify the team exists and user has access
      const team = await storage.getTeam(req.orgId, teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // Check manager permissions for team
      const user = req.currentUser!;
      if (user.role !== 'admin' && !(user.role === 'manager' && (user.teamId === teamId || team.leaderId === user.id))) {
        return res.status(403).json({ message: "You can only manage questions for your own team" });
      }
      
      // Delete team question setting (re-enables the org question for this team)
      const deleted = await storage.deleteTeamQuestionSetting(req.orgId, teamId, questionId);
      if (!deleted) {
        return res.status(404).json({ message: "Setting not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete team question setting:", error);
      res.status(500).json({ message: "Failed to delete team question setting" });
    }
  });
  
  // Question Categories
  app.get("/api/question-categories", requireAuth(), async (req, res) => {
    try {
      const categories = await storage.getQuestionCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching question categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });
  
  app.post("/api/question-categories", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const { insertQuestionCategorySchema } = await import("@shared/schema");
      const categoryData = insertQuestionCategorySchema.parse(req.body);
      
      const category = await storage.createQuestionCategory(categoryData);
      res.json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid category data", details: error.errors });
      }
      console.error("Error creating question category:", error);
      res.status(500).json({ message: "Failed to create category" });
    }
  });
  
  app.patch("/api/question-categories/:id", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const { insertQuestionCategorySchema } = await import("@shared/schema");
      const updateData = insertQuestionCategorySchema.partial().parse(req.body);
      
      const category = await storage.updateQuestionCategory(req.params.id, updateData);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid update data", details: error.errors });
      }
      console.error("Error updating question category:", error);
      res.status(500).json({ message: "Failed to update category" });
    }
  });
  
  app.delete("/api/question-categories/:id", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const deleted = await storage.deleteQuestionCategory(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting question category:", error);
      res.status(500).json({ message: "Failed to delete category" });
    }
  });
  
  // Question Bank
  app.get("/api/question-bank", requireAuth(), async (req, res) => {
    try {
      const categoryId = req.query.categoryId as string | undefined;
      const items = await storage.getQuestionBank(categoryId);
      // Filter to only show approved items or items contributed by the current org
      const filteredItems = items.filter(item => 
        item.isApproved || 
        item.contributedByOrg === req.orgId ||
        req.user?.role === 'admin'
      );
      res.json(filteredItems);
    } catch (error) {
      console.error("Error fetching question bank:", error);
      res.status(500).json({ message: "Failed to fetch question bank" });
    }
  });
  
  app.post("/api/question-bank", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { insertQuestionBankSchema } = await import("@shared/schema");
      const itemData = insertQuestionBankSchema.parse(req.body);
      
      const item = await storage.createQuestionBankItem({
        ...itemData,
        contributedBy: req.userId,
        contributedByOrg: req.orgId,
        isSystem: false,
        isApproved: false, // New items need approval
      });
      res.json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid question data", details: error.errors });
      }
      console.error("Error creating question bank item:", error);
      res.status(500).json({ message: "Failed to create question" });
    }
  });
  
  app.post("/api/question-bank/:id/use", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { assignedToUserId, order = 0 } = req.body;
      
      // When a question from the bank is used, increment its usage count
      await storage.incrementQuestionBankUsage(req.params.id);
      
      // Get the question bank item
      const bankItem = await storage.getQuestionBankItem(req.params.id);
      if (!bankItem) {
        return res.status(404).json({ message: "Question not found" });
      }
      
      // Create a question in the organization based on the bank item
      const question = await storage.createQuestion(req.orgId, {
        text: bankItem.text,
        organizationId: req.orgId,
        createdBy: req.userId,
        categoryId: bankItem.categoryId,
        bankQuestionId: bankItem.id,
        assignedToUserId: assignedToUserId || null, // Assign to specific user or all
        isFromBank: true, // Mark as from bank
        isActive: true,
        order: order,
        addToBank: false,
      });
      
      res.json(question);
    } catch (error) {
      console.error("Error using question from bank:", error);
      res.status(500).json({ message: "Failed to use question" });
    }
  });
  
  app.patch("/api/question-bank/:id/approve", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Only super admins can approve questions for the bank
      if (!req.currentUser?.isSuperAdmin) {
        return res.status(403).json({ message: "Only super admins can approve questions" });
      }
      
      const item = await storage.approveQuestionBankItem(req.params.id);
      if (!item) {
        return res.status(404).json({ message: "Question not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error approving question bank item:", error);
      res.status(500).json({ message: "Failed to approve question" });
    }
  });
  
  app.delete("/api/question-bank/:id", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Users can only delete their own unapproved contributions
      const item = await storage.getQuestionBankItem(req.params.id);
      if (!item) {
        return res.status(404).json({ message: "Question not found" });
      }
      
      if (item.isApproved && !req.currentUser?.isSuperAdmin) {
        return res.status(403).json({ message: "Cannot delete approved questions" });
      }
      
      if (item.contributedByOrg !== req.orgId && !req.currentUser?.isSuperAdmin) {
        return res.status(403).json({ message: "Can only delete your own contributions" });
      }
      
      const deleted = await storage.deleteQuestionBankItem(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Question not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting question bank item:", error);
      res.status(500).json({ message: "Failed to delete question" });
    }
  });

  // Wins
  app.get("/api/wins", requireAuth(), async (req, res) => {
    try {
      const { limit } = req.query;
      const requestedLimit = limit ? parseInt(limit as string) : 10;
      
      // Overfetch to account for filtering
      const overfetchLimit = requestedLimit * 5;
      const allWins = await storage.getRecentWins(req.orgId, overfetchLimit);
      
      // Handle super admin users who don't have regular user records
      if (req.currentUser?.isSuperAdmin) {
        // Super admins can see all wins
        const limitedWins = allWins.slice(0, requestedLimit);
        return res.json(limitedWins);
      }
      
      // Get current user
      const viewer = await storage.getUser(req.orgId, req.currentUser!.id);
      if (!viewer && !req.currentUser?.isSuperAdmin) {
        // For non-super admin users, we need their user record
        return res.status(401).json({ message: "User not found" });
      }
      
      // Get direct reports if user is a manager
      let directReportsSet = new Set<string>();
      if (viewer.role === 'manager' || viewer.role === 'admin') {
        directReportsSet = await getDirectReportsSet(req.orgId, viewer.id);
      }
      
      // Filter wins based on access permissions
      const filteredWins = allWins.filter(win => canViewWin(win, viewer, directReportsSet));
      
      // Return only the requested number of wins
      const limitedWins = filteredWins.slice(0, requestedLimit);
      
      res.json(limitedWins);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch wins" });
    }
  });

  // Public wins endpoint (no authentication required)
  app.get("/api/wins/public", async (req, res) => {
    try {
      const { limit } = req.query;
      const wins = await storage.getPublicWins(req.orgId, limit ? parseInt(limit as string) : undefined);
      res.json(wins);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch public wins" });
    }
  });

  app.post("/api/wins", requireAuth(), async (req, res) => {
    try {
      // Add userId from current user
      const bodyWithUserId = {
        ...req.body,
        userId: req.currentUser!.id
      };
      const winData = insertWinSchema.parse(bodyWithUserId);
      const sanitizedData = sanitizeForOrganization(winData, req.orgId);
      const win = await storage.createWin(req.orgId, sanitizedData);
      
      // Log successful save for debugging production issues
      console.log(`✅ Win saved successfully for user ${req.currentUser?.email} (${win.id})`);
      
      // Send response immediately to prevent timeouts in production
      res.status(201).json(win);
      
      // Handle team goals and Slack notifications asynchronously
      setImmediate(async () => {
        try {
          // Get the organization for Slack channel configuration
          const organization = await storage.getOrganization(req.orgId);
          
          // Get users involved
          const recipient = await storage.getUser(req.orgId, win.userId);
          const sender = win.nominatedBy ? await storage.getUser(req.orgId, win.nominatedBy) : null;
          
          // Auto-increment team goals for wins metric
          if (recipient?.teamId) {
            await storage.incrementGoalsByMetric(req.orgId, "wins", recipient.teamId);
          }
          
          if (recipient) {
            // Handle Slack notifications based on visibility
            if (win.isPublic && organization?.enableSlackIntegration) {
              // Public win: post to organization's configured wins channel, or fallback to main channel
              const channelId = organization?.slackWinsChannelId || organization?.slackChannelId;
              
              if (!channelId) {
                console.warn(`⚠️ No Slack channel configured for organization ${organization.name} (${organization.id})`);
                console.log(`   slack_wins_channel_id: ${organization.slackWinsChannelId}`);
                console.log(`   slack_channel_id: ${organization.slackChannelId}`);
                console.log(`   To fix: Configure a Slack channel ID in organization settings`);
              } else {
                console.log(`📢 Announcing public win to channel ${channelId} for org ${organization.name}`);
                // Add timeout to Slack notification to prevent hanging
                const notificationTimeout = new Promise<string | undefined>((resolve) => 
                  setTimeout(() => {
                    console.warn('⏱️ Slack announcement timeout - skipping');
                    resolve(undefined);
                  }, 5000)
                );
                
                const slackMessageId = await Promise.race([
                  announceWin(
                    win.title, 
                    win.description, 
                    recipient.name, 
                    sender?.name,
                    channelId,
                    req.orgId
                  ),
                  notificationTimeout
                ]);
              
                if (slackMessageId) {
                  await storage.updateWin(req.orgId, win.id, { slackMessageId });
                  console.log(`✅ Win Slack message sent with ID: ${slackMessageId}`);
                } else {
                  console.log(`⚠️ Win created but Slack notification failed or timed out`);
                }
              }
            } else {
              // Private win: send DM to recipient if they have a Slack ID
              if (recipient.slackUserId) {
                console.log(`💌 Sending private win DM to ${recipient.name} (${recipient.slackUserId})`);
                const { sendPrivateWinNotification } = await import('./services/slack');
                
                // Add timeout to Slack notification to prevent hanging
                const notificationTimeout = new Promise<string | undefined>((resolve) => 
                  setTimeout(() => {
                    console.warn('⏱️ Slack DM timeout - skipping');
                    resolve(undefined);
                  }, 5000)
                );
                
                const slackMessageId = await Promise.race([
                  sendPrivateWinNotification(
                    win.title,
                    win.description,
                    recipient.slackUserId,
                    recipient.name,
                    sender?.name || req.currentUser!.name,
                    sender?.name
                  ),
                  notificationTimeout
                ]);
                
                if (slackMessageId) {
                  await storage.updateWin(req.orgId, win.id, { slackMessageId });
                }
              } else {
                console.log(`⚠️ Cannot send private win DM to ${recipient.name}: No Slack user ID`);
              }
            }
          } else {
            console.warn(`⚠️ Could not find recipient user for win ${win.id}`);
          }
        } catch (error) {
          console.error("Failed to handle post-win tasks:", error);
        }
      });
    } catch (error) {
      console.error("Error creating win:", error);
      res.status(400).json({ message: "Invalid win data" });
    }
  });

  app.patch("/api/wins/:id", requireAuth(), async (req, res) => {
    try {
      // Use the partial insert schema for consistent validation
      const updates = insertWinSchema.partial().parse(req.body);
      const sanitizedUpdates = sanitizeForOrganization(updates, req.orgId);
      const win = await storage.updateWin(req.orgId, req.params.id, sanitizedUpdates);
      if (!win) {
        return res.status(404).json({ message: "Win not found" });
      }
      res.json(win);
    } catch (error) {
      console.error("Win update validation error:", error);
      res.status(400).json({ 
        message: "Invalid win data",
        details: error instanceof Error ? error.message : "Unknown validation error"
      });
    }
  });

  app.delete("/api/wins/:id", requireAuth(), requireRole(["admin"]), async (req, res) => {
    try {
      const deleted = await storage.deleteWin(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Win not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete win" });
    }
  });

  // Team Win Gamification Endpoints
  app.get("/api/wins/leaderboard", requireAuth(), async (req, res) => {
    try {
      const { period } = req.query;
      const validPeriods = ['all', 'week', 'month'];
      const selectedPeriod = validPeriods.includes(period as string) ? period as 'all' | 'week' | 'month' : 'all';
      
      const leaderboard = await storage.getTeamWinLeaderboard(req.orgId, selectedPeriod);
      res.json(leaderboard);
    } catch (error) {
      console.error("Failed to fetch team win leaderboard:", error);
      res.status(500).json({ message: "Failed to fetch team leaderboard" });
    }
  });

  app.get("/api/wins/team-stats/:teamId", requireAuth(), async (req, res) => {
    try {
      const { teamId } = req.params;
      
      // Verify the team belongs to the organization
      const team = await storage.getTeam(req.orgId, teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // Check if user has access to view this team's stats
      const currentUser = await storage.getUser(req.orgId, req.currentUser!.id);
      if (!currentUser && !req.currentUser?.isSuperAdmin) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // Users can view their own team stats, managers can view their teams, admins can view all
      if (currentUser && currentUser.role !== 'admin' && currentUser.teamId !== teamId) {
        if (currentUser.role !== 'manager' || team.leaderId !== currentUser.id) {
          return res.status(403).json({ message: "Not authorized to view this team's stats" });
        }
      }
      
      const stats = await storage.getTeamWinStats(req.orgId, teamId);
      if (!stats) {
        return res.status(404).json({ message: "Team stats not found" });
      }
      
      res.json(stats);
    } catch (error) {
      console.error("Failed to fetch team win stats:", error);
      res.status(500).json({ message: "Failed to fetch team stats" });
    }
  });

  // Helper function to get direct reports and team members as a Set for efficient lookup
  const getDirectReportsSet = async (orgId: string, managerId: string): Promise<Set<string>> => {
    const directReports = await storage.getUsersByManager(orgId, managerId);
    const manager = await storage.getUser(orgId, managerId);
    const teamMembers = manager?.teamId ? await storage.getUsersByTeam(orgId, manager.teamId) : [];
    
    // Combine and deduplicate user IDs
    const allAuthorizedUsers = [...directReports, ...teamMembers];
    return new Set(allAuthorizedUsers.map(user => user.id));
  };

  // Helper function to check if user can view a win
  const canViewWin = (win: any, viewer: any, directReportsSet: Set<string>): boolean => {
    // Role-based access control for wins per requirements
    
    // Admins and super admins can see all wins (public and private)
    if (viewer.role === 'admin' || viewer.role === 'super admin') {
      return true;
    }
    
    // Managers can see public wins AND private wins from their team members
    if (viewer.role === 'manager') {
      // Public wins are always visible
      if (win.isPublic) return true;
      // Private wins: only if from their team members
      if (directReportsSet.has(win.userId) || (win.nominatedBy && directReportsSet.has(win.nominatedBy))) {
        return true;
      }
      return false;
    }
    
    // Regular members can only see public wins
    if (viewer.role === 'member' || !viewer.role) {
      return win.isPublic;
    }
    
    return false;
  };

  // Helper function to check if user can access private shoutouts
  const canAccessShoutouts = (shoutout: any, currentUserId: string, user?: any): boolean => {
    // Public shoutouts are always accessible
    if (shoutout.isPublic) return true;
    
    // Private shoutouts are only accessible to:
    // 1. The giver (fromUserId)
    // 2. The recipient (toUserId)
    // 3. Admins/managers (future: when user roles are available)
    return shoutout.fromUserId === currentUserId || shoutout.toUserId === currentUserId;
  };

  // Shoutouts
  app.get("/api/shoutouts", requireAuth(), async (req, res) => {
    try {
      const { public: isPublic, userId, type, limit } = req.query;
      const currentUser = req.currentUser!;
      let shoutouts;
      
      // Apply role-based filtering
      if (currentUser.role === "admin") {
        // Admins can see all shoutouts in their organization
        if (userId) {
          shoutouts = await storage.getShoutoutsByUser(req.orgId, userId as string, type as 'received' | 'given' | undefined);
        } else if (isPublic === "true") {
          shoutouts = await storage.getPublicShoutouts(req.orgId, limit ? parseInt(limit as string) : undefined);
        } else if (type === 'received' || type === 'given') {
          // If type is specified without userId, get all shoutouts of that type
          const allShoutouts = await storage.getRecentShoutouts(req.orgId, limit ? parseInt(limit as string) : undefined);
          shoutouts = allShoutouts; // Admins see all
        } else {
          shoutouts = await storage.getRecentShoutouts(req.orgId, limit ? parseInt(limit as string) : undefined);
        }
      } else if (currentUser.role === "manager") {
        // Managers can see shoutouts for themselves and their team members
        const directReports = await storage.getUsersByManager(req.orgId, currentUser.id, true);
        const teamMembers = currentUser.teamId ? await storage.getUsersByTeam(req.orgId, currentUser.teamId, true) : [];
        
        // Combine and deduplicate user IDs (including the manager themselves)
        const authorizedUserIds = new Set([
          currentUser.id,
          ...directReports.map(u => u.id),
          ...teamMembers.map(u => u.id)
        ]);
        
        if (userId && authorizedUserIds.has(userId as string)) {
          shoutouts = await storage.getShoutoutsByUser(req.orgId, userId as string, type as 'received' | 'given' | undefined);
        } else if (isPublic === "true") {
          shoutouts = await storage.getPublicShoutouts(req.orgId, limit ? parseInt(limit as string) : undefined);
        } else {
          // Get all recent shoutouts and filter to authorized users
          const allShoutouts = await storage.getRecentShoutouts(req.orgId, limit ? parseInt(limit as string) * 3 : undefined);
          shoutouts = allShoutouts.filter(s => 
            authorizedUserIds.has(s.fromUserId) || 
            authorizedUserIds.has(s.toUserId)
          );
          if (limit) {
            shoutouts = shoutouts.slice(0, parseInt(limit as string));
          }
        }
      } else {
        // Members can only see their own shoutouts (given or received)
        // Ignore userId parameter for members - they can only see their own data
        shoutouts = await storage.getShoutoutsByUser(req.orgId, currentUser.id, type as 'received' | 'given' | undefined);
        if (limit) {
          shoutouts = shoutouts.slice(0, parseInt(limit as string));
        }
      }
      
      res.json(shoutouts);
    } catch (error) {
      console.error("Failed to fetch shoutouts:", error);
      res.status(500).json({ message: "Failed to fetch shoutouts" });
    }
  });

  app.get("/api/shoutouts/:id", requireAuth(), async (req, res) => {
    try {
      const shoutout = await storage.getShoutout(req.orgId, req.params.id);
      if (!shoutout) {
        return res.status(404).json({ message: "Shoutout not found" });
      }
      
      const currentUserId = req.userId!;
      
      // Check if user can access this shoutout (privacy enforcement)
      if (!canAccessShoutouts(shoutout, currentUserId)) {
        return res.status(404).json({ message: "Shoutout not found" }); // Don't reveal existence
      }
      
      res.json(shoutout);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch shoutout" });
    }
  });

  app.post("/api/shoutouts", requireAuth(), async (req, res) => {
    try {
      // Custom schema for multi-recipient shoutouts - omit server-side fields
      const multiShoutoutSchema = insertShoutoutSchema.omit({
        toUserId: true,
        toTeamId: true,
        fromUserId: true,
        organizationId: true,
        slackMessageId: true
      }).extend({
        toUserIds: z.array(z.string()).min(1, "At least one recipient is required").optional(),
        toTeamId: z.string().optional()
      }).refine((data) => {
        // Either toUserIds OR toTeamId must be provided, not both
        return (data.toUserIds && data.toUserIds.length > 0) || data.toTeamId;
      }, {
        message: "Either individual recipients or a team must be selected"
      });
      
      const shoutoutData = multiShoutoutSchema.parse(req.body);
      
      // Enforce authentication
      if (!req.currentUser?.id) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const currentUserId = req.currentUser.id;
      
      const createdShoutouts = [];
      
      // Handle team shoutout
      if (shoutoutData.toTeamId) {
        // Validate team exists
        const team = await storage.getTeam(req.orgId, shoutoutData.toTeamId);
        if (!team) {
          return res.status(400).json({ 
            message: "Invalid team", 
            details: `Team ${shoutoutData.toTeamId} not found in organization` 
          });
        }
        
        // Create team shoutout
        const teamShoutout = {
          ...shoutoutData,
          toTeamId: shoutoutData.toTeamId,
          toUserId: null, // Explicitly null for team shoutouts
          fromUserId: currentUserId
        };
        
        // Remove toUserIds and toTeamId from the data that goes to the database (they're already set above)
        const { toUserIds, toTeamId, ...dbData } = teamShoutout;
        
        const sanitizedData = sanitizeForOrganization({
          ...dbData,
          toTeamId: teamShoutout.toTeamId,
          toUserId: teamShoutout.toUserId
        }, req.orgId);
        const shoutout = await storage.createShoutout(req.orgId, sanitizedData);
        createdShoutouts.push(shoutout);
        
        // Auto-increment team goals for kudos given metric (team shoutout)
        if (shoutoutData.toTeamId) {
          await storage.incrementGoalsByMetric(req.orgId, "kudos given", shoutoutData.toTeamId);
        }
        
        // Send Slack notification if public and Slack integration is enabled
        const organization = await storage.getOrganization(req.orgId);
        if (shoutout.isPublic && organization?.enableSlackIntegration) {
          const fromUser = await storage.getUser(req.orgId, shoutout.fromUserId);
          
          if (fromUser && team) {
            const channelId = organization?.slackWinsChannelId || organization?.slackChannelId;
            if (!channelId) {
              console.warn(`⚠️ No Slack channel configured for organization ${organization.name} (team shoutout)`);
            } else {
              // Send Slack notification asynchronously to prevent blocking
              setImmediate(async () => {
                try {
                  console.log(`📢 Announcing team shoutout to channel ${channelId} for org ${organization.name}`);
                  
                  // Add timeout to prevent long-running Slack API calls
                  const slackPromise = announceShoutout(
                    shoutout.message,
                    fromUser.name,
                    `Team ${team.name}`, // Use team name for Slack notification
                    shoutout.values,
                    channelId,
                    req.orgId
                  );
                  
                  const timeoutPromise = new Promise<null>((resolve) => {
                    setTimeout(() => resolve(null), 5000);
                  });
                  
                  const slackMessageId = await Promise.race([slackPromise, timeoutPromise]);
                  
                  if (slackMessageId) {
                    await storage.updateShoutout(req.orgId, shoutout.id, { slackMessageId });
                    console.log(`✅ Team shoutout Slack message sent with ID: ${slackMessageId}`);
                  } else {
                    console.warn("⏱️ Slack notification timed out for team shoutout");
                  }
                } catch (slackError) {
                  console.warn("Failed to send Slack notification for team shoutout:", slackError);
                }
              });
            }
          }
        }
      } 
      // Handle individual shoutouts
      else if (shoutoutData.toUserIds) {
        // Validate and deduplicate recipients
        const uniqueRecipientIds = [...new Set(shoutoutData.toUserIds)];
        
        // Validate all recipients exist in the organization
        for (const recipientId of uniqueRecipientIds) {
          const recipientUser = await storage.getUser(req.orgId, recipientId);
          if (!recipientUser) {
            return res.status(400).json({ 
              message: "Invalid recipient", 
              details: `User ${recipientId} not found in organization` 
            });
          }
        }
        
        // Create individual shoutouts for each recipient
        for (const toUserId of uniqueRecipientIds) {
          // SECURITY: Never accept fromUserId from client - set server-side
          const individualShoutout = {
            ...shoutoutData,
            toUserId, // Set individual recipient
            toTeamId: null, // Explicitly null for individual shoutouts
            fromUserId: currentUserId
          };
          
          // Remove toUserIds from the data that goes to the database
          const { toUserIds, toTeamId, ...dbData } = individualShoutout;
          
          const sanitizedData = sanitizeForOrganization({
            ...dbData,
            toUserId: individualShoutout.toUserId,
            toTeamId: individualShoutout.toTeamId
          }, req.orgId);
          const shoutout = await storage.createShoutout(req.orgId, sanitizedData);
          createdShoutouts.push(shoutout);
          
          // Auto-increment team goals for kudos given metric (individual shoutout)
          // Use sender's team ID for goal tracking
          if (req.currentUser?.teamId) {
            await storage.incrementGoalsByMetric(req.orgId, "kudos given", req.currentUser.teamId);
          }
          
          // Send Slack notification if public and Slack integration is enabled
          const organization = await storage.getOrganization(req.orgId);
          if (shoutout.isPublic && organization?.enableSlackIntegration) {
            const fromUser = await storage.getUser(req.orgId, shoutout.fromUserId);
            const toUser = await storage.getUser(req.orgId, shoutout.toUserId!);
            
            if (fromUser && toUser) {
              const channelId = organization?.slackWinsChannelId || organization?.slackChannelId;
              if (!channelId) {
                console.warn(`⚠️ No Slack channel configured for organization ${organization.name} (individual shoutout)`);
              } else {
                // Send Slack notification asynchronously to prevent blocking
                setImmediate(async () => {
                  try {
                    console.log(`📢 Announcing shoutout to channel ${channelId} for org ${organization.name}`);
                    
                    // Add timeout to prevent long-running Slack API calls
                    const slackPromise = announceShoutout(
                      shoutout.message,
                      fromUser.name,
                      toUser.name,
                      shoutout.values,
                      channelId,
                      req.orgId
                    );
                    
                    const timeoutPromise = new Promise<null>((resolve) => {
                      setTimeout(() => resolve(null), 5000);
                    });
                    
                    const slackMessageId = await Promise.race([slackPromise, timeoutPromise]);
                    
                    if (slackMessageId) {
                      await storage.updateShoutout(req.orgId, shoutout.id, { slackMessageId });
                      console.log(`✅ Shoutout Slack message sent with ID: ${slackMessageId}`);
                    } else {
                      console.warn("⏱️ Slack notification timed out for individual shoutout");
                    }
                  } catch (slackError) {
                    console.warn("Failed to send Slack notification for shoutout:", slackError);
                  }
                });
              }
            }
          }
        }
      }
      
      res.status(201).json(createdShoutouts);
    } catch (error) {
      console.error("Shoutout creation error:", error);
      
      // Return 400 for validation errors, 500 for server errors
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid shoutout data",
          details: error.message
        });
      }
      
      res.status(500).json({ 
        message: "Failed to create shoutouts",
        details: error instanceof Error ? error.message : "Unknown server error"
      });
    }
  });

  app.patch("/api/shoutouts/:id", requireAuth(), async (req, res) => {
    try {
      // Use separate update schema that only allows safe fields
      const updates = updateShoutoutSchema.parse(req.body);
      
      // TODO: Replace with actual authenticated user ID when auth is implemented
      const currentUserId = "current-user-id";
      
      // Check if shoutout exists and user has permission to edit
      const existingShoutout = await storage.getShoutout(req.orgId, req.params.id);
      if (!existingShoutout) {
        return res.status(404).json({ message: "Shoutout not found" });
      }
      
      // Only the original giver can edit shoutouts
      if (existingShoutout.fromUserId !== currentUserId) {
        return res.status(403).json({ message: "You can only edit shoutouts you sent" });
      }
      
      const sanitizedUpdates = sanitizeForOrganization(updates, req.orgId);
      const shoutout = await storage.updateShoutout(req.orgId, req.params.id, sanitizedUpdates);
      if (!shoutout) {
        return res.status(404).json({ message: "Shoutout not found" });
      }
      res.json(shoutout);
    } catch (error) {
      console.error("Shoutout update validation error:", error);
      res.status(400).json({ 
        message: "Invalid shoutout data",
        details: error instanceof Error ? error.message : "Unknown validation error"
      });
    }
  });

  app.delete("/api/shoutouts/:id", requireAuth(), requireRole(["admin"]), async (req, res) => {
    try {
      const deleted = await storage.deleteShoutout(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Shoutout not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete shoutout" });
    }
  });

  // Post Reactions (for Wins and Shoutouts)
  app.get("/api/:postType/:id/reactions", requireAuth(), async (req, res) => {
    try {
      const { postType, id } = req.params;
      
      if (postType !== 'wins' && postType !== 'shoutouts') {
        return res.status(400).json({ message: "Invalid post type" });
      }
      
      const postTypeForDb = postType === 'wins' ? 'win' : 'shoutout';
      const reactions = await storage.getReactionsByPost(req.orgId, id, postTypeForDb as 'win' | 'shoutout');
      
      // Get user info for reactions
      const userIds = [...new Set(reactions.map(r => r.userId))];
      const users = await Promise.all(userIds.map(userId => storage.getUser(req.orgId, userId)));
      const userMap = new Map(users.filter(u => u).map(u => [u!.id, u!]));
      
      // Group reactions by emoji with user info
      const reactionGroups = reactions.reduce((acc, reaction) => {
        if (!acc[reaction.emoji]) {
          acc[reaction.emoji] = {
            emoji: reaction.emoji,
            count: 0,
            users: [],
            hasUserReacted: false
          };
        }
        
        const user = userMap.get(reaction.userId);
        if (user) {
          acc[reaction.emoji].users.push({
            id: user.id,
            name: user.name
          });
        }
        
        if (reaction.userId === req.currentUser!.id) {
          acc[reaction.emoji].hasUserReacted = true;
        }
        
        acc[reaction.emoji].count++;
        return acc;
      }, {} as Record<string, any>);
      
      res.json(Object.values(reactionGroups));
    } catch (error) {
      console.error("Failed to fetch reactions:", error);
      res.status(500).json({ message: "Failed to fetch reactions" });
    }
  });

  app.post("/api/reactions", requireAuth(), async (req, res) => {
    try {
      const { postId, postType, emoji } = req.body;
      
      if (!postId || !postType || !emoji) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      if (postType !== 'win' && postType !== 'shoutout') {
        return res.status(400).json({ message: "Invalid post type" });
      }
      
      const reaction = await storage.addReaction({
        postId,
        postType,
        emoji,
        userId: req.currentUser!.id,
        organizationId: req.orgId
      });
      
      res.status(201).json(reaction);
    } catch (error) {
      console.error("Failed to add reaction:", error);
      res.status(500).json({ message: "Failed to add reaction" });
    }
  });

  app.delete("/api/reactions/:id", requireAuth(), async (req, res) => {
    try {
      // First check if the reaction exists and belongs to the user
      const reactions = await storage.getUserReactionsByPost(req.currentUser!.id, req.params.id, 'win');
      const winReaction = reactions.find(r => r.id === req.params.id);
      
      if (!winReaction) {
        // Check shoutouts if not found in wins
        const shoutoutReactions = await storage.getUserReactionsByPost(req.currentUser!.id, req.params.id, 'shoutout');
        const shoutoutReaction = shoutoutReactions.find(r => r.id === req.params.id);
        
        if (!shoutoutReaction) {
          return res.status(404).json({ message: "Reaction not found or unauthorized" });
        }
      }
      
      const deleted = await storage.removeReaction(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Reaction not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete reaction:", error);
      res.status(500).json({ message: "Failed to delete reaction" });
    }
  });

  // Notifications
  app.get("/api/notifications", requireAuth(), async (req, res) => {
    try {
      const { limit } = req.query;
      const notifications = await storage.getNotificationsByUser(
        req.orgId, 
        req.userId!, 
        limit ? parseInt(limit as string) : undefined
      );
      res.json(notifications);
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth(), async (req, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.orgId, req.userId!);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth(), async (req, res) => {
    try {
      // Verify the notification belongs to the current user
      const notification = await storage.getNotification(req.orgId, req.params.id);
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }
      if (notification.userId !== req.userId) {
        return res.status(403).json({ message: "Cannot mark another user's notification as read" });
      }

      const updated = await storage.markNotificationAsRead(req.orgId, req.params.id);
      if (!updated) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/read-all", requireAuth(), async (req, res) => {
    try {
      const count = await storage.markAllNotificationsAsRead(req.orgId, req.userId!);
      res.json({ count, message: `Marked ${count} notifications as read` });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  app.delete("/api/notifications/:id", requireAuth(), async (req, res) => {
    try {
      // Verify the notification belongs to the current user
      const notification = await storage.getNotification(req.orgId, req.params.id);
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }
      if (notification.userId !== req.userId) {
        return res.status(403).json({ message: "Cannot delete another user's notification" });
      }

      const deleted = await storage.deleteNotification(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete notification" });
    }
  });

  // Admin endpoint to create org-wide notifications
  app.post("/api/admin/notifications", requireAuth(), requireRole(["admin", "super_admin"]), async (req, res) => {
    try {
      const { title, message, type = "info", metadata } = req.body;
      
      if (!title || !message) {
        return res.status(400).json({ message: "Title and message are required" });
      }
      
      // Get all active users in the organization
      const allUsers = await storage.getAllUsers(req.orgId, false); // false = only active users
      
      if (allUsers.length === 0) {
        return res.status(400).json({ message: "No active users found in organization" });
      }
      
      // Create notifications for all users
      const notificationsToCreate: InsertNotification[] = allUsers.map(user => ({
        userId: user.id,
        type,
        title,
        message,
        isRead: false,
        metadata: metadata || {},
        createdBy: req.userId
      }));
      
      const createdNotifications = await storage.createBulkNotifications(req.orgId, notificationsToCreate);
      
      res.json({
        message: `Successfully created ${createdNotifications.length} notifications`,
        count: createdNotifications.length
      });
    } catch (error) {
      console.error("Failed to create bulk notifications:", error);
      res.status(500).json({ message: "Failed to create notifications" });
    }
  });

  // User Tours routes
  app.get("/api/tours", requireAuth(), async (req, res) => {
    try {
      const tours = await storage.getUserTours(req.orgId, req.userId!);
      res.json(tours);
    } catch (error) {
      console.error("Failed to fetch tours:", error);
      res.status(500).json({ message: "Failed to fetch tours" });
    }
  });

  app.get("/api/tours/:tourId", requireAuth(), async (req, res) => {
    try {
      const tour = await storage.getUserTour(req.orgId, req.userId!, req.params.tourId);
      if (!tour) {
        // Create a new tour record if it doesn't exist
        const newTour = await storage.createUserTour(req.orgId, {
          userId: req.userId!,
          tourId: req.params.tourId,
          status: 'not_started',
          currentStep: 0,
          version: '1.0'
        });
        return res.json(newTour);
      }
      res.json(tour);
    } catch (error) {
      console.error("Failed to fetch tour:", error);
      res.status(500).json({ message: "Failed to fetch tour" });
    }
  });

  app.post("/api/tours/:tourId/complete", requireAuth(), async (req, res) => {
    try {
      const tour = await storage.markTourCompleted(req.orgId, req.userId!, req.params.tourId);
      if (!tour) {
        // Create and complete if it doesn't exist
        await storage.createUserTour(req.orgId, {
          userId: req.userId!,
          tourId: req.params.tourId,
          status: 'completed',
          completedAt: new Date(),
          version: '1.0'
        });
        const completedTour = await storage.getUserTour(req.orgId, req.userId!, req.params.tourId);
        return res.json(completedTour);
      }
      res.json(tour);
    } catch (error) {
      console.error("Failed to complete tour:", error);
      res.status(500).json({ message: "Failed to complete tour" });
    }
  });

  app.post("/api/tours/:tourId/skip", requireAuth(), async (req, res) => {
    try {
      const tour = await storage.markTourSkipped(req.orgId, req.userId!, req.params.tourId);
      if (!tour) {
        // Create and skip if it doesn't exist
        await storage.createUserTour(req.orgId, {
          userId: req.userId!,
          tourId: req.params.tourId,
          status: 'skipped',
          skippedAt: new Date(),
          version: '1.0'
        });
        const skippedTour = await storage.getUserTour(req.orgId, req.userId!, req.params.tourId);
        return res.json(skippedTour);
      }
      res.json(tour);
    } catch (error) {
      console.error("Failed to skip tour:", error);
      res.status(500).json({ message: "Failed to skip tour" });
    }
  });

  app.post("/api/tours/:tourId/reset", requireAuth(), async (req, res) => {
    try {
      const tour = await storage.resetUserTour(req.orgId, req.userId!, req.params.tourId);
      if (!tour) {
        // Create a new tour if it doesn't exist
        const newTour = await storage.createUserTour(req.orgId, {
          userId: req.userId!,
          tourId: req.params.tourId,
          status: 'not_started',
          currentStep: 0,
          version: '1.0'
        });
        return res.json(newTour);
      }
      res.json(tour);
    } catch (error) {
      console.error("Failed to reset tour:", error);
      res.status(500).json({ message: "Failed to reset tour" });
    }
  });

  app.patch("/api/tours/:tourId", requireAuth(), async (req, res) => {
    try {
      const { currentStep, status, lastShownAt } = req.body;
      
      // Check if tour exists first
      let tour = await storage.getUserTour(req.orgId, req.userId!, req.params.tourId);
      
      if (!tour) {
        // Create new tour with the provided data
        tour = await storage.createUserTour(req.orgId, {
          userId: req.userId!,
          tourId: req.params.tourId,
          status: status || 'in_progress',
          currentStep: currentStep || 0,
          lastShownAt: lastShownAt || new Date(),
          version: '1.0'
        });
      } else {
        // Update existing tour
        tour = await storage.updateUserTour(req.orgId, req.userId!, req.params.tourId, {
          ...(currentStep !== undefined && { currentStep }),
          ...(status !== undefined && { status }),
          ...(lastShownAt !== undefined && { lastShownAt })
        });
      }
      
      res.json(tour);
    } catch (error) {
      console.error("Failed to update tour:", error);
      res.status(500).json({ message: "Failed to update tour" });
    }
  });

  // User-specific shoutouts endpoint
  app.get("/api/users/:id/shoutouts", async (req, res) => {
    try {
      const { type, limit } = req.query;
      const shoutouts = await storage.getShoutoutsByUser(
        req.orgId, 
        req.params.id, 
        type as 'received' | 'given' | undefined
      );
      
      const limitedShoutouts = limit ? shoutouts.slice(0, parseInt(limit as string)) : shoutouts;
      res.json(limitedShoutouts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user shoutouts" });
    }
  });

  // Comments
  app.get("/api/checkins/:id/comments", async (req, res) => {
    try {
      const comments = await storage.getCommentsByCheckin(req.orgId, req.params.id);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.post("/api/checkins/:id/comments", async (req, res) => {
    try {
      const commentData = insertCommentSchema.parse({
        ...req.body,
        checkinId: req.params.id,
      });
      const sanitizedData = sanitizeForOrganization(commentData, req.orgId);
      const comment = await storage.createComment(req.orgId, sanitizedData);
      res.status(201).json(comment);
    } catch (error) {
      res.status(400).json({ message: "Invalid comment data" });
    }
  });

  app.patch("/api/comments/:id", requireAuth(), async (req, res) => {
    try {
      // Only allow updating the content field for security
      const updateSchema = z.object({ content: z.string().min(1, "Content is required") });
      const updates = updateSchema.parse(req.body);
      const comment = await storage.updateComment(req.orgId, req.params.id, updates);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      res.json(comment);
    } catch (error) {
      res.status(400).json({ message: "Invalid comment data" });
    }
  });

  app.delete("/api/comments/:id", requireAuth(), async (req, res) => {
    try {
      const deleted = await storage.deleteComment(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Comment not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });

  // Vacations
  app.get("/api/vacations", authenticateUser(), requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      const query = vacationQuerySchema.parse(req.query);
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      // Determine which user's vacations to fetch
      let targetUserId = currentUser.id;
      
      // Admins can fetch vacations for any user via userId query param
      if (query.userId && currentUser.role === "admin") {
        // Verify the user exists in the organization
        const targetUser = await storage.getUser(req.orgId, query.userId);
        if (!targetUser) {
          return res.status(404).json({ 
            message: "User not found in this organization" 
          });
        }
        targetUserId = query.userId;
      }
      
      // Fetch vacations for the target user
      const vacations = await storage.getUserVacationsByRange(
        req.orgId, 
        targetUserId, 
        query.from, 
        query.to
      );
      
      res.json(vacations);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      console.error("Failed to fetch vacations:", error);
      res.status(500).json({ message: "Failed to fetch vacations" });
    }
  });

  app.post("/api/vacations", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      const vacationData = insertVacationSchema.parse(req.body);
      
      // Security: Always use the current user's ID, never trust client data
      const sanitizedData = {
        ...vacationData,
        userId: currentUser.id,
      };
      
      const vacation = await storage.upsertVacationWeek(
        req.orgId,
        currentUser.id,
        sanitizedData.weekOf,
        sanitizedData.note
      );
      
      res.status(201).json(vacation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid vacation data",
          details: error.errors
        });
      }
      console.error("Failed to create/update vacation:", error);
      res.status(500).json({ message: "Failed to create/update vacation" });
    }
  });

  app.delete("/api/vacations/:weekOf", requireAuth(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      const params = vacationParamSchema.parse(req.params);
      
      // Users can only delete their own vacations
      const deleted = await storage.deleteVacationWeek(
        req.orgId,
        currentUser.id,
        params.weekOf
      );
      
      if (!deleted) {
        return res.status(404).json({ message: "Vacation week not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid weekOf parameter",
          details: error.errors
        });
      }
      console.error("Failed to delete vacation:", error);
      res.status(500).json({ message: "Failed to delete vacation" });
    }
  });

  // Admin vacation management endpoints
  // Allows admins to mark vacations for any user in their organization
  app.post("/api/admin/vacations", requireAuth(), requireRole("admin"), async (req, res) => {
    try {
      const { userId, weekOf, note } = req.body;
      
      if (!userId || !weekOf) {
        return res.status(400).json({ 
          message: "Missing required fields: userId and weekOf" 
        });
      }

      // Verify the user exists in the organization
      const targetUser = await storage.getUser(req.orgId, userId);
      if (!targetUser) {
        return res.status(404).json({ 
          message: "User not found in this organization" 
        });
      }

      // Parse and validate the week date
      const weekDate = new Date(weekOf);
      if (isNaN(weekDate.getTime())) {
        return res.status(400).json({ 
          message: "Invalid date format for weekOf" 
        });
      }

      const vacation = await storage.upsertVacationWeek(
        req.orgId,
        userId,
        weekDate,
        note
      );
      
      res.status(201).json(vacation);
    } catch (error) {
      console.error("Failed to create vacation for user:", error);
      res.status(500).json({ 
        message: "Failed to create vacation",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Admin endpoint to delete a vacation for any user
  app.delete("/api/admin/vacations/:userId/:weekOf", requireAuth(), requireRole("admin"), async (req, res) => {
    try {
      const { userId, weekOf } = req.params;
      
      // Verify the user exists in the organization
      const targetUser = await storage.getUser(req.orgId, userId);
      if (!targetUser) {
        return res.status(404).json({ 
          message: "User not found in this organization" 
        });
      }

      // Parse and validate the week date
      const weekDate = new Date(weekOf);
      if (isNaN(weekDate.getTime())) {
        return res.status(400).json({ 
          message: "Invalid date format for weekOf" 
        });
      }

      const deleted = await storage.deleteVacationWeek(
        req.orgId,
        userId,
        weekDate
      );
      
      if (!deleted) {
        return res.status(404).json({ 
          message: "Vacation week not found for this user" 
        });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete vacation for user:", error);
      res.status(500).json({ 
        message: "Failed to delete vacation",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Analytics & Stats
  app.get("/api/analytics/team-health", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      let recentCheckins;
      let relevantUsers;
      
      // Filter data based on user role
      if (currentUser.role === "member") {
        // Members only see their own data
        recentCheckins = await storage.getCheckinsByUser(req.orgId, currentUser.id);
        relevantUsers = [currentUser];
      } else if (currentUser.role === "manager") {
        // Managers see their team's data (them + their direct reports)
        const teamMembers = await storage.getUsersByManager(req.orgId, currentUser.id, true);
        const teamUserIds = [currentUser.id, ...teamMembers.map(u => u.id)];
        
        // Get checkins for all team members
        const allCheckins = await storage.getRecentCheckins(req.orgId, 1000);
        recentCheckins = allCheckins.filter(checkin => 
          teamUserIds.includes(checkin.userId)
        );
        
        // Include self and team members for completion calculation
        relevantUsers = [currentUser, ...teamMembers].filter(u => u.isActive);
      } else {
        // Admins see organization-wide data
        recentCheckins = await storage.getRecentCheckins(req.orgId, 100);
        const allUsers = await storage.getAllUsers(req.orgId);
        relevantUsers = allUsers.filter(user => user.isActive);
      }
      
      const totalCheckins = recentCheckins.length;
      
      // Get compliance metrics for the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Determine compliance scope based on role
      let complianceScope = 'organization';
      let complianceId = undefined;
      
      if (currentUser.role === "member") {
        complianceScope = 'user';
        complianceId = currentUser.id;
      } else if (currentUser.role === "manager" && currentUser.teamId) {
        complianceScope = 'team';
        complianceId = currentUser.teamId;
      }
      
      const [checkinCompliance, reviewCompliance] = await Promise.all([
        storage.getCheckinComplianceMetrics(req.orgId, {
          scope: complianceScope as any,
          entityId: complianceId,
          from: thirtyDaysAgo
        }),
        storage.getReviewComplianceMetrics(req.orgId, {
          scope: complianceScope as any,
          entityId: complianceId,
          from: thirtyDaysAgo
        })
      ]);
      
      // Extract latest compliance metrics (most recent period if multiple, or aggregate if single)
      const latestCheckinCompliance = checkinCompliance.length > 0 ? 
        checkinCompliance[checkinCompliance.length - 1].metrics || checkinCompliance[0] : 
        { totalCount: 0, onTimeCount: 0, onTimePercentage: 0, averageDaysEarly: 0, averageDaysLate: 0 };
        
      const latestReviewCompliance = reviewCompliance.length > 0 ? 
        reviewCompliance[reviewCompliance.length - 1].metrics || reviewCompliance[0] : 
        { totalCount: 0, onTimeCount: 0, onTimePercentage: 0, averageDaysEarly: 0, averageDaysLate: 0 };
      
      if (totalCheckins === 0) {
        return res.json({
          averageRating: 0,
          completionRate: 0,
          totalCheckins: 0,
          checkinCompliance: latestCheckinCompliance,
          reviewCompliance: latestReviewCompliance
        });
      }
      
      const sumRatings = recentCheckins.reduce((sum, checkin) => sum + checkin.overallMood, 0);
      const averageRating = sumRatings / totalCheckins;
      
      // Calculate completion rate for current week (based on relevant users only)
      const organization = await storage.getOrganization(req.orgId);
      const weekStart = getWeekStartCentral(new Date(), organization);
      const completedThisWeek = recentCheckins.filter(checkin => {
        return checkin.weekOf >= weekStart && checkin.isComplete;
      }).length;
      
      const completionRate = relevantUsers.length > 0 
        ? Math.round((completedThisWeek / relevantUsers.length) * 100)
        : 0;
      
      res.json({
        averageRating: Math.round(averageRating * 10) / 10,
        completionRate,
        totalCheckins,
        checkinCompliance: latestCheckinCompliance,
        reviewCompliance: latestReviewCompliance
      });
    } catch (error) {
      console.error("Team health analytics error:", error);
      res.status(500).json({ message: "Failed to fetch team health analytics" });
    }
  });

  // Analytics - Pulse Metrics
  app.get("/api/analytics/pulse", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = analyticsBaseSchema.parse(req.query);
      
      // Validate scope and id relationship
      if ((query.scope === 'team' || query.scope === 'user') && !query.id) {
        return res.status(400).json({ message: "ID is required for team and user scopes" });
      }
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      const metrics = await storage.getPulseMetrics(req.orgId, {
        scope: query.scope as AnalyticsScope,
        entityId: query.id,
        period: query.period as AnalyticsPeriod,
        from: query.from,
        to: query.to,
      });
      
      res.json(metrics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to fetch pulse analytics" });
    }
  });

  // Analytics - Shoutout Metrics  
  app.get("/api/analytics/shoutouts", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = shoutoutAnalyticsSchema.parse(req.query);
      
      // Validate scope and id relationship
      if ((query.scope === 'team' || query.scope === 'user') && !query.id) {
        return res.status(400).json({ message: "ID is required for team and user scopes" });
      }
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      const metrics = await storage.getShoutoutMetrics(req.orgId, {
        scope: query.scope as AnalyticsScope,
        entityId: query.id,
        period: query.period as AnalyticsPeriod,
        direction: query.direction as ShoutoutDirection,
        visibility: query.visibility as ShoutoutVisibility,
        from: query.from,
        to: query.to,
      });
      
      res.json(metrics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to fetch shoutout analytics" });
    }
  });

  // Analytics - Leaderboard
  app.get("/api/analytics/leaderboard", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = leaderboardSchema.parse(req.query);
      
      // Validate scope and id relationship
      if ((query.scope === 'team' || query.scope === 'user') && !query.id) {
        return res.status(400).json({ message: "ID is required for team and user scopes" });
      }
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      const leaderboard = await storage.getLeaderboard(req.orgId, {
        metric: query.metric as LeaderboardMetric,
        scope: query.scope as AnalyticsScope,
        entityId: query.id,
        period: query.period as AnalyticsPeriod,
        from: query.from,
        to: query.to,
      });
      
      res.json(leaderboard);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to fetch leaderboard analytics" });
    }
  });

  // Analytics - Overview
  app.get("/api/analytics/overview", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = overviewSchema.parse(req.query);
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      // Provide default date range if not specified (last 30 days for monthly period, adjust accordingly)
      const defaultTo = new Date();
      const defaultFrom = new Date(defaultTo.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago
      
      const overview = await storage.getAnalyticsOverview(
        req.orgId,
        query.period as AnalyticsPeriod,
        query.from || defaultFrom,
        query.to || defaultTo
      );
      
      res.json(overview);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to fetch analytics overview" });
    }
  });

  // Analytics - Check-in Compliance
  app.get("/api/analytics/checkin-compliance", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = complianceAnalyticsSchema.parse(req.query);
      
      // Validate scope and id relationship
      if ((query.scope === 'team' || query.scope === 'user') && !query.id) {
        return res.status(400).json({ message: "ID is required for team and user scopes" });
      }
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      const metrics = await storage.getCheckinComplianceMetrics(req.orgId, {
        scope: query.scope as AnalyticsScope,
        entityId: query.id,
        period: query.period as AnalyticsPeriod,
        from: query.from,
        to: query.to,
      });
      
      res.json(metrics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to fetch check-in compliance metrics" });
    }
  });

  // Analytics - Review Compliance
  app.get("/api/analytics/review-compliance", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = complianceAnalyticsSchema.parse(req.query);
      
      // Validate scope and id relationship
      if ((query.scope === 'team' || query.scope === 'user') && !query.id) {
        return res.status(400).json({ message: "ID is required for team and user scopes" });
      }
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      const metrics = await storage.getReviewComplianceMetrics(req.orgId, {
        scope: query.scope as AnalyticsScope,
        entityId: query.id,
        period: query.period as AnalyticsPeriod,
        from: query.from,
        to: query.to,
      });
      
      res.json(metrics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to fetch review compliance metrics" });
    }
  });

  // Analytics - Team Compliance Batch (eliminates N+1 queries)
  app.get("/api/analytics/team-compliance", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = z.object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        period: z.enum(['week', 'month', 'quarter', 'year']).optional()
      }).parse(req.query);
      
      // Validate date range
      if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      // Get all teams for the organization
      const teams = await storage.getAllTeams(req.orgId);
      
      // Fetch compliance metrics for all teams in parallel
      const teamCompliancePromises = teams.map(async (team) => {
        const [checkinCompliance, reviewCompliance] = await Promise.all([
          storage.getCheckinComplianceMetrics(req.orgId, {
            scope: 'team',
            entityId: team.id,
            period: query.period as AnalyticsPeriod,
            from: query.from ? new Date(query.from) : undefined,
            to: query.to ? new Date(query.to) : undefined,
          }),
          storage.getReviewComplianceMetrics(req.orgId, {
            scope: 'team',
            entityId: team.id,
            period: query.period as AnalyticsPeriod,
            from: query.from ? new Date(query.from) : undefined,
            to: query.to ? new Date(query.to) : undefined,
          })
        ]);
        
        // Extract latest metrics (most recent period if multiple, or aggregate if single)
        const latestCheckinMetrics = checkinCompliance.length > 0 ? 
          checkinCompliance[checkinCompliance.length - 1].metrics || checkinCompliance[0].metrics || checkinCompliance[0] : 
          { totalCount: 0, onTimeCount: 0, onTimePercentage: 0 };
          
        const latestReviewMetrics = reviewCompliance.length > 0 ? 
          reviewCompliance[reviewCompliance.length - 1].metrics || reviewCompliance[0].metrics || reviewCompliance[0] : 
          { totalCount: 0, onTimeCount: 0, onTimePercentage: 0 };
        
        return {
          teamId: team.id,
          teamName: team.name,
          checkinCompliance: latestCheckinMetrics,
          reviewCompliance: latestReviewMetrics
        };
      });
      
      const teamCompliance = await Promise.all(teamCompliancePromises);
      
      res.json(teamCompliance);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      console.error("Team compliance batch analytics error:", error);
      res.status(500).json({ message: "Failed to fetch team compliance metrics" });
    }
  });

  // Compliance Tracking Endpoints
  // Get missing check-ins (users who haven't submitted for a given week)
  app.get("/api/compliance/missing-checkins", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { weekOf, teamId } = req.query;
      
      // Parse weekOf date if provided
      const targetDate = weekOf ? new Date(weekOf as string) : new Date();
      
      // For managers, optionally filter by their teams
      const user = req.currentUser!;
      let filterTeamId: string | undefined = teamId as string | undefined;
      
      // If user is a manager (not admin), they can only see their team's data
      if (user.role === 'manager') {
        const managerDetails = await storage.getUser(req.orgId, user.id);
        if (managerDetails?.teamId) {
          filterTeamId = managerDetails.teamId; // Override to ensure managers only see their team
        }
      }
      
      // Get missing check-ins data
      const missingCheckins = await storage.getMissingCheckins(req.orgId, targetDate, filterTeamId);
      
      res.json(missingCheckins);
    } catch (error) {
      console.error("Failed to fetch missing check-ins:", error);
      res.status(500).json({ message: "Failed to fetch missing check-ins" });
    }
  });

  // Get pending reviews (check-ins awaiting manager review)
  app.get("/api/compliance/pending-reviews", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { teamId } = req.query;
      const user = req.currentUser!;
      
      // For managers, filter by their assigned reviews
      let filterManagerId: string | undefined = undefined;
      let filterTeamId: string | undefined = teamId as string | undefined;
      
      if (user.role === 'manager') {
        filterManagerId = user.id; // Managers only see reviews assigned to them
        
        // Additionally, if they have a team, filter by that too
        const managerDetails = await storage.getUser(req.orgId, user.id);
        if (managerDetails?.teamId && !filterTeamId) {
          filterTeamId = managerDetails.teamId;
        }
      }
      
      // Get pending reviews data
      const pendingReviews = await storage.getPendingReviews(req.orgId, filterManagerId, filterTeamId);
      
      res.json(pendingReviews);
    } catch (error) {
      console.error("Failed to fetch pending reviews:", error);
      res.status(500).json({ message: "Failed to fetch pending reviews" });
    }
  });

  // Send Slack reminders for missing check-ins
  app.post("/api/slack/remind-missing-checkins", requireAuth(), requireRole(['admin', 'manager']), generateCSRF(), validateCSRF(), async (req, res) => {
    try {
      const { userIds } = req.body;
      
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ message: "User IDs are required" });
      }

      const { sendMissingCheckinReminder } = await import('./services/slack');
      
      let successCount = 0;
      let failCount = 0;
      const errors: string[] = [];
      
      for (const userId of userIds) {
        try {
          // Get user details
          const user = await storage.getUser(req.orgId, userId);
          if (!user) {
            errors.push(`User ${userId} not found`);
            failCount++;
            continue;
          }
          
          if (!user.slackUserId) {
            errors.push(`${user.name} does not have Slack integration enabled`);
            failCount++;
            continue;
          }
          
          // Calculate days overdue
          const weekStart = getWeekStartCentral(new Date());
          const checkinDueDate = getCheckinDueDate(weekStart);
          const daysOverdue = Math.max(0, Math.floor((Date.now() - checkinDueDate.getTime()) / (1000 * 60 * 60 * 24)));
          
          // Send reminder
          const sent = await sendMissingCheckinReminder(user.slackUserId, user.name, daysOverdue);
          
          if (sent) {
            successCount++;
          } else {
            errors.push(`Failed to send reminder to ${user.name}`);
            failCount++;
          }
        } catch (error) {
          console.error(`Error sending reminder to user ${userId}:`, error);
          errors.push(`Error processing user ${userId}`);
          failCount++;
        }
      }
      
      res.json({
        success: true,
        remindersSent: successCount,
        remindersFailed: failCount,
        errors: errors.length > 0 ? errors : undefined,
        message: `Sent ${successCount} reminder${successCount !== 1 ? 's' : ''}`
      });
    } catch (error) {
      console.error("Failed to send missing check-in reminders:", error);
      res.status(500).json({ message: "Failed to send reminders" });
    }
  });

  // Send Slack reminders for pending reviews
  app.post("/api/slack/remind-pending-reviews", requireAuth(), requireRole(['admin', 'manager']), generateCSRF(), validateCSRF(), async (req, res) => {
    try {
      const { managerIds } = req.body;
      
      if (!managerIds || !Array.isArray(managerIds) || managerIds.length === 0) {
        return res.status(400).json({ message: "Manager IDs are required" });
      }

      const { sendCheckinReviewReminder } = await import('./services/slack');
      
      let successCount = 0;
      let failCount = 0;
      const errors: string[] = [];
      
      for (const managerId of managerIds) {
        try {
          // Get manager details
          const manager = await storage.getUser(req.orgId, managerId);
          if (!manager) {
            errors.push(`Manager ${managerId} not found`);
            failCount++;
            continue;
          }
          
          if (!manager.slackUserId) {
            errors.push(`${manager.name} does not have Slack integration enabled`);
            failCount++;
            continue;
          }
          
          // Get pending reviews for this manager
          const pendingReviews = await storage.getPendingReviews(req.orgId, managerId);
          
          if (pendingReviews.length === 0) {
            continue; // No pending reviews, skip
          }
          
          // Prepare check-in data for the reminder
          const teamMemberCheckins = pendingReviews.map(review => ({
            memberName: review.userName,
            moodRating: review.overallMood,
            submittedAt: review.submittedAt,
            needsReview: true
          }));
          
          // Send reminder
          await sendCheckinReviewReminder(
            manager.slackUserId,
            manager.name,
            teamMemberCheckins
          );
          
          successCount++;
        } catch (error) {
          console.error(`Error sending reminder to manager ${managerId}:`, error);
          errors.push(`Error processing manager ${managerId}`);
          failCount++;
        }
      }
      
      res.json({
        success: true,
        remindersSent: successCount,
        remindersFailed: failCount,
        errors: errors.length > 0 ? errors : undefined,
        message: `Sent ${successCount} reminder${successCount !== 1 ? 's' : ''}`
      });
    } catch (error) {
      console.error("Failed to send pending review reminders:", error);
      res.status(500).json({ message: "Failed to send reminders" });
    }
  });

  // Weekly Summary Reports
  const summaryService = new WeeklySummaryService();

  // Get team weekly summary for managers
  app.get("/api/analytics/team-summary", requireAuth(), requireRole(['manager', 'admin']), async (req, res) => {
    try {
      const user = req.currentUser!;
      const { weekStart } = req.query;
      
      // Get user's team
      const userDetails = await storage.getUser(req.orgId, user.id);
      if (!userDetails?.teamId) {
        return res.status(400).json({ message: "You are not assigned to a team" });
      }
      
      // CRITICAL: Verify the team belongs to the user's organization
      const team = await storage.getTeam(req.orgId, userDetails.teamId);
      if (!team || team.organizationId !== req.orgId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const organization = await storage.getOrganization(req.orgId);
      const startDate = weekStart ? new Date(weekStart as string) : getWeekStartCentral(new Date(), organization);
      const summary = await summaryService.generateTeamSummary(req.orgId, userDetails.teamId, startDate);
      
      res.json(summary);
    } catch (error) {
      console.error("Failed to generate team summary:", error);
      res.status(500).json({ message: "Failed to generate team summary" });
    }
  });

  // Get leadership summary for admins
  app.get("/api/analytics/leadership-summary", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const { weekStart } = req.query;
      
      const organization = await storage.getOrganization(req.orgId);
      const startDate = weekStart ? new Date(weekStart as string) : getWeekStartCentral(new Date(), organization);
      const summary = await summaryService.generateLeadershipSummary(req.orgId, startDate);
      
      res.json(summary);
    } catch (error) {
      console.error("Failed to generate leadership summary:", error);
      res.status(500).json({ message: "Failed to generate leadership summary" });
    }
  });

  // Slack Integration
  app.post("/api/slack/send-checkin-reminder", requireOrganization(), requireAuth(), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      const users = await storage.getAllUsers(req.orgId);
      const activeUsers = users.filter(user => user.isActive);
      
      // Find users who haven't completed this week's check-in
      const organization = await storage.getOrganization(req.orgId);
      const currentWeekStart = getWeekStartCentral(new Date(), organization);
      
      const usersNeedingReminder = [];
      for (const user of activeUsers) {
        const currentCheckin = await storage.getCurrentWeekCheckin(req.orgId, user.id);
        if (!currentCheckin || !currentCheckin.isComplete) {
          usersNeedingReminder.push(user.name);
        }
      }
      
      if (usersNeedingReminder.length > 0) {
        // Fetch active questions to include in the reminder
        const questions = await storage.getActiveQuestions(req.orgId);
        await sendCheckinReminder(usersNeedingReminder, questions);
      }
      
      res.json({ 
        message: "Reminder sent", 
        userCount: usersNeedingReminder.length,
        questionsIncluded: await storage.getActiveQuestions(req.orgId).then(q => q.length)
      });
    } catch (error) {
      console.error("Failed to send check-in reminder:", error);
      res.status(500).json({ message: "Failed to send reminder" });
    }
  });

  app.post("/api/slack/send-team-health-update", requireOrganization(), requireAuth(), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      const recentCheckins = await storage.getRecentCheckins(req.orgId, 50);
      const recentWins = await storage.getRecentWins(req.orgId, 20);
      const allUsers = await storage.getAllUsers(req.orgId);
      const activeUsers = allUsers.filter(user => user.isActive);
      
      const averageRating = recentCheckins.length > 0 
        ? recentCheckins.reduce((sum, checkin) => sum + checkin.overallMood, 0) / recentCheckins.length
        : 0;
      
      const organization = await storage.getOrganization(req.orgId);
      const currentWeekStart = getWeekStartCentral(new Date(), organization);
      
      const completedThisWeek = recentCheckins.filter(checkin => 
        checkin.weekOf >= currentWeekStart && checkin.isComplete
      ).length;
      const completionRate = Math.round((completedThisWeek / activeUsers.length) * 100);
      
      const winsThisWeek = recentWins.filter(win => 
        win.createdAt >= currentWeekStart
      ).length;
      
      await sendTeamHealthUpdate(averageRating, completionRate, winsThisWeek);
      
      res.json({ message: "Team health update sent" });
    } catch (error) {
      res.status(500).json({ message: "Failed to send team health update" });
    }
  });
  
  // Manual Weekly Reminder Trigger (for testing or scheduled execution)
  app.post("/api/slack/send-weekly-reminders", requireOrganization(), requireAuth(), requireRole('admin'), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      const { scheduleWeeklyReminders } = await import("./services/slack");
      const result = await scheduleWeeklyReminders(req.orgId, storage);
      
      res.json({
        message: "Weekly reminders processing completed",
        ...result
      });
    } catch (error) {
      console.error("Failed to send weekly reminders:", error);
      res.status(500).json({ message: "Failed to send weekly reminders" });
    }
  });
  
  // Personalized Check-in Reminder (for individual users)
  app.post("/api/slack/send-personal-reminder", requireOrganization(), requireAuth(), requireRole('admin'), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      const { userId, isWeeklyScheduled = false } = req.body;
      
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      const user = await storage.getUser(req.orgId, userId);
      if (!user || !user.slackUserId) {
        return res.status(404).json({ message: "User not found or doesn't have Slack integration" });
      }
      
      const questions = await storage.getActiveQuestions(req.orgId);
      const { sendPersonalizedCheckinReminder } = await import("./services/slack");
      
      await sendPersonalizedCheckinReminder(
        user.slackUserId,
        user.name,
        questions,
        isWeeklyScheduled
      );
      
      res.json({
        message: "Personal reminder sent successfully",
        user: { id: user.id, name: user.name }
      });
    } catch (error) {
      console.error("Failed to send personal reminder:", error);
      res.status(500).json({ message: "Failed to send personal reminder" });
    }
  });
  
  // Get Weekly Reminder Statistics
  app.get("/api/slack/reminder-stats", requireOrganization(), requireAuth(), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      const { getWeeklyReminderStats } = await import("./services/slack");
      const stats = await getWeeklyReminderStats(req.orgId, storage);
      
      res.json(stats);
    } catch (error) {
      console.error("Failed to get reminder stats:", error);
      res.status(500).json({ message: "Failed to get reminder stats" });
    }
  });
  
  // Test Weekly Reminders (for development/testing)
  app.post("/api/slack/test-weekly-reminders", requireOrganization(), requireAuth(), requireRole('admin'), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      const { triggerTestWeeklyReminders } = await import("./services/slack");
      const result = await triggerTestWeeklyReminders(req.orgId, storage);
      
      res.json({
        message: "Test weekly reminders completed",
        ...result
      });
    } catch (error) {
      console.error("Failed to run test weekly reminders:", error);
      res.status(500).json({ message: "Failed to run test weekly reminders" });
    }
  });

  // Test Welcome Message (for development/testing)
  app.post("/api/slack/test-welcome-message", requireOrganization(), requireAuth(), requireRole('admin'), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      // Get the user and organization
      const user = await storage.getUser(req.orgId, userId);
      const organization = await storage.getOrganization(req.orgId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (!user.slackUserId) {
        return res.status(400).json({ message: "User does not have a Slack user ID" });
      }
      
      // Send welcome message
      const { sendWelcomeMessage } = await import("./services/slack");
      await sendWelcomeMessage(
        user.slackUserId,
        user.name || user.username,
        null, // Channel ID not needed for DM
        organization?.name
      );
      
      res.json({
        message: "Welcome message sent successfully",
        user: user.name,
        slackUserId: user.slackUserId,
        organization: organization?.name
      });
    } catch (error) {
      console.error("Failed to send test welcome message:", error);
      res.status(500).json({ message: "Failed to send test welcome message" });
    }
  });

  // Test Slack Connection and Configuration
  app.get("/api/slack/test-connection", requireOrganization(), requireAuth(), requireRole('admin'), async (req, res) => {
    try {
      console.log('🧪 Testing Slack connection for organization:', req.orgId);
      
      // Test the connection
      const result = await testSlackConnection(req.orgId);
      
      // Get organization details
      const organization = await storage.getOrganization(req.orgId);
      
      res.json({
        ...result,
        organization: {
          id: organization?.id,
          name: organization?.name,
          enable_slack_integration: organization?.enableSlackIntegration,
          slack_wins_channel_id: organization?.slackWinsChannelId,
          slack_channel_id: organization?.slackChannelId,
          has_bot_token: !!process.env.SLACK_BOT_TOKEN
        }
      });
    } catch (error) {
      console.error("Failed to test Slack connection:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to test Slack connection",
        error: error.message || error
      });
    }
  });

  // Slack Events Endpoint - Handle event subscriptions and verification
  app.post("/slack/events", async (req, res) => {
    try {
      const { type, challenge, event } = req.body;

      // Handle URL verification challenge from Slack
      if (type === "url_verification") {
        console.log("Slack URL verification received");
        return res.json({ challenge });
      }

      // Handle actual events
      if (type === "event_callback" && event) {
        console.log("Slack event received:", event.type);
        
        // Handle channel membership events for user sync
        if (event.type === "member_joined_channel" || event.type === "member_left_channel") {
          // For now, we'll handle all orgs - in a real multi-tenant app,
          // you'd need to determine which organization this event belongs to
          try {
            const { handleChannelMembershipEvent } = await import("./services/slack");
            const organizations = await storage.getAllOrganizations();
            
            // Process event for all organizations (or determine the specific org)
            for (const org of organizations) {
              await handleChannelMembershipEvent(event, org.id, storage);
            }
          } catch (syncError) {
            console.error("Failed to handle channel membership event:", syncError);
            // Don't fail the request - Slack expects a 200 response
          }
        }
        
        res.status(200).json({ ok: true });
      } else {
        // Unknown event type
        res.status(400).json({ error: "Unknown event type" });
      }
    } catch (error) {
      console.error("Slack events error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Slack Interactive Components Endpoint - Handle button clicks, modal submissions, etc.
  app.post("/slack/interactive", express.raw({type: 'application/x-www-form-urlencoded'}), async (req, res) => {
    try {
      // Parse the URL-encoded payload
      const payloadString = req.body.toString().split('payload=')[1];
      if (!payloadString) {
        return res.status(400).json({ error: "Missing payload" });
      }
      
      const payload = JSON.parse(decodeURIComponent(payloadString));
      console.log("Slack interactive component received:", payload.type, payload.actions?.[0]?.action_id);
      
      // Determine organization from team ID or default to first org for simplicity
      let organizationId;
      try {
        const organizations = await storage.getAllOrganizations();
        // In a real app, you'd match payload.team.id to organization.slackWorkspaceId
        organizationId = organizations[0]?.id;
        
        if (!organizationId) {
          return res.status(500).json({ error: "No organization found" });
        }
        
        // Handle the interaction
        const { handleSlackInteraction } = await import("./services/slack");
        await handleSlackInteraction(payload, organizationId, storage);
        
        // Acknowledge the interaction
        res.status(200).json({ ok: true });
      } catch (error) {
        console.error("Error determining organization for Slack interaction:", error);
        res.status(500).json({ error: "Failed to process interaction" });
      }
    } catch (error) {
      console.error("Slack interactive component error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Slack Slash Commands Endpoint - Handle /checkin and other slash commands
  app.post("/slack/command", express.raw({type: 'application/x-www-form-urlencoded'}), async (req, res) => {
    try {
      // Parse the URL-encoded form data
      const params = new URLSearchParams(req.body.toString());
      const command = params.get('command');
      const text = params.get('text') || '';
      const userId = params.get('user_id');
      const userName = params.get('user_name');
      const triggerId = params.get('trigger_id');
      const teamId = params.get('team_id');
      
      console.log(`Slack slash command received: ${command} from ${userName}`);
      
      // Determine organization from team ID or default to first org for simplicity
      let organizationId;
      try {
        const organizations = await storage.getAllOrganizations();
        // In a real app, you'd match teamId to organization.slackWorkspaceId
        organizationId = organizations[0]?.id;
        
        if (!organizationId) {
          return res.status(200).json({
            text: "Organization not found. Please contact your administrator.",
            response_type: "ephemeral"
          });
        }
        
        // Handle the slash command
        const { handleSlackSlashCommand } = await import("./services/slack");
        const response = await handleSlackSlashCommand(command || '', text, userId || '', userName || '', triggerId || '', organizationId, storage);
        
        // Send response back to Slack
        res.status(200).json(response);
      } catch (error) {
        console.error("Error determining organization for Slack slash command:", error);
        res.status(200).json({
          text: "Sorry, there was an error processing your command. Please try again.",
          response_type: "ephemeral"
        });
      }
    } catch (error) {
      console.error("Slack slash command error:", error);
      res.status(200).json({
        text: "Sorry, there was an error processing your command. Please try again.",
        response_type: "ephemeral"
      });
    }
  });

  // Authentication endpoints section moved earlier

  // User Sync Endpoints
  app.post("/api/admin/sync-users", requireAuth(), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        console.log(`❌ Non-admin user attempted sync: ${req.currentUser?.email}, role: ${req.currentUser?.role}`);
        return res.status(403).json({ 
          message: "Admin access required to sync users",
          error: "insufficient_permissions"
        });
      }

      console.log(`📋 Admin sync-users endpoint called`);
      console.log(`   Organization ID from session: ${req.orgId}`);
      console.log(`   User: ${req.currentUser.name} (${req.currentUser.email})`);
      console.log(`   User role: ${req.currentUser.role}`);
      console.log(`   User is super admin: ${req.currentUser.isSuperAdmin}`);
      console.log(`   Session ID: ${req.sessionID}`);
      
      // CRITICAL FIX: For super admins with multiple organizations, ensure we use the correct org ID
      // The orgId from req.orgId might not match the organization they're trying to sync
      let targetOrgId = req.orgId;
      
      // Check if there's an explicit organization ID in the request body
      if (req.body?.organizationId && req.currentUser.isSuperAdmin) {
        console.log(`🔄 Super admin override: Using explicit organizationId from request: ${req.body.organizationId}`);
        targetOrgId = req.body.organizationId;
      }
      
      console.log(`🎯 Final target organization ID for sync: ${targetOrgId}`);
      
      // Get organization to fetch Slack token
      const organization = await storage.getOrganization(targetOrgId);
      if (!organization) {
        console.error("❌ Organization not found for ID:", targetOrgId);
        return res.status(404).json({ 
          message: "Organization not found",
          error: "organization_not_found",
          organizationId: targetOrgId,
          debug: {
            requestOrgId: targetOrgId,
            sessionOrgId: req.orgId
          }
        });
      }
      
      console.log(`✅ Found organization: ${organization.name}`);
      console.log(`   Slack status: ${organization.slackConnectionStatus}`);
      console.log(`   Slack workspace ID: ${organization.slackWorkspaceId}`);
      console.log(`   Has bot token: ${!!organization.slackBotToken}`);
      console.log(`   Slack integration enabled: ${organization.enableSlackIntegration}`);
      
      // Check if Slack is properly connected
      if (organization.slackConnectionStatus !== 'connected') {
        console.error(`❌ Slack not connected for org ${organization.name}`);
        console.error(`   Current status: ${organization.slackConnectionStatus}`);
        return res.status(400).json({
          message: "Slack is not connected. Please complete the Slack OAuth flow first.",
          error: "slack_not_connected",
          currentStatus: organization.slackConnectionStatus
        });
      }
      
      // Use organization's bot token or fall back to environment variable
      const botToken = organization.slackBotToken || process.env.SLACK_BOT_TOKEN;
      
      console.log(`🔑 Bot token source: ${organization.slackBotToken ? 'organization-specific' : 'environment variable'}`);
      console.log(`   Has token: ${!!botToken}`);
      console.log(`📺 Channel to sync: ${req.body?.channelName || 'whirkplace-pulse'}`);
      
      if (!botToken) {
        console.error("❌ No Slack bot token available");
        console.error(`   Org has token: ${!!organization.slackBotToken}`);
        console.error(`   ENV has token: ${!!process.env.SLACK_BOT_TOKEN}`);
        return res.status(400).json({ 
          message: "Slack bot token not configured. Please add your Slack Bot Token in the Integrations settings.",
          error: "missing_token",
          details: "Navigate to Settings → Integrations → Slack to configure your bot token."
        });
      }

      const { syncUsersFromSlack } = await import("./services/slack");
      // Use the organization's stored channel ID if available, otherwise fall back to request body or default
      const channelIdentifier = organization.slackChannelId || req.body?.channelName || 'whirkplace-pulse';
      
      console.log(`🚀 Starting user sync from channel: ${channelIdentifier} for organization: ${organization.name} (${targetOrgId})`);
      console.log(`   Using ${organization.slackChannelId ? 'stored channel ID' : req.body?.channelName ? 'requested channel name' : 'default channel name'}`);
      const result = await syncUsersFromSlack(targetOrgId, storage, botToken, channelIdentifier);
      
      if (result.error) {
        console.error(`⚠️ Sync completed with error: ${result.error}`);
        console.error(`   Error code: ${result.errorCode}`);
        console.error(`   Error details:`, result.errorDetails);
        
        // Map error codes to appropriate HTTP status codes and messages
        const errorResponses: Record<string, { status: number; message: string }> = {
          'missing_token': {
            status: 400,
            message: "Slack bot token not configured. Please add your Slack Bot Token in Settings → Integrations → Slack."
          },
          'missing_scope': {
            status: 403,
            message: "Missing Slack permissions. Your Slack app needs the following scopes: channels:read, groups:read, users:read, users:read.email"
          },
          'invalid_auth': {
            status: 401,
            message: "Invalid Slack authentication. Your bot token may be expired or incorrect."
          },
          'channel_not_found': {
            status: 404,
            message: `Slack channel "${channelIdentifier}" not found. Please ensure the channel exists and the bot has been added to it.`
          },
          'no_members': {
            status: 404,
            message: `No members found in channel "${channelIdentifier}". Please ensure the channel has members and the bot can see them.`
          },
          'members_fetch_error': {
            status: 500,
            message: "Failed to fetch channel members from Slack API."
          },
          'channel_search_error': {
            status: 500,
            message: "Failed to search for the channel in Slack."
          }
        };
        
        const errorResponse = errorResponses[result.errorCode || ''] || {
          status: 400,
          message: result.error || "Failed to sync users from Slack channel"
        };
        
        // Build detailed error response
        const responseBody = {
          message: errorResponse.message,
          error: result.errorCode || "sync_failed",
          rawError: result.error,
          errorDetails: result.errorDetails,
          syncStats: {
            created: result.created,
            activated: result.activated,
            deactivated: result.deactivated
          }
        };
        
        // Add helpful suggestions based on error type
        if (result.errorCode === 'channel_not_found' && result.errorDetails?.suggestions) {
          responseBody.errorDetails.suggestions = result.errorDetails.suggestions;
        } else if (result.errorCode === 'missing_token') {
          responseBody.errorDetails = {
            ...result.errorDetails,
            helpUrl: "/integrations",
            actionRequired: "Configure Slack bot token"
          };
        } else if (result.errorCode === 'missing_scope') {
          responseBody.errorDetails = {
            ...result.errorDetails,
            helpUrl: "https://api.slack.com/apps",
            actionRequired: "Update OAuth scopes in your Slack app"
          };
        } else if (result.errorCode === 'invalid_auth') {
          responseBody.errorDetails = {
            ...result.errorDetails,
            helpUrl: "/integrations",
            actionRequired: "Reconnect your Slack integration"
          };
        }
        
        console.error(`❌ Returning error response with status ${errorResponse.status}:`, responseBody);
        return res.status(errorResponse.status).json(responseBody);
      }
      
      console.log(`✅ Sync completed: Created ${result.created}, Activated ${result.activated}, Deactivated ${result.deactivated}`);
      if (result.newUsersOnboarded !== undefined && result.newUsersOnboarded > 0) {
        console.log(`📨 Onboarding: ${result.newUsersOnboarded} DMs sent, ${result.onboardingErrors || 0} errors`);
      }
      
      // Build detailed message including onboarding stats
      let detailsMessage = `Created ${result.created} new users, reactivated ${result.activated} users, deactivated ${result.deactivated} users`;
      if (result.newUsersOnboarded !== undefined && result.created > 0) {
        detailsMessage += `. Sent onboarding messages to ${result.newUsersOnboarded} new users`;
        if (result.onboardingErrors && result.onboardingErrors > 0) {
          detailsMessage += ` (${result.onboardingErrors} failed to send)`;
        }
      }
      
      res.json({
        message: `Successfully synced users from ${channelIdentifier.startsWith('C') ? 'channel ID ' + channelIdentifier : '#' + channelIdentifier}`,
        details: detailsMessage,
        ...result
      });
    } catch (error: any) {
      console.error("❌ Manual user sync failed:", error);
      console.error("Error stack:", error.stack);
      
      // Provide more helpful error messages for common issues
      if (error.message?.includes('rate_limited')) {
        return res.status(429).json({ 
          message: "Slack API rate limit exceeded. Please wait a moment and try again.",
          error: "rate_limited",
          details: "Slack limits API calls to prevent abuse. Try again in 60 seconds."
        });
      }
      
      const errorMessage = error?.message || "User sync failed";
      res.status(500).json({ 
        message: `Failed to sync users: ${errorMessage}`,
        error: "internal_error",
        details: "Check the server logs for more information."
      });
    }
  });

  // NEW: Alternative sync endpoint for better compatibility
  app.post("/api/slack/sync-users", requireAuth(), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      console.log(`📋 Slack sync-users endpoint called`);
      console.log(`   Organization ID from session: ${req.orgId}`);
      console.log(`   User: ${req.currentUser?.name} (${req.currentUser?.email})`);
      console.log(`   User role: ${req.currentUser?.role}`);
      console.log(`   User is super admin: ${req.currentUser?.isSuperAdmin}`);
      console.log(`   Session ID: ${req.sessionID}`);
      console.log(`   Session has userId: ${!!req.session?.userId}`);
      console.log(`   Session has organizationId: ${!!(req.session as any)?.organizationId}`);
      
      // CRITICAL FIX: For super admins with multiple organizations, ensure we use the correct org ID
      // The orgId from req.orgId might not match the organization they're trying to sync
      let targetOrgId = req.orgId;
      
      // Check if there's an explicit organization ID in the request body
      if (req.body?.organizationId && req.currentUser?.isSuperAdmin) {
        console.log(`🔄 Super admin override: Using explicit organizationId from request: ${req.body.organizationId}`);
        targetOrgId = req.body.organizationId;
      }
      
      console.log(`🎯 Final target organization ID for sync: ${targetOrgId}`);
      
      // Get organization to fetch Slack token
      const organization = await storage.getOrganization(targetOrgId);
      if (!organization) {
        console.error("❌ Organization not found for ID:", targetOrgId);
        return res.status(404).json({ 
          message: "Organization not found",
          error: "organization_not_found",
          organizationId: targetOrgId,
          debug: {
            requestOrgId: targetOrgId,
            sessionOrgId: req.orgId,
            actualSessionOrgId: (req.session as any)?.organizationId
          }
        });
      }
      
      console.log(`✅ Found organization: ${organization.name}`);
      console.log(`   Slack status: ${organization.slackConnectionStatus}`);
      console.log(`   Slack workspace ID: ${organization.slackWorkspaceId}`);
      console.log(`   Has bot token: ${!!organization.slackBotToken}`);
      console.log(`   Slack integration enabled: ${organization.enableSlackIntegration}`);
      
      // Check if Slack is properly connected
      if (organization.slackConnectionStatus !== 'connected') {
        console.error(`❌ Slack not connected for org ${organization.name}`);
        console.error(`   Current status: ${organization.slackConnectionStatus}`);
        return res.status(400).json({
          message: "Slack is not connected. Please complete the Slack OAuth flow first.",
          error: "slack_not_connected",
          currentStatus: organization.slackConnectionStatus,
          hasWorkspaceId: !!organization.slackWorkspaceId
        });
      }
      
      // Use organization's bot token or fall back to environment variable
      const botToken = organization.slackBotToken || process.env.SLACK_BOT_TOKEN;
      
      console.log(`🔑 Bot token source: ${organization.slackBotToken ? 'organization-specific' : 'environment variable'}`);
      console.log(`   Has token: ${!!botToken}`);
      console.log(`📺 Channel to sync: ${req.body?.channelName || 'whirkplace-pulse'}`);
      
      if (!botToken) {
        console.error("❌ No Slack bot token available");
        console.error(`   Org has token: ${!!organization.slackBotToken}`);
        console.error(`   ENV has token: ${!!process.env.SLACK_BOT_TOKEN}`);
        return res.status(400).json({ 
          message: "Slack bot token not configured. Please add your Slack Bot Token in the Integrations settings.",
          error: "missing_token",
          details: "Navigate to Settings → Integrations → Slack to configure your bot token.",
          debug: {
            hasOrgToken: !!organization.slackBotToken,
            hasEnvToken: !!process.env.SLACK_BOT_TOKEN
          }
        });
      }

      const { syncUsersFromSlack } = await import("./services/slack");
      // Use the organization's stored channel ID if available, otherwise fall back to request body or default
      const channelIdentifier = organization.slackChannelId || req.body?.channelName || 'whirkplace-pulse';
      
      console.log(`🚀 Starting user sync from channel: ${channelIdentifier} for organization: ${organization.name} (${targetOrgId})`);
      console.log(`   Using ${organization.slackChannelId ? 'stored channel ID' : req.body?.channelName ? 'requested channel name' : 'default channel name'}`);
      const result = await syncUsersFromSlack(targetOrgId, storage, botToken, channelIdentifier);
      
      if (result.error) {
        console.error(`⚠️ Sync completed with error: ${result.error}`);
        console.error(`   Error code: ${result.errorCode}`);
        console.error(`   Error details:`, result.errorDetails);
        
        // Map error codes to appropriate HTTP status codes and messages
        const errorResponses: Record<string, { status: number; message: string }> = {
          'missing_token': {
            status: 400,
            message: "Slack bot token not configured. Please add your Slack Bot Token in Settings → Integrations → Slack."
          },
          'missing_scope': {
            status: 403,
            message: "Missing Slack permissions. Your Slack app needs the following scopes: channels:read, groups:read, users:read, users:read.email"
          },
          'invalid_auth': {
            status: 401,
            message: "Invalid Slack authentication. Your bot token may be expired or incorrect."
          },
          'channel_not_found': {
            status: 404,
            message: `Slack channel "${channelIdentifier}" not found. Please ensure the channel exists and the bot has been added to it.`
          },
          'no_members': {
            status: 404,
            message: `No members found in channel "${channelIdentifier}". Please ensure the channel has members and the bot can see them.`
          },
          'members_fetch_error': {
            status: 500,
            message: "Failed to fetch channel members from Slack API."
          },
          'channel_search_error': {
            status: 500,
            message: "Failed to search for the channel in Slack."
          }
        };
        
        const errorResponse = errorResponses[result.errorCode || ''] || {
          status: 400,
          message: result.error || "Failed to sync users from Slack channel"
        };
        
        // Build detailed error response
        const responseBody = {
          message: errorResponse.message,
          error: result.errorCode || "sync_failed",
          rawError: result.error,
          errorDetails: result.errorDetails,
          syncStats: {
            created: result.created,
            activated: result.activated,
            deactivated: result.deactivated
          }
        };
        
        // Add helpful suggestions based on error type
        if (result.errorCode === 'channel_not_found' && result.errorDetails?.suggestions) {
          responseBody.errorDetails.suggestions = result.errorDetails.suggestions;
        } else if (result.errorCode === 'missing_token') {
          responseBody.errorDetails = {
            ...result.errorDetails,
            helpUrl: "/integrations",
            actionRequired: "Configure Slack bot token"
          };
        } else if (result.errorCode === 'missing_scope') {
          responseBody.errorDetails = {
            ...result.errorDetails,
            helpUrl: "https://api.slack.com/apps",
            actionRequired: "Update OAuth scopes in your Slack app"
          };
        } else if (result.errorCode === 'invalid_auth') {
          responseBody.errorDetails = {
            ...result.errorDetails,
            helpUrl: "/integrations",
            actionRequired: "Reconnect your Slack integration"
          };
        }
        
        console.error(`❌ Returning error response with status ${errorResponse.status}:`, responseBody);
        return res.status(errorResponse.status).json(responseBody);
      }
      
      console.log(`✅ Sync completed: Created ${result.created}, Activated ${result.activated}, Deactivated ${result.deactivated}`);
      if (result.newUsersOnboarded !== undefined && result.newUsersOnboarded > 0) {
        console.log(`📨 Onboarding: ${result.newUsersOnboarded} DMs sent, ${result.onboardingErrors || 0} errors`);
      }
      
      // Build detailed message including onboarding stats
      let detailsMessage = `Created ${result.created} new users, reactivated ${result.activated} users, deactivated ${result.deactivated} users`;
      if (result.newUsersOnboarded !== undefined && result.created > 0) {
        detailsMessage += `. Sent onboarding messages to ${result.newUsersOnboarded} new users`;
        if (result.onboardingErrors && result.onboardingErrors > 0) {
          detailsMessage += ` (${result.onboardingErrors} failed to send)`;
        }
      }
      
      res.json({
        message: `Successfully synced users from ${channelIdentifier.startsWith('C') ? 'channel ID ' + channelIdentifier : '#' + channelIdentifier}`,
        details: detailsMessage,
        ...result
      });
    } catch (error: any) {
      console.error("❌ Slack sync failed:", error);
      console.error("Error stack:", error.stack);
      
      // Provide more helpful error messages for common issues
      if (error.message?.includes('rate_limited')) {
        return res.status(429).json({ 
          message: "Slack API rate limit exceeded. Please wait a moment and try again.",
          error: "rate_limited",
          details: "Slack limits API calls to prevent abuse. Try again in 60 seconds."
        });
      }
      
      const errorMessage = error?.message || "Failed to sync users from Slack channel";
      res.status(500).json({ 
        message: `Failed to sync users: ${errorMessage}`,
        error: "internal_error",
        details: "Check the server logs for more information."
      });
    }
  });

  app.get("/api/admin/channel-members", requireAuth(), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log(`📋 Channel members endpoint called for org: ${req.orgId}`);
      
      // Get organization to fetch Slack token
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Use organization's bot token or fall back to environment variable
      const botToken = organization.slackBotToken || process.env.SLACK_BOT_TOKEN;
      // Use the organization's stored channel ID if available, otherwise fall back to query param or default
      const channelIdentifier = organization.slackChannelId || req.query.channel || 'whirkplace-pulse';
      
      console.log(`🔑 Using ${organization.slackBotToken ? 'organization-specific' : 'environment'} Slack token`);
      console.log(`📺 Using ${organization.slackChannelId ? 'stored channel ID' : req.query.channel ? 'requested channel name' : 'default channel name'}: ${channelIdentifier}`);
      
      if (!botToken) {
        return res.status(400).json({ 
          message: "Slack integration not configured",
          members: [],
          count: 0,
          channelName: channelIdentifier as string
        });
      }

      const { getChannelMembers } = await import("./services/slack");
      const result = await getChannelMembers(botToken, channelIdentifier as string);
      
      // Check if there was an error fetching channel members
      if (result.error) {
        console.error(`❌ Error fetching channel members: ${result.error}`);
        console.error(`   Error code: ${result.errorCode}`);
        console.error(`   Error details:`, result.errorDetails);
        
        // Return error details while maintaining the expected response structure
        return res.status(400).json({
          message: result.error,
          error: result.errorCode,
          errorDetails: result.errorDetails,
          members: [],
          count: 0,
          channelName: channelIdentifier as string
        });
      }
      
      const members = result.members || [];
      res.json({
        members,
        count: members.length,
        channelName: channelIdentifier as string
      });
    } catch (error: any) {
      console.error("Failed to fetch channel members:", error);
      res.status(500).json({ 
        message: error?.message || "Failed to fetch channel members",
        members: [],
        count: 0
      });
    }
  });

  // CSV Template Download Endpoint
  app.get("/api/admin/users/template", requireAuth(), requireRole("admin"), async (req, res) => {
    try {
      console.log(`📋 CSV template download requested by ${req.currentUser?.email}`);
      
      // Create CSV template with headers and a sample row
      const csvData = [
        ['email', 'name', 'role', 'team_name', 'manager_email'],
        ['john.doe@example.com', 'John Doe', 'member', 'Engineering', 'jane.smith@example.com']
      ];
      
      const csv = Papa.unparse(csvData);
      
      // Set response headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="user_import_template.csv"');
      res.send(csv);
    } catch (error) {
      console.error("Failed to generate CSV template:", error);
      res.status(500).json({ message: "Failed to generate CSV template" });
    }
  });

  // Bulk User Import Endpoint
  app.post("/api/admin/users/bulk-import", requireAuth(), requireRole("admin"), express.raw({ type: 'text/csv', limit: '10mb' }), async (req, res) => {
    try {
      const organizationId = req.orgId;
      const adminUser = req.currentUser;
      
      console.log(`📋 Bulk user import initiated by ${adminUser?.email} for organization ${organizationId}`);
      
      // Parse CSV data
      const csvText = req.body.toString();
      
      const parseResult = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
      });
      
      if (parseResult.errors.length > 0) {
        return res.status(400).json({
          message: "CSV parsing failed",
          errors: parseResult.errors.map(e => ({
            row: e.row,
            message: e.message
          }))
        });
      }
      
      const results = {
        successful: [] as any[],
        failed: [] as any[],
        created: 0,
        skipped: 0,
        errors: 0
      };
      
      // Validate and process each row
      for (let rowIndex = 0; rowIndex < parseResult.data.length; rowIndex++) {
        const row: any = parseResult.data[rowIndex];
        const rowNumber = rowIndex + 2; // +2 because header is row 1, and array is 0-indexed
        
        try {
          // Validate required fields
          if (!row.email || !row.name || !row.role) {
            results.failed.push({
              row: rowNumber,
              email: row.email || 'N/A',
              reason: "Missing required fields (email, name, or role)"
            });
            results.errors++;
            continue;
          }
          
          // Validate email format
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(row.email)) {
            results.failed.push({
              row: rowNumber,
              email: row.email,
              reason: "Invalid email format"
            });
            results.errors++;
            continue;
          }
          
          // Validate role
          const validRoles = ['admin', 'manager', 'member'];
          if (!validRoles.includes(row.role.toLowerCase())) {
            results.failed.push({
              row: rowNumber,
              email: row.email,
              reason: `Invalid role '${row.role}'. Must be one of: admin, manager, member`
            });
            results.errors++;
            continue;
          }
          
          // Check if user already exists
          const existingUser = await storage.getUserByEmail(organizationId, row.email);
          if (existingUser) {
            results.failed.push({
              row: rowNumber,
              email: row.email,
              reason: "User already exists"
            });
            results.skipped++;
            continue;
          }
          
          // Handle team assignment
          let teamId: string | undefined = undefined;
          if (row.team_name) {
            // Check if team exists
            const teams = await storage.getAllTeams(organizationId);
            let team = teams.find(t => t.name.toLowerCase() === row.team_name.toLowerCase());
            
            if (!team) {
              // Create new team
              console.log(`Creating new team: ${row.team_name}`);
              team = await storage.createTeam(organizationId, {
                name: row.team_name,
                organizationId,
                teamType: 'team'
              });
            }
            teamId = team.id;
          }
          
          // Handle manager assignment
          let managerId: string | undefined = undefined;
          if (row.manager_email) {
            const manager = await storage.getUserByEmail(organizationId, row.manager_email);
            if (manager) {
              managerId = manager.id;
            } else {
              console.log(`Warning: Manager ${row.manager_email} not found for user ${row.email}`);
            }
          }
          
          // Generate temporary password
          const tempPassword = `Welcome${Math.random().toString(36).slice(2, 10)}!`;
          const hashedPassword = await bcrypt.hash(tempPassword, 10);
          
          // Create user
          const newUser = await storage.createUser(organizationId, {
            email: row.email,
            name: row.name,
            role: row.role.toLowerCase() as 'admin' | 'manager' | 'member',
            teamId: teamId,
            managerId: managerId,
            password: hashedPassword,
            organizationId,
            isActive: true,
            isOnboarded: false, // Will need to complete onboarding
            hasCompletedTour: false
          });
          
          // Try to send welcome email if email service is configured
          try {
            const { sendWelcomeEmail } = await import('./services/emailService');
            await sendWelcomeEmail(newUser.email, newUser.name, tempPassword, organizationId);
            console.log(`Welcome email sent to ${newUser.email}`);
          } catch (emailError) {
            console.log(`Could not send welcome email to ${newUser.email} - email service may not be configured`);
          }
          
          results.successful.push({
            row: rowNumber,
            email: newUser.email,
            name: newUser.name,
            role: newUser.role,
            team: row.team_name || 'None'
          });
          results.created++;
          
        } catch (error: any) {
          console.error(`Failed to import user at row ${rowNumber}:`, error);
          results.failed.push({
            row: rowNumber,
            email: row.email || 'N/A',
            reason: error.message || "Unknown error occurred"
          });
          results.errors++;
        }
      }
      
      console.log(`✅ Bulk import completed: ${results.created} created, ${results.skipped} skipped, ${results.errors} failed`);
      
      res.json({
        message: `Import completed: ${results.created} users created successfully`,
        summary: {
          total: parseResult.data.length,
          created: results.created,
          skipped: results.skipped,
          failed: results.errors
        },
        successful: results.successful,
        failed: results.failed
      });
      
    } catch (error: any) {
      console.error("Bulk import failed:", error);
      res.status(500).json({ 
        message: "Failed to process bulk import",
        error: error.message 
      });
    }
  });

  // NEW: Simplified integrations endpoint that uses current user's organization
  // This endpoint serves as a wrapper for the existing /api/organizations/:id/integrations endpoint
  // It automatically uses the authenticated user's organization ID from req.orgId
  app.get("/api/integrations", requireAuth(), requireOrganization(), async (req, res) => {
    try {
      console.log(`📋 Fetching integrations for org: ${req.orgId}`);
      
      // Get the organization data using the orgId from the middleware
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Return integration-specific fields only - NEVER return secrets
      // This matches the exact response format of /api/organizations/:id/integrations
      const integrationData = {
        id: organization.id,
        name: organization.name,
        slackWorkspaceId: organization.slackWorkspaceId,
        slackChannelId: organization.slackChannelId,
        hasSlackBotToken: !!organization.slackBotToken, // Only boolean indicator
        enableSlackIntegration: organization.enableSlackIntegration,
        slackConnectionStatus: organization.slackConnectionStatus,
        slackLastConnected: organization.slackLastConnected,
        microsoftTenantId: organization.microsoftTenantId,
        microsoftClientId: organization.microsoftClientId,
        hasMicrosoftClientSecret: !!organization.microsoftClientSecret, // Only boolean indicator
        enableMicrosoftAuth: organization.enableMicrosoftAuth,
        enableTeamsIntegration: organization.enableTeamsIntegration,
        microsoftConnectionStatus: organization.microsoftConnectionStatus,
        microsoftLastConnected: organization.microsoftLastConnected,
      };
      
      res.json(integrationData);
    } catch (error) {
      console.error("GET /api/integrations - Error:", error);
      res.status(500).json({ message: "Failed to fetch organization integrations" });
    }
  });

  // Slack integration status endpoint
  app.get("/api/integrations/slack/status", requireAuth(), async (req, res) => {
    try {
      console.log(`📋 Slack status check for org: ${req.orgId}`);
      
      // Get organization to check Slack integration status
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        console.error("❌ Organization not found:", req.orgId);
        return res.status(404).json({ 
          connected: false,
          message: "Organization not found" 
        });
      }
      
      // Check if Slack is connected by looking for the bot token
      const isConnected = !!organization.slackBotToken;
      const hasWorkspace = !!organization.slackWorkspaceId;
      
      console.log(`🔌 Slack connection status:`, {
        connected: isConnected,
        hasToken: !!organization.slackBotToken,
        hasWorkspace: hasWorkspace,
        workspaceId: organization.slackWorkspaceId,
        connectionStatus: organization.slackConnectionStatus,
        lastConnected: organization.slackLastConnected
      });
      
      // Return detailed status
      res.json({
        connected: isConnected,
        hasToken: isConnected,
        workspaceId: organization.slackWorkspaceId || null,
        channelId: organization.slackChannelId || null,
        connectionStatus: organization.slackConnectionStatus || (isConnected ? 'connected' : 'not_configured'),
        lastConnected: organization.slackLastConnected || null,
        integrationEnabled: organization.enableSlackIntegration || false
      });
    } catch (error: any) {
      console.error("❌ Failed to check Slack status:", error);
      res.status(500).json({ 
        connected: false,
        error: error?.message || "Failed to check Slack integration status" 
      });
    }
  });

  // NEW: Bot OAuth flow for Slack - Get bot token
  app.get("/api/slack/bot-auth", requireAuth(), requireRole('admin'), async (req, res) => {
    try {
      console.log(`🤖 Bot OAuth initiated for org: ${req.orgId}`);
      
      const clientId = process.env.SLACK_CLIENT_ID;
      const redirectUri = resolveRedirectUri(req, '/api/slack/bot-callback');
      
      if (!clientId) {
        console.error("❌ Slack client ID not configured");
        return res.status(500).json({ 
          error: "Slack OAuth not configured" 
        });
      }
      
      // Generate state for CSRF protection
      const state = randomBytes(32).toString('hex');
      req.session.slackBotOAuthState = state;
      req.session.slackBotOAuthOrgId = req.orgId;
      
      // Bot scopes needed for the application
      const scopes = [
        'channels:read',
        'channels:join', 
        'chat:write',
        'users:read',
        'users:read.email',
        'team:read'
      ].join(',');
      
      const params = new URLSearchParams({
        client_id: clientId,
        scope: scopes,
        redirect_uri: redirectUri,
        state: state
      });
      
      const authUrl = `https://slack.com/oauth/v2/authorize?${params.toString()}`;
      
      console.log(`✅ Redirecting to Slack bot OAuth: ${authUrl}`);
      console.log(`📋 Bot scopes requested: ${scopes}`);
      
      // Save session before redirect
      req.session.save((err) => {
        if (err) {
          console.error('❌ Failed to save session for bot OAuth:', err);
          return res.status(500).json({ error: "Session save failed" });
        }
        res.json({ url: authUrl });
      });
    } catch (error) {
      console.error("❌ Bot OAuth error:", error);
      res.status(500).json({ 
        error: "Failed to initiate bot authentication" 
      });
    }
  });
  
  // NEW: Bot OAuth callback - Store bot token
  app.get("/api/slack/bot-callback", async (req, res) => {
    try {
      const { code, state, error: oauthError } = req.query;
      
      console.log('🤖 BOT OAUTH CALLBACK RECEIVED');
      console.log(`   Session ID: ${req.sessionID}`);
      console.log(`   Has Code: ${!!code}`);
      console.log(`   Has State: ${!!state}`);
      console.log(`   Has Error: ${!!oauthError}`);
      
      if (oauthError) {
        console.error("❌ Slack bot OAuth error from provider:", oauthError);
        return res.redirect(`/?error=slack_bot_auth_failed&message=${encodeURIComponent(oauthError as string)}`);
      }
      
      if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
        console.error('❌ Invalid bot callback parameters');
        console.error(`   Code type: ${typeof code}, State type: ${typeof state}`);
        return res.redirect('/?error=invalid_bot_callback');
      }
      
      // Validate state
      const sessionState = req.session.slackBotOAuthState;
      console.log(`🔑 Bot OAuth state validation:`);
      console.log(`   Session state: ${sessionState?.substring(0, 8)}...`);
      console.log(`   Received state: ${state.substring(0, 8)}...`);
      
      if (!sessionState || sessionState !== state) {
        console.error('❌ Bot OAuth state mismatch - possible CSRF attack');
        return res.redirect('/?error=state_mismatch');
      }
      
      const orgId = req.session.slackBotOAuthOrgId;
      console.log(`🏢 Organization ID from session: ${orgId}`);
      
      if (!orgId) {
        console.error('❌ No organization ID in session - bot OAuth flow was not properly initiated');
        return res.redirect('/?error=no_org_id');
      }
      
      // Fetch the organization to verify it exists
      const organization = await storage.getOrganization(orgId);
      if (!organization) {
        console.error(`❌ Organization not found in database: ${orgId}`);
        return res.redirect('/?error=org_not_found');
      }
      
      console.log(`✅ Found organization: ${organization.name} (ID: ${organization.id}, Slug: ${organization.slug})`);
      
      // Clear OAuth state early to prevent replay attacks
      delete req.session.slackBotOAuthState;
      delete req.session.slackBotOAuthOrgId;
      
      // Exchange code for access token
      const clientId = process.env.SLACK_CLIENT_ID;
      const clientSecret = process.env.SLACK_CLIENT_SECRET;
      const redirectUri = resolveRedirectUri(req, '/api/slack/bot-callback');
      
      if (!clientId || !clientSecret) {
        console.error('❌ Slack OAuth credentials not configured in environment');
        return res.redirect('/?error=oauth_not_configured');
      }
      
      console.log(`🔄 Exchanging bot OAuth code for access token...`);
      console.log(`   Redirect URI: ${redirectUri}`);
      
      const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          redirect_uri: redirectUri
        }).toString()
      });
      
      const tokenData = await tokenResponse.json();
      
      if (!tokenData.ok) {
        console.error('❌ Failed to exchange bot OAuth code:', tokenData.error);
        console.error(`   Error description: ${tokenData.error_description || 'None provided'}`);
        return res.redirect(`/?error=token_exchange_failed&message=${encodeURIComponent(tokenData.error)}`);
      }
      
      console.log('✅ Bot token exchange successful');
      console.log(`   Team ID: ${tokenData.team?.id}`);
      console.log(`   Team Name: ${tokenData.team?.name}`);
      console.log(`   Access Token: ${tokenData.access_token?.substring(0, 10)}...`);
      console.log(`   Bot User ID: ${tokenData.bot_user_id}`);
      console.log(`   Bot Scopes: ${tokenData.scope}`);
      
      // Update organization with bot token
      const updateData = {
        slackBotToken: tokenData.access_token,
        slackWorkspaceId: tokenData.team?.id || tokenData.team_id,
        slackConnectionStatus: 'connected' as const,
        slackLastConnected: new Date(),
        enableSlackIntegration: true
      };
      
      console.log(`📝 Updating organization ${orgId} with bot token...`);
      console.log(`   Bot Token: ${updateData.slackBotToken?.substring(0, 10)}...`);
      console.log(`   Workspace ID: ${updateData.slackWorkspaceId}`);
      console.log(`   Connection Status: ${updateData.slackConnectionStatus}`);
      console.log(`   Last Connected: ${updateData.slackLastConnected.toISOString()}`);
      
      const updatedOrg = await storage.updateOrganization(orgId, updateData);
      
      if (!updatedOrg) {
        console.error(`❌ CRITICAL: Failed to update organization with bot token`);
        console.error(`   Organization ID: ${orgId}`);
        console.error(`   Organization Name: ${organization.name}`);
        return res.redirect('/?error=org_update_failed');
      }
      
      console.log(`✅ Organization update returned successfully`);
      console.log(`   Updated Org Name: ${updatedOrg.name}`);
      console.log(`   Slack Workspace ID in result: ${updatedOrg.slackWorkspaceId}`);
      
      // Verify the update actually persisted
      console.log(`🔍 Verifying bot token persisted to database...`);
      const verificationOrg = await storage.getOrganization(orgId);
      
      if (!verificationOrg) {
        console.error(`❌ CRITICAL: Organization disappeared after update!`);
        return res.redirect('/?error=verification_failed');
      }
      
      if (verificationOrg.slackWorkspaceId !== updateData.slackWorkspaceId) {
        console.error(`❌ CRITICAL: Bot workspace ID not persisted!`);
        console.error(`   Expected: ${updateData.slackWorkspaceId}`);
        console.error(`   Got: ${verificationOrg.slackWorkspaceId}`);
      } else {
        console.log(`✅ VERIFIED: Bot workspace ID ${verificationOrg.slackWorkspaceId} successfully persisted`);
      }
      
      if (verificationOrg.slackBotToken !== updateData.slackBotToken) {
        console.error(`❌ CRITICAL: Bot token not persisted!`);
      } else {
        console.log(`✅ VERIFIED: Bot token successfully persisted`);
      }
      
      console.log(`✅ BOT OAUTH COMPLETE: Organization ${updatedOrg.name} connected to Slack workspace ${tokenData.team?.name} (${tokenData.team?.id})`);
      console.log(`📋 Bot token starts with: ${tokenData.access_token?.substring(0, 10)}...`);
      
      // Redirect to integrations page with success message
      res.redirect('/integrations?success=slack_connected');
    } catch (error) {
      console.error('❌ Bot OAuth callback error:', error);
      res.redirect('/?error=bot_oauth_failed');
    }
  });

  // Debug endpoint to list all Slack channels the bot can see
  app.get("/api/admin/slack-channels", requireAuth(), requireFeatureAccess('slack_integration'), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { WebClient } = await import("@slack/web-api");
      const slack = process.env.SLACK_BOT_TOKEN ? new WebClient(process.env.SLACK_BOT_TOKEN) : null;
      
      if (!slack) {
        return res.json({
          error: "Slack bot token not configured",
          channels: [],
          botTokenConfigured: false
        });
      }

      let channelsResult;
      try {
        channelsResult = await slack.conversations.list({
          types: 'public_channel,private_channel',
          limit: 200
        });
      } catch (error: any) {
        console.error("Failed to list Slack channels:", error);
        return res.status(500).json({ 
          error: `Slack API error: ${error?.data?.error || error.message}`,
          details: error?.data,
          botTokenConfigured: true
        });
      }

      const channels = (channelsResult.channels || []).map(channel => ({
        id: channel.id,
        name: channel.name,
        isPrivate: channel.is_private,
        isMember: channel.is_member,
        isArchived: channel.is_archived,
        memberCount: channel.num_members
      }));

      const targetChannel = channels.find(c => c.name === 'whirkplace-pulse');
      
      res.json({
        botTokenConfigured: true,
        totalChannels: channels.length,
        channels: channels,
        targetChannel: targetChannel || null,
        targetChannelFound: !!targetChannel,
        targetChannelBotIsMember: targetChannel?.isMember || false,
        recommendations: !targetChannel 
          ? ["Channel 'whirkplace-pulse' not found. Please create it or check the channel name."]
          : !targetChannel.isMember 
          ? ["Bot is not a member of 'whirkplace-pulse'. Please invite the bot to the channel."]
          : ["Channel access looks good!"]
      });
    } catch (error) {
      console.error("Failed to debug Slack channels:", error);
      res.status(500).json({ message: "Failed to debug Slack channels" });
    }
  });

  // Admin user role management endpoint
  app.patch("/api/admin/users/:id/role", requireAuth(), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const targetUserId = req.params.id;
      const { role } = req.body;

      // Validate role
      const validRoles = ['admin', 'manager', 'member'];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ 
          message: "Invalid role. Must be one of: admin, manager, member" 
        });
      }

      // Get target user to verify they exist
      const targetUser = await storage.getUser(req.orgId, targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Prevent admins from demoting themselves if they're the only admin
      if (req.currentUser.id === targetUserId && req.currentUser.role === 'admin' && role !== 'admin') {
        const allUsers = await storage.getAllUsers(req.orgId, true);
        const adminCount = allUsers.filter(u => u.role === 'admin' && u.isActive).length;
        
        if (adminCount <= 1) {
          return res.status(400).json({ 
            message: "Cannot demote yourself - you are the only admin. Promote another user to admin first." 
          });
        }
      }

      // Update user role
      const updatedUser = await storage.updateUser(req.orgId, targetUserId, { role });
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update user role" });
      }

      res.json({
        message: `User role updated to ${role}`,
        user: updatedUser
      });
    } catch (error) {
      console.error("Failed to update user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  // Admin route to assign users to teams
  app.patch("/api/admin/users/:id/team", requireAuth(), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const targetUserId = req.params.id;
      const { teamId } = req.body;

      // Validate teamId - should be either null (unassigned) or a valid UUID
      if (teamId !== null && teamId !== undefined) {
        if (typeof teamId !== 'string' || teamId.length === 0) {
          return res.status(400).json({ 
            message: "Invalid teamId. Must be a valid team ID or null for unassigned." 
          });
        }

        // Verify team exists and belongs to this organization
        const team = await storage.getTeam(req.orgId, teamId);
        if (!team) {
          return res.status(400).json({ 
            message: "Team not found or does not belong to this organization" 
          });
        }
      }

      // Get target user to verify they exist and belong to this organization
      const targetUser = await storage.getUser(req.orgId, targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update user team assignment
      const updatedUser = await storage.updateUser(req.orgId, targetUserId, { 
        teamId: teamId || null 
      });
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update user team assignment" });
      }

      // Get team name for response
      const teamName = teamId ? (await storage.getTeam(req.orgId, teamId))?.name || null : null;

      res.json({
        message: teamId 
          ? `User assigned to team: ${teamName}` 
          : "User unassigned from team",
        user: updatedUser,
        teamName
      });
    } catch (error) {
      console.error("Failed to update user team assignment:", error);
      res.status(500).json({ message: "Failed to update user team assignment" });
    }
  });

  // Admin endpoint to send password setup via Slack DM to Slack users
  app.post("/api/admin/users/:userId/send-password-setup", requireAuth(), requireRole("admin"), async (req, res) => {
    try {
      const targetUserId = req.params.userId;
      const organizationId = req.orgId;

      // Get target user to verify they exist and belong to this organization
      const targetUser = await storage.getUser(organizationId, targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if user has Slack ID (they must be connected to Slack)
      if (!targetUser.slackUserId) {
        return res.status(400).json({ 
          message: "User does not have a Slack ID configured. This feature is only available for users connected to Slack." 
        });
      }

      // For Slack users, we'll allow sending password setup DM even if they have a password
      // This helps in cases where they were synced with a default/temporary password
      // Skip the password check for Slack users to allow password reset anytime

      // Generate password reset token with 24-hour expiration
      const token = await storage.createPasswordResetToken(targetUserId);
      
      // Get organization info
      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(500).json({ message: "Organization not found" });
      }

      // Send password setup via Slack DM
      const result = await sendPasswordSetupViaSlackDM(
        targetUser.slackUserId,
        targetUser.email,
        token,
        organization.name,
        organization.slug || organizationId,
        targetUser.name,
        organization.slackBotToken // Use organization-specific bot token if available
      );

      if (!result.success) {
        // Delete the token if DM failed to send
        await storage.deletePasswordResetToken(token);
        return res.status(500).json({ 
          message: result.error || "Failed to send password setup via Slack DM. Please check Slack configuration." 
        });
      }

      console.log(`✅ Password setup DM sent to Slack user ${targetUser.email} (${targetUser.slackUserId}) by admin ${req.currentUser?.email}`);

      res.json({
        message: `Password setup instructions sent successfully via Slack DM`,
        userId: targetUserId,
        email: targetUser.email,
        slackUserId: targetUser.slackUserId
      });
    } catch (error) {
      console.error("Failed to send password setup DM:", error);
      res.status(500).json({ 
        message: "Failed to send password setup via Slack DM" 
      });
    }
  });

  // Admin aggregation endpoints
  app.post("/api/admin/aggregation/backfill", requireAuth(), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const validation = backfillSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid backfill parameters",
          errors: validation.error.errors
        });
      }

      const { from, to } = validation.data;

      // Validate date range
      if (from >= to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }

      const maxRangeDays = 90; // Limit backfill to 90 days
      const rangeDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
      if (rangeDays > maxRangeDays) {
        return res.status(400).json({ 
          message: `Backfill range too large. Maximum ${maxRangeDays} days allowed.` 
        });
      }

      console.log(`Admin ${req.currentUser.name} initiated backfill for org ${req.orgId} from ${from.toISOString()} to ${to.toISOString()}`);

      // Start backfill (async - don't wait for completion)
      aggregationService.backfillHistoricalData(req.orgId, from, to).catch(error => {
        console.error(`Backfill failed for org ${req.orgId}:`, error);
      });

      res.json({ 
        message: "Backfill initiated successfully",
        from: from.toISOString(),
        to: to.toISOString(),
        organizationId: req.orgId
      });
    } catch (error) {
      console.error("Admin backfill error:", error);
      res.status(500).json({ message: "Failed to initiate backfill" });
    }
  });

  // Admin endpoint to check aggregation status
  app.get("/api/admin/aggregation/status", requireAuth(), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      res.json({
        useAggregates: process.env.USE_AGGREGATES === 'true',
        shadowReads: process.env.ENABLE_SHADOW_READS === 'true',
        organizationId: req.orgId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Admin aggregation status error:", error);
      res.status(500).json({ message: "Failed to get aggregation status" });
    }
  });

  // Helper function to generate recurring meeting instances
  function generateRecurringMeetings(baseData: any, seriesId: string) {
    const meetings = [];
    const startDate = new Date(baseData.scheduledAt);
    const endDate = baseData.recurrenceEndDate ? new Date(baseData.recurrenceEndDate) : null;
    const maxOccurrences = baseData.recurrenceEndCount || 52; // Default max 1 year
    
    // Calculate interval in milliseconds
    const intervals = {
      weekly: 7 * 24 * 60 * 60 * 1000,
      biweekly: 14 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000, // Approximate month
      quarterly: 90 * 24 * 60 * 60 * 1000 // Approximate quarter
    };
    
    const intervalMs = intervals[baseData.recurrencePattern as keyof typeof intervals] * (baseData.recurrenceInterval || 1);
    
    // Create the first meeting (template)
    meetings.push({
      ...baseData,
      isRecurring: true,
      recurrenceSeriesId: seriesId,
      isRecurrenceTemplate: true,
      scheduledAt: startDate
    });
    
    // Generate subsequent meetings
    let currentDate = new Date(startDate);
    let occurrenceCount = 1;
    
    while (occurrenceCount < maxOccurrences) {
      currentDate = new Date(currentDate.getTime() + intervalMs);
      
      // Check if we've exceeded the end date
      if (endDate && currentDate > endDate) {
        break;
      }
      
      // For monthly/quarterly, adjust for actual month lengths
      if (baseData.recurrencePattern === 'monthly') {
        currentDate = new Date(startDate);
        currentDate.setMonth(startDate.getMonth() + occurrenceCount * (baseData.recurrenceInterval || 1));
      } else if (baseData.recurrencePattern === 'quarterly') {
        currentDate = new Date(startDate);
        currentDate.setMonth(startDate.getMonth() + (occurrenceCount * 3) * (baseData.recurrenceInterval || 1));
      }
      
      meetings.push({
        ...baseData,
        isRecurring: true,
        recurrenceSeriesId: seriesId,
        isRecurrenceTemplate: false,
        scheduledAt: new Date(currentDate)
      });
      
      occurrenceCount++;
    }
    
    return meetings;
  }

  // Helper function to check One-on-One meeting access permissions
  async function canAccessOneOnOne(orgId: string, userId: string, userRole: string, userTeamId: string | null, meeting: any): Promise<boolean> {
    // Admin users can access all meetings
    if (userRole === "admin") {
      return true;
    }
    
    // Participants can always access their own meetings
    if (meeting.participantOneId === userId || meeting.participantTwoId === userId) {
      return true;
    }
    
    // Managers can access meetings for their team members
    if (userRole === "manager" && userTeamId) {
      // Get both participants to check if either is in the manager's team
      const [participantOne, participantTwo] = await Promise.all([
        storage.getUser(orgId, meeting.participantOneId),
        storage.getUser(orgId, meeting.participantTwoId)
      ]);
      
      // Check if either participant is in the manager's team or is their direct report
      const canAccessParticipantOne = participantOne && (
        participantOne.teamId === userTeamId || participantOne.managerId === userId
      );
      const canAccessParticipantTwo = participantTwo && (
        participantTwo.teamId === userTeamId || participantTwo.managerId === userId
      );
      
      return canAccessParticipantOne || canAccessParticipantTwo;
    }
    
    return false;
  }

  // One-on-One Meetings endpoints
  app.get("/api/one-on-ones", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      // Get all meetings in the organization, then filter by access permissions
      const allMeetings = await storage.getAllOneOnOnes(req.orgId);
      
      // Filter meetings based on user's access permissions
      const accessibleMeetings = [];
      for (const meeting of allMeetings) {
        const hasAccess = await canAccessOneOnOne(
          req.orgId,
          req.currentUser!.id,
          req.currentUser!.role,
          req.currentUser!.teamId,
          meeting
        );
        if (hasAccess) {
          accessibleMeetings.push(meeting);
        }
      }
      
      res.json(accessibleMeetings);
    } catch (error) {
      console.error("GET /api/one-on-ones - Error:", error);
      res.status(500).json({ message: "Failed to fetch one-on-ones" });
    }
  });

  app.get("/api/one-on-ones/upcoming", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      // Validate query parameters using Zod
      const querySchema = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20)
      });
      
      const queryResult = querySchema.safeParse(req.query);
      if (!queryResult.success) {
        return res.status(400).json({ 
          message: "Invalid query parameters", 
          errors: queryResult.error.errors 
        });
      }
      
      const { page, limit } = queryResult.data;
      
      // Get all upcoming meetings in the organization, then filter by access permissions
      const allUpcomingMeetings = await storage.getAllUpcomingOneOnOnes(req.orgId);
      
      // Filter meetings based on user's access permissions and populate participant data
      const accessibleMeetings = [];
      for (const meeting of allUpcomingMeetings) {
        const hasAccess = await canAccessOneOnOne(
          req.orgId,
          req.currentUser!.id,
          req.currentUser!.role,
          req.currentUser!.teamId,
          meeting
        );
        if (hasAccess) {
          // Populate participant data
          const participantUser = meeting.participantTwoId === req.currentUser!.id 
            ? await storage.getUser(req.orgId, meeting.participantOneId)
            : await storage.getUser(req.orgId, meeting.participantTwoId);
          
          const managerUser = meeting.participantOneId === req.currentUser!.id
            ? await storage.getUser(req.orgId, meeting.participantOneId)
            : meeting.participantTwoId === req.currentUser!.id
              ? await storage.getUser(req.orgId, meeting.participantOneId)
              : null;
          
          accessibleMeetings.push({
            ...meeting,
            participant: participantUser ? sanitizeUser(participantUser) : null,
            manager: managerUser ? sanitizeUser(managerUser) : null
          });
        }
      }
      
      // Apply pagination after filtering
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedMeetings = accessibleMeetings.slice(startIndex, endIndex);
      
      res.json({
        meetings: paginatedMeetings,
        pagination: {
          page,
          limit,
          total: accessibleMeetings.length,
          totalPages: Math.ceil(accessibleMeetings.length / limit)
        }
      });
    } catch (error) {
      console.error("GET /api/one-on-ones/upcoming - Error:", error);
      res.status(500).json({ message: "Failed to fetch upcoming one-on-ones" });
    }
  });

  app.get("/api/one-on-ones/past", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      // Validate query parameters using Zod
      const querySchema = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20)
      });
      
      const queryResult = querySchema.safeParse(req.query);
      if (!queryResult.success) {
        return res.status(400).json({ 
          message: "Invalid query parameters", 
          errors: queryResult.error.errors 
        });
      }
      
      const { page, limit } = queryResult.data;
      
      // Get all past meetings in the organization, then filter by access permissions  
      const allPastMeetings = await storage.getAllPastOneOnOnes(req.orgId);
      
      // Filter meetings based on user's access permissions and populate participant data
      const accessibleMeetings = [];
      for (const meeting of allPastMeetings) {
        const hasAccess = await canAccessOneOnOne(
          req.orgId,
          req.currentUser!.id,
          req.currentUser!.role,
          req.currentUser!.teamId,
          meeting
        );
        if (hasAccess) {
          // Populate participant data
          const participantUser = meeting.participantTwoId === req.currentUser!.id 
            ? await storage.getUser(req.orgId, meeting.participantOneId)
            : await storage.getUser(req.orgId, meeting.participantTwoId);
          
          const managerUser = meeting.participantOneId === req.currentUser!.id
            ? await storage.getUser(req.orgId, meeting.participantOneId)
            : meeting.participantTwoId === req.currentUser!.id
              ? await storage.getUser(req.orgId, meeting.participantOneId)
              : null;
          
          accessibleMeetings.push({
            ...meeting,
            participant: participantUser ? sanitizeUser(participantUser) : null,
            manager: managerUser ? sanitizeUser(managerUser) : null
          });
        }
      }
      
      // Apply pagination after filtering
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedMeetings = accessibleMeetings.slice(startIndex, endIndex);
      
      res.json({
        meetings: paginatedMeetings,
        pagination: {
          page,
          limit,
          total: accessibleMeetings.length,
          totalPages: Math.ceil(accessibleMeetings.length / limit),
          hasMore: endIndex < accessibleMeetings.length
        }
      });
    } catch (error) {
      console.error("GET /api/one-on-ones/past - Error:", error);
      res.status(500).json({ message: "Failed to fetch past one-on-ones" });
    }
  });

  app.get("/api/one-on-ones/:id", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      const oneOnOne = await storage.getOneOnOne(req.orgId, req.params.id);
      if (!oneOnOne) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      // Check if user has access to this meeting
      const hasAccess = await canAccessOneOnOne(
        req.orgId!, 
        req.userId!, 
        req.currentUser!.role, 
        req.currentUser!.teamId, 
        oneOnOne
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(oneOnOne);
    } catch (error) {
      console.error("GET /api/one-on-ones/:id - Error:", error);
      res.status(500).json({ message: "Failed to fetch one-on-one" });
    }
  });

  app.post("/api/one-on-ones", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      // Validate request body using Zod schema with recurring meeting support
      const validationSchema = insertOneOnOneSchema.omit({ organizationId: true }).extend({
        scheduledAt: z.coerce.date(),
        duration: z.number().min(15).max(240).default(30),
        status: z.enum(["scheduled", "completed", "cancelled", "rescheduled"]).default("scheduled"),
        // Recurring meeting fields - make them truly optional (accept undefined/null/missing)
        isRecurring: z.boolean().default(false),
        recurrencePattern: z.enum(["weekly", "biweekly", "monthly", "quarterly"]).nullable().optional().or(z.undefined()),
        recurrenceInterval: z.number().min(1).max(12).nullable().optional().or(z.undefined()),
        recurrenceEndDate: z.union([z.coerce.date(), z.null(), z.undefined()]).optional(),
        recurrenceEndCount: z.union([z.number().min(1).max(52), z.null(), z.undefined()]).optional()
      }).refine((data) => {
        // If recurring, must have pattern and either end date or count
        if (data.isRecurring) {
          return data.recurrencePattern && data.recurrenceInterval && (data.recurrenceEndDate || data.recurrenceEndCount);
        }
        return true;
      }, {
        message: "Recurring meetings must have a recurrence pattern, interval, and either an end date or occurrence count"
      });
      
      const validatedData = validationSchema.parse(req.body);
      
      // Verify the requesting user can create this meeting
      // Must be a participant, or a manager of one of the participants, or an admin
      const canCreate = req.currentUser!.role === "admin" || 
                       validatedData.participantOneId === req.currentUser!.id || 
                       validatedData.participantTwoId === req.currentUser!.id;
      
      if (!canCreate && req.currentUser!.role === "manager" && req.currentUser!.teamId) {
        // Additional check for managers - they can create meetings for their team members
        const [participantOne, participantTwo] = await Promise.all([
          storage.getUser(req.orgId, validatedData.participantOneId),
          storage.getUser(req.orgId, validatedData.participantTwoId)
        ]);
        
        const canCreateAsManager = (participantOne && (participantOne.teamId === req.currentUser!.teamId || participantOne.managerId === req.currentUser!.id)) ||
                                  (participantTwo && (participantTwo.teamId === req.currentUser!.teamId || participantTwo.managerId === req.currentUser!.id));
        
        if (!canCreateAsManager) {
          return res.status(403).json({ message: "You can only create meetings for yourself or your team members" });
        }
      } else if (!canCreate) {
        return res.status(403).json({ message: "You can only create meetings for yourself or your team members" });
      }
      
      if (validatedData.isRecurring) {
        // Generate recurring meeting series
        const seriesId = `series_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const meetings = generateRecurringMeetings(validatedData, seriesId);
        
        // Create all meetings in the series
        const createdMeetings = [];
        for (const meetingData of meetings) {
          const meeting = await storage.createOneOnOne(req.orgId, {
            ...meetingData,
            organizationId: req.orgId
          });
          createdMeetings.push(meeting);
        }
        
        res.status(201).json({
          success: true,
          seriesId,
          message: `Created ${createdMeetings.length} recurring meetings`,
          meetings: createdMeetings
        });
      } else {
        // Create single meeting
        const oneOnOne = await storage.createOneOnOne(req.orgId, {
          ...validatedData,
          organizationId: req.orgId
        });
        res.status(201).json(oneOnOne);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("POST /api/one-on-ones - Validation error:", error.errors);
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("POST /api/one-on-ones - Error:", error);
      
      // Provide more detailed error information
      const errorMessage = error instanceof Error ? error.message : "Failed to create one-on-one";
      const isDevelopment = process.env.NODE_ENV !== 'production';
      
      if (isDevelopment) {
        // In development, expose the actual error for debugging
        res.status(500).json({ 
          message: `Failed to create one-on-one: ${errorMessage}`,
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          } : error
        });
      } else {
        // In production, use generic message for security
        res.status(500).json({ message: "Failed to create one-on-one" });
      }
    }
  });

  app.put("/api/one-on-ones/:id", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      // Validate request body using Zod schema
      const updateSchema = insertOneOnOneSchema.omit({ 
        organizationId: true, 
        participantOneId: true, 
        participantTwoId: true 
      }).partial().extend({
        scheduledAt: z.coerce.date().optional(),
        duration: z.number().min(15).max(240).optional(),
        status: z.enum(["scheduled", "completed", "cancelled", "rescheduled"]).optional()
      });
      
      const validatedData = updateSchema.parse(req.body);
      
      // Get existing meeting to verify permissions
      const existingMeeting = await storage.getOneOnOne(req.orgId, req.params.id);
      if (!existingMeeting) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      // Check if user has access to update this meeting
      const hasAccess = await canAccessOneOnOne(
        req.orgId, 
        req.currentUser!.id, 
        req.currentUser!.role, 
        req.currentUser!.teamId, 
        existingMeeting
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const updatedOneOnOne = await storage.updateOneOnOne(req.orgId, req.params.id, validatedData);
      if (!updatedOneOnOne) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      res.json(updatedOneOnOne);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("PUT /api/one-on-ones/:id - Error:", error);
      res.status(500).json({ message: "Failed to update one-on-one" });
    }
  });

  app.delete("/api/one-on-ones/:id", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      // Get existing meeting to verify permissions
      const existingMeeting = await storage.getOneOnOne(req.orgId, req.params.id);
      if (!existingMeeting) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      // Check if user has access to delete this meeting
      const hasAccess = await canAccessOneOnOne(
        req.orgId!, 
        req.userId!, 
        req.currentUser!.role, 
        req.currentUser!.teamId, 
        existingMeeting
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const deleted = await storage.deleteOneOnOne(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("DELETE /api/one-on-ones/:id - Error:", error);
      res.status(500).json({ message: "Failed to delete one-on-one" });
    }
  });

  // Recurring meeting series management endpoints
  app.get("/api/one-on-ones/series/:seriesId", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      const seriesId = req.params.seriesId;
      
      // Get all meetings in the series
      const allMeetings = await storage.getAllOneOnOnes(req.orgId);
      const seriesMeetings = allMeetings.filter(meeting => meeting.recurrenceSeriesId === seriesId);
      
      if (seriesMeetings.length === 0) {
        return res.status(404).json({ message: "Recurring series not found" });
      }
      
      // Check access to the first meeting (if user can access one, they can access the series)
      const hasAccess = await canAccessOneOnOne(
        req.orgId!,
        req.currentUser!.id,
        req.currentUser!.role,
        req.currentUser!.teamId,
        seriesMeetings[0]
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json({
        seriesId,
        totalMeetings: seriesMeetings.length,
        meetings: seriesMeetings.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
      });
    } catch (error) {
      console.error("GET /api/one-on-ones/series/:seriesId - Error:", error);
      res.status(500).json({ message: "Failed to fetch recurring series" });
    }
  });

  app.delete("/api/one-on-ones/series/:seriesId", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      const seriesId = req.params.seriesId;
      const { cancelFutureOnly = false } = req.query;
      
      // Get all meetings in the series
      const allMeetings = await storage.getAllOneOnOnes(req.orgId);
      const seriesMeetings = allMeetings.filter(meeting => meeting.recurrenceSeriesId === seriesId);
      
      if (seriesMeetings.length === 0) {
        return res.status(404).json({ message: "Recurring series not found" });
      }
      
      // Check access to the first meeting
      const hasAccess = await canAccessOneOnOne(
        req.orgId,
        req.currentUser!.id,
        req.currentUser!.role,
        req.currentUser!.teamId,
        seriesMeetings[0]
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      let meetingsToCancel = seriesMeetings;
      
      if (cancelFutureOnly === 'true') {
        // Only cancel future meetings (not completed or past ones)
        const now = new Date();
        meetingsToCancel = seriesMeetings.filter(meeting => 
          new Date(meeting.scheduledAt) > now && meeting.status === 'scheduled'
        );
      }
      
      // Cancel the meetings
      let canceledCount = 0;
      for (const meeting of meetingsToCancel) {
        const success = await storage.deleteOneOnOne(req.orgId, meeting.id);
        if (success) canceledCount++;
      }
      
      res.json({
        message: `Canceled ${canceledCount} meetings from the recurring series`,
        canceledCount,
        totalInSeries: seriesMeetings.length
      });
    } catch (error) {
      console.error("DELETE /api/one-on-ones/series/:seriesId - Error:", error);
      res.status(500).json({ message: "Failed to cancel recurring series" });
    }
  });

  // Action Items endpoints
  app.get("/api/one-on-ones/:id/action-items", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      // Verify user has access to this meeting
      const meeting = await storage.getOneOnOne(req.orgId, req.params.id);
      if (!meeting) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      // Check if user has access to this meeting's action items
      const hasAccess = await canAccessOneOnOne(
        req.orgId!, 
        req.userId!, 
        req.currentUser!.role, 
        req.currentUser!.teamId, 
        meeting
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const actionItems = await storage.getActionItemsByMeeting(req.orgId, req.params.id);
      res.json(actionItems);
    } catch (error) {
      console.error("GET /api/one-on-ones/:id/action-items - Error:", error);
      res.status(500).json({ message: "Failed to fetch action items" });
    }
  });

  app.post("/api/one-on-ones/:id/action-items", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      // Validate request body using Zod schema
      const validationSchema = insertActionItemSchema.omit({ organizationId: true, meetingId: true }).extend({
        dueDate: z.coerce.date().optional(),
        status: z.enum(["pending", "completed", "overdue", "cancelled"]).default("pending")
      });
      
      const validatedData = validationSchema.parse(req.body);
      
      // Verify user has access to this meeting
      const meeting = await storage.getOneOnOne(req.orgId, req.params.id);
      if (!meeting) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      // Check if user has access to create action items for this meeting
      const hasAccess = await canAccessOneOnOne(
        req.orgId!, 
        req.userId!, 
        req.currentUser!.role, 
        req.currentUser!.teamId, 
        meeting
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const actionItemData = {
        ...validatedData,
        meetingId: req.params.id,
        organizationId: req.orgId
      };
      
      const actionItem = await storage.createActionItem(req.orgId, actionItemData);
      res.status(201).json(actionItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("POST /api/one-on-ones/:id/action-items - Error:", error);
      res.status(500).json({ message: "Failed to create action item" });
    }
  });

  app.put("/api/action-items/:id", requireAuth(), async (req, res) => {
    try {
      const { description, dueDate, status, notes } = req.body;
      
      // Get existing action item to verify permissions
      const existingActionItem = await storage.getActionItem(req.orgId, req.params.id);
      if (!existingActionItem) {
        return res.status(404).json({ message: "Action item not found" });
      }
      
      // Verify user has access to this action item (either assigned to them or part of the meeting)
      const meeting = await storage.getOneOnOne(req.orgId, existingActionItem.meetingId);
      if (!meeting) {
        return res.status(404).json({ message: "Associated meeting not found" });
      }
      
      // Check if user has access to update this action item
      const hasMeetingAccess = await canAccessOneOnOne(
        req.orgId, 
        req.userId, 
        req.currentUser.role, 
        req.currentUser.teamId, 
        meeting
      );
      
      const canUpdate = existingActionItem.assignedTo === req.currentUser!.id || hasMeetingAccess;
      
      if (!canUpdate) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const updateData: any = {};
      if (description !== undefined) updateData.description = description;
      if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
      if (status !== undefined) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;
      
      const updatedActionItem = await storage.updateActionItem(req.orgId, req.params.id, updateData);
      if (!updatedActionItem) {
        return res.status(404).json({ message: "Action item not found" });
      }
      
      res.json(updatedActionItem);
    } catch (error) {
      console.error("PUT /api/action-items/:id - Error:", error);
      res.status(500).json({ message: "Failed to update action item" });
    }
  });

  // One-on-One Agenda endpoint - Get comprehensive agenda with KRAs, ratings, flagged check-ins, and action items
  app.get("/api/one-on-ones/:id/agenda", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      const meetingId = req.params.id;
      
      // Get the meeting
      const meeting = await storage.getOneOnOne(req.orgId, meetingId);
      if (!meeting) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      // Check if user has access to this meeting
      const hasAccess = await canAccessOneOnOne(
        req.orgId,
        req.currentUser!.id,
        req.currentUser!.role,
        req.currentUser!.teamId,
        meeting
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Determine which user's KRAs to fetch
      const targetUserId = req.currentUser!.id === meeting.participantOneId ? meeting.participantTwoId : meeting.participantOneId;
      const isSupervisor = req.currentUser!.id === meeting.participantOneId;
      
      // Get KRAs - either specific ones linked to this meeting or all active KRAs for the user
      let kras;
      if (meeting.kraIds && meeting.kraIds.length > 0) {
        // Get specific KRAs linked to this meeting
        const kraPromises = meeting.kraIds.map(kraId => storage.getUserKra(req.orgId, kraId));
        const krasResults = await Promise.all(kraPromises);
        kras = krasResults.filter((kra): kra is NonNullable<typeof kra> => kra !== undefined);
      } else {
        // Fall back to all active KRAs for the user
        kras = await storage.getUserKrasByUser(req.orgId, targetUserId, "active");
      }
      
      // Get latest supervisor ratings for these KRAs
      const kraIds = kras.map(kra => kra.id);
      const supervisorRatings = await storage.getLatestSupervisorRatings(req.orgId, kraIds);
      
      // Get ratings for this specific meeting
      const meetingRatings = await storage.getKraRatingsByOneOnOne(req.orgId, meetingId);
      
      // Combine KRA data with ratings
      const krasWithRatings = kras.map(kra => {
        const lastSupervisorRating = supervisorRatings.get(kra.id);
        const thisMeetingRatings = meetingRatings.filter(r => r.kraId === kra.id);
        const selfRating = thisMeetingRatings.find(r => r.raterRole === "self");
        const supervisorRating = thisMeetingRatings.find(r => r.raterRole === "supervisor");
        
        return {
          kra,
          lastSupervisorRating: lastSupervisorRating ? {
            rating: lastSupervisorRating.rating,
            note: lastSupervisorRating.note,
            createdAt: lastSupervisorRating.createdAt
          } : null,
          currentSelfRating: selfRating ? {
            rating: selfRating.rating,
            note: selfRating.note
          } : null,
          currentSupervisorRating: supervisorRating ? {
            rating: supervisorRating.rating,
            note: supervisorRating.note
          } : null
        };
      });
      
      // Get flagged check-ins since last meeting
      const lastMeeting = await storage.getPastOneOnOnes(req.orgId, targetUserId, 2);
      const sinceDate = lastMeeting.length > 1 ? lastMeeting[1].scheduledAt : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      
      const checkins = await storage.getCheckinsByUser(req.orgId, targetUserId);
      // Filter for flagged check-ins (using both legacy fields)
      const flaggedCheckins = checkins.filter(checkin => {
        const checkCreatedAt = typeof checkin.createdAt === 'string' 
          ? new Date(checkin.createdAt) 
          : checkin.createdAt;
        return (checkin.flagForFollowUp || checkin.addToOneOnOne) && 
               checkCreatedAt >= sinceDate;
      });
      
      // Get action items for this meeting (including carried forward)
      const actionItems = await storage.getActionItemsByOneOnOne(req.orgId, meetingId);
      
      // Carry forward open action items if this is a new meeting
      if (meeting.status === "scheduled") {
        const carriedForward = await storage.carryForwardOpenActionItems(req.orgId, targetUserId, meetingId);
        actionItems.push(...carriedForward);
      }
      
      // Return comprehensive agenda
      res.json({
        meeting,
        kras: krasWithRatings,
        flaggedCheckins,
        actionItems,
        isSupervisor
      });
    } catch (error) {
      console.error("GET /api/one-on-ones/:id/agenda - Error:", error);
      res.status(500).json({ message: "Failed to fetch agenda" });
    }
  });

  // Submit or update KRA ratings for a one-on-one
  app.post("/api/one-on-ones/:id/kra-ratings", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      const meetingId = req.params.id;
      
      // Validate request body
      const validationSchema = z.array(
        z.object({
          kraId: z.string(),
          rating: z.number().int().min(1).max(5),
          note: z.string().optional()
        })
      );
      
      const ratings = validationSchema.parse(req.body);
      
      // Get the meeting
      const meeting = await storage.getOneOnOne(req.orgId, meetingId);
      if (!meeting) {
        return res.status(404).json({ message: "One-on-one not found" });
      }
      
      // Check if user has access to this meeting
      const hasAccess = await canAccessOneOnOne(
        req.orgId,
        req.userId!,
        req.currentUser!.role,
        req.currentUser!.teamId,
        meeting
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Determine rater role
      const isSupervisor = req.userId === meeting.participantOneId;
      const raterRole = isSupervisor ? "supervisor" : "self";
      
      // Prepare ratings with rater info
      const ratingsToUpsert = ratings.map(rating => ({
        ...rating,
        oneOnOneId: meetingId,
        raterId: req.userId!,
        raterRole
      }));
      
      // Upsert ratings
      const upserted = await storage.upsertKraRatings(req.orgId, ratingsToUpsert);
      
      res.json(upserted);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid ratings data", errors: error.errors });
      }
      console.error("POST /api/one-on-ones/:id/kra-ratings - Error:", error);
      res.status(500).json({ message: "Failed to save KRA ratings" });
    }
  });

  // Get user's KRAs with latest supervisor ratings
  app.get("/api/users/:userId/kras", requireAuth(), async (req, res) => {
    try {
      const targetUserId = req.params.userId;
      
      // Check if user can access this user's KRAs
      const canAccess = 
        req.userId === targetUserId || 
        req.currentUser?.role === "admin" ||
        (await storage.getUser(req.orgId, targetUserId))?.managerId === req.userId;
      
      if (!canAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get user's active KRAs
      const kras = await storage.getUserKrasByUser(req.orgId, targetUserId, "active");
      
      // Get latest supervisor ratings
      const kraIds = kras.map(kra => kra.id);
      const supervisorRatings = await storage.getLatestSupervisorRatings(req.orgId, kraIds);
      
      // Combine KRA data with ratings
      const krasWithRatings = kras.map(kra => {
        const lastRating = supervisorRatings.get(kra.id);
        return {
          ...kra,
          lastSupervisorRating: lastRating ? {
            rating: lastRating.rating,
            note: lastRating.note,
            createdAt: lastRating.createdAt
          } : null
        };
      });
      
      res.json(krasWithRatings);
    } catch (error) {
      console.error("GET /api/users/:userId/kras - Error:", error);
      res.status(500).json({ message: "Failed to fetch user KRAs" });
    }
  });

  // Get KRA history for audit trail
  app.get("/api/kras/:kraId/history", requireAuth(), async (req, res) => {
    try {
      const kraId = req.params.kraId;
      
      // Get the KRA to check access
      const kra = await storage.getUserKra(req.orgId, kraId);
      if (!kra) {
        return res.status(404).json({ message: "KRA not found" });
      }
      
      // Check if user can access this KRA's history
      const canAccess = 
        req.userId === kra.userId || 
        req.userId === kra.assignedBy ||
        req.currentUser?.role === "admin";
      
      if (!canAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get history
      const history = await storage.getKraHistory(req.orgId, kraId);
      
      res.json(history);
    } catch (error) {
      console.error("GET /api/kras/:kraId/history - Error:", error);
      res.status(500).json({ message: "Failed to fetch KRA history" });
    }
  });

  app.delete("/api/action-items/:id", requireAuth(), async (req, res) => {
    try {
      // Get existing action item to verify permissions
      const existingActionItem = await storage.getActionItem(req.orgId, req.params.id);
      if (!existingActionItem) {
        return res.status(404).json({ message: "Action item not found" });
      }
      
      // Verify user has access to this action item (either assigned to them or part of the meeting)
      const meeting = await storage.getOneOnOne(req.orgId, existingActionItem.meetingId);
      if (!meeting) {
        return res.status(404).json({ message: "Associated meeting not found" });
      }
      
      // Check if user has access to delete this action item
      const hasMeetingAccess = await canAccessOneOnOne(
        req.orgId, 
        req.userId, 
        req.currentUser.role, 
        req.currentUser.teamId, 
        meeting
      );
      
      const canDelete = existingActionItem.assignedTo === req.userId || hasMeetingAccess;
      
      if (!canDelete) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const deleted = await storage.deleteActionItem(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Action item not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("DELETE /api/action-items/:id - Error:", error);
      res.status(500).json({ message: "Failed to delete action item" });
    }
  });

  // KRA Templates endpoints
  app.get("/api/kra-templates", requireAuth(), requireFeatureAccess('kra_management'), async (req, res) => {
    try {
      // Validate query parameters using Zod
      const querySchema = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        activeOnly: z.coerce.boolean().default(true),
        category: z.string().optional()
      });
      
      const queryResult = querySchema.safeParse(req.query);
      if (!queryResult.success) {
        return res.status(400).json({ 
          message: "Invalid query parameters", 
          errors: queryResult.error.errors 
        });
      }
      
      const { page, limit, activeOnly, category } = queryResult.data;
      
      let templates;
      if (category) {
        templates = await storage.getKraTemplatesByCategory(req.orgId, category);
      } else {
        templates = await storage.getAllKraTemplates(req.orgId, activeOnly);
      }
      
      // Get all user KRAs for this organization to count assignments
      const allUserKras = await storage.getActiveUserKras(req.orgId);
      
      // Count assignments for each template
      const templateAssignmentCounts = new Map<string, number>();
      for (const userKra of allUserKras) {
        if (userKra.templateId) {
          const currentCount = templateAssignmentCounts.get(userKra.templateId) || 0;
          templateAssignmentCounts.set(userKra.templateId, currentCount + 1);
        }
      }
      
      // Add assignment counts to templates
      const templatesWithCounts = templates.map(template => ({
        ...template,
        assignmentCount: templateAssignmentCounts.get(template.id) || 0
      }));
      
      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedTemplates = templatesWithCounts.slice(startIndex, endIndex);
      
      res.json({
        templates: paginatedTemplates,
        pagination: {
          page,
          limit,
          total: templatesWithCounts.length,
          totalPages: Math.ceil(templatesWithCounts.length / limit)
        }
      });
    } catch (error) {
      console.error("GET /api/kra-templates - Error:", error);
      res.status(500).json({ message: "Failed to fetch KRA templates" });
    }
  });

  app.get("/api/kra-templates/:id", requireAuth(), requireFeatureAccess('kra_management'), async (req, res) => {
    try {
      const template = await storage.getKraTemplate(req.orgId, req.params.id);
      if (!template) {
        return res.status(404).json({ message: "KRA template not found" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("GET /api/kra-templates/:id - Error:", error);
      res.status(500).json({ message: "Failed to fetch KRA template" });
    }
  });

  app.post("/api/kra-templates", requireAuth(), requireFeatureAccess('kra_management'), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      // Validate request body using Zod schema
      const validationSchema = insertKraTemplateSchema.omit({ organizationId: true, createdBy: true }).extend({
        name: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        goals: z.array(z.any()).default([]),
        category: z.string().max(50).default("general"),
        isActive: z.boolean().default(true)
      });
      
      const validatedData = validationSchema.parse(req.body);
      
      const templateData = {
        ...validatedData,
        createdBy: req.userId!,
        organizationId: req.orgId!
      };
      
      const template = await storage.createKraTemplate(req.orgId, templateData);
      res.status(201).json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("POST /api/kra-templates - Error:", error);
      res.status(500).json({ message: "Failed to create KRA template" });
    }
  });

  app.put("/api/kra-templates/:id", requireAuth(), requireFeatureAccess('kra_management'), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      // Validate request body using Zod schema
      const updateSchema = insertKraTemplateSchema.omit({ organizationId: true, createdBy: true }).partial().extend({
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(1000).optional(),
        goals: z.array(z.any()).optional(),
        category: z.string().max(50).optional(),
        isActive: z.boolean().optional()
      });
      
      const validatedData = updateSchema.parse(req.body);
      
      const updatedTemplate = await storage.updateKraTemplate(req.orgId, req.params.id, validatedData);
      if (!updatedTemplate) {
        return res.status(404).json({ message: "KRA template not found" });
      }
      
      res.json(updatedTemplate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("PUT /api/kra-templates/:id - Error:", error);
      res.status(500).json({ message: "Failed to update KRA template" });
    }
  });

  app.delete("/api/kra-templates/:id", requireAuth(), requireFeatureAccess('kra_management'), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const deleted = await storage.deleteKraTemplate(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "KRA template not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("DELETE /api/kra-templates/:id - Error:", error);
      res.status(500).json({ message: "Failed to delete KRA template" });
    }
  });

  // Additional KRA Template endpoints for partial updates and approval
  app.patch("/api/kra-templates/:id", requireAuth(), requireFeatureAccess('kra_management'), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const updateSchema = insertKraTemplateSchema.omit({ organizationId: true, createdBy: true }).partial();
      
      const validatedData = updateSchema.parse(req.body);
      
      const updated = await storage.updateKraTemplate(req.orgId, req.params.id, validatedData);
      if (!updated) {
        return res.status(404).json({ message: "KRA template not found" });
      }
      
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: error.errors 
        });
      }
      console.error("PATCH /api/kra-templates/:id - Error:", error);
      res.status(500).json({ message: "Failed to update KRA template" });
    }
  });

  // Toggle KRA template active status
  app.patch("/api/kra-templates/:id/approve", requireAuth(), requireFeatureAccess('kra_management'), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { active } = req.body;
      
      if (typeof active !== 'boolean') {
        return res.status(400).json({ message: "Active status must be a boolean" });
      }
      
      const updated = await storage.setKraTemplateActive(req.orgId, req.params.id, active);
      if (!updated) {
        return res.status(404).json({ message: "KRA template not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("PATCH /api/kra-templates/:id/approve - Error:", error);
      res.status(500).json({ message: "Failed to update KRA template approval status" });
    }
  });

  // Industry-based KRA template endpoints for onboarding
  app.get("/api/kra-templates/industry/:industry", async (req, res) => {
    try {
      const { industry } = req.params;
      
      // Get global templates for this industry
      const templates = await storage.getGlobalTemplatesByIndustry(industry);
      
      // Group templates by category/department
      const grouped: Record<string, typeof templates> = {};
      for (const template of templates) {
        const category = template.category || 'general';
        if (!grouped[category]) {
          grouped[category] = [];
        }
        grouped[category].push(template);
      }
      
      res.json({
        industry,
        templateCount: templates.length,
        categories: Object.keys(grouped),
        templates: grouped
      });
    } catch (error) {
      console.error("GET /api/kra-templates/industry/:industry - Error:", error);
      res.status(500).json({ message: "Failed to fetch industry templates" });
    }
  });

  // Get KRA template statistics
  app.get("/api/kra-templates/stats", requireAuth(), requireFeatureAccess('kra_management'), async (req, res) => {
    try {
      const templateCount = await storage.getKraTemplateCount(req.orgId);
      const globalCount = 28; // Total number of default templates available
      
      res.json({
        organizationTemplates: templateCount,
        availableTemplates: globalCount,
        imported: templateCount > 0
      });
    } catch (error) {
      console.error("GET /api/kra-templates/stats - Error:", error);
      res.status(500).json({ message: "Failed to fetch template statistics" });
    }
  });

  // Fallback import endpoint - uses hardcoded templates for guaranteed success
  app.post("/api/kra-templates/import-fallback", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      console.log(`🚨 KRA Import Fallback - Using hardcoded templates for orgId: "${req.orgId}"`);
      
      // Import fallback templates
      const { FALLBACK_TEMPLATES } = await import('./kraTemplatesFallback');
      
      let importedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];
      const importedNames: string[] = [];
      
      for (const template of FALLBACK_TEMPLATES) {
        try {
          // Add organization to name for clarity
          const templateName = `${template.name} (${template.organization})`;
          
          // Check if template already exists
          const existingTemplates = await storage.getKraTemplatesByName(req.orgId, templateName);
          if (existingTemplates && existingTemplates.length > 0) {
            skippedCount++;
            continue;
          }
          
          // Create template directly without any organization lookup
          const dbTemplate = {
            organizationId: req.orgId,
            name: templateName,
            description: template.description || '',
            goals: template.goals || [], // Pass as array, not stringified
            category: template.category || 'general',
            department: template.department || '',
            jobTitle: template.jobTitle || '',
            industries: template.industries || [], // Pass as array, not joined string
            isGlobal: false,
            isActive: true,
            createdBy: req.userId || 'system'
          };
          
          await storage.createKraTemplate(req.orgId, dbTemplate);
          importedCount++;
          importedNames.push(templateName);
        } catch (err) {
          console.error(`Failed to import fallback template ${template.name}:`, err);
          errors.push(`Failed to import ${template.name}`);
        }
      }
      
      console.log(`✅ Fallback Import Complete: Imported ${importedCount}, Skipped ${skippedCount}`);
      if (importedCount > 0) {
        console.log(`✅ Imported templates: ${importedNames.join(', ')}`);
      }
      
      res.json({
        message: `Imported ${importedCount} essential templates`,
        imported: importedCount,
        skipped: skippedCount,
        total: FALLBACK_TEMPLATES.length,
        importedNames: importedCount > 0 ? importedNames : undefined,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error("POST /api/kra-templates/import-fallback - Error:", error);
      res.status(500).json({ 
        message: "Failed to import fallback templates", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Diagnostic endpoint for debugging template issues
  app.get("/api/kra-templates/diagnostic", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      console.log(`🔍 KRA Diagnostic - Running diagnostic for orgId: "${req.orgId}"`);
      
      // Import templates to check what's available
      const templates = await import('@shared/defaultKraTemplates');
      const DEFAULT_KRA_TEMPLATES = templates.DEFAULT_KRA_TEMPLATES || [];
      
      // Get existing templates count
      const existingCount = await storage.getKraTemplateCount(req.orgId);
      
      // Get template organizations
      const templateOrgs = [...new Set(DEFAULT_KRA_TEMPLATES.map(t => t.organization))];
      
      // Get sample template
      const sampleTemplate = DEFAULT_KRA_TEMPLATES[0] ? {
        name: DEFAULT_KRA_TEMPLATES[0].name,
        organization: DEFAULT_KRA_TEMPLATES[0].organization,
        hasGoals: DEFAULT_KRA_TEMPLATES[0].goals ? DEFAULT_KRA_TEMPLATES[0].goals.length : 0
      } : null;
      
      const diagnostic = {
        orgId: req.orgId,
        templatesAvailable: DEFAULT_KRA_TEMPLATES.length,
        existingTemplates: existingCount,
        templateOrganizations: templateOrgs,
        sampleTemplate: sampleTemplate,
        importModuleLoaded: !!templates,
        hasDefaultTemplates: !!templates.DEFAULT_KRA_TEMPLATES,
        hasConvertFunction: !!templates.convertToDbFormat,
        hasGetTemplatesFunction: !!templates.getTemplatesByOrganization
      };
      
      console.log(`📊 Diagnostic Results:`, diagnostic);
      
      res.json(diagnostic);
    } catch (error) {
      console.error("GET /api/kra-templates/diagnostic - Error:", error);
      res.status(500).json({ 
        message: "Diagnostic failed", 
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  });
  
  // Import all templates endpoint - fixed to not depend on organization names
  app.post("/api/kra-templates/import-all", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      console.log(`🚀 KRA Import All - Starting import for orgId: "${req.orgId}"`);
      
      // Import default templates module
      const templateModule = await import('@shared/defaultKraTemplates');
      
      // Try multiple ways to access templates for production compatibility
      const DEFAULT_KRA_TEMPLATES = 
        templateModule.DEFAULT_KRA_TEMPLATES || 
        templateModule.default?.DEFAULT_KRA_TEMPLATES ||
        [];
      
      if (!DEFAULT_KRA_TEMPLATES || DEFAULT_KRA_TEMPLATES.length === 0) {
        console.error(`❌ No templates found in module. Module keys: ${Object.keys(templateModule).join(', ')}`);
        return res.status(500).json({ 
          message: "No templates found in module",
          imported: 0,
          skipped: 0,
          total: 0,
          moduleKeys: Object.keys(templateModule)
        });
      }
      
      console.log(`📊 Total templates available: ${DEFAULT_KRA_TEMPLATES.length}`);
      
      let importedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];
      const importedNames: string[] = [];
      const skippedNames: string[] = [];
      
      // Import each template WITHOUT filtering by organization
      for (const template of DEFAULT_KRA_TEMPLATES) {
        try {
          // Create a unique name that includes the source organization for clarity
          const templateName = `${template.name} (${template.organization})`;
          
          // Check if template already exists with this name
          const existingTemplates = await storage.getKraTemplatesByName(req.orgId, templateName);
          if (existingTemplates && existingTemplates.length > 0) {
            skippedCount++;
            skippedNames.push(templateName);
            continue;
          }
          
          // Create the template with the current organization's ID
          const dbTemplate = {
            organizationId: req.orgId,
            name: templateName,
            description: template.description || '',
            goals: template.goals || [], // Pass as array, not stringified
            category: template.category || 'general',
            jobTitle: template.jobTitle || '',
            industries: template.industries || [], // Pass as array, not joined string
            isGlobal: false,
            isActive: true,
            createdBy: req.userId || 'system'
          };
          
          await storage.createKraTemplate(req.orgId, dbTemplate);
          importedCount++;
          importedNames.push(templateName);
          console.log(`✅ Successfully imported: ${templateName}`);
        } catch (err) {
          console.error(`❌ Failed to import template ${template.name}:`, err);
          console.error(`Template data:`, JSON.stringify(dbTemplate, null, 2));
          console.error(`Error details:`, err instanceof Error ? err.stack : err);
          errors.push(`Failed to import ${template.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
      
      console.log(`🎉 KRA Import All Complete: Imported ${importedCount}, Skipped ${skippedCount}, Total ${DEFAULT_KRA_TEMPLATES.length}`);
      if (importedCount > 0) {
        console.log(`✅ Imported templates: ${importedNames.join(', ')}`);
      }
      if (skippedCount > 0) {
        console.log(`⏭️ Skipped templates: ${skippedNames.join(', ')}`);
      }
      
      res.json({
        message: `Successfully imported ${importedCount} templates`,
        imported: importedCount,
        skipped: skippedCount,
        total: DEFAULT_KRA_TEMPLATES.length,
        importedNames: importedCount > 0 ? importedNames : undefined,
        skippedNames: skippedCount > 0 ? skippedNames : undefined,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error("POST /api/kra-templates/import-all - Full Error:", error);
      console.error("Error Stack:", error instanceof Error ? error.stack : 'No stack');
      res.status(500).json({ 
        message: "Failed to import templates", 
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : undefined
      });
    }
  });
  
  // Import default KRA templates - fixed to not filter by organization names
  app.post("/api/kra-templates/import-defaults", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const { organization } = req.body; // "all", "patrick", or "whirks" (but we'll import all regardless)
      
      console.log(`🚀 KRA Import Started - Selection: "${organization}", orgId: "${req.orgId}"`);
      
      // Import default templates
      const { DEFAULT_KRA_TEMPLATES } = await import('@shared/defaultKraTemplates');
      
      console.log(`📊 Total templates available: ${DEFAULT_KRA_TEMPLATES.length}`);
      
      // Filter templates based on selection (for UI purposes only)
      let templatesToImport = DEFAULT_KRA_TEMPLATES;
      if (organization === 'patrick') {
        templatesToImport = DEFAULT_KRA_TEMPLATES.filter(t => t.organization === 'Patrick Accounting');
      } else if (organization === 'whirks') {
        templatesToImport = DEFAULT_KRA_TEMPLATES.filter(t => t.organization === 'Whirks');
      }
      
      console.log(`✅ Will import ${templatesToImport.length} templates for selection: "${organization}"`);
      
      let importedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];
      const importedNames: string[] = [];
      
      // Import each template to the current organization
      for (const template of templatesToImport) {
        try {
          // Create a unique name that includes the source organization
          const templateName = `${template.name} (${template.organization})`;
          
          // Check if template already exists
          const existingTemplates = await storage.getKraTemplatesByName(req.orgId, templateName);
          if (existingTemplates && existingTemplates.length > 0) {
            console.log(`⏭️ Skipping existing template: ${templateName}`);
            skippedCount++;
            continue;
          }
          
          // Create template for current organization
          const dbTemplate = {
            organizationId: req.orgId,
            name: templateName,
            description: template.description || '',
            goals: template.goals || [], // Pass as array, not stringified
            category: template.category || 'general',
            jobTitle: template.jobTitle || '',
            industries: template.industries || [], // Pass as array, not joined string
            isGlobal: false,
            isActive: true,
            createdBy: req.userId || 'system'
          };
          
          await storage.createKraTemplate(req.orgId, dbTemplate);
          importedCount++;
          importedNames.push(templateName);
        } catch (err) {
          console.error(`Failed to import template ${template.name}:`, err);
          errors.push(`Failed to import ${template.name}`);
        }
      }
      
      console.log(`🎉 KRA Import Complete: Imported ${importedCount}, Skipped ${skippedCount}, Total ${templatesToImport.length}`);
      if (importedCount > 0) {
        console.log(`✅ Imported: ${importedNames.join(', ')}`);
      }
      
      res.json({
        message: `Import completed successfully`,
        imported: importedCount,
        skipped: skippedCount,
        total: templatesToImport.length,
        importedNames: importedCount > 0 ? importedNames : undefined,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error("POST /api/kra-templates/import-defaults - Error:", error);
      res.status(500).json({ message: "Failed to import default templates" });
    }
  });

  // Copy templates to organization during onboarding
  app.post("/api/kra-templates/import", requireAuth(), requireRole(['admin', 'owner']), async (req, res) => {
    try {
      const importSchema = z.object({
        templateIds: z.array(z.string()).min(1, "At least one template must be selected"),
      });
      
      const { templateIds } = importSchema.parse(req.body);
      
      // Copy templates to the organization
      const copiedTemplates = await storage.copyTemplatesToOrganization(
        req.orgId,
        templateIds,
        req.userId
      );
      
      res.json({
        message: `Successfully imported ${copiedTemplates.length} templates`,
        templates: copiedTemplates
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: error.errors 
        });
      }
      console.error("POST /api/kra-templates/import - Error:", error);
      res.status(500).json({ message: "Failed to import templates" });
    }
  });

  // Generate AI-powered KRA template
  app.post("/api/kra-templates/generate", requireAuth(), requireRole(['admin', 'owner']), async (req, res) => {
    try {
      const generateSchema = z.object({
        jobTitle: z.string().min(1, "Job title is required"),
        industry: z.string().min(1, "Industry is required"),
        department: z.string().optional(),
        reportsTo: z.string().optional(),
      });
      
      const { jobTitle, industry, department, reportsTo } = generateSchema.parse(req.body);
      
      // Import question generator service (already has AI generation capabilities)
      const { generateKRATemplate } = await import('./services/questionGenerator');
      
      // Generate template using AI
      const generatedGoals = await generateKRATemplate(jobTitle, industry, department, reportsTo);
      
      // Create the template in the database
      const template = await storage.createKraTemplate(req.orgId, {
        name: jobTitle,
        description: `AI-generated KRA template for ${jobTitle} in ${industry}`,
        goals: generatedGoals,
        category: department || 'general',
        jobTitle,
        industries: [industry],
        isGlobal: false,
        isActive: true,
        createdBy: req.userId
      });
      
      res.json({
        message: "Successfully generated KRA template",
        template
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: error.errors 
        });
      }
      console.error("POST /api/kra-templates/generate - Error:", error);
      res.status(500).json({ message: "Failed to generate KRA template" });
    }
  });

  // ========== QUESTION BANK MANAGEMENT ENDPOINTS ==========
  
  // Get question statistics
  app.get("/api/questions/stats", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Get existing questions and categories from database
      const categories = await storage.getQuestionCategories(req.orgId);
      const questions = await storage.getAllQuestionBankItems(req.orgId);
      
      // Get counts by category
      const categoryStats = new Map<string, number>();
      for (const category of categories) {
        categoryStats.set(category.id, 0);
      }
      for (const question of questions) {
        if (categoryStats.has(question.categoryId)) {
          categoryStats.set(question.categoryId, categoryStats.get(question.categoryId)! + 1);
        }
      }

      // Convert to array format for response
      const categoryCounts = Array.from(categoryStats.entries()).map(([categoryId, count]) => {
        const category = categories.find(c => c.id === categoryId);
        return {
          categoryId,
          categoryName: category?.name || categoryId,
          count
        };
      });

      res.json({
        totalCategories: categories.length,
        totalQuestions: questions.length,
        categoryCounts,
        defaultCategoriesAvailable: 6,
        defaultQuestionsAvailable: 30
      });
    } catch (error) {
      console.error("GET /api/questions/stats - Error:", error);
      res.status(500).json({ message: "Failed to fetch question statistics" });
    }
  });

  // Seed/restore default questions
  app.post("/api/questions/seed-defaults", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Import default questions and categories
      const { defaultQuestions, defaultQuestionCategories } = await import('@shared/defaultQuestions');
      
      let categoriesCreated = 0;
      let questionsCreated = 0;
      let categoriesSkipped = 0;
      let questionsSkipped = 0;
      const errors: string[] = [];

      // Get existing categories and questions
      const existingCategories = await storage.getQuestionCategories(req.orgId);
      const existingQuestions = await storage.getAllQuestionBankItems(req.orgId);
      
      // Create a set of existing category IDs and question texts for quick lookup
      const existingCategoryIds = new Set(existingCategories.map(c => c.id));
      const existingQuestionTexts = new Set(existingQuestions.map(q => q.text));

      // Seed categories first
      for (const category of defaultQuestionCategories) {
        try {
          if (existingCategoryIds.has(category.id)) {
            categoriesSkipped++;
            continue;
          }

          await storage.createQuestionCategory(req.orgId, {
            ...category,
            organizationId: req.orgId
          });
          categoriesCreated++;
        } catch (err) {
          console.error(`Failed to create category ${category.name}:`, err);
          errors.push(`Failed to create category: ${category.name}`);
        }
      }

      // Seed questions
      for (const question of defaultQuestions) {
        try {
          // Skip if question already exists (check by text)
          if (existingQuestionTexts.has(question.text)) {
            questionsSkipped++;
            continue;
          }

          await storage.createQuestionBankItem(req.orgId, {
            text: question.text,
            categoryId: question.categoryId,
            description: question.description,
            tags: question.tags,
            isSystem: question.isSystem,
            isApproved: question.isApproved,
            organizationId: req.orgId
          });
          questionsCreated++;
        } catch (err) {
          console.error(`Failed to create question: ${question.text}:`, err);
          errors.push(`Failed to create question: ${question.text.substring(0, 50)}...`);
        }
      }

      res.json({
        message: "Question bank restoration completed successfully",
        categoriesCreated,
        questionsCreated,
        categoriesSkipped,
        questionsSkipped,
        totalCategories: defaultQuestionCategories.length,
        totalQuestions: defaultQuestions.length,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error("POST /api/questions/seed-defaults - Error:", error);
      res.status(500).json({ message: "Failed to seed default questions" });
    }
  });

  // Get all question bank items (for admin view)
  app.get("/api/questions/bank", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const { categoryId, search } = req.query;
      
      // Get all questions
      let questions = await storage.getAllQuestionBankItems(req.orgId);
      
      // Filter by category if provided
      if (categoryId && typeof categoryId === 'string') {
        questions = questions.filter(q => q.categoryId === categoryId);
      }
      
      // Filter by search term if provided
      if (search && typeof search === 'string') {
        const searchLower = search.toLowerCase();
        questions = questions.filter(q => 
          q.text.toLowerCase().includes(searchLower) ||
          q.description?.toLowerCase().includes(searchLower) ||
          q.tags?.some(tag => tag.toLowerCase().includes(searchLower))
        );
      }
      
      // Get categories for additional info
      const categories = await storage.getQuestionCategories(req.orgId);
      const categoryMap = new Map(categories.map(c => [c.id, c]));
      
      // Enhance questions with category info
      const enhancedQuestions = questions.map(q => ({
        ...q,
        categoryName: categoryMap.get(q.categoryId)?.name,
        categoryIcon: categoryMap.get(q.categoryId)?.icon,
        categoryColor: categoryMap.get(q.categoryId)?.color
      }));

      res.json({
        questions: enhancedQuestions,
        total: enhancedQuestions.length
      });
    } catch (error) {
      console.error("GET /api/questions/bank - Error:", error);
      res.status(500).json({ message: "Failed to fetch question bank" });
    }
  });

  // Toggle question active status
  app.patch("/api/questions/bank/:id/toggle", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get current question
      const question = await storage.getQuestionBankItem(req.orgId, id);
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }
      
      // Toggle active status
      const updatedQuestion = await storage.updateQuestionBankItem(req.orgId, id, {
        isActive: !question.isActive
      });
      
      res.json({
        message: `Question ${updatedQuestion.isActive ? 'activated' : 'deactivated'} successfully`,
        question: updatedQuestion
      });
    } catch (error) {
      console.error("PATCH /api/questions/bank/:id/toggle - Error:", error);
      res.status(500).json({ message: "Failed to toggle question status" });
    }
  });

  // Create KRA assignment(s)
  app.post("/api/kra-assignments", requireAuth(), requireFeatureAccess('kra_management'), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const assignmentSchema = z.object({
        templateId: z.string().optional(),
        userIds: z.array(z.string()).min(1, "At least one user must be selected"),
        startDate: z.string().transform(str => new Date(str)),
        endDate: z.string().transform(str => new Date(str)).optional(),
        reviewDate: z.string().transform(str => new Date(str)).optional(),
        goals: z.array(z.object({
          title: z.string(),
          description: z.string().optional(),
          target: z.string().optional(),
          metric: z.string().optional(),
        })).min(1, "At least one goal is required"),
        name: z.string().min(1, "Name is required"),
        description: z.string().optional()
      });
      
      const validatedData = assignmentSchema.parse(req.body);
      const assignedBy = req.userId;
      
      // Create assignments for each user
      const assignments = [];
      for (const userId of validatedData.userIds) {
        const kraData: InsertUserKra = {
          organizationId: req.orgId,
          userId,
          templateId: validatedData.templateId,
          name: validatedData.name,
          description: validatedData.description,
          goals: validatedData.goals,
          assignedBy,
          startDate: validatedData.startDate,
          endDate: validatedData.endDate,
          status: "active",
          progress: 0
        };
        
        const created = await storage.createUserKra(req.orgId, kraData);
        assignments.push(created);
        
        // Add KRA to upcoming one-on-ones between manager and assignee
        try {
          const upcomingOneOnOnes = await storage.getUpcomingOneOnOnesBetween(
            req.orgId,
            assignedBy, // manager
            userId // team member
          );
          
          // Add the KRA to each upcoming one-on-one
          for (const meeting of upcomingOneOnOnes) {
            const currentKraIds = meeting.kraIds || [];
            if (!currentKraIds.includes(created.id)) {
              await storage.updateOneOnOne(req.orgId, meeting.id, {
                kraIds: [...currentKraIds, created.id]
              });
            }
          }
        } catch (error) {
          console.log(`Note: Could not add KRA to one-on-ones: ${error.message}`);
          // Don't fail the KRA assignment if one-on-one update fails
        }
      }
      
      res.json({
        message: `Successfully created ${assignments.length} KRA assignment(s)`,
        assignments
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: error.errors 
        });
      }
      console.error("POST /api/kra-assignments - Error:", error);
      res.status(500).json({ message: "Failed to create KRA assignments" });
    }
  });

  // Get users available for KRA assignment
  app.get("/api/users/assignable", requireAuth(), requireFeatureAccess('kra_management'), async (req, res) => {
    try {
      const users = await storage.getUsersForKraAssignment(req.orgId);
      res.json(users);
    } catch (error) {
      console.error("GET /api/users/assignable - Error:", error);
      res.status(500).json({ message: "Failed to fetch assignable users" });
    }
  });

  // User KRAs endpoints
  app.get("/api/user-kras", requireAuth(), requireFeatureAccess('kra_management'), async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const statusFilter = req.query.status as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      
      // Get current user to check role
      const currentUser = await storage.getUser(req.orgId, req.userId);
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      let krasData: any[] = [];
      
      // Admins can see all KRAs in the organization
      if (currentUser.role === 'admin' && !userId) {
        // When admin views the assignments tab without a specific user filter,
        // show all KRAs in the organization
        krasData = await storage.getAllUserKras(req.orgId, statusFilter);
        
        // Fetch additional data for each KRA (user info, template info)
        const krasWithDetails = await Promise.all(krasData.map(async (kra) => {
          const [assignee, template, assignedByUser] = await Promise.all([
            storage.getUser(req.orgId, kra.userId),
            kra.templateId ? storage.getKraTemplate(req.orgId, kra.templateId) : null,
            storage.getUser(req.orgId, kra.assignedBy)
          ]);
          
          return {
            ...kra,
            assignee,
            template,
            assignedByUser
          };
        }));
        
        krasData = krasWithDetails;
      } else {
        // Non-admins or admins with a specific user filter
        const targetUserId = userId || req.userId;
        
        // Check permissions
        if (targetUserId !== req.userId && currentUser.role !== 'admin' && currentUser.role !== 'manager') {
          return res.status(403).json({ message: "You can only view your own KRAs" });
        }
        
        krasData = await storage.getUserKrasByUser(req.orgId, targetUserId, statusFilter);
        
        // Fetch additional data for each KRA
        const krasWithDetails = await Promise.all(krasData.map(async (kra) => {
          const [assignee, template, assignedByUser] = await Promise.all([
            storage.getUser(req.orgId, kra.userId),
            kra.templateId ? storage.getKraTemplate(req.orgId, kra.templateId) : null,
            storage.getUser(req.orgId, kra.assignedBy)
          ]);
          
          return {
            ...kra,
            assignee,
            template,
            assignedByUser
          };
        }));
        
        krasData = krasWithDetails;
      }
      
      // Return formatted response with pagination
      res.json({
        kras: krasData,
        pagination: {
          page,
          limit,
          total: krasData.length,
          totalPages: Math.ceil(krasData.length / limit)
        }
      });
    } catch (error) {
      console.error("GET /api/user-kras - Error:", error);
      res.status(500).json({ message: "Failed to fetch user KRAs" });
    }
  });

  app.get("/api/user-kras/my-team", requireAuth(), requireFeatureAccess('kra_management'), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      // Get KRAs for users assigned by this manager
      const teamKras = await storage.getUserKrasByAssigner(req.orgId, req.userId);
      res.json(teamKras);
    } catch (error) {
      console.error("GET /api/user-kras/my-team - Error:", error);
      res.status(500).json({ message: "Failed to fetch team KRAs" });
    }
  });

  app.get("/api/user-kras/:id", requireAuth(), requireFeatureAccess('kra_management'), async (req, res) => {
    try {
      const userKra = await storage.getUserKra(req.orgId, req.params.id);
      if (!userKra) {
        return res.status(404).json({ message: "User KRA not found" });
      }
      
      // Check if user can access this KRA
      const currentUser = await storage.getUser(req.orgId, req.userId);
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const canAccess = userKra.userId === req.userId || 
                       userKra.assignedBy === req.userId || 
                       currentUser.role === 'admin' ||
                       (currentUser.role === 'manager' && userKra.assignedBy === req.userId);
      
      if (!canAccess) {
        return res.status(403).json({ message: "You can only access KRAs you own or have assigned" });
      }
      
      res.json(userKra);
    } catch (error) {
      console.error("GET /api/user-kras/:id - Error:", error);
      res.status(500).json({ message: "Failed to fetch user KRA" });
    }
  });

  app.post("/api/user-kras", requireAuth(), requireFeatureAccess('kra_management'), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { userId, templateId, name, description, goals, startDate, endDate } = req.body;
      
      // Verify the target user exists and is in the same organization
      const targetUser = await storage.getUser(req.orgId, userId);
      if (!targetUser) {
        return res.status(404).json({ message: "Target user not found" });
      }
      
      const userKraData = {
        userId,
        templateId: templateId || null,
        name,
        description: description || null,
        goals: goals || [],
        assignedBy: req.userId!,
        organizationId: req.orgId!,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        status: "active" as const,
        progress: 0
      };
      
      const userKra = await storage.createUserKra(req.orgId, userKraData);
      res.status(201).json(userKra);
    } catch (error) {
      console.error("POST /api/user-kras - Error:", error);
      res.status(500).json({ message: "Failed to create user KRA" });
    }
  });

  app.put("/api/user-kras/:id", requireAuth(), requireFeatureAccess('kra_management'), async (req, res) => {
    try {
      const { name, description, goals, progress, status, endDate } = req.body;
      
      // Get existing KRA to verify permissions
      const existingKra = await storage.getUserKra(req.orgId, req.params.id);
      if (!existingKra) {
        return res.status(404).json({ message: "User KRA not found" });
      }
      
      // Check if user can update this KRA
      const currentUser = await storage.getUser(req.orgId!, req.userId!);
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const canUpdate = existingKra.userId === req.userId || 
                       existingKra.assignedBy === req.userId || 
                       currentUser.role === 'admin' ||
                       (currentUser.role === 'manager' && existingKra.assignedBy === req.userId);
      
      if (!canUpdate) {
        return res.status(403).json({ message: "You can only update KRAs you own or have assigned" });
      }
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (goals !== undefined) updateData.goals = goals;
      if (progress !== undefined) updateData.progress = Math.max(0, Math.min(100, progress));
      if (status !== undefined) updateData.status = status;
      if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
      
      const updatedKra = await storage.updateUserKra(req.orgId, req.params.id, updateData);
      if (!updatedKra) {
        return res.status(404).json({ message: "User KRA not found" });
      }
      
      res.json(updatedKra);
    } catch (error) {
      console.error("PUT /api/user-kras/:id - Error:", error);
      res.status(500).json({ message: "Failed to update user KRA" });
    }
  });

  app.delete("/api/user-kras/:id", requireAuth(), requireFeatureAccess('kra_management'), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      // Get existing KRA to verify permissions
      const existingKra = await storage.getUserKra(req.orgId, req.params.id);
      if (!existingKra) {
        return res.status(404).json({ message: "User KRA not found" });
      }
      
      // Check if user can delete this KRA
      const currentUser = await storage.getUser(req.orgId, req.userId);
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const canDelete = existingKra.assignedBy === req.userId || 
                       currentUser.role === 'admin';
      
      if (!canDelete) {
        return res.status(403).json({ message: "You can only delete KRAs you have assigned" });
      }
      
      const deleted = await storage.deleteUserKra(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "User KRA not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("DELETE /api/user-kras/:id - Error:", error);
      res.status(500).json({ message: "Failed to delete user KRA" });
    }
  });

  // Feature availability endpoint
  app.get("/api/features", requireAuth(), async (req, res) => {
    try {
      // Get the organization from storage to ensure we have the latest plan info
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      const features = getFeatureAvailability(organization.plan);
      res.json({
        plan: organization.plan,
        features,
        upgradeSuggestions: getUpgradeSuggestions(organization.plan)
      });
    } catch (error) {
      console.error("GET /api/features - Error:", error);
      res.status(500).json({ message: "Failed to fetch feature availability" });
    }
  });

  // Team Goals endpoints
  app.get("/api/team-goals", authenticateUser(), requireAuth(), async (req, res) => {
    try {
      const activeOnly = req.query.activeOnly === 'true';
      const userId = req.userId!;
      const user = await storage.getUser(req.orgId, userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      let goals: TeamGoal[];
      
      // Check if user is admin (case insensitive)
      const isAdmin = user.role?.toLowerCase() === 'admin';
      
      if (isAdmin) {
        // Admins see ALL team goals across all teams
        goals = await storage.getAllTeamGoals(req.orgId, activeOnly);
        
        // Enrich goals with team names for better display
        const teams = await storage.getAllTeams(req.orgId);
        goals = goals.map(goal => {
          const team = teams.find(t => t.id === goal.teamId);
          return {
            ...goal,
            teamName: team?.name || 'Organization-wide'
          } as TeamGoal & { teamName: string };
        });
      } else {
        // Non-admins only see their team's goals
        if (user.teamId) {
          goals = await storage.getTeamGoalsByTeam(req.orgId, user.teamId, activeOnly);
          // Add team name for consistency
          const team = await storage.getTeam(req.orgId, user.teamId);
          goals = goals.map(goal => ({
            ...goal,
            teamName: goal.teamId === user.teamId ? team?.name : 'Organization-wide'
          } as TeamGoal & { teamName: string }));
        } else {
          // User without a team only sees org-wide goals
          const allGoals = await storage.getAllTeamGoals(req.orgId, activeOnly);
          goals = allGoals.filter(goal => !goal.teamId);
          goals = goals.map(goal => ({
            ...goal,
            teamName: 'Organization-wide'
          } as TeamGoal & { teamName: string }));
        }
      }
      
      res.json(goals);
    } catch (error) {
      console.error("GET /api/team-goals - Error:", error);
      res.status(500).json({ message: "Failed to fetch team goals" });
    }
  });

  app.get("/api/team-goals/dashboard", authenticateUser(), requireAuth(), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(req.orgId, userId);
      const goals = await storage.getDashboardGoals(req.orgId, userId, user?.role);
      
      // For admins, enrich goals with team information for better display
      if (user?.role === 'admin') {
        const teams = await storage.getAllTeams(req.orgId);
        const enrichedGoals = goals.map(goal => {
          const team = teams.find(t => t.id === goal.teamId);
          return {
            ...goal,
            teamName: team?.name || 'Organization-wide'
          };
        });
        res.json(enrichedGoals);
      } else {
        // For non-admins, also include team name for clarity
        const userTeam = user?.teamId ? await storage.getTeam(req.orgId, user.teamId) : null;
        const enrichedGoals = goals.map(goal => ({
          ...goal,
          teamName: goal.teamId ? userTeam?.name : 'Organization-wide'
        }));
        res.json(enrichedGoals);
      }
    } catch (error) {
      console.error("GET /api/team-goals/dashboard - Error:", error);
      res.status(500).json({ message: "Failed to fetch dashboard goals" });
    }
  });

  app.get("/api/team-goals/:id", authenticateUser(), requireAuth(), async (req, res) => {
    try {
      const goal = await storage.getTeamGoal(req.orgId, req.params.id);
      if (!goal) {
        return res.status(404).json({ message: "Team goal not found" });
      }
      res.json(goal);
    } catch (error) {
      console.error("GET /api/team-goals/:id - Error:", error);
      res.status(500).json({ message: "Failed to fetch team goal" });
    }
  });

  app.post("/api/team-goals", authenticateUser(), requireAuth(), requireTeamLead(), async (req, res) => {
    try {
      // Convert string dates to Date objects before validation
      const processedData = {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
        organizationId: req.orgId // Ensure organizationId is set
      };
      
      const validationSchema = insertTeamGoalSchema.extend({
        createdBy: z.string().optional(),
        organizationId: z.string()
      });
      
      const goalData = validationSchema.parse(processedData);
      
      // Calculate date ranges based on goal type
      const now = new Date();
      let startDate = goalData.startDate || now;
      let endDate = goalData.endDate;
      
      if (!endDate) {
        switch (goalData.goalType) {
          case 'weekly':
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 7);
            break;
          case 'monthly':
            endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
            break;
          case 'quarterly':
            endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 3);
            break;
        }
      }
      
      const goal = await storage.createTeamGoal(req.orgId, {
        ...goalData,
        organizationId: req.orgId,
        createdBy: req.userId!,
        startDate,
        endDate
      });
      
      res.status(201).json(goal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("POST /api/team-goals - Validation error:", error.errors);
        return res.status(400).json({ message: "Invalid goal data", errors: error.errors });
      }
      console.error("POST /api/team-goals - Error:", error);
      res.status(500).json({ message: "Failed to create team goal" });
    }
  });

  app.patch("/api/team-goals/:id", requireAuth(), async (req, res) => {
    try {
      // Get existing goal to check permissions
      const existingGoal = await storage.getTeamGoal(req.orgId, req.params.id);
      if (!existingGoal) {
        return res.status(404).json({ message: "Team goal not found" });
      }
      
      // Check if user can update this goal
      const currentUser = await storage.getUser(req.orgId, req.userId!);
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const canUpdate = existingGoal.createdBy === req.userId || currentUser.role === 'admin';
      if (!canUpdate) {
        return res.status(403).json({ message: "You can only update goals you created or if you're an admin" });
      }
      
      const updateSchema = insertTeamGoalSchema.partial();
      const updateData = updateSchema.parse(req.body);
      
      const updatedGoal = await storage.updateTeamGoal(req.orgId, req.params.id, updateData);
      if (!updatedGoal) {
        return res.status(404).json({ message: "Team goal not found" });
      }
      
      res.json(updatedGoal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid goal data", errors: error.errors });
      }
      console.error("PATCH /api/team-goals/:id - Error:", error);
      res.status(500).json({ message: "Failed to update team goal" });
    }
  });

  app.delete("/api/team-goals/:id", requireAuth(), async (req, res) => {
    try {
      // Get existing goal to check permissions
      const existingGoal = await storage.getTeamGoal(req.orgId, req.params.id);
      if (!existingGoal) {
        return res.status(404).json({ message: "Team goal not found" });
      }
      
      // Check if user can delete this goal
      const currentUser = await storage.getUser(req.orgId, req.userId!);
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const canDelete = existingGoal.createdBy === req.userId || currentUser.role === 'admin';
      if (!canDelete) {
        return res.status(403).json({ message: "You can only delete goals you created or if you're an admin" });
      }
      
      const deleted = await storage.deleteTeamGoal(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Team goal not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("DELETE /api/team-goals/:id - Error:", error);
      res.status(500).json({ message: "Failed to delete team goal" });
    }
  });

  app.post("/api/team-goals/:id/progress", authenticateUser(), requireAuth(), async (req, res) => {
    try {
      const { increment } = req.body;
      
      if (typeof increment !== 'number' || increment < 0) {
        return res.status(400).json({ message: "Invalid increment value" });
      }
      
      const updatedGoal = await storage.updateTeamGoalProgress(req.orgId, req.params.id, increment);
      if (!updatedGoal) {
        return res.status(404).json({ message: "Team goal not found" });
      }
      
      res.json(updatedGoal);
    } catch (error) {
      console.error("POST /api/team-goals/:id/progress - Error:", error);
      res.status(500).json({ message: "Failed to update goal progress" });
    }
  });

  // Organization management endpoints
  
  app.get("/api/organizations/:id", requireAuth(), async (req, res) => {
    try {
      // Allow users to access their own organization even if the domain context is different
      // This is needed for onboarding after Slack OAuth creates a new organization
      const userCanAccess = req.params.id === req.orgId || 
                          req.params.id === req.currentUser?.organizationId;
      
      if (!userCanAccess) {
        return res.status(403).json({ message: "You can only access your own organization" });
      }
      
      const organization = await storage.getOrganization(req.params.id);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json(organization);
    } catch (error) {
      console.error("GET /api/organizations/:id - Error:", error);
      res.status(500).json({ message: "Failed to fetch organization" });
    }
  });

  app.put("/api/organizations/:id", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Only allow updating specific fields (server controls security-sensitive fields)
      const updateSchema = insertOrganizationSchema.partial().pick({
        name: true,
        customValues: true,
        timezone: true,
      });
      
      const organizationData = updateSchema.parse(req.body);
      
      // Verify the organization ID matches the authenticated user's organization
      if (req.params.id !== req.orgId) {
        return res.status(403).json({ message: "You can only update your own organization" });
      }
      
      const updatedOrganization = await storage.updateOrganization(req.params.id, organizationData);
      if (!updatedOrganization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json({ message: "Organization updated successfully", organization: updatedOrganization });
    } catch (error) {
      console.error("PUT /api/organizations/:id - Validation error:", error);
      res.status(400).json({ message: "Invalid organization data" });
    }
  });

  // Update organization check-in schedule settings
  app.put("/api/organizations/:id/checkin-schedule", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Create schema for check-in schedule validation
      const checkinScheduleSchema = z.object({
        checkinDueDay: z.number().min(0).max(6), // 0=Sunday, 6=Saturday
        checkinDueTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format"),
        checkinReminderDay: z.number().min(0).max(6).optional().nullable(),
        checkinReminderTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format"),
      });
      
      const scheduleData = checkinScheduleSchema.parse(req.body);
      
      // Verify the organization ID matches the authenticated user's organization
      if (req.params.id !== req.orgId) {
        return res.status(403).json({ message: "You can only update your own organization's schedule" });
      }
      
      const updatedOrganization = await storage.updateOrganization(req.params.id, scheduleData);
      if (!updatedOrganization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json({ 
        message: "Check-in schedule updated successfully", 
        checkinDueDay: updatedOrganization.checkinDueDay,
        checkinDueTime: updatedOrganization.checkinDueTime,
        checkinReminderDay: updatedOrganization.checkinReminderDay,
        checkinReminderTime: updatedOrganization.checkinReminderTime
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid schedule data", errors: error.errors });
      }
      console.error("PUT /api/organizations/:id/checkin-schedule - Error:", error);
      res.status(500).json({ message: "Failed to update check-in schedule" });
    }
  });

  // Integration Management Endpoints
  
  // Get organization integrations data
  app.get("/api/organizations/:id/integrations", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Verify the organization ID matches the authenticated user's organization
      if (req.params.id !== req.orgId) {
        return res.status(403).json({ message: "You can only access your own organization's integrations" });
      }
      
      const organization = await storage.getOrganization(req.params.id);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Return integration-specific fields only - NEVER return secrets
      const integrationData = {
        id: organization.id,
        name: organization.name,
        slackWorkspaceId: organization.slackWorkspaceId,
        slackChannelId: organization.slackChannelId,
        hasSlackBotToken: !!organization.slackBotToken, // Only boolean indicator
        enableSlackIntegration: organization.enableSlackIntegration,
        slackConnectionStatus: organization.slackConnectionStatus,
        slackLastConnected: organization.slackLastConnected,
        microsoftTenantId: organization.microsoftTenantId,
        microsoftClientId: organization.microsoftClientId,
        hasMicrosoftClientSecret: !!organization.microsoftClientSecret, // Only boolean indicator
        enableMicrosoftAuth: organization.enableMicrosoftAuth,
        enableTeamsIntegration: organization.enableTeamsIntegration,
        microsoftConnectionStatus: organization.microsoftConnectionStatus,
        microsoftLastConnected: organization.microsoftLastConnected,
      };
      
      res.json(integrationData);
    } catch (error) {
      console.error("GET /api/organizations/:id/integrations - Error:", error);
      res.status(500).json({ message: "Failed to fetch organization integrations" });
    }
  });

  // Test Slack connection
  app.post("/api/integrations/slack/test", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const { botToken } = req.body;
      
      if (!botToken) {
        return res.status(400).json({ success: false, message: "Bot token is required" });
      }
      
      // Get the organization name for display
      const organization = await storage.getOrganization(req.orgId);
      const organizationName = organization?.name || "Unknown Organization";
      
      // Test the Slack bot token by calling the auth.test API
      const response = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${botToken}`,
          "Content-Type": "application/json",
        },
      });
      
      const data = await response.json();
      
      if (data.ok) {
        res.json({
          success: true,
          message: "Slack connection successful",
          workspaceName: data.team,
          userId: data.user_id,
          organization: organizationName, // Include the organization name in the response
        });
      } else {
        res.json({
          success: false,
          message: data.error || "Failed to connect to Slack",
          organization: organizationName, // Include even in failure for consistency
        });
      }
    } catch (error) {
      console.error("POST /api/integrations/slack/test - Error:", error);
      res.json({
        success: false,
        message: "Network error testing Slack connection",
      });
    }
  });

  // Comprehensive Slack diagnostic endpoint for troubleshooting sync issues
  app.post("/api/integrations/slack/diagnose", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      console.log(`🔍 Slack diagnostic endpoint called for org: ${req.orgId}`);
      console.log(`   User: ${req.currentUser?.name} (${req.currentUser?.email})`);
      
      // Get organization details
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ 
          success: false, 
          message: "Organization not found",
          organizationId: req.orgId
        });
      }
      
      console.log(`📋 Diagnosing Slack integration for: ${organization.name}`);
      console.log(`   Organization slug: ${organization.slug}`);
      console.log(`   Slack status: ${organization.slackConnectionStatus}`);
      console.log(`   Workspace ID: ${organization.slackWorkspaceId}`);
      console.log(`   Channel ID: ${organization.slackChannelId}`);
      console.log(`   Has bot token: ${!!organization.slackBotToken}`);
      
      const diagnosticResults = {
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
        configuration: {
          connectionStatus: organization.slackConnectionStatus,
          workspaceId: organization.slackWorkspaceId,
          channelId: organization.slackChannelId,
          hasBotToken: !!organization.slackBotToken,
          integrationEnabled: organization.enableSlackIntegration,
          lastConnected: organization.slackLastConnected
        },
        tests: {
          tokenValidation: { success: false, message: "", details: {} },
          channelAccess: { success: false, message: "", details: {} },
          permissions: { success: false, message: "", details: {} },
          membersList: { success: false, message: "", details: {} }
        }
      };
      
      // Check if bot token exists
      const botToken = organization.slackBotToken || process.env.SLACK_BOT_TOKEN;
      if (!botToken) {
        diagnosticResults.tests.tokenValidation = {
          success: false,
          message: "No bot token configured",
          details: {
            hasOrgToken: false,
            hasEnvToken: !!process.env.SLACK_BOT_TOKEN
          }
        };
        return res.json(diagnosticResults);
      }
      
      // Test 1: Validate bot token
      console.log(`🔑 Testing bot token...`);
      const authResponse = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${botToken}`,
          "Content-Type": "application/json",
        },
      });
      
      const authData = await authResponse.json();
      if (authData.ok) {
        diagnosticResults.tests.tokenValidation = {
          success: true,
          message: "Token is valid",
          details: {
            workspace: authData.team,
            workspaceId: authData.team_id,
            botUserId: authData.user_id,
            botName: authData.user,
            matchesStoredWorkspace: authData.team_id === organization.slackWorkspaceId
          }
        };
        console.log(`✅ Token valid for workspace: ${authData.team} (${authData.team_id})`);
        
        // Check if workspace ID matches
        if (authData.team_id !== organization.slackWorkspaceId) {
          console.warn(`⚠️ Workspace mismatch! Token workspace: ${authData.team_id}, Stored: ${organization.slackWorkspaceId}`);
        }
      } else {
        diagnosticResults.tests.tokenValidation = {
          success: false,
          message: `Token validation failed: ${authData.error}`,
          details: {
            error: authData.error
          }
        };
        console.error(`❌ Token validation failed: ${authData.error}`);
        return res.json(diagnosticResults);
      }
      
      // Test 2: Check channel access
      const channelId = organization.slackChannelId;
      if (channelId) {
        console.log(`📺 Testing channel access for: ${channelId}`);
        
        try {
          const channelResponse = await fetch(`https://slack.com/api/conversations.info?channel=${channelId}`, {
            headers: {
              "Authorization": `Bearer ${botToken}`,
              "Content-Type": "application/json",
            },
          });
          
          const channelData = await channelResponse.json();
          if (channelData.ok) {
            diagnosticResults.tests.channelAccess = {
              success: true,
              message: "Channel accessible",
              details: {
                channelId: channelId,
                channelName: channelData.channel?.name,
                isMember: channelData.channel?.is_member,
                isPrivate: channelData.channel?.is_private,
                memberCount: channelData.channel?.num_members
              }
            };
            console.log(`✅ Channel accessible: #${channelData.channel?.name}, Bot is member: ${channelData.channel?.is_member}`);
            
            if (!channelData.channel?.is_member) {
              console.warn(`⚠️ Bot is NOT a member of channel ${channelId}`);
            }
          } else {
            diagnosticResults.tests.channelAccess = {
              success: false,
              message: `Cannot access channel: ${channelData.error}`,
              details: {
                channelId: channelId,
                error: channelData.error,
                needsInvite: channelData.error === 'channel_not_found' || channelData.error === 'not_in_channel'
              }
            };
            console.error(`❌ Channel access failed: ${channelData.error}`);
          }
        } catch (error) {
          console.error("Channel test error:", error);
          diagnosticResults.tests.channelAccess = {
            success: false,
            message: "Failed to test channel access",
            details: { error: error.message }
          };
        }
      } else {
        diagnosticResults.tests.channelAccess = {
          success: false,
          message: "No channel ID configured",
          details: {}
        };
      }
      
      // Test 3: Check bot permissions/scopes
      console.log(`🔐 Testing bot permissions...`);
      const scopesResponse = await fetch("https://slack.com/api/auth.test", {
        method: "POST", 
        headers: {
          "Authorization": `Bearer ${botToken}`,
          "Content-Type": "application/json",
        },
      });
      
      const scopesData = await scopesResponse.json();
      const requiredScopes = ["channels:read", "groups:read", "users:read", "users:read.email"];
      
      // Note: auth.test doesn't return scopes directly, we'd need to try operations to check
      diagnosticResults.tests.permissions = {
        success: true,
        message: "Permissions check requires testing operations",
        details: {
          requiredScopes: requiredScopes,
          note: "Will be tested when accessing members"
        }
      };
      
      // Test 4: Try to list channel members (ultimate test)
      if (channelId && diagnosticResults.tests.channelAccess.success) {
        console.log(`👥 Testing member list access...`);
        try {
          const membersResponse = await fetch(`https://slack.com/api/conversations.members?channel=${channelId}`, {
            headers: {
              "Authorization": `Bearer ${botToken}`,
              "Content-Type": "application/json",
            },
          });
          
          const membersData = await membersResponse.json();
          if (membersData.ok) {
            diagnosticResults.tests.membersList = {
              success: true,
              message: "Can list channel members",
              details: {
                memberCount: membersData.members?.length || 0,
                sampleMembers: membersData.members?.slice(0, 3) || []
              }
            };
            console.log(`✅ Can list members: ${membersData.members?.length || 0} members found`);
            
            // Update permissions test based on success
            diagnosticResults.tests.permissions = {
              success: true,
              message: "All required permissions present",
              details: {
                requiredScopes: requiredScopes,
                verified: true
              }
            };
          } else {
            diagnosticResults.tests.membersList = {
              success: false,
              message: `Cannot list members: ${membersData.error}`,
              details: {
                error: membersData.error,
                needed: membersData.needed,
                provided: membersData.provided
              }
            };
            console.error(`❌ Cannot list members: ${membersData.error}`);
            
            // Update permissions test if it's a scope issue
            if (membersData.error === 'missing_scope') {
              diagnosticResults.tests.permissions = {
                success: false,
                message: "Missing required permissions",
                details: {
                  needed: membersData.needed,
                  provided: membersData.provided
                }
              };
            }
          }
        } catch (error) {
          console.error("Members list error:", error);
          diagnosticResults.tests.membersList = {
            success: false,
            message: "Failed to test member list",
            details: { error: error.message }
          };
        }
      }
      
      // Summary and recommendations
      const allTestsPassed = Object.values(diagnosticResults.tests).every(test => test.success);
      const recommendations = [];
      
      if (!diagnosticResults.tests.tokenValidation.success) {
        recommendations.push("Reconnect Slack integration with a valid bot token");
      }
      if (!diagnosticResults.tests.channelAccess.success) {
        if (diagnosticResults.tests.channelAccess.details?.needsInvite) {
          recommendations.push(`Invite the bot to channel ${channelId} using: /invite @YourBotName`);
        } else {
          recommendations.push("Verify the channel ID is correct or reconfigure the channel");
        }
      }
      if (!diagnosticResults.tests.permissions.success) {
        recommendations.push("Update Slack app permissions to include: channels:read, groups:read, users:read, users:read.email");
      }
      
      console.log(`📊 Diagnostic complete. All tests passed: ${allTestsPassed}`);
      
      res.json({
        ...diagnosticResults,
        summary: {
          allTestsPassed,
          canSync: allTestsPassed,
          recommendations
        }
      });
      
    } catch (error) {
      console.error("Slack diagnostic error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Diagnostic failed",
        error: error.message 
      });
    }
  });

  // Test Microsoft connection
  app.post("/api/integrations/microsoft/test", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const { tenantId, clientId, clientSecret } = req.body;
      
      if (!tenantId || !clientId || !clientSecret) {
        return res.status(400).json({ 
          success: false, 
          message: "Tenant ID, Client ID, and Client Secret are required" 
        });
      }
      
      // Test the Microsoft Graph API connection by getting a token
      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      const tokenData = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
      });
      
      const tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenData,
      });
      
      const tokenResult = await tokenResponse.json();
      
      if (tokenResult.access_token) {
        // Test the token by getting organization info
        const orgResponse = await fetch("https://graph.microsoft.com/v1.0/organization", {
          headers: {
            "Authorization": `Bearer ${tokenResult.access_token}`,
          },
        });
        
        const orgData = await orgResponse.json();
        
        if (orgData.value && orgData.value.length > 0) {
          const org = orgData.value[0];
          res.json({
            success: true,
            message: "Microsoft connection successful",
            tenantName: org.displayName,
            domain: org.verifiedDomains?.find((d: any) => d.isDefault)?.name,
          });
        } else {
          res.json({
            success: false,
            message: "Unable to fetch organization details",
          });
        }
      } else {
        res.json({
          success: false,
          message: tokenResult.error_description || "Failed to authenticate with Microsoft",
        });
      }
    } catch (error) {
      console.error("POST /api/integrations/microsoft/test - Error:", error);
      res.json({
        success: false,
        message: "Network error testing Microsoft connection",
      });
    }
  });

  // Slack OAuth Installation Flow
  
  // Generate Slack OAuth install URL for organization
  app.get("/api/organizations/:id/integrations/slack/install", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      console.log('🚀 SLACK OAUTH INSTALL INITIATED');
      console.log(`   Request Param ID: ${req.params.id}`);
      console.log(`   Request orgId (from middleware): ${req.orgId}`);
      console.log(`   Session ID: ${req.sessionID}`);
      
      // Verify the organization ID matches the authenticated user's organization
      if (req.params.id !== req.orgId) {
        console.error(`❌ Organization mismatch: param=${req.params.id}, orgId=${req.orgId}`);
        return res.status(403).json({ message: "You can only install integrations for your own organization" });
      }
      
      if (!process.env.SLACK_CLIENT_ID) {
        console.error('❌ SLACK_CLIENT_ID not configured');
        return res.status(500).json({ message: "Slack integration is not configured on this server" });
      }
      
      // Fetch organization to verify it exists
      const organization = await storage.getOrganization(req.params.id);
      if (!organization) {
        console.error(`❌ Organization not found: ${req.params.id}`);
        return res.status(404).json({ message: "Organization not found" });
      }
      
      console.log(`✅ Verified organization: ${organization.name} (ID: ${organization.id}, Slug: ${organization.slug})`);
      
      // Generate secure state parameter to prevent CSRF
      const state = randomBytes(32).toString('hex');
      
      // Store state and organization ID in session for verification in callback
      req.session.slackOAuthState = state;
      (req.session as any).slackOrgId = req.params.id;
      
      console.log(`📝 Stored in session:`);
      console.log(`   OAuth State: ${state.substring(0, 8)}...`);
      console.log(`   Organization ID: ${req.params.id}`);
      console.log(`   Organization Name: ${organization.name}`);
      
      // Use centralized redirect URI resolver for consistent URL handling
      const redirectUri = resolveRedirectUri(req, '/api/auth/slack/callback');
      
      // Slack OAuth v2 scopes for bot functionality including DM capabilities
      const scopes = [
        'channels:read',         // Read public channels
        'groups:read',           // Read private channels (REQUIRED for private channels!)
        'chat:write',
        'im:write',              // Send direct messages to users
        'im:read',               // Read direct message conversations
        'users:read',
        'users:read.email',
        'team:read',
        'app_mentions:read',
        'commands'
      ].join(',');
      
      const oauthUrl = `https://slack.com/oauth/v2/authorize?` +
        `client_id=${process.env.SLACK_CLIENT_ID}&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `state=${state}&` +
        `user_scope=`;
      
      res.json({
        installUrl: oauthUrl,
        scopes: scopes.split(','),
        redirectUri: redirectUri,
        state: state
      });
    } catch (error) {
      console.error("GET /api/organizations/:id/integrations/slack/install - Error:", error);
      res.status(500).json({ message: "Failed to generate Slack install URL" });
    }
  });

  // Microsoft OAuth Installation Flow
  
  // Generate Microsoft OAuth install URL for organization
  app.get("/api/organizations/:id/integrations/microsoft/install", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Verify the organization ID matches the authenticated user's organization
      if (req.params.id !== req.orgId) {
        return res.status(403).json({ message: "You can only install integrations for your own organization" });
      }
      
      if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
        return res.status(500).json({ message: "Microsoft integration is not configured on this server" });
      }
      
      // Generate secure state parameter to prevent CSRF
      const state = randomBytes(32).toString('hex');
      
      // Store state in session for verification in callback
      req.session.microsoftAuthState = state;
      req.session.authOrgId = req.params.id;
      
      // Use centralized redirect URI resolver for consistent URL handling
      const redirectUri = resolveRedirectUri(req, '/api/auth/microsoft/tenant/callback');
      
      // Microsoft Graph scopes for tenant/app management
      const scopes = [
        'openid',
        'profile', 
        'email',
        'User.Read',
        'Directory.Read.All',    // To read organization info
        'Application.ReadWrite.All' // To manage app registrations if needed
      ].join(' ');
      
      // Use common tenant for multi-tenant app installation
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const tenantId = 'common'; // Allow sign-in from any Azure AD tenant
      
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        response_mode: 'query',
        scope: scopes,
        state: state,
        prompt: 'consent' // Force consent screen for proper permissions
      });
      
      const oauthUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
      
      console.log(`Generated Microsoft OAuth install URL for org ${req.params.id}`);
      
      res.json({
        installUrl: oauthUrl,
        scopes: scopes.split(' '),
        redirectUri: redirectUri,
        state: state
      });
    } catch (error) {
      console.error("GET /api/organizations/:id/integrations/microsoft/install - Error:", error);
      res.status(500).json({ message: "Failed to generate Microsoft install URL" });
    }
  });

  // Microsoft OAuth tenant callback handler
  app.get("/api/auth/microsoft/tenant/callback", async (req, res) => {
    try {
      // Get base URL using the centralized resolver for consistent URLs
      const baseRedirectUri = resolveRedirectUri(req, '/');
      const appBaseUrl = baseRedirectUri.endsWith('/') ? baseRedirectUri.slice(0, -1) : baseRedirectUri;
      
      const { code, state, error } = req.query;
      
      if (error) {
        console.error("Microsoft OAuth error:", error);
        
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Microsoft Integration Failed</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #ef4444; }
                .loading { margin-top: 20px; }
              </style>
            </head>
            <body>
              <h2 class="error">❌ Microsoft Integration Failed</h2>
              <p>There was an error connecting your Microsoft 365 tenant.</p>
              <p>Error: ${error}</p>
              <p class="loading">Closing window...</p>
              <script>
                // Notify parent window of error
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'MICROSOFT_OAUTH_ERROR',
                    message: 'Failed to complete Microsoft integration'
                  }, '${appBaseUrl}');
                }
                // Close popup after a short delay
                setTimeout(() => window.close(), 3000);
              </script>
            </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        return res.send(errorHtml);
      }
      
      if (!code || !state) {
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Microsoft Integration Failed</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #ef4444; }
                .loading { margin-top: 20px; }
              </style>
            </head>
            <body>
              <h2 class="error">❌ Microsoft Integration Failed</h2>
              <p>Missing authorization parameters.</p>
              <p class="loading">Closing window...</p>
              <script>
                // Notify parent window of error
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'MICROSOFT_OAUTH_ERROR',
                    message: 'Missing authorization parameters'
                  }, '${appBaseUrl}');
                }
                // Close popup after a short delay
                setTimeout(() => window.close(), 3000);
              </script>
            </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        return res.send(errorHtml);
      }
      
      // Verify state to prevent CSRF attacks
      if (!req.session.microsoftAuthState || req.session.microsoftAuthState !== state) {
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Microsoft Integration Failed</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #ef4444; }
                .loading { margin-top: 20px; }
              </style>
            </head>
            <body>
              <h2 class="error">❌ Microsoft Integration Failed</h2>
              <p>Invalid security token. Please try again.</p>
              <p class="loading">Closing window...</p>
              <script>
                // Notify parent window of error
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'MICROSOFT_OAUTH_ERROR',
                    message: 'Invalid security token'
                  }, '${appBaseUrl}');
                }
                // Close popup after a short delay
                setTimeout(() => window.close(), 3000);
              </script>
            </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        return res.send(errorHtml);
      }
      
      const orgId = req.session.authOrgId;
      if (!orgId) {
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Microsoft Integration Failed</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #ef4444; }
                .loading { margin-top: 20px; }
              </style>
            </head>
            <body>
              <h2 class="error">❌ Microsoft Integration Failed</h2>
              <p>Organization context lost. Please try again.</p>
              <p class="loading">Closing window...</p>
              <script>
                // Notify parent window of error
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'MICROSOFT_OAUTH_ERROR',
                    message: 'Organization context lost'
                  }, '${appBaseUrl}');
                }
                // Close popup after a short delay
                setTimeout(() => window.close(), 3000);
              </script>
            </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        return res.send(errorHtml);
      }
      
      // Use centralized redirect URI resolver for consistent URL handling
      const redirectUri = resolveRedirectUri(req, '/api/auth/microsoft/tenant/callback');
      
      const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID!,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
          code: code as string,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      
      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
        console.error("Microsoft token exchange error:", tokenData.error);
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Microsoft Integration Failed</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #ef4444; }
                .loading { margin-top: 20px; }
              </style>
            </head>
            <body>
              <h2 class="error">❌ Microsoft Integration Failed</h2>
              <p>Failed to exchange authorization code.</p>
              <p class="loading">Closing window...</p>
              <script>
                // Notify parent window of error
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'MICROSOFT_OAUTH_ERROR',
                    message: 'Failed to exchange authorization code'
                  }, '${appBaseUrl}');
                }
                // Close popup after a short delay
                setTimeout(() => window.close(), 3000);
              </script>
            </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        return res.send(errorHtml);
      }
      
      // Get user/tenant info from Microsoft Graph
      const graphResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
      });
      
      const userInfo = await graphResponse.json();
      
      if (graphResponse.status !== 200) {
        console.error("Microsoft Graph API error:", userInfo);
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Microsoft Integration Failed</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #ef4444; }
                .loading { margin-top: 20px; }
              </style>
            </head>
            <body>
              <h2 class="error">❌ Microsoft Integration Failed</h2>
              <p>Failed to retrieve user information.</p>
              <p class="loading">Closing window...</p>
              <script>
                // Notify parent window of error
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'MICROSOFT_OAUTH_ERROR',
                    message: 'Failed to retrieve user information'
                  }, '${appBaseUrl}');
                }
                // Close popup after a short delay
                setTimeout(() => window.close(), 3000);
              </script>
            </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        return res.send(errorHtml);
      }
      
      // Extract tenant information
      const tenantId = userInfo.businessPhones && userInfo.businessPhones.length > 0 
        ? 'unknown' // We'll need to get this differently
        : 'personal'; // Personal Microsoft account
      
      // For now, let's use a different approach to get tenant ID
      const tenantInfo = tokenData.access_token ? JSON.parse(atob(tokenData.access_token.split('.')[1])) : null;
      const actualTenantId = tenantInfo?.tid || tenantId;
      
      // Update organization with Microsoft integration data
      const updateData = {
        microsoftClientId: process.env.MICROSOFT_CLIENT_ID,
        microsoftTenantId: actualTenantId,
        microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET, // Store centrally for now
        enableMicrosoftAuth: true,
        microsoftConnectionStatus: "connected",
        microsoftLastConnected: new Date(),
      };
      
      const updatedOrg = await storage.updateOrganization(orgId, updateData);
      if (!updatedOrg) {
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Microsoft Integration Failed</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
                .error { color: #ef4444; }
                .loading { margin-top: 20px; }
              </style>
            </head>
            <body>
              <h2 class="error">❌ Microsoft Integration Failed</h2>
              <p>Failed to update organization settings.</p>
              <p class="loading">Closing window...</p>
              <script>
                // Notify parent window of error
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'MICROSOFT_OAUTH_ERROR',
                    message: 'Failed to update organization settings'
                  }, '${appBaseUrl}');
                }
                // Close popup after a short delay
                setTimeout(() => window.close(), 3000);
              </script>
            </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        return res.send(errorHtml);
      }
      
      // Clear OAuth state
      req.session.microsoftAuthState = undefined;
      req.session.authOrgId = undefined;
      
      console.log(`Microsoft integration installed for organization ${updatedOrg.name} (Tenant: ${actualTenantId})`);
      
      // Return HTML page that notifies parent window and closes popup
      const successHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Microsoft Integration Complete</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
              .success { color: #22c55e; }
              .loading { margin-top: 20px; }
            </style>
          </head>
          <body>
            <h2 class="success">✅ Microsoft Integration Complete!</h2>
            <p>Successfully connected Microsoft 365 tenant.</p>
            <p><strong>Organization:</strong> ${updatedOrg.name}</p>
            <p><strong>Tenant:</strong> ${actualTenantId}</p>
            <p class="loading">Closing window...</p>
            <script>
              // Notify parent window of success
              if (window.opener) {
                window.opener.postMessage({
                  type: 'MICROSOFT_OAUTH_SUCCESS',
                  tenantId: '${actualTenantId}',
                  organization: '${updatedOrg.name}'
                }, '${appBaseUrl}');
              }
              // Close popup after a short delay
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      res.send(successHtml);
    } catch (error) {
      console.error("Microsoft OAuth tenant callback error:", error);
      
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Microsoft Integration Failed</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
              .error { color: #ef4444; }
              .loading { margin-top: 20px; }
            </style>
          </head>
          <body>
            <h2 class="error">❌ Microsoft Integration Failed</h2>
            <p>An unexpected error occurred during integration.</p>
            <p class="loading">Closing window...</p>
            <script>
              // Notify parent window of error
              if (window.opener) {
                window.opener.postMessage({
                  type: 'MICROSOFT_OAUTH_ERROR',
                  message: 'Unexpected error during integration'
                }, '${appBaseUrl}');
              }
              // Close popup after a short delay
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      res.send(errorHtml);
    }
  });

  // Slack OAuth callback handler
  app.get("/api/auth/slack/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query;
      
      console.log('🔌 SLACK OAUTH CALLBACK INITIATED');
      console.log(`   Session ID: ${req.sessionID}`);
      console.log(`   Has Code: ${!!code}`);
      console.log(`   Has State: ${!!state}`);
      console.log(`   Has Error: ${!!error}`);
      
      // Get base URL using the centralized resolver
      const baseRedirectUri = resolveRedirectUri(req, '/');
      const appBaseUrl = baseRedirectUri.endsWith('/') ? baseRedirectUri.slice(0, -1) : baseRedirectUri;
      
      if (error) {
        console.error("❌ Slack OAuth error from provider:", error);
        return res.redirect(`${appBaseUrl}/#/settings?error=slack_auth_denied`);
      }
      
      if (!code || !state) {
        console.error("❌ Missing required OAuth parameters");
        return res.redirect(`${appBaseUrl}/#/settings?error=slack_auth_missing_params`);
      }
      
      // Verify state to prevent CSRF attacks
      const sessionState = req.session.slackOAuthState;
      console.log(`🔑 State validation:`);
      console.log(`   Session state: ${sessionState?.substring(0, 8)}...`);
      console.log(`   Received state: ${(state as string).substring(0, 8)}...`);
      
      if (!sessionState || sessionState !== state) {
        console.error("❌ OAuth state mismatch - possible CSRF attack");
        return res.redirect(`${appBaseUrl}/#/settings?error=slack_auth_invalid_state`);
      }
      
      // Get the organization ID that was stored when initiating the OAuth flow
      const orgId = (req.session as any).slackOrgId;
      console.log(`🏢 Organization ID from session (slackOrgId): ${orgId}`);
      
      if (!orgId) {
        console.error("❌ No organization ID in session - OAuth flow was not properly initiated");
        return res.redirect(`${appBaseUrl}/#/settings?error=slack_auth_missing_org`);
      }
      
      // Fetch the organization to verify it exists and get its details
      const organization = await storage.getOrganization(orgId);
      if (!organization) {
        console.error(`❌ Organization not found: ${orgId}`);
        return res.redirect(`${appBaseUrl}/#/settings?error=slack_auth_org_not_found`);
      }
      
      console.log(`✅ Found organization: ${organization.name} (ID: ${organization.id}, Slug: ${organization.slug})`);
      
      if (!process.env.SLACK_CLIENT_ID || !process.env.SLACK_CLIENT_SECRET) {
        console.error("❌ Slack OAuth credentials not configured");
        return res.redirect(`${appBaseUrl}/#/settings?error=slack_auth_not_configured`);
      }
      
      // Use centralized redirect URI resolver for consistent URL handling
      const redirectUri = resolveRedirectUri(req, '/api/auth/slack/callback');
      
      console.log(`🔄 Exchanging OAuth code for access token...`);
      console.log(`   Redirect URI: ${redirectUri}`);
      
      const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.SLACK_CLIENT_ID,
          client_secret: process.env.SLACK_CLIENT_SECRET,
          code: code as string,
          redirect_uri: redirectUri,
        }),
      });
      
      const tokenData = await tokenResponse.json();
      
      if (!tokenData.ok) {
        console.error("❌ Slack token exchange failed:", tokenData.error);
        console.error(`   Error description: ${tokenData.error_description || 'None provided'}`);
        return res.redirect(`${appBaseUrl}/#/settings?error=slack_auth_token_failed`);
      }
      
      console.log(`✅ Token exchange successful`);
      console.log(`   Team ID: ${tokenData.team?.id}`);
      console.log(`   Team Name: ${tokenData.team?.name}`);
      console.log(`   Access Token: ${tokenData.access_token?.substring(0, 10)}...`);
      console.log(`   Bot User ID: ${tokenData.bot_user_id}`);
      console.log(`   Scopes: ${tokenData.scope}`);
      
      // Update organization with Slack integration data
      const updateData = {
        slackBotToken: tokenData.access_token,
        slackWorkspaceId: tokenData.team?.id || tokenData.team_id,
        slackChannelId: null, // Will be set separately by admin
        enableSlackIntegration: true,
        slackConnectionStatus: "connected" as const,
        slackLastConnected: new Date(),
      };
      
      console.log(`📝 Updating organization ${orgId} with Slack data...`);
      console.log(`   Bot Token: ${updateData.slackBotToken?.substring(0, 10)}...`);
      console.log(`   Workspace ID: ${updateData.slackWorkspaceId}`);
      console.log(`   Connection Status: ${updateData.slackConnectionStatus}`);
      console.log(`   Last Connected: ${updateData.slackLastConnected.toISOString()}`);
      
      const updatedOrg = await storage.updateOrganization(orgId, updateData);
      
      if (!updatedOrg) {
        console.error(`❌ CRITICAL: Failed to update organization - updateOrganization returned null/undefined`);
        console.error(`   Organization ID: ${orgId}`);
        console.error(`   Organization Name: ${organization.name}`);
        return res.redirect(`${appBaseUrl}/#/settings?error=slack_auth_org_update_failed`);
      }
      
      console.log(`✅ Organization update returned successfully`);
      console.log(`   Updated Org ID: ${updatedOrg.id}`);
      console.log(`   Updated Org Name: ${updatedOrg.name}`);
      console.log(`   Slack Workspace ID in result: ${updatedOrg.slackWorkspaceId}`);
      console.log(`   Slack Connection Status in result: ${updatedOrg.slackConnectionStatus}`);
      
      // Verify the update actually persisted by re-fetching
      console.log(`🔍 Verifying update persisted to database...`);
      const verificationOrg = await storage.getOrganization(orgId);
      
      if (!verificationOrg) {
        console.error(`❌ CRITICAL: Organization disappeared after update!`);
        return res.redirect(`${appBaseUrl}/#/settings?error=slack_auth_verification_failed`);
      }
      
      if (verificationOrg.slackWorkspaceId !== updateData.slackWorkspaceId) {
        console.error(`❌ CRITICAL: Slack workspace ID not persisted!`);
        console.error(`   Expected: ${updateData.slackWorkspaceId}`);
        console.error(`   Got: ${verificationOrg.slackWorkspaceId}`);
        console.error(`   Organization: ${verificationOrg.name} (${verificationOrg.id})`);
        // Don't fail the user experience, but log this critical error
      } else {
        console.log(`✅ VERIFIED: Slack workspace ID ${verificationOrg.slackWorkspaceId} successfully persisted`);
      }
      
      if (verificationOrg.slackBotToken !== updateData.slackBotToken) {
        console.error(`❌ CRITICAL: Slack bot token not persisted!`);
        console.error(`   Organization: ${verificationOrg.name} (${verificationOrg.id})`);
        // Don't fail the user experience, but log this critical error
      } else {
        console.log(`✅ VERIFIED: Slack bot token successfully persisted`);
      }
      
      if (verificationOrg.slackConnectionStatus !== 'connected') {
        console.error(`❌ WARNING: Slack connection status is ${verificationOrg.slackConnectionStatus} instead of 'connected'`);
      } else {
        console.log(`✅ VERIFIED: Slack connection status is 'connected'`);
      }
      
      // Clear OAuth state
      req.session.slackOAuthState = undefined;
      (req.session as any).slackOrgId = undefined;
      
      console.log(`✅ SLACK OAUTH COMPLETE: Organization ${updatedOrg.name} connected to Slack workspace ${tokenData.team?.name} (${tokenData.team?.id})`);
      
      // Return HTML page that notifies parent window and closes popup
      const successHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Slack Integration Complete</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
              .success { color: #22c55e; }
              .loading { margin-top: 20px; }
            </style>
          </head>
          <body>
            <h2 class="success">✅ Slack Integration Complete!</h2>
            <p>Successfully connected workspace: <strong>${tokenData.team.name}</strong></p>
            <p class="loading">Closing window...</p>
            <script>
              // Notify parent window of success
              if (window.opener) {
                window.opener.postMessage({
                  type: 'SLACK_OAUTH_SUCCESS',
                  workspaceName: '${tokenData.team.name}'
                }, '${appBaseUrl}');
              }
              // Close popup after a short delay
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      res.send(successHtml);
    } catch (error) {
      console.error("Slack OAuth callback error:", error);
      
      // Return HTML page that notifies parent window of error and closes popup
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Slack Integration Failed</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; text-align: center; }
              .error { color: #ef4444; }
              .loading { margin-top: 20px; }
            </style>
          </head>
          <body>
            <h2 class="error">❌ Slack Integration Failed</h2>
            <p>There was an error connecting your Slack workspace.</p>
            <p class="loading">Closing window...</p>
            <script>
              // Notify parent window of error
              if (window.opener) {
                window.opener.postMessage({
                  type: 'SLACK_OAUTH_ERROR',
                  message: 'Failed to complete Slack integration'
                }, '${appBaseUrl}');
              }
              // Close popup after a short delay
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      res.send(errorHtml);
    }
  });

  // Theme Configuration Endpoints
  
  // Get organization theme configuration
  app.get("/api/organizations/:id/theme", requireAuth(), async (req, res) => {
    try {
      // Verify the organization ID matches the authenticated user's organization
      if (req.params.id !== req.orgId) {
        return res.status(403).json({ message: "You can only access your own organization's theme" });
      }
      
      const organization = await storage.getOrganization(req.params.id);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json({
        themeConfig: organization.themeConfig || null,
        enableCustomTheme: organization.enableCustomTheme || false
      });
    } catch (error) {
      console.error("GET /api/organizations/:id/theme - Error:", error);
      res.status(500).json({ message: "Failed to fetch theme configuration" });
    }
  });

  // Update organization theme configuration
  app.put("/api/organizations/:id/theme", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Verify the organization ID matches the authenticated user's organization
      if (req.params.id !== req.orgId) {
        return res.status(403).json({ message: "You can only update your own organization's theme" });
      }

      const themeConfigSchema = z.object({
        themeConfig: z.record(z.string()).optional(),
        enableCustomTheme: z.boolean().optional()
      });
      
      const themeData = themeConfigSchema.parse(req.body);
      
      const updateData: any = {};
      if (themeData.themeConfig !== undefined) updateData.themeConfig = themeData.themeConfig;
      if (themeData.enableCustomTheme !== undefined) updateData.enableCustomTheme = themeData.enableCustomTheme;
      
      const updatedOrganization = await storage.updateOrganization(req.params.id, updateData);
      if (!updatedOrganization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json({ 
        message: "Theme configuration updated successfully",
        themeConfig: updatedOrganization.themeConfig,
        enableCustomTheme: updatedOrganization.enableCustomTheme
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid theme configuration", errors: error.errors });
      }
      console.error("PUT /api/organizations/:id/theme - Error:", error);
      res.status(500).json({ message: "Failed to update theme configuration" });
    }
  });

  // Integration Management Endpoints for Multi-Tenant OAuth Configuration
  
  // Get organization integration status
  app.get("/api/organizations/:id/integrations", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Verify the organization ID matches the authenticated user's organization
      if (req.params.id !== req.orgId) {
        return res.status(403).json({ message: "You can only access your own organization" });
      }
      
      const organization = await storage.getOrganization(req.params.id);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Return integration status without sensitive secrets
      const integrationStatus = {
        slack: {
          configured: !!(organization.slackClientId && organization.slackClientSecret),
          connected: organization.slackConnectionStatus === 'connected',
          status: organization.slackConnectionStatus || 'not_configured',
          lastConnected: organization.slackLastConnected,
          workspaceId: organization.slackWorkspaceId,
          channelId: organization.slackChannelId,
          enabled: organization.enableSlackIntegration
        },
        microsoft: {
          configured: !!(organization.microsoftClientId && organization.microsoftClientSecret),
          connected: organization.microsoftConnectionStatus === 'connected',
          status: organization.microsoftConnectionStatus || 'not_configured',
          lastConnected: organization.microsoftLastConnected,
          tenantId: organization.microsoftTenantId,
          enabled: organization.enableMicrosoftAuth
        }
      };
      
      res.json(integrationStatus);
    } catch (error) {
      console.error("GET /api/organizations/:id/integrations - Error:", error);
      res.status(500).json({ message: "Failed to fetch integration status" });
    }
  });

  // Configure Slack with Bot Token (manual setup)
  app.put("/api/organizations/:id/integrations/slack/configure", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Debug logging for organization IDs
      console.log(`🔧 Slack configure endpoint - URL param id: ${req.params.id}`);
      console.log(`🔧 Slack configure endpoint - Session orgId: ${req.orgId}`);
      console.log(`🔧 Slack configure endpoint - CurrentUser orgId: ${req.currentUser?.organizationId}`);
      
      // Use the organization ID from the URL parameter
      const targetOrgId = req.params.id;
      
      // Get the user's actual organization ID (from session or currentUser)
      const userOrgId = req.orgId || req.currentUser?.organizationId;
      
      // For super admins, allow updating any organization
      const canUpdateAnyOrg = req.currentUser?.isSuperAdmin === true;
      
      // Verify the user has permission to update this organization
      if (!canUpdateAnyOrg) {
        // If no user organization ID is available, try to verify through currentUser
        if (!userOrgId) {
          console.log(`⚠️ No session organizationId, checking if user belongs to org ${targetOrgId}`);
          
          // Verify the user belongs to the target organization
          if (req.currentUser?.organizationId !== targetOrgId) {
            console.error(`❌ User does not belong to organization ${targetOrgId}`);
            return res.status(403).json({ 
              message: "You can only update your own organization",
              debug: {
                targetOrgId,
                userOrgId: req.currentUser?.organizationId,
                sessionOrgId: req.orgId
              }
            });
          }
        } else if (targetOrgId !== userOrgId) {
          console.error(`❌ Organization ID mismatch - URL: ${targetOrgId}, User: ${userOrgId}`);
          return res.status(403).json({ 
            message: "You can only update your own organization",
            debug: {
              targetOrgId,
              userOrgId,
              sessionOrgId: req.orgId
            }
          });
        }
      }
      
      const slackBotConfigSchema = z.object({
        botToken: z.string().startsWith("xoxb-", "Bot token must start with xoxb-"),
        channelId: z.string().optional()
      });
      
      const slackBotConfig = slackBotConfigSchema.parse(req.body);
      
      // Update organization with Slack bot token configuration
      const updateData = {
        slackBotToken: slackBotConfig.botToken,
        slackChannelId: slackBotConfig.channelId || null,
        enableSlackIntegration: true,
        slackConnectionStatus: 'connected' // Mark as connected since we have the bot token
      };
      
      console.log(`🔧 Attempting to update organization: ${targetOrgId} with Slack config`);
      const updatedOrganization = await storage.updateOrganization(targetOrgId, updateData);
      if (!updatedOrganization) {
        console.error(`❌ Organization not found with ID: ${targetOrgId}`);
        return res.status(404).json({ 
          message: "Organization not found",
          debug: {
            targetOrgId,
            userOrgId: userOrgId || req.currentUser?.organizationId,
            sessionOrgId: req.orgId
          }
        });
      }
      
      console.log(`✅ Slack configuration updated successfully for organization: ${targetOrgId}`);
      res.json({ 
        message: "Slack bot configured successfully",
        status: "connected"
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid Slack bot configuration", errors: error.errors });
      }
      console.error("PUT /api/organizations/:id/integrations/slack/configure - Error:", error);
      res.status(500).json({ message: "Failed to configure Slack bot token" });
    }
  });

  // Update Slack channel settings only
  app.patch("/api/organizations/:id/integrations/slack/channel", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const targetOrgId = req.params.id;
      const userOrgId = req.orgId || req.currentUser?.organizationId;
      const canUpdateAnyOrg = req.currentUser?.isSuperAdmin === true;
      
      // Verify permissions
      if (!canUpdateAnyOrg && targetOrgId !== userOrgId) {
        return res.status(403).json({ 
          message: "You can only update your own organization"
        });
      }
      
      const channelUpdateSchema = z.object({
        channelId: z.string(),
        winsChannelId: z.string().optional(),
        enable: z.boolean().optional()
      });
      
      const { channelId, winsChannelId, enable } = channelUpdateSchema.parse(req.body);
      
      // Update only the channel-related fields
      const updateData: any = {
        slackChannelId: channelId
      };
      
      // Add wins channel if provided
      if (winsChannelId !== undefined) {
        updateData.slackWinsChannelId = winsChannelId || null; // Store null if empty string
      }
      
      if (enable !== undefined) {
        updateData.enableSlackIntegration = enable;
      }
      
      const updatedOrganization = await storage.updateOrganization(targetOrgId, updateData);
      if (!updatedOrganization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json({ 
        message: "Slack channel settings updated successfully",
        channelId: updatedOrganization.slackChannelId
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid channel settings", errors: error.errors });
      }
      console.error("PATCH /api/organizations/:id/integrations/slack/channel - Error:", error);
      res.status(500).json({ message: "Failed to update Slack channel settings" });
    }
  });

  // Configure Slack OAuth integration (full configuration)
  app.put("/api/organizations/:id/integrations/slack", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Debug logging for organization IDs
      console.log(`🔧 Slack OAuth endpoint - URL param id: ${req.params.id}`);
      console.log(`🔧 Slack OAuth endpoint - Session orgId: ${req.orgId}`);
      console.log(`🔧 Slack OAuth endpoint - CurrentUser orgId: ${req.currentUser?.organizationId}`);
      
      // Use the organization ID from the URL parameter
      const targetOrgId = req.params.id;
      
      // Get the user's actual organization ID (from session or currentUser)
      const userOrgId = req.orgId || req.currentUser?.organizationId;
      
      // For super admins, allow updating any organization
      const canUpdateAnyOrg = req.currentUser?.isSuperAdmin === true;
      
      // Verify the user has permission to update this organization
      if (!canUpdateAnyOrg) {
        // If no user organization ID is available, try to verify through currentUser
        if (!userOrgId) {
          console.log(`⚠️ No session organizationId, checking if user belongs to org ${targetOrgId}`);
          
          // Verify the user belongs to the target organization
          if (req.currentUser?.organizationId !== targetOrgId) {
            console.error(`❌ User does not belong to organization ${targetOrgId}`);
            return res.status(403).json({ 
              message: "You can only update your own organization",
              debug: {
                targetOrgId,
                userOrgId: req.currentUser?.organizationId,
                sessionOrgId: req.orgId
              }
            });
          }
        } else if (targetOrgId !== userOrgId) {
          console.error(`❌ Organization ID mismatch - URL: ${targetOrgId}, User: ${userOrgId}`);
          return res.status(403).json({ 
            message: "You can only update your own organization",
            debug: {
              targetOrgId,
              userOrgId,
              sessionOrgId: req.orgId
            }
          });
        }
      }
      
      const slackConfigSchema = z.object({
        clientId: z.string().min(1, "Slack Client ID is required"),
        clientSecret: z.string().min(1, "Slack Client Secret is required"),
        signingSecret: z.string().optional(),
        channelId: z.string().optional(),
        enabled: z.boolean().default(true)
      });
      
      const slackConfig = slackConfigSchema.parse(req.body);
      
      // Update organization with Slack OAuth configuration
      const updateData = {
        slackClientId: slackConfig.clientId,
        slackClientSecret: slackConfig.clientSecret,
        slackSigningSecret: slackConfig.signingSecret || null,
        slackChannelId: slackConfig.channelId || null,
        enableSlackIntegration: slackConfig.enabled,
        slackConnectionStatus: 'configured' // Will be updated to 'connected' after successful OAuth
      };
      
      console.log(`🔧 Attempting to update organization: ${targetOrgId} with Slack OAuth config`);
      const updatedOrganization = await storage.updateOrganization(targetOrgId, updateData);
      if (!updatedOrganization) {
        console.error(`❌ Organization not found with ID: ${targetOrgId}`);
        return res.status(404).json({ 
          message: "Organization not found",
          debug: {
            targetOrgId,
            userOrgId: userOrgId || req.currentUser?.organizationId,
            sessionOrgId: req.orgId
          }
        });
      }
      
      console.log(`✅ Slack OAuth configuration updated successfully for organization: ${targetOrgId}`);
      res.json({ 
        message: "Slack integration configured successfully",
        status: "configured",
        authUrl: `/auth/slack/login?org=${updatedOrganization.slug}` // Provide OAuth URL for testing
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid Slack configuration", errors: error.errors });
      }
      console.error("PUT /api/organizations/:id/integrations/slack - Error:", error);
      res.status(500).json({ message: "Failed to configure Slack integration" });
    }
  });

  // Configure Microsoft OAuth integration
  app.put("/api/organizations/:id/integrations/microsoft", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // Debug logging for organization IDs
      console.log(`🔧 Microsoft OAuth endpoint - URL param id: ${req.params.id}`);
      console.log(`🔧 Microsoft OAuth endpoint - Session orgId: ${req.orgId}`);
      console.log(`🔧 Microsoft OAuth endpoint - CurrentUser orgId: ${req.currentUser?.organizationId}`);
      
      // Use the organization ID from the URL parameter
      const targetOrgId = req.params.id;
      
      // Get the user's actual organization ID (from session or currentUser)
      const userOrgId = req.orgId || req.currentUser?.organizationId;
      
      // For super admins, allow updating any organization
      const canUpdateAnyOrg = req.currentUser?.isSuperAdmin === true;
      
      // Verify the user has permission to update this organization
      if (!canUpdateAnyOrg) {
        // If no user organization ID is available, try to verify through currentUser
        if (!userOrgId) {
          console.log(`⚠️ No session organizationId, checking if user belongs to org ${targetOrgId}`);
          
          // Verify the user belongs to the target organization
          if (req.currentUser?.organizationId !== targetOrgId) {
            console.error(`❌ User does not belong to organization ${targetOrgId}`);
            return res.status(403).json({ 
              message: "You can only update your own organization",
              debug: {
                targetOrgId,
                userOrgId: req.currentUser?.organizationId,
                sessionOrgId: req.orgId
              }
            });
          }
        } else if (targetOrgId !== userOrgId) {
          console.error(`❌ Organization ID mismatch - URL: ${targetOrgId}, User: ${userOrgId}`);
          return res.status(403).json({ 
            message: "You can only update your own organization",
            debug: {
              targetOrgId,
              userOrgId,
              sessionOrgId: req.orgId
            }
          });
        }
      }
      
      const microsoftConfigSchema = z.object({
        clientId: z.string().min(1, "Microsoft Client ID is required"),
        clientSecret: z.string().min(1, "Microsoft Client Secret is required"),
        tenantId: z.string().min(1, "Microsoft Tenant ID is required"),
        teamsWebhookUrl: z.string().url().optional(),
        enableAuth: z.boolean().default(true),
        enableTeams: z.boolean().default(false)
      });
      
      const microsoftConfig = microsoftConfigSchema.parse(req.body);
      
      // Update organization with Microsoft OAuth configuration
      const updateData = {
        microsoftClientId: microsoftConfig.clientId,
        microsoftClientSecret: microsoftConfig.clientSecret,
        microsoftTenantId: microsoftConfig.tenantId,
        microsoftTeamsWebhookUrl: microsoftConfig.teamsWebhookUrl || null,
        enableMicrosoftAuth: microsoftConfig.enableAuth,
        enableTeamsIntegration: microsoftConfig.enableTeams,
        microsoftConnectionStatus: 'configured' // Will be updated to 'connected' after successful OAuth
      };
      
      console.log(`🔧 Attempting to update organization: ${targetOrgId} with Microsoft OAuth config`);
      const updatedOrganization = await storage.updateOrganization(targetOrgId, updateData);
      if (!updatedOrganization) {
        console.error(`❌ Organization not found with ID: ${targetOrgId}`);
        return res.status(404).json({ 
          message: "Organization not found",
          debug: {
            targetOrgId,
            userOrgId: userOrgId || req.currentUser?.organizationId,
            sessionOrgId: req.orgId
          }
        });
      }
      
      console.log(`✅ Microsoft OAuth configuration updated successfully for organization: ${targetOrgId}`);
      res.json({ 
        message: "Microsoft integration configured successfully",
        status: "configured",
        authUrl: `/auth/microsoft/login?org=${updatedOrganization.slug}` // Provide OAuth URL for testing
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid Microsoft configuration", errors: error.errors });
      }
      console.error("PUT /api/organizations/:id/integrations/microsoft - Error:", error);
      res.status(500).json({ message: "Failed to configure Microsoft integration" });
    }
  });

  // Send one-on-one meeting report to Slack
  app.post("/api/one-on-ones/:id/send-to-slack", requireAuth(), requireFeatureAccess('one_on_ones'), async (req, res) => {
    try {
      const meetingId = req.params.id;
      
      // Get the meeting and check access permissions
      const meeting = await storage.getOneOnOne(req.orgId, meetingId);
      if (!meeting) {
        return res.status(404).json({ message: "Meeting not found" });
      }
      
      // Check if user has access to this meeting
      const hasAccess = await canAccessOneOnOne(
        req.orgId,
        req.currentUser!.id,
        req.currentUser!.role,
        req.currentUser!.teamId,
        meeting
      );
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get user's Slack ID from their profile
      const currentUser = req.currentUser!;
      if (!currentUser.slackUserId) {
        return res.status(400).json({ 
          message: "Slack account not connected. Please connect your Slack account first." 
        });
      }
      
      // Get the other participant's name for the report
      const otherParticipantId = meeting.participantOneId === currentUser.id 
        ? meeting.participantTwoId 
        : meeting.participantOneId;
      const otherParticipant = await storage.getUser(req.orgId, otherParticipantId);
      
      // Import the Slack service function
      const { sendOneOnOneReportToUser } = await import("./services/slack");
      
      // Send the report to Slack
      const result = await sendOneOnOneReportToUser(
        currentUser.slackUserId,
        currentUser.name || currentUser.username,
        {
          id: meeting.id,
          participantName: otherParticipant?.name || 'Unknown',
          scheduledAt: new Date(meeting.scheduledAt),
          agenda: meeting.agenda || undefined,
          notes: meeting.notes || undefined,
          actionItems: Array.isArray(meeting.actionItems) ? meeting.actionItems : [],
          duration: meeting.duration || 30,
          location: meeting.location || undefined,
          status: meeting.status
        }
      );
      
      if (result?.success) {
        res.json({ 
          message: "Meeting report sent to your Slack DMs successfully!",
          success: true 
        });
      } else {
        res.status(500).json({ 
          message: result?.message || "Failed to send report to Slack",
          success: false 
        });
      }
    } catch (error) {
      console.error("Send one-on-one to Slack error:", error);
      res.status(500).json({ message: "Failed to send meeting report to Slack" });
    }
  });

  // PDF Export Endpoints
  
  // Export check-in report as PDF
  app.get("/api/reports/checkins/pdf", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { PDFExportService } = await import("./services/pdf-export");
      
      const { startDate, endDate, teamId } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      
      const pdfBuffer = await PDFExportService.generateCheckinReport(
        req.orgId,
        new Date(startDate as string),
        new Date(endDate as string),
        teamId as string | undefined
      );
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="checkin-report.pdf"');
      res.send(pdfBuffer);
    } catch (error) {
      console.error("PDF check-in report error:", error);
      res.status(500).json({ message: "Failed to generate check-in report PDF" });
    }
  });

  // Export one-on-one meeting as PDF
  app.get("/api/one-on-ones/:id/pdf", requireAuth(), async (req, res) => {
    try {
      const { PDFExportService } = await import("./services/pdf-export");
      
      // Verify user has access to this meeting
      const meeting = await storage.getOneOnOne(req.orgId, req.params.id);
      if (!meeting) {
        return res.status(404).json({ message: "Meeting not found" });
      }
      
      // Check if user is a participant or has admin/manager access
      const isParticipant = meeting.participantOneId === req.currentUser!.id || 
                           meeting.participantTwoId === req.currentUser!.id;
      const hasManagerAccess = req.currentUser!.role === 'admin' || req.currentUser!.role === 'manager';
      
      if (!isParticipant && !hasManagerAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const pdfBuffer = await PDFExportService.generateOneOnOnePDF(req.orgId, req.params.id);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="one-on-one-${req.params.id}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("PDF one-on-one export error:", error);
      res.status(500).json({ message: "Failed to generate one-on-one PDF" });
    }
  });

  // Export analytics report as PDF
  app.get("/api/reports/analytics/pdf", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { PDFExportService } = await import("./services/pdf-export");
      
      const { period = 'month' } = req.query;
      
      if (!['week', 'month', 'quarter'].includes(period as string)) {
        return res.status(400).json({ message: "Invalid period. Use 'week', 'month', or 'quarter'" });
      }
      
      const pdfBuffer = await PDFExportService.generateAnalyticsReport(
        req.orgId,
        period as 'week' | 'month' | 'quarter'
      );
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="analytics-${period}-report.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("PDF analytics report error:", error);
      res.status(500).json({ message: "Failed to generate analytics report PDF" });
    }
  });

  // Create Stripe payment intent for plan upgrades  
  app.post("/api/stripe/create-payment-intent", async (req, res) => {
    if (!stripe) {
      return res.status(503).json({ message: "Payment processing not available" });
    }

    try {
      const paymentSchema = z.object({
        organizationId: z.string(),
        planId: z.string(),
        billingCycle: z.enum(["monthly", "annual"]),
        amount: z.number().min(0),
      });

      const data = planSchema.parse(req.body);

      // Set billing price per user based on selected plan
      let billingPricePerUser = 0; // Standard plan is free
      if (data.planId === "professional") {
        billingPricePerUser = data.billingCycle === "monthly" ? 2000 : 1667; // $20/month or $200/year ($16.67/month)
      } else if (data.planId === "enterprise") {
        billingPricePerUser = data.billingCycle === "monthly" ? 5000 : 4167; // $50/month or $500/year ($41.67/month)
      }
      
      // Update organization with billing price
      await storage.updateOrganization(data.organizationId, {
        billingPricePerUser: billingPricePerUser,
      });
      
      // If not standard plan, handle payment processing
      if (data.planId !== "standard" && stripe) {
        // Create Stripe customer and setup subscription
        const organization = await storage.getOrganization(data.organizationId);
        if (!organization) {
          return res.status(404).json({ message: "Organization not found" });
        }

        // Create or retrieve Stripe customer
        let customer;
        if (organization.stripeCustomerId) {
          customer = await stripe.customers.retrieve(organization.stripeCustomerId);
        } else {
          customer = await stripe.customers.create({
            name: organization.name,
            email: organization.email,
            metadata: {
              organizationId: data.organizationId,
              plan: data.planId,
              billingCycle: data.billingCycle,
            },
          });
          
          // Store the Stripe customer ID
          await storage.updateOrganization(data.organizationId, {
            stripeCustomerId: customer.id,
          });
        }

        // Get price based on plan and billing cycle
        const plans: Record<string, Record<string, number>> = {
          professional: {
            monthly: 1000,  // $10/month
            annual: 9600,   // $96/year ($8/month with 20% off)
          },
          enterprise: {
            monthly: 2500,  // $25/month
            annual: 24000,  // $240/year ($20/month with 20% off)
          }
        };

        let price = plans[data.planId]?.[data.billingCycle];
        if (!price) {
          return res.status(400).json({ message: "Invalid plan or billing cycle" });
        }

        // Validate and apply discount code if provided
        let discountAmount = 0;
        let discountPercentage = 0;
        let validatedDiscountCode = null;
        
        if (data.discountCode) {
          const validation = await storage.validateDiscountCode(
            data.discountCode.toUpperCase(), 
            data.planId, 
            price
          );
          
          if (validation.valid && validation.discountCode) {
            validatedDiscountCode = validation.discountCode;
            
            // Calculate discount amount
            if (validation.discountCode.discountType === 'percentage') {
              discountPercentage = validation.discountCode.discountValue;
              discountAmount = Math.round(price * (validation.discountCode.discountValue / 100));
              
              // Apply maximum discount limit if set
              if (validation.discountCode.maximumDiscount && discountAmount > validation.discountCode.maximumDiscount) {
                discountAmount = validation.discountCode.maximumDiscount;
              }
            } else if (validation.discountCode.discountType === 'fixed_amount') {
              discountAmount = validation.discountCode.discountValue;
            }
            
            // Ensure discount doesn't exceed order amount
            discountAmount = Math.min(discountAmount, price);
          } else {
            console.log('Invalid discount code:', validation.reason);
            // Continue without discount rather than failing
          }
        }

        // Get the base URL for redirects
        const protocol = req.get('x-forwarded-proto') || req.protocol;
        const host = req.get('host');
        const baseUrl = `${protocol}://${host}`;

        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
          customer: customer.id,
          payment_method_types: ['card'],
          mode: data.billingCycle === 'monthly' ? 'subscription' : 'payment',
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: `Whirkplace ${data.planId.charAt(0).toUpperCase() + data.planId.slice(1)} Plan`,
                  description: `${data.billingCycle === 'monthly' ? 'Monthly' : 'Annual'} subscription for ${organization.name}`,
                },
                unit_amount: price - discountAmount, // Apply discount to the price
                ...(data.billingCycle === 'monthly' ? {
                  recurring: {
                    interval: 'month' as const,
                    interval_count: 1,
                  }
                } : {})
              },
              quantity: 1,
            },
          ],
          success_url: `${baseUrl}/api/business/checkout-success?session_id={CHECKOUT_SESSION_ID}&organizationId=${data.organizationId}`,
          cancel_url: `${baseUrl}/business-signup?canceled=true`,
          metadata: {
            organizationId: data.organizationId,
            planId: data.planId,
            billingCycle: data.billingCycle,
            ...(validatedDiscountCode && {
              discountCode: validatedDiscountCode.code,
              discountAmount: discountAmount.toString(),
              discountPercentage: discountPercentage.toString(),
            }),
          },
        });

        // Store the session ID for verification and discount info
        await storage.updateOrganization(data.organizationId, {
          plan: data.planId,
          pendingCheckoutSessionId: session.id,
          ...(validatedDiscountCode && {
            discountCode: validatedDiscountCode.code,
            discountPercentage: discountPercentage,
          }),
        });
        
        // Record discount code usage if applied
        if (validatedDiscountCode) {
          await storage.applyDiscountCode({
            discountCodeId: validatedDiscountCode.id,
            organizationId: data.organizationId,
            orderAmount: price,
            discountAmount: discountAmount,
          });
        }

        res.json({
          success: true,
          requiresPayment: true,
          checkoutUrl: session.url,
          sessionId: session.id,
          message: "Redirecting to Stripe checkout..."
        });
      } else {
        // Standard plan - no payment required
        await storage.updateOrganization(data.organizationId, {
          plan: data.planId,
        });

        res.json({
          success: true,
          requiresPayment: false,
          message: "Plan selected successfully"
        });
      }

    } catch (error: any) {
      console.error("Plan selection error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to select plan" });
    }
  });

  // Handle Stripe checkout success callback
  app.get("/api/business/checkout-success", async (req, res) => {
    try {
      const { session_id, organizationId } = req.query;

      if (!session_id || !organizationId) {
        return res.redirect('/business-signup?error=missing_parameters');
      }

      if (!stripe) {
        return res.redirect('/business-signup?error=stripe_not_configured');
      }

      // Verify the checkout session
      const session = await stripe.checkout.sessions.retrieve(session_id as string);

      if (!session) {
        return res.redirect('/business-signup?error=invalid_session');
      }

      // Verify the session belongs to this organization
      if (session.metadata?.organizationId !== organizationId) {
        return res.redirect('/business-signup?error=organization_mismatch');
      }

      // Verify payment was successful
      if (session.payment_status !== 'paid') {
        return res.redirect('/business-signup?error=payment_not_completed');
      }

      // Update organization with payment confirmation
      await storage.updateOrganization(organizationId as string, {
        stripeCheckoutSessionId: session.id,
        stripeSubscriptionId: session.subscription as string || null,
        paymentStatus: 'completed',
        pendingCheckoutSessionId: null,
      });

      // Redirect to the teams step with success
      res.redirect(`/business-signup?step=teams&organizationId=${organizationId}&payment=success`);
      
    } catch (error) {
      console.error("Checkout success error:", error);
      res.redirect('/business-signup?error=checkout_verification_failed');
    }
  });

  // Complete onboarding - Step 3: Organization setup
  app.post("/api/business/complete-onboarding", async (req, res) => {
    try {
      const onboardingSchema = z.object({
        organizationId: z.string(),
        teams: z.array(z.object({
          name: z.string().min(2),
          description: z.string().optional(),
          type: z.enum(["team", "department", "pod"]),
        })),
        userInvites: z.array(z.object({
          email: z.string().email(),
          name: z.string().min(2),
          role: z.enum(["admin", "manager", "member"]),
          teamName: z.string().optional(),
        })).optional(),
        organizationSettings: z.object({
          companyValues: z.array(z.string()).min(1),
          checkInFrequency: z.enum(["daily", "weekly", "biweekly"]),
          workingHours: z.string(),
          timezone: z.string(),
        }),
      });

      const data = onboardingSchema.parse(req.body);

      // Update organization with custom values
      await storage.updateOrganization(data.organizationId, {
        customValues: data.organizationSettings.companyValues,
      });

      // Create teams
      const createdTeams: any[] = [];
      for (const team of data.teams) {
        const organization = await storage.getOrganization(data.organizationId);
        if (organization) {
          // Get admin user to set as team leader
          const adminUsers = await storage.getAllUsers(data.organizationId);
          const adminUser = adminUsers.find(u => u.role === 'admin');
          
          if (adminUser) {
            const createdTeam = await storage.createTeam(data.organizationId, {
              name: team.name,
              description: team.description || null,
              leaderId: adminUser.id,
              teamType: team.type,
              parentTeamId: null,
              organizationId: data.organizationId,
            });
            createdTeams.push(createdTeam);
          }
        }
      }

      // Send user invitations (placeholder - would implement email service)
      const invitationResults: any[] = [];
      if (data.userInvites) {
        for (const invite of data.userInvites) {
          // Generate invitation token
          const token = randomBytes(32).toString('hex');
          
          // In real implementation, would:
          // 1. Store invitation in database
          // 2. Send invitation email
          // 3. Set expiration date
          
          invitationResults.push({
            email: invite.email,
            name: invite.name,
            role: invite.role,
            status: "sent",
            token: token,
          });
        }
      }

      res.json({
        success: true,
        message: "Onboarding completed successfully",
        teamsCreated: createdTeams.length,
        invitationsSent: invitationResults.length,
        data: {
          teams: createdTeams,
          invitations: invitationResults,
        }
      });

    } catch (error: any) {
      console.error("Onboarding completion error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

  // Create Stripe payment intent for plan upgrades
  app.post("/api/stripe/create-payment-intent", async (req, res) => {
    if (!stripe) {
      return res.status(503).json({ message: "Payment processing not available" });
    }

    try {
      const paymentSchema = z.object({
        organizationId: z.string(),
        planId: z.string(),
        billingCycle: z.enum(["monthly", "annual"]),
        amount: z.number().min(0),
      });

      const data = paymentSchema.parse(req.body);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(data.amount), // Amount should already be in cents
        currency: "usd",
        metadata: {
          organizationId: data.organizationId,
          planId: data.planId,
          billingCycle: data.billingCycle,
        },
      });

      res.json({ 
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });

    } catch (error: any) {
      console.error("Payment intent creation error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to create payment intent" });
    }
  });

  // Stripe Webhook Handler for billing events
  app.post("/api/stripe/webhook", async (req, res) => {
    if (!stripe) {
      return res.status(503).json({ message: "Payment processing not available" });
    }

    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return res.status(500).json({ message: "Webhook not configured" });
    }

    let event: any;

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
      switch (event.type) {
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          const subscription = event.data.object;
          
          // Find organization by Stripe subscription ID
          const orgs = await storage.getAllOrganizations();
          const org = orgs.find(o => o.stripeSubscriptionId === subscription.id);
          
          if (org) {
            // Update subscription status and billing period
            await storage.updateOrganization(org.id, {
              stripeSubscriptionStatus: subscription.status,
              billingPeriodStart: new Date(subscription.current_period_start * 1000),
              billingPeriodEnd: new Date(subscription.current_period_end * 1000),
            });

            // If subscription renewed, apply pending billing changes
            if (event.type === 'customer.subscription.updated' && 
                subscription.status === 'active' && 
                org.pendingBillingChanges) {
              await billingService.processBillingPeriodEnd(org);
            }
            
            console.log(`Updated subscription for org ${org.id}: ${subscription.status}`);
          }
          break;

        case 'invoice.payment_succeeded':
          const invoice = event.data.object;
          
          // Find organization by Stripe customer ID
          const organizations = await storage.getAllOrganizations();
          const organization = organizations.find(o => o.stripeCustomerId === invoice.customer);
          
          if (organization && invoice.subscription) {
            // Sync billing period from subscription
            await billingService.syncBillingPeriod(organization);
            
            // Track billing event
            await billingService.trackBillingChange({
              organizationId: organization.id,
              eventType: 'invoice_payment_succeeded',
              userCount: organization.billingUserCount || 0,
              amount: invoice.amount_paid,
              description: `Invoice ${invoice.number} paid`,
              stripeSubscriptionId: invoice.subscription as string,
              metadata: {
                invoiceId: invoice.id,
                invoiceNumber: invoice.number,
              },
            });
            
            console.log(`Invoice payment succeeded for org ${organization.id}`);
          }
          break;

        case 'checkout.session.completed':
          const session = event.data.object;
          
          if (session.mode === 'subscription' && session.subscription && session.client_reference_id) {
            // Update organization with subscription details
            const orgId = session.client_reference_id;
            const subscriptionId = session.subscription as string;
            
            // Retrieve subscription details
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            
            await storage.updateOrganization(orgId, {
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: subscriptionId,
              stripeSubscriptionStatus: subscription.status,
              billingPeriodStart: new Date(subscription.current_period_start * 1000),
              billingPeriodEnd: new Date(subscription.current_period_end * 1000),
            });
            
            console.log(`Checkout completed for org ${orgId}`);
          }
          break;

        default:
          console.log(`Unhandled webhook event type: ${event.type}`);
      }
      
      res.json({ received: true });
    } catch (error) {
      console.error("Error processing webhook:", error);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  // Initialize billing for existing organizations - Super Admin only
  app.post("/api/billing/initialize", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const organizations = await storage.getAllOrganizations();
      let initialized = 0;
      let skipped = 0;
      
      for (const org of organizations) {
        // Skip if already has billing configured
        if (org.billingPricePerUser !== null && org.billingPricePerUser !== undefined) {
          skipped++;
          continue;
        }
        
        // Set default billing price based on plan
        let billingPricePerUser = 0;
        if (org.plan === 'professional') {
          billingPricePerUser = 2000; // $20/user/month in cents
        } else if (org.plan === 'enterprise') {
          billingPricePerUser = 5000; // $50/user/month in cents
        }
        
        // Count active users in the organization
        const activeUsers = await storage.getAllUsers(org.id);
        const activeUserCount = activeUsers.filter(u => u.isActive).length;
        
        // Update organization with billing defaults
        await storage.updateOrganization(org.id, {
          billingPricePerUser: billingPricePerUser,
          billingUserCount: activeUserCount,
          billingPeriodStart: new Date(),
          billingPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        });
        
        initialized++;
        console.log(`Initialized billing for ${org.name}: ${activeUserCount} users at $${billingPricePerUser / 100}/user/month`);
      }
      
      res.json({
        message: `Billing initialization complete`,
        initialized: initialized,
        skipped: skipped,
        total: organizations.length,
      });
    } catch (error) {
      console.error("Error initializing billing:", error);
      res.status(500).json({ message: "Failed to initialize billing for organizations" });
    }
  });

  // Billing Management Endpoints
  app.get("/api/billing/usage", requireAuth(), async (req, res) => {
    try {
      const usage = await billingService.getCurrentBillingUsage(req.orgId);
      
      res.json({
        currentUserCount: usage.currentUserCount,
        billedUserCount: usage.billedUserCount,
        pendingChanges: usage.pendingChanges,
        currentPeriodStart: usage.currentPeriodStart,
        currentPeriodEnd: usage.currentPeriodEnd,
        pricePerUser: usage.pricePerUser,
        estimatedMonthlyCharge: usage.billedUserCount * usage.pricePerUser,
      });
    } catch (error) {
      console.error("Error fetching billing usage:", error);
      res.status(500).json({ message: "Failed to fetch billing usage" });
    }
  });

  app.post("/api/billing/preview-changes", requireAuth(), async (req, res) => {
    try {
      const previewSchema = z.object({
        addUsers: z.number().int().min(0).default(0),
        removeUsers: z.number().int().min(0).default(0),
      });

      const { addUsers, removeUsers } = previewSchema.parse(req.body);
      
      const organization = await storage.getOrganization(req.orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const usage = await billingService.getCurrentBillingUsage(req.orgId);
      const newUserCount = Math.max(0, usage.currentUserCount + addUsers - removeUsers);
      
      // Calculate pro-rata charge for adding users
      let proRataCharge = 0;
      if (addUsers > 0) {
        proRataCharge = await billingService.calculateProRataCharge(organization, usage.currentUserCount + addUsers);
      }

      res.json({
        currentUserCount: usage.currentUserCount,
        newUserCount: newUserCount,
        usersAdded: addUsers,
        usersRemoved: removeUsers,
        proRataCharge: proRataCharge,
        pricePerUser: usage.pricePerUser,
        currentMonthlyCharge: usage.currentUserCount * usage.pricePerUser,
        newMonthlyCharge: newUserCount * usage.pricePerUser,
        chargeToday: proRataCharge,
        nextBillingPeriodChange: removeUsers > 0 ? `Seats will be reduced by ${removeUsers} on next billing cycle` : null,
      });
    } catch (error: any) {
      console.error("Error previewing billing changes:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to preview billing changes" });
    }
  });

  app.get("/api/billing/history", requireAuth(), requireRole(["admin"]), async (req, res) => {
    try {
      // Get billing events for the organization
      const events = await db
        .select()
        .from(billingEvents)
        .where(eq(billingEvents.organizationId, req.orgId))
        .orderBy(desc(billingEvents.createdAt))
        .limit(100);
      
      // Transform snake_case column names to camelCase for frontend
      const transformedEvents = events.map(event => ({
        ...event,
        previousUserCount: event.previous_user_count,
        stripeInvoiceItemId: event.stripe_invoice_item_id,
        stripeSubscriptionId: event.stripe_subscription_id,
        createdAt: event.created_at,
        eventType: event.event_type,
        userCount: event.user_count,
        organizationId: event.organization_id,
        userId: event.user_id
      }));
      
      res.json(transformedEvents);
    } catch (error) {
      console.error("Error fetching billing history:", error);
      res.status(500).json({ message: "Failed to fetch billing history" });
    }
  });

  // Support & Bug Reporting System
  app.post("/api/support/reports", requireAuth(), async (req, res) => {
    try {
      // Validate request body using Zod schema
      const validationSchema = insertBugReportSchema.omit({ 
        organizationId: true, 
        userId: true,
        createdAt: true,
        resolvedAt: true 
      }).extend({
        title: z.string().min(1).max(200),
        description: z.string().min(10).max(2000),
        category: z.enum(["bug", "question", "feature_request"]).default("bug"),
        severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
        pagePath: z.string().optional(),
        metadata: z.object({}).optional()
      });
      
      const validatedData = validationSchema.parse(req.body);
      
      // Create bug report
      const bugReport = await storage.createBugReport(req.orgId, {
        ...validatedData,
        organizationId: req.orgId,
        userId: req.currentUser!.id
      });
      
      // Send Slack notification to admins
      try {
        const { sendSlackMessage } = await import("./services/slack");
        const organization = await storage.getOrganization(req.orgId);
        const user = req.currentUser!;
        
        const message = `🆘 **New Support Request**\n\n` +
          `**From:** ${user.name} (${user.email})\n` +
          `**Type:** ${bugReport.category} | **Severity:** ${bugReport.severity}\n` +
          `**Page:** ${bugReport.pagePath || 'Not specified'}\n\n` +
          `**Title:** ${bugReport.title}\n` +
          `**Description:** ${bugReport.description.slice(0, 300)}${bugReport.description.length > 300 ? '...' : ''}\n\n` +
          `**Report ID:** ${bugReport.id}`;
          
        await sendSlackMessage(message);
      } catch (slackError) {
        console.error("Failed to send Slack notification for bug report:", slackError);
        // Don't fail the request if Slack notification fails
      }
      
      res.status(201).json(bugReport);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("POST /api/support/reports - Error:", error);
      res.status(500).json({ message: "Failed to create bug report" });
    }
  });

  app.get("/api/support/reports", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const statusFilter = req.query.status as string | undefined;
      const userId = req.query.userId as string | undefined;
      
      const bugReports = await storage.getBugReports(req.orgId, statusFilter, userId);
      res.json(bugReports);
    } catch (error) {
      console.error("GET /api/support/reports - Error:", error);
      res.status(500).json({ message: "Failed to fetch bug reports" });
    }
  });

  app.patch("/api/support/reports/:id", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const updateSchema = insertBugReportSchema.pick({
        status: true,
        resolutionNote: true,
        assignedTo: true
      }).partial().extend({
        status: z.enum(["open", "triaged", "in_progress", "resolved", "closed"]).optional(),
        resolutionNote: z.string().max(1000).optional()
      });
      
      const validatedData = updateSchema.parse(req.body);
      
      // Add resolved timestamp if status is being set to resolved
      if (validatedData.status === "resolved" || validatedData.status === "closed") {
        (validatedData as any).resolvedAt = new Date();
      }
      
      const updatedReport = await storage.updateBugReport(req.orgId, req.params.id, validatedData);
      if (!updatedReport) {
        return res.status(404).json({ message: "Bug report not found" });
      }
      
      res.json(updatedReport);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("PATCH /api/support/reports/:id - Error:", error);
      res.status(500).json({ message: "Failed to update bug report" });
    }
  });

  // AI KRA Generation endpoint
  app.post("/api/ai/generate-kras", requireAuth(), requireFeatureAccess('kra_management'), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      const { role, department, company, saveAsTemplate = false, teamIds = [] } = req.body;
      
      // Validate input
      if (!role || !department) {
        return res.status(400).json({ message: "Role and department are required" });
      }

      // Import OpenAI (the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user)
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      // Get organization info for context
      const organization = await storage.getOrganization(req.orgId);
      const organizationContext = organization ? `at ${organization.name}` : "";

      // Enhanced prompt with your organization's KRA format
      const currentQuarter = `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
      const currentYear = new Date().getFullYear();
      
      const prompt = `Generate 3-5 Key Result Areas (KRAs) for a ${role} role in the ${department} department ${organizationContext}.

CRITICAL: Follow Patrick Accounting's EXACT KRA format:

Structure each KRA as:
"Key Result Area #[number] - [Action-Oriented Title]"

Each KRA must:
1. Start with "Key Result Area #" followed by a hyphen and action-oriented title
2. Have a core mission summary statement
3. Include 3-5 specific, measurable bullet points with metrics
4. Use action verbs at the beginning of each bullet (Ensure, Maintain, Complete, Process, etc.)
5. Include quantifiable metrics: percentages (90%, 100%), dollar amounts ($31,250), timeframes (within 24 hours, by the 10th of each month)

Example from Patrick Accounting:
Title: "Key Result Area #1 - Give our clients the opportunity to thrive"
Description: "Maintain, implement, train, and monitor the firm's processes with clients to ensure efficiency and the accuracy of our work."
Success Metrics:
- Communicate timely with insight, empathy, and clarity (100% within 24 hours)
- Maintain a thorough understanding of all products and services offered
- Provide 85% of M2C2 monthly
- Deliver 95% of financials with insight each month no later than the 25th
- Achieve effective rate of $200 per hour

Another Example:
Title: "Key Result Area #2 - Meet Sales Goals"
Description: "Drive revenue and increase profitability by generating new deals and forming new client relationships."
Success Metrics:
- Close $31,250 in annual recurring revenue each month
- Schedule 4-6 discovery meetings each week and hold 4 of them
- Profile 20 new accounts every day
- Maintain a clean organized CRM with 100% accuracy
- Complete all required paperwork within 48 hours

Based on role:
- Staff/Specialist: Focus on operational excellence, accuracy, timeliness
- Senior/Lead: Add team development, process improvement, strategic initiatives
- Manager: Emphasize team performance, client relationships, business growth
- Director: Strategic planning, department leadership, cross-functional collaboration

Return as JSON:
{
  "suggestions": [
    {
      "title": "Key Result Area #X - Action-Oriented Title",
      "description": "Core mission statement for this KRA",
      "target": "${currentQuarter} ${currentYear}",
      "metric": "Primary quantifiable metric",
      "metrics": [
        "Specific action with metric (e.g., Process all invoices within 24 hours)",
        "Measurable outcome (e.g., Achieve 95% client satisfaction score)",
        "Quantified target (e.g., Close $31,250 in ARR monthly)",
        "Time-bound deliverable (e.g., Complete reports by 10th of each month)",
        "Percentage-based goal (e.g., Maintain 90% retention rate)"
      ],
      "category": "performance|development|operational|strategic",
      "roleLevel": "junior|mid|senior|lead|manager"
    }
  ]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: `You are an expert in performance management and Key Result Areas (KRAs) following Patrick Accounting's proven KRA framework.

You create KRAs that follow this EXACT structure:
- Title: "Key Result Area #[number] - [Action-Oriented Focus]"
- Description: Core mission statement that defines what success looks like
- Metrics: Specific, measurable actions with clear quantifiable targets

Your KRAs always:
- Start each bullet with action verbs (Ensure, Maintain, Process, Complete, Deliver, Achieve, etc.)
- Include specific metrics: percentages (85%, 95%, 100%), dollar amounts ($31,250), timeframes (within 24 hours, by the 10th of each month)
- Focus on outcomes that directly impact clients, team, or business performance
- Are achievable yet challenging within the specified timeframe
- Align with the role's level of responsibility and department objectives

You understand that KRAs are accountability tools that clearly define what success looks like with no ambiguity.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(response.choices[0].message.content);
      
      // Validate the response structure
      if (!result.suggestions || !Array.isArray(result.suggestions)) {
        throw new Error("Invalid AI response format");
      }

      // If saveAsTemplate is true, save the generated KRAs as templates
      if (saveAsTemplate && result.suggestions.length > 0) {
        try {
          for (const suggestion of result.suggestions) {
            await storage.createKraTemplate(req.orgId, {
              name: suggestion.title,
              description: suggestion.description,
              kraTitle: suggestion.title,
              kraDescription: suggestion.description,
              metrics: suggestion.metrics || [suggestion.metric],
              targetQuarter: suggestion.target?.split(' ')[0] || currentQuarter,
              targetYear: parseInt(suggestion.target?.split(' ')[1]) || currentYear,
              teamIds: teamIds,
              departmentId: department,
              roleLevel: suggestion.roleLevel || 'mid',
              category: suggestion.category || 'performance',
              isActive: true,
              isAIGenerated: true,
              createdBy: req.currentUser!.id
            });
          }
        } catch (error) {
          console.error("Failed to save KRA templates:", error);
          // Don't fail the request, just log the error
        }
      }

      res.json(result);
    } catch (error) {
      console.error("POST /api/ai/generate-kras - Error:", error);
      res.status(500).json({ 
        message: "Failed to generate KRA suggestions",
        error: error.message 
      });
    }
  });

  // Discount Code Validation (publicly accessible for signup)
  app.post("/api/discount-codes/validate", requireOrganization(), async (req, res) => {
    try {
      const { code, planId, orderAmount } = req.body;
      const validation = await storage.validateDiscountCode(code, planId, orderAmount);
      res.json(validation);
    } catch (error) {
      console.error("Failed to validate discount code:", error);
      res.status(500).json({ message: "Failed to validate discount code" });
    }
  });

  // Dashboard Configuration Routes
  app.get("/api/dashboard/config", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const config = await storage.getDashboardConfig(req.orgId, req.currentUser!.id);
      if (!config) {
        return res.status(404).json({ message: "Dashboard configuration not found" });
      }
      res.json(config);
    } catch (error) {
      console.error("Failed to get dashboard config:", error);
      res.status(500).json({ message: "Failed to get dashboard configuration" });
    }
  });

  app.put("/api/dashboard/config", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      // SECURITY: Only allow updating layout and widgets, prevent ownership changes
      const updateSchema = insertDashboardConfigSchema
        .partial()
        .omit({ userId: true, organizationId: true, id: true });
      
      const data = updateSchema.parse(req.body);
      
      // Try update first, if not found, create (upsert behavior)
      let config = await storage.updateDashboardConfig(req.orgId, req.currentUser!.id, data);
      
      if (!config) {
        // Create new config if not found
        const createData = insertDashboardConfigSchema.parse({
          ...data,
          userId: req.currentUser!.id,
        });
        config = await storage.createDashboardConfig(req.orgId, createData);
      }
      
      res.json(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Failed to update dashboard config:", error);
      res.status(500).json({ message: "Failed to update dashboard configuration" });
    }
  });

  app.delete("/api/dashboard/config", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const success = await storage.resetDashboardConfig(req.orgId, req.currentUser!.id);
      res.json({ success });
    } catch (error) {
      console.error("Failed to reset dashboard config:", error);
      res.status(500).json({ message: "Failed to reset dashboard configuration" });
    }
  });

  // Dashboard Widget Templates Routes
  app.get("/api/dashboard/widget-templates", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const { category } = req.query;
      const templates = await storage.getAllDashboardWidgetTemplates(
        req.orgId, 
        category as string | undefined
      );
      res.json(templates);
    } catch (error) {
      console.error("Failed to get widget templates:", error);
      res.status(500).json({ message: "Failed to get widget templates" });
    }
  });

  app.get("/api/dashboard/widget-templates/:id", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const template = await storage.getDashboardWidgetTemplate(req.orgId, req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Widget template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Failed to get widget template:", error);
      res.status(500).json({ message: "Failed to get widget template" });
    }
  });

  app.post("/api/dashboard/widget-templates", requireOrganization(), requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // SECURITY: Prevent organizationId manipulation
      const createSchema = insertDashboardWidgetTemplateSchema.omit({ organizationId: true });
      const data = createSchema.parse(req.body);
      
      const template = await storage.createDashboardWidgetTemplate(req.orgId, data);
      res.status(201).json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Failed to create widget template:", error);
      res.status(500).json({ message: "Failed to create widget template" });
    }
  });

  app.put("/api/dashboard/widget-templates/:id", requireOrganization(), requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      // SECURITY: Only allow updating content fields, prevent ownership changes
      const updateSchema = insertDashboardWidgetTemplateSchema
        .partial()
        .omit({ id: true, organizationId: true });
      
      const data = updateSchema.parse(req.body);
      const template = await storage.updateDashboardWidgetTemplate(req.orgId, req.params.id, data);
      
      if (!template) {
        return res.status(404).json({ message: "Widget template not found" });
      }
      
      res.json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Failed to update widget template:", error);
      res.status(500).json({ message: "Failed to update widget template" });
    }
  });

  app.delete("/api/dashboard/widget-templates/:id", requireOrganization(), requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const success = await storage.deleteDashboardWidgetTemplate(req.orgId, req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Widget template not found" });
      }
      res.json({ success });
    } catch (error) {
      console.error("Failed to delete widget template:", error);
      res.status(500).json({ message: "Failed to delete widget template" });
    }
  });

  // ========== ACCOUNT OWNERSHIP MANAGEMENT ==========
  
  // Transfer account ownership to another admin user
  app.post("/api/account/transfer-ownership", requireOrganization(), authenticateUser(), async (req, res) => {
    try {
      const currentUser = req.currentUser!;
      
      // Only account owners and super admins can transfer ownership
      if (!currentUser.isAccountOwner && !currentUser.isSuperAdmin) {
        return res.status(403).json({ 
          message: "Only the current account owner can transfer ownership" 
        });
      }
      
      const { newOwnerId } = req.body;
      
      if (!newOwnerId) {
        return res.status(400).json({ message: "New owner ID is required" });
      }
      
      // Get the new owner user
      const newOwner = await storage.getUser(req.orgId, newOwnerId);
      
      if (!newOwner) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // New owner must be an admin
      if (newOwner.role !== 'admin') {
        return res.status(400).json({ 
          message: "New account owner must have admin role. Please promote the user to admin first." 
        });
      }
      
      // Cannot transfer to self
      if (newOwner.id === currentUser.id) {
        return res.status(400).json({ message: "Cannot transfer ownership to yourself" });
      }
      
      console.log(`Transferring account ownership from ${currentUser.email} to ${newOwner.email} for org ${req.orgId}`);
      
      // Remove account owner status from all users in this organization
      const allUsers = await storage.getAllUsers(req.orgId, true);
      for (const user of allUsers) {
        if (user.isAccountOwner) {
          await storage.updateUser(req.orgId, user.id, {
            isAccountOwner: false
          });
        }
      }
      
      // Grant account owner status to new owner
      await storage.updateUser(req.orgId, newOwnerId, {
        isAccountOwner: true,
        role: 'admin' // Ensure they remain admin
      });
      
      // Log the ownership transfer
      console.log(`Account ownership successfully transferred to ${newOwner.email} (${newOwner.id})`);
      
      res.json({ 
        success: true,
        message: `Account ownership transferred to ${newOwner.name}`,
        newOwner: {
          id: newOwner.id,
          name: newOwner.name,
          email: newOwner.email
        }
      });
    } catch (error) {
      console.error("Failed to transfer account ownership:", error);
      res.status(500).json({ message: "Failed to transfer account ownership" });
    }
  });
  
  // Get current account owner
  app.get("/api/account/owner", requireOrganization(), authenticateUser(), async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers(req.orgId, false);
      const accountOwner = allUsers.find(user => user.isAccountOwner);
      
      if (!accountOwner) {
        // This shouldn't happen, but handle gracefully
        return res.json({ 
          owner: null,
          message: "No account owner found for this organization" 
        });
      }
      
      res.json({
        owner: {
          id: accountOwner.id,
          name: accountOwner.name,
          email: accountOwner.email,
          avatar: accountOwner.avatar
        }
      });
    } catch (error) {
      console.error("Failed to get account owner:", error);
      res.status(500).json({ message: "Failed to get account owner" });
    }
  });

  // Super Admin middleware is already imported from ./middleware/auth

  // Super Admin API Routes
  
  // Organizations management
  app.get("/api/super-admin/organizations", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const organizations = await storage.getAllOrganizations();
      const orgsWithStats = await Promise.all(
        organizations.map(async (org) => {
          const stats = await storage.getOrganizationStats(org.id);
          return {
            ...org,
            ...stats  // Flatten the stats fields into the organization object
          };
        })
      );
      res.json(orgsWithStats);
    } catch (error) {
      console.error("Failed to get organizations:", error);
      res.status(500).json({ message: "Failed to get organizations" });
    }
  });

  app.post("/api/super-admin/organizations", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const { name, slug, plan, customValues } = req.body;
      
      if (!name || !slug) {
        return res.status(400).json({ message: "Name and slug are required" });
      }

      const organization = await storage.createOrganization({
        id: `org-${Math.random().toString(36).substring(2, 15)}`,
        name,
        slug,
        plan: plan || "standard",
        customValues: customValues || [],
        isActive: true
      });
      
      res.json(organization);
    } catch (error) {
      console.error("Failed to create organization:", error);
      res.status(500).json({ message: "Failed to create organization" });
    }
  });

  app.put("/api/super-admin/organizations/:id", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const organization = await storage.updateOrganization(req.params.id, req.body);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      res.json(organization);
    } catch (error) {
      console.error("Failed to update organization:", error);
      res.status(500).json({ message: "Failed to update organization" });
    }
  });

  // Test integrations endpoint (admin/super admin only)
  app.get('/api/test-integrations', requireAuth(), async (req, res) => {
    try {
      // Only admins can test integrations
      if (req.currentUser?.role !== 'admin' && !req.currentUser?.isSuperAdmin) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const { testAllIntegrations } = await import('./test-integrations');
      const results = await testAllIntegrations();
      res.json(results);
    } catch (error) {
      console.error('Integration test error:', error);
      res.status(500).json({ message: 'Failed to test integrations', error });
    }
  });

  app.delete("/api/super-admin/organizations/:id", requireAuth(), requireSuperAdmin(), async (req, res) => {
    const orgIdParam = req.params.id;
    console.log(`🗑️ Delete request for org ID: "${orgIdParam}"`);
    console.log(`👤 User: ${req.currentUser?.email} (Super Admin: ${req.currentUser?.isSuperAdmin})`);
    console.log(`📊 Type of ID param: ${typeof orgIdParam}, Length: ${orgIdParam.length}`);
    
    try {
      // Don't allow deletion of the main Whirkplace organization or demo org
      if (orgIdParam === 'whirkplace') {
        console.log("❌ Blocked: Cannot delete main Whirkplace org");
        return res.status(400).json({ message: "Cannot delete the main Whirkplace organization" });
      }
      
      // Check if it's the Fictitious Delicious demo org
      console.log(`🔍 Looking up organization with ID: "${orgIdParam}"`);
      const org = await storage.getOrganization(orgIdParam);
      
      if (!org) {
        console.log(`❌ Organization not found with ID: "${orgIdParam}"`);
        // Try to find all organizations and log them for debugging
        const allOrgs = await storage.getAllOrganizations();
        console.log(`📋 All organizations in database:`);
        allOrgs.forEach(o => {
          console.log(`  - ID: "${o.id}", Name: "${o.name}", Slug: "${o.slug}"`);
        });
        
        // Check if the ID matches any organization name or slug
        const matchByName = allOrgs.find(o => o.name.toLowerCase() === orgIdParam.toLowerCase());
        const matchBySlug = allOrgs.find(o => o.slug === orgIdParam);
        
        if (matchByName) {
          console.log(`⚠️ Found organization by name match: "${matchByName.name}" with ID: "${matchByName.id}"`);
          console.log(`⚠️ Frontend might be passing the wrong field as ID`);
        }
        if (matchBySlug) {
          console.log(`⚠️ Found organization by slug match: "${matchBySlug.slug}" with ID: "${matchBySlug.id}"`);
          console.log(`⚠️ Frontend might be passing slug instead of ID`);
        }
        
        return res.status(404).json({ message: "Organization not found" });
      }
      
      console.log(`✅ Found organization: Name: "${org.name}", Slug: "${org.slug}", ID: "${org.id}"`);
      
      if (org.slug === 'fictitious-delicious') {
        console.log("❌ Blocked: Cannot delete demo org");
        return res.status(400).json({ message: "Cannot delete the demo organization (Fictitious Delicious)" });
      }
      
      console.log(`🗑️ Attempting to delete organization: "${org.name}" (${org.slug}) with ID: "${org.id}"`);
      const success = await storage.deleteOrganization(orgIdParam);
      
      if (!success) {
        console.log(`❌ Delete failed: storage.deleteOrganization returned false for ID: "${orgIdParam}"`);
        return res.status(404).json({ message: "Organization not found or cannot be deleted" });
      }
      
      console.log(`✅ Organization "${org.name}" deleted successfully`);
      res.json({ success });
    } catch (error) {
      console.error("❌ Failed to delete organization:", error);
      res.status(500).json({ message: "Failed to delete organization" });
    }
  });

  // Global users management
  app.get("/api/super-admin/users", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const users = await storage.getAllUsersGlobal(includeInactive);
      
      // Get organization names for each user
      const orgs = await storage.getAllOrganizations();
      const orgMap = Object.fromEntries(orgs.map(o => [o.id, o.name]));
      
      const usersWithOrg = users.map(user => ({
        ...user,
        organizationName: orgMap[user.organizationId] || 'Unknown'
      }));
      
      res.json(usersWithOrg);
    } catch (error) {
      console.error("Failed to get users:", error);
      res.status(500).json({ message: "Failed to get users" });
    }
  });

  app.post("/api/super-admin/users", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const { name, email, organizationId, role, password } = req.body;
      
      if (!name || !email || !organizationId) {
        return res.status(400).json({ message: "Name, email, and organizationId are required" });
      }

      // Hash password if provided
      let hashedPassword = null;
      if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
      }

      const user = await storage.createUserGlobal({
        name,
        email,
        organizationId,
        role: role || 'member',
        password: hashedPassword,
        isActive: true,
        isSuperAdmin: false
      });
      
      res.json(user);
    } catch (error) {
      console.error("Failed to create user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.put("/api/super-admin/users/:id", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      // If password is being updated, hash it first
      const updateData = { ...req.body };
      if (updateData.password) {
        updateData.password = await bcrypt.hash(updateData.password, 10);
      }
      
      const user = await storage.updateUserGlobal(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Failed to update user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/super-admin/users/:id", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      // Don't allow deletion of self
      if (req.params.id === req.userId) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }
      
      const success = await storage.deleteUserGlobal(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ success });
    } catch (error) {
      console.error("Failed to delete user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Move user between organizations
  app.post("/api/super-admin/users/:id/move", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const { targetOrganizationId } = req.body;
      
      if (!targetOrganizationId) {
        return res.status(400).json({ message: "Target organization ID is required" });
      }

      const user = await storage.moveUserToOrganization(req.params.id, targetOrganizationId);
      if (!user) {
        return res.status(400).json({ message: "Failed to move user. User or organization not found." });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Failed to move user:", error);
      res.status(500).json({ message: "Failed to move user" });
    }
  });

  // Organization Pricing Management - Super Admin Only
  app.get("/api/admin/organizations/pricing", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const organizations = await storage.getAllOrganizations();
      
      // Get billing data for each organization
      const orgsWithPricing = await Promise.all(
        organizations.map(async (org) => {
          const billingUsage = await billingService.getCurrentBillingUsage(org.id);
          
          // Determine billing cycle based on price
          // Annual pricing typically offers a discount, so we detect based on common patterns
          let billingCycle = 'monthly';
          if (org.billingPricePerUser > 0) {
            // Check if price seems to be annual (typically annual is monthly * 10 or monthly * 12)
            const monthlyEquivalent = org.billingPricePerUser / 12;
            const standardMonthlyPrices = [2000, 5000]; // $20 and $50 in cents
            
            // If the monthly equivalent is close to standard prices, it's likely annual
            for (const price of standardMonthlyPrices) {
              if (Math.abs(monthlyEquivalent - price) < price * 0.2) { // within 20%
                billingCycle = 'annual';
                break;
              }
            }
          }
          
          return {
            organizationId: org.id,
            name: org.name,
            plan: org.plan,
            billingPricePerUser: org.billingPricePerUser,
            billingUserCount: billingUsage.billedUserCount,
            billingCycle
          };
        })
      );
      
      res.json(orgsWithPricing);
    } catch (error) {
      console.error("Failed to get organizations pricing:", error);
      res.status(500).json({ message: "Failed to get organizations pricing" });
    }
  });

  app.patch("/api/admin/organizations/:orgId/pricing", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const { orgId } = req.params;
      const { pricePerUser, billingCycle } = req.body;
      
      // Validate input
      if (pricePerUser === undefined || billingCycle === undefined) {
        return res.status(400).json({ message: "pricePerUser and billingCycle are required" });
      }
      
      if (pricePerUser < 0) {
        return res.status(400).json({ message: "Price per user must be non-negative" });
      }
      
      if (!['monthly', 'annual'].includes(billingCycle)) {
        return res.status(400).json({ message: "Billing cycle must be 'monthly' or 'annual'" });
      }
      
      // Get organization
      const organization = await storage.getOrganization(orgId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Store the previous price for audit trail
      const previousPrice = organization.billingPricePerUser || 0;
      
      // Update organization's billing price - THIS IS THE CRITICAL PART THAT MUST WORK
      await storage.updateOrganization(orgId, {
        billingPricePerUser: pricePerUser
      });
      
      // Try to create billing event for audit trail (optional - don't fail if it doesn't work)
      try {
        await db.insert(billingEvents).values({
          organizationId: orgId,
          eventType: 'pricing_updated',
          userId: req.currentUser!.id,
          userCount: organization.billingUserCount || 0,
          previousUserCount: organization.billingUserCount || 0,
          amount: pricePerUser,
          currency: 'usd',
          description: `Pricing updated from ${previousPrice} to ${pricePerUser} cents per user (${billingCycle})`,
          metadata: {
            previousPrice,
            newPrice: pricePerUser,
            billingCycle,
            updatedBy: req.currentUser!.email,
            updatedAt: new Date().toISOString()
          }
        });
      } catch (eventError) {
        console.error("Failed to create billing event (non-critical):", eventError);
        // Continue - this is non-critical functionality
      }
      
      // Try to get updated billing usage (optional - use fallback if it fails)
      let billingUserCount;
      try {
        const billingUsage = await billingService.getCurrentBillingUsage(orgId);
        billingUserCount = billingUsage.billedUserCount;
      } catch (usageError) {
        console.error("Failed to get billing usage (using fallback):", usageError);
        // Fallback to organization's existing billing user count
        billingUserCount = organization.billingUserCount || 0;
      }
      
      // Return updated pricing info - This response ALWAYS works
      res.json({
        organizationId: orgId,
        name: organization.name,
        plan: organization.plan,
        billingPricePerUser: pricePerUser,
        billingUserCount: billingUserCount,
        billingCycle,
        message: "Pricing updated successfully"
      });
    } catch (error) {
      console.error("Failed to update organization pricing:", error);
      res.status(500).json({ message: "Failed to update organization pricing" });
    }
  });

  // System statistics
  app.get("/api/super-admin/stats", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const stats = await storage.getSystemStats();
      res.json(stats);
    } catch (error) {
      console.error("Failed to get system stats:", error);
      res.status(500).json({ message: "Failed to get system stats" });
    }
  });

  // Super Admin Check-in Management Endpoints
  // GET /api/super-admin/checkins - List all check-ins across all organizations with filters
  app.get("/api/super-admin/checkins", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      console.log("📋 Super admin fetching check-ins across organizations");
      
      const filters = {
        organizationId: req.query.organizationId as string | undefined,
        userId: req.query.userId as string | undefined,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        status: req.query.status as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0
      };
      
      const result = await storage.getAllCheckinsAcrossOrgs(filters);
      
      // Fetch additional data for context (user names, organization names)
      const enrichedCheckins = await Promise.all(
        result.checkins.map(async (checkin) => {
          const [user, organization] = await Promise.all([
            storage.getUserGlobal(checkin.userId),
            storage.getOrganization(checkin.organizationId)
          ]);
          
          return {
            ...checkin,
            userName: user?.name || 'Unknown User',
            userEmail: user?.email || '',
            organizationName: organization?.name || 'Unknown Organization'
          };
        })
      );
      
      res.json({
        checkins: enrichedCheckins,
        total: result.total,
        limit: filters.limit,
        offset: filters.offset
      });
    } catch (error) {
      console.error("Failed to fetch check-ins across organizations:", error);
      res.status(500).json({ message: "Failed to fetch check-ins" });
    }
  });

  // PATCH /api/super-admin/checkins/:id - Update a check-in's weekStartDate or other fields
  app.patch("/api/super-admin/checkins/:id", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const checkinId = req.params.id;
      const { weekStartDate, ...otherUpdates } = req.body;
      
      console.log(`📝 Super admin updating check-in ${checkinId}`, {
        admin: req.currentUser?.email,
        updates: req.body
      });
      
      let updatedCheckin;
      
      // If updating the week start date specifically
      if (weekStartDate) {
        const newWeekStart = new Date(weekStartDate);
        updatedCheckin = await storage.updateCheckinWeek(checkinId, newWeekStart);
        
        if (!updatedCheckin) {
          return res.status(404).json({ message: "Check-in not found" });
        }
      }
      
      // If there are other updates besides week start date
      if (Object.keys(otherUpdates).length > 0) {
        // Get the check-in to find its organization
        const checkin = updatedCheckin || await storage.getCheckin('', checkinId);
        if (!checkin) {
          return res.status(404).json({ message: "Check-in not found" });
        }
        
        // Apply other updates
        updatedCheckin = await storage.updateCheckin(checkin.organizationId, checkinId, otherUpdates);
      }
      
      // Log the action for audit trail
      console.log(`✅ Check-in ${checkinId} updated by ${req.currentUser?.email} at ${new Date().toISOString()}`);
      
      res.json({
        message: "Check-in updated successfully",
        checkin: updatedCheckin
      });
    } catch (error) {
      console.error("Failed to update check-in:", error);
      res.status(500).json({ message: "Failed to update check-in" });
    }
  });

  // DELETE /api/super-admin/checkins/:id - Delete invalid check-ins
  app.delete("/api/super-admin/checkins/:id", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const checkinId = req.params.id;
      
      console.log(`🗑️ Super admin deleting check-in ${checkinId}`, {
        admin: req.currentUser?.email,
        timestamp: new Date().toISOString()
      });
      
      const deleted = await storage.deleteCheckinGlobal(checkinId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Check-in not found" });
      }
      
      // Log the action for audit trail
      console.log(`✅ Check-in ${checkinId} deleted by ${req.currentUser?.email} at ${new Date().toISOString()}`);
      
      res.json({
        message: "Check-in deleted successfully",
        checkinId
      });
    } catch (error) {
      console.error("Failed to delete check-in:", error);
      res.status(500).json({ message: "Failed to delete check-in" });
    }
  });

  // GET /api/super-admin/data-health - Get data health report showing potential issues
  app.get("/api/super-admin/data-health", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      console.log("🏥 Super admin requesting data health report");
      
      const report = await storage.getDataHealthReport();
      
      // Enrich the report with user and organization information
      const enrichedReport = {
        ...report,
        futureCheckins: await Promise.all(
          report.futureCheckins.map(async (checkin) => {
            const [user, organization] = await Promise.all([
              storage.getUserGlobal(checkin.userId),
              storage.getOrganization(checkin.organizationId)
            ]);
            
            return {
              ...checkin,
              userName: user?.name || 'Unknown User',
              userEmail: user?.email || '',
              organizationName: organization?.name || 'Unknown Organization'
            };
          })
        ),
        mismatchedDates: await Promise.all(
          report.mismatchedDates.map(async (checkin) => {
            const [user, organization] = await Promise.all([
              storage.getUserGlobal(checkin.userId),
              storage.getOrganization(checkin.organizationId)
            ]);
            
            return {
              ...checkin,
              userName: user?.name || 'Unknown User',
              userEmail: user?.email || '',
              organizationName: organization?.name || 'Unknown Organization'
            };
          })
        ),
        orphanedCheckins: await Promise.all(
          report.orphanedCheckins.map(async (checkin) => {
            const organization = await storage.getOrganization(checkin.organizationId);
            
            return {
              ...checkin,
              userName: 'Deleted User',
              userEmail: 'N/A',
              organizationName: organization?.name || 'Unknown Organization'
            };
          })
        )
      };
      
      console.log(`📊 Data health report generated: ${enrichedReport.totalIssues} issues found`);
      
      res.json(enrichedReport);
    } catch (error) {
      console.error("Failed to generate data health report:", error);
      res.status(500).json({ message: "Failed to generate data health report" });
    }
  });

  // POST /api/super-admin/checkins/manual - Create a manual check-in for any user/week
  app.post("/api/super-admin/checkins/manual", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const { organizationId, userId, weekStartDate, responses, isComplete } = req.body;
      
      if (!organizationId || !userId || !weekStartDate) {
        return res.status(400).json({ 
          message: "organizationId, userId, and weekStartDate are required" 
        });
      }
      
      console.log(`📝 Super admin creating manual check-in`, {
        admin: req.currentUser?.email,
        organizationId,
        userId,
        weekStartDate
      });
      
      const checkin = await storage.createCheckinManual(
        organizationId,
        userId,
        new Date(weekStartDate),
        {
          responses: responses || {},
          isComplete: isComplete !== undefined ? isComplete : true,
          submittedAt: isComplete ? new Date() : null
        }
      );
      
      // Log the action for audit trail
      console.log(`✅ Manual check-in created by ${req.currentUser?.email} at ${new Date().toISOString()}`);
      
      res.json({
        message: "Check-in created successfully",
        checkin
      });
    } catch (error) {
      console.error("Failed to create manual check-in:", error);
      res.status(500).json({ message: "Failed to create manual check-in" });
    }
  });

  // Admin endpoint to seed question bank (idempotent - safe to run multiple times)
  // Allow managers and admins to seed the question bank
  app.post("/api/admin/seed-question-bank", requireAuth(), requireRole(['admin', 'manager']), async (req, res) => {
    try {
      console.log("📚 Admin-triggered question bank seeding initiated by:", req.currentUser?.email);
      
      // Import the seedQuestionBank function
      const { seedQuestionBank } = await import("./seedQuestionBank");
      
      // Run the seeding (it's idempotent - safe to run multiple times)
      const result = await seedQuestionBank();
      
      console.log("📚 Question bank seeding result:", result);
      
      res.json({
        success: result.success,
        message: result.message,
        details: {
          categoriesCreated: result.categoriesCreated,
          questionsCreated: result.questionsCreated,
          categoriesExisting: result.categoriesExisting,
          questionsExisting: result.questionsExisting
        }
      });
    } catch (error) {
      console.error("Failed to seed question bank:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to seed question bank",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Super Admin: Get all active sessions
  app.get("/api/super-admin/sessions", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      // Query the user_sessions table directly
      const query = sql`
        SELECT 
          s.sid as session_id,
          s.sess->>'userId' as user_id,
          u.name as user_name,
          u.email as user_email,
          s.sess->>'organizationId' as organization_id,
          o.name as organization_name,
          s.expire as expiry_time,
          (s.expire - INTERVAL '30 days') as login_time
        FROM user_sessions s
        LEFT JOIN users u ON (s.sess->>'userId')::text = u.id
        LEFT JOIN organizations o ON (s.sess->>'organizationId')::text = o.id
        WHERE s.expire > NOW()
        ORDER BY (s.expire - INTERVAL '30 days') DESC
      `;
      
      const sessions = await db.execute(query);
      
      // Calculate time remaining for each session
      const formattedSessions = sessions.rows.map((session: any) => {
        const now = new Date();
        const expiryTime = new Date(session.expiry_time);
        const loginTime = new Date(session.login_time);
        const msRemaining = expiryTime.getTime() - now.getTime();
        
        // Format time remaining
        let timeRemaining = 'Expired';
        if (msRemaining > 0) {
          const days = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
          const hours = Math.floor((msRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
          
          if (days > 0) {
            timeRemaining = `${days} day${days > 1 ? 's' : ''}`;
          } else if (hours > 0) {
            timeRemaining = `${hours} hour${hours > 1 ? 's' : ''}`;
          } else {
            timeRemaining = `${minutes} minute${minutes > 1 ? 's' : ''}`;
          }
        }
        
        return {
          sessionId: session.session_id,
          userId: session.user_id,
          userName: session.user_name || 'Unknown',
          userEmail: session.user_email || 'No email',
          organizationId: session.organization_id,
          organizationName: session.organization_name || 'No organization',
          loginTime: loginTime.toISOString(),
          expiryTime: expiryTime.toISOString(),
          timeRemaining
        };
      });
      
      res.json(formattedSessions);
    } catch (error) {
      console.error("Error fetching active sessions:", error);
      res.status(500).json({ message: "Failed to fetch active sessions" });
    }
  });

  // ========== QUESTION CATEGORIES MANAGEMENT (SUPER ADMIN ONLY) ==========
  
  // GET /api/superadmin/categories - List all categories with counts
  app.get("/api/superadmin/categories", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      console.log("📚 Super admin fetching question categories with counts");
      
      // Get all question categories
      const categoriesResult = await db.execute(sql`
        SELECT 
          qc.*,
          (SELECT COUNT(*) FROM question_bank qb WHERE qb.category_id = qc.id) as question_bank_count,
          (SELECT COUNT(*) FROM questions q WHERE q.category_id = qc.id) as organization_questions_count
        FROM question_categories qc
        ORDER BY qc.name
      `);
      
      // Format the response
      const categories = categoriesResult.rows.map((cat: any) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        icon: cat.icon,
        order: cat.order,
        isDefault: cat.is_default,
        createdAt: cat.created_at,
        questionBankCount: parseInt(cat.question_bank_count || 0),
        organizationQuestionsCount: parseInt(cat.organization_questions_count || 0),
        totalQuestions: parseInt(cat.question_bank_count || 0) + parseInt(cat.organization_questions_count || 0)
      }));
      
      console.log(`✅ Found ${categories.length} categories`);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching question categories:", error);
      res.status(500).json({ message: "Failed to fetch question categories" });
    }
  });

  // DELETE /api/superadmin/categories/:id - Delete a category (with safety checks)
  app.delete("/api/superadmin/categories/:id", requireAuth(), requireSuperAdmin(), async (req, res) => {
    try {
      const categoryId = req.params.id;
      
      console.log(`🗑️ Super admin attempting to delete category ${categoryId}`, {
        admin: req.currentUser?.email,
        timestamp: new Date().toISOString()
      });
      
      // First check if category exists and has no questions
      const checkResult = await db.execute(sql`
        SELECT 
          qc.*,
          (SELECT COUNT(*) FROM question_bank qb WHERE qb.category_id = qc.id) as question_bank_count,
          (SELECT COUNT(*) FROM questions q WHERE q.category_id = qc.id) as organization_questions_count
        FROM question_categories qc
        WHERE qc.id = ${categoryId}
      `);
      
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Category not found" });
      }
      
      const category = checkResult.rows[0];
      const bankCount = parseInt(category.question_bank_count || 0);
      const orgCount = parseInt(category.organization_questions_count || 0);
      
      // Check if category is a system default
      if (category.is_default) {
        return res.status(400).json({ 
          message: "Cannot delete system default category" 
        });
      }
      
      // Check if category has any questions
      if (bankCount > 0 || orgCount > 0) {
        return res.status(400).json({ 
          message: `Cannot delete category with questions. This category has ${bankCount} questions in the question bank and ${orgCount} organization questions.` 
        });
      }
      
      // Delete the category
      await db.execute(sql`
        DELETE FROM question_categories 
        WHERE id = ${categoryId}
      `);
      
      console.log(`✅ Category ${categoryId} (${category.name}) deleted by ${req.currentUser?.email} at ${new Date().toISOString()}`);
      
      res.json({
        message: "Category deleted successfully",
        categoryId,
        categoryName: category.name
      });
    } catch (error) {
      console.error("Failed to delete category:", error);
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  // ===================================
  // CRITICAL SESSION & SLACK ENDPOINTS
  // ===================================
  
  // NOTE: Removed duplicate /api/users/current endpoint that was overriding the authenticated version
  // The authenticated version with requireAuth() at line 3977 should be used instead
  
  // These duplicate endpoints have been removed to avoid conflicts
  // The proper sync-users endpoints are defined earlier in the file around line 6250
  // Those endpoints use the channel-based sync which is the correct approach
  
  // GET /api/integrations/slack/status - Check Slack connection status
  app.get("/api/integrations/slack/status", requireAuth(), async (req, res) => {
    console.log("🔍 GET /api/integrations/slack/status - Checking Slack connection");
    console.log("🏢 Organization ID:", req.orgId);
    
    try {
      // Get organization
      const organization = await storage.getOrganization(req.orgId);
      
      if (!organization) {
        console.log("❌ Organization not found");
        return res.status(404).json({ 
          connected: false,
          error: "Organization not found"
        });
      }
      
      console.log("🏢 Organization:", organization.name);
      console.log("🔑 Slack token exists:", !!organization.slackBotToken);
      console.log("🔌 Slack enabled:", organization.enableSlackIntegration);
      
      // Check if Slack token exists
      const connected = !!organization.slackBotToken;
      
      if (connected) {
        // If token exists, optionally test the connection
        if (req.query.test === 'true') {
          console.log("🧪 Testing Slack connection with API call");
          
          try {
            const slackClient = new WebClient(organization.slackBotToken);
            const testResult = await slackClient.auth.test();
            
            if (testResult.ok) {
              console.log("✅ Slack connection test successful");
              return res.json({
                connected: true,
                workspaceId: organization.slackWorkspaceId,
                teamName: (testResult as any).team,
                botName: (testResult as any).user
              });
            } else {
              console.log("❌ Slack connection test failed");
              return res.json({
                connected: false,
                error: "Token validation failed"
              });
            }
          } catch (testError: any) {
            console.error("❌ Slack test error:", testError);
            return res.json({
              connected: false,
              error: "Failed to validate token"
            });
          }
        }
        
        // Return basic status
        console.log("✅ Slack is connected");
        res.json({
          connected: true,
          workspaceId: organization.slackWorkspaceId
        });
      } else {
        console.log("⚠️ Slack is not connected");
        res.json({
          connected: false
        });
      }
      
    } catch (error: any) {
      console.error("❌ Status check error:", error);
      res.status(500).json({ 
        connected: false,
        error: "Failed to check status"
      });
    }
  });
  
  // Register additional route modules
  registerMicrosoftTeamsRoutes(app);
  registerMicrosoftAuthRoutes(app);
  registerMicrosoftCalendarRoutes(app);
  
  // Register test KRA import routes (for testing only)
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_TEST_ENDPOINTS === 'true') {
    const { registerTestKraImportRoutes } = await import('./test-kra-imports');
    registerTestKraImportRoutes(app);
  }

  const httpServer = createServer(app);
  return httpServer;
}
