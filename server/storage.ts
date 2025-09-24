import { 
  type User, type InsertUser,
  type Team, type InsertTeam, type TeamHierarchy,
  type Checkin, type InsertCheckin,
  type Question, type InsertQuestion,
  type Win, type InsertWin,
  type Comment, type InsertComment,
  type Shoutout, type InsertShoutout,
  type Vacation, type InsertVacation,
  type Organization, type InsertOrganization,
  type OneOnOne, type InsertOneOnOne,
  type KraTemplate, type InsertKraTemplate,
  type UserKra, type InsertUserKra,
  type ActionItem, type InsertActionItem,
  type BugReport, type InsertBugReport,
  type PartnerApplication, type InsertPartnerApplication,
  type ReviewCheckin, type ReviewStatusType,
  type PulseMetricsOptions, type PulseMetricsResult,
  type ShoutoutMetricsOptions, type ShoutoutMetricsResult,
  type LeaderboardOptions, type LeaderboardEntry,
  type AnalyticsOverview, type AnalyticsPeriod,
  type ComplianceMetricsOptions, type ComplianceMetricsResult,
  type SystemSetting, type InsertSystemSetting,
  type PricingPlan, type InsertPricingPlan,
  type DiscountCode, type InsertDiscountCode,
  type DiscountCodeUsage, type InsertDiscountCodeUsage,
  type DashboardConfig, type InsertDashboardConfig,
  type DashboardWidgetTemplate, type InsertDashboardWidgetTemplate,
  users, teams, checkins, questions, wins, comments, shoutouts, vacations, organizations,
  oneOnOnes, kraTemplates, userKras, actionItems, bugReports, partnerApplications,
  systemSettings, pricingPlans, discountCodes, discountCodeUsage, dashboardConfigs, dashboardWidgetTemplates,
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
    for (const key of Array.from(this.cache.keys())) {
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
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

export interface IStorage {
  // Organizations
  getAllOrganizations(): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization | undefined>;
  getOrganizationBySlug(slug: string): Promise<Organization | undefined>;
  createOrganization(organization: InsertOrganization): Promise<Organization>;
  updateOrganization(id: string, organization: Partial<InsertOrganization>): Promise<Organization | undefined>;
  
  // Super Admin Methods - Cross-organization access
  getAllUsersGlobal(includeInactive?: boolean): Promise<User[]>;
  getUserGlobal(userId: string): Promise<User | undefined>;
  updateUserGlobal(userId: string, user: Partial<InsertUser>): Promise<User | undefined>;
  deactivateOrganization(organizationId: string): Promise<boolean>;
  getOrganizationStats(organizationId: string): Promise<{ userCount: number; teamCount: number; activeUsers: number }>;
  getSystemStats(): Promise<{ totalOrganizations: number; totalUsers: number; activeOrganizations: number; activeUsers: number }>;
  
  // Users
  getUser(organizationId: string, id: string): Promise<User | undefined>;
  getUserByUsername(organizationId: string, username: string): Promise<User | undefined>;
  getUserByEmail(organizationId: string, email: string): Promise<User | undefined>;
  getUserBySlackId(organizationId: string, slackUserId: string): Promise<User | undefined>;
  getUserByMicrosoftId(organizationId: string, microsoftUserId: string): Promise<User | undefined>;
  createUser(organizationId: string, user: InsertUser): Promise<User>;
  updateUser(organizationId: string, id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  getUsersByTeam(organizationId: string, teamId: string, includeInactive?: boolean): Promise<User[]>;
  getUsersByManager(organizationId: string, managerId: string, includeInactive?: boolean): Promise<User[]>;
  getUsersByTeamLeadership(organizationId: string, leaderId: string, includeInactive?: boolean): Promise<User[]>;
  getAllUsers(organizationId: string, includeInactive?: boolean): Promise<User[]>;

  // Teams
  getTeam(organizationId: string, id: string): Promise<Team | undefined>;
  createTeam(organizationId: string, team: InsertTeam): Promise<Team>;
  updateTeam(organizationId: string, id: string, team: Partial<InsertTeam>): Promise<Team | undefined>;
  deleteTeam(organizationId: string, id: string): Promise<boolean>;
  getAllTeams(organizationId: string): Promise<Team[]>;
  
  // Hierarchical team methods
  getTeamHierarchy(organizationId: string): Promise<TeamHierarchy[]>;
  getTeamChildren(organizationId: string, parentId: string): Promise<Team[]>;
  getTeamDescendants(organizationId: string, parentId: string): Promise<Team[]>;
  getRootTeams(organizationId: string): Promise<Team[]>;
  createTeamWithHierarchy(organizationId: string, team: InsertTeam): Promise<Team>;
  moveTeam(organizationId: string, teamId: string, newParentId: string | null): Promise<Team | undefined>;

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

  // One-on-One Meetings
  getOneOnOne(organizationId: string, id: string): Promise<OneOnOne | undefined>;
  getAllOneOnOnes(organizationId: string): Promise<OneOnOne[]>;
  createOneOnOne(organizationId: string, oneOnOne: InsertOneOnOne): Promise<OneOnOne>;
  updateOneOnOne(organizationId: string, id: string, oneOnOne: Partial<InsertOneOnOne>): Promise<OneOnOne | undefined>;
  deleteOneOnOne(organizationId: string, id: string): Promise<boolean>;
  getOneOnOnesByUser(organizationId: string, userId: string): Promise<OneOnOne[]>;
  getOneOnOnesByParticipants(organizationId: string, participantOneId: string, participantTwoId: string): Promise<OneOnOne[]>;
  getAllUpcomingOneOnOnes(organizationId: string): Promise<OneOnOne[]>;
  getUpcomingOneOnOnes(organizationId: string, userId: string): Promise<OneOnOne[]>;
  getAllPastOneOnOnes(organizationId: string): Promise<OneOnOne[]>;
  getPastOneOnOnes(organizationId: string, userId: string, limit?: number): Promise<OneOnOne[]>;

  // KRA Templates
  getKraTemplate(organizationId: string, id: string): Promise<KraTemplate | undefined>;
  createKraTemplate(organizationId: string, template: InsertKraTemplate): Promise<KraTemplate>;
  updateKraTemplate(organizationId: string, id: string, template: Partial<InsertKraTemplate>): Promise<KraTemplate | undefined>;
  deleteKraTemplate(organizationId: string, id: string): Promise<boolean>;
  getAllKraTemplates(organizationId: string, activeOnly?: boolean): Promise<KraTemplate[]>;
  getKraTemplatesByCategory(organizationId: string, category: string): Promise<KraTemplate[]>;

  // User KRAs
  getUserKra(organizationId: string, id: string): Promise<UserKra | undefined>;
  createUserKra(organizationId: string, userKra: InsertUserKra): Promise<UserKra>;
  updateUserKra(organizationId: string, id: string, userKra: Partial<InsertUserKra>): Promise<UserKra | undefined>;
  deleteUserKra(organizationId: string, id: string): Promise<boolean>;
  getUserKrasByUser(organizationId: string, userId: string, statusFilter?: string): Promise<UserKra[]>;
  getUserKrasByAssigner(organizationId: string, assignerId: string): Promise<UserKra[]>;
  getActiveUserKras(organizationId: string): Promise<UserKra[]>;

  // Action Items
  getActionItem(organizationId: string, id: string): Promise<ActionItem | undefined>;
  createActionItem(organizationId: string, actionItem: InsertActionItem): Promise<ActionItem>;
  updateActionItem(organizationId: string, id: string, actionItem: Partial<InsertActionItem>): Promise<ActionItem | undefined>;
  deleteActionItem(organizationId: string, id: string): Promise<boolean>;
  getActionItemsByMeeting(organizationId: string, meetingId: string): Promise<ActionItem[]>;
  getActionItemsByUser(organizationId: string, userId: string, statusFilter?: string): Promise<ActionItem[]>;
  getOverdueActionItems(organizationId: string): Promise<ActionItem[]>;

  // Bug Reports & Support System
  getBugReport(organizationId: string, id: string): Promise<BugReport | undefined>;
  createBugReport(organizationId: string, bugReport: InsertBugReport): Promise<BugReport>;
  updateBugReport(organizationId: string, id: string, bugReport: Partial<InsertBugReport>): Promise<BugReport | undefined>;
  getBugReports(organizationId: string, statusFilter?: string, userId?: string): Promise<BugReport[]>;
  getBugReportsByUser(organizationId: string, userId: string): Promise<BugReport[]>;

  // Super Admin - System Settings
  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  getAllSystemSettings(category?: string): Promise<SystemSetting[]>;
  createSystemSetting(setting: InsertSystemSetting): Promise<SystemSetting>;
  updateSystemSetting(id: string, setting: Partial<InsertSystemSetting>): Promise<SystemSetting | undefined>;
  deleteSystemSetting(id: string): Promise<boolean>;

  // Super Admin - Pricing Plans
  getPricingPlan(id: string): Promise<PricingPlan | undefined>;
  getAllPricingPlans(activeOnly?: boolean): Promise<PricingPlan[]>;
  createPricingPlan(plan: InsertPricingPlan): Promise<PricingPlan>;
  updatePricingPlan(id: string, plan: Partial<InsertPricingPlan>): Promise<PricingPlan | undefined>;
  deletePricingPlan(id: string): Promise<boolean>;

  // Super Admin - Discount Codes
  getDiscountCode(id: string): Promise<DiscountCode | undefined>;
  getDiscountCodeByCode(code: string): Promise<DiscountCode | undefined>;
  getAllDiscountCodes(activeOnly?: boolean): Promise<DiscountCode[]>;
  createDiscountCode(discountCode: InsertDiscountCode): Promise<DiscountCode>;
  updateDiscountCode(id: string, discountCode: Partial<InsertDiscountCode>): Promise<DiscountCode | undefined>;
  deleteDiscountCode(id: string): Promise<boolean>;
  validateDiscountCode(code: string, planId?: string, orderAmount?: number): Promise<{ valid: boolean; discountCode?: DiscountCode; reason?: string }>;
  applyDiscountCode(usage: InsertDiscountCodeUsage): Promise<DiscountCodeUsage>;
  getDiscountCodeUsage(discountCodeId: string): Promise<DiscountCodeUsage[]>;

  // Super Admin - Partner Applications
  getPartnerApplication(id: string): Promise<PartnerApplication | undefined>;
  getAllPartnerApplications(statusFilter?: string): Promise<PartnerApplication[]>;
  createPartnerApplication(application: InsertPartnerApplication): Promise<PartnerApplication>;
  updatePartnerApplication(id: string, application: Partial<InsertPartnerApplication>): Promise<PartnerApplication | undefined>;

  // Dashboard Configurations
  getDashboardConfig(organizationId: string, userId: string): Promise<DashboardConfig | undefined>;
  createDashboardConfig(organizationId: string, config: InsertDashboardConfig): Promise<DashboardConfig>;
  updateDashboardConfig(organizationId: string, userId: string, config: Partial<InsertDashboardConfig>): Promise<DashboardConfig | undefined>;
  resetDashboardConfig(organizationId: string, userId: string): Promise<boolean>;

  // Dashboard Widget Templates
  getDashboardWidgetTemplate(organizationId: string, id: string): Promise<DashboardWidgetTemplate | undefined>;
  getAllDashboardWidgetTemplates(organizationId: string, category?: string): Promise<DashboardWidgetTemplate[]>;
  createDashboardWidgetTemplate(organizationId: string, template: InsertDashboardWidgetTemplate): Promise<DashboardWidgetTemplate>;
  updateDashboardWidgetTemplate(organizationId: string, id: string, template: Partial<InsertDashboardWidgetTemplate>): Promise<DashboardWidgetTemplate | undefined>;
  deleteDashboardWidgetTemplate(organizationId: string, id: string): Promise<boolean>;
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

  // Organizations
  async getAllOrganizations(): Promise<Organization[]> {
    try {
      return await db.select().from(organizations);
    } catch (error) {
      console.error("Failed to fetch organizations:", error);
      throw error;
    }
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, id));
    return organization || undefined;
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | undefined> {
    const [organization] = await db.select().from(organizations).where(eq(organizations.slug, slug));
    return organization || undefined;
  }

  async createOrganization(insertOrganization: InsertOrganization): Promise<Organization> {
    const orgValues = {
      id: insertOrganization.id || undefined, // Let DB generate if not provided
      name: insertOrganization.name,
      slug: insertOrganization.slug,
      customValues: insertOrganization.customValues ?? undefined,
      plan: insertOrganization.plan ?? "starter",
      slackWorkspaceId: insertOrganization.slackWorkspaceId ?? null,
      isActive: insertOrganization.isActive ?? true,
    };

    const [organization] = await db
      .insert(organizations)
      .values(orgValues)
      .returning();
    return organization;
  }

  async updateOrganization(id: string, organizationUpdate: Partial<InsertOrganization>): Promise<Organization | undefined> {
    const updateData: Partial<typeof organizations.$inferInsert> = {};
    
    if (organizationUpdate.name !== undefined) updateData.name = organizationUpdate.name;
    if (organizationUpdate.customValues !== undefined) updateData.customValues = organizationUpdate.customValues;
    if (organizationUpdate.plan !== undefined) updateData.plan = organizationUpdate.plan;
    if (organizationUpdate.slackWorkspaceId !== undefined) updateData.slackWorkspaceId = organizationUpdate.slackWorkspaceId;
    if (organizationUpdate.isActive !== undefined) updateData.isActive = organizationUpdate.isActive;
    if (organizationUpdate.themeConfig !== undefined) updateData.themeConfig = organizationUpdate.themeConfig;
    if (organizationUpdate.enableCustomTheme !== undefined) updateData.enableCustomTheme = organizationUpdate.enableCustomTheme;

    try {
      const [updatedOrganization] = await db
        .update(organizations)
        .set(updateData)
        .where(eq(organizations.id, id))
        .returning();
      
      return updatedOrganization || undefined;
    } catch (error) {
      console.error("Failed to update organization:", error);
      return undefined;
    }
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

  async getUserBySlackId(organizationId: string, slackUserId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(
      and(eq(users.slackUserId, slackUserId), eq(users.organizationId, organizationId))
    );
    return user || undefined;
  }

  async getUserByMicrosoftId(organizationId: string, microsoftUserId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(
      and(eq(users.microsoftUserId, microsoftUserId), eq(users.organizationId, organizationId))
    );
    return user || undefined;
  }

  async createUser(organizationId: string, insertUser: InsertUser): Promise<User> {
    const userValues = {
      username: insertUser.username,
      password: insertUser.password ?? '',
      name: insertUser.name,
      email: insertUser.email,
      organizationId,
      role: insertUser.role ?? "member",
      teamId: insertUser.teamId ?? null,
      managerId: insertUser.managerId ?? null,
      avatar: insertUser.avatar ?? null,
      slackUserId: insertUser.slackUserId ?? null,
      slackUsername: insertUser.slackUsername ?? null,
      slackDisplayName: insertUser.slackDisplayName ?? null,
      slackEmail: insertUser.slackEmail ?? null,
      slackAvatar: insertUser.slackAvatar ?? null,
      slackWorkspaceId: insertUser.slackWorkspaceId ?? null,
      microsoftUserId: insertUser.microsoftUserId ?? null,
      microsoftUserPrincipalName: insertUser.microsoftUserPrincipalName ?? null,
      microsoftDisplayName: insertUser.microsoftDisplayName ?? null,
      microsoftEmail: insertUser.microsoftEmail ?? null,
      microsoftAvatar: insertUser.microsoftAvatar ?? null,
      microsoftTenantId: insertUser.microsoftTenantId ?? null,
      microsoftAccessToken: insertUser.microsoftAccessToken ?? null,
      microsoftRefreshToken: insertUser.microsoftRefreshToken ?? null,
      authProvider: insertUser.authProvider ?? "local",
      isActive: insertUser.isActive ?? true,
      isSuperAdmin: insertUser.isSuperAdmin ?? false,
    };

    const [user] = await db
      .insert(users)
      .values(userValues)
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

  async getUsersByTeam(organizationId: string, teamId: string, includeInactive = false): Promise<User[]> {
    const conditions = [
      eq(users.teamId, teamId),
      eq(users.organizationId, organizationId)
    ];
    
    // Only filter active users if includeInactive is false
    if (!includeInactive) {
      conditions.push(eq(users.isActive, true));
    }
    
    return await db.select().from(users).where(and(...conditions));
  }

  async getUsersByManager(organizationId: string, managerId: string, includeInactive = false): Promise<User[]> {
    const conditions = [
      eq(users.managerId, managerId),
      eq(users.organizationId, organizationId)
    ];
    
    // Only filter active users if includeInactive is false
    if (!includeInactive) {
      conditions.push(eq(users.isActive, true));
    }
    
    return await db.select().from(users).where(and(...conditions));
  }

  async getUsersByTeamLeadership(organizationId: string, leaderId: string, includeInactive = false): Promise<User[]> {
    // Find teams where the user is the leader
    const leaderTeams = await db.select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.leaderId, leaderId), eq(teams.organizationId, organizationId)));
    
    if (leaderTeams.length === 0) {
      return [];
    }

    // Get all users from those teams
    const teamIds = leaderTeams.map(team => team.id);
    const conditions = [
      inArray(users.teamId, teamIds),
      eq(users.organizationId, organizationId)
    ];
    
    // Only filter active users if includeInactive is false
    if (!includeInactive) {
      conditions.push(eq(users.isActive, true));
    }
    
    return await db.select().from(users).where(and(...conditions));
  }

  async getAllUsers(organizationId: string, includeInactive = false): Promise<User[]> {
    const conditions = [eq(users.organizationId, organizationId)];
    
    // Only filter active users if includeInactive is false
    if (!includeInactive) {
      conditions.push(eq(users.isActive, true));
    }
    
    return await db.select().from(users).where(and(...conditions));
  }

  // Super Admin Methods - Cross-organization access
  async getAllUsersGlobal(includeInactive = false): Promise<User[]> {
    try {
      const conditions = [];
      
      // Only filter active users if includeInactive is false
      if (!includeInactive) {
        conditions.push(eq(users.isActive, true));
      }
      
      if (conditions.length > 0) {
        return await db.select().from(users).where(and(...conditions));
      } else {
        return await db.select().from(users);
      }
    } catch (error) {
      console.error("Failed to fetch all users globally:", error);
      throw error;
    }
  }

  async getUserGlobal(userId: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      return user || undefined;
    } catch (error) {
      console.error("Failed to fetch user globally:", error);
      throw error;
    }
  }

  async updateUserGlobal(userId: string, userUpdate: Partial<InsertUser>): Promise<User | undefined> {
    try {
      const updateData: Partial<typeof users.$inferInsert> = {};
      
      if (userUpdate.name !== undefined) updateData.name = userUpdate.name;
      if (userUpdate.email !== undefined) updateData.email = userUpdate.email;
      if (userUpdate.role !== undefined) updateData.role = userUpdate.role;
      if (userUpdate.isActive !== undefined) updateData.isActive = userUpdate.isActive;
      if (userUpdate.teamId !== undefined) updateData.teamId = userUpdate.teamId;
      if (userUpdate.managerId !== undefined) updateData.managerId = userUpdate.managerId;

      const [updatedUser] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning();
      
      return updatedUser || undefined;
    } catch (error) {
      console.error("Failed to update user globally:", error);
      return undefined;
    }
  }

  async deactivateOrganization(organizationId: string): Promise<boolean> {
    try {
      const result = await db
        .update(organizations)
        .set({ isActive: false })
        .where(eq(organizations.id, organizationId));
      
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error("Failed to deactivate organization:", error);
      return false;
    }
  }

  async getOrganizationStats(organizationId: string): Promise<{ userCount: number; teamCount: number; activeUsers: number }> {
    try {
      // Get total user count
      const [totalUsersResult] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.organizationId, organizationId));

      // Get active user count
      const [activeUsersResult] = await db
        .select({ count: count() })
        .from(users)
        .where(and(eq(users.organizationId, organizationId), eq(users.isActive, true)));

      // Get team count
      const [teamStats] = await db
        .select({ count: count() })
        .from(teams)
        .where(eq(teams.organizationId, organizationId));

      return {
        userCount: totalUsersResult?.count || 0,
        teamCount: teamStats?.count || 0,
        activeUsers: activeUsersResult?.count || 0
      };
    } catch (error) {
      console.error("Failed to get organization stats:", error);
      return { userCount: 0, teamCount: 0, activeUsers: 0 };
    }
  }

  async getSystemStats(): Promise<{ totalOrganizations: number; totalUsers: number; activeOrganizations: number; activeUsers: number }> {
    try {
      // Get total organizations
      const [totalOrgsResult] = await db
        .select({ count: count() })
        .from(organizations);

      // Get active organizations
      const [activeOrgsResult] = await db
        .select({ count: count() })
        .from(organizations)
        .where(eq(organizations.isActive, true));

      // Get total users
      const [totalUsersResult] = await db
        .select({ count: count() })
        .from(users);

      // Get active users
      const [activeUsersResult] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.isActive, true));

      return {
        totalOrganizations: totalOrgsResult?.count || 0,
        activeOrganizations: activeOrgsResult?.count || 0,
        totalUsers: totalUsersResult?.count || 0,
        activeUsers: activeUsersResult?.count || 0
      };
    } catch (error) {
      console.error("Failed to get system stats:", error);
      return { totalOrganizations: 0, activeOrganizations: 0, totalUsers: 0, activeUsers: 0 };
    }
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

  async deleteTeam(organizationId: string, id: string): Promise<boolean> {
    // First check if there are any users assigned to this team
    const usersInTeam = await db
      .select({ count: count() })
      .from(users)
      .where(and(eq(users.teamId, id), eq(users.organizationId, organizationId)));
    
    if (usersInTeam[0]?.count > 0) {
      throw new Error("Cannot delete team with assigned users. Please reassign users before deleting the team.");
    }
    
    const result = await db
      .delete(teams)
      .where(and(eq(teams.id, id), eq(teams.organizationId, organizationId)));
    
    return (result.rowCount ?? 0) > 0;
  }

  async getAllTeams(organizationId: string): Promise<Team[]> {
    return await db.select().from(teams).where(eq(teams.organizationId, organizationId));
  }

  // Hierarchical team methods
  async getTeamHierarchy(organizationId: string): Promise<TeamHierarchy[]> {
    // Get all teams and users in organization
    const allTeams = await db.select().from(teams).where(eq(teams.organizationId, organizationId));
    const allUsers = await db.select().from(users).where(eq(users.organizationId, organizationId));
    
    // Create a map for quick lookups
    const teamMap = new Map<string, TeamHierarchy>();
    const memberCounts = new Map<string, number>();
    
    // Count members for each team
    allUsers.forEach(user => {
      if (user.teamId) {
        memberCounts.set(user.teamId, (memberCounts.get(user.teamId) || 0) + 1);
      }
    });
    
    // Convert teams to hierarchy objects
    allTeams.forEach(team => {
      teamMap.set(team.id, {
        ...team,
        children: [],
        memberCount: memberCounts.get(team.id) || 0
      });
    });
    
    // Build the hierarchy
    const roots: TeamHierarchy[] = [];
    allTeams.forEach(team => {
      const teamHierarchy = teamMap.get(team.id)!;
      if (team.parentTeamId) {
        const parent = teamMap.get(team.parentTeamId);
        if (parent) {
          parent.children.push(teamHierarchy);
        } else {
          // Orphaned team, treat as root
          roots.push(teamHierarchy);
        }
      } else {
        roots.push(teamHierarchy);
      }
    });
    
    return roots;
  }

  async getTeamChildren(organizationId: string, parentId: string): Promise<Team[]> {
    return await db.select().from(teams).where(
      and(eq(teams.parentTeamId, parentId), eq(teams.organizationId, organizationId))
    );
  }

  async getTeamDescendants(organizationId: string, parentId: string): Promise<Team[]> {
    // Use recursive CTE to get all descendants
    const result = await db.execute(sql`
      WITH RECURSIVE team_descendants AS (
        -- Base case: direct children
        SELECT * FROM ${teams} 
        WHERE parent_team_id = ${parentId} AND organization_id = ${organizationId}
        
        UNION ALL
        
        -- Recursive case: children of children
        SELECT t.* FROM ${teams} t
        INNER JOIN team_descendants td ON t.parent_team_id = td.id
        WHERE t.organization_id = ${organizationId}
      )
      SELECT * FROM team_descendants
    `);
    
    return result.rows as Team[];
  }

  async getRootTeams(organizationId: string): Promise<Team[]> {
    return await db.select().from(teams).where(
      and(eq(teams.parentTeamId, null), eq(teams.organizationId, organizationId))
    );
  }

  async createTeamWithHierarchy(organizationId: string, insertTeam: InsertTeam): Promise<Team> {
    // Calculate hierarchy metadata
    let depth = 0;
    let path = insertTeam.name.toLowerCase().replace(/\s+/g, '-');
    
    if (insertTeam.parentTeamId) {
      const parentTeam = await this.getTeam(organizationId, insertTeam.parentTeamId);
      if (parentTeam) {
        depth = (parentTeam.depth || 0) + 1;
        path = `${parentTeam.path || parentTeam.name.toLowerCase().replace(/\s+/g, '-')}/${path}`;
      }
    }
    
    const [team] = await db
      .insert(teams)
      .values({
        ...insertTeam,
        organizationId,
        description: insertTeam.description ?? null,
        depth,
        path,
      })
      .returning();
    
    return team;
  }

  async moveTeam(organizationId: string, teamId: string, newParentId: string | null): Promise<Team | undefined> {
    // Get the team to move
    const team = await this.getTeam(organizationId, teamId);
    if (!team) return undefined;
    
    // Calculate new hierarchy metadata
    let newDepth = 0;
    let newPath = team.name.toLowerCase().replace(/\s+/g, '-');
    
    if (newParentId) {
      const newParent = await this.getTeam(organizationId, newParentId);
      if (newParent) {
        newDepth = (newParent.depth || 0) + 1;
        newPath = `${newParent.path || newParent.name.toLowerCase().replace(/\s+/g, '-')}/${newPath}`;
      }
    }
    
    // Update the team
    const [updatedTeam] = await db
      .update(teams)
      .set({
        parentTeamId: newParentId,
        depth: newDepth,
        path: newPath,
      })
      .where(and(eq(teams.id, teamId), eq(teams.organizationId, organizationId)))
      .returning();
    
    // Update all descendants' paths and depths
    const descendants = await this.getTeamDescendants(organizationId, teamId);
    for (const descendant of descendants) {
      const descendantDepth = newDepth + (descendant.depth || 0) - (team.depth || 0);
      const descendantPath = descendant.path?.replace(team.path || '', newPath) || descendant.name.toLowerCase().replace(/\s+/g, '-');
      
      await db
        .update(teams)
        .set({
          depth: descendantDepth,
          path: descendantPath,
        })
        .where(and(eq(teams.id, descendant.id), eq(teams.organizationId, organizationId)));
    }
    
    return updatedTeam || undefined;
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
    // Include inactive users for historical check-in data
    const reports = await this.getUsersByManager(organizationId, managerId, true);
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
      // Get pending check-ins for manager's team members (include inactive for historical data)
      const reports = await this.getUsersByManager(organizationId, managerId, true);
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
        responseComments: reviewData.responseComments || {},
        addToOneOnOne: reviewData.addToOneOnOne || false,
        flagForFollowUp: reviewData.flagForFollowUp || false,
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
      periodStart: new Date(row.periodStart as string | number | Date),
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
      periodStart: new Date(row.periodStart as string | number | Date),
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
      periodStart: new Date(row.periodStart as string | number | Date),
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
      periodStart: new Date(row.periodStart as string | number | Date),
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
    let lateSubmissions: number[] = [];

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

  // One-on-One Meetings
  async getOneOnOne(organizationId: string, id: string): Promise<OneOnOne | undefined> {
    try {
      const [oneOnOne] = await db
        .select()
        .from(oneOnOnes)
        .where(and(eq(oneOnOnes.organizationId, organizationId), eq(oneOnOnes.id, id)));
      return oneOnOne || undefined;
    } catch (error) {
      console.error("Failed to fetch one-on-one:", error);
      throw error;
    }
  }

  async createOneOnOne(organizationId: string, oneOnOneData: InsertOneOnOne): Promise<OneOnOne> {
    try {
      const [oneOnOne] = await db
        .insert(oneOnOnes)
        .values({ ...oneOnOneData, organizationId })
        .returning();
      return oneOnOne;
    } catch (error) {
      console.error("Failed to create one-on-one:", error);
      throw error;
    }
  }

  async updateOneOnOne(organizationId: string, id: string, oneOnOneUpdate: Partial<InsertOneOnOne>): Promise<OneOnOne | undefined> {
    try {
      const updateData = { ...oneOnOneUpdate, updatedAt: new Date() };
      const [updatedOneOnOne] = await db
        .update(oneOnOnes)
        .set(updateData)
        .where(and(eq(oneOnOnes.organizationId, organizationId), eq(oneOnOnes.id, id)))
        .returning();
      return updatedOneOnOne || undefined;
    } catch (error) {
      console.error("Failed to update one-on-one:", error);
      throw error;
    }
  }

  async deleteOneOnOne(organizationId: string, id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(oneOnOnes)
        .where(and(eq(oneOnOnes.organizationId, organizationId), eq(oneOnOnes.id, id)));
      return result.rowCount > 0;
    } catch (error) {
      console.error("Failed to delete one-on-one:", error);
      throw error;
    }
  }

  async getAllOneOnOnes(organizationId: string): Promise<OneOnOne[]> {
    try {
      return await db
        .select()
        .from(oneOnOnes)
        .where(eq(oneOnOnes.organizationId, organizationId))
        .orderBy(desc(oneOnOnes.scheduledAt));
    } catch (error) {
      console.error("Failed to fetch all one-on-ones:", error);
      throw error;
    }
  }

  async getOneOnOnesByUser(organizationId: string, userId: string): Promise<OneOnOne[]> {
    try {
      return await db
        .select()
        .from(oneOnOnes)
        .where(and(
          eq(oneOnOnes.organizationId, organizationId),
          or(eq(oneOnOnes.participantOneId, userId), eq(oneOnOnes.participantTwoId, userId))
        ))
        .orderBy(desc(oneOnOnes.scheduledAt));
    } catch (error) {
      console.error("Failed to fetch one-on-ones by user:", error);
      throw error;
    }
  }

  async getOneOnOnesByParticipants(organizationId: string, participantOneId: string, participantTwoId: string): Promise<OneOnOne[]> {
    try {
      return await db
        .select()
        .from(oneOnOnes)
        .where(and(
          eq(oneOnOnes.organizationId, organizationId),
          or(
            and(eq(oneOnOnes.participantOneId, participantOneId), eq(oneOnOnes.participantTwoId, participantTwoId)),
            and(eq(oneOnOnes.participantOneId, participantTwoId), eq(oneOnOnes.participantTwoId, participantOneId))
          )
        ))
        .orderBy(desc(oneOnOnes.scheduledAt));
    } catch (error) {
      console.error("Failed to fetch one-on-ones by participants:", error);
      throw error;
    }
  }

  async getAllUpcomingOneOnOnes(organizationId: string): Promise<OneOnOne[]> {
    try {
      const now = new Date();
      return await db
        .select()
        .from(oneOnOnes)
        .where(and(
          eq(oneOnOnes.organizationId, organizationId),
          gte(oneOnOnes.scheduledAt, now),
          eq(oneOnOnes.status, "scheduled")
        ))
        .orderBy(oneOnOnes.scheduledAt);
    } catch (error) {
      console.error("Failed to fetch all upcoming one-on-ones:", error);
      throw error;
    }
  }

  async getUpcomingOneOnOnes(organizationId: string, userId: string): Promise<OneOnOne[]> {
    try {
      const now = new Date();
      return await db
        .select()
        .from(oneOnOnes)
        .where(and(
          eq(oneOnOnes.organizationId, organizationId),
          or(eq(oneOnOnes.participantOneId, userId), eq(oneOnOnes.participantTwoId, userId)),
          gte(oneOnOnes.scheduledAt, now),
          eq(oneOnOnes.status, "scheduled")
        ))
        .orderBy(oneOnOnes.scheduledAt);
    } catch (error) {
      console.error("Failed to fetch upcoming one-on-ones:", error);
      throw error;
    }
  }

  async getAllPastOneOnOnes(organizationId: string): Promise<OneOnOne[]> {
    try {
      const now = new Date();
      return await db
        .select()
        .from(oneOnOnes)
        .where(and(
          eq(oneOnOnes.organizationId, organizationId),
          lt(oneOnOnes.scheduledAt, now)
        ))
        .orderBy(desc(oneOnOnes.scheduledAt));
    } catch (error) {
      console.error("Failed to fetch all past one-on-ones:", error);
      throw error;
    }
  }

  async getPastOneOnOnes(organizationId: string, userId: string, limit: number = 10): Promise<OneOnOne[]> {
    try {
      const now = new Date();
      return await db
        .select()
        .from(oneOnOnes)
        .where(and(
          eq(oneOnOnes.organizationId, organizationId),
          or(eq(oneOnOnes.participantOneId, userId), eq(oneOnOnes.participantTwoId, userId)),
          lt(oneOnOnes.scheduledAt, now)
        ))
        .orderBy(desc(oneOnOnes.scheduledAt))
        .limit(limit);
    } catch (error) {
      console.error("Failed to fetch past one-on-ones:", error);
      throw error;
    }
  }

  // KRA Templates
  async getKraTemplate(organizationId: string, id: string): Promise<KraTemplate | undefined> {
    try {
      const [template] = await db
        .select()
        .from(kraTemplates)
        .where(and(eq(kraTemplates.organizationId, organizationId), eq(kraTemplates.id, id)));
      return template || undefined;
    } catch (error) {
      console.error("Failed to fetch KRA template:", error);
      throw error;
    }
  }

  async createKraTemplate(organizationId: string, templateData: InsertKraTemplate): Promise<KraTemplate> {
    try {
      const [template] = await db
        .insert(kraTemplates)
        .values({ ...templateData, organizationId })
        .returning();
      return template;
    } catch (error) {
      console.error("Failed to create KRA template:", error);
      throw error;
    }
  }

  async updateKraTemplate(organizationId: string, id: string, templateUpdate: Partial<InsertKraTemplate>): Promise<KraTemplate | undefined> {
    try {
      const [updatedTemplate] = await db
        .update(kraTemplates)
        .set(templateUpdate)
        .where(and(eq(kraTemplates.organizationId, organizationId), eq(kraTemplates.id, id)))
        .returning();
      return updatedTemplate || undefined;
    } catch (error) {
      console.error("Failed to update KRA template:", error);
      throw error;
    }
  }

  async deleteKraTemplate(organizationId: string, id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(kraTemplates)
        .where(and(eq(kraTemplates.organizationId, organizationId), eq(kraTemplates.id, id)));
      return result.rowCount > 0;
    } catch (error) {
      console.error("Failed to delete KRA template:", error);
      throw error;
    }
  }

  async getAllKraTemplates(organizationId: string, activeOnly: boolean = true): Promise<KraTemplate[]> {
    try {
      const conditions = [eq(kraTemplates.organizationId, organizationId)];
      if (activeOnly) {
        conditions.push(eq(kraTemplates.isActive, true));
      }
      return await db
        .select()
        .from(kraTemplates)
        .where(and(...conditions))
        .orderBy(kraTemplates.name);
    } catch (error) {
      console.error("Failed to fetch KRA templates:", error);
      throw error;
    }
  }

  async getKraTemplatesByCategory(organizationId: string, category: string): Promise<KraTemplate[]> {
    try {
      return await db
        .select()
        .from(kraTemplates)
        .where(and(
          eq(kraTemplates.organizationId, organizationId),
          eq(kraTemplates.category, category),
          eq(kraTemplates.isActive, true)
        ))
        .orderBy(kraTemplates.name);
    } catch (error) {
      console.error("Failed to fetch KRA templates by category:", error);
      throw error;
    }
  }

  // User KRAs
  async getUserKra(organizationId: string, id: string): Promise<UserKra | undefined> {
    try {
      const [userKra] = await db
        .select()
        .from(userKras)
        .where(and(eq(userKras.organizationId, organizationId), eq(userKras.id, id)));
      return userKra || undefined;
    } catch (error) {
      console.error("Failed to fetch user KRA:", error);
      throw error;
    }
  }

  async createUserKra(organizationId: string, userKraData: InsertUserKra): Promise<UserKra> {
    try {
      const [userKra] = await db
        .insert(userKras)
        .values({ ...userKraData, organizationId })
        .returning();
      return userKra;
    } catch (error) {
      console.error("Failed to create user KRA:", error);
      throw error;
    }
  }

  async updateUserKra(organizationId: string, id: string, userKraUpdate: Partial<InsertUserKra>): Promise<UserKra | undefined> {
    try {
      const updateData = { ...userKraUpdate, lastUpdated: new Date() };
      const [updatedUserKra] = await db
        .update(userKras)
        .set(updateData)
        .where(and(eq(userKras.organizationId, organizationId), eq(userKras.id, id)))
        .returning();
      return updatedUserKra || undefined;
    } catch (error) {
      console.error("Failed to update user KRA:", error);
      throw error;
    }
  }

  async deleteUserKra(organizationId: string, id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(userKras)
        .where(and(eq(userKras.organizationId, organizationId), eq(userKras.id, id)));
      return result.rowCount > 0;
    } catch (error) {
      console.error("Failed to delete user KRA:", error);
      throw error;
    }
  }

  async getUserKrasByUser(organizationId: string, userId: string, statusFilter?: string): Promise<UserKra[]> {
    try {
      const conditions = [eq(userKras.organizationId, organizationId), eq(userKras.userId, userId)];
      if (statusFilter) {
        conditions.push(eq(userKras.status, statusFilter));
      }
      return await db
        .select()
        .from(userKras)
        .where(and(...conditions))
        .orderBy(desc(userKras.lastUpdated));
    } catch (error) {
      console.error("Failed to fetch user KRAs by user:", error);
      throw error;
    }
  }

  async getUserKrasByAssigner(organizationId: string, assignerId: string): Promise<UserKra[]> {
    try {
      return await db
        .select()
        .from(userKras)
        .where(and(eq(userKras.organizationId, organizationId), eq(userKras.assignedBy, assignerId)))
        .orderBy(desc(userKras.lastUpdated));
    } catch (error) {
      console.error("Failed to fetch user KRAs by assigner:", error);
      throw error;
    }
  }

  async getActiveUserKras(organizationId: string): Promise<UserKra[]> {
    try {
      return await db
        .select()
        .from(userKras)
        .where(and(eq(userKras.organizationId, organizationId), eq(userKras.status, "active")))
        .orderBy(desc(userKras.lastUpdated));
    } catch (error) {
      console.error("Failed to fetch active user KRAs:", error);
      throw error;
    }
  }

  // Action Items
  async getActionItem(organizationId: string, id: string): Promise<ActionItem | undefined> {
    try {
      const [actionItem] = await db
        .select()
        .from(actionItems)
        .where(and(eq(actionItems.organizationId, organizationId), eq(actionItems.id, id)));
      return actionItem || undefined;
    } catch (error) {
      console.error("Failed to fetch action item:", error);
      throw error;
    }
  }

  async createActionItem(organizationId: string, actionItemData: InsertActionItem): Promise<ActionItem> {
    try {
      const [actionItem] = await db
        .insert(actionItems)
        .values({ ...actionItemData, organizationId })
        .returning();
      return actionItem;
    } catch (error) {
      console.error("Failed to create action item:", error);
      throw error;
    }
  }

  async updateActionItem(organizationId: string, id: string, actionItemUpdate: Partial<InsertActionItem>): Promise<ActionItem | undefined> {
    try {
      const updateData = { ...actionItemUpdate };
      if (actionItemUpdate.status === "completed" && !actionItemUpdate.completedAt) {
        updateData.completedAt = new Date();
      }
      const [updatedActionItem] = await db
        .update(actionItems)
        .set(updateData)
        .where(and(eq(actionItems.organizationId, organizationId), eq(actionItems.id, id)))
        .returning();
      return updatedActionItem || undefined;
    } catch (error) {
      console.error("Failed to update action item:", error);
      throw error;
    }
  }

  async deleteActionItem(organizationId: string, id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(actionItems)
        .where(and(eq(actionItems.organizationId, organizationId), eq(actionItems.id, id)));
      return result.rowCount > 0;
    } catch (error) {
      console.error("Failed to delete action item:", error);
      throw error;
    }
  }

  async getActionItemsByMeeting(organizationId: string, meetingId: string): Promise<ActionItem[]> {
    try {
      return await db
        .select()
        .from(actionItems)
        .where(and(eq(actionItems.organizationId, organizationId), eq(actionItems.meetingId, meetingId)))
        .orderBy(actionItems.createdAt);
    } catch (error) {
      console.error("Failed to fetch action items by meeting:", error);
      throw error;
    }
  }

  async getActionItemsByUser(organizationId: string, userId: string, statusFilter?: string): Promise<ActionItem[]> {
    try {
      const conditions = [eq(actionItems.organizationId, organizationId), eq(actionItems.assignedTo, userId)];
      if (statusFilter) {
        conditions.push(eq(actionItems.status, statusFilter));
      }
      return await db
        .select()
        .from(actionItems)
        .where(and(...conditions))
        .orderBy(actionItems.dueDate, actionItems.createdAt);
    } catch (error) {
      console.error("Failed to fetch action items by user:", error);
      throw error;
    }
  }

  async getOverdueActionItems(organizationId: string): Promise<ActionItem[]> {
    try {
      const now = new Date();
      return await db
        .select()
        .from(actionItems)
        .where(and(
          eq(actionItems.organizationId, organizationId),
          eq(actionItems.status, "pending"),
          lt(actionItems.dueDate, now)
        ))
        .orderBy(actionItems.dueDate);
    } catch (error) {
      console.error("Failed to fetch overdue action items:", error);
      throw error;
    }
  }

  // Bug Reports & Support System
  async getBugReport(organizationId: string, id: string): Promise<BugReport | undefined> {
    try {
      const [bugReport] = await db
        .select()
        .from(bugReports)
        .where(and(eq(bugReports.organizationId, organizationId), eq(bugReports.id, id)));
      return bugReport || undefined;
    } catch (error) {
      console.error("Failed to fetch bug report:", error);
      throw error;
    }
  }

  async createBugReport(organizationId: string, bugReportData: InsertBugReport): Promise<BugReport> {
    try {
      const [bugReport] = await db
        .insert(bugReports)
        .values({ ...bugReportData, organizationId })
        .returning();
      return bugReport;
    } catch (error) {
      console.error("Failed to create bug report:", error);
      throw error;
    }
  }

  async updateBugReport(organizationId: string, id: string, bugReportUpdate: Partial<InsertBugReport>): Promise<BugReport | undefined> {
    try {
      const [updatedBugReport] = await db
        .update(bugReports)
        .set(bugReportUpdate)
        .where(and(eq(bugReports.organizationId, organizationId), eq(bugReports.id, id)))
        .returning();
      return updatedBugReport || undefined;
    } catch (error) {
      console.error("Failed to update bug report:", error);
      throw error;
    }
  }

  async getBugReports(organizationId: string, statusFilter?: string, userId?: string): Promise<BugReport[]> {
    try {
      const conditions = [eq(bugReports.organizationId, organizationId)];
      if (statusFilter) {
        conditions.push(eq(bugReports.status, statusFilter));
      }
      if (userId) {
        conditions.push(eq(bugReports.userId, userId));
      }
      return await db
        .select()
        .from(bugReports)
        .where(and(...conditions))
        .orderBy(desc(bugReports.createdAt));
    } catch (error) {
      console.error("Failed to fetch bug reports:", error);
      throw error;
    }
  }

  async getBugReportsByUser(organizationId: string, userId: string): Promise<BugReport[]> {
    try {
      return await db
        .select()
        .from(bugReports)
        .where(and(eq(bugReports.organizationId, organizationId), eq(bugReports.userId, userId)))
        .orderBy(desc(bugReports.createdAt));
    } catch (error) {
      console.error("Failed to fetch bug reports by user:", error);
      throw error;
    }
  }

  // Super Admin - System Settings
  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    try {
      const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
      return setting;
    } catch (error) {
      console.error("Failed to get system setting:", error);
      throw error;
    }
  }

  async getAllSystemSettings(category?: string): Promise<SystemSetting[]> {
    try {
      let query = db.select().from(systemSettings);
      if (category) {
        query = query.where(eq(systemSettings.category, category));
      }
      return await query.orderBy(systemSettings.category, systemSettings.key);
    } catch (error) {
      console.error("Failed to get system settings:", error);
      throw error;
    }
  }

  async createSystemSetting(setting: InsertSystemSetting): Promise<SystemSetting> {
    try {
      const [newSetting] = await db.insert(systemSettings).values(setting).returning();
      return newSetting;
    } catch (error) {
      console.error("Failed to create system setting:", error);
      throw error;
    }
  }

  async updateSystemSetting(id: string, setting: Partial<InsertSystemSetting>): Promise<SystemSetting | undefined> {
    try {
      const updateData = {
        ...setting,
        updatedAt: new Date(),
      };
      const [updatedSetting] = await db.update(systemSettings)
        .set(updateData)
        .where(eq(systemSettings.id, id))
        .returning();
      return updatedSetting;
    } catch (error) {
      console.error("Failed to update system setting:", error);
      throw error;
    }
  }

  async deleteSystemSetting(id: string): Promise<boolean> {
    try {
      const result = await db.delete(systemSettings).where(eq(systemSettings.id, id));
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error("Failed to delete system setting:", error);
      throw error;
    }
  }

  // Super Admin - Pricing Plans
  async getPricingPlan(id: string): Promise<PricingPlan | undefined> {
    try {
      const [plan] = await db.select().from(pricingPlans).where(eq(pricingPlans.id, id));
      return plan;
    } catch (error) {
      console.error("Failed to get pricing plan:", error);
      throw error;
    }
  }

  async getAllPricingPlans(activeOnly?: boolean): Promise<PricingPlan[]> {
    try {
      let query = db.select().from(pricingPlans);
      if (activeOnly) {
        query = query.where(eq(pricingPlans.isActive, true));
      }
      return await query.orderBy(pricingPlans.sortOrder, pricingPlans.name);
    } catch (error) {
      console.error("Failed to get pricing plans:", error);
      throw error;
    }
  }

  async createPricingPlan(plan: InsertPricingPlan): Promise<PricingPlan> {
    try {
      const [newPlan] = await db.insert(pricingPlans).values(plan).returning();
      return newPlan;
    } catch (error) {
      console.error("Failed to create pricing plan:", error);
      throw error;
    }
  }

  async updatePricingPlan(id: string, plan: Partial<InsertPricingPlan>): Promise<PricingPlan | undefined> {
    try {
      const updateData = {
        ...plan,
        updatedAt: new Date(),
      };
      const [updatedPlan] = await db.update(pricingPlans)
        .set(updateData)
        .where(eq(pricingPlans.id, id))
        .returning();
      return updatedPlan;
    } catch (error) {
      console.error("Failed to update pricing plan:", error);
      throw error;
    }
  }

  async deletePricingPlan(id: string): Promise<boolean> {
    try {
      const result = await db.delete(pricingPlans).where(eq(pricingPlans.id, id));
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error("Failed to delete pricing plan:", error);
      throw error;
    }
  }

  // Super Admin - Discount Codes
  async getDiscountCode(id: string): Promise<DiscountCode | undefined> {
    try {
      const [discountCode] = await db.select().from(discountCodes).where(eq(discountCodes.id, id));
      return discountCode;
    } catch (error) {
      console.error("Failed to get discount code:", error);
      throw error;
    }
  }

  async getDiscountCodeByCode(code: string): Promise<DiscountCode | undefined> {
    try {
      const [discountCode] = await db.select().from(discountCodes).where(eq(discountCodes.code, code.toUpperCase()));
      return discountCode;
    } catch (error) {
      console.error("Failed to get discount code by code:", error);
      throw error;
    }
  }

  async getAllDiscountCodes(activeOnly?: boolean): Promise<DiscountCode[]> {
    try {
      let query = db.select().from(discountCodes);
      if (activeOnly) {
        query = query.where(eq(discountCodes.isActive, true));
      }
      return await query.orderBy(desc(discountCodes.createdAt));
    } catch (error) {
      console.error("Failed to get discount codes:", error);
      throw error;
    }
  }

  async createDiscountCode(discountCode: InsertDiscountCode): Promise<DiscountCode> {
    try {
      const codeData = {
        ...discountCode,
        code: discountCode.code.toUpperCase(),
      };
      const [newDiscountCode] = await db.insert(discountCodes).values(codeData).returning();
      return newDiscountCode;
    } catch (error) {
      console.error("Failed to create discount code:", error);
      throw error;
    }
  }

  async updateDiscountCode(id: string, discountCode: Partial<InsertDiscountCode>): Promise<DiscountCode | undefined> {
    try {
      const updateData = {
        ...discountCode,
        ...(discountCode.code && { code: discountCode.code.toUpperCase() }),
        updatedAt: new Date(),
      };
      const [updatedDiscountCode] = await db.update(discountCodes)
        .set(updateData)
        .where(eq(discountCodes.id, id))
        .returning();
      return updatedDiscountCode;
    } catch (error) {
      console.error("Failed to update discount code:", error);
      throw error;
    }
  }

  async deleteDiscountCode(id: string): Promise<boolean> {
    try {
      const result = await db.delete(discountCodes).where(eq(discountCodes.id, id));
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error("Failed to delete discount code:", error);
      throw error;
    }
  }

  async validateDiscountCode(code: string, planId?: string, orderAmount?: number): Promise<{ valid: boolean; discountCode?: DiscountCode; reason?: string }> {
    try {
      const discountCode = await this.getDiscountCodeByCode(code);
      
      if (!discountCode) {
        return { valid: false, reason: "Discount code not found" };
      }

      if (!discountCode.isActive) {
        return { valid: false, reason: "Discount code is inactive" };
      }

      const now = new Date();
      if (discountCode.validFrom && new Date(discountCode.validFrom) > now) {
        return { valid: false, reason: "Discount code is not yet valid" };
      }

      if (discountCode.validTo && new Date(discountCode.validTo) < now) {
        return { valid: false, reason: "Discount code has expired" };
      }

      if (discountCode.usageLimit && discountCode.usageCount >= discountCode.usageLimit) {
        return { valid: false, reason: "Discount code usage limit reached" };
      }

      if (discountCode.minimumAmount && orderAmount && orderAmount < discountCode.minimumAmount) {
        return { valid: false, reason: `Minimum order amount of $${(discountCode.minimumAmount / 100).toFixed(2)} required` };
      }

      // Check if discount applies to specific plans
      if (planId && discountCode.applicablePlans && Array.isArray(discountCode.applicablePlans) && discountCode.applicablePlans.length > 0) {
        if (!discountCode.applicablePlans.includes(planId)) {
          return { valid: false, reason: "Discount code not applicable to selected plan" };
        }
      }

      return { valid: true, discountCode };
    } catch (error) {
      console.error("Failed to validate discount code:", error);
      return { valid: false, reason: "Error validating discount code" };
    }
  }

  async applyDiscountCode(usage: InsertDiscountCodeUsage): Promise<DiscountCodeUsage> {
    try {
      // First, increment the usage count
      await db.update(discountCodes)
        .set({ 
          usageCount: sql`${discountCodes.usageCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(discountCodes.id, usage.discountCodeId));

      // Then record the usage
      const [newUsage] = await db.insert(discountCodeUsage).values(usage).returning();
      return newUsage;
    } catch (error) {
      console.error("Failed to apply discount code:", error);
      throw error;
    }
  }

  async getDiscountCodeUsage(discountCodeId: string): Promise<DiscountCodeUsage[]> {
    try {
      return await db.select().from(discountCodeUsage)
        .where(eq(discountCodeUsage.discountCodeId, discountCodeId))
        .orderBy(desc(discountCodeUsage.usedAt));
    } catch (error) {
      console.error("Failed to get discount code usage:", error);
      throw error;
    }
  }

  // Super Admin - Partner Applications
  async getPartnerApplication(id: string): Promise<PartnerApplication | undefined> {
    try {
      const [application] = await db.select().from(partnerApplications)
        .where(eq(partnerApplications.id, id));
      return application;
    } catch (error) {
      console.error("Failed to get partner application:", error);
      throw error;
    }
  }

  async getAllPartnerApplications(statusFilter?: string): Promise<PartnerApplication[]> {
    try {
      let query = db.select().from(partnerApplications);
      
      if (statusFilter) {
        query = query.where(eq(partnerApplications.status, statusFilter as any));
      }
      
      return await query.orderBy(desc(partnerApplications.createdAt));
    } catch (error) {
      console.error("Failed to get partner applications:", error);
      throw error;
    }
  }

  async createPartnerApplication(application: InsertPartnerApplication): Promise<PartnerApplication> {
    try {
      const [newApplication] = await db.insert(partnerApplications).values(application).returning();
      return newApplication;
    } catch (error) {
      console.error("Failed to create partner application:", error);
      throw error;
    }
  }

  async updatePartnerApplication(id: string, application: Partial<InsertPartnerApplication>): Promise<PartnerApplication | undefined> {
    try {
      const [updated] = await db.update(partnerApplications)
        .set({ ...application, updatedAt: new Date() })
        .where(eq(partnerApplications.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Failed to update partner application:", error);
      throw error;
    }
  }

  // Helper method for date truncation based on period
  private truncateDate(date: Date, period: AnalyticsPeriod): Date {
    const d = new Date(date);
    
    switch (period) {
      case 'week':
        // Truncate to Monday of the week
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
      case 'month':
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
      case 'quarter':
        const quarterMonth = Math.floor(d.getMonth() / 3) * 3;
        d.setMonth(quarterMonth, 1);
        d.setHours(0, 0, 0, 0);
        return d;
      case 'year':
        d.setMonth(0, 1);
        d.setHours(0, 0, 0, 0);
        return d;
      default:
        // Default to day truncation
        d.setHours(0, 0, 0, 0);
        return d;
    }
  }

  // Dashboard Configurations
  async getDashboardConfig(organizationId: string, userId: string): Promise<DashboardConfig | undefined> {
    try {
      const [config] = await db
        .select()
        .from(dashboardConfigs)
        .where(
          and(
            eq(dashboardConfigs.organizationId, organizationId),
            eq(dashboardConfigs.userId, userId)
          )
        );
      return config || undefined;
    } catch (error) {
      console.error("Failed to get dashboard config:", error);
      throw error;
    }
  }

  async createDashboardConfig(organizationId: string, config: InsertDashboardConfig): Promise<DashboardConfig> {
    try {
      const [created] = await db
        .insert(dashboardConfigs)
        .values({
          ...config,
          organizationId,
        })
        .returning();
      return created;
    } catch (error) {
      console.error("Failed to create dashboard config:", error);
      throw error;
    }
  }

  async updateDashboardConfig(organizationId: string, userId: string, config: Partial<InsertDashboardConfig>): Promise<DashboardConfig | undefined> {
    try {
      // SECURITY: Double-guard against immutable field changes at storage level
      const sanitizedConfig = { ...config };
      delete sanitizedConfig.id;
      delete sanitizedConfig.userId;
      delete sanitizedConfig.organizationId;

      const [updated] = await db
        .update(dashboardConfigs)
        .set(sanitizedConfig)
        .where(
          and(
            eq(dashboardConfigs.organizationId, organizationId),
            eq(dashboardConfigs.userId, userId)
          )
        )
        .returning();
      return updated || undefined;
    } catch (error) {
      console.error("Failed to update dashboard config:", error);
      throw error;
    }
  }

  async resetDashboardConfig(organizationId: string, userId: string): Promise<boolean> {
    try {
      const result = await db
        .delete(dashboardConfigs)
        .where(
          and(
            eq(dashboardConfigs.organizationId, organizationId),
            eq(dashboardConfigs.userId, userId)
          )
        );
      return true;
    } catch (error) {
      console.error("Failed to reset dashboard config:", error);
      throw error;
    }
  }

  // Dashboard Widget Templates
  async getDashboardWidgetTemplate(organizationId: string, id: string): Promise<DashboardWidgetTemplate | undefined> {
    try {
      const [template] = await db
        .select()
        .from(dashboardWidgetTemplates)
        .where(
          and(
            eq(dashboardWidgetTemplates.organizationId, organizationId),
            eq(dashboardWidgetTemplates.id, id)
          )
        );
      return template || undefined;
    } catch (error) {
      console.error("Failed to get dashboard widget template:", error);
      throw error;
    }
  }

  async getAllDashboardWidgetTemplates(organizationId: string, category?: string): Promise<DashboardWidgetTemplate[]> {
    try {
      const conditions = [eq(dashboardWidgetTemplates.organizationId, organizationId)];
      if (category) {
        conditions.push(eq(dashboardWidgetTemplates.category, category));
      }

      return await db
        .select()
        .from(dashboardWidgetTemplates)
        .where(and(...conditions))
        .orderBy(dashboardWidgetTemplates.category, dashboardWidgetTemplates.name);
    } catch (error) {
      console.error("Failed to get dashboard widget templates:", error);
      throw error;
    }
  }

  async createDashboardWidgetTemplate(organizationId: string, template: InsertDashboardWidgetTemplate): Promise<DashboardWidgetTemplate> {
    try {
      const [created] = await db
        .insert(dashboardWidgetTemplates)
        .values({
          ...template,
          organizationId,
        })
        .returning();
      return created;
    } catch (error) {
      console.error("Failed to create dashboard widget template:", error);
      throw error;
    }
  }

  async updateDashboardWidgetTemplate(organizationId: string, id: string, template: Partial<InsertDashboardWidgetTemplate>): Promise<DashboardWidgetTemplate | undefined> {
    try {
      // SECURITY: Double-guard against immutable field changes at storage level
      const sanitizedTemplate = { ...template };
      delete sanitizedTemplate.id;
      delete sanitizedTemplate.organizationId;

      const [updated] = await db
        .update(dashboardWidgetTemplates)
        .set(sanitizedTemplate)
        .where(
          and(
            eq(dashboardWidgetTemplates.organizationId, organizationId),
            eq(dashboardWidgetTemplates.id, id)
          )
        )
        .returning();
      return updated || undefined;
    } catch (error) {
      console.error("Failed to update dashboard widget template:", error);
      throw error;
    }
  }

  async deleteDashboardWidgetTemplate(organizationId: string, id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(dashboardWidgetTemplates)
        .where(
          and(
            eq(dashboardWidgetTemplates.organizationId, organizationId),
            eq(dashboardWidgetTemplates.id, id)
          )
        );
      return true;
    } catch (error) {
      console.error("Failed to delete dashboard widget template:", error);
      throw error;
    }
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
  private organizations: Map<string, Organization> = new Map();
  private dashboardConfigs: Map<string, DashboardConfig> = new Map();
  private dashboardWidgetTemplates: Map<string, DashboardWidgetTemplate> = new Map();
  private analyticsCache = new AnalyticsCache();

  // Organizations
  async getAllOrganizations(): Promise<Organization[]> {
    return Array.from(this.organizations.values());
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    return this.organizations.get(id);
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | undefined> {
    return Array.from(this.organizations.values()).find(org => org.slug === slug);
  }

  async createOrganization(insertOrganization: InsertOrganization): Promise<Organization> {
    const organization: Organization = {
      id: insertOrganization.id || randomUUID(),
      name: insertOrganization.name,
      slug: insertOrganization.slug,
      customValues: insertOrganization.customValues || [],
      plan: insertOrganization.plan || "starter",
      slackWorkspaceId: insertOrganization.slackWorkspaceId || null,
      isActive: insertOrganization.isActive ?? true,
      createdAt: new Date(),
    };
    
    this.organizations.set(organization.id, organization);
    return organization;
  }

  async updateOrganization(id: string, organizationUpdate: Partial<InsertOrganization>): Promise<Organization | undefined> {
    const existingOrganization = this.organizations.get(id);
    if (!existingOrganization) return undefined;

    const updatedOrganization: Organization = {
      ...existingOrganization,
      ...(organizationUpdate.name !== undefined && { name: organizationUpdate.name }),
      ...(organizationUpdate.customValues !== undefined && { customValues: organizationUpdate.customValues }),
      ...(organizationUpdate.plan !== undefined && { plan: organizationUpdate.plan }),
      ...(organizationUpdate.slackWorkspaceId !== undefined && { slackWorkspaceId: organizationUpdate.slackWorkspaceId }),
      ...(organizationUpdate.isActive !== undefined && { isActive: organizationUpdate.isActive }),
    };

    this.organizations.set(id, updatedOrganization);
    return updatedOrganization;
  }

  constructor() {
    this.seedData();
  }

  async getUserBySlackId(organizationId: string, slackUserId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => 
      user.slackUserId === slackUserId && user.organizationId === organizationId
    );
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
      slackUserId: null,
      slackUsername: null,
      slackDisplayName: null,
      slackEmail: null,
      slackAvatar: null,
      slackWorkspaceId: null,
      authProvider: "local" as const,
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
      password: insertUser.password || "default-password",
      slackUserId: insertUser.slackUserId ?? null,
      slackUsername: insertUser.slackUsername ?? null,
      slackDisplayName: insertUser.slackDisplayName ?? null,
      slackEmail: insertUser.slackEmail ?? null,
      slackAvatar: insertUser.slackAvatar ?? null,
      slackWorkspaceId: insertUser.slackWorkspaceId ?? null,
      authProvider: insertUser.authProvider ?? "local",
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

  async getUsersByTeam(organizationId: string, teamId: string, includeInactive = false): Promise<User[]> {
    const teamUsers = Array.from(this.users.values()).filter(user => 
      user.teamId === teamId && user.organizationId === organizationId
    );
    if (includeInactive) {
      return teamUsers;
    }
    return teamUsers.filter(user => user.isActive !== false);
  }

  async getUsersByManager(organizationId: string, managerId: string, includeInactive = false): Promise<User[]> {
    const managerUsers = Array.from(this.users.values()).filter(user => 
      user.managerId === managerId && user.organizationId === organizationId
    );
    if (includeInactive) {
      return managerUsers;
    }
    return managerUsers.filter(user => user.isActive !== false);
  }

  async getUsersByTeamLeadership(organizationId: string, leaderId: string, includeInactive = false): Promise<User[]> {
    // Find teams where the user is the leader
    const leaderTeams = Array.from(this.teams.values()).filter(team => 
      team.leaderId === leaderId && team.organizationId === organizationId
    );
    
    if (leaderTeams.length === 0) {
      return [];
    }

    // Get all users from those teams
    const teamIds = leaderTeams.map(team => team.id);
    const teamUsers = Array.from(this.users.values()).filter(user => 
      user.teamId && teamIds.includes(user.teamId) && user.organizationId === organizationId
    );
    
    if (includeInactive) {
      return teamUsers;
    }
    return teamUsers.filter(user => user.isActive !== false);
  }

  async getAllUsers(organizationId: string, includeInactive = false): Promise<User[]> {
    const orgUsers = Array.from(this.users.values()).filter(user => 
      user.organizationId === organizationId
    );
    if (includeInactive) {
      return orgUsers;
    }
    return orgUsers.filter(user => user.isActive !== false);
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

  async deleteTeam(organizationId: string, id: string): Promise<boolean> {
    const team = this.teams.get(id);
    if (!team || team.organizationId !== organizationId) {
      return false;
    }
    
    // Check if there are any users assigned to this team
    const usersInTeam = Array.from(this.users.values()).filter(user => 
      user.teamId === id && user.organizationId === organizationId
    );
    
    if (usersInTeam.length > 0) {
      throw new Error("Cannot delete team with assigned users. Please reassign users before deleting the team.");
    }
    
    return this.teams.delete(id);
  }

  async getAllTeams(organizationId: string): Promise<Team[]> {
    return Array.from(this.teams.values()).filter(team => 
      team.organizationId === organizationId
    );
  }

  // Hierarchical team methods for memory storage
  async getTeamHierarchy(organizationId: string): Promise<TeamHierarchy[]> {
    const allTeams = Array.from(this.teams.values()).filter(team => 
      team.organizationId === organizationId
    );
    const allUsers = Array.from(this.users.values()).filter(user => 
      user.organizationId === organizationId
    );
    
    // Create a map for quick lookups
    const teamMap = new Map<string, TeamHierarchy>();
    const memberCounts = new Map<string, number>();
    
    // Count members for each team
    allUsers.forEach(user => {
      if (user.teamId) {
        memberCounts.set(user.teamId, (memberCounts.get(user.teamId) || 0) + 1);
      }
    });
    
    // Convert teams to hierarchy objects
    allTeams.forEach(team => {
      teamMap.set(team.id, {
        ...team,
        children: [],
        memberCount: memberCounts.get(team.id) || 0
      });
    });
    
    // Build the hierarchy
    const roots: TeamHierarchy[] = [];
    allTeams.forEach(team => {
      const teamHierarchy = teamMap.get(team.id)!;
      if (team.parentTeamId) {
        const parent = teamMap.get(team.parentTeamId);
        if (parent) {
          parent.children.push(teamHierarchy);
        } else {
          // Orphaned team, treat as root
          roots.push(teamHierarchy);
        }
      } else {
        roots.push(teamHierarchy);
      }
    });
    
    return roots;
  }

  async getTeamChildren(organizationId: string, parentId: string): Promise<Team[]> {
    return Array.from(this.teams.values()).filter(team => 
      team.parentTeamId === parentId && team.organizationId === organizationId
    );
  }

  async getTeamDescendants(organizationId: string, parentId: string): Promise<Team[]> {
    const descendants: Team[] = [];
    const visited = new Set<string>();
    
    const findDescendants = (currentParentId: string) => {
      if (visited.has(currentParentId)) return; // Prevent cycles
      visited.add(currentParentId);
      
      const children = Array.from(this.teams.values()).filter(team => 
        team.parentTeamId === currentParentId && team.organizationId === organizationId
      );
      
      for (const child of children) {
        descendants.push(child);
        findDescendants(child.id); // Recursively find descendants
      }
    };
    
    findDescendants(parentId);
    return descendants;
  }

  async getRootTeams(organizationId: string): Promise<Team[]> {
    return Array.from(this.teams.values()).filter(team => 
      !team.parentTeamId && team.organizationId === organizationId
    );
  }

  async createTeamWithHierarchy(organizationId: string, insertTeam: InsertTeam): Promise<Team> {
    // Calculate hierarchy metadata
    let depth = 0;
    let path = insertTeam.name.toLowerCase().replace(/\s+/g, '-');
    
    if (insertTeam.parentTeamId) {
      const parentTeam = await this.getTeam(organizationId, insertTeam.parentTeamId);
      if (parentTeam) {
        depth = (parentTeam.depth || 0) + 1;
        path = `${parentTeam.path || parentTeam.name.toLowerCase().replace(/\s+/g, '-')}/${path}`;
      }
    }
    
    const team: Team = {
      ...insertTeam,
      id: randomUUID(),
      organizationId,
      createdAt: new Date(),
      description: insertTeam.description ?? null,
      parentTeamId: insertTeam.parentTeamId ?? null,
      teamType: insertTeam.teamType ?? "department",
      depth,
      path,
      isActive: insertTeam.isActive ?? true,
    };
    
    this.teams.set(team.id, team);
    return team;
  }

  async moveTeam(organizationId: string, teamId: string, newParentId: string | null): Promise<Team | undefined> {
    const team = this.teams.get(teamId);
    if (!team || team.organizationId !== organizationId) return undefined;
    
    // Calculate new hierarchy metadata
    let newDepth = 0;
    let newPath = team.name.toLowerCase().replace(/\s+/g, '-');
    
    if (newParentId) {
      const newParent = await this.getTeam(organizationId, newParentId);
      if (newParent) {
        newDepth = (newParent.depth || 0) + 1;
        newPath = `${newParent.path || newParent.name.toLowerCase().replace(/\s+/g, '-')}/${newPath}`;
      }
    }
    
    // Update the team
    const updatedTeam = {
      ...team,
      parentTeamId: newParentId,
      depth: newDepth,
      path: newPath,
    };
    
    this.teams.set(teamId, updatedTeam);
    
    // Update all descendants' paths and depths
    const descendants = await this.getTeamDescendants(organizationId, teamId);
    for (const descendant of descendants) {
      const descendantDepth = newDepth + (descendant.depth || 0) - (team.depth || 0);
      const descendantPath = descendant.path?.replace(team.path || '', newPath) || descendant.name.toLowerCase().replace(/\s+/g, '-');
      
      const updatedDescendant = {
        ...descendant,
        depth: descendantDepth,
        path: descendantPath,
      };
      
      this.teams.set(descendant.id, updatedDescendant);
    }
    
    return updatedTeam;
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
      responseComments: reviewData.responseComments || {},
      addToOneOnOne: reviewData.addToOneOnOne || false,
      flagForFollowUp: reviewData.flagForFollowUp || false,
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

  // Super Admin - System Settings (MemStorage implementation)
  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    // MemStorage doesn't support super admin features - return undefined
    return undefined;
  }

  async getAllSystemSettings(category?: string): Promise<SystemSetting[]> {
    // MemStorage doesn't support super admin features - return empty array
    return [];
  }

  async createSystemSetting(setting: InsertSystemSetting): Promise<SystemSetting> {
    throw new Error("Super admin features not supported in MemStorage");
  }

  async updateSystemSetting(id: string, setting: Partial<InsertSystemSetting>): Promise<SystemSetting | undefined> {
    throw new Error("Super admin features not supported in MemStorage");
  }

  async deleteSystemSetting(id: string): Promise<boolean> {
    throw new Error("Super admin features not supported in MemStorage");
  }

  // Super Admin - Pricing Plans (MemStorage implementation)
  async getPricingPlan(id: string): Promise<PricingPlan | undefined> {
    return undefined;
  }

  async getAllPricingPlans(activeOnly?: boolean): Promise<PricingPlan[]> {
    return [];
  }

  async createPricingPlan(plan: InsertPricingPlan): Promise<PricingPlan> {
    throw new Error("Super admin features not supported in MemStorage");
  }

  async updatePricingPlan(id: string, plan: Partial<InsertPricingPlan>): Promise<PricingPlan | undefined> {
    throw new Error("Super admin features not supported in MemStorage");
  }

  async deletePricingPlan(id: string): Promise<boolean> {
    throw new Error("Super admin features not supported in MemStorage");
  }

  // Super Admin - Discount Codes (MemStorage implementation)
  async getDiscountCode(id: string): Promise<DiscountCode | undefined> {
    return undefined;
  }

  async getDiscountCodeByCode(code: string): Promise<DiscountCode | undefined> {
    return undefined;
  }

  async getAllDiscountCodes(activeOnly?: boolean): Promise<DiscountCode[]> {
    return [];
  }

  async createDiscountCode(discountCode: InsertDiscountCode): Promise<DiscountCode> {
    throw new Error("Super admin features not supported in MemStorage");
  }

  async updateDiscountCode(id: string, discountCode: Partial<InsertDiscountCode>): Promise<DiscountCode | undefined> {
    throw new Error("Super admin features not supported in MemStorage");
  }

  async deleteDiscountCode(id: string): Promise<boolean> {
    throw new Error("Super admin features not supported in MemStorage");
  }

  async validateDiscountCode(code: string, planId?: string, orderAmount?: number): Promise<{ valid: boolean; discountCode?: DiscountCode; reason?: string }> {
    return { valid: false, reason: "Super admin features not supported in MemStorage" };
  }

  async applyDiscountCode(usage: InsertDiscountCodeUsage): Promise<DiscountCodeUsage> {
    throw new Error("Super admin features not supported in MemStorage");
  }

  async getDiscountCodeUsage(discountCodeId: string): Promise<DiscountCodeUsage[]> {
    return [];
  }

  // Super Admin - Partner Applications (MemStorage implementation)
  async getPartnerApplication(id: string): Promise<PartnerApplication | undefined> {
    return undefined;
  }

  async getAllPartnerApplications(statusFilter?: string): Promise<PartnerApplication[]> {
    return [];
  }

  async createPartnerApplication(application: InsertPartnerApplication): Promise<PartnerApplication> {
    throw new Error("Super admin features not supported in MemStorage");
  }

  async updatePartnerApplication(id: string, application: Partial<InsertPartnerApplication>): Promise<PartnerApplication | undefined> {
    throw new Error("Super admin features not supported in MemStorage");
  }

  // Dashboard Configurations (MemStorage implementation)
  async getDashboardConfig(organizationId: string, userId: string): Promise<DashboardConfig | undefined> {
    const key = `${organizationId}:${userId}`;
    return this.dashboardConfigs.get(key);
  }

  async createDashboardConfig(organizationId: string, config: InsertDashboardConfig): Promise<DashboardConfig> {
    const dashboardConfig: DashboardConfig = {
      id: config.id || randomUUID(),
      organizationId,
      userId: config.userId,
      layout: config.layout,
      widgets: config.widgets,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const key = `${organizationId}:${config.userId}`;
    this.dashboardConfigs.set(key, dashboardConfig);
    return dashboardConfig;
  }

  async updateDashboardConfig(organizationId: string, userId: string, config: Partial<InsertDashboardConfig>): Promise<DashboardConfig | undefined> {
    const key = `${organizationId}:${userId}`;
    const existing = this.dashboardConfigs.get(key);
    if (!existing) return undefined;

    // SECURITY: Double-guard against immutable field changes at storage level
    const sanitizedConfig = { ...config };
    delete sanitizedConfig.id;
    delete sanitizedConfig.userId;
    delete sanitizedConfig.organizationId;

    const updated: DashboardConfig = {
      ...existing,
      ...(sanitizedConfig.layout !== undefined && { layout: sanitizedConfig.layout }),
      ...(sanitizedConfig.widgets !== undefined && { widgets: sanitizedConfig.widgets }),
      updatedAt: new Date(),
    };

    this.dashboardConfigs.set(key, updated);
    return updated;
  }

  async resetDashboardConfig(organizationId: string, userId: string): Promise<boolean> {
    const key = `${organizationId}:${userId}`;
    return this.dashboardConfigs.delete(key);
  }

  // Dashboard Widget Templates (MemStorage implementation)
  async getDashboardWidgetTemplate(organizationId: string, id: string): Promise<DashboardWidgetTemplate | undefined> {
    return Array.from(this.dashboardWidgetTemplates.values())
      .find(template => template.organizationId === organizationId && template.id === id);
  }

  async getAllDashboardWidgetTemplates(organizationId: string, category?: string): Promise<DashboardWidgetTemplate[]> {
    return Array.from(this.dashboardWidgetTemplates.values())
      .filter(template => {
        if (template.organizationId !== organizationId) return false;
        if (category && template.category !== category) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      });
  }

  async createDashboardWidgetTemplate(organizationId: string, template: InsertDashboardWidgetTemplate): Promise<DashboardWidgetTemplate> {
    const widgetTemplate: DashboardWidgetTemplate = {
      id: template.id || randomUUID(),
      organizationId,
      name: template.name,
      description: template.description || null,
      category: template.category,
      component: template.component,
      config: template.config,
      isActive: template.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.dashboardWidgetTemplates.set(widgetTemplate.id, widgetTemplate);
    return widgetTemplate;
  }

  async updateDashboardWidgetTemplate(organizationId: string, id: string, template: Partial<InsertDashboardWidgetTemplate>): Promise<DashboardWidgetTemplate | undefined> {
    const existing = this.dashboardWidgetTemplates.get(id);
    if (!existing || existing.organizationId !== organizationId) return undefined;

    // SECURITY: Double-guard against immutable field changes at storage level
    const sanitizedTemplate = { ...template };
    delete sanitizedTemplate.id;
    delete sanitizedTemplate.organizationId;

    const updated: DashboardWidgetTemplate = {
      ...existing,
      ...(sanitizedTemplate.name !== undefined && { name: sanitizedTemplate.name }),
      ...(sanitizedTemplate.description !== undefined && { description: sanitizedTemplate.description }),
      ...(sanitizedTemplate.category !== undefined && { category: sanitizedTemplate.category }),
      ...(sanitizedTemplate.component !== undefined && { component: sanitizedTemplate.component }),
      ...(sanitizedTemplate.config !== undefined && { config: sanitizedTemplate.config }),
      ...(sanitizedTemplate.isActive !== undefined && { isActive: sanitizedTemplate.isActive }),
      updatedAt: new Date(),
    };

    this.dashboardWidgetTemplates.set(id, updated);
    return updated;
  }

  async deleteDashboardWidgetTemplate(organizationId: string, id: string): Promise<boolean> {
    const existing = this.dashboardWidgetTemplates.get(id);
    if (!existing || existing.organizationId !== organizationId) return false;
    
    return this.dashboardWidgetTemplates.delete(id);
  }
}

export const storage = new DatabaseStorage();
