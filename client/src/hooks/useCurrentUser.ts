import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

/**
 * Hook to get current user information including their role
 * Used for role-based access control in the UI
 */
export function useCurrentUser() {
  return useQuery<User>({
    queryKey: ["/api/users/current", { org: "default" }],
    queryFn: async () => {
      // Check for backdoor auth in development
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      // In development, check if we have backdoor credentials in localStorage
      if (import.meta.env.DEV) {
        const backdoorAuth = localStorage.getItem('backdoor_auth');
        if (backdoorAuth) {
          try {
            const { user, key } = JSON.parse(backdoorAuth);
            headers['X-Backdoor-User'] = user;
            headers['X-Backdoor-Key'] = key;
          } catch (e) {
            // Invalid backdoor auth, remove it
            localStorage.removeItem('backdoor_auth');
          }
        }
      }
      
      // Make actual API call to check current user authentication
      const response = await fetch('/api/users/current?org=default', {
        method: 'GET',
        credentials: 'include',
        headers
      });
      
      if (!response.ok) {
        // If not authenticated, throw error to trigger loading state/redirect
        throw new Error(`Authentication failed: ${response.status}`);
      }
      
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false, // Don't retry on auth failures
  });
}

/**
 * Hook to check if current user has a specific permission
 */
export function useUserPermissions() {
  const { data: user, isLoading } = useCurrentUser();
  
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