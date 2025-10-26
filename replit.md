# Whirkplace

## Overview
Whirkplace is a comprehensive team management and wellness application designed to track team health, conduct regular check-ins, celebrate wins, and foster strong team connections. It empowers organizations to monitor team morale, gather feedback through customizable questions, and promote a positive work environment through win recognition and Slack integration. The project aims to provide a scalable, multi-tenant solution for enhancing organizational well-being and productivity.

## User Preferences
Preferred communication style: Simple, everyday language.
Demo Organization: Fictitious Delicious is a fine dining restaurant (not a tech company).

## System Architecture

### UI/UX Decisions
The frontend uses React 18 with TypeScript, Tailwind CSS, and shadcn/ui components built on Radix UI primitives. It features a component-based architecture with pages for various functionalities like dashboard, check-ins, wins, and settings. The design system leverages CSS custom properties for theming, supporting both light and dark modes. Interactive tour guides using `react-joyride` provide onboarding and feature discovery, with database-backed progress tracking.

### Technical Implementations
- **Frontend**: React 18, TypeScript, Wouter for routing, Tailwind CSS, shadcn/ui, TanStack React Query for state management, React Hook Form with Zod validation, Vite for builds.
- **Backend**: Express.js with TypeScript, Drizzle ORM for database operations, PostgreSQL (Neon Database), REST API pattern, middleware for logging and error handling.
- **Data Architecture**: Relational schema including Users, Teams, Check-ins, Questions, Question Bank, Question Categories, Wins, and Comments. All entities use UUIDs, timestamps, and `organization_id` for multi-tenancy.
- **Multi-Tenant Architecture**: Supports multiple organizations with data isolation using `organization_id` in all tables, dynamic company values, and secure API routes.
- **Authentication**: Multi-provider system including Slack OAuth, Microsoft 365 SSO, and a developer-friendly backdoor authentication. Features secure session management and account ownership transfer capabilities.
- **Feature Specifications**:
    - **Check-ins**: Weekly wellness surveys with customizable questions, self-review capability for users without managers, integration with question bank, and late submission support for previous week's check-ins with clear visual indicators. **Hierarchical privacy model**: Users can only see their own check-ins and those of their direct reports. No lateral (peer) or upward (manager) visibility. New `canViewAllTeams` permission allows designated users to view across teams while still respecting hierarchy.
    - **Wins**: Peer-to-peer recognition system with private/public visibility, integration with company values, and rich Slack notifications.
    - **Questions**: Customizable question bank with pre-built categories, auto-seeding for super admins, and role-based UI.
    - **Slack Integration**: Enhanced onboarding with secure password setup links (fixed button styles for Slack compatibility), configurable wins channel, welcome DMs with app links, and 8 slash commands (/checkin, /wins, /shoutout, /goals, /mystatus, /teamstatus, /vacation, /help).

### System Design Choices
The application adopts a multi-tenant architecture to support multiple organizations with data isolation. A storage abstraction layer in the backend allows for flexible database implementations. Secure authentication mechanisms, including OAuth and SSO, are central to the system. Account ownership and role-based access control (Super admin > Account owner > Regular admin > Manager > Member) ensure robust management. Check-in weeks are calculated using Monday as the week start, ensuring consistent weekly cycles across the organization. Super administrators have access to a comprehensive data management tool for fixing production data issues across all organizations, with audit logging and safety features.

## Security Review & Improvements (October 16, 2025)

### Security Hardening Completed
1. **Session Management**: Removed hardcoded fallback session secret. Added validation to require SESSION_SECRET environment variable for production security.
2. **Database Sync Service**: Disabled automatic schema synchronization in production. Schema changes must now be managed through proper migrations only.
3. **Development Authentication**: Confirmed backdoor authentication is only enabled when NODE_ENV='development', preventing exposure in production.
4. **Multi-tenant Isolation**: Verified organization-scoped data access is properly enforced through middleware and storage layer.
5. **SQL Injection Prevention**: Confirmed Drizzle ORM provides parameterized queries throughout the application.
6. **CSRF Protection**: Active double-submit cookie pattern implementation with replay protection.
7. **Rate Limiting**: Authentication endpoints limited to 10 requests per 15-minute window.
8. **Data Validation**: Comprehensive Zod schema validation on all inputs.

## Recent Fixes (October 16, 2025)

### Aggregation Service Errors - RESOLVED
**Problem**: Multiple NOT NULL constraint violations in aggregation tables preventing metrics processing

**Root Causes**:
1. `metric_date` column not being set in pulseMetricsDaily, shoutoutMetricsDaily, and complianceMetricsDaily tables
2. `aggregation_type` and `last_processed_date` columns not being set in aggregationWatermarks table

**Resolution**: Updated aggregation service to set all required fields:
- Added `metricDate` to all daily metric table inserts
- Added `aggregationType` and `lastProcessedDate` to watermark updates

**Result**: Aggregation service now processes metrics successfully without errors

