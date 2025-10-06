import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Settings, 
  Users, 
  RefreshCw, 
  Slack, 
  Shield, 
  UserCog, 
  User, 
  CheckCircle,
  XCircle,
  AlertCircle,
  Building2,
  Edit,
  Trash2,
  Crown,
  Plus,
  Calendar,
  CalendarOff,
  BookOpen,
  Database,
  DollarSign,
  Receipt
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User as UserType, Team as TeamType, Vacation } from "@shared/schema";
import { startOfWeek, addWeeks, format as formatDate, parseISO } from "date-fns";
import { getCheckinWeekFriday } from "@shared/utils/dueDates";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useViewAsRole } from "@/hooks/useViewAsRole";
import RoleSwitcher from "@/components/admin/role-switcher";

interface ChannelMember {
  id: string;
  name: string;
  email?: string;
  active: boolean;
}

interface SyncResult {
  created: number;
  activated: number;
  deactivated: number;
  message: string;
}

interface ChannelMembersResponse {
  members: ChannelMember[];
  count: number;
  channelName: string;
}

interface TeamAssignmentResult {
  message: string;
  user: UserType;
  teamName?: string;
}

interface TeamUpdateResult {
  message: string;
  team: TeamType;
}

interface TeamDeleteResult {
  message: string;
}

// Billing Events interface
interface BillingEvent {
  id: string;
  eventType: string;
  description: string;
  amount: number; // In cents
  currency: string;
  createdAt: string;
  metadata?: any;
}

interface UserBillingEventsResponse {
  user: {
    id: string;
    name: string;
    email: string;
  };
  totalCharges: number; // In cents
  totalCredits: number; // In cents
  netAmount: number; // In cents
  events: BillingEvent[];
}

// Form validation schema for team editing
const editTeamSchema = z.object({
  name: z.string().min(1, "Team name is required").max(100, "Team name must be less than 100 characters"),
  description: z.string().optional(),
  leaderId: z.string().optional(),
});

type EditTeamFormData = z.infer<typeof editTeamSchema>;

// Form validation schema for team creation
const createTeamSchema = z.object({
  name: z.string().min(1, "Team name is required").max(100, "Team name must be less than 100 characters"),
  description: z.string().optional(),
  leaderId: z.string().optional(),
  teamType: z.enum(["department", "team", "pod"]).default("team"),
});

type CreateTeamFormData = z.infer<typeof createTeamSchema>;

