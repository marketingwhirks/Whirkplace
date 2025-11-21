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
    - **Check-ins**: Weekly wellness surveys with customizable questions, self-review capability for users without managers, integration with question bank, and late submission support. Hierarchical privacy model ensures users only see their own check-ins and those of their direct reports.
    - **Wins**: Peer-to-peer recognition system with private/public visibility and integration with company values.
    - **Questions**: Customizable question bank with pre-built categories.
    - **Slack Integration**: Enhanced onboarding, configurable wins channel, welcome DMs, and 8 slash commands.

### System Design Choices
The application adopts a multi-tenant architecture with data isolation. A storage abstraction layer in the backend allows for flexible database implementations. Secure authentication mechanisms, including OAuth and SSO, are central to the system. Account ownership and role-based access control (Super admin > Account owner > Regular admin > Manager > Member) ensure robust management. Check-in weeks are calculated using Monday as the week start. Super administrators have access to a comprehensive data management tool for fixing production data issues, with audit logging and safety features. Security hardening includes robust session management, disabled automatic schema sync in production, environment-dependent development authentication, organization-scoped data access enforcement, SQL injection prevention, CSRF protection, rate limiting, and comprehensive data validation.

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
- **Slack Web API**: For check-in reminders, win announcements, team health updates, password reset links via DM, and customizable notifications. Includes password setup via Slack DM and admin password reset functionality.
- **Microsoft 365 SSO**: For authentication.

### State Management
- **TanStack React Query**: Server state management.
- **React Hook Form**: Form state management.
- **Zod**: Runtime type validation.