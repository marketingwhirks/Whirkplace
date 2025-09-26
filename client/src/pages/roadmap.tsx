import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Rocket, Target, Star, Globe } from "lucide-react";

export default function RoadmapPage() {
  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Product Roadmap</h1>
          <p className="text-muted-foreground">
            Our vision for the future of Whirkplace - a comprehensive team management and wellness platform
          </p>
        </div>

        <Tabs defaultValue="immediate" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="immediate">Immediate</TabsTrigger>
            <TabsTrigger value="short">1-3 Months</TabsTrigger>
            <TabsTrigger value="medium">3-6 Months</TabsTrigger>
            <TabsTrigger value="long">6+ Months</TabsTrigger>
          </TabsList>

          <TabsContent value="immediate">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="w-5 h-5" />
                  Immediate Priorities
                </CardTitle>
                <CardDescription>Currently in development</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-4">
                    <div className="border-l-4 border-blue-500 pl-4">
                      <h3 className="font-semibold">Microsoft 365 SSO</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Single sign-on integration with Microsoft 365 credentials alongside existing Slack authentication
                      </p>
                    </div>
                    <div className="border-l-4 border-blue-500 pl-4">
                      <h3 className="font-semibold">Microsoft Teams Integration</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Real-time notifications and workflow automation similar to Slack integration
                      </p>
                    </div>
                    <div className="border-l-4 border-blue-500 pl-4">
                      <h3 className="font-semibold">Admin Configuration</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Organization-level settings to enable/disable Microsoft integrations
                      </p>
                    </div>
                    <div className="border-l-4 border-blue-500 pl-4">
                      <h3 className="font-semibold">Outlook Calendar Sync</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Enhanced calendar integration for One-on-One meetings
                      </p>
                    </div>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="short">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Short-term Enhancements
                </CardTitle>
                <CardDescription>1-3 months timeline</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-4">
                    <div className="border-l-4 border-green-500 pl-4">
                      <h3 className="font-semibold flex items-center gap-2">
                        KRA Document Upload & Realignment
                        <Badge variant="outline" className="text-xs">New</Badge>
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Upload PDF/Word KRA documents for automatic AI-powered review and reformatting
                      </p>
                      <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                        <li>Document parsing from PDFs and Word files</li>
                        <li>AI-powered content restructuring using OpenAI</li>
                        <li>Preview and edit interface for aligned KRAs</li>
                        <li>Save as templates or assign to team members</li>
                        <li>Version history and change tracking</li>
                      </ul>
                    </div>
                    <div className="border-l-4 border-green-500 pl-4">
                      <h3 className="font-semibold">Enhanced Analytics</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Advanced reporting and data visualization
                      </p>
                    </div>
                    <div className="border-l-4 border-green-500 pl-4">
                      <h3 className="font-semibold">Multi-Provider Authentication</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Seamless switching between Slack and Microsoft 365 authentication
                      </p>
                    </div>
                    <div className="border-l-4 border-green-500 pl-4">
                      <h3 className="font-semibold">Teams Notification Center</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Configurable notification preferences for Microsoft Teams
                      </p>
                    </div>
                    <div className="border-l-4 border-green-500 pl-4">
                      <h3 className="font-semibold">Advanced Team Management</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Hierarchical team structures with Microsoft organizational data sync
                      </p>
                    </div>
                    <div className="border-l-4 border-green-500 pl-4">
                      <h3 className="font-semibold">Performance Optimization</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Caching, data loading, and response times improvements
                      </p>
                    </div>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="medium">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="w-5 h-5" />
                  Medium-term Vision
                </CardTitle>
                <CardDescription>3-6 months timeline</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-4">
                    <div className="border-l-4 border-yellow-500 pl-4">
                      <h3 className="font-semibold">Microsoft Graph Integration</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Deep integration with Microsoft 365 ecosystem (SharePoint, OneDrive, etc.)
                      </p>
                    </div>
                    <div className="border-l-4 border-yellow-500 pl-4">
                      <h3 className="font-semibold">Advanced Teams Workflows</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Automated workflows and smart notifications in Microsoft Teams
                      </p>
                    </div>
                    <div className="border-l-4 border-yellow-500 pl-4">
                      <h3 className="font-semibold">Co-Branded Partner Platform</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Partner reseller solution with Whirkplace brand equity
                      </p>
                      <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                        <li>Partner co-branding with "Powered by Whirkplace"</li>
                        <li>Custom subdomain configuration</li>
                        <li>Partner admin portal for client management</li>
                        <li>Revenue sharing and commission tracking</li>
                      </ul>
                    </div>
                    <div className="border-l-4 border-yellow-500 pl-4">
                      <h3 className="font-semibold">iPhone App Development</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Convert to iOS app using Capacitor (1-2 weeks implementation)
                      </p>
                    </div>
                    <div className="border-l-4 border-yellow-500 pl-4">
                      <h3 className="font-semibold">Enterprise Features</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Advanced security, audit logs, and compliance features
                      </p>
                    </div>
                    <div className="border-l-4 border-yellow-500 pl-4">
                      <h3 className="font-semibold">Anonymized Organization Analytics</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Benchmarking analytics comparing health scores across organizations
                      </p>
                    </div>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="long">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Long-term Vision
                </CardTitle>
                <CardDescription>6+ months timeline</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-4">
                    <div className="border-l-4 border-purple-500 pl-4">
                      <h3 className="font-semibold">Microsoft Viva Integration</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Connect with Microsoft Viva suite for employee experience
                      </p>
                    </div>
                    <div className="border-l-4 border-purple-500 pl-4">
                      <h3 className="font-semibold">API Platform</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Public API for third-party integrations and custom workflows
                      </p>
                    </div>
                    <div className="border-l-4 border-purple-500 pl-4">
                      <h3 className="font-semibold">Advanced AI Features</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        AI-powered insights using Microsoft Cognitive Services
                      </p>
                    </div>
                    <div className="border-l-4 border-purple-500 pl-4">
                      <h3 className="font-semibold">Global Expansion</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Multi-language support and regional compliance
                      </p>
                    </div>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}