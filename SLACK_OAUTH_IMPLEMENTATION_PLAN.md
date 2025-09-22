# Slack OAuth Implementation Plan for Whirkplace

## Overview
This document outlines the complete implementation strategy for integrating Slack OAuth 2.0 authentication into Whirkplace, enabling users to sign in with their Slack accounts while maintaining the existing multi-tenant architecture and authentication system.

## Current System Analysis

### Existing Slack Integration
- **Current Setup**: Bot-based integration using `@slack/web-api` WebClient
- **Environment Variables**: `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `SLACK_PRIVATE_CHANNEL_ID`
- **Functionality**: 
  - Send check-in reminders
  - Announce wins and shoutouts  
  - Team health updates
  - Check-in review notifications

### Current Authentication System
- **Development Mode**: Hardcoded demo user (`demo-user@example.com`)
- **Production Mode**: Placeholder requiring JWT/session implementation
- **Multi-tenant**: Organization-based data isolation via `req.orgId`
- **User Schema**: Username/password based with roles (member, admin, manager)

## Slack OAuth 2.0 Configuration Plan

### 1. Slack App Setup Requirements

#### App Configuration (api.slack.com/apps)
1. **App Type**: Standard Slack App (not legacy)
2. **OAuth Version**: OAuth 2.0 v2 (modern flow)
3. **App Distribution**: Workspace-level installation

#### Required OAuth Scopes

**Bot Token Scopes** (for existing bot functionality):
```
channels:read        # List public channels
chat:write          # Send messages as bot  
users:read          # Access user directory
groups:read         # Access private channels
incoming-webhook    # Post via webhooks
```

**User Token Scopes** (for authentication):
```
openid              # Required for OpenID Connect
profile             # User name, avatar, team info
email               # User email address
identity.basic      # Basic user identity (legacy fallback)
identity.team       # Team/workspace information
```

#### Redirect URLs Configuration
- **Production**: `https://yourdomain.com/auth/slack/callback`
- **Development**: Use ngrok or similar: `https://abc123.ngrok.io/auth/slack/callback`
- **Local Testing**: `https://localhost:3000/auth/slack/callback` (requires HTTPS)

### 2. Environment Variables

#### New Required Variables
```bash
# OAuth Credentials
SLACK_CLIENT_ID=111.222333444
SLACK_CLIENT_SECRET=your_client_secret_here_32_chars
SLACK_SIGNING_SECRET=your_signing_secret_here

# OAuth Configuration  
SLACK_REDIRECT_URI=https://yourdomain.com/auth/slack/callback
SLACK_OAUTH_STATE_SECRET=random_secret_for_csrf_protection

# Optional: Override default URLs
SLACK_AUTHORIZATION_URL=https://slack.com/oauth/v2/authorize
SLACK_TOKEN_URL=https://slack.com/api/oauth.v2.access
```

#### Existing Variables (maintain)
```bash
# Bot functionality (existing)
SLACK_BOT_TOKEN=xoxb-existing-bot-token
SLACK_CHANNEL_ID=C1234567890
SLACK_PRIVATE_CHANNEL_ID=C0987654321
```

### 3. Database Schema Modifications

#### User Table Updates
Add Slack-specific fields to the `users` table in `shared/schema.ts`:

```typescript
export const users = pgTable("users", {
  // ... existing fields
  
  // Slack OAuth fields
  slackUserId: text("slack_user_id").unique(), // Slack user ID (U1234567890)
  slackTeamId: text("slack_team_id"), // Slack workspace ID (T1234567890) 
  slackEmail: text("slack_email"), // Email from Slack (may differ from primary)
  slackDisplayName: text("slack_display_name"), // Display name from Slack
  slackAvatar: text("slack_avatar"), // Avatar URL from Slack
  slackAccessToken: text("slack_access_token"), // User's OAuth token (encrypted)
  slackRefreshToken: text("slack_refresh_token"), // Refresh token (if available)
  slackTokenExpiresAt: timestamp("slack_token_expires_at"), // Token expiration
  authProvider: text("auth_provider").notNull().default("password"), // "slack" or "password"
  
  // ... existing fields
});
```

#### Migration Strategy
1. Add new columns as nullable initially
2. Create unique index on `slack_user_id` where not null
3. Create composite index on `(slack_team_id, slack_user_id)` for workspace lookups
4. Create index on `auth_provider` for authentication queries

### 4. OAuth Flow Design

#### Authentication Flow Sequence
```
1. User clicks "Sign in with Slack"
2. Redirect to Slack authorization URL with scopes and state
3. User authorizes app in Slack
4. Slack redirects back with authorization code
5. Exchange code for access token
6. Fetch user profile from Slack
7. Create or link user account
8. Establish session and redirect to dashboard
```

#### API Endpoints

**GET /auth/slack**
- Generate OAuth state for CSRF protection
- Store state in session/cache with expiration
- Redirect to Slack authorization URL
- Include required scopes: `openid,profile,email,identity.basic,identity.team`

**GET /auth/slack/callback**
- Validate state parameter against stored value
- Exchange authorization code for access token
- Fetch user profile using `users.identity` API
- Handle user creation/linking logic
- Set authentication session
- Redirect to dashboard or onboarding

**POST /auth/slack/unlink**
- Remove Slack authentication from user account
- Require existing session for security
- Maintain password auth if available
- Clear stored Slack tokens

