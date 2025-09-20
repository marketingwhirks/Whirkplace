import { getUncachableOutlookClient } from '../integrations/outlook';
import type { CalendarEvent, CalendarCreateEvent } from '@shared/schema';

interface MicrosoftCalendarEvent {
  id: string;
  subject: string;
  body: {
    contentType: string;
    content: string;
  };
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName: string;
  };
  attendees?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
    type: string;
  }>;
  isOnlineMeeting?: boolean;
  onlineMeetingUrl?: string;
  organizer?: {
    emailAddress: {
      address: string;
      name?: string;
    };
  };
}

interface CreateEventRequest {
  subject: string;
  body?: {
    contentType: 'text' | 'html';
    content: string;
  };
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName: string;
  };
  attendees?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
    type: 'required' | 'optional' | 'resource';
  }>;
  isOnlineMeeting?: boolean;
}

export class MicrosoftCalendarService {
  
  /**
   * Get user's calendar events
   */
  async getCalendarEvents(
    startTime?: string, 
    endTime?: string, 
    top?: number
  ): Promise<CalendarEvent[]> {
    try {
      const client = await getUncachableOutlookClient();
      
      let requestUrl = '/me/events';
      const params: string[] = [];
      
      if (startTime && endTime) {
        params.push(`$filter=start/dateTime ge '${startTime}' and end/dateTime le '${endTime}'`);
      }
      
      if (top) {
        params.push(`$top=${top}`);
      }
      
      params.push('$orderby=start/dateTime');
      
      if (params.length > 0) {
        requestUrl += '?' + params.join('&');
      }
      
      const response = await client.api(requestUrl).get();
      
      return response.value.map((event: MicrosoftCalendarEvent) => ({
        id: event.id,
        title: event.subject,
        description: event.body?.content || '',
        startTime: event.start.dateTime,
        endTime: event.end.dateTime,
        timeZone: event.start.timeZone,
        location: event.location?.displayName,
        isOnlineMeeting: event.isOnlineMeeting || false,
        meetingUrl: event.onlineMeetingUrl,
        attendees: event.attendees?.map(attendee => ({
          email: attendee.emailAddress.address,
          name: attendee.emailAddress.name,
          type: attendee.type
        })) || [],
        organizer: event.organizer ? {
          email: event.organizer.emailAddress.address,
          name: event.organizer.emailAddress.name
        } : undefined
      }));
    } catch (error) {
      console.error('Failed to get calendar events:', error);
      throw new Error('Failed to retrieve calendar events');
    }
  }

  /**
   * Create a new calendar event
   */
  async createCalendarEvent(eventData: CalendarCreateEvent): Promise<CalendarEvent> {
    try {
      const client = await getUncachableOutlookClient();
      
      const createRequest: CreateEventRequest = {
        subject: eventData.title,
        body: eventData.description ? {
          contentType: 'html',
          content: eventData.description
        } : undefined,
        start: {
          dateTime: eventData.startTime,
          timeZone: eventData.timeZone || 'UTC'
        },
        end: {
          dateTime: eventData.endTime,
          timeZone: eventData.timeZone || 'UTC'
        },
        location: eventData.location ? {
          displayName: eventData.location
        } : undefined,
        attendees: eventData.attendees?.map(attendee => ({
          emailAddress: {
            address: attendee.email,
            name: attendee.name
          },
          type: (attendee.type as 'required' | 'optional' | 'resource') || 'required'
        })),
        isOnlineMeeting: eventData.isOnlineMeeting || false
      };

      const response = await client.api('/me/events').post(createRequest);
      
      return {
        id: response.id,
        title: response.subject,
        description: response.body?.content || '',
        startTime: response.start.dateTime,
        endTime: response.end.dateTime,
        timeZone: response.start.timeZone,
        location: response.location?.displayName,
        isOnlineMeeting: response.isOnlineMeeting || false,
        meetingUrl: response.onlineMeetingUrl,
        attendees: response.attendees?.map((attendee: {
          emailAddress: { address: string; name?: string };
          type: string;
        }) => ({
          email: attendee.emailAddress.address,
          name: attendee.emailAddress.name,
          type: attendee.type
        })) || [],
        organizer: response.organizer ? {
          email: response.organizer.emailAddress.address,
          name: response.organizer.emailAddress.name
        } : undefined
      };
    } catch (error) {
      console.error('Failed to create calendar event:', error);
      throw new Error('Failed to create calendar event');
    }
  }

