import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Heart, Users } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

export default function LoginPage() {
  const [backdoorUser, setBackdoorUser] = useState('');
  const [backdoorKey, setBackdoorKey] = useState('');
  const [isBackdoorLogin, setIsBackdoorLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const { toast } = useToast();

  // Check if this is sign-up mode from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('signup') === 'true') {
      setIsSignUpMode(true);
    }
  }, []);
  
  const handleSlackLogin = () => {
    // Redirect to the Slack OAuth endpoint
    window.location.href = "/auth/slack/login?org=default-org";
  };
  
  const handleMicrosoftLogin = () => {
    // Redirect to the Microsoft OAuth endpoint with organization parameter
    window.location.href = "/auth/microsoft?org=default-org";
  };
  
  const handleSimpleLogin = async () => {
    try {
      // This would be the regular user login for Starter plan users
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ email, password, organizationSlug: 'default-org' })
      });
      
      if (response.ok) {
        const data = await response.json();
        toast({ title: "Welcome back!", description: "Login successful" });
        
        // Clear cached data and redirect
        queryClient.clear();
        window.location.href = "/";
      } else {
        const error = await response.json();
        toast({ 
          title: "Login failed", 
          description: error.message,
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: `Login failed: ${error?.message || 'Unknown error'}`,
        variant: "destructive" 
      });
    }
  };

  const handleSignUp = async () => {
    if (password !== confirmPassword) {
      toast({ 
        title: "Password mismatch", 
        description: "Passwords do not match",
        variant: "destructive" 
      });
      return;
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ email, password, organizationSlug: 'default-org' })
      });
      
      if (response.ok) {
        const data = await response.json();
        toast({ title: "Welcome!", description: "Account created successfully" });
        
        // Clear cached data and redirect
        queryClient.clear();
        window.location.href = "/";
      } else {
        const error = await response.json();
        toast({ 
          title: "Sign up failed", 
          description: error.message,
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: `Sign up failed: ${error?.message || 'Unknown error'}`,
        variant: "destructive" 
      });
    }
  };

  const handleBackdoorLogin = async () => {
    try {
      console.log("🔄 Starting FRESH backdoor login with:", { username: backdoorUser, key: backdoorKey.substring(0, 3) + "***" });
      console.log("🌐 Making request to:", `${window.location.origin}/auth/dev-login-fresh?org=default-org`);
      
      const response = await fetch('/auth/dev-login-fresh?org=default-org', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ username: backdoorUser, key: backdoorKey })
      });
      
      console.log("📡 Response received:", { 
        status: response.status, 
        statusText: response.statusText,
        ok: response.ok 
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("✅ Login successful, data:", data);
        toast({ title: "Success", description: data.message });
        
        // Clear all cached data and force fresh authentication
        queryClient.clear();
        
        // Clear any role switching state from previous sessions
        sessionStorage.removeItem('viewAsRole');
        
        console.log("🚀 Login successful! Storing user data...");
        
        // BYPASS COOKIE ISSUES: Store authentication in localStorage for immediate access
        localStorage.setItem('auth_user_id', data.user.id);
        localStorage.setItem('auth_user_data', JSON.stringify(data.user));
        
        // Clear cached queries and redirect immediately
        queryClient.clear();
        
        console.log("🔄 Redirecting to dashboard...");
        window.location.href = "/";
      } else {
        console.error("❌ Login failed with status:", response.status);
        const error = await response.json();
        console.error("❌ Error details:", error);
        toast({ 
          title: "Login failed", 
          description: error.message,
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      console.error("🚨 Network/Fetch error:", error);
      console.error("🚨 Error type:", error?.name);
      console.error("🚨 Error message:", error?.message);
      toast({ 
        title: "Error", 
        description: `Network error: ${error?.message || 'Unknown error'}`,
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
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{backgroundColor: '#1b365d'}}>
              <Heart className="w-6 h-6 fill-accent stroke-accent" strokeWidth="2" />
            </div>
            <h1 className="text-3xl font-bold" style={{color: '#1b365d'}}>WhirkPlace</h1>
          </div>
          <p className="text-muted-foreground">
            Welcome to your team culture platform
          </p>
        </div>

        {/* Login Card */}
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle>{isSignUpMode ? 'Create Your Account' : 'Sign In to Whirkplace'}</CardTitle>
            <CardDescription>
              {isSignUpMode ? 'Get started with your team culture platform' : 'Sign in with your work account or email'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isBackdoorLogin ? (
              <>
                {/* SSO Options */}
                <div className="space-y-3">
                  <Button 
                    onClick={handleSlackLogin}
                    className="w-full flex items-center justify-center space-x-2 bg-[#4A154B] hover:bg-[#350d36] text-white border-[#4A154B]"
                    size="lg"
                    data-testid="slack-login-button"
                  >
                    <svg 
                      viewBox="0 0 24 24" 
                      className="w-5 h-5" 
                      fill="white"
                    >
                      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52-2.523c0-1.398 1.13-2.528 2.52-2.528h2.52v2.528c0 1.393-1.122 2.523-2.52 2.523Zm0 0a2.528 2.528 0 0 1-2.52 2.523c0-1.398 1.13-2.528 2.52-2.528v2.528h2.52c1.398 0 2.528-1.13 2.528-2.523a2.528 2.528 0 0 1-2.528-2.52H5.042v2.52Z"/>
                      <path d="M8.958 8.835a2.528 2.528 0 0 1 2.523-2.52c1.398 0 2.528 1.13 2.528 2.52v2.52h-2.528a2.528 2.528 0 0 1-2.523-2.52Zm0 0a2.528 2.528 0 0 1-2.523-2.52c1.398 0 2.528 1.13 2.528 2.52H8.958v2.52c0 1.398-1.13 2.528-2.523 2.528a2.528 2.528 0 0 1 2.523-2.528v-2.52Z"/>
                      <path d="M15.165 18.958a2.528 2.528 0 0 1 2.523 2.52c0-1.398 1.13-2.528 2.523-2.528a2.528 2.528 0 0 1-2.523-2.52v-2.52h2.523c1.398 0 2.528 1.13 2.528 2.20a2.528 2.528 0 0 1-2.528 2.523h-2.523v2.523Z"/>
                      <path d="M18.958 8.835a2.528 2.528 0 0 1-2.52-2.523c0 1.398-1.13 2.528-2.523 2.528a2.528 2.528 0 0 1 2.523 2.52v2.52h-2.523c-1.398 0-2.528-1.13-2.528-2.52a2.528 2.528 0 0 1 2.528 2.523h2.52V8.835Z"/>
                    </svg>
                    <span>{isSignUpMode ? 'Sign up with Slack' : 'Continue with Slack'}</span>
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
                    <span>{isSignUpMode ? 'Sign up with Microsoft' : 'Continue with Microsoft'}</span>
                  </Button>
                </div>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">{isSignUpMode ? 'Or sign up with email' : 'Or sign in with email'}</span>
                  </div>
                </div>

                {/* Email/Password Login */}
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input 
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      data-testid="input-email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input 
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isSignUpMode ? "Create a password" : "Enter your password"}
                      data-testid="input-password"
                    />
                  </div>
                  {isSignUpMode && (
                    <div>
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <Input 
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm your password"
                        data-testid="input-confirm-password"
                      />
                    </div>
                  )}
                </div>
                
                <Button 
                  onClick={isSignUpMode ? handleSignUp : handleSimpleLogin}
                  className="w-full"
                  size="lg"
                  disabled={!email || !password || (isSignUpMode && !confirmPassword)}
                  data-testid={isSignUpMode ? "button-sign-up" : "button-simple-login"}
                >
                  {isSignUpMode ? 'Create Account' : 'Sign In'}
                </Button>
                
                <div className="text-center text-sm text-muted-foreground">
                  {isSignUpMode ? (
                    <span>
                      Already have an account?{' '}
                      <button 
                        type="button"
                        onClick={() => setIsSignUpMode(false)}
                        className="underline hover:no-underline text-primary"
                        data-testid="switch-to-signin"
                      >
                        Sign in here
                      </button>
                    </span>
                  ) : (
                    <span>
                      Don't have an account?{' '}
                      <button 
                        type="button"
                        onClick={() => setIsSignUpMode(true)}
                        className="underline hover:no-underline text-primary"
                        data-testid="switch-to-signup"
                      >
                        Sign up here
                      </button>
                    </span>
                  )}
                </div>
                
                {/* Only show Developer Login in development */}
                {import.meta.env.MODE === 'development' && (
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
                )}
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
                    data-testid="back-toggle"
                  >
                    Back to Login
                  </button>
                </div>
              </>
            )}

            <div className="border-t pt-4">
              <div className="flex items-center justify-center space-x-4 text-sm text-muted-foreground">
                <div className="flex items-center space-x-1">
                  <Users className="w-4 h-4" />
                  <span>Team Check-ins</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Heart className="w-4 h-4 fill-accent stroke-accent" />
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