import { WebClient, type ChatPostMessageArguments } from "@slack/web-api";
import { randomBytes } from "crypto";
import { jwtVerify, createRemoteJWKSet } from 'jose';
import * as cron from "node-cron";
import type { Request } from 'express';
import { resolveRedirectUri } from '../utils/redirect-uri';
import bcrypt from "bcryptjs";

if (!process.env.SLACK_BOT_TOKEN) {
  console.warn("SLACK_BOT_TOKEN environment variable not set. Slack integration will be disabled.");
}

if (!process.env.SLACK_CHANNEL_ID) {
  console.warn("SLACK_CHANNEL_ID environment variable not set. Public Slack notifications will be disabled for security.");
}

// Direct messaging is used instead of private channels for personalized notifications

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

// OAuth state is now stored in user sessions for better reliability
// No need for in-memory storage or cleanup intervals

/**
 * Generate a secure temporary password
 * Returns a 10 character password with letters, numbers, and symbols
 */
function generateTemporaryPassword(): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';
  const allChars = lowercase + uppercase + numbers + symbols;
  
  let password = '';
  
  // Ensure at least one character from each set
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Fill the rest randomly from all characters
  for (let i = 4; i < 10; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password to randomize character positions
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

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
  team?: {
    id: string;
    name: string;
  };
  user?: {
    id: string;
    name: string;
    email: string;
    image: string;
  };
  enterprise?: {
    id: string;
    name: string;
  };
}

/**
 * Generate OAuth authorization URL for Slack login
 */
export function generateOAuthURL(organizationSlug: string, session: any, req?: Request): string {
  const clientId = process.env.SLACK_CLIENT_ID;
  
  // Debug logging
  console.log('🔧 Slack OAuth generation debug:');
  console.log('  NODE_ENV:', process.env.NODE_ENV);
  console.log('  OAUTH_REDIRECT_BASE_URL:', process.env.OAUTH_REDIRECT_BASE_URL);
  console.log('  FORCE_PRODUCTION_OAUTH:', process.env.FORCE_PRODUCTION_OAUTH);
  console.log('  Request provided:', !!req);
  if (req) {
    console.log('  Request host:', req.get('host'));
    console.log('  X-Forwarded-Host:', req.get('X-Forwarded-Host'));
    console.log('  X-Forwarded-Proto:', req.get('X-Forwarded-Proto'));
  }
  
  // Use the unified redirect URI resolver function
  let redirectUri: string;
  
  if (req) {
    // Use the centralized resolver which handles production properly
    redirectUri = resolveRedirectUri(req, '/auth/slack/callback');
  } else {
    // Fallback for when req is not available - prefer production URL
    console.warn('⚠️  generateOAuthURL called without request object, using fallback logic');
    
    // Check if we're likely in production based on various indicators
    const likelyProduction = process.env.NODE_ENV === 'production' ||
                           process.env.FORCE_PRODUCTION === 'true' ||
                           process.env.FORCE_PRODUCTION_OAUTH === 'true' ||
                           process.env.REPL_SLUG?.includes('whirkplace') ||
                           (process.env.REPLIT_URL && process.env.REPLIT_URL.includes('whirkplace.com')) ||
                           (process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.includes('whirkplace.com'));
    
    if (likelyProduction) {
      // Production always uses whirkplace.com with HTTPS
      redirectUri = 'https://whirkplace.com/auth/slack/callback';
    } else {
      // Development uses override if available, otherwise localhost
      redirectUri = process.env.SLACK_REDIRECT_URI_OVERRIDE || 'http://localhost:5000/auth/slack/callback';
    }
  }
  
  if (!clientId || !redirectUri) {
    throw new Error("Slack OAuth not configured. Missing SLACK_CLIENT_ID or redirect URI");
  }
  
  console.log('🔗 Final Slack redirect URI:', redirectUri);
  
  // Generate cryptographically secure state parameter
  const state = randomBytes(32).toString('hex');
  
  // Store state in session for validation in callback
  session.slackOAuthState = state;
  session.slackOAuthOrganizationSlug = organizationSlug;
  session.slackOAuthExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
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
export function validateOAuthState(state: string, session: any): string | null {
  console.log('🔍 validateOAuthState called with state prefix:', state.substring(0, 8) + '...');
  
  // Check if session has stored state
  if (!session.slackOAuthState) {
    console.error('❌ State validation failed: No stored state in session');
    return null;
  }
  
  // Check if state matches session
  if (session.slackOAuthState !== state) {
    console.error('❌ State validation failed: State mismatch');
    console.error('   Expected prefix:', session.slackOAuthState.substring(0, 8) + '...');
    console.error('   Received prefix:', state.substring(0, 8) + '...');
    return null;
  }
  
  // Check if expires field exists
  if (!session.slackOAuthExpires) {
    console.error('❌ State validation failed: No expiration time stored');
    // Clean up incomplete session data
    delete session.slackOAuthState;
    delete session.slackOAuthOrganizationSlug;
    delete session.slackOAuthExpires;
    return null;
  }
  
  // Check if state has expired
  const now = Date.now();
  if (now > session.slackOAuthExpires) {
    console.error('❌ State validation failed: State expired');
    console.error('   Now:', new Date(now).toISOString());
    console.error('   Expires:', new Date(session.slackOAuthExpires).toISOString());
    console.error('   Expired by (ms):', now - session.slackOAuthExpires);
    // Clean up expired session data
    delete session.slackOAuthState;
    delete session.slackOAuthOrganizationSlug;
    delete session.slackOAuthExpires;
    return null;
  }
  
  // Check if organization slug exists
  const organizationSlug = session.slackOAuthOrganizationSlug;
  if (!organizationSlug) {
    console.error('❌ State validation failed: No organization slug stored');
    // Clean up incomplete session data
    delete session.slackOAuthState;
    delete session.slackOAuthOrganizationSlug;
    delete session.slackOAuthExpires;
    return null;
  }
  
  console.log('✅ State validation successful');
  console.log('   Organization slug:', organizationSlug);
  console.log('   Time remaining (ms):', session.slackOAuthExpires - now);
  
  // Clean up used state from session
  delete session.slackOAuthState;
  delete session.slackOAuthOrganizationSlug;
  delete session.slackOAuthExpires;
  
  console.log('🧹 Session state cleaned up after successful validation');
  
  return organizationSlug;
}

/**
 * Exchange OAuth code for OpenID Connect tokens
 */
export async function exchangeOIDCCode(code: string, redirectUri?: string): Promise<SlackOIDCTokenResponse> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  
  // Use provided redirect URI or fallback to production/dev defaults
  let finalRedirectUri = redirectUri;
  if (!finalRedirectUri) {
    // Check if we're in production based on various indicators
    const isProduction = process.env.NODE_ENV === 'production' ||
                         process.env.FORCE_PRODUCTION === 'true' ||
                         process.env.FORCE_PRODUCTION_OAUTH === 'true' ||
                         process.env.REPL_SLUG?.includes('whirkplace');
    
    if (isProduction) {
      // Production always uses whirkplace.com with HTTPS
      finalRedirectUri = 'https://whirkplace.com/auth/slack/callback';
    } else {
      // Development uses override if available, otherwise localhost
      finalRedirectUri = process.env.SLACK_REDIRECT_URI_OVERRIDE || 'http://localhost:5000/auth/slack/callback';
    }
  }
  
  // Debug logging for redirect URI
  console.log('🔄 Token exchange redirect URI:', finalRedirectUri);
  console.log('  NODE_ENV:', process.env.NODE_ENV);
  console.log('  FORCE_PRODUCTION_OAUTH:', process.env.FORCE_PRODUCTION_OAUTH);
  
  // Extra safety: if redirect URI contains whirkplace.com, ensure it uses HTTPS and correct path
  if (finalRedirectUri.includes('whirkplace.com') && !finalRedirectUri.startsWith('https://whirkplace.com/auth/slack/callback')) {
    console.warn('⚠️  Correcting whirkplace.com redirect URI format');
    finalRedirectUri = 'https://whirkplace.com/auth/slack/callback';
  }
  
  if (!clientId || !clientSecret || !finalRedirectUri) {
    throw new Error("Slack OAuth not configured. Missing required environment variables");
  }
  
  console.log('🔄 Exchanging code with redirect URI:', finalRedirectUri);
  
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: finalRedirectUri,
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
    // PERMANENT FIX: Use jose library instead of problematic jsonwebtoken
    // This completely eliminates the "maxAge must be a number" error
    console.log('🔒 Validating JWT with modern jose library...');
    
    // Create remote JWKS for Slack's OpenID Connect public keys - this is the correct endpoint
    const JWKS = createRemoteJWKSet(new URL('https://slack.com/openid/connect/keys'));
    
    // Verify JWT with jose - secure, reliable, and modern
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: 'https://slack.com',
      audience: process.env.SLACK_CLIENT_ID,
      algorithms: ['RS256']
    });

    console.log('✅ JWT verification successful with jose library');
    
    // Debug: Log the entire payload to see what fields are available
    console.log('📋 JWT Payload fields:', Object.keys(payload));
    console.log('📧 Email field value:', payload.email);
    console.log('👤 Name field value:', payload.name);
    console.log('🔍 Full payload:', JSON.stringify(payload, null, 2));

    // Extract user information from verified token
    console.log('🔍 Team fields in JWT:', {
      team_id: payload['https://slack.com/team_id'],
      team_name: payload['https://slack.com/team_name'],
      team_domain: payload['https://slack.com/team_domain']
    });
    
    const userInfo: SlackOIDCUserInfo = {
      sub: payload.sub!,
      team: {
        id: payload['https://slack.com/team_id'] as string,
        name: payload['https://slack.com/team_name'] as string || payload['https://slack.com/team_domain'] as string
      },
      user: {
        id: payload['https://slack.com/user_id'] as string,
        name: payload.name as string || payload.given_name as string || payload.family_name as string,
        email: payload.email as string || payload['https://slack.com/user_email'] as string,
        image: payload.picture as string
      },
      enterprise: payload['https://slack.com/enterprise_id'] ? {
        id: payload['https://slack.com/enterprise_id'] as string,
        name: payload['https://slack.com/enterprise_name'] as string
      } : undefined
    };

    return { ok: true, user: userInfo };

  } catch (error) {
    console.error('❌ JWT validation failed with jose:', error);
    console.error('❌ Detailed error for debugging:', error instanceof Error ? error.message : 'Unknown error');
    
    // Provide user-friendly error messages
    let userFriendlyError = 'Authentication failed';
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('expired')) {
      userFriendlyError = 'Your login session has expired. Please try logging in again.';
    } else if (errorMessage.includes('audience')) {
      userFriendlyError = 'Authentication configuration error. Please contact support.';
    } else if (errorMessage.includes('issuer')) {
      userFriendlyError = 'Invalid authentication source.';
    } else if (errorMessage.includes('signature')) {
      userFriendlyError = 'Authentication verification failed.';
    }
    
    return {
      ok: false,
      error: userFriendlyError
    };
  }
}

