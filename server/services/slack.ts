import { WebClient, type ChatPostMessageArguments } from "@slack/web-api";

if (!process.env.SLACK_BOT_TOKEN) {
  console.warn("SLACK_BOT_TOKEN environment variable not set. Slack integration will be disabled.");
}

if (!process.env.SLACK_CHANNEL_ID) {
  console.warn("SLACK_CHANNEL_ID environment variable not set. Using default channel.");
}

const slack = process.env.SLACK_BOT_TOKEN ? new WebClient(process.env.SLACK_BOT_TOKEN) : null;

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

  const channel = process.env.SLACK_CHANNEL_ID || '#general';
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

  const channel = process.env.SLACK_CHANNEL_ID || '#general';
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
 * Send team health update to Slack
 */
export async function sendTeamHealthUpdate(averageRating: number, completionRate: number, totalWins: number) {
  if (!slack) return;

  const channel = process.env.SLACK_CHANNEL_ID || '#general';
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
