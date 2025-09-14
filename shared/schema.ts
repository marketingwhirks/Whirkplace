import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Company Values Enum
export const CompanyValues = {
  OWN_IT: "own it",
  CHALLENGE_IT: "challenge it",
  TEAM_FIRST: "team first",
  EMPATHY_FOR_OTHERS: "empathy for others",
  PASSION_FOR_OUR_PURPOSE: "passion for our purpose",
} as const;

export type CompanyValue = typeof CompanyValues[keyof typeof CompanyValues];

export const companyValuesArray = Object.values(CompanyValues);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("member"), // member, admin, manager
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
  leaderId: varchar("leader_id").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const checkins = pgTable("checkins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
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
  content: text("content").notNull(),
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
  values: z.array(z.enum(["own it", "challenge it", "team first", "empathy for others", "passion for our purpose"])).min(1, "At least one company value must be selected"),
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  createdAt: true,
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
