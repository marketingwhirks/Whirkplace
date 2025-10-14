import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, UserCog, ChevronDown, ChevronRight, Building, Target, 
  Shield, CheckCircle, Clock, AlertCircle, User, Briefcase
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
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

function TeamCard({ team }: { team: Team }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
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
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            {team.leaderName && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
                  <UserCog className="w-4 h-4" />
                  <span>Team Leader: {team.leaderName}</span>
                </div>
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
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {member.email}
                          </div>
                        </div>
                      </div>
                      <Badge 
                        variant="outline" 
                        className="capitalize"
                        data-testid={`badge-role-${member.id}`}
                      >
                        {member.role}
                      </Badge>
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

export default function Teams() {
  const [searchTerm, setSearchTerm] = useState("");
  
  const { data, isLoading, error } = useQuery<TeamsWithKrasResponse>({
    queryKey: ["/api/teams/with-kras"],
  });
  
  const filteredTeams = data?.teams.filter(team => 
    team.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    team.members.some(member => 
      member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email.toLowerCase().includes(searchTerm.toLowerCase())
    )
  ) || [];
  
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Teams Overview</h1>
          <p className="text-gray-600 dark:text-gray-400">
            View all teams, their members, and assigned Key Result Areas
          </p>
        </div>
        
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
        
        <div className="mb-6">
          <Input
            type="text"
            placeholder="Search teams or members..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
            data-testid="input-search-teams"
          />
        </div>
        
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
                {searchTerm ? "No teams or members found matching your search." : "No teams found."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredTeams.map((team) => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}