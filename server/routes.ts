import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { 
  insertUserSchema, insertTeamSchema, insertCheckinSchema, 
  insertQuestionSchema, insertWinSchema, insertCommentSchema, insertShoutoutSchema, updateShoutoutSchema,
  reviewCheckinSchema, ReviewStatus,
  type AnalyticsScope, type AnalyticsPeriod, type ShoutoutDirection, type ShoutoutVisibility, type LeaderboardMetric,
  type ReviewStatusType
} from "@shared/schema";
import { sendCheckinReminder, announceWin, sendTeamHealthUpdate, announceShoutout } from "./services/slack";
import { aggregationService } from "./services/aggregation";
import { requireOrganization, sanitizeForOrganization } from "./middleware/organization";
import { authenticateUser, requireAuth, requireRole, requireTeamLead } from "./middleware/auth";
import { authorizeAnalyticsAccess } from "./middleware/authorization";

export async function registerRoutes(app: Express): Promise<Server> {
  // Apply organization middleware to all API routes
  app.use("/api", requireOrganization());
  
  // Apply authentication middleware to all API routes
  app.use("/api", authenticateUser());
  
  // Apply authentication requirement to all protected routes
  // (Not all routes need authentication, so we'll add requireAuth() selectively)
  
  // Analytics validation schemas
  const analyticsBaseSchema = z.object({
    scope: z.enum(['organization', 'team', 'user']).default('organization'),
    id: z.string().optional(),
    period: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
    from: z.string().optional().refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'from' date format").transform(val => val ? new Date(val) : undefined),
    to: z.string().optional().refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'to' date format").transform(val => val ? new Date(val) : undefined),
  });
  
  const shoutoutAnalyticsSchema = analyticsBaseSchema.extend({
    direction: z.enum(['given', 'received', 'all']).default('all'),
    visibility: z.enum(['public', 'private', 'all']).default('all'),
  });
  
  const leaderboardSchema = analyticsBaseSchema.extend({
    metric: z.enum(['shoutouts_received', 'shoutouts_given', 'pulse_avg']).default('shoutouts_received'),
  });
  
  const overviewSchema = z.object({
    period: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
    from: z.string().optional().refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'from' date format").transform(val => val ? new Date(val) : undefined),
    to: z.string().optional().refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'to' date format").transform(val => val ? new Date(val) : undefined),
  });
  
  // Admin backfill schema
  const backfillSchema = z.object({
    from: z.string().refine((val) => {
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'from' date format").transform(val => new Date(val)),
    to: z.string().refine((val) => {
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, "Invalid 'to' date format").transform(val => new Date(val)),
  });
  
  // Users
  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getAllUsers(req.orgId);
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Get current authenticated user
  app.get("/api/users/current", requireAuth(), async (req, res) => {
    try {
      if (!req.currentUser) {
        return res.status(401).json({ message: "Authentication required" });
      }
      res.json(req.currentUser);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch current user" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.orgId, req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const sanitizedData = sanitizeForOrganization(userData, req.orgId);
      const user = await storage.createUser(req.orgId, sanitizedData);
      res.status(201).json(user);
    } catch (error) {
      res.status(400).json({ message: "Invalid user data" });
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const updates = insertUserSchema.partial().parse(req.body);
      const sanitizedUpdates = sanitizeForOrganization(updates, req.orgId);
      const user = await storage.updateUser(req.orgId, req.params.id, sanitizedUpdates);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(400).json({ message: "Invalid user data" });
    }
  });

  app.get("/api/users/:id/reports", async (req, res) => {
    try {
      const reports = await storage.getUsersByManager(req.orgId, req.params.id);
      res.json(reports);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  // Teams
  app.get("/api/teams", async (req, res) => {
    try {
      const teams = await storage.getAllTeams(req.orgId);
      res.json(teams);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  app.post("/api/teams", async (req, res) => {
    try {
      const teamData = insertTeamSchema.parse(req.body);
      const sanitizedData = sanitizeForOrganization(teamData, req.orgId);
      const team = await storage.createTeam(req.orgId, sanitizedData);
      res.status(201).json(team);
    } catch (error) {
      res.status(400).json({ message: "Invalid team data" });
    }
  });

  app.get("/api/teams/:id/members", async (req, res) => {
    try {
      const members = await storage.getUsersByTeam(req.orgId, req.params.id);
      res.json(members);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  // Check-ins
  app.get("/api/checkins", async (req, res) => {
    try {
      const { userId, managerId, limit } = req.query;
      let checkins;
      
      if (userId) {
        checkins = await storage.getCheckinsByUser(req.orgId, userId as string);
      } else if (managerId) {
        checkins = await storage.getCheckinsByManager(req.orgId, managerId as string);
      } else {
        checkins = await storage.getRecentCheckins(req.orgId, limit ? parseInt(limit as string) : undefined);
      }
      
      res.json(checkins);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch check-ins" });
    }
  });

  app.get("/api/checkins/:id", async (req, res) => {
    try {
      const checkin = await storage.getCheckin(req.orgId, req.params.id);
      if (!checkin) {
        return res.status(404).json({ message: "Check-in not found" });
      }
      res.json(checkin);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch check-in" });
    }
  });

  app.post("/api/checkins", async (req, res) => {
    try {
      const checkinData = insertCheckinSchema.parse(req.body);
      const sanitizedData = sanitizeForOrganization(checkinData, req.orgId);
      const checkin = await storage.createCheckin(req.orgId, sanitizedData);
      res.status(201).json(checkin);
    } catch (error) {
      console.error("Check-in validation error:", error);
      res.status(400).json({ 
        message: "Invalid check-in data",
        details: error instanceof Error ? error.message : "Unknown validation error"
      });
    }
  });

  app.patch("/api/checkins/:id", async (req, res) => {
    try {
      const updates = insertCheckinSchema.partial().parse(req.body);
      const sanitizedUpdates = sanitizeForOrganization(updates, req.orgId);
      const checkin = await storage.updateCheckin(req.orgId, req.params.id, sanitizedUpdates);
      if (!checkin) {
        return res.status(404).json({ message: "Check-in not found" });
      }
      res.json(checkin);
    } catch (error) {
      console.error("Check-in update validation error:", error);
      res.status(400).json({ 
        message: "Invalid check-in data",
        details: error instanceof Error ? error.message : "Unknown validation error"
      });
    }
  });

  app.get("/api/users/:id/current-checkin", async (req, res) => {
    try {
      const checkin = await storage.getCurrentWeekCheckin(req.orgId, req.params.id);
      res.json(checkin || null);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch current check-in" });
    }
  });

  // Check-in Review Endpoints
  app.get("/api/checkins/pending", requireAuth(), requireTeamLead(), async (req, res) => {
    try {
      const user = req.currentUser!;
      let checkins;
      
      if (user.role === "admin") {
        // Admins can see all pending check-ins
        checkins = await storage.getPendingCheckins(req.orgId);
      } else {
        // Get all pending check-ins for filtering
        checkins = await storage.getPendingCheckins(req.orgId);
        
        // Get users under this person's authority (direct reports + team members)
        const directReports = await storage.getUsersByManager(req.orgId, user.id);
        const teamMembers = await storage.getUsersByTeamLeadership(req.orgId, user.id);
        
        // Combine and deduplicate user IDs
        const authorizedUserIds = new Set([
          ...directReports.map(u => u.id),
          ...teamMembers.map(u => u.id)
        ]);
        
        // Filter check-ins to only include those from authorized users
        checkins = checkins.filter(checkin => authorizedUserIds.has(checkin.userId));
      }
      
      // Enhance with user information
      const enhancedCheckins = await Promise.all(
        checkins.map(async (checkin) => {
          const checkinUser = await storage.getUser(req.orgId, checkin.userId);
          const team = checkinUser?.teamId ? await storage.getTeam(req.orgId, checkinUser.teamId) : null;
          
          return {
            ...checkin,
            user: checkinUser ? {
              id: checkinUser.id,
              name: checkinUser.name,
              email: checkinUser.email,
              teamId: checkinUser.teamId,
              teamName: team?.name || null
            } : null
          };
        })
      );
      
      res.json(enhancedCheckins);
    } catch (error) {
      console.error("Failed to fetch pending check-ins:", error);
      res.status(500).json({ message: "Failed to fetch pending check-ins" });
    }
  });

  app.get("/api/checkins/review-status/:status", requireAuth(), requireTeamLead(), async (req, res) => {
    try {
      const status = req.params.status as ReviewStatusType;
      
      // Validate status parameter
      if (!Object.values(ReviewStatus).includes(status)) {
        return res.status(400).json({ message: "Invalid review status" });
      }
      
      const user = req.currentUser!;
      let checkins = await storage.getCheckinsByReviewStatus(req.orgId, status);
      
      // Filter by team if not admin
      if (user.role !== "admin") {
        // Get users under this person's authority (direct reports + team members)
        const directReports = await storage.getUsersByManager(req.orgId, user.id);
        const teamMembers = await storage.getUsersByTeamLeadership(req.orgId, user.id);
        
        // Combine and deduplicate user IDs
        const authorizedUserIds = new Set([
          ...directReports.map(u => u.id),
          ...teamMembers.map(u => u.id)
        ]);
        
        // Filter check-ins to only include those from authorized users
        checkins = checkins.filter(checkin => authorizedUserIds.has(checkin.userId));
      }
      
      // Enhance with user and reviewer information
      const enhancedCheckins = await Promise.all(
        checkins.map(async (checkin) => {
          const checkinUser = await storage.getUser(req.orgId, checkin.userId);
          const team = checkinUser?.teamId ? await storage.getTeam(req.orgId, checkinUser.teamId) : null;
          const reviewer = checkin.reviewedBy ? await storage.getUser(req.orgId, checkin.reviewedBy) : null;
          
          return {
            ...checkin,
            user: checkinUser ? {
              id: checkinUser.id,
              name: checkinUser.name,
              email: checkinUser.email,
              teamId: checkinUser.teamId,
              teamName: team?.name || null
            } : null,
            reviewer: reviewer ? {
              id: reviewer.id,
              name: reviewer.name,
              email: reviewer.email
            } : null
          };
        })
      );
      
      res.json(enhancedCheckins);
    } catch (error) {
      console.error("Failed to fetch check-ins by review status:", error);
      res.status(500).json({ message: "Failed to fetch check-ins by review status" });
    }
  });

  app.patch("/api/checkins/:id/review", requireAuth(), requireTeamLead(), async (req, res) => {
    try {
      const reviewData = reviewCheckinSchema.parse(req.body);
      const user = req.currentUser!;
      const checkinId = req.params.id;
      
      // Check if check-in exists
      const existingCheckin = await storage.getCheckin(req.orgId, checkinId);
      if (!existingCheckin) {
        return res.status(404).json({ message: "Check-in not found" });
      }
      
      // Verify authorization - check if user can review this check-in
      if (user.role !== "admin") {
        const checkinUser = await storage.getUser(req.orgId, existingCheckin.userId);
        if (!checkinUser) {
          return res.status(404).json({ message: "User not found" });
        }

        // Check if user is the direct manager
        const isDirectManager = checkinUser.managerId === user.id;
        
        // Check if user is a team leader of the check-in user's team
        let isTeamLeader = false;
        if (checkinUser.teamId) {
          const team = await storage.getTeam(req.orgId, checkinUser.teamId);
          isTeamLeader = team?.leaderId === user.id;
        }

        if (!isDirectManager && !isTeamLeader) {
          return res.status(403).json({ 
            message: "You can only review check-ins from your direct reports or team members" 
          });
        }
      }
      
      // Validate workflow state before allowing review
      if (existingCheckin.reviewStatus !== ReviewStatus.PENDING) {
        return res.status(409).json({ 
          message: "Check-in has already been reviewed and cannot be reviewed again",
          currentStatus: existingCheckin.reviewStatus 
        });
      }

      if (!existingCheckin.submittedAt || !existingCheckin.isComplete) {
        return res.status(400).json({ 
          message: "Check-in must be completed and submitted before it can be reviewed" 
        });
      }

      // Perform the review
      const updatedCheckin = await storage.reviewCheckin(req.orgId, checkinId, user.id, reviewData);
      
      if (!updatedCheckin) {
        return res.status(404).json({ message: "Check-in not found" });
      }
      
      // Enhance response with user and reviewer information
      const checkinUser = await storage.getUser(req.orgId, updatedCheckin.userId);
      const team = checkinUser?.teamId ? await storage.getTeam(req.orgId, checkinUser.teamId) : null;
      const reviewer = await storage.getUser(req.orgId, user.id);
      
      const enhancedCheckin = {
        ...updatedCheckin,
        user: checkinUser ? {
          id: checkinUser.id,
          name: checkinUser.name,
          email: checkinUser.email,
          teamId: checkinUser.teamId,
          teamName: team?.name || null
        } : null,
        reviewer: reviewer ? {
          id: reviewer.id,
          name: reviewer.name,
          email: reviewer.email
        } : null
      };
      
      res.json(enhancedCheckin);
    } catch (error) {
      console.error("Check-in review error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid review data",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to review check-in" });
    }
  });

  app.get("/api/checkins/leadership-view", requireAuth(), requireRole(['admin']), async (req, res) => {
    try {
      const { from, to, teamId, status, limit } = req.query;
      
      // Get all check-ins (we'll filter them based on query parameters)
      let checkins = await storage.getAllCheckins ? 
        await storage.getAllCheckins(req.orgId) : 
        await storage.getRecentCheckins(req.orgId, limit ? parseInt(limit as string) : 1000);
      
      // Apply filters
      if (status && Object.values(ReviewStatus).includes(status as ReviewStatusType)) {
        checkins = checkins.filter(checkin => checkin.reviewStatus === status);
      }
      
      if (from) {
        const fromDate = new Date(from as string);
        checkins = checkins.filter(checkin => new Date(checkin.createdAt) >= fromDate);
      }
      
      if (to) {
        const toDate = new Date(to as string);
        checkins = checkins.filter(checkin => new Date(checkin.createdAt) <= toDate);
      }
      
      // Enhance with complete user, team, and reviewer information
      const enhancedCheckins = await Promise.all(
        checkins.map(async (checkin) => {
          const checkinUser = await storage.getUser(req.orgId, checkin.userId);
          const team = checkinUser?.teamId ? await storage.getTeam(req.orgId, checkinUser.teamId) : null;
          const reviewer = checkin.reviewedBy ? await storage.getUser(req.orgId, checkin.reviewedBy) : null;
          
          return {
            ...checkin,
            user: checkinUser ? {
              id: checkinUser.id,
              name: checkinUser.name,
              email: checkinUser.email,
              role: checkinUser.role,
              teamId: checkinUser.teamId,
              teamName: team?.name || null,
              managerId: checkinUser.managerId
            } : null,
            team: team ? {
              id: team.id,
              name: team.name,
              description: team.description
            } : null,
            reviewer: reviewer ? {
              id: reviewer.id,
              name: reviewer.name,
              email: reviewer.email,
              role: reviewer.role
            } : null
          };
        })
      );
      
      // Apply team filter after enhancement (if specified)
      const filteredCheckins = teamId ? 
        enhancedCheckins.filter(checkin => checkin.user?.teamId === teamId) : 
        enhancedCheckins;
      
      // Sort by creation date (newest first)
      filteredCheckins.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      res.json(filteredCheckins);
    } catch (error) {
      console.error("Failed to fetch leadership view:", error);
      res.status(500).json({ message: "Failed to fetch leadership view" });
    }
  });

  // Questions
  app.get("/api/questions", async (req, res) => {
    try {
      const questions = await storage.getActiveQuestions(req.orgId);
      res.json(questions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch questions" });
    }
  });

  app.post("/api/questions", async (req, res) => {
    try {
      const questionData = insertQuestionSchema.parse(req.body);
      const sanitizedData = sanitizeForOrganization(questionData, req.orgId);
      const question = await storage.createQuestion(req.orgId, sanitizedData);
      res.status(201).json(question);
    } catch (error) {
      res.status(400).json({ message: "Invalid question data" });
    }
  });

  app.patch("/api/questions/:id", async (req, res) => {
    try {
      const updates = insertQuestionSchema.partial().parse(req.body);
      const sanitizedUpdates = sanitizeForOrganization(updates, req.orgId);
      const question = await storage.updateQuestion(req.orgId, req.params.id, sanitizedUpdates);
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }
      res.json(question);
    } catch (error) {
      res.status(400).json({ message: "Invalid question data" });
    }
  });

  app.delete("/api/questions/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteQuestion(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Question not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete question" });
    }
  });

  // Wins
  app.get("/api/wins", async (req, res) => {
    try {
      const { public: isPublic, limit } = req.query;
      let wins;
      
      if (isPublic === "true") {
        wins = await storage.getPublicWins(req.orgId, limit ? parseInt(limit as string) : undefined);
      } else {
        wins = await storage.getRecentWins(req.orgId, limit ? parseInt(limit as string) : undefined);
      }
      
      res.json(wins);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch wins" });
    }
  });

  app.post("/api/wins", async (req, res) => {
    try {
      const winData = insertWinSchema.parse(req.body);
      const sanitizedData = sanitizeForOrganization(winData, req.orgId);
      const win = await storage.createWin(req.orgId, sanitizedData);
      
      // Announce to Slack if public
      if (win.isPublic) {
        const user = await storage.getUser(req.orgId, win.userId);
        const nominator = win.nominatedBy ? await storage.getUser(req.orgId, win.nominatedBy) : null;
        
        if (user) {
          const slackMessageId = await announceWin(
            win.title, 
            win.description, 
            user.name, 
            nominator?.name
          );
          
          if (slackMessageId) {
            await storage.updateWin(req.orgId, win.id, { slackMessageId });
          }
        }
      }
      
      res.status(201).json(win);
    } catch (error) {
      res.status(400).json({ message: "Invalid win data" });
    }
  });

  app.patch("/api/wins/:id", async (req, res) => {
    try {
      // Use the partial insert schema for consistent validation
      const updates = insertWinSchema.partial().parse(req.body);
      const sanitizedUpdates = sanitizeForOrganization(updates, req.orgId);
      const win = await storage.updateWin(req.orgId, req.params.id, sanitizedUpdates);
      if (!win) {
        return res.status(404).json({ message: "Win not found" });
      }
      res.json(win);
    } catch (error) {
      console.error("Win update validation error:", error);
      res.status(400).json({ 
        message: "Invalid win data",
        details: error instanceof Error ? error.message : "Unknown validation error"
      });
    }
  });

  app.delete("/api/wins/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteWin(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Win not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete win" });
    }
  });

  // Helper function to check if user can access private shoutouts
  const canAccessShoutouts = (shoutout: any, currentUserId: string, user?: any): boolean => {
    // Public shoutouts are always accessible
    if (shoutout.isPublic) return true;
    
    // Private shoutouts are only accessible to:
    // 1. The giver (fromUserId)
    // 2. The recipient (toUserId)
    // 3. Admins/managers (future: when user roles are available)
    return shoutout.fromUserId === currentUserId || shoutout.toUserId === currentUserId;
  };

  // Shoutouts
  app.get("/api/shoutouts", async (req, res) => {
    try {
      const { public: isPublic, userId, type, limit } = req.query;
      // TODO: Replace with actual authenticated user ID when auth is implemented
      const currentUserId = "current-user-id";
      let shoutouts;
      
      if (userId) {
        shoutouts = await storage.getShoutoutsByUser(req.orgId, userId as string, type as 'received' | 'given' | undefined);
      } else if (isPublic === "true") {
        shoutouts = await storage.getPublicShoutouts(req.orgId, limit ? parseInt(limit as string) : undefined);
      } else {
        shoutouts = await storage.getRecentShoutouts(req.orgId, limit ? parseInt(limit as string) : undefined);
      }
      
      // Filter private shoutouts based on user permissions
      const filteredShoutouts = shoutouts.filter(k => canAccessShoutouts(k, currentUserId));
      
      res.json(filteredShoutouts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch shoutouts" });
    }
  });

  app.get("/api/shoutouts/:id", async (req, res) => {
    try {
      const shoutout = await storage.getShoutout(req.orgId, req.params.id);
      if (!shoutout) {
        return res.status(404).json({ message: "Shoutout not found" });
      }
      
      // TODO: Replace with actual authenticated user ID when auth is implemented
      const currentUserId = "current-user-id";
      
      // Check if user can access this shoutout (privacy enforcement)
      if (!canAccessShoutouts(shoutout, currentUserId)) {
        return res.status(404).json({ message: "Shoutout not found" }); // Don't reveal existence
      }
      
      res.json(shoutout);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch shoutout" });
    }
  });

  app.post("/api/shoutouts", async (req, res) => {
    try {
      const shoutoutData = insertShoutoutSchema.parse(req.body);
      
      // TODO: Replace with actual authenticated user ID when auth is implemented
      const currentUserId = "current-user-id";
      
      // SECURITY: Never accept fromUserId from client - set server-side
      const shoutoutWithSender = {
        ...shoutoutData,
        fromUserId: currentUserId
      };
      
      const sanitizedData = sanitizeForOrganization(shoutoutWithSender, req.orgId);
      const shoutout = await storage.createShoutout(req.orgId, sanitizedData);
      
      // Send Slack notification if public
      if (shoutout.isPublic) {
        const fromUser = await storage.getUser(req.orgId, shoutout.fromUserId);
        const toUser = await storage.getUser(req.orgId, shoutout.toUserId);
        
        if (fromUser && toUser) {
          try {
            const slackMessageId = await announceShoutout(
              shoutout.message,
              fromUser.name,
              toUser.name,
              shoutout.values
            );
            
            if (slackMessageId) {
              await storage.updateShoutout(req.orgId, shoutout.id, { slackMessageId });
            }
          } catch (slackError) {
            console.warn("Failed to send Slack notification for shoutout:", slackError);
          }
        }
      }
      
      res.status(201).json(shoutout);
    } catch (error) {
      console.error("Shoutout creation validation error:", error);
      res.status(400).json({ 
        message: "Invalid shoutout data",
        details: error instanceof Error ? error.message : "Unknown validation error"
      });
    }
  });

  app.patch("/api/shoutouts/:id", async (req, res) => {
    try {
      // Use separate update schema that only allows safe fields
      const updates = updateShoutoutSchema.parse(req.body);
      
      // TODO: Replace with actual authenticated user ID when auth is implemented
      const currentUserId = "current-user-id";
      
      // Check if shoutout exists and user has permission to edit
      const existingShoutout = await storage.getShoutout(req.orgId, req.params.id);
      if (!existingShoutout) {
        return res.status(404).json({ message: "Shoutout not found" });
      }
      
      // Only the original giver can edit shoutouts
      if (existingShoutout.fromUserId !== currentUserId) {
        return res.status(403).json({ message: "You can only edit shoutouts you sent" });
      }
      
      const sanitizedUpdates = sanitizeForOrganization(updates, req.orgId);
      const shoutout = await storage.updateShoutout(req.orgId, req.params.id, sanitizedUpdates);
      if (!shoutout) {
        return res.status(404).json({ message: "Shoutout not found" });
      }
      res.json(shoutout);
    } catch (error) {
      console.error("Shoutout update validation error:", error);
      res.status(400).json({ 
        message: "Invalid shoutout data",
        details: error instanceof Error ? error.message : "Unknown validation error"
      });
    }
  });

  app.delete("/api/shoutouts/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteShoutout(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Shoutout not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete shoutout" });
    }
  });

  // User-specific shoutouts endpoint
  app.get("/api/users/:id/shoutouts", async (req, res) => {
    try {
      const { type, limit } = req.query;
      const shoutouts = await storage.getShoutoutsByUser(
        req.orgId, 
        req.params.id, 
        type as 'received' | 'given' | undefined
      );
      
      const limitedShoutouts = limit ? shoutouts.slice(0, parseInt(limit as string)) : shoutouts;
      res.json(limitedShoutouts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user shoutouts" });
    }
  });

  // Comments
  app.get("/api/checkins/:id/comments", async (req, res) => {
    try {
      const comments = await storage.getCommentsByCheckin(req.orgId, req.params.id);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.post("/api/checkins/:id/comments", async (req, res) => {
    try {
      const commentData = insertCommentSchema.parse({
        ...req.body,
        checkinId: req.params.id,
      });
      const sanitizedData = sanitizeForOrganization(commentData, req.orgId);
      const comment = await storage.createComment(req.orgId, sanitizedData);
      res.status(201).json(comment);
    } catch (error) {
      res.status(400).json({ message: "Invalid comment data" });
    }
  });

  app.patch("/api/comments/:id", async (req, res) => {
    try {
      // Only allow updating the content field for security
      const updateSchema = z.object({ content: z.string().min(1, "Content is required") });
      const updates = updateSchema.parse(req.body);
      const comment = await storage.updateComment(req.orgId, req.params.id, updates);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      res.json(comment);
    } catch (error) {
      res.status(400).json({ message: "Invalid comment data" });
    }
  });

  app.delete("/api/comments/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteComment(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Comment not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });

  // Analytics & Stats
  app.get("/api/analytics/team-health", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const recentCheckins = await storage.getRecentCheckins(req.orgId, 100);
      const totalCheckins = recentCheckins.length;
      
      if (totalCheckins === 0) {
        return res.json({
          averageRating: 0,
          completionRate: 0,
          totalCheckins: 0
        });
      }
      
      const sumRatings = recentCheckins.reduce((sum, checkin) => sum + checkin.overallMood, 0);
      const averageRating = sumRatings / totalCheckins;
      
      // Calculate completion rate for current week
      const allUsers = await storage.getAllUsers(req.orgId);
      const activeUsers = allUsers.filter(user => user.isActive);
      const completedThisWeek = recentCheckins.filter(checkin => {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        return checkin.weekOf >= weekStart && checkin.isComplete;
      }).length;
      
      const completionRate = Math.round((completedThisWeek / activeUsers.length) * 100);
      
      res.json({
        averageRating: Math.round(averageRating * 10) / 10,
        completionRate,
        totalCheckins
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch team health analytics" });
    }
  });

  // Analytics - Pulse Metrics
  app.get("/api/analytics/pulse", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = analyticsBaseSchema.parse(req.query);
      
      // Validate scope and id relationship
      if ((query.scope === 'team' || query.scope === 'user') && !query.id) {
        return res.status(400).json({ message: "ID is required for team and user scopes" });
      }
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      const metrics = await storage.getPulseMetrics(req.orgId, {
        scope: query.scope as AnalyticsScope,
        entityId: query.id,
        period: query.period as AnalyticsPeriod,
        from: query.from,
        to: query.to,
      });
      
      res.json(metrics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to fetch pulse analytics" });
    }
  });

  // Analytics - Shoutout Metrics  
  app.get("/api/analytics/shoutouts", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = shoutoutAnalyticsSchema.parse(req.query);
      
      // Validate scope and id relationship
      if ((query.scope === 'team' || query.scope === 'user') && !query.id) {
        return res.status(400).json({ message: "ID is required for team and user scopes" });
      }
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      const metrics = await storage.getShoutoutMetrics(req.orgId, {
        scope: query.scope as AnalyticsScope,
        entityId: query.id,
        period: query.period as AnalyticsPeriod,
        direction: query.direction as ShoutoutDirection,
        visibility: query.visibility as ShoutoutVisibility,
        from: query.from,
        to: query.to,
      });
      
      res.json(metrics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to fetch shoutout analytics" });
    }
  });

  // Analytics - Leaderboard
  app.get("/api/analytics/leaderboard", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = leaderboardSchema.parse(req.query);
      
      // Validate scope and id relationship
      if ((query.scope === 'team' || query.scope === 'user') && !query.id) {
        return res.status(400).json({ message: "ID is required for team and user scopes" });
      }
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      const leaderboard = await storage.getLeaderboard(req.orgId, {
        metric: query.metric as LeaderboardMetric,
        scope: query.scope as AnalyticsScope,
        entityId: query.id,
        period: query.period as AnalyticsPeriod,
        from: query.from,
        to: query.to,
      });
      
      res.json(leaderboard);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to fetch leaderboard analytics" });
    }
  });

  // Analytics - Overview
  app.get("/api/analytics/overview", requireAuth(), authorizeAnalyticsAccess(), async (req, res) => {
    try {
      const query = overviewSchema.parse(req.query);
      
      // Validate date range
      if (query.from && query.to && query.from > query.to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }
      
      const overview = await storage.getAnalyticsOverview(
        req.orgId,
        query.period as AnalyticsPeriod,
        query.from,
        query.to
      );
      
      res.json(overview);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters",
          details: error.errors
        });
      }
      res.status(500).json({ message: "Failed to fetch analytics overview" });
    }
  });

  // Slack Integration
  app.post("/api/slack/send-checkin-reminder", async (req, res) => {
    try {
      const users = await storage.getAllUsers(req.orgId);
      const activeUsers = users.filter(user => user.isActive);
      
      // Find users who haven't completed this week's check-in
      const currentWeekStart = new Date();
      currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
      currentWeekStart.setHours(0, 0, 0, 0);
      
      const usersNeedingReminder = [];
      for (const user of activeUsers) {
        const currentCheckin = await storage.getCurrentWeekCheckin(req.orgId, user.id);
        if (!currentCheckin || !currentCheckin.isComplete) {
          usersNeedingReminder.push(user.name);
        }
      }
      
      if (usersNeedingReminder.length > 0) {
        // Fetch active questions to include in the reminder
        const questions = await storage.getActiveQuestions(req.orgId);
        await sendCheckinReminder(usersNeedingReminder, questions);
      }
      
      res.json({ 
        message: "Reminder sent", 
        userCount: usersNeedingReminder.length,
        questionsIncluded: await storage.getActiveQuestions(req.orgId).then(q => q.length)
      });
    } catch (error) {
      console.error("Failed to send check-in reminder:", error);
      res.status(500).json({ message: "Failed to send reminder" });
    }
  });

  app.post("/api/slack/send-team-health-update", async (req, res) => {
    try {
      const recentCheckins = await storage.getRecentCheckins(req.orgId, 50);
      const recentWins = await storage.getRecentWins(req.orgId, 20);
      const allUsers = await storage.getAllUsers(req.orgId);
      const activeUsers = allUsers.filter(user => user.isActive);
      
      const averageRating = recentCheckins.length > 0 
        ? recentCheckins.reduce((sum, checkin) => sum + checkin.overallMood, 0) / recentCheckins.length
        : 0;
      
      const currentWeekStart = new Date();
      currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
      currentWeekStart.setHours(0, 0, 0, 0);
      
      const completedThisWeek = recentCheckins.filter(checkin => 
        checkin.weekOf >= currentWeekStart && checkin.isComplete
      ).length;
      const completionRate = Math.round((completedThisWeek / activeUsers.length) * 100);
      
      const winsThisWeek = recentWins.filter(win => 
        win.createdAt >= currentWeekStart
      ).length;
      
      await sendTeamHealthUpdate(averageRating, completionRate, winsThisWeek);
      
      res.json({ message: "Team health update sent" });
    } catch (error) {
      res.status(500).json({ message: "Failed to send team health update" });
    }
  });

  // Admin aggregation endpoints
  app.post("/api/admin/aggregation/backfill", requireAuth(), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const validation = backfillSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid backfill parameters",
          errors: validation.error.errors
        });
      }

      const { from, to } = validation.data;

      // Validate date range
      if (from >= to) {
        return res.status(400).json({ message: "From date must be before to date" });
      }

      const maxRangeDays = 90; // Limit backfill to 90 days
      const rangeDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
      if (rangeDays > maxRangeDays) {
        return res.status(400).json({ 
          message: `Backfill range too large. Maximum ${maxRangeDays} days allowed.` 
        });
      }

      console.log(`Admin ${req.currentUser.name} initiated backfill for org ${req.orgId} from ${from.toISOString()} to ${to.toISOString()}`);

      // Start backfill (async - don't wait for completion)
      aggregationService.backfillHistoricalData(req.orgId, from, to).catch(error => {
        console.error(`Backfill failed for org ${req.orgId}:`, error);
      });

      res.json({ 
        message: "Backfill initiated successfully",
        from: from.toISOString(),
        to: to.toISOString(),
        organizationId: req.orgId
      });
    } catch (error) {
      console.error("Admin backfill error:", error);
      res.status(500).json({ message: "Failed to initiate backfill" });
    }
  });

  // Admin endpoint to check aggregation status
  app.get("/api/admin/aggregation/status", requireAuth(), async (req, res) => {
    try {
      // Check if user is admin
      if (!req.currentUser || req.currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      res.json({
        useAggregates: process.env.USE_AGGREGATES === 'true',
        shadowReads: process.env.ENABLE_SHADOW_READS === 'true',
        organizationId: req.orgId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Admin aggregation status error:", error);
      res.status(500).json({ message: "Failed to get aggregation status" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
