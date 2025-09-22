import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, Users, MessageSquare, BarChart3, CheckCircle, Star, ArrowRight, Building, Zap, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

export default function LandingPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check authentication status
  const { data: user } = useQuery({
    queryKey: ['/api/users/current'],
    retry: false,
    throwOnError: false
  });

  useEffect(() => {
    setIsAuthenticated(!!user);
  }, [user]);

  const handleSlackLogin = () => {
    window.location.href = "/auth/slack/login?org=default-org";
  };

  const handleMicrosoftLogin = () => {
    window.location.href = "/auth/microsoft?org=default-org";
  };

  const redirectToDashboard = () => {
    window.location.href = "/?org=default-org";
  };

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
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center space-x-2" data-testid="logo">
            <Heart className="h-8 w-8 text-green-600" />
            <span className="text-xl font-bold">Whirkplace</span>
          </div>
          
          <div className="flex items-center space-x-3">
            <Button 
              variant="outline" 
              onClick={handleSlackLogin}
              data-testid="button-slack-login"
              className="flex items-center space-x-2"
            >
              <span>Sign in with Slack</span>
            </Button>
            <Button 
              onClick={handleMicrosoftLogin}
              data-testid="button-microsoft-login"
              className="flex items-center space-x-2"
            >
              <span>Sign in with Microsoft</span>
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
            <Button size="lg" onClick={handleSlackLogin} data-testid="button-get-started-slack">
              Get Started with Slack <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" onClick={handleMicrosoftLogin} data-testid="button-get-started-microsoft">
              Get Started with Microsoft
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
              Choose the plan that works for your team
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="border-2" data-testid="card-plan-starter">
              <CardHeader>
                <CardTitle>Starter</CardTitle>
                <div className="text-3xl font-bold">$9<span className="text-sm font-normal">/month</span></div>
                <CardDescription>Perfect for small teams getting started</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-center"><CheckCircle className="h-5 w-5 text-green-500 mr-2" />Up to 10 team members</li>
                  <li className="flex items-center"><CheckCircle className="h-5 w-5 text-green-500 mr-2" />Basic check-ins</li>
                  <li className="flex items-center"><CheckCircle className="h-5 w-5 text-green-500 mr-2" />Slack integration</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 border-primary relative" data-testid="card-plan-professional">
              <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2">Most Popular</Badge>
              <CardHeader>
                <CardTitle>Professional</CardTitle>
                <div className="text-3xl font-bold">$29<span className="text-sm font-normal">/month</span></div>
                <CardDescription>Advanced features for growing teams</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-center"><CheckCircle className="h-5 w-5 text-green-500 mr-2" />Up to 50 team members</li>
                  <li className="flex items-center"><CheckCircle className="h-5 w-5 text-green-500 mr-2" />Advanced analytics</li>
                  <li className="flex items-center"><CheckCircle className="h-5 w-5 text-green-500 mr-2" />Microsoft integration</li>
                  <li className="flex items-center"><CheckCircle className="h-5 w-5 text-green-500 mr-2" />Custom questions</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2" data-testid="card-plan-enterprise">
              <CardHeader>
                <CardTitle>Enterprise</CardTitle>
                <div className="text-3xl font-bold">$49<span className="text-sm font-normal">/month</span></div>
                <CardDescription>Full platform for large organizations</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-center"><CheckCircle className="h-5 w-5 text-green-500 mr-2" />Unlimited team members</li>
                  <li className="flex items-center"><CheckCircle className="h-5 w-5 text-green-500 mr-2" />White label options</li>
                  <li className="flex items-center"><CheckCircle className="h-5 w-5 text-green-500 mr-2" />Priority support</li>
                  <li className="flex items-center"><CheckCircle className="h-5 w-5 text-green-500 mr-2" />Custom integrations</li>
                </ul>
              </CardContent>
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
              onClick={handleSlackLogin} 
              data-testid="button-cta-slack"
            >
              Start with Slack <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              onClick={handleMicrosoftLogin} 
              data-testid="button-cta-microsoft"
              className="bg-transparent border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary"
            >
              Start with Microsoft
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 bg-white dark:bg-gray-800 border-t">
        <div className="container mx-auto text-center">
          <div className="flex items-center justify-center space-x-2 mb-4" data-testid="footer-logo">
            <Heart className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold">Whirkplace</span>
          </div>
          <p className="text-muted-foreground" data-testid="text-footer">
            Building stronger teams, one connection at a time.
          </p>
        </div>
      </footer>
    </div>
  );
}