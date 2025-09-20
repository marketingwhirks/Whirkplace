import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BusinessSignup } from "@/components/business/BusinessSignup";
import { PlanSelection } from "@/components/business/PlanSelection";
import { ThemeOnboarding } from "@/components/business/ThemeOnboarding";
import { OnboardingWalkthrough } from "@/components/business/OnboardingWalkthrough";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Building2, CreditCard, Palette, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { DynamicThemeProvider } from "@/components/theme/DynamicThemeProvider";

type SignupStep = "signup" | "plan-selection" | "theme" | "onboarding" | "payment" | "complete";

interface SignupData {
  businessInfo?: any;
  selectedPlan?: {
    planId: string;
    billingCycle: 'monthly' | 'annual';
  };
  themeData?: any;
  onboardingData?: any;
}

const signupSteps = [
  { id: "signup", title: "Account", icon: <Building2 className="h-4 w-4" /> },
  { id: "plan-selection", title: "Plan", icon: <CreditCard className="h-4 w-4" /> },
  { id: "theme", title: "Brand", icon: <Palette className="h-4 w-4" /> },
  { id: "onboarding", title: "Setup", icon: <Users className="h-4 w-4" /> },
];

export default function BusinessSignupPage() {
  const [currentStep, setCurrentStep] = useState<SignupStep>("signup");
  const [signupData, setSignupData] = useState<SignupData>({});
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

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
    mutationFn: async ({ planId, billingCycle }: { planId: string; billingCycle: 'monthly' | 'annual' }) => {
      const response = await apiRequest('POST', '/api/business/select-plan', {
        organizationId: signupData.businessInfo?.organizationId,
        planId,
        billingCycle,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setSignupData(prev => ({ 
        ...prev, 
        selectedPlan: { planId: data.planId, billingCycle: data.billingCycle },
        stripeCustomerId: data.stripeCustomerId,
      }));
      setCurrentStep("theme");
      toast({
        title: "Plan Selected!",
        description: `You've selected your plan. Now let's customize your brand.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Plan Selection Failed",
        description: error.message || "There was an error selecting your plan. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Theme configuration mutation
  const themeMutation = useMutation({
    mutationFn: async (themeData: any) => {
      if (themeData.enableCustomTheme && themeData.themeConfig) {
        const response = await apiRequest('PUT', `/api/organizations/${signupData.businessInfo?.organizationId}/theme`, {
          themeConfig: themeData.themeConfig,
          enableCustomTheme: true,
        });
        return response.json();
      }
      return { message: "Theme skipped" };
    },
    onSuccess: () => {
      setCurrentStep("onboarding");
      toast({
        title: "Theme Applied!",
        description: "Your brand customization has been saved. Let's set up your organization.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Theme Save Failed",
        description: error.message || "There was an error saving your theme. Please try again.",
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
        title: "Welcome to TeamPulse!",
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

  const handlePlanSelection = async (planId: string, billingCycle: 'monthly' | 'annual') => {
    planMutation.mutate({ planId, billingCycle });
  };

  const handleThemeComplete = async (themeData: any) => {
    setSignupData(prev => ({ ...prev, themeData }));
    themeMutation.mutate(themeData);
  };

  const handleThemeSkip = () => {
    // Clean up any preview theme
    const existingStyle = document.getElementById('signup-theme-preview');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    setCurrentStep("onboarding");
    toast({
      title: "Theme Skipped",
      description: "You can customize your brand later in settings.",
    });
  };

  const handleOnboardingComplete = async (onboardingData: any) => {
    onboardingMutation.mutate(onboardingData);
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
      
      case "theme":
        return (
          <ThemeOnboarding 
            onComplete={handleThemeComplete}
            onSkip={handleThemeSkip}
            isLoading={themeMutation.isPending}
          />
        );
      
      case "onboarding":
        return (
          <OnboardingWalkthrough 
            onComplete={handleOnboardingComplete}
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
              <h2 className="text-3xl font-bold text-green-600">Welcome to TeamPulse!</h2>
              <p className="text-muted-foreground text-lg mt-2">
                Your organization has been successfully set up.
              </p>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>✅ Organization created</p>
              <p>✅ Plan selected</p>
              <p>✅ Brand customized</p>
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
              <h1 className="text-4xl font-bold">Get Started with TeamPulse</h1>
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
                      className={`flex items-center space-x-2 ${
                        isCompleted || isCurrent ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      <div className={`p-2 rounded-full ${
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
          {renderCurrentStep()}
        </div>
        </div>
      </div>
    </DynamicThemeProvider>
  );
}