/**
 * Get user info from Slack API using access token
 */
export async function getSlackUserInfo(accessToken: string, userId: string): Promise<{ email?: string; name?: string }> {
  try {
    console.log('🔍 Fetching user info from Slack API for user:', userId);
    
    const response = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error('Failed to fetch user info from Slack:', response.status, response.statusText);
      return {};
    }
    
    const data = await response.json();
    
    if (data.ok && data.user) {
      console.log('✅ Successfully fetched user info from Slack');
      console.log('  Email:', data.user.profile?.email);
      console.log('  Real name:', data.user.profile?.real_name);
      
      return {
        email: data.user.profile?.email,
        name: data.user.profile?.real_name || data.user.real_name || data.user.name,
      };
    } else {
      console.error('Slack API returned error:', data.error);
      return {};
    }
  } catch (error) {
    console.error('Error fetching Slack user info:', error);
    return {};
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
 * Send interactive check-in modal directly in Slack
 */
export async function sendInteractiveCheckinModal(userId: string, triggerId: string, userName: string) {
  if (!slack) return;

  const appUrl = process.env.REPL_URL || process.env.REPLIT_URL || 'https://your-app.replit.app';
  const checkinUrl = `${appUrl}/#/checkins`;

  const modal = {
    type: 'modal' as const,
    callback_id: 'checkin_modal',
    title: {
      type: 'plain_text' as const,
      text: 'Weekly Check-in'
    },
    blocks: [
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `Hi ${userName}! 👋 Time for your weekly check-in. How are you doing this week?`
        }
      },
      {
        type: 'input' as const,
        block_id: 'mood_rating',
        element: {
          type: 'radio_buttons' as const,
          action_id: 'mood_value',
          options: [
            {
              text: {
                type: 'plain_text' as const,
                text: '😍 Excellent (5/5)'
              },
              value: '5'
            },
            {
              text: {
                type: 'plain_text' as const,
                text: '😊 Great (4/5)'
              },
              value: '4'
            },
            {
              text: {
                type: 'plain_text' as const,
                text: '🙂 Good (3/5)'
              },
              value: '3'
            },
            {
              text: {
                type: 'plain_text' as const,
                text: '😕 Okay (2/5)'
              },
              value: '2'
            },
            {
              text: {
                type: 'plain_text' as const,
                text: '😟 Not Great (1/5)'
              },
              value: '1'
            }
          ]
        },
        label: {
          type: 'plain_text' as const,
          text: 'How would you rate your overall mood this week?'
        }
      },
      {
        type: 'input' as const,
        block_id: 'accomplishments',
        element: {
          type: 'plain_text_input' as const,
          action_id: 'accomplishments_value',
          multiline: true,
          placeholder: {
            type: 'plain_text' as const,
            text: 'What went well this week? Any wins or accomplishments?'
          }
        },
        label: {
          type: 'plain_text' as const,
          text: 'Wins & Accomplishments'
        },
        optional: true
      },
      {
        type: 'input' as const,
        block_id: 'challenges',
        element: {
          type: 'plain_text_input' as const,
          action_id: 'challenges_value',
          multiline: true,
          placeholder: {
            type: 'plain_text' as const,
            text: 'Any challenges or blockers you faced?'
          }
        },
        label: {
          type: 'plain_text' as const,
          text: 'Challenges & Blockers'
        },
        optional: true
      },
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `💡 *Quick tip*: Your responses help your team leader understand how to support you better!`
        }
      },
      {
        type: 'actions' as const,
        elements: [
          {
            type: 'button' as const,
            text: {
              type: 'plain_text' as const,
              text: '📝 Complete in App'
            },
            url: checkinUrl,
            style: 'secondary' as const
          }
        ]
      }
    ],
    submit: {
      type: 'plain_text' as const,
      text: '✅ Submit Check-in'
    },
    close: {
      type: 'plain_text' as const,
      text: '❌ Cancel'
    }
  };

  try {
    await slack.views.open({
      trigger_id: triggerId,
      view: modal
    });

    console.log(`Interactive check-in modal opened for ${userName}`);
  } catch (error) {
    console.error(`Error opening check-in modal for ${userName}:`, error);
  }
}

/**
 * Send personalized check-in reminder with interactive buttons
 */
export async function sendPersonalizedCheckinReminder(
  userId: string, 
  userName: string, 
  questions: Array<{id: string, text: string}> = [],
  isWeeklyScheduled: boolean = false
) {
  if (!slack) return;

  const appUrl = process.env.REPL_URL || process.env.REPLIT_URL || 'https://your-app.replit.app';
  const checkinUrl = `${appUrl}/#/checkins`;

  const reminderBlocks: any[] = [
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: isWeeklyScheduled 
          ? `🔔 *Weekly Check-in Reminder - ${new Date().toLocaleDateString()}*`
          : `📝 *Check-in Reminder*`
      }
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `Hi ${userName}! 👋 Hope you're having a great ${isWeeklyScheduled ? 'Monday' : 'day'}! Time for your weekly team check-in.`
      }
    }
  ];

  // Add question preview if available
  if (questions.length > 0) {
    reminderBlocks.push({
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `*This week's questions preview:*`
      }
    });

    questions.slice(0, 2).forEach((question, index) => {
      reminderBlocks.push({
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `${index + 1}. ${question.text}`
        }
      });
    });

    if (questions.length > 2) {
      reminderBlocks.push({
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `_...and ${questions.length - 2} more questions_`
        }
      });
    }
  }

  // Add call-to-action buttons - removed quick check-in option
  reminderBlocks.push({
    type: 'actions' as const,
    elements: [
      {
        type: 'button' as const,
        text: {
          type: 'plain_text' as const,
          text: '📊 Complete Check-in'
        },
        url: checkinUrl,
        style: 'primary' as const
      },
      {
        type: 'button' as const,
        text: {
          type: 'plain_text' as const,
          text: '⏰ Remind Later'
        },
        action_id: 'remind_later',
        value: 'remind_4hours'
      }
    ]
  });

  reminderBlocks.push({
    type: 'context' as const,
    elements: [
      {
        type: 'mrkdwn' as const,
        text: `🕰️ Takes 2-3 minutes | Your team appreciates your input! ❤️`
      }
    ]
  });

  try {
    const dmResult = await slack.conversations.open({
      users: userId
    });

    if (dmResult.ok && dmResult.channel?.id) {
      await sendSlackMessage({
        channel: dmResult.channel.id,
        blocks: reminderBlocks,
        text: `Check-in reminder for ${userName}`
      });

      console.log(`Personalized check-in reminder sent to ${userName} (${userId})`);
    }
  } catch (error) {
    console.error(`Error sending personalized reminder to ${userName}:`, error);
  }
}

/**
 * Send a check-in reminder to Slack with link to check-in and weekly questions (Legacy function - kept for backward compatibility)
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
 * Announce a public win to the organization's configured Slack channel
 */
export async function announceWin(
  winTitle: string, 
  winDescription: string, 
  userName: string, 
  nominatedBy?: string,
  channelId?: string
) {
  if (!slack) {
    console.log("Slack client not configured, skipping win announcement");
    return;
  }

  // Use provided channel ID or fall back to environment variable
  const channel = channelId || process.env.SLACK_CHANNEL_ID;
  if (!channel) {
    console.warn("No Slack channel configured for win announcements");
    return;
  }
  
  const announcement = nominatedBy 
    ? `🏆 ${nominatedBy} recognized ${userName}` 
    : `🏆 Let's celebrate ${userName}!`;

  try {
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
      ],
      text: `${announcement}: ${winTitle}`
    });

    console.log(`✅ Public win announced to channel ${channel}`);
    return messageId;
  } catch (error) {
    console.error('Error announcing win to Slack channel:', error);
    // Don't throw - win creation should succeed even if Slack fails
    return undefined;
  }
}

/**
 * Send a private win notification as a DM to the recipient
 */
