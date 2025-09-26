import { Request, Response, NextFunction } from "express";
import { Plan, PlanType } from "@shared/schema";

// Feature requirements mapping
const FEATURE_PLAN_REQUIREMENTS = {
  one_on_ones: Plan.PROFESSIONAL,  // Changed from ENTERPRISE to PROFESSIONAL
  kra_management: Plan.PROFESSIONAL,  // Changed from ENTERPRISE to PROFESSIONAL
  advanced_analytics: Plan.ENTERPRISE,
  slack_integration: Plan.ENTERPRISE,
  teams_integration: Plan.ENTERPRISE,
  teams: Plan.PROFESSIONAL,
  reviews: Plan.PROFESSIONAL,
  analytics: Plan.PROFESSIONAL,
} as const;

type FeatureName = keyof typeof FEATURE_PLAN_REQUIREMENTS;

/**
 * Check if an organization's plan includes a specific feature
 */
export function hasFeatureAccess(organizationPlan: PlanType, feature: FeatureName): boolean {
  const requiredPlan = FEATURE_PLAN_REQUIREMENTS[feature];
  
  // Define plan hierarchy
  const planHierarchy = {
    [Plan.STARTER]: 1,
    [Plan.PROFESSIONAL]: 2,
    [Plan.ENTERPRISE]: 3,
    [Plan.PARTNER]: 3, // Partner has same level as enterprise
  };
  
  const currentPlanLevel = planHierarchy[organizationPlan];
  const requiredPlanLevel = planHierarchy[requiredPlan];
  
  return currentPlanLevel >= requiredPlanLevel;
}

/**
 * Middleware to check if organization has access to a specific feature
 */
export function requireFeatureAccess(feature: FeatureName) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Get organization from request (should be set by requireOrganization middleware)
    const organization = (req as any).organization;
    
    if (!organization) {
      return res.status(500).json({ 
        message: "Organization context not found" 
      });
    }
    
    if (!hasFeatureAccess(organization.plan, feature)) {
      const requiredPlan = FEATURE_PLAN_REQUIREMENTS[feature];
      return res.status(403).json({ 
        message: `This feature requires ${requiredPlan} plan. Current plan: ${organization.plan}`,
        feature,
        currentPlan: organization.plan,
        requiredPlan,
        upgradeRequired: true
      });
    }
    
    next();
  };
}

/**
 * Get plan-based feature availability for an organization
 */
export function getFeatureAvailability(organizationPlan: PlanType) {
  const features: Record<FeatureName, boolean> = {} as any;
  
  for (const [feature, requiredPlan] of Object.entries(FEATURE_PLAN_REQUIREMENTS)) {
    features[feature as FeatureName] = hasFeatureAccess(organizationPlan, feature as FeatureName);
  }
  
  return features;
}

/**
 * Get upgrade suggestions for missing features
 */
export function getUpgradeSuggestions(organizationPlan: PlanType): { plan: PlanType; features: FeatureName[] }[] {
  const suggestions: { plan: PlanType; features: FeatureName[] }[] = [];
  
  // Check what features each higher plan would unlock
  const plans = [Plan.PROFESSIONAL, Plan.ENTERPRISE];
  
  for (const plan of plans) {
    if (plan === organizationPlan) continue;
    
    const newFeatures: FeatureName[] = [];
    for (const [feature, requiredPlan] of Object.entries(FEATURE_PLAN_REQUIREMENTS)) {
      if (requiredPlan === plan && !hasFeatureAccess(organizationPlan, feature as FeatureName)) {
        newFeatures.push(feature as FeatureName);
      }
    }
    
    if (newFeatures.length > 0) {
      suggestions.push({ plan, features: newFeatures });
    }
  }
  
  return suggestions;
}