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

// Team Type Constants
export const TeamType = {
  TEAM: "team", // Top level - everyone is on a team
  DEPARTMENT: "department", // Optional sub-structure within teams
  POD: "pod", // Optional sub-structure within teams
} as const;

export type TeamTypeValue = typeof TeamType[keyof typeof TeamType];

// Plan Constants
export const Plan = {
  STARTER: "starter",
  PROFESSIONAL: "professional", 
  ENTERPRISE: "enterprise",
} as const;

export type PlanType = typeof Plan[keyof typeof Plan];

// Feature access control based on plans
export const PlanFeatures = {
  [Plan.STARTER]: {
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
} as const;

// Organizations table for multi-tenancy
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // for URL routing: company.whirkplace.com
  customValues: text("custom_values").array().notNull().default(defaultCompanyValuesArray),
  plan: text("plan").notNull().default("starter"), // starter, professional, enterprise
  // Slack Integration - Per Organization OAuth Configuration
  slackClientId: text("slack_client_id"), // Organization's Slack app client ID
  slackClientSecret: text("slack_client_secret"), // Organization's Slack app client secret
  slackWorkspaceId: text("slack_workspace_id"), // Slack workspace ID for validation
  slackChannelId: text("slack_channel_id"), // Default Slack channel for notifications
  slackBotToken: text("slack_bot_token"), // Slack bot token for API calls
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
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"), // member, admin, manager
  organizationId: varchar("organization_id").notNull(),
  teamId: varchar("team_id"),
  managerId: varchar("manager_id"),
  avatar: text("avatar"),
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
  isActive: boolean("is_active").notNull().default(true),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  // Unique username per organization
  usernameOrgIdx: unique("users_username_org_unique").on(table.organizationId, table.username),
  // Unique email per organization  
  emailOrgIdx: unique("users_email_org_unique").on(table.organizationId, table.email),
  // Unique index on Slack user ID for fast lookups
  slackUserIdIdx: unique("users_slack_user_id_unique").on(table.slackUserId),
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
  leaderId: varchar("leader_id").notNull(),
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
  addToOneOnOne: boolean("add_to_one_on_one").notNull().default(false), // Flag for 1-on-1 agenda
  flagForFollowUp: boolean("flag_for_follow_up").notNull().default(false), // Flag for future attention
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

export const questions = pgTable("questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  text: text("text").notNull(),
  organizationId: varchar("organization_id").notNull(),
  createdBy: varchar("created_by").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const wins = pgTable("wins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  userId: varchar("user_id").notNull(),
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
  toUserId: varchar("to_user_id").notNull(), // who received the shoutout
  message: text("message").notNull(),
  organizationId: varchar("organization_id").notNull(),
  values: text("values").array().notNull().default([]), // company values associated
  isPublic: boolean("is_public").notNull().default(false),
  slackMessageId: text("slack_message_id"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  orgUserCreatedAtIdx: index("shoutouts_org_user_created_at_idx").on(table.organizationId, table.fromUserId, table.createdAt),
  orgToUserCreatedAtIdx: index("shoutouts_org_to_user_created_at_idx").on(table.organizationId, table.toUserId, table.createdAt),
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
  lastProcessedAt: timestamp("last_processed_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  orgIdx: index("aggregation_watermarks_org_idx").on(table.organizationId),
  // Unique constraint to ensure one watermark per organization
  orgUnique: unique("aggregation_watermarks_org_unique").on(table.organizationId),
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

export const insertQuestionSchema = createInsertSchema(questions).omit({
  id: true,
  createdAt: true,
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

export const insertVacationSchema = createInsertSchema(vacations).omit({
  id: true,
  createdAt: true,
  organizationId: true, // Set by middleware, not user-settable
}).extend({
  weekOf: z.coerce.date(),
  note: z.string().max(500, "Vacation note too long").optional(),
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
  addToOneOnOne: z.boolean().optional(),
  flagForFollowUp: z.boolean().optional(),
  // reviewedBy and reviewedAt are set automatically server-side
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

// Team hierarchy type for UI display
export interface TeamHierarchy extends Team {
  children: TeamHierarchy[];
  memberCount: number;
}

export type InsertCheckin = z.infer<typeof insertCheckinSchema>;
export type Checkin = typeof checkins.$inferSelect;

export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questions.$inferSelect;

export type InsertWin = z.infer<typeof insertWinSchema>;
export type Win = typeof wins.$inferSelect;

export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;

export type InsertShoutout = z.infer<typeof insertShoutoutSchema>;
export type Shoutout = typeof shoutouts.$inferSelect;

export type InsertVacation = z.infer<typeof insertVacationSchema>;
export type Vacation = typeof vacations.$inferSelect;

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
  status: text("status").notNull().default("scheduled"), // scheduled, completed, cancelled, rescheduled
  agenda: text("agenda"),
  notes: text("notes"),
  actionItems: jsonb("action_items").notNull().default([]), // Array of action items
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
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  orgCategoryIdx: index("kra_templates_org_category_idx").on(table.organizationId, table.category),
  activeIdx: index("kra_templates_active_idx").on(table.isActive),
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
  assignedBy: varchar("assigned_by").notNull(), // Manager who assigned it
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  status: text("status").notNull().default("active"), // active, completed, paused, cancelled
  progress: integer("progress").notNull().default(0), // 0-100 percentage
  lastUpdated: timestamp("last_updated").notNull().default(sql`now()`),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
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
  meetingId: varchar("meeting_id").notNull(), // Reference to one_on_ones
  description: text("description").notNull(),
  assignedTo: varchar("assigned_to").notNull(), // User ID
  dueDate: timestamp("due_date"),
  status: text("status").notNull().default("pending"), // pending, completed, overdue, cancelled
  notes: text("notes"), // Follow-up notes
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  meetingIdx: index("action_items_meeting_idx").on(table.meetingId),
  assignedIdx: index("action_items_assigned_idx").on(table.organizationId, table.assignedTo),
  statusIdx: index("action_items_status_idx").on(table.status),
  dueDateIdx: index("action_items_due_date_idx").on(table.dueDate),
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
  name: text("name").notNull(), // "Starter", "Professional", "Enterprise"
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
export const insertActionItemSchema = createInsertSchema(actionItems).omit({ id: true, createdAt: true, completedAt: true });
export type InsertActionItem = z.infer<typeof insertActionItemSchema>;
export type ActionItem = typeof actionItems.$inferSelect;

export const insertBugReportSchema = createInsertSchema(bugReports).omit({ id: true, createdAt: true, resolvedAt: true });
export type InsertBugReport = z.infer<typeof insertBugReportSchema>;
export type BugReport = typeof bugReports.$inferSelect;

// Super Admin Tables for System-wide Management

// System Settings - Global configuration for signup screens, features, etc.
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // e.g., "signup_enabled", "maintenance_mode", "welcome_message"
  value: jsonb("value").notNull(), // Flexible JSON value for any setting type
  description: text("description"), // Human-readable description of the setting
  category: text("category").notNull().default("general"), // general, signup, pricing, features
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  // Index for efficient category-based queries
  categoryIdx: index("system_settings_category_idx").on(table.category),
}));

// Pricing Plans - System-wide plan management with Stripe integration
export const pricingPlans = pgTable("pricing_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // e.g., "Starter", "Professional", "Enterprise"
  description: text("description"),
  price: integer("price").notNull(), // Price in cents
  currency: text("currency").notNull().default("usd"),
  billingPeriod: text("billing_period").notNull(), // monthly, yearly, one_time
  stripePriceId: text("stripe_price_id"), // Stripe price ID for integration
  features: jsonb("features").notNull().default([]), // Array of feature descriptions
  isActive: boolean("is_active").notNull().default(true),
  isPopular: boolean("is_popular").notNull().default(false), // Highlight as recommended
  sortOrder: integer("sort_order").notNull().default(0), // Display order
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  // Index for active plans ordering
  activeSortIdx: index("pricing_plans_active_sort_idx").on(table.isActive, table.sortOrder),
}));

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

// Super Admin Zod schemas
export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;

export const insertPricingPlanSchema = createInsertSchema(pricingPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPricingPlan = z.infer<typeof insertPricingPlanSchema>;
export type PricingPlan = typeof pricingPlans.$inferSelect;

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