export default function Admin() {
  const { toast } = useToast();
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [newRole, setNewRole] = useState<string>("");
  const [selectedUserForTeam, setSelectedUserForTeam] = useState<UserType | null>(null);
  const [newTeamId, setNewTeamId] = useState<string>("");
  
  // Team management state
  const [selectedTeam, setSelectedTeam] = useState<TeamType | null>(null);
  const [teamToDelete, setTeamToDelete] = useState<TeamType | null>(null);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  
  // Vacation management state
  const [selectedUserForVacation, setSelectedUserForVacation] = useState<UserType | null>(null);
  const [vacationDatePopoverOpen, setVacationDatePopoverOpen] = useState(false);
  const [selectedVacationDate, setSelectedVacationDate] = useState<Date | undefined>();
  const [vacationNote, setVacationNote] = useState("");

  // Billing events state
  const [selectedUserForBilling, setSelectedUserForBilling] = useState<UserType | null>(null);
  const [showBillingEventsDialog, setShowBillingEventsDialog] = useState(false);

  const { data: currentUser, actualUser, canSwitchRoles } = useViewAsRole();

  // Fetch all users
  const { data: users = [], isLoading: usersLoading, refetch: refetchUsers } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  // Fetch channel members
  const { data: channelData, isLoading: channelLoading } = useQuery<ChannelMembersResponse>({
    queryKey: ["/api/admin/channel-members"],
    enabled: (actualUser?.role === "admin") || canSwitchRoles,
  });

  // Sync users mutation
  const syncUsersMutation = useMutation({
    mutationFn: async () => {
      // For super admins, include the organization ID in the request
      const requestBody = actualUser?.isSuperAdmin 
        ? { organizationId: actualUser?.organizationId }
        : {};
      
      const response = await apiRequest("POST", "/api/admin/sync-users", requestBody);
      
      // Check if the response is not ok before trying to parse JSON
      if (!response.ok) {
        // Try to get error details from response
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          // If JSON parsing fails, use a generic error
          errorData = { message: "Failed to sync users from Slack channel" };
        }
        throw errorData;
      }
      
      return await response.json() as SyncResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/channel-members"] });
      toast({
        title: "User sync completed",
        description: `Created: ${data.created}, Activated: ${data.activated}, Deactivated: ${data.deactivated}`,
      });
      setShowSyncDialog(false);
    },
    onError: (error: any) => {
      // Extract detailed error information from the backend
      let errorTitle = "Sync failed";
      let errorDescription = "Failed to sync users from Slack channel.";
      let errorDetails = "";
      
      // Check for specific error codes and provide detailed messages
      if (error?.error) {
        errorDescription = error.message || error.error;
        
        // Add specific error code information if available
        if (error.errorCode) {
          errorTitle = `Sync failed: ${error.errorCode}`;
        }
        
        // Add detailed error information if available
        if (error.errorDetails) {
          if (typeof error.errorDetails === 'object') {
            errorDetails = Object.entries(error.errorDetails)
              .map(([key, value]) => `${key}: ${value}`)
              .join(', ');
          } else {
            errorDetails = String(error.errorDetails);
          }
        }
        
        // Add debug information if available
        if (error.debug) {
          const debugInfo = typeof error.debug === 'object' 
            ? JSON.stringify(error.debug, null, 2)
            : String(error.debug);
          errorDetails = errorDetails ? `${errorDetails}\n\nDebug: ${debugInfo}` : `Debug: ${debugInfo}`;
        }
      } else if (error?.message) {
        errorDescription = error.message;
      }
      
      // Show comprehensive error toast with all available information
      toast({
        variant: "destructive",
        title: errorTitle,
        description: (
          <div className="space-y-2">
            <p className="font-medium">{errorDescription}</p>
            {errorDetails && (
              <pre className="text-xs bg-black/10 dark:bg-white/10 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                {errorDetails}
              </pre>
            )}
          </div>
        ) as any,
      });
    },
  });

  // Update user role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Role updated",
        description: data.message,
      });
      setSelectedUser(null);
      setNewRole("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to update role",
        description: error.message || "An error occurred while updating the user role.",
      });
    },
  });

  // Fetch all teams
  const { data: teams = [], isLoading: teamsLoading } = useQuery<TeamType[]>({
    queryKey: ["/api/teams"],
    enabled: (actualUser?.role === "admin") || canSwitchRoles,
  });
  
  // Fetch billing events for selected user
  const { data: billingEventsData, isLoading: billingEventsLoading } = useQuery<UserBillingEventsResponse>({
    queryKey: [`/api/admin/users/${selectedUserForBilling?.id}/billing-events`],
    enabled: !!selectedUserForBilling && showBillingEventsDialog,
  });

  // Fetch vacations for selected user
  const { data: userVacations = [], refetch: refetchVacations } = useQuery<Vacation[]>({
    queryKey: ["/api/vacations", { userId: selectedUserForVacation?.id }],
    queryFn: async () => {
      if (!selectedUserForVacation) return [];
      const response = await fetch(`/api/vacations?userId=${selectedUserForVacation.id}`);
      if (!response.ok) throw new Error('Failed to fetch vacations');
      return response.json();
    },
    enabled: !!selectedUserForVacation,
  });
  
  // Add vacation mutation for team member
  const addVacationForUserMutation = useMutation({
    mutationFn: async ({ userId, weekOf, note }: { userId: string; weekOf: Date; note?: string }) => {
      const weekStart = startOfWeek(weekOf, { weekStartsOn: 1 });
      return apiRequest("POST", "/api/admin/vacations", {
        userId,
        weekOf: weekStart.toISOString(),
        note,
      });
    },
    onSuccess: () => {
      refetchVacations();
      setSelectedVacationDate(undefined);
      setVacationNote("");
      setVacationDatePopoverOpen(false);
      toast({
        title: "Vacation week added",
        description: "Team member's vacation has been marked successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to add vacation",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Remove vacation mutation for team member
  const removeVacationForUserMutation = useMutation({
    mutationFn: async ({ userId, weekOf }: { userId: string; weekOf: string }) => {
      const weekStart = startOfWeek(parseISO(weekOf), { weekStartsOn: 1 });
      return apiRequest("DELETE", `/api/admin/vacations/${userId}/${weekStart.toISOString()}`);
    },
    onSuccess: () => {
      refetchVacations();
      toast({
        title: "Vacation removed",
        description: "Team member's vacation week has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to remove vacation",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update user team assignment mutation
  const updateTeamMutation = useMutation({
    mutationFn: async ({ userId, teamId }: { userId: string; teamId: string | null }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}/team`, { teamId });
      return await response.json() as TeamAssignmentResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Team assignment updated",
        description: data.message,
      });
      setSelectedUserForTeam(null);
      setNewTeamId("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to update team assignment",
        description: error.message || "An error occurred while updating the team assignment.",
      });
    },
  });

  // Edit team mutation
  const editTeamMutation = useMutation({
    mutationFn: async ({ teamId, teamData }: { teamId: string; teamData: EditTeamFormData }) => {
      const response = await apiRequest("PUT", `/api/teams/${teamId}`, teamData);
      return await response.json() as TeamUpdateResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams/hierarchy"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Team updated",
        description: data.message,
      });
      setSelectedTeam(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to update team",
        description: error.message || "An error occurred while updating the team.",
      });
    },
  });

  // Delete team mutation
  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const response = await apiRequest("DELETE", `/api/teams/${teamId}`);
      return await response.json() as TeamDeleteResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams/hierarchy"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Team deleted",
        description: data.message,
      });
      setTeamToDelete(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to delete team",
        description: error.message || "An error occurred while deleting the team.",
      });
    },
  });

  // Create team mutation
  const createTeamMutation = useMutation({
    mutationFn: async (teamData: CreateTeamFormData) => {
      const response = await apiRequest("POST", "/api/teams", {
        name: teamData.name,
        description: teamData.description || null,
        leaderId: teamData.leaderId || null,
        teamType: teamData.teamType,
      });
      return await response.json() as TeamUpdateResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams/hierarchy"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Team created",
        description: data.message,
      });
      setShowCreateTeam(false);
      createTeamForm.reset();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to create team",
        description: error.message || "An error occurred while creating the team.",
      });
    },
  });

  const handleRoleUpdate = () => {
    if (selectedUser && newRole) {
      updateRoleMutation.mutate({ userId: selectedUser.id, role: newRole });
    }
  };

  const handleTeamUpdate = () => {
    if (selectedUserForTeam) {
      // Convert "unassigned" string to null for "Unassigned"
      const teamId = newTeamId === "unassigned" || newTeamId === "" ? null : newTeamId;
      updateTeamMutation.mutate({ userId: selectedUserForTeam.id, teamId });
    }
  };

  // Team edit form
  const editTeamForm = useForm<EditTeamFormData>({
    resolver: zodResolver(editTeamSchema),
    defaultValues: {
      name: "",
      description: "",
      leaderId: "",
    },
  });

  // Team create form
  const createTeamForm = useForm<CreateTeamFormData>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: {
      name: "",
      description: "",
      leaderId: "",
      teamType: "team",
    },
  });

  const handleEditTeam = (team: TeamType) => {
    setSelectedTeam(team);
    editTeamForm.reset({
      name: team.name,
      description: team.description || "",
      leaderId: team.leaderId || "",
    });
  };

  const handleEditTeamSubmit = (data: EditTeamFormData) => {
    if (selectedTeam) {
      editTeamMutation.mutate({ 
        teamId: selectedTeam.id, 
        teamData: {
          ...data,
          leaderId: data.leaderId === "" || data.leaderId === "no-leader" ? undefined : data.leaderId,
        }
      });
    }
  };

  const handleDeleteTeam = (team: TeamType) => {
    setTeamToDelete(team);
  };

  const confirmDeleteTeam = () => {
    if (teamToDelete) {
      deleteTeamMutation.mutate(teamToDelete.id);
    }
  };

  const handleCreateTeamSubmit = (data: CreateTeamFormData) => {
    createTeamMutation.mutate({
      ...data,
      leaderId: data.leaderId === "" || data.leaderId === "no-leader" ? undefined : data.leaderId,
    });
  };

  // Seed question bank mutation (super admin only)
  const seedQuestionBankMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/seed-question-bank", {});
      if (!response.ok) {
        const error = await response.json();
        throw error;
      }
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/question-bank"] });
      queryClient.invalidateQueries({ queryKey: ["/api/question-categories"] });
      
      const detailsMessage = `Categories: ${data.details.categoriesCreated} created (${data.details.categoriesExisting} existing), Questions: ${data.details.questionsCreated} created (${data.details.questionsExisting} existing)`;
      
      toast({
        title: "Question bank seeding completed",
        description: detailsMessage,
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to seed question bank",
        description: error.message || "An error occurred while seeding the question bank.",
      });
    },
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge variant="destructive" className="flex items-center gap-1 text-xs" data-testid={`badge-role-admin`}><Shield className="w-3 h-3" />Admin</Badge>;
      case "manager":
        return <Badge variant="secondary" className="flex items-center gap-1 text-xs" data-testid={`badge-role-manager`}><UserCog className="w-3 h-3" />Manager</Badge>;
      default:
        return <Badge variant="outline" className="flex items-center gap-1 text-xs" data-testid={`badge-role-member`}><User className="w-3 h-3" />Member</Badge>;
    }
  };

  const getSlackStatusIcon = (user: UserType) => {
    if (user.slackUserId) {
      return <CheckCircle className="w-4 h-4 text-green-500" data-testid={`icon-slack-connected-${user.id}`} />;
    } else {
      return <XCircle className="w-4 h-4 text-red-500" data-testid={`icon-slack-not-connected-${user.id}`} />;
    }
  };

  const getTeamBadge = (user: UserType) => {
    if (!user.teamId) {
      return <Badge variant="outline" className="text-xs" data-testid={`badge-team-unassigned-${user.id}`}>Unassigned</Badge>;
    }
    
    const team = teams.find(t => t.id === user.teamId);
    const teamName = team?.name || "Unknown Team";
    
    return <Badge variant="secondary" className="text-xs" data-testid={`badge-team-${user.id}`}>{teamName}</Badge>;
  };

  // Allow access if user is actually admin OR if user can switch roles (Matthew Patrick only)
  if (actualUser?.role !== "admin" && !canSwitchRoles) {
    return (
      <div className="flex-1 flex items-center justify-center">
          <Card className="w-96">
            <CardHeader className="text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-orange-500 mb-2" />
              <CardTitle>Access Denied</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground">
                You need admin privileges to access this page.
              </p>
            </CardContent>
          </Card>
      </div>
    );
  }

  return (
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Role Switcher - Only visible to Matthew Patrick */}
        <RoleSwitcher />
        
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card data-testid="card-total-users">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-users-count">
                {usersLoading ? <Skeleton className="w-8 h-8" /> : users.length}
              </div>
              <p className="text-xs text-muted-foreground">
                Active and inactive users
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-slack-members">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Slack Members</CardTitle>
              <Slack className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-slack-members-count">
                {channelLoading ? <Skeleton className="w-8 h-8" /> : channelData?.count || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                In whirkplace-pulse channel
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-connected-users">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Connected Users</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-connected-users-count">
                {usersLoading ? <Skeleton className="w-8 h-8" /> : users.filter(u => u.slackUserId).length}
              </div>
              <p className="text-xs text-muted-foreground">
                Users with Slack connection
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Sync Section */}
        <Card data-testid="card-user-sync">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              User Sync
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sync users from the "whirkplace-pulse" Slack channel. This will create new users for channel members 
              and reactivate any previously deactivated users.
            </p>
            <div className="flex gap-2">
              <Button 
                onClick={() => setShowSyncDialog(true)}
                disabled={syncUsersMutation.isPending}
                data-testid="button-sync-users"
              >
                {syncUsersMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Slack className="w-4 h-4 mr-2" />
                )}
                Sync Users from Slack
              </Button>
              <Button 
                variant="outline" 
                onClick={() => refetchUsers()}
                data-testid="button-refresh-users"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Users Management */}
        <Card data-testid="card-users-management">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Users Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-[250px]" />
                      <Skeleton className="h-4 w-[200px]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {users.map((user) => (
                  <div 
                    key={user.id} 
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg gap-4"
                    data-testid={`row-user-${user.id}`}
                  >
                    <div className="flex items-center space-x-4">
                      <Avatar>
                        <AvatarImage src={user.avatar || user.slackAvatar || undefined} />
                        <AvatarFallback>
                          {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium" data-testid={`text-user-name-${user.id}`}>
                            {user.name}
                          </p>
                          {!user.isActive && (
                            <Badge variant="outline" className="text-xs">Inactive</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground" data-testid={`text-user-email-${user.id}`}>
                          {user.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <div className="hidden sm:flex items-center gap-2">
                        {getSlackStatusIcon(user)}
                        <span className="text-xs text-muted-foreground">
                          {user.slackUserId ? "Connected" : "Not Connected"}
                        </span>
                      </div>
                      {getRoleBadge(user.role)}
                      {getTeamBadge(user)}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedUser(user);
                          setNewRole(user.role);
                        }}
                        data-testid={`button-change-role-${user.id}`}
                      >
                        Change Role
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedUserForTeam(user);
                          setNewTeamId(user.teamId || "unassigned");
                        }}
                        data-testid={`button-assign-team-${user.id}`}
                      >
                        Assign Team
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedUserForBilling(user);
                          setShowBillingEventsDialog(true);
                        }}
                        data-testid={`button-view-charges-${user.id}`}
                      >
                        <Receipt className="w-4 h-4 mr-1" />
                        View Charges
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Teams Management */}
        <Card data-testid="card-teams-management">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Teams Management
              </CardTitle>
              <Button 
                onClick={() => setShowCreateTeam(true)}
                data-testid="button-create-team"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Team
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {teamsLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-12 w-12 rounded" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-[250px]" />
                      <Skeleton className="h-4 w-[200px]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : teams.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No teams found</p>
                <p className="text-sm text-muted-foreground">Teams will appear here once they are created</p>
              </div>
            ) : (
              <div className="space-y-4">
                {teams.map((team) => {
                  const leader = users.find(u => u.id === team.leaderId);
                  const memberCount = users.filter(u => u.teamId === team.id).length;
                  
                  return (
                    <div 
                      key={team.id} 
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg gap-4"
                      data-testid={`row-team-${team.id}`}
                    >
                      <div className="flex items-start space-x-4">
                        <div className="flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg">
                          <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium" data-testid={`text-team-name-${team.id}`}>
                              {team.name}
                            </h3>
                            {leader && (
                              <div className="flex items-center gap-1">
                                <Crown className="w-3 h-3 text-yellow-500" />
                                <span className="text-xs text-muted-foreground" data-testid={`text-team-leader-${team.id}`}>
                                  {leader.name}
                                </span>
                              </div>
                            )}
                          </div>
                          {team.description && (
                            <p className="text-sm text-muted-foreground mt-1" data-testid={`text-team-description-${team.id}`}>
                              {team.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-xs text-muted-foreground" data-testid={`text-team-member-count-${team.id}`}>
                              {memberCount} {memberCount === 1 ? 'member' : 'members'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditTeam(team)}
                          data-testid={`button-edit-team-${team.id}`}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteTeam(team)}
                          className="text-red-600 hover:text-red-700"
                          data-testid={`button-delete-team-${team.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Vacation Management */}
        <Card data-testid="card-vacation-management">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarOff className="w-5 h-5" />
              Team Vacation Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Manage vacation schedules for team members. Vacation weeks are excluded from check-in compliance metrics.
            </p>
            <div className="space-y-4">
              {/* User list with vacation management */}
              {users.filter(u => u.isActive).map((user) => (
                <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage 
                        src={user.slackAvatar || user.microsoftAvatar || user.avatar || undefined} 
                        alt={user.name}
                      />
                      <AvatarFallback>
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedUserForVacation(user)}
                    data-testid={`button-manage-vacation-${user.id}`}
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Manage Vacation
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Question Bank Management - Super Admin Only */}
        {actualUser?.isSuperAdmin && (
          <Card data-testid="card-question-bank-management">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Question Bank Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Initialize or refresh the global question bank with default categories and questions. 
                  This operation is idempotent and can be run safely multiple times.
                </p>
                
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-800 dark:text-blue-200">
                        About Question Bank
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        The question bank contains 6 categories and 24 pre-configured questions that teams can use for check-ins, 
                        one-on-ones, and other team interactions. If the bank is already populated, running this will only add missing items.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    onClick={() => seedQuestionBankMutation.mutate()}
                    disabled={seedQuestionBankMutation.isPending}
                    data-testid="button-seed-question-bank"
                  >
                    {seedQuestionBankMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Seeding Question Bank...
                      </>
                    ) : (
                      <>
                        <Database className="w-4 h-4 mr-2" />
                        Seed Question Bank
                      </>
                    )}
                  </Button>
                </div>
                
                {seedQuestionBankMutation.isSuccess && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <p className="text-sm text-green-800 dark:text-green-200">
                        Question bank successfully seeded!
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sync Confirmation Dialog */}
        <Dialog open={showSyncDialog} onOpenChange={setShowSyncDialog}>
          <DialogContent data-testid="dialog-sync-confirmation">
            <DialogHeader>
              <DialogTitle>Sync Users from Slack</DialogTitle>
              <DialogDescription>
                This will pull all members from the "whirkplace-pulse" channel and:
                <ul className="mt-2 list-disc list-inside space-y-1">
                  <li>Create new Whirkplace accounts for channel members who don't have accounts</li>
                  <li>Reactivate any previously deactivated users who are back in the channel</li>
                  <li>Deactivate users who are no longer in the channel</li>
                </ul>
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSyncDialog(false)} data-testid="button-cancel-sync">
                Cancel
              </Button>
              <Button 
                onClick={() => syncUsersMutation.mutate()}
                disabled={syncUsersMutation.isPending}
                data-testid="button-confirm-sync"
              >
                {syncUsersMutation.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                Sync Users
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Role Change Dialog */}
        <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
          <DialogContent data-testid="dialog-role-change">
            <DialogHeader>
              <DialogTitle>Change User Role</DialogTitle>
              <DialogDescription>
                Change the role for {selectedUser?.name}. This will affect their permissions in the system.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm">Current role:</span>
                {selectedUser && getRoleBadge(selectedUser.role)}
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-select">New Role</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger data-testid="select-new-role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member" data-testid="option-role-member">Member</SelectItem>
                    <SelectItem value="manager" data-testid="option-role-manager">Manager</SelectItem>
                    <SelectItem value="admin" data-testid="option-role-admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => setSelectedUser(null)}
                data-testid="button-cancel-role-change"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleRoleUpdate}
                disabled={!newRole || newRole === selectedUser?.role || updateRoleMutation.isPending}
                data-testid="button-confirm-role-change"
              >
                {updateRoleMutation.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                Update Role
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Team Assignment Dialog */}
        <Dialog open={!!selectedUserForTeam} onOpenChange={() => setSelectedUserForTeam(null)}>
          <DialogContent data-testid="dialog-team-assignment">
            <DialogHeader>
              <DialogTitle>Assign User to Team</DialogTitle>
              <DialogDescription>
                Assign {selectedUserForTeam?.name} to a team. This will help organize users and manage team-based permissions.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm">Current team:</span>
                {selectedUserForTeam && getTeamBadge(selectedUserForTeam)}
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-select">New Team</Label>
                <Select value={newTeamId} onValueChange={setNewTeamId}>
                  <SelectTrigger data-testid="select-new-team">
                    <SelectValue placeholder="Select a team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned" data-testid="option-team-unassigned">Unassigned</SelectItem>
                    {teams.map((team) => (
                      <SelectItem 
                        key={team.id} 
                        value={team.id} 
                        data-testid={`option-team-${team.id}`}
                      >
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => setSelectedUserForTeam(null)}
                data-testid="button-cancel-team-assignment"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleTeamUpdate}
                disabled={newTeamId === (selectedUserForTeam?.teamId || "unassigned") || updateTeamMutation.isPending}
                data-testid="button-confirm-team-assignment"
              >
                {updateTeamMutation.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                Update Team
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Team Dialog */}
        <Dialog open={!!selectedTeam} onOpenChange={() => setSelectedTeam(null)}>
          <DialogContent data-testid="dialog-edit-team">
            <DialogHeader>
              <DialogTitle>Edit Team</DialogTitle>
              <DialogDescription>
                Update the team details below. You can change the name, description, and assign a team leader.
              </DialogDescription>
            </DialogHeader>
            <Form {...editTeamForm}>
              <form onSubmit={editTeamForm.handleSubmit(handleEditTeamSubmit)} className="space-y-4">
                <FormField
                  control={editTeamForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter team name" 
                          {...field} 
                          data-testid="input-edit-team-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editTeamForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Enter team description" 
                          {...field} 
                          data-testid="input-edit-team-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editTeamForm.control}
                  name="leaderId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Leader (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-team-leader">
                            <SelectValue placeholder="Select a team leader" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="no-leader" data-testid="option-no-leader">No Leader</SelectItem>
                          {users
                            .filter(user => user.role === "manager" || user.role === "admin")
                            .map((user) => (
                              <SelectItem 
                                key={user.id} 
                                value={user.id} 
                                data-testid={`option-leader-${user.id}`}
                              >
                                {user.name} ({user.role})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex justify-end gap-2">
                  <Button 
                    type="button"
                    variant="outline" 
                    onClick={() => setSelectedTeam(null)}
                    data-testid="button-cancel-edit-team"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={editTeamMutation.isPending}
                    data-testid="button-confirm-edit-team"
                  >
                    {editTeamMutation.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                    Update Team
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Team Confirmation Dialog */}
        <Dialog open={!!teamToDelete} onOpenChange={() => setTeamToDelete(null)}>
          <DialogContent data-testid="dialog-delete-team">
            <DialogHeader>
              <DialogTitle>Delete Team</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the team "{teamToDelete?.name}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800 dark:text-yellow-200">
                    Important
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    Teams with assigned members cannot be deleted. Please reassign all team members before deleting this team.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => setTeamToDelete(null)}
                data-testid="button-cancel-delete-team"
              >
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={confirmDeleteTeam}
                disabled={deleteTeamMutation.isPending}
                data-testid="button-confirm-delete-team"
              >
                {deleteTeamMutation.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                Delete Team
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Team Dialog */}
        <Dialog open={showCreateTeam} onOpenChange={setShowCreateTeam}>
          <DialogContent data-testid="dialog-create-team">
            <DialogHeader>
              <DialogTitle>Create New Team</DialogTitle>
              <DialogDescription>
                Create a new team in your organization. You can assign a team leader and set team details.
              </DialogDescription>
            </DialogHeader>
            <Form {...createTeamForm}>
              <form onSubmit={createTeamForm.handleSubmit(handleCreateTeamSubmit)} className="space-y-4">
                <FormField
                  control={createTeamForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter team name" 
                          {...field} 
                          data-testid="input-create-team-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createTeamForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Enter team description" 
                          {...field} 
                          data-testid="input-create-team-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createTeamForm.control}
                  name="teamType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-create-team-type">
                            <SelectValue placeholder="Select team type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="team" data-testid="option-type-team">Team</SelectItem>
                          <SelectItem value="department" data-testid="option-type-department">Department</SelectItem>
                          <SelectItem value="pod" data-testid="option-type-pod">Pod</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createTeamForm.control}
                  name="leaderId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Leader (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-create-team-leader">
                            <SelectValue placeholder="Select a team leader" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="no-leader" data-testid="option-no-leader">No Leader</SelectItem>
                          {users
                            .filter(user => user.role === "manager" || user.role === "admin")
                            .map((user) => (
                              <SelectItem 
                                key={user.id} 
                                value={user.id} 
                                data-testid={`option-leader-${user.id}`}
                              >
                                {user.name} ({user.role})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex justify-end gap-2">
                  <Button 
                    type="button"
                    variant="outline" 
                    onClick={() => setShowCreateTeam(false)}
                    data-testid="button-cancel-create-team"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={createTeamMutation.isPending}
                    data-testid="button-confirm-create-team"
                  >
                    {createTeamMutation.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                    Create Team
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        
        {/* Vacation Management Dialog */}
        <Dialog open={!!selectedUserForVacation} onOpenChange={() => {
          setSelectedUserForVacation(null);
          setSelectedVacationDate(undefined);
          setVacationNote("");
        }}>
          <DialogContent data-testid="dialog-vacation-management" className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Manage Vacation Schedule</DialogTitle>
              <DialogDescription>
                Manage vacation weeks for {selectedUserForVacation?.name}. Vacation weeks are excluded from check-in compliance metrics.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Add vacation section */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">Add Vacation Week</h4>
                  <Popover open={vacationDatePopoverOpen} onOpenChange={setVacationDatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-add-user-vacation">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Week
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-4" align="end">
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm font-medium mb-2">Select a week</p>
                          <CalendarComponent
                            mode="single"
                            selected={selectedVacationDate}
                            onSelect={setSelectedVacationDate}
                            disabled={(date) => date < new Date()}
                            initialFocus
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Note (optional)</label>
                          <Input
                            value={vacationNote}
                            onChange={(e) => setVacationNote(e.target.value)}
                            placeholder="e.g., Annual leave"
                            className="mt-1"
                            data-testid="input-user-vacation-note"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setVacationDatePopoverOpen(false);
                              setSelectedVacationDate(undefined);
                              setVacationNote("");
                            }}
                            data-testid="button-cancel-user-vacation"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (!selectedVacationDate || !selectedUserForVacation) return;
                              addVacationForUserMutation.mutate({
                                userId: selectedUserForVacation.id,
                                weekOf: selectedVacationDate,
                                note: vacationNote,
                              });
                            }}
                            disabled={!selectedVacationDate || addVacationForUserMutation.isPending}
                            data-testid="button-confirm-user-vacation"
                          >
                            {addVacationForUserMutation.isPending ? "Adding..." : "Add Week"}
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                
                {/* Current vacations */}
                <div className="space-y-2">
                  {userVacations.length > 0 ? (
                    userVacations
                      .sort((a, b) => new Date(b.weekOf).getTime() - new Date(a.weekOf).getTime())
                      .map((vacation) => {
                        const weekStart = startOfWeek(typeof vacation.weekOf === 'string' ? parseISO(vacation.weekOf) : new Date(vacation.weekOf), { weekStartsOn: 1 });
                        return (
                          <div
                            key={vacation.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-muted/50"
                            data-testid={`user-vacation-week-${vacation.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <Calendar className="w-4 h-4 text-muted-foreground" />
                              <div>
                                <p className="text-sm font-medium">
                                  Week ending {formatDate(getCheckinWeekFriday(typeof vacation.weekOf === 'string' ? parseISO(vacation.weekOf) : vacation.weekOf), "MMMM d, yyyy")}
                                </p>
                                {vacation.note && (
                                  <p className="text-xs text-muted-foreground">{vacation.note}</p>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (!selectedUserForVacation) return;
                                removeVacationForUserMutation.mutate({
                                  userId: selectedUserForVacation.id,
                                  weekOf: typeof vacation.weekOf === 'string' ? vacation.weekOf : vacation.weekOf.toISOString(),
                                });
                              }}
                              disabled={removeVacationForUserMutation.isPending}
                              data-testid={`button-remove-user-vacation-${vacation.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        );
                      })
                  ) : (
                    <div className="text-center p-4 border rounded-lg bg-muted/30">
                      <CalendarOff className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        No vacation weeks scheduled for {selectedUserForVacation?.name}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button 
                onClick={() => setSelectedUserForVacation(null)}
                data-testid="button-close-vacation-dialog"
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Billing Events Dialog */}
        <Dialog open={showBillingEventsDialog} onOpenChange={setShowBillingEventsDialog}>
          <DialogContent data-testid="dialog-billing-events" className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Billing Events - {selectedUserForBilling?.name}
              </DialogTitle>
              <DialogDescription>
                View all charges and credits for {selectedUserForBilling?.name} ({selectedUserForBilling?.email})
              </DialogDescription>
            </DialogHeader>
            
            {billingEventsLoading ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              </div>
            ) : billingEventsData ? (
              <div className="space-y-6">
                {/* Summary Section */}
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Total Charges</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-green-600">
                        ${(billingEventsData.totalCharges / 100).toFixed(2)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Total Credits</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-red-600">
                        ${(billingEventsData.totalCredits / 100).toFixed(2)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Net Amount</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className={`text-2xl font-bold ${billingEventsData.netAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${(billingEventsData.netAmount / 100).toFixed(2)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Events Table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Billing History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {billingEventsData.events.length > 0 ? (
                      <div className="rounded-md border">
                        <table className="w-full">
                          <thead className="border-b bg-muted/50">
                            <tr>
                              <th className="text-left p-3 text-sm font-medium">Date</th>
                              <th className="text-left p-3 text-sm font-medium">Event Type</th>
                              <th className="text-left p-3 text-sm font-medium">Description</th>
                              <th className="text-right p-3 text-sm font-medium">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {billingEventsData.events.map((event) => {
                              const isCredit = event.amount < 0;
                              const formattedAmount = Math.abs(event.amount) / 100;
                              
                              return (
                                <tr key={event.id} className="border-b last:border-b-0">
                                  <td className="p-3 text-sm">
                                    {new Date(event.createdAt).toLocaleDateString('en-US', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </td>
                                  <td className="p-3 text-sm">
                                    <Badge variant="outline" className="capitalize">
                                      {event.eventType.replace(/_/g, ' ')}
                                    </Badge>
                                  </td>
                                  <td className="p-3 text-sm text-muted-foreground">
                                    {event.description}
                                  </td>
                                  <td className={`p-3 text-sm font-medium text-right ${isCredit ? 'text-red-600' : 'text-green-600'}`}>
                                    {isCredit ? '-' : '+'}${formattedAmount.toFixed(2)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-12 border rounded-lg bg-muted/30">
                        <Receipt className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                        <p className="text-muted-foreground font-medium">No billing events found</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          This user has no charges or credits recorded
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground">Failed to load billing events</p>
              </div>
            )}
            
            <div className="flex justify-end mt-4">
              <Button 
                onClick={() => {
                  setSelectedUserForBilling(null);
                  setShowBillingEventsDialog(false);
                }}
                data-testid="button-close-billing-dialog"
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );
}