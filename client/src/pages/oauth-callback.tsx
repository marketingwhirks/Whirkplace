import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';

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
        // Store auth info in localStorage for immediate recognition
        // Use the same key that the auth middleware expects
        localStorage.setItem('x-auth-user-id', userId);
        if (orgId) {
          localStorage.setItem('x-auth-org-id', orgId);
        }
        
        // Redirect to the appropriate page
        if (isSuperAdmin) {
          // Super admins go to organization selection
          setLocation('/select-organization');
        } else if (needsOnboarding && orgSlug) {
          // New organizations go to onboarding
          setLocation(`/onboarding?org=${orgSlug}`);
        } else if (orgSlug) {
          // Existing organizations go to dashboard
          setLocation(`/dashboard?org=${orgSlug}`);
        } else {
          // Fallback to dashboard
          setLocation('/dashboard');
        }
      } else {
        // No user ID, something went wrong
        console.error('OAuth callback missing user_id');
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