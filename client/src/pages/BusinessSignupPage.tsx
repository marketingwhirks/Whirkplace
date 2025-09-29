import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BusinessSignup } from "@/components/business/BusinessSignup";
import { PlanSelection } from "@/components/business/PlanSelection";
import { 
  OnboardingWalkthrough,
  TeamSetupStep,
  UserInvitesStep,
  OrganizationSettingsStep
} from "@/components/business/OnboardingWalkthrough";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Building2, CreditCard, Users, UserPlus, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { DynamicThemeProvider } from "@/components/theme/DynamicThemeProvider";

type SignupStep = "signup" | "plan-selection" | "teams" | "invites" | "settings" | "payment" | "complete";

interface SignupData {
  businessInfo?: any;
  selectedPlan?: {
    planId: string;
    billingCycle: 'monthly' | 'annual';
    discountCode?: string;
  };
  organizationId?: string;
  userId?: string;
  sessionId?: string;
  teams?: any[];
  userInvites?: any[];
  themeData?: any;
  onboardingData?: any;
}

const signupSteps = [
  { id: "signup", title: "Account", icon: <Building2 className="h-4 w-4" /> },
  { id: "plan-selection", title: "Plan", icon: <CreditCard className="h-4 w-4" /> },
  { id: "teams", title: "Teams", icon: <Users className="h-4 w-4" /> },
  { id: "invites", title: "Invites", icon: <UserPlus className="h-4 w-4" /> },
  { id: "settings", title: "Settings", icon: <Settings className="h-4 w-4" /> },
];

