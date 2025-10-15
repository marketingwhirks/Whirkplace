import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, UserCog, ChevronDown, ChevronRight, Building, Target, 
  Shield, CheckCircle, Clock, AlertCircle, User, Briefcase,
  Plus, Edit, Trash2, UserPlus, UserMinus, Settings, Download,
  ArrowRight, Filter, Search, MoreVertical, FileJson, FileText,
  ChevronUp, UsersIcon, GitBranch, UserCheck
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import Header from "@/components/layout/header";

interface UserKra {
  id: string;
  name: string;
  status: string;
  progress?: number;
  templateId?: string;
  startDate?: string;
  endDate?: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  isTeamLead: boolean;
  kras: UserKra[];
  managerId?: string;
  managerName?: string;
}

interface Team {
  id: string;
  name: string;
  description?: string;
  leaderId?: string;
  leaderName?: string;
  teamType: string;
  parentTeamId?: string;
  memberCount: number;
  kraCount: number;
  members: TeamMember[];
}

interface TeamsWithKrasResponse {
  teams: Team[];
  summary: {
    totalTeams: number;
    totalUsers: number;
    totalKras: number;
    teamsWithKras: number;
  };
}

function getStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case "active":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800";
    case "completed":
      return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800";
    case "pending":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800";
    case "overdue":
      return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800";
    default:
      return "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-800";
  }
}

function getStatusIcon(status: string) {
  switch (status.toLowerCase()) {
    case "active":
      return <Clock className="w-3 h-3" />;
    case "completed":
      return <CheckCircle className="w-3 h-3" />;
    case "pending":
      return <AlertCircle className="w-3 h-3" />;
    default:
      return <Target className="w-3 h-3" />;
  }
}

function getRoleIcon(role: string) {
  switch (role.toLowerCase()) {
    case "admin":
      return <Shield className="w-4 h-4" />;
    case "manager":
      return <UserCog className="w-4 h-4" />;
    default:
      return <User className="w-4 h-4" />;
  }
}

function getTeamTypeIcon(teamType: string) {
  switch (teamType) {
    case "department":
      return <Building className="w-4 h-4" />;
    case "pod":
      return <Target className="w-4 h-4" />;
    default:
      return <Users className="w-4 h-4" />;
  }
}

