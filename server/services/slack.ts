import { WebClient, type ChatPostMessageArguments } from "@slack/web-api";
import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";

if (!process.env.SLACK_BOT_TOKEN) {
  console.warn("SLACK_BOT_TOKEN environment variable not set. Slack integration will be disabled.");
}

if (!process.env.SLACK_CHANNEL_ID) {
  console.warn("SLACK_CHANNEL_ID environment variable not set. Public Slack notifications will be disabled for security.");
}

if (!process.env.SLACK_PRIVATE_CHANNEL_ID) {
  console.warn("SLACK_PRIVATE_CHANNEL_ID environment variable not set. Sensitive notifications will be disabled for security.");
}

const slack = process.env.SLACK_BOT_TOKEN ? new WebClient(process.env.SLACK_BOT_TOKEN) : null;

// Channel configuration
const WHIRKPLACE_CHANNEL = "whirkplace-pulse"; // Channel name for automatic user sync

// OAuth Configuration Validation
if (!process.env.SLACK_CLIENT_ID) {
  console.warn("SLACK_CLIENT_ID environment variable not set. Slack OAuth will be disabled.");
}

if (!process.env.SLACK_CLIENT_SECRET) {
  console.warn("SLACK_CLIENT_SECRET environment variable not set. Slack OAuth will be disabled.");
}

if (!process.env.SLACK_REDIRECT_URI) {
  console.warn("SLACK_REDIRECT_URI environment variable not set. Slack OAuth will be disabled.");
}

// OAuth State Store (in production, use Redis or database)
const oauthStates = new Map<string, { organizationSlug: string; expiresAt: number }>();

// Cleanup expired states every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (now > data.expiresAt) {
      oauthStates.delete(state);
    }
  }
}, 10 * 60 * 1000);

// Slack OpenID Connect Types
interface SlackOIDCTokenResponse {
  ok: boolean;
  access_token?: string;
  id_token?: string;
  scope?: string;
  token_type?: string;
  team?: {
    id: string;
    name: string;
  };
  error?: string;
}

interface SlackOIDCUserInfo {
  sub: string; // Slack user ID (e.g., "U1234567890")
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  locale?: string;
  "https://slack.com/user_id"?: string;
  "https://slack.com/team_id"?: string;
  "https://slack.com/team_name"?: string;
}

/**
 * Generate OAuth authorization URL for Slack login
 */
export function generateOAuthURL(organizationSlug: string): string {
  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = process.env.SLACK_REDIRECT_URI;
  
  if (!clientId || !redirectUri) {
    throw new Error("Slack OAuth not configured. Missing SLACK_CLIENT_ID or SLACK_REDIRECT_URI");
  }
  
  // Generate cryptographically secure state parameter
  const state = randomBytes(32).toString('hex');
  
  // Store state with organization context (expires in 10 minutes)
  oauthStates.set(state, {
    organizationSlug,
    expiresAt: Date.now() + 10 * 60 * 1000
  });
  
  // OpenID Connect scopes for user authentication
  const scopes = [
    'openid',
    'profile', 
    'email'
  ].join(',');
  
  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
    response_type: 'code'
  });
  
  return `https://slack.com/openid/connect/authorize?${params.toString()}`;  
}

/**
 * Validate OAuth state parameter and return organization slug
 */
export function validateOAuthState(state: string): string | null {
  const stateData = oauthStates.get(state);
  
  if (!stateData) {
    return null; // Invalid or expired state
  }
  
  if (Date.now() > stateData.expiresAt) {
    oauthStates.delete(state);
    return null; // Expired state
  }
  
  // Clean up used state
  oauthStates.delete(state);
  
  return stateData.organizationSlug;
}

/**
 * Exchange OAuth code for OpenID Connect tokens
 */
