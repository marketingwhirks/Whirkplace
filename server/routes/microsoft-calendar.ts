import type { Express } from "express";
import { z } from "zod";
import { microsoftCalendarService } from "../services/microsoft-calendar";
import { requireOrganization } from "../middleware/organization";
import { requireAuth } from "../middleware/auth";

export function registerMicrosoftCalendarRoutes(app: Express): void {

  // Get calendar connection status
  app.get("/api/calendar/status", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const isConnected = await microsoftCalendarService.constructor.isConnected();
      
      res.json({
        connected: isConnected,
        provider: "microsoft"
      });
    } catch (error) {
      console.error("Calendar status error:", error);
      res.status(500).json({ message: "Failed to check calendar connection status" });
    }
  });

  // Get calendar events
  app.get("/api/calendar/events", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const { startTime, endTime, limit } = req.query;
      
      const events = await microsoftCalendarService.getCalendarEvents(
        startTime as string,
        endTime as string,
        limit ? parseInt(limit as string) : undefined
      );
      
      res.json(events);
    } catch (error) {
      console.error("Get calendar events error:", error);
      
      if (error instanceof Error && error.message.includes('not connected')) {
        return res.status(401).json({ 
          message: "Calendar not connected. Please connect your Microsoft account.",
          requiresAuth: true
        });
      }
      
      res.status(500).json({ message: "Failed to retrieve calendar events" });
    }
  });

  // Create calendar event
  app.post("/api/calendar/events", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const eventSchema = z.object({
        title: z.string().min(1, "Title is required"),
        description: z.string().optional(),
        startTime: z.string().min(1, "Start time is required"),
        endTime: z.string().min(1, "End time is required"),
        timeZone: z.string().optional(),
        location: z.string().optional(),
        isOnlineMeeting: z.boolean().optional(),
        attendees: z.array(z.object({
          email: z.string().email(),
          name: z.string().optional(),
          type: z.string().optional()
        })).optional()
      });

      const eventData = eventSchema.parse(req.body);
      
      const createdEvent = await microsoftCalendarService.createCalendarEvent(eventData);
      
      res.status(201).json(createdEvent);
    } catch (error) {
      console.error("Create calendar event error:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid event data",
          errors: error.errors
        });
      }
      
      if (error instanceof Error && error.message.includes('not connected')) {
        return res.status(401).json({ 
          message: "Calendar not connected. Please connect your Microsoft account.",
          requiresAuth: true
        });
      }
      
      res.status(500).json({ message: "Failed to create calendar event" });
    }
  });

  // Update calendar event
  app.put("/api/calendar/events/:eventId", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const { eventId } = req.params;
      
      const updateSchema = z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        timeZone: z.string().optional(),
        location: z.string().optional(),
        isOnlineMeeting: z.boolean().optional(),
        attendees: z.array(z.object({
          email: z.string().email(),
          name: z.string().optional(),
          type: z.string().optional()
        })).optional()
      });

      const updateData = updateSchema.parse(req.body);
      
      const updatedEvent = await microsoftCalendarService.updateCalendarEvent(eventId, updateData);
      
      res.json(updatedEvent);
    } catch (error) {
      console.error("Update calendar event error:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid event data",
          errors: error.errors
        });
      }
      
      if (error instanceof Error && error.message.includes('not connected')) {
        return res.status(401).json({ 
          message: "Calendar not connected. Please connect your Microsoft account.",
          requiresAuth: true
        });
      }
      
      res.status(500).json({ message: "Failed to update calendar event" });
    }
  });

  // Delete calendar event
  app.delete("/api/calendar/events/:eventId", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const { eventId } = req.params;
      
      await microsoftCalendarService.deleteCalendarEvent(eventId);
      
      res.json({ message: "Event deleted successfully" });
    } catch (error) {
      console.error("Delete calendar event error:", error);
      
      if (error instanceof Error && error.message.includes('not connected')) {
        return res.status(401).json({ 
          message: "Calendar not connected. Please connect your Microsoft account.",
          requiresAuth: true
        });
      }
      
      res.status(500).json({ message: "Failed to delete calendar event" });
    }
  });

  // Get user's calendars
  app.get("/api/calendar/calendars", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const calendars = await microsoftCalendarService.getCalendars();
      res.json(calendars);
    } catch (error) {
      console.error("Get calendars error:", error);
      
      if (error instanceof Error && error.message.includes('not connected')) {
        return res.status(401).json({ 
          message: "Calendar not connected. Please connect your Microsoft account.",
          requiresAuth: true
        });
      }
      
      res.status(500).json({ message: "Failed to retrieve calendars" });
    }
  });

  // Get free/busy information for scheduling
  app.post("/api/calendar/freebusy", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const freeBusySchema = z.object({
        userEmails: z.array(z.string().email()).min(1, "At least one email is required"),
        startTime: z.string().min(1, "Start time is required"),
        endTime: z.string().min(1, "End time is required"),
        timeZone: z.string().optional()
      });

      const { userEmails, startTime, endTime, timeZone } = freeBusySchema.parse(req.body);
      
      const freeBusyInfo = await microsoftCalendarService.getFreeBusy(
        userEmails,
        startTime,
        endTime,
        timeZone
      );
      
      res.json(freeBusyInfo);
    } catch (error) {
      console.error("Get free/busy error:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data",
          errors: error.errors
        });
      }
      
      if (error instanceof Error && error.message.includes('not connected')) {
        return res.status(401).json({ 
          message: "Calendar not connected. Please connect your Microsoft account.",
          requiresAuth: true
        });
      }
      
      res.status(500).json({ message: "Failed to retrieve free/busy information" });
    }
  });

  // Find meeting times
  app.post("/api/calendar/find-meeting-times", requireOrganization(), requireAuth(), async (req, res) => {
    try {
      const findMeetingSchema = z.object({
        attendees: z.array(z.string().email()).min(1, "At least one attendee is required"),
        timeConstraint: z.object({
          startTime: z.string().min(1, "Start time is required"),
          endTime: z.string().min(1, "End time is required"),
          timeZone: z.string().optional()
        }),
        meetingDuration: z.number().min(15, "Meeting duration must be at least 15 minutes"),
        maxCandidates: z.number().min(1).max(20).optional()
      });

      const { attendees, timeConstraint, meetingDuration, maxCandidates } = findMeetingSchema.parse(req.body);
      
      const meetingTimes = await microsoftCalendarService.findMeetingTimes(
        attendees,
        timeConstraint,
        meetingDuration,
        maxCandidates
      );
      
      res.json(meetingTimes);
    } catch (error) {
      console.error("Find meeting times error:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data",
          errors: error.errors
        });
      }
      
      if (error instanceof Error && error.message.includes('not connected')) {
        return res.status(401).json({ 
          message: "Calendar not connected. Please connect your Microsoft account.",
          requiresAuth: true
        });
      }
      
      res.status(500).json({ message: "Failed to find available meeting times" });
    }
  });
}