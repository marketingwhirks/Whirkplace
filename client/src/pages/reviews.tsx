import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow, formatDistance, format, startOfWeek, addWeeks, differenceInDays } from "date-fns";
import { 
  CheckCircle, XCircle, Clock, Eye, MessageSquare, Filter, Calendar, User, AlertCircle, Send, UserMinus, Bell,
  Plane, Download, Users, TrendingDown, TrendingUp, ChevronLeft, ChevronRight, Activity, BellRing
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
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiRequest, queryClient } from "@/lib/queryClient";
import RatingStars from "@/components/checkin/rating-stars";
import { cn } from "@/lib/utils";
import Papa from "papaparse";
import { getCheckinDueDate, getWeekStartCentral } from "@shared/utils/dueDates";
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

interface TeamMemberStatus {
  user: UserType;
  checkin: Checkin | null;
  vacation: Vacation | null;
  status: 'submitted' | 'missing' | 'on-vacation' | 'overdue';
  submittedAt?: Date;
  daysOverdue?: number;
  moodRating?: number;
  teamName?: string;
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
  
  // Reminder state
  const [showBulkReminderDialog, setShowBulkReminderDialog] = useState(false);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [remindersSent, setRemindersSent] = useState<Set<string>>(new Set());
  
  // Calculate the week we're viewing
  const viewingWeekStart = useMemo(() => {
    return addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), selectedWeek);
  }, [selectedWeek]);
  
  const viewingWeekEnd = useMemo(() => {
    return addWeeks(viewingWeekStart, 1);
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

  // Fetch users without check-ins  
  const { data: missingCheckins = [], isLoading: missingLoading } = useQuery<UserWithoutCheckin[]>({
    queryKey: ["/api/checkins/missing"],
    enabled: !userLoading && !!currentUser && (currentUser.role === "manager" || currentUser.role === "admin"),
  });

  // Fetch questions for display context
  const { data: questions = [] } = useQuery<Question[]>({
    queryKey: ["/api/questions"],
  });

  // Fetch team members for filtering
  const { data: teamMembers = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    enabled: !!currentUser,
  });

  // Fetch all users (for admins) or team members (for managers)
  const { data: allUsers = [], isLoading: usersLoading } = useQuery<UserType[]>({
    queryKey: currentUser?.role === 'admin' 
      ? ["/api/users?includeInactive=false"]
      : ["/api/users", currentUser?.id, "reports"],
    queryFn: async () => {
      if (!currentUser) return [];
      
      if (currentUser.role === 'admin') {
        const response = await apiRequest("GET", "/api/users?includeInactive=false");
        if (!response.ok) throw new Error('Failed to fetch users');
        return response.json();
      }
      
      // Managers see their direct reports
      if (currentUser.role === 'manager') {
        const response = await apiRequest("GET", `/api/users/${currentUser.id}/reports`);
        if (!response.ok) throw new Error('Failed to fetch reports');
        return response.json();
      }
      
      return [];
    },
    enabled: !!currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager'),
  });

  // Fetch check-ins for the selected week
  const { data: weekCheckins = [], isLoading: checkinsLoading } = useQuery<Checkin[]>({
    queryKey: ["/api/checkins", "week", viewingWeekStart.toISOString()],
    queryFn: async () => {
      if (!currentUser || allUsers.length === 0) return [];
      
      // Fetch check-ins for all visible users for this specific week
      const response = await apiRequest("GET", `/api/checkins?weekStart=${viewingWeekStart.toISOString()}`);
      if (response.ok) {
        const checkins = await response.json();
        // Filter to only include check-ins from users we can see
        const userIds = new Set(allUsers.map(u => u.id));
        return checkins.filter((c: Checkin) => userIds.has(c.userId));
      }
      
      return [];
    },
    enabled: !!currentUser && allUsers.length > 0,
  });

  // Fetch vacations for all team members
  const { data: allVacations = [], isLoading: vacationsLoading } = useQuery<Vacation[]>({
    queryKey: ["/api/vacations/team", allUsers.map(u => u.id).join(','), viewingWeekStart.toISOString()],
    queryFn: async () => {
      if (!currentUser || allUsers.length === 0) return [];
      
      const vacations: Vacation[] = [];
      
      // Batch fetch vacations
      for (const user of allUsers) {
        try {
          const response = await apiRequest("GET", `/api/vacations?userId=${user.id}`);
          if (response.ok) {
            const userVacations = await response.json();
            vacations.push(...userVacations);
          }
        } catch (error) {
          console.error(`Failed to fetch vacations for ${user.name}:`, error);
        }
      }
      
      return vacations;
    },
    enabled: !!currentUser && allUsers.length > 0,
  });

  // Process team member statuses
  const teamMemberStatuses = useMemo((): TeamMemberStatus[] => {
    if (!allUsers.length) return [];
    
    const dueDate = organization ? getCheckinDueDate(organization) : new Date();
    const now = new Date();
    
    return allUsers.map(user => {
      // Find check-in for this week
      const checkin = weekCheckins.find(c => 
        c.userId === user.id && 
        new Date(c.weekOf) >= viewingWeekStart && 
        new Date(c.weekOf) < viewingWeekEnd
      );
      
      // Check if user is on vacation this week
      const vacation = allVacations.find(v => 
        v.userId === user.id && 
        new Date(v.weekOf).getTime() === viewingWeekStart.getTime()
      );
      
      // Find team name
      const team = teams.find(t => t.id === user.teamId);
      
      // Determine status
      let status: TeamMemberStatus['status'] = 'missing';
      let daysOverdue: number | undefined;
      
      if (vacation) {
        status = 'on-vacation';
      } else if (checkin) {
        status = 'submitted';
      } else if (selectedWeek === 0 && now > dueDate) {
        // Only show overdue for current week
        status = 'overdue';
        daysOverdue = Math.floor(differenceInDays(now, dueDate));
      }
      
      return {
        user,
        checkin,
        vacation,
        status,
        submittedAt: checkin ? new Date(checkin.createdAt) : undefined,
        daysOverdue,
        moodRating: checkin?.overallMood,
        teamName: team?.name,
      };
    });
  }, [allUsers, weekCheckins, allVacations, teams, organization, viewingWeekStart, viewingWeekEnd, selectedWeek]);

  // Apply filters for team status
  const filteredStatuses = useMemo(() => {
    let filtered = [...teamMemberStatuses];
    
    // Team filter
    if (selectedTeam !== "all") {
      filtered = filtered.filter(s => s.user.teamId === selectedTeam);
    }
    
    // Status filter
    if (statusFilter !== "all") {
      switch (statusFilter) {
        case "submitted":
          filtered = filtered.filter(s => s.status === 'submitted');
          break;
        case "missing":
          filtered = filtered.filter(s => s.status === 'missing' || s.status === 'overdue');
          break;
        case "on-vacation":
          filtered = filtered.filter(s => s.status === 'on-vacation');
          break;
      }
    }
    
    // Sort by status (overdue first, then missing, then vacation, then submitted)
    filtered.sort((a, b) => {
      const statusOrder = { overdue: 0, missing: 1, 'on-vacation': 2, submitted: 3 };
      return statusOrder[a.status] - statusOrder[b.status];
    });
    
    return filtered;
  }, [teamMemberStatuses, selectedTeam, statusFilter]);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = filteredStatuses.length;
    const submitted = filteredStatuses.filter(s => s.status === 'submitted').length;
    const missing = filteredStatuses.filter(s => s.status === 'missing').length;
    const overdue = filteredStatuses.filter(s => s.status === 'overdue').length;
    const onVacation = filteredStatuses.filter(s => s.status === 'on-vacation').length;
    
    const submissionRate = total > 0 ? Math.round((submitted / (total - onVacation)) * 100) : 0;
    
    return { total, submitted, missing, overdue, onVacation, submissionRate };
  }, [filteredStatuses]);

  // Review mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ checkinId, reviewData }: { checkinId: string; reviewData: ReviewCheckin }) => {
      const response = await apiRequest("PATCH", `/api/checkins/${checkinId}/review`, reviewData);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkins/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkins/review-status"] });
      toast({
        title: "Review submitted",
        description: "Check-in has been reviewed successfully.",
      });
      setReviewModal(null);
      setReviewComment("");
      setResponseComments({});
      setAddToOneOnOne(false);
      setFlagForFollowUp(false);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Review failed",
        description: error.message || "Failed to submit review",
      });
    },
  });

  // Reminder mutation
  const reminderMutation = useMutation({
    mutationFn: async ({ userIds, weekStart }: { userIds: string | string[]; weekStart?: string }) => {
      const response = await apiRequest("POST", "/api/checkins/send-reminder", { 
        userIds: Array.isArray(userIds) ? userIds : [userIds],
        weekStart: weekStart || viewingWeekStart.toISOString()
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send reminders');
      }
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkins/missing"] });
      const { results } = data;
      if (results?.sent?.length > 0) {
        toast({
          title: "Reminders sent",
          description: `Successfully sent ${results.sent.length} reminder${results.sent.length === 1 ? '' : 's'}.`,
        });
        // Track which reminders were sent
        const newRemindersSent = new Set(remindersSent);
        results.sent.forEach((userName: string) => {
          // Find user ID from name
          const user = filteredStatuses.find(s => s.user.name === userName)?.user;
          if (user) {
            newRemindersSent.add(`${user.id}-${viewingWeekStart.toISOString()}`);
          }
        });
        setRemindersSent(newRemindersSent);
      }
      if (results?.failed?.length > 0) {
        const failedReasons = results.failed.map((f: any) => f.reason).slice(0, 3).join(', ');
        toast({
          variant: "destructive",
          title: "Some reminders failed",
          description: failedReasons + (results.failed.length > 3 ? '...' : ''),
        });
      }
      setSelectedReminders(new Set());
      setSendingReminder(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to send reminders",
        description: error.message || "An error occurred while sending reminders",
      });
      setSendingReminder(null);
    },
  });

  // Handle review submission
  const handleReview = async () => {
    if (!reviewModal) return;

    // Filter out empty response comments
    const filteredResponseComments = Object.fromEntries(
      Object.entries(responseComments).filter(([_, comment]) => comment.trim() !== "")
    );

    const reviewData: ReviewCheckin = {
      reviewStatus: "reviewed",
      reviewComments: reviewComment.trim() || undefined,
      responseComments: Object.keys(filteredResponseComments).length > 0 ? filteredResponseComments : undefined,
      addToOneOnOne: addToOneOnOne,
      flagForFollowUp: flagForFollowUp,
    };

    reviewMutation.mutate({
      checkinId: reviewModal.checkin.id,
      reviewData,
    });
  };

  // Handle sending individual reminder
  const handleSendIndividualReminder = (userId: string) => {
    setSendingReminder(userId);
    reminderMutation.mutate({ userIds: userId });
  };

  // Handle sending bulk reminders
  const handleSendBulkReminders = () => {
    const userIdsToRemind = filteredStatuses
      .filter(s => s.status === 'missing' || s.status === 'overdue')
      .map(s => s.user.id);
    
    if (userIdsToRemind.length === 0) {
      toast({
        title: "No reminders to send",
        description: "All team members have submitted their check-ins.",
      });
      return;
    }
    
    setSendingReminder('bulk');
    reminderMutation.mutate({ userIds: userIdsToRemind });
    setShowBulkReminderDialog(false);
  };

  // Check if reminder was already sent
  const wasReminderSent = (userId: string) => {
    return remindersSent.has(`${userId}-${viewingWeekStart.toISOString()}`);
  };

  // Handle sending reminders
  const handleSendReminders = () => {
    const userIds = Array.from(selectedReminders);
    if (userIds.length === 0) {
      toast({
        variant: "destructive",
        title: "No users selected",
        description: "Please select at least one user to send reminders to.",
      });
      return;
    }
    reminderMutation.mutate(userIds);
  };

  // Toggle reminder selection
  const toggleReminderSelection = (userId: string) => {
    const newSet = new Set(selectedReminders);
    if (newSet.has(userId)) {
      newSet.delete(userId);
    } else {
      newSet.add(userId);
    }
    setSelectedReminders(newSet);
  };

  // Toggle select all reminders
  const toggleSelectAllReminders = () => {
    if (selectedReminders.size === missingCheckins.length) {
      setSelectedReminders(new Set());
    } else {
      setSelectedReminders(new Set(missingCheckins.map(item => item.user.id)));
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const csvData = filteredStatuses.map(status => ({
      'Team Member': status.user.name,
      'Email': status.user.email,
      'Team': status.teamName || 'No Team',
      'Status': status.status === 'on-vacation' ? 'On Vacation' : 
                status.status === 'submitted' ? 'Submitted' : 
                status.status === 'overdue' ? 'Overdue' : 'Not Submitted',
      'Submitted At': status.submittedAt ? format(status.submittedAt, 'MMM dd, yyyy HH:mm') : '',
      'Mood Rating': status.moodRating || '',
      'Days Overdue': status.daysOverdue || '',
      'Vacation Note': status.vacation?.note || '',
    }));
    
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `team-checkin-status-${format(viewingWeekStart, 'yyyy-MM-dd')}.csv`;
    link.click();
    
    toast({
      title: "Export successful",
      description: "Team check-in status has been exported to CSV.",
    });
  };

  // Filter checkins based on selected filters
  const filterCheckins = (checkins: EnhancedCheckin[]) => {
    return checkins.filter(checkin => {
      if (selectedUser !== "all" && checkin.user?.id !== selectedUser) {
        return false;
      }
      return true;
    });
  };

  const filteredPending = filterCheckins(pendingCheckins);
  const filteredReviewed = filterCheckins(reviewedCheckins);

  // Show access denied for non-managers/admins
  if (!userLoading && currentUser && currentUser.role === "member") {
    return (
      <main className="flex-1 overflow-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
            <p className="text-muted-foreground">
              You need manager or admin privileges to access the review interface.
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
      <main className="flex-1 overflow-auto p-6 space-y-8">
        {/* REVIEWS SECTION */}
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">Reviews & Team Status</h2>
            <p className="text-muted-foreground">Review check-ins and monitor team submission status</p>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Pending Reviews</p>
                    <p className="text-2xl font-bold text-orange-600" data-testid="text-pending-count">
                      {pendingCheckins.length}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Awaiting your review
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
                    <p className="text-sm font-medium text-muted-foreground">Reviewed This Week</p>
                    <p className="text-2xl font-bold text-blue-600" data-testid="text-reviewed-count">
                      {reviewedCheckins.filter(c => 
                        new Date(c.reviewedAt!).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
                      ).length}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last 7 days
                    </p>
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
                    <p className="text-sm font-medium text-muted-foreground">Team Members</p>
                    <p className="text-2xl font-bold text-blue-600" data-testid="text-team-members-count">
                      {teamMembers.length}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Under your review
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <User className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-48">
                  <Select value={selectedUser} onValueChange={setSelectedUser}>
                    <SelectTrigger data-testid="select-user-filter">
                      <SelectValue placeholder="Filter by team member" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Team Members</SelectItem>
                      {teamMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs for different review states */}
          <Tabs defaultValue="pending" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pending" data-testid="tab-pending">
                Pending ({filteredPending.length})
              </TabsTrigger>
              <TabsTrigger value="reviewed" data-testid="tab-reviewed">
                Reviewed ({filteredReviewed.length})
              </TabsTrigger>
              <TabsTrigger value="missing" data-testid="tab-missing">
                Missing ({missingCheckins.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              <Card>
                <CardHeader>
                  <CardTitle>Pending Reviews</CardTitle>
                  <CardDescription>
                    Check-ins waiting for your review and approval
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {pendingLoading ? (
                    <div className="space-y-4">
                      {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-32 w-full" />
                      ))}
                    </div>
                  ) : filteredPending.length === 0 ? (
                    <div className="text-center py-8">
                      <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Pending Reviews</h3>
                      <p className="text-muted-foreground">
                        All check-ins have been reviewed. Great job!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredPending.map((checkin) => (
                        <CheckinReviewCard
                          key={checkin.id}
                          checkin={checkin}
                          questions={questions}
                          onReview={() => setReviewModal({ checkin })}
                          isPending
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reviewed">
              <Card>
                <CardHeader>
                  <CardTitle>Reviewed Check-ins</CardTitle>
                  <CardDescription>
                    Previously reviewed check-ins from your team
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {reviewedLoading ? (
                    <div className="space-y-4">
                      {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-32 w-full" />
                      ))}
                    </div>
                  ) : filteredReviewed.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Reviewed Check-ins</h3>
                      <p className="text-muted-foreground">
                        No check-ins have been reviewed yet.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredReviewed.slice(0, 10).map((checkin) => (
                        <CheckinReviewCard
                          key={checkin.id}
                          checkin={checkin}
                          questions={questions}
                          onReview={() => {}}
                          isPending={false}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="missing">
              <Card>
                <CardHeader>
                  <CardTitle>Missing Check-ins</CardTitle>
                  <CardDescription>
                    Team members who haven't submitted their check-ins for this week
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {missingLoading ? (
                    <div className="space-y-4">
                      {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                      ))}
                    </div>
                  ) : missingCheckins.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">All Check-ins Submitted</h3>
                      <p className="text-muted-foreground">
                        Great job! All team members have submitted their check-ins this week.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Select All and Send Reminders Button */}
                      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                        <label className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedReminders.size === missingCheckins.length && missingCheckins.length > 0}
                            onCheckedChange={toggleSelectAllReminders}
                            data-testid="checkbox-select-all-reminders"
                          />
                          <span className="text-sm font-medium">
                            Select All ({missingCheckins.length})
                          </span>
                        </label>
                        <Button
                          onClick={handleSendReminders}
                          disabled={selectedReminders.size === 0 || reminderMutation.isPending}
                          size="sm"
                          className="gap-2"
                          data-testid="button-send-reminders"
                        >
                          <Send className="w-4 h-4" />
                          {reminderMutation.isPending 
                            ? "Sending..." 
                            : `Send Reminders (${selectedReminders.size})`}
                        </Button>
                      </div>

                      {/* Missing Check-ins List */}
                      {missingCheckins.map((item) => (
                        <div 
                          key={item.user.id} 
                          className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                          data-testid={`missing-checkin-${item.user.id}`}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={selectedReminders.has(item.user.id)}
                              onCheckedChange={() => toggleReminderSelection(item.user.id)}
                              className="mt-1"
                              data-testid={`checkbox-reminder-${item.user.id}`}
                            />
                            
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium" data-testid={`text-user-name-${item.user.id}`}>
                                    {item.user.name}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {item.user.teamName || "No Team"} • {item.user.email}
                                  </p>
                                </div>
                                
                                {/* Warning icon if no Slack connected */}
                                {!item.user.slackUserId && (
                                  <div className="flex items-center gap-1 text-yellow-600">
                                    <AlertCircle className="w-4 h-4" />
                                    <span className="text-xs">No Slack</span>
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                {item.lastCheckin ? (
                                  <>
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      Last check-in: {item.daysSinceLastCheckin} days ago
                                    </span>
                                  </>
                                ) : (
                                  <span className="flex items-center gap-1 text-orange-600">
                                    <UserMinus className="w-3 h-3" />
                                    Never submitted a check-in
                                  </span>
                                )}
                                
                                {item.lastReminderSent && (
                                  <span className="flex items-center gap-1">
                                    <Bell className="w-3 h-3" />
                                    Reminded: {formatDistanceToNow(new Date(item.lastReminderSent))} ago
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <Separator className="my-8" />

        {/* TEAM CHECK-IN STATUS SECTION */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5" />
            <h2 className="text-xl font-bold">Team Check-in Status</h2>
          </div>

          {/* Week Navigation */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setSelectedWeek(selectedWeek - 1)}
                  disabled={selectedWeek <= -12} // Limit to 12 weeks back
                  className="flex items-center gap-2"
                  data-testid="button-prev-week"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous Week
                </Button>
                
                <div className="text-center">
                  <h3 className="font-semibold text-lg">
                    Week of {format(viewingWeekStart, 'MMMM d, yyyy')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedWeek === 0 ? 'Current Week' : 
                     selectedWeek === -1 ? 'Last Week' : 
                     `${Math.abs(selectedWeek)} weeks ${selectedWeek < 0 ? 'ago' : 'ahead'}`}
                  </p>
                </div>
                
                <Button
                  variant="outline"
                  onClick={() => setSelectedWeek(selectedWeek + 1)}
                  disabled={selectedWeek >= 0} // Can't go to future
                  className="flex items-center gap-2"
                  data-testid="button-next-week"
                >
                  Next Week
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Statistics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total</p>
                    <p className="text-2xl font-bold">{stats.total}</p>
                  </div>
                  <Users className="w-8 h-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Submitted</p>
                    <p className="text-2xl font-bold text-green-600">{stats.submitted}</p>
                  </div>
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Missing</p>
                    <p className="text-2xl font-bold text-yellow-600">{stats.missing}</p>
                  </div>
                  <Clock className="w-8 h-8 text-yellow-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Overdue</p>
                    <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
                  </div>
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Rate</p>
                    <p className="text-2xl font-bold">
                      {stats.submissionRate}%
                    </p>
                  </div>
                  {stats.submissionRate >= 80 ? (
                    <TrendingUp className="w-8 h-8 text-green-600" />
                  ) : (
                    <TrendingDown className="w-8 h-8 text-red-600" />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters and Export */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger className="w-full sm:w-48" data-testid="select-team-filter">
                <SelectValue placeholder="Filter by team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {teams.map(team => (
                  <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="missing">Not Submitted</SelectItem>
                <SelectItem value="on-vacation">On Vacation</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="flex-1" />
            
            {/* Only show reminder button for current week and if Slack is enabled */}
            {selectedWeek === 0 && organization?.enableSlackIntegration && (
              filteredStatuses.some(s => s.status === 'missing' || s.status === 'overdue') && (
                <Button
                  onClick={() => setShowBulkReminderDialog(true)}
                  variant="default"
                  className="flex items-center gap-2"
                  disabled={sendingReminder === 'bulk'}
                  data-testid="button-send-all-reminders"
                >
                  <BellRing className="w-4 h-4" />
                  {sendingReminder === 'bulk' ? 'Sending...' : 'Send All Reminders'}
                </Button>
              )
            )}
            
            <Button
              onClick={handleExportCSV}
              variant="outline"
              className="flex items-center gap-2"
              data-testid="button-export-csv"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          </div>

          {/* Team Member Grid */}
          {usersLoading || checkinsLoading || vacationsLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : filteredStatuses.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No team members found</h3>
                <p className="text-muted-foreground">
                  Adjust your filters to see team members.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredStatuses.map(status => (
                <Card 
                  key={status.user.id} 
                  className={cn(
                    "transition-all hover:shadow-lg",
                    status.status === 'overdue' && "border-red-500 dark:border-red-600",
                    status.status === 'missing' && "border-yellow-500 dark:border-yellow-600",
                    status.status === 'submitted' && "border-green-500 dark:border-green-600",
                    status.status === 'on-vacation' && "border-blue-500 dark:border-blue-600"
                  )}
                  data-testid={`card-member-${status.user.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${status.user.name}`} />
                          <AvatarFallback>
                            {status.user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h4 className="font-semibold text-sm">{status.user.name}</h4>
                          {status.teamName && (
                            <p className="text-xs text-muted-foreground">{status.teamName}</p>
                          )}
                        </div>
                      </div>
                      
                      {status.status === 'submitted' && (
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                      )}
                      {status.status === 'missing' && (
                        <Clock className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                      )}
                      {status.status === 'overdue' && (
                        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                      )}
                      {status.status === 'on-vacation' && (
                        <Plane className="w-5 h-5 text-blue-600 flex-shrink-0" />
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Status</span>
                        <Badge 
                          variant={
                            status.status === 'submitted' ? 'default' :
                            status.status === 'on-vacation' ? 'secondary' :
                            status.status === 'overdue' ? 'destructive' : 'outline'
                          }
                          className={cn(
                            "text-xs",
                            status.status === 'submitted' && "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
                            status.status === 'missing' && "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
                            status.status === 'overdue' && "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
                            status.status === 'on-vacation' && "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                          )}
                        >
                          {status.status === 'on-vacation' ? 'On Vacation' :
                           status.status === 'submitted' ? 'Submitted' :
                           status.status === 'overdue' ? 'Overdue' : 'Not Submitted'}
                        </Badge>
                      </div>
                      
                      {status.status === 'submitted' && status.submittedAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">Submitted</span>
                          <span className="text-xs">
                            {format(status.submittedAt, 'MMM d, h:mm a')}
                          </span>
                        </div>
                      )}
                      
                      {status.moodRating && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">Mood</span>
                          <RatingStars rating={status.moodRating} size="xs" />
                        </div>
                      )}
                      
                      {status.daysOverdue !== undefined && status.daysOverdue > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">Overdue</span>
                          <span className="text-xs text-red-600 font-medium">
                            {status.daysOverdue} {status.daysOverdue === 1 ? 'day' : 'days'}
                          </span>
                        </div>
                      )}
                      
                      {status.vacation?.note && (
                        <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded text-xs">
                          {status.vacation.note}
                        </div>
                      )}
                      
                      {/* Send Reminder button for missing/overdue check-ins */}
                      {selectedWeek === 0 && organization?.enableSlackIntegration && 
                       (status.status === 'missing' || status.status === 'overdue') && (
                        <div className="mt-3 pt-3 border-t">
                          {wasReminderSent(status.user.id) ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <CheckCircle className="w-3 h-3" />
                              Reminder sent
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSendIndividualReminder(status.user.id)}
                              disabled={sendingReminder === status.user.id || sendingReminder === 'bulk'}
                              className="w-full flex items-center gap-2"
                              data-testid={`button-send-reminder-${status.user.id}`}
                            >
                              <Bell className="w-3 h-3" />
                              {sendingReminder === status.user.id ? 'Sending...' : 'Send Reminder'}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Bulk Reminder Confirmation Dialog */}
      <AlertDialog open={showBulkReminderDialog} onOpenChange={setShowBulkReminderDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Reminders to All</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to send check-in reminders to {
                filteredStatuses.filter(s => s.status === 'missing' || s.status === 'overdue').length
              } team members who haven't submitted their check-ins for the week of {
                format(viewingWeekStart, 'MMMM d, yyyy')
              }.
              <br /><br />
              Each person will receive a personalized Slack message with instructions to complete their check-in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendBulkReminders}>
              Send All Reminders
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Review Modal */}
      {reviewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-600" />
                Review Check-in
              </CardTitle>
              <CardDescription>
                Review check-in from {reviewModal.checkin.user?.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Check-in Details */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Overall Mood:</span>
                  <RatingStars rating={reviewModal.checkin.overallMood} readonly size="sm" />
                </div>
                
                <div className="space-y-4">
                  <span className="text-sm font-medium">Responses & Feedback:</span>
                  {Object.entries(reviewModal.checkin.responses as Record<string, string>).map(([questionId, response]) => {
                    const question = questions.find(q => q.id === questionId);
                    return (
                      <div key={questionId} className="border border-muted rounded-lg p-4 space-y-3">
                        <div>
                          <p className="text-sm font-medium mb-2 text-blue-600">
                            {question?.text || "Question"}
                          </p>
                          <div className="bg-muted p-3 rounded-md">
                            <p className="text-sm">{response}</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">
                            Your feedback on this response:
                          </label>
                          <textarea
                            value={responseComments[questionId] || ""}
                            onChange={(e) => setResponseComments(prev => ({
                              ...prev,
                              [questionId]: e.target.value
                            }))}
                            placeholder="Add feedback, ask follow-up questions, or provide guidance..."
                            className="w-full min-h-[60px] p-2 text-sm border border-input rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                            data-testid={`textarea-response-comment-${questionId}`}
                          />
                          <p className="text-xs text-muted-foreground">
                            {500 - (responseComments[questionId]?.length || 0)} characters remaining
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div className="text-sm text-muted-foreground">
                  Submitted {formatDistanceToNow(new Date(reviewModal.checkin.createdAt))} ago
                </div>
              </div>

              {/* Review Options */}
              <div className="space-y-4">
                <div className="space-y-3">
                  <label className="text-sm font-medium">Review Actions</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={addToOneOnOne}
                        onChange={(e) => setAddToOneOnOne(e.target.checked)}
                        className="rounded border-gray-300"
                        data-testid="checkbox-add-to-one-on-one"
                      />
                      <span className="text-sm">Add to 1-on-1 agenda</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={flagForFollowUp}
                        onChange={(e) => setFlagForFollowUp(e.target.checked)}
                        className="rounded border-gray-300"
                        data-testid="checkbox-flag-for-follow-up"
                      />
                      <span className="text-sm">Flag for follow-up</span>
                    </label>
                  </div>
                </div>
                
                <div className="space-y-2 border-t pt-4">
                  <label className="text-sm font-medium">Overall Review Comments</label>
                  <textarea
                    className="w-full p-3 border rounded-lg resize-none"
                    rows={3}
                    placeholder="Add general feedback, overall observations, or team-level notes..."
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    data-testid="textarea-review-comment"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional: Use this for overall feedback that applies to the entire check-in
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setReviewModal(null);
                    setReviewComment("");
                    setResponseComments({});
                    setAddToOneOnOne(false);
                    setFlagForFollowUp(false);
                  }}
                  data-testid="button-cancel-review"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleReview}
                  disabled={reviewMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-confirm-review"
                >
                  {reviewMutation.isPending ? "Submitting..." : "Mark as Reviewed"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

// Checkin Review Card Component
interface CheckinReviewCardProps {
  checkin: EnhancedCheckin;
  questions: Question[];
  onReview: () => void;
  isPending: boolean;
}

function CheckinReviewCard({ checkin, questions, onReview, isPending }: CheckinReviewCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="border border-border rounded-lg p-4 space-y-4" data-testid={`checkin-card-${checkin.id}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-medium">
              {checkin.user?.name?.[0] || "?"}
            </span>
          </div>
          <div>
            <p className="font-medium" data-testid={`text-user-name-${checkin.id}`}>
              {checkin.user?.name || "Unknown User"}
            </p>
            <p className="text-sm text-muted-foreground">
              {checkin.user?.teamName || "No Team"} • {formatDistanceToNow(new Date(checkin.createdAt))} ago
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Badge 
            variant={checkin.reviewStatus === "pending" ? "secondary" : "default"}
            data-testid={`badge-status-${checkin.id}`}
          >
            {checkin.reviewStatus}
          </Badge>
          <RatingStars rating={checkin.overallMood} readonly size="sm" />
        </div>
      </div>

      {/* Quick Preview */}
      <div className="bg-muted p-3 rounded-lg">
        <p className="text-sm">
          {Object.values(checkin.responses as Record<string, string>)[0] || "No responses provided"}
        </p>
      </div>

      {/* Review Info for reviewed items */}
      {!isPending && checkin.reviewer && (
        <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
          Reviewed by {checkin.reviewer.name} {checkin.reviewedAt && formatDistanceToNow(new Date(checkin.reviewedAt))} ago
          {checkin.reviewComments && (
            <div className="mt-1">
              <MessageSquare className="w-3 h-3 inline mr-1" />
              {checkin.reviewComments}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails(!showDetails)}
          data-testid={`button-toggle-details-${checkin.id}`}
        >
          <Eye className="w-4 h-4 mr-2" />
          {showDetails ? "Hide" : "Show"} Details
        </Button>
        
        {isPending && (
          <Button
            size="sm"
            onClick={() => onReview()}
            className="bg-blue-600 hover:bg-blue-700"
            data-testid={`button-review-${checkin.id}`}
          >
            <Eye className="w-4 h-4 mr-2" />
            Review
          </Button>
        )}
      </div>

      {/* Expanded Details */}
      {showDetails && (
        <div className="border-t pt-4 space-y-3">
          {Object.entries(checkin.responses as Record<string, string>).map(([questionId, response]) => {
            const question = questions.find(q => q.id === questionId);
            return (
              <div key={questionId} className="space-y-1">
                <p className="text-sm font-medium">
                  {question?.text || "Question"}
                </p>
                <p className="text-sm text-muted-foreground bg-muted p-2 rounded">
                  {response}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}