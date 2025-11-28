import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, date, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Default Company Values (for backward compatibility)
export const DefaultCompanyValues = {
  OWN_IT: "own it",
  CHALLENGE_IT: "challenge it",
  TEAM_FIRST: "team first",
  EMPATHY_FOR_OTHERS: "empathy for others",
  PASSION_FOR_OUR_PURPOSE: "passion for our purpose",
} as const;

export type CompanyValue = string;
export const defaultCompanyValuesArray = Object.values(DefaultCompanyValues);

// Review Status Constants
export const ReviewStatus = {
  PENDING: "pending",
  REVIEWED: "reviewed",
} as const;

export type ReviewStatusType = typeof ReviewStatus[keyof typeof ReviewStatus];

// Auth Provider Constants
export const AuthProvider = {
  LOCAL: "local",
  SLACK: "slack",
  MICROSOFT: "microsoft",
} as const;

export type AuthProviderType = typeof AuthProvider[keyof typeof AuthProvider];

// Session data type for admin viewing
export interface SessionData {
  sessionId: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  organizationId: string | null;
  organizationName: string | null;
  loginTime: Date;
  expiryTime: Date;
  timeRemaining: string;
}

// Team Type Constants
export const TeamType = {
  TEAM: "team", // Top level - everyone is on a team
  DEPARTMENT: "department", // Optional sub-structure within teams
  POD: "pod", // Optional sub-structure within teams
} as const;

export type TeamTypeValue = typeof TeamType[keyof typeof TeamType];

// Plan Constants
export const Plan = {
  STANDARD: "standard",
  PROFESSIONAL: "professional", 
  ENTERPRISE: "enterprise",
  PARTNER: "partner", // Special plan for partner firms
} as const;

export type PlanType = typeof Plan[keyof typeof Plan];

// Feature access control based on plans
export const PlanFeatures = {
  [Plan.STANDARD]: {
    maxUsers: 10,
    features: ["checkins", "wins", "shoutouts", "basic_analytics"],
  },
  [Plan.PROFESSIONAL]: {
    maxUsers: 50,
    features: ["checkins", "wins", "shoutouts", "analytics", "teams", "reviews"],
  },
  [Plan.ENTERPRISE]: {
    maxUsers: -1, // unlimited
    features: ["checkins", "wins", "shoutouts", "analytics", "teams", "reviews", "one_on_ones", "kra_management", "advanced_analytics", "slack_integration", "teams_integration"],
  },
  [Plan.PARTNER]: {
    maxUsers: -1, // unlimited
    features: ["checkins", "wins", "shoutouts", "analytics", "teams", "reviews", "one_on_ones", "kra_management", "advanced_analytics", "slack_integration", "teams_integration", "partner_admin", "client_management", "co_branding", "commission_tracking"],
  },
} as const;

// Goal Type Constants
export const GoalType = {
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  CUSTOM: "custom",
} as const;

export type GoalTypeValue = typeof GoalType[keyof typeof GoalType];

// Goal Status Constants
export const GoalStatus = {
  ACTIVE: "active",
  COMPLETED: "completed",
  EXPIRED: "expired",
} as const;

export type GoalStatusValue = typeof GoalStatus[keyof typeof GoalStatus];

// Post Reactions table for emoji reactions on wins and shoutouts
export const postReactions = pgTable("post_reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull(),
  postType: text("post_type").notNull(), // 'win' or 'shoutout'
  emoji: text("emoji").notNull(), // The emoji character
  userId: varchar("user_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  // Index for fetching reactions by post
  postIdx: index("post_reactions_post_idx").on(table.postId, table.postType),
  // Index for user reactions lookup
  userIdx: index("post_reactions_user_idx").on(table.userId),
  // Unique constraint: one reaction per emoji per user per post
  uniqueUserEmojiPost: unique("unique_user_emoji_post").on(table.userId, table.postId, table.postType, table.emoji),
}));

// Team Goals table for tracking team objectives and prizes
export const teamGoals = pgTable("team_goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  teamId: varchar("team_id"), // null means org-wide goal
  title: text("title").notNull(),
  description: text("description"),
  targetValue: integer("target_value").notNull(),
  currentValue: integer("current_value").notNull().default(0),
  goalType: text("goal_type").notNull(), // weekly, monthly, quarterly
  metric: text("metric").notNull(), // wins, check-ins, kudos
  prize: text("prize"), // optional prize description
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: text("status").notNull().default("active"), // active, completed, expired
  completedAt: timestamp("completed_at"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  // Index for organization lookups
  organizationIdx: index("team_goals_organization_idx").on(table.organizationId),
  // Index for team lookups
  teamIdx: index("team_goals_team_idx").on(table.teamId),
  // Index for status filtering
  statusIdx: index("team_goals_status_idx").on(table.status),
  // Index for date range queries
  dateRangeIdx: index("team_goals_date_range_idx").on(table.startDate, table.endDate),
}));

// Partner Firms table for reseller partners
export const partnerFirms = pgTable("partner_firms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // for URL routing: partner.whirkplace.com
  // Co-branding configuration
  brandingConfig: jsonb("branding_config"), // JSON object with partner branding (logo, colors, tagline)
  plan: text("plan").notNull().default("partner"), // Partner plan type
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  homeOrganizationId: varchar("home_organization_id"), // Reference to their internal organization
  // Partner billing and commission
  wholesaleRate: integer("wholesale_rate").notNull().default(70), // Partner gets this % of revenue
  stripeAccountId: text("stripe_account_id"), // For automated commission payouts
  billingEmail: text("billing_email"),
  // Partner configuration
  enableCobranding: boolean("enable_cobranding").notNull().default(true),
  maxClientOrganizations: integer("max_client_organizations").notNull().default(-1), // -1 = unlimited
  customDomain: text("custom_domain"), // partner.whirkplace.com or custom
}, (table) => ({
  // Index for partner slug lookups (slug is already unique at column level)
  slugIdx: index("partner_firms_slug_idx").on(table.slug),
  // Index for home organization lookups
  homeOrgIdx: index("partner_firms_home_org_idx").on(table.homeOrganizationId),
}));