export async function sendPrivateWinNotification(
  winTitle: string,
  winDescription: string,
  recipientSlackId: string,
  recipientName: string,
  senderName: string,
  nominatedBy?: string
) {
  if (!slack) {
    console.log("Slack client not configured, skipping private win notification");
    return;
  }

  if (!recipientSlackId) {
    console.log(`No Slack ID for recipient ${recipientName}, skipping DM`);
    return;
  }

  const sender = nominatedBy || senderName;
  
  try {
    // Open a DM channel with the recipient
    const dmResult = await slack.conversations.open({
      users: recipientSlackId
    });

    if (!dmResult.ok || !dmResult.channel?.id) {
      console.error(`Failed to open DM channel with ${recipientName}:`, dmResult.error);
      return;
    }

    // Send the private win notification
    const messageId = await sendSlackMessage({
      channel: dmResult.channel.id,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🎉 *You've been recognized by ${sender}!*`
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
            text: 'Keep up the amazing work! 🌟'
          }
        }
      ],
      text: `You've been recognized by ${sender}: ${winTitle}`
    });

    console.log(`✅ Private win notification sent to ${recipientName} (${recipientSlackId})`);
    return messageId;
  } catch (error) {
    console.error(`Error sending private win DM to ${recipientName}:`, error);
    // Don't throw - win creation should succeed even if Slack fails
    return undefined;
  }
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
/**
 * Send one-on-one meeting reminder via DM
 */
export async function sendOneOnOneMeetingReminder(
  userId: string,
  userName: string,
  meetingDetails: {
    participantName: string;
    scheduledAt: Date;
    agenda?: string;
    meetingUrl?: string;
  }
) {
  if (!slack) return;

  const appUrl = process.env.REPL_URL || process.env.REPLIT_URL || 'https://your-app.replit.app';
  const meetingsUrl = `${appUrl}/#/one-on-ones`;
  
  const formatTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const reminderBlocks = [
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `⏰ *One-on-One Meeting Reminder*`
      }
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `Hi ${userName}! 👋 You have a one-on-one meeting coming up with *${meetingDetails.participantName}*.`
      }
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `📅 *When:* ${formatTime(meetingDetails.scheduledAt)}`
      }
    }
  ];

  // Add agenda if provided
  if (meetingDetails.agenda) {
    reminderBlocks.push({
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `📋 *Agenda:*\n${meetingDetails.agenda}`
      }
    });
  }

  // Add action buttons
  const actionElements: any[] = [
    {
      type: 'button' as const,
      text: {
        type: 'plain_text' as const,
        text: '📝 View Details'
      },
      url: meetingsUrl,
      style: 'primary' as const
    }
  ];

  if (meetingDetails.meetingUrl) {
    actionElements.push({
      type: 'button' as const,
      text: {
        type: 'plain_text' as const,
        text: '🎥 Join Meeting'
      },
      url: meetingDetails.meetingUrl
    });
  }

  reminderBlocks.push({
    type: 'actions' as const,
    elements: actionElements
  } as any);

  try {
    // Send as DM to the user
    const dmResult = await slack.conversations.open({
      users: userId
    });

    if (dmResult.ok && dmResult.channel?.id) {
      await sendSlackMessage({
        channel: dmResult.channel.id,
        blocks: reminderBlocks,
        text: `One-on-one meeting reminder with ${meetingDetails.participantName}`
      });

      console.log(`One-on-one reminder sent to ${userName} (${userId})`);
    } else {
      console.warn(`Failed to send one-on-one reminder to ${userName}: ${dmResult.error}`);
    }
  } catch (error) {
    console.error(`Error sending one-on-one reminder to ${userName}:`, error);
  }
}

/**
 * Send check-in review reminder to managers via DM
 */
export async function sendCheckinReviewReminder(
  managerId: string,
  managerName: string,
  teamMemberCheckins: Array<{
    memberName: string;
    moodRating: number;
    submittedAt: Date;
    needsReview?: boolean;
  }>
) {
  if (!slack) return;

  const appUrl = process.env.REPL_URL || process.env.REPLIT_URL || 'https://your-app.replit.app';
  const analyticsUrl = `${appUrl}/#/analytics`;
  
  const pendingReviews = teamMemberCheckins.filter(c => c.needsReview).length;
  const totalCheckins = teamMemberCheckins.length;

  const reminderBlocks = [
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `📊 *Team Check-in Review Reminder*`
      }
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: totalCheckins > 0 
          ? `Hi ${managerName}! 👋 Your team has submitted ${totalCheckins} check-ins this week.`
          : `Hi ${managerName}! 👋 No check-ins have been submitted this week yet.`
      }
    }
  ];

  if (pendingReviews > 0) {
    reminderBlocks.push({
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `⚠️ *${pendingReviews} check-ins need your attention* - some team members might need extra support.`
      }
    });
  }

  // Add summary of mood ratings (only if there are check-ins)
  if (totalCheckins > 0) {
    const avgMood = teamMemberCheckins.reduce((sum, c) => sum + c.moodRating, 0) / totalCheckins;
    const moodEmoji = avgMood >= 4 ? '😊' : avgMood >= 3 ? '😐' : '😔';
    
    reminderBlocks.push({
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `${moodEmoji} *Team Mood Average:* ${avgMood.toFixed(1)}/5`
      }
    });
  } else {
    reminderBlocks.push({
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `📝 *No check-ins yet this week* - consider sending a gentle reminder to your team.`
      }
    });
  }

  // Add recent check-ins summary
  if (teamMemberCheckins.length > 0) {
    const recentCheckins = teamMemberCheckins
      .slice(0, 3)
      .map(c => `• *${c.memberName}*: ${c.moodRating}/5 ${c.needsReview ? '⚠️' : '✅'}`)
      .join('\n');
    
    reminderBlocks.push({
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `*Recent Check-ins:*\n${recentCheckins}${totalCheckins > 3 ? `\n_...and ${totalCheckins - 3} more_` : ''}`
      }
    });
  }

  reminderBlocks.push({
    type: 'actions' as const,
    elements: [
      {
        type: 'button' as const,
        text: {
          type: 'plain_text' as const,
          text: '📊 Review Team Analytics'
        },
        url: analyticsUrl,
        style: 'primary' as const
      }
    ]
  } as any);

  try {
    // Send as DM to the manager
    const dmResult = await slack.conversations.open({
      users: managerId
    });

    if (dmResult.ok && dmResult.channel?.id) {
      await sendSlackMessage({
        channel: dmResult.channel.id,
        blocks: reminderBlocks,
        text: `Team check-in review reminder - ${totalCheckins} check-ins submitted`
      });

      console.log(`Check-in review reminder sent to ${managerName} (${managerId})`);
    } else {
      console.warn(`Failed to send review reminder to ${managerName}: ${dmResult.error}`);
    }
  } catch (error) {
    console.error(`Error sending review reminder to ${managerName}:`, error);
  }
}

/**
 * Send one-on-one meeting report to user via DM
 */
export async function sendOneOnOneReportToUser(
  userId: string,
  userName: string,
  meetingDetails: {
    id: string;
    participantName: string;
    scheduledAt: Date;
    agenda?: string;
    notes?: string;
    actionItems?: Array<{
      id?: string;
      description: string;
      assignedTo?: string;
      dueDate?: string;
      completed?: boolean;
    }>;
    duration?: number;
    location?: string;
    status: string;
  }
) {
  if (!slack) return;

  const appUrl = process.env.REPL_URL || process.env.REPLIT_URL || 'https://your-app.replit.app';
  const meetingUrl = `${appUrl}/#/one-on-ones`;
  
  const formatDate = (date: Date) => {
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const reportBlocks = [
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `📋 *Your One-on-One Meeting Report*`
      }
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `Hi ${userName}! 👋 Here's your meeting summary with *${meetingDetails.participantName}*.`
      }
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `📅 *When:* ${formatDate(meetingDetails.scheduledAt)}\n⏱️ *Duration:* ${meetingDetails.duration || 30} minutes\n📍 *Location:* ${meetingDetails.location || 'Not specified'}\n📊 *Status:* ${meetingDetails.status}`
      }
    }
  ];

  // Add agenda section if present
  if (meetingDetails.agenda && meetingDetails.agenda.trim()) {
    reportBlocks.push({
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `📋 *Agenda:*\n${meetingDetails.agenda.length > 500 ? meetingDetails.agenda.substring(0, 500) + '...' : meetingDetails.agenda}`
      }
    });
  }

  // Add notes section if present
  if (meetingDetails.notes && meetingDetails.notes.trim()) {
    reportBlocks.push({
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `📝 *Meeting Notes:*\n${meetingDetails.notes.length > 1000 ? meetingDetails.notes.substring(0, 1000) + '...' : meetingDetails.notes}`
      }
    });
  }

  // Add action items section if present
  if (meetingDetails.actionItems && meetingDetails.actionItems.length > 0) {
    const actionItemsText = meetingDetails.actionItems
      .map((item, index) => {
        const status = item.completed ? '✅' : '⏳';
        const dueText = item.dueDate ? ` (Due: ${new Date(item.dueDate).toLocaleDateString()})` : '';
        return `${status} ${index + 1}. ${item.description}${dueText}`;
      })
      .join('\n');

    reportBlocks.push({
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `🎯 *Action Items:*\n${actionItemsText}`
      }
    });
  }

  // Add footer with link to app
  reportBlocks.push({
    type: 'section' as const,
    text: {
      type: 'mrkdwn' as const,
      text: `💡 *Need to update or review more details?* <${meetingUrl}|Open in Whirkplace>`
    }
  });

  try {
    // Send as DM to the user
    const dmResult = await slack.conversations.open({
      users: userId
    });

    if (dmResult.ok && dmResult.channel?.id) {
      await sendSlackMessage({
        channel: dmResult.channel.id,
        blocks: reportBlocks,
        text: `One-on-one meeting report with ${meetingDetails.participantName}`
      });

      console.log(`One-on-one report sent to ${userName} (${userId})`);
      return { success: true, message: 'Report sent successfully' };
    } else {
      console.warn(`Failed to send one-on-one report to ${userName}: ${dmResult.error}`);
      return { success: false, message: `Failed to open DM: ${dmResult.error}` };
    }
  } catch (error) {
    console.error(`Error sending one-on-one report to ${userName}:`, error);
    return { success: false, message: 'Failed to send report' };
  }
}

