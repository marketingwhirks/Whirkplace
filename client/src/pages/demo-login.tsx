import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { User, Shield, Users, ArrowLeft, LogIn, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { queryClient } from "@/lib/queryClient";

interface DemoAccount {
  role: string;
  name: string;
  email: string;
  description: string;
  permissions: string[];
  icon: any;
  color: string;
}

export default function DemoLoginPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedAccount, setSelectedAccount] = useState<number>(0);
  const [email, setEmail] = useState("john@delicious.com");
  const [password, setPassword] = useState("Demo1234!");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const demoAccounts: DemoAccount[] = [
    {
      role: "Account Owner",
      name: "John Delicious",
      email: "john@delicious.com",
      description: "Full control over organization settings and user management",
      permissions: [
        "Transfer account ownership",
        "Manage all settings",
        "View all analytics",
        "Manage users and teams"
      ],
      icon: Shield,
      color: "text-purple-500"
    },
    {
      role: "Admin",
      name: "Sarah Delicious",
      email: "sarah@delicious.com",
      description: "Manage teams, users, and most organization settings",
      permissions: [
        "Manage teams and users",
        "View analytics",
        "Configure settings",
        "Cannot transfer ownership"
      ],
      icon: User,
      color: "text-blue-500"
    },
    {
      role: "Team Member",
      name: "Mike Delicious",
      email: "mike@delicious.com",
      description: "Regular user with access to check-ins and team features",
      permissions: [
        "Submit check-ins",
        "Share wins",
        "Give kudos",
        "View team dashboard"
      ],
      icon: Users,
      color: "text-green-500"
    }
  ];

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
      toast({
        description: "Copied to clipboard",
      });
    } catch (err) {
      toast({
        description: "Failed to copy",
        variant: "destructive"
      });
    }
  };

  const handleQuickLogin = (accountIndex: number) => {
    setSelectedAccount(accountIndex);
    setEmail(demoAccounts[accountIndex].email);
    setPassword("Demo1234!");
  };

  // Ensure form is initialized with demo account on mount
  useEffect(() => {
    // Clear any cached form data
    const emailInput = document.getElementById('demo-email') as HTMLInputElement;
    const passwordInput = document.getElementById('demo-password') as HTMLInputElement;
    
    if (emailInput) {
      emailInput.value = demoAccounts[0].email;
      setEmail(demoAccounts[0].email);
    }
    if (passwordInput) {
      passwordInput.value = "Demo1234!";
      setPassword("Demo1234!");
    }
    
    // Force re-render to override any browser autofill
    setTimeout(() => {
      setEmail(demoAccounts[0].email);
      setPassword("Demo1234!");
    }, 100);
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    setIsLoading(true);
    try {
      // Clear any existing auth data
      localStorage.clear();
      sessionStorage.clear();
      queryClient.clear();

      const response = await fetch("/auth/local/login?org=fictitious-delicious", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ email, password })
      });

      console.log("Login response status:", response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log("Login response data:", data);
        
        // Store auth info in localStorage as cookies aren't working in Replit
        if (data.user?.id) {
          localStorage.setItem('auth_user_id', data.user.id);
          localStorage.setItem('auth_user_name', data.user.name);
          localStorage.setItem('auth_user_email', data.user.email);
          localStorage.setItem('auth_user_role', data.user.role);
          localStorage.setItem('auth_organization_id', 'fictitious-delicious');
          localStorage.setItem('auth_organization_slug', 'fictitious-delicious');
          console.log("Stored auth in localStorage:", data.user.id);
        }
        
        toast({ 
          title: "Welcome to the demo!", 
          description: `Logged in as ${data.user.name}` 
        });
        
        // Force page reload to ensure auth is picked up
        // Use the hardcoded organization ID for demo users
        window.location.href = '/dashboard';
      } else {
        const error = await response.json();
        console.error("Login failed:", error);
        toast({ 
          title: "Login failed", 
          description: error.message || "Invalid credentials",
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      console.error("Login error:", error);
      toast({ 
        title: "Login failed", 
        description: "Network error. Please try again.",
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Direct login function that bypasses form to avoid browser autofill
  const handleLoginDirect = async (demoEmail: string, demoPassword: string) => {
    setIsLoading(true);
    try {
      // Clear any existing auth data
      localStorage.clear();
      sessionStorage.clear();
      queryClient.clear();

      const response = await fetch("/auth/local/login?org=fictitious-delicious", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ email: demoEmail, password: demoPassword })
      });

      console.log("Direct login response status:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("Direct login response data:", data);
        
        // Store auth info in localStorage as cookies aren't working in Replit
        if (data.user?.id) {
          localStorage.setItem('auth_user_id', data.user.id);
          localStorage.setItem('auth_user_name', data.user.name);
          localStorage.setItem('auth_user_email', data.user.email);
          localStorage.setItem('auth_user_role', data.user.role);
          localStorage.setItem('auth_organization_id', 'b74d00fd-e1ce-41ae-afca-4a0d55cb1fe1');
          console.log("Stored auth in localStorage (direct):", data.user.id);
        }
        
        toast({ 
          title: "Welcome to the demo!", 
          description: `Logged in as ${data.user.name}` 
        });
        
        // Force page reload to ensure auth is picked up
        // Use the hardcoded organization ID for demo users
        window.location.href = '/dashboard';
      } else {
        const error = await response.json();
        console.error("Direct login failed:", error);
        toast({ 
          title: "Login failed", 
          description: error.message || "Invalid credentials",
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      console.error("Direct login error:", error);
      toast({ 
        title: "Login failed", 
        description: "Network error. Please try again.",
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-5xl">
        {/* Back Button */}
        <Link href="/demo">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Demo Overview
          </Button>
        </Link>

        {/* Main Content */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Side - Account Selection */}
          <div className="space-y-4">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold">Demo Login</h1>
              <p className="text-muted-foreground">
                Choose a demo account to explore Whirkplace with different permission levels
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Demo Organization</CardTitle>
                <CardDescription>
                  <Badge variant="secondary">Fictitious Delicious</Badge>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="0" value={selectedAccount.toString()} onValueChange={(v) => handleQuickLogin(parseInt(v))}>
                  <TabsList className="grid grid-cols-3 w-full">
                    {demoAccounts.map((account, index) => (
                      <TabsTrigger key={index} value={index.toString()} className="text-xs">
                        {account.role}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {demoAccounts.map((account, index) => {
                    const Icon = account.icon;
                    return (
                      <TabsContent key={index} value={index.toString()} className="space-y-4">
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-lg bg-muted ${account.color}`}>
                            <Icon className="w-6 h-6" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg">{account.name}</h3>
                            <p className="text-sm text-muted-foreground">{account.description}</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-medium">Permissions:</p>
                          <ul className="space-y-1">
                            {account.permissions.map((permission, i) => (
                              <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Check className="w-3 h-3 text-green-500" />
                                {permission}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="space-y-3 p-4 bg-muted rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-muted-foreground">Email</p>
                              <p className="font-mono text-sm">{account.email}</p>
                            </div>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => handleCopy(account.email, `email-${index}`)}
                            >
                              {copiedField === `email-${index}` ? 
                                <Check className="w-4 h-4" /> : 
                                <Copy className="w-4 h-4" />
                              }
                            </Button>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-muted-foreground">Password</p>
                              <p className="font-mono text-sm">Demo1234!</p>
                            </div>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => handleCopy("Demo1234!", `password-${index}`)}
                            >
                              {copiedField === `password-${index}` ? 
                                <Check className="w-4 h-4" /> : 
                                <Copy className="w-4 h-4" />
                              }
                            </Button>
                          </div>
                        </div>

                        <Button 
                          className="w-full" 
                          onClick={() => {
                            // Directly use demo credentials, bypassing form
                            setEmail(account.email);
                            setPassword("Demo1234!");
                            setTimeout(() => handleLoginDirect(account.email, "Demo1234!"), 50);
                          }}
                          disabled={isLoading}
                        >
                          <LogIn className="w-4 h-4 mr-2" />
                          {isLoading ? "Logging in..." : `Login as ${account.name}`}
                        </Button>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Right Side - Manual Login */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Manual Login</CardTitle>
                <CardDescription>
                  Or enter credentials manually
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4" autoComplete="new-password">
                  <div className="space-y-2">
                    <Label htmlFor="demo-email">Email</Label>
                    <Input 
                      id="demo-email"
                      type="email"
                      name="demo-email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter email"
                      autoComplete="new-password"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      data-testid="input-demo-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="demo-password">Password</Label>
                    <Input 
                      id="demo-password"
                      type="password"
                      name="demo-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      autoComplete="new-password"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      data-testid="input-demo-password"
                    />
                  </div>
                  <Button 
                    type="submit"
                    className="w-full" 
                    disabled={isLoading}
                    data-testid="button-demo-login"
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    {isLoading ? "Logging in..." : "Login"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-lg">Need Your Own Account?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  This is a demo environment with sample data. To create your own organization:
                </p>
                <div className="flex gap-2">
                  <Link href="/signup" className="flex-1">
                    <Button variant="outline" className="w-full">
                      Sign Up
                    </Button>
                  </Link>
                  <Link href="/login" className="flex-1">
                    <Button variant="outline" className="w-full">
                      Sign In
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}