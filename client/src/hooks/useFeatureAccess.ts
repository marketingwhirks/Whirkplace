import { useQuery } from "@tanstack/react-query";
import { PlanType } from "@shared/schema";

interface FeatureAvailability {
  one_on_ones: boolean;
  kra_management: boolean;
  advanced_analytics: boolean;
  slack_integration: boolean;
  teams_integration: boolean;
  teams: boolean;
  reviews: boolean;
  analytics: boolean;
}

interface UpgradeSuggestion {
  plan: PlanType;
  features: Array<keyof FeatureAvailability>;
}

interface FeatureResponse {
  plan: PlanType;
  features: FeatureAvailability;
  upgradeSuggestions: UpgradeSuggestion[];
}

/**
 * Hook to check feature availability based on organization plan
 */
export function useFeatureAccess() {
  // Get the organization from the URL or default to 'default'
  const params = new URLSearchParams(window.location.search);
  const orgFromUrl = params.get('org') || 'default';

  const { data, isLoading, error } = useQuery<FeatureResponse>({
    queryKey: ["/api/features", { org: orgFromUrl }],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  const features = data?.features || {
    one_on_ones: false,
    kra_management: false,
    advanced_analytics: false,
    slack_integration: false,
    teams_integration: false,
    teams: false,
    reviews: false,
    analytics: false,
  };

  const plan = data?.plan || "standard";
  const upgradeSuggestions = data?.upgradeSuggestions || [];

  /**
   * Check if a specific feature is available
   */
  const hasFeature = (feature: keyof FeatureAvailability): boolean => {
    return features[feature] || false;
  };

  /**
   * Get required plan for a specific feature
   */
  const getRequiredPlan = (feature: keyof FeatureAvailability): PlanType => {
    if (feature === "advanced_analytics" || feature === "slack_integration" || feature === "teams_integration") {
      return "enterprise";
    }
    if (feature === "one_on_ones" || feature === "kra_management" || feature === "teams" || feature === "reviews" || feature === "analytics") {
      return "professional";
    }
    return "standard";
  };

  /**
   * Get upgrade message for a feature
   */
  const getUpgradeMessage = (feature: keyof FeatureAvailability): string => {
    const requiredPlan = getRequiredPlan(feature);
    return `This feature requires the ${requiredPlan} plan. Upgrade to access ${feature.replace('_', ' ')}.`;
  };

  /**
   * Check if user can access One-on-Ones
   */
  const canAccessOneOnOnes = hasFeature("one_on_ones");

  /**
   * Check if user can access KRA Management
   */
  const canAccessKraManagement = hasFeature("kra_management");

  /**
   * Check if user can access advanced analytics
   */
  const canAccessAdvancedAnalytics = hasFeature("advanced_analytics");

  /**
   * Check if user can access Slack integration
   */
  const canAccessSlackIntegration = hasFeature("slack_integration");

  /**
   * Check if user can access Teams integration
   */
  const canAccessTeamsIntegration = hasFeature("teams_integration");

  return {
    // Feature availability
    features,
    hasFeature,
    
    // Specific feature checks
    canAccessOneOnOnes,
    canAccessKraManagement,
    canAccessAdvancedAnalytics,
    canAccessSlackIntegration,
    canAccessTeamsIntegration,
    
    // Plan information
    plan,
    upgradeSuggestions,
    
    // Utility functions
    getRequiredPlan,
    getUpgradeMessage,
    
    // Loading state
    isLoading,
    error,
  };
}