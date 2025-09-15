import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { 
  insertUserSchema, insertTeamSchema, insertCheckinSchema, 
  insertQuestionSchema, insertWinSchema, insertCommentSchema, insertKudosSchema, updateKudosSchema 
} from "@shared/schema";
import { sendCheckinReminder, announceWin, sendTeamHealthUpdate, announceKudos } from "./services/slack";
import { requireOrganization, sanitizeForOrganization } from "./middleware/organization";

export async function registerRoutes(app: Express): Promise<Server> {
  // Apply organization middleware to all API routes
  app.use("/api", requireOrganization());
  
  // Users
  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getAllUsers(req.orgId);
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
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

  // Helper function to check if user can access private kudos
  const canAccessKudos = (kudos: any, currentUserId: string, user?: any): boolean => {
    // Public kudos are always accessible
    if (kudos.isPublic) return true;
    
    // Private kudos are only accessible to:
    // 1. The giver (fromUserId)
    // 2. The recipient (toUserId)
    // 3. Admins/managers (future: when user roles are available)
    return kudos.fromUserId === currentUserId || kudos.toUserId === currentUserId;
  };

  // Kudos
  app.get("/api/kudos", async (req, res) => {
    try {
      const { public: isPublic, userId, type, limit } = req.query;
      // TODO: Replace with actual authenticated user ID when auth is implemented
      const currentUserId = "current-user-id";
      let kudos;
      
      if (userId) {
        kudos = await storage.getKudosByUser(req.orgId, userId as string, type as 'received' | 'given' | undefined);
      } else if (isPublic === "true") {
        kudos = await storage.getPublicKudos(req.orgId, limit ? parseInt(limit as string) : undefined);
      } else {
        kudos = await storage.getRecentKudos(req.orgId, limit ? parseInt(limit as string) : undefined);
      }
      
      // Filter private kudos based on user permissions
      const filteredKudos = kudos.filter(k => canAccessKudos(k, currentUserId));
      
      res.json(filteredKudos);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch kudos" });
    }
  });

  app.get("/api/kudos/:id", async (req, res) => {
    try {
      const kudos = await storage.getKudos(req.orgId, req.params.id);
      if (!kudos) {
        return res.status(404).json({ message: "Kudos not found" });
      }
      
      // TODO: Replace with actual authenticated user ID when auth is implemented
      const currentUserId = "current-user-id";
      
      // Check if user can access this kudos (privacy enforcement)
      if (!canAccessKudos(kudos, currentUserId)) {
        return res.status(404).json({ message: "Kudos not found" }); // Don't reveal existence
      }
      
      res.json(kudos);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch kudos" });
    }
  });

  app.post("/api/kudos", async (req, res) => {
    try {
      const kudosData = insertKudosSchema.parse(req.body);
      
      // TODO: Replace with actual authenticated user ID when auth is implemented
      const currentUserId = "current-user-id";
      
      // SECURITY: Never accept fromUserId from client - set server-side
      const kudosWithSender = {
        ...kudosData,
        fromUserId: currentUserId
      };
      
      const sanitizedData = sanitizeForOrganization(kudosWithSender, req.orgId);
      const kudos = await storage.createKudos(req.orgId, sanitizedData);
      
      // Send Slack notification if public
      if (kudos.isPublic) {
        const fromUser = await storage.getUser(req.orgId, kudos.fromUserId);
        const toUser = await storage.getUser(req.orgId, kudos.toUserId);
        
        if (fromUser && toUser) {
          try {
            const slackMessageId = await announceKudos(
              kudos.message,
              fromUser.name,
              toUser.name,
              kudos.values
            );
            
            if (slackMessageId) {
              await storage.updateKudos(req.orgId, kudos.id, { slackMessageId });
            }
          } catch (slackError) {
            console.warn("Failed to send Slack notification for kudos:", slackError);
          }
        }
      }
      
      res.status(201).json(kudos);
    } catch (error) {
      console.error("Kudos creation validation error:", error);
      res.status(400).json({ 
        message: "Invalid kudos data",
        details: error instanceof Error ? error.message : "Unknown validation error"
      });
    }
  });

  app.patch("/api/kudos/:id", async (req, res) => {
    try {
      // Use separate update schema that only allows safe fields
      const updates = updateKudosSchema.parse(req.body);
      
      // TODO: Replace with actual authenticated user ID when auth is implemented
      const currentUserId = "current-user-id";
      
      // Check if kudos exists and user has permission to edit
      const existingKudos = await storage.getKudos(req.orgId, req.params.id);
      if (!existingKudos) {
        return res.status(404).json({ message: "Kudos not found" });
      }
      
      // Only the original giver can edit kudos
      if (existingKudos.fromUserId !== currentUserId) {
        return res.status(403).json({ message: "You can only edit kudos you sent" });
      }
      
      const sanitizedUpdates = sanitizeForOrganization(updates, req.orgId);
      const kudos = await storage.updateKudos(req.orgId, req.params.id, sanitizedUpdates);
      if (!kudos) {
        return res.status(404).json({ message: "Kudos not found" });
      }
      res.json(kudos);
    } catch (error) {
      console.error("Kudos update validation error:", error);
      res.status(400).json({ 
        message: "Invalid kudos data",
        details: error instanceof Error ? error.message : "Unknown validation error"
      });
    }
  });

  app.delete("/api/kudos/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteKudos(req.orgId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Kudos not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete kudos" });
    }
  });

  // User-specific kudos endpoint
  app.get("/api/users/:id/kudos", async (req, res) => {
    try {
      const { type, limit } = req.query;
      const kudos = await storage.getKudosByUser(
        req.orgId, 
        req.params.id, 
        type as 'received' | 'given' | undefined
      );
      
      const limitedKudos = limit ? kudos.slice(0, parseInt(limit as string)) : kudos;
      res.json(limitedKudos);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user kudos" });
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
  app.get("/api/analytics/team-health", async (req, res) => {
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

  const httpServer = createServer(app);
  return httpServer;
}