// Organizations table for multi-tenancy
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // for URL routing: company.whirkplace.com
  industry: text("industry"), // Organization's industry (technology, healthcare, finance, etc.)
  customValues: text("custom_values").array().notNull().default(defaultCompanyValuesArray),
  plan: text("plan").notNull().default("standard"), // standard, professional, enterprise
  discountCode: text("discount_code"), // Track applied discount code
  discountPercentage: integer("discount_percentage"), // Store the discount percentage applied
  partnerFirmId: varchar("partner_firm_id"), // Reference to partner firm if managed by a partner
  // Slack Integration - Per Organization OAuth Configuration
  slackClientId: text("slack_client_id"), // Organization's Slack app client ID
  slackClientSecret: text("slack_client_secret"), // Organization's Slack app client secret
  slackWorkspaceId: text("slack_workspace_id"), // Slack workspace ID for validation
  slackChannelId: text("slack_channel_id"), // Default Slack channel for notifications
  slackWinsChannelId: text("slack_wins_channel_id"), // Specific channel for wins notifications (optional, falls back to slackChannelId)
  slackBotToken: text("slack_bot_token"), // Slack bot token for API calls (deprecated - use slackAccessToken)
  slackAccessToken: text("slack_access_token"), // OAuth access token (expires every 12 hours with rotation)
  slackRefreshToken: text("slack_refresh_token"), // OAuth refresh token for refreshing access token
  slackTokenExpiresAt: timestamp("slack_token_expires_at"), // When the access token expires
  slackSigningSecret: text("slack_signing_secret"), // For webhook verification
  enableSlackIntegration: boolean("enable_slack_integration").notNull().default(false),
  slackConnectionStatus: text("slack_connection_status").default("not_configured"), // not_configured, connected, error
  slackLastConnected: timestamp("slack_last_connected"),
  // Microsoft Integration - Per Organization OAuth Configuration  
  microsoftClientId: text("microsoft_client_id"), // Organization's Azure app client ID
  microsoftClientSecret: text("microsoft_client_secret"), // Organization's Azure app client secret
  microsoftTenantId: text("microsoft_tenant_id"), // Microsoft tenant ID for SSO
  microsoftTeamsWebhookUrl: text("microsoft_teams_webhook_url"), // Teams webhook for notifications
  enableMicrosoftAuth: boolean("enable_microsoft_auth").notNull().default(false),
  enableTeamsIntegration: boolean("enable_teams_integration").notNull().default(false),
  microsoftConnectionStatus: text("microsoft_connection_status").default("not_configured"), // not_configured, connected, error
  microsoftLastConnected: timestamp("microsoft_last_connected"),
  // Theme Configuration - Custom branding for each organization
  themeConfig: jsonb("theme_config"), // JSON object storing CSS custom properties
  enableCustomTheme: boolean("enable_custom_theme").notNull().default(false),
  // Onboarding Status Tracking
  onboardingStatus: text("onboarding_status").notNull().default("not_started"), // not_started, in_progress, completed
  onboardingCurrentStep: text("onboarding_current_step"), // workspace, billing, roles, values, members, settings
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  // Onboarding Step Completion Flags
  onboardingWorkspaceCompleted: boolean("onboarding_workspace_completed").notNull().default(false),
  onboardingBillingCompleted: boolean("onboarding_billing_completed").notNull().default(false),
  onboardingRolesCompleted: boolean("onboarding_roles_completed").notNull().default(false),
  onboardingValuesCompleted: boolean("onboarding_values_completed").notNull().default(false),
  onboardingMembersCompleted: boolean("onboarding_members_completed").notNull().default(false),
  onboardingSettingsCompleted: boolean("onboarding_settings_completed").notNull().default(false),
  // Stripe Billing Information
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeSubscriptionStatus: text("stripe_subscription_status"), // active, trialing, canceled, past_due, etc.
  stripePriceId: text("stripe_price_id"), // Which price they're subscribed to
  trialEndsAt: timestamp("trial_ends_at"),
  // User-Based Billing Information
  billingInterval: text("billing_interval"), // Added: billing interval (monthly, yearly, etc.)
  planType: text("plan_type"), // Added: type of plan (basic, premium, enterprise, etc.)
  billingUserCount: integer("billing_user_count").notNull().default(0), // Number of billable users (for tracking subscription quantity)
  billingPricePerUser: integer("billing_price_per_user").notNull().default(0), // Price per user/seat (in cents)
  billingPeriodStart: timestamp("billing_period_start"), // Current billing period start date
  billingPeriodEnd: timestamp("billing_period_end"), // Current billing period end date
  pendingBillingChanges: jsonb("pending_billing_changes"), // JSON field to track pending user changes
  // Organization Settings
  timezone: text("timezone").notNull().default("America/Chicago"),
  // Check-in Schedule Configuration (NEW)
  checkinDueDay: integer("checkin_due_day").notNull().default(5), // 0=Sunday, 1=Monday, ..., 6=Saturday (default Friday)
  checkinDueTime: text("checkin_due_time").notNull().default("17:00"), // HH:MM format in 24-hour (default 5 PM)
  checkinReminderDay: integer("checkin_reminder_day"), // Optional: day to send reminders (null = same as due day)
  checkinReminderTime: text("checkin_reminder_time").notNull().default("09:00"), // HH:MM format (default 9 AM)
  // Legacy fields - kept for backward compatibility during migration
  weeklyCheckInSchedule: text("weekly_check_in_schedule"), // deprecated - use checkinDueDay instead
  reviewReminderDay: text("review_reminder_day"), // deprecated - use checkinReminderDay instead
  reviewReminderTime: text("review_reminder_time"), // deprecated - use checkinReminderTime instead
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"), // member, admin, manager, partner_admin
  organizationId: varchar("organization_id").notNull(),
  teamId: varchar("team_id"),
  managerId: varchar("manager_id"),
  reviewerId: varchar("reviewer_id"), // Custom reviewer override - if null, defaults to team leader or manager
  avatar: text("avatar"),
  isAccountOwner: boolean("is_account_owner").notNull().default(false), // Tracks if user is the account owner (legal organization owner)
  // Slack integration fields
  slackUserId: text("slack_user_id"), // Unique Slack user ID
  slackUsername: text("slack_username"), // Slack username for tagging (@username)
  slackDisplayName: text("slack_display_name"), // User's display name from Slack
  slackEmail: text("slack_email"), // Slack-verified email
  slackAvatar: text("slack_avatar"), // Slack profile image URL
  slackWorkspaceId: text("slack_workspace_id"), // Slack workspace association
  // Microsoft integration fields
  microsoftUserId: text("microsoft_user_id"), // Microsoft user ID from Graph API
  microsoftUserPrincipalName: text("microsoft_user_principal_name"), // Microsoft UPN
  microsoftDisplayName: text("microsoft_display_name"), // Display name from Microsoft
  microsoftEmail: text("microsoft_email"), // Microsoft-verified email
  microsoftAvatar: text("microsoft_avatar"), // Microsoft profile image URL
  microsoftTenantId: text("microsoft_tenant_id"), // Microsoft tenant association
  microsoftAccessToken: text("microsoft_access_token"), // Microsoft OAuth access token
  microsoftRefreshToken: text("microsoft_refresh_token"), // Microsoft OAuth refresh token
  authProvider: text("auth_provider").notNull().default("local"), // local, slack, microsoft
  // Slack OAuth tokens (in addition to organization-level tokens)
  slackAccessToken: text("slack_access_token"), // Added: user-specific Slack OAuth access token
  slackRefreshToken: text("slack_refresh_token"), // Added: user-specific Slack OAuth refresh token
  // Reminder opt-in preferences  
  weeklyReminderOptIn: boolean("weekly_reminder_opt_in").notNull().default(false), // Added: opt-in for weekly reminders
  reviewReminderOptIn: boolean("review_reminder_opt_in").notNull().default(false), // Added: opt-in for review reminders
  // Personal review reminder preferences (for managers and admins)
  personalReviewReminderDay: text("personal_review_reminder_day"), // Override org default for personal review reminders
  personalReviewReminderTime: text("personal_review_reminder_time"), // Override org default for personal review time
  // Notification Preferences
  notificationPreferences: jsonb("notification_preferences").notNull().default({
    email: {
      checkinReminders: true,
      checkinSubmissions: true,
      winAnnouncements: true,
      shoutouts: true,
      teamUpdates: true,
      weeklyDigest: true
    },
    slack: {
      checkinReminders: true,
      checkinSubmissions: true,
      winAnnouncements: true,
      shoutouts: true,
      directMessages: true
    },
    inApp: {
      checkinReminders: true,
      checkinSubmissions: true,
      winAnnouncements: true,
      shoutouts: true,
      teamUpdates: true,
      systemAlerts: true
    }
  }),
  notificationSchedule: jsonb("notification_schedule").notNull().default({
    doNotDisturb: false,
    doNotDisturbStart: "18:00",
    doNotDisturbEnd: "09:00",
    weekendNotifications: false,
    timezone: "America/Chicago"
  }),
  // Permission to view check-ins across all teams (granted by admins only)
  canViewAllTeams: boolean("can_view_all_teams").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  // Unique username per organization
  usernameOrgIdx: unique("users_username_org_unique").on(table.organizationId, table.username),
  // Unique email per organization  
  emailOrgIdx: unique("users_email_org_unique").on(table.organizationId, table.email),
  // Unique Slack user ID per organization (allows same Slack ID in different orgs)
  slackUserOrgIdx: unique("users_org_slack_unique").on(table.organizationId, table.slackUserId),
  // Index on Slack user ID for fast lookups
  slackUserIdIdx: index("users_slack_user_id_idx").on(table.slackUserId),
  // Index on Slack username for tagging functionality
  slackUsernameIdx: index("users_slack_username_idx").on(table.slackUsername),
  // Composite index for workspace-based queries
  orgSlackWorkspaceIdx: index("users_org_slack_workspace_idx").on(table.organizationId, table.slackWorkspaceId),
  // Index on auth provider for filtering users by authentication method
  authProviderIdx: index("users_auth_provider_idx").on(table.authProvider),
}));

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  organizationId: varchar("organization_id").notNull(),
  leaderId: varchar("leader_id"), // Nullable - team leader can be assigned later
  parentTeamId: varchar("parent_team_id"), // For hierarchical team structure (Departments/Pods under teams)
  teamType: text("team_type").notNull().default("team"), // team (top level), department, pod
  depth: integer("depth").notNull().default(0), // 0 = top level, 1 = sub-team, 2 = sub-sub-team, etc.
  path: text("path"), // Materialized path for efficient hierarchy queries (e.g., "leadership/accounting/team1")
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  // Index for parent-child lookups
  parentTeamIdx: index("teams_parent_team_idx").on(table.parentTeamId),
  // Index for hierarchy path queries
  pathIdx: index("teams_path_idx").on(table.path),
  // Index for team type filtering
  teamTypeIdx: index("teams_team_type_idx").on(table.teamType),
}));

export const checkins = pgTable("checkins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  weekOf: timestamp("week_of").notNull(),
  overallMood: integer("overall_mood").notNull(), // 1-5 rating (weekly pulse check)
  responses: jsonb("responses").notNull().default({}), // question_id -> response
  responseEmojis: jsonb("response_emojis").notNull().default({}), // question_id -> emoji (e.g., "😊", "😟", "🎯")
  responseFlags: jsonb("response_flags").notNull().default({}), // question_id -> {addToOneOnOne: bool, flagForFollowUp: bool}
  questionSnapshots: jsonb("question_snapshots").notNull().default({}), // question_id -> {text, categoryId} - Store question text at time of submission
  winningNextWeek: text("winning_next_week"), // What winning looks like for next week
  isComplete: boolean("is_complete").notNull().default(false),
  submittedAt: timestamp("submitted_at"),
  dueDate: timestamp("due_date").notNull(), // When check-in is due (Monday 9am Central for that week)
  submittedOnTime: boolean("submitted_on_time").notNull().default(false), // If submitted by due date
  reviewStatus: text("review_status").notNull().default("pending"), // pending, reviewed
  reviewedBy: varchar("reviewed_by"), // ID of reviewing team leader (nullable)
  reviewedAt: timestamp("reviewed_at"), // When review was completed (nullable)
  reviewDueDate: timestamp("review_due_date").notNull(), // When review is due (Monday 9am Central)
  reviewedOnTime: boolean("reviewed_on_time").notNull().default(false), // If review completed on time
  reviewComments: text("review_comments"), // Optional feedback (nullable)
  responseComments: jsonb("response_comments").notNull().default({}), // question_id -> comment for individual responses
  addToOneOnOne: boolean("add_to_one_on_one").notNull().default(false), // Legacy: Flag for entire checkin
  flagForFollowUp: boolean("flag_for_follow_up").notNull().default(false), // Legacy: Flag for entire checkin
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  orgWeekOfIdx: index("checkins_org_week_of_idx").on(table.organizationId, table.weekOf),
  orgUserWeekOfIdx: index("checkins_org_user_week_of_idx").on(table.organizationId, table.userId, table.weekOf),
  orgReviewStatusIdx: index("checkins_org_review_status_idx").on(table.organizationId, table.reviewStatus),
  reviewedByDateIdx: index("checkins_reviewed_by_date_idx").on(table.reviewedBy, table.reviewedAt),
  dueDateIdx: index("checkins_due_date_idx").on(table.dueDate),
  orgSubmittedOnTimeIdx: index("checkins_org_submitted_on_time_idx").on(table.organizationId, table.submittedOnTime),
  orgReviewedOnTimeIdx: index("checkins_org_reviewed_on_time_idx").on(table.organizationId, table.reviewedOnTime),
}));

// Question categories for organizing questions into groups
export const questionCategories = pgTable("question_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"), // emoji or icon name
  order: integer("order").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false), // System default categories
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// KRA categories for organizing KRA templates into groups
export const kraCategories = pgTable("kra_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  order: integer("order").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false), // System default categories
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Question bank - shared templates that organizations can use
export const questionBank = pgTable("question_bank", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  text: text("text").notNull(),
  categoryId: varchar("category_id").notNull(),
  description: text("description"), // Helper text explaining when to use this question
  tags: text("tags").array().notNull().default([]), // Tags like "weekly", "monthly", "team-health", etc.
  usageCount: integer("usage_count").notNull().default(0), // Track popularity
  isSystem: boolean("is_system").notNull().default(false), // System provided vs user contributed
  contributedBy: varchar("contributed_by"), // User who contributed this question
  contributedByOrg: varchar("contributed_by_org"), // Organization that contributed
  isApproved: boolean("is_approved").notNull().default(false), // Admin approval for user contributions
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  categoryIdx: index("question_bank_category_idx").on(table.categoryId),
  approvedIdx: index("question_bank_approved_idx").on(table.isApproved),
}));

export const questions = pgTable("questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  text: text("text").notNull(),
  organizationId: varchar("organization_id").notNull(),
  createdBy: varchar("created_by").notNull(),
  categoryId: varchar("category_id"), // Link to category
  bankQuestionId: varchar("bank_question_id"), // If this came from the question bank
  assignedToUserId: varchar("assigned_to_user_id"), // Assign to specific user (null = all)
  teamId: varchar("team_id"), // If set, question is only for this team (null = organization-wide)
  isFromBank: boolean("is_from_bank").notNull().default(false), // Track if from bank
  isActive: boolean("is_active").notNull().default(true),
  order: integer("order").notNull().default(0),
  addToBank: boolean("add_to_bank").notNull().default(false), // Flag to contribute to bank
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Team Question Settings - Control which org questions apply to teams
export const teamQuestionSettings = pgTable("team_question_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  questionId: varchar("question_id").notNull(), // Organization-wide question ID
  isDisabled: boolean("is_disabled").notNull().default(false), // If true, this org question won't appear for this team
  disabledBy: varchar("disabled_by"), // User who disabled this question
  disabledAt: timestamp("disabled_at"), // When it was disabled
  reason: text("reason"), // Optional reason for disabling
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  // Unique constraint: one setting per question per team
  teamQuestionUnique: unique("team_question_settings_unique").on(table.teamId, table.questionId),
  // Index for efficient team lookups
  teamIdx: index("team_question_settings_team_idx").on(table.teamId),
  // Index for question lookups
  questionIdx: index("team_question_settings_question_idx").on(table.questionId),
}));