export async function exchangeOIDCCode(code: string): Promise<SlackOIDCTokenResponse> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = process.env.SLACK_REDIRECT_URI;
  
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Slack OAuth not configured. Missing required environment variables");
  }
  
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });
  
  try {
    const response = await fetch('https://slack.com/api/openid.connect.token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString()
    });
    
    if (!response.ok) {
      throw new Error(`OIDC token exchange failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error exchanging OIDC code:', error);
    throw error;
  }
}

/**
 * Validate and decode Slack OpenID Connect ID token
 */
export async function validateOIDCToken(idToken: string): Promise<{ ok: boolean; user?: SlackOIDCUserInfo; error?: string }> {
  try {
    // Decode the JWT token without verification first to get the header
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || typeof decoded === 'string') {
      throw new Error('Invalid JWT token format');
    }

    // For Slack OIDC, we can verify the token signature using Slack's public keys
    // For now, we'll do basic validation and trust the token since it came through OAuth flow
    // In production, you should fetch and verify against Slack's JWKS endpoint
    const payload = jwt.decode(idToken) as SlackOIDCUserInfo;
    
    if (!payload || !payload.sub) {
      throw new Error('Invalid token payload');
    }
    
    // Basic validation - check if token is not expired
    const now = Math.floor(Date.now() / 1000);
    const tokenData = payload as any;
    
    if (tokenData.exp && tokenData.exp < now) {
      throw new Error('Token has expired');
    }
    
    if (tokenData.iat && tokenData.iat > now + 300) { // Allow 5 minute clock skew
      throw new Error('Token issued in the future');
    }
    
    return {
      ok: true,
      user: payload
    };
  } catch (error) {
    console.error('Error validating OIDC token:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Sends a structured message to a Slack channel using the Slack Web API
 */
export async function sendSlackMessage(
  message: ChatPostMessageArguments
): Promise<string | undefined> {
  if (!slack) {
    console.warn("Slack not configured. Message not sent:", JSON.stringify(message));
    return undefined;
  }

  try {
    const response = await slack.chat.postMessage(message);
    return response.ts;
  } catch (error) {
    console.error('Error sending Slack message:', error);
    throw error;
  }
}

/**
 * Send a check-in reminder to Slack with link to check-in and weekly questions
 */
export async function sendCheckinReminder(userNames: string[], questions: Array<{id: string, text: string}> = []) {
  if (!slack) return;

  const channel = process.env.SLACK_CHANNEL_ID;
  if (!channel) {
    console.warn("SLACK_CHANNEL_ID not configured. Check-in reminder not sent for security.");
    return;
  }
  
  const userList = userNames.join(", ");
  
  // Get the app URL for the check-in link
  const appUrl = process.env.REPL_URL || process.env.REPLIT_URL || 'https://your-app.replit.app';
  const checkinUrl = `${appUrl}/#/checkins`;

  // Create question preview blocks
  const questionBlocks = questions.slice(0, 3).map((question, index) => ({
    type: 'section' as const,
    text: {
      type: 'mrkdwn' as const,
      text: `*${index + 1}.* ${question.text}`
    }
  }));

  const blocks = [
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: '*Weekly Check-in Reminder* 📝'
      }
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `Hey ${userList}! Time for your weekly check-in. Your feedback helps us build a better team culture! 🚀`
      }
    },
    ...(questions.length > 0 ? [
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: '*This week\'s questions:*'
        }
      },
      ...questionBlocks,
      ...(questions.length > 3 ? [{
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `_...and ${questions.length - 3} more questions_`
        }
      }] : [])
    ] : []),
    {
      type: 'actions' as const,
      elements: [
        {
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: 'Complete Check-in 📝'
          },
          url: checkinUrl,
          style: 'primary' as const
        }
      ]
    }
  ];

  await sendSlackMessage({
    channel,
    blocks
  });
}

/**
 * Announce a win to Slack
 */