### 5. User Authentication Logic

#### Account Linking Strategy

**New User Registration (via Slack)**:
1. Check if Slack user exists by `slack_user_id`
2. If not, create new user with Slack profile data
3. Set `auth_provider = "slack"`
4. Map to organization using Slack team ID or domain matching
5. Assign default role and team based on organization settings

**Existing User Linking**:
1. Allow logged-in users to connect their Slack account
2. Store Slack ID and profile data
3. Enable both password and Slack authentication
4. Set `auth_provider = "hybrid"`

**Login via Slack**:
1. Lookup user by `slack_user_id`  
2. Verify Slack team matches organization
3. Update profile data if changed
4. Establish session as normal

#### Organization Mapping

**Domain-based Mapping**:
- Extract domain from Slack email
- Map to organization by matching domain patterns
- Require admin approval for new domains

**Team-based Mapping**:
- Map Slack workspace ID to organization ID
- Store mapping in new `slack_workspaces` table
- Support multiple workspaces per organization

### 6. Security Considerations

#### State Validation
- Generate cryptographically random state parameter
- Store in Redis/memory cache with 10-minute expiration
- Validate state in callback to prevent CSRF attacks

#### Token Management
- Encrypt user access tokens before database storage
- Store tokens with proper expiration handling
- Implement token refresh logic for long-lived tokens
- Revoke tokens on account deletion/unlinking

#### Scope Permissions
- Request minimal required scopes initially
- Use incremental authorization for additional permissions
- Clearly explain permission requirements to users
- Provide scope-specific error handling

#### Multi-tenant Security
- Validate user belongs to correct organization
- Prevent cross-organization data access
- Implement proper authorization checks
- Audit Slack authentication events

### 7. Integration with Existing System

#### Authentication Middleware Updates

**Enhanced `authenticateUser()` function**:
```typescript
export function authenticateUser() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (process.env.NODE_ENV === 'development') {
        // ... existing dev logic
      } else {
        // Production authentication
        const authHeader = req.headers.authorization;
        const sessionToken = req.session?.userId;
        
        if (authHeader) {
          // JWT token validation
          const user = await validateJWT(authHeader);
          req.currentUser = user;
        } else if (sessionToken) {
          // Session-based authentication
          const user = await storage.getUser(req.orgId, sessionToken);
          req.currentUser = user;
        } else {
          return res.status(401).json({ message: "Authentication required" });
        }
      }
      next();
    } catch (error) {
      res.status(401).json({ message: "Authentication failed" });
    }
  };
}
```

#### Session Management
- Use existing `express-session` with PostgreSQL store
- Store user ID and organization ID in session
- Set appropriate cookie security flags
- Implement session expiration and renewal

#### User Profile Updates
- Sync Slack profile data on each login
- Allow users to choose primary email address
- Update avatar from Slack if user prefers
- Handle Slack display name changes

### 8. Implementation Phases

#### Phase 1: Basic OAuth Setup
- [ ] Add environment variables
- [ ] Create OAuth endpoints (`/auth/slack`, `/auth/slack/callback`)
- [ ] Implement basic user creation from Slack profile
- [ ] Test with development Slack app

#### Phase 2: User Experience
- [ ] Add "Sign in with Slack" button to login page
- [ ] Create account linking UI for existing users
- [ ] Implement user onboarding flow for Slack users
- [ ] Add Slack profile display in user settings

#### Phase 3: Advanced Features
- [ ] Implement organization mapping logic
- [ ] Add admin controls for Slack workspace management
- [ ] Create user synchronization between Slack and app
- [ ] Add Slack-based user directory features

#### Phase 4: Production Deployment
- [ ] Set up production Slack app
- [ ] Configure production environment variables
- [ ] Test OAuth flow in production environment
- [ ] Monitor authentication metrics and errors

### 9. Testing Strategy

#### Development Testing
- Create separate Slack app for development
- Use ngrok for local HTTPS redirect URLs
- Test with multiple Slack workspaces
- Verify organization isolation

#### Security Testing
- Test CSRF protection with state parameter
- Verify token encryption and storage
- Test session security and expiration
- Validate organization boundaries

#### User Experience Testing
- Test new user signup flow
- Test existing user account linking
- Verify profile synchronization
- Test error handling and recovery

### 10. Monitoring and Maintenance

#### Metrics to Track
- OAuth conversion rates (authorization → successful login)
- Authentication method distribution (Slack vs password)
- Token refresh success rates
- Failed authentication attempts

#### Error Handling
- Log OAuth failures with anonymized details
- Monitor token expiration and refresh patterns
- Track Slack API rate limiting issues
- Alert on authentication system failures

#### Maintenance Tasks
- Regular token cleanup for deleted users
- Monitor Slack app permissions and scopes
- Update Slack API integration as needed
- Sync user profile changes periodically

## Conclusion

This implementation plan provides a comprehensive approach to integrating Slack OAuth authentication while maintaining Whirkplace's existing architecture and security model. The phased approach allows for incremental development and testing while ensuring production readiness.

Key benefits:
- Seamless user authentication via Slack
- Enhanced team collaboration features
- Improved user onboarding experience  
- Maintained security and multi-tenant architecture
- Future extensibility for additional Slack features

The plan prioritizes security, user experience, and maintainability while leveraging Whirkplace's existing robust foundation.