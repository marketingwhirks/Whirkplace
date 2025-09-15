import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
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
});

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
});

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
