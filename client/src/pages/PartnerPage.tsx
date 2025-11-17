import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPartnerApplicationSchema } from "@shared/schema";
import type { InsertPartnerApplication } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle, Users, TrendingUp, DollarSign, Handshake, ArrowRight, Star } from "lucide-react";

export default function PartnerPage() {
  const { toast } = useToast();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const form = useForm<InsertPartnerApplication>({
    resolver: zodResolver(insertPartnerApplicationSchema),
    defaultValues: {
      name: "",
      email: "",
      company: "",
      website: "",
      expectedSeats: undefined,
      partnershipType: "reseller",
      message: "",
    },
  });

  const submitApplication = useMutation({
    mutationFn: (data: InsertPartnerApplication) => 
      apiRequest("POST", "/api/partners/applications", data),
    onSuccess: (data) => {
      setIsSubmitted(true);
      toast({
        title: "Application Submitted!",
        description: "Thank you for your interest in partnering with us. We'll be in touch soon.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: "There was an error submitting your application. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertPartnerApplication) => {
    submitApplication.mutate(data);
  };

  const scrollToForm = () => {
    document.getElementById('partner-application-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  // SEO: Set page title and meta tags
  useEffect(() => {
    document.title = "Partner Program - Join Whirkplace's Growing Network | Whirkplace";
    
    // Add or update meta description
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute('content', 'Join Whirkplace\'s Partner Program and earn 50-80% margins reselling team culture solutions. Risk-free launch with 60-day trial and full sales support included.');

    // Add Open Graph tags for social sharing
    const updateMetaTag = (property: string, content: string, isProperty = true) => {
      const attr = isProperty ? 'property' : 'name';
      let tag = document.querySelector(`meta[${attr}="${property}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attr, property);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };

    updateMetaTag('og:title', 'Partner Program - Scale Together, Profit Together | Whirkplace');
    updateMetaTag('og:description', 'Join our partner network and earn high margins reselling team culture solutions. Risk-free start with 60-day trial and full support.');
    updateMetaTag('og:type', 'website');
    updateMetaTag('og:url', window.location.href);
    
    // Cleanup function to restore original title
    return () => {
      document.title = 'Whirkplace';
    };
  }, []);

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
          <Button size="lg" className="bg-green-600 hover:bg-green-700" onClick={scrollToForm} data-testid="button-partner-cta-top">
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
            <Card className="border-2" data-testid="card-tier-standard">
              <CardHeader>
                <CardTitle className="text-center">Standard Partner</CardTitle>
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

      {/* Partner Application Form */}
      <section id="partner-application-form" className="py-20 px-4 bg-white dark:bg-gray-800">
        <div className="container mx-auto max-w-2xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-form-title">
              Partner Application
            </h2>
            <p className="text-xl text-muted-foreground" data-testid="text-form-subtitle">
              Tell us about your business and how you'd like to partner with us
            </p>
          </div>

          {isSubmitted ? (
            <Card className="p-8 text-center" data-testid="card-form-success">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-2xl font-bold mb-4" data-testid="text-success-title">Application Submitted!</h3>
              <p className="text-muted-foreground mb-6" data-testid="text-success-message">
                Thank you for your interest in partnering with Whirkplace. We'll review your application and get back to you within 2-3 business days.
              </p>
              <p className="text-sm text-muted-foreground">
                In the meantime, feel free to reach out with any questions at{" "}
                <a href="mailto:partners@whirkplace.com" className="text-green-600 hover:underline">
                  partners@whirkplace.com
                </a>
              </p>
            </Card>
          ) : (
            <Card className="p-8" data-testid="card-application-form">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Your full name" {...field} data-testid="input-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="your@email.com" {...field} data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="company"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Your company name" {...field} data-testid="input-company" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Website (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="https://yourcompany.com" {...field} data-testid="input-website" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="partnershipType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Partnership Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-partnership-type">
                                <SelectValue placeholder="Select partnership type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="reseller" data-testid="option-reseller">Reseller Partner</SelectItem>
                              <SelectItem value="affiliate" data-testid="option-affiliate">Affiliate Partner</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Resellers sell directly to customers. Affiliates earn commissions on referrals.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="expectedSeats"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expected Monthly Seats (Optional)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="50" 
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                              data-testid="input-expected-seats"
                            />
                          </FormControl>
                          <FormDescription>
                            How many seats do you expect to sell per month?
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tell Us About Your Business (Optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Tell us about your business, target market, and why you'd like to partner with Whirkplace..." 
                            className="min-h-[100px]"
                            {...field} 
                            data-testid="textarea-message"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-green-600 hover:bg-green-700"
                    disabled={submitApplication.isPending}
                    data-testid="button-submit-application"
                  >
                    {submitApplication.isPending ? "Submitting..." : "Submit Application"}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </form>
              </Form>
            </Card>
          )}
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
              onClick={scrollToForm}
              data-testid="button-partner-apply"
            >
              Apply to Partner Program <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="bg-transparent border-white text-white hover:bg-white hover:text-green-600"
              onClick={() => window.open('mailto:partners@whirkplace.com?subject=Partnership%20Discussion', '_blank')}
              data-testid="button-partner-schedule-call"
            >
              Schedule a Call
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}