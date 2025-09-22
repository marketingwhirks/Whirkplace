import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Users, TrendingUp, DollarSign, Handshake, ArrowRight, Star } from "lucide-react";

export default function PartnerPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <section className="py-20 px-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20">
        <div className="container mx-auto text-center">
          <Badge className="mb-4 bg-green-500 text-white" data-testid="badge-partner-program">
            Partner Program
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold mb-6" data-testid="text-partner-title">
            Scale Together, Profit Together
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto" data-testid="text-partner-subtitle">
            Join our partner program and build a profitable business reselling Whirkplace's team culture platform
          </p>
          <Button size="lg" className="bg-green-600 hover:bg-green-700" data-testid="button-partner-cta-top">
            Apply to Become a Partner <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Partner Benefits */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-benefits-title">
              Why Partner With Whirkplace?
            </h2>
            <p className="text-xl text-muted-foreground" data-testid="text-benefits-subtitle">
              Build recurring revenue while helping organizations strengthen their team culture
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card data-testid="card-benefit-margins">
              <CardHeader>
                <DollarSign className="h-12 w-12 text-green-600 mb-4" />
                <CardTitle>High Profit Margins</CardTitle>
                <CardDescription>Earn 50-70% margins on every customer you bring</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Tiered pricing: $5 → $4 → $3 per seat</li>
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Recurring monthly revenue</li>
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Scale discounts reward growth</li>
                </ul>
              </CardContent>
            </Card>

            <Card data-testid="card-benefit-support">
              <CardHeader>
                <Users className="h-12 w-12 text-blue-600 mb-4" />
                <CardTitle>Full Sales Support</CardTitle>
                <CardDescription>We help you win deals and keep customers happy</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Sales training & materials</li>
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Technical support for customers</li>
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Co-marketing opportunities</li>
                </ul>
              </CardContent>
            </Card>

            <Card data-testid="card-benefit-growth">
              <CardHeader>
                <TrendingUp className="h-12 w-12 text-purple-600 mb-4" />
                <CardTitle>Growing Market</CardTitle>
                <CardDescription>Team culture and employee engagement are hot topics</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Remote work driving demand</li>
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />HR budgets increasing</li>
                  <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Easy to demonstrate ROI</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing Structure */}
      <section className="py-20 px-4 bg-white dark:bg-gray-800">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-pricing-title">
              Partner Pricing Structure
            </h2>
            <p className="text-xl text-muted-foreground" data-testid="text-pricing-subtitle">
              The more customers you bring, the better your margins become
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <Card className="border-2" data-testid="card-tier-starter">
              <CardHeader>
                <CardTitle className="text-center">Starter Partner</CardTitle>
                <div className="text-center">
                  <div className="text-4xl font-bold text-green-600">$5</div>
                  <div className="text-sm text-muted-foreground">per member/month</div>
                  <div className="text-sm font-medium">0-99 seats</div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-center text-muted-foreground mb-4">Perfect for getting started</p>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Your profit margin</div>
                  <div className="text-2xl font-bold text-green-600">50-67%</div>
                  <div className="text-xs text-muted-foreground">when selling at $10-$15</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-green-500 relative" data-testid="card-tier-growth">
              <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-green-500 text-white">Popular</Badge>
              <CardHeader>
                <CardTitle className="text-center">Growth Partner</CardTitle>
                <div className="text-center">
                  <div className="text-4xl font-bold text-green-600">$4</div>
                  <div className="text-sm text-muted-foreground">per member/month</div>
                  <div className="text-sm font-medium">100-499 seats</div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-center text-muted-foreground mb-4">Scaling your business</p>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Your profit margin</div>
                  <div className="text-2xl font-bold text-green-600">60-73%</div>
                  <div className="text-xs text-muted-foreground">when selling at $10-$15</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2" data-testid="card-tier-enterprise">
              <CardHeader>
                <CardTitle className="text-center">Enterprise Partner</CardTitle>
                <div className="text-center">
                  <div className="text-4xl font-bold text-green-600">$3</div>
                  <div className="text-sm text-muted-foreground">per member/month</div>
                  <div className="text-sm font-medium">500+ seats</div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-center text-muted-foreground mb-4">Maximum scale rewards</p>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Your profit margin</div>
                  <div className="text-2xl font-bold text-green-600">70-80%</div>
                  <div className="text-xs text-muted-foreground">when selling at $10-$15</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Getting Started */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-getting-started-title">
              Getting Started is Risk-Free
            </h2>
            <p className="text-xl text-muted-foreground" data-testid="text-getting-started-subtitle">
              We want you to succeed, so we're removing the barriers to entry
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 max-w-4xl mx-auto">
            <div>
              <h3 className="text-2xl font-bold mb-4" data-testid="text-launch-credits-title">
                <Star className="inline h-6 w-6 text-yellow-500 mr-2" />
                Launch Credits
              </h3>
              <p className="text-muted-foreground mb-4">
                Get your first 50 customer seats completely free for 60 days. Use this time to:
              </p>
              <ul className="space-y-2">
                <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Test the product with real customers</li>
                <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Build case studies and testimonials</li>
                <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Refine your sales process</li>
                <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Prove ROI to larger prospects</li>
              </ul>
            </div>

            <div>
              <h3 className="text-2xl font-bold mb-4" data-testid="text-affiliate-option-title">
                <Handshake className="inline h-6 w-6 text-blue-500 mr-2" />
                Affiliate Option
              </h3>
              <p className="text-muted-foreground mb-4">
                Not ready to resell directly? Start as an affiliate and earn commissions:
              </p>
              <ul className="space-y-2">
                <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />25% commission on Year 1 revenue</li>
                <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />15% commission on lifetime revenue</li>
                <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />No upfront costs or commitments</li>
                <li className="flex items-start"><CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />Upgrade to reseller anytime</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-br from-green-600 to-green-700 text-white">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-cta-title">
            Ready to Partner With Us?
          </h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto" data-testid="text-cta-description">
            Join our growing network of partners who are building profitable businesses while helping teams thrive
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              variant="secondary"
              data-testid="button-partner-apply"
            >
              Apply to Partner Program <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="bg-transparent border-white text-white hover:bg-white hover:text-green-600"
              data-testid="button-partner-learn-more"
            >
              Schedule a Call
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}