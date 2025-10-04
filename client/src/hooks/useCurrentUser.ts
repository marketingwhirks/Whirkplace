import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

/**
 * Hook to get current user information including their role
 * Used for role-based access control in the UI
 */
export function useCurrentUser() {
  // IMPORTANT: We don't pass org parameter from URL for regular users anymore
  // to prevent organization context override issues. The server should use
  // the organization from the user's session/authentication.
  // Only demo mode uses special handling via Bearer token.
  
  return useQuery<User | null>({
    queryKey: ["/api/users/current"],
    queryFn: async () => {
      try {
        // Build the URL - no org parameter for regular users
        const url = '/api/users/current';

        // Make actual API call to check current user authentication
        // Use Bearer token if available (for demo users), otherwise rely on secure session cookies
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        
        const demoToken = localStorage.getItem('demo_token');
        if (demoToken) {
          headers['Authorization'] = `Bearer ${demoToken}`;
        }
        
        const response = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers
        });
        
        if (!response.ok) {
          // Return null for unauthenticated users instead of throwing
          return null;
        }
        
        return response.json();
      } catch (error) {
        // Return null on any error to show landing page
        return null;
      }
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false, // Don't retry on auth failures
    gcTime: 0, // Don't cache failed auth attempts
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