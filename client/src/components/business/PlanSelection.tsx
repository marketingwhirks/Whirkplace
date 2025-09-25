import { useState } from "react";
import { Check, Star, Users, Zap, Building2, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Plan {
  id: string;
  name: string;
  displayName: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  maxUsers: number | null;
  features: string[];
  hasSlackIntegration?: boolean;
  hasMicrosoftIntegration?: boolean;
  hasAdvancedAnalytics?: boolean;
  hasApiAccess?: boolean;
}

const getPlanIcon = (planId: string) => {
  switch (planId) {
    case 'starter':
      return <Users className="h-8 w-8" />;
    case 'professional':
      return <Zap className="h-8 w-8" />;
    case 'enterprise':
      return <Crown className="h-8 w-8" />;
    default:
      return <Building2 className="h-8 w-8" />;
  }
};

const getPlanBadge = (planId: string) => {
  switch (planId) {
    case 'professional':
      return "Most Popular";
    case 'enterprise':
      return "Enterprise";
    default:
      return null;
  }
};

interface PlanSelectionProps {
  plans: Plan[];
  selectedPlan?: string;
  onPlanSelect: (planId: string, billingCycle: 'monthly' | 'annual') => void;
  isLoading?: boolean;
  className?: string;
}

export function PlanSelection({ plans, selectedPlan, onPlanSelect, isLoading = false, className }: PlanSelectionProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [currentPlan, setCurrentPlan] = useState(selectedPlan || 'professional');

  const formatPrice = (price: number) => {
    return (price / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const getAnnualSavings = (monthlyPrice: number, annualPrice: number) => {
    if (monthlyPrice === 0) return 0;
    const monthlyTotal = monthlyPrice * 12;
    const savings = monthlyTotal - annualPrice;
    return Math.round((savings / monthlyTotal) * 100);
  };

  const handlePlanChange = (planId: string) => {
    setCurrentPlan(planId);
    onPlanSelect(planId, billingCycle);
  };

  const handleBillingChange = (isAnnual: boolean) => {
    const newCycle = isAnnual ? 'annual' : 'monthly';
    setBillingCycle(newCycle);
    onPlanSelect(currentPlan, newCycle);
  };

  return (
    <div className={`space-y-8 ${className}`} data-testid="plan-selection">
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold">Choose Your Plan</h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Select monthly or annual billing. Save 20% with annual plans. All plans include a 10-day free trial.
        </p>
        
        {/* Billing Toggle */}
        <div className="flex items-center justify-center space-x-4 p-1 bg-muted rounded-lg max-w-xs mx-auto">
          <Label htmlFor="billing-toggle" className={`text-sm ${!billingCycle || billingCycle === 'monthly' ? 'font-medium' : 'text-muted-foreground'}`}>
            Monthly
          </Label>
          <Switch
            id="billing-toggle"
            checked={billingCycle === 'annual'}
            onCheckedChange={handleBillingChange}
            data-testid="billing-toggle"
          />
          <Label htmlFor="billing-toggle" className={`text-sm ${billingCycle === 'annual' ? 'font-medium' : 'text-muted-foreground'}`}>
            Annual
          </Label>
          {billingCycle === 'annual' && (
            <Badge variant="secondary" className="ml-2">
              Save 20%
            </Badge>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-4 p-3 bg-muted rounded-full w-fit">
                  <div className="h-8 w-8 bg-muted-foreground/20 rounded" />
                </div>
                <div className="h-6 bg-muted rounded w-3/4 mx-auto mb-2" />
                <div className="h-4 bg-muted rounded w-full" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-12 bg-muted rounded" />
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="h-4 bg-muted rounded" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <RadioGroup value={currentPlan} onValueChange={handlePlanChange} className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const price = billingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice;
            const savings = getAnnualSavings(plan.monthlyPrice, plan.annualPrice);
            const isSelected = currentPlan === plan.id;
            const planIcon = getPlanIcon(plan.id);
            const planBadge = getPlanBadge(plan.id);
            const isProfessional = plan.id === 'professional';
            
            return (
              <div key={plan.id} className="relative">
                <RadioGroupItem value={plan.id} className="sr-only" data-testid={`plan-${plan.id}`} />
                <Label htmlFor={plan.id} className="cursor-pointer">
                  <Card className={`relative overflow-hidden transition-all hover:shadow-lg ${
                    isSelected ? 'ring-2 ring-primary shadow-lg' : ''
                  } ${isProfessional ? 'border-primary' : ''}`}>
                    {planBadge && (
                      <div className="absolute top-0 right-0">
                        <Badge 
                          className={`rounded-none rounded-bl-lg ${
                            isProfessional ? 'bg-primary text-primary-foreground' : 'bg-muted'
                          }`}
                        >
                          {planBadge}
                        </Badge>
                      </div>
                    )}
                    
                    <CardHeader className="text-center pb-2">
                      <div className="mx-auto mb-4 p-3 bg-primary/10 rounded-full w-fit">
                        {planIcon}
                      </div>
                      <CardTitle className="text-xl">{plan.displayName}</CardTitle>
                      <CardDescription className="text-sm">{plan.description}</CardDescription>
                    </CardHeader>
                  
                  <CardContent className="text-center space-y-4">
                    <div className="space-y-1">
                      {price === 0 ? (
                        <div className="text-4xl font-bold">Free</div>
                      ) : (
                        <>
                          <div className="text-4xl font-bold" data-testid={`price-${plan.id}`}>
                            {formatPrice(price)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            per user / {billingCycle === 'annual' ? 'year' : 'month'}
                          </div>
                          {billingCycle === 'annual' && savings > 0 && (
                            <div className="text-xs text-green-600 font-medium">
                              Save {savings}% annually
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    
                    <div className="space-y-2 text-left">
                      {plan.features.map((feature, index) => (
                        <div key={index} className="flex items-start space-x-3">
                          <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                  
                  <CardFooter>
                    <Button 
                      className="w-full" 
                      variant={isSelected ? "default" : "outline"}
                      data-testid={`select-${plan.id}`}
                    >
                      {isSelected ? "Selected" : "Select Plan"}
                    </Button>
                  </CardFooter>
                </Card>
              </Label>
              </div>
            );
          })}
        </RadioGroup>
      )}
      
      <div className="text-center text-sm text-muted-foreground">
        <p>All plans include a 10-day free trial • No credit card required • Cancel anytime</p>
      </div>
    </div>
  );
}