/**
 * Send personalized welcome message to new users joining the Slack channel
 */
export async function sendWelcomeMessage(userId: string, userName: string, channelId: string, organizationName?: string) {
  if (!slack) return;

  const appUrl = process.env.REPL_URL || process.env.REPLIT_URL || 'https://your-app.replit.app';
  const loginUrl = `${appUrl}/#/login`;
  const checkinUrl = `${appUrl}/#/checkins`;
  const dashboardUrl = `${appUrl}/#/dashboard`;

  const welcomeBlocks = [
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `🎉 *Welcome to ${organizationName || 'the team'}, ${userName}!*`
      }
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `Hi there! I'm your team wellness assistant. I'm here to help you stay connected with your team through regular check-ins, celebrating wins, and sharing feedback.`
      }
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `*Here's how to get started:*\n\n1️⃣ *Access the App*: Click the button below to login\n2️⃣ *Complete Your Profile*: Set up your profile and preferences\n3️⃣ *Weekly Check-ins*: Share how you're doing each week\n4️⃣ *Celebrate Wins*: Recognize your team's achievements`
      }
    },
    {
      type: 'actions' as const,
      elements: [
        {
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: '🚀 Get Started'
          },
          url: loginUrl,
          style: 'primary' as const
        },
        {
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: '📊 View Dashboard'
          },
          url: dashboardUrl
        }
      ]
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `💡 *Pro Tip*: You can also interact with me directly in Slack! Try clicking the buttons in messages or look out for weekly reminders.`
      }
    },
    {
      type: 'context' as const,
      elements: [
        {
          type: 'mrkdwn' as const,
          text: `Questions? Just mention me in the channel and I'll help you out! 🤖`
        }
      ]
    }
  ];

  try {
    // Send welcome message as DM to the user
    const dmResult = await slack.conversations.open({
      users: userId
    });

    if (dmResult.ok && dmResult.channel?.id) {
      await sendSlackMessage({
        channel: dmResult.channel.id,
        blocks: welcomeBlocks,
        text: `Welcome to ${organizationName || 'the team'}! 🎉`
      });

      console.log(`Welcome message sent to ${userName} (${userId})`);
    } else {
      console.warn(`Failed to open DM with user ${userName}: ${dmResult.error}`);
    }
  } catch (error) {
    console.error(`Error sending welcome message to ${userName}:`, error);
  }
}

/**
 * Send onboarding DM with login credentials to newly synced users
 */
export async function sendOnboardingDM(
  slackUserId: string, 
  email: string, 
  tempPassword: string, 
  organizationName: string,
  userName?: string,
  botToken?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const slackClient = botToken ? new WebClient(botToken) : slack;
    
    if (!slackClient) {
      console.error('No Slack client available for sending onboarding DM');
      return { success: false, error: 'Slack not configured' };
    }

    // Open a DM channel with the user
    const dmResult = await slackClient.conversations.open({
      users: slackUserId
    });

    if (!dmResult.ok || !dmResult.channel?.id) {
      console.error(`Failed to open DM with user ${slackUserId}: ${dmResult.error}`);
      return { success: false, error: `Failed to open DM: ${dmResult.error}` };
    }

    const loginUrl = 'https://whirkplace.com/login';
    const settingsUrl = 'https://whirkplace.com/settings';
    const checkinUrl = 'https://whirkplace.com/checkins';
    const dashboardUrl = 'https://whirkplace.com/dashboard';

    // Create professional and welcoming message blocks
    const onboardingBlocks = [
      {
        type: 'header' as const,
        text: {
          type: 'plain_text' as const,
          text: '🎉 Welcome to WhirkPlace!',
          emoji: true
        }
      },
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `Hello ${userName || 'there'}! Your WhirkPlace account has been created for *${organizationName}*.`
        }
      },
      {
        type: 'divider' as const
      },
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `*🔐 Your Login Credentials:*\n\n*Email:* \`${email}\`\n*Temporary Password:* \`${tempPassword}\`\n\n_⚠️ Please change your password after your first login for security._`
        }
      },
      {
        type: 'actions' as const,
        elements: [
          {
            type: 'button' as const,
            text: {
              type: 'plain_text' as const,
              text: '🚀 Login Now',
              emoji: true
            },
            url: loginUrl,
            style: 'primary' as const
          }
        ]
      },
      {
        type: 'divider' as const
      },
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `*📋 About WhirkPlace:*\n\nWhirkPlace is your team wellness and recognition platform that helps teams stay connected, engaged, and productive.\n\n*Key Features:*\n• 💭 *Check-ins*: Share your weekly progress and wellbeing\n• 🏆 *Wins & Recognition*: Celebrate achievements and recognize teammates\n• 📊 *Team Analytics*: Track team health and engagement trends\n• 👏 *Shoutouts*: Give public kudos to your colleagues`
        }
      },
      {
        type: 'divider' as const
      },
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `*✅ Next Steps:*\n\n1. *Login and change your password* - Use the button above to access WhirkPlace\n2. *Complete your profile* - Add your details and preferences\n3. *Set notification preferences* - Choose how often you want reminders\n4. *Submit your first check-in* - Share how you're doing this week`
        }
      },
      {
        type: 'actions' as const,
        elements: [
          {
            type: 'button' as const,
            text: {
              type: 'plain_text' as const,
              text: '⚙️ Settings',
              emoji: true
            },
            url: settingsUrl
          },
          {
            type: 'button' as const,
            text: {
              type: 'plain_text' as const,
              text: '📝 Check-ins',
              emoji: true
            },
            url: checkinUrl
          },
          {
            type: 'button' as const,
            text: {
              type: 'plain_text' as const,
              text: '📊 Dashboard',
              emoji: true
            },
            url: dashboardUrl
          }
        ]
      },
      {
        type: 'divider' as const
      },
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `*🔔 Notification Preferences:*\n\nYou'll receive check-in reminders weekly by default. You can adjust this in your settings to:\n• Weekly (recommended)\n• Bi-weekly\n• Monthly\n• Custom schedule\n\nYou can also set preferences for review reminders and team updates.`
        }
      },
      {
        type: 'context' as const,
        elements: [
          {
            type: 'mrkdwn' as const,
            text: `❓ *Questions?* Reply to this message or visit our help center. We're here to help!`
          }
        ]
      }
    ];

    // Send the onboarding message
    const messageResult = await slackClient.chat.postMessage({
      channel: dmResult.channel.id,
      blocks: onboardingBlocks,
      text: `Welcome to WhirkPlace! Your login credentials: Email: ${email}, Temporary Password: ${tempPassword}. Please login at ${loginUrl} and change your password.`
    });

    if (messageResult.ok) {
      console.log(`✅ Onboarding DM sent successfully to ${userName || slackUserId} (${email})`);
      return { success: true };
    } else {
      console.error(`Failed to send onboarding DM: ${messageResult.error}`);
      return { success: false, error: messageResult.error };
    }
  } catch (error: any) {
    console.error(`Error sending onboarding DM to ${slackUserId}:`, error);
    return { success: false, error: error?.message || 'Failed to send onboarding message' };
  }
}

/**
 * Send a quick start guide with interactive buttons for check-ins
 */