export default function BusinessSignupPage() {
  const [currentStep, setCurrentStep] = useState<SignupStep>("signup");
  const [signupData, setSignupData] = useState<SignupData>({});
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  // Handle payment success/cancel return from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const step = params.get('step');
    const organizationId = params.get('organizationId');
    const payment = params.get('payment');
    const error = params.get('error');
    const canceled = params.get('canceled');
    
    if (step === 'teams' && organizationId && payment === 'success') {
      // Payment successful, move to teams step
      setSignupData(prev => ({ 
        ...prev, 
        organizationId,
        businessInfo: { organizationId }
      }));
      setCurrentStep('teams');
      toast({
        title: "Payment Successful!",
        description: "Your payment has been processed. Let's set up your teams.",
      });
      // Clean up URL
      window.history.replaceState({}, '', '/business-signup');
    } else if (canceled === 'true') {
      // Payment canceled
      toast({
        title: "Payment Canceled",
        description: "You canceled the payment process. Please select a plan to continue.",
        variant: "destructive",
      });
      // Clean up URL
      window.history.replaceState({}, '', '/business-signup');
    } else if (error) {
      // Handle error from Stripe
      const errorMessages: Record<string, string> = {
        missing_parameters: "Invalid payment session. Please try again.",
        stripe_not_configured: "Payment system not configured. Please contact support.",
        invalid_session: "Invalid payment session. Please try again.",
        organization_mismatch: "Payment session mismatch. Please try again.",
        payment_not_completed: "Payment was not completed. Please try again.",
        checkout_verification_failed: "Payment verification failed. Please contact support.",
      };
      
      toast({
        title: "Payment Error",
        description: errorMessages[error] || "An error occurred during payment. Please try again.",
        variant: "destructive",
      });
      // Clean up URL
      window.history.replaceState({}, '', '/business-signup');
    }
  }, [toast, setCurrentStep, setSignupData]);

  // Fetch available business plans
  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['/api/business/plans'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/business/plans');
      return response.json();
    },
  });

  // Business signup mutation
  const signupMutation = useMutation({
    mutationFn: async (signupData: any) => {
      const response = await apiRequest('POST', '/api/business/signup', signupData);
      return response.json();
    },
    onSuccess: (data) => {
      setSignupData(prev => ({ 
        ...prev, 
        businessInfo: data,
        organizationId: data.organizationId,
        userId: data.userId 
      }));
      setCurrentStep("plan-selection");
      toast({
        title: "Account Created!",
        description: "Now let's select the perfect plan for your team.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Signup Failed",
        description: error.message || "There was an error creating your account. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Plan selection mutation
  const planMutation = useMutation({
    mutationFn: async ({ planId, billingCycle, discountCode }: { planId: string; billingCycle: 'monthly' | 'annual'; discountCode?: string }) => {
      // Get organizationId from either location it might be stored
      const organizationId = signupData.businessInfo?.organizationId || signupData.organizationId;
      
      if (!organizationId) {
        throw new Error("Organization ID not found. Please try signing up again.");
      }
      
      const response = await apiRequest('POST', '/api/business/select-plan', {
        organizationId,
        planId,
        billingCycle,
        discountCode,
      });
      return response.json();
    },
    onSuccess: (data) => {
      // Check if payment is required (paid plan)
      if (data.requiresPayment && data.checkoutUrl) {
        // Store plan data for after checkout
        setSignupData(prev => ({ 
          ...prev, 
          selectedPlan: { planId: data.planId, billingCycle: data.billingCycle },
          sessionId: data.sessionId,
        }));
        
        toast({
          title: "Redirecting to Payment",
          description: "You'll be redirected to complete your payment securely.",
        });
        
        // Redirect to Stripe checkout
        setTimeout(() => {
          window.location.href = data.checkoutUrl;
        }, 1500);
      } else {
        // Standard plan - no payment required
        setSignupData(prev => ({ 
          ...prev, 
          selectedPlan: { planId: data.planId || 'standard', billingCycle: data.billingCycle || 'monthly' },
        }));
        setCurrentStep("teams");
        toast({
          title: "Plan Selected!",
          description: `You've selected the standard plan. Now let's set up your teams.`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Plan Selection Failed",
        description: error.message || "There was an error selecting your plan. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Onboarding completion mutation
  const onboardingMutation = useMutation({
    mutationFn: async (onboardingData: any) => {
      const response = await apiRequest('POST', '/api/business/complete-onboarding', {
        organizationId: signupData.businessInfo?.organizationId,
        ...onboardingData,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setCurrentStep("complete");
      toast({
        title: "Welcome to Whirkplace!",
        description: "Your organization has been set up successfully.",
      });

      // Redirect to dashboard after a brief delay
      setTimeout(() => {
        setLocation("/dashboard");
      }, 3000);
    },
    onError: (error: any) => {
      toast({
        title: "Setup Failed",
        description: error.message || "There was an error setting up your organization. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getCurrentStepIndex = () => {
    return signupSteps.findIndex(step => step.id === currentStep);
  };

  const progress = ((getCurrentStepIndex() + 1) / signupSteps.length) * 100;

  const handleBusinessSignup = async (businessInfo: any) => {
    signupMutation.mutate(businessInfo);
  };

  const handlePlanSelection = async (planId: string, billingCycle: 'monthly' | 'annual', discountCode?: string) => {
    // Store the selected plan and discount info in state
    setSignupData(prev => ({ 
      ...prev, 
      selectedPlan: { planId, billingCycle, discountCode }
    }));
    
    // Make sure we have an organizationId before proceeding
    const orgId = signupData.businessInfo?.organizationId || signupData.organizationId;
    if (!orgId) {
      toast({
        title: "Error",
        description: "Organization ID not found. Please try signing up again.",
        variant: "destructive",
      });
      return;
    }
    
    // Then process the plan selection with discount code
    planMutation.mutate({ planId, billingCycle, discountCode });
  };


  const handleOnboardingComplete = async (onboardingData: any) => {
    onboardingMutation.mutate(onboardingData);
  };
  
  const handleTeamSetup = (data: any) => {
    setSignupData(prev => ({ ...prev, ...data }));
    setCurrentStep("invites");
  };
  
  const handleInvites = (data: any) => {
    setSignupData(prev => ({ ...prev, ...data }));
    setCurrentStep("settings");
  };
  
  const handleSettings = (data: any) => {
    const finalOnboardingData = {
      teams: signupData.teams || data.teams || [],
      userInvites: signupData.userInvites || data.userInvites || [],
      organizationSettings: data.organizationSettings || {
        companyValues: [],
        checkInFrequency: "weekly",
        workingHours: "9:00 AM - 5:00 PM",
        timezone: "America/New_York",
      },
    };
    onboardingMutation.mutate(finalOnboardingData);
  };

  // Navigation functions
  const canGoBack = () => {
    return currentStep !== "signup";
  };

  const canGoNext = () => {
    switch (currentStep) {
      case "signup":
        return !!signupData.businessInfo;
      case "plan-selection":
        return !!signupData.selectedPlan;
      case "teams":
        return !!signupData.teams;
      case "invites":
        return true; // Invites can be skipped
      case "settings":
        return false; // Settings completes the flow
      default:
        return false;
    }
  };

  const handleGoBack = () => {
    const stepIndex = getCurrentStepIndex();
    if (stepIndex > 0) {
      const previousStep = signupSteps[stepIndex - 1];
      setCurrentStep(previousStep.id as SignupStep);
    }
  };

  const handleGoNext = () => {
    switch (currentStep) {
      case "signup":
        if (signupData.businessInfo) {
          setCurrentStep("plan-selection");
        }
        break;
      case "plan-selection":
        if (signupData.selectedPlan) {
          setCurrentStep("teams");
        }
        break;
      case "teams":
        if (signupData.teams) {
          setCurrentStep("invites");
        }
        break;
      case "invites":
        setCurrentStep("settings");
        break;
      default:
        break;
    }
  };

  const handleStepClick = (stepId: string, stepIndex: number) => {
    const currentStepIndex = getCurrentStepIndex();
    
    // Only allow navigation to completed steps or the current step
    if (stepIndex <= currentStepIndex) {
      setCurrentStep(stepId as SignupStep);
    }
  };

  const isStepAccessible = (stepIndex: number) => {
    const currentStepIndex = getCurrentStepIndex();
    return stepIndex <= currentStepIndex;
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case "signup":
        return (
          <BusinessSignup 
            onSignupComplete={handleBusinessSignup}
            isLoading={signupMutation.isPending}
          />
        );
      
      case "plan-selection":
        return (
          <PlanSelection 
            plans={plans || []}
            selectedPlan={signupData.selectedPlan?.planId}
            onPlanSelect={handlePlanSelection}
            isLoading={planMutation.isPending || plansLoading}
          />
        );
      
      case "teams":
        return (
          <TeamSetupStep
            onComplete={handleTeamSetup}
            initialData={signupData}
            isLoading={onboardingMutation.isPending}
          />
        );
      
      case "invites":
        return (
          <UserInvitesStep
            onComplete={handleInvites}
            initialData={signupData}
            isLoading={onboardingMutation.isPending}
          />
        );
      
      case "settings":
        return (
          <OrganizationSettingsStep
            onComplete={handleSettings}
            initialData={signupData}
            isLoading={onboardingMutation.isPending}
          />
        );
      
      case "complete":
        return (
          <div className="text-center space-y-6 py-12">
            <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-green-600">Welcome to Whirkplace!</h2>
              <p className="text-muted-foreground text-lg mt-2">
                Your organization has been successfully set up.
              </p>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>✅ Organization created</p>
              <p>✅ Plan selected</p>
              <p>✅ Teams configured</p>
              <p>✅ User invitations sent</p>
              <p>✅ Settings customized</p>
            </div>
            <p className="text-sm">
              Redirecting you to your dashboard...
            </p>
          </div>
        );
      
      default:
        return null;
    }
  };

  if (currentStep === "complete") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            {renderCurrentStep()}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <DynamicThemeProvider organizationId={signupData.businessInfo?.organizationId}>
      <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5" data-testid="business-signup-page">
        <div className="container mx-auto px-4 py-8">
        {/* Header with Progress */}
        {currentStep !== "complete" && (
          <div className="max-w-4xl mx-auto mb-8">
            <div className="text-center mb-6">
              <h1 className="text-4xl font-bold">Get Started with Whirkplace</h1>
              <p className="text-muted-foreground text-lg mt-2">
                Transform your team management in just a few steps
              </p>
            </div>
            
            <div className="space-y-4">
              <Progress value={progress} className="h-2" data-testid="signup-progress" />
              
              <div className="flex justify-between">
                {signupSteps.map((step, index) => {
                  const stepIndex = getCurrentStepIndex();
                  const isCompleted = index < stepIndex;
                  const isCurrent = index === stepIndex;
                  
                  return (
                    <div 
                      key={step.id}
                      onClick={() => handleStepClick(step.id, index)}
                      className={`flex items-center space-x-2 ${
                        isCompleted || isCurrent ? 'text-primary' : 'text-muted-foreground'
                      } ${
                        isStepAccessible(index) ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed'
                      }`}
                    >
                      <div className={`p-2 rounded-full transition-colors ${
                        isCompleted ? 'bg-primary text-primary-foreground' :
                        isCurrent ? 'bg-primary/10 border-2 border-primary' : 'bg-muted'
                      }`}>
                        {isCompleted ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          step.icon
                        )}
                      </div>
                      <div className="hidden sm:block">
                        <div className="font-medium text-sm">{step.title}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Current Step Content */}
        <div className="max-w-6xl mx-auto">
          <div className="space-y-6">
            {renderCurrentStep()}
            
            {/* Navigation Buttons */}
            {currentStep !== "complete" && currentStep !== "teams" && currentStep !== "invites" && currentStep !== "settings" && (
              <div className="flex justify-between items-center pt-6 border-t">
                <div>
                  {canGoBack() && (
                    <button
                      onClick={handleGoBack}
                      className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-previous"
                    >
                      ← Previous
                    </button>
                  )}
                </div>
                <div>
                  {canGoNext() && currentStep !== "signup" && currentStep !== "plan-selection" && (
                    <button
                      onClick={handleGoNext}
                      className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                      data-testid="button-next"
                    >
                      Next →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </DynamicThemeProvider>
  );
}