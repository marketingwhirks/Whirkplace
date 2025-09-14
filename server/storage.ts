import { 
  type User, type InsertUser,
  type Team, type InsertTeam,
  type Checkin, type InsertCheckin,
  type Question, type InsertQuestion,
  type Win, type InsertWin,
  type Comment, type InsertComment,
  users, teams, checkins, questions, wins, comments
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, desc, and, gte } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  getUsersByTeam(teamId: string): Promise<User[]>;
  getUsersByManager(managerId: string): Promise<User[]>;
  getAllUsers(): Promise<User[]>;

  // Teams
  getTeam(id: string): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: string, team: Partial<InsertTeam>): Promise<Team | undefined>;
  getAllTeams(): Promise<Team[]>;

  // Check-ins
  getCheckin(id: string): Promise<Checkin | undefined>;
  createCheckin(checkin: InsertCheckin): Promise<Checkin>;
  updateCheckin(id: string, checkin: Partial<InsertCheckin>): Promise<Checkin | undefined>;
  getCheckinsByUser(userId: string): Promise<Checkin[]>;
  getCheckinsByManager(managerId: string): Promise<Checkin[]>;
  getCurrentWeekCheckin(userId: string): Promise<Checkin | undefined>;
  getRecentCheckins(limit?: number): Promise<Checkin[]>;

  // Questions
  getQuestion(id: string): Promise<Question | undefined>;
  createQuestion(question: InsertQuestion): Promise<Question>;
  updateQuestion(id: string, question: Partial<InsertQuestion>): Promise<Question | undefined>;
  deleteQuestion(id: string): Promise<boolean>;
  getActiveQuestions(): Promise<Question[]>;

  // Wins
  getWin(id: string): Promise<Win | undefined>;
  createWin(win: InsertWin): Promise<Win>;
  updateWin(id: string, win: Partial<InsertWin>): Promise<Win | undefined>;
  deleteWin(id: string): Promise<boolean>;
  getRecentWins(limit?: number): Promise<Win[]>;
  getPublicWins(limit?: number): Promise<Win[]>;

  // Comments
  getComment(id: string): Promise<Comment | undefined>;
  createComment(comment: InsertComment): Promise<Comment>;
  getCommentsByCheckin(checkinId: string): Promise<Comment[]>;
}

