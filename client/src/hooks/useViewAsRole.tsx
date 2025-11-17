import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useCurrentUser } from "./useCurrentUser";
import type { User } from "@shared/schema";

// Available roles for "view as" functionality
export type ViewAsRole = "admin" | "manager" | "member";

interface RoleSwitchContextType {
  viewAsRole: ViewAsRole | null;
  actualUser: User | null;
  effectiveUser: User | null;
  isViewingAsRole: boolean;
  canSwitchRoles: boolean;
  switchToRole: (role: ViewAsRole | null) => void;
  clearRoleSwitch: () => void;
}

const RoleSwitchContext = createContext<RoleSwitchContextType | null>(null);

interface RoleSwitchProviderProps {
  children: ReactNode;
}

export function RoleSwitchProvider({ children }: RoleSwitchProviderProps) {
  const { data: actualUser, isLoading: userLoading } = useCurrentUser();
  const [viewAsRole, setViewAsRole] = useState<ViewAsRole | null>(null);
  
  // Check if current user is a super admin (only super admins can use role switching)
  const canSwitchRoles = (actualUser as any)?.isSuperAdmin === true;
  
  // Create effective user based on current role switch
  const effectiveUser: User | null = actualUser && viewAsRole && canSwitchRoles 
    ? { 
        ...(actualUser as any), 
        role: viewAsRole,
        // For team assignment testing, if switching to manager/member, preserve teamId
        // If switching to admin, remove team constraints
        teamId: viewAsRole === "admin" ? (actualUser as any).teamId : (actualUser as any).teamId
      }
    : (actualUser as any);
    
  const isViewingAsRole = canSwitchRoles && viewAsRole !== null;
  
  const switchToRole = (role: ViewAsRole | null) => {
    if (!canSwitchRoles) {
      return;
    }
    setViewAsRole(role);
    
    // Store in sessionStorage so it persists across page reloads during testing
    if (role) {
      sessionStorage.setItem('viewAsRole', role);
    } else {
      sessionStorage.removeItem('viewAsRole');
    }
  };
  
  const clearRoleSwitch = () => {
    switchToRole(null);
  };
  
  // Restore role from sessionStorage on mount - with better validation
  useEffect(() => {
    if (canSwitchRoles && !userLoading && actualUser) {
      const savedRole = sessionStorage.getItem('viewAsRole') as ViewAsRole | null;
      if (savedRole && ['admin', 'manager', 'member'].includes(savedRole)) {
        setViewAsRole(savedRole);
      } else if (savedRole) {
        // Invalid saved role, clear it
        sessionStorage.removeItem('viewAsRole');
      }
    }
  }, [canSwitchRoles, userLoading, actualUser]);
  
  // Clear role switch if user is no longer a super admin
  useEffect(() => {
    if (!canSwitchRoles && viewAsRole) {
      setViewAsRole(null);
      sessionStorage.removeItem('viewAsRole');
    }
  }, [canSwitchRoles, viewAsRole]);
  
  const contextValue: RoleSwitchContextType = {
    viewAsRole,
    actualUser: actualUser as User | null,
    effectiveUser: effectiveUser as User | null,
    isViewingAsRole,
    canSwitchRoles,
    switchToRole,
    clearRoleSwitch,
  };
  
  return (
    <RoleSwitchContext.Provider value={contextValue}>
      {children}
    </RoleSwitchContext.Provider>
  );
}

/**
 * Hook to access the role switch context
 */
export function useRoleSwitch(): RoleSwitchContextType {
  const context = useContext(RoleSwitchContext);
  if (!context) {
    throw new Error('useRoleSwitch must be used within a RoleSwitchProvider');
  }
  return context;
}

/**
 * Enhanced hook that replaces useCurrentUser with role switching support
 * This should be used throughout the app instead of useCurrentUser
 */
export function useViewAsRole() {
  const { effectiveUser, actualUser, isViewingAsRole, canSwitchRoles } = useRoleSwitch();
  const { isLoading, error } = useCurrentUser();
  
  return {
    data: effectiveUser,
    actualUser,
    isLoading,
    error,
    isViewingAsRole,
    canSwitchRoles,
  };
}

/**
 * Hook to check if current user has a specific permission (with role switching support)
 * This replaces useUserPermissions from useCurrentUser
 */
export function useViewAsPermissions() {
  const { data: user, isLoading } = useViewAsRole();
  
  const hasPermission = (action: string, resource?: any): boolean => {
    if (!user) return false;
    
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
        if (action === "view_organization_analytics") {
          return false; // Managers can't view org-wide data
        }
        return false;
        
      case "member":
        // Members can only access their own data
        if (action === "view_user_analytics" && resource?.userId === user.id) {
          return true;
        }
        if (action === "view_team_analytics" || action === "view_organization_analytics") {
          return false;
        }
        return false;
        
      default:
        return false;
    }
  };
  
  const canViewScope = (scope: "organization" | "team" | "user"): boolean => {
    if (!user) return false;
    
    switch (user.role) {
      case "admin":
        return true;
      case "manager":
        return scope === "team" || scope === "user";
      case "member":
        return scope === "user";
      default:
        return false;
    }
  };
  
  const getDefaultScope = (): "organization" | "team" | "user" => {
    if (!user) return "user";
    
    switch (user.role) {
      case "admin":
        return "organization";
      case "manager":
        return "team";
      case "member":
        return "user";
      default:
        return "user";
    }
  };
  
  const getEntityId = (scope: "organization" | "team" | "user"): string | undefined => {
    if (!user) return undefined;
    
    switch (scope) {
      case "organization":
        return undefined; // No specific entity for org scope
      case "team":
        return user.teamId || undefined;
      case "user":
        return user.id;
      default:
        return undefined;
    }
  };
  
  return {
    user,
    isLoading,
    hasPermission,
    canViewScope,
    getDefaultScope,
    getEntityId,
  };
}