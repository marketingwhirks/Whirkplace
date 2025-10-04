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
    
    // Clear all cookies by setting them to expire
    document.cookie.split(";").forEach(function(c) { 
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
    });
  }, []);

  const handleClearAndLogin = () => {
    // Clear everything again for good measure
    localStorage.clear();
    sessionStorage.clear();
    
    // Clear all cookies
    document.cookie.split(";").forEach(function(c) { 
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
    });
    
    // Redirect to login
    window.location.href = '/login';
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
