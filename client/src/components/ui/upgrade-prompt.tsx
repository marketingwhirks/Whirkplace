import { Lock, Crown, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

interface UpgradePromptProps {
  feature: "one_on_ones" | "kra_management" | "advanced_analytics";
  title: string;
  description: string;
  className?: string;
}

export function UpgradePrompt({ feature, title, description, className }: UpgradePromptProps) {
  const { plan, getRequiredPlan, getUpgradeMessage } = useFeatureAccess();
  const requiredPlan = getRequiredPlan(feature);
  
  const planColors = {
    starter: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    professional: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300", 
    enterprise: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
  };

  const handleUpgrade = () => {
    // In a real app, this would redirect to a billing/upgrade page
    // For now, we'll just show a message
    alert(`Contact your administrator to upgrade to ${requiredPlan} plan`);
  };

  return (
    <div className={`flex-1 flex items-center justify-center p-6 ${className}`}>
      <Card className="w-full max-w-2xl text-center">
        <CardHeader className="space-y-4">
          <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl">{title}</CardTitle>
            <p className="text-muted-foreground">
              {description}
            </p>
          </div>
          <div className="flex justify-center gap-2">
            <Badge variant="outline" className={planColors[plan]}>
              Current: {plan}
            </Badge>
            <ArrowRight className="w-4 h-4 text-muted-foreground self-center" />
            <Badge className={`${planColors[requiredPlan]} border-0`}>
              <Crown className="w-3 h-3 mr-1" />
              Required: {requiredPlan}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-sm text-muted-foreground">
            {getUpgradeMessage(feature)}
          </div>
          
          <div className="space-y-4">
            <h4 className="font-semibold text-base">What you'll get with {requiredPlan}:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {feature === "one_on_ones" && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span>Unlimited 1:1 meetings</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span>Meeting templates & notes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span>Action item tracking</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span>Calendar integration</span>
                  </div>
                </>
              )}
              {feature === "kra_management" && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span>KRA templates & assignments</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span>Progress tracking</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span>Performance reporting</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span>Team KRA overview</span>
                  </div>
                </>
              )}
            </div>
          </div>
          
          <Button onClick={handleUpgrade} className="w-full" data-testid={`button-upgrade-${feature}`}>
            <Crown className="w-4 h-4 mr-2" />
            Upgrade to {requiredPlan}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}