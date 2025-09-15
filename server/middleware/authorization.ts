import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { User, AnalyticsScope } from "@shared/schema";

/**
 * Analytics Authorization Middleware
 * 
 * Enforces role-based access controls for analytics endpoints based on:
 * - Member role: Can only see their own data (user scope with their own ID)
 * - Manager role: Can see their team's data (team scope for their team, user scope for team members)  
 * - Admin role: Can see organization-wide data (all scopes within their organization)
 */
export function authorizeAnalyticsAccess() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.currentUser;
      if (!user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { scope, id } = req.query;
      const requestedScope = scope as AnalyticsScope;
      const requestedEntityId = id as string | undefined;

      // Validate and authorize based on user role
      const authResult = await validateAnalyticsAccess(user, requestedScope, requestedEntityId);
      
      if (!authResult.authorized) {
        return res.status(403).json({ 
          message: "Access denied", 
          details: authResult.reason 
        });
      }

      // If the middleware modified the scope or entity (e.g., forcing user scope for members),
      // update the query parameters
      if (authResult.enforcedScope) {
        req.query.scope = authResult.enforcedScope;
      }
      if (authResult.enforcedEntityId) {
        req.query.id = authResult.enforcedEntityId;
      }

      next();
    } catch (error) {
      console.error("Authorization error:", error);
      res.status(500).json({ message: "Authorization check failed" });
    }
  };
}

interface AuthorizationResult {
  authorized: boolean;
  reason?: string;
  enforcedScope?: AnalyticsScope;
  enforcedEntityId?: string;
}

async function validateAnalyticsAccess(
  user: User, 
  requestedScope: AnalyticsScope | undefined, 
  requestedEntityId: string | undefined
): Promise<AuthorizationResult> {
  // Admin users can access all scopes within their organization
  if (user.role === "admin") {
    return { authorized: true };
  }

  // Default scope handling - if no scope provided, default based on role
  const scope = requestedScope || getDefaultScope(user.role);

  switch (user.role) {
    case "member":
      // Members can only see their own data
      return validateMemberAccess(user, scope, requestedEntityId);
      
    case "manager":
      // Managers can see their team data and individual team member data
      return await validateManagerAccess(user, scope, requestedEntityId);
      
    default:
      return { 
        authorized: false, 
        reason: `Unknown role: ${user.role}` 
      };
  }
}

function getDefaultScope(role: string): AnalyticsScope {
  switch (role) {
    case "member":
      return "user";
    case "manager":
      return "team";
    case "admin":
      return "organization";
    default:
      return "user";
  }
}

function validateMemberAccess(
  user: User, 
  scope: AnalyticsScope, 
  requestedEntityId: string | undefined
): AuthorizationResult {
  // Members can only access user scope with their own ID
  if (scope !== "user") {
    return {
      authorized: true, // Allow but enforce user scope
      enforcedScope: "user",
      enforcedEntityId: user.id
    };
  }

  // If user scope is requested, ensure it's their own ID
  if (requestedEntityId && requestedEntityId !== user.id) {
    return {
      authorized: true, // Allow but enforce their own ID
      enforcedEntityId: user.id
    };
  }

  // If no entity ID provided, enforce their own ID
  if (!requestedEntityId) {
    return {
      authorized: true,
      enforcedEntityId: user.id
    };
  }

  return { authorized: true };
}

async function validateManagerAccess(
  user: User, 
  scope: AnalyticsScope, 
  requestedEntityId: string | undefined
): Promise<AuthorizationResult> {
  const userTeamId = user.teamId;
  
  if (!userTeamId) {
    // Manager without a team can only see their own data
    return validateMemberAccess(user, scope, requestedEntityId);
  }

  switch (scope) {
    case "organization":
      // Managers can't access organization-wide data - default to their team
      return {
        authorized: true,
        enforcedScope: "team",
        enforcedEntityId: userTeamId
      };

    case "team":
      // Can only access their own team
      if (requestedEntityId && requestedEntityId !== userTeamId) {
        return {
          authorized: true,
          enforcedEntityId: userTeamId
        };
      }
      
      // If no entity ID provided, enforce their team ID
      if (!requestedEntityId) {
        return {
          authorized: true,
          enforcedEntityId: userTeamId
        };
      }

      return { authorized: true };

    case "user":
      if (!requestedEntityId) {
        return {
          authorized: false,
          reason: "User ID is required for user scope"
        };
      }

      // Verify the requested user is in their team
      const targetUser = await storage.getUser(user.organizationId, requestedEntityId);
      if (!targetUser) {
        return {
          authorized: false,
          reason: "User not found"
        };
      }

      if (targetUser.teamId !== userTeamId) {
        return {
          authorized: false,
          reason: "You can only view data for users in your team"
        };
      }

      return { authorized: true };

    default:
      return {
        authorized: false,
        reason: `Invalid scope: ${scope}`
      };
  }
}

/**
 * Role-based access control helper
 * Use this to check if a user can perform specific actions
 */
export function hasPermission(user: User, action: string, resource?: any): boolean {
  switch (user.role) {
    case "admin":
      return true; // Admins can do everything within their org
      
    case "manager":
      // Managers have elevated permissions for their team
      if (action === "view_team_analytics" && resource?.teamId === user.teamId) {
        return true;
      }
      if (action === "view_user_analytics" && resource?.teamId === user.teamId) {
        return true;
      }
      return false;
      
    case "member":
      // Members can only access their own data
      if (action === "view_user_analytics" && resource?.userId === user.id) {
        return true;
      }
      return false;
      
    default:
      return false;
  }
}