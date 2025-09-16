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
  APPROVED: "approved", 
  REJECTED: "rejected",
} as const;

export type ReviewStatusType = typeof ReviewStatus[keyof typeof ReviewStatus];

// Auth Provider Constants
export const AuthProvider = {
  LOCAL: "local",
  SLACK: "slack",
} as const;

export type AuthProviderType = typeof AuthProvider[keyof typeof AuthProvider];

// Organizations table for multi-tenancy
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // for URL routing: company.whirkplace.com
  customValues: text("custom_values").array().notNull().default(defaultCompanyValuesArray),
  plan: text("plan").notNull().default("starter"), // starter, professional, enterprise
  slackWorkspaceId: text("slack_workspace_id"), // Slack workspace ID for validation
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
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
  authProvider: text("auth_provider").notNull().default("local"), // local, slack
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
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
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const checkins = pgTable("checkins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  weekOf: timestamp("week_of").notNull(),
  overallMood: integer("overall_mood").notNull(), // 1-5 rating
  responses: jsonb("responses").notNull().default({}), // question_id -> response
  isComplete: boolean("is_complete").notNull().default(false),
  submittedAt: timestamp("submitted_at"),
  dueDate: timestamp("due_date").notNull(), // When check-in is due (Monday 9am Central for that week)
  submittedOnTime: boolean("submitted_on_time").notNull().default(false), // If submitted by due date
  reviewStatus: text("review_status").notNull().default("pending"), // pending, approved, rejected
  reviewedBy: varchar("reviewed_by"), // ID of reviewing team leader (nullable)
  reviewedAt: timestamp("reviewed_at"), // When review was completed (nullable)
  reviewDueDate: timestamp("review_due_date").notNull(), // When review is due (Monday 9am Central)
  reviewedOnTime: boolean("reviewed_on_time").notNull().default(false), // If review completed on time
  reviewComments: text("review_comments"), // Optional feedback (nullable)
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
  isPublic: boolean("is_public").notNull().default(true),
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
  isPublic: boolean("is_public").notNull().default(true),
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
  authProvider: z.enum([AuthProvider.LOCAL, AuthProvider.SLACK]).default(AuthProvider.LOCAL),
});

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdAt: true,
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
  reviewStatus: z.enum([ReviewStatus.PENDING, ReviewStatus.APPROVED, ReviewStatus.REJECTED]),
  reviewComments: z.string().max(1000, "Review comments too long").optional(),
  // reviewedBy and reviewedAt are set automatically server-side
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

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
