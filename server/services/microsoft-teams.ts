import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';

interface TeamsMessage {
  title?: string;
  text: string;
  themeColor?: string;
  sections?: TeamsSection[];
  summary?: string;
}

interface TeamsSection {
  title?: string;
  text?: string;
  facts?: { name: string; value: string }[];
  activityTitle?: string;
  activitySubtitle?: string;
  activityImage?: string;
}

interface TeamsChannel {
  id: string;
  displayName: string;
  description?: string;
  team: {
    id: string;
    displayName: string;
  };
}

export class MicrosoftTeamsService {
  private accessToken: string | null = null;
  private graphClient: Client | null = null;

  constructor(accessToken?: string) {
    if (accessToken) {
      this.setAccessToken(accessToken);
    }
  }

  /**
   * Set access token for Microsoft Graph API calls
   */
  setAccessToken(accessToken: string): void {
    this.accessToken = accessToken;
    this.graphClient = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      }
    });
  }

  /**
   * Get user's Teams channels
   */
  async getUserTeamsChannels(): Promise<TeamsChannel[]> {
    if (!this.graphClient) {
      throw new Error('Teams service not authenticated');
    }

    try {
      const teams = await this.graphClient.api('/me/joinedTeams').get();
      const channels: TeamsChannel[] = [];

      // Get channels for each team
      for (const team of teams.value) {
        const teamChannels = await this.graphClient.api(`/teams/${team.id}/channels`).get();
        
        for (const channel of teamChannels.value) {
          channels.push({
            id: channel.id,
            displayName: channel.displayName,
            description: channel.description,
            team: {
              id: team.id,
              displayName: team.displayName
            }
          });
        }
      }

      return channels;
    } catch (error) {
      console.error('Failed to get Teams channels:', error);
      throw new Error('Failed to retrieve Teams channels');
    }
  }

  /**
   * Send message to Teams channel (using Power Automate workflow webhook)
   * This is the recommended approach as traditional incoming webhooks are being deprecated
   */
  async sendMessageToWebhook(webhookUrl: string, message: TeamsMessage): Promise<boolean> {
    try {
      const payload = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "title": message.title || "Whirkplace Notification",
        "summary": message.summary || message.text,
        "text": message.text,
        "themeColor": message.themeColor || "0076D7",
        "sections": message.sections || []
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to send Teams webhook message:', error);
      return false;
    }
  }

  /**
   * Send check-in reminder to Teams
   */
  async sendCheckinReminder(webhookUrl: string, reminderData: {
    userName: string;
    teamName: string;
    dueDate: string;
  }): Promise<boolean> {
    const message: TeamsMessage = {
      title: "📋 Weekly Check-in Reminder",
      text: `Hi ${reminderData.userName}! Your weekly check-in is due.`,
      themeColor: "FFA500", // Orange
      sections: [{
        title: "Check-in Details",
        facts: [
          { name: "Team", value: reminderData.teamName },
          { name: "Due Date", value: reminderData.dueDate }
        ]
      }],
      summary: `Check-in reminder for ${reminderData.userName}`
    };

    return this.sendMessageToWebhook(webhookUrl, message);
  }

  /**
   * Announce win to Teams
   */
  async announceWin(webhookUrl: string, winData: {
    title: string;
    description: string;
    submitterName: string;
    teamName: string;
  }): Promise<boolean> {
    const message: TeamsMessage = {
      title: "🏆 Team Win!",
      text: winData.description,
      themeColor: "00FF00", // Green
      sections: [{
        title: winData.title,
        facts: [
          { name: "Submitted by", value: winData.submitterName },
          { name: "Team", value: winData.teamName }
        ]
      }],
      summary: `New win: ${winData.title}`
    };

    return this.sendMessageToWebhook(webhookUrl, message);
  }

  /**
   * Send team health update to Teams
   */
  async sendTeamHealthUpdate(webhookUrl: string, healthData: {
    teamName: string;
    averageRating: number;
    completionRate: number;
    period: string;
  }): Promise<boolean> {
    const healthEmoji = healthData.averageRating >= 4 ? "💚" : healthData.averageRating >= 3 ? "💛" : "❤️";
    const themeColor = healthData.averageRating >= 4 ? "00FF00" : healthData.averageRating >= 3 ? "FFA500" : "FF0000";

    const message: TeamsMessage = {
      title: `${healthEmoji} Team Health Update`,
      text: `Team health report for ${healthData.teamName}`,
      themeColor,
      sections: [{
        title: "Health Metrics",
        facts: [
          { name: "Average Rating", value: `${healthData.averageRating.toFixed(1)}/5` },
          { name: "Completion Rate", value: `${healthData.completionRate}%` },
          { name: "Period", value: healthData.period }
        ]
      }],
      summary: `Team health update for ${healthData.teamName}`
    };

    return this.sendMessageToWebhook(webhookUrl, message);
  }

  /**
   * Send shoutout notification to Teams
   */
  async announceShoutout(webhookUrl: string, shoutoutData: {
    fromName: string;
    toName: string;
    message: string;
    companyValues?: string[];
  }): Promise<boolean> {
    const valuesText = shoutoutData.companyValues?.length 
      ? `Company Values: ${shoutoutData.companyValues.join(', ')}` 
      : '';

    const message: TeamsMessage = {
      title: "⭐ Team Shoutout!",
      text: shoutoutData.message,
      themeColor: "9966CC", // Purple
      sections: [{
        title: `${shoutoutData.fromName} → ${shoutoutData.toName}`,
        text: valuesText
      }],
      summary: `Shoutout from ${shoutoutData.fromName} to ${shoutoutData.toName}`
    };

    return this.sendMessageToWebhook(webhookUrl, message);
  }

  /**
   * Validate Teams webhook URL
   */
  async validateWebhookUrl(webhookUrl: string): Promise<boolean> {
    try {
      const testMessage: TeamsMessage = {
        title: "Whirkplace Integration Test",
        text: "This is a test message to verify Teams integration is working correctly.",
        themeColor: "0076D7"
      };

      return await this.sendMessageToWebhook(webhookUrl, testMessage);
    } catch (error) {
      console.error('Failed to validate Teams webhook:', error);
      return false;
    }
  }

  /**
   * Check if Teams integration is configured for organization
   */
  static isConfigured(teamsWebhookUrl?: string): boolean {
    return !!(teamsWebhookUrl && teamsWebhookUrl.trim().length > 0);
  }
}

// Export class for instantiation with different access tokens
export default MicrosoftTeamsService;