export class DatabaseStorage implements IStorage {
  constructor() {
    // Database will be initialized when tables are created via db:push
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        isActive: insertUser.isActive ?? true,
        role: insertUser.role ?? "member",
        teamId: insertUser.teamId ?? null,
        managerId: insertUser.managerId ?? null,
        avatar: insertUser.avatar ?? null,
      })
      .returning();
    return user;
  }

  async updateUser(id: string, userUpdate: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(userUpdate)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async getUsersByTeam(teamId: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.teamId, teamId));
  }

  async getUsersByManager(managerId: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.managerId, managerId));
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  // Teams
  async getTeam(id: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    return team || undefined;
  }

  async createTeam(insertTeam: InsertTeam): Promise<Team> {
    const [team] = await db
      .insert(teams)
      .values({
        ...insertTeam,
        description: insertTeam.description ?? null,
      })
      .returning();
    return team;
  }

  async updateTeam(id: string, teamUpdate: Partial<InsertTeam>): Promise<Team | undefined> {
    const [team] = await db
      .update(teams)
      .set(teamUpdate)
      .where(eq(teams.id, id))
      .returning();
    return team || undefined;
  }

  async getAllTeams(): Promise<Team[]> {
    return await db.select().from(teams);
  }

  // Check-ins
  async getCheckin(id: string): Promise<Checkin | undefined> {
    const [checkin] = await db.select().from(checkins).where(eq(checkins.id, id));
    return checkin || undefined;
  }

  async createCheckin(insertCheckin: InsertCheckin): Promise<Checkin> {
    const [checkin] = await db
      .insert(checkins)
      .values({
        ...insertCheckin,
        responses: insertCheckin.responses ?? {},
        isComplete: insertCheckin.isComplete ?? false,
      })
      .returning();
    return checkin;
  }

  async updateCheckin(id: string, checkinUpdate: Partial<InsertCheckin>): Promise<Checkin | undefined> {
    const [checkin] = await db
      .update(checkins)
      .set(checkinUpdate)
      .where(eq(checkins.id, id))
      .returning();
    return checkin || undefined;
  }

  async getCheckinsByUser(userId: string): Promise<Checkin[]> {
    return await db
      .select()
      .from(checkins)
      .where(eq(checkins.userId, userId))
      .orderBy(desc(checkins.createdAt));
  }

  async getCheckinsByManager(managerId: string): Promise<Checkin[]> {
    const reports = await this.getUsersByManager(managerId);
    const reportIds = reports.map(user => user.id);
    
    if (reportIds.length === 0) return [];
    
    // TODO: Fix this to handle multiple report IDs using inArray
    return await db
      .select()
      .from(checkins)
      .where(eq(checkins.userId, reportIds[0]))
      .orderBy(desc(checkins.createdAt));
  }

  async getCurrentWeekCheckin(userId: string): Promise<Checkin | undefined> {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);
    
    const [checkin] = await db
      .select()
      .from(checkins)
      .where(and(
        eq(checkins.userId, userId),
        gte(checkins.weekOf, startOfWeek)
      ))
      .limit(1);
    
    return checkin || undefined;
  }

  async getRecentCheckins(limit = 10): Promise<Checkin[]> {
    return await db
      .select()
      .from(checkins)
      .where(eq(checkins.isComplete, true))
      .orderBy(desc(checkins.createdAt))
      .limit(limit);
  }

  // Questions
  async getQuestion(id: string): Promise<Question | undefined> {
    const [question] = await db.select().from(questions).where(eq(questions.id, id));
    return question || undefined;
  }

  async createQuestion(insertQuestion: InsertQuestion): Promise<Question> {
    const [question] = await db
      .insert(questions)
      .values({
        ...insertQuestion,
        isActive: insertQuestion.isActive ?? true,
        order: insertQuestion.order ?? 0,
      })
      .returning();
    return question;
  }

  async updateQuestion(id: string, questionUpdate: Partial<InsertQuestion>): Promise<Question | undefined> {
    const [question] = await db
      .update(questions)
      .set(questionUpdate)
      .where(eq(questions.id, id))
      .returning();
    return question || undefined;
  }

  async deleteQuestion(id: string): Promise<boolean> {
    const result = await db.delete(questions).where(eq(questions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getActiveQuestions(): Promise<Question[]> {
    return await db
      .select()
      .from(questions)
      .where(eq(questions.isActive, true))
      .orderBy(questions.order);
  }

  // Wins
  async getWin(id: string): Promise<Win | undefined> {
    const [win] = await db.select().from(wins).where(eq(wins.id, id));
    return win || undefined;
  }

  async createWin(insertWin: InsertWin): Promise<Win> {
    const [win] = await db
      .insert(wins)
      .values({
        ...insertWin,
        nominatedBy: insertWin.nominatedBy ?? null,
        isPublic: insertWin.isPublic ?? true,
        slackMessageId: insertWin.slackMessageId ?? null,
      })
      .returning();
    return win;
  }

  async updateWin(id: string, winUpdate: Partial<InsertWin>): Promise<Win | undefined> {
    const [win] = await db
      .update(wins)
      .set(winUpdate)
      .where(eq(wins.id, id))
      .returning();
    return win || undefined;
  }

  async deleteWin(id: string): Promise<boolean> {
    const result = await db.delete(wins).where(eq(wins.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getRecentWins(limit = 10): Promise<Win[]> {
    return await db
      .select()
      .from(wins)
      .orderBy(desc(wins.createdAt))
      .limit(limit);
  }

  async getPublicWins(limit = 10): Promise<Win[]> {
    return await db
      .select()
      .from(wins)
      .where(eq(wins.isPublic, true))
      .orderBy(desc(wins.createdAt))
      .limit(limit);
  }

  // Comments
  async getComment(id: string): Promise<Comment | undefined> {
    const [comment] = await db.select().from(comments).where(eq(comments.id, id));
    return comment || undefined;
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const [comment] = await db
      .insert(comments)
      .values(insertComment)
      .returning();
    return comment;
  }

  async getCommentsByCheckin(checkinId: string): Promise<Comment[]> {
    return await db
      .select()
      .from(comments)
      .where(eq(comments.checkinId, checkinId))
      .orderBy(desc(comments.createdAt));
  }
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private teams: Map<string, Team> = new Map();
  private checkins: Map<string, Checkin> = new Map();
  private questions: Map<string, Question> = new Map();
  private wins: Map<string, Win> = new Map();
  private comments: Map<string, Comment> = new Map();

  constructor() {
    this.seedData();
  }

  private seedData() {
    // Create default admin user
    const adminUser: User = {
      id: randomUUID(),
      username: "admin",
      password: "password123",
      name: "Admin User",
      email: "admin@teampulse.com",
      role: "admin",
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
      leaderId: adminUser.id,
      createdAt: new Date(),
    };
    this.teams.set(defaultTeam.id, defaultTeam);

    // Create default questions
    const defaultQuestions: Question[] = [
      {
        id: randomUUID(),
        text: "What are you most proud of this week?",
        createdBy: adminUser.id,
        isActive: true,
        order: 1,
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        text: "What challenges did you face?",
        createdBy: adminUser.id,
        isActive: true,
        order: 2,
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        text: "How can your manager support you?",
        createdBy: adminUser.id,
        isActive: true,
        order: 3,
        createdAt: new Date(),
      },
    ];
    
    defaultQuestions.forEach(q => this.questions.set(q.id, q));
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const user: User = {
      ...insertUser,
      id: randomUUID(),
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

  async updateUser(id: string, userUpdate: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...userUpdate };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getUsersByTeam(teamId: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.teamId === teamId);
  }

  async getUsersByManager(managerId: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.managerId === managerId);
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  // Teams
  async getTeam(id: string): Promise<Team | undefined> {
    return this.teams.get(id);
  }

  async createTeam(insertTeam: InsertTeam): Promise<Team> {
    const team: Team = {
      ...insertTeam,
      id: randomUUID(),
      createdAt: new Date(),
      description: insertTeam.description ?? null,
    };
    this.teams.set(team.id, team);
    return team;
  }

  async updateTeam(id: string, teamUpdate: Partial<InsertTeam>): Promise<Team | undefined> {
    const team = this.teams.get(id);
    if (!team) return undefined;
    
    const updatedTeam = { ...team, ...teamUpdate };
    this.teams.set(id, updatedTeam);
    return updatedTeam;
  }

  async getAllTeams(): Promise<Team[]> {
    return Array.from(this.teams.values());
  }

  // Check-ins
  async getCheckin(id: string): Promise<Checkin | undefined> {
    return this.checkins.get(id);
  }

  async createCheckin(insertCheckin: InsertCheckin): Promise<Checkin> {
    const checkin: Checkin = {
      ...insertCheckin,
      id: randomUUID(),
      submittedAt: (insertCheckin.isComplete ?? false) ? new Date() : null,
      createdAt: new Date(),
      responses: insertCheckin.responses ?? {},
      isComplete: insertCheckin.isComplete ?? false,
    };
    this.checkins.set(checkin.id, checkin);
    return checkin;
  }

  async updateCheckin(id: string, checkinUpdate: Partial<InsertCheckin>): Promise<Checkin | undefined> {
    const checkin = this.checkins.get(id);
    if (!checkin) return undefined;
    
    const updatedCheckin = { 
      ...checkin, 
      ...checkinUpdate,
      submittedAt: checkinUpdate.isComplete ? new Date() : checkin.submittedAt,
    };
    this.checkins.set(id, updatedCheckin);
    return updatedCheckin;
  }

  async getCheckinsByUser(userId: string): Promise<Checkin[]> {
    return Array.from(this.checkins.values())
      .filter(checkin => checkin.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getCheckinsByManager(managerId: string): Promise<Checkin[]> {
    const reports = await this.getUsersByManager(managerId);
    const reportIds = reports.map(user => user.id);
    
    return Array.from(this.checkins.values())
      .filter(checkin => reportIds.includes(checkin.userId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getCurrentWeekCheckin(userId: string): Promise<Checkin | undefined> {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);
    
    return Array.from(this.checkins.values())
      .find(checkin => 
        checkin.userId === userId && 
        checkin.weekOf >= startOfWeek
      );
  }

  async getRecentCheckins(limit = 10): Promise<Checkin[]> {
    return Array.from(this.checkins.values())
      .filter(checkin => checkin.isComplete)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // Questions
  async getQuestion(id: string): Promise<Question | undefined> {
    return this.questions.get(id);
  }

  async createQuestion(insertQuestion: InsertQuestion): Promise<Question> {
    const question: Question = {
      ...insertQuestion,
      id: randomUUID(),
      createdAt: new Date(),
      isActive: insertQuestion.isActive ?? true,
      order: insertQuestion.order ?? 0,
    };
    this.questions.set(question.id, question);
    return question;
  }

  async updateQuestion(id: string, questionUpdate: Partial<InsertQuestion>): Promise<Question | undefined> {
    const question = this.questions.get(id);
    if (!question) return undefined;
    
    const updatedQuestion = { ...question, ...questionUpdate };
    this.questions.set(id, updatedQuestion);
    return updatedQuestion;
  }

  async deleteQuestion(id: string): Promise<boolean> {
    return this.questions.delete(id);
  }

  async getActiveQuestions(): Promise<Question[]> {
    return Array.from(this.questions.values())
      .filter(question => question.isActive)
      .sort((a, b) => a.order - b.order);
  }

  // Wins
  async getWin(id: string): Promise<Win | undefined> {
    return this.wins.get(id);
  }

  async createWin(insertWin: InsertWin): Promise<Win> {
    const win: Win = {
      ...insertWin,
      id: randomUUID(),
      createdAt: new Date(),
      nominatedBy: insertWin.nominatedBy ?? null,
      isPublic: insertWin.isPublic ?? true,
      slackMessageId: insertWin.slackMessageId ?? null,
    };
    this.wins.set(win.id, win);
    return win;
  }

  async updateWin(id: string, winUpdate: Partial<InsertWin>): Promise<Win | undefined> {
    const win = this.wins.get(id);
    if (!win) return undefined;
    
    const updatedWin = { ...win, ...winUpdate };
    this.wins.set(id, updatedWin);
    return updatedWin;
  }

  async deleteWin(id: string): Promise<boolean> {
    return this.wins.delete(id);
  }

  async getRecentWins(limit = 10): Promise<Win[]> {
    return Array.from(this.wins.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async getPublicWins(limit = 10): Promise<Win[]> {
    return Array.from(this.wins.values())
      .filter(win => win.isPublic)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // Comments
  async getComment(id: string): Promise<Comment | undefined> {
    return this.comments.get(id);
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const comment: Comment = {
      ...insertComment,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.comments.set(comment.id, comment);
    return comment;
  }

  async getCommentsByCheckin(checkinId: string): Promise<Comment[]> {
    return Array.from(this.comments.values())
      .filter(comment => comment.checkinId === checkinId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

export const storage = new DatabaseStorage();
