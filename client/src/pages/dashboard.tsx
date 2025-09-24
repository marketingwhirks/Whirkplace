import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import RatingStars from "@/components/checkin/rating-stars";
import WinCard from "@/components/wins/win-card";
import TeamMemberCard from "@/components/team/team-member-card";
import CheckinDetail from "@/components/checkin/checkin-detail";
import { Heart, ClipboardCheck, Trophy, HelpCircle, Plus, Bell, UserCog, Target, Timer } from "lucide-react";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useViewAsRole } from "@/hooks/useViewAsRole";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";
import type { Checkin, Win, User, Question, ComplianceMetricsResult } from "@shared/schema";

interface DashboardStats {
  averageRating: number;
  completionRate: number;
  totalCheckins: number;
}

export default function Dashboard() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: userLoading, error: userError } = useViewAsRole();
  const [checkinData, setCheckinData] = useState({
    overallMood: 0,
    responses: {} as Record<string, string>,
  });
  const [selectedCheckin, setSelectedCheckin] = useState<(Checkin & { user?: User }) | null>(null);

  // Handle loading and error states for authentication
  if (userLoading) {
    return (
      <main className="flex-1 overflow-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="flex-1">
                      <Skeleton className="h-4 w-24 mb-2" />
                      <Skeleton className="h-8 w-16 mb-1" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="w-12 h-12 rounded-lg" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full rounded-lg" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-24" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
      </main>
    );
  }

  if (userError || !currentUser) {
    return (
      <main className="flex-1 overflow-auto p-6">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground mb-4">
                {userError ? "Failed to load user data. Please try refreshing the page." : "Please log in to access your dashboard."}
              </p>
              <Button onClick={() => window.location.reload()}>
                Refresh Page
              </Button>
            </CardContent>
          </Card>
      </main>
    );
  }

  // Fetch data with loading and error states
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/analytics/team-health"],
  });

  // Fetch checkins with role-based filtering
  const { data: recentCheckins = [], isLoading: checkinsLoading, error: checkinsError } = useQuery<Checkin[]>({
    queryKey: currentUser.role === "member" 
      ? ["/api/checkins", { userId: currentUser.id, limit: 5 }]
      : ["/api/checkins", { limit: 5 }],
  });

  // Fetch wins with appropriate scope
  const { data: recentWins = [], isLoading: winsLoading, error: winsError } = useQuery<Win[]>({
    queryKey: ["/api/wins", { limit: 5 }],
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: questions = [], isLoading: questionsLoading } = useQuery<Question[]>({
    queryKey: ["/api/questions"],
  });

  // Get current week check-in
  const { data: currentCheckin } = useQuery<Checkin | null>({
    queryKey: ["/api/users", currentUser.id, "current-checkin"],
  });

  // Get current user's team info for compliance data (if manager)
  const currentUserProfile = currentUser;

  // Build date range for compliance queries  
  const { thirtyDaysAgo, today } = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const today = new Date();
    return { thirtyDaysAgo, today };
  }, []);

  // Build compliance query parameters for team-level data
  const complianceQueryParams = useMemo(() => {
    if (!currentUserProfile?.teamId) return null;
    
    const params = new URLSearchParams();
    params.append("scope", "team");
    params.append("id", currentUserProfile.teamId);
    params.append("from", thirtyDaysAgo.toISOString());
    params.append("to", today.toISOString());
    return params.toString();
  }, [currentUserProfile?.teamId, thirtyDaysAgo, today]);

  // Fetch team check-in compliance metrics (for managers)
  const { data: teamCheckinComplianceArray, isLoading: teamCheckinComplianceLoading } = useQuery<ComplianceMetricsResult[]>({
    queryKey: ["/api/analytics/checkin-compliance", { 
      scope: "team",
      id: currentUserProfile?.teamId,
      from: thirtyDaysAgo.toISOString(),
      to: today.toISOString()
    }],
    enabled: currentUser.role === "manager" && !!currentUserProfile?.teamId,
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });

  // Fetch team review compliance metrics (for managers)
  const { data: teamReviewComplianceArray, isLoading: teamReviewComplianceLoading } = useQuery<ComplianceMetricsResult[]>({
    queryKey: ["/api/analytics/review-compliance", { 
      scope: "team",
      id: currentUserProfile?.teamId,
      from: thirtyDaysAgo.toISOString(),
      to: today.toISOString()
    }],
    enabled: currentUser.role === "manager" && !!currentUserProfile?.teamId,
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });

  // Extract the first result from the arrays, or provide default values
  const teamCheckinCompliance = useMemo(() => {
    if (!teamCheckinComplianceArray || teamCheckinComplianceArray.length === 0) {
      return null;
    }
    return teamCheckinComplianceArray[0];
  }, [teamCheckinComplianceArray]);

  const teamReviewCompliance = useMemo(() => {
    if (!teamReviewComplianceArray || teamReviewComplianceArray.length === 0) {
      return null;
    }
    return teamReviewComplianceArray[0];
  }, [teamReviewComplianceArray]);

  // Enhanced data with user lookups - with proper array guards
  const enrichedCheckins = Array.isArray(recentCheckins) ? recentCheckins.map(checkin => ({
    ...checkin,
    user: Array.isArray(users) ? users.find(u => u.id === checkin.userId) : undefined,
  })) : [];

  // Filter wins based on role
  const filteredWins = Array.isArray(recentWins) 
    ? (currentUser.role === "member" 
        ? recentWins.filter(win => win.userId === currentUser.id || win.nominatedBy === currentUser.id)
        : recentWins)
    : [];

  const enrichedWins = filteredWins.map(win => ({
    ...win,
    user: Array.isArray(users) ? users.find(u => u.id === win.userId) : undefined,
    nominator: win.nominatedBy && Array.isArray(users) ? users.find(u => u.id === win.nominatedBy) : undefined,
  }));

  // Team structure (manager's reports) - with proper array guard
  const teamMembers = Array.isArray(users) ? users.filter(user => user.managerId === currentUser.id) : [];

  const handleRatingChange = (rating: number) => {
    setCheckinData(prev => ({ ...prev, overallMood: rating }));
  };

  const handleResponseChange = (questionId: string, response: string) => {
    setCheckinData(prev => ({
      ...prev,
      responses: { ...prev.responses, [questionId]: response },
    }));
  };

  const handleSubmitCheckin = async () => {
    try {
      if (checkinData.overallMood === 0) {
        toast({
          variant: "destructive",
          title: "Rating required",
          description: "Please provide an overall mood rating.",
        });
        return;
      }

      const checkinPayload = {
        userId: currentUser.id,
        weekOf: new Date(),
        overallMood: checkinData.overallMood,
        responses: checkinData.responses,
        isComplete: true,
      };

      if (currentCheckin) {
        await apiRequest("PATCH", `/api/checkins/${currentCheckin.id}`, checkinPayload);
      } else {
        await apiRequest("POST", "/api/checkins", checkinPayload);
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/users", currentUser.id, "current-checkin"] });

      toast({
        title: "Check-in submitted!",
        description: "Your weekly check-in has been submitted for review by your team leader.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Submission failed",
        description: "There was an error submitting your check-in.",
      });
    }
  };

  const handleSendReminder = async () => {
    try {
      await apiRequest("POST", "/api/slack/send-checkin-reminder", {});
      toast({
        title: "Reminder sent!",
        description: "Check-in reminders have been sent to team members.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to send reminder",
        description: "There was an error sending the reminder.",
      });
    }
  };

  return (
    <>
      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    {currentUser.role === "member" ? "Your Mood" : currentUser.role === "manager" ? "Team Health" : "Organization Health"}
                  </p>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-16 my-1" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground" data-testid="text-team-health">
                      {stats?.averageRating?.toFixed(1) || "0.0"}
                    </p>
                  )}
                  <p className="text-xs text-green-600">
                    {stats?.averageRating && stats.averageRating > 0 
                      ? currentUser.role === "member" ? "Your average" : "+0.3 from last week" 
                      : "No data yet"}
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <Heart className="w-6 h-6 fill-accent stroke-accent" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    {currentUser.role === "member" ? "Your Check-ins" : "Check-ins Complete"}
                  </p>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-20 my-1" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground" data-testid="text-checkin-complete">
                      {currentUser.role === "member" 
                        ? stats?.totalCheckins || 0
                        : `${stats?.completionRate || 0}%`
                      }
                    </p>
                  )}
                  <p className="text-xs text-blue-600">
                    {stats?.totalCheckins && stats.totalCheckins > 0 
                      ? currentUser.role === "member" 
                        ? "Total submitted" 
                        : currentUser.role === "manager" 
                          ? "Team completion"
                          : "Organization-wide"
                      : "No check-ins yet"}
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <ClipboardCheck className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Compliance Metrics for Managers */}
          {currentUser.role === "manager" && (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Team On-Time Submissions</p>
                    {teamCheckinComplianceLoading ? (
                      <Skeleton className="h-8 w-16 my-1" />
                    ) : (
                      <p className="text-2xl font-bold text-foreground" data-testid="text-team-checkin-compliance">
                        {(teamCheckinCompliance?.metrics?.onTimePercentage ?? 0).toFixed(1)}%
                      </p>
                    )}
                    {teamCheckinCompliance?.metrics && (
                      <p className={`text-xs ${
                        (teamCheckinCompliance.metrics.onTimePercentage ?? 0) >= 80 ? 'text-green-600' :
                        (teamCheckinCompliance.metrics.onTimePercentage ?? 0) >= 60 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {teamCheckinCompliance.metrics.onTimeCount ?? 0} of {teamCheckinCompliance.metrics.totalCount ?? 0} on time
                      </p>
                    )}
                  </div>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    (teamCheckinCompliance?.metrics?.onTimePercentage ?? 0) >= 80 ? 'bg-green-100' :
                    (teamCheckinCompliance?.metrics?.onTimePercentage ?? 0) >= 60 ? 'bg-yellow-100' :
                    'bg-red-100'
                  }`}>
                    <Target className={`w-6 h-6 ${
                      (teamCheckinCompliance?.metrics?.onTimePercentage ?? 0) >= 80 ? 'text-green-600' :
                      (teamCheckinCompliance?.metrics?.onTimePercentage ?? 0) >= 60 ? 'text-yellow-600' :
                      'text-red-600'
                    }`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {currentUser.role === "manager" && (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Review Timeliness</p>
                    {teamReviewComplianceLoading ? (
                      <Skeleton className="h-8 w-16 my-1" />
                    ) : (
                      <p className="text-2xl font-bold text-foreground" data-testid="text-team-review-compliance">
                        {(teamReviewCompliance?.metrics?.onTimePercentage ?? 0).toFixed(1)}%
                      </p>
                    )}
                    {teamReviewCompliance?.metrics && (
                      <p className={`text-xs ${
                        (teamReviewCompliance.metrics.onTimePercentage ?? 0) >= 80 ? 'text-green-600' :
                        (teamReviewCompliance.metrics.onTimePercentage ?? 0) >= 60 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {teamReviewCompliance.metrics.onTimeCount ?? 0} of {teamReviewCompliance.metrics.totalCount ?? 0} on time
                      </p>
                    )}
                  </div>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    (teamReviewCompliance?.metrics?.onTimePercentage ?? 0) >= 80 ? 'bg-green-100' :
                    (teamReviewCompliance?.metrics?.onTimePercentage ?? 0) >= 60 ? 'bg-yellow-100' :
                    'bg-red-100'
                  }`}>
                    <Timer className={`w-6 h-6 ${
                      (teamReviewCompliance?.metrics?.onTimePercentage ?? 0) >= 80 ? 'text-green-600' :
                      (teamReviewCompliance?.metrics?.onTimePercentage ?? 0) >= 60 ? 'text-yellow-600' :
                      'text-red-600'
                    }`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Show Wins and Questions for non-managers or when no compliance data */}
          {(currentUser.role !== "manager" || !teamCheckinCompliance) && (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">
                      {currentUser.role === "member" ? "Your Wins" : "Wins This Week"}
                    </p>
                    {winsLoading ? (
                      <Skeleton className="h-8 w-12 my-1" />
                    ) : (
                      <p className="text-2xl font-bold text-foreground" data-testid="text-wins-count">
                        {Array.isArray(recentWins) ? recentWins.length : 0}
                      </p>
                    )}
                    <p className="text-xs text-yellow-600">
                      {Array.isArray(recentWins) && recentWins.length > 0 ? "+5 from last week" : "No wins yet"}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <Trophy className="w-6 h-6 text-yellow-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {(currentUser.role !== "manager" || !teamReviewCompliance) && (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Active Questions</p>
                    {questionsLoading ? (
                      <Skeleton className="h-8 w-12 my-1" />
                    ) : (
                      <p className="text-2xl font-bold text-foreground" data-testid="text-questions-count">
                        {Array.isArray(questions) ? questions.length : 0}
                      </p>
                    )}
                    <p className="text-xs text-purple-600">
                      {Array.isArray(questions) && questions.length > 0 ? "3 pending responses" : "No questions yet"}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <HelpCircle className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Check-ins */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    {currentUser.role === "member" ? "Your Check-ins" : currentUser.role === "manager" ? "Team Check-ins" : "Recent Check-ins"}
                  </CardTitle>
                  <Button variant="link" data-testid="button-view-all-checkins">
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {checkinsLoading || usersLoading ? (
                  // Loading state with skeletons
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-4 p-4 bg-muted rounded-lg">
                        <Skeleton className="w-12 h-12 rounded-full" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-4 w-20" />
                          </div>
                          <Skeleton className="h-3 w-full mt-2" />
                          <div className="flex items-center justify-between mt-2">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-6 w-20" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : checkinsError ? (
                  <p className="text-muted-foreground text-center py-8 text-red-500">
                    Failed to load check-ins. Please refresh the page.
                  </p>
                ) : enrichedCheckins.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No check-ins yet. Encourage your team to submit their weekly check-ins!
                  </p>
                ) : (
                  enrichedCheckins.map((checkin) => {
                    // Get question-answer pairs from responses
                    const responses = checkin.responses as Record<string, string>;
                    const questionResponses = questions.map(q => ({
                      question: q.text,
                      answer: responses[q.id] || null
                    })).filter(qr => qr.answer);
                    
                    // If no responses, show default question
                    const displayResponses = questionResponses.length > 0 ? questionResponses : [{
                      question: "Is there anything I can help you with?",
                      answer: "No response provided"
                    }];

                    return (
                      <div key={checkin.id} className="p-4 bg-muted rounded-lg">
                        <div className="flex items-start space-x-4">
                          {checkin.user?.avatar ? (
                            <img
                              src={checkin.user.avatar}
                              alt={`${checkin.user.name} avatar`}
                              className="w-12 h-12 rounded-full"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
                              <span className="text-primary-foreground font-medium">
                                {checkin.user?.name?.[0] || "?"}
                              </span>
                            </div>
                          )}
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <p className="font-medium text-foreground" data-testid={`text-checkin-user-${checkin.id}`}>
                                  {checkin.user?.name || "Unknown User"}
                                </p>
                                <Badge 
                                  variant={checkin.reviewStatus === "pending" ? "secondary" : checkin.reviewStatus === "approved" ? "default" : "destructive"}
                                  className="text-xs"
                                  data-testid={`badge-review-status-${checkin.id}`}
                                >
                                  {checkin.reviewStatus === "pending" ? "Pending Review" : 
                                   checkin.reviewStatus === "approved" ? "Approved" : 
                                   checkin.reviewStatus === "rejected" ? "Rejected" : "Unknown"}
                                </Badge>
                              </div>
                              <span className="text-xs text-muted-foreground" data-testid={`text-checkin-timestamp-${checkin.id}`}>
                                {formatDistanceToNow(new Date(checkin.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                            
                            {/* Mood Rating */}
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-medium text-muted-foreground">Overall Mood:</span>
                              <RatingStars rating={checkin.overallMood} readonly size="sm" />
                              <Badge variant={checkin.overallMood >= 4 ? "default" : checkin.overallMood >= 3 ? "secondary" : "destructive"}>
                                {checkin.overallMood}/5
                              </Badge>
                            </div>
                            
                            {/* Questions and Answers */}
                            <div className="space-y-2">
                              {displayResponses.slice(0, 2).map((qr, idx) => (
                                <div key={idx} className="space-y-1">
                                  <p className="text-sm font-medium text-muted-foreground">
                                    {qr.question}
                                  </p>
                                  <p className="text-sm text-foreground pl-2 border-l-2 border-muted">
                                    {qr.answer}
                                  </p>
                                </div>
                              ))}
                              {displayResponses.length > 2 && (
                                <p className="text-xs text-muted-foreground italic">
                                  +{displayResponses.length - 2} more responses
                                </p>
                              )}
                            </div>
                            
                            <div className="flex items-center justify-end">
                              <Button 
                                variant="link" 
                                size="sm" 
                                onClick={() => setSelectedCheckin(checkin)}
                                data-testid={`button-view-checkin-${checkin.id}`}
                              >
                                View Details
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions & Wins */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Create New Question - Only for managers and admins */}
                {(currentUser.role === "manager" || currentUser.role === "admin") && (
                  <Button className="w-full justify-start" data-testid="button-create-question">
                    <Plus className="w-4 h-4 mr-2" />
                    Create New Question
                  </Button>
                )}
                {/* Send Check-in Reminder - Only for managers and admins */}
                {(currentUser.role === "manager" || currentUser.role === "admin") && (
                  <Button 
                    variant="secondary" 
                    className="w-full justify-start"
                    onClick={handleSendReminder}
                    data-testid="button-send-reminder"
                  >
                    <Bell className="w-4 h-4 mr-2" />
                    Send Check-in Reminder
                  </Button>
                )}
                {/* Celebrate a Win - Available to all users */}
                <Button variant="secondary" className="w-full justify-start" data-testid="button-celebrate-win">
                  <Trophy className="w-4 h-4 mr-2" />
                  Celebrate a Win
                </Button>
                {/* Manage Team - Only for managers (own team) and admins (all teams) */}
                {(currentUser.role === "manager" || currentUser.role === "admin") && (
                  <Button variant="secondary" className="w-full justify-start" data-testid="button-manage-team">
                    <UserCog className="w-4 h-4 mr-2" />
                    Manage Team
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Recent Wins */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    {currentUser.role === "member" ? "Your Wins 🎉" : currentUser.role === "manager" ? "Team Wins 🎉" : "Recent Wins 🎉"}
                  </CardTitle>
                  <Button variant="link" data-testid="button-view-all-wins">
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {winsLoading || usersLoading ? (
                  // Loading state with skeletons
                  <div className="space-y-3">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="p-4 bg-muted rounded-lg">
                        <div className="flex items-start space-x-3">
                          <Skeleton className="w-10 h-10 rounded-full" />
                          <div className="flex-1">
                            <Skeleton className="h-4 w-3/4 mb-2" />
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-3 w-2/3 mt-1" />
                            <div className="flex items-center justify-between mt-2">
                              <Skeleton className="h-3 w-24" />
                              <Skeleton className="h-6 w-16" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : winsError ? (
                  <p className="text-muted-foreground text-center py-4 text-red-500">
                    Failed to load wins. Please refresh the page.
                  </p>
                ) : enrichedWins.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    No wins yet. Start celebrating your team's achievements!
                  </p>
                ) : (
                  enrichedWins.map((win) => (
                    <WinCard
                      key={win.id}
                      win={win}
                      user={win.user}
                      nominator={win.nominator}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Team Structure & Check-in Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Team Structure */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Team Structure</CardTitle>
                <Button variant="link" data-testid="button-edit-team-structure">
                  Edit Structure
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Team Lead */}
                <TeamMemberCard
                  user={currentUser}
                  isLead
                />

                {/* Team Members */}
                {teamMembers.length > 0 ? (
                  <div className="ml-6 space-y-3">
                    {teamMembers.map((member) => (
                      <TeamMemberCard
                        key={member.id}
                        user={member}
                        status="active"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="ml-6">
                    <p className="text-muted-foreground text-sm">
                      No team members assigned yet.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Check-in Interface */}
          <Card>
            <CardHeader>
              <CardTitle>Weekly Check-in</CardTitle>
              <p className="text-sm text-muted-foreground">
                How are you feeling this week?
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Overall Mood Rating */}
              <div>
                <Label className="text-sm font-medium text-foreground mb-3 block">
                  Overall Mood
                </Label>
                <RatingStars
                  rating={checkinData.overallMood}
                  onRatingChange={handleRatingChange}
                  size="lg"
                />
              </div>

              {/* Questions */}
              <div className="space-y-4">
                {questions.map((question) => (
                  <div key={question.id}>
                    <Label className="text-sm font-medium text-foreground mb-2 block">
                      {question.text}
                    </Label>
                    <Textarea
                      placeholder="Share your thoughts..."
                      value={checkinData.responses[question.id] || ""}
                      onChange={(e) => handleResponseChange(question.id, e.target.value)}
                      className="resize-none"
                      rows={3}
                      data-testid={`textarea-question-${question.id}`}
                    />
                  </div>
                ))}
              </div>

              {/* Submit Button */}
              <div className="flex justify-end space-x-3">
                <Button variant="secondary" data-testid="button-save-draft">
                  Save Draft
                </Button>
                <Button onClick={handleSubmitCheckin} data-testid="button-submit-checkin">
                  Submit Check-in
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Check-in Detail Modal */}
      {selectedCheckin && (
        <CheckinDetail
          checkin={selectedCheckin}
          questions={questions}
          open={!!selectedCheckin}
          onOpenChange={(open) => !open && setSelectedCheckin(null)}
        />
      )}
    </>
  );
}