## Recent Updates (October 26, 2025)

### Team Check-in Status Integration
**Enhancement**: Consolidated team check-in monitoring into the Reviews page for a unified management interface

**Changes Made**:
1. Integrated Team Check-in Status grid view directly into the Reviews page
2. Added comprehensive filtering (by team, status, and week) with CSV export
3. Color-coded status indicators: green (submitted), yellow (pending), red (overdue), blue (vacation)
4. Displays mood ratings, submission times, and days overdue
5. Removed separate Team Check-in Status page to streamline navigation

**Result**: Managers and admins now have a single comprehensive page at `/reviews` to manage both pending reviews and monitor team submission status

## Critical Issues & Resolutions

### Production Response Timeout Issue (October 15, 2025 - RESOLVED October 16, 2025)
**Problem**: In production, check-ins and wins showed as "failed" even though data was successfully saved

**Root Cause**: Slack notifications were blocking API responses, causing frontend to timeout before receiving success confirmation

**Resolution**: Implemented comprehensive timeout handling:
1. Made all Slack notifications asynchronous using `setImmediate()` 
2. Added 5-second timeouts to all Slack API calls using `Promise.race()`
3. Enhanced error logging to track non-critical notification failures
4. Response is sent immediately after database save

**Fixed Endpoints**:
- `POST /api/checkins` - Creates new check-ins (with timeout protection)
- `PATCH /api/checkins/:id` - Updates existing check-ins (with timeout protection)
- `POST /api/wins` - Creates new wins (with timeout protection for both public and private notifications)

**Result**: Check-ins and wins now save successfully with immediate response (under 1 second), even if Slack API is slow or unavailable

### Deployment Blocker - NOT NULL Constraint (October 16, 2025 - RESOLVED)
**Problem**: Publishing failed with ERROR 23502 - NOT NULL constraint violation in compliance_metrics_daily table

**Root Cause**: The production database had additional columns not present in schema.ts, particularly `metric_date` which required a non-null value

**Resolution**: Added all missing columns to schema.ts with appropriate default values:
- metric_date (default: CURRENT_DATE)
- totalDue, onTimeSubmissions, lateSubmissions, missingSubmissions (default: 0)
- onTimeReviews, lateReviews, pendingReviews (default: 0)
- teamBreakdown (default: empty JSONB object)

### Production Deployment Issue (October 12, 2025) 
**Problem**: All API-dependent features work in development but fail in production after publishing. This affects:
- One-on-one meeting scheduling
- KRA management (manual and AI generation)  
- Microsoft integrations
- AI integrations
- Organization pricing updates

**Root Cause**: The production deployment appears to only serve static frontend files without the backend Express server, despite correct configuration in `.replit`:
```
[deployment]
deploymentTarget = "autoscale"
build = ["sh", "-c", "npm run build"]
run = ["npm", "run", "start"]
```

**Temporary Workaround**: Continue using development environment (`npm run dev`) until production deployment is resolved.

### Microsoft OAuth Session Issue (October 13, 2025 - RESOLVED)
**Problem**: Microsoft OAuth login failed with error "AADSTS165000: Invalid Request: The user session context is missing"

**Root Cause**: Session middleware configuration issues:
1. Missing TypeScript declarations for Microsoft OAuth session properties
2. `saveUninitialized` set to `false` preventing OAuth state from being saved
3. Cookie `sameSite` attribute set to 'none' causing compatibility issues

**Resolution**: Fixed in `server/middleware/session.ts`:
1. Added missing session properties (`microsoftAuthState`, `microsoftRedirectUri`, `authOrgId`) to TypeScript interface
2. Changed `saveUninitialized` to `true` to ensure OAuth sessions are saved
3. Changed cookie `sameSite` from 'none' to 'lax' for better OAuth compatibility
4. Added `domain: undefined` to let browser handle cookie domain automatically

## External Dependencies

### Database
- **Neon Database**: PostgreSQL hosting.
- **Drizzle ORM**: Type-safe database queries.
- **connect-pg-simple**: PostgreSQL session store.

### UI Components
- **Radix UI**: Accessible UI primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **Lucide React**: Icon library.
- **date-fns**: Date manipulation.

### Development Tools
- **TypeScript**: Static type checking.
- **Vite**: Build tool and development server.
- **ESBuild**: Fast JavaScript bundler.
- **PostCSS**: CSS processing.

### Third-party Integrations
- **Slack Web API**: For check-in reminders, win announcements, team health updates, password reset links via DM, and customizable notifications.
  - **Password Setup via Slack DM**: New users synced from Slack automatically receive password setup instructions via Slack DM
  - **Admin Password Reset**: Admins can send password setup links to Slack users directly via DM from the Admin Panel
  - **Organization Context**: Password reset links now include organization context for better routing

### State Management
- **TanStack React Query**: Server state management.
- **React Hook Form**: Form state management.
- **Zod**: Runtime type validation.