export async function sendQuickStartGuide(userId: string, userName: string) {
  if (!slack) return;

  const appUrl = process.env.REPL_URL || process.env.REPLIT_URL || 'https://your-app.replit.app';
  const checkinUrl = `${appUrl}/#/checkins`;

  const quickStartBlocks = [
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `📝 *Ready for your first check-in, ${userName}?*`
      }
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `Check-ins help your team stay connected and support each other. It only takes 2-3 minutes!`
      }
    },
    {
      type: 'actions' as const,
      elements: [
        {
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: '📝 Start Check-in'
          },
          url: checkinUrl,
          style: 'primary' as const
        },
        {
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: '⏰ Remind Me Later'
          },
          action_id: 'remind_later',
          value: 'remind_checkin_later'
        }
      ]
    }
  ];

  try {
    const dmResult = await slack.conversations.open({
      users: userId
    });

    if (dmResult.ok && dmResult.channel?.id) {
      await sendSlackMessage({
        channel: dmResult.channel.id,
        blocks: quickStartBlocks,
        text: `Ready for your first check-in? 📝`
      });

      console.log(`Quick start guide sent to ${userName} (${userId})`);
    }
  } catch (error) {
    console.error(`Error sending quick start guide to ${userName}:`, error);
  }
}

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

  const blocks: any[] = [
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
    type: 'actions' as const,
    elements: [
      {
        type: 'button' as const,
        text: {
          type: 'plain_text' as const,
          text: 'Review Check-in 👁️'
        },
        url: reviewUrl,
        style: 'primary' as const
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
  reviewStatus: 'reviewed', 
  reviewComments?: string
) {
  if (!slack) return;

  // Use private channel for sensitive check-in review notifications
  const channel = process.env.SLACK_PRIVATE_CHANNEL_ID;
  if (!channel) {
    console.warn("SLACK_PRIVATE_CHANNEL_ID not configured. Sensitive review notification not sent for security.");
    return;
  }
  
  const statusEmoji = '👁️';
  const statusColor = 'good';
  const appUrl = process.env.REPL_URL || process.env.REPLIT_URL || 'https://your-app.replit.app';
  const checkinUrl = `${appUrl}/#/checkins`;

  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${statusEmoji} *Check-in Reviewed*`
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Hi ${userName}! ${reviewerName} has reviewed your weekly check-in.`
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

  if (reviewStatus === 'reviewed') { // Note: Status is always 'reviewed', but we can add logic for different review outcomes
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Please review the feedback${reviewComments ? ' above' : ''} and update your check-in if needed.`
      }
    });
    blocks.push({
      type: 'actions' as const,
      elements: [
        {
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: 'Update Check-in 📝'
          },
          url: checkinUrl,
          style: 'primary' as const
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

export async function getChannelMembers(botToken?: string, channelNameOrId: string = WHIRKPLACE_CHANNEL): Promise<{ 
  members?: { id: string; name: string; email?: string; active: boolean }[];
  error?: string;
  errorCode?: string;
  errorDetails?: any;
}> {
  console.log(`🔍 getChannelMembers called for channel: "${channelNameOrId}"`);
  console.log(`🔑 Using ${botToken ? 'organization-specific token' : 'environment token'}`);
  
  // Use provided token or fall back to environment variable
  const token = botToken || process.env.SLACK_BOT_TOKEN;
  if (!token) {
    const errorMsg = "No Slack bot token available. Cannot fetch channel members.";
    console.error("❌ " + errorMsg);
    console.error("   📋 Diagnostic Information:");
    console.error("   - Organization token provided: " + (botToken ? "YES (but empty/invalid)" : "NO"));
    console.error("   - Environment token exists: " + (process.env.SLACK_BOT_TOKEN ? "YES (but empty/invalid)" : "NO"));
    console.error("   - Channel requested: " + channelNameOrId);
    console.error("   - Timestamp: " + new Date().toISOString());
    return { 
      members: [],
      error: errorMsg,
      errorCode: 'missing_token',
      errorDetails: {
        hasOrgToken: !!botToken,
        orgTokenEmpty: botToken === "",
        hasEnvToken: !!process.env.SLACK_BOT_TOKEN,
        envTokenEmpty: process.env.SLACK_BOT_TOKEN === "",
        channelRequested: channelNameOrId,
        timestamp: new Date().toISOString(),
        message: "CRITICAL: Slack bot token is missing or empty. Please add your Slack Bot Token in Settings → Integrations → Slack. The bot token should start with 'xoxb-' and be obtained from your Slack app settings at https://api.slack.com/apps",
        solution: [
          "1. Go to Settings → Integrations → Slack",
          "2. Click 'Connect Slack' or 'Update Settings'",
          "3. Paste your bot token (starts with xoxb-)",
          "4. Save the settings and try syncing again"
        ]
      }
    };
  }

  // Create a client with the appropriate token
  const slackClient = new WebClient(token);

  try {
    let channelId: string | undefined;
    
    // Check if we already have a channel ID (starts with C, D, or G for Slack channels/DMs/groups)
    if (/^[CDG][A-Z0-9]{8,}$/i.test(channelNameOrId)) {
      // This looks like a channel ID, use it directly
      console.log(`✅ Using provided channel ID directly: ${channelNameOrId}`);
      channelId = channelNameOrId;
      
      // Verify the channel exists and bot has access
      try {
        const channelInfo = await slackClient.conversations.info({ channel: channelId });
        if (channelInfo.channel) {
          console.log(`✅ Verified channel ID ${channelId} exists`);
          console.log(`   Channel name: ${(channelInfo.channel as any).name}`);
          console.log(`   Channel is_member: ${(channelInfo.channel as any).is_member}`);
          console.log(`   Channel is_private: ${(channelInfo.channel as any).is_private}`);
        }
      } catch (error: any) {
        console.error(`❌ Failed to verify channel ID ${channelId}:`, error?.data?.error);
        if (error?.data?.error === 'channel_not_found') {
          const errorMsg = `Channel ID ${channelId} not found or bot doesn't have access`;
          console.error(`❌ ${errorMsg}`);
          console.error(`   📋 Diagnostic Information:`);
          console.error(`   - Channel ID requested: ${channelId}`);
          console.error(`   - Bot token used: ${token.substring(0, 10)}...`);
          console.error(`   - Slack API error: ${error?.data?.error}`);
          console.error(`   - Timestamp: ${new Date().toISOString()}`);
          return {
            members: [],
            error: errorMsg,
            errorCode: 'channel_not_found',
            errorDetails: {
              channelId: channelId,
              tokenPrefix: token.substring(0, 10),
              slackApiError: error?.data?.error,
              timestamp: new Date().toISOString(),
              message: "CRITICAL: The channel doesn't exist or the bot hasn't been invited to it.",
              diagnostics: {
                possibleCauses: [
                  "1. The channel ID is incorrect or outdated",
                  "2. The channel was deleted or archived",
                  "3. The bot hasn't been invited to this private channel",
                  "4. The bot was removed from the channel",
                  "5. The workspace ID has changed"
                ],
                immediateActions: [
                  "1. Verify the channel still exists in Slack",
                  "2. Invite the bot to the channel: /invite @YourBotName",
                  "3. Check if this is a private channel that requires invitation",
                  "4. Try using the channel name instead of ID"
                ]
              }
            }
          };
        }
        // Continue anyway - the channel might exist but info is restricted
      }
    } else {
      // This is a channel name, search for it
      console.log(`🔎 Searching for channel by name: "${channelNameOrId}"...`);
      let cursor: string | undefined;
      let totalChannelsChecked = 0;
      const allChannelNames: string[] = [];
      
      do {
        try {
          const result = await slackClient.conversations.list({
            types: 'public_channel,private_channel',
            exclude_archived: true,
            limit: 1000,
            cursor
          });
          
          if (!result.ok) {
            const errorMsg = `Slack API error: ${result.error}`;
            console.error(`❌ ${errorMsg}`);
            return {
              members: [],
              error: errorMsg,
              errorCode: 'slack_api_error',
              errorDetails: {
                slackError: result.error,
                channelRequested: channelNameOrId
              }
            };
          }
          
          const channelCount = result.channels?.length || 0;
          totalChannelsChecked += channelCount;
          console.log(`📋 Checked ${channelCount} channels (${totalChannelsChecked} total so far)`);
          
          // Log all channel names for debugging
          if (result.channels) {
            result.channels.forEach(c => {
              if (c.name) {
                allChannelNames.push(c.name);
              }
            });
          }
          
          // Search for channel by name (case-insensitive)
          const channel = result.channels?.find(c => 
            c.name?.toLowerCase() === channelNameOrId.toLowerCase()
          );
          
          if (channel?.id) {
            console.log(`✅ Found channel "${channelNameOrId}" with ID: ${channel.id}`);
            console.log(`   Channel is_member: ${channel.is_member}`);
            console.log(`   Channel is_private: ${channel.is_private}`);
            channelId = channel.id;
            break;
          }
          
          cursor = result.response_metadata?.next_cursor;
        } catch (error: any) {
          console.error(`❌ Error searching for channel "${channelNameOrId}":`, error);
          console.error(`   Error code: ${error?.data?.error}`);
          console.error(`   Error message: ${error?.message}`);
          console.error(`   Full error data:`, error?.data);
          
          if (error?.data?.error === 'invalid_auth') {
            console.error("🔐 CRITICAL: Invalid authentication token. The Slack token may be expired or invalid.");
            console.error(`   📋 Diagnostic Information:`);
            console.error(`   - Token prefix: ${token.substring(0, 10)}...`);
            console.error(`   - Token length: ${token.length} characters`);
            console.error(`   - Token starts with 'xoxb-': ${token.startsWith('xoxb-') ? 'YES' : 'NO'}`);
            console.error(`   - Channel requested: ${channelNameOrId}`);
            console.error(`   - Timestamp: ${new Date().toISOString()}`);
          } else if (error?.data?.error === 'missing_scope') {
            console.error("🔐 CRITICAL: Missing required OAuth scope. Check your bot token scopes.");
            console.error(`   📋 Diagnostic Information:`);
            console.error(`   - Scopes needed: ${error?.data?.needed || 'channels:read, groups:read, users:read, users:read.email'}`);
            console.error(`   - Scopes provided: ${error?.data?.provided || 'unknown'}`);
            console.error(`   - Channel requested: ${channelNameOrId}`);
            console.error(`   - Token prefix: ${token.substring(0, 10)}...`);
            console.error(`   - Timestamp: ${new Date().toISOString()}`);
          }
          
          // Return structured error instead of throwing
          const diagnosticInfo: any = {
            slackError: error?.data?.error,
            message: error?.message,
            channelRequested: channelNameOrId,
            tokenPrefix: token.substring(0, 10),
            tokenLength: token.length,
            tokenFormat: token.startsWith('xoxb-') ? 'valid_format' : 'invalid_format',
            timestamp: new Date().toISOString()
          };

          if (error?.data?.error === 'invalid_auth') {
            return {
              members: [],
              error: "CRITICAL: Invalid Slack authentication. The bot token is invalid, expired, or from wrong workspace.",
              errorCode: 'invalid_auth',
              errorDetails: {
                ...diagnosticInfo,
                message: "Authentication failed. This usually means the bot token is incorrect or expired.",
                solution: [
                  "1. Go to https://api.slack.com/apps and select your app",
                  "2. Navigate to 'OAuth & Permissions'",
                  "3. Copy the 'Bot User OAuth Token' (starts with xoxb-)",
                  "4. Update it in Settings → Integrations → Slack",
                  "5. Make sure you're using the token from the correct workspace"
                ],
                diagnostics: {
                  tokenValidation: {
                    hasCorrectPrefix: token.startsWith('xoxb-'),
                    lengthCheck: token.length > 50 ? 'normal' : 'too_short',
                    containsSpaces: token.includes(' ') ? 'yes_invalid' : 'no_valid'
                  }
                }
              }
            };
          } else if (error?.data?.error === 'missing_scope') {
            return {
              members: [],
              error: `CRITICAL: Missing required Slack permissions. Your app needs additional OAuth scopes.`,
              errorCode: 'missing_scope',
              errorDetails: {
                ...diagnosticInfo,
                needed: error?.data?.needed || 'channels:read, groups:read, users:read, users:read.email',
                provided: error?.data?.provided || 'unknown',
                message: "Your Slack app doesn't have the necessary permissions to list channels.",
                solution: [
                  "1. Go to https://api.slack.com/apps and select your app",
                  "2. Navigate to 'OAuth & Permissions'",
                  "3. Under 'Scopes', add these Bot Token Scopes:",
                  "   - channels:read (for public channels)",
                  "   - groups:read (for private channels)",
                  "   - users:read (for user information)",
                  "   - users:read.email (for user emails)",
                  "4. Click 'reinstall your app' to apply new permissions",
                  "5. Copy the new bot token and update it in Settings"
                ]
              }
            };
          } else {
            return {
              members: [],
              error: `Error searching for channel: ${error?.message || error?.data?.error || 'Unknown error'}`,
              errorCode: error?.data?.error || 'channel_search_error',
              errorDetails: {
                ...diagnosticInfo,
                message: "Failed to search for the channel in your Slack workspace.",
                solution: [
                  "1. Verify your bot token is correct",
                  "2. Check if the channel name is spelled correctly",
                  "3. Ensure the bot has been added to your workspace",
                  "4. Try reconnecting your Slack integration"
                ]
              }
            };
          }
        }
      } while (cursor);
      
      if (!channelId) {
        console.warn(`⚠️ Channel "${channelNameOrId}" not found. Cannot sync users.`);
        console.warn(`💡 Make sure the channel exists and the bot has access to it.`);
        console.log(`📝 Total channels the bot can see: ${allChannelNames.length}`);
        if (allChannelNames.length > 0) {
          console.log(`📝 Available channels: ${allChannelNames.slice(0, 20).join(', ')}${allChannelNames.length > 20 ? `... and ${allChannelNames.length - 20} more` : ''}`);
          
          // Check if channel exists with different spelling
          const similarChannels = allChannelNames.filter(name => 
            name.includes('whirk') || name.includes('pulse') || name.includes('general')
          );
          if (similarChannels.length > 0) {
            console.log(`💡 Similar channel names found: ${similarChannels.join(', ')}`);
          }
        } else {
          console.log(`❌ Bot cannot see ANY channels! This usually means:`);
          console.log(`   1. The bot hasn't been invited to any channels`);
          console.log(`   2. The bot token doesn't have proper permissions`);
          console.log(`   3. The workspace ID might be incorrect`);
        }
        console.log(`💡 Tips:`);
        console.log(`   1. Check if the channel name is spelled correctly (looking for: "${channelNameOrId}")`);
        console.log(`   2. Make sure the bot has been invited to the channel`);
        console.log(`   3. If it's a private channel, the bot needs to be a member`);
        
        // Check if channel exists with different spelling
        const similarChannels = allChannelNames.filter(name => 
          name.includes('whirk') || name.includes('pulse') || name.includes('general')
        );
        
        // Return structured error with helpful suggestions
        const availableChannelsMsg = allChannelNames.length > 0 
          ? `Bot can see ${allChannelNames.length} channels. Similar channels: ${similarChannels.join(', ') || 'none found'}` 
          : "Bot cannot see ANY channels - bot needs to be invited to channels first";
        
        return {
          members: [],
          error: `Channel "${channelNameOrId}" not found.`,
          errorCode: 'channel_not_found',
          errorDetails: {
            channelRequested: channelNameOrId,
            totalChannelsVisible: allChannelNames.length,
            availableChannels: availableChannelsMsg,
            suggestions: [
              `Ensure the channel name is spelled correctly (requested: "${channelNameOrId}")`,
              "Make sure the bot has been invited to the channel",
              "For private channels, the bot must be a member",
              "Check if you're using the correct workspace"
            ]
          }
        };
      }
    }

    // Fetch channel members
    console.log(`👥 Fetching members for channel ID: ${channelId}...`);
    let membersResult;
    try {
      membersResult = await slackClient.conversations.members({
        channel: channelId
      });
    } catch (error: any) {
      // Handle missing scope error gracefully
      if (error?.data?.error === 'missing_scope') {
        const errorMsg = `Missing Slack scope for channel "${channelNameOrId}".`;
        console.error(`❌ ${errorMsg}`);
        console.error(`📝 Required scopes: groups:read, channels:read`);
        console.error(`🔗 Visit your Slack app settings to update OAuth scopes.`);
        return {
          members: [],
          error: errorMsg,
          errorCode: 'missing_scope',
          errorDetails: {
            needed: error?.data?.needed || 'groups:read, channels:read',
            provided: error?.data?.provided,
            channelId: channelId,
            message: "Your Slack app needs the 'groups:read' and 'channels:read' scopes. Visit https://api.slack.com/apps to update permissions."
          }
        };
      }
      if (error?.data?.error === 'invalid_auth') {
        const errorMsg = "Invalid authentication token. The Slack token may be expired or invalid.";
        console.error("❌ " + errorMsg);
        return {
          members: [],
          error: errorMsg,
          errorCode: 'invalid_auth',
          errorDetails: {
            channelId: channelId,
            message: "Slack authentication failed. Please reconnect your Slack integration in Settings → Integrations → Slack.",
            slackError: error?.data?.error
          }
        };
      }
      const errorMsg = `Error fetching channel members: ${error?.message || error?.data?.error || 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      return {
        members: [],
        error: errorMsg,
        errorCode: error?.data?.error || 'members_fetch_error',
        errorDetails: {
          channelId: channelId,
          slackError: error?.data?.error,
          message: error?.message
        }
      };
    }

    if (!membersResult.members || membersResult.members.length === 0) {
      const warnMsg = `No members found in channel "${channelNameOrId}"`;
      console.warn(`⚠️ ${warnMsg}`);
      return {
        members: [],
        error: warnMsg,
        errorCode: 'no_members',
        errorDetails: {
          channelId: channelId,
          message: "The channel exists but has no members. Please ensure team members have joined the channel."
        }
      };
    }

    console.log(`📊 Found ${membersResult.members.length} members in channel`);

    // Get detailed user info for each member
    const userPromises = membersResult.members.map(async (memberId) => {
      try {
        const userInfo = await slackClient.users.info({ user: memberId });
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
        console.warn(`⚠️ Failed to fetch user info for ${memberId}:`, error);
        return null;
      }
    });

    const users = await Promise.all(userPromises);
    const validUsers = users.filter((user): user is NonNullable<typeof user> => user !== null);
    
    console.log(`✅ Successfully fetched ${validUsers.length} valid users from channel "${channelNameOrId}"`);
    return {
      members: validUsers,
      error: undefined,
      errorCode: undefined,
      errorDetails: undefined
    };
  } catch (error: any) {
    // Provide helpful error messages for common issues
    const errorCode = error?.data?.error || 'unknown_error';
    let errorMsg = '';
    let errorDetails: any = {
      slackError: error?.data?.error,
      message: error?.message,
      channelRequested: channelNameOrId
    };
    
    if (error?.data?.error === 'missing_scope') {
      errorMsg = "Missing required Slack permissions to fetch channel members.";
      console.error(`❌ ${errorMsg} Please ensure your Slack app has the following scopes:`);
      console.error("📝 Bot Token Scopes:");
      console.error("  - channels:read (for accessing public channels)");
      console.error("  - groups:read (for accessing private channels)");  
      console.error("  - users:read (for fetching user information)");
      console.error("🔗 Visit https://api.slack.com/apps to update scopes.");
      errorDetails.needed = error?.data?.needed;
      errorDetails.provided = error?.data?.provided;
      errorDetails.helpMessage = "Update your Slack app permissions at https://api.slack.com/apps";
    } else if (error?.data?.error === 'invalid_auth') {
      errorMsg = "Slack authentication failed. The token may be expired or invalid.";
      console.error(`❌ ${errorMsg}`);
      errorDetails.helpMessage = "Please reconnect your Slack integration in Settings → Integrations → Slack.";
    } else {
      errorMsg = `Failed to fetch channel members: ${error?.message || error?.data?.error || 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      errorDetails.fullError = error;
    }
    
    return {
      members: [],
      error: errorMsg,
      errorCode: errorCode,
      errorDetails: errorDetails
    };
  }
}

