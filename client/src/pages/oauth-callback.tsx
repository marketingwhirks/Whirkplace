import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { queryClient } from '@/lib/queryClient';

export default function OAuthCallbackPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const processOAuthCallback = async () => {
      // Get parameters from URL
      const urlParams = new URLSearchParams(window.location.search);
      const userId = urlParams.get('user_id');
      const orgId = urlParams.get('org_id');
      const orgSlug = urlParams.get('org');
      const needsOnboarding = urlParams.get('onboarding') === 'true';
      const isSuperAdmin = urlParams.get('super_admin') === 'true';
      
      if (userId) {
        // Clear any existing demo token first to prevent authentication mode mixing
        localStorage.removeItem('demo_token');
        localStorage.removeItem('demo_user');
        localStorage.removeItem('demo_org');
        
        // Store auth info in localStorage for immediate recognition
        // Use the same key that the auth middleware expects
        localStorage.setItem('auth_user_id', userId);
        if (orgId) {
          localStorage.setItem('auth_org_id', orgId);
        }
        
        // Fetch the user data to populate the cache
        try {
          const userResponse = await fetch('/api/users/current', {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          if (userResponse.ok) {
            const userData = await userResponse.json();
            // Set the user data in the query cache immediately
            queryClient.setQueryData(["/api/users/current", { org: orgSlug }], userData);
            
            // Invalidate to ensure fresh data
            await queryClient.invalidateQueries({ 
              queryKey: ["/api/users/current"],
              refetchType: 'all' 
            });
          }
        } catch (error) {
          // Silently handle if user data cannot be pre-fetched
        }
        
        // Small delay to ensure authentication state is ready
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Force hard refresh to ensure session cookie is properly handled
        // This is more reliable than client-side routing for session-based auth
        if (isSuperAdmin) {
          // Super admins go to organization selection
          window.location.href = '/select-organization';
        } else if (needsOnboarding && orgSlug) {
          // New organizations go to onboarding
          window.location.href = `/onboarding?org=${orgSlug}`;
        } else if (orgSlug) {
          // Existing organizations go to dashboard
          window.location.href = `/dashboard?org=${orgSlug}`;
        } else {
          // Fallback to dashboard
          window.location.href = '/dashboard';
        }
        return; // Exit early since we're doing a hard refresh
      } else {
        // No user ID, something went wrong
        setLocation('/login?error=oauth_failed');
      }
    };

    processOAuthCallback();
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
        <h2 className="text-lg font-semibold">Completing sign in...</h2>
        <p className="text-sm text-muted-foreground">Please wait while we set up your account</p>
      </div>
    </div>
  );
}