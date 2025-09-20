import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Heart, Users } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

export default function LoginPage() {
  const [backdoorUser, setBackdoorUser] = useState('');
  const [backdoorKey, setBackdoorKey] = useState('');
  const [isBackdoorLogin, setIsBackdoorLogin] = useState(false);
  const { toast } = useToast();
  
  const handleSlackLogin = () => {
    // Redirect to the Slack OAuth endpoint
    window.location.href = "/auth/slack/login?org=default"; // Replace 'default' with actual org slug if needed
  };
  
  const handleMicrosoftLogin = () => {
    // Redirect to the Microsoft OAuth endpoint with organization parameter
    window.location.href = "/auth/microsoft?org=default";
  };
  
  const handleBackdoorLogin = async () => {
    try {
      const response = await fetch('/auth/backdoor?org=default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: backdoorUser, key: backdoorKey })
      });
      
      if (response.ok) {
        const data = await response.json();
        toast({ title: "Success", description: data.message });
        
        // Clear all cached data and force fresh authentication
        queryClient.clear();
        
        // Clear any role switching state from previous sessions
        sessionStorage.removeItem('viewAsRole');
        
        // Add delay and debug logging
        console.log("Login successful, redirecting...");
        
        // Immediate reload to ensure cookies are properly available
        window.location.href = "/?org=default";
      } else {
        const error = await response.json();
        toast({ 
          title: "Login failed", 
          description: error.message,
          variant: "destructive" 
        });
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to connect to server",
        variant: "destructive" 
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo and Welcome */}
        <div className="text-center">
          <div className="flex justify-center items-center space-x-3 mb-6">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
              <Heart className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">WhirkPlace</h1>
          </div>
          <p className="text-muted-foreground">
            Welcome to your team culture platform
          </p>
        </div>

        {/* Login Card */}
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Connect with your Slack or Microsoft account to get started
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isBackdoorLogin ? (
              <>
                <Button 
                  onClick={handleSlackLogin}
                  className="w-full flex items-center justify-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white border-purple-600 hover:border-purple-700"
                  size="lg"
                  data-testid="slack-login-button"
                >
                  <svg 
                    viewBox="0 0 24 24" 
                    className="w-5 h-5" 
                    fill="currentColor"
                  >
                    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52-2.523c0-1.398 1.13-2.528 2.52-2.528h2.52v2.528c0 1.393-1.122 2.523-2.52 2.523Zm0 0a2.528 2.528 0 0 1-2.52 2.523c0-1.398 1.13-2.528 2.52-2.528v2.528h2.52c1.398 0 2.528-1.13 2.528-2.523a2.528 2.528 0 0 1-2.528-2.52H5.042v2.52Z"/>
                    <path d="M8.958 8.835a2.528 2.528 0 0 1 2.523-2.52c1.398 0 2.528 1.13 2.528 2.52v2.52h-2.528a2.528 2.528 0 0 1-2.523-2.52Zm0 0a2.528 2.528 0 0 1-2.523-2.52c1.398 0 2.528 1.13 2.528 2.52H8.958v2.52c0 1.398-1.13 2.528-2.523 2.528a2.528 2.528 0 0 1 2.523-2.528v-2.52Z"/>
                    <path d="M15.165 18.958a2.528 2.528 0 0 1 2.523 2.52c0-1.398 1.13-2.528 2.523-2.528a2.528 2.528 0 0 1-2.523-2.52v-2.52h2.523c1.398 0 2.528 1.13 2.528 2.52a2.528 2.528 0 0 1-2.528 2.523h-2.523v2.523Z"/>
                    <path d="M18.958 8.835a2.528 2.528 0 0 1-2.52-2.523c0 1.398-1.13 2.528-2.523 2.528a2.528 2.528 0 0 1 2.523 2.52v2.52h-2.523c-1.398 0-2.528-1.13-2.528-2.52a2.528 2.528 0 0 1 2.528 2.523h2.52V8.835Z"/>
                  </svg>
                  <span>Continue with Slack</span>
                </Button>
                
                <Button 
                  onClick={handleMicrosoftLogin}
                  className="w-full flex items-center justify-center space-x-2"
                  variant="outline"
                  size="lg"
                  data-testid="microsoft-login-button"
                >
                  <svg 
                    viewBox="0 0 24 24" 
                    className="w-5 h-5" 
                    fill="currentColor"
                  >
                    <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>
                  </svg>
                  <span>Continue with Microsoft</span>
                </Button>
                
                <div className="text-center text-sm text-muted-foreground">
                  <button 
                    type="button"
                    onClick={() => setIsBackdoorLogin(true)}
                    className="underline hover:no-underline"
                    data-testid="backdoor-toggle"
                  >
                    Developer Login
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="backdoor-user">Username</Label>
                    <Input 
                      id="backdoor-user"
                      value={backdoorUser}
                      onChange={(e) => setBackdoorUser(e.target.value)}
                      placeholder="Enter username"
                      data-testid="input-backdoor-user"
                    />
                  </div>
                  <div>
                    <Label htmlFor="backdoor-key">Key</Label>
                    <Input 
                      id="backdoor-key"
                      type="password"
                      value={backdoorKey}
                      onChange={(e) => setBackdoorKey(e.target.value)}
                      placeholder="Enter key"
                      data-testid="input-backdoor-key"
                    />
                  </div>
                </div>
                
                <Button 
                  onClick={handleBackdoorLogin}
                  className="w-full"
                  size="lg"
                  data-testid="button-backdoor-login"
                >
                  Developer Login
                </Button>
                
                <div className="text-center text-sm text-muted-foreground">
                  <button 
                    type="button"
                    onClick={() => setIsBackdoorLogin(false)}
                    className="underline hover:no-underline"
                    data-testid="slack-toggle"
                  >
                    Back to Slack Login
                  </button>
                </div>
              </>
            )}
            
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Join the <strong>whirkplace-pulse</strong> Slack channel to automatically get access
              </p>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-center space-x-4 text-sm text-muted-foreground">
                <div className="flex items-center space-x-1">
                  <Users className="w-4 h-4" />
                  <span>Team Check-ins</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Heart className="w-4 h-4" />
                  <span>Recognition</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          <p>By signing in, you agree to our terms of service</p>
        </div>
      </div>
    </div>
  );
}