/**
 * Sync users based on Slack channel membership
 * This function should be called periodically or on channel events
 */
export async function syncUsersFromSlack(organizationId: string, storage: any, botToken?: string, channelNameOrId: string = WHIRKPLACE_CHANNEL): Promise<{
  created: number;
  activated: number;
  deactivated: number;
  error?: string;
  errorCode?: string;
  errorDetails?: any;
  newUsersOnboarded?: number;
  onboardingErrors?: number;
}> {
  console.log(`🚀 Starting user sync for organization ${organizationId}...`);
  console.log(`📺 Channel name/ID: "${channelNameOrId}"`);
  console.log(`🔑 Using ${botToken ? 'organization-specific token' : 'environment token'}`);
  
  try {
    const channelResult = await getChannelMembers(botToken, channelNameOrId);
    
    // Check if there was an error fetching channel members
    if (channelResult.error) {
      console.warn(`⚠️ Error fetching channel members: ${channelResult.error}`);
      return { 
        created: 0, 
        activated: 0, 
        deactivated: 0, 
        error: channelResult.error,
        errorCode: channelResult.errorCode,
        errorDetails: channelResult.errorDetails
      };
    }
    
    const channelMembers = channelResult.members || [];
    if (channelMembers.length === 0) {
      console.warn("⚠️ No channel members found. Skipping user sync.");
      return { 
        created: 0, 
        activated: 0, 
        deactivated: 0, 
        error: `No members found in channel "${channelNameOrId}". Please ensure the channel exists and the bot has access to it.`,
        errorCode: 'no_members',
        errorDetails: {
          channelRequested: channelNameOrId,
          message: "The channel exists but has no members, or the bot cannot access member information."
        }
      };
    }

    console.log(`✅ Found ${channelMembers.length} channel members to process`);

    // Get organization details for the organization name
    const organization = await storage.getOrganization(organizationId);
    const organizationName = organization?.name || 'Your Organization';

    const existingUsers = await storage.getAllUsers(organizationId, true); // Include inactive users for sync comparison
    const stats = { created: 0, activated: 0, deactivated: 0, newUsersOnboarded: 0, onboardingErrors: 0 };

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

  // Track newly created users for onboarding
  const newlyCreatedUsers: Array<{
    slackUserId: string;
    email: string;
    tempPassword: string;
    name: string;
  }> = [];

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
      // New user - create them with a temporary password
      try {
        // Generate temporary password for the new user
        const tempPassword = generateTemporaryPassword();
        
        // Hash the password before storing
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        
        const userEmail = member.email || `${member.id}@slack.local`;
        
        const newUser = await storage.createUser(organizationId, {
          username: member.email?.split('@')[0] || member.name?.toLowerCase().replace(/\s+/g, '.') || member.id,
          password: hashedPassword,
          name: member.name,
          email: userEmail,
          role: 'member',
          isActive: true,
          slackUserId: member.id
        });
        
        stats.created++;
        console.log(`Created new user: ${member.name} (${member.id})`);
        
        // Track for onboarding
        newlyCreatedUsers.push({
          slackUserId: member.id,
          email: userEmail,
          tempPassword: tempPassword,
          name: member.name
        });
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

  // Send onboarding DMs to newly created users
  if (newlyCreatedUsers.length > 0) {
    console.log(`📨 Sending onboarding DMs to ${newlyCreatedUsers.length} newly created users...`);
    
    for (const newUser of newlyCreatedUsers) {
      try {
        // Add a small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const result = await sendOnboardingDM(
          newUser.slackUserId,
          newUser.email,
          newUser.tempPassword,
          organizationName,
          newUser.name,
          botToken
        );
        
        if (result.success) {
          stats.newUsersOnboarded++;
          console.log(`✅ Onboarding DM sent to ${newUser.name} (${newUser.email})`);
        } else {
          stats.onboardingErrors++;
          console.error(`❌ Failed to send onboarding DM to ${newUser.name}: ${result.error}`);
        }
      } catch (error: any) {
        stats.onboardingErrors++;
        console.error(`❌ Error sending onboarding DM to ${newUser.name}:`, error?.message || error);
      }
    }
    
    console.log(`📨 Onboarding complete: ${stats.newUsersOnboarded} sent, ${stats.onboardingErrors} errors`);
  }

    console.log(`✅ User sync completed for organization ${organizationId}:`, stats);
    return { ...stats, error: undefined, errorCode: undefined, errorDetails: undefined };
  } catch (error: any) {
    console.error(`❌ Error during user sync for organization ${organizationId}:`, error);
    const errorMessage = error?.message || 'Unknown error during sync';
    return {
      created: 0,
      activated: 0,
      deactivated: 0,
      error: errorMessage,
      errorCode: 'sync_error',
      errorDetails: {
        organizationId: organizationId,
        channelRequested: channelNameOrId,
        fullError: error,
        message: errorMessage
      }
    };
  }
}

