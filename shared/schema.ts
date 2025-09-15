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

// Organizations table for multi-tenancy
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // for URL routing: company.whirkplace.com
  customValues: text("custom_values").array().notNull().default(defaultCompanyValuesArray),
  plan: text("plan").notNull().default("starter"), // starter, professional, enterprise
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
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

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
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  orgWeekOfIdx: index("checkins_org_week_of_idx").on(table.organizationId, table.weekOf),
  orgUserWeekOfIdx: index("checkins_org_user_week_of_idx").on(table.organizationId, table.userId, table.weekOf),
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

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdAt: true,
});

export const insertCheckinSchema = createInsertSchema(checkins).omit({
  id: true,
  createdAt: true,
  submittedAt: true,
}).extend({
  weekOf: z.coerce.date(),
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

// Separate schema for updates - only allow certain fields to be modified
export const updateShoutoutSchema = z.object({
  message: z.string().min(1, "Message is required").max(500, "Message too long").optional(),
  isPublic: z.boolean().optional(),
  values: z.array(z.string()).min(1, "At least one company value must be selected").optional(),
  // fromUserId and toUserId are NEVER updatable for security
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

export type InsertPulseMetricsDaily = z.infer<typeof insertPulseMetricsDailySchema>;
export type PulseMetricsDaily = typeof pulseMetricsDaily.$inferSelect;

export type InsertShoutoutMetricsDaily = z.infer<typeof insertShoutoutMetricsDailySchema>;
export type ShoutoutMetricsDaily = typeof shoutoutMetricsDaily.$inferSelect;

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
