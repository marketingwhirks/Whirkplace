import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, Users, ArrowLeft, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export default function SignupPage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<'choose' | 'create-org' | 'join-org'>('choose');
  const [orgData, setOrgData] = useState({
    organizationName: '',
    organizationSlug: '',
    firstName: '',
    lastName: '',
    email: '',
    password: ''
  });

  const createOrgMutation = useMutation({
    mutationFn: async (data: typeof orgData) => {
      return await apiRequest('/api/business/signup', 'POST', data);
    },
    onSuccess: (data) => {
      toast({
        title: "Organization created!",
        description: "Your organization has been created successfully. Redirecting to login...",
      });
      // Redirect to login with the new organization
      setTimeout(() => {
        setLocation(`/login?org=${orgData.organizationSlug}`);
      }, 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create organization",
        variant: "destructive",
      });
    }
  });

  const handleCreateOrg = () => {
    // Generate slug from organization name
    const slug = orgData.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    setOrgData(prev => ({ ...prev, organizationSlug: slug }));
    
    createOrgMutation.mutate({
      ...orgData,
      organizationSlug: slug
    });
  };

  const handleSlackSignup = () => {
    // For new org creation via Slack
    window.location.href = `/auth/slack/login?org=new&action=create`;
  };

  const handleMicrosoftSignup = () => {
    // For new org creation via Microsoft
    window.location.href = `/auth/microsoft?org=new&action=create`;
  };

  const urlParams = new URLSearchParams(window.location.search);
  const plan = urlParams.get('plan');

  if (step === 'choose') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 rounded-lg border-2 flex items-center justify-center" style={{backgroundColor: '#1b365d', borderColor: '#1b365d'}}>
                <Sparkles className="w-6 h-6" style={{fill: '#84ae56', stroke: '#84ae56'}} />
              </div>
            </div>
            <h1 className="text-3xl font-bold mb-2">Welcome to Whirkplace</h1>
            <p className="text-gray-600 dark:text-gray-400">
              {plan ? `Get started with the ${plan} plan` : 'Choose how you want to get started'}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card 
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setStep('create-org')}
              data-testid="card-create-org"
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Create New Organization
                </CardTitle>
                <CardDescription>
                  Start fresh with your own organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li>• Set up your company workspace</li>
                  <li>• Invite your team members</li>
                  <li>• Customize your settings</li>
                  <li>• Full administrative control</li>
                </ul>
                <Button className="w-full mt-4" variant="default">
                  Create Organization
                </Button>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setStep('join-org')}
              data-testid="card-join-org"
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Join Existing Organization
                </CardTitle>
                <CardDescription>
                  Connect with your team's workspace
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li>• Join your company's workspace</li>
                  <li>• Access team resources</li>
                  <li>• Collaborate with colleagues</li>
                  <li>• Get started immediately</li>
                </ul>
                <Button className="w-full mt-4" variant="outline">
                  Join Organization
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="text-center mt-6">
            <Button 
              variant="link" 
              onClick={() => setLocation('/login')}
              data-testid="button-back-login"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'create-org') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Create Your Organization</CardTitle>
            <CardDescription>
              Set up your company workspace and admin account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Quick signup with providers */}
              <div className="space-y-2">
                <Button 
                  onClick={handleSlackSignup}
                  className="w-full"
                  variant="outline"
                  data-testid="button-slack-signup"
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                  </svg>
                  Sign up with Slack
                </Button>
                
                <Button 
                  onClick={handleMicrosoftSignup}
                  className="w-full"
                  variant="outline"
                  data-testid="button-microsoft-signup"
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.4 11.4H0V0h11.4v11.4ZM24 11.4H12.6V0H24v11.4ZM11.4 24H0V12.6h11.4V24Zm12.6 0H12.6V12.6H24V24Z"/>
                  </svg>
                  Sign up with Microsoft 365
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or continue with email</span>
                </div>
              </div>

              {/* Manual signup form */}
              <div className="space-y-3">
                <div>
                  <Label htmlFor="orgName">Organization Name</Label>
                  <Input 
                    id="orgName"
                    placeholder="Acme Corporation"
                    value={orgData.organizationName}
                    onChange={(e) => setOrgData({...orgData, organizationName: e.target.value})}
                    data-testid="input-org-name"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input 
                      id="firstName"
                      placeholder="John"
                      value={orgData.firstName}
                      onChange={(e) => setOrgData({...orgData, firstName: e.target.value})}
                      data-testid="input-first-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input 
                      id="lastName"
                      placeholder="Doe"
                      value={orgData.lastName}
                      onChange={(e) => setOrgData({...orgData, lastName: e.target.value})}
                      data-testid="input-last-name"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="email">Work Email</Label>
                  <Input 
                    id="email"
                    type="email"
                    placeholder="john@acme.com"
                    value={orgData.email}
                    onChange={(e) => setOrgData({...orgData, email: e.target.value})}
                    data-testid="input-email"
                  />
                </div>
                
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input 
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={orgData.password}
                    onChange={(e) => setOrgData({...orgData, password: e.target.value})}
                    data-testid="input-password"
                  />
                </div>
                
                <Button 
                  onClick={handleCreateOrg}
                  className="w-full"
                  disabled={createOrgMutation.isPending || !orgData.organizationName || !orgData.email || !orgData.password}
                  data-testid="button-create-org"
                >
                  {createOrgMutation.isPending ? 'Creating...' : 'Create Organization'}
                </Button>
              </div>
              
              <Button 
                variant="link" 
                onClick={() => setStep('choose')}
                className="w-full"
                data-testid="button-back-choose"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'join-org') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Join an Organization</CardTitle>
            <CardDescription>
              Enter your organization's URL or code to join
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  Ask your administrator for your organization's URL. It usually looks like:
                  <br />
                  <code className="text-sm">yourcompany.whirkplace.com</code>
                </AlertDescription>
              </Alert>
              
              <div>
                <Label htmlFor="orgUrl">Organization URL</Label>
                <Input 
                  id="orgUrl"
                  placeholder="yourcompany.whirkplace.com"
                  data-testid="input-org-url"
                />
              </div>
              
              <Button 
                className="w-full"
                onClick={() => {
                  const input = document.getElementById('orgUrl') as HTMLInputElement;
                  const value = input?.value;
                  if (value) {
                    const orgSlug = value.split('.')[0];
                    setLocation(`/login?org=${orgSlug}`);
                  }
                }}
                data-testid="button-join"
              >
                Continue to Login
              </Button>
              
              <Button 
                variant="link" 
                onClick={() => setStep('choose')}
                className="w-full"
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return null;
}