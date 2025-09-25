import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, LogIn, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DevLogin() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [backdoorUser, setBackdoorUser] = useState("");
  const [backdoorKey, setBackdoorKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleBackdoorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Get current URL params for organization
      const urlParams = new URLSearchParams(window.location.search);
      const org = urlParams.get('org') || 'whirkplace';
      
      // Use the proper backdoor login endpoint that creates a session
      const response = await fetch(`/api/auth/dev-login-fresh?org=${org}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: backdoorUser,
          key: backdoorKey
        }),
        credentials: 'include' // Important for cookies
      });

      if (response.ok) {
        const userData = await response.json();
        
        // Save user ID to localStorage as fallback
        if (userData.user && userData.user.id) {
          localStorage.setItem('auth_user_id', userData.user.id);
        }
        
        toast({
          title: "Login successful!",
          description: `Welcome back, ${userData.user.name}!`,
        });
        
        // Redirect to dashboard - use window.location to force page reload
        // This ensures authentication state is properly refreshed
        setTimeout(() => {
          window.location.href = '/';
        }, 500);
      } else {
        const error = await response.json();
        toast({
          variant: "destructive",
          title: "Authentication failed",
          description: error.message || "Invalid backdoor credentials",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: "An error occurred during authentication",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Shield className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">Development Login</CardTitle>
          <CardDescription>
            Use backdoor credentials for development access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleBackdoorLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="backdoor-user">Backdoor User</Label>
              <Input
                id="backdoor-user"
                type="text"
                placeholder="Enter backdoor username/email"
                value={backdoorUser}
                onChange={(e) => setBackdoorUser(e.target.value)}
                required
                data-testid="input-backdoor-user"
              />
              <p className="text-xs text-muted-foreground">
                Use the value from BACKDOOR_USER environment variable
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="backdoor-key">Backdoor Key</Label>
              <Input
                id="backdoor-key"
                type="password"
                placeholder="Enter backdoor key"
                value={backdoorKey}
                onChange={(e) => setBackdoorKey(e.target.value)}
                required
                data-testid="input-backdoor-key"
              />
              <p className="text-xs text-muted-foreground">
                Use the value from BACKDOOR_KEY environment variable
              </p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <div className="flex items-start space-x-2">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="text-sm text-amber-700 dark:text-amber-300">
                  <p className="font-medium mb-1">Development Only</p>
                  <p>This login method is only available in development environments. Contact your administrator for the backdoor credentials.</p>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              data-testid="button-backdoor-login"
            >
              {isLoading ? (
                "Authenticating..."
              ) : (
                <>
                  <LogIn className="w-4 h-4 mr-2" />
                  Login with Backdoor
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}