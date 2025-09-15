import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User as UserType, Team as TeamType } from "@shared/schema";
import { useCurrentUser } from "@/hooks/useCurrentUser";

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

export default function Admin() {
  const { toast } = useToast();
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [newRole, setNewRole] = useState<string>("");
  const [selectedUserForTeam, setSelectedUserForTeam] = useState<UserType | null>(null);
  const [newTeamId, setNewTeamId] = useState<string>("");

  const { data: currentUser } = useCurrentUser();

  // Fetch all users
  const { data: users = [], isLoading: usersLoading, refetch: refetchUsers } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  // Fetch channel members
  const { data: channelData, isLoading: channelLoading } = useQuery<ChannelMembersResponse>({
    queryKey: ["/api/admin/channel-members"],
    enabled: currentUser?.role === "admin",
  });

  // Sync users mutation
  const syncUsersMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/sync-users");
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
    onError: () => {
      toast({
        variant: "destructive",
        title: "Sync failed",
        description: "Failed to sync users from Slack channel.",
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
    enabled: currentUser?.role === "admin",
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

  const handleRoleUpdate = () => {
    if (selectedUser && newRole) {
      updateRoleMutation.mutate({ userId: selectedUser.id, role: newRole });
    }
  };

  const handleTeamUpdate = () => {
    if (selectedUserForTeam) {
      // Convert empty string to null for "Unassigned"
      const teamId = newTeamId === "" ? null : newTeamId;
      updateTeamMutation.mutate({ userId: selectedUserForTeam.id, teamId });
    }
  };

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

  if (currentUser?.role !== "admin") {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Admin Panel" />
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
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="Admin Panel" />
      
      <div className="flex-1 overflow-auto p-6 space-y-6">
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
                    className="flex items-center justify-between p-4 border rounded-lg"
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
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
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
                          setNewTeamId(user.teamId || "");
                        }}
                        data-testid={`button-assign-team-${user.id}`}
                      >
                        Assign Team
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sync Confirmation Dialog */}
        <Dialog open={showSyncDialog} onOpenChange={setShowSyncDialog}>
          <DialogContent data-testid="dialog-sync-confirmation">
            <DialogHeader>
              <DialogTitle>Sync Users from Slack</DialogTitle>
              <DialogDescription>
                This will pull all members from the "whirkplace-pulse" channel and:
                <ul className="mt-2 list-disc list-inside space-y-1">
                  <li>Create new WhirkPlace accounts for channel members who don't have accounts</li>
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
                    <SelectItem value="" data-testid="option-team-unassigned">Unassigned</SelectItem>
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
                disabled={newTeamId === (selectedUserForTeam?.teamId || "") || updateTeamMutation.isPending}
                data-testid="button-confirm-team-assignment"
              >
                {updateTeamMutation.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                Update Team
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}