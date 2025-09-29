import { useState } from "react";
import { Check, Star, Users, Zap, Building2, Crown, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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
    case 'standard':
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
  onPlanSelect: (planId: string, billingCycle: 'monthly' | 'annual', discountCode?: string) => void;
  isLoading?: boolean;
  className?: string;
  showContinueButton?: boolean;
}

export function PlanSelection({ plans, selectedPlan, onPlanSelect, isLoading = false, className, showContinueButton = true }: PlanSelectionProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [currentPlan, setCurrentPlan] = useState(selectedPlan || '');
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; percentage: number; description: string } | null>(null);
  const { toast } = useToast();

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
    // Always set the selected plan (no toggle/deselect)
    setCurrentPlan(planId);
    // Don't auto-select, just update the UI state
  };

  const handleBillingChange = (isAnnual: boolean) => {
    const newCycle = isAnnual ? 'annual' : 'monthly';
    setBillingCycle(newCycle);
    // Don't auto-select, just update the UI state
  };
  
  const handleContinue = () => {
    if (!currentPlan) {
      // Guard against empty selection
      return;
    }
    onPlanSelect(currentPlan, billingCycle, appliedDiscount?.code);
  };

  const handleApplyDiscount = async () => {
    const code = discountCode.toUpperCase().trim();
    if (!code) {
      toast({
        title: "Invalid Code",
        description: "Please enter a discount code",
        variant: "destructive",
      });
      return;
    }

    try {
      // Get the current price for validation
      const price = currentPlan && plans.find(p => p.id === currentPlan)
        ? (billingCycle === 'monthly' 
            ? plans.find(p => p.id === currentPlan)!.monthlyPrice 
            : plans.find(p => p.id === currentPlan)!.annualPrice)
        : 0;
      
      const response = await apiRequest('POST', '/api/discount-codes/validate', {
        code,
        planId: currentPlan,
        orderAmount: price,
      });
      
      const validation = await response.json();
      
      if (validation.valid && validation.discountCode) {
        const { discountCode: discount } = validation;
        let discountPercentage = 0;
        let description = discount.description || discount.name;
        
        if (discount.discountType === 'percentage') {
          discountPercentage = discount.discountValue;
          description = description || `${discountPercentage}% off`;
        } else if (discount.discountType === 'fixed_amount') {
          // Calculate percentage for display purposes
          if (price > 0) {
            discountPercentage = Math.round((discount.discountValue / price) * 100);
          }
          description = description || `$${(discount.discountValue / 100).toFixed(2)} off`;
        }
        
        setAppliedDiscount({ 
          code, 
          percentage: discountPercentage, 
          description 
        });
        toast({
          title: "Discount Applied!",
          description: `${description} has been applied to your order`,
        });
      } else {
        toast({
          title: "Invalid Code",
          description: validation.reason || "The discount code you entered is not valid",
          variant: "destructive",
        });
        setDiscountCode('');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to validate discount code. Please try again.",
        variant: "destructive",
      });
      setDiscountCode('');
    }
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode('');
    toast({
      title: "Discount Removed",
      description: "The discount has been removed from your order",
    });
  };

  const applyDiscount = (price: number) => {
    if (appliedDiscount) {
      return Math.round(price * (1 - appliedDiscount.percentage / 100));
    }
    return price;
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
        
        {/* Discount Code Section */}
        <div className="max-w-md mx-auto mt-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Enter discount code"
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value)}
                className="pl-10 pr-3"
                data-testid="input-discount-code"
                disabled={!!appliedDiscount}
              />
            </div>
            {!appliedDiscount ? (
              <Button
                onClick={handleApplyDiscount}
                variant="outline"
                data-testid="button-apply-discount"
              >
                Apply
              </Button>
            ) : (
              <Button
                onClick={handleRemoveDiscount}
                variant="outline"
                data-testid="button-remove-discount"
              >
                Remove
              </Button>
            )}
          </div>
          {appliedDiscount && (
            <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
              <Check className="h-4 w-4" />
              <span>{appliedDiscount.description}</span>
            </div>
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
            // For annual billing, calculate the monthly price with discount
            const basePrice = billingCycle === 'annual' 
              ? Math.round(plan.annualPrice / 12) // Annual price divided by 12 months
              : plan.monthlyPrice;
            const price = applyDiscount(basePrice);
            const savings = getAnnualSavings(plan.monthlyPrice, plan.annualPrice);
            const isSelected = currentPlan === plan.id;
            const planIcon = getPlanIcon(plan.id);
            const planBadge = getPlanBadge(plan.id);
            const isProfessional = plan.id === 'professional';
            
            return (
              <div key={plan.id} className="relative">
                <RadioGroupItem id={plan.id} value={plan.id} className="sr-only" data-testid={`plan-${plan.id}`} />
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
                          <div className="relative">
                            {appliedDiscount && price !== basePrice && (
                              <div className="text-lg text-muted-foreground line-through">
                                {formatPrice(basePrice)}
                              </div>
                            )}
                            <div className="text-4xl font-bold" data-testid={`price-${plan.id}`}>
                              {formatPrice(price)}
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            per user / month
                          </div>
                          {billingCycle === 'annual' && (
                            <div className="text-xs text-muted-foreground">
                              billed annually
                            </div>
                          )}
                          {billingCycle === 'annual' && savings > 0 && !appliedDiscount && (
                            <div className="text-xs text-green-600 font-medium">
                              Save {savings}% annually
                            </div>
                          )}
                          {appliedDiscount && (
                            <Badge className="text-xs" variant="default">
                              {appliedDiscount.percentage}% off applied
                            </Badge>
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
                    <div 
                      className={`w-full py-2 px-4 rounded-md text-center font-medium ${
                        isSelected 
                          ? 'bg-primary text-primary-foreground' 
                          : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
                      }`}
                      data-testid={`select-${plan.id}`}
                    >
                      {isSelected ? "Selected" : "Select Plan"}
                    </div>
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
      
      {showContinueButton && (
        <div className="flex justify-center mt-6">
          <Button 
            size="lg" 
            onClick={(e) => {
              e.stopPropagation(); // Prevent event bubbling
              handleContinue();
            }}
            disabled={isLoading || !currentPlan}
            data-testid="continue-plan-selection"
            className="min-w-[200px]"
          >
            {isLoading ? 'Processing...' : 'Continue to Next Step'}
          </Button>
        </div>
      )}
    </div>
  );
}