// Question Usage History - Track when questions are used
export const questionUsageHistory = pgTable("question_usage_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  questionId: varchar("question_id").notNull(),
  questionText: text("question_text").notNull(), // Store the text at time of usage
  organizationId: varchar("organization_id").notNull(),
  userId: varchar("user_id"), // User who was asked the question
  teamId: varchar("team_id"), // Team context
  checkinId: varchar("checkin_id"), // Link to the check-in where this was asked
  weekOf: timestamp("week_of").notNull(), // Which week this was asked for
  categoryId: varchar("category_id"), // Category at time of usage
  isActive: boolean("is_active").notNull().default(true), // Whether question was active at time of usage
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  // Index for question usage lookups
  questionIdx: index("question_usage_history_question_idx").on(table.questionId),
  // Index for organization analytics
  orgIdx: index("question_usage_history_org_idx").on(table.organizationId),
  // Index for user-specific history
  userIdx: index("question_usage_history_user_idx").on(table.userId),
  // Index for team analytics
  teamIdx: index("question_usage_history_team_idx").on(table.teamId),
  // Index for week-based queries
  weekOfIdx: index("question_usage_history_week_idx").on(table.weekOf),
}));

// Organization Question Settings - Control automated question selection
export const organizationQuestionSettings = pgTable("organization_question_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().unique(),
  minimumQuestionsPerWeek: integer("minimum_questions_per_week").notNull().default(3),
  maximumQuestionsPerWeek: integer("maximum_questions_per_week").notNull().default(5),
  autoSelectEnabled: boolean("auto_select_enabled").notNull().default(false),
  selectionStrategy: text("selection_strategy").notNull().default("rotating"), // random, rotating, smart
  avoidRecentlyAskedDays: integer("avoid_recently_asked_days").notNull().default(30), // Don't repeat questions asked in last N days
  prioritizeCategories: text("prioritize_categories").array().notNull().default([]), // Categories to prioritize
  includeTeamSpecific: boolean("include_team_specific").notNull().default(true), // Include team-specific questions
  includeUserKraRelated: boolean("include_user_kra_related").notNull().default(true), // Include questions related to user's KRAs
  rotationSequence: jsonb("rotation_sequence").notNull().default({}), // Track rotation state for rotating strategy
  lastAutoSelectDate: timestamp("last_auto_select_date"), // Last time auto-selection ran
  createdBy: varchar("created_by").notNull(),
  updatedBy: varchar("updated_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  // Index for organization lookups
  orgIdx: index("organization_question_settings_org_idx").on(table.organizationId),
}));

export const wins = pgTable("wins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  userId: varchar("user_id"), // Nullable - for individual wins
  teamId: varchar("team_id"), // Nullable - for team wins
  organizationId: varchar("organization_id").notNull(),
  nominatedBy: varchar("nominated_by"),
  isPublic: boolean("is_public").notNull().default(false),
  slackMessageId: text("slack_message_id"),
  values: text("values").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkinId: varchar("checkin_id").notNull(),
  userId: varchar("user_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const shoutouts = pgTable("shoutouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromUserId: varchar("from_user_id").notNull(), // who gave the shoutout
  toUserId: varchar("to_user_id"), // who received the shoutout (nullable for team shoutouts)
  toTeamId: varchar("to_team_id"), // team that received the shoutout (nullable for individual shoutouts)
  message: text("message").notNull(),
  organizationId: varchar("organization_id").notNull(),
  values: text("values").array().notNull().default([]), // company values associated
  isPublic: boolean("is_public").notNull().default(false),
  slackMessageId: text("slack_message_id"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  orgUserCreatedAtIdx: index("shoutouts_org_user_created_at_idx").on(table.organizationId, table.fromUserId, table.createdAt),
  orgToUserCreatedAtIdx: index("shoutouts_org_to_user_created_at_idx").on(table.organizationId, table.toUserId, table.createdAt),
  orgToTeamCreatedAtIdx: index("shoutouts_org_to_team_created_at_idx").on(table.organizationId, table.toTeamId, table.createdAt),
}));

// Notifications table for user notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("info"), // info, success, warning, error, shoutout, checkin
  relatedEntityType: text("related_entity_type"), // shoutout, checkin, win, etc.
  relatedEntityId: text("related_entity_id"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  orgUserIdx: index("notifications_org_user_idx").on(table.organizationId, table.userId),
  orgUserUnreadIdx: index("notifications_org_user_unread_idx").on(table.organizationId, table.userId, table.isRead),
  createdAtIdx: index("notifications_created_at_idx").on(table.createdAt),
}));

export const vacations = pgTable("vacations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  userId: varchar("user_id").notNull(),
  weekOf: timestamp("week_of").notNull(), // Monday 00:00 Central Time for the vacation week (stored as UTC)
  note: text("note"), // Optional vacation notes/description
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  orgIdx: index("vacations_org_idx").on(table.organizationId),
  orgUserIdx: index("vacations_org_user_idx").on(table.organizationId, table.userId),
  orgWeekOfIdx: index("vacations_org_week_of_idx").on(table.organizationId, table.weekOf),
  orgUserWeekOfIdx: index("vacations_org_user_week_of_idx").on(table.organizationId, table.userId, table.weekOf),
  // Unique constraint to prevent duplicate vacation entries for the same user and week
  orgUserWeekOfUnique: unique("vacations_org_user_week_of_unique").on(table.organizationId, table.userId, table.weekOf),
}));

// Check-in Exemptions table for administrators to excuse users from check-in requirements
export const checkinExemptions = pgTable("checkin_exemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  userId: varchar("user_id").notNull(),
  weekOf: timestamp("week_of").notNull(), // Monday 00:00 Central Time for the exempted week (stored as UTC)
  reason: text("reason"), // Optional reason for exemption
  createdBy: varchar("created_by").notNull(), // Admin who created the exemption
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  orgIdx: index("checkin_exemptions_org_idx").on(table.organizationId),
  orgUserIdx: index("checkin_exemptions_org_user_idx").on(table.organizationId, table.userId),
  orgWeekOfIdx: index("checkin_exemptions_org_week_of_idx").on(table.organizationId, table.weekOf),
  orgUserWeekOfIdx: index("checkin_exemptions_org_user_week_of_idx").on(table.organizationId, table.userId, table.weekOf),
  // Unique constraint to prevent duplicate exemption entries for the same user and week
  orgUserWeekOfUnique: unique("checkin_exemptions_org_user_week_of_unique").on(table.organizationId, table.userId, table.weekOf),
}));

// Billing Events table for tracking all billing-related changes
export const billingEvents = pgTable("billing_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  eventType: text("event_type").notNull(), // user_added, user_removed, subscription_updated, pro_rata_charge, etc.
  userId: varchar("user_id"), // User that triggered the event (if applicable)
  userCount: integer("user_count").notNull(), // User count at time of event
  previousUserCount: integer("previous_user_count"), // Previous user count
  amount: integer("amount"), // Amount in cents (for charges/refunds)
  currency: text("currency").notNull().default("usd"),
  stripeInvoiceItemId: text("stripe_invoice_item_id"), // Stripe invoice item ID if charge was created
  stripeSubscriptionId: text("stripe_subscription_id"), // Related subscription ID
  description: text("description"), // Human-readable description
  metadata: jsonb("metadata"), // Additional event data
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  orgIdx: index("billing_events_org_idx").on(table.organizationId),
  orgCreatedAtIdx: index("billing_events_org_created_at_idx").on(table.organizationId, table.createdAt),
  eventTypeIdx: index("billing_events_event_type_idx").on(table.eventType),
  userIdx: index("billing_events_user_idx").on(table.userId),
}));

// Analytics Tables for Daily Aggregates
export const pulseMetricsDaily = pgTable("pulse_metrics_daily", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  userId: varchar("user_id").notNull(),
  teamId: varchar("team_id"),
  bucketDate: date("bucket_date").notNull(), // Date bucket (e.g., week start for pulse data)
  moodSum: integer("mood_sum").notNull().default(0), // Sum of mood ratings
  checkinCount: integer("checkin_count").notNull().default(0), // Number of check-ins
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  // Extra columns that exist in production database
  metricDate: date("metric_date").notNull().default(sql`CURRENT_DATE`), // Legacy column
  totalCheckins: integer("total_checkins").notNull().default(0),
  averageMood: integer("average_mood"), // Changed to integer to match database
  mood1Count: integer("mood_1_count").notNull().default(0),
  mood2Count: integer("mood_2_count").notNull().default(0),
  mood3Count: integer("mood_3_count").notNull().default(0),
  mood4Count: integer("mood_4_count").notNull().default(0),
  mood5Count: integer("mood_5_count").notNull().default(0),
  uniqueUsers: integer("unique_users").notNull().default(0),
  teamBreakdown: jsonb("team_breakdown").notNull().default({}),
}, (table) => ({
  orgBucketDateIdx: index("pulse_metrics_org_bucket_date_idx").on(table.organizationId, table.bucketDate),
  orgUserBucketDateIdx: index("pulse_metrics_org_user_bucket_date_idx").on(table.organizationId, table.userId, table.bucketDate),
  orgTeamBucketDateIdx: index("pulse_metrics_org_team_bucket_date_idx").on(table.organizationId, table.teamId, table.bucketDate),
  // Unique constraint to prevent duplicate daily rows
  orgUserBucketDateUnique: unique("pulse_metrics_org_user_bucket_date_unique").on(table.organizationId, table.userId, table.bucketDate),
}));

export const shoutoutMetricsDaily = pgTable("shoutout_metrics_daily", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  userId: varchar("user_id").notNull(),
  teamId: varchar("team_id"),
  bucketDate: date("bucket_date").notNull(), // Date bucket
  receivedCount: integer("received_count").notNull().default(0), // Shoutouts received
  givenCount: integer("given_count").notNull().default(0), // Shoutouts given
  publicCount: integer("public_count").notNull().default(0), // Public shoutouts received
  privateCount: integer("private_count").notNull().default(0), // Private shoutouts received
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  // Extra columns that exist in production database
  metricDate: date("metric_date").default(sql`CURRENT_DATE`), // Metric calculation date (nullable for existing data)
  totalShoutouts: integer("total_shoutouts").notNull().default(0),
  publicShoutouts: integer("public_shoutouts").notNull().default(0),
  privateShoutouts: integer("private_shoutouts").notNull().default(0),
  uniqueSenders: integer("unique_senders").notNull().default(0),
  uniqueReceivers: integer("unique_receivers").notNull().default(0),
  valueCounts: jsonb("value_counts").notNull().default({}),
  topSenders: jsonb("top_senders").notNull().default([]),
  topReceivers: jsonb("top_receivers").notNull().default([]),
}, (table) => ({
  orgBucketDateIdx: index("shoutout_metrics_org_bucket_date_idx").on(table.organizationId, table.bucketDate),
  orgUserBucketDateIdx: index("shoutout_metrics_org_user_bucket_date_idx").on(table.organizationId, table.userId, table.bucketDate),
  orgTeamBucketDateIdx: index("shoutout_metrics_org_team_bucket_date_idx").on(table.organizationId, table.teamId, table.bucketDate),
  // Unique constraint to prevent duplicate daily rows
  orgUserBucketDateUnique: unique("shoutout_metrics_org_user_bucket_date_unique").on(table.organizationId, table.userId, table.bucketDate),
}));

