import { 
  type User, type InsertUser,
  type Team, type InsertTeam,
  type Checkin, type InsertCheckin,
  type Question, type InsertQuestion,
  type Win, type InsertWin,
  type Comment, type InsertComment,
  type Kudos, type InsertKudos,
  users, teams, checkins, questions, wins, comments, kudos
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, desc, and, gte, or } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(organizationId: string, id: string): Promise<User | undefined>;
  getUserByUsername(organizationId: string, username: string): Promise<User | undefined>;
  getUserByEmail(organizationId: string, email: string): Promise<User | undefined>;
  createUser(organizationId: string, user: InsertUser): Promise<User>;
  updateUser(organizationId: string, id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  getUsersByTeam(organizationId: string, teamId: string): Promise<User[]>;
  getUsersByManager(organizationId: string, managerId: string): Promise<User[]>;
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

  // Kudos
  getKudos(organizationId: string, id: string): Promise<Kudos | undefined>;
  createKudos(organizationId: string, kudos: InsertKudos & { fromUserId: string }): Promise<Kudos>;
  updateKudos(organizationId: string, id: string, kudos: Partial<InsertKudos>): Promise<Kudos | undefined>;
  deleteKudos(organizationId: string, id: string): Promise<boolean>;
  getKudosByUser(organizationId: string, userId: string, type?: 'received' | 'given'): Promise<Kudos[]>;
  getRecentKudos(organizationId: string, limit?: number): Promise<Kudos[]>;
  getPublicKudos(organizationId: string, limit?: number): Promise<Kudos[]>;
}

export class DatabaseStorage implements IStorage {
  constructor() {
    // Database will be initialized when tables are created via db:push
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
    const [checkin] = await db
      .insert(checkins)
      .values({
        ...insertCheckin,
        organizationId,
        responses: insertCheckin.responses ?? {},
        isComplete: insertCheckin.isComplete ?? false,
      })
      .returning();
    return checkin;
  }