export async function announceWin(winTitle: string, winDescription: string, userName: string, nominatedBy?: string) {
  if (!slack) return;

  const channel = process.env.SLACK_CHANNEL_ID;
  if (!channel) {
    console.warn("SLACK_CHANNEL_ID not configured. Win announcement not sent for security.");
    return;
  }
  
  const announcement = nominatedBy 
    ? `🎉 ${nominatedBy} wants to celebrate ${userName}!` 
    : `🎉 Let's celebrate ${userName}!`;

  const messageId = await sendSlackMessage({
    channel,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${announcement}*`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${winTitle}*\n${winDescription}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Great work! 🚀✨'
        }
      }
    ]
  });

  return messageId;
}

/**
 * Announce shoutout to Slack with rich formatting and company values
 */
export async function announceShoutout(
  message: string, 
  fromUserName: string, 
  toUserName: string, 
  companyValues: string[] = []
) {
  if (!slack) return;

  const channel = process.env.SLACK_CHANNEL_ID;
  if (!channel) {
    console.warn("SLACK_CHANNEL_ID not configured. Shoutout announcement not sent for security.");
    return;
  }
  
  // Create company values badges with emojis
  const valueEmojis: Record<string, string> = {
    'own it': '🎯',
    'challenge it': '🚀', 
    'team first': '🤝',
    'empathy for others': '❤️',
    'passion for our purpose': '🔥',
  };

  const valuesBadges = companyValues.map(value => {
    const emoji = valueEmojis[value.toLowerCase()] || '⭐';
    const formattedValue = value.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    return `${emoji} *${formattedValue}*`;
  }).join('  ');

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🙌 *${fromUserName}* gave a shoutout to *${toUserName}*!`
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `_"${message}"_`
      }
    }
  ];

  // Add company values section if values are specified
  if (companyValues.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Company Values Demonstrated:*\n${valuesBadges}`
      }
    });
  }

  // Add celebration footer
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: 'Keep up the amazing work! 🎉✨'
    }
  });

  const messageId = await sendSlackMessage({
    channel,
    blocks
  });

  return messageId;
}

/**
 * Send team health update to Slack
 */
export async function sendTeamHealthUpdate(averageRating: number, completionRate: number, totalWins: number) {
  if (!slack) return;

  const channel = process.env.SLACK_CHANNEL_ID;
  if (!channel) {
    console.warn("SLACK_CHANNEL_ID not configured. Team health update not sent for security.");
    return;
  }
  
  const healthEmoji = averageRating >= 4 ? '🌟' : averageRating >= 3 ? '😊' : '😐';

  await sendSlackMessage({
    channel,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Weekly Team Health Update* ${healthEmoji}`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Average Team Health:*\n${averageRating.toFixed(1)}/5.0`
          },
          {
            type: 'mrkdwn',
            text: `*Check-in Completion:*\n${completionRate}%`
          },
          {
            type: 'mrkdwn',
            text: `*Wins This Week:*\n${totalWins} celebrations`
          }
        ]
      }
    ]
  });
}

/**
 * Notify team leaders when a check-in is submitted for review
 */
export async function notifyCheckinSubmitted(
  userName: string, 
  teamLeaderName: string, 
  overallMood: number, 
  submissionSummary?: string
) {
  if (!slack) return;

  // Use private channel for sensitive check-in notifications
  const channel = process.env.SLACK_PRIVATE_CHANNEL_ID;
  if (!channel) {
    console.warn("SLACK_PRIVATE_CHANNEL_ID not configured. Sensitive check-in notification not sent for security.");
    return;
  }
  
  const moodEmoji = overallMood >= 4 ? '😊' : overallMood >= 3 ? '😐' : overallMood >= 2 ? '😕' : '😟';
  const appUrl = process.env.REPL_URL || process.env.REPLIT_URL || 'https://your-app.replit.app';
  const reviewUrl = `${appUrl}/#/reviews`;

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `📝 *New Check-in Submitted for Review*`
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${userName}* has submitted their weekly check-in and needs your review, ${teamLeaderName}!`
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Overall Mood:*\n${moodEmoji} ${overallMood}/5`
        },
        {
          type: 'mrkdwn',
          text: `*Status:*\nPending Review`
        }
      ]
    }
  ];

  if (submissionSummary) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Quick Preview:*\n_"${submissionSummary.substring(0, 150)}${submissionSummary.length > 150 ? '...' : ''}"_`
      }
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Review Check-in 👁️'
        },
        url: reviewUrl,
        style: 'primary'
      }
    ]
  });

  const messageId = await sendSlackMessage({
    channel,
    blocks
  });

  return messageId;
}

/**
 * Notify user when their check-in has been reviewed (approved or rejected)
 */
export async function notifyCheckinReviewed(
  userName: string, 
  reviewerName: string, 
  reviewStatus: 'approved' | 'rejected', 
  reviewComments?: string
) {
  if (!slack) return;

  // Use private channel for sensitive check-in review notifications
  const channel = process.env.SLACK_PRIVATE_CHANNEL_ID;
  if (!channel) {
    console.warn("SLACK_PRIVATE_CHANNEL_ID not configured. Sensitive review notification not sent for security.");
    return;
  }
  
  const statusEmoji = reviewStatus === 'approved' ? '✅' : '❌';
  const statusColor = reviewStatus === 'approved' ? 'good' : 'danger';
  const appUrl = process.env.REPL_URL || process.env.REPLIT_URL || 'https://your-app.replit.app';
  const checkinUrl = `${appUrl}/#/checkins`;

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${statusEmoji} *Check-in ${reviewStatus === 'approved' ? 'Approved' : 'Rejected'}*`
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Hi ${userName}! ${reviewerName} has ${reviewStatus} your weekly check-in.`
      }
    }
  ];

  if (reviewComments) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Review Comments:*\n_"${reviewComments}"_`
      }
    });
  }

  if (reviewStatus === 'rejected') {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Please review the feedback${reviewComments ? ' above' : ''} and update your check-in if needed.`
      }
    });
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Update Check-in 📝'
          },
          url: checkinUrl,
          style: 'primary'
        }
      ]
    });
  } else {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Thanks for sharing your weekly update! Keep up the great work! 🚀`
      }
    });
  }

  const messageId = await sendSlackMessage({
    channel,
    blocks
  });

  return messageId;
}

// User Sync Functions for Channel-based Membership

/**
 * Fetch all members of the whirkplace-pulse channel
 */
/**
 * Find a channel by name with pagination and case-insensitive matching
 */
async function findChannelIdByName(channelName: string): Promise<string | null> {
  if (!slack) return null;
  
  // Add diagnostic info about what the bot can see
  try {
    const authTest = await slack.auth.test();
    console.log(`Bot workspace: ${authTest.team} (${authTest.team_id}), Bot user: ${authTest.user_id}`);
  } catch (error) {
    console.error("Failed to get bot auth info:", error);
  }
  
  let cursor: string | undefined;
  let totalChannels = 0;
  
  do {
    try {
      const result = await slack.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 1000,
        cursor
      });
      
      if (!result.ok) {
        console.error(`Slack API error: ${result.error}`);
        return null;
      }
      
      const channelCount = result.channels?.length || 0;
      totalChannels += channelCount;
      console.log(`Found ${channelCount} channels in this page (${totalChannels} total so far)`);
      
      // Log a few sample channel names for debugging
      if (result.channels?.length) {
        const sampleNames = result.channels.slice(0, 3).map(c => c.name).join(", ");
        console.log(`Sample channel names: ${sampleNames}`);
      }
      
      // Search for channel by name (case-insensitive)
      const channel = result.channels?.find(c => 
        c.name?.toLowerCase() === channelName.toLowerCase() || 
        (c as any).name_normalized?.toLowerCase() === channelName.toLowerCase()
      );
      
      if (channel?.id) {
        console.log(`Found channel "${channelName}" with ID: ${channel.id}`);
        return channel.id;
      }
      
      cursor = result.response_metadata?.next_cursor;
    } catch (error) {
      console.error(`Error searching for channel "${channelName}":`, error);
      return null;
    }
  } while (cursor);
  
  return null;
}

export async function getChannelMembers(): Promise<{ id: string; name: string; email?: string; active: boolean }[]> {
  if (!slack) {
    console.warn("Slack client not initialized. Cannot fetch channel members.");
    return [];
  }

  try {
    // Use environment override if set, otherwise search by name
    let channelId = process.env.SLACK_USER_SYNC_CHANNEL_ID;
    if (!channelId) {
      channelId = await findChannelIdByName(WHIRKPLACE_CHANNEL);
    }
    
    if (!channelId) {
      console.warn(`Channel "${WHIRKPLACE_CHANNEL}" not found. Cannot sync users.`);
      console.warn(`Tip: Set SLACK_USER_SYNC_CHANNEL_ID environment variable to the channel ID if the channel exists.`);
      return [];
    }

    // Fetch channel members
    let membersResult;
    try {
      membersResult = await slack.conversations.members({
        channel: channelId
      });
    } catch (error: any) {
      // Handle missing scope error gracefully
      if (error?.data?.error === 'missing_scope') {
        console.error(`Missing Slack scope for channel "${WHIRKPLACE_CHANNEL}". Try these scopes: groups:read, channels:read`);
        console.error(`Please update your Slack app permissions to include these scopes.`);
        console.error(`Current scopes: ${error?.data?.needed || 'unknown'}`);
        console.error(`Visit your Slack app settings at https://api.slack.com/apps to update OAuth scopes.`);
        return [];
      }
      throw error; // Re-throw other errors
    }

    if (!membersResult.members) {
      console.warn(`No members found in channel "${WHIRKPLACE_CHANNEL}"`);
      return [];
    }

    // Get detailed user info for each member
    const userPromises = membersResult.members.map(async (memberId) => {
      try {
        const userInfo = await slack.users.info({ user: memberId });
        if (userInfo.user) {
          return {
            id: userInfo.user.id!,
            name: userInfo.user.real_name || userInfo.user.name || 'Unknown User',
            email: userInfo.user.profile?.email,
            active: !userInfo.user.deleted && !userInfo.user.is_bot
          };
        }
        return null;
      } catch (error) {
        console.warn(`Failed to fetch user info for ${memberId}:`, error);
        return null;
      }
    });

    const users = await Promise.all(userPromises);
    return users.filter((user): user is NonNullable<typeof user> => user !== null);
  } catch (error: any) {
    // Provide helpful error messages for common scope issues
    if (error?.data?.error === 'missing_scope') {
      console.error("Slack API missing_scope error. Please ensure your Slack app has the following scopes:");
      console.error("Bot Token Scopes:");
      console.error("- channels:read (for accessing public channels)");
      console.error("- groups:read (for accessing private channels)");  
      console.error("- users:read (for fetching user information)");
      console.error("- chat:write (for sending messages)");
      console.error("Visit https://api.slack.com/apps/{your-app-id}/oauth to update scopes.");
    } else {
      console.error("Failed to fetch channel members:", error);
    }
    return [];
  }
}

