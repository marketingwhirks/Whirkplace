import { 
  type User, type InsertUser,
  type Team, type InsertTeam,
  type Checkin, type InsertCheckin,
  type Question, type InsertQuestion,
  type Win, type InsertWin,
  type Comment, type InsertComment,
  type Shoutout, type InsertShoutout,
  type Vacation, type InsertVacation,
  type ReviewCheckin, type ReviewStatusType,
  type PulseMetricsOptions, type PulseMetricsResult,
  type ShoutoutMetricsOptions, type ShoutoutMetricsResult,
  type LeaderboardOptions, type LeaderboardEntry,
  type AnalyticsOverview, type AnalyticsPeriod,
  type ComplianceMetricsOptions, type ComplianceMetricsResult,
  users, teams, checkins, questions, wins, comments, shoutouts, vacations,
  pulseMetricsDaily, shoutoutMetricsDaily, complianceMetricsDaily, aggregationWatermarks,
  ReviewStatus
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, desc, and, gte, or, sql, sum, count, avg, lt, lte, inArray } from "drizzle-orm";
import { AggregationService } from "./services/aggregation";
import { getCheckinDueDate, getReviewDueDate, isSubmittedOnTime, isReviewedOnTime, getWeekStartCentral } from "@shared/utils/dueDates";

