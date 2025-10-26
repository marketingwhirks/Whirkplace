import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek, subWeeks, formatDistance } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiRequest } from "@/lib/queryClient";
import RatingStars from "@/components/checkin/rating-stars";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Download, 
  Users, 
  TrendingUp,
  TrendingDown,
  Heart,
  FileSpreadsheet,
  Filter,
  Eye,
  Building,
  UserCheck,
  Calendar,
  Activity
} from "lucide-react";
import type { Checkin, User as UserType, Team, ComplianceMetricsResult } from "@shared/schema";
import Papa from "papaparse";

interface EnhancedCheckin extends Checkin {
  user?: {
    id: string;
    name: string;
    email: string;
    teamId: string | null;
    teamName?: string | null;
  };
  reviewer?: {
    id: string;
    name: string;
    email: string;
  };
}

interface MoodTrendData {
  week: string;
  averageMood: number;
  submissions: number;
}

interface TeamComplianceData {
  teamId: string;
  teamName: string;
  submissionRate: number;
  pendingReviews: number;
  averageMood: number;
  totalMembers: number;
  submittedCount: number;
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [viewScope, setViewScope] = useState<"direct" | "all">("all");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [dateRange, setDateRange] = useState<number>(8); // weeks

  // Check if user has admin access
  const hasAccess = currentUser && (currentUser.role === "admin" || currentUser.role === "super_admin");

  // Fetch all check-ins
  const { data: allCheckins = [], isLoading: checkinsLoading } = useQuery<EnhancedCheckin[]>({
    queryKey: ["/api/checkins", { limit: 1000 }],
    enabled: !!hasAccess,
  });

  // Fetch pending check-ins
  const { data: pendingCheckins = [], isLoading: pendingLoading } = useQuery<EnhancedCheckin[]>({
    queryKey: ["/api/checkins/pending"],
    enabled: !!hasAccess,
  });

  // Fetch missing check-ins
  const { data: missingCheckins = [], isLoading: missingLoading } = useQuery<any[]>({
    queryKey: ["/api/checkins/missing"],
    enabled: !!hasAccess,
  });

