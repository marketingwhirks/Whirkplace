import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import TeamMemberCard from "@/components/team/team-member-card";
import { Plus, Users, UserCog, Building } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User, Team, InsertUser, InsertTeam } from "@shared/schema";

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
  leaderId: z.string().refine(val => val !== "none", "Please select a team leader"),
});

type CreateUserForm = z.infer<typeof createUserSchema>;
type CreateTeamForm = z.infer<typeof createTeamSchema>;

export default function Team() {
  const { toast } = useToast();
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);

  // Fetch data
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
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
      teamId: "none",
      managerId: "none",
    },
  });

  const teamForm = useForm<CreateTeamForm>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: {
      name: "",
      description: "",
      leaderId: "none",
    },
  });

  // Get team structure
  const teamStructure = teams.map(team => ({
    ...team,
    members: users.filter(user => user.teamId === team.id),
    leader: users.find(user => user.id === team.leaderId),
  }));

  const unassignedUsers = users.filter(user => !user.teamId);

  const handleCreateUser = async (data: CreateUserForm) => {
    try {
      const userData: InsertUser = {
        username: data.username,
        name: data.name,
        email: data.email,
        password: data.password,
        role: data.role,
        teamId: data.teamId && data.teamId !== "none" ? data.teamId : null,
        managerId: data.managerId && data.managerId !== "none" ? data.managerId : null,
        avatar: null,
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
      const teamData: InsertTeam = {
        name: data.name,
        description: data.description || null,
        leaderId: data.leaderId,
      };

      await apiRequest("POST", "/api/teams", teamData);
      await queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      
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

  return (
    <>
      <Header
        title="Team"
        description="Manage your team structure and members"
      />

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
                              {users
                                .filter(user => user.role === "manager" || user.role === "admin")
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
                              <SelectItem value="none">No Team</SelectItem>
                              {teams.map(team => (
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
                              <SelectItem value="none">No Manager</SelectItem>
                              {users
                                .filter(user => user.role === "manager" || user.role === "admin")
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

        {/* Team Structure */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {teamStructure.map(team => (
            <Card key={team.id}>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Users className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg" data-testid={`text-team-${team.id}`}>
                    {team.name}
                  </CardTitle>
                  <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded-full">
                    {team.members.length} members
                  </span>
                </div>
                {team.description && (
                  <p className="text-sm text-muted-foreground">{team.description}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Team Leader */}
                {team.leader && (
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-2 block">
                      TEAM LEADER
                    </Label>
                    <TeamMemberCard user={team.leader} isLead />
                  </div>
                )}

                {/* Team Members */}
                {team.members.length > 0 && (
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-2 block">
                      MEMBERS
                    </Label>
                    <div className="space-y-2">
                      {team.members
                        .filter(member => member.id !== team.leaderId)
                        .map(member => (
                          <TeamMemberCard key={member.id} user={member} />
                        ))}
                    </div>
                  </div>
                )}

                {team.members.length === 0 && !team.leader && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No members assigned yet
                  </p>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Unassigned Users */}
          {unassignedUsers.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <UserCog className="w-5 h-5 text-muted-foreground" />
                  <CardTitle className="text-lg">Unassigned</CardTitle>
                  <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded-full">
                    {unassignedUsers.length} users
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {unassignedUsers.map(user => (
                  <TeamMemberCard key={user.id} user={user} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <p className="text-2xl font-bold text-foreground" data-testid="text-total-managers">
                  {users.filter(u => u.role === "manager" || u.role === "admin").length}
                </p>
                <p className="text-sm text-muted-foreground">Managers</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground" data-testid="text-unassigned-users">
                  {unassignedUsers.length}
                </p>
                <p className="text-sm text-muted-foreground">Unassigned</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
