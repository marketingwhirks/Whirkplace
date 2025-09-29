import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Heart, Users, MessageSquare, BarChart3, CheckCircle, Star, ArrowRight, Building, Zap, Shield, Play, Tag, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";


export default function LandingPage() {
  const [location, setLocation] = useLocation();
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; percentage: number; description: string } | null>(null);
  const { toast } = useToast();

  // Check authentication status using the proper hook
  const { data: user, isLoading } = useCurrentUser();
  const isAuthenticated = !!user;

  // Determine organization based on hostname or URL params
  const getOrgSlug = () => {
    const hostname = window.location.hostname.toLowerCase();
    const urlParams = new URLSearchParams(window.location.search);
    const orgParam = urlParams.get('org');
    
    // Debug logging to see what hostname we're getting
    console.log('Landing page hostname:', hostname);
    
    // If org is specified in URL params, use that
    if (orgParam) {
      console.log('Using org from URL param:', orgParam);
      return orgParam;
    }
    
    // Check if we're on a specific organization's subdomain
    // e.g., acme.whirkplace.com -> org = acme
    if (hostname.includes('.whirkplace.com') && 
        !hostname.startsWith('www.') && 
        !hostname.startsWith('app.')) {
      const subdomain = hostname.split('.')[0];
      if (subdomain && subdomain !== 'whirkplace') {
        console.log('Using org from subdomain:', subdomain);
        return subdomain;
      }
    }
    
    // For main whirkplace.com domain, don't default to any org
    // This allows users to create new organizations
    if (hostname === 'whirkplace.com' || 
        hostname === 'www.whirkplace.com' || 
        hostname === 'app.whirkplace.com') {
      console.log('Main whirkplace.com domain - no default org');
      return null;
    }
    
    // For replit dev environments during testing
    if (hostname.includes('replit') || hostname.includes('repl.co')) {
      console.log('Detected replit domain - no default org for signup');
      return null;
    }
    
    // No default org - allow user to choose
    console.log('No org determined for hostname:', hostname);
    return null;
  };

  const redirectToDashboard = () => {
    const orgSlug = getOrgSlug();
    if (orgSlug) {
      setLocation(`/?org=${orgSlug}`);
    } else {
      setLocation(`/`);
    }
  };

  const handleSignIn = () => {
    const orgSlug = getOrgSlug();
    if (orgSlug) {
      setLocation(`/login?org=${orgSlug}`);
    } else {
      setLocation(`/login`);
    }
  };

  const handleSignUp = () => {
    const orgSlug = getOrgSlug();
    if (orgSlug) {
      setLocation(`/login?org=${orgSlug}&signup=true`);
    } else {
      // Go to business signup page for creating new organization
      setLocation(`/business-signup`);
    }
  };

  const handleStandardSignUp = () => {
    const orgSlug = getOrgSlug();
    if (orgSlug) {
      setLocation(`/login?org=${orgSlug}&signup=true&plan=standard`);
    } else {
      setLocation(`/business-signup?plan=standard`);
    }
  };

  const handleProfessionalSignUp = () => {
    const orgSlug = getOrgSlug();
    if (orgSlug) {
      setLocation(`/login?org=${orgSlug}&signup=true&plan=professional`);
    } else {
      setLocation(`/business-signup?plan=professional`);
    }
  };

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Loading...</h2>
        </div>
      </div>
    );
  }

  // If user is authenticated, redirect to dashboard
  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center" data-testid="authenticated-redirect">
          <h2 className="text-2xl font-bold mb-4">Welcome back!</h2>
          <Button onClick={redirectToDashboard} data-testid="button-dashboard">
            Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Header with Sign-in Buttons */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container px-4 sm:px-6 md:px-8 flex h-16 items-center justify-between">
          <div className="flex items-center space-x-2" data-testid="logo">
            <div className="w-8 h-8 rounded-lg border-2 flex items-center justify-center" style={{backgroundColor: '#1b365d', borderColor: '#1b365d'}}>
              <Heart className="w-4 h-4" style={{fill: '#84ae56', stroke: '#84ae56'}} strokeWidth="2" />
            </div>
            <span className="text-xl font-bold text-[#1b365d] dark:text-white">Whirkplace</span>
          </div>
          
          <div className="flex items-center space-x-3">
            <Button 
              variant="outline" 
              onClick={handleSignIn}
              data-testid="button-signin"
            >
              Sign In
            </Button>
            <Button 
              onClick={handleSignUp}
              data-testid="button-signup"
              className="border-primary"
            >
              Sign Up
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <Badge variant="secondary" className="mb-6" data-testid="badge-hero">
            Transform Your Team Culture
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6" data-testid="text-hero-title">
            Build Stronger Teams with
            <span className="text-primary block">Whirkplace</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto" data-testid="text-hero-description">
            The comprehensive team management and wellness platform that helps organizations track team health, conduct regular check-ins, and foster positive workplace culture.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={handleSignUp} data-testid="button-get-started">
              Get Started Free <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => setLocation('/demo')} data-testid="button-try-demo">
              <Play className="mr-2 h-5 w-5" /> Try Live Demo
            </Button>
            <Button size="lg" variant="outline" onClick={handleSignIn} data-testid="button-signin-hero">
              Sign In
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-white dark:bg-gray-800">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-features-title">
              Everything you need for team success
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto" data-testid="text-features-description">
              Powerful tools to build, monitor, and celebrate your team culture
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card data-testid="card-feature-checkins">
              <CardHeader>
                <MessageSquare className="h-10 w-10 text-primary mb-4" />
                <CardTitle>Regular Check-ins</CardTitle>
                <CardDescription>
                  Stay connected with automated wellness surveys and mood tracking
                </CardDescription>
              </CardHeader>
            </Card>

            <Card data-testid="card-feature-analytics">
              <CardHeader>
                <BarChart3 className="h-10 w-10 text-primary mb-4" />
                <CardTitle>Team Analytics</CardTitle>
                <CardDescription>
                  Deep insights into team health, engagement, and performance trends
                </CardDescription>
              </CardHeader>
            </Card>

            <Card data-testid="card-feature-recognition">
              <CardHeader>
                <Star className="h-10 w-10 text-primary mb-4" />
                <CardTitle>Win Recognition</CardTitle>
                <CardDescription>
                  Celebrate achievements and build positive culture through peer recognition
                </CardDescription>
              </CardHeader>
            </Card>

            <Card data-testid="card-feature-integration">
              <CardHeader>
                <Zap className="h-10 w-10 text-primary mb-4" />
                <CardTitle>Slack & Microsoft Integration</CardTitle>
                <CardDescription>
                  Seamless integration with your existing workflow tools
                </CardDescription>
              </CardHeader>
            </Card>

            <Card data-testid="card-feature-management">
              <CardHeader>
                <Users className="h-10 w-10 text-primary mb-4" />
                <CardTitle>Team Management</CardTitle>
                <CardDescription>
                  Organize teams, assign leaders, and track progress across departments
                </CardDescription>
              </CardHeader>
            </Card>

            <Card data-testid="card-feature-security">
              <CardHeader>
                <Shield className="h-10 w-10 text-primary mb-4" />
                <CardTitle>Enterprise Security</CardTitle>
                <CardDescription>
                  Multi-tenant architecture with robust security and data isolation
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-pricing-title">
              Simple, transparent pricing
            </h2>
            <p className="text-xl text-muted-foreground" data-testid="text-pricing-description">
              Choose monthly or annual billing • Save 20% with annual plans
            </p>
          </div>

          {/* Discount Code Section */}
          <div className="max-w-md mx-auto mb-8">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Enter discount code"
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value)}
                  className="pl-10 pr-3"
                  data-testid="input-discount-code-landing"
                  disabled={!!appliedDiscount}
                />
              </div>
              {!appliedDiscount ? (
                <Button
                  onClick={async () => {
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
                      // For landing page, we'll validate with a sample price of 1000 (representing $10)
                      const response = await apiRequest('POST', '/api/discount-codes/validate', {
                        code,
                        planId: 'professional', // Default to professional for validation
                        orderAmount: 1000, // $10 in cents
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
                          // For fixed amount, calculate percentage based on base price
                          discountPercentage = Math.round((discount.discountValue / 1000) * 100);
                          description = description || `$${(discount.discountValue / 100).toFixed(2)} off`;
                        }
                        
                        setAppliedDiscount({ 
                          code, 
                          percentage: discountPercentage, 
                          description 
                        });
                        toast({
                          title: "Discount Applied!",
                          description: `${description} has been applied to pricing`,
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
                  }}
                  variant="outline"
                  data-testid="button-apply-discount-landing"
                >
                  Apply
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setAppliedDiscount(null);
                    setDiscountCode('');
                    toast({
                      title: "Discount Removed",
                      description: "The discount has been removed",
                    });
                  }}
                  variant="outline"
                  data-testid="button-remove-discount-landing"
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

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card 
              className="border-2 cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105" 
              onClick={handleStandardSignUp}
              data-testid="card-plan-standard"
            >
              <CardHeader>
                <CardTitle>Standard</CardTitle>
                <div className="text-3xl font-bold">${appliedDiscount ? Math.round(5 * (1 - appliedDiscount.percentage / 100)) : 5}<span className="text-sm font-normal">/user/month</span></div>
                <div className="text-sm text-muted-foreground">or ${appliedDiscount ? Math.round(4 * (1 - appliedDiscount.percentage / 100)) : 4}/month billed annually</div>
                <CardDescription>Perfect for small teams getting started</CardDescription>
                {appliedDiscount && (
                  <Badge className="text-xs" variant="default">
                    {appliedDiscount.percentage}% off applied
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Weekly Check-ins</li>
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Win Recognition</li>
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Team Management</li>
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Basic Analytics</li>
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Slack Integration</li>
                </ul>
              </CardContent>
            </Card>

            <Card 
              className="border-2 border-primary relative cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105" 
              onClick={handleProfessionalSignUp}
              data-testid="card-plan-professional"
            >
              <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2">Most Popular</Badge>
              <CardHeader>
                <CardTitle>Professional</CardTitle>
                <div className="text-3xl font-bold">${appliedDiscount ? Math.round(8 * (1 - appliedDiscount.percentage / 100)) : 8}<span className="text-sm font-normal">/user/month</span></div>
                <div className="text-sm text-muted-foreground">or ${appliedDiscount ? Math.round(6 * (1 - appliedDiscount.percentage / 100)) : 6}/month billed annually</div>
                <CardDescription>Advanced features for growing teams</CardDescription>
                {appliedDiscount && (
                  <Badge className="text-xs" variant="default">
                    {appliedDiscount.percentage}% off applied
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Everything in Standard</li>
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />KRA Management (Key Result Areas)</li>
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />One-on-One Meeting Management</li>
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Advanced Analytics</li>
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Priority Support</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 border-green-500" data-testid="card-plan-partner">
              <CardHeader>
                <CardTitle>Partner Program</CardTitle>
                <div className="text-lg text-muted-foreground font-medium">Tiered wholesale pricing • Scale and save</div>
                <CardDescription>Resell Whirkplace and maximize your margins</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />More customers = lower cost per seat</li>
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />50-70% profit margins</li>
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />First 50 seats free to start</li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full" 
                  variant="outline" 
                  onClick={() => window.location.href = "/partners"}
                  data-testid="button-learn-more-partners"
                >
                  Learn More
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-primary text-primary-foreground">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-cta-title">
            Ready to transform your team culture?
          </h2>
          <p className="text-xl mb-8 opacity-90" data-testid="text-cta-description">
            Join thousands of teams building stronger workplace connections
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              variant="secondary" 
              onClick={handleSignUp}
              data-testid="button-cta-signup"
            >
              Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              onClick={handleSignIn}
              data-testid="button-cta-signin"
              className="bg-transparent border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary"
            >
              Sign In
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 bg-white dark:bg-gray-800 border-t">
        <div className="container mx-auto text-center">
          <div className="flex items-center justify-center space-x-2 mb-4" data-testid="footer-logo">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{backgroundColor: '#1b365d'}}>
              <Heart className="w-3 h-3" style={{fill: '#84ae56', stroke: '#84ae56'}} strokeWidth="2" />
            </div>
            <span className="text-lg font-semibold text-[#1b365d] dark:text-white">Whirkplace</span>
          </div>
          <p className="text-muted-foreground" data-testid="text-footer">
            Building stronger teams, one connection at a time.
          </p>
        </div>
      </footer>
    </div>
  );
}