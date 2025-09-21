import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Slack, 
  Calendar, 
  Settings, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  RefreshCw, 
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  HelpCircle,
  Shield,
  Globe,
  Building
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";

// Types for organization integration data - NEVER include secrets
interface OrganizationIntegrations {
  id: string;
  name: string;
  // Slack fields
  slackWorkspaceId?: string;
  slackChannelId?: string;
  hasSlackBotToken?: boolean; // Boolean indicator only, never actual token
  enableSlackIntegration: boolean;
  slackConnectionStatus: string;
  slackLastConnected?: string;
  // Microsoft fields  
  microsoftTenantId?: string;
  microsoftClientId?: string;
  hasMicrosoftClientSecret?: boolean; // Boolean indicator only, never actual secret
  enableMicrosoftAuth: boolean;
  enableTeamsIntegration: boolean;
  microsoftConnectionStatus: string;
  microsoftLastConnected?: string;
}

interface SlackTestResult {
  success: boolean;
  message: string;
  workspaceName?: string;
  channelName?: string;
}

interface MicrosoftTestResult {
  success: boolean;
  message: string;
  tenantName?: string;
  domain?: string;
}

export function IntegrationsDashboard() {
  const { toast } = useToast();
  const { data: currentUser } = useCurrentUser();
  const [activeTab, setActiveTab] = useState("slack");
  const [showSlackToken, setShowSlackToken] = useState(false);
  const [showMicrosoftSecret, setShowMicrosoftSecret] = useState(false);
  const [slackSetupStep, setSlackSetupStep] = useState(1);
  const [microsoftSetupStep, setMicrosoftSetupStep] = useState(1);

  // Form state for integrations
  const [slackBotToken, setSlackBotToken] = useState("");
  const [slackChannelId, setSlackChannelId] = useState("");
  const [microsoftTenantId, setMicrosoftTenantId] = useState("");
  const [microsoftClientId, setMicrosoftClientId] = useState("");
  const [microsoftClientSecret, setMicrosoftClientSecret] = useState("");

  // Fetch organization integration data
  const { data: orgIntegrations, isLoading: integrationsLoading } = useQuery<OrganizationIntegrations>({
    queryKey: ["/api/organizations", currentUser?.organizationId, "integrations"],
    queryFn: async () => {
      if (!currentUser?.organizationId) throw new Error("No organization ID");
      const response = await fetch(`/api/organizations/${currentUser.organizationId}/integrations`);
      if (!response.ok) throw new Error('Failed to fetch organization integrations');
      return response.json();
    },
    enabled: !!currentUser?.organizationId && currentUser?.role === "admin",
  });

  // Slack OAuth installation flow
  const getSlackInstallUrl = useMutation({
    mutationFn: async () => {
      if (!currentUser?.organizationId) throw new Error("No organization found");
      const response = await apiRequest("GET", `/api/organizations/${currentUser.organizationId}/integrations/slack/install`);
      return await response.json() as {
        installUrl: string;
        scopes: string[];
        redirectUri: string;
        state: string;
      };
    },
    onSuccess: (data) => {
      // Open Slack OAuth in new window
      window.open(data.installUrl, "_blank", "width=600,height=600");
      toast({
        title: "Slack Installation Started",
        description: "Please complete the installation in the new window.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Installation Error", 
        description: error.message || "Failed to generate Slack install URL",
        variant: "destructive",
      });
    },
  });

  // Handle OAuth completion via postMessage from popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'SLACK_OAUTH_SUCCESS') {
        toast({
          title: "Slack Integration Complete!",
          description: `Successfully connected to workspace: ${event.data.workspaceName}`,
        });
        // Refresh integration data
        queryClient.invalidateQueries({ 
          queryKey: ["/api/organizations", currentUser?.organizationId, "integrations"] 
        });
      } else if (event.data.type === 'SLACK_OAUTH_ERROR') {
        toast({
          title: "Slack Integration Failed",
          description: event.data.message || "Failed to connect Slack workspace",
          variant: "destructive",
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [currentUser?.organizationId, queryClient, toast]);

  // Test Microsoft connection
  const testMicrosoftConnection = useMutation({
    mutationFn: async (credentials: { tenantId: string; clientId: string; clientSecret: string }) => {
      const response = await apiRequest("POST", "/api/integrations/microsoft/test", credentials);
      return await response.json() as MicrosoftTestResult;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Microsoft connection successful",
          description: `Connected to tenant: ${data.tenantName}`,
        });
      } else {
        toast({
          title: "Microsoft connection failed",
          description: data.message,
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Connection test failed",
        description: "Unable to test Microsoft connection. Please check your credentials.",
        variant: "destructive",
      });
    },
  });

  // Save Slack integration (channel settings only - token saved via OAuth)
  const saveSlackIntegration = useMutation({
    mutationFn: async (data: { channelId: string; enable: boolean }) => {
      const response = await apiRequest("PUT", `/api/organizations/${currentUser?.organizationId}/integrations/slack`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", currentUser?.organizationId, "integrations"] });
      toast({
        title: "Slack integration saved",
        description: "Your Slack workspace has been configured successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Save failed",
        description: "Failed to save Slack integration. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Save Microsoft integration
  const saveMicrosoftIntegration = useMutation({
    mutationFn: async (data: { tenantId: string; clientId: string; clientSecret: string; enableAuth: boolean; enableTeams: boolean }) => {
      const response = await apiRequest("PUT", `/api/organizations/${currentUser?.organizationId}/integrations/microsoft`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", currentUser?.organizationId, "integrations"] });
      toast({
        title: "Microsoft integration saved",
        description: "Your Microsoft 365 tenant has been configured successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Save failed",
        description: "Failed to save Microsoft integration. Please try again.",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (text: string, description: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: `${description} copied to clipboard`,
    });
  };

  const getStatusBadge = (status: string, connected: boolean = false) => {
    if (status === "connected" || connected) {
      return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Connected</Badge>;
    } else if (status === "error") {
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
    } else {
      return <Badge variant="secondary"><AlertCircle className="w-3 h-3 mr-1" />Not Configured</Badge>;
    }
  };

  const redirectUris = [
    "https://app.whirkplace.com/api/auth/slack/callback",
    "https://whirkplace.com/api/auth/slack/callback"
  ];

  const microsoftRedirectUris = [
    "https://app.whirkplace.com/auth/microsoft/callback", 
    "https://whirkplace.com/auth/microsoft/callback"
  ];

  const slackBotScopes = [
    "chat:write",
    "channels:read", 
    "users:read",
    "users:read.email"
  ];

  const microsoftPermissions = [
    "User.Read",
    "offline_access",
    "Calendars.Read",
    "Calendars.ReadWrite"
  ];

  if (integrationsLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show access denied if user is not admin
  if (currentUser?.role !== "admin") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-orange-500" />
            Admin Access Required
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Only organization administrators can manage integrations. Contact your admin to configure Slack and Microsoft integrations.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="integrations-dashboard">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Integration Management
          </CardTitle>
          <CardDescription>
            Configure external integrations for your organization. Set up your own Slack workspace and Microsoft 365 tenant.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="slack" data-testid="tab-slack">
            <Slack className="w-4 h-4 mr-2" />
            Slack Workspace
          </TabsTrigger>
          <TabsTrigger value="microsoft" data-testid="tab-microsoft">
            <Building className="w-4 h-4 mr-2" />
            Microsoft 365
          </TabsTrigger>
          <TabsTrigger value="calendar" data-testid="tab-calendar">
            <Calendar className="w-4 h-4 mr-2" />
            Calendar
          </TabsTrigger>
        </TabsList>

        {/* Slack Integration Tab */}
        <TabsContent value="slack" className="space-y-6">
          <Card data-testid="card-slack-integration">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Slack className="w-5 h-5" />
                  Slack Workspace Integration
                </div>
                {getStatusBadge(orgIntegrations?.slackConnectionStatus || "not_configured", orgIntegrations?.enableSlackIntegration)}
              </CardTitle>
              <CardDescription>
                Connect your organization's Slack workspace for team notifications and check-in reminders.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current Configuration */}
              {orgIntegrations?.enableSlackIntegration && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium">Slack Workspace Connected</span>
                  </div>
                  <p className="text-sm text-green-600 dark:text-green-300 mt-1">
                    Workspace ID: {orgIntegrations?.slackWorkspaceId}
                  </p>
                  {orgIntegrations?.slackChannelId && (
                    <p className="text-sm text-green-600 dark:text-green-300">
                      Default Channel: {orgIntegrations.slackChannelId}
                    </p>
                  )}
                </div>
              )}

              {/* Setup Instructions */}
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-slack-setup-instructions">
                    <HelpCircle className="w-4 h-4 mr-2" />
                    Setup Instructions
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Slack Workspace Setup Instructions</DialogTitle>
                    <DialogDescription>
                      Follow these steps to create and configure a Slack app for your organization.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6">
                    {/* Step 1: Create Slack App */}
                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center gap-2">
                        <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">1</span>
                        Create Slack App
                      </h4>
                      <div className="ml-8 space-y-2">
                        <p className="text-sm text-muted-foreground">Go to the Slack API and create a new app for your workspace.</p>
                        <Button variant="outline" size="sm" asChild>
                          <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Open Slack API Dashboard
                          </a>
                        </Button>
                        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                          <li>Click "Create New App" → "From scratch"</li>
                          <li>App Name: "Whirkplace for [Your Company]"</li>
                          <li>Workspace: Select your company workspace</li>
                        </ul>
                      </div>
                    </div>

                    {/* Step 2: OAuth & Permissions */}
                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center gap-2">
                        <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">2</span>
                        Configure OAuth & Permissions
                      </h4>
                      <div className="ml-8 space-y-3">
                        <div>
                          <Label className="text-sm font-medium">Redirect URLs (copy these exactly):</Label>
                          <div className="space-y-2 mt-1">
                            {redirectUris.map((uri, index) => (
                              <div key={index} className="flex items-center gap-2">
                                <Input value={uri} readOnly className="text-xs" />
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => copyToClipboard(uri, "Redirect URI")}
                                >
                                  <Copy className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Bot Token Scopes (add these):</Label>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            {slackBotScopes.map((scope) => (
                              <div key={scope} className="flex items-center gap-2">
                                <code className="bg-muted px-2 py-1 rounded text-xs">{scope}</code>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => copyToClipboard(scope, "Scope")}
                                >
                                  <Copy className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Step 3: Install App */}
                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center gap-2">
                        <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">3</span>
                        Install to Workspace
                      </h4>
                      <div className="ml-8 space-y-2">
                        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                          <li>Click "Install to Workspace"</li>
                          <li>Review permissions and click "Allow"</li>
                          <li>Copy the "Bot User OAuth Token" (starts with xoxb-)</li>
                          <li>Paste the token in the configuration below</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* OAuth-based Configuration */}
              <div className="space-y-4">
                {!orgIntegrations?.hasSlackBotToken ? (
                  // Show "Add to Slack" button if not connected
                  <div className="text-center py-8 space-y-4">
                    <div className="space-y-2">
                      <h4 className="font-medium">Connect Your Slack Workspace</h4>
                      <p className="text-sm text-muted-foreground">
                        Click the button below to securely connect your Slack workspace with OAuth 2.0.
                      </p>
                    </div>
                    <Button
                      onClick={() => getSlackInstallUrl.mutate()}
                      disabled={getSlackInstallUrl.isPending}
                      className="bg-[#4A154B] hover:bg-[#4A154B]/90 text-white"
                      data-testid="button-add-to-slack"
                    >
                      <Slack className="w-4 h-4 mr-2" />
                      {getSlackInstallUrl.isPending ? "Generating Install URL..." : "Add to Slack"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      You'll be redirected to Slack to authorize the integration.
                    </p>
                  </div>
                ) : (
                  // Show channel configuration if already connected
                  <div className="space-y-4">
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                        <CheckCircle className="h-4 w-4" />
                        <span className="font-medium">Slack Workspace Connected</span>
                      </div>
                      {orgIntegrations?.slackWorkspaceId && (
                        <p className="text-sm text-green-600 dark:text-green-300 mt-1">
                          Workspace ID: {orgIntegrations.slackWorkspaceId}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="slack-channel-id">Default Channel ID (optional)</Label>
                      <Input
                        id="slack-channel-id"
                        placeholder="#whirkplace-pulse or C1234567890"
                        value={slackChannelId}
                        onChange={(e) => setSlackChannelId(e.target.value)}
                        data-testid="input-slack-channel-id"
                      />
                      <p className="text-xs text-muted-foreground">
                        Leave empty to use the app's default channel. Channel ID can be found in Slack channel settings.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        onClick={() => saveSlackIntegration.mutate({ 
                          channelId: slackChannelId, 
                          enable: true 
                        })}
                        disabled={saveSlackIntegration.isPending}
                        data-testid="button-save-slack-channel"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        {saveSlackIntegration.isPending ? "Saving..." : "Update Channel Settings"}
                      </Button>
                      <Button
                        onClick={() => getSlackInstallUrl.mutate()}
                        disabled={getSlackInstallUrl.isPending}
                        variant="outline"
                        data-testid="button-reconnect-slack"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Reconnect Workspace
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Microsoft Integration Tab */}
        <TabsContent value="microsoft" className="space-y-6">
          <Card data-testid="card-microsoft-integration">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building className="w-5 h-5" />
                  Microsoft 365 Integration
                </div>
                {getStatusBadge(orgIntegrations?.microsoftConnectionStatus || "not_configured", orgIntegrations?.enableMicrosoftAuth)}
              </CardTitle>
              <CardDescription>
                Connect your organization's Microsoft 365 tenant for SSO authentication and calendar integration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current Configuration */}
              {orgIntegrations?.enableMicrosoftAuth && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium">Microsoft 365 Connected</span>
                  </div>
                  {orgIntegrations?.microsoftTenantId && (
                    <p className="text-sm text-blue-600 dark:text-blue-300 mt-1">
                      Tenant ID: {orgIntegrations.microsoftTenantId}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <Badge variant="outline" className="text-xs">
                      SSO: {orgIntegrations?.enableMicrosoftAuth ? "Enabled" : "Disabled"}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Teams: {orgIntegrations?.enableTeamsIntegration ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                </div>
              )}

              {/* Setup Instructions */}
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-microsoft-setup-instructions">
                    <HelpCircle className="w-4 h-4 mr-2" />
                    Setup Instructions
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Microsoft 365 Setup Instructions</DialogTitle>
                    <DialogDescription>
                      Follow these steps to register an Azure AD application for your organization.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6">
                    {/* Step 1: Azure AD App Registration */}
                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center gap-2">
                        <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">1</span>
                        Create Azure AD App Registration
                      </h4>
                      <div className="ml-8 space-y-2">
                        <p className="text-sm text-muted-foreground">Register a new application in your Azure portal.</p>
                        <Button variant="outline" size="sm" asChild>
                          <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Open Azure Portal
                          </a>
                        </Button>
                        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                          <li>Go to Azure Active Directory → App registrations</li>
                          <li>Click "New registration"</li>
                          <li>Name: "Whirkplace SSO"</li>
                          <li>Supported account types: "Accounts in this organizational directory only"</li>
                        </ul>
                      </div>
                    </div>

                    {/* Step 2: Configure Redirect URIs */}
                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center gap-2">
                        <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">2</span>
                        Configure Redirect URIs
                      </h4>
                      <div className="ml-8 space-y-3">
                        <div>
                          <Label className="text-sm font-medium">Redirect URIs (copy these exactly):</Label>
                          <div className="space-y-2 mt-1">
                            {microsoftRedirectUris.map((uri, index) => (
                              <div key={index} className="flex items-center gap-2">
                                <Input value={uri} readOnly className="text-xs" />
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => copyToClipboard(uri, "Redirect URI")}
                                >
                                  <Copy className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Step 3: API Permissions */}
                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center gap-2">
                        <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">3</span>
                        Add API Permissions
                      </h4>
                      <div className="ml-8 space-y-3">
                        <div>
                          <Label className="text-sm font-medium">Microsoft Graph Permissions:</Label>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            {microsoftPermissions.map((permission) => (
                              <div key={permission} className="flex items-center gap-2">
                                <code className="bg-muted px-2 py-1 rounded text-xs">{permission}</code>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => copyToClipboard(permission, "Permission")}
                                >
                                  <Copy className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            Don't forget to grant admin consent for your organization after adding permissions.
                          </AlertDescription>
                        </Alert>
                      </div>
                    </div>

                    {/* Step 4: Client Secret */}
                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center gap-2">
                        <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">4</span>
                        Create Client Secret
                      </h4>
                      <div className="ml-8 space-y-2">
                        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                          <li>Go to "Certificates & secrets"</li>
                          <li>Click "New client secret"</li>
                          <li>Description: "Whirkplace Integration"</li>
                          <li>Expires: 24 months (recommended)</li>
                          <li>Copy the secret value immediately (it won't be shown again)</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Configuration Form */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="microsoft-tenant-id">Tenant ID</Label>
                  <Input
                    id="microsoft-tenant-id"
                    placeholder="12345678-1234-1234-1234-123456789012"
                    value={microsoftTenantId}
                    onChange={(e) => setMicrosoftTenantId(e.target.value)}
                    data-testid="input-microsoft-tenant-id"
                  />
                  <p className="text-xs text-muted-foreground">
                    Found in Azure Portal → Azure Active Directory → Overview
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="microsoft-client-id">Application (Client) ID</Label>
                  <Input
                    id="microsoft-client-id"
                    placeholder="12345678-1234-1234-1234-123456789012"
                    value={microsoftClientId}
                    onChange={(e) => setMicrosoftClientId(e.target.value)}
                    data-testid="input-microsoft-client-id"
                  />
                  <p className="text-xs text-muted-foreground">
                    Found in your app registration overview page
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="microsoft-client-secret">Client Secret</Label>
                  <div className="relative">
                    <Input
                      id="microsoft-client-secret"
                      type={showMicrosoftSecret ? "text" : "password"}
                      placeholder="Client secret value"
                      value={microsoftClientSecret}
                      onChange={(e) => setMicrosoftClientSecret(e.target.value)}
                      data-testid="input-microsoft-client-secret"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowMicrosoftSecret(!showMicrosoftSecret)}
                    >
                      {showMicrosoftSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => testMicrosoftConnection.mutate({ 
                      tenantId: microsoftTenantId, 
                      clientId: microsoftClientId, 
                      clientSecret: microsoftClientSecret 
                    })}
                    disabled={!microsoftTenantId || !microsoftClientId || !microsoftClientSecret || testMicrosoftConnection.isPending}
                    variant="outline"
                    data-testid="button-test-microsoft"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${testMicrosoftConnection.isPending ? 'animate-spin' : ''}`} />
                    Test Connection
                  </Button>
                  <Button
                    onClick={() => saveMicrosoftIntegration.mutate({ 
                      tenantId: microsoftTenantId,
                      clientId: microsoftClientId,
                      clientSecret: microsoftClientSecret,
                      enableAuth: true,
                      enableTeams: true
                    })}
                    disabled={!microsoftTenantId || !microsoftClientId || !microsoftClientSecret || saveMicrosoftIntegration.isPending}
                    data-testid="button-save-microsoft"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    {saveMicrosoftIntegration.isPending ? "Saving..." : "Save Configuration"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Calendar Integration Tab */}
        <TabsContent value="calendar" className="space-y-6">
          <Card data-testid="card-calendar-integration">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Calendar Integration
              </CardTitle>
              <CardDescription>
                Manage calendar permissions and sync settings for One-on-One meetings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert>
                  <Calendar className="h-4 w-4" />
                  <AlertDescription>
                    Calendar integration requires Microsoft 365 configuration to be completed first. Once configured, users can connect their individual calendars for meeting scheduling.
                  </AlertDescription>
                </Alert>
                
                {orgIntegrations?.enableMicrosoftAuth ? (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                      <CheckCircle className="h-4 w-4" />
                      <span className="font-medium">Ready for Calendar Integration</span>
                    </div>
                    <p className="text-sm text-green-600 dark:text-green-300 mt-1">
                      Microsoft 365 is configured. Users can now connect their calendars in their individual settings.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                    <div className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
                      <AlertCircle className="h-4 w-4" />
                      <span className="font-medium">Microsoft 365 Required</span>
                    </div>
                    <p className="text-sm text-orange-600 dark:text-orange-300 mt-1">
                      Configure Microsoft 365 integration first to enable calendar features.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}