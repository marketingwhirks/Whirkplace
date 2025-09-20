# Whirkplace

## Overview

Whirkplace is a comprehensive team management and wellness application designed to help organizations track team health, conduct regular check-ins, celebrate wins, and maintain strong team connections. The application provides managers and team members with tools to monitor team morale, gather feedback through customizable questions, and foster a positive work environment through win recognition and Slack integration.

## Recent Changes

### Multi-Tenant Architecture (September 2025)
Successfully implemented multi-tenant database architecture to support multiple organizations:
- **Organizations Table**: Added support for customizable company values per organization
- **Data Isolation**: All tables now include organization_id for secure tenant separation  
- **Dynamic Company Values**: Organizations can define their own values instead of hardcoded defaults
- **Secure API Routes**: All endpoints are organization-aware with proper data filtering
- **Scalable Foundation**: Ready for multiple customers with custom branding and values

### Peer-to-Peer Kudos System (September 2025)
Built comprehensive recognition system for team engagement and culture building:
- **Peer Recognition**: Anyone can recognize anyone with personalized messages and company values
- **Private/Public Visibility**: Choose whether kudos are shared publicly or kept private between individuals
- **Company Values Integration**: Tag kudos with organization's custom company values for culture alignment
- **Enhanced Slack Integration**: Rich Slack notifications with company value badges and professional formatting
- **Security & Privacy**: Enterprise-grade access controls prevent data leakage and impersonation
- **Complete UI**: Intuitive interface with kudos feed, filtering, and responsive design

### Authentication & Security (September 2025)
Enhanced multi-provider authentication system for development and production use:
- **Slack OAuth**: Full Slack workspace integration with OAuth 2.0 authentication
- **Microsoft 365 SSO**: Single sign-on using Microsoft Azure AD/Entra ID with MSAL authentication
- **Backdoor Authentication**: Developer-friendly backdoor login system for when OAuth providers are unavailable
- **Multi-Factor Auth Options**: Header-based, session-based, and UI-based authentication methods
- **Environment Variable Security**: Customizable backdoor credentials via BACKDOOR_USER and BACKDOOR_KEY
- **Session Management**: Secure session handling with proper user context and organization isolation
- **Provider Selection**: Organizations can enable/disable specific authentication providers

## Roadmap

### Immediate Priorities
- **Microsoft 365 SSO**: Single sign-on integration with Microsoft 365 credentials alongside existing Slack authentication
- **Microsoft Teams Integration**: Real-time notifications and workflow automation similar to Slack integration
- **Admin Configuration**: Organization-level settings to enable/disable Microsoft integrations
- **Outlook Calendar Sync**: Enhanced calendar integration for One-on-One meetings

### Short-term Enhancements (1-3 months)
- **Enhanced Analytics**: Advanced reporting and data visualization
- **Multi-Provider Authentication**: Seamless switching between Slack and Microsoft 365 authentication
- **Teams Notification Center**: Configurable notification preferences for Microsoft Teams
- **Advanced Team Management**: Hierarchical team structures with Microsoft organizational data sync
- **Performance Optimization**: Caching, data loading, and response times

### Medium-term Vision (3-6 months)
- **Microsoft Graph Integration**: Deep integration with Microsoft 365 ecosystem (SharePoint, OneDrive, etc.)
- **Advanced Teams Workflows**: Automated workflows and smart notifications in Microsoft Teams
- **White Label Platform**: Complete white label solution for Enterprise+ tier clients to resell the platform under their own brand
  - Custom logo upload and brand asset management
  - Complete text and messaging customization (product names, interface copy, email templates)
  - Custom domain configuration with SSL/TLS support
  - Plan-based access control restricting white label features to qualified tiers
  - Reseller partner portal for managing multiple white label instances
  - Custom onboarding flows and welcome sequences per white label brand
  - Revenue sharing and commission tracking for reseller partners
- **iPhone App Development**: Convert to iOS app using Capacitor (estimated 1-2 weeks implementation)
- **Enterprise Features**: Advanced security, audit logs, and compliance features
- **Anonymized Organization Analytics**: For highest-tier customers, provide anonymized benchmarking analytics comparing their organization's health scores and best practices against aggregated data from other organizations

### Long-term Vision (6+ months)
- **Microsoft Viva Integration**: Connect with Microsoft Viva suite for employee experience
- **API Platform**: Public API for third-party integrations and custom workflows
- **Advanced AI Features**: AI-powered insights using Microsoft Cognitive Services
- **Global Expansion**: Multi-language support and regional compliance

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The client application is built using React with TypeScript and modern tooling:

- **UI Framework**: React 18 with TypeScript for type safety
- **Routing**: Wouter for lightweight client-side routing
- **Styling**: Tailwind CSS with custom design system variables
- **Component Library**: shadcn/ui components built on Radix UI primitives
- **State Management**: TanStack React Query for server state management
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite for fast development and optimized builds

The frontend follows a component-based architecture with pages for dashboard, check-ins, team management, wins celebration, questions management, analytics, and settings. The design system uses CSS custom properties for theming with support for light/dark modes.

### Backend Architecture
The server is built with Express.js and follows a REST API pattern:

- **Framework**: Express.js with TypeScript
- **Database Layer**: Drizzle ORM for type-safe database operations
- **Database**: PostgreSQL (configured for Neon Database)
- **API Design**: RESTful endpoints with standardized response formats
- **Middleware**: Request logging, JSON parsing, and error handling
- **Development**: Hot reload with tsx and Vite integration

The backend implements a storage abstraction layer that defines interfaces for all data operations, making it easy to swap database implementations while maintaining type safety.

### Data Architecture
The application uses a relational database schema with the following core entities:

- **Users**: Team members with roles (member, manager, admin), team assignments, and hierarchical relationships
- **Teams**: Organizational units with leaders and descriptions
- **Check-ins**: Weekly wellness surveys with mood ratings and custom question responses
- **Questions**: Customizable check-in questions managed by administrators
- **Wins**: Achievement celebrations with public/private visibility and nomination support
- **Comments**: Threaded discussions on wins and check-ins

All entities include proper timestamps, UUIDs for primary keys, and foreign key relationships for data integrity.

### External Dependencies

#### Database
- **Neon Database**: PostgreSQL hosting service
- **Drizzle ORM**: Type-safe database queries and migrations
- **connect-pg-simple**: PostgreSQL session store for Express

#### UI Components
- **Radix UI**: Accessible, unstyled UI primitives
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library
- **date-fns**: Date manipulation and formatting

#### Development Tools
- **TypeScript**: Static type checking
- **Vite**: Build tool and development server
- **ESBuild**: Fast JavaScript bundler
- **PostCSS**: CSS processing with Autoprefixer

#### Third-party Integrations
- **Slack Web API**: Team communication and notifications
  - Check-in reminders
  - Win announcements
  - Team health updates
  - Configurable via environment variables (SLACK_BOT_TOKEN, SLACK_CHANNEL_ID)

#### State Management
- **TanStack React Query**: Server state synchronization, caching, and background updates
- **React Hook Form**: Form state management with validation
- **Zod**: Runtime type validation and schema definition

The application is designed to be deployment-ready with proper environment variable configuration, production build scripts, and scalable architecture patterns.