function QuickActionsPanel() {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleBulkAssignManager = () => {
    toast({
      title: "Bulk Manager Assignment",
      description: "Bulk manager assignment coming soon",
    });
  };

  const handleMoveMembers = () => {
    toast({
      title: "Move Members",
      description: "Member movement feature coming soon",
    });
  };

  const handleExportStructure = (format: 'csv' | 'json') => {
    toast({
      title: "Export Team Structure",
      description: `Export to ${format.toUpperCase()} coming soon`,
    });
  };

  return (
    <Card className="mb-6">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </div>
              <Button variant="ghost" size="sm" className="p-0 h-6 w-6">
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              <Button 
                onClick={handleBulkAssignManager} 
                variant="outline" 
                size="sm"
                data-testid="button-bulk-assign-manager"
              >
                <UserCog className="w-4 h-4 mr-2" />
                Bulk Assign Manager
              </Button>
              <Button 
                onClick={handleMoveMembers} 
                variant="outline" 
                size="sm"
                data-testid="button-move-members"
              >
                <UsersIcon className="w-4 h-4 mr-2" />
                Move Members Between Teams
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-export-structure">
                    <Download className="w-4 h-4 mr-2" />
                    Export Team Structure
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handleExportStructure('csv')}>
                    <FileText className="w-4 h-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExportStructure('json')}>
                    <FileJson className="w-4 h-4 mr-2" />
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function TeamCard({ team, isAdmin }: { team: Team; isAdmin: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();

  const handleEditTeam = () => {
    toast({
      title: "Edit Team",
      description: "Team editing coming soon",
    });
  };

  const handleDeleteTeam = () => {
    toast({
      title: "Delete Team",
      description: "Team deletion coming soon",
      variant: "destructive",
    });
  };

  const handleAddMember = () => {
    toast({
      title: "Add Member",
      description: "Member addition coming soon",
    });
  };

  const handleRemoveMember = (memberId: string, memberName: string) => {
    toast({
      title: "Remove Member",
      description: `Member removal coming soon for ${memberName}`,
      variant: "destructive",
    });
  };

  const handleChangeManager = (memberId: string, memberName: string) => {
    toast({
      title: "Change Manager",
      description: `Manager change coming soon for ${memberName}`,
    });
  };

  const handleSetReviewer = (member: TeamMember) => {
    // For now, show a toast with placeholder
    toast({
      title: "Set Custom Reviewer",
      description: `Custom reviewer assignment for ${member.name} coming soon`,
    });
    // TODO: Open a dialog to select a reviewer from available managers/leaders
  };
  
  return (
    <Card className="mb-4">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-0 h-6 w-6"
                  data-testid={`button-expand-team-${team.id}`}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
                <div className="flex items-center gap-2">
                  {getTeamTypeIcon(team.teamType)}
                  <div>
                    <CardTitle className="text-lg" data-testid={`text-team-name-${team.id}`}>
                      {team.name}
                    </CardTitle>
                    {team.description && (
                      <CardDescription className="mt-1">{team.description}</CardDescription>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-2">
                  <Badge variant="secondary" className="font-normal">
                    <Users className="w-3 h-3 mr-1" />
                    {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
                  </Badge>
                  {team.kraCount > 0 && (
                    <Badge variant="default" className="font-normal">
                      <Target className="w-3 h-3 mr-1" />
                      {team.kraCount} {team.kraCount === 1 ? "KRA" : "KRAs"}
                    </Badge>
                  )}
                </div>
                {isAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        data-testid={`button-team-menu-${team.id}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Team Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleAddMember}>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Add Member
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleEditTeam}>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit Team Details
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={handleDeleteTeam} 
                        className="text-red-600 dark:text-red-400"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Team
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            {team.leaderName && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
                    <UserCog className="w-4 h-4" />
                    <span>Team Leader: {team.leaderName}</span>
                  </div>
                  {isAdmin && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleChangeManager(team.leaderId || '', team.leaderName || '')}
                      data-testid={`button-change-leader-${team.id}`}
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      Change
                    </Button>
                  )}
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="mb-4 flex gap-2">
                <Button 
                  onClick={handleAddMember} 
                  variant="outline" 
                  size="sm"
                  data-testid={`button-add-member-${team.id}`}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Member
                </Button>
                <Button 
                  onClick={handleEditTeam} 
                  variant="outline" 
                  size="sm"
                  data-testid={`button-edit-team-${team.id}`}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Team Details
                </Button>
              </div>
            )}
            
            <div className="space-y-3">
              {team.members.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                  No members assigned to this team yet
                </p>
              ) : (
                team.members.map((member) => (
                  <div 
                    key={member.id} 
                    className={`p-4 rounded-lg border transition-colors ${
                      member.isTeamLead 
                        ? "bg-gradient-to-r from-blue-50 to-transparent dark:from-blue-950/20 border-blue-200 dark:border-blue-800" 
                        : "bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800"
                    }`}
                    data-testid={`card-member-${member.id}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        {getRoleIcon(member.role)}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium" data-testid={`text-member-name-${member.id}`}>
                              {member.name}
                            </span>
                            {member.isTeamLead && (
                              <Badge variant="default" className="text-xs">Team Lead</Badge>
                            )}
                            <Badge 
                              variant="outline" 
                              className={`text-xs capitalize ${
                                member.role === 'admin' ? 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400' :
                                member.role === 'manager' ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400' :
                                'bg-gray-50 dark:bg-gray-900/30'
                              }`}
                              data-testid={`badge-role-${member.id}`}
                            >
                              {member.role}
                            </Badge>
                            {member.managerName && (
                              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <ArrowRight className="w-3 h-3" />
                                <span>Reports to: {member.managerName}</span>
                              </div>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {member.email}
                          </div>
                        </div>
                      </div>
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              data-testid={`button-member-menu-${member.id}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Member Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleSetReviewer(member)}>
                              <UserCheck className="w-4 h-4 mr-2" />
                              Set Custom Reviewer
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleChangeManager(member.id, member.name)}>
                              <UserCog className="w-4 h-4 mr-2" />
                              Change Manager
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleRemoveMember(member.id, member.name)} 
                              className="text-red-600 dark:text-red-400"
                            >
                              <UserMinus className="w-4 h-4 mr-2" />
                              Remove from Team
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    
                    {member.kras.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                          Assigned KRAs ({member.kras.length})
                        </div>
                        <div className="grid gap-2">
                          {member.kras.map((kra) => (
                            <div 
                              key={kra.id} 
                              className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700"
                              data-testid={`card-kra-${kra.id}`}
                            >
                              <div className="flex items-center gap-2 flex-1">
                                <Briefcase className="w-4 h-4 text-gray-400" />
                                <span className="text-sm font-medium truncate" data-testid={`text-kra-name-${kra.id}`}>
                                  {kra.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {kra.progress !== undefined && (
                                  <div className="w-24">
                                    <Progress value={kra.progress} className="h-2" />
                                  </div>
                                )}
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs ${getStatusColor(kra.status)}`}
                                  data-testid={`badge-kra-status-${kra.id}`}
                                >
                                  <span className="flex items-center gap-1">
                                    {getStatusIcon(kra.status)}
                                    {kra.status}
                                  </span>
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default function TeamManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [activeTab, setActiveTab] = useState("all");
  const { toast } = useToast();
  const { data: currentUser } = useCurrentUser();
  
  const { data, isLoading, error } = useQuery<TeamsWithKrasResponse>({
    queryKey: ["/api/teams/with-kras"],
  });

  const isAdmin = currentUser?.role === 'admin';
  const isManager = currentUser?.role === 'manager';
  const canManage = isAdmin || isManager;

  const handleCreateTeam = () => {
    toast({
      title: "Create Team",
      description: "Team creation coming soon",
    });
  };
  
  // Filter teams based on active tab
  const getFilteredTeamsByTab = (teams: Team[]) => {
    switch (activeTab) {
      case "my-team":
        return teams.filter(team => 
          team.members.some(member => member.id === currentUser?.id) ||
          team.leaderId === currentUser?.id
        );
      case "hierarchy":
        // For now, show all teams in hierarchical view
        return teams;
      default:
        return teams;
    }
  };

  // Apply search and role filters
  const filteredTeams = useMemo(() => {
    if (!data?.teams) return [];
    
    let teams = getFilteredTeamsByTab(data.teams);
    
    // Apply search filter
    if (searchTerm) {
      teams = teams.filter(team => 
        team.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        team.members.some(member => 
          member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          member.email.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }
    
    // Apply role filter
    if (filterRole !== "all") {
      teams = teams.map(team => ({
        ...team,
        members: team.members.filter(member => member.role === filterRole),
        memberCount: team.members.filter(member => member.role === filterRole).length
      })).filter(team => team.members.length > 0);
    }
    
    return teams;
  }, [data?.teams, searchTerm, filterRole, activeTab, currentUser?.id]);
  
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold">Team Management</h1>
            {isAdmin && (
              <Button 
                onClick={handleCreateTeam}
                data-testid="button-create-team"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create New Team
              </Button>
            )}
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Manage teams, members, and organizational structure
          </p>
        </div>
        
        {/* Summary Cards */}
        {data?.summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Teams</p>
                    <p className="text-2xl font-bold" data-testid="text-total-teams">{data.summary.totalTeams}</p>
                  </div>
                  <Building className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Users</p>
                    <p className="text-2xl font-bold" data-testid="text-total-users">{data.summary.totalUsers}</p>
                  </div>
                  <Users className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active KRAs</p>
                    <p className="text-2xl font-bold" data-testid="text-total-kras">{data.summary.totalKras}</p>
                  </div>
                  <Target className="w-8 h-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Teams with KRAs</p>
                    <p className="text-2xl font-bold" data-testid="text-teams-with-kras">{data.summary.teamsWithKras}</p>
                  </div>
                  <CheckCircle className="w-8 h-8 text-indigo-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        
        {/* Quick Actions Panel (Admin only) */}
        {canManage && <QuickActionsPanel />}
        
        {/* Team Operations Section (Admin only) */}
        {isAdmin && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Team Operations</CardTitle>
              <CardDescription>Manage organizational structure and teams</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button 
                  onClick={handleCreateTeam} 
                  variant="default"
                  data-testid="button-create-new-team-op"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create New Team
                </Button>
                <Button 
                  onClick={() => toast({ title: "Edit Team", description: "Select a team to edit from the list below" })} 
                  variant="outline"
                  data-testid="button-edit-team-op"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Team
                </Button>
                <Button 
                  onClick={() => toast({ title: "Delete Team", description: "Select a team to delete from the list below", variant: "destructive" })} 
                  variant="outline"
                  className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                  data-testid="button-delete-team-op"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Team
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Tabs for different views */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="all" data-testid="tab-all-teams">
              <Users className="w-4 h-4 mr-2" />
              All Teams
            </TabsTrigger>
            <TabsTrigger value="my-team" data-testid="tab-my-team">
              <User className="w-4 h-4 mr-2" />
              My Team
            </TabsTrigger>
            <TabsTrigger value="hierarchy" data-testid="tab-team-hierarchy">
              <GitBranch className="w-4 h-4 mr-2" />
              Team Hierarchy
            </TabsTrigger>
          </TabsList>
          
          {/* Search and Filter Bar */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="text"
                placeholder="Search teams or members..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-teams"
              />
            </div>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-role">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
                <SelectItem value="manager">Managers</SelectItem>
                <SelectItem value="member">Members</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Team Cards */}
          <TabsContent value={activeTab} className="mt-0">
          {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32 mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="pt-6">
              <p className="text-red-600 dark:text-red-400">
                Failed to load teams. Please try again later.
              </p>
            </CardContent>
          </Card>
        ) : filteredTeams.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-gray-500 dark:text-gray-400">
                {searchTerm || filterRole !== "all" 
                  ? "No teams or members found matching your filters." 
                  : activeTab === "my-team" 
                  ? "You are not currently assigned to any team."
                  : "No teams found."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {activeTab === "hierarchy" ? (
              // Hierarchical view
              <Card>
                <CardHeader>
                  <CardTitle>Team Hierarchy View</CardTitle>
                  <CardDescription>Organizational structure and reporting relationships</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {filteredTeams.map((team) => (
                      <div key={team.id} className="pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 mb-2">
                          {getTeamTypeIcon(team.teamType)}
                          <span className="font-medium">{team.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {team.memberCount} members
                          </Badge>
                        </div>
                        {team.members.map((member, index) => (
                          <div key={member.id} className={`pl-6 py-1 ${index > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}`}>
                            <div className="flex items-center gap-2 text-sm">
                              <ArrowRight className="w-3 h-3 text-gray-400" />
                              {getRoleIcon(member.role)}
                              <span>{member.name}</span>
                              <Badge variant="outline" className="text-xs capitalize">
                                {member.role}
                              </Badge>
                              {member.isTeamLead && (
                                <Badge variant="default" className="text-xs">Lead</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              // Card view for All Teams and My Team tabs
              filteredTeams.map((team) => (
                <TeamCard key={team.id} team={team} isAdmin={isAdmin} />
              ))
            )}
          </div>
        )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}