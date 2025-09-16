import { WebClient, type ChatPostMessageArguments } from "@slack/web-api";
import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import * as cron from "node-cron";

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
  for (const [state, data] of Array.from(oauthStates.entries())) {
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

  // Add call-to-action buttons
  reminderBlocks.push({
    type: 'actions' as const,
    elements: [
      {
        type: 'button' as const,
        text: {
          type: 'plain_text' as const,
          text: '🚀 Quick Check-in'
        },
        action_id: 'open_checkin_modal',
        value: 'quick_checkin',
        style: 'primary' as const
      },
      {
        type: 'button' as const,
        text: {
          type: 'plain_text' as const,
          text: '📊 Full Check-in'
        },
        url: checkinUrl
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

export async function getChannelMembers(): Promise<{ id: string; name: string; email?: string; active: boolean }[]> {
  if (!slack) {
    console.warn("Slack client not initialized. Cannot fetch channel members.");
    return [];
  }

  try {
    // Use environment override if set, otherwise search by name
    let channelId = process.env.SLACK_USER_SYNC_CHANNEL_ID;
    if (!channelId) {
      channelId = await findChannelIdByName(WHIRKPLACE_CHANNEL) ?? undefined;
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
    const users = await storage.getAllUsers(organizationId);
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
    const users = await storage.getAllUsers(organizationId);
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
