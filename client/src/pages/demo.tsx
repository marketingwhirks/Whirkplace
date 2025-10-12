import { useState } from "react";
import { Link } from "wouter";
import { Building2, Users, Target, BarChart3, Zap, Shield, CheckCircle2, ArrowRight, Play, ChevronRight, Heart, Trophy, MessageSquare, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DemoPage() {
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);

  const features = [
    {
      icon: UserCheck,
      title: "Weekly Check-Ins",
      description: "Keep pulse on team health with automated weekly surveys",
      color: "bg-blue-500"
    },
    {
      icon: Trophy,
      title: "Wins & Recognition",
      description: "Celebrate achievements and boost morale across teams",
      color: "bg-green-500"
    },
    {
      icon: MessageSquare,
      title: "Peer-to-Peer Kudos",
      description: "Foster a culture of appreciation and recognition",
      color: "bg-purple-500"
    },
    {
      icon: BarChart3,
      title: "Team Analytics",
      description: "Data-driven insights for better team management",
      color: "bg-orange-500"
    },
    {
      icon: Target,
      title: "KRA Management",
      description: "Track key results and individual performance",
      color: "bg-indigo-500"
    },
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "SSO, role-based access, and data protection",
      color: "bg-red-500"
    }
  ];

  const benefits = [
    "Improve team morale by 40%",
    "Reduce turnover by 25%",
    "Save 10 hours per week on management",
    "Increase engagement scores by 35%"
  ];

  const demoAccounts = [
    { role: "Account Owner", name: "John Delicious", email: "john@delicious.com" },
    { role: "Admin", name: "Sarah Delicious", email: "sarah@delicious.com" },
    { role: "Team Member", name: "Mike Delicious", email: "mike@delicious.com" }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-12">
        <div className="text-center space-y-6 max-w-4xl mx-auto">
          <Badge className="text-sm px-3 py-1" variant="secondary">
            <Zap className="w-3 h-3 mr-1" />
            Live Demo Available
          </Badge>
          
          <h1 className="text-5xl md:text-6xl font-bold text-foreground">
            Experience <span className="text-primary">Whirkplace <span className="text-4xl md:text-5xl font-normal">by Whirks</span></span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            The comprehensive team culture platform that transforms how organizations track wellness, 
            celebrate wins, and build stronger teams.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
            <Link href="/demo/login">
              <Button size="lg" className="group">
                <Play className="w-4 h-4 mr-2" />
                Try Live Demo
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">
                Sign In to Your Account
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Powerful Features for Modern Teams</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Everything you need to build a thriving team culture, all in one platform.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Card 
                key={index}
                className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 cursor-pointer"
                onMouseEnter={() => setHoveredFeature(index)}
                onMouseLeave={() => setHoveredFeature(null)}
              >
                <div className={`absolute inset-0 ${feature.color} opacity-5 group-hover:opacity-10 transition-opacity`} />
                <CardHeader>
                  <div className={`w-12 h-12 rounded-lg ${feature.color} bg-opacity-10 flex items-center justify-center mb-4`}>
                    <Icon className={`w-6 h-6 ${feature.color.replace('bg-', 'text-')}`} />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Benefits Section */}
      <div className="container mx-auto px-4 py-16">
        <Card className="bg-muted/50 border-muted">
          <CardContent className="p-8">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-2xl font-bold mb-4">Proven Results</h2>
                <p className="text-muted-foreground mb-6">
                  Organizations using Whirkplace <span className="text-sm">by Whirks</span> see immediate improvements in team health and productivity.
                </p>
                <div className="space-y-3">
                  {benefits.map((benefit, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                      <span className="font-medium">{benefit}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <Card className="bg-background border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Demo Organization</CardTitle>
                    <CardDescription>Fictitious Delicious</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      Explore all features with our demo accounts:
                    </p>
                    <div className="space-y-2">
                      {demoAccounts.map((account, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span className="font-medium">{account.role}</span>
                          <span className="text-muted-foreground">{account.name}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CTA Section */}
      <div className="container mx-auto px-4 py-16">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="p-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Transform Your Team?</h2>
            <p className="text-lg mb-8 opacity-90 max-w-2xl mx-auto">
              See how Whirkplace <span className="text-base">by Whirks</span> can help you build a stronger, more connected team culture.
              Try our demo with full access to all features.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/demo/login">
                <Button size="lg" variant="secondary" className="group">
                  <Play className="w-4 h-4 mr-2" />
                  Start Demo Now
                  <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="lg" variant="secondary">
                  Create Your Organization
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="container mx-auto px-4 py-8 text-center text-muted-foreground">
        <p className="text-sm">
          © 2025 Whirkplace <span className="text-xs">by Whirks</span>. All rights reserved. | 
          <Link href="/login" className="ml-1 hover:text-primary underline">Sign In</Link> | 
          <Link href="/signup" className="ml-1 hover:text-primary underline">Sign Up</Link>
        </p>
      </div>
    </div>
  );
}