// Compliance Metrics Daily Aggregates
export const complianceMetricsDaily = pgTable("compliance_metrics_daily", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  userId: varchar("user_id").notNull(),
  teamId: varchar("team_id"),
  bucketDate: date("bucket_date").notNull(), // Date bucket
  checkinComplianceCount: integer("checkin_compliance_count").notNull().default(0), // Total completed check-ins
  checkinOnTimeCount: integer("checkin_on_time_count").notNull().default(0), // Check-ins submitted on time
  reviewComplianceCount: integer("review_compliance_count").notNull().default(0), // Total reviews completed
  reviewOnTimeCount: integer("review_on_time_count").notNull().default(0), // Reviews completed on time
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  // Additional columns in production database
  metricDate: date("metric_date").notNull().default(sql`CURRENT_DATE`), // Metric calculation date
  totalDue: integer("total_due").notNull().default(0), // Total items due
  onTimeSubmissions: integer("on_time_submissions").notNull().default(0), // On-time submissions
  lateSubmissions: integer("late_submissions").notNull().default(0), // Late submissions
  missingSubmissions: integer("missing_submissions").notNull().default(0), // Missing submissions
  onTimeReviews: integer("on_time_reviews").notNull().default(0), // On-time reviews
  lateReviews: integer("late_reviews").notNull().default(0), // Late reviews
  pendingReviews: integer("pending_reviews").notNull().default(0), // Pending reviews
  teamBreakdown: jsonb("team_breakdown").notNull().default(sql`'{}'::jsonb`), // Team breakdown data
}, (table) => ({
  orgBucketDateIdx: index("compliance_metrics_org_bucket_date_idx").on(table.organizationId, table.bucketDate),
  orgUserBucketDateIdx: index("compliance_metrics_org_user_bucket_date_idx").on(table.organizationId, table.userId, table.bucketDate),
  orgTeamBucketDateIdx: index("compliance_metrics_org_team_bucket_date_idx").on(table.organizationId, table.teamId, table.bucketDate),
  // Unique constraint to prevent duplicate daily rows
  orgUserBucketDateUnique: unique("compliance_metrics_org_user_bucket_date_unique").on(table.organizationId, table.userId, table.bucketDate),
}));

// Aggregation Watermarks for tracking processed data
export const aggregationWatermarks = pgTable("aggregation_watermarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  aggregationType: text("aggregation_type").notNull(), // Added: type of aggregation being tracked
  lastProcessedDate: date("last_processed_date").notNull(), // Added: last processed date for aggregation
  lastProcessedAt: timestamp("last_processed_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  // Extra column that exists in production database
  lastProcessedId: varchar("last_processed_id"),
}, (table) => ({
  orgIdx: index("aggregation_watermarks_org_idx").on(table.organizationId),
  // Unique constraint to ensure one watermark per organization
  orgUnique: unique("aggregation_watermarks_org_unique").on(table.organizationId),
}));

// Onboarding Checklist Templates - Admin-created templates for new team members
// COMMENTED OUT: Tables don't exist in production
// export const onboardingTemplates = pgTable("onboarding_templates", {
//   id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
//   organizationId: varchar("organization_id").notNull(),
//   name: text("name").notNull(),
//   description: text("description"),
//   targetRole: text("target_role"), // Optional: specific role this template is for (e.g., "developer", "manager")
//   targetTeamId: varchar("target_team_id"), // Optional: specific team this template is for
//   durationDays: integer("duration_days").notNull().default(30), // Expected completion time in days
//   isActive: boolean("is_active").notNull().default(true),
//   isDefault: boolean("is_default").notNull().default(false), // One default template per organization
//   createdBy: varchar("created_by").notNull(),
//   createdAt: timestamp("created_at").notNull().default(sql`now()`),
//   updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
// }, (table) => ({
//   orgIdx: index("onboarding_templates_org_idx").on(table.organizationId),
//   orgActiveIdx: index("onboarding_templates_org_active_idx").on(table.organizationId, table.isActive),
//   orgDefaultIdx: index("onboarding_templates_org_default_idx").on(table.organizationId, table.isDefault),
//   targetTeamIdx: index("onboarding_templates_target_team_idx").on(table.targetTeamId),
// }));

// Individual checklist items within onboarding templates
// COMMENTED OUT: Table doesn't exist in production
// export const onboardingTemplateItems = pgTable("onboarding_template_items", {
//   id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
//   templateId: varchar("template_id").notNull(),
//   organizationId: varchar("organization_id").notNull(),
//   title: text("title").notNull(),
//   description: text("description"),
//   category: text("category"), // e.g., "Setup", "Training", "Meetings", "Documentation"
//   estimatedHours: integer("estimated_hours"), // Optional time estimate
//   dayTarget: integer("day_target"), // Target day for completion (e.g., day 3, day 7)
//   isRequired: boolean("is_required").notNull().default(true),
//   requiresManagerApproval: boolean("requires_manager_approval").notNull().default(false),
//   orderIndex: integer("order_index").notNull().default(0), // For sorting items
//   resourceLinks: text("resource_links").array().notNull().default([]), // URLs to helpful resources
//   createdAt: timestamp("created_at").notNull().default(sql`now()`),
// }, (table) => ({
//   templateIdx: index("onboarding_template_items_template_idx").on(table.templateId),
//   templateOrderIdx: index("onboarding_template_items_template_order_idx").on(table.templateId, table.orderIndex),
//   categoryIdx: index("onboarding_template_items_category_idx").on(table.category),
//   dayTargetIdx: index("onboarding_template_items_day_target_idx").on(table.dayTarget),
// }));

// User assignments to onboarding templates - tracks who is doing which checklist
// COMMENTED OUT: Table doesn't exist in production
// export const onboardingAssignments = pgTable("onboarding_assignments", {
//   id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
//   organizationId: varchar("organization_id").notNull(),
//   userId: varchar("user_id").notNull(),
//   templateId: varchar("template_id").notNull(),
//   assignedBy: varchar("assigned_by").notNull(), // Manager or admin who assigned the checklist
//   startDate: timestamp("start_date").notNull().default(sql`now()`), // When onboarding starts
//   targetCompletionDate: timestamp("target_completion_date").notNull(), // Expected completion date
//   actualCompletionDate: timestamp("actual_completion_date"), // When actually completed
//   status: text("status").notNull().default("in_progress"), // in_progress, completed, overdue, paused
//   completionPercentage: integer("completion_percentage").notNull().default(0), // 0-100
//   managerNotes: text("manager_notes"), // Optional notes from manager
//   createdAt: timestamp("created_at").notNull().default(sql`now()`),
//   updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
// }, (table) => ({
//   orgIdx: index("onboarding_assignments_org_idx").on(table.organizationId),
//   orgUserIdx: index("onboarding_assignments_org_user_idx").on(table.organizationId, table.userId),
//   orgStatusIdx: index("onboarding_assignments_org_status_idx").on(table.organizationId, table.status),
//   userTemplateIdx: index("onboarding_assignments_user_template_idx").on(table.userId, table.templateId),
//   assignedByIdx: index("onboarding_assignments_assigned_by_idx").on(table.assignedBy),
//   // Unique constraint: one active assignment per user per template
//   userTemplateUnique: unique("onboarding_assignments_user_template_unique").on(table.userId, table.templateId),
// }));

// User progress on individual checklist items
// COMMENTED OUT: Table doesn't exist in production
// export const onboardingProgress = pgTable("onboarding_progress", {
//   id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
//   organizationId: varchar("organization_id").notNull(),
//   assignmentId: varchar("assignment_id").notNull(),
//   templateItemId: varchar("template_item_id").notNull(),
//   userId: varchar("user_id").notNull(),
//   status: text("status").notNull().default("pending"), // pending, in_progress, completed, skipped, blocked
//   completedAt: timestamp("completed_at"),
//   notes: text("notes"), // User notes about completing this item
//   managerApprovalStatus: text("manager_approval_status").default("not_required"), // not_required, pending, approved, rejected
//   approvedBy: varchar("approved_by"), // Manager who approved (if required)
//   approvedAt: timestamp("approved_at"),
//   rejectionReason: text("rejection_reason"), // If manager rejected, why?
//   timeSpentHours: integer("time_spent_hours"), // Optional: actual time spent
//   createdAt: timestamp("created_at").notNull().default(sql`now()`),
//   updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
// }, (table) => ({
//   orgIdx: index("onboarding_progress_org_idx").on(table.organizationId),
//   assignmentIdx: index("onboarding_progress_assignment_idx").on(table.assignmentId),
//   userIdx: index("onboarding_progress_user_idx").on(table.userId),
//   statusIdx: index("onboarding_progress_status_idx").on(table.status),
//   approvalStatusIdx: index("onboarding_progress_approval_status_idx").on(table.managerApprovalStatus),
//   approvedByIdx: index("onboarding_progress_approved_by_idx").on(table.approvedBy),
//   // Unique constraint: one progress record per assignment per template item
//   assignmentItemUnique: unique("onboarding_progress_assignment_item_unique").on(table.assignmentId, table.templateItemId),
// }));

// Organization Auth Providers - Stores configured auth providers per organization
export const organizationAuthProviders = pgTable("organization_auth_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  provider: text("provider").notNull(), // slack, microsoft, google, okta, etc.
  providerOrgId: text("provider_org_id"), // Provider's organization ID (e.g., Slack workspace ID)
  providerOrgName: text("provider_org_name"), // Provider's organization name
  clientId: text("client_id"), // OAuth client ID (if org-specific)
  clientSecret: text("client_secret"), // OAuth client secret (encrypted in production)
  accessToken: text("access_token"), // Organization-level access token
  refreshToken: text("refresh_token"), // Organization-level refresh token
  tokenExpiresAt: timestamp("token_expires_at"),
  config: jsonb("config").notNull().default({}), // Additional provider-specific configuration
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  orgProviderIdx: index("org_auth_providers_org_provider_idx").on(table.organizationId, table.provider),
  providerOrgIdIdx: index("org_auth_providers_provider_org_id_idx").on(table.providerOrgId),
  orgEnabledIdx: index("org_auth_providers_org_enabled_idx").on(table.organizationId, table.enabled),
  // Unique constraint: one config per provider per organization
  orgProviderUnique: unique("org_auth_providers_org_provider_unique").on(table.organizationId, table.provider),
}));

// User Identities - Links users to multiple auth providers
export const userIdentities = pgTable("user_identities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  // organizationId: varchar("organization_id").notNull(), // COMMENTED OUT: Not in production
  provider: text("provider").notNull(), // local, slack, microsoft, google, etc.
  providerUserId: text("provider_user_id").notNull(), // User ID from the provider
  providerEmail: text("provider_email"), // Email from provider
  // providerUsername: text("provider_username"), // COMMENTED OUT: Not in production
  providerDisplayName: text("provider_display_name"), // Display name from provider
  // providerAvatar: text("provider_avatar"), // COMMENTED OUT: Not in production
  metadata: jsonb("metadata"), // Metadata from provider (exists in production)
  profile: jsonb("profile").notNull().default({}), // Full profile data from provider
  // accessToken: text("access_token"), // COMMENTED OUT: Not in production
  // refreshToken: text("refresh_token"), // COMMENTED OUT: Not in production
  // tokenExpiresAt: timestamp("token_expires_at"), // COMMENTED OUT: Not in production
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  userProviderIdx: index("user_identities_user_provider_idx").on(table.userId, table.provider),
  // orgProviderUserIdx: index("user_identities_org_provider_user_idx").on(table.organizationId, table.provider, table.providerUserId), // COMMENTED OUT: Uses organizationId
  providerEmailIdx: index("user_identities_provider_email_idx").on(table.providerEmail),
  lastLoginIdx: index("user_identities_last_login_idx").on(table.lastLogin),
  // Unique constraint: one identity per provider per user
  userProviderUnique: unique("user_identities_user_provider_unique").on(table.userId, table.provider),
  // Unique constraint: provider user ID must be unique within organization and provider
  // orgProviderUserUnique: unique("user_identities_org_provider_user_unique").on(table.organizationId, table.provider, table.providerUserId), // COMMENTED OUT: Uses organizationId
}));

