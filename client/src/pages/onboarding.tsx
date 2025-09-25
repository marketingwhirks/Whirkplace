import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  Building, CreditCard, Users, Heart, UserPlus, Settings, 
  Check, ChevronRight, Loader2, AlertCircle 
} from 'lucide-react';

interface OnboardingStatus {
  status: 'not_started' | 'in_progress' | 'completed';
  currentStep?: string;
  completedSteps: {
    workspace: boolean;
    billing: boolean;
    roles: boolean;
    values: boolean;
    members: boolean;
    settings: boolean;
  };
  completedAt?: string;
}

const STEPS = [
  { id: 'workspace', title: 'Workspace', icon: Building, description: 'Confirm your workspace details' },
  { id: 'billing', title: 'Billing', icon: CreditCard, description: 'Set up your subscription' },
  { id: 'roles', title: 'Roles', icon: Users, description: 'Configure team roles and permissions' },
  { id: 'values', title: 'Values', icon: Heart, description: 'Define your company values' },
  { id: 'members', title: 'Team', icon: UserPlus, description: 'Import or invite team members' },
  { id: 'settings', title: 'Settings', icon: Settings, description: 'Configure check-in schedules' },
];

export function OnboardingPage() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState<any>({
    workspace: { name: '', industry: '' },
    billing: {},
    roles: {},
    values: [],
    members: [],
    settings: {}
  });

  // Get onboarding status
  const { data: onboardingStatus, isLoading: statusLoading } = useQuery<OnboardingStatus>({
    queryKey: ['/api/onboarding/status'],
    enabled: !!currentUser
  });

  // Get organization details
  const { data: organization } = useQuery({
    queryKey: [`/api/organizations/${currentUser?.organizationId}`],
    enabled: !!currentUser?.organizationId
  });

  // Complete step mutation
  const completeStepMutation = useMutation({
    mutationFn: async (step: string) => {
      try {
        const res = await apiRequest('POST', '/api/onboarding/complete-step', { step });
        return res.json();
      } catch (error: any) {
        // For now, return success to allow continuing through onboarding
        // The step completion tracking is optional
        console.warn('Step completion tracking failed, continuing anyway:', error);
        return { success: true };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/status'] });
    }
  });

  // Complete onboarding mutation
  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/onboarding/complete');
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Welcome aboard!',
        description: 'Onboarding completed successfully'
      });
      setLocation('/dashboard');
    }
  });

  // Update organization mutation
  const updateOrganizationMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('PATCH', `/api/organizations/${currentUser?.organizationId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${currentUser?.organizationId}`] });
    }
  });

  // Set current step based on status
  useEffect(() => {
    if (onboardingStatus) {
      if (onboardingStatus.status === 'completed') {
        setLocation('/dashboard');
        return;
      }

      // Find the first incomplete step
      const incompleteSteIndex = STEPS.findIndex(step => 
        !onboardingStatus.completedSteps[step.id as keyof typeof onboardingStatus.completedSteps]
      );
      if (incompleteSteIndex !== -1) {
        setCurrentStepIndex(incompleteSteIndex);
      }
    }
  }, [onboardingStatus, setLocation]);

  const handleNext = async () => {
    const currentStep = STEPS[currentStepIndex];
    
    // Save current step data
    try {
      switch(currentStep.id) {
        case 'workspace':
          // Only send data if fields are filled
          const hasData = formData.workspace.name || formData.workspace.industry;
          if (hasData) {
            const workspaceData: any = {};
            if (formData.workspace.name) workspaceData.name = formData.workspace.name;
            if (formData.workspace.industry === 'other' && formData.workspace.customIndustry) {
              workspaceData.industry = formData.workspace.customIndustry;
            } else if (formData.workspace.industry && formData.workspace.industry !== 'other') {
              workspaceData.industry = formData.workspace.industry;
            }
            
            // Only call API if we have data to send
            if (Object.keys(workspaceData).length > 0) {
              await updateOrganizationMutation.mutateAsync(workspaceData);
            }
          }
          break;
        case 'values':
          if (formData.values && formData.values.length > 0) {
            await updateOrganizationMutation.mutateAsync({ 
              customValues: formData.values 
            });
          }
          break;
        case 'settings':
          // Only send settings that have been changed
          const settingsData: any = {};
          if (formData.settings.checkinFrequency) settingsData.checkinFrequency = formData.settings.checkinFrequency;
          if (formData.settings.notificationsEnabled !== undefined) settingsData.notificationsEnabled = formData.settings.notificationsEnabled;
          
          if (Object.keys(settingsData).length > 0) {
            await updateOrganizationMutation.mutateAsync(settingsData);
          }
          break;
      }

      // Move to next step or complete
      if (currentStepIndex === STEPS.length - 1) {
        // For now, just redirect to dashboard when done
        toast({
          title: 'Setup complete!',
          description: 'Welcome to Whirkplace'
        });
        setLocation('/dashboard');
      } else {
        setCurrentStepIndex(currentStepIndex + 1);
      }
    } catch (error: any) {
      console.error('Onboarding error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save progress',
        variant: 'destructive'
      });
    }
  };

  const handleSkip = () => {
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const renderStepContent = () => {
    const step = STEPS[currentStepIndex];
    
    switch(step.id) {
      case 'workspace':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                id="org-name"
                value={formData.workspace.name || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  workspace: { ...formData.workspace, name: e.target.value }
                })}
                placeholder="Enter your organization name"
              />
            </div>
            <div>
              <Label htmlFor="industry">Industry</Label>
              <Select
                value={formData.workspace.industry || ''}
                onValueChange={(value) => setFormData({
                  ...formData,
                  workspace: { ...formData.workspace, industry: value }
                })}
              >
                <SelectTrigger id="industry">
                  <SelectValue placeholder="Select your industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accounting">Accounting Firm</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="fitness">Fitness</SelectItem>
                  <SelectItem value="healthcare">Healthcare</SelectItem>
                  <SelectItem value="home_care">Home Care</SelectItem>
                  <SelectItem value="home_services">Home Services</SelectItem>
                  <SelectItem value="law">Law Firm</SelectItem>
                  <SelectItem value="restaurant">Restaurant</SelectItem>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="technology">Technology</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              {formData.workspace.industry === 'other' && (
                <Input
                  className="mt-2"
                  placeholder="Please specify your industry"
                  value={formData.workspace.customIndustry || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    workspace: { ...formData.workspace, customIndustry: e.target.value }
                  })}
                />
              )}
            </div>
          </div>
        );

      case 'billing':
        return (
          <div className="space-y-4">
            <div className="text-center p-6 border rounded-lg">
              <CreditCard className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold mb-2">Choose Your Plan</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Select a subscription plan that works for your team
              </p>
              <div className="grid gap-4 mt-6">
                <Card className="cursor-pointer hover:border-primary">
                  <CardHeader>
                    <CardTitle>Starter</CardTitle>
                    <CardDescription>$9/month</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm space-y-1">
                      <li>Up to 10 users</li>
                      <li>Basic features</li>
                    </ul>
                  </CardContent>
                </Card>
                <Card className="cursor-pointer hover:border-primary">
                  <CardHeader>
                    <CardTitle>Professional</CardTitle>
                    <CardDescription>$29/month</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm space-y-1">
                      <li>Up to 50 users</li>
                      <li>Advanced analytics</li>
                      <li>Slack integration</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
              <Button className="mt-4 w-full" variant="outline">
                Set Up Payment Later
              </Button>
            </div>
          </div>
        );

      case 'roles':
        return (
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Default Roles</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span>Admin</span>
                  <Badge>Full Access</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Manager</span>
                  <Badge variant="secondary">Team Management</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Member</span>
                  <Badge variant="outline">Basic Access</Badge>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              You can customize roles and permissions after setup
            </p>
          </div>
        );

      case 'values':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add up to 6 company values that represent your culture
            </p>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Input
                key={index}
                placeholder={`Value ${index + 1}`}
                value={formData.values[index] || ''}
                onChange={(e) => {
                  const newValues = [...formData.values];
                  newValues[index] = e.target.value;
                  setFormData({ ...formData, values: newValues });
                }}
              />
            ))}
          </div>
        );

      case 'members':
        return (
          <div className="space-y-4">
            <div className="text-center p-6 border rounded-lg">
              <UserPlus className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold mb-2">Import Your Team</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Connect Slack to automatically import team members
              </p>
              <Button variant="outline" className="mb-2">
                Connect Slack
              </Button>
              <p className="text-xs text-muted-foreground">
                or manually invite members later
              </p>
            </div>
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="checkin-day">Weekly Check-in Day</Label>
              <Select
                value={formData.settings.weeklyCheckInSchedule || 'friday'}
                onValueChange={(value) => setFormData({
                  ...formData,
                  settings: { ...formData.settings, weeklyCheckInSchedule: value }
                })}
              >
                <SelectTrigger id="checkin-day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monday">Monday</SelectItem>
                  <SelectItem value="tuesday">Tuesday</SelectItem>
                  <SelectItem value="wednesday">Wednesday</SelectItem>
                  <SelectItem value="thursday">Thursday</SelectItem>
                  <SelectItem value="friday">Friday</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="checkin-time">Reminder Time</Label>
              <Input
                id="checkin-time"
                type="time"
                value={formData.settings.checkInReminderTime || '09:00'}
                onChange={(e) => setFormData({
                  ...formData,
                  settings: { ...formData.settings, checkInReminderTime: e.target.value }
                })}
              />
            </div>
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={formData.settings.timezone || 'America/Chicago'}
                onValueChange={(value) => setFormData({
                  ...formData,
                  settings: { ...formData.settings, timezone: value }
                })}
              >
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern Time</SelectItem>
                  <SelectItem value="America/Chicago">Central Time</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (userLoading || statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'super_admin')) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <AlertCircle className="w-8 h-8 text-destructive mb-2" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              Only administrators and super administrators can complete the onboarding process
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation('/dashboard')}>
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStep = STEPS[currentStepIndex];
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome to Whirkplace!</h1>
          <p className="text-muted-foreground">
            Let's get your workspace set up in just a few steps
          </p>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              Step {currentStepIndex + 1} of {STEPS.length}
            </span>
            <span className="text-sm font-medium">
              {Math.round(progress)}% Complete
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Steps Navigation */}
        <div className="mb-8">
          <div className="flex justify-between">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isCompleted = onboardingStatus?.completedSteps[step.id as keyof typeof onboardingStatus.completedSteps];
              const isCurrent = index === currentStepIndex;
              
              return (
                <div
                  key={step.id}
                  className={`flex flex-col items-center ${
                    index < currentStepIndex || isCompleted
                      ? 'text-primary'
                      : isCurrent
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                      index < currentStepIndex || isCompleted
                        ? 'bg-primary text-primary-foreground'
                        : isCurrent
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <span className="text-xs hidden sm:block">{step.title}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              {React.createElement(currentStep.icon, { className: "w-6 h-6 text-primary" })}
              <div>
                <CardTitle>{currentStep.title}</CardTitle>
                <CardDescription>{currentStep.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {renderStepContent()}
          </CardContent>
          <div className="p-6 pt-0 flex justify-between">
            <div className="flex gap-2">
              {currentStepIndex > 0 && (
                <Button
                  variant="outline"
                  onClick={handleBack}
                >
                  Back
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={handleSkip}
                disabled={currentStepIndex === STEPS.length - 1}
              >
                Skip for now
              </Button>
            </div>
            <Button
              onClick={handleNext}
              disabled={completeStepMutation.isPending}
            >
              {completeStepMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : currentStepIndex === STEPS.length - 1 ? (
                'Complete Setup'
              ) : (
                <>
                  Continue
                  <ChevronRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}