import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import TeamMemberCard from "@/components/team/team-member-card";
import { Plus, Users, UserCog, Building, AlertCircle, ChevronRight, ChevronDown, Network, Briefcase, Target, Move } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { User, Team, InsertUser, InsertTeam, TeamHierarchy } from "@shared/schema";

// Form schemas
const createUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["admin", "manager", "member"]),
  teamId: z.string().optional(),
  managerId: z.string().optional(),
});

const createTeamSchema = z.object({
  name: z.string().min(2, "Team name must be at least 2 characters"),
  description: z.string().optional(),
  leaderId: z.string().refine(val => val !== "no-leader", "Please select a team leader"),
  parentTeamId: z.string().optional(),
  teamType: z.enum(["department", "team", "pod"]),
});

type CreateUserForm = z.infer<typeof createUserSchema>;
type CreateTeamForm = z.infer<typeof createTeamSchema>;

export default function Team() {
  const { toast } = useToast();
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  const { data: currentUser } = useCurrentUser();

  // Fetch data
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: teamHierarchy = [] } = useQuery<TeamHierarchy[]>({
    queryKey: ["/api/teams/hierarchy"],
  });

  // Forms
  const userForm = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      username: "",
      name: "",
      email: "",
      password: "",
      role: "member",
      teamId: "no-team",
      managerId: "no-manager",
    },
  });

  const teamForm = useForm<CreateTeamForm>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: {
      name: "",
      description: "",
      leaderId: "no-leader",
      parentTeamId: "no-parent",
      teamType: "team",
    },
  });

  // Helper functions for team hierarchy
  const toggleTeamExpansion = (teamId: string) => {
    const newExpanded = new Set(expandedTeams);
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId);
    } else {
      newExpanded.add(teamId);
    }
    setExpandedTeams(newExpanded);
  };

  const getTeamTypeIcon = (teamType: string) => {
    switch (teamType) {
      case "department": return <Building className="w-4 h-4" />;
      case "team": return <Users className="w-4 h-4" />;
      case "pod": return <Target className="w-4 h-4" />;
      default: return <Users className="w-4 h-4" />;
    }
  };

  const getTeamTypeColor = (teamType: string) => {
    switch (teamType) {
      case "department": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "team": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "pod": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const unassignedUsers = users.filter(user => !user.teamId);

  // Recursive component for rendering team hierarchy
  const TeamHierarchyItem = ({ team, depth = 0 }: { team: TeamHierarchy; depth?: number }) => {
    const isExpanded = expandedTeams.has(team.id);
    const hasChildren = team.children && team.children.length > 0;
    const indentClass = depth > 0 ? `ml-${depth * 6}` : "";
    const teamLeader = users.find(user => user.id === team.leaderId);
    
    return (
      <div key={team.id} className="space-y-2">
        <Card className={`${indentClass} transition-all duration-200 hover:shadow-md`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {hasChildren && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleTeamExpansion(team.id)}
                    data-testid={`button-toggle-${team.id}`}
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </Button>
                )}
                {!hasChildren && <div className="w-8" />}
                {getTeamTypeIcon(team.teamType || "department")}
                <div>
                  <CardTitle className="text-lg flex items-center space-x-2" data-testid={`text-team-${team.id}`}>
                    <span>{team.name}</span>
                    <Badge className={getTeamTypeColor(team.teamType || "department")}>
                      {team.teamType || "department"}
                    </Badge>
                  </CardTitle>
                  {team.description && (
                    <p className="text-sm text-muted-foreground mt-1">{team.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Depth: {team.depth || 0} • Path: {team.path || "root"} • {team.memberCount || 0} members
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Badge variant="outline">
                  {team.memberCount || 0} members
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Team Leader */}
            {teamLeader && (
              <div className="mb-3">
                <Label className="text-xs font-medium text-muted-foreground mb-2 block">
                  TEAM LEADER
                </Label>
                <TeamMemberCard user={teamLeader} isLead />
              </div>
            )}

            {/* Team Members */}
            {team.memberCount && team.memberCount > 0 && (
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-2 block">
                  MEMBERS
                </Label>
                <div className="text-sm text-muted-foreground">
                  {team.memberCount} team members
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Render children if expanded */}
        {hasChildren && isExpanded && (
          <div className="space-y-2">
            {team.children!.map(child => (
              <TeamHierarchyItem key={child.id} team={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleCreateUser = async (data: CreateUserForm) => {
    try {
      const userData = {
        username: data.username,
        name: data.name,
        email: data.email,
        password: data.password,
        role: data.role,
        teamId: data.teamId && data.teamId !== "no-team" ? data.teamId : null,
        managerId: data.managerId && data.managerId !== "no-manager" ? data.managerId : null,
        avatar: null,
        authProvider: "local" as const,
        isActive: true,
      };

      await apiRequest("POST", "/api/users", userData);
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      
      toast({
        title: "User created successfully",
        description: `${data.name} has been added to the team.`,
      });

      userForm.reset();
      setShowCreateUser(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to create user",
        description: "There was an error creating the user.",
      });
    }
  };

  const handleCreateTeam = async (data: CreateTeamForm) => {
    try {
      const teamData = {
        name: data.name,
        description: data.description || null,
        leaderId: data.leaderId,
        parentTeamId: data.parentTeamId && data.parentTeamId !== "no-parent" ? data.parentTeamId : null,
        teamType: data.teamType,
      };

      await apiRequest("POST", "/api/teams/with-hierarchy", teamData);
      await queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/teams/hierarchy"] });
      
      toast({
        title: "Team created successfully",
        description: `${data.name} team has been created.`,
      });

      teamForm.reset();
      setShowCreateTeam(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to create team",
        description: "There was an error creating the team.",
      });
    }
  };

  const handleUpdateUserTeam = async (userId: string, teamId: string, managerId?: string) => {
    try {
      await apiRequest("PATCH", `/api/users/${userId}`, {
        teamId: teamId || null,
        managerId: managerId || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      
      toast({
        title: "User updated",
        description: "Team assignment has been updated.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: "There was an error updating the user.",
      });
    }
  };

  if (currentUser?.role !== "admin") {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <Card className="w-96">
            <CardHeader className="text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-orange-500 mb-2" />
              <CardTitle>Access Denied</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground">
                You need admin privileges to access team management.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* Quick Actions */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Team Management</h2>
            <p className="text-sm text-muted-foreground">
              Create teams, add members, and manage reporting structure
            </p>
          </div>
          <div className="flex space-x-3">
            <Dialog open={showCreateTeam} onOpenChange={setShowCreateTeam}>
              <DialogTrigger asChild>
                <Button variant="secondary" data-testid="button-create-team">
                  <Building className="w-4 h-4 mr-2" />
                  Create Team
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Team</DialogTitle>
                  <DialogDescription>
                    Add a new team to your organization.
                  </DialogDescription>
                </DialogHeader>
                <Form {...teamForm}>
                  <form onSubmit={teamForm.handleSubmit(handleCreateTeam)} className="space-y-4">
                    <FormField
                      control={teamForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Team Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Engineering" {...field} data-testid="input-team-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={teamForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Software development team" {...field} data-testid="input-team-description" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={teamForm.control}
                      name="teamType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Team Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-team-type">
                                <SelectValue placeholder="Select team type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="team">Team</SelectItem>
                              <SelectItem value="department">Department</SelectItem>
                              <SelectItem value="pod">Pod</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Team (top level) → Department/Pod (optional sub-structures)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={teamForm.control}
                      name="parentTeamId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Parent Team (Optional)</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-parent-team">
                                <SelectValue placeholder="Select parent team" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="no-parent">No Parent (Root Level)</SelectItem>
                              {teams
                                .filter(team => team.id && team.id.trim() !== "")
                                .map(team => (
                                  <SelectItem key={team.id} value={team.id}>
                                    {team.name} ({team.teamType || "department"})
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Create a nested team under an existing team
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={teamForm.control}
                      name="leaderId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Team Leader</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-team-leader">
                                <SelectValue placeholder="Select team leader" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="no-leader">Select a leader</SelectItem>
                              {users
                                .filter(user => (user.role === "manager" || user.role === "admin") && user.id && user.id.trim() !== "")
                                .map(user => (
                                  <SelectItem key={user.id} value={user.id}>
                                    {user.name} ({user.role})
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="flex justify-end space-x-3">
                      <Button variant="secondary" type="button" onClick={() => setShowCreateTeam(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" data-testid="button-submit-team">
                        Create Team
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>

            <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-user">
                  <Plus className="w-4 h-4 mr-2" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add New User</DialogTitle>
                  <DialogDescription>
                    Create a new team member account.
                  </DialogDescription>
                </DialogHeader>
                <Form {...userForm}>
                  <form onSubmit={userForm.handleSubmit(handleCreateUser)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={userForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl>
                              <Input placeholder="John Doe" {...field} data-testid="input-user-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={userForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username</FormLabel>
                            <FormControl>
                              <Input placeholder="johndoe" {...field} data-testid="input-username" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={userForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="john@company.com" {...field} data-testid="input-user-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={userForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} data-testid="input-user-password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={userForm.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Role</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-user-role">
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={userForm.control}
                      name="teamId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Team (Optional)</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-user-team">
                                <SelectValue placeholder="Select team" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="no-team">No Team</SelectItem>
                              {teams
                                .filter(team => team.id && team.id.trim() !== "") // Ensure valid team IDs
                                .map(team => (
                                  <SelectItem key={team.id} value={team.id}>
                                    {team.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={userForm.control}
                      name="managerId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Manager (Optional)</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-user-manager">
                                <SelectValue placeholder="Select manager" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="no-manager">No Manager</SelectItem>
                              {users
                                .filter(user => user.role === "manager" || user.role === "admin")
                                .filter(user => user.id && user.id.trim() !== "") // Ensure valid user IDs
                                .map(user => (
                                  <SelectItem key={user.id} value={user.id}>
                                    {user.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="flex justify-end space-x-3">
                      <Button variant="secondary" type="button" onClick={() => setShowCreateUser(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" data-testid="button-submit-user">
                        Add User
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Hierarchical Team Structure */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Team Hierarchy</h3>
              <p className="text-sm text-muted-foreground">
                Hierarchical view of your organization structure
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setExpandedTeams(new Set(teams.map(t => t.id)))}
                data-testid="button-expand-all"
              >
                Expand All
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setExpandedTeams(new Set())}
                data-testid="button-collapse-all"
              >
                Collapse All
              </Button>
            </div>
          </div>
          
          <div className="space-y-4">
            {teamHierarchy.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <Building className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No Teams Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first team to get started with team management
                  </p>
                  <Button onClick={() => setShowCreateTeam(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Team
                  </Button>
                </CardContent>
              </Card>
            ) : (
              teamHierarchy.map(team => (
                <TeamHierarchyItem key={team.id} team={team} depth={0} />
              ))
            )}
          </div>
        </div>


        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground" data-testid="text-total-users">
                  {users.length}
                </p>
                <p className="text-sm text-muted-foreground">Total Users</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground" data-testid="text-total-teams">
                  {teams.length}
                </p>
                <p className="text-sm text-muted-foreground">Teams</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground" data-testid="text-departments">
                  {teams.filter(t => t.teamType === "department").length}
                </p>
                <p className="text-sm text-muted-foreground">Departments</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground" data-testid="text-teams">
                  {teams.filter(t => t.teamType === "team").length}
                </p>
                <p className="text-sm text-muted-foreground">Teams</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground" data-testid="text-pods">
                  {teams.filter(t => t.teamType === "pod").length}
                </p>
                <p className="text-sm text-muted-foreground">Pods</p>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Unassigned Users */}
        {unassignedUsers.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <UserCog className="w-5 h-5 text-muted-foreground" />
                <CardTitle className="text-lg">Unassigned Users</CardTitle>
                <Badge variant="outline">
                  {unassignedUsers.length} users
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {unassignedUsers.map(user => (
                <TeamMemberCard key={user.id} user={user} />
              ))}
            </CardContent>
          </Card>
        )}
      </main>
  );
}
