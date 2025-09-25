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
        console.log('OAuth callback - Setting auth in localStorage:', {
          userId,
          orgId,
          orgSlug,
          needsOnboarding,
          isSuperAdmin
        });
        
        localStorage.setItem('x-auth-user-id', userId);
        if (orgId) {
          localStorage.setItem('x-auth-org-id', orgId);
        }
        
        // Verify localStorage was set
        const verifyUserId = localStorage.getItem('x-auth-user-id');
        console.log('OAuth callback - Verified localStorage:', {
          storedUserId: verifyUserId,
          matches: verifyUserId === userId
        });
        
        // Small delay to ensure localStorage is committed before redirect
        setTimeout(() => {
          // Redirect to the appropriate page
          if (isSuperAdmin) {
            // Super admins go to organization selection
            setLocation('/select-organization');
          } else if (needsOnboarding && orgSlug) {
            // New organizations go to onboarding
            console.log(`OAuth callback - Redirecting to onboarding with org: ${orgSlug}`);
            setLocation(`/onboarding?org=${orgSlug}`);
          } else if (orgSlug) {
            // Existing organizations go to dashboard
            setLocation(`/dashboard?org=${orgSlug}`);
          } else {
            // Fallback to dashboard
            setLocation('/dashboard');
          }
        }, 100); // 100ms delay to ensure localStorage is committed
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