import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Heart, Users, Building2, ArrowRight, Play } from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
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
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [authProviders, setAuthProviders] = useState<any[]>([]);
  const [loginStep, setLoginStep] = useState<'organization' | 'auth'>('auth');
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  // Check if this is sign-up mode from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('signup') === 'true') {
      setIsSignUpMode(true);
    }
    
    // Get plan parameter to restrict signup options
    const plan = urlParams.get('plan');
    setSelectedPlan(plan);
    
    // Get organization from URL or subdomain
    const orgParam = urlParams.get('org');
    if (orgParam) {
      setOrganizationSlug(orgParam);
      fetchAuthProviders(orgParam);
    } else {
      // Check subdomain
      const hostname = window.location.hostname;
      if (hostname.includes('.whirkplace.com') && 
          !hostname.startsWith('www.') && 
          !hostname.startsWith('app.')) {
        const subdomain = hostname.split('.')[0];
        if (subdomain && subdomain !== 'whirkplace') {
          setOrganizationSlug(subdomain);
          fetchAuthProviders(subdomain);
        }
      } else {
        // Default: Show basic auth providers for general login
        setAuthProviders([
          { provider: 'local', enabled: true }
        ]);
      }
    }
    
    // Only clear auth if explicitly logging out
    if (urlParams.get('logout') === 'true') {
      clearOldAuthTokens();
    }
  }, []);
  
  const fetchAuthProviders = async (slug: string) => {
    setIsLoadingProviders(true);
    try {
      const response = await fetch(`/api/auth/providers/${slug}`);
      if (response.ok) {
        const data = await response.json();
        setAuthProviders(data.providers || []);
        setLoginStep('auth');
      } else {
        // Organization not found or error
        toast({ 
          title: "Organization not found", 
          description: "Please check your organization name and try again",
          variant: "destructive" 
        });
      }
    } catch (error) {
      console.error('Failed to fetch auth providers:', error);
      toast({ 
        title: "Error", 
        description: "Failed to load authentication options",
        variant: "destructive" 
      });
    } finally {
      setIsLoadingProviders(false);
    }
  };

  const handleOrganizationSubmit = () => {
    const normalizedSlug = organizationSlug.trim().toLowerCase();
    if (!normalizedSlug) {
      toast({ 
        title: "Organization required", 
        description: "Please enter your organization name",
        variant: "destructive" 
      });
      return;
    }
    setOrganizationSlug(normalizedSlug);
    fetchAuthProviders(normalizedSlug);
  };

  const clearOldAuthTokens = () => {
    // Clear any old authentication tokens from localStorage
    const itemsToRemove = [
      'whirkplace-auth-token',
      'whirkplace-user-id', 
      'auth-token',
      'user-id',
      'auth_user_id',
      'auth_org_id',
      'demo_token',  // Clear demo authentication
      'demo_user',   // Clear demo user data
      'demo_org'     // Clear demo organization
    ];
    
    itemsToRemove.forEach(item => {
      localStorage.removeItem(item);
      sessionStorage.removeItem(item);
    });
    
    console.log('🧹 Cleared old authentication tokens from storage');
  };
  
  const clearAuthData = async () => {
    try {
      // Clear localStorage/sessionStorage
      clearOldAuthTokens();
      
      // Clear server-side authentication data
      await fetch('/api/auth/clear', {
        method: 'POST',
        credentials: 'include'
      });
      
      console.log('🧹 Cleared all authentication data');
    } catch (error) {
      console.log('Note: Could not clear server auth data (this is normal for new sessions)');
    }
  };
  
  const handleSlackLogin = () => {
    // Clear any existing demo tokens before Slack authentication
    localStorage.removeItem('demo_token');
    localStorage.removeItem('demo_user');
    localStorage.removeItem('demo_org');
    
    // Include the org parameter in the Slack auth URL
    const url = `/auth/slack/login?org=${organizationSlug}`;
    console.log('Initiating Slack login for org:', organizationSlug);
    window.location.href = url;
  };
  
  const handleMicrosoftLogin = () => {
    // Clear any existing demo tokens before Microsoft authentication
    localStorage.removeItem('demo_token');
    localStorage.removeItem('demo_user');
    localStorage.removeItem('demo_org');
    
    // Redirect to the Microsoft OAuth endpoint with organization parameter
    console.log('Initiating Microsoft login for org:', organizationSlug);
    window.location.href = `/auth/microsoft?org=${organizationSlug}`;
  };
  
  const handleSimpleLogin = async () => {
    try {
      // Clear any old authentication data first
      await clearAuthData();
      
      // Always use the standard login endpoint
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Show super admin welcome if applicable
        if (data.user?.isSuperAdmin) {
          toast({ 
            title: "Welcome, Super Admin!", 
            description: `Logged in as ${data.user.name}` 
          });
        } else {
          toast({ title: "Welcome back!", description: "Login successful" });
        }
        
        // Store user data for client-side use including auth token for session persistence
        if (data.user) {
          localStorage.setItem('whirkplace-user', JSON.stringify(data.user));
          // Store auth data for session persistence in Replit environment
          // Use consistent key that queryClient expects
          localStorage.setItem('auth_user_id', data.user.id);
          localStorage.setItem('auth_user_data', JSON.stringify(data.user));
        }
        
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

    // Clear any existing demo tokens before sign up
    localStorage.removeItem('demo_token');
    localStorage.removeItem('demo_user');
    localStorage.removeItem('demo_org');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ email, password, organizationSlug: 'default' })
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
    // Clear any existing demo tokens before backdoor login
    localStorage.removeItem('demo_token');
    localStorage.removeItem('demo_user');
    localStorage.removeItem('demo_org');
    
    try {
      console.log("🔄 Starting FRESH backdoor login with:", { username: backdoorUser, key: backdoorKey.substring(0, 3) + "***" });
      console.log("🌐 Making request to:", `${window.location.origin}/api/auth/dev-login-fresh?org=${organizationSlug || 'whirkplace'}`);
      
      const response = await fetch(`/api/auth/dev-login-fresh?org=${organizationSlug || 'whirkplace'}`, {
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
            <h1 className="text-3xl font-bold text-[#1b365d] dark:text-white">Whirkplace</h1>
          </div>
          <p className="text-muted-foreground">
            Welcome to your team culture platform
          </p>
        </div>

        {/* Login Card */}
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle>
              {isSignUpMode ? 'Create Your Account' : 
               loginStep === 'organization' ? 'Welcome to Whirkplace' : 
               'Sign In to Whirkplace'}
            </CardTitle>
            <CardDescription>
              {isSignUpMode ? 'Get started with your team culture platform' : 
               loginStep === 'organization' ? 'Enter your organization to continue' :
               organizationSlug ? `Signing in to ${organizationSlug}` : 'Sign in to your account'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isBackdoorLogin ? (
              loginStep === 'organization' ? (
                /* Step 1: Organization Selection */
                <>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="organization">Organization Name</Label>
                      <div className="flex space-x-2">
                        <Input 
                          id="organization"
                          type="text"
                          value={organizationSlug}
                          onChange={(e) => setOrganizationSlug(e.target.value)}
                          placeholder="e.g., acme-corp or acme"
                          onKeyDown={(e) => e.key === 'Enter' && handleOrganizationSubmit()}
                          data-testid="input-organization"
                        />
                        <Button 
                          onClick={handleOrganizationSubmit}
                          disabled={!organizationSlug || isLoadingProviders}
                          data-testid="button-continue"
                        >
                          {isLoadingProviders ? 'Loading...' : <ArrowRight className="w-4 h-4" />}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Enter your company or team name as provided by your administrator
                      </p>
                    </div>
                  </div>

                  {/* Demo and Sign up options */}
                  <div className="space-y-3 pt-4 border-t">
                    <div className="text-center">
                      <Link href="/demo">
                        <Button 
                          variant="outline" 
                          className="w-full"
                          type="button"
                          data-testid="button-try-demo"
                        >
                          <Play className="w-4 h-4 mr-2" />
                          Try Live Demo
                        </Button>
                      </Link>
                    </div>
                    <div className="text-center text-sm text-muted-foreground">
                      <span>
                        New to Whirkplace?{' '}
                        <button 
                          type="button"
                          onClick={() => setLocation('/signup')}
                          className="underline hover:no-underline text-primary"
                          data-testid="link-signup"
                        >
                          Create a new organization
                        </button>
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                /* Step 2: Authentication Methods */
                <>
                  {/* Show available auth providers */}
                  <div className="space-y-3">
                    {/* Slack login option */}
                    {authProviders.find(p => p.provider === 'slack' && p.enabled) && (
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
                          <path d="M15.165 18.958a2.528 2.528 0 0 1 2.523 2.52c0-1.398 1.13-2.528 2.523-2.528a2.528 2.528 0 0 1-2.523-2.52v-2.52h2.523c1.398 0 2.528 1.13 2.528 2.52a2.528 2.528 0 0 1-2.528 2.523h-2.523v2.523Z"/>
                          <path d="M18.958 8.835a2.528 2.528 0 0 1-2.52-2.523c0 1.398-1.13 2.528-2.523 2.528a2.528 2.528 0 0 1 2.523 2.52v2.52h-2.523c-1.398 0-2.528-1.13-2.528-2.52a2.528 2.528 0 0 1 2.528 2.523h2.52V8.835Z"/>
                        </svg>
                        <span>Continue with Slack</span>
                      </Button>
                    )}

                    {/* Microsoft login option */}
                    {authProviders.find(p => p.provider === 'microsoft' && p.enabled) && (
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
                    )}

                    {/* Google login option */}
                    {authProviders.find(p => p.provider === 'google' && p.enabled) && (
                      <Button 
                        onClick={() => {
                          // Clear any existing demo tokens before Google authentication
                          localStorage.removeItem('demo_token');
                          localStorage.removeItem('demo_user');
                          localStorage.removeItem('demo_org');
                          window.location.href = `/auth/google?org=${organizationSlug}`;
                        }}
                        className="w-full flex items-center justify-center space-x-2"
                        variant="outline"
                        size="lg"
                        data-testid="google-login-button"
                      >
                        <svg viewBox="0 0 24 24" className="w-5 h-5">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <span>Continue with Google</span>
                      </Button>
                    )}
                  </div>

                  {/* Show email/password login if local provider is enabled */}
                  {authProviders.find(p => p.provider === 'local' && p.enabled) && (
                    <>
                      {/* Divider if there are other auth providers */}
                      {authProviders.filter(p => p.enabled && p.provider !== 'local').length > 0 && (
                        <div className="relative">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">Or sign in with email</span>
                          </div>
                        </div>
                      )}

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
                          <div className="flex items-center justify-between mb-2">
                            <Label htmlFor="password">Password</Label>
                            <button
                              type="button"
                              onClick={() => setLocation('/forgot-password')}
                              className="text-sm text-primary hover:underline"
                              data-testid="forgot-password-link"
                            >
                              Forgot password?
                            </button>
                          </div>
                          <Input 
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            data-testid="input-password"
                          />
                        </div>
                      </div>
                      
                      <Button 
                        onClick={handleSimpleLogin}
                        className="w-full"
                        size="lg"
                        disabled={!email || !password}
                        data-testid="button-simple-login"
                      >
                        Sign In
                      </Button>
                    </>
                  )}

                  {/* Organization-specific login link and signup */}
                  <div className="space-y-2 text-center text-sm text-muted-foreground pt-4 border-t">
                    {!organizationSlug && (
                      <div>
                        <span>Have an organization account? </span>
                        <button 
                          type="button"
                          onClick={() => {
                            setLoginStep('organization');
                            setAuthProviders([]);
                            setOrganizationSlug('');
                          }}
                          className="underline hover:no-underline text-primary"
                          data-testid="org-specific-login"
                        >
                          Sign in with organization
                        </button>
                      </div>
                    )}
                    {organizationSlug && (
                      <button 
                        type="button"
                        onClick={() => {
                          setLoginStep('auth');
                          setAuthProviders([{ provider: 'local', enabled: true }]);
                          setOrganizationSlug('');
                        }}
                        className="underline hover:no-underline"
                        data-testid="back-to-general-login"
                      >
                        ← Use different login method
                      </button>
                    )}
                    <div>
                      <span>New to Whirkplace? </span>
                      <Link href="/signup" className="underline hover:no-underline text-primary">
                        Create an account
                      </Link>
                    </div>
                    <div>
                      <Link href="/demo">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="mt-2"
                          type="button"
                          data-testid="button-try-demo"
                        >
                          <Play className="w-4 h-4 mr-2" />
                          Try Live Demo
                        </Button>
                      </Link>
                    </div>
                  </div>
                </>
              )
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
        <div className="text-center text-sm text-muted-foreground space-y-2">
          <p>By signing in, you agree to our terms of service</p>
          <div className="flex items-center justify-center gap-4">
            <button 
              onClick={() => window.location.href = "/"} 
              className="underline hover:no-underline text-primary"
              data-testid="link-home"
              type="button"
            >
              ← Back to Home
            </button>
            <span className="text-muted-foreground">|</span>
            <Link href="/demo">
              <button 
                className="underline hover:no-underline text-primary"
                data-testid="link-demo-footer"
                type="button"
              >
                Try Demo →
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}