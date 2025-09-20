import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, ArrowLeft, ArrowRight, Users, Settings, UserPlus, Building2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  component: React.ReactNode;
}

interface UserInvite {
  email: string;
  name: string;
  role: "admin" | "manager" | "member";
  teamName?: string;
}

interface TeamSetup {
  name: string;
  description: string;
  type: "department" | "squad" | "pod";
  leaderId?: string;
}

interface OnboardingData {
  teams: TeamSetup[];
  userInvites: UserInvite[];
  organizationSettings: {
    companyValues: string[];
    checkInFrequency: string;
    workingHours: string;
    timezone: string;
  };
}

const teamSetupSchema = z.object({
  teams: z.array(z.object({
    name: z.string().min(2, "Team name must be at least 2 characters"),
    description: z.string().optional(),
    type: z.enum(["department", "squad", "pod"]),
  })).min(1, "Create at least one team"),
});

const userInviteSchema = z.object({
  userInvites: z.array(z.object({
    email: z.string().email("Invalid email address"),
    name: z.string().min(2, "Name must be at least 2 characters"),
    role: z.enum(["admin", "manager", "member"]),
    teamName: z.string().optional(),
  })).optional(),
});

const organizationSettingsSchema = z.object({
  companyValues: z.array(z.string()).min(1, "Add at least one company value"),
  checkInFrequency: z.enum(["daily", "weekly", "biweekly"]),
  workingHours: z.string().min(1, "Specify working hours"),
  timezone: z.string().min(1, "Select timezone"),
});

interface OnboardingWalkthroughProps {
  initialData?: Partial<OnboardingData>;
  onComplete: (data: OnboardingData) => void;
  isLoading?: boolean;
  className?: string;
}