/**
 * Sync users based on Slack channel membership
 * This function should be called periodically or on channel events
 */
export async function syncUsersFromSlack(organizationId: string, storage: any): Promise<{
  created: number;
  activated: number;
  deactivated: number;
}> {
  console.log(`Starting user sync for organization ${organizationId}...`);
  
  const channelMembers = await getChannelMembers();
  if (channelMembers.length === 0) {
    console.warn("No channel members found. Skipping user sync.");
    return { created: 0, activated: 0, deactivated: 0 };
  }

  const existingUsers = await storage.getAllUsers(organizationId);
  const stats = { created: 0, activated: 0, deactivated: 0 };

  // Create map of existing users by Slack ID and email
  const existingUsersBySlackId = new Map();
  const existingUsersByEmail = new Map();
  
  existingUsers.forEach((user: any) => {
    if (user.slackUserId) {
      existingUsersBySlackId.set(user.slackUserId, user);
    }
    if (user.email) {
      existingUsersByEmail.set(user.email, user);
    }
  });

  // Process channel members
  for (const member of channelMembers) {
    if (!member.active) continue; // Skip inactive/deleted Slack users

    let existingUser = existingUsersBySlackId.get(member.id);
    
    // If not found by Slack ID, try by email
    if (!existingUser && member.email) {
      existingUser = existingUsersByEmail.get(member.email);
    }

    if (existingUser) {
      // User exists - update if needed
      const updates: any = {};
      
      // Update Slack user ID if missing
      if (!existingUser.slackUserId) {
        updates.slackUserId = member.id;
      }
      
      // Reactivate if they were inactive
      if (!existingUser.isActive) {
        updates.isActive = true;
        stats.activated++;
        console.log(`Reactivated user: ${existingUser.name} (${member.id})`);
      }

      // Update name if different
      if (existingUser.name !== member.name) {
        updates.name = member.name;
      }

      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        await storage.updateUser(organizationId, existingUser.id, updates);
      }
    } else {
      // New user - create them
      try {
        const newUser = await storage.createUser(organizationId, {
          username: member.email?.split('@')[0] || member.name?.toLowerCase().replace(/\s+/g, '.') || member.id,
          password: randomBytes(32).toString('hex'), // Generate secure random password for Slack users
          name: member.name,
          email: member.email || `${member.id}@slack.local`, // Fallback email
          role: 'member',
          isActive: true,
          slackUserId: member.id
        });
        
        stats.created++;
        console.log(`Created new user: ${member.name} (${member.id})`);
      } catch (error) {
        console.error(`Failed to create user ${member.name}:`, error);
      }
    }
  }

  // Deactivate users who are no longer in the channel (but keep historical data)
  const activeChannelSlackIds = new Set(channelMembers.filter(m => m.active).map(m => m.id));
  
  for (const user of existingUsers) {
    if (user.slackUserId && user.isActive && !activeChannelSlackIds.has(user.slackUserId)) {
      await storage.updateUser(organizationId, user.id, { isActive: false });
      stats.deactivated++;
      console.log(`Deactivated user: ${user.name} (${user.slackUserId})`);
    }
  }

  console.log(`User sync completed for organization ${organizationId}:`, stats);
  return stats;
}

/**
 * Handle Slack events for real-time user sync
 */
export async function handleChannelMembershipEvent(
  event: { type: string; user: string; channel: string },
  organizationId: string,
  storage: any
): Promise<void> {
  // Only process events for the whirkplace-pulse channel
  // Note: In practice, you'd need to resolve channel ID to name first
  
  if (event.type === 'member_joined_channel') {
    console.log(`User ${event.user} joined channel. Triggering user sync...`);
    await syncUsersFromSlack(organizationId, storage);
  } else if (event.type === 'member_left_channel') {
    console.log(`User ${event.user} left channel. Triggering user sync...`);
    await syncUsersFromSlack(organizationId, storage);
  }
}
