import { syncUsersFromSlack, getChannelMembers, handleChannelMembershipEvent } from './slack';

/**
 * User Sync Functions for Channel-based Membership
 * 
 * This module provides automatic user synchronization based on Slack channel membership.
 * When users join/leave the "whirkplace-pulse" channel, their Whirkplace access is updated.
 */

// Export the sync functions for use in routes and scheduled tasks
export { syncUsersFromSlack, getChannelMembers, handleChannelMembershipEvent };

/**
 * Periodic user sync - call this from a scheduled job
 */
export async function performPeriodicUserSync(organizationId: string, storage: any): Promise<void> {
  try {
    console.log(`Starting periodic user sync for organization: ${organizationId}`);
    
    // Fetch organization to get its channel ID and bot token
    const organization = await storage.getOrganization(organizationId);
    if (!organization) {
      console.error(`Organization not found: ${organizationId}`);
      return;
    }
    
    // Use organization's bot token and channel ID if available
    const botToken = organization.slackBotToken || undefined;
    const channelIdentifier = organization.slackChannelId || undefined;
    
    console.log(`Using ${channelIdentifier ? 'channel ID: ' + channelIdentifier : 'default channel'} for periodic sync`);
    
    const result = await syncUsersFromSlack(organizationId, storage, botToken, channelIdentifier);
    console.log('Periodic user sync completed:', result);
  } catch (error) {
    console.error('Periodic user sync failed:', error);
  }
}