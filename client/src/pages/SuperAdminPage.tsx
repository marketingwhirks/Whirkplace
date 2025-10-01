import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import RoleSwitcher from "@/components/admin/role-switcher";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { format, formatDistanceToNow } from "date-fns";
import type { User as CurrentUser } from "@shared/schema";
import { 
  Building2, 
  Users, 
  Crown, 
  Activity, 
  Search, 
  Edit,
  UserX,
  Building,
  ShieldAlert,
  TrendingUp,
  Database,
  Trash2,
  Clock,
  RefreshCw,
  Lock,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Key,
  Info,
  LogOut
} from "lucide-react";

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isActive: boolean;
  userCount: number;
  teamCount: number;
  activeUsers: number;
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
  isActive: boolean;
  organizationId: string;
  organizationName: string;
  authProvider: string;
  lastLoginAt?: string;
  createdAt: string;
}

interface SystemStats {
  totalOrganizations: number;
  activeOrganizations: number;
  totalUsers: number;
  activeUsers: number;
}

interface SessionData {
  sessionId: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  organizationId: string | null;
  organizationName: string | null;
  loginTime: string;
  expiryTime: string;
  timeRemaining: string;
}

export default function SuperAdminPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [backdoorKey, setBackdoorKey] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Get current user to check super admin status
  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = (currentUser as CurrentUser)?.isSuperAdmin || false;
  
  // Fetch session debug info
  const { data: sessionDebug, refetch: refetchDebug } = useQuery({
    queryKey: ['/api/auth/session-debug'],
    queryFn: async () => {
      const response = await fetch('/api/auth/session-debug', {
        credentials: 'include'
      });
      return response.json();
    },
    enabled: debugOpen, // Only fetch when debug section is open
  });
  
  // Handle super admin authentication
  const handleSuperAdminLogin = async () => {
    if (!backdoorKey) {
      toast({
        title: "Error",
        description: "Please enter the backdoor key",
        variant: "destructive",
      });
      return;
    }
    
    setIsAuthenticating(true);
    try {
      // First logout current session
      const logoutResponse = await fetch('/api/auth/logout', { 
        method: 'POST', 
        credentials: 'include' 
      });
      
      if (!logoutResponse.ok) {
        throw new Error('Failed to logout current session');
      }
      
      // Then login as super admin
      const response = await fetch('/api/auth/super-admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: 'mpatrick@whirks.com',
          key: backdoorKey
        })
      });
      
      if (response.ok) {
        toast({
          title: "Success",
          description: "Authenticated as super admin! Reloading...",
        });
        // Reload page to get new session
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Authentication failed');
      }
    } catch (error: any) {
      toast({
        title: "Authentication Failed",
        description: error.message || "Failed to authenticate as super admin",
        variant: "destructive",
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Fetch system statistics
  const { data: systemStats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/super-admin/stats'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/super-admin/stats');
      return response.json() as Promise<SystemStats>;
    },
  });

  // Fetch all organizations
  const { data: organizations, isLoading: orgsLoading } = useQuery({
    queryKey: ['/api/super-admin/organizations'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/super-admin/organizations');
      return response.json() as Promise<Organization[]>;
    },
  });

  // Fetch all users
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['/api/super-admin/users', includeInactive],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/super-admin/users?includeInactive=${includeInactive}`);
      return response.json() as Promise<User[]>;
    },
  });

  // Fetch all active sessions
  const { data: sessions, isLoading: sessionsLoading, refetch: refetchSessions } = useQuery({
    queryKey: ['/api/super-admin/sessions'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/super-admin/sessions');
      return response.json() as Promise<SessionData[]>;
    },
  });

  // Deactivate organization mutation
  const deactivateOrgMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const response = await apiRequest('PUT', `/api/super-admin/organizations/${orgId}/deactivate`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/stats'] });
      toast({
        title: "Organization Deactivated",
        description: "The organization has been successfully deactivated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Deactivation Failed",
        description: error.message || "Failed to deactivate organization.",
        variant: "destructive",
      });
    },
  });

  // Delete organization mutation
  const deleteOrgMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const response = await apiRequest('DELETE', `/api/super-admin/organizations/${orgId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete organization');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/stats'] });
      toast({
        title: "Organization Deleted",
        description: "The organization and all its data have been permanently deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete organization.",
        variant: "destructive",
      });
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: any }) => {
      const response = await apiRequest('PATCH', `/api/super-admin/users/${userId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/organizations'] });
      setEditUserDialogOpen(false);
      setSelectedUser(null);
      toast({
        title: "User Updated",
        description: "The user has been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update user.",
        variant: "destructive",
      });
    },
  });

  const filteredOrganizations = organizations?.filter(org =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    org.slug.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredUsers = users?.filter(user =>
    user.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    user.organizationName.toLowerCase().includes(userSearchTerm.toLowerCase())
  ) || [];

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'standard':
        return <Badge variant="outline">Standard</Badge>;
      case 'professional':
        return <Badge variant="default">Professional</Badge>;
      case 'enterprise':
        return <Badge variant="destructive">Enterprise</Badge>;
      default:
        return <Badge variant="secondary">{plan}</Badge>;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge variant="destructive" className="flex items-center gap-1"><Crown className="w-3 h-3" />Admin</Badge>;
      case 'manager':
        return <Badge variant="default">Manager</Badge>;
      default:
        return <Badge variant="outline">Member</Badge>;
    }
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setEditUserDialogOpen(true);
  };

  const handleUpdateUser = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedUser) return;

    const formData = new FormData(e.currentTarget);
    const updates = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      role: formData.get('role') as string,
      isActive: formData.get('isActive') === 'on',
    };

    updateUserMutation.mutate({ userId: selectedUser.id, updates });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-background border-b px-6 py-4">
        <h1 className="text-2xl font-semibold text-foreground">Super Admin</h1>
      </div>
      
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Role Switcher for testing */}
        <RoleSwitcher />
        
        {/* Super Admin Authentication Section */}
        {!isSuperAdmin && currentUser?.email === 'mpatrick@whirks.com' && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Super Admin Authentication Required</AlertTitle>
            <AlertDescription>
              You are not authenticated as super admin. Please authenticate below to access super admin features.
            </AlertDescription>
          </Alert>
        )}
        
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Super Admin Status
            </CardTitle>
            <CardDescription>
              Current authentication status and super admin controls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Current User</Label>
                <div className="flex items-center gap-2">
                  <span className="font-medium" data-testid="text-current-email">
                    {currentUser?.email || 'Not logged in'}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Super Admin Status</Label>
                <div className="flex items-center gap-2">
                  {isSuperAdmin ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <span className="font-medium text-green-600" data-testid="text-super-admin-status">
                        ✓ Authenticated as Super Admin
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                      <span className="font-medium text-amber-600" data-testid="text-super-admin-status">
                        ⚠️ Not authenticated as Super Admin
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            {/* Authentication Form */}
            {(!isSuperAdmin && currentUser?.email === 'mpatrick@whirks.com') && (
              <div className="border-t pt-4">
                <Label className="text-base font-semibold mb-3 block">
                  Authenticate as Super Admin
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="super-admin-email">Email</Label>
                    <Input
                      id="super-admin-email"
                      type="email"
                      value="mpatrick@whirks.com"
                      disabled
                      data-testid="input-super-admin-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="backdoor-key">Backdoor Key</Label>
                    <Input
                      id="backdoor-key"
                      type="password"
                      placeholder="Enter backdoor key"
                      value={backdoorKey}
                      onChange={(e) => setBackdoorKey(e.target.value)}
                      disabled={isAuthenticating}
                      data-testid="input-backdoor-key"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleSuperAdminLogin}
                      disabled={isAuthenticating || !backdoorKey}
                      className="w-full"
                      data-testid="button-authenticate-super-admin"
                    >
                      {isAuthenticating ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Authenticating...
                        </>
                      ) : (
                        <>
                          <Key className="mr-2 h-4 w-4" />
                          Authenticate as Super Admin
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Session Debug Info */}
            <Collapsible open={debugOpen} onOpenChange={setDebugOpen} className="border-t pt-4">
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2" data-testid="button-toggle-debug">
                  <Info className="h-4 w-4" />
                  Debug Info
                  <ChevronDown className={`h-4 w-4 transition-transform ${debugOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <div className="rounded-lg bg-muted p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">Session Debug Information</Label>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => refetchDebug()}
                      data-testid="button-refresh-debug"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </div>
                  <pre className="text-xs overflow-auto max-h-64" data-testid="text-session-debug">
                    {sessionDebug ? JSON.stringify(sessionDebug, null, 2) : 'Click to load debug info...'}
                  </pre>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
        
        {/* System Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-total-organizations">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Organizations</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-organizations">
                {statsLoading ? "..." : systemStats?.totalOrganizations || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {statsLoading ? "..." : systemStats?.activeOrganizations || 0} active
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-total-users">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-users">
                {statsLoading ? "..." : systemStats?.totalUsers || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {statsLoading ? "..." : systemStats?.activeUsers || 0} active
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-activity-rate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Activity Rate</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-activity-rate">
                {statsLoading ? "..." : systemStats && systemStats.totalUsers > 0 
                  ? Math.round((systemStats.activeUsers / systemStats.totalUsers) * 100) 
                  : 0}%
              </div>
              <p className="text-xs text-muted-foreground">
                Active users ratio
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-system-health">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Health</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-system-health">
                Healthy
              </div>
              <p className="text-xs text-muted-foreground">
                All systems operational
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Management Tabs */}
        <Tabs defaultValue="organizations" className="space-y-4">
          <TabsList>
            <TabsTrigger value="organizations" data-testid="tab-organizations">Organizations</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
            <TabsTrigger value="sessions" data-testid="tab-sessions">
              Sessions
              {sessions && sessions.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {sessions.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Organizations Management */}
          <TabsContent value="organizations" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Building className="h-5 w-5" />
                    Customer Organizations
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search organizations..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 w-64"
                        data-testid="input-search-organizations"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organization</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Users</TableHead>
                      <TableHead>Teams</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orgsLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center">Loading organizations...</TableCell>
                      </TableRow>
                    ) : filteredOrganizations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center">No organizations found</TableCell>
                      </TableRow>
                    ) : (
                      filteredOrganizations.map((org) => (
                        <TableRow key={org.id} data-testid={`row-organization-${org.id}`}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{org.name}</div>
                              <div className="text-sm text-muted-foreground">{org.slug}</div>
                            </div>
                          </TableCell>
                          <TableCell>{getPlanBadge(org.plan)}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{org.activeUsers}/{org.userCount}</div>
                              <div className="text-muted-foreground">active/total</div>
                            </div>
                          </TableCell>
                          <TableCell>{org.teamCount}</TableCell>
                          <TableCell>
                            {org.isActive ? (
                              <Badge variant="default">Active</Badge>
                            ) : (
                              <Badge variant="destructive">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(org.createdAt), { addSuffix: true })}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {org.isActive && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      data-testid={`button-deactivate-${org.id}`}
                                    >
                                      <UserX className="h-4 w-4 mr-1" />
                                      Deactivate
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Deactivate Organization</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to deactivate "{org.name}"? This will disable access for all users in this organization.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deactivateOrgMutation.mutate(org.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Deactivate
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                              {org.slug !== 'whirkplace' && org.slug !== 'fictitious-delicious' && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button 
                                              variant="destructive" 
                                              size="sm"
                                              disabled={!isSuperAdmin}
                                              data-testid={`button-delete-${org.id}`}
                                            >
                                              <Trash2 className="h-4 w-4 mr-1" />
                                              Delete
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Delete Organization</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                <div className="space-y-2">
                                                  <p className="font-semibold text-destructive">⚠️ This action cannot be undone!</p>
                                                  <p>You are about to permanently delete "{org.name}" and ALL of its data including:</p>
                                                  <ul className="list-disc list-inside ml-4">
                                                    <li>All users and their accounts</li>
                                                    <li>All teams and hierarchies</li>
                                                    <li>All check-ins and feedback</li>
                                                    <li>All wins and kudos</li>
                                                    <li>All notifications and settings</li>
                                                  </ul>
                                                  <p className="font-semibold mt-2">Are you absolutely sure?</p>
                                                </div>
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                                              <AlertDialogAction
                                                onClick={() => deleteOrgMutation.mutate(org.id)}
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                              >
                                                Delete Permanently
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </span>
                                    </TooltipTrigger>
                                    {!isSuperAdmin && (
                                      <TooltipContent>
                                        <p>Super admin authentication required</p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Management */}
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    All Users
                  </CardTitle>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="include-inactive"
                        checked={includeInactive}
                        onCheckedChange={setIncludeInactive}
                        data-testid="switch-include-inactive"
                      />
                      <Label htmlFor="include-inactive">Include inactive</Label>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search users..."
                        value={userSearchTerm}
                        onChange={(e) => setUserSearchTerm(e.target.value)}
                        className="pl-8 w-64"
                        data-testid="input-search-users"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Auth Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center">Loading users...</TableCell>
                      </TableRow>
                    ) : filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center">No users found</TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((user) => (
                        <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{user.name}</div>
                              <div className="text-sm text-muted-foreground">{user.email}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{user.organizationName}</TableCell>
                          <TableCell>{getRoleBadge(user.role)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{user.authProvider}</Badge>
                          </TableCell>
                          <TableCell>
                            {user.isActive ? (
                              <Badge variant="default">Active</Badge>
                            ) : (
                              <Badge variant="destructive">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {user.lastLoginAt ? formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true }) : "Never"}
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleEditUser(user)}
                              data-testid={`button-edit-user-${user.id}`}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sessions Management */}
          <TabsContent value="sessions" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Active Sessions
                    {sessions && sessions.length > 0 && (
                      <Badge variant="default" className="ml-2">
                        {sessions.length} active
                      </Badge>
                    )}
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => refetchSessions()}
                    data-testid="button-refresh-sessions"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Login Time</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Time Remaining</TableHead>
                      <TableHead>Session ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessionsLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center">Loading sessions...</TableCell>
                      </TableRow>
                    ) : !sessions || sessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center">No active sessions</TableCell>
                      </TableRow>
                    ) : (
                      sessions.map((session) => (
                        <TableRow key={session.sessionId} data-testid={`row-session-${session.sessionId}`}>
                          <TableCell>
                            <div className="font-medium">
                              {session.userName || 'Unknown User'}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {session.userEmail || 'No email'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {session.organizationName || 'No organization'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(session.loginTime), 'MMM d, yyyy HH:mm')}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(session.expiryTime), 'MMM d, yyyy HH:mm')}
                          </TableCell>
                          <TableCell>
                            <Badge variant={session.timeRemaining.includes('day') ? 'default' : 'secondary'}>
                              {session.timeRemaining}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {session.sessionId.substring(0, 8)}...
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit User Dialog */}
        <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <form onSubmit={handleUpdateUser}>
              <DialogHeader>
                <DialogTitle>Edit User</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {selectedUser && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        name="name"
                        defaultValue={selectedUser.name}
                        required
                        data-testid="input-edit-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        defaultValue={selectedUser.email}
                        required
                        data-testid="input-edit-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <Select name="role" defaultValue={selectedUser.role}>
                        <SelectTrigger data-testid="select-edit-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="isActive"
                        name="isActive"
                        defaultChecked={selectedUser.isActive}
                        className="rounded border-input"
                        data-testid="checkbox-edit-active"
                      />
                      <Label htmlFor="isActive">Active</Label>
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setEditUserDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateUserMutation.isPending}
                  data-testid="button-save-user"
                >
                  {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}