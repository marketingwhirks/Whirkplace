# Slack Integration Setup Guide for Whirkplace

## Overview
This guide will help you set up Slack integration for your Whirkplace organization, enabling direct messages (DMs) for user notifications, reminders, and check-ins.

## Required Bot Token Scopes
When setting up your Slack app, you need to add the following Bot Token OAuth Scopes:

### Essential Scopes for DM Functionality
- `chat:write` - Send messages to users
- `im:write` - Send direct messages to users  
- `im:read` - Read direct message conversations
- `users:read` - View people in the workspace
- `users:read.email` - View email addresses of people in the workspace

### Additional Scopes for Full Functionality
- `channels:read` - View basic information about public channels in the workspace
- `team:read` - View the workspace's name, domain, and icon
- `app_mentions:read` - View messages that mention the bot
- `commands` - Add shortcuts and slash commands

## Setup Instructions

### Step 1: Create a Slack App
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App"
3. Choose "From scratch"
4. Enter an App Name (e.g., "Whirkplace Bot")
5. Select your workspace

### Step 2: Configure OAuth & Permissions
1. In your app's settings, navigate to "OAuth & Permissions"
2. Under "Bot Token Scopes", add all the required scopes listed above
3. Under "Redirect URLs", add:
   - `https://whirkplace.com/api/auth/slack/callback`
   - `http://localhost:5000/api/auth/slack/callback` (for local development)

### Step 3: Get Your Credentials
1. Navigate to "Basic Information" in your app settings
2. Copy your:
   - **Client ID**
   - **Client Secret**
   - **Signing Secret**

### Step 4: Install the App
1. Go to "OAuth & Permissions"
2. Click "Install to Workspace"
3. Review permissions and authorize
4. Copy the **Bot User OAuth Token**

### Step 5: Configure in Whirkplace
1. Log in to Whirkplace as an admin
2. Go to Settings → Integrations
3. Find the Slack integration section
4. Enter your:
   - Bot Token
   - Client ID (optional, for OAuth)
   - Client Secret (optional, for OAuth)
5. Click "Test Connection"
6. You should see your organization name and workspace confirmed

## Features Enabled

### Direct Message Notifications
- **Welcome Messages**: New users receive a personalized welcome DM when they join
- **Check-in Reminders**: Weekly reminders sent directly to users via DM
- **Review Notifications**: Managers receive DMs when team members submit check-ins
- **One-on-One Reminders**: Meeting reminders sent via DM

### User Sync
- Users' Slack IDs are automatically synced when they connect their accounts
- The system maps Whirkplace users to their Slack profiles

### Slash Commands (Optional)
- `/checkin` - Start your weekly check-in
- `/checkin-status` - Check your current week's status
- `/checkin-help` - Get help with check-in commands

## Troubleshooting

### Organization Shows as "Undefined"
This has been fixed in the latest version. If you still see this:
1. Clear your browser cache
2. Re-test the connection
3. Ensure your bot token has the correct permissions

### DMs Not Being Received
1. Verify the user has a Slack user ID in the database
2. Check that `im:write` scope is added to your bot
3. Ensure the user hasn't blocked the bot in Slack
4. Check the bot has been added to the workspace

### Users Not Being Synced
1. Ensure `users:read` and `users:read.email` scopes are added
2. Check that users have logged in via Slack OAuth or
3. Manually sync users from Settings → Integrations → Sync Users

## Best Practices

1. **Test in Development First**: Use a test workspace before deploying to production
2. **Monitor Bot Activity**: Check Slack's app activity logs regularly
3. **Rate Limits**: The bot respects Slack's rate limits (1 message per second per channel)
4. **Privacy**: DMs are only sent for work-related notifications and reminders

## Support

For issues or questions about Slack integration:
- Contact your Whirkplace administrator
- Check the [Slack API documentation](https://api.slack.com/docs)
- Review the application logs for error messages

## Security Notes

- Never share your Bot Token or Client Secret
- Rotate credentials regularly
- Use environment variables to store sensitive tokens
- Enable 2FA on your Slack workspace admin account