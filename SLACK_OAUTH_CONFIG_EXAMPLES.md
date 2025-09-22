# Slack OAuth Configuration Examples

## Environment Variables Template

Create these environment variables in your deployment environment:

```bash
# Required OAuth Credentials (from Slack App settings)
SLACK_CLIENT_ID=111.222333444
SLACK_CLIENT_SECRET=1234567890abcdefghijklmnopqrstuv
SLACK_SIGNING_SECRET=abcdefghij1234567890klmnopqrstuv

# OAuth Flow Configuration
SLACK_REDIRECT_URI=https://yourapp.replit.app/auth/slack/callback
SLACK_OAUTH_STATE_SECRET=your-random-secret-for-csrf-protection

# Existing Bot Configuration (keep these)
SLACK_BOT_TOKEN=xoxb-existing-bot-token-here
SLACK_CHANNEL_ID=C1234567890
SLACK_PRIVATE_CHANNEL_ID=C0987654321
```

## Slack App Configuration Checklist

### 1. Basic Information
- **App Name**: Whirkplace Authentication
- **Short Description**: Team wellness and check-in platform with Slack integration
- **App Icon**: Upload your app logo
- **Background Color**: Match your brand colors

### 2. OAuth & Permissions

#### Redirect URLs
```
https://yourapp.replit.app/auth/slack/callback
https://yourapp-dev.replit.app/auth/slack/callback  # for staging
```

#### Bot Token Scopes
```
channels:read
chat:write
users:read
groups:read
incoming-webhook
```

#### User Token Scopes
```
openid
profile
email
identity.basic
identity.team
```

### 3. App Manifest Example

```yaml
display_information:
  name: Whirkplace
  description: Team wellness and check-in platform
  background_color: "#2c3e50"
features:
  app_home:
    home_tab_enabled: true
    messages_tab_enabled: false
  bot_user:
    display_name: Whirkplace Bot
    always_online: true
oauth_config:
  redirect_urls:
    - https://yourapp.replit.app/auth/slack/callback
  scopes:
    bot:
      - channels:read
      - chat:write
      - users:read
      - groups:read
      - incoming-webhook
    user:
      - openid
      - profile
      - email
      - identity.basic
      - identity.team
settings:
  interactivity:
    is_enabled: false
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

## Integration Code Snippets

### OAuth Endpoint Example (Express.js)

```javascript
// GET /auth/slack - Start OAuth flow
app.get('/auth/slack', requireOrganization(), (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  
  // Store state with organization context
  req.session.slackOAuthState = state;
  req.session.orgId = req.orgId;
  
  const scopes = [
    'openid',
    'profile', 
    'email',
    'identity.basic',
    'identity.team'
  ].join(',');
  
  const authUrl = `https://slack.com/oauth/v2/authorize?` +
    `client_id=${process.env.SLACK_CLIENT_ID}&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `state=${state}&` +
    `redirect_uri=${encodeURIComponent(process.env.SLACK_REDIRECT_URI)}`;
    
  res.redirect(authUrl);
});

// GET /auth/slack/callback - Handle OAuth callback
app.get('/auth/slack/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  // Validate state parameter
  if (state !== req.session.slackOAuthState) {
    return res.status(400).json({ error: 'Invalid state parameter' });
  }
  
  if (error) {
    return res.status(400).json({ error: `Slack OAuth error: ${error}` });
  }
  
  try {
    // Exchange code for token
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: process.env.SLACK_REDIRECT_URI
      })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenData.ok) {
      throw new Error(`Token exchange failed: ${tokenData.error}`);
    }
    
    // Get user identity
    const userResponse = await fetch('https://slack.com/api/users.identity', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });
    
    const userData = await userResponse.json();
    
    if (!userData.ok) {
      throw new Error(`User identity failed: ${userData.error}`);
    }
    
    // Create or update user
    const user = await createOrUpdateSlackUser(
      req.session.orgId,
      userData.user,
      userData.team,
      tokenData.access_token
    );
    
    // Set session
    req.session.userId = user.id;
    req.session.slackOAuthState = null; // Clear state
    
    res.redirect('/#/dashboard');
    
  } catch (error) {
    console.error('Slack OAuth error:', error);
    res.status(500).json({ error: 'OAuth process failed' });
  }
});
```

### User Creation Function Example

```javascript
async function createOrUpdateSlackUser(orgId, slackUser, slackTeam, accessToken) {
  // Check if user already exists
  let user = await storage.getUserBySlackId(orgId, slackUser.id);
  
  if (user) {
    // Update existing user
    return await storage.updateUser(orgId, user.id, {
      slackDisplayName: slackUser.name,
      slackAvatar: slackUser.image_72,
      slackAccessToken: encrypt(accessToken), // Remember to encrypt!
      slackEmail: slackUser.email
    });
  } else {
    // Create new user
    return await storage.createUser(orgId, {
      username: slackUser.email.split('@')[0], // Generate from email
      password: crypto.randomBytes(32).toString('hex'), // Random password
      name: slackUser.real_name || slackUser.name,
      email: slackUser.email,
      role: 'member',
      organizationId: orgId,
      slackUserId: slackUser.id,
      slackTeamId: slackTeam.id,
      slackEmail: slackUser.email,
      slackDisplayName: slackUser.name,
      slackAvatar: slackUser.image_72,
      slackAccessToken: encrypt(accessToken),
      authProvider: 'slack'
    });
  }
}
```

## Frontend Integration

### Login Button Component

```tsx
// components/auth/SlackLoginButton.tsx
import { Button } from '@/components/ui/button';

export function SlackLoginButton() {
  const handleSlackLogin = () => {
    window.location.href = '/auth/slack';
  };

  return (
    <Button 
      onClick={handleSlackLogin}
      className="w-full bg-[#4A154B] hover:bg-[#3c0e40] text-white"
      data-testid="button-slack-login"
    >
      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
        {/* Slack logo SVG path */}
      </svg>
      Continue with Slack
    </Button>
  );
}
```

## Testing Configuration

### Development Environment
```bash
# Use ngrok for local HTTPS testing
ngrok http 3000

# Update your Slack app redirect URL to:
# https://abc123.ngrok.io/auth/slack/callback

# Set environment variable:
SLACK_REDIRECT_URI=https://abc123.ngrok.io/auth/slack/callback
```

### Production Deployment
```bash
# Replit deployment
SLACK_REDIRECT_URI=https://yourapp.replit.app/auth/slack/callback

# Custom domain
SLACK_REDIRECT_URI=https://app.yourcompany.com/auth/slack/callback
```

## Troubleshooting

### Common Issues

1. **Invalid Redirect URI**
   - Ensure URL exactly matches what's configured in Slack app
   - Must use HTTPS in production
   - No trailing slash

2. **Invalid State Parameter**
   - Check session storage is working
   - Verify state generation and validation logic
   - Consider Redis for distributed sessions

3. **Token Exchange Failures**
   - Verify client ID and secret are correct
   - Check that code hasn't expired (10 minutes max)
   - Ensure redirect URI matches exactly

4. **Scope Permission Issues**
   - User must approve all requested scopes
   - Some scopes require workspace admin approval
   - Use incremental authorization when possible

### Monitoring Commands

```bash
# Check Slack API responses
curl -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  https://slack.com/api/auth.test

# Verify user identity endpoint
curl -H "Authorization: Bearer $USER_TOKEN" \
  https://slack.com/api/users.identity
```

This configuration guide provides all the necessary examples and setup instructions for implementing Slack OAuth authentication in Whirkplace.