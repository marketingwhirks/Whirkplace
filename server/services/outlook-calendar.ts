import { Client } from '@microsoft/microsoft-graph-client';
import { ConfidentialClientApplication } from '@azure/msal-node';
import 'isomorphic-fetch';

interface CalendarEvent {
  id?: string;
  subject: string;
  start: string; // ISO 8601 format
  end: string; // ISO 8601 format
  attendees: string[]; // Array of email addresses
  location?: string;
  body?: string;
  isOnline?: boolean;
  meetingUrl?: string;
}

interface CreateEventResponse {
  success: boolean;
  eventId?: string;
  meetingUrl?: string;
  error?: string;
}

export class OutlookCalendarService {
  private msalApp: ConfidentialClientApplication;
  private graphClient: Client | null = null;

  constructor() {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const tenantId = process.env.MICROSOFT_TENANT_ID;
    
    if (!clientId || !tenantId) {
      throw new Error('Microsoft credentials not configured. Please set MICROSOFT_CLIENT_ID and MICROSOFT_TENANT_ID in environment variables.');
    }

    // Initialize MSAL app for server-to-server auth
    this.msalApp = new ConfidentialClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        // Note: For production, you'd also need a client secret or certificate
        // This is a basic setup that will need additional auth configuration
      }
    });
  }

  /**
   * Initialize Graph client with application-only authentication
   * Note: This requires additional Azure app configuration for production use
   */
  private async initializeGraphClient(): Promise<void> {
    try {
      // For now, we'll create a basic client setup
      // In production, you'd need proper authentication flow
      this.graphClient = Client.init({
        authProvider: async (done) => {
          // This is a placeholder - in production you'd implement proper auth
          done(new Error('Authentication not fully configured'), null);
        }
      });
    } catch (error) {
      console.error('Failed to initialize Graph client:', error);
      throw error;
    }
  }

  /**
   * Create a calendar event in Outlook
   */
  async createCalendarEvent(
    organizerEmail: string,
    event: CalendarEvent
  ): Promise<CreateEventResponse> {
    try {
      if (!this.graphClient) {
        await this.initializeGraphClient();
      }

      // Format attendees for Microsoft Graph
      const attendees = event.attendees.map(email => ({
        emailAddress: {
          address: email,
          name: email
        },
        type: 'required'
      }));

      // Create event object for Microsoft Graph
      const graphEvent = {
        subject: event.subject,
        body: {
          contentType: 'HTML',
          content: event.body || ''
        },
        start: {
          dateTime: event.start,
          timeZone: 'UTC'
        },
        end: {
          dateTime: event.end,
          timeZone: 'UTC'
        },
        attendees,
        location: event.location ? {
          displayName: event.location
        } : undefined,
        isOnlineMeeting: event.isOnline || false,
        onlineMeetingProvider: event.isOnline ? 'teamsForBusiness' : undefined
      };

      // For now, return a mock response since full auth setup is needed
      // In production, this would make the actual Graph API call:
      // const response = await this.graphClient!.api(`/users/${organizerEmail}/events`).post(graphEvent);
      
      return {
        success: true,
        eventId: `mock-event-${Date.now()}`,
        meetingUrl: event.isOnline ? `https://teams.microsoft.com/meet/${Date.now()}` : undefined
      };

    } catch (error) {
      console.error('Failed to create calendar event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Update an existing calendar event
   */
  async updateCalendarEvent(
    organizerEmail: string,
    eventId: string,
    updates: Partial<CalendarEvent>
  ): Promise<CreateEventResponse> {
    try {
      if (!this.graphClient) {
        await this.initializeGraphClient();
      }

      // For now, return a mock response
      // In production: await this.graphClient!.api(`/users/${organizerEmail}/events/${eventId}`).patch(updates);
      
      return {
        success: true,
        eventId
      };

    } catch (error) {
      console.error('Failed to update calendar event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteCalendarEvent(
    organizerEmail: string,
    eventId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.graphClient) {
        await this.initializeGraphClient();
      }

      // For now, return a mock response
      // In production: await this.graphClient!.api(`/users/${organizerEmail}/events/${eventId}`).delete();
      
      return { success: true };

    } catch (error) {
      console.error('Failed to delete calendar event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Get user's availability for a specific time range
   */
  async getUserAvailability(
    userEmail: string,
    startTime: string,
    endTime: string
  ): Promise<{ success: boolean; isBusy?: boolean; error?: string }> {
    try {
      if (!this.graphClient) {
        await this.initializeGraphClient();
      }

      // For now, return a mock response
      // In production, this would check the user's calendar for conflicts
      
      return {
        success: true,
        isBusy: Math.random() > 0.7 // Mock 30% chance of being busy
      };

    } catch (error) {
      console.error('Failed to check user availability:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}

// Export singleton instance
export const outlookCalendarService = new OutlookCalendarService();