export function OnboardingWalkthrough({ 
  initialData, 
  onComplete, 
  isLoading = false, 
  className 
}: OnboardingWalkthroughProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [onboardingData, setOnboardingData] = useState<Partial<OnboardingData>>(initialData || {});
  const { toast } = useToast();

  // Team Setup Form
  const teamForm = useForm({
    resolver: zodResolver(teamSetupSchema),
    defaultValues: {
      teams: onboardingData.teams || [
        { name: "", description: "", type: "department" as const }
      ],
    },
  });

  // User Invites Form  
  const inviteForm = useForm({
    resolver: zodResolver(userInviteSchema),
    defaultValues: {
      userInvites: onboardingData.userInvites || [],
    },
  });

  // Organization Settings Form
  const settingsForm = useForm({
    resolver: zodResolver(organizationSettingsSchema),
    defaultValues: {
      companyValues: onboardingData.organizationSettings?.companyValues || [""],
      checkInFrequency: onboardingData.organizationSettings?.checkInFrequency || "weekly",
      workingHours: onboardingData.organizationSettings?.workingHours || "9:00 AM - 5:00 PM",
      timezone: onboardingData.organizationSettings?.timezone || "America/New_York",
    },
  });

  const addTeam = () => {
    const currentTeams = teamForm.getValues("teams");
    teamForm.setValue("teams", [
      ...currentTeams,
      { name: "", description: "", type: "department" as const }
    ]);
  };

  const removeTeam = (index: number) => {
    const currentTeams = teamForm.getValues("teams");
    teamForm.setValue("teams", currentTeams.filter((_, i) => i !== index));
  };

  const addUserInvite = () => {
    const currentInvites = inviteForm.getValues("userInvites") || [];
    inviteForm.setValue("userInvites", [
      ...currentInvites,
      { email: "", name: "", role: "member" as const, teamName: "" }
    ]);
  };

  const removeUserInvite = (index: number) => {
    const currentInvites = inviteForm.getValues("userInvites") || [];
    inviteForm.setValue("userInvites", currentInvites.filter((_, i) => i !== index));
  };

  const addCompanyValue = () => {
    const currentValues = settingsForm.getValues("companyValues");
    settingsForm.setValue("companyValues", [...currentValues, ""]);
  };

  const removeCompanyValue = (index: number) => {
    const currentValues = settingsForm.getValues("companyValues");
    if (currentValues.length > 1) {
      settingsForm.setValue("companyValues", currentValues.filter((_, i) => i !== index));
    }
  };

  // Team Setup Component
  const TeamSetupStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold">Set Up Your Teams</h3>
        <p className="text-muted-foreground mt-2">
          Create departments, squads, or pods to organize your team members
        </p>
      </div>

      <Form {...teamForm}>
        <form className="space-y-4">
          {teamForm.watch("teams").map((team, index) => (
            <Card key={index} className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={teamForm.control}
                  name={`teams.${index}.name`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Name *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Engineering" 
                          {...field}
                          data-testid={`team-name-${index}`}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={teamForm.control}
                  name={`teams.${index}.type`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Type</FormLabel>
                      <FormControl>
                        <select 
                          {...field}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          data-testid={`team-type-${index}`}
                        >
                          <option value="department">Department</option>
                          <option value="squad">Squad</option>
                          <option value="pod">Pod</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex items-end">
                  {teamForm.watch("teams").length > 1 && (
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => removeTeam(index)}
                      data-testid={`remove-team-${index}`}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              
              <FormField
                control={teamForm.control}
                name={`teams.${index}.description`}
                render={({ field }) => (
                  <FormItem className="mt-4">
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Brief description of this team's responsibilities"
                        {...field}
                        data-testid={`team-description-${index}`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Card>
          ))}
          
          <Button 
            type="button" 
            variant="outline" 
            onClick={addTeam}
            className="w-full"
            data-testid="add-team"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add Another Team
          </Button>
        </form>
      </Form>
    </div>
  );

  // User Invites Component  
  const UserInvitesStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold">Invite Your Team</h3>
        <p className="text-muted-foreground mt-2">
          Send invitations to team members to join your organization
        </p>
      </div>

      <Form {...inviteForm}>
        <form className="space-y-4">
          {(inviteForm.watch("userInvites") || []).map((invite, index) => (
            <Card key={index} className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <FormField
                  control={inviteForm.control}
                  name={`userInvites.${index}.name`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="John Doe" 
                          {...field}
                          data-testid={`invite-name-${index}`}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={inviteForm.control}
                  name={`userInvites.${index}.email`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input 
                          type="email"
                          placeholder="john@company.com" 
                          {...field}
                          data-testid={`invite-email-${index}`}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={inviteForm.control}
                  name={`userInvites.${index}.role`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <FormControl>
                        <select 
                          {...field}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          data-testid={`invite-role-${index}`}
                        >
                          <option value="member">Member</option>
                          <option value="manager">Manager</option>
                          <option value="admin">Admin</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex items-end">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => removeUserInvite(index)}
                    data-testid={`remove-invite-${index}`}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          
          <Button 
            type="button" 
            variant="outline" 
            onClick={addUserInvite}
            className="w-full"
            data-testid="add-invite"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add Team Member
          </Button>
          
          <div className="text-sm text-muted-foreground text-center">
            <p>You can always invite more team members later from the team management page</p>
          </div>
        </form>
      </Form>
    </div>
  );

  // Organization Settings Component
  const OrganizationSettingsStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold">Customize Your Settings</h3>
        <p className="text-muted-foreground mt-2">
          Configure your organization preferences and company values
        </p>
      </div>

      <Form {...settingsForm}>
        <form className="space-y-6">
          <div className="space-y-4">
            <h4 className="font-medium">Company Values</h4>
            {settingsForm.watch("companyValues").map((value, index) => (
              <div key={index} className="flex gap-2">
                <FormField
                  control={settingsForm.control}
                  name={`companyValues.${index}`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input 
                          placeholder="e.g., Innovation, Teamwork, Excellence" 
                          {...field}
                          data-testid={`company-value-${index}`}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {settingsForm.watch("companyValues").length > 1 && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => removeCompanyValue(index)}
                    data-testid={`remove-value-${index}`}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
            <Button 
              type="button" 
              variant="outline" 
              onClick={addCompanyValue}
              data-testid="add-company-value"
            >
              Add Company Value
            </Button>
          </div>
          
          <Separator />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={settingsForm.control}
              name="checkInFrequency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Check-in Frequency</FormLabel>
                  <FormControl>
                    <select 
                      {...field}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      data-testid="checkin-frequency"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Bi-weekly</option>
                    </select>
                  </FormControl>
                  <FormDescription>
                    How often team members should complete check-ins
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={settingsForm.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timezone</FormLabel>
                  <FormControl>
                    <select 
                      {...field}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      data-testid="timezone"
                    >
                      <option value="America/New_York">Eastern Time</option>
                      <option value="America/Chicago">Central Time</option>
                      <option value="America/Denver">Mountain Time</option>
                      <option value="America/Los_Angeles">Pacific Time</option>
                      <option value="UTC">UTC</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          <FormField
            control={settingsForm.control}
            name="workingHours"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Working Hours</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="9:00 AM - 5:00 PM" 
                    {...field}
                    data-testid="working-hours"
                  />
                </FormControl>
                <FormDescription>
                  Default working hours for your organization
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </div>
  );

  const steps: OnboardingStep[] = [
    {
      id: "teams",
      title: "Team Setup",
      description: "Create your organizational structure",
      icon: <Building2 className="h-5 w-5" />,
      component: <TeamSetupStep />,
    },
    {
      id: "invites",
      title: "Invite Members",
      description: "Add your team members",
      icon: <UserPlus className="h-5 w-5" />,
      component: <UserInvitesStep />,
    },
    {
      id: "settings", 
      title: "Organization Settings",
      description: "Configure preferences",
      icon: <Settings className="h-5 w-5" />,
      component: <OrganizationSettingsStep />,
    },
  ];

  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleNext = async () => {
    let isValid = true;
    
    // Validate current step
    if (currentStep === 0) {
      isValid = await teamForm.trigger();
      if (isValid) {
        setOnboardingData(prev => ({
          ...prev,
          teams: teamForm.getValues("teams"),
        }));
      }
    } else if (currentStep === 1) {
      isValid = await inviteForm.trigger();
      if (isValid) {
        setOnboardingData(prev => ({
          ...prev,
          userInvites: inviteForm.getValues("userInvites") || [],
        }));
      }
    } else if (currentStep === 2) {
      isValid = await settingsForm.trigger();
      if (isValid) {
        const settingsData = {
          companyValues: settingsForm.getValues("companyValues").filter(v => v.trim()),
          checkInFrequency: settingsForm.getValues("checkInFrequency"),
          workingHours: settingsForm.getValues("workingHours"),
          timezone: settingsForm.getValues("timezone"),
        };
        
        const finalData: OnboardingData = {
          teams: onboardingData.teams || [],
          userInvites: onboardingData.userInvites || [],
          organizationSettings: settingsData,
        };
        
        onComplete(finalData);
        return;
      }
    }

    if (isValid && currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className={`max-w-4xl mx-auto ${className}`} data-testid="onboarding-walkthrough">
      {/* Progress Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Setup Your Organization</h2>
          <Badge variant="outline">
            Step {currentStep + 1} of {steps.length}
          </Badge>
        </div>
        
        <Progress value={progress} className="h-2" data-testid="onboarding-progress" />
        
        <div className="flex justify-between mt-4">
          {steps.map((step, index) => (
            <div 
              key={step.id}
              className={`flex items-center space-x-2 ${
                index <= currentStep ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <div className={`p-2 rounded-full ${
                index <= currentStep ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}>
                {index < currentStep ? (
                  <Check className="h-4 w-4" />
                ) : (
                  step.icon
                )}
              </div>
              <div className="hidden sm:block">
                <div className="font-medium text-sm">{step.title}</div>
                <div className="text-xs">{step.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Current Step Content */}
      <Card>
        <CardContent className="pt-6">
          {steps[currentStep].component}
        </CardContent>
        
        <CardContent className="pt-0">
          <div className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={handlePrevious}
              disabled={currentStep === 0}
              data-testid="button-previous"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
            
            <Button 
              onClick={handleNext}
              disabled={isLoading}
              data-testid="button-next"
            >
              {currentStep === steps.length - 1 ? (
                isLoading ? (
                  "Setting up..."
                ) : (
                  <>
                    Complete Setup
                    <CheckCircle className="h-4 w-4 ml-2" />
                  </>
                )
              ) : (
                <>
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}