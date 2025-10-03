import { useState, useEffect } from "react";
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
  Building,
  Key,
  Link,
  Unlink,
  Plus
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

// Component for managing authentication providers
function AuthProviderManagement({ organizationSlug }: { organizationSlug: string }) {
  const { toast } = useToast();
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  
  // Fetch available auth providers
  const { data: authProviders = [], isLoading, refetch } = useQuery({
    queryKey: ["/api/auth/providers"],
  });
  
  // Fetch user's linked identities 
  const { data: userIdentities = [] } = useQuery({
    queryKey: ["/api/auth/identities"],
  });
  
  // Connect a new auth provider
  const connectProviderMutation = useMutation({
    mutationFn: async (data: { provider: string; clientId?: string; clientSecret?: string; config?: any }) => {
      return apiRequest("POST", "/api/auth/providers/connect", data);
    },
    onSuccess: () => {
      toast({
        title: "Provider connected",
        description: "Authentication provider has been connected successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/providers"] });
      setIsAddingProvider(false);
      setSelectedProvider("");
      setClientId("");
      setClientSecret("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to connect provider",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Toggle provider enabled status
  const toggleProviderMutation = useMutation({
    mutationFn: async ({ providerId, enabled }: { providerId: string; enabled: boolean }) => {
      return apiRequest("PATCH", `/api/auth/providers/${providerId}`, { enabled });
    },
    onSuccess: () => {
      toast({
        title: "Provider updated",
        description: "Authentication provider status has been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/providers"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update provider",
        description: error.message || "Cannot disable the last authentication provider.",
        variant: "destructive",
      });
    },
  });
  
  // Disconnect an auth provider
  const disconnectProviderMutation = useMutation({
    mutationFn: async (providerId: string) => {
      return apiRequest("DELETE", `/api/auth/providers/${providerId}`);
    },
    onSuccess: () => {
      toast({
        title: "Provider disconnected",
        description: "Authentication provider has been disconnected.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/providers"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to disconnect provider",
        description: error.message || "Cannot disconnect the last enabled authentication provider.",
        variant: "destructive",
      });
    },
  });
  
  const handleConnectProvider = () => {
    if (!selectedProvider) return;
    
    const data: any = { provider: selectedProvider };
    
    // Only send OAuth credentials for OAuth providers
    if (selectedProvider !== 'local') {
      if (clientId) data.clientId = clientId;
      if (clientSecret) data.clientSecret = clientSecret;
    }
    
    connectProviderMutation.mutate(data);
  };
  
  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'slack':
        return <Slack className="w-4 h-4" />;
      case 'microsoft':
        return <Building className="w-4 h-4" />;
      case 'google':
        return <Globe className="w-4 h-4" />;
      case 'local':
        return <Key className="w-4 h-4" />;
      default:
        return <Shield className="w-4 h-4" />;
    }
  };
  
  const getProviderName = (provider: string) => {
    switch (provider) {
      case 'slack': return 'Slack';
      case 'microsoft': return 'Microsoft 365';
      case 'google': return 'Google Workspace';
      case 'local': return 'Email/Password';
      default: return provider;
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Available Providers */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Available Authentication Methods</h4>
          {authProviders.length < 4 && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setIsAddingProvider(true)}
              data-testid="button-add-provider"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Provider
            </Button>
          )}
        </div>
        
        <div className="grid gap-4">
          {authProviders.map((provider: any) => (
            <Card key={provider.provider} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getProviderIcon(provider.provider)}
                  <div>
                    <p className="font-medium">{getProviderName(provider.provider)}</p>
                    <p className="text-sm text-muted-foreground">
                      {provider.hasCredentials ? 'Configured' : 'Not Configured'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Enable/Disable toggle */}
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={provider.enabled}
                      onCheckedChange={(checked) => {
                        // Don't allow disabling last enabled provider
                        const enabledCount = authProviders.filter((p: any) => p.enabled).length;
                        if (!checked && enabledCount <= 1) {
                          toast({
                            title: "Cannot disable",
                            description: "At least one authentication method must remain enabled.",
                            variant: "destructive",
                          });
                          return;
                        }
                        toggleProviderMutation.mutate({ providerId: provider.id, enabled: checked });
                      }}
                      data-testid={`switch-enable-${provider.provider}`}
                      aria-label={`Enable/disable ${provider.provider} authentication`}
                    />
                    <Label className="text-xs" data-testid={`label-enabled-${provider.provider}`}>Enabled</Label>
                  </div>
                  
                  {/* Disconnect button - only show for configured providers */}
                  {provider.id && provider.hasCredentials && authProviders.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const enabledCount = authProviders.filter((p: any) => p.enabled).length;
                        if (provider.enabled && enabledCount <= 1) {
                          toast({
                            title: "Cannot disconnect",
                            description: "Please enable another provider before disconnecting the last enabled one.",
                            variant: "destructive",
                          });
                          return;
                        }
                        disconnectProviderMutation.mutate(provider.id);
                      }}
                      data-testid={`button-disconnect-${provider.provider}`}
                    >
                      <Unlink className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
      
      {/* User's Linked Accounts */}
      {userIdentities.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Your Linked Accounts</h4>
          <div className="grid gap-3">
            {userIdentities.map((identity: any) => (
              <div key={identity.provider} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {getProviderIcon(identity.provider)}
                  <div>
                    <p className="text-sm font-medium">{getProviderName(identity.provider)}</p>
                    <p className="text-xs text-muted-foreground">{identity.providerEmail || identity.providerDisplayName}</p>
                  </div>
                </div>
                <Badge variant="outline">
                  <Link className="w-3 h-3 mr-1" />
                  Linked
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Add Provider Dialog */}
      <Dialog open={isAddingProvider} onOpenChange={setIsAddingProvider}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Authentication Provider</DialogTitle>
            <DialogDescription>
              Choose an authentication method to enable for your organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Provider Type</Label>
              <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                <SelectTrigger data-testid="select-provider">
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  {!authProviders.find((p: any) => p.provider === 'slack') && (
                    <SelectItem value="slack">Slack</SelectItem>
                  )}
                  {!authProviders.find((p: any) => p.provider === 'microsoft') && (
                    <SelectItem value="microsoft">Microsoft 365</SelectItem>
                  )}
                  {!authProviders.find((p: any) => p.provider === 'google') && (
                    <SelectItem value="google">Google Workspace</SelectItem>
                  )}
                  {!authProviders.find((p: any) => p.provider === 'local') && (
                    <SelectItem value="local">Email/Password</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            
            {selectedProvider && selectedProvider !== 'local' && (
              <>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    You'll need to register an OAuth application with {getProviderName(selectedProvider)} and provide the client credentials.
                  </AlertDescription>
                </Alert>
                
                <div className="space-y-2">
                  <Label>Client ID</Label>
                  <Input 
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="Enter OAuth client ID"
                    data-testid="input-client-id"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Client Secret</Label>
                  <div className="flex gap-2">
                    <Input 
                      type={showSecret ? "text" : "password"}
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder="Enter OAuth client secret"
                      data-testid="input-client-secret"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowSecret(!showSecret)}
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </>
            )}
            
            {selectedProvider === 'local' && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Email/password authentication will be enabled immediately. Users can sign up and log in with their email addresses.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => setIsAddingProvider(false)}
                data-testid="button-cancel-provider"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleConnectProvider}
                disabled={!selectedProvider || (selectedProvider !== 'local' && (!clientId || !clientSecret))}
                data-testid="button-connect-provider"
                aria-label="Connect authentication provider"
              >
                Connect Provider
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function IntegrationsDashboard() {
  const { toast } = useToast();
  const { data: userData } = useCurrentUser();
  
  // userData IS the user object directly from the API
  const currentUser = userData;
  const organizationId = userData?.organizationId;
  
  const [activeTab, setActiveTab] = useState("authentication");
  const [showSlackToken, setShowSlackToken] = useState(false);
  const [showMicrosoftSecret, setShowMicrosoftSecret] = useState(false);
  const [slackSetupStep, setSlackSetupStep] = useState(1);
  const [microsoftSetupStep, setMicrosoftSetupStep] = useState(1);
  const [showSlackSetup, setShowSlackSetup] = useState(false);

  // Form state for integrations
  const [slackBotToken, setSlackBotToken] = useState("");
  const [slackChannelId, setSlackChannelId] = useState("");
  const [microsoftTenantId, setMicrosoftTenantId] = useState("");
  const [microsoftClientId, setMicrosoftClientId] = useState("");
  const [microsoftClientSecret, setMicrosoftClientSecret] = useState("");

  // Fetch organization integration data
  const { data: orgIntegrations, isLoading: integrationsLoading } = useQuery<OrganizationIntegrations>({
    queryKey: ["/api/organizations", organizationId, "integrations"],
    queryFn: async () => {
      if (!organizationId) throw new Error("No organization ID");
      const response = await fetch(`/api/organizations/${organizationId}/integrations`);
      if (!response.ok) throw new Error('Failed to fetch organization integrations');
      return response.json();
    },
    enabled: !!organizationId && currentUser?.role === "admin",
  });

  // Slack OAuth installation flow
  const getSlackInstallUrl = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("No organization found");
      const response = await apiRequest("GET", `/api/organizations/${organizationId}/integrations/slack/install`);
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
          queryKey: ["/api/organizations", organizationId, "integrations"] 
        });
        // Refresh current user to update Slack workspace ID in settings
        queryClient.invalidateQueries({ 
          queryKey: ["/api/users/current"] 
        });
      } else if (event.data.type === 'SLACK_OAUTH_ERROR') {
        toast({
          title: "Slack Integration Failed",
          description: event.data.message || "Failed to connect Slack workspace",
          variant: "destructive",
        });
      } else if (event.data.type === 'MICROSOFT_OAUTH_SUCCESS') {
        toast({
          title: "Microsoft Integration Complete!",
          description: `Successfully connected Microsoft 365 tenant: ${event.data.tenantId}`,
        });
        // Refresh integration data
        queryClient.invalidateQueries({ 
          queryKey: ["/api/organizations", organizationId, "integrations"] 
        });
      } else if (event.data.type === 'MICROSOFT_OAUTH_ERROR') {
        toast({
          title: "Microsoft Integration Failed",
          description: event.data.message || "Failed to connect Microsoft 365 tenant",
          variant: "destructive",
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [organizationId, queryClient, toast]);

  // Get Microsoft OAuth install URL
  const getMicrosoftInstallUrl = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", `/api/organizations/${organizationId}/integrations/microsoft/install`);
      return await response.json() as { installUrl: string; scopes: string[]; redirectUri: string; state: string };
    },
    onSuccess: (data) => {
      // Open OAuth popup window
      const popup = window.open(
        data.installUrl,
        'microsoft-oauth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );
      
      // Focus the popup window
      if (popup) {
        popup.focus();
      }
    },
    onError: (error: any) => {
      toast({
        title: "Installation Error", 
        description: error.message || "Failed to generate Microsoft install URL",
        variant: "destructive",
      });
    },
  });

  // Save Slack integration (channel settings only - token saved via OAuth)
  const saveSlackIntegration = useMutation({
    mutationFn: async (data: { channelId: string; enable: boolean }) => {
      const response = await apiRequest("PUT", `/api/organizations/${organizationId}/integrations/slack`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", organizationId, "integrations"] });
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

  // Save Slack settings including bot token
  const updateSlackSettings = useMutation({
    mutationFn: async (data: { botToken: string; channelId?: string }) => {
      const response = await apiRequest("PUT", `/api/organizations/${organizationId}/integrations/slack/configure`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", organizationId, "integrations"] });
      toast({
        title: "Slack configuration saved",
        description: "Your Slack workspace has been configured successfully.",
      });
      // Close the modal after successful save
      setShowSlackSetup(false);
      // Clear the form
      setSlackBotToken("");
      setSlackChannelId("");
    },
    onError: (error: any) => {
      toast({
        title: "Configuration failed",
        description: error.message || "Failed to save Slack configuration. Please check your bot token and try again.",
        variant: "destructive",
      });
    },
  });

  // Save Microsoft integration (settings only - tokens saved via OAuth)
  const saveMicrosoftIntegration = useMutation({
    mutationFn: async (data: { enableAuth: boolean; enableTeams: boolean }) => {
      const response = await apiRequest("PUT", `/api/organizations/${organizationId}/integrations/microsoft`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", organizationId, "integrations"] });
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
    "https://app.whirkplace.com/api/auth/microsoft/tenant/callback", 
    "https://whirkplace.com/api/auth/microsoft/tenant/callback"
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="authentication" data-testid="tab-authentication">
            <Key className="w-4 h-4 mr-2" />
            Authentication
          </TabsTrigger>
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

        {/* Authentication Providers Tab */}
        <TabsContent value="authentication" className="space-y-6">
          <Card data-testid="card-auth-providers">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                Authentication Providers
              </CardTitle>
              <CardDescription>
                Manage how users can log in to your organization. Enable or disable different authentication methods.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <AuthProviderManagement organizationSlug={orgIntegrations?.name?.toLowerCase().replace(/\s+/g, '-') || "whirkplace"} />
            </CardContent>
          </Card>
        </TabsContent>

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
              {orgIntegrations?.enableSlackIntegration && orgIntegrations?.slackConnectionStatus === "connected" && (
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
              <Button 
                variant="outline" 
                data-testid="button-slack-setup-instructions"
                onClick={() => setShowSlackSetup(true)}
              >
                <HelpCircle className="w-4 h-4 mr-2" />
                Setup Instructions
              </Button>
              
              <Dialog open={showSlackSetup} onOpenChange={setShowSlackSetup}>
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

                    {/* Configuration Section */}
                    <div className="border-t pt-6 space-y-4">
                      <h4 className="font-medium">Configure Your Slack Integration</h4>
                      
                      {/* Bot Token Input */}
                      <div className="space-y-2">
                        <Label htmlFor="slack-bot-token">Bot User OAuth Token *</Label>
                        <div className="flex gap-2">
                          <Input
                            id="slack-bot-token"
                            type={showSlackToken ? "text" : "password"}
                            placeholder="xoxb-..."
                            value={slackBotToken}
                            onChange={(e) => setSlackBotToken(e.target.value)}
                            data-testid="input-slack-bot-token"
                            className="font-mono"
                            required
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowSlackToken(!showSlackToken)}
                            data-testid="button-toggle-slack-token"
                          >
                            {showSlackToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          The bot token from your Slack app's OAuth & Permissions page
                        </p>
                      </div>

                      {/* Channel ID Input */}
                      <div className="space-y-2">
                        <Label htmlFor="slack-channel-id-modal">Default Channel ID (optional)</Label>
                        <Input
                          id="slack-channel-id-modal"
                          type="text"
                          placeholder="C1234567890"
                          value={slackChannelId}
                          onChange={(e) => setSlackChannelId(e.target.value)}
                          data-testid="input-slack-channel-id-modal"
                        />
                        <p className="text-xs text-muted-foreground">
                          The channel ID where notifications will be posted. You can find this in Slack channel settings.
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex justify-end gap-3 pt-4">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowSlackSetup(false);
                            setSlackBotToken("");
                            setSlackChannelId("");
                          }}
                          data-testid="button-cancel-slack-config"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => {
                            updateSlackSettings.mutate({
                              botToken: slackBotToken,
                              channelId: slackChannelId || undefined,
                            });
                          }}
                          disabled={!slackBotToken || updateSlackSettings.isPending}
                          data-testid="button-save-slack-config"
                        >
                          {updateSlackSettings.isPending ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Save Configuration
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* OAuth-based Configuration */}
              <div className="space-y-4">
                {orgIntegrations?.slackConnectionStatus === "connected" ? (
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
                ) : (
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

              {/* Microsoft OAuth Integration */}
              {!orgIntegrations?.enableMicrosoftAuth ? (
                <div className="text-center py-8">
                  <Building className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Connect Microsoft 365</h3>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    Connect your organization's Microsoft 365 tenant to enable SSO authentication and calendar integration for your team.
                  </p>
                  <Button 
                    onClick={() => getMicrosoftInstallUrl.mutate()}
                    disabled={getMicrosoftInstallUrl.isPending}
                    className="bg-[#0078d4] hover:bg-[#106ebe] text-white"
                    data-testid="button-add-microsoft"
                  >
                    {getMicrosoftInstallUrl.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Building className="w-4 h-4 mr-2" />
                        Add to Microsoft
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-4">
                    Secure OAuth 2.0 connection • No credentials to manage
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Integration Settings */}
                  <div className="space-y-4">
                    <h4 className="font-medium">Integration Settings</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-base">SSO Authentication</Label>
                          <p className="text-sm text-muted-foreground">Allow users to sign in with Microsoft 365</p>
                        </div>
                        <Switch 
                          checked={orgIntegrations?.enableMicrosoftAuth || false}
                          onCheckedChange={(checked) => saveMicrosoftIntegration.mutate({ 
                            enableAuth: checked, 
                            enableTeams: orgIntegrations?.enableTeamsIntegration || false 
                          })}
                          data-testid="switch-microsoft-auth"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-base">Teams Integration</Label>
                          <p className="text-sm text-muted-foreground">Enable Microsoft Teams notifications and workflows</p>
                        </div>
                        <Switch 
                          checked={orgIntegrations?.enableTeamsIntegration || false}
                          onCheckedChange={(checked) => saveMicrosoftIntegration.mutate({ 
                            enableAuth: orgIntegrations?.enableMicrosoftAuth || false, 
                            enableTeams: checked 
                          })}
                          data-testid="switch-microsoft-teams"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Management Actions */}
                  <div className="flex gap-3 pt-4 border-t">
                    <Button
                      onClick={() => getMicrosoftInstallUrl.mutate()}
                      disabled={getMicrosoftInstallUrl.isPending}
                      variant="outline"
                      data-testid="button-reconnect-microsoft"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Reconnect Tenant
                    </Button>
                  </div>
                </div>
              )}
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