  /**
   * Update an existing calendar event
   */
  async updateCalendarEvent(eventId: string, eventData: Partial<CalendarCreateEvent>): Promise<CalendarEvent> {
    try {
      const client = await getUncachableOutlookClient();
      
      const updateRequest: Partial<CreateEventRequest> = {};
      
      if (eventData.title) updateRequest.subject = eventData.title;
      if (eventData.description) {
        updateRequest.body = {
          contentType: 'html',
          content: eventData.description
        };
      }
      if (eventData.startTime) {
        updateRequest.start = {
          dateTime: eventData.startTime,
          timeZone: eventData.timeZone || 'UTC'
        };
      }
      if (eventData.endTime) {
        updateRequest.end = {
          dateTime: eventData.endTime,
          timeZone: eventData.timeZone || 'UTC'
        };
      }
      if (eventData.location) {
        updateRequest.location = {
          displayName: eventData.location
        };
      }
      if (eventData.attendees) {
        updateRequest.attendees = eventData.attendees.map(attendee => ({
          emailAddress: {
            address: attendee.email,
            name: attendee.name
          },
          type: (attendee.type as 'required' | 'optional' | 'resource') || 'required'
        }));
      }
      if (eventData.isOnlineMeeting !== undefined) {
        updateRequest.isOnlineMeeting = eventData.isOnlineMeeting;
      }

      const response = await client.api(`/me/events/${eventId}`).patch(updateRequest);
      
      return {
        id: response.id,
        title: response.subject,
        description: response.body?.content || '',
        startTime: response.start.dateTime,
        endTime: response.end.dateTime,
        timeZone: response.start.timeZone,
        location: response.location?.displayName,
        isOnlineMeeting: response.isOnlineMeeting || false,
        meetingUrl: response.onlineMeetingUrl,
        attendees: response.attendees?.map((attendee: {
          emailAddress: { address: string; name?: string };
          type: string;
        }) => ({
          email: attendee.emailAddress.address,
          name: attendee.emailAddress.name,
          type: attendee.type
        })) || [],
        organizer: response.organizer ? {
          email: response.organizer.emailAddress.address,
          name: response.organizer.emailAddress.name
        } : undefined
      };
    } catch (error) {
      console.error('Failed to update calendar event:', error);
      throw new Error('Failed to update calendar event');
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteCalendarEvent(eventId: string): Promise<void> {
    try {
      const client = await getUncachableOutlookClient();
      await client.api(`/me/events/${eventId}`).delete();
    } catch (error) {
      console.error('Failed to delete calendar event:', error);
      throw new Error('Failed to delete calendar event');
    }
  }

  /**
   * Get user's calendars
   */
  async getCalendars(): Promise<Array<{ id: string; name: string; isDefault: boolean }>> {
    try {
      const client = await getUncachableOutlookClient();
      const response = await client.api('/me/calendars').get();
      
      return response.value.map((calendar: any) => ({
        id: calendar.id,
        name: calendar.name,
        isDefault: calendar.isDefaultCalendar || false
      }));
    } catch (error) {
      console.error('Failed to get calendars:', error);
      throw new Error('Failed to retrieve calendars');
    }
  }

  /**
   * Get user's free/busy information for scheduling
   */
  async getFreeBusy(
    userEmails: string[],
    startTime: string,
    endTime: string,
    timeZone: string = 'UTC'
  ): Promise<any> {
    try {
      const client = await getUncachableOutlookClient();
      
      const requestBody = {
        schedules: userEmails,
        startTime: {
          dateTime: startTime,
          timeZone: timeZone
        },
        endTime: {
          dateTime: endTime,
          timeZone: timeZone
        },
        availabilityViewInterval: 60 // 60 minutes interval
      };

      const response = await client.api('/me/calendar/getSchedule').post(requestBody);
      return response.value;
    } catch (error) {
      console.error('Failed to get free/busy information:', error);
      throw new Error('Failed to retrieve free/busy information');
    }
  }

  /**
   * Find meeting times that work for all attendees
   */
  async findMeetingTimes(
    attendees: string[],
    timeConstraint: {
      startTime: string;
      endTime: string;
      timeZone?: string;
    },
    meetingDuration: number, // in minutes
    maxCandidates: number = 10
  ): Promise<any> {
    try {
      const client = await getUncachableOutlookClient();
      
      const requestBody = {
        attendees: attendees.map(email => ({
          emailAddress: {
            address: email
          }
        })),
        timeConstraint: {
          timeslots: [{
            start: {
              dateTime: timeConstraint.startTime,
              timeZone: timeConstraint.timeZone || 'UTC'
            },
            end: {
              dateTime: timeConstraint.endTime,
              timeZone: timeConstraint.timeZone || 'UTC'
            }
          }]
        },
        meetingDuration: `PT${meetingDuration}M`, // ISO 8601 duration format
        maxCandidates: maxCandidates
      };

      const response = await client.api('/me/calendar/findMeetingTimes').post(requestBody);
      return response;
    } catch (error) {
      console.error('Failed to find meeting times:', error);
      throw new Error('Failed to find available meeting times');
    }
  }

  /**
   * Check if calendar integration is available (user is connected)
   */
  static async isConnected(): Promise<boolean> {
    try {
      await getUncachableOutlookClient();
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const microsoftCalendarService = new MicrosoftCalendarService();