  // Fetch teams
  const { data: teams = [], isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
    enabled: !!hasAccess,
  });

  // Fetch users
  const { data: users = [], isLoading: usersLoading } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    enabled: !!hasAccess,
  });

  // Fetch compliance metrics
  const { data: complianceData } = useQuery<ComplianceMetricsResult>({
    queryKey: ["/api/analytics/compliance", { scope: "organization" }],
    enabled: !!hasAccess,
  });

  // Filter check-ins based on view scope and selected team
  const filteredCheckins = useMemo(() => {
    let filtered = allCheckins;

    // Filter by view scope (direct reports vs all)
    if (viewScope === "direct" && currentUser) {
      const directReportIds = users
        .filter((u: UserType) => u.managerId === currentUser.id)
        .map((u: UserType) => u.id);
      filtered = filtered.filter((c: EnhancedCheckin) => c.user && directReportIds.includes(c.user.id));
    }

    // Filter by team
    if (selectedTeam !== "all") {
      filtered = filtered.filter((c: EnhancedCheckin) => {
        const user = users.find((u: UserType) => u.id === c.userId);
        return user?.teamId === selectedTeam;
      });
    }

    return filtered;
  }, [allCheckins, viewScope, selectedTeam, currentUser, users]);

  // Calculate overview statistics
  const stats = useMemo(() => {
    const totalSubmitted = filteredCheckins.length;
    const pendingCount = pendingCheckins.filter((c: EnhancedCheckin) => {
      if (selectedTeam !== "all") {
        const user = users.find((u: UserType) => u.id === c.userId);
        return user?.teamId === selectedTeam;
      }
      return true;
    }).length;

    const averageMood = filteredCheckins.length > 0
      ? filteredCheckins.reduce((sum: number, c: EnhancedCheckin) => sum + (c.overallMood || 0), 0) / filteredCheckins.length
      : 0;

    const totalExpected = users.filter((u: UserType) => {
      if (viewScope === "direct" && currentUser) {
        return u.managerId === currentUser.id;
      }
      if (selectedTeam !== "all") {
        return u.teamId === selectedTeam;
      }
      return true;
    }).length;

    const complianceRate = totalExpected > 0 
      ? ((totalSubmitted / (totalExpected * dateRange)) * 100)
      : 0;

    return {
      totalSubmitted,
      pendingCount,
      averageMood: averageMood.toFixed(1),
      complianceRate: Math.min(100, complianceRate).toFixed(1),
      missingCount: missingCheckins.length,
    };
  }, [filteredCheckins, pendingCheckins, users, viewScope, selectedTeam, currentUser, dateRange, missingCheckins]);

  // Calculate weekly mood trends
  const moodTrends = useMemo((): MoodTrendData[] => {
    const trends: MoodTrendData[] = [];
    const now = new Date();

    for (let i = dateRange - 1; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(now, i));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const weekCheckins = filteredCheckins.filter((c: EnhancedCheckin) => {
        const checkinDate = new Date(c.createdAt);
        return checkinDate >= weekStart && checkinDate < weekEnd;
      });

      const avgMood = weekCheckins.length > 0
        ? weekCheckins.reduce((sum: number, c: EnhancedCheckin) => sum + (c.overallMood || 0), 0) / weekCheckins.length
        : 0;

      trends.push({
        week: format(weekStart, "MMM d"),
        averageMood: parseFloat(avgMood.toFixed(2)),
        submissions: weekCheckins.length,
      });
    }

    return trends;
  }, [filteredCheckins, dateRange]);

  // Calculate team compliance data
  const teamCompliance = useMemo((): TeamComplianceData[] => {
    return teams.map((team: Team) => {
      const teamUsers = users.filter((u: UserType) => u.teamId === team.id);
      const teamCheckins = allCheckins.filter((c: EnhancedCheckin) => {
        const user = users.find((u: UserType) => u.id === c.userId);
        return user?.teamId === team.id;
      });

      const teamPending = pendingCheckins.filter((c: EnhancedCheckin) => {
        const user = users.find((u: UserType) => u.id === c.userId);
        return user?.teamId === team.id;
      });

      const avgMood = teamCheckins.length > 0
        ? teamCheckins.reduce((sum: number, c: EnhancedCheckin) => sum + (c.overallMood || 0), 0) / teamCheckins.length
        : 0;

      const expectedSubmissions = teamUsers.length * dateRange;
      const submissionRate = expectedSubmissions > 0
        ? (teamCheckins.length / expectedSubmissions) * 100
        : 0;

      return {
        teamId: team.id,
        teamName: team.name,
        submissionRate: Math.min(100, submissionRate),
        pendingReviews: teamPending.length,
        averageMood: avgMood,
        totalMembers: teamUsers.length,
        submittedCount: teamCheckins.length,
      };
    }).sort((a: TeamComplianceData, b: TeamComplianceData) => b.submissionRate - a.submissionRate);
  }, [teams, users, allCheckins, pendingCheckins, dateRange]);

  // Get recent check-ins for table
  const recentCheckins = useMemo(() => {
    return filteredCheckins
      .sort((a: EnhancedCheckin, b: EnhancedCheckin) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
  }, [filteredCheckins]);

  // Export to CSV function
  const exportToCSV = (type: "all" | "pending" | "compliance") => {
    let data: any[] = [];
    let filename = "";

    switch (type) {
      case "all":
        data = filteredCheckins.map((c: EnhancedCheckin) => ({
          "User": c.user?.name || "Unknown",
          "Email": c.user?.email || "",
          "Team": c.user?.teamName || "No Team",
          "Mood Rating": c.overallMood,
          "Submission Date": format(new Date(c.createdAt), "yyyy-MM-dd HH:mm"),
          "Review Status": c.reviewStatus || "pending",
          "Reviewed By": c.reviewer?.name || "Not reviewed",
          "Review Comments": c.reviewComments || "",
        }));
        filename = `checkins_${format(new Date(), "yyyy-MM-dd")}.csv`;
        break;

      case "pending":
        data = pendingCheckins.map((c: EnhancedCheckin) => ({
          "User": c.user?.name || "Unknown",
          "Email": c.user?.email || "",
          "Team": c.user?.teamName || "No Team",
          "Mood Rating": c.overallMood,
          "Submission Date": format(new Date(c.createdAt), "yyyy-MM-dd HH:mm"),
          "Days Pending": formatDistance(new Date(c.createdAt), new Date()),
        }));
        filename = `pending_reviews_${format(new Date(), "yyyy-MM-dd")}.csv`;
        break;

      case "compliance":
        data = teamCompliance.map((tc: TeamComplianceData) => ({
          "Team": tc.teamName,
          "Total Members": tc.totalMembers,
          "Submissions": tc.submittedCount,
          "Submission Rate": `${tc.submissionRate.toFixed(1)}%`,
          "Average Mood": tc.averageMood.toFixed(1),
          "Pending Reviews": tc.pendingReviews,
        }));
        filename = `team_compliance_${format(new Date(), "yyyy-MM-dd")}.csv`;
        break;
    }

    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export successful",
      description: `Downloaded ${filename}`,
    });
  };

  // Get color for compliance rate
  const getComplianceColor = (rate: number) => {
    if (rate >= 80) return "#10b981"; // green
    if (rate >= 60) return "#f59e0b"; // yellow
    return "#ef4444"; // red
  };

  // Show loading state
  if (userLoading || checkinsLoading || teamsLoading || usersLoading) {
    return (
      <main className="flex-1 overflow-auto p-6 space-y-6">
        <div className="space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </main>
    );
  }

  // Check access
  if (!hasAccess) {
    return (
      <main className="flex-1 overflow-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
            <p className="text-muted-foreground">
              You need admin or super admin privileges to access the admin dashboard.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Organization-wide check-in analytics and insights</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => exportToCSV("all")}
            data-testid="button-export-all"
          >
            <Download className="w-4 h-4 mr-2" />
            Export All
          </Button>
          <Button
            variant="outline"
            onClick={() => exportToCSV("compliance")}
            data-testid="button-export-compliance"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export Compliance
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <Tabs value={viewScope} onValueChange={(v) => setViewScope(v as "direct" | "all")}>
              <TabsList data-testid="tabs-view-scope">
                <TabsTrigger value="all" data-testid="tab-all-organization">
                  <Building className="w-4 h-4 mr-2" />
                  All Organization
                </TabsTrigger>
                <TabsTrigger value="direct" data-testid="tab-direct-reports">
                  <Users className="w-4 h-4 mr-2" />
                  My Direct Reports
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger className="w-48" data-testid="select-team-filter">
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="select-item-all-teams">All Teams</SelectItem>
                {teams.map((team: Team) => (
                  <SelectItem 
                    key={team.id} 
                    value={team.id}
                    data-testid={`select-item-team-${team.id}`}
                  >
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Overview Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Total Check-ins</p>
                <p className="text-2xl font-bold" data-testid="text-total-checkins">
                  {stats.totalSubmitted}
                </p>
                <p className="text-xs text-muted-foreground">Last {dateRange} weeks</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Pending Reviews</p>
                <p className="text-2xl font-bold text-orange-600" data-testid="text-pending-reviews">
                  {stats.pendingCount}
                </p>
                <p className="text-xs text-muted-foreground">Awaiting review</p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Average Mood</p>
                <p className="text-2xl font-bold" data-testid="text-average-mood">
                  {stats.averageMood}
                </p>
                <div className="mt-1">
                  <RatingStars rating={parseFloat(stats.averageMood)} size="sm" />
                </div>
              </div>
              <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
                <Heart className="w-6 h-6 text-pink-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Compliance Rate</p>
                <p className="text-2xl font-bold" data-testid="text-compliance-rate">
                  {stats.complianceRate}%
                </p>
                <p className="text-xs text-muted-foreground">Submission rate</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <UserCheck className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Missing Check-ins</p>
                <p className="text-2xl font-bold text-red-600" data-testid="text-missing-checkins">
                  {stats.missingCount}
                </p>
                <p className="text-xs text-muted-foreground">Users without check-ins</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Mood Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Mood Trends</CardTitle>
            <CardDescription>Average mood rating over the past {dateRange} weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={moodTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload[0]) {
                      return (
                        <div className="bg-background border rounded p-2">
                          <p className="font-medium">{payload[0].payload.week}</p>
                          <p className="text-sm">Mood: {payload[0].value}</p>
                          <p className="text-sm text-muted-foreground">
                            {payload[0].payload.submissions} submissions
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="averageMood" 
                  stroke="#ec4899" 
                  strokeWidth={2}
                  dot={{ fill: "#ec4899", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Team Compliance Heatmap */}
        <Card>
          <CardHeader>
            <CardTitle>Team Compliance Heatmap</CardTitle>
            <CardDescription>Submission rates by team</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={teamCompliance} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis dataKey="teamName" type="category" width={100} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload[0]) {
                      const data = payload[0].payload as TeamComplianceData;
                      return (
                        <div className="bg-background border rounded p-2">
                          <p className="font-medium">{data.teamName}</p>
                          <p className="text-sm">Rate: {data.submissionRate.toFixed(1)}%</p>
                          <p className="text-sm">{data.submittedCount}/{data.totalMembers * dateRange} check-ins</p>
                          <p className="text-sm">Avg Mood: {data.averageMood.toFixed(1)}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="submissionRate">
                  {teamCompliance.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getComplianceColor(entry.submissionRate)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Check-ins Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Check-ins</CardTitle>
              <CardDescription>Latest check-in submissions across the organization</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV("pending")}
              data-testid="button-export-pending"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Pending
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Mood</TableHead>
                  <TableHead>Submission Date</TableHead>
                  <TableHead>Review Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentCheckins.map((checkin: EnhancedCheckin) => (
                  <TableRow key={checkin.id} data-testid={`row-checkin-${checkin.id}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{checkin.user?.name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{checkin.user?.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {checkin.user?.teamName || "No Team"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{checkin.overallMood}</span>
                        <RatingStars rating={checkin.overallMood || 0} size="sm" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p>{format(new Date(checkin.createdAt), "MMM d, yyyy")}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(checkin.createdAt), "h:mm a")}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={checkin.reviewStatus === "reviewed" ? "default" : "secondary"}
                        className={checkin.reviewStatus === "pending" ? "bg-orange-100 text-orange-800" : ""}
                      >
                        {checkin.reviewStatus === "reviewed" ? (
                          <CheckCircle className="w-3 h-3 mr-1" />
                        ) : (
                          <Clock className="w-3 h-3 mr-1" />
                        )}
                        {checkin.reviewStatus || "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        data-testid={`button-view-${checkin.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {recentCheckins.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No check-ins found for the selected filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </main>
  );
}