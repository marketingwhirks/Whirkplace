import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow, formatDistance, format, startOfWeek, addWeeks, differenceInDays, endOfWeek } from "date-fns";
import { 
  CheckCircle, XCircle, Clock, Eye, MessageSquare, Filter, Calendar, User, AlertCircle, Send, UserMinus, Bell,
  Plane, Download, Users, TrendingDown, TrendingUp, ChevronLeft, ChevronRight, Activity, BellRing, Info, CheckCheck,
  ChevronDown, ChevronUp, BarChart3, Target, Award, AlertTriangle, Sparkles, Shield, Zap, TrendingUp as TrendUp, TrendingDown as TrendDown
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiRequest, queryClient } from "@/lib/queryClient";
import RatingStars from "@/components/checkin/rating-stars";
import { cn } from "@/lib/utils";
import Papa from "papaparse";
import { getCheckinDueDate, getWeekStartCentral, getDueDateString } from "@shared/utils/dueDates";
import type { Checkin, User as UserType, Question, ReviewCheckin, Team, Vacation, Organization } from "@shared/schema";

interface EnhancedCheckin extends Checkin {
  user?: {
    id: string;
    name: string;
    email: string;
    teamId: string | null;
    teamName: string | null;
  };
  reviewer?: {
    id: string;
    name: string;
    email: string;
  };
}

interface ReviewModalData {
  checkin: EnhancedCheckin;
}

interface UserWithoutCheckin {
  user: UserType & {
    teamName?: string | null;
  };
  lastCheckin: Checkin | null;
  daysSinceLastCheckin: number | null;
  lastReminderSent: Date | null;
}

interface TeamMemberComplianceStatus {
  userId: string;
  userName: string;
  email: string;
  status: 'submitted' | 'missing' | 'overdue' | 'on-vacation';
  submittedAt?: Date;
  daysOverdue?: number;
  moodRating?: number | null;
  compliance: {
    rate: number;
    streak: number;
    onTimeRate: number;
    recentText: string;
    totalSubmitted: number;
    totalExpected: number;
  };
}

interface TeamComplianceData {
  teamId: string;
  teamName: string;
  metrics: {
    submissionRate: number;
    onTimeRate: number;
    averageMood: number | null;
    submitted: number;
    expected: number;
    onVacation: number;
  };
  members: TeamMemberComplianceStatus[];
}

interface TeamHistoricalMetrics {
  teamId: string;
  teamName: string;
  currentWeek: {
    submissionRate: number;
    onTimeRate: number;
    averageMood: number | null;
  };
  historical: Array<{
    weekStart: string;
    submissionRate: number;
  }>;
  memberBreakdown: {
    total: number;
    consistent: number;
    struggling: number;
    average: number;
  };
}

interface OrganizationSummary {
  overall: {
    submissionRate: number;
    submitted: number;
    expected: number;
    onVacation: number;
    totalActive: number;
  };
  teams: {
    all: Array<{
      teamId: string;
      teamName: string;
      submissionRate: number;
      submitted: number;
      expected: number;
      members: number;
    }>;
    topPerforming: Array<{
      teamId: string;
      teamName: string;
      submissionRate: number;
    }>;
    needingAttention: Array<{
      teamId: string;
      teamName: string;
      submissionRate: number;
    }>;
  };
  individuals: {
    topPerformers: Array<{
      userId: string;
      userName: string;
      complianceRate: number;
    }>;
    needingAttention: Array<{
      userId: string;
      userName: string;
      complianceRate: number;
    }>;
  };
}

// Helper function to get compliance color based on percentage
function getComplianceColor(rate: number): string {
  if (rate >= 80) return "text-green-600 dark:text-green-400";
  if (rate >= 50) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function getComplianceBadgeColor(rate: number): string {
  if (rate >= 80) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (rate >= 50) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
  return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
}

function getComplianceBackground(rate: number): string {
  if (rate >= 80) return "bg-green-50 dark:bg-green-950";
  if (rate >= 50) return "bg-yellow-50 dark:bg-yellow-950";
  return "bg-red-50 dark:bg-red-950";
}

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case 'submitted':
      return 'default';
    case 'on-vacation':
      return 'secondary';
    case 'overdue':
      return 'destructive';
    default:
      return 'outline';
  }
}