// Simple in-memory cache with TTL for analytics queries
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class AnalyticsCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    const ttl = ttlMs || this.defaultTTL;
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl
    });
  }

  clear(): void {
    this.cache.clear();
  }

  // Invalidate cache entries by pattern matching
  invalidateByPattern(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  // Invalidate analytics cache for a specific organization
  invalidateForOrganization(organizationId: string): void {
    this.invalidateByPattern(`:${organizationId}:`);
  }

  // Cleanup expired entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

export interface IStorage {
  // Users
  getUser(organizationId: string, id: string): Promise<User | undefined>;
  getUserByUsername(organizationId: string, username: string): Promise<User | undefined>;
  getUserByEmail(organizationId: string, email: string): Promise<User | undefined>;
  createUser(organizationId: string, user: InsertUser): Promise<User>;
  updateUser(organizationId: string, id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  getUsersByTeam(organizationId: string, teamId: string): Promise<User[]>;
  getUsersByManager(organizationId: string, managerId: string): Promise<User[]>;
  getUsersByTeamLeadership(organizationId: string, leaderId: string): Promise<User[]>;
  getAllUsers(organizationId: string): Promise<User[]>;

  // Teams
  getTeam(organizationId: string, id: string): Promise<Team | undefined>;
  createTeam(organizationId: string, team: InsertTeam): Promise<Team>;
  updateTeam(organizationId: string, id: string, team: Partial<InsertTeam>): Promise<Team | undefined>;
  getAllTeams(organizationId: string): Promise<Team[]>;

  // Check-ins
  getCheckin(organizationId: string, id: string): Promise<Checkin | undefined>;
  createCheckin(organizationId: string, checkin: InsertCheckin): Promise<Checkin>;
  updateCheckin(organizationId: string, id: string, checkin: Partial<InsertCheckin>): Promise<Checkin | undefined>;
  getCheckinsByUser(organizationId: string, userId: string): Promise<Checkin[]>;
  getCheckinsByManager(organizationId: string, managerId: string): Promise<Checkin[]>;
  getCurrentWeekCheckin(organizationId: string, userId: string): Promise<Checkin | undefined>;
  getRecentCheckins(organizationId: string, limit?: number): Promise<Checkin[]>;

  // Questions
  getQuestion(organizationId: string, id: string): Promise<Question | undefined>;
  createQuestion(organizationId: string, question: InsertQuestion): Promise<Question>;
  updateQuestion(organizationId: string, id: string, question: Partial<InsertQuestion>): Promise<Question | undefined>;
  deleteQuestion(organizationId: string, id: string): Promise<boolean>;
  getActiveQuestions(organizationId: string): Promise<Question[]>;

  // Wins
  getWin(organizationId: string, id: string): Promise<Win | undefined>;
  createWin(organizationId: string, win: InsertWin): Promise<Win>;
  updateWin(organizationId: string, id: string, win: Partial<InsertWin>): Promise<Win | undefined>;
  deleteWin(organizationId: string, id: string): Promise<boolean>;
  getRecentWins(organizationId: string, limit?: number): Promise<Win[]>;
  getPublicWins(organizationId: string, limit?: number): Promise<Win[]>;

  // Comments
  getComment(organizationId: string, id: string): Promise<Comment | undefined>;
  createComment(organizationId: string, comment: InsertComment): Promise<Comment>;
  updateComment(organizationId: string, id: string, comment: Partial<InsertComment>): Promise<Comment | undefined>;
  deleteComment(organizationId: string, id: string): Promise<boolean>;
  getCommentsByCheckin(organizationId: string, checkinId: string): Promise<Comment[]>;

  // Shoutouts
  getShoutout(organizationId: string, id: string): Promise<Shoutout | undefined>;
  createShoutout(organizationId: string, shoutout: InsertShoutout & { fromUserId: string }): Promise<Shoutout>;
  updateShoutout(organizationId: string, id: string, shoutout: Partial<InsertShoutout>): Promise<Shoutout | undefined>;
  deleteShoutout(organizationId: string, id: string): Promise<boolean>;
  getShoutoutsByUser(organizationId: string, userId: string, type?: 'received' | 'given'): Promise<Shoutout[]>;
  getRecentShoutouts(organizationId: string, limit?: number): Promise<Shoutout[]>;
  getPublicShoutouts(organizationId: string, limit?: number): Promise<Shoutout[]>;

  // Check-in Review Methods
  getPendingCheckins(organizationId: string, managerId?: string): Promise<Checkin[]>;
  reviewCheckin(organizationId: string, checkinId: string, reviewedBy: string, reviewData: ReviewCheckin): Promise<Checkin | undefined>;
  getCheckinsByReviewStatus(organizationId: string, status: ReviewStatusType): Promise<Checkin[]>;
  getCheckinsByTeamLeader(organizationId: string, leaderId: string): Promise<Checkin[]>;

  // Analytics
  getPulseMetrics(organizationId: string, options: PulseMetricsOptions): Promise<PulseMetricsResult[]>;
  getShoutoutMetrics(organizationId: string, options: ShoutoutMetricsOptions): Promise<ShoutoutMetricsResult[]>;
  getLeaderboard(organizationId: string, options: LeaderboardOptions): Promise<LeaderboardEntry[]>;
  getAnalyticsOverview(organizationId: string, period: AnalyticsPeriod, from: Date, to: Date): Promise<AnalyticsOverview>;

  // Compliance Metrics
  getCheckinComplianceMetrics(organizationId: string, options?: ComplianceMetricsOptions): Promise<ComplianceMetricsResult[]>;
  getReviewComplianceMetrics(organizationId: string, options?: ComplianceMetricsOptions): Promise<ComplianceMetricsResult[]>;

  // Vacations
  getUserVacationsByRange(organizationId: string, userId: string, from?: Date, to?: Date): Promise<Vacation[]>;
  upsertVacationWeek(organizationId: string, userId: string, weekOf: Date, note?: string): Promise<Vacation>;
  deleteVacationWeek(organizationId: string, userId: string, weekOf: Date): Promise<boolean>;
  isUserOnVacation(organizationId: string, userId: string, weekOf: Date): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  private analyticsCache = new AnalyticsCache();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Database will be initialized when tables are created via db:push
    
    // Cleanup cache every 10 minutes
    this.cleanupInterval = setInterval(() => {
      this.analyticsCache.cleanup();
    }, 10 * 60 * 1000);
  }

  // Users
  async getUser(organizationId: string, id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(
      and(eq(users.id, id), eq(users.organizationId, organizationId))
    );
    return user || undefined;
  }

  async getUserByUsername(organizationId: string, username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(
      and(eq(users.username, username), eq(users.organizationId, organizationId))
    );
    return user || undefined;
  }

  async getUserByEmail(organizationId: string, email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(
      and(eq(users.email, email), eq(users.organizationId, organizationId))
    );
    return user || undefined;
  }

  async createUser(organizationId: string, insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        organizationId,
        isActive: insertUser.isActive ?? true,
        role: insertUser.role ?? "member",
        teamId: insertUser.teamId ?? null,
        managerId: insertUser.managerId ?? null,
        avatar: insertUser.avatar ?? null,
      })
      .returning();
    return user;
  }

  async updateUser(organizationId: string, id: string, userUpdate: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(userUpdate)
      .where(and(eq(users.id, id), eq(users.organizationId, organizationId)))
      .returning();
    return user || undefined;
  }

  async getUsersByTeam(organizationId: string, teamId: string): Promise<User[]> {
    return await db.select().from(users).where(
      and(eq(users.teamId, teamId), eq(users.organizationId, organizationId))
    );
  }

  async getUsersByManager(organizationId: string, managerId: string): Promise<User[]> {
    return await db.select().from(users).where(
      and(eq(users.managerId, managerId), eq(users.organizationId, organizationId))
    );
  }

  async getUsersByTeamLeadership(organizationId: string, leaderId: string): Promise<User[]> {
    // Find teams where the user is the leader
    const leaderTeams = await db.select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.leaderId, leaderId), eq(teams.organizationId, organizationId)));
    
    if (leaderTeams.length === 0) {
      return [];
    }

    // Get all users from those teams
    const teamIds = leaderTeams.map(team => team.id);
    return await db.select().from(users).where(
      and(
        inArray(users.teamId, teamIds),
        eq(users.organizationId, organizationId)
      )
    );
  }

  async getAllUsers(organizationId: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.organizationId, organizationId));
  }

  // Teams
  async getTeam(organizationId: string, id: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(
      and(eq(teams.id, id), eq(teams.organizationId, organizationId))
    );
    return team || undefined;
  }

  async createTeam(organizationId: string, insertTeam: InsertTeam): Promise<Team> {
    const [team] = await db
      .insert(teams)
      .values({
        ...insertTeam,
        organizationId,
        description: insertTeam.description ?? null,
      })
      .returning();
    return team;
  }

  async updateTeam(organizationId: string, id: string, teamUpdate: Partial<InsertTeam>): Promise<Team | undefined> {
    const [team] = await db
      .update(teams)
      .set(teamUpdate)
      .where(and(eq(teams.id, id), eq(teams.organizationId, organizationId)))
      .returning();
    return team || undefined;
  }

  async getAllTeams(organizationId: string): Promise<Team[]> {
    return await db.select().from(teams).where(eq(teams.organizationId, organizationId));
  }

  // Check-ins
  async getCheckin(organizationId: string, id: string): Promise<Checkin | undefined> {
    const [checkin] = await db.select().from(checkins).where(
      and(eq(checkins.id, id), eq(checkins.organizationId, organizationId))
    );
    return checkin || undefined;
  }

  async createCheckin(organizationId: string, insertCheckin: InsertCheckin): Promise<Checkin> {
    const isCompleting = insertCheckin.isComplete ?? false;
    const now = new Date();
    
    // Calculate due dates using utility functions
    const dueDate = insertCheckin.dueDate ?? getCheckinDueDate(insertCheckin.weekOf);
    const reviewDueDate = insertCheckin.reviewDueDate ?? getReviewDueDate(insertCheckin.weekOf);
    
    // Calculate if submitted on time (only if being submitted now)
    const submittedAt = isCompleting ? now : null;
    const submittedOnTime = submittedAt ? isSubmittedOnTime(submittedAt, dueDate) : false;
    
    const [checkin] = await db
      .insert(checkins)
      .values({
        ...insertCheckin,
        organizationId,
        responses: insertCheckin.responses ?? {},
        isComplete: isCompleting,
        submittedAt,
        dueDate,
        submittedOnTime,
        reviewDueDate,
        reviewStatus: ReviewStatus.PENDING,
        reviewedBy: null,
        reviewedAt: null,
        reviewedOnTime: false,
        reviewComments: null,
      })
      .returning();
    
    // Invalidate analytics cache for this organization to prevent serving stale data
    this.analyticsCache.invalidateForOrganization(organizationId);
    
    // Trigger immediate aggregate recomputation for real-time freshness (fire-and-forget)
    const bucketDate = new Date(checkin.createdAt);
    AggregationService.getInstance().recomputeUserDayAggregates(
      organizationId, 
      checkin.userId, 
      bucketDate
    ).catch(error => {
      console.error(`Failed to recompute aggregates after checkin creation:`, error);
    });
    
    return checkin;
  }

  async updateCheckin(organizationId: string, id: string, checkinUpdate: Partial<InsertCheckin>): Promise<Checkin | undefined> {
    // First get the existing checkin to determine if it's being completed now
    const existing = await this.getCheckin(organizationId, id);
    if (!existing) return undefined;

    const isBeingCompleted = checkinUpdate.isComplete && !existing.isComplete;
    const now = new Date();
    
    // Prepare the update with calculated fields
    const updateData: any = { ...checkinUpdate };
    
    // If checkin is being completed now, set submission timestamp and calculate on-time status
    if (isBeingCompleted) {
      updateData.submittedAt = now;
      updateData.submittedOnTime = isSubmittedOnTime(now, existing.dueDate);
    }
    
    // If due dates are being updated, recalculate them using utility functions  
    if (checkinUpdate.weekOf) {
      if (!checkinUpdate.dueDate) {
        updateData.dueDate = getCheckinDueDate(checkinUpdate.weekOf);
      }
      if (!checkinUpdate.reviewDueDate) {
        updateData.reviewDueDate = getReviewDueDate(checkinUpdate.weekOf);
      }
      
      // Recalculate submittedOnTime if checkin was already submitted
      if (existing.submittedAt) {
        updateData.submittedOnTime = isSubmittedOnTime(existing.submittedAt, updateData.dueDate);
      }
    }
    
    const [checkin] = await db
      .update(checkins)
      .set(updateData)
      .where(and(eq(checkins.id, id), eq(checkins.organizationId, organizationId)))
      .returning();
    return checkin || undefined;
  }

  async getCheckinsByUser(organizationId: string, userId: string): Promise<Checkin[]> {
    return await db
      .select()
      .from(checkins)
      .where(and(
        eq(checkins.userId, userId),
        eq(checkins.organizationId, organizationId)
      ))
      .orderBy(desc(checkins.createdAt));
  }

  async getCheckinsByManager(organizationId: string, managerId: string): Promise<Checkin[]> {
    const reports = await this.getUsersByManager(organizationId, managerId);
    const reportIds = reports.map(user => user.id);
    
    if (reportIds.length === 0) return [];
    
    return await db
      .select()
      .from(checkins)
      .where(and(
        inArray(checkins.userId, reportIds),
        eq(checkins.organizationId, organizationId)
      ))
      .orderBy(desc(checkins.createdAt));
  }

  async getCurrentWeekCheckin(organizationId: string, userId: string): Promise<Checkin | undefined> {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);
    
    const [checkin] = await db
      .select()
      .from(checkins)
      .where(and(
        eq(checkins.userId, userId),
        eq(checkins.organizationId, organizationId),
        gte(checkins.weekOf, startOfWeek)
      ))
      .limit(1);
    
    return checkin || undefined;
  }

  async getRecentCheckins(organizationId: string, limit = 10): Promise<Checkin[]> {
    return await db
      .select()
      .from(checkins)
      .where(and(
        eq(checkins.isComplete, true),
        eq(checkins.organizationId, organizationId)
      ))
      .orderBy(desc(checkins.createdAt))
      .limit(limit);
  }

  // Check-in Review Methods
  async getPendingCheckins(organizationId: string, managerId?: string): Promise<Checkin[]> {
    let whereConditions = [
      eq(checkins.organizationId, organizationId),
      eq(checkins.reviewStatus, ReviewStatus.PENDING),
      eq(checkins.isComplete, true)
    ];

    if (managerId) {
      // Get pending check-ins for manager's team members
      const reports = await this.getUsersByManager(organizationId, managerId);
      const reportIds = reports.map(user => user.id);
      
      if (reportIds.length === 0) return [];
      
      whereConditions.push(inArray(checkins.userId, reportIds));
    }

    return await db
      .select()
      .from(checkins)
      .where(and(...whereConditions))
      .orderBy(desc(checkins.createdAt));
  }

  async reviewCheckin(organizationId: string, checkinId: string, reviewedBy: string, reviewData: ReviewCheckin): Promise<Checkin | undefined> {
    // First get the existing checkin to access the reviewDueDate
    const existing = await this.getCheckin(organizationId, checkinId);
    if (!existing) return undefined;

    const reviewedAt = new Date();
    const reviewedOnTime = isReviewedOnTime(reviewedAt, existing.reviewDueDate);
    
    const [checkin] = await db
      .update(checkins)
      .set({
        reviewStatus: reviewData.reviewStatus,
        reviewedBy,
        reviewedAt,
        reviewedOnTime,
        reviewComments: reviewData.reviewComments || null,
      })
      .where(and(
        eq(checkins.id, checkinId),
        eq(checkins.organizationId, organizationId)
      ))
      .returning();
    
    return checkin || undefined;
  }

  async getCheckinsByReviewStatus(organizationId: string, status: ReviewStatusType): Promise<Checkin[]> {
    return await db
      .select()
      .from(checkins)
      .where(and(
        eq(checkins.organizationId, organizationId),
        eq(checkins.reviewStatus, status)
      ))
      .orderBy(desc(checkins.createdAt));
  }

  async getCheckinsByTeamLeader(organizationId: string, leaderId: string): Promise<Checkin[]> {
    return await db
      .select()
      .from(checkins)
      .where(and(
        eq(checkins.organizationId, organizationId),
        eq(checkins.reviewedBy, leaderId)
      ))
      .orderBy(desc(checkins.reviewedAt));
  }

  // Questions
  async getQuestion(organizationId: string, id: string): Promise<Question | undefined> {
    const [question] = await db.select().from(questions).where(
      and(eq(questions.id, id), eq(questions.organizationId, organizationId))
    );
    return question || undefined;
  }

  async createQuestion(organizationId: string, insertQuestion: InsertQuestion): Promise<Question> {
    const [question] = await db
      .insert(questions)
      .values({
        ...insertQuestion,
        organizationId,
        isActive: insertQuestion.isActive ?? true,
        order: insertQuestion.order ?? 0,
      })
      .returning();
    return question;
  }

  async updateQuestion(organizationId: string, id: string, questionUpdate: Partial<InsertQuestion>): Promise<Question | undefined> {
    const [question] = await db
      .update(questions)
      .set(questionUpdate)
      .where(and(eq(questions.id, id), eq(questions.organizationId, organizationId)))
      .returning();
    return question || undefined;
  }

  async deleteQuestion(organizationId: string, id: string): Promise<boolean> {
    const result = await db.delete(questions).where(
      and(eq(questions.id, id), eq(questions.organizationId, organizationId))
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getActiveQuestions(organizationId: string): Promise<Question[]> {
    return await db
      .select()
      .from(questions)
      .where(and(
        eq(questions.isActive, true),
        eq(questions.organizationId, organizationId)
      ))
      .orderBy(questions.order);
  }

  // Wins
  async getWin(organizationId: string, id: string): Promise<Win | undefined> {
    const [win] = await db.select().from(wins).where(
      and(eq(wins.id, id), eq(wins.organizationId, organizationId))
    );
    return win || undefined;
  }

  async createWin(organizationId: string, insertWin: InsertWin): Promise<Win> {
    const [win] = await db
      .insert(wins)
      .values({
        ...insertWin,
        organizationId,
        nominatedBy: insertWin.nominatedBy ?? null,
        isPublic: insertWin.isPublic ?? true,
        slackMessageId: insertWin.slackMessageId ?? null,
      })
      .returning();
    return win;
  }

  async updateWin(organizationId: string, id: string, winUpdate: Partial<InsertWin>): Promise<Win | undefined> {
    const [win] = await db
      .update(wins)
      .set(winUpdate)
      .where(and(eq(wins.id, id), eq(wins.organizationId, organizationId)))
      .returning();
    return win || undefined;
  }

  async deleteWin(organizationId: string, id: string): Promise<boolean> {
    const result = await db.delete(wins).where(
      and(eq(wins.id, id), eq(wins.organizationId, organizationId))
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getRecentWins(organizationId: string, limit = 10): Promise<Win[]> {
    return await db
      .select()
      .from(wins)
      .where(eq(wins.organizationId, organizationId))
      .orderBy(desc(wins.createdAt))
      .limit(limit);
  }

  async getPublicWins(organizationId: string, limit = 10): Promise<Win[]> {
    return await db
      .select()
      .from(wins)
      .where(and(
        eq(wins.isPublic, true),
        eq(wins.organizationId, organizationId)
      ))
      .orderBy(desc(wins.createdAt))
      .limit(limit);
  }

  // Comments
  async getComment(organizationId: string, id: string): Promise<Comment | undefined> {
    const [comment] = await db.select().from(comments).where(
      and(eq(comments.id, id), eq(comments.organizationId, organizationId))
    );
    return comment || undefined;
  }

  async createComment(organizationId: string, insertComment: InsertComment): Promise<Comment> {
    const [comment] = await db
      .insert(comments)
      .values({
        ...insertComment,
        organizationId,
      })
      .returning();
    return comment;
  }

  async updateComment(organizationId: string, id: string, commentUpdate: Partial<InsertComment>): Promise<Comment | undefined> {
    const [comment] = await db
      .update(comments)
      .set(commentUpdate)
      .where(and(eq(comments.id, id), eq(comments.organizationId, organizationId)))
      .returning();
    return comment || undefined;
  }

  async deleteComment(organizationId: string, id: string): Promise<boolean> {
    const result = await db.delete(comments).where(
      and(eq(comments.id, id), eq(comments.organizationId, organizationId))
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getCommentsByCheckin(organizationId: string, checkinId: string): Promise<Comment[]> {
    return await db
      .select()
      .from(comments)
      .where(and(
        eq(comments.checkinId, checkinId),
        eq(comments.organizationId, organizationId)
      ))
      .orderBy(desc(comments.createdAt));
  }

  // Shoutouts
  async getShoutout(organizationId: string, id: string): Promise<Shoutout | undefined> {
    const [shoutoutRecord] = await db.select().from(shoutouts).where(
      and(eq(shoutouts.id, id), eq(shoutouts.organizationId, organizationId))
    );
    return shoutoutRecord || undefined;
  }

  async createShoutout(organizationId: string, insertShoutout: InsertShoutout & { fromUserId: string }): Promise<Shoutout> {
    const [shoutoutRecord] = await db
      .insert(shoutouts)
      .values({
        ...insertShoutout,
        organizationId,
        isPublic: insertShoutout.isPublic ?? true,
        slackMessageId: insertShoutout.slackMessageId ?? null,
      })
      .returning();
    
    // Invalidate analytics cache for this organization to prevent serving stale data
    this.analyticsCache.invalidateForOrganization(organizationId);
    
    // Trigger immediate aggregate recomputation for both sender and receiver (fire-and-forget)
    const bucketDate = new Date(shoutoutRecord.createdAt);
    const aggregationService = AggregationService.getInstance();
    
    // Recompute for receiver
    aggregationService.recomputeUserDayAggregates(
      organizationId, 
      shoutoutRecord.toUserId, 
      bucketDate
    ).catch(error => {
      console.error(`Failed to recompute aggregates after shoutout creation for receiver:`, error);
    });
    
    // Recompute for sender
    aggregationService.recomputeUserDayAggregates(
      organizationId, 
      shoutoutRecord.fromUserId, 
      bucketDate
    ).catch(error => {
      console.error(`Failed to recompute aggregates after shoutout creation for sender:`, error);
    });
    
    return shoutoutRecord;
  }

  async updateShoutout(organizationId: string, id: string, shoutoutUpdate: Partial<InsertShoutout>): Promise<Shoutout | undefined> {
    const [shoutoutRecord] = await db
      .update(shoutouts)
      .set(shoutoutUpdate)
      .where(and(eq(shoutouts.id, id), eq(shoutouts.organizationId, organizationId)))
      .returning();
    return shoutoutRecord || undefined;
  }

  async deleteShoutout(organizationId: string, id: string): Promise<boolean> {
    const result = await db.delete(shoutouts).where(
      and(eq(shoutouts.id, id), eq(shoutouts.organizationId, organizationId))
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getShoutoutsByUser(organizationId: string, userId: string, type?: 'received' | 'given'): Promise<Shoutout[]> {
    let whereCondition;
    
    if (type === 'received') {
      whereCondition = and(
        eq(shoutouts.toUserId, userId),
        eq(shoutouts.organizationId, organizationId)
      );
    } else if (type === 'given') {
      whereCondition = and(
        eq(shoutouts.fromUserId, userId),
        eq(shoutouts.organizationId, organizationId)
      );
    } else {
      // Return both received and given - user must be either giver OR receiver
      whereCondition = and(
        or(
          eq(shoutouts.fromUserId, userId),
          eq(shoutouts.toUserId, userId)
        ),
        eq(shoutouts.organizationId, organizationId)
      );
    }

    return await db
      .select()
      .from(shoutouts)
      .where(whereCondition)
      .orderBy(desc(shoutouts.createdAt));
  }

  async getRecentShoutouts(organizationId: string, limit = 20): Promise<Shoutout[]> {
    return await db
      .select()
      .from(shoutouts)
      .where(eq(shoutouts.organizationId, organizationId))
      .orderBy(desc(shoutouts.createdAt))
      .limit(limit);
  }

  async getPublicShoutouts(organizationId: string, limit = 20): Promise<Shoutout[]> {
    return await db
      .select()
      .from(shoutouts)
      .where(and(
        eq(shoutouts.isPublic, true),
        eq(shoutouts.organizationId, organizationId)
      ))
      .orderBy(desc(shoutouts.createdAt))
      .limit(limit);
  }

  // Helper methods for aggregation strategy
  private shouldUseAggregates(from?: Date, to?: Date, period?: string): boolean {
    // Check feature flag first
    const useAggregates = process.env.USE_AGGREGATES === 'true';
    if (!useAggregates) return false;

    // Use aggregates for weekly, monthly, quarterly, yearly periods
    if (period && ['week', 'month', 'quarter', 'year'].includes(period)) {
      return true;
    }

    // Use aggregates only when the ENTIRE query window [from,to] is >7 days old
    // This prevents missing recent raw data in mixed windows
    if (from && to) {
      const now = Date.now();
      const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
      
      // Both from AND to must be older than 7 days for safe aggregate use
      return from.getTime() < sevenDaysAgo && to.getTime() < sevenDaysAgo;
    }

    return false;
  }

  private generateCacheKey(method: string, organizationId: string, options: any): string {
    const optionsStr = JSON.stringify(options, Object.keys(options).sort());
    return `${method}:${organizationId}:${optionsStr}`;
  }

  private async logShadowRead<T>(method: string, organizationId: string, options: any, aggregateResult: T, rawResult: T): Promise<void> {
    try {
      const comparison = {
        method,
        organizationId,
        options,
        aggregateLength: Array.isArray(aggregateResult) ? aggregateResult.length : 1,
        rawLength: Array.isArray(rawResult) ? rawResult.length : 1,
        timestamp: new Date().toISOString()
      };
      console.log('Shadow read comparison:', JSON.stringify(comparison));
    } catch (error) {
      console.error('Error logging shadow read:', error);
    }
  }

  // Analytics methods
  private getDateTruncExpression(period: string, column: any) {
    switch (period) {
      case 'day': return sql`date_trunc('day', ${column})`;
      case 'week': return sql`date_trunc('week', ${column})`;
      case 'month': return sql`date_trunc('month', ${column})`;
      case 'quarter': return sql`date_trunc('quarter', ${column})`;
      case 'year': return sql`date_trunc('year', ${column})`;
      default: return sql`date_trunc('day', ${column})`;
    }
  }

  private buildScopeCondition(organizationId: string, scope: string, entityId?: string, table?: any) {
    let baseCondition = eq(table.organizationId, organizationId);
    
    if (scope === 'team' && entityId) {
      return and(baseCondition, eq(table.teamId, entityId));
    } else if (scope === 'user' && entityId) {
      return and(baseCondition, eq(table.userId, entityId));
    }
    
    return baseCondition;
  }

  async getPulseMetrics(organizationId: string, options: PulseMetricsOptions): Promise<PulseMetricsResult[]> {
    const { scope, entityId, period, from, to } = options;
    
    // Check cache first
    const cacheKey = this.generateCacheKey('getPulseMetrics', organizationId, options);
    const cachedResult = this.analyticsCache.get<PulseMetricsResult[]>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    let results: PulseMetricsResult[];

    // Determine if we should use aggregates
    if (this.shouldUseAggregates(from, to, period)) {
      results = await this.getPulseMetricsFromAggregates(organizationId, options);
      
      // Shadow read for comparison if enabled
      if (process.env.ENABLE_SHADOW_READS === 'true') {
        const rawResults = await this.getPulseMetricsFromRaw(organizationId, options);
        await this.logShadowRead('getPulseMetrics', organizationId, options, results, rawResults);
      }
    } else {
      results = await this.getPulseMetricsFromRaw(organizationId, options);
    }

    // Cache results with longer TTL for older data
    const isOldData = from && (Date.now() - from.getTime()) > (7 * 24 * 60 * 60 * 1000);
    const ttl = isOldData ? 30 * 60 * 1000 : 5 * 60 * 1000; // 30min for old data, 5min for recent
    this.analyticsCache.set(cacheKey, results, ttl);

    return results;
  }

  private async getPulseMetricsFromAggregates(organizationId: string, options: PulseMetricsOptions): Promise<PulseMetricsResult[]> {
    const { scope, entityId, period, from, to } = options;
    
    let baseQuery = db
      .select({
        periodStart: this.getDateTruncExpression(period, sql`${pulseMetricsDaily.bucketDate}::timestamp`),
        avgMood: sql<number>`CASE WHEN SUM(${pulseMetricsDaily.checkinCount}) > 0 THEN SUM(${pulseMetricsDaily.moodSum})::float / SUM(${pulseMetricsDaily.checkinCount}) ELSE 0 END`,
        checkinCount: sum(pulseMetricsDaily.checkinCount)
      })
      .from(pulseMetricsDaily);

    let whereConditions = [eq(pulseMetricsDaily.organizationId, organizationId)];

    if (scope === 'team' && entityId) {
      whereConditions.push(eq(pulseMetricsDaily.teamId, entityId));
    } else if (scope === 'user' && entityId) {
      whereConditions.push(eq(pulseMetricsDaily.userId, entityId));
    }

    if (from) whereConditions.push(gte(sql`${pulseMetricsDaily.bucketDate}::timestamp`, from));
    if (to) whereConditions.push(lte(sql`${pulseMetricsDaily.bucketDate}::timestamp`, to));

    const results = await baseQuery
      .where(and(...whereConditions))
      .groupBy(this.getDateTruncExpression(period, sql`${pulseMetricsDaily.bucketDate}::timestamp`))
      .orderBy(this.getDateTruncExpression(period, sql`${pulseMetricsDaily.bucketDate}::timestamp`));

    return results.map(row => ({
      periodStart: new Date(row.periodStart),
      avgMood: Number(row.avgMood || 0),
      checkinCount: Number(row.checkinCount || 0)
    }));
  }

  private async getPulseMetricsFromRaw(organizationId: string, options: PulseMetricsOptions): Promise<PulseMetricsResult[]> {
    const { scope, entityId, period, from, to } = options;
    
    let baseQuery = db
      .select({
        periodStart: this.getDateTruncExpression(period, checkins.weekOf),
        avgMood: sql<number>`AVG(${checkins.overallMood})::float`,
        checkinCount: count(checkins.id)
      })
      .from(checkins);

    let whereConditions = [eq(checkins.organizationId, organizationId), eq(checkins.isComplete, true)];

    if (scope === 'team' && entityId) {
      // Join with users table to filter by team
      baseQuery = baseQuery.innerJoin(users, eq(checkins.userId, users.id));
      whereConditions.push(eq(users.teamId, entityId));
    } else if (scope === 'user' && entityId) {
      whereConditions.push(eq(checkins.userId, entityId));
    }

    if (from) whereConditions.push(gte(checkins.weekOf, from));
    if (to) whereConditions.push(lte(checkins.weekOf, to));

    const results = await baseQuery
      .where(and(...whereConditions))
      .groupBy(this.getDateTruncExpression(period, checkins.weekOf))
      .orderBy(this.getDateTruncExpression(period, checkins.weekOf));

    return results.map(row => ({
      periodStart: new Date(row.periodStart),
      avgMood: Number(row.avgMood || 0),
      checkinCount: Number(row.checkinCount || 0)
    }));
  }

  async getShoutoutMetrics(organizationId: string, options: ShoutoutMetricsOptions): Promise<ShoutoutMetricsResult[]> {
    const { scope, entityId, direction = 'all', visibility = 'all', period, from, to } = options;
    
    // Check cache first
    const cacheKey = this.generateCacheKey('getShoutoutMetrics', organizationId, options);
    const cachedResult = this.analyticsCache.get<ShoutoutMetricsResult[]>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    let results: ShoutoutMetricsResult[];

    // Determine if we should use aggregates
    if (this.shouldUseAggregates(from, to, period)) {
      results = await this.getShoutoutMetricsFromAggregates(organizationId, options);
      
      // Shadow read for comparison if enabled
      if (process.env.ENABLE_SHADOW_READS === 'true') {
        const rawResults = await this.getShoutoutMetricsFromRaw(organizationId, options);
        await this.logShadowRead('getShoutoutMetrics', organizationId, options, results, rawResults);
      }
    } else {
      results = await this.getShoutoutMetricsFromRaw(organizationId, options);
    }

    // Cache results with longer TTL for older data
    const isOldData = from && (Date.now() - from.getTime()) > (7 * 24 * 60 * 60 * 1000);
    const ttl = isOldData ? 30 * 60 * 1000 : 5 * 60 * 1000;
    this.analyticsCache.set(cacheKey, results, ttl);

    return results;
  }

  private async getShoutoutMetricsFromAggregates(organizationId: string, options: ShoutoutMetricsOptions): Promise<ShoutoutMetricsResult[]> {
    const { scope, entityId, direction = 'all', visibility = 'all', period, from, to } = options;
    
    let baseQuery = db
      .select({
        periodStart: this.getDateTruncExpression(period, sql`${shoutoutMetricsDaily.bucketDate}::timestamp`),
        count: sql<number>`SUM(CASE 
          WHEN '${direction}' = 'received' THEN ${shoutoutMetricsDaily.receivedCount}
          WHEN '${direction}' = 'given' THEN ${shoutoutMetricsDaily.givenCount}
          ELSE ${shoutoutMetricsDaily.receivedCount} + ${shoutoutMetricsDaily.givenCount}
        END)`
      })
      .from(shoutoutMetricsDaily);

    let whereConditions = [eq(shoutoutMetricsDaily.organizationId, organizationId)];

    if (scope === 'team' && entityId) {
      whereConditions.push(eq(shoutoutMetricsDaily.teamId, entityId));
    } else if (scope === 'user' && entityId) {
      whereConditions.push(eq(shoutoutMetricsDaily.userId, entityId));
    }

    // Note: visibility filtering is complex with aggregates - fall back to raw for now
    if (visibility !== 'all') {
      return await this.getShoutoutMetricsFromRaw(organizationId, options);
    }

    if (from) whereConditions.push(gte(sql`${shoutoutMetricsDaily.bucketDate}::timestamp`, from));
    if (to) whereConditions.push(lte(sql`${shoutoutMetricsDaily.bucketDate}::timestamp`, to));

    const results = await baseQuery
      .where(and(...whereConditions))
      .groupBy(this.getDateTruncExpression(period, sql`${shoutoutMetricsDaily.bucketDate}::timestamp`))
      .orderBy(this.getDateTruncExpression(period, sql`${shoutoutMetricsDaily.bucketDate}::timestamp`));

    return results.map(row => ({
      periodStart: new Date(row.periodStart),
      count: Number(row.count || 0)
    }));
  }

  private async getShoutoutMetricsFromRaw(organizationId: string, options: ShoutoutMetricsOptions): Promise<ShoutoutMetricsResult[]> {
    const { scope, entityId, direction = 'all', visibility = 'all', period, from, to } = options;

    let baseQuery = db
      .select({
        periodStart: this.getDateTruncExpression(period, shoutouts.createdAt),
        count: count(shoutouts.id)
      })
      .from(shoutouts);

    let whereConditions = [eq(shoutouts.organizationId, organizationId)];

    // Handle scope and direction filtering
    if (scope === 'user' && entityId) {
      if (direction === 'received') {
        whereConditions.push(eq(shoutouts.toUserId, entityId));
      } else if (direction === 'given') {
        whereConditions.push(eq(shoutouts.fromUserId, entityId));
      } else {
        // For 'all' direction with user scope, include both given and received
        whereConditions.push(or(
          eq(shoutouts.fromUserId, entityId),
          eq(shoutouts.toUserId, entityId)
        ));
      }
    } else if (scope === 'team' && entityId) {
      if (direction === 'received') {
        // Join with users table to filter recipients by team
        baseQuery = baseQuery.innerJoin(users, eq(shoutouts.toUserId, users.id));
        whereConditions.push(eq(users.teamId, entityId));
      } else if (direction === 'given') {
        // Join with users table to filter givers by team
        baseQuery = baseQuery.innerJoin(users, eq(shoutouts.fromUserId, users.id));
        whereConditions.push(eq(users.teamId, entityId));
      } else {
        // For 'all' direction with team scope, we need to count both given and received
        // Use a subquery approach to handle the complex OR condition with joins
        const teamUserIds = await db
          .select({ id: users.id })
          .from(users)
          .where(and(
            eq(users.teamId, entityId),
            eq(users.organizationId, organizationId)
          ));
        
        const userIds = teamUserIds.map(u => u.id);
        if (userIds.length > 0) {
          whereConditions.push(or(
            inArray(shoutouts.fromUserId, userIds),
            inArray(shoutouts.toUserId, userIds)
          ));
        } else {
          // No users in team - return empty results
          whereConditions.push(sql`false`);
        }
      }
    }

    // Handle visibility filtering
    if (visibility === 'public') {
      whereConditions.push(eq(shoutouts.isPublic, true));
    } else if (visibility === 'private') {
      whereConditions.push(eq(shoutouts.isPublic, false));
    }

    if (from) whereConditions.push(gte(shoutouts.createdAt, from));
    if (to) whereConditions.push(lte(shoutouts.createdAt, to));

    const results = await baseQuery
      .where(and(...whereConditions))
      .groupBy(this.getDateTruncExpression(period, shoutouts.createdAt))
      .orderBy(this.getDateTruncExpression(period, shoutouts.createdAt));

    return results.map(row => ({
      periodStart: new Date(row.periodStart),
      count: Number(row.count || 0)
    }));
  }

  async getLeaderboard(organizationId: string, options: LeaderboardOptions): Promise<LeaderboardEntry[]> {
    const { metric, scope, entityId, period, from, to, limit = 10 } = options;
    
    // Check cache first
    const cacheKey = this.generateCacheKey('getLeaderboard', organizationId, options);
    const cachedResult = this.analyticsCache.get<LeaderboardEntry[]>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    let results: LeaderboardEntry[] = [];
    
    // For leaderboards, aggregates can be used for older data
    // but complexity of joins means we'll use raw data for now
    // This can be optimized in future iterations

    if (metric === 'shoutouts_received') {
      let baseQuery = db
        .select({
          entityId: scope === 'user' ? shoutouts.toUserId : users.teamId,
          value: count(shoutouts.id)
        })
        .from(shoutouts)
        .innerJoin(users, eq(shoutouts.toUserId, users.id));

      let whereConditions = [eq(shoutouts.organizationId, organizationId)];
      
      if (scope === 'user' && entityId) {
        // Filter by team when showing user leaderboard within a team
        whereConditions.push(eq(users.teamId, entityId));
      }
      
      if (from) whereConditions.push(gte(shoutouts.createdAt, from));
      if (to) whereConditions.push(lte(shoutouts.createdAt, to));

      const queryResults = await baseQuery
        .where(and(...whereConditions))
        .groupBy(scope === 'user' ? shoutouts.toUserId : users.teamId)
        .orderBy(desc(count(shoutouts.id)))
        .limit(limit);

      // Get names for entities
      const entityIds = queryResults.map(r => r.entityId).filter(Boolean);
      if (entityIds.length > 0) {
        if (scope === 'user') {
          const userNames = await db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(and(inArray(users.id, entityIds), eq(users.organizationId, organizationId)));
          
          results = queryResults.map(r => ({
            entityId: r.entityId,
            entityName: userNames.find(u => u.id === r.entityId)?.name || 'Unknown',
            value: Number(r.value)
          }));
        } else {
          const teamNames = await db
            .select({ id: teams.id, name: teams.name })
            .from(teams)
            .where(and(inArray(teams.id, entityIds), eq(teams.organizationId, organizationId)));
          
          results = queryResults.map(r => ({
            entityId: r.entityId,
            entityName: teamNames.find(t => t.id === r.entityId)?.name || 'Unknown',
            value: Number(r.value)
          }));
        }
      }
    } else if (metric === 'shoutouts_given') {
      // Similar logic for shoutouts given
      let baseQuery = db
        .select({
          entityId: scope === 'user' ? shoutouts.fromUserId : users.teamId,
          value: count(shoutouts.id)
        })
        .from(shoutouts)
        .innerJoin(users, eq(shoutouts.fromUserId, users.id));

      let whereConditions = [eq(shoutouts.organizationId, organizationId)];
      
      if (scope === 'user' && entityId) {
        whereConditions.push(eq(users.teamId, entityId));
      }
      
      if (from) whereConditions.push(gte(shoutouts.createdAt, from));
      if (to) whereConditions.push(lte(shoutouts.createdAt, to));

      const queryResults = await baseQuery
        .where(and(...whereConditions))
        .groupBy(scope === 'user' ? shoutouts.fromUserId : users.teamId)
        .orderBy(desc(count(shoutouts.id)))
        .limit(limit);

      // Get names for entities - similar logic as above
      const entityIds = queryResults.map(r => r.entityId).filter(Boolean);
      if (entityIds.length > 0) {
        if (scope === 'user') {
          const userNames = await db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(and(inArray(users.id, entityIds), eq(users.organizationId, organizationId)));
          
          results = queryResults.map(r => ({
            entityId: r.entityId,
            entityName: userNames.find(u => u.id === r.entityId)?.name || 'Unknown',
            value: Number(r.value)
          }));
        }
      }
    } else if (metric === 'pulse_avg') {
      // Pulse average leaderboard
      let baseQuery = db
        .select({
          entityId: scope === 'user' ? checkins.userId : users.teamId,
          value: sql<number>`AVG(${checkins.overallMood})::float`
        })
        .from(checkins);

      if (scope === 'team') {
        baseQuery = baseQuery.innerJoin(users, eq(checkins.userId, users.id));
      }

      let whereConditions = [
        eq(checkins.organizationId, organizationId),
        eq(checkins.isComplete, true)
      ];
      
      if (scope === 'user' && entityId) {
        whereConditions.push(eq(users.teamId, entityId));
      }
      
      if (from) whereConditions.push(gte(checkins.createdAt, from));
      if (to) whereConditions.push(lte(checkins.createdAt, to));

      const queryResults = await baseQuery
        .where(and(...whereConditions))
        .groupBy(scope === 'user' ? checkins.userId : users.teamId)
        .orderBy(desc(sql<number>`AVG(${checkins.overallMood})::float`))
        .limit(limit);

      // Get names for entities
      const entityIds = queryResults.map(r => r.entityId).filter(Boolean);
      if (entityIds.length > 0) {
        if (scope === 'user') {
          const userNames = await db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(and(inArray(users.id, entityIds), eq(users.organizationId, organizationId)));
          
          results = queryResults.map(r => ({
            entityId: r.entityId,
            entityName: userNames.find(u => u.id === r.entityId)?.name || 'Unknown',
            value: Number(r.value || 0)
          }));
        }
      }
    }

    // Cache results with longer TTL for older data
    const isOldData = from && (Date.now() - from.getTime()) > (7 * 24 * 60 * 60 * 1000);
    const ttl = isOldData ? 30 * 60 * 1000 : 5 * 60 * 1000;
    this.analyticsCache.set(cacheKey, results, ttl);

    return results;
  }

  async getAnalyticsOverview(organizationId: string, period: AnalyticsPeriod, from: Date, to: Date): Promise<AnalyticsOverview> {
    // Check cache first
    const cacheKey = this.generateCacheKey('getAnalyticsOverview', organizationId, { period, from, to });
    const cachedResult = this.analyticsCache.get<AnalyticsOverview>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }
    const periodLength = to.getTime() - from.getTime();
    const previousFrom = new Date(from.getTime() - periodLength);
    const previousTo = from;

    // Current period metrics
    const [currentPulse] = await db
      .select({
        avg: sql<number>`AVG(${checkins.overallMood})::float`,
        count: count(checkins.id)
      })
      .from(checkins)
      .where(and(
        eq(checkins.organizationId, organizationId),
        eq(checkins.isComplete, true),
        gte(checkins.createdAt, from),
        lte(checkins.createdAt, to)
      ));

    const [currentShoutouts] = await db
      .select({
        count: count(shoutouts.id)
      })
      .from(shoutouts)
      .where(and(
        eq(shoutouts.organizationId, organizationId),
        gte(shoutouts.createdAt, from),
        lte(shoutouts.createdAt, to)
      ));

    const [currentUsers] = await db
      .select({
        count: sql<number>`COUNT(DISTINCT ${checkins.userId})`
      })
      .from(checkins)
      .where(and(
        eq(checkins.organizationId, organizationId),
        gte(checkins.createdAt, from),
        lte(checkins.createdAt, to)
      ));

    // Previous period metrics
    const [previousPulse] = await db
      .select({
        avg: sql<number>`AVG(${checkins.overallMood})::float`,
        count: count(checkins.id)
      })
      .from(checkins)
      .where(and(
        eq(checkins.organizationId, organizationId),
        eq(checkins.isComplete, true),
        gte(checkins.createdAt, previousFrom),
        lt(checkins.createdAt, previousTo)
      ));

    const [previousShoutouts] = await db
      .select({
        count: count(shoutouts.id)
      })
      .from(shoutouts)
      .where(and(
        eq(shoutouts.organizationId, organizationId),
        gte(shoutouts.createdAt, previousFrom),
        lt(shoutouts.createdAt, previousTo)
      ));

    const [previousUsers] = await db
      .select({
        count: sql<number>`COUNT(DISTINCT ${checkins.userId})`
      })
      .from(checkins)
      .where(and(
        eq(checkins.organizationId, organizationId),
        gte(checkins.createdAt, previousFrom),
        lt(checkins.createdAt, previousTo)
      ));

    const currentPulseAvg = Number(currentPulse?.avg || 0);
    const previousPulseAvg = Number(previousPulse?.avg || 0);
    const currentShoutoutCount = Number(currentShoutouts?.count || 0);
    const previousShoutoutCount = Number(previousShoutouts?.count || 0);
    const currentActiveUsers = Number(currentUsers?.count || 0);
    const previousActiveUsers = Number(previousUsers?.count || 0);
    const currentCompletedCheckins = Number(currentPulse?.count || 0);
    const previousCompletedCheckins = Number(previousPulse?.count || 0);

    const result = {
      pulseAvg: {
        current: currentPulseAvg,
        previous: previousPulseAvg,
        change: previousPulseAvg > 0 ? ((currentPulseAvg - previousPulseAvg) / previousPulseAvg) * 100 : 0
      },
      totalShoutouts: {
        current: currentShoutoutCount,
        previous: previousShoutoutCount,
        change: previousShoutoutCount > 0 ? ((currentShoutoutCount - previousShoutoutCount) / previousShoutoutCount) * 100 : 0
      },
      activeUsers: {
        current: currentActiveUsers,
        previous: previousActiveUsers,
        change: previousActiveUsers > 0 ? ((currentActiveUsers - previousActiveUsers) / previousActiveUsers) * 100 : 0
      },
      completedCheckins: {
        current: currentCompletedCheckins,
        previous: previousCompletedCheckins,
        change: previousCompletedCheckins > 0 ? ((currentCompletedCheckins - previousCompletedCheckins) / previousCompletedCheckins) * 100 : 0
      }
    };

    // Cache results with longer TTL for older data
    const isOldData = from && (Date.now() - from.getTime()) > (7 * 24 * 60 * 60 * 1000);
    const ttl = isOldData ? 30 * 60 * 1000 : 5 * 60 * 1000;
    this.analyticsCache.set(cacheKey, result, ttl);

    return result;
  }

  async getCheckinComplianceMetrics(organizationId: string, options?: ComplianceMetricsOptions): Promise<ComplianceMetricsResult[]> {
    const { scope = 'organization', entityId, period, from, to } = options || {};
    
    // Check cache first
    const cacheKey = this.generateCacheKey('getCheckinComplianceMetrics', organizationId, options || {});
    const cachedResult = this.analyticsCache.get<ComplianceMetricsResult[]>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    let results: ComplianceMetricsResult[];

    // Determine if we should use aggregates
    if (this.shouldUseAggregates(from, to, period)) {
      results = await this.getCheckinComplianceMetricsFromAggregates(organizationId, options);
      
      // Shadow read for comparison if enabled
      if (process.env.ENABLE_SHADOW_READS === 'true') {
        const rawResults = await this.getCheckinComplianceMetricsFromRaw(organizationId, options);
        await this.logShadowRead('getCheckinComplianceMetrics', organizationId, options, results, rawResults);
      }
    } else {
      results = await this.getCheckinComplianceMetricsFromRaw(organizationId, options);
    }

    // Cache results
    const isOldData = from && (Date.now() - from.getTime()) > (7 * 24 * 60 * 60 * 1000);
    const ttl = isOldData ? 30 * 60 * 1000 : 5 * 60 * 1000;
    this.analyticsCache.set(cacheKey, results, ttl);

    return results;
  }

  private async getCheckinComplianceMetricsFromAggregates(organizationId: string, options?: ComplianceMetricsOptions): Promise<ComplianceMetricsResult[]> {
    const { scope = 'organization', entityId, period, from, to } = options || {};
    
    let baseQuery = db
      .select({
        periodStart: period ? this.getDateTruncExpression(period, sql`${complianceMetricsDaily.bucketDate}::timestamp`) : sql<Date>`NULL`,
        totalCount: sum(complianceMetricsDaily.checkinComplianceCount),
        onTimeCount: sum(complianceMetricsDaily.checkinOnTimeCount)
      })
      .from(complianceMetricsDaily);

    let whereConditions = [eq(complianceMetricsDaily.organizationId, organizationId)];

    if (scope === 'team' && entityId) {
      whereConditions.push(eq(complianceMetricsDaily.teamId, entityId));
    } else if (scope === 'user' && entityId) {
      whereConditions.push(eq(complianceMetricsDaily.userId, entityId));
    }

    if (from) whereConditions.push(gte(sql`${complianceMetricsDaily.bucketDate}::timestamp`, from));
    if (to) whereConditions.push(lte(sql`${complianceMetricsDaily.bucketDate}::timestamp`, to));

    const results = period
      ? await baseQuery
          .where(and(...whereConditions))
          .groupBy(this.getDateTruncExpression(period, sql`${complianceMetricsDaily.bucketDate}::timestamp`))
          .orderBy(this.getDateTruncExpression(period, sql`${complianceMetricsDaily.bucketDate}::timestamp`))
      : await baseQuery
          .where(and(...whereConditions));

    return results.map(row => {
      const totalCount = Number(row.totalCount || 0);
      const onTimeCount = Number(row.onTimeCount || 0);
      const onTimePercentage = totalCount > 0 ? (onTimeCount / totalCount) * 100 : 0;

      return {
        periodStart: row.periodStart ? new Date(row.periodStart) : undefined,
        metrics: {
          totalCount,
          onTimeCount,
          onTimePercentage: Math.round(onTimePercentage * 100) / 100
        }
      };
    });
  }

  private async getCheckinComplianceMetricsFromRaw(organizationId: string, options?: ComplianceMetricsOptions): Promise<ComplianceMetricsResult[]> {
    const { scope = 'organization', entityId, period, from, to } = options || {};

    // Apply date filtering
    const whereConditions: any[] = [
      eq(checkins.organizationId, organizationId),
      eq(checkins.isComplete, true)
    ];

    if (from) whereConditions.push(gte(checkins.weekOf, from));
    if (to) whereConditions.push(lte(checkins.weekOf, to));
    
    if (scope === 'user' && entityId) {
      whereConditions.push(eq(checkins.userId, entityId));
    } else if (scope === 'team' && entityId) {
      whereConditions.push(eq(users.teamId, entityId));
    }

    // Query submitted check-ins with vacation status
    const results = await db
      .select({
        id: checkins.id,
        userId: checkins.userId,
        teamId: sql<string>`${users.teamId}`,
        submittedAt: checkins.submittedAt,
        dueDate: checkins.dueDate,
        submittedOnTime: checkins.submittedOnTime,
        weekOf: checkins.weekOf,
        isOnVacation: sql<boolean>`CASE WHEN ${vacations.id} IS NOT NULL THEN true ELSE false END`
      })
      .from(checkins)
      .innerJoin(users, eq(checkins.userId, users.id))
      .leftJoin(vacations, and(
        eq(vacations.organizationId, organizationId),
        eq(vacations.userId, checkins.userId),
        eq(vacations.weekOf, checkins.weekOf)
      ))
      .where(and(...whereConditions));

    let complianceResults: ComplianceMetricsResult[] = [];

    if (period) {
      // Group by period
      const groupedData = new Map<string, any[]>();
      
      results.forEach(checkin => {
        const periodStart = this.truncateDate(checkin.weekOf, period);
        const periodKey = periodStart.toISOString();
        
        if (!groupedData.has(periodKey)) {
          groupedData.set(periodKey, []);
        }
        groupedData.get(periodKey)!.push(checkin);
      });

      // Calculate metrics for each period
      complianceResults = Array.from(groupedData.entries()).map(([periodKey, checkins]) => ({
        periodStart: new Date(periodKey),
        metrics: this.calculateComplianceMetrics(checkins)
      }));
    } else {
      // No period grouping - aggregate all results
      complianceResults = [{
        metrics: this.calculateComplianceMetrics(results)
      }];
    }

    return complianceResults;
  }

  async getReviewComplianceMetrics(organizationId: string, options?: ComplianceMetricsOptions): Promise<ComplianceMetricsResult[]> {
    const { scope = 'organization', entityId, period, from, to } = options || {};
    
    // Check cache first
    const cacheKey = this.generateCacheKey('getReviewComplianceMetrics', organizationId, options || {});
    const cachedResult = this.analyticsCache.get<ComplianceMetricsResult[]>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    let results: ComplianceMetricsResult[];

    // Determine if we should use aggregates
    if (this.shouldUseAggregates(from, to, period)) {
      results = await this.getReviewComplianceMetricsFromAggregates(organizationId, options);
      
      // Shadow read for comparison if enabled
      if (process.env.ENABLE_SHADOW_READS === 'true') {
        const rawResults = await this.getReviewComplianceMetricsFromRaw(organizationId, options);
        await this.logShadowRead('getReviewComplianceMetrics', organizationId, options, results, rawResults);
      }
    } else {
      results = await this.getReviewComplianceMetricsFromRaw(organizationId, options);
    }

    // Cache results
    const isOldData = from && (Date.now() - from.getTime()) > (7 * 24 * 60 * 60 * 1000);
    const ttl = isOldData ? 30 * 60 * 1000 : 5 * 60 * 1000;
    this.analyticsCache.set(cacheKey, results, ttl);

    return results;
  }

  private async getReviewComplianceMetricsFromAggregates(organizationId: string, options?: ComplianceMetricsOptions): Promise<ComplianceMetricsResult[]> {
    const { scope = 'organization', entityId, period, from, to } = options || {};
    
    let baseQuery = db
      .select({
        periodStart: period ? this.getDateTruncExpression(period, sql`${complianceMetricsDaily.bucketDate}::timestamp`) : sql<Date>`NULL`,
        totalCount: sum(complianceMetricsDaily.reviewComplianceCount),
        onTimeCount: sum(complianceMetricsDaily.reviewOnTimeCount)
      })
      .from(complianceMetricsDaily);

    let whereConditions = [eq(complianceMetricsDaily.organizationId, organizationId)];

    if (scope === 'team' && entityId) {
      whereConditions.push(eq(complianceMetricsDaily.teamId, entityId));
    } else if (scope === 'user' && entityId) {
      whereConditions.push(eq(complianceMetricsDaily.userId, entityId));
    }

    if (from) whereConditions.push(gte(sql`${complianceMetricsDaily.bucketDate}::timestamp`, from));
    if (to) whereConditions.push(lte(sql`${complianceMetricsDaily.bucketDate}::timestamp`, to));

    const results = period
      ? await baseQuery
          .where(and(...whereConditions))
          .groupBy(this.getDateTruncExpression(period, sql`${complianceMetricsDaily.bucketDate}::timestamp`))
          .orderBy(this.getDateTruncExpression(period, sql`${complianceMetricsDaily.bucketDate}::timestamp`))
      : await baseQuery
          .where(and(...whereConditions));

    return results.map(row => {
      const totalCount = Number(row.totalCount || 0);
      const onTimeCount = Number(row.onTimeCount || 0);
      const onTimePercentage = totalCount > 0 ? (onTimeCount / totalCount) * 100 : 0;

      return {
        periodStart: row.periodStart ? new Date(row.periodStart) : undefined,
        metrics: {
          totalCount,
          onTimeCount,
          onTimePercentage: Math.round(onTimePercentage * 100) / 100
        }
      };
    });
  }

  private async getReviewComplianceMetricsFromRaw(organizationId: string, options?: ComplianceMetricsOptions): Promise<ComplianceMetricsResult[]> {
    const { scope = 'organization', entityId, period, from, to } = options || {};

    // Base query for reviewed check-ins only
    const whereConditions: any[] = [
      eq(checkins.organizationId, organizationId),
      eq(checkins.isComplete, true),
      sql`${checkins.reviewedAt} IS NOT NULL` // Only reviewed check-ins
    ];

    // Apply scope filtering
    if (scope === 'user' && entityId) {
      // For user scope in reviews, we filter by the reviewer (reviewedBy)
      whereConditions.push(eq(checkins.reviewedBy, entityId));
    } else if (scope === 'team' && entityId) {
      // For team scope, get reviews done by team leaders
      const teamLeaders = await db
        .select({ leaderId: teams.leaderId })
        .from(teams)
        .where(and(eq(teams.id, entityId), eq(teams.organizationId, organizationId)));
      
      if (teamLeaders.length > 0) {
        whereConditions.push(inArray(checkins.reviewedBy, teamLeaders.map(t => t.leaderId)));
      } else {
        // No team leaders found - return empty results
        return [{ metrics: { totalCount: 0, onTimeCount: 0, onTimePercentage: 0 } }];
      }
    }

    // Apply date filtering
    if (from) whereConditions.push(gte(checkins.weekOf, from));
    if (to) whereConditions.push(lte(checkins.weekOf, to));

    // Query reviewed check-ins with reviewer vacation status
    const results = await db
      .select({
        id: checkins.id,
        reviewedBy: checkins.reviewedBy,
        reviewedAt: checkins.reviewedAt,
        reviewDueDate: checkins.reviewDueDate,
        reviewedOnTime: checkins.reviewedOnTime,
        weekOf: checkins.weekOf,
        reviewerOnVacation: sql<boolean>`CASE WHEN ${vacations.id} IS NOT NULL THEN true ELSE false END`
      })
      .from(checkins)
      .leftJoin(vacations, and(
        eq(vacations.organizationId, organizationId),
        eq(vacations.userId, checkins.reviewedBy),
        eq(vacations.weekOf, checkins.weekOf)
      ))
      .where(and(...whereConditions));

    let complianceResults: ComplianceMetricsResult[] = [];

    if (period) {
      // Group by period
      const groupedData = new Map<string, any[]>();
      
      results.forEach(review => {
        const periodStart = this.truncateDate(review.weekOf, period);
        const periodKey = periodStart.toISOString();
        
        if (!groupedData.has(periodKey)) {
          groupedData.set(periodKey, []);
        }
        groupedData.get(periodKey)!.push(review);
      });

      // Calculate metrics for each period
      complianceResults = Array.from(groupedData.entries()).map(([periodKey, reviews]) => ({
        periodStart: new Date(periodKey),
        metrics: this.calculateReviewComplianceMetrics(reviews)
      })).sort((a, b) => a.periodStart!.getTime() - b.periodStart!.getTime());

    } else {
      // Aggregate metrics
      complianceResults = [{
        metrics: this.calculateReviewComplianceMetrics(results)
      }];
    }

    return complianceResults;
  }

  private calculateComplianceMetrics(checkins: any[]): any {
    if (checkins.length === 0) {
      return { totalCount: 0, onTimeCount: 0, onTimePercentage: 0 };
    }

    // Separate vacation and non-vacation weeks
    const nonVacationCheckins = checkins.filter(c => !c.isOnVacation);
    const vacationCheckins = checkins.filter(c => c.isOnVacation);

    // For compliance calculation:
    // - totalCount = non-vacation weeks only (these are "due" weeks)
    // - onTimeCount = on-time submissions from both vacation and non-vacation weeks
    const totalDueCount = nonVacationCheckins.length;
    const onTimeCount = checkins.filter(c => c.submittedOnTime).length;
    const onTimePercentage = totalDueCount > 0 ? (onTimeCount / totalDueCount) * 100 : 0;

    // Calculate average days early/late for all submissions
    let totalDaysDiff = 0;
    let earlyCount = 0;
    let lateSubmissions = [];

    checkins.forEach(checkin => {
      if (checkin.submittedAt && checkin.dueDate) {
        const diffMs = new Date(checkin.submittedAt).getTime() - new Date(checkin.dueDate).getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        
        totalDaysDiff += diffDays;
        
        if (diffDays < 0) { // Early submission (negative difference)
          earlyCount++;
        } else if (diffDays > 0) { // Late submission
          lateSubmissions.push(diffDays);
        }
      }
    });

    const averageDaysEarly = earlyCount > 0 ? Math.abs(totalDaysDiff / checkins.length) : undefined;
    const averageDaysLate = lateSubmissions.length > 0 
      ? lateSubmissions.reduce((sum, days) => sum + days, 0) / lateSubmissions.length 
      : undefined;

    return {
      totalCount: totalDueCount, // Only non-vacation weeks count as "due"
      onTimeCount, // All on-time submissions count positively
      onTimePercentage: Math.round(onTimePercentage * 100) / 100,
      averageDaysEarly,
      averageDaysLate,
      vacationWeeks: vacationCheckins.length // Additional info for debugging
    };
  }

  private calculateReviewComplianceMetrics(reviews: any[]): any {
    if (reviews.length === 0) {
      return { totalCount: 0, onTimeCount: 0, onTimePercentage: 0 };
    }

    // Separate vacation and non-vacation weeks for reviewers
    const nonVacationReviews = reviews.filter(r => !r.reviewerOnVacation);
    const vacationReviews = reviews.filter(r => r.reviewerOnVacation);

    // For review compliance calculation:
    // - totalCount = non-vacation weeks only (weeks when reviewer was expected to review)
    // - onTimeCount = on-time reviews from both vacation and non-vacation weeks
    const totalDueCount = nonVacationReviews.length;
    const onTimeCount = reviews.filter(r => r.reviewedOnTime).length;
    const onTimePercentage = totalDueCount > 0 ? (onTimeCount / totalDueCount) * 100 : 0;

    // Calculate average days early/late for all reviews
    let totalDaysDiff = 0;
    let earlyCount = 0;
    let lateReviews = [];

    reviews.forEach(review => {
      if (review.reviewedAt && review.reviewDueDate) {
        const diffMs = new Date(review.reviewedAt).getTime() - new Date(review.reviewDueDate).getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        
        totalDaysDiff += diffDays;
        
        if (diffDays < 0) { // Early review (negative difference)
          earlyCount++;
        } else if (diffDays > 0) { // Late review
          lateReviews.push(diffDays);
        }
      }
    });

    const averageDaysEarly = earlyCount > 0 ? Math.abs(totalDaysDiff / reviews.length) : undefined;
    const averageDaysLate = lateReviews.length > 0 
      ? lateReviews.reduce((sum, days) => sum + days, 0) / lateReviews.length 
      : undefined;

    return {
      totalCount: totalDueCount, // Only non-vacation weeks count as "due"
      onTimeCount, // All on-time reviews count positively
      onTimePercentage: Math.round(onTimePercentage * 100) / 100,
      averageDaysEarly,
      averageDaysLate,
      reviewerVacationWeeks: vacationReviews.length // Additional info for debugging
    };
  }

  // Vacations
  async getUserVacationsByRange(organizationId: string, userId: string, from?: Date, to?: Date): Promise<Vacation[]> {
    let whereConditions = [
      eq(vacations.organizationId, organizationId),
      eq(vacations.userId, userId)
    ];

    if (from) {
      whereConditions.push(gte(vacations.weekOf, from));
    }
    if (to) {
      whereConditions.push(lte(vacations.weekOf, to));
    }

    return await db.select()
      .from(vacations)
      .where(and(...whereConditions))
      .orderBy(desc(vacations.weekOf));
  }

  async upsertVacationWeek(organizationId: string, userId: string, weekOf: Date, note?: string): Promise<Vacation> {
    // Normalize weekOf to Monday 00:00 Central Time
    const normalizedWeekOf = getWeekStartCentral(weekOf);

    const [vacation] = await db
      .insert(vacations)
      .values({
        organizationId,
        userId,
        weekOf: normalizedWeekOf,
        note: note ?? null,
      })
      .onConflictDoUpdate({
        target: [vacations.organizationId, vacations.userId, vacations.weekOf],
        set: {
          note: note ?? null,
        }
      })
      .returning();

    // Invalidate analytics cache for this organization since vacation status affects compliance metrics
    this.analyticsCache.invalidateForOrganization(organizationId);
    
    // Trigger re-aggregation for the affected week (fire-and-forget)
    // This ensures compliance metrics are recalculated with the new vacation status
    AggregationService.getInstance().recomputeUserDayAggregates(
      organizationId, 
      userId, 
      normalizedWeekOf
    ).catch(error => {
      console.error(`Failed to recompute aggregates after vacation upsert for user ${userId}:`, error);
    });

    return vacation;
  }

  async deleteVacationWeek(organizationId: string, userId: string, weekOf: Date): Promise<boolean> {
    // Normalize weekOf to Monday 00:00 Central Time
    const normalizedWeekOf = getWeekStartCentral(weekOf);

    const result = await db
      .delete(vacations)
      .where(and(
        eq(vacations.organizationId, organizationId),
        eq(vacations.userId, userId),
        eq(vacations.weekOf, normalizedWeekOf)
      ))
      .returning({ id: vacations.id });

    const wasDeleted = result.length > 0;
    
    if (wasDeleted) {
      // Invalidate analytics cache for this organization since vacation status affects compliance metrics
      this.analyticsCache.invalidateForOrganization(organizationId);
      
      // Trigger re-aggregation for the affected week (fire-and-forget)
      // This ensures compliance metrics are recalculated with the updated vacation status
      AggregationService.getInstance().recomputeUserDayAggregates(
        organizationId, 
        userId, 
        normalizedWeekOf
      ).catch(error => {
        console.error(`Failed to recompute aggregates after vacation deletion for user ${userId}:`, error);
      });
    }

    return wasDeleted;
  }

  async isUserOnVacation(organizationId: string, userId: string, weekOf: Date): Promise<boolean> {
    // Normalize weekOf to Monday 00:00 Central Time
    const normalizedWeekOf = getWeekStartCentral(weekOf);

    const [vacation] = await db.select({ id: vacations.id })
      .from(vacations)
      .where(and(
        eq(vacations.organizationId, organizationId),
        eq(vacations.userId, userId),
        eq(vacations.weekOf, normalizedWeekOf)
      ))
      .limit(1);

    return !!vacation;
  }
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private teams: Map<string, Team> = new Map();
  private checkins: Map<string, Checkin> = new Map();
  private questions: Map<string, Question> = new Map();
  private wins: Map<string, Win> = new Map();
  private comments: Map<string, Comment> = new Map();
  private shoutoutsMap: Map<string, Shoutout> = new Map();
  private vacations: Map<string, Vacation> = new Map();
  private analyticsCache = new AnalyticsCache();

  constructor() {
    this.seedData();
  }

  private seedData() {
    const defaultOrgId = "default-org";
    
    // Create default admin user
    const adminUser: User = {
      id: randomUUID(),
      username: "admin",
      password: "password123",
      name: "Admin User",
      email: "admin@teampulse.com",
      role: "admin",
      organizationId: defaultOrgId,
      teamId: null,
      managerId: null,
      avatar: null,
      isActive: true,
      createdAt: new Date(),
    };
    this.users.set(adminUser.id, adminUser);

    // Create default team
    const defaultTeam: Team = {
      id: randomUUID(),
      name: "Engineering",
      description: "Software development team",
      organizationId: defaultOrgId,
      leaderId: adminUser.id,
      createdAt: new Date(),
    };
    this.teams.set(defaultTeam.id, defaultTeam);

    // Create default questions
    const defaultQuestions: Question[] = [
      {
        id: randomUUID(),
        text: "What are you most proud of this week?",
        organizationId: defaultOrgId,
        createdBy: adminUser.id,
        isActive: true,
        order: 1,
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        text: "What challenges did you face?",
        organizationId: defaultOrgId,
        createdBy: adminUser.id,
        isActive: true,
        order: 2,
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        text: "How can your manager support you?",
        organizationId: defaultOrgId,
        createdBy: adminUser.id,
        isActive: true,
        order: 3,
        createdAt: new Date(),
      },
    ];
    
    defaultQuestions.forEach(q => this.questions.set(q.id, q));
  }

  // Users
  async getUser(organizationId: string, id: string): Promise<User | undefined> {
    const user = this.users.get(id);
    return user && user.organizationId === organizationId ? user : undefined;
  }

  async getUserByUsername(organizationId: string, username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => 
      user.username === username && user.organizationId === organizationId
    );
  }

  async getUserByEmail(organizationId: string, email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => 
      user.email === email && user.organizationId === organizationId
    );
  }

  async createUser(organizationId: string, insertUser: InsertUser): Promise<User> {
    const user: User = {
      ...insertUser,
      id: randomUUID(),
      organizationId,
      createdAt: new Date(),
      isActive: insertUser.isActive ?? true,
      role: insertUser.role ?? "member",
      teamId: insertUser.teamId ?? null,
      managerId: insertUser.managerId ?? null,
      avatar: insertUser.avatar ?? null,
    };
    this.users.set(user.id, user);
    return user;
  }

  async updateUser(organizationId: string, id: string, userUpdate: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user || user.organizationId !== organizationId) return undefined;
    
    const updatedUser = { ...user, ...userUpdate };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getUsersByTeam(organizationId: string, teamId: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => 
      user.teamId === teamId && user.organizationId === organizationId
    );
  }

  async getUsersByManager(organizationId: string, managerId: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => 
      user.managerId === managerId && user.organizationId === organizationId
    );
  }

  async getUsersByTeamLeadership(organizationId: string, leaderId: string): Promise<User[]> {
    // Find teams where the user is the leader
    const leaderTeams = Array.from(this.teams.values()).filter(team => 
      team.leaderId === leaderId && team.organizationId === organizationId
    );
    
    if (leaderTeams.length === 0) {
      return [];
    }

    // Get all users from those teams
    const teamIds = leaderTeams.map(team => team.id);
    return Array.from(this.users.values()).filter(user => 
      user.teamId && teamIds.includes(user.teamId) && user.organizationId === organizationId
    );
  }

  async getAllUsers(organizationId: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => 
      user.organizationId === organizationId
    );
  }

  // Teams
  async getTeam(organizationId: string, id: string): Promise<Team | undefined> {
    const team = this.teams.get(id);
    return team && team.organizationId === organizationId ? team : undefined;
  }

  async createTeam(organizationId: string, insertTeam: InsertTeam): Promise<Team> {
    const team: Team = {
      ...insertTeam,
      id: randomUUID(),
      organizationId,
      createdAt: new Date(),
      description: insertTeam.description ?? null,
    };
    this.teams.set(team.id, team);
    return team;
  }

  async updateTeam(organizationId: string, id: string, teamUpdate: Partial<InsertTeam>): Promise<Team | undefined> {
    const team = this.teams.get(id);
    if (!team || team.organizationId !== organizationId) return undefined;
    
    const updatedTeam = { ...team, ...teamUpdate };
    this.teams.set(id, updatedTeam);
    return updatedTeam;
  }

  async getAllTeams(organizationId: string): Promise<Team[]> {
    return Array.from(this.teams.values()).filter(team => 
      team.organizationId === organizationId
    );
  }

  // Check-ins
  async getCheckin(organizationId: string, id: string): Promise<Checkin | undefined> {
    const checkin = this.checkins.get(id);
    return checkin && checkin.organizationId === organizationId ? checkin : undefined;
  }

  async createCheckin(organizationId: string, insertCheckin: InsertCheckin): Promise<Checkin> {
    const isCompleting = insertCheckin.isComplete ?? false;
    const now = new Date();
    
    // Calculate due dates using utility functions
    const dueDate = insertCheckin.dueDate ?? getCheckinDueDate(insertCheckin.weekOf);
    const reviewDueDate = insertCheckin.reviewDueDate ?? getReviewDueDate(insertCheckin.weekOf);
    
    // Calculate if submitted on time (only if being submitted now)
    const submittedAt = isCompleting ? now : null;
    const submittedOnTime = submittedAt ? isSubmittedOnTime(submittedAt, dueDate) : false;
    
    const checkin: Checkin = {
      ...insertCheckin,
      id: randomUUID(),
      organizationId,
      submittedAt,
      dueDate,
      submittedOnTime,
      reviewDueDate,
      createdAt: now,
      responses: insertCheckin.responses ?? {},
      isComplete: isCompleting,
      reviewStatus: ReviewStatus.PENDING,
      reviewedBy: null,
      reviewedAt: null,
      reviewedOnTime: false,
      reviewComments: null,
    };
    this.checkins.set(checkin.id, checkin);
    return checkin;
  }

  async updateCheckin(organizationId: string, id: string, checkinUpdate: Partial<InsertCheckin>): Promise<Checkin | undefined> {
    const existing = this.checkins.get(id);
    if (!existing || existing.organizationId !== organizationId) return undefined;

    const isBeingCompleted = checkinUpdate.isComplete && !existing.isComplete;
    const now = new Date();
    
    // Prepare the update with calculated fields
    const updateData: any = { ...checkinUpdate };
    
    // If checkin is being completed now, set submission timestamp and calculate on-time status
    if (isBeingCompleted) {
      updateData.submittedAt = now;
      updateData.submittedOnTime = isSubmittedOnTime(now, existing.dueDate);
    }
    
    // If due dates are being updated, recalculate them using utility functions  
    if (checkinUpdate.weekOf) {
      if (!checkinUpdate.dueDate) {
        updateData.dueDate = getCheckinDueDate(checkinUpdate.weekOf);
      }
      if (!checkinUpdate.reviewDueDate) {
        updateData.reviewDueDate = getReviewDueDate(checkinUpdate.weekOf);
      }
      
      // Recalculate submittedOnTime if checkin was already submitted
      if (existing.submittedAt) {
        updateData.submittedOnTime = isSubmittedOnTime(existing.submittedAt, updateData.dueDate);
      }
    }
    
    const updatedCheckin = { 
      ...existing, 
      ...updateData,
    };
    this.checkins.set(id, updatedCheckin);
    return updatedCheckin;
  }

  async getCheckinsByUser(organizationId: string, userId: string): Promise<Checkin[]> {
    return Array.from(this.checkins.values())
      .filter(checkin => checkin.userId === userId && checkin.organizationId === organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getCheckinsByManager(organizationId: string, managerId: string): Promise<Checkin[]> {
    const reports = await this.getUsersByManager(organizationId, managerId);
    const reportIds = reports.map(user => user.id);
    
    return Array.from(this.checkins.values())
      .filter(checkin => reportIds.includes(checkin.userId) && checkin.organizationId === organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getCurrentWeekCheckin(organizationId: string, userId: string): Promise<Checkin | undefined> {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);
    
    return Array.from(this.checkins.values())
      .find(checkin => 
        checkin.userId === userId && 
        checkin.organizationId === organizationId &&
        checkin.weekOf >= startOfWeek
      );
  }

  async getRecentCheckins(organizationId: string, limit = 10): Promise<Checkin[]> {
    return Array.from(this.checkins.values())
      .filter(checkin => checkin.isComplete && checkin.organizationId === organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // Check-in Review Methods
  async getPendingCheckins(organizationId: string, managerId?: string): Promise<Checkin[]> {
    let checkins = Array.from(this.checkins.values())
      .filter(checkin => 
        checkin.organizationId === organizationId &&
        checkin.reviewStatus === ReviewStatus.PENDING &&
        checkin.isComplete
      );

    if (managerId) {
      // Get pending check-ins for manager's team members
      const reports = await this.getUsersByManager(organizationId, managerId);
      const reportIds = reports.map(user => user.id);
      
      checkins = checkins.filter(checkin => reportIds.includes(checkin.userId));
    }

    return checkins.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async reviewCheckin(organizationId: string, checkinId: string, reviewedBy: string, reviewData: ReviewCheckin): Promise<Checkin | undefined> {
    const existing = this.checkins.get(checkinId);
    if (!existing || existing.organizationId !== organizationId) return undefined;

    const reviewedAt = new Date();
    const reviewedOnTime = isReviewedOnTime(reviewedAt, existing.reviewDueDate);
    
    const updatedCheckin = {
      ...existing,
      reviewStatus: reviewData.reviewStatus,
      reviewedBy,
      reviewedAt,
      reviewedOnTime,
      reviewComments: reviewData.reviewComments || null,
    };
    
    this.checkins.set(checkinId, updatedCheckin);
    return updatedCheckin;
  }

  async getCheckinsByReviewStatus(organizationId: string, status: ReviewStatusType): Promise<Checkin[]> {
    return Array.from(this.checkins.values())
      .filter(checkin => 
        checkin.organizationId === organizationId &&
        checkin.reviewStatus === status
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getCheckinsByTeamLeader(organizationId: string, leaderId: string): Promise<Checkin[]> {
    return Array.from(this.checkins.values())
      .filter(checkin => 
        checkin.organizationId === organizationId &&
        checkin.reviewedBy === leaderId
      )
      .sort((a, b) => {
        if (!a.reviewedAt || !b.reviewedAt) return 0;
        return b.reviewedAt.getTime() - a.reviewedAt.getTime();
      });
  }

  // Questions
  async getQuestion(organizationId: string, id: string): Promise<Question | undefined> {
    const question = this.questions.get(id);
    return question && question.organizationId === organizationId ? question : undefined;
  }

  async createQuestion(organizationId: string, insertQuestion: InsertQuestion): Promise<Question> {
    const question: Question = {
      ...insertQuestion,
      id: randomUUID(),
      organizationId,
      createdAt: new Date(),
      isActive: insertQuestion.isActive ?? true,
      order: insertQuestion.order ?? 0,
    };
    this.questions.set(question.id, question);
    return question;
  }

  async updateQuestion(organizationId: string, id: string, questionUpdate: Partial<InsertQuestion>): Promise<Question | undefined> {
    const question = this.questions.get(id);
    if (!question || question.organizationId !== organizationId) return undefined;
    
    const updatedQuestion = { ...question, ...questionUpdate };
    this.questions.set(id, updatedQuestion);
    return updatedQuestion;
  }

  async deleteQuestion(organizationId: string, id: string): Promise<boolean> {
    const question = this.questions.get(id);
    if (!question || question.organizationId !== organizationId) return false;
    return this.questions.delete(id);
  }

  async getActiveQuestions(organizationId: string): Promise<Question[]> {
    return Array.from(this.questions.values())
      .filter(question => question.isActive && question.organizationId === organizationId)
      .sort((a, b) => a.order - b.order);
  }

  // Wins
  async getWin(organizationId: string, id: string): Promise<Win | undefined> {
    const win = this.wins.get(id);
    return win && win.organizationId === organizationId ? win : undefined;
  }

  async createWin(organizationId: string, insertWin: InsertWin): Promise<Win> {
    const win: Win = {
      ...insertWin,
      id: randomUUID(),
      organizationId,
      createdAt: new Date(),
      nominatedBy: insertWin.nominatedBy ?? null,
      isPublic: insertWin.isPublic ?? true,
      slackMessageId: insertWin.slackMessageId ?? null,
    };
    this.wins.set(win.id, win);
    return win;
  }

  async updateWin(organizationId: string, id: string, winUpdate: Partial<InsertWin>): Promise<Win | undefined> {
    const win = this.wins.get(id);
    if (!win || win.organizationId !== organizationId) return undefined;
    
    const updatedWin = { ...win, ...winUpdate };
    this.wins.set(id, updatedWin);
    return updatedWin;
  }

  async deleteWin(organizationId: string, id: string): Promise<boolean> {
    const win = this.wins.get(id);
    if (!win || win.organizationId !== organizationId) return false;
    return this.wins.delete(id);
  }

  async getRecentWins(organizationId: string, limit = 10): Promise<Win[]> {
    return Array.from(this.wins.values())
      .filter(win => win.organizationId === organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async getPublicWins(organizationId: string, limit = 10): Promise<Win[]> {
    return Array.from(this.wins.values())
      .filter(win => win.isPublic && win.organizationId === organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // Comments
  async getComment(organizationId: string, id: string): Promise<Comment | undefined> {
    const comment = this.comments.get(id);
    return comment && comment.organizationId === organizationId ? comment : undefined;
  }

  async createComment(organizationId: string, insertComment: InsertComment): Promise<Comment> {
    const comment: Comment = {
      ...insertComment,
      id: randomUUID(),
      organizationId,
      createdAt: new Date(),
    };
    this.comments.set(comment.id, comment);
    return comment;
  }

  async updateComment(organizationId: string, id: string, commentUpdate: Partial<InsertComment>): Promise<Comment | undefined> {
    const comment = this.comments.get(id);
    if (!comment || comment.organizationId !== organizationId) return undefined;
    
    const updatedComment = { ...comment, ...commentUpdate };
    this.comments.set(id, updatedComment);
    return updatedComment;
  }

  async deleteComment(organizationId: string, id: string): Promise<boolean> {
    const comment = this.comments.get(id);
    if (!comment || comment.organizationId !== organizationId) return false;
    return this.comments.delete(id);
  }

  async getCommentsByCheckin(organizationId: string, checkinId: string): Promise<Comment[]> {
    return Array.from(this.comments.values())
      .filter(comment => comment.checkinId === checkinId && comment.organizationId === organizationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  // Kudos
  async getShoutout(organizationId: string, id: string): Promise<Shoutout | undefined> {
    const shoutoutRecord = this.shoutoutsMap.get(id);
    return shoutoutRecord && shoutoutRecord.organizationId === organizationId ? shoutoutRecord : undefined;
  }

  async createShoutout(organizationId: string, insertShoutout: InsertShoutout & { fromUserId: string }): Promise<Shoutout> {
    const shoutoutRecord: Shoutout = {
      ...insertShoutout,
      id: randomUUID(),
      organizationId,
      createdAt: new Date(),
      isPublic: insertShoutout.isPublic ?? true,
      slackMessageId: insertShoutout.slackMessageId ?? null,
    };
    this.shoutoutsMap.set(shoutoutRecord.id, shoutoutRecord);
    return shoutoutRecord;
  }

  async updateShoutout(organizationId: string, id: string, shoutoutUpdate: Partial<InsertShoutout>): Promise<Shoutout | undefined> {
    const shoutoutRecord = this.shoutoutsMap.get(id);
    if (!shoutoutRecord || shoutoutRecord.organizationId !== organizationId) return undefined;
    
    const updatedShoutout = { ...shoutoutRecord, ...shoutoutUpdate };
    this.shoutoutsMap.set(id, updatedShoutout);
    return updatedShoutout;
  }

  async deleteShoutout(organizationId: string, id: string): Promise<boolean> {
    const shoutoutRecord = this.shoutoutsMap.get(id);
    if (!shoutoutRecord || shoutoutRecord.organizationId !== organizationId) return false;
    return this.shoutoutsMap.delete(id);
  }

  async getShoutoutsByUser(organizationId: string, userId: string, type?: 'received' | 'given'): Promise<Shoutout[]> {
    return Array.from(this.shoutoutsMap.values())
      .filter(shoutoutRecord => {
        if (shoutoutRecord.organizationId !== organizationId) return false;
        
        if (type === 'received') {
          return shoutoutRecord.toUserId === userId;
        } else if (type === 'given') {
          return shoutoutRecord.fromUserId === userId;
        } else {
          // Return both received and given
          return shoutoutRecord.toUserId === userId || shoutoutRecord.fromUserId === userId;
        }
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getRecentShoutouts(organizationId: string, limit = 20): Promise<Shoutout[]> {
    return Array.from(this.shoutoutsMap.values())
      .filter(shoutoutRecord => shoutoutRecord.organizationId === organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async getPublicShoutouts(organizationId: string, limit = 20): Promise<Shoutout[]> {
    return Array.from(this.shoutoutsMap.values())
      .filter(shoutoutRecord => shoutoutRecord.isPublic && shoutoutRecord.organizationId === organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // Analytics helper methods
  private truncateDate(date: Date, period: string): Date {
    const d = new Date(date);
    
    switch (period) {
      case 'day':
        d.setHours(0, 0, 0, 0);
        break;
      case 'week':
        d.setDate(d.getDate() - d.getDay()); // Start of week (Sunday)
        d.setHours(0, 0, 0, 0);
        break;
      case 'month':
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        break;
      case 'quarter':
        const quarterStartMonth = Math.floor(d.getMonth() / 3) * 3;
        d.setMonth(quarterStartMonth);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        break;
      case 'year':
        d.setMonth(0);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        break;
      default:
        d.setHours(0, 0, 0, 0);
    }
    
    return d;
  }

  private isInDateRange(date: Date, from?: Date, to?: Date): boolean {
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  }

  // Analytics methods
  async getPulseMetrics(organizationId: string, options: PulseMetricsOptions): Promise<PulseMetricsResult[]> {
    const { scope, entityId, period, from, to } = options;

    // Get all relevant checkins
    let relevantCheckins = Array.from(this.checkins.values())
      .filter(checkin => checkin.organizationId === organizationId && checkin.isComplete);

    // Apply date filtering - use weekOf for consistency with database implementation
    if (from || to) {
      relevantCheckins = relevantCheckins.filter(checkin => this.isInDateRange(checkin.weekOf, from, to));
    }

    // Apply scope filtering
    if (scope === 'user' && entityId) {
      relevantCheckins = relevantCheckins.filter(checkin => checkin.userId === entityId);
    } else if (scope === 'team' && entityId) {
      const teamUsers = Array.from(this.users.values())
        .filter(user => user.teamId === entityId && user.organizationId === organizationId)
        .map(user => user.id);
      relevantCheckins = relevantCheckins.filter(checkin => teamUsers.includes(checkin.userId));
    }

    // Group by period
    const groupedData = new Map<string, { moodSum: number; count: number }>();
    
    relevantCheckins.forEach(checkin => {
      const periodStart = this.truncateDate(checkin.weekOf, period);
      const periodKey = periodStart.toISOString();
      
      const existing = groupedData.get(periodKey) || { moodSum: 0, count: 0 };
      existing.moodSum += checkin.overallMood;
      existing.count += 1;
      groupedData.set(periodKey, existing);
    });

    // Convert to results
    const results: PulseMetricsResult[] = Array.from(groupedData.entries())
      .map(([periodKey, data]) => ({
        periodStart: new Date(periodKey),
        avgMood: data.count > 0 ? data.moodSum / data.count : 0,
        checkinCount: data.count
      }))
      .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());

    return results;
  }

  async getShoutoutMetrics(organizationId: string, options: ShoutoutMetricsOptions): Promise<ShoutoutMetricsResult[]> {
    const { scope, entityId, direction = 'all', visibility = 'all', period, from, to } = options;

    // Get all relevant shoutouts
    let relevantShoutouts = Array.from(this.shoutoutsMap.values())
      .filter(shoutout => shoutout.organizationId === organizationId);

    // Apply date filtering
    if (from || to) {
      relevantShoutouts = relevantShoutouts.filter(shoutout => this.isInDateRange(shoutout.createdAt, from, to));
    }

    // Apply scope and direction filtering
    if (scope === 'user' && entityId) {
      if (direction === 'received') {
        relevantShoutouts = relevantShoutouts.filter(shoutout => shoutout.toUserId === entityId);
      } else if (direction === 'given') {
        relevantShoutouts = relevantShoutouts.filter(shoutout => shoutout.fromUserId === entityId);
      } else {
        relevantShoutouts = relevantShoutouts.filter(shoutout => 
          shoutout.toUserId === entityId || shoutout.fromUserId === entityId);
      }
    } else if (scope === 'team' && entityId) {
      const teamUsers = Array.from(this.users.values())
        .filter(user => user.teamId === entityId && user.organizationId === organizationId)
        .map(user => user.id);
      
      if (direction === 'received') {
        relevantShoutouts = relevantShoutouts.filter(shoutout => teamUsers.includes(shoutout.toUserId));
      } else if (direction === 'given') {
        relevantShoutouts = relevantShoutouts.filter(shoutout => teamUsers.includes(shoutout.fromUserId));
      } else {
        relevantShoutouts = relevantShoutouts.filter(shoutout => 
          teamUsers.includes(shoutout.toUserId) || teamUsers.includes(shoutout.fromUserId));
      }
    }

    // Apply visibility filtering
    if (visibility === 'public') {
      relevantShoutouts = relevantShoutouts.filter(shoutout => shoutout.isPublic);
    } else if (visibility === 'private') {
      relevantShoutouts = relevantShoutouts.filter(shoutout => !shoutout.isPublic);
    }

    // Group by period
    const groupedData = new Map<string, number>();
    
    relevantShoutouts.forEach(shoutout => {
      const periodStart = this.truncateDate(shoutout.createdAt, period);
      const periodKey = periodStart.toISOString();
      
      const existing = groupedData.get(periodKey) || 0;
      groupedData.set(periodKey, existing + 1);
    });

    // Convert to results
    const results: ShoutoutMetricsResult[] = Array.from(groupedData.entries())
      .map(([periodKey, count]) => ({
        periodStart: new Date(periodKey),
        count
      }))
      .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());

    return results;
  }

  async getLeaderboard(organizationId: string, options: LeaderboardOptions): Promise<LeaderboardEntry[]> {
    const { metric, scope, entityId, from, to, limit = 10 } = options;

    let results: LeaderboardEntry[] = [];

    if (metric === 'shoutouts_received') {
      let relevantShoutouts = Array.from(this.shoutoutsMap.values())
        .filter(shoutout => shoutout.organizationId === organizationId);

      // Apply date filtering
      if (from || to) {
        relevantShoutouts = relevantShoutouts.filter(shoutout => this.isInDateRange(shoutout.createdAt, from, to));
      }

      if (scope === 'user') {
        // Filter by team if entityId is provided (showing users within a team)
        let eligibleUsers = Array.from(this.users.values())
          .filter(user => user.organizationId === organizationId);
        
        if (entityId) {
          eligibleUsers = eligibleUsers.filter(user => user.teamId === entityId);
        }

        // Count shoutouts received per user
        const userCounts = new Map<string, number>();
        relevantShoutouts.forEach(shoutout => {
          if (eligibleUsers.some(user => user.id === shoutout.toUserId)) {
            const current = userCounts.get(shoutout.toUserId) || 0;
            userCounts.set(shoutout.toUserId, current + 1);
          }
        });

        results = Array.from(userCounts.entries())
          .map(([userId, count]) => ({
            entityId: userId,
            entityName: eligibleUsers.find(user => user.id === userId)?.name || 'Unknown',
            value: count
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, limit);
      } else if (scope === 'team') {
        const teams = Array.from(this.teams.values())
          .filter(team => team.organizationId === organizationId);

        // Count shoutouts received per team
        const teamCounts = new Map<string, number>();
        relevantShoutouts.forEach(shoutout => {
          const user = Array.from(this.users.values()).find(u => u.id === shoutout.toUserId);
          if (user && user.teamId) {
            const current = teamCounts.get(user.teamId) || 0;
            teamCounts.set(user.teamId, current + 1);
          }
        });

        results = Array.from(teamCounts.entries())
          .map(([teamId, count]) => ({
            entityId: teamId,
            entityName: teams.find(team => team.id === teamId)?.name || 'Unknown',
            value: count
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, limit);
      }
    } else if (metric === 'shoutouts_given') {
      let relevantShoutouts = Array.from(this.shoutoutsMap.values())
        .filter(shoutout => shoutout.organizationId === organizationId);

      // Apply date filtering
      if (from || to) {
        relevantShoutouts = relevantShoutouts.filter(shoutout => this.isInDateRange(shoutout.createdAt, from, to));
      }

      if (scope === 'user') {
        let eligibleUsers = Array.from(this.users.values())
          .filter(user => user.organizationId === organizationId);
        
        if (entityId) {
          eligibleUsers = eligibleUsers.filter(user => user.teamId === entityId);
        }

        // Count shoutouts given per user
        const userCounts = new Map<string, number>();
        relevantShoutouts.forEach(shoutout => {
          if (eligibleUsers.some(user => user.id === shoutout.fromUserId)) {
            const current = userCounts.get(shoutout.fromUserId) || 0;
            userCounts.set(shoutout.fromUserId, current + 1);
          }
        });

        results = Array.from(userCounts.entries())
          .map(([userId, count]) => ({
            entityId: userId,
            entityName: eligibleUsers.find(user => user.id === userId)?.name || 'Unknown',
            value: count
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, limit);
      }
    } else if (metric === 'pulse_avg') {
      let relevantCheckins = Array.from(this.checkins.values())
        .filter(checkin => checkin.organizationId === organizationId && checkin.isComplete);

      // Apply date filtering - use weekOf for consistency with database implementation
      if (from || to) {
        relevantCheckins = relevantCheckins.filter(checkin => this.isInDateRange(checkin.weekOf, from, to));
      }

      if (scope === 'user') {
        let eligibleUsers = Array.from(this.users.values())
          .filter(user => user.organizationId === organizationId);
        
        if (entityId) {
          eligibleUsers = eligibleUsers.filter(user => user.teamId === entityId);
        }

        // Calculate average mood per user
        const userMoods = new Map<string, { sum: number; count: number }>();
        relevantCheckins.forEach(checkin => {
          if (eligibleUsers.some(user => user.id === checkin.userId)) {
            const existing = userMoods.get(checkin.userId) || { sum: 0, count: 0 };
            existing.sum += checkin.overallMood;
            existing.count += 1;
            userMoods.set(checkin.userId, existing);
          }
        });

        results = Array.from(userMoods.entries())
          .map(([userId, data]) => ({
            entityId: userId,
            entityName: eligibleUsers.find(user => user.id === userId)?.name || 'Unknown',
            value: data.count > 0 ? data.sum / data.count : 0
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, limit);
      } else if (scope === 'team') {
        const teams = Array.from(this.teams.values())
          .filter(team => team.organizationId === organizationId);

        // Calculate average mood per team
        const teamMoods = new Map<string, { sum: number; count: number }>();
        relevantCheckins.forEach(checkin => {
          const user = Array.from(this.users.values()).find(u => u.id === checkin.userId);
          if (user && user.teamId) {
            const existing = teamMoods.get(user.teamId) || { sum: 0, count: 0 };
            existing.sum += checkin.overallMood;
            existing.count += 1;
            teamMoods.set(user.teamId, existing);
          }
        });

        results = Array.from(teamMoods.entries())
          .map(([teamId, data]) => ({
            entityId: teamId,
            entityName: teams.find(team => team.id === teamId)?.name || 'Unknown',
            value: data.count > 0 ? data.sum / data.count : 0
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, limit);
      }
    }

    return results;
  }

  async getAnalyticsOverview(organizationId: string, period: AnalyticsPeriod, from: Date, to: Date): Promise<AnalyticsOverview> {
    const periodLength = to.getTime() - from.getTime();
    const previousFrom = new Date(from.getTime() - periodLength);
    const previousTo = from;

    // Current period data
    const currentCheckins = Array.from(this.checkins.values())
      .filter(checkin => checkin.organizationId === organizationId && checkin.isComplete &&
        this.isInDateRange(checkin.createdAt, from, to));

    const currentShoutouts = Array.from(this.shoutoutsMap.values())
      .filter(shoutout => shoutout.organizationId === organizationId &&
        this.isInDateRange(shoutout.createdAt, from, to));

    const currentActiveUsers = new Set(currentCheckins.map(c => c.userId)).size;

    // Previous period data
    const previousCheckins = Array.from(this.checkins.values())
      .filter(checkin => checkin.organizationId === organizationId && checkin.isComplete &&
        this.isInDateRange(checkin.createdAt, previousFrom, previousTo));

    const previousShoutouts = Array.from(this.shoutoutsMap.values())
      .filter(shoutout => shoutout.organizationId === organizationId &&
        this.isInDateRange(shoutout.createdAt, previousFrom, previousTo));

    const previousActiveUsers = new Set(previousCheckins.map(c => c.userId)).size;

    // Calculate metrics
    const currentPulseAvg = currentCheckins.length > 0 
      ? currentCheckins.reduce((sum, c) => sum + c.overallMood, 0) / currentCheckins.length 
      : 0;
    
    const previousPulseAvg = previousCheckins.length > 0 
      ? previousCheckins.reduce((sum, c) => sum + c.overallMood, 0) / previousCheckins.length 
      : 0;

    const currentShoutoutCount = currentShoutouts.length;
    const previousShoutoutCount = previousShoutouts.length;
    const currentCompletedCheckins = currentCheckins.length;
    const previousCompletedCheckins = previousCheckins.length;

    return {
      pulseAvg: {
        current: currentPulseAvg,
        previous: previousPulseAvg,
        change: previousPulseAvg > 0 ? ((currentPulseAvg - previousPulseAvg) / previousPulseAvg) * 100 : 0
      },
      totalShoutouts: {
        current: currentShoutoutCount,
        previous: previousShoutoutCount,
        change: previousShoutoutCount > 0 ? ((currentShoutoutCount - previousShoutoutCount) / previousShoutoutCount) * 100 : 0
      },
      activeUsers: {
        current: currentActiveUsers,
        previous: previousActiveUsers,
        change: previousActiveUsers > 0 ? ((currentActiveUsers - previousActiveUsers) / previousActiveUsers) * 100 : 0
      },
      completedCheckins: {
        current: currentCompletedCheckins,
        previous: previousCompletedCheckins,
        change: previousCompletedCheckins > 0 ? ((currentCompletedCheckins - previousCompletedCheckins) / previousCompletedCheckins) * 100 : 0
      }
    };
  }

  async getCheckinComplianceMetrics(organizationId: string, options?: ComplianceMetricsOptions): Promise<ComplianceMetricsResult[]> {
    const { scope = 'organization', entityId, period, from, to } = options || {};

    // Filter submitted check-ins only
    let relevantCheckins = Array.from(this.checkins.values())
      .filter(checkin => checkin.organizationId === organizationId && checkin.isComplete);

    // Apply scope filtering
    if (scope === 'user' && entityId) {
      relevantCheckins = relevantCheckins.filter(checkin => checkin.userId === entityId);
    } else if (scope === 'team' && entityId) {
      const teamUsers = Array.from(this.users.values())
        .filter(user => user.teamId === entityId && user.organizationId === organizationId)
        .map(user => user.id);
      relevantCheckins = relevantCheckins.filter(checkin => teamUsers.includes(checkin.userId));
    }

    // Apply date filtering
    if (from || to) {
      relevantCheckins = relevantCheckins.filter(checkin => this.isInDateRange(checkin.weekOf, from, to));
    }

    // Add vacation status to each checkin
    const checkinsWithVacationStatus = await Promise.all(
      relevantCheckins.map(async (checkin) => {
        const isOnVacation = await this.isUserOnVacation(organizationId, checkin.userId, checkin.weekOf);
        return { ...checkin, isOnVacation };
      })
    );

    let complianceResults: ComplianceMetricsResult[] = [];

    if (period) {
      // Group by period
      const groupedData = new Map<string, any[]>();
      
      checkinsWithVacationStatus.forEach(checkin => {
        const periodStart = this.truncateDate(checkin.weekOf, period);
        const periodKey = periodStart.toISOString();
        
        if (!groupedData.has(periodKey)) {
          groupedData.set(periodKey, []);
        }
        groupedData.get(periodKey)!.push(checkin);
      });

      // Calculate metrics for each period
      complianceResults = Array.from(groupedData.entries()).map(([periodKey, checkins]) => ({
        periodStart: new Date(periodKey),
        metrics: this.calculateMemComplianceMetrics(checkins)
      })).sort((a, b) => a.periodStart!.getTime() - b.periodStart!.getTime());

    } else {
      // Aggregate metrics
      complianceResults = [{
        metrics: this.calculateMemComplianceMetrics(checkinsWithVacationStatus)
      }];
    }

    return complianceResults;
  }

  async getReviewComplianceMetrics(organizationId: string, options?: ComplianceMetricsOptions): Promise<ComplianceMetricsResult[]> {
    const { scope = 'organization', entityId, period, from, to } = options || {};

    // Filter reviewed check-ins only
    let relevantReviews = Array.from(this.checkins.values())
      .filter(checkin => 
        checkin.organizationId === organizationId && 
        checkin.isComplete && 
        checkin.reviewedAt !== null
      );

    // Apply scope filtering
    if (scope === 'user' && entityId) {
      // For user scope in reviews, we filter by the reviewer (reviewedBy)
      relevantReviews = relevantReviews.filter(checkin => checkin.reviewedBy === entityId);
    } else if (scope === 'team' && entityId) {
      // For team scope, get reviews done by team leaders
      const team = Array.from(this.teams.values()).find(t => t.id === entityId && t.organizationId === organizationId);
      if (team) {
        relevantReviews = relevantReviews.filter(checkin => checkin.reviewedBy === team.leaderId);
      } else {
        // No team found - return empty results
        return [{ metrics: { totalCount: 0, onTimeCount: 0, onTimePercentage: 0 } }];
      }
    }

    // Apply date filtering
    if (from || to) {
      relevantReviews = relevantReviews.filter(checkin => this.isInDateRange(checkin.weekOf, from, to));
    }

    // Add reviewer vacation status to each review
    const reviewsWithVacationStatus = await Promise.all(
      relevantReviews.map(async (review) => {
        const reviewerOnVacation = review.reviewedBy ? 
          await this.isUserOnVacation(organizationId, review.reviewedBy, review.weekOf) : false;
        return { ...review, reviewerOnVacation };
      })
    );

    let complianceResults: ComplianceMetricsResult[] = [];

    if (period) {
      // Group by period
      const groupedData = new Map<string, any[]>();
      
      reviewsWithVacationStatus.forEach(review => {
        const periodStart = this.truncateDate(review.weekOf, period);
        const periodKey = periodStart.toISOString();
        
        if (!groupedData.has(periodKey)) {
          groupedData.set(periodKey, []);
        }
        groupedData.get(periodKey)!.push(review);
      });

      // Calculate metrics for each period
      complianceResults = Array.from(groupedData.entries()).map(([periodKey, reviews]) => ({
        periodStart: new Date(periodKey),
        metrics: this.calculateMemReviewComplianceMetrics(reviews)
      })).sort((a, b) => a.periodStart!.getTime() - b.periodStart!.getTime());

    } else {
      // Aggregate metrics
      complianceResults = [{
        metrics: this.calculateMemReviewComplianceMetrics(reviewsWithVacationStatus)
      }];
    }

    return complianceResults;
  }

  private calculateMemComplianceMetrics(checkins: any[]): any {
    if (checkins.length === 0) {
      return { totalCount: 0, onTimeCount: 0, onTimePercentage: 0 };
    }

    // Separate vacation and non-vacation weeks
    const nonVacationCheckins = checkins.filter(c => !c.isOnVacation);
    const vacationCheckins = checkins.filter(c => c.isOnVacation);

    // For compliance calculation:
    // - totalCount = non-vacation weeks only (these are "due" weeks)
    // - onTimeCount = on-time submissions from both vacation and non-vacation weeks
    const totalDueCount = nonVacationCheckins.length;
    const onTimeCount = checkins.filter(c => c.submittedOnTime).length;
    const onTimePercentage = totalDueCount > 0 ? (onTimeCount / totalDueCount) * 100 : 0;

    // Calculate average days early/late for all submissions
    let totalDaysDiff = 0;
    let earlyCount = 0;
    let lateSubmissions = [];

    checkins.forEach(checkin => {
      if (checkin.submittedAt && checkin.dueDate) {
        const diffMs = checkin.submittedAt.getTime() - checkin.dueDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        
        totalDaysDiff += diffDays;
        
        if (diffDays < 0) { // Early submission (negative difference)
          earlyCount++;
        } else if (diffDays > 0) { // Late submission
          lateSubmissions.push(diffDays);
        }
      }
    });

    const averageDaysEarly = earlyCount > 0 ? Math.abs(totalDaysDiff / checkins.length) : undefined;
    const averageDaysLate = lateSubmissions.length > 0 
      ? lateSubmissions.reduce((sum, days) => sum + days, 0) / lateSubmissions.length 
      : undefined;

    return {
      totalCount: totalDueCount, // Only non-vacation weeks count as "due"
      onTimeCount, // All on-time submissions count positively
      onTimePercentage: Math.round(onTimePercentage * 100) / 100,
      averageDaysEarly,
      averageDaysLate,
      vacationWeeks: vacationCheckins.length // Additional info for debugging
    };
  }

  private calculateMemReviewComplianceMetrics(reviews: any[]): any {
    if (reviews.length === 0) {
      return { totalCount: 0, onTimeCount: 0, onTimePercentage: 0 };
    }

    // Separate vacation and non-vacation weeks for reviewers
    const nonVacationReviews = reviews.filter(r => !r.reviewerOnVacation);
    const vacationReviews = reviews.filter(r => r.reviewerOnVacation);

    // For review compliance calculation:
    // - totalCount = non-vacation weeks only (weeks when reviewer was expected to review)
    // - onTimeCount = on-time reviews from both vacation and non-vacation weeks
    const totalDueCount = nonVacationReviews.length;
    const onTimeCount = reviews.filter(r => r.reviewedOnTime).length;
    const onTimePercentage = totalDueCount > 0 ? (onTimeCount / totalDueCount) * 100 : 0;

    // Calculate average days early/late for all reviews
    let totalDaysDiff = 0;
    let earlyCount = 0;
    let lateReviews = [];

    reviews.forEach(review => {
      if (review.reviewedAt && review.reviewDueDate) {
        const diffMs = review.reviewedAt.getTime() - review.reviewDueDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        
        totalDaysDiff += diffDays;
        
        if (diffDays < 0) { // Early review (negative difference)
          earlyCount++;
        } else if (diffDays > 0) { // Late review
          lateReviews.push(diffDays);
        }
      }
    });

    const averageDaysEarly = earlyCount > 0 ? Math.abs(totalDaysDiff / reviews.length) : undefined;
    const averageDaysLate = lateReviews.length > 0 
      ? lateReviews.reduce((sum, days) => sum + days, 0) / lateReviews.length 
      : undefined;

    return {
      totalCount: totalDueCount, // Only non-vacation weeks count as "due"
      onTimeCount, // All on-time reviews count positively
      onTimePercentage: Math.round(onTimePercentage * 100) / 100,
      averageDaysEarly,
      averageDaysLate,
      reviewerVacationWeeks: vacationReviews.length // Additional info for debugging
    };
  }

  // Vacations
  async getUserVacationsByRange(organizationId: string, userId: string, from?: Date, to?: Date): Promise<Vacation[]> {
    const allVacations = Array.from(this.vacations.values())
      .filter(vacation => 
        vacation.organizationId === organizationId && 
        vacation.userId === userId
      );

    let filteredVacations = allVacations;
    
    if (from) {
      filteredVacations = filteredVacations.filter(vacation => vacation.weekOf >= from);
    }
    if (to) {
      filteredVacations = filteredVacations.filter(vacation => vacation.weekOf <= to);
    }

    return filteredVacations.sort((a, b) => b.weekOf.getTime() - a.weekOf.getTime());
  }

  async upsertVacationWeek(organizationId: string, userId: string, weekOf: Date, note?: string): Promise<Vacation> {
    // Normalize weekOf to Monday 00:00 Central Time
    const normalizedWeekOf = getWeekStartCentral(weekOf);

    // Create a key for finding existing vacation
    const key = `${organizationId}:${userId}:${normalizedWeekOf.getTime()}`;
    
    // Check if vacation already exists
    const existingVacation = Array.from(this.vacations.values())
      .find(v => 
        v.organizationId === organizationId && 
        v.userId === userId && 
        v.weekOf.getTime() === normalizedWeekOf.getTime()
      );

    const vacation: Vacation = {
      id: existingVacation?.id || randomUUID(),
      organizationId,
      userId,
      weekOf: normalizedWeekOf,
      note: note ?? null,
      createdAt: existingVacation?.createdAt || new Date(),
    };

    this.vacations.set(vacation.id, vacation);
    
    // Invalidate analytics cache for this organization since vacation status affects compliance metrics
    this.analyticsCache.invalidateForOrganization(organizationId);
    
    // Trigger re-aggregation for the affected week (fire-and-forget)
    // This ensures compliance metrics are recalculated with the new vacation status
    AggregationService.getInstance().recomputeUserDayAggregates(
      organizationId, 
      userId, 
      normalizedWeekOf
    ).catch(error => {
      console.error(`Failed to recompute aggregates after vacation upsert for user ${userId}:`, error);
    });
    
    return vacation;
  }

  async deleteVacationWeek(organizationId: string, userId: string, weekOf: Date): Promise<boolean> {
    // Normalize weekOf to Monday 00:00 Central Time
    const normalizedWeekOf = getWeekStartCentral(weekOf);

    const vacationToDelete = Array.from(this.vacations.values())
      .find(v => 
        v.organizationId === organizationId && 
        v.userId === userId && 
        v.weekOf.getTime() === normalizedWeekOf.getTime()
      );

    if (vacationToDelete) {
      this.vacations.delete(vacationToDelete.id);
      
      // Invalidate analytics cache for this organization since vacation status affects compliance metrics
      this.analyticsCache.invalidateForOrganization(organizationId);
      
      // Trigger re-aggregation for the affected week (fire-and-forget)
      // This ensures compliance metrics are recalculated with the updated vacation status
      AggregationService.getInstance().recomputeUserDayAggregates(
        organizationId, 
        userId, 
        normalizedWeekOf
      ).catch(error => {
        console.error(`Failed to recompute aggregates after vacation deletion for user ${userId}:`, error);
      });
      
      return true;
    }

    return false;
  }

  async isUserOnVacation(organizationId: string, userId: string, weekOf: Date): Promise<boolean> {
    // Normalize weekOf to Monday 00:00 Central Time
    const normalizedWeekOf = getWeekStartCentral(weekOf);

    const vacation = Array.from(this.vacations.values())
      .find(v => 
        v.organizationId === organizationId && 
        v.userId === userId && 
        v.weekOf.getTime() === normalizedWeekOf.getTime()
      );

    return !!vacation;
  }
}

export const storage = new DatabaseStorage();