  async updateCheckin(organizationId: string, id: string, checkinUpdate: Partial<InsertCheckin>): Promise<Checkin | undefined> {
    const [checkin] = await db
      .update(checkins)
      .set(checkinUpdate)
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
    
    // TODO: Fix this to handle multiple report IDs using inArray
    return await db
      .select()
      .from(checkins)
      .where(and(
        eq(checkins.userId, reportIds[0]),
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

  // Kudos
  async getKudos(organizationId: string, id: string): Promise<Kudos | undefined> {
    const [kudosRecord] = await db.select().from(kudos).where(
      and(eq(kudos.id, id), eq(kudos.organizationId, organizationId))
    );
    return kudosRecord || undefined;
  }

  async createKudos(organizationId: string, insertKudos: InsertKudos & { fromUserId: string }): Promise<Kudos> {
    const [kudosRecord] = await db
      .insert(kudos)
      .values({
        ...insertKudos,
        organizationId,
        isPublic: insertKudos.isPublic ?? true,
        slackMessageId: insertKudos.slackMessageId ?? null,
      })
      .returning();
    return kudosRecord;
  }

  async updateKudos(organizationId: string, id: string, kudosUpdate: Partial<InsertKudos>): Promise<Kudos | undefined> {
    const [kudosRecord] = await db
      .update(kudos)
      .set(kudosUpdate)
      .where(and(eq(kudos.id, id), eq(kudos.organizationId, organizationId)))
      .returning();
    return kudosRecord || undefined;
  }

  async deleteKudos(organizationId: string, id: string): Promise<boolean> {
    const result = await db.delete(kudos).where(
      and(eq(kudos.id, id), eq(kudos.organizationId, organizationId))
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getKudosByUser(organizationId: string, userId: string, type?: 'received' | 'given'): Promise<Kudos[]> {
    let whereCondition;
    
    if (type === 'received') {
      whereCondition = and(
        eq(kudos.toUserId, userId),
        eq(kudos.organizationId, organizationId)
      );
    } else if (type === 'given') {
      whereCondition = and(
        eq(kudos.fromUserId, userId),
        eq(kudos.organizationId, organizationId)
      );
    } else {
      // Return both received and given - user must be either giver OR receiver
      whereCondition = and(
        or(
          eq(kudos.fromUserId, userId),
          eq(kudos.toUserId, userId)
        ),
        eq(kudos.organizationId, organizationId)
      );
    }

    return await db
      .select()
      .from(kudos)
      .where(whereCondition)
      .orderBy(desc(kudos.createdAt));
  }

  async getRecentKudos(organizationId: string, limit = 20): Promise<Kudos[]> {
    return await db
      .select()
      .from(kudos)
      .where(eq(kudos.organizationId, organizationId))
      .orderBy(desc(kudos.createdAt))
      .limit(limit);
  }

  async getPublicKudos(organizationId: string, limit = 20): Promise<Kudos[]> {
    return await db
      .select()
      .from(kudos)
      .where(and(
        eq(kudos.isPublic, true),
        eq(kudos.organizationId, organizationId)
      ))
      .orderBy(desc(kudos.createdAt))
      .limit(limit);
  }
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private teams: Map<string, Team> = new Map();
  private checkins: Map<string, Checkin> = new Map();
  private questions: Map<string, Question> = new Map();
  private wins: Map<string, Win> = new Map();
  private comments: Map<string, Comment> = new Map();
  private kudosMap: Map<string, Kudos> = new Map();

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
    const checkin: Checkin = {
      ...insertCheckin,
      id: randomUUID(),
      organizationId,
      submittedAt: (insertCheckin.isComplete ?? false) ? new Date() : null,
      createdAt: new Date(),
      responses: insertCheckin.responses ?? {},
      isComplete: insertCheckin.isComplete ?? false,
    };
    this.checkins.set(checkin.id, checkin);
    return checkin;
  }

  async updateCheckin(organizationId: string, id: string, checkinUpdate: Partial<InsertCheckin>): Promise<Checkin | undefined> {
    const checkin = this.checkins.get(id);
    if (!checkin || checkin.organizationId !== organizationId) return undefined;
    
    const updatedCheckin = { 
      ...checkin, 
      ...checkinUpdate,
      submittedAt: checkinUpdate.isComplete ? new Date() : checkin.submittedAt,
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
  async getKudos(organizationId: string, id: string): Promise<Kudos | undefined> {
    const kudosRecord = this.kudosMap.get(id);
    return kudosRecord && kudosRecord.organizationId === organizationId ? kudosRecord : undefined;
  }

  async createKudos(organizationId: string, insertKudos: InsertKudos & { fromUserId: string }): Promise<Kudos> {
    const kudosRecord: Kudos = {
      ...insertKudos,
      id: randomUUID(),
      organizationId,
      createdAt: new Date(),
      isPublic: insertKudos.isPublic ?? true,
      slackMessageId: insertKudos.slackMessageId ?? null,
    };
    this.kudosMap.set(kudosRecord.id, kudosRecord);
    return kudosRecord;
  }

  async updateKudos(organizationId: string, id: string, kudosUpdate: Partial<InsertKudos>): Promise<Kudos | undefined> {
    const kudosRecord = this.kudosMap.get(id);
    if (!kudosRecord || kudosRecord.organizationId !== organizationId) return undefined;
    
    const updatedKudos = { ...kudosRecord, ...kudosUpdate };
    this.kudosMap.set(id, updatedKudos);
    return updatedKudos;
  }

  async deleteKudos(organizationId: string, id: string): Promise<boolean> {
    const kudosRecord = this.kudosMap.get(id);
    if (!kudosRecord || kudosRecord.organizationId !== organizationId) return false;
    return this.kudosMap.delete(id);
  }

  async getKudosByUser(organizationId: string, userId: string, type?: 'received' | 'given'): Promise<Kudos[]> {
    return Array.from(this.kudosMap.values())
      .filter(kudosRecord => {
        if (kudosRecord.organizationId !== organizationId) return false;
        
        if (type === 'received') {
          return kudosRecord.toUserId === userId;
        } else if (type === 'given') {
          return kudosRecord.fromUserId === userId;
        } else {
          // Return both received and given
          return kudosRecord.toUserId === userId || kudosRecord.fromUserId === userId;
        }
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getRecentKudos(organizationId: string, limit = 20): Promise<Kudos[]> {
    return Array.from(this.kudosMap.values())
      .filter(kudosRecord => kudosRecord.organizationId === organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async getPublicKudos(organizationId: string, limit = 20): Promise<Kudos[]> {
    return Array.from(this.kudosMap.values())
      .filter(kudosRecord => kudosRecord.isPublic && kudosRecord.organizationId === organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}

export const storage = new DatabaseStorage();