/**
 * Enhanced handler for Slack channel membership events with onboarding
 */
export async function handleChannelMembershipEvent(
  event: { type: string; user: string; channel: string },
  organizationId: string,
  storage: any
): Promise<void> {
  if (event.type === 'member_joined_channel') {
    console.log(`User ${event.user} joined channel. Triggering user sync and onboarding...`);
    
    try {
      // Get organization details
      const organization = await storage.getOrganizationById(organizationId);
      
      // Get user info from Slack
      if (slack && event.user) {
        const userInfo = await slack.users.info({ user: event.user });
        
        if (userInfo.ok && userInfo.user) {
          const user = userInfo.user;
          const userName = user.real_name || user.name || 'New Team Member';
          
          // Send welcome message to the new user
          await sendWelcomeMessage(
            event.user, 
            userName, 
            event.channel,
            organization?.name
          );
          
          // Send quick start guide after a 30-second delay
          setTimeout(async () => {
            await sendQuickStartGuide(event.user, userName);
          }, 30000);
          
          console.log(`Onboarding sequence initiated for ${userName} (${event.user})`);
        }
      }
      
      // Sync users when someone joins the channel
      await syncUsersFromSlack(organizationId, storage);
      
    } catch (error) {
      console.error('Error handling member joined event:', error);
      // Still sync users even if onboarding fails
      await syncUsersFromSlack(organizationId, storage);
    }
  } else if (event.type === 'member_left_channel') {
    console.log(`User ${event.user} left channel. Triggering user sync...`);
    await syncUsersFromSlack(organizationId, storage);
  }
}

/**
 * Weekly reminder scheduler - Call this function via cron job or scheduler at 9:05 AM
 */
export async function scheduleWeeklyReminders(organizationId: string, storage: any) {
  if (!slack) {
    console.log('Slack not configured - skipping weekly reminders');
    return { remindersSent: 0, errors: 0, totalUsers: 0 };
  }

  try {
    console.log(`Running weekly check-in reminders for organization ${organizationId}`);
    
    // Get all active users
    const users = await storage.getAllUsers(organizationId, false); // Pass includeInactive=false
    const activeUsers = users.filter((user: any) => user.isActive && user.slackUserId);
    
    // Get current week check-ins to see who hasn't completed theirs
    const currentWeekStart = new Date();
    currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay()); // Start of week (Sunday)
    currentWeekStart.setHours(0, 0, 0, 0);
    
    // Get active questions for preview
    const questions = await storage.getActiveQuestions(organizationId);
    
    let remindersSent = 0;
    let errors = 0;
    
    for (const user of activeUsers) {
      try {
        // Check if user has completed this week's check-in
        const currentCheckin = await storage.getCurrentWeekCheckin(organizationId, user.id);
        
        if (!currentCheckin || !currentCheckin.isComplete) {
          // Send personalized reminder
          await sendPersonalizedCheckinReminder(
            user.slackUserId,
            user.name || user.slackDisplayName || 'Team Member',
            questions,
            true // isWeeklyScheduled
          );
          
          remindersSent++;
          
          // Add small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (userError) {
        console.error(`Error sending reminder to user ${user.name}:`, userError);
        errors++;
      }
    }
    
    console.log(`Weekly reminders completed: ${remindersSent} sent, ${errors} errors`);
    return { remindersSent, errors, totalUsers: activeUsers.length };
    
  } catch (error) {
    console.error('Error in weekly reminder scheduler:', error);
    throw error;
  }
}

/**
 * Handle Slack interactive components (buttons, modals, etc.)
 */
/**
 * Handle Slack slash commands like /checkin
 */
export async function handleSlackSlashCommand(
  command: string,
  text: string,
  userId: string,
  userName: string,
  triggerId: string,
  organizationId: string,
  storage: any
): Promise<any> {
  try {
    switch (command) {
      case '/checkin':
        // Open the interactive check-in modal
        if (triggerId) {
          await sendInteractiveCheckinModal(userId, triggerId, userName);
          return {
            text: "Opening your check-in form...",
            response_type: "ephemeral"
          };
        } else {
          return {
            text: "Sorry, I can't open the check-in form right now. Please try again.",
            response_type: "ephemeral"
          };
        }
      
      case '/checkin-status':
        // Show the user's current check-in status
        try {
          const user = await storage.getUserBySlackId(organizationId, userId);
          if (!user) {
            return {
              text: "You're not registered in the system yet. Please complete a check-in first to get started.",
              response_type: "ephemeral"
            };
          }
          
          // Get current week's check-in
          const currentWeekStart = new Date();
          currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
          currentWeekStart.setHours(0, 0, 0, 0);
          
          const checkins = await storage.getCheckins(organizationId, user.id, currentWeekStart, currentWeekStart);
          const hasCheckedIn = checkins.length > 0;
          
          if (hasCheckedIn) {
            const checkin = checkins[0];
            return {
              text: `✅ You've completed your check-in for this week! (Mood: ${checkin.overallMood}/5, Status: ${checkin.reviewStatus})`,
              response_type: "ephemeral"
            };
          } else {
            return {
              text: "❌ You haven't completed your check-in for this week yet. Use `/checkin` to get started!",
              response_type: "ephemeral"
            };
          }
        } catch (error) {
          console.error('Error checking checkin status:', error);
          return {
            text: "Sorry, I couldn't check your status right now. Please try again later.",
            response_type: "ephemeral"
          };
        }
      
      case '/help':
      case '/checkin-help':
        return {
          text: `*Whirkplace Check-in Commands:*
• \`/checkin\` - Start your weekly check-in
• \`/checkin-status\` - Check if you've completed this week's check-in
• \`/checkin-help\` or \`/help\` - Show this help message

Your check-ins help keep the team connected and ensure everyone is thriving! 🌟`,
          response_type: "ephemeral"
        };
      
      default:
        return {
          text: `Unknown command: ${command}. Try \`/checkin-help\` for available commands.`,
          response_type: "ephemeral"
        };
    }
  } catch (error) {
    console.error('Error handling Slack slash command:', error);
    return {
      text: "Sorry, there was an error processing your command. Please try again.",
      response_type: "ephemeral"
    };
  }
}