// Simple sparkline component for historical trends
function Sparkline({ data, color = "currentColor" }: { data: number[]; color?: string }) {
  if (!data || data.length === 0) return null;
  
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - ((value - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');
  
  return (
    <svg className="w-16 h-8" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="3"
        points={points}
      />
    </svg>
  );
}

// Trend arrow component
function TrendArrow({ current, previous }: { current: number; previous: number }) {
  if (current > previous) {
    return (
      <span className="flex items-center text-green-600 dark:text-green-400 text-sm">
        <TrendUp className="h-3 w-3 mr-1" />
        +{Math.round(current - previous)}%
      </span>
    );
  } else if (current < previous) {
    return (
      <span className="flex items-center text-red-600 dark:text-red-400 text-sm">
        <TrendDown className="h-3 w-3 mr-1" />
        {Math.round(current - previous)}%
      </span>
    );
  }
  return null;
}

export default function Reviews() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [reviewModal, setReviewModal] = useState<ReviewModalData | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [responseComments, setResponseComments] = useState<Record<string, string>>({});
  const [addToOneOnOne, setAddToOneOnOne] = useState(false);
  const [flagForFollowUp, setFlagForFollowUp] = useState(false);
  const [selectedReminders, setSelectedReminders] = useState<Set<string>>(new Set());
  
  // Team Check-in Status state
  const [selectedWeek, setSelectedWeek] = useState(0); // 0 = current week, -1 = last week, etc.
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'all' | 'my-team'>('all'); // For admins
  
  // Reminder state
  const [showBulkReminderDialog, setShowBulkReminderDialog] = useState(false);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [remindersSent, setRemindersSent] = useState<Set<string>>(new Set());
  
  // Calculate the week we're viewing
  const viewingWeekStart = useMemo(() => {
    const weekStart = addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), selectedWeek);
    return weekStart;
  }, [selectedWeek]);
  
  const viewingWeekEnd = useMemo(() => {
    const weekEnd = endOfWeek(viewingWeekStart, { weekStartsOn: 1 });
    return weekEnd;
  }, [viewingWeekStart]);

  // Calculate Friday of the week (for display purposes)
  const viewingWeekFriday = useMemo(() => {
    return new Date(viewingWeekStart.getTime() + 4 * 24 * 60 * 60 * 1000); // Add 4 days to Monday to get Friday
  }, [viewingWeekStart]);

  // Fetch organization data
  const { data: organization } = useQuery<Organization>({
    queryKey: ["/api/organizations", currentUser?.organizationId],
    enabled: !!currentUser?.organizationId,
  });

  // Fetch all teams
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
    enabled: !!currentUser,
  });

  // Fetch pending check-ins
  const { data: pendingCheckins = [], isLoading: pendingLoading } = useQuery<EnhancedCheckin[]>({
    queryKey: ["/api/checkins/pending"],
    enabled: !userLoading && !!currentUser && (currentUser.role === "manager" || currentUser.role === "admin"),
  });

  // Fetch recently reviewed check-ins
  const { data: reviewedCheckins = [], isLoading: reviewedLoading } = useQuery<EnhancedCheckin[]>({
    queryKey: ["/api/checkins/review-status", "reviewed"],
    enabled: !userLoading && !!currentUser && (currentUser.role === "manager" || currentUser.role === "admin"),
  });

  // Fetch organization compliance summary
  const { data: orgSummary, isLoading: summaryLoading } = useQuery<OrganizationSummary>({
    queryKey: ["/api/compliance/organization-summary", viewingWeekStart.toISOString()],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/compliance/organization-summary?weekStart=${viewingWeekStart.toISOString()}`);
      if (!response.ok) throw new Error('Failed to fetch organization summary');
      return response.json();
    },
    enabled: !!currentUser && currentUser.role === 'admin',
  });

  // Fetch team members compliance status
  const { data: teamComplianceData = [], isLoading: complianceLoading } = useQuery<TeamComplianceData[]>({
    queryKey: ["/api/compliance/team-members-status", selectedTeam, viewingWeekStart.toISOString()],
    queryFn: async () => {
      let url = `/api/compliance/team-members-status?weekStart=${viewingWeekStart.toISOString()}`;
      if (selectedTeam && selectedTeam !== 'all') {
        url += `&teamId=${selectedTeam}`;
      }
      const response = await apiRequest("GET", url);
      if (!response.ok) throw new Error('Failed to fetch team compliance data');
      return response.json();
    },
    enabled: !!currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager'),
  });

  // Fetch team metrics with historical data
  const { data: teamMetrics = [] } = useQuery<TeamHistoricalMetrics[]>({
    queryKey: ["/api/compliance/team-metrics", selectedTeam, viewingWeekStart.toISOString()],
    queryFn: async () => {
      let url = `/api/compliance/team-metrics?weekStart=${viewingWeekStart.toISOString()}`;
      if (selectedTeam && selectedTeam !== 'all') {
        url += `&teamId=${selectedTeam}`;
      }
      const response = await apiRequest("GET", url);
      if (!response.ok) throw new Error('Failed to fetch team metrics');
      return response.json();
    },
    enabled: !!currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager'),
  });

  // Filter data based on view mode and role
  const filteredTeamData = useMemo(() => {
    if (!teamComplianceData || teamComplianceData.length === 0) return [];
    
    // For managers, always show only their team
    if (currentUser?.role === 'manager') {
      return teamComplianceData;
    }
    
    // For admins with "My Team" mode
    if (currentUser?.role === 'admin' && viewMode === 'my-team') {
      return teamComplianceData.filter(team => 
        team.members.some(m => m.userId === currentUser.id) ||
        teams.find(t => t.id === team.teamId)?.leaderId === currentUser.id
      );
    }
    
    // For admins with "All Teams" mode
    return teamComplianceData;
  }, [teamComplianceData, currentUser, viewMode, teams]);

  // Auto-expand teams with issues
  useEffect(() => {
    const teamsWithIssues = filteredTeamData
      .filter(team => team.metrics.submissionRate < 50)
      .map(team => team.teamId);
    
    if (teamsWithIssues.length > 0 && expandedTeams.size === 0) {
      setExpandedTeams(new Set(teamsWithIssues));
    }
  }, [filteredTeamData]);

  // Toggle team expansion
  const toggleTeamExpansion = (teamId: string) => {
    setExpandedTeams(prev => {
      const newSet = new Set(prev);
      if (newSet.has(teamId)) {
        newSet.delete(teamId);
      } else {
        newSet.add(teamId);
      }
      return newSet;
    });
  };

  // Expand/collapse all teams
  const toggleAllTeams = (expand: boolean) => {
    if (expand) {
      setExpandedTeams(new Set(filteredTeamData.map(t => t.teamId)));
    } else {
      setExpandedTeams(new Set());
    }
  };

  // Review checkin mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ checkinId, reviewData }: { checkinId: string; reviewData: ReviewCheckin }) => {
      const response = await apiRequest("PATCH", `/api/checkins/${checkinId}/review`, reviewData);
      if (!response.ok) throw new Error("Failed to review check-in");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Review submitted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/checkins/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkins/review-status"] });
      setReviewModal(null);
      setReviewComment("");
      setResponseComments({});
      setAddToOneOnOne(false);
      setFlagForFollowUp(false);
    },
    onError: () => {
      toast({ 
        title: "Failed to submit review", 
        variant: "destructive" 
      });
    }
  });

  // Send reminder mutation
  const sendReminderMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      const response = await apiRequest("POST", "/api/checkins/send-reminder", { userIds });
      if (!response.ok) throw new Error("Failed to send reminders");
      return response.json();
    },
    onSuccess: (data, userIds) => {
      toast({ 
        title: `Reminder${userIds.length > 1 ? 's' : ''} sent successfully`,
        description: `Sent to ${userIds.length} user${userIds.length > 1 ? 's' : ''}`
      });
      
      userIds.forEach(id => remindersSent.add(id));
      setRemindersSent(new Set(remindersSent));
      setSelectedReminders(new Set());
      setSendingReminder(null);
      setShowBulkReminderDialog(false);
    },
    onError: (error) => {
      toast({ 
        title: "Failed to send reminders", 
        description: error.message,
        variant: "destructive" 
      });
      setSendingReminder(null);
    }
  });

  // Export to CSV function
  const exportToCSV = () => {
    const csvData = filteredTeamData.flatMap(team => 
      team.members.map(member => ({
        Team: team.teamName,
        Name: member.userName,
        Email: member.email,
        Status: member.status,
        'Submission Time': member.submittedAt ? format(new Date(member.submittedAt), 'MMM dd, yyyy h:mm a') : '',
        'Days Overdue': member.daysOverdue || '',
        'Mood Rating': member.moodRating || '',
        'Compliance Rate': `${member.compliance.rate}%`,
        'Streak': member.compliance.streak,
        'On-Time Rate': `${member.compliance.onTimeRate}%`,
        'Recent Compliance': member.compliance.recentText
      }))
    );
    
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-report-${format(viewingWeekFriday, 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Reviews & Compliance</h1>
          <p className="text-muted-foreground mt-1">Monitor team check-in compliance and review submissions</p>
        </div>
        
        {/* Export button */}
        <Button 
          onClick={exportToCSV} 
          variant="outline"
          data-testid="button-export"
        >
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Organization Summary Dashboard (Admin only) */}
      {currentUser?.role === 'admin' && orgSummary && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle>Organization Compliance Dashboard</CardTitle>
              </div>
              <Badge variant="outline" className="text-lg px-3 py-1">
                Week of {format(viewingWeekFriday, 'MMM dd, yyyy')}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {/* Overall metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className={cn(getComplianceBackground(orgSummary.overall.submissionRate), "border")}>
                <CardHeader className="pb-2">
                  <CardDescription>Overall Submission Rate</CardDescription>
                  <div className="flex items-center justify-between">
                    <CardTitle className={cn("text-3xl", getComplianceColor(orgSummary.overall.submissionRate))}>
                      {orgSummary.overall.submissionRate}%
                    </CardTitle>
                    <Target className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <Progress value={orgSummary.overall.submissionRate} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {orgSummary.overall.submitted} of {orgSummary.overall.expected} submitted
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Active Users</CardDescription>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-3xl">{orgSummary.overall.totalActive}</CardTitle>
                    <Users className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <p className="text-xs text-muted-foreground">
                    {orgSummary.overall.onVacation} on vacation
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800">
                <CardHeader className="pb-2">
                  <CardDescription>Top Performing Team</CardDescription>
                  {orgSummary.teams.topPerforming[0] && (
                    <>
                      <CardTitle className="text-lg">{orgSummary.teams.topPerforming[0].teamName}</CardTitle>
                      <Badge className={cn("w-fit", getComplianceBadgeColor(orgSummary.teams.topPerforming[0].submissionRate))}>
                        <Award className="mr-1 h-3 w-3" />
                        {orgSummary.teams.topPerforming[0].submissionRate}% compliance
                      </Badge>
                    </>
                  )}
                </CardHeader>
              </Card>
              
              <Card className={orgSummary.teams.needingAttention.length > 0 ? "bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 border-red-200 dark:border-red-800" : ""}>
                <CardHeader className="pb-2">
                  <CardDescription>Teams Needing Attention</CardDescription>
                  <CardTitle className="text-3xl text-red-600 dark:text-red-400">
                    {orgSummary.teams.needingAttention.length}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  <p className="text-xs text-muted-foreground">
                    Below 50% compliance
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Team breakdown */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Team Performance Overview
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {orgSummary.teams.all.map(team => {
                  const teamHistorical = teamMetrics.find(m => m.teamId === team.teamId);
                  const sparklineData = teamHistorical?.historical.map(h => h.submissionRate) || [];
                  
                  return (
                    <div key={team.teamId} className="flex items-center justify-between p-3 border rounded-lg hover:shadow-md transition-shadow">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{team.teamName}</p>
                        <p className="text-xs text-muted-foreground">
                          {team.submitted}/{team.expected} submitted ({team.members} members)
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {sparklineData.length > 0 && (
                          <Sparkline data={sparklineData} color={getComplianceColor(team.submissionRate).includes('green') ? '#10b981' : getComplianceColor(team.submissionRate).includes('yellow') ? '#f59e0b' : '#ef4444'} />
                        )}
                        <div className="text-right">
                          <Badge variant="outline" className={cn(getComplianceBadgeColor(team.submissionRate))}>
                            {team.submissionRate}%
                          </Badge>
                          <Progress value={team.submissionRate} className="w-20 h-2 mt-1" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top performers and those needing attention */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Award className="h-4 w-4 text-green-600" />
                    Top Performers
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {orgSummary.individuals.topPerformers.slice(0, 5).map((person, index) => (
                    <div key={person.userId} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                      <span className="text-sm flex items-center gap-2">
                        {index === 0 && <span className="text-lg">🥇</span>}
                        {index === 1 && <span className="text-lg">🥈</span>}
                        {index === 2 && <span className="text-lg">🥉</span>}
                        {person.userName}
                      </span>
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        <Zap className="mr-1 h-3 w-3" />
                        {person.complianceRate}%
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    Needs Attention
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {orgSummary.individuals.needingAttention.slice(0, 5).map(person => (
                    <div key={person.userId} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                      <span className="text-sm">{person.userName}</span>
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                        {person.complianceRate}%
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs defaultValue="team-status" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="team-status" data-testid="tab-team-status">
            <Users className="mr-2 h-4 w-4" />
            Team Compliance
          </TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending">
            <Clock className="mr-2 h-4 w-4" />
            Pending Reviews
            {pendingCheckins.length > 0 && (
              <Badge className="ml-2" variant="destructive">
                {pendingCheckins.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reviewed" data-testid="tab-reviewed">
            <CheckCircle className="mr-2 h-4 w-4" />
            Recently Reviewed
          </TabsTrigger>
        </TabsList>

        {/* Team Compliance Tab */}
        <TabsContent value="team-status" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="flex items-center gap-4">
                  <CardTitle>Team Check-in Compliance</CardTitle>
                  
                  {/* View mode toggle for admins */}
                  {currentUser?.role === 'admin' && (
                    <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                      <Label htmlFor="view-mode" className="text-sm font-medium">View:</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          variant={viewMode === 'all' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setViewMode('all')}
                        >
                          All Teams
                        </Button>
                        <Button
                          variant={viewMode === 'my-team' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setViewMode('my-team')}
                        >
                          My Team
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Week navigation */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedWeek(selectedWeek - 1)}
                    data-testid="button-prev-week"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <div className="px-3 py-1 border rounded-md min-w-[200px] text-center">
                    <p className="text-sm font-medium">
                      {format(viewingWeekStart, 'MMM dd')} - {format(viewingWeekEnd, 'MMM dd, yyyy')}
                    </p>
                    {selectedWeek === 0 && (
                      <Badge variant="default" className="mt-1">Current Week</Badge>
                    )}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedWeek(selectedWeek + 1)}
                    disabled={selectedWeek >= 0}
                    data-testid="button-next-week"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  
                  {/* Expand/Collapse all */}
                  <div className="flex gap-1 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleAllTeams(true)}
                      data-testid="button-expand-all"
                    >
                      Expand All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleAllTeams(false)}
                      data-testid="button-collapse-all"
                    >
                      Collapse All
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            
            <CardContent>
              {complianceLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : filteredTeamData.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-gray-500">No team data available</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredTeamData.map((team) => {
                    const isExpanded = expandedTeams.has(team.teamId);
                    const hasIssues = team.metrics.submissionRate < 50;
                    const teamHistorical = teamMetrics.find(m => m.teamId === team.teamId);
                    const sparklineData = teamHistorical?.historical.map(h => h.submissionRate) || [];
                    const previousWeekRate = sparklineData.length > 1 ? sparklineData[1] : sparklineData[0];
                    
                    return (
                      <Card key={team.teamId} className={cn(
                        "transition-all overflow-hidden",
                        hasIssues && "border-orange-500 dark:border-orange-700"
                      )}>
                        <Collapsible open={isExpanded} onOpenChange={() => toggleTeamExpansion(team.teamId)}>
                          <CollapsibleTrigger className="w-full" data-testid={`team-header-${team.teamId}`}>
                            <div className={cn(
                              "p-4 cursor-pointer hover:bg-muted/50 transition-colors",
                              hasIssues && "bg-orange-50 dark:bg-orange-950/30"
                            )}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {isExpanded ? (
                                    <ChevronUp className="h-5 w-5" />
                                  ) : (
                                    <ChevronDown className="h-5 w-5" />
                                  )}
                                  
                                  <div className="flex items-center gap-3">
                                    <h3 className="font-semibold text-lg flex items-center gap-2">
                                      {team.teamName}
                                      {team.metrics.submissionRate >= 90 && <span>⭐</span>}
                                    </h3>
                                    <Badge variant="outline" className="font-normal">
                                      {team.metrics.submitted}/{team.metrics.expected} members
                                    </Badge>
                                    {team.metrics.onVacation > 0 && (
                                      <Badge variant="secondary">
                                        <Plane className="mr-1 h-3 w-3" />
                                        {team.metrics.onVacation} on vacation
                                      </Badge>
                                    )}
                                    {hasIssues && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger>
                                            <Badge variant="destructive">
                                              <AlertTriangle className="mr-1 h-3 w-3" />
                                              Needs Attention
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Submission rate below 50%</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-6">
                                  {/* Historical sparkline */}
                                  {sparklineData.length > 0 && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">4 weeks:</span>
                                      <Sparkline 
                                        data={sparklineData} 
                                        color={getComplianceColor(team.metrics.submissionRate).includes('green') ? '#10b981' : getComplianceColor(team.metrics.submissionRate).includes('yellow') ? '#f59e0b' : '#ef4444'} 
                                      />
                                    </div>
                                  )}
                                  
                                  {/* Team metrics summary */}
                                  <div className="flex items-center gap-4 text-sm">
                                    <div className="text-right">
                                      <p className="text-muted-foreground">Submission</p>
                                      <div className="flex items-center gap-1">
                                        <p className={cn("font-semibold text-lg", getComplianceColor(team.metrics.submissionRate))}>
                                          {team.metrics.submissionRate}%
                                        </p>
                                        {sparklineData.length > 1 && (
                                          <TrendArrow current={team.metrics.submissionRate} previous={previousWeekRate} />
                                        )}
                                      </div>
                                    </div>
                                    
                                    <div className="text-right">
                                      <p className="text-muted-foreground">On-Time</p>
                                      <p className={cn("font-semibold text-lg", getComplianceColor(team.metrics.onTimeRate))}>
                                        {team.metrics.onTimeRate}%
                                      </p>
                                    </div>
                                    
                                    {team.metrics.averageMood !== null && (
                                      <div className="text-right">
                                        <p className="text-muted-foreground">Mood</p>
                                        <div className="flex items-center justify-end">
                                          <RatingStars rating={team.metrics.averageMood} size="sm" />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  
                                  <Progress 
                                    value={team.metrics.submissionRate} 
                                    className="w-24 h-3"
                                  />
                                </div>
                              </div>
                              
                              {/* Team summary stats */}
                              {teamHistorical && (
                                <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {teamHistorical.memberBreakdown.total} members
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <CheckCircle className="h-3 w-3 text-green-600" />
                                    {teamHistorical.memberBreakdown.consistent} consistent
                                  </span>
                                  {teamHistorical.memberBreakdown.struggling > 0 && (
                                    <span className="flex items-center gap-1">
                                      <AlertCircle className="h-3 w-3 text-orange-600" />
                                      {teamHistorical.memberBreakdown.struggling} struggling
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent>
                            <Separator />
                            <div className="p-4 bg-muted/20">
                              <div className="space-y-2">
                                {team.members.map((member) => (
                                  <div 
                                    key={member.userId} 
                                    className={cn(
                                      "flex items-center justify-between p-3 rounded-lg transition-all",
                                      "bg-background border hover:shadow-sm",
                                      member.status === 'overdue' && "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20",
                                      member.status === 'submitted' && "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20"
                                    )}
                                    data-testid={`member-row-${member.userId}`}
                                  >
                                    <div className="flex items-center gap-3 flex-1">
                                      <Checkbox 
                                        checked={selectedReminders.has(member.userId)}
                                        onCheckedChange={(checked) => {
                                          const newSet = new Set(selectedReminders);
                                          if (checked) {
                                            newSet.add(member.userId);
                                          } else {
                                            newSet.delete(member.userId);
                                          }
                                          setSelectedReminders(newSet);
                                        }}
                                        disabled={member.status === 'submitted' || member.status === 'on-vacation' || remindersSent.has(member.userId)}
                                      />
                                      
                                      <Avatar className="h-8 w-8">
                                        <AvatarFallback className={cn(
                                          member.compliance.rate >= 80 && "bg-green-100 text-green-800",
                                          member.compliance.rate < 50 && "bg-red-100 text-red-800"
                                        )}>
                                          {member.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                      
                                      <div className="flex-1">
                                        <p className="font-medium flex items-center gap-2">
                                          {member.userName}
                                          {member.compliance.streak >= 5 && (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger>
                                                  <Badge variant="outline" className="text-xs">
                                                    <Sparkles className="mr-1 h-3 w-3 text-yellow-500" />
                                                    {member.compliance.streak} week streak
                                                  </Badge>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p>Submitted {member.compliance.streak} weeks in a row!</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          )}
                                        </p>
                                        <p className="text-sm text-muted-foreground">{member.email}</p>
                                      </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-3">
                                      {/* Status badge */}
                                      <Badge variant={getStatusBadgeVariant(member.status)}>
                                        {member.status === 'submitted' && <CheckCircle className="mr-1 h-3 w-3" />}
                                        {member.status === 'overdue' && <AlertCircle className="mr-1 h-3 w-3" />}
                                        {member.status === 'on-vacation' && <Plane className="mr-1 h-3 w-3" />}
                                        {member.status === 'missing' && <Clock className="mr-1 h-3 w-3" />}
                                        {member.status}
                                        {member.daysOverdue && member.daysOverdue > 0 && (
                                          <span className="ml-1 text-xs">({member.daysOverdue}d)</span>
                                        )}
                                      </Badge>
                                      
                                      {/* Submission details */}
                                      {member.submittedAt && (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger>
                                              <p className="text-sm text-muted-foreground">
                                                {format(new Date(member.submittedAt), 'h:mm a')}
                                              </p>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>{format(new Date(member.submittedAt), 'MMM dd, yyyy h:mm a')}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                      
                                      {/* Mood rating */}
                                      {member.moodRating !== null && member.moodRating !== undefined && (
                                        <RatingStars rating={member.moodRating} size="sm" />
                                      )}
                                      
                                      {/* Compliance metrics */}
                                      <div className="flex items-center gap-3 text-sm">
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger>
                                              <div className="text-center cursor-help">
                                                <p className="text-muted-foreground text-xs">Compliance</p>
                                                <p className={cn("font-semibold", getComplianceColor(member.compliance.rate))}>
                                                  {member.compliance.rate}%
                                                </p>
                                              </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>{member.compliance.totalSubmitted} of {member.compliance.totalExpected} expected check-ins</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                        
                                        <div className="text-center">
                                          <p className="text-muted-foreground text-xs">On-Time</p>
                                          <p className={cn("font-semibold", getComplianceColor(member.compliance.onTimeRate))}>
                                            {member.compliance.onTimeRate}%
                                          </p>
                                        </div>
                                      </div>
                                      
                                      {/* Recent compliance text */}
                                      <Badge variant="outline" className="text-xs">
                                        {member.compliance.recentText}
                                      </Badge>
                                      
                                      {/* Individual reminder button */}
                                      {(member.status === 'missing' || member.status === 'overdue') && 
                                       !remindersSent.has(member.userId) && (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                  setSendingReminder(member.userId);
                                                  sendReminderMutation.mutate([member.userId]);
                                                }}
                                                disabled={sendingReminder === member.userId}
                                                data-testid={`button-remind-${member.userId}`}
                                              >
                                                {sendingReminder === member.userId ? (
                                                  <Clock className="h-4 w-4 animate-spin" />
                                                ) : (
                                                  <Bell className="h-4 w-4" />
                                                )}
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>Send reminder</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                      
                                      {remindersSent.has(member.userId) && (
                                        <Badge variant="secondary" className="text-xs">
                                          <CheckCheck className="mr-1 h-3 w-3" />
                                          Reminded
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              
                              {/* Bulk reminder button for team */}
                              {selectedReminders.size > 0 && (
                                <div className="mt-4 flex justify-end">
                                  <Button
                                    onClick={() => setShowBulkReminderDialog(true)}
                                    disabled={selectedReminders.size === 0}
                                    data-testid="button-bulk-remind"
                                  >
                                    <Bell className="mr-2 h-4 w-4" />
                                    Send Reminders ({selectedReminders.size})
                                  </Button>
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pending Reviews Tab */}
        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Check-in Reviews</CardTitle>
              <CardDescription>
                Review and provide feedback on submitted check-ins
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : pendingCheckins.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                  <p className="mt-2 text-gray-500">All check-ins have been reviewed!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingCheckins.map((checkin) => (
                    <div key={checkin.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {checkin.user?.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{checkin.user?.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {checkin.user?.teamName || "No team"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Submitted {formatDistanceToNow(new Date(checkin.submittedAt))} ago
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {checkin.overallMood && (
                            <RatingStars rating={checkin.overallMood} size="sm" />
                          )}
                          
                          <Button
                            onClick={() => setReviewModal({ checkin })}
                            data-testid={`button-review-${checkin.id}`}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Review
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recently Reviewed Tab */}
        <TabsContent value="reviewed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recently Reviewed</CardTitle>
              <CardDescription>
                Check-ins you've reviewed in the past week
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reviewedLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : reviewedCheckins.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-gray-500">No recently reviewed check-ins</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reviewedCheckins.map((checkin) => (
                    <div key={checkin.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {checkin.user?.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{checkin.user?.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {checkin.user?.teamName || "No team"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Reviewed {checkin.reviewedAt && formatDistanceToNow(new Date(checkin.reviewedAt))} ago
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary">
                            <CheckCheck className="mr-1 h-3 w-3" />
                            Reviewed
                          </Badge>
                          {checkin.flagForFollowUp && (
                            <Badge variant="destructive">
                              Follow-up needed
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {checkin.reviewComments && (
                        <div className="mt-3 p-3 bg-muted rounded-md">
                          <p className="text-sm font-medium mb-1">Review comments:</p>
                          <p className="text-sm text-muted-foreground">{checkin.reviewComments}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Modal */}
      {reviewModal && (
        <AlertDialog open={!!reviewModal} onOpenChange={(open) => !open && setReviewModal(null)}>
          <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>Review Check-in</AlertDialogTitle>
              <AlertDialogDescription>
                Review {reviewModal.checkin.user?.name}'s check-in for week of{' '}
                {format(new Date(reviewModal.checkin.weekStartDate), 'MMM dd, yyyy')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Check-in content would go here */}
              <div className="space-y-3">
                <div>
                  <Label>Overall Review Comments</Label>
                  <textarea
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    className="w-full min-h-[100px] p-2 border rounded-md"
                    placeholder="Add your review comments..."
                  />
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="add-one-on-one"
                      checked={addToOneOnOne}
                      onCheckedChange={(checked) => setAddToOneOnOne(checked as boolean)}
                    />
                    <Label htmlFor="add-one-on-one">Add to 1:1 agenda</Label>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="flag-follow-up"
                      checked={flagForFollowUp}
                      onCheckedChange={(checked) => setFlagForFollowUp(checked as boolean)}
                    />
                    <Label htmlFor="flag-follow-up">Flag for follow-up</Label>
                  </div>
                </div>
              </div>
            </div>
            
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (reviewModal) {
                    reviewMutation.mutate({
                      checkinId: reviewModal.checkin.id,
                      reviewData: {
                        reviewStatus: 'reviewed',
                        reviewComments: reviewComment,
                        responseComments,
                        addToOneOnOne,
                        flagForFollowUp
                      }
                    });
                  }
                }}
              >
                Submit Review
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Bulk Reminder Confirmation Dialog */}
      <AlertDialog open={showBulkReminderDialog} onOpenChange={setShowBulkReminderDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Reminders</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to send reminders to {selectedReminders.size} team member{selectedReminders.size > 1 ? 's' : ''}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                sendReminderMutation.mutate(Array.from(selectedReminders));
              }}
            >
              Send Reminders
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}