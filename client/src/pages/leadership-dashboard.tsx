import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow, format, subDays, startOfWeek, endOfWeek } from "date-fns";
import {
  TrendingUp, TrendingDown, Clock, CheckCircle, XCircle, Users, Filter,
  Download, Calendar, BarChart3, PieChart, Eye, MessageSquare, Target, Timer, FileText,
  AlertCircle, AlertTriangle, UserX, ClipboardList, Send, Flame
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
// import { DatePickerWithRange } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import RatingStars from "@/components/checkin/rating-stars";
import type { Checkin, User as UserType, Team, Question, ComplianceMetricsResult } from "@shared/schema";
import { DateRange } from "react-day-picker";
import { LeadershipSummary } from "@/components/analytics/LeadershipSummary";
import { Link } from "wouter";

interface EnhancedCheckinLeadership extends Checkin {
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
    teamId: string | null;
    teamName: string | null;
    managerId: string | null;
  };
  team?: {
    id: string;
    name: string;
    description: string | null;
  };
  reviewer?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

interface AnalyticsMetrics {
  totalCheckins: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  avgReviewTime: number;
  avgMoodRating: number;
  completionRate: number;
  teamBreakdown: Record<string, {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    avgMood: number;
  }>;
}

interface ComplianceMetrics {
  checkinCompliance: {
    totalCount: number;
    onTimeCount: number;
    onTimePercentage: number;
    averageDaysEarly?: number;
    averageDaysLate?: number;
  };
  reviewCompliance: {
    totalCount: number;
    onTimeCount: number;
    onTimePercentage: number;
    averageDaysEarly?: number;
    averageDaysLate?: number;
  };
}

export default function LeadershipDashboard() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const { toast } = useToast();
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCheckin, setSelectedCheckin] = useState<EnhancedCheckinLeadership | null>(null);
  const [showOrgSummary, setShowOrgSummary] = useState(false);

  // CSV Export function for missing check-ins
  const exportMissingCheckinsToCSV = () => {
    if (!missingCheckins || missingCheckins.length === 0) return;
    
    // Prepare CSV data
    const csvRows = [];
    csvRows.push(['Name', 'Email', 'Team', 'Manager', 'Week Of', 'Due Date', 'Days Overdue', 'Missed Streak (Weeks)']);
    
    missingCheckins.forEach(weekData => {
      weekData.users.forEach(user => {
        csvRows.push([
          user.name,
          user.email,
          user.teamName || 'No Team',
          user.managerName || 'No Manager',
          format(new Date(weekData.weekOf), 'MMM d, yyyy'),
          format(new Date(user.dueDate), 'MMM d, yyyy'),
          user.daysOverdue.toString(),
          (user.missedStreak || 1).toString()
        ]);
      });
    });
    
    // Convert to CSV string
    const csvContent = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `missing-checkins-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    toast({
      title: "Export Successful",
      description: "Missing check-ins data has been exported to CSV",
    });
  };

  // Reminder mutations
  const missingCheckinReminderMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      return apiRequest('/api/slack/remind-missing-checkins', {
        method: 'POST',
        body: JSON.stringify({ userIds }),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Reminders Sent",
        description: data.message || `Successfully sent ${data.remindersSent} reminder(s)`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send reminders. Please try again.",
        variant: "destructive",
      });
    },
  });

  const pendingReviewReminderMutation = useMutation({
    mutationFn: async (managerIds: string[]) => {
      return apiRequest('/api/slack/remind-pending-reviews', {
        method: 'POST',
        body: JSON.stringify({ managerIds }),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Reminders Sent",
        description: data.message || `Successfully sent ${data.remindersSent} reminder(s)`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send reminders. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Build query parameters
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedStatus !== "all") params.append("status", selectedStatus);
    if (selectedTeam !== "all") params.append("teamId", selectedTeam);
    if (dateRange?.from) params.append("from", dateRange.from.toISOString());
    if (dateRange?.to) params.append("to", dateRange.to.toISOString());
    params.append("limit", "1000");
    return params.toString();
  }, [selectedStatus, selectedTeam, dateRange]);

  // Fetch leadership view data
  const { data: checkins = [], isLoading: checkinsLoading, error: checkinsError } = useQuery<EnhancedCheckinLeadership[]>({
    queryKey: ["/api/checkins/leadership-view", queryParams],
    queryFn: () => fetch(`/api/checkins/leadership-view?${queryParams}`).then(res => {
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      return res.json();
    }),
    enabled: !userLoading && !!currentUser && currentUser.role === "admin",
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });

  // Fetch teams for filtering
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
    enabled: !userLoading && !!currentUser && currentUser.role === "admin",
  });

  // Fetch users for filtering
  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    enabled: !userLoading && !!currentUser && currentUser.role === "admin",
  });

  // Fetch questions for context
  const { data: questions = [] } = useQuery<Question[]>({
    queryKey: ["/api/questions"],
  });

  // Build compliance query parameters - reuse the same date range and team filters
  const complianceQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.append("scope", "organization");
    if (dateRange?.from) params.append("from", dateRange.from.toISOString());
    if (dateRange?.to) params.append("to", dateRange.to.toISOString());
    return params.toString();
  }, [dateRange]);

  // Fetch check-in compliance metrics
  const { data: checkinComplianceResult, isLoading: checkinComplianceLoading } = useQuery<ComplianceMetricsResult>({
    queryKey: ["/api/analytics/checkin-compliance", complianceQueryParams],
    queryFn: () => fetch(`/api/analytics/checkin-compliance?${complianceQueryParams}`).then(res => {
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      return res.json();
    }),
    enabled: !userLoading && !!currentUser && currentUser.role === "admin",
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });

  // Fetch review compliance metrics  
  const { data: reviewComplianceResult, isLoading: reviewComplianceLoading } = useQuery<ComplianceMetricsResult>({
    queryKey: ["/api/analytics/review-compliance", complianceQueryParams],
    queryFn: () => fetch(`/api/analytics/review-compliance?${complianceQueryParams}`).then(res => {
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      return res.json();
    }),
    enabled: !userLoading && !!currentUser && currentUser.role === "admin",
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });

  // Fetch team-level compliance metrics for all teams (batched for performance)
  const { data: teamComplianceData, isLoading: teamComplianceLoading } = useQuery<Record<string, { checkin: ComplianceMetricsResult; review: ComplianceMetricsResult }>>({
    queryKey: ["/api/analytics/team-compliance", complianceQueryParams],
    queryFn: async () => {
      // Use batched endpoint to eliminate N+1 queries
      const batchQueryParams = new URLSearchParams();
      if (dateRange?.from) batchQueryParams.append("from", dateRange.from.toISOString());
      if (dateRange?.to) batchQueryParams.append("to", dateRange.to.toISOString());

      const response = await fetch(`/api/analytics/team-compliance?${batchQueryParams.toString()}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch team compliance metrics`);
      }

      const teamComplianceArray = await response.json();
      
      // Convert to record with team name as key for compatibility with existing UI code
      return teamComplianceArray.reduce((acc: any, teamData: any) => {
        acc[teamData.teamName] = {
          checkin: { metrics: teamData.checkinCompliance }, // Wrap in metrics object to match existing UI expectations
          review: { metrics: teamData.reviewCompliance }
        };
        return acc;
      }, {} as Record<string, { checkin: ComplianceMetricsResult; review: ComplianceMetricsResult }>);
    },
    enabled: !userLoading && !!currentUser && currentUser.role === "admin" && teams.length > 0,
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });

  // Fetch missing check-ins data
  const { data: missingCheckins, isLoading: missingCheckinsLoading } = useQuery<Array<{
    weekOf: string;
    users: Array<{
      id: string;
      name: string;
      email: string;
      teamId: string | null;
      teamName: string | null;
      managerId: string | null;
      managerName: string | null;
      daysOverdue: number;
      dueDate: string;
      missedStreak?: number; // Number of consecutive weeks missed
    }>;
  }>>({
    queryKey: ["/api/compliance/missing-checkins", selectedTeam],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedTeam !== "all") params.append("teamId", selectedTeam);
      const response = await fetch(`/api/compliance/missing-checkins?${params.toString()}`);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
      return response.json();
    },
    enabled: !userLoading && !!currentUser && currentUser.role === "admin",
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });

  // Fetch pending reviews data
  const { data: pendingReviews, isLoading: pendingReviewsLoading } = useQuery<Array<{
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    teamId: string | null;
    teamName: string | null;
    weekOf: string;
    submittedAt: string;
    daysPending: number;
    overallMood: number;
    reviewDueDate: string;
    managerId: string | null;
    managerName: string | null;
  }>>({
    queryKey: ["/api/compliance/pending-reviews", selectedTeam],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedTeam !== "all") params.append("teamId", selectedTeam);
      const response = await fetch(`/api/compliance/pending-reviews?${params.toString()}`);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
      return response.json();
    },
    enabled: !userLoading && !!currentUser && currentUser.role === "admin",
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });

  // Calculate analytics metrics
  const analytics: AnalyticsMetrics = useMemo(() => {
    if (!checkins.length) {
      return {
        totalCheckins: 0,
        pendingCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        avgReviewTime: 0,
        avgMoodRating: 0,
        completionRate: 0,
        teamBreakdown: {},
      };
    }

    const totalCheckins = checkins.length;
    const pendingCount = checkins.filter(c => c.reviewStatus === "pending").length;
    const approvedCount = checkins.filter(c => c.reviewStatus === "approved").length;
    const rejectedCount = checkins.filter(c => c.reviewStatus === "rejected").length;

    // Calculate average review time for reviewed items
    const reviewedCheckins = checkins.filter(c => c.reviewedAt && c.submittedAt);
    const avgReviewTime = reviewedCheckins.length > 0 
      ? reviewedCheckins.reduce((sum, c) => {
          const reviewTime = new Date(c.reviewedAt!).getTime() - new Date(c.submittedAt!).getTime();
          return sum + reviewTime;
        }, 0) / reviewedCheckins.length / (1000 * 60 * 60) // Convert to hours
      : 0;

    // Calculate average mood rating
    const avgMoodRating = checkins.length > 0
      ? checkins.reduce((sum, c) => sum + c.overallMood, 0) / checkins.length
      : 0;

    // Calculate completion rate (completed vs total possible)
    const activeUsers = new Set(checkins.map(c => c.userId)).size;
    const weeksInRange = dateRange?.from && dateRange?.to 
      ? Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (7 * 24 * 60 * 60 * 1000))
      : 1;
    const expectedCheckins = activeUsers * weeksInRange;
    const completionRate = expectedCheckins > 0 ? (totalCheckins / expectedCheckins) * 100 : 0;

    // Team breakdown
    const teamBreakdown: Record<string, any> = {};
    checkins.forEach(checkin => {
      const teamName = checkin.team?.name || "No Team";
      if (!teamBreakdown[teamName]) {
        teamBreakdown[teamName] = {
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          moodSum: 0,
        };
      }
      teamBreakdown[teamName].total++;
      teamBreakdown[teamName][checkin.reviewStatus]++;
      teamBreakdown[teamName].moodSum += checkin.overallMood;
    });

    // Calculate average mood for each team
    Object.keys(teamBreakdown).forEach(team => {
      teamBreakdown[team].avgMood = teamBreakdown[team].total > 0 
        ? teamBreakdown[team].moodSum / teamBreakdown[team].total 
        : 0;
      delete teamBreakdown[team].moodSum;
    });

    return {
      totalCheckins,
      pendingCount,
      approvedCount,
      rejectedCount,
      avgReviewTime,
      avgMoodRating,
      completionRate,
      teamBreakdown,
    };
  }, [checkins, dateRange]);

  // Filter checkins based on search and user filter
  const filteredCheckins = useMemo(() => {
    return checkins.filter(checkin => {
      // Search filter
      if (searchQuery && !(checkin.user?.name?.toLowerCase() ?? "").includes(searchQuery.toLowerCase())) {
        return false;
      }
      
      // User filter
      if (selectedUser !== "all" && checkin.user?.id !== selectedUser) {
        return false;
      }
      
      return true;
    });
  }, [checkins, searchQuery, selectedUser]);

  // Export functionality
  const handleExport = () => {
    const csvData = filteredCheckins.map(checkin => ({
      Date: format(new Date(checkin.createdAt), "yyyy-MM-dd"),
      User: checkin.user?.name || "Unknown",
      Team: checkin.team?.name || "No Team",
      Mood: checkin.overallMood,
      Status: checkin.reviewStatus,
      Reviewer: checkin.reviewer?.name || "Not Reviewed",
      "Review Date": checkin.reviewedAt ? format(new Date(checkin.reviewedAt), "yyyy-MM-dd") : "",
      Comments: checkin.reviewComments || "",
    }));

    const csv = [
      Object.keys(csvData[0] || {}).join(","),
      ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leadership-dashboard-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Show access denied for non-admins
  if (!userLoading && currentUser && currentUser.role !== "admin") {
    return (
      <main className="flex-1 overflow-auto p-6">
          <Card>
            <CardContent className="p-6 text-center">
              <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
              <p className="text-muted-foreground">
                You need administrator privileges to access the leadership dashboard.
              </p>
            </CardContent>
          </Card>
        </main>
    );
  }

  if (userLoading) {
    return (
      <main className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </main>
    );
  }

  return (
    <>
    <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* Leadership Summary */}
        <div className="space-y-4">
          {!showOrgSummary && (
            <div className="flex justify-start">
              <Button 
                onClick={() => setShowOrgSummary(true)}
                className="flex items-center gap-2"
                data-testid="button-generate-organization-summary"
              >
                <FileText className="w-4 h-4" />
                Generate Organization Summary
              </Button>
            </div>
          )}
          <LeadershipSummary shouldFetch={showOrgSummary} />
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Total Check-ins</p>
                  <p className="text-2xl font-bold text-foreground" data-testid="text-total-checkins">
                    {analytics.totalCheckins}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Last {dateRange?.from && dateRange?.to 
                      ? Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (24 * 60 * 60 * 1000))
                      : 30} days
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-blue-600" />
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
                    {analytics.pendingCount}
                  </p>
                  <p className="text-xs text-orange-600">
                    {analytics.totalCheckins > 0 
                      ? `${((analytics.pendingCount / analytics.totalCheckins) * 100).toFixed(1)}% of total`
                      : "No data"}
                  </p>
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
                  <p className="text-sm font-medium text-muted-foreground">Avg Mood Rating</p>
                  <p className="text-2xl font-bold text-green-600" data-testid="text-avg-mood">
                    {analytics.avgMoodRating.toFixed(1)}
                  </p>
                  <div className="flex items-center mt-1">
                    <RatingStars rating={analytics.avgMoodRating} readonly size="sm" />
                  </div>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Completion Rate</p>
                  <p className="text-2xl font-bold text-purple-600" data-testid="text-completion-rate">
                    {analytics.completionRate.toFixed(1)}%
                  </p>
                  <Progress value={analytics.completionRate} className="mt-2" />
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <PieChart className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Compliance Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              On-Time Compliance Metrics
            </CardTitle>
            <CardDescription>
              Track adherence to Monday 9am Central deadline requirements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Check-in Compliance */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-muted-foreground">Check-in Submission Compliance</h4>
                  {checkinComplianceLoading ? (
                    <Skeleton className="h-4 w-16" />
                  ) : (
                    <span className="text-2xl font-bold text-foreground" data-testid="text-checkin-compliance-rate">
                      {(checkinComplianceResult?.metrics?.onTimePercentage ?? 0).toFixed(1)}%
                    </span>
                  )}
                </div>
                {checkinComplianceLoading ? (
                  <Skeleton className="h-2 w-full" />
                ) : (
                  <Progress 
                    value={checkinComplianceResult?.metrics?.onTimePercentage ?? 0} 
                    className={`h-2 ${
                      (checkinComplianceResult?.metrics?.onTimePercentage ?? 0) >= 80 ? 'text-green-600' : 
                      (checkinComplianceResult?.metrics?.onTimePercentage ?? 0) >= 60 ? 'text-yellow-600' : 
                      'text-red-600'
                    }`}
                    data-testid="progress-checkin-compliance"
                  />
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {checkinComplianceResult?.metrics?.onTimeCount ?? 0} of {checkinComplianceResult?.metrics?.totalCount ?? 0} on time
                  </span>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    <span>Submitted by deadline</span>
                  </div>
                </div>
                {checkinComplianceResult?.metrics?.averageDaysLate && checkinComplianceResult?.metrics?.averageDaysLate > 0 && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <Clock className="w-3 h-3" />
                    <span>Avg {checkinComplianceResult?.metrics?.averageDaysLate?.toFixed(1)} days late for overdue items</span>
                  </div>
                )}
              </div>

              {/* Review Compliance */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-muted-foreground">Review Completion Compliance</h4>
                  {reviewComplianceLoading ? (
                    <Skeleton className="h-4 w-16" />
                  ) : (
                    <span className="text-2xl font-bold text-foreground" data-testid="text-review-compliance-rate">
                      {(reviewComplianceResult?.metrics?.onTimePercentage ?? 0).toFixed(1)}%
                    </span>
                  )}
                </div>
                {reviewComplianceLoading ? (
                  <Skeleton className="h-2 w-full" />
                ) : (
                  <Progress 
                    value={reviewComplianceResult?.metrics?.onTimePercentage ?? 0} 
                    className={`h-2 ${
                      (reviewComplianceResult?.metrics?.onTimePercentage ?? 0) >= 80 ? 'text-green-600' : 
                      (reviewComplianceResult?.metrics?.onTimePercentage ?? 0) >= 60 ? 'text-yellow-600' : 
                      'text-red-600'
                    }`}
                    data-testid="progress-review-compliance"
                  />
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {reviewComplianceResult?.metrics?.onTimeCount ?? 0} of {reviewComplianceResult?.metrics?.totalCount ?? 0} on time
                  </span>
                  <div className="flex items-center gap-1">
                    <Timer className="w-3 h-3" />
                    <span>Reviewed by deadline</span>
                  </div>
                </div>
                {reviewComplianceResult?.metrics?.averageDaysLate && reviewComplianceResult?.metrics?.averageDaysLate > 0 && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <Clock className="w-3 h-3" />
                    <span>Avg {reviewComplianceResult?.metrics?.averageDaysLate?.toFixed(1)} days late for overdue items</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Compliance Tracking - Missing Check-ins & Pending Reviews */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Missing Check-in Submissions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <UserX className="w-5 h-5 text-red-500" />
                    Missing Check-in Submissions
                  </CardTitle>
                  <CardDescription>
                    Users who haven't submitted their weekly check-ins
                  </CardDescription>
                </div>
                {missingCheckins && missingCheckins.length > 0 && missingCheckins[0]?.users?.length > 0 && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={exportMissingCheckinsToCSV}
                      data-testid="button-export-missing-checkins"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const userIds = missingCheckins.flatMap(week => week.users.map(u => u.id));
                        missingCheckinReminderMutation.mutate(userIds);
                      }}
                      disabled={missingCheckinReminderMutation.isPending}
                      data-testid="button-remind-missing-checkins"
                    >
                      {missingCheckinReminderMutation.isPending ? (
                        <Clock className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      Send Reminder
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {missingCheckinsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : missingCheckins && missingCheckins.length > 0 && missingCheckins[0].users.length > 0 ? (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-4">
                    {missingCheckins.map(weekData => (
                      <div key={weekData.weekOf} className="space-y-2">
                        <h4 className="text-sm font-semibold text-muted-foreground">
                          Week of {format(new Date(weekData.weekOf), "MMM d, yyyy")}
                        </h4>
                        <div className="space-y-2">
                          {weekData.users.map(user => (
                            <div 
                              key={user.id} 
                              className={`flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors ${
                                user.missedStreak && user.missedStreak > 2 ? 'border-red-300 dark:border-red-800' : ''
                              }`}
                              data-testid={`missing-checkin-user-${user.id}`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm truncate">{user.name}</p>
                                  {user.missedStreak && user.missedStreak > 2 && (
                                    <Badge 
                                      variant="destructive" 
                                      className="text-xs flex items-center gap-1"
                                      title={`Has missed ${user.missedStreak} consecutive weeks`}
                                    >
                                      <Flame className="w-3 h-3" />
                                      {user.missedStreak} week streak
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                <div className="flex items-center gap-4 mt-1">
                                  <Badge variant="secondary" className="text-xs">
                                    {user.teamName || "No Team"}
                                  </Badge>
                                  {user.managerName && (
                                    <span className="text-xs text-muted-foreground">
                                      Reports to: {user.managerName}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <Badge 
                                  variant={user.daysOverdue > 7 ? "destructive" : user.daysOverdue > 3 ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {user.daysOverdue > 0 ? (
                                    <>
                                      <AlertTriangle className="w-3 h-3 mr-1" />
                                      {user.daysOverdue} {user.daysOverdue === 1 ? "day" : "days"} overdue
                                    </>
                                  ) : (
                                    "Due today"
                                  )}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  Due: {format(new Date(user.dueDate), "MMM d, h:mm a")}
                                </span>
                                {user.missedStreak && user.missedStreak === 1 && (
                                  <span className="text-xs text-orange-600 dark:text-orange-400">
                                    First miss
                                  </span>
                                )}
                                {user.missedStreak && user.missedStreak === 2 && (
                                  <span className="text-xs text-orange-600 dark:text-orange-400">
                                    2 weeks missed
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle className="w-12 h-12 text-green-500 mb-3" />
                  <p className="text-sm font-medium">All check-ins submitted!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    No missing submissions for the current week
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Incomplete Reviews */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-orange-500" />
                    Pending Reviews
                  </CardTitle>
                  <CardDescription>
                    Check-ins awaiting manager review
                  </CardDescription>
                </div>
                {pendingReviews && pendingReviews.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const uniqueManagerIds = [...new Set(pendingReviews
                        .filter(r => r.managerId)
                        .map(r => r.managerId!))];
                      pendingReviewReminderMutation.mutate(uniqueManagerIds);
                    }}
                    disabled={pendingReviewReminderMutation.isPending}
                    data-testid="button-remind-pending-reviews"
                  >
                    {pendingReviewReminderMutation.isPending ? (
                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Send Slack Reminder
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {pendingReviewsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : pendingReviews && pendingReviews.length > 0 ? (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {pendingReviews.map(review => (
                      <Link 
                        key={review.id} 
                        href={`/checkins?checkinId=${review.id}`}
                        className="block"
                      >
                        <div 
                          className="flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                          data-testid={`pending-review-${review.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{review.userName}</p>
                            <p className="text-xs text-muted-foreground truncate">{review.userEmail}</p>
                            <div className="flex items-center gap-4 mt-1">
                              <Badge variant="secondary" className="text-xs">
                                {review.teamName || "No Team"}
                              </Badge>
                              <div className="flex items-center gap-1">
                                <RatingStars rating={review.overallMood} readonly size="xs" />
                                <span className="text-xs text-muted-foreground ml-1">
                                  Mood: {review.overallMood}
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Week of {format(new Date(review.weekOf), "MMM d")} • Submitted {format(new Date(review.submittedAt), "MMM d, h:mm a")}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge 
                              variant={review.daysPending > 7 ? "destructive" : review.daysPending > 3 ? "default" : "secondary"}
                              className="text-xs"
                            >
                              <Clock className="w-3 h-3 mr-1" />
                              {review.daysPending} {review.daysPending === 1 ? "day" : "days"} pending
                            </Badge>
                            <Button 
                              size="sm"
                              variant="outline"
                              className="text-xs h-6 px-2"
                              data-testid={`button-review-${review.id}`}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              Review
                            </Button>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle className="w-12 h-12 text-green-500 mb-3" />
                  <p className="text-sm font-medium">All reviews complete!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    No pending reviews at this time
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filters and Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filters & Export
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger data-testid="select-status-filter">
                  <SelectValue placeholder="Review Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                <SelectTrigger data-testid="select-team-filter">
                  <SelectValue placeholder="Team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger data-testid="select-user-filter">
                  <SelectValue placeholder="User" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-users"
              />

              <Button 
                onClick={handleExport}
                className="w-full"
                disabled={filteredCheckins.length === 0}
                data-testid="button-export-data"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Team Analytics */}
        <Card>
          <CardHeader>
            <CardTitle>Team Performance</CardTitle>
            <CardDescription>
              Breakdown by team with approval rates and mood averages
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(analytics.teamBreakdown).length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No team data available for the selected period
              </p>
            ) : (
              <div className="space-y-4">
                {Object.entries(analytics.teamBreakdown).map(([teamName, stats]) => (
                  <div key={teamName} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <h4 className="font-medium">{teamName}</h4>
                      <div className="flex items-center space-x-4 mt-2">
                        <span className="text-sm text-muted-foreground">
                          {stats.total} check-ins
                        </span>
                        <div className="flex items-center space-x-1">
                          <RatingStars rating={stats.avgMood} readonly size="sm" />
                          <span className="text-sm text-muted-foreground">
                            ({stats.avgMood.toFixed(1)})
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Badge variant="secondary">
                        {stats.pending} pending
                      </Badge>
                      <Badge variant="default">
                        {stats.approved} approved
                      </Badge>
                      {stats.rejected > 0 && (
                        <Badge variant="destructive">
                          {stats.rejected} rejected
                        </Badge>
                      )}
                    </div>
                    <div className="ml-4 text-right">
                      <div className="text-sm font-medium">
                        {stats.total > 0 ? ((stats.approved / stats.total) * 100).toFixed(1) : 0}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        approval rate
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Compliance Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Team Compliance Breakdown
            </CardTitle>
            <CardDescription>
              On-time compliance rates by team for check-in submissions and review completions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {teamComplianceLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                      <Skeleton className="h-5 w-32" />
                      <div className="flex space-x-2">
                        <Skeleton className="h-6 w-16" />
                        <Skeleton className="h-6 w-16" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Skeleton className="h-3 w-full mb-2" />
                        <Skeleton className="h-2 w-full" />
                      </div>
                      <div>
                        <Skeleton className="h-3 w-full mb-2" />
                        <Skeleton className="h-2 w-full" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : !teamComplianceData || Object.keys(teamComplianceData).length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No team compliance data available for the selected period
              </p>
            ) : (
              <div className="space-y-4">
                {Object.entries(teamComplianceData).map(([teamName, compliance]) => (
                  <div key={teamName} className="p-4 border rounded-lg" data-testid={`team-compliance-${teamName.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-medium text-lg">{teamName}</h4>
                      <div className="flex space-x-2">
                        <Badge 
                          variant={(compliance.checkin?.metrics?.onTimePercentage || 0) >= 80 ? "default" : "secondary"}
                          className={
                            (compliance.checkin?.metrics?.onTimePercentage || 0) >= 80 ? "bg-green-100 text-green-800" :
                            (compliance.checkin?.metrics?.onTimePercentage || 0) >= 60 ? "bg-yellow-100 text-yellow-800" :
                            "bg-red-100 text-red-800"
                          }
                        >
                          Check-ins: {(compliance.checkin?.metrics?.onTimePercentage || 0).toFixed(1)}%
                        </Badge>
                        <Badge 
                          variant={(compliance.review?.metrics?.onTimePercentage || 0) >= 80 ? "default" : "secondary"}
                          className={
                            (compliance.review?.metrics?.onTimePercentage || 0) >= 80 ? "bg-green-100 text-green-800" :
                            (compliance.review?.metrics?.onTimePercentage || 0) >= 60 ? "bg-yellow-100 text-yellow-800" :
                            "bg-red-100 text-red-800"
                          }
                        >
                          Reviews: {(compliance.review?.metrics?.onTimePercentage || 0).toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Team Check-in Compliance */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Check-in Submissions</span>
                          <span className="font-medium">{compliance.checkin?.metrics?.onTimeCount || 0}/{compliance.checkin?.metrics?.totalCount || 0} on time</span>
                        </div>
                        <Progress 
                          value={compliance.checkin?.metrics?.onTimePercentage || 0} 
                          className={`h-2 ${
                            (compliance.checkin?.metrics?.onTimePercentage || 0) >= 80 ? 'text-green-600' : 
                            (compliance.checkin?.metrics?.onTimePercentage || 0) >= 60 ? 'text-yellow-600' : 
                            'text-red-600'
                          }`}
                          data-testid={`progress-team-checkin-${teamName.toLowerCase().replace(/\s+/g, '-')}`}
                        />
                        {compliance.checkin?.metrics?.averageDaysLate && compliance.checkin?.metrics?.averageDaysLate > 0 && (
                          <div className="flex items-center gap-1 text-xs text-red-600">
                            <Clock className="w-3 h-3" />
                            <span>Avg {compliance.checkin?.metrics?.averageDaysLate?.toFixed(1)} days late</span>
                          </div>
                        )}
                      </div>

                      {/* Team Review Compliance */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Review Completions</span>
                          <span className="font-medium">{compliance.review?.metrics?.onTimeCount || 0}/{compliance.review?.metrics?.totalCount || 0} on time</span>
                        </div>
                        <Progress 
                          value={compliance.review?.metrics?.onTimePercentage || 0} 
                          className={`h-2 ${
                            (compliance.review?.metrics?.onTimePercentage || 0) >= 80 ? 'text-green-600' : 
                            (compliance.review?.metrics?.onTimePercentage || 0) >= 60 ? 'text-yellow-600' : 
                            'text-red-600'
                          }`}
                          data-testid={`progress-team-review-${teamName.toLowerCase().replace(/\s+/g, '-')}`}
                        />
                        {compliance.review?.metrics?.averageDaysLate && compliance.review?.metrics?.averageDaysLate > 0 && (
                          <div className="flex items-center gap-1 text-xs text-red-600">
                            <Timer className="w-3 h-3" />
                            <span>Avg {compliance.review?.metrics?.averageDaysLate?.toFixed(1)} days late</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Check-ins List */}
        <Card>
          <CardHeader>
            <CardTitle>Check-ins Overview</CardTitle>
            <CardDescription>
              {filteredCheckins.length} check-ins found
              {checkinsError && (
                <span className="text-red-500 ml-2">
                  Error loading data. Please refresh the page.
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {checkinsLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : filteredCheckins.length === 0 ? (
              <div className="text-center py-8">
                <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Check-ins Found</h3>
                <p className="text-muted-foreground">
                  Try adjusting your filters or date range to see more data.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCheckins.slice(0, 50).map((checkin) => (
                  <div
                    key={checkin.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => setSelectedCheckin(checkin)}
                    data-testid={`checkin-row-${checkin.id}`}
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                        <span className="text-primary-foreground font-medium">
                          {checkin.user?.name?.[0] || "?"}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{checkin.user?.name || "Unknown User"}</p>
                        <p className="text-sm text-muted-foreground">
                          {checkin.team?.name || "No Team"} • {format(new Date(checkin.createdAt), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <RatingStars rating={checkin.overallMood} readonly size="sm" />
                      <Badge 
                        variant={checkin.reviewStatus === "pending" ? "secondary" : 
                               checkin.reviewStatus === "approved" ? "default" : "destructive"}
                      >
                        {checkin.reviewStatus}
                      </Badge>
                      {checkin.reviewer && (
                        <span className="text-xs text-muted-foreground">
                          by {checkin.reviewer.name}
                        </span>
                      )}
                      <Button variant="ghost" size="sm">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                {filteredCheckins.length > 50 && (
                  <p className="text-center text-muted-foreground py-4">
                    Showing first 50 of {filteredCheckins.length} check-ins. Use filters to narrow results.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Check-in Detail Modal */}
      {selectedCheckin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Check-in Details</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCheckin(null)}
                  data-testid="button-close-modal"
                >
                  ×
                </Button>
              </CardTitle>
              <CardDescription>
                {selectedCheckin.user?.name} • {format(new Date(selectedCheckin.createdAt), "MMMM d, yyyy 'at' h:mm a")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* User and Team Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">User Information</h4>
                  <p className="text-sm">Name: {selectedCheckin.user?.name}</p>
                  <p className="text-sm">Email: {selectedCheckin.user?.email}</p>
                  <p className="text-sm">Role: {selectedCheckin.user?.role}</p>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Team Information</h4>
                  <p className="text-sm">Team: {selectedCheckin.team?.name || "No Team"}</p>
                  <p className="text-sm">Description: {selectedCheckin.team?.description || "N/A"}</p>
                </div>
              </div>

              {/* Check-in Content */}
              <div>
                <h4 className="font-medium mb-2">Overall Mood</h4>
                <div className="flex items-center space-x-2">
                  <RatingStars rating={selectedCheckin.overallMood} readonly />
                  <span className="text-sm text-muted-foreground">
                    ({selectedCheckin.overallMood}/5)
                  </span>
                </div>
              </div>

              {/* Responses */}
              <div>
                <h4 className="font-medium mb-2">Question Responses</h4>
                <div className="space-y-3">
                  {Object.entries(selectedCheckin.responses as Record<string, string>).map(([questionId, response]) => {
                    const question = questions.find(q => q.id === questionId);
                    return (
                      <div key={questionId} className="bg-muted p-3 rounded-lg">
                        <p className="text-sm font-medium mb-1">
                          {question?.text || "Question"}
                        </p>
                        <p className="text-sm text-muted-foreground">{response}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Review Information */}
              {selectedCheckin.reviewStatus !== "pending" && (
                <div>
                  <h4 className="font-medium mb-2">Review Information</h4>
                  <div className="bg-muted p-3 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Status:</span>
                      <Badge 
                        variant={selectedCheckin.reviewStatus === "approved" ? "default" : "destructive"}
                      >
                        {selectedCheckin.reviewStatus}
                      </Badge>
                    </div>
                    {selectedCheckin.reviewer && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Reviewed by:</span>
                        <span className="text-sm">{selectedCheckin.reviewer.name}</span>
                      </div>
                    )}
                    {selectedCheckin.reviewedAt && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Reviewed on:</span>
                        <span className="text-sm">
                          {format(new Date(selectedCheckin.reviewedAt), "MMM d, yyyy 'at' h:mm a")}
                        </span>
                      </div>
                    )}
                    {selectedCheckin.reviewComments && (
                      <div>
                        <p className="text-sm font-medium mb-1">Comments:</p>
                        <p className="text-sm text-muted-foreground">{selectedCheckin.reviewComments}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}