// Password Reset Tokens table for password recovery
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  // Index for token lookups
  tokenIdx: index("password_reset_tokens_token_idx").on(table.token),
  // Index for user lookups
  userIdx: index("password_reset_tokens_user_idx").on(table.userId),
  // Index for cleanup of expired tokens
  expiresIdx: index("password_reset_tokens_expires_idx").on(table.expiresAt),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
}).extend({
  // Enhanced validation for core fields
  email: z.string().email("Invalid email format"),
  username: z.string().min(3, "Username must be at least 3 characters").max(50, "Username too long"),
  password: z.string().min(8, "Password must be at least 8 characters").optional(), // Optional for Slack users
  // Slack field validation
  slackUserId: z.string().min(1, "Slack user ID required").optional(),
  slackUsername: z.string().regex(/^[a-z0-9._-]+$/, "Invalid Slack username format").max(21, "Slack username too long").optional(),
  slackDisplayName: z.string().max(80, "Display name too long").optional(),
  slackEmail: z.string().email("Invalid Slack email format").optional(),
  slackAvatar: z.string().url("Invalid avatar URL").optional(),
  slackWorkspaceId: z.string().min(1, "Slack workspace ID required").optional(),
  // Microsoft field validation
  microsoftUserId: z.string().min(1, "Microsoft user ID required").optional(),
  microsoftUserPrincipalName: z.string().min(1, "Microsoft UPN required").optional(),
  microsoftDisplayName: z.string().max(100, "Display name too long").optional(),
  microsoftEmail: z.string().email("Invalid Microsoft email format").optional(),
  microsoftAvatar: z.string().url("Invalid avatar URL").optional(),
  microsoftTenantId: z.string().min(1, "Microsoft tenant ID required").optional(),
  microsoftAccessToken: z.string().optional(),
  microsoftRefreshToken: z.string().optional(),
  authProvider: z.enum([AuthProvider.LOCAL, AuthProvider.SLACK, AuthProvider.MICROSOFT]).default(AuthProvider.LOCAL),
  // Account owner flag for organization founders
  isAccountOwner: z.boolean().default(false),
});

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdAt: true,
  depth: true, // Auto-calculated based on parent
  path: true, // Auto-calculated based on parent
}).extend({
  teamType: z.enum([TeamType.TEAM, TeamType.DEPARTMENT, TeamType.POD]),
});

export const insertCheckinSchema = createInsertSchema(checkins).omit({
  id: true,
  createdAt: true,
  submittedAt: true,
  organizationId: true, // Set by middleware, not user-settable
  submittedOnTime: true, // Computed server-side based on submission timing
  reviewStatus: true, // Always starts as "pending", not user-settable
  reviewedBy: true, // Only set by reviewers
  reviewedAt: true, // Only set by reviewers
  reviewedOnTime: true, // Computed server-side based on review timing
  reviewComments: true, // Only set by reviewers
}).extend({
  weekOf: z.coerce.date(),
  // Due dates are computed server-side if not provided - make them optional
  dueDate: z.coerce.date().optional(),
  reviewDueDate: z.coerce.date().optional(),
});

export const insertQuestionCategorySchema = createInsertSchema(questionCategories).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Category name is required").max(50, "Category name too long"),
  description: z.string().max(200, "Description too long").optional(),
  icon: z.string().max(10, "Icon too long").optional(),
  order: z.number().int().min(0, "Order must be non-negative"),
});

export const insertKraCategorySchema = createInsertSchema(kraCategories).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Category name is required").max(50, "Category name too long"),
  description: z.string().max(200, "Description too long").optional(),
  order: z.number().int().min(0, "Order must be non-negative"),
});

export const insertQuestionBankSchema = createInsertSchema(questionBank).omit({
  id: true,
  createdAt: true,
  usageCount: true, // Managed by system
  isApproved: true, // Managed by admins
}).extend({
  text: z.string().min(5, "Question text must be at least 5 characters").max(500, "Question text too long"),
  description: z.string().max(200, "Description too long").optional(),
  tags: z.array(z.string()).default([]),
});

export const insertQuestionSchema = createInsertSchema(questions).omit({
  id: true,
  createdAt: true,
}).extend({
  text: z.string().min(5, "Question text must be at least 5 characters").max(500, "Question text too long"),
  categoryId: z.string().optional(),
  bankQuestionId: z.string().optional(),
  addToBank: z.boolean().default(false),
});

export const insertWinSchema = createInsertSchema(wins).omit({
  id: true,
  createdAt: true,
}).extend({
  values: z.array(z.string()).min(1, "At least one company value must be selected"),
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  createdAt: true,
});

export const insertShoutoutSchema = createInsertSchema(shoutouts).omit({
  id: true,
  createdAt: true,
  fromUserId: true, // Never accept fromUserId from client - set server-side
}).extend({
  values: z.array(z.string()).min(1, "At least one company value must be selected"),
  message: z.string().min(1, "Message is required").max(500, "Message too long"),
});

export const insertPostReactionSchema = createInsertSchema(postReactions).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  readAt: true,
}).extend({
  title: z.string().min(1, "Title is required").max(100, "Title too long"),
  message: z.string().min(1, "Message is required").max(500, "Message too long"),
  type: z.enum(["info", "success", "warning", "error", "shoutout", "checkin", "win"]).default("info"),
});

export const insertVacationSchema = createInsertSchema(vacations).omit({
  id: true,
  createdAt: true,
  organizationId: true, // Set by middleware, not user-settable
  userId: true, // Set by server from authenticated user, not user-settable
}).extend({
  weekOf: z.coerce.date(),
  note: z.string().max(500, "Vacation note too long").optional(),
  targetUserId: z.string().optional(), // For managers/admins to mark others on vacation
});

export const insertCheckinExemptionSchema = createInsertSchema(checkinExemptions).omit({
  id: true,
  createdAt: true,
  organizationId: true, // Set by middleware
}).extend({
  userId: z.string().min(1, "User ID is required"),
  weekOf: z.coerce.date(),
  reason: z.string().max(500, "Reason too long").optional(),
  createdBy: z.string().min(1, "Created by is required"),
});

export const insertBillingEventSchema = createInsertSchema(billingEvents).omit({
  id: true,
  createdAt: true,
}).extend({
  eventType: z.string().min(1, "Event type is required"),
  userCount: z.number().int().min(0, "User count must be non-negative"),
  previousUserCount: z.number().int().min(0).optional(),
  amount: z.number().int().optional(),
  currency: z.string().default("usd"),
  stripeInvoiceItemId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  description: z.string().optional(),
  metadata: z.any().optional(),
});

export const insertPulseMetricsDailySchema = createInsertSchema(pulseMetricsDaily).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  bucketDate: z.coerce.date(),
});

export const insertShoutoutMetricsDailySchema = createInsertSchema(shoutoutMetricsDaily).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  bucketDate: z.coerce.date(),
});

export const insertComplianceMetricsDailySchema = createInsertSchema(complianceMetricsDaily).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  bucketDate: z.coerce.date(),
});

export const insertAggregationWatermarkSchema = createInsertSchema(aggregationWatermarks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  lastProcessedAt: z.coerce.date(),
});

// Onboarding Checklist Zod Schemas
// COMMENTED OUT: Tables don't exist in production
// export const insertOnboardingTemplateSchema = createInsertSchema(onboardingTemplates).omit({
//   id: true,
//   createdAt: true,
//   updatedAt: true,
// }).extend({
//   name: z.string().min(1, "Template name is required").max(100, "Template name too long"),
//   description: z.string().max(500, "Description too long").optional(),
//   targetRole: z.string().max(50, "Target role too long").optional(),
//   durationDays: z.number().int().min(1, "Duration must be at least 1 day").max(365, "Duration too long"),
// });

// export const insertOnboardingTemplateItemSchema = createInsertSchema(onboardingTemplateItems).omit({
//   id: true,
//   createdAt: true,
// }).extend({
//   title: z.string().min(1, "Item title is required").max(200, "Item title too long"),
//   description: z.string().max(1000, "Description too long").optional(),
//   category: z.string().max(50, "Category too long").optional(),
//   estimatedHours: z.number().int().min(0, "Estimated hours must be positive").max(100, "Estimated hours too high").optional(),
//   dayTarget: z.number().int().min(1, "Day target must be at least 1").max(365, "Day target too high").optional(),
//   orderIndex: z.number().int().min(0, "Order index must be non-negative"),
//   resourceLinks: z.array(z.string().url("Invalid resource URL")).optional(),
// });

// COMMENTED OUT: Table doesn't exist in production
// export const insertOnboardingAssignmentSchema = createInsertSchema(onboardingAssignments).omit({
//   id: true,
//   createdAt: true,
//   updatedAt: true,
//   completionPercentage: true, // Calculated automatically
//   actualCompletionDate: true, // Set when completed
// }).extend({
//   startDate: z.coerce.date(),
//   targetCompletionDate: z.coerce.date(),
//   status: z.enum(["in_progress", "completed", "overdue", "paused"]).default("in_progress"),
//   managerNotes: z.string().max(1000, "Manager notes too long").optional(),
// });

// export const insertOnboardingProgressSchema = createInsertSchema(onboardingProgress).omit({
//   id: true,
//   createdAt: true,
//   updatedAt: true,
//   completedAt: true, // Set when status changes to completed
//   approvedAt: true, // Set when manager approves
// }).extend({
//   status: z.enum(["pending", "in_progress", "completed", "skipped", "blocked"]).default("pending"),
//   notes: z.string().max(1000, "Notes too long").optional(),
//   managerApprovalStatus: z.enum(["not_required", "pending", "approved", "rejected"]).default("not_required"),
//   rejectionReason: z.string().max(500, "Rejection reason too long").optional(),
//   timeSpentHours: z.number().int().min(0, "Time spent must be positive").max(100, "Time spent too high").optional(),
// });

// Separate schema for updates - only allow certain fields to be modified
export const updateShoutoutSchema = z.object({
  message: z.string().min(1, "Message is required").max(500, "Message too long").optional(),
  isPublic: z.boolean().optional(),
  values: z.array(z.string()).min(1, "At least one company value must be selected").optional(),
  // fromUserId and toUserId are NEVER updatable for security
});

// Schema for reviewing check-ins - only managers/leaders can use this
export const reviewCheckinSchema = z.object({
  reviewStatus: z.enum([ReviewStatus.PENDING, ReviewStatus.REVIEWED]),
  reviewComments: z.string().max(1000, "Review comments too long").optional(),
  responseComments: z.record(z.string(), z.string().max(500, "Response comment too long")).optional(), // question_id -> comment
  responseFlags: z.record(z.string(), z.object({ 
    addToOneOnOne: z.boolean(), 
    flagForFollowUp: z.boolean() 
  })).optional(), // question_id -> flags
  addToOneOnOne: z.boolean().optional(),
  flagForFollowUp: z.boolean().optional(),
  // reviewedBy and reviewedAt are set automatically server-side
});