export async function handleSlackInteraction(payload: any, organizationId: string, storage: any) {
  try {
    const { type, user, actions, trigger_id, view, response_url } = payload;
    
    if (type === 'block_actions' && actions) {
      const action = actions[0];
      
      switch (action.action_id) {
        case 'open_checkin_modal':
          // Open interactive check-in modal
          if (trigger_id) {
            await sendInteractiveCheckinModal(
              user.id,
              trigger_id,
              user.name || 'Team Member'
            );
          }
          break;
          
        case 'remind_later':
          // Handle remind later button
          const hours = action.value === 'remind_4hours' ? 4 : 24;
          await scheduleReminderLater(user.id, user.name, hours, organizationId, storage);
          
          // Update the message to show reminder scheduled
          if (response_url) {
            await fetch(response_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: `✅ Got it! I'll remind you again in ${hours} hours.`,
                response_type: 'ephemeral'
              })
            });
          }
          break;
          
        default:
          console.log(`Unhandled action: ${action.action_id}`);
      }
    } else if (type === 'view_submission' && view) {
      // Handle modal submission
      if (view.callback_id === 'checkin_modal') {
        await handleCheckinModalSubmission(view, user, organizationId, storage);
      }
    }
    
  } catch (error) {
    console.error('Error handling Slack interaction:', error);
  }
}

/**
 * Handle check-in modal submission
 */
async function handleCheckinModalSubmission(view: any, user: any, organizationId: string, storage: any) {
  try {
    const values = view.state.values;
    
    // Extract form values
    const moodRating = values.mood_rating?.mood_value?.selected_option?.value;
    const accomplishments = values.accomplishments?.accomplishments_value?.value || '';
    const challenges = values.challenges?.challenges_value?.value || '';
    
    if (!moodRating) {
      console.error('Mood rating not provided in check-in submission');
      return;
    }
    
    // Find or create user in the system
    let systemUser;
    try {
      systemUser = await storage.getUserBySlackId(organizationId, user.id);
    } catch (error) {
      console.log(`User not found in system, checking by email...`);
    }
    
    if (!systemUser) {
      console.log(`Creating new user from Slack submission: ${user.name}`);
      // Create basic user record
      const userData = {
        username: user.username || user.id,
        password: randomBytes(32).toString('hex'), // Random password for Slack users
        name: user.real_name || user.name || 'Slack User',
        email: user.profile?.email || `${user.id}@slack.local`,
        role: 'member',
        organizationId: organizationId,
        slackUserId: user.id,
        slackUsername: user.username || user.id,
        slackDisplayName: user.real_name || user.name,
        slackEmail: user.profile?.email,
        authProvider: 'slack' as const
      };
      
      systemUser = await storage.createUser(organizationId, userData);
    }
    
    // Create check-in entry
    const currentWeekStart = new Date();
    currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
    currentWeekStart.setHours(0, 0, 0, 0);
    
    const checkinData = {
      userId: systemUser.id,
      organizationId: organizationId,
      weekOf: currentWeekStart,
      overallMood: parseInt(moodRating),
      responses: {
        accomplishments: accomplishments,
        challenges: challenges,
        submitted_via: 'slack'
      },
      isComplete: true
    };
    
    await storage.createCheckin(organizationId, checkinData);
    
    // Send confirmation message
    const dmResult = await slack!.conversations.open({ users: user.id });
    if (dmResult.ok && dmResult.channel?.id) {
      await sendSlackMessage({
        channel: dmResult.channel.id,
        text: `✅ Check-in submitted successfully! Thanks for sharing your update, ${user.real_name || user.name}! 🙏`,
        blocks: [
          {
            type: 'section' as const,
            text: {
              type: 'mrkdwn' as const,
              text: `✅ *Check-in Submitted Successfully!*`
            }
          },
          {
            type: 'section' as const,
            text: {
              type: 'mrkdwn' as const,
              text: `Thanks for sharing your weekly update, ${user.real_name || user.name}! Your team leader will review your check-in soon.`
            }
          },
          {
            type: 'context' as const,
            elements: [
              {
                type: 'mrkdwn' as const,
                text: `Mood: ${moodRating}/5 | Submitted via Slack | ${new Date().toLocaleDateString()}`
              }
            ]
          }
        ]
      });
    }
    
    console.log(`Check-in submitted via Slack by ${user.name} (mood: ${moodRating}/5)`);
    
  } catch (error) {
    console.error('Error processing check-in modal submission:', error);
  }
}

/**
 * Schedule a reminder for later
 */
async function scheduleReminderLater(userId: string, userName: string, hours: number, organizationId: string, storage: any) {
  // In a production environment, you'd use a proper job scheduler like Bull, Agenda, or AWS SQS
  // For now, we'll use setTimeout (note: this won't persist across server restarts)
  setTimeout(async () => {
    try {
      const questions = await storage.getActiveQuestions(organizationId);
      await sendPersonalizedCheckinReminder(
        userId,
        userName,
        questions,
        false // Not weekly scheduled
      );
      console.log(`Delayed reminder sent to ${userName} after ${hours} hours`);
    } catch (error) {
      console.error(`Error sending delayed reminder to ${userName}:`, error);
    }
  }, hours * 60 * 60 * 1000); // Convert hours to milliseconds
  
  console.log(`Scheduled reminder for ${userName} in ${hours} hours`);
}

/**
 * Initialize weekly reminder scheduler - Call this on server startup
 * Schedules automatic reminders every Monday at 9:05 AM using node-cron
 */
export function initializeWeeklyReminderScheduler(storage: any) {
  console.log('Initializing weekly reminder scheduler for all organizations...');
  
  // Schedule weekly reminders using cron: '5 9 * * 1' = Every Monday at 9:05 AM
  // Format: minute hour day month day-of-week
  const cronTask = cron.schedule('5 9 * * 1', async () => {
    try {
      console.log('Running scheduled weekly reminders for all organizations...');
      
      // Get all organizations and send reminders for each
      const organizations = await storage.getAllOrganizations();
      
      for (const org of organizations) {
        try {
          const result = await scheduleWeeklyReminders(org.id, storage);
          console.log(`Weekly reminders for ${org.name}: ${result.remindersSent} sent, ${result.errors} errors`);
        } catch (orgError) {
          console.error(`Failed to send weekly reminders for organization ${org.name}:`, orgError);
        }
      }
      
      console.log('Weekly reminders completed for all organizations');
    } catch (error) {
      console.error('Error in weekly reminder scheduler:', error);
    }
  }, {
    timezone: "America/Chicago" // Central Time for 9:05 AM CT
  });
  
  console.log('✅ Weekly reminder cron job scheduled for every Monday at 9:05 AM CT');
  
  // Optional: Also run a test reminder shortly after startup for development
  if (process.env.NODE_ENV === 'development') {
    // Schedule a test reminder 30 seconds after startup
    setTimeout(async () => {
      try {
        console.log('Running development test reminder...');
        const organizations = await storage.getAllOrganizations();
        
        if (organizations.length > 0) {
          const result = await scheduleWeeklyReminders(organizations[0].id, storage);
          console.log(`Development test reminder: ${result.remindersSent} sent, ${result.errors} errors`);
        }
      } catch (error) {
        console.error('Development test reminder failed:', error);
      }
    }, 30000); // 30 seconds
  }
  
  return cronTask;
}

/**
 * Manual trigger for testing weekly reminders (for development/testing)
 */
export async function triggerTestWeeklyReminders(organizationId: string, storage: any) {
  console.log(`Manual test trigger for weekly reminders - Organization: ${organizationId}`);
  
  try {
    const result = await scheduleWeeklyReminders(organizationId, storage);
    console.log('Test weekly reminders completed:', result);
    return result;
  } catch (error) {
    console.error('Error in test weekly reminders:', error);
    throw error;
  }
}

/**
 * Get reminder status and stats for monitoring
 */
export async function getWeeklyReminderStats(organizationId: string, storage: any) {
  try {
    const users = await storage.getAllUsers(organizationId, true); // Include inactive users for stats
    const activeUsers = users.filter((user: any) => user.isActive);
    const slackUsers = activeUsers.filter((user: any) => user.slackUserId);
    
    // Check current week completion
    const currentWeekStart = new Date();
    currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
    currentWeekStart.setHours(0, 0, 0, 0);
    
    let completedCount = 0;
    const pendingUsers: any[] = [];
    
    for (const user of slackUsers) {
      try {
        const currentCheckin = await storage.getCurrentWeekCheckin(organizationId, user.id);
        if (currentCheckin && currentCheckin.isComplete) {
          completedCount++;
        } else {
          pendingUsers.push({
            id: user.id,
            name: user.name,
            slackUserId: user.slackUserId
          });
        }
      } catch (error) {
        console.error(`Error checking checkin for user ${user.name}:`, error);
      }
    }
    
    return {
      totalActiveUsers: activeUsers.length,
      slackIntegratedUsers: slackUsers.length,
      completedCheckinsThisWeek: completedCount,
      pendingCheckinsThisWeek: pendingUsers.length,
      completionRate: slackUsers.length > 0 ? Math.round((completedCount / slackUsers.length) * 100) : 0,
      pendingUsers: pendingUsers,
      weekStart: currentWeekStart.toISOString()
    };
  } catch (error) {
    console.error('Error getting weekly reminder stats:', error);
    throw error;
  }
}
