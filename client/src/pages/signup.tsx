import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, ArrowLeft, Heart, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export default function SignupPage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [orgData, setOrgData] = useState({
    organizationName: '',
    organizationSlug: '',
    organizationSize: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false,
    subscribeNewsletter: false
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!orgData.organizationName) {
      newErrors.organizationName = 'Organization name is required';
    }
    if (!orgData.organizationSize) {
      newErrors.organizationSize = 'Please select organization size';
    }
    if (!orgData.firstName) {
      newErrors.firstName = 'First name is required';
    }
    if (!orgData.lastName) {
      newErrors.lastName = 'Last name is required';
    }
    if (!orgData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(orgData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!orgData.password) {
      newErrors.password = 'Password is required';
    } else if (orgData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    if (!orgData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (orgData.password !== orgData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    if (!orgData.acceptTerms) {
      newErrors.acceptTerms = 'You must accept the terms and conditions';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const createOrgMutation = useMutation({
    mutationFn: async (data: typeof orgData) => {
      const response = await apiRequest('POST', '/api/business/signup', data);
      return await response.json();
    },
    onSuccess: (data) => {
      // Store authentication in localStorage
      if (data.userId) {
        localStorage.setItem('auth_user_id', data.userId);
      }
      if (data.organizationId) {
        localStorage.setItem('auth_org_id', data.organizationId);
      }
      
      toast({
        title: "Welcome to Whirkplace!",
        description: "Your organization has been created successfully.",
      });
      
      // Redirect to onboarding
      setLocation(`/onboarding?org=${orgData.organizationSlug}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create organization",
        variant: "destructive",
      });
    }
  });

  const handleCreateOrg = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 rounded-lg border-2 flex items-center justify-center" style={{backgroundColor: '#1b365d', borderColor: '#1b365d'}}>
              <Heart className="w-6 h-6 fill-accent stroke-accent" strokeWidth="2" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2">Create Your Organization</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Start your team wellness journey with Whirkplace
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organization Setup
            </CardTitle>
            <CardDescription>
              Create your workspace and admin account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateOrg} className="space-y-4">
              {/* Organization Info */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="orgName">Organization Name *</Label>
                  <Input 
                    id="orgName"
                    placeholder="Acme Corporation"
                    value={orgData.organizationName}
                    onChange={(e) => {
                      setOrgData({...orgData, organizationName: e.target.value});
                      if (errors.organizationName) {
                        setErrors({...errors, organizationName: ''});
                      }
                    }}
                    className={errors.organizationName ? 'border-red-500' : ''}
                    data-testid="input-org-name"
                  />
                  {errors.organizationName && (
                    <p className="text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.organizationName}
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="orgSize">Organization Size *</Label>
                  <Select 
                    value={orgData.organizationSize}
                    onValueChange={(value) => {
                      setOrgData({...orgData, organizationSize: value});
                      if (errors.organizationSize) {
                        setErrors({...errors, organizationSize: ''});
                      }
                    }}
                  >
                    <SelectTrigger id="orgSize" className={errors.organizationSize ? 'border-red-500' : ''} data-testid="select-org-size">
                      <SelectValue placeholder="Select team size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-10">1-10 employees</SelectItem>
                      <SelectItem value="11-50">11-50 employees</SelectItem>
                      <SelectItem value="51-200">51-200 employees</SelectItem>
                      <SelectItem value="201-500">201-500 employees</SelectItem>
                      <SelectItem value="501+">501+ employees</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.organizationSize && (
                    <p className="text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.organizationSize}
                    </p>
                  )}
                </div>
              </div>

              {/* Admin User Info */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-medium">Administrator Account</h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input 
                      id="firstName"
                      placeholder="John"
                      value={orgData.firstName}
                      onChange={(e) => {
                        setOrgData({...orgData, firstName: e.target.value});
                        if (errors.firstName) {
                          setErrors({...errors, firstName: ''});
                        }
                      }}
                      className={errors.firstName ? 'border-red-500' : ''}
                      data-testid="input-first-name"
                    />
                    {errors.firstName && (
                      <p className="text-sm text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {errors.firstName}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input 
                      id="lastName"
                      placeholder="Doe"
                      value={orgData.lastName}
                      onChange={(e) => {
                        setOrgData({...orgData, lastName: e.target.value});
                        if (errors.lastName) {
                          setErrors({...errors, lastName: ''});
                        }
                      }}
                      className={errors.lastName ? 'border-red-500' : ''}
                      data-testid="input-last-name"
                    />
                    {errors.lastName && (
                      <p className="text-sm text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {errors.lastName}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Work Email *</Label>
                  <Input 
                    id="email"
                    type="email"
                    placeholder="john@acme.com"
                    value={orgData.email}
                    onChange={(e) => {
                      setOrgData({...orgData, email: e.target.value});
                      if (errors.email) {
                        setErrors({...errors, email: ''});
                      }
                    }}
                    className={errors.email ? 'border-red-500' : ''}
                    data-testid="input-email"
                  />
                  {errors.email && (
                    <p className="text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.email}
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <Input 
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={orgData.password}
                    onChange={(e) => {
                      setOrgData({...orgData, password: e.target.value});
                      if (errors.password) {
                        setErrors({...errors, password: ''});
                      }
                    }}
                    className={errors.password ? 'border-red-500' : ''}
                    data-testid="input-password"
                  />
                  {errors.password && (
                    <p className="text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.password}
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password *</Label>
                  <Input 
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={orgData.confirmPassword}
                    onChange={(e) => {
                      setOrgData({...orgData, confirmPassword: e.target.value});
                      if (errors.confirmPassword) {
                        setErrors({...errors, confirmPassword: ''});
                      }
                    }}
                    className={errors.confirmPassword ? 'border-red-500' : ''}
                    data-testid="input-confirm-password"
                  />
                  {errors.confirmPassword && (
                    <p className="text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>
              </div>

              {/* Terms and Newsletter */}
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-start space-x-2">
                  <Checkbox 
                    id="acceptTerms"
                    checked={orgData.acceptTerms}
                    onCheckedChange={(checked) => {
                      setOrgData({...orgData, acceptTerms: checked as boolean});
                      if (errors.acceptTerms) {
                        setErrors({...errors, acceptTerms: ''});
                      }
                    }}
                    className={errors.acceptTerms ? 'border-red-500' : ''}
                    data-testid="checkbox-accept-terms"
                  />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="acceptTerms" className="text-sm">
                      I accept the terms and conditions *
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      By creating an account, you agree to our terms of service and privacy policy
                    </p>
                    {errors.acceptTerms && (
                      <p className="text-sm text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {errors.acceptTerms}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-start space-x-2">
                  <Checkbox 
                    id="subscribeNewsletter"
                    checked={orgData.subscribeNewsletter}
                    onCheckedChange={(checked) => setOrgData({...orgData, subscribeNewsletter: checked as boolean})}
                    data-testid="checkbox-newsletter"
                  />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="subscribeNewsletter" className="text-sm">
                      Subscribe to newsletter
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Get updates about new features and team wellness tips
                    </p>
                  </div>
                </div>
              </div>

              {/* Submit buttons */}
              <div className="space-y-3 pt-4">
                <Button 
                  type="submit"
                  className="w-full"
                  disabled={createOrgMutation.isPending}
                  data-testid="button-create-org"
                >
                  {createOrgMutation.isPending ? 'Creating Organization...' : 'Create Organization'}
                </Button>
                
                <Button 
                  type="button"
                  variant="link" 
                  onClick={() => setLocation('/login')}
                  className="w-full"
                  data-testid="button-back-login"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Login
                </Button>
              </div>
              
              <div className="text-center text-sm text-gray-500 pt-2">
                <p>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setLocation('/login')}
                    className="text-primary hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
        
        <div className="mt-4">
          <Alert>
            <AlertDescription className="text-sm">
              <strong>Note:</strong> After creating your organization, you can connect Slack or Microsoft 365 for team authentication from your settings page.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  );
}