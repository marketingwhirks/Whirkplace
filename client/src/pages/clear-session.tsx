import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function ClearSession() {
  useEffect(() => {
    // Clear all auth-related items from localStorage
    localStorage.removeItem('demo_token');
    localStorage.removeItem('demo_user');
    localStorage.removeItem('demo_org_id');
    localStorage.removeItem('demo_org_slug');
    localStorage.removeItem('organizationId');
    localStorage.removeItem('auth_org_id');
    
    // Clear sessionStorage too
    sessionStorage.clear();
    
    // Clear all cookies by setting them to expire (more aggressive)
    const clearCookie = (name: string) => {
      // Try clearing with different path combinations
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=whirkplace.com`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.whirkplace.com`;
    };
    
    // Clear specific auth cookies
    clearCookie('connect.sid');
    clearCookie('auth_org_id');
    clearCookie('organizationId');
    clearCookie('sessionId');
    
    // Clear all cookies
    document.cookie.split(";").forEach(function(c) { 
      const eqPos = c.indexOf("=");
      const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim();
      clearCookie(name);
    });
  }, []);

  const handleClearAndLogin = () => {
    // Clear everything again for good measure
    localStorage.clear();
    sessionStorage.clear();
    
    // Clear all cookies more aggressively
    const clearCookie = (name: string) => {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=whirkplace.com`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.whirkplace.com`;
    };
    
    // Clear all cookies
    document.cookie.split(";").forEach(function(c) { 
      const eqPos = c.indexOf("=");
      const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim();
      clearCookie(name);
    });
    
    // Force reload to login to ensure clean state
    window.location.replace('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-orange-500" />
            <CardTitle>Session Cleared</CardTitle>
          </div>
          <CardDescription>
            Your session has been cleared due to invalid organization data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            We detected stale authentication cookies that were pointing to organizations that no longer exist. 
            This can happen during development when databases are reset.
          </p>
          <p className="text-sm text-muted-foreground">
            Your cookies and local storage have been cleared. Please log in again to continue.
          </p>
          <Button 
            onClick={handleClearAndLogin} 
            className="w-full"
            data-testid="button-clear-login"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Go to Login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
