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
    const result = await syncUsersFromSlack(organizationId, storage);
    console.log('Periodic user sync completed:', result);
  } catch (error) {
    console.error('Periodic user sync failed:', error);
  }
}