// Insert schemas for auth provider tables
export const insertOrganizationAuthProviderSchema = createInsertSchema(organizationAuthProviders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  provider: z.enum(["slack", "microsoft", "google", "okta", "local"]),
  providerOrgId: z.string().optional(),
  providerOrgName: z.string().optional(),
  config: z.record(z.any()).default({}),
  enabled: z.boolean().default(true),
});

export const insertUserIdentitySchema = createInsertSchema(userIdentities).omit({
  id: true,
  createdAt: true,
}).extend({
  provider: z.enum(["local", "slack", "microsoft", "google", "okta"]),
  providerUserId: z.string().min(1, "Provider user ID is required"),
  providerEmail: z.string().email().optional(),
  profile: z.record(z.any()).default({}),
});

// Password Reset Token Schema
export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
}).extend({
  userId: z.string().min(1, "User ID is required"),
  token: z.string().min(1, "Token is required"),
  expiresAt: z.date(),
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertOrganizationAuthProvider = z.infer<typeof insertOrganizationAuthProviderSchema>;
export type OrganizationAuthProvider = typeof organizationAuthProviders.$inferSelect;

export type InsertUserIdentity = z.infer<typeof insertUserIdentitySchema>;
export type UserIdentity = typeof userIdentities.$inferSelect;

export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

// Team hierarchy type for UI display
export interface TeamHierarchy extends Team {
  children: TeamHierarchy[];
  memberCount: number;
}

export type InsertCheckin = z.infer<typeof insertCheckinSchema>;
export type Checkin = typeof checkins.$inferSelect;

export type InsertQuestionCategory = z.infer<typeof insertQuestionCategorySchema>;
export type QuestionCategory = typeof questionCategories.$inferSelect;

export type InsertKraCategory = z.infer<typeof insertKraCategorySchema>;
export type KraCategory = typeof kraCategories.$inferSelect;

export type InsertQuestionBank = z.infer<typeof insertQuestionBankSchema>;
export type QuestionBank = typeof questionBank.$inferSelect;

export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questions.$inferSelect;

// Team Question Settings schemas and types
export const insertTeamQuestionSettingSchema = createInsertSchema(teamQuestionSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  disabledAt: true,
});
export type InsertTeamQuestionSetting = z.infer<typeof insertTeamQuestionSettingSchema>;
export type TeamQuestionSetting = typeof teamQuestionSettings.$inferSelect;

// Question Usage History schemas and types
export const insertQuestionUsageHistorySchema = createInsertSchema(questionUsageHistory).omit({
  id: true,
  createdAt: true,
});
export type InsertQuestionUsageHistory = z.infer<typeof insertQuestionUsageHistorySchema>;
export type QuestionUsageHistory = typeof questionUsageHistory.$inferSelect;

// Organization Question Settings schemas and types
export const insertOrganizationQuestionSettingsSchema = createInsertSchema(organizationQuestionSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastAutoSelectDate: true,
});
export type InsertOrganizationQuestionSettings = z.infer<typeof insertOrganizationQuestionSettingsSchema>;
export type OrganizationQuestionSettings = typeof organizationQuestionSettings.$inferSelect;

export type InsertWin = z.infer<typeof insertWinSchema>;
export type Win = typeof wins.$inferSelect;

export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export type InsertShoutout = z.infer<typeof insertShoutoutSchema>;
export type Shoutout = typeof shoutouts.$inferSelect;

export type InsertPostReaction = z.infer<typeof insertPostReactionSchema>;
export type PostReaction = typeof postReactions.$inferSelect;

export type InsertVacation = z.infer<typeof insertVacationSchema>;
export type Vacation = typeof vacations.$inferSelect;

export type InsertCheckinExemption = z.infer<typeof insertCheckinExemptionSchema>;
export type CheckinExemption = typeof checkinExemptions.$inferSelect;

export type InsertBillingEvent = z.infer<typeof insertBillingEventSchema>;
export type BillingEvent = typeof billingEvents.$inferSelect;

export type InsertPulseMetricsDaily = z.infer<typeof insertPulseMetricsDailySchema>;
export type PulseMetricsDaily = typeof pulseMetricsDaily.$inferSelect;

export type InsertShoutoutMetricsDaily = z.infer<typeof insertShoutoutMetricsDailySchema>;
export type ShoutoutMetricsDaily = typeof shoutoutMetricsDaily.$inferSelect;

export type InsertComplianceMetricsDaily = z.infer<typeof insertComplianceMetricsDailySchema>;
export type ComplianceMetricsDaily = typeof complianceMetricsDaily.$inferSelect;

export type InsertAggregationWatermark = z.infer<typeof insertAggregationWatermarkSchema>;
export type AggregationWatermark = typeof aggregationWatermarks.$inferSelect;

export type ReviewCheckin = z.infer<typeof reviewCheckinSchema>;

// Analytics types
export type AnalyticsScope = 'organization' | 'team' | 'user';
export type AnalyticsPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type ShoutoutDirection = 'given' | 'received' | 'all';
export type ShoutoutVisibility = 'public' | 'private' | 'all';
export type LeaderboardMetric = 'shoutouts_received' | 'shoutouts_given' | 'pulse_avg';

export interface AnalyticsTimeFilter {
  from?: Date;
  to?: Date;
}

export interface PulseMetricsOptions extends AnalyticsTimeFilter {
  scope: AnalyticsScope;
  entityId?: string; // teamId or userId when scope is team/user
  period: AnalyticsPeriod;
}

export interface ShoutoutMetricsOptions extends AnalyticsTimeFilter {
  scope: AnalyticsScope;
  entityId?: string;
  direction?: ShoutoutDirection;
  visibility?: ShoutoutVisibility;
  period: AnalyticsPeriod;
}

export interface LeaderboardOptions extends AnalyticsTimeFilter {
  metric: LeaderboardMetric;
  scope: AnalyticsScope;
  entityId?: string; // parent entityId (teamId when scope is user)
  period: AnalyticsPeriod;
  limit?: number;
}

export interface PulseMetricsResult {
  periodStart: Date;
  avgMood: number;
  checkinCount: number;
}

export interface ShoutoutMetricsResult {
  periodStart: Date;
  count: number;
}

export interface LeaderboardEntry {
  entityId: string;
  entityName: string;
  value: number;
}

export interface AnalyticsOverview {
  pulseAvg: {
    current: number;
    previous: number;
    change: number;
  };
  totalShoutouts: {
    current: number;
    previous: number;
    change: number;
  };
  activeUsers: {
    current: number;
    previous: number;
    change: number;
  };
  completedCheckins: {
    current: number;
    previous: number;
    change: number;
  };
}

// Compliance Metrics types for on-time tracking
export type ComplianceScope = 'organization' | 'team' | 'user';

export interface ComplianceMetricsOptions extends AnalyticsTimeFilter {
  scope: ComplianceScope;
  entityId?: string; // teamId or userId when scope is team/user
  period?: AnalyticsPeriod;
}

export interface ComplianceMetrics {
  totalCount: number;
  onTimeCount: number;
  onTimePercentage: number;
  averageDaysEarly?: number; // Positive for early, negative for late
  averageDaysLate?: number; // For late submissions only
}

export interface ComplianceMetricsResult {
  periodStart?: Date; // Optional for aggregated results
  metrics: ComplianceMetrics;
}

// One-on-One Meetings
export const oneOnOnes = pgTable("one_on_ones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  participantOneId: varchar("participant_one_id").notNull(), // Usually manager
  participantTwoId: varchar("participant_two_id").notNull(), // Usually direct report
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: text("status").notNull().default("scheduled"), // scheduled, completed, cancelled, rescheduled, skipped
  agenda: text("agenda"),
  notes: text("notes"),
  actionItems: jsonb("action_items").notNull().default([]), // Array of action items
  kraIds: text("kra_ids").array().default([]), // Array of KRA IDs associated with this meeting
  duration: integer("duration").default(30), // Duration in minutes
  location: text("location"), // Meeting location or "virtual"
  // Recurring Meeting Support
  isRecurring: boolean("is_recurring").notNull().default(false), // Whether this is part of a recurring series
  recurrenceSeriesId: varchar("recurrence_series_id"), // Groups meetings in the same recurring series
  recurrencePattern: text("recurrence_pattern"), // weekly, biweekly, monthly, quarterly
  recurrenceInterval: integer("recurrence_interval").default(1), // Every N intervals (e.g., every 2 weeks)
  recurrenceEndDate: timestamp("recurrence_end_date"), // When the recurring series ends
  recurrenceEndCount: integer("recurrence_end_count"), // OR after N occurrences
  isRecurrenceTemplate: boolean("is_recurrence_template").notNull().default(false), // Template for generating recurring instances
  // Outlook Calendar Integration
  outlookEventId: text("outlook_event_id"), // Microsoft Graph Event ID
  meetingUrl: text("meeting_url"), // Teams meeting URL or other online meeting link
  isOnlineMeeting: boolean("is_online_meeting").notNull().default(false),
  syncWithOutlook: boolean("sync_with_outlook").notNull().default(false), // Whether to sync with Outlook
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  orgIdx: index("one_on_ones_org_idx").on(table.organizationId),
  participantsIdx: index("one_on_ones_participants_idx").on(table.participantOneId, table.participantTwoId),
  scheduledIdx: index("one_on_ones_scheduled_idx").on(table.scheduledAt),
  recurrenceSeriesIdx: index("one_on_ones_recurrence_series_idx").on(table.recurrenceSeriesId),
  recurrenceTemplateIdx: index("one_on_ones_recurrence_template_idx").on(table.isRecurrenceTemplate),
}));

// KRA Templates  
export const kraTemplates = pgTable("kra_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  goals: jsonb("goals").notNull().default([]), // Array of goal templates
  category: text("category").notNull().default("general"), // sales, engineering, marketing, etc.
  jobTitle: text("job_title"), // Specific job title (e.g., "Software Engineer", "Tax Manager")
  industries: text("industries").array().notNull().default([]), // Array of applicable industries
  criteria: text("criteria"), // Added: criteria for this KRA template
  isGlobal: boolean("is_global").notNull().default(false), // Available as template for all orgs
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  // Extra columns that exist in production database
  department: text("department"),
  isSystem: boolean("is_system").notNull().default(false),
}, (table) => ({
  orgCategoryIdx: index("kra_templates_org_category_idx").on(table.organizationId, table.category),
  activeIdx: index("kra_templates_active_idx").on(table.isActive),
  globalIdx: index("kra_templates_global_idx").on(table.isGlobal),
}));

// User KRAs (assigned to specific users)
export const userKras = pgTable("user_kras", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  userId: varchar("user_id").notNull(),
  templateId: varchar("template_id"), // Reference to template, nullable for custom KRAs
  name: text("name").notNull(),
  description: text("description"),
  goals: jsonb("goals").notNull().default([]), // Array with progress tracking
  criteria: text("criteria"), // Added: criteria for this KRA
  quarter: text("quarter"), // Added: quarter this KRA is for
  year: integer("year"), // Added: year this KRA is for
  assignedBy: varchar("assigned_by").notNull(), // Manager who assigned it
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  status: text("status").notNull().default("active"), // active, completed, paused, cancelled
  progress: integer("progress").notNull().default(0), // 0-100 percentage
  lastUpdated: timestamp("last_updated").notNull().default(sql`now()`),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  // Extra columns that exist in production database
  isActive: boolean("is_active").notNull().default(true),
  selfRating: integer("self_rating"),
  selfNote: text("self_note"),
  managerRating: integer("manager_rating"),
  managerNote: text("manager_note"),
  finalized: boolean("finalized").notNull().default(false),
  finalizedAt: timestamp("finalized_at"),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  userIdx: index("user_kras_user_idx").on(table.organizationId, table.userId),
  assignedByIdx: index("user_kras_assigned_by_idx").on(table.assignedBy),
  statusIdx: index("user_kras_status_idx").on(table.status),
  templateIdx: index("user_kras_template_idx").on(table.templateId),
}));

// Meeting Action Items (extracted for better querying and tracking)
export const actionItems = pgTable("action_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  meetingId: varchar("meeting_id"), // Reference to one_on_ones (nullable for carry-forward items)
  oneOnOneId: varchar("one_on_one_id"), // Specific one-on-one meeting this item is associated with
  description: text("description").notNull(),
  assignedTo: varchar("assigned_to").notNull(), // User ID
  assignedBy: varchar("assigned_by").notNull(), // User ID who assigned the action
  dueDate: timestamp("due_date"),
  status: text("status").notNull().default("open"), // open, completed
  notes: text("notes"), // Follow-up notes
  carryForward: boolean("carry_forward").notNull().default(true), // Persist until completed
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  meetingIdx: index("action_items_meeting_idx").on(table.meetingId),
  oneOnOneIdx: index("action_items_one_on_one_idx").on(table.oneOnOneId),
  assignedIdx: index("action_items_assigned_idx").on(table.organizationId, table.assignedTo, table.status),
  statusIdx: index("action_items_status_idx").on(table.status),
  dueDateIdx: index("action_items_due_date_idx").on(table.dueDate),
}));

// KRA Ratings - Track self and supervisor ratings for KRAs
export const kraRatings = pgTable("kra_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  kraId: varchar("kra_id").notNull(), // Reference to user_kras
  oneOnOneId: varchar("one_on_one_id"), // Reference to specific meeting (nullable for ad-hoc ratings)
  raterId: varchar("rater_id").notNull(), // User ID of person giving the rating
  raterRole: text("rater_role").notNull(), // 'self' or 'supervisor'
  rating: integer("rating").notNull(), // 1-5 scale
  note: text("note"), // Optional notes/comments
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  kraIdx: index("kra_ratings_kra_idx").on(table.kraId),
  oneOnOneIdx: index("kra_ratings_one_on_one_idx").on(table.oneOnOneId),
  raterIdx: index("kra_ratings_rater_idx").on(table.raterId),
  kraRaterMeetingUnique: unique("kra_ratings_unique").on(table.kraId, table.oneOnOneId, table.raterId),
  latestSupervisorIdx: index("kra_ratings_latest_supervisor_idx").on(table.kraId, table.raterRole, table.createdAt),
}));

// KRA History - Track changes to KRAs over time
export const kraHistory = pgTable("kra_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  kraId: varchar("kra_id").notNull(), // Reference to user_kras
  userId: varchar("user_id").notNull(), // User whose KRA was changed
  changeType: text("change_type").notNull(), // 'create', 'update', 'deactivate'
  oldValue: jsonb("old_value"), // Previous state
  newValue: jsonb("new_value"), // New state
  reason: text("reason"), // Optional reason for change
  changedById: varchar("changed_by_id").notNull(), // User who made the change
  changedAt: timestamp("changed_at").notNull().default(sql`now()`),
}, (table) => ({
  kraIdx: index("kra_history_kra_idx").on(table.kraId),
  userIdx: index("kra_history_user_idx").on(table.userId),
  changedByIdx: index("kra_history_changed_by_idx").on(table.changedById),
  changedAtIdx: index("kra_history_changed_at_idx").on(table.changedAt),
}));

// Bug Reports & Support System
export const bugReports = pgTable("bug_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("bug"), // bug, question, feature_request
  severity: text("severity").notNull().default("medium"), // low, medium, high, critical
  pagePath: text("page_path"),
  metadata: jsonb("metadata").default({}),
  status: text("status").notNull().default("open"), // open, triaged, in_progress, resolved, closed
  resolutionNote: text("resolution_note"),
  assignedTo: varchar("assigned_to"),
  screenshotUrl: text("screenshot_url"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  resolvedAt: timestamp("resolved_at"),
}, (table) => ({
  orgStatusIdx: index("bug_reports_org_status_idx").on(table.organizationId, table.status),
  orgCreatedAtIdx: index("bug_reports_org_created_at_idx").on(table.organizationId, table.createdAt),
}));

// Business Plans
export const businessPlans = pgTable("business_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // "Standard", "Professional", "Enterprise"
  displayName: text("display_name").notNull(),
  description: text("description"),
  price: integer("price").notNull().default(0), // Price in cents
  billingPeriod: text("billing_period").notNull().default("monthly"), // "monthly", "annual"
  features: text("features").array().notNull().default(sql`'{}'`), // Array of feature descriptions
  maxUsers: integer("max_users"), // null = unlimited
  maxTeams: integer("max_teams"), // null = unlimited
  hasSlackIntegration: boolean("has_slack_integration").notNull().default(false),
  hasMicrosoftIntegration: boolean("has_microsoft_integration").notNull().default(false),
  hasAdvancedAnalytics: boolean("has_advanced_analytics").notNull().default(false),
  hasApiAccess: boolean("has_api_access").notNull().default(false),
  priority: integer("priority").notNull().default(0), // Display order
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Organization onboarding status
export const organizationOnboarding = pgTable("organization_onboarding", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  step: text("step").notNull().default("signup"), // "signup", "plan_selection", "team_setup", "user_invites", "settings", "completed"
  isCompleted: boolean("is_completed").notNull().default(false),
  completedSteps: text("completed_steps").array().notNull().default(sql`'{}'`), // Array of completed step names
  currentStepData: jsonb("current_step_data"), // Store step-specific data
  startedAt: timestamp("started_at").notNull().default(sql`now()`),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  orgIdx: index("onboarding_organization_idx").on(table.organizationId),
  stepIdx: index("onboarding_step_idx").on(table.step),
}));

// User invitations during onboarding
export const userInvitations = pgTable("user_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  role: text("role").notNull().default("member"), // "admin", "manager", "member"
  teamId: varchar("team_id").references(() => teams.id, { onDelete: "set null" }),
  invitedBy: varchar("invited_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // "pending", "accepted", "expired"
  token: text("token").notNull().unique(), // Secure invitation token
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  orgIdx: index("invitations_organization_idx").on(table.organizationId),
  emailIdx: index("invitations_email_idx").on(table.email),
  tokenIdx: index("invitations_token_idx").on(table.token),
  statusIdx: index("invitations_status_idx").on(table.status),
}));

// Organization types
export const insertPartnerFirmSchema = createInsertSchema(partnerFirms).omit({
  id: true,
  createdAt: true,
});
export type InsertPartnerFirm = z.infer<typeof insertPartnerFirmSchema>;
export type PartnerFirm = typeof partnerFirms.$inferSelect;

export const insertOrganizationSchema = createInsertSchema(organizations);
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;

// Business Plan types
export const insertBusinessPlanSchema = createInsertSchema(businessPlans).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBusinessPlan = z.infer<typeof insertBusinessPlanSchema>;
export type BusinessPlan = typeof businessPlans.$inferSelect;

// Organization Onboarding types
export const insertOrganizationOnboardingSchema = createInsertSchema(organizationOnboarding).omit({ id: true, startedAt: true, updatedAt: true });
export type InsertOrganizationOnboarding = z.infer<typeof insertOrganizationOnboardingSchema>;
export type OrganizationOnboarding = typeof organizationOnboarding.$inferSelect;

// User Invitation types
export const insertUserInvitationSchema = createInsertSchema(userInvitations).omit({ id: true, token: true, createdAt: true });
export type InsertUserInvitation = z.infer<typeof insertUserInvitationSchema>;
export type UserInvitation = typeof userInvitations.$inferSelect;

// One-on-One types
export const insertOneOnOneSchema = createInsertSchema(oneOnOnes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOneOnOne = z.infer<typeof insertOneOnOneSchema>;
export type OneOnOne = typeof oneOnOnes.$inferSelect;

// KRA Template types
export const insertKraTemplateSchema = createInsertSchema(kraTemplates).omit({ id: true, createdAt: true });
export type InsertKraTemplate = z.infer<typeof insertKraTemplateSchema>;
export type KraTemplate = typeof kraTemplates.$inferSelect;

// User KRA types
export const insertUserKraSchema = createInsertSchema(userKras).omit({ id: true, createdAt: true, lastUpdated: true });
export type InsertUserKra = z.infer<typeof insertUserKraSchema>;
export type UserKra = typeof userKras.$inferSelect;

// Action Item types
export const insertActionItemSchema = createInsertSchema(actionItems).omit({ 
  id: true, 
  createdAt: true, 
  completedAt: true 
}).extend({
  dueDate: z.coerce.date().optional(),
  status: z.enum(["open", "completed"]).default("open"),
  carryForward: z.boolean().default(true),
});
export type InsertActionItem = z.infer<typeof insertActionItemSchema>;
export type ActionItem = typeof actionItems.$inferSelect;

// KRA Rating types
export const insertKraRatingSchema = createInsertSchema(kraRatings).omit({ 
  id: true, 
  createdAt: true 
}).extend({
  rating: z.number().int().min(1).max(5),
  raterRole: z.enum(["self", "supervisor"]),
});
export type InsertKraRating = z.infer<typeof insertKraRatingSchema>;
export type KraRating = typeof kraRatings.$inferSelect;

// KRA History types
export const insertKraHistorySchema = createInsertSchema(kraHistory).omit({ 
  id: true, 
  changedAt: true 
}).extend({
  changeType: z.enum(["create", "update", "deactivate"]),
});
export type InsertKraHistory = z.infer<typeof insertKraHistorySchema>;
export type KraHistory = typeof kraHistory.$inferSelect;

export const insertBugReportSchema = createInsertSchema(bugReports).omit({ id: true, createdAt: true, resolvedAt: true });
export type InsertBugReport = z.infer<typeof insertBugReportSchema>;
export type BugReport = typeof bugReports.$inferSelect;

// Super Admin Tables for System-wide Management

// System Settings - Global configuration for signup screens, features, etc.
// COMMENTED OUT: Table doesn't exist in production
// export const systemSettings = pgTable("system_settings", {
//   id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
//   key: text("key").notNull().unique(), // e.g., "signup_enabled", "maintenance_mode", "welcome_message"
//   value: jsonb("value").notNull(), // Flexible JSON value for any setting type
//   description: text("description"), // Human-readable description of the setting
//   category: text("category").notNull().default("general"), // general, signup, pricing, features
//   isActive: boolean("is_active").notNull().default(true),
//   createdAt: timestamp("created_at").notNull().default(sql`now()`),
//   updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
// }, (table) => ({
//   // Index for efficient category-based queries
//   categoryIdx: index("system_settings_category_idx").on(table.category),
// }));

// Pricing Plans - System-wide plan management with Stripe integration
// COMMENTED OUT: Table doesn't exist in production
// export const pricingPlans = pgTable("pricing_plans", {
//   id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
//   name: text("name").notNull(), // e.g., "Standard", "Professional", "Enterprise"
//   description: text("description"),
//   price: integer("price").notNull(), // Price in cents
//   currency: text("currency").notNull().default("usd"),
//   billingPeriod: text("billing_period").notNull(), // monthly, yearly, one_time
//   stripePriceId: text("stripe_price_id"), // Stripe price ID for integration
//   features: jsonb("features").notNull().default([]), // Array of feature descriptions
//   isActive: boolean("is_active").notNull().default(true),
//   isPopular: boolean("is_popular").notNull().default(false), // Highlight as recommended
//   sortOrder: integer("sort_order").notNull().default(0), // Display order
//   createdAt: timestamp("created_at").notNull().default(sql`now()`),
//   updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
// }, (table) => ({
//   // Index for active plans ordering
//   activeSortIdx: index("pricing_plans_active_sort_idx").on(table.isActive, table.sortOrder),
// }));

// Discount Codes - System-wide promotional codes  
export const discountCodes = pgTable("discount_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(), // e.g., "WELCOME50", "SPRING2024"
  name: text("name").notNull(), // Human-readable name for admin reference
  description: text("description"),
  discountType: text("discount_type").notNull(), // percentage, fixed_amount
  discountValue: integer("discount_value").notNull(), // Percentage (1-100) or amount in cents
  minimumAmount: integer("minimum_amount"), // Minimum order amount in cents (optional)
  maximumDiscount: integer("maximum_discount"), // Max discount in cents for percentage codes
  usageLimit: integer("usage_limit"), // Total usage limit (null = unlimited)
  usageCount: integer("usage_count").notNull().default(0), // Current usage count
  validFrom: timestamp("valid_from").notNull(),
  validTo: timestamp("valid_to"),
  applicablePlans: jsonb("applicable_plans").default([]), // Array of plan IDs this applies to (empty = all)
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  // Index for efficient code lookups
  codeIdx: index("discount_codes_code_idx").on(table.code),
  // Index for validity period checks
  validityIdx: index("discount_codes_validity_idx").on(table.validFrom, table.validTo),
}));

// Discount Code Usage Tracking
export const discountCodeUsage = pgTable("discount_code_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  discountCodeId: varchar("discount_code_id").notNull(),
  organizationId: varchar("organization_id").notNull(), // Which organization used it
  userId: varchar("user_id"), // Which user used it (optional for org-level usage)
  orderAmount: integer("order_amount").notNull(), // Original order amount in cents
  discountAmount: integer("discount_amount").notNull(), // Actual discount applied in cents
  usedAt: timestamp("used_at").notNull().default(sql`now()`),
}, (table) => ({
  // Index for usage analytics
  discountCodeIdx: index("discount_usage_code_idx").on(table.discountCodeId),
  orgIdx: index("discount_usage_org_idx").on(table.organizationId),
}));

// Dashboard Configuration - User customizable dashboard layouts and widgets
export const dashboardConfigs = pgTable("dashboard_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  name: text("name").notNull().default("My Dashboard"), // User-defined dashboard name
  isDefault: boolean("is_default").notNull().default(false), // Primary dashboard for user
  layout: jsonb("layout").notNull().default('{"type": "grid", "columns": 12, "rows": []}'), // Layout configuration
  widgets: jsonb("widgets").notNull().default('[]'), // Array of widget configurations
  themePreferences: jsonb("theme_preferences").default('{"colorScheme": "system", "compactMode": false}'),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  // Index for fast user dashboard lookups
  userIdx: index("dashboard_configs_user_idx").on(table.userId),
  orgIdx: index("dashboard_configs_org_idx").on(table.organizationId),
}));

// Dashboard Widget Templates - Predefined widget configurations for easy setup
export const dashboardWidgetTemplates = pgTable("dashboard_widget_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // e.g., "Check-ins Summary", "Team Health Meter"
  description: text("description"),
  category: text("category").notNull(), // "analytics", "team", "personal", "quick-actions"
  widgetType: text("widget_type").notNull(), // "checkins-summary", "health-meter", "recent-wins", etc.
  defaultConfig: jsonb("default_config").notNull(), // Default widget configuration
  requiredRole: text("required_role").default("member"), // Minimum role required to use this widget
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  categoryIdx: index("widget_templates_category_idx").on(table.category),
  typeIdx: index("widget_templates_type_idx").on(table.widgetType),
}));

// User Tours - Track tour completion status per user
export const userTours = pgTable("user_tours", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  tourId: text("tour_id").notNull(), // e.g., 'dashboard-intro', 'check-ins-guide'
  status: text("status").notNull().default("not_started"), // not_started, in_progress, completed, skipped
  currentStep: integer("current_step").notNull().default(0),
  completedAt: timestamp("completed_at"), // When tour was completed (nullable)
  skippedAt: timestamp("skipped_at"), // When tour was skipped (nullable)
  lastShownAt: timestamp("last_shown_at"), // When tour was last shown to user
  version: text("version").notNull().default("1.0"), // Tour version (e.g., '1.0', '2.0')
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  // Index for user tour lookups
  userIdx: index("user_tours_user_idx").on(table.userId),
  // Index for organization tour lookups
  orgIdx: index("user_tours_org_idx").on(table.organizationId),
  // Index for tour ID lookups
  tourIdx: index("user_tours_tour_idx").on(table.tourId),
  // Composite index for efficient user-tour lookups
  userTourIdx: index("user_tours_user_tour_idx").on(table.userId, table.tourId),
  // Unique constraint: one tour per user per version
  userTourVersionUnique: unique("user_tours_user_tour_version_unique").on(table.userId, table.tourId, table.version),
}));

// Super Admin Zod schemas
// COMMENTED OUT: Tables don't exist in production
// export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({
//   id: true,
//   createdAt: true,
//   updatedAt: true,
// });
// export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
// export type SystemSetting = typeof systemSettings.$inferSelect;

// export const insertPricingPlanSchema = createInsertSchema(pricingPlans).omit({
//   id: true,
//   createdAt: true,
//   updatedAt: true,
// });
// export type InsertPricingPlan = z.infer<typeof insertPricingPlanSchema>;
// export type PricingPlan = typeof pricingPlans.$inferSelect;

export const insertDiscountCodeSchema = createInsertSchema(discountCodes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
});
export type InsertDiscountCode = z.infer<typeof insertDiscountCodeSchema>;
export type DiscountCode = typeof discountCodes.$inferSelect;

export const insertDiscountCodeUsageSchema = createInsertSchema(discountCodeUsage).omit({
  id: true,
  usedAt: true,
});
export type InsertDiscountCodeUsage = z.infer<typeof insertDiscountCodeUsageSchema>;
export type DiscountCodeUsage = typeof discountCodeUsage.$inferSelect;

// Dashboard Configuration Zod schemas
export const insertDashboardConfigSchema = createInsertSchema(dashboardConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDashboardConfig = z.infer<typeof insertDashboardConfigSchema>;
export type DashboardConfig = typeof dashboardConfigs.$inferSelect;

export const insertDashboardWidgetTemplateSchema = createInsertSchema(dashboardWidgetTemplates).omit({
  id: true,
  createdAt: true,
});
export type InsertDashboardWidgetTemplate = z.infer<typeof insertDashboardWidgetTemplateSchema>;
export type DashboardWidgetTemplate = typeof dashboardWidgetTemplates.$inferSelect;

// Team Goals Zod schemas
export const insertTeamGoalSchema = createInsertSchema(teamGoals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  currentValue: true,
  status: true,
  completedAt: true,
  organizationId: true, // Set by middleware
}).extend({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(1000, "Description too long").optional(),
  targetValue: z.number().int().min(1, "Target value must be at least 1"),
  goalType: z.enum(["weekly", "monthly", "quarterly", "custom"]),
  metric: z.string().min(1, "Metric is required").max(100, "Metric too long"),
  prize: z.string().max(500, "Prize description too long").optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  teamId: z.string().optional(), // null means org-wide goal
  createdBy: z.string().optional(), // Set server-side
});
export type InsertTeamGoal = z.infer<typeof insertTeamGoalSchema>;
export type TeamGoal = typeof teamGoals.$inferSelect;

// User Tours Zod schemas
export const insertUserTourSchema = createInsertSchema(userTours).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  tourId: z.string().min(1, "Tour ID is required").max(100, "Tour ID too long"),
  version: z.string().min(1, "Version is required").max(10, "Version too long").default("1.0"),
  completedAt: z.date().optional(),
  skippedAt: z.date().optional(),
});
export type InsertUserTour = z.infer<typeof insertUserTourSchema>;
export type UserTour = typeof userTours.$inferSelect;

// Partner Applications table
export const partnerApplications = pgTable('partner_applications', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  email: text('email').notNull(),
  company: text('company').notNull(),
  website: text('website'),
  expectedSeats: integer('expected_seats'),
  partnershipType: text('partnership_type').$type<'reseller' | 'affiliate'>().notNull(),
  message: text('message'),
  status: text('status').$type<'pending' | 'approved' | 'rejected'>().default('pending'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`)
});

export const insertPartnerApplicationSchema = createInsertSchema(partnerApplications).omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  email: z.string().email("Invalid email format"),
  company: z.string().min(1, "Company name is required").max(100, "Company name too long"),
  website: z.string().url("Invalid website URL").optional(),
  expectedSeats: z.number().int().min(1, "Expected seats must be at least 1").max(10000, "Expected seats too large").optional(),
  partnershipType: z.enum(['reseller', 'affiliate']),
  message: z.string().max(1000, "Message too long").optional(),
});

export type InsertPartnerApplication = z.infer<typeof insertPartnerApplicationSchema>;
export type PartnerApplication = typeof partnerApplications.$inferSelect;

// Onboarding Checklist Types
// COMMENTED OUT: Tables don't exist in production
// export type InsertOnboardingTemplate = z.infer<typeof insertOnboardingTemplateSchema>;
// export type OnboardingTemplate = typeof onboardingTemplates.$inferSelect;

// export type InsertOnboardingTemplateItem = z.infer<typeof insertOnboardingTemplateItemSchema>;
// export type OnboardingTemplateItem = typeof onboardingTemplateItems.$inferSelect;

// COMMENTED OUT: Table doesn't exist in production
// export type InsertOnboardingAssignment = z.infer<typeof insertOnboardingAssignmentSchema>;
// export type OnboardingAssignment = typeof onboardingAssignments.$inferSelect;

// export type InsertOnboardingProgress = z.infer<typeof insertOnboardingProgressSchema>;
// export type OnboardingProgress = typeof onboardingProgress.$inferSelect;

// Widget Configuration Types
export interface WidgetConfig {
  id: string;
  type: string;
  title: string;
  position: { x: number; y: number; w: number; h: number };
  config: Record<string, any>;
  isVisible: boolean;
}

export interface DashboardLayout {
  type: "grid" | "flex";
  columns: number;
  rows: Array<{
    height: string;
    widgets: string[];
  }>;
}

// Calendar Event Types for Microsoft Calendar Integration
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  timeZone?: string;
  location?: string;
  isOnlineMeeting?: boolean;
  meetingUrl?: string;
  attendees?: Array<{
    email: string;
    name?: string;
    type?: string;
  }>;
  organizer?: {
    email: string;
    name?: string;
  };
}

export interface CalendarCreateEvent {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  timeZone?: string;
  location?: string;
  isOnlineMeeting?: boolean;
  attendees?: Array<{
    email: string;
    name?: string;
    type?: string;
  }>;
}
