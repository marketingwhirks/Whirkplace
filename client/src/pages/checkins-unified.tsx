import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDistanceToNow, startOfWeek, addWeeks, isSameWeek, format, isToday, isPast } from "date-fns";
import { 
  ClipboardCheck, Clock, CheckCircle, XCircle, AlertCircle, Plus, Calendar, 
  Heart, MessageCircle, Smile, Flag, UserPlus, CheckCheck, Plane, Users,
  Eye, MessageSquare, Filter, User as UserIcon, Bell, UserMinus, Building, TrendingUp
} from "lucide-react";
import { getCheckinWeekFriday, getCheckinDueDate } from "@shared/utils/dueDates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { queryClient, apiRequest } from "@/lib/queryClient";
import RatingStars from "@/components/checkin/rating-stars";
import CheckinDetail from "@/components/checkin/checkin-detail";
import ReviewModal from "@/components/checkin/review-modal";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

import type { Checkin, Question, User, InsertCheckin } from "@shared/schema";

// Common emoji options for quick selection
const COMMON_EMOJIS = ["😊", "😟", "🎯", "💪", "🤔", "😌", "😤", "🚀", "❤️", "✅"];

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

interface UserWithoutCheckin {
  user: User & {
    teamName?: string | null;
  };
  lastCheckin: Checkin | null;
  daysSinceLastCheckin: number | null;
  lastReminderSent: Date | null;
}

// Client-side form schema for check-in submission
const createCheckinFormSchema = (questions: Question[]) => {
  return z.object({
    overallMood: z.number().min(1, "Please provide a mood rating").max(5, "Rating must be between 1 and 5"),
    responses: z.record(z.string().min(1, "Please provide a response"))
      .refine(
        (responses) => {
          const responseCount = Object.keys(responses).filter(key => responses[key] && responses[key].trim() !== '').length;
          return responseCount > 0;
        },
        { message: "Please answer at least one question before submitting" }
      )
      .refine(
        (responses) => {
          const missingResponses = questions.filter(q => !responses[q.id] || responses[q.id].trim() === '');
          return missingResponses.length === 0;
        },
        { message: "Please answer all questions before submitting" }
      ),
    responseEmojis: z.record(z.string()).optional().default({}),
    responseFlags: z.record(z.object({
      addToOneOnOne: z.boolean().default(false),
      flagForFollowUp: z.boolean().default(false),
    })).optional().default({}),
  });
};

export default function UnifiedCheckins() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedWeekStart, setSelectedWeekStart] = useState<Date | null>(null);
  const [expandedResponses, setExpandedResponses] = useState<Record<string, boolean>>({});
  const [selectedCheckin, setSelectedCheckin] = useState<Checkin | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [reviewModal, setReviewModal] = useState<{ checkin: EnhancedCheckin } | null>(null);
  const [selectedReminders, setSelectedReminders] = useState<Set<string>>(new Set());

  // Tour management
  const tourManager = useManagedTour(TOUR_IDS.CHECKINS);

  // Determine user permissions
  const isManager = currentUser?.role === "manager";
  const isAdmin = currentUser?.role === "admin";
  const canReview = isManager || isAdmin;
  const canViewOrganization = isAdmin || currentUser?.canViewAllTeams;

  // Fetch current week's questions
  const { data: questions = [], isLoading: questionsLoading } = useQuery<Question[]>({
    queryKey: ["/api/questions/current"],
    enabled: !userLoading && !!currentUser,
  });

  // Fetch user's check-ins
  const { data: myCheckins = [], isLoading: myCheckinsLoading, refetch: refetchMyCheckins } = useQuery<Checkin[]>({
    queryKey: [`/api/checkins/user/${currentUser?.id}`],
    enabled: !userLoading && !!currentUser,
  });

  // Fetch pending check-ins for review (managers/admins)
  const { data: pendingCheckins = [], isLoading: pendingLoading } = useQuery<EnhancedCheckin[]>({
    queryKey: ["/api/checkins/pending"],
    enabled: !userLoading && canReview,
  });

  // Fetch recently reviewed check-ins (managers/admins)
  const { data: reviewedCheckins = [], isLoading: reviewedLoading } = useQuery<EnhancedCheckin[]>({
    queryKey: ["/api/checkins/review-status", "reviewed"],
    enabled: !userLoading && canReview,
  });

  // Fetch users without check-ins (managers/admins)
  const { data: missingCheckins = [], isLoading: missingLoading } = useQuery<UserWithoutCheckin[]>({
    queryKey: ["/api/checkins/missing"],
    enabled: !userLoading && canReview,
  });

  // Fetch organization-wide check-ins (admins only)
  const { data: organizationCheckins = [], isLoading: orgCheckinsLoading } = useQuery<EnhancedCheckin[]>({
    queryKey: ["/api/checkins/organization"],
    enabled: !userLoading && canViewOrganization,
  });

  // Fetch all teams for organization view filter
  const { data: teams = [], isLoading: teamsLoading } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/teams"],
    enabled: !userLoading && canViewOrganization,
  });

  // Fetch user's vacation status
  const { data: vacationData, isLoading: vacationLoading } = useQuery<{ vacation: Vacation | null }>({
    queryKey: ["/api/user/vacation"],
    enabled: !userLoading && !!currentUser,
  });

  const isOnVacation = vacationData?.vacation && 
    new Date(vacationData.vacation.startDate) <= new Date() && 
    new Date(vacationData.vacation.endDate) >= new Date();

  // Check if current week's check-in exists
  const currentWeekCheckin = useMemo(() => {
    const friday = getCheckinWeekFriday();
    return myCheckins.find(checkin => 
      new Date(checkin.weekOf).toDateString() === friday.toDateString()
    );
  }, [myCheckins]);

  // Available weeks for late submission
  const availableWeeks = useMemo(() => {
    if (!currentUser) return [];
    
    const weeks: Array<{ start: Date, end: Date, friday: Date, label: string }> = [];
    const today = new Date();
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 6 });
    
    // Go back up to 4 weeks
    for (let i = 0; i < 4; i++) {
      const weekStart = addWeeks(currentWeekStart, -i);
      const friday = getCheckinWeekFriday(weekStart);
      
      // Skip if we already have a check-in for this week
      const hasCheckin = myCheckins.some(checkin => 
        new Date(checkin.weekOf).toDateString() === friday.toDateString()
      );
      
      if (!hasCheckin && isPast(friday)) {
        const label = i === 0 ? "This week" : i === 1 ? "Last week" : `${i} weeks ago`;
        weeks.push({
          start: weekStart,
          end: addWeeks(weekStart, 1),
          friday,
          label
        });
      }
    }
    
    return weeks;
  }, [myCheckins, currentUser]);

  // Form for check-in submission
  const form = useForm({
    resolver: zodResolver(createCheckinFormSchema(questions)),
    defaultValues: {
      overallMood: 0,
      responses: {} as Record<string, string>,
      responseEmojis: {} as Record<string, string>,
      responseFlags: {} as Record<string, { addToOneOnOne: boolean; flagForFollowUp: boolean }>,
    },
    mode: 'onSubmit'
  });

  // Submit check-in mutation
  const submitCheckinMutation = useMutation({
    mutationFn: async (data: any) => {
      const checkinData = {
        ...data,
        weekOf: selectedWeekStart ? getCheckinWeekFriday(selectedWeekStart).toISOString() : undefined
      };
      return apiRequest('/api/checkins', {
        method: 'POST',
        body: JSON.stringify(checkinData),
      });
    },
    onSuccess: () => {
      toast({ 
        title: "Check-in submitted!", 
        description: selectedWeekStart ? "Your late check-in has been recorded." : "Thank you for sharing your feedback." 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/checkins'] });
      refetchMyCheckins();
      setIsDialogOpen(false);
      form.reset();
      setSelectedWeekStart(null);
      
      if (tourManager.isActive) {
        tourManager.nextStep();
      }
    },
    onError: (error: any) => {
      console.error('Submit error:', error);
      toast({ 
        title: "Failed to submit check-in", 
        description: error.message || "Please try again later.",
        variant: "destructive" 
      });
    },
  });

  // Send reminder mutation
  const sendReminderMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      return apiRequest('/api/checkins/send-reminders', {
        method: 'POST',
        body: JSON.stringify({ userIds }),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Reminders sent",
        description: `Successfully sent ${data.sent} reminder${data.sent !== 1 ? 's' : ''}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/checkins/missing'] });
      setSelectedReminders(new Set());
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send reminders",
        description: error.message || "Please try again later",
        variant: "destructive",
      });
    },
  });

  // Handle check-in submission
  const onSubmit = (data: any) => {
    submitCheckinMutation.mutate(data);
  };

  // Filter logic for team check-ins
  const filteredPendingCheckins = useMemo(() => {
    let filtered = pendingCheckins;
    
    if (selectedFilter !== "all") {
      filtered = filtered.filter(c => c.status === selectedFilter);
    }
    
    if (selectedUser !== "all") {
      filtered = filtered.filter(c => c.userId === selectedUser);
    }
    
    return filtered;
  }, [pendingCheckins, selectedFilter, selectedUser]);

  // Filter logic for organization check-ins
  const filteredOrgCheckins = useMemo(() => {
    let filtered = organizationCheckins;
    
    if (selectedTeam !== "all") {
      filtered = filtered.filter(c => c.user?.teamId === selectedTeam);
    }
    
    if (selectedFilter !== "all") {
      filtered = filtered.filter(c => c.status === selectedFilter);
    }
    
    return filtered;
  }, [organizationCheckins, selectedTeam, selectedFilter]);

  // Get unique users from pending check-ins
  const uniqueUsers = useMemo(() => {
    const users = new Map();
    pendingCheckins.forEach(checkin => {
      if (checkin.user) {
        users.set(checkin.user.id, checkin.user);
      }
    });
    return Array.from(users.values());
  }, [pendingCheckins]);

  // Calculate stats for organization view
  const orgStats = useMemo(() => {
    const total = organizationCheckins.length;
    const pending = organizationCheckins.filter(c => c.status === "pending").length;
    const reviewed = organizationCheckins.filter(c => c.status === "reviewed").length;
    const avgMood = total > 0 
      ? organizationCheckins.reduce((sum, c) => sum + (c.overallMood || 0), 0) / total 
      : 0;
    
    return { total, pending, reviewed, avgMood };
  }, [organizationCheckins]);

  if (userLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const defaultTab = canReview ? "team" : "my-checkins";

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ClipboardCheck className="h-8 w-8 text-primary" />
          Check-ins
        </h1>
        <p className="text-muted-foreground mt-2">
          Submit weekly check-ins, review your team's feedback, and track organizational wellness
        </p>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList data-testid="tabs-checkin-views">
          <TabsTrigger value="my-checkins">
            <UserIcon className="mr-2 h-4 w-4" />
            My Check-ins
          </TabsTrigger>
          {canReview && (
            <TabsTrigger value="team">
              <Users className="mr-2 h-4 w-4" />
              Team Review
              {pendingCheckins.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {pendingCheckins.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
          {canViewOrganization && (
            <TabsTrigger value="organization">
              <Building className="mr-2 h-4 w-4" />
              Organization
            </TabsTrigger>
          )}
        </TabsList>

        {/* My Check-ins Tab */}
        <TabsContent value="my-checkins" className="space-y-4 mt-6">
          {/* Submit Check-in Card */}
          <Card data-testid="card-submit-checkin">
            <CardHeader>
              <CardTitle>Weekly Check-in</CardTitle>
              <CardDescription>
                {currentWeekCheckin 
                  ? `You submitted your check-in ${formatDistanceToNow(new Date(currentWeekCheckin.createdAt))} ago`
                  : isOnVacation 
                  ? "You're on vacation - check-in not required"
                  : `Due by ${format(getCheckinDueDate(), "EEEE, MMMM d")}`
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currentWeekCheckin ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="font-medium">Check-in completed</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedCheckin(currentWeekCheckin);
                        setIsDetailDialogOpen(true);
                      }}
                      data-testid="button-view-checkin"
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      View Details
                    </Button>
                  </div>
                </div>
              ) : isOnVacation ? (
                <div className="flex items-center gap-2 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <Plane className="h-5 w-5 text-blue-600" />
                  <span>Enjoy your vacation! No check-in required.</span>
                </div>
              ) : (
                <div className="space-y-4">
                  <TourGuide 
                    tourId={TOUR_IDS.CHECKINS}
                    currentStep={tourManager.currentStep}
                    isActive={tourManager.isActive}
                    onComplete={tourManager.completeTour}
                    onSkip={tourManager.skipTour}
                    onNext={tourManager.nextStep}
                    placement="bottom"
                  >
                    <Button
                      onClick={() => setIsDialogOpen(true)}
                      className="w-full"
                      size="lg"
                      data-testid="button-submit-checkin"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Submit This Week's Check-in
                    </Button>
                  </TourGuide>

                  {availableWeeks.length > 0 && (
                    <div className="pt-4 border-t">
                      <p className="text-sm text-muted-foreground mb-3">
                        Missed a previous week? Submit a late check-in:
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {availableWeeks.map((week) => (
                          <Button
                            key={week.friday.toISOString()}
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedWeekStart(week.start);
                              setIsDialogOpen(true);
                            }}
                            className="text-left"
                            data-testid={`button-late-checkin-${week.label.replace(/\s+/g, '-')}`}
                          >
                            <Clock className="mr-2 h-3 w-3 text-orange-500" />
                            <span className="text-xs">{week.label}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Check-in History */}
          <Card>
            <CardHeader>
              <CardTitle>Your Check-in History</CardTitle>
              <CardDescription>
                View your past check-ins and track your progress
              </CardDescription>
            </CardHeader>
            <CardContent>
              {myCheckinsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              ) : myCheckins.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No check-ins submitted yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myCheckins.slice(0, 5).map((checkin) => (
                    <div
                      key={checkin.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                      onClick={() => {
                        setSelectedCheckin(checkin);
                        setIsDetailDialogOpen(true);
                      }}
                      data-testid={`checkin-history-${checkin.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center">
                          <span className="text-2xl font-bold">
                            {format(new Date(checkin.weekOf), "d")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(checkin.weekOf), "MMM")}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">
                            Week of {format(new Date(checkin.weekOf), "MMMM d, yyyy")}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <RatingStars rating={checkin.overallMood} size="sm" readonly />
                            <Badge variant={checkin.status === "reviewed" ? "success" : "secondary"}>
                              {checkin.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Review Tab */}
        {canReview && (
          <TabsContent value="team" className="space-y-4 mt-6">
            {/* Filters */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Team Check-ins</CardTitle>
                  <div className="flex gap-2">
                    <Select value={selectedFilter} onValueChange={setSelectedFilter}>
                      <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="reviewed">Reviewed</SelectItem>
                      </SelectContent>
                    </Select>
                    {uniqueUsers.length > 0 && (
                      <Select value={selectedUser} onValueChange={setSelectedUser}>
                        <SelectTrigger className="w-[180px]" data-testid="select-user-filter">
                          <SelectValue placeholder="All team members" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All team members</SelectItem>
                          {uniqueUsers.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Pending Reviews */}
            <div className="grid gap-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Pending Reviews ({filteredPendingCheckins.filter(c => c.status === "pending").length})
              </h3>
              {pendingLoading ? (
                <div className="grid gap-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-32" />
                  ))}
                </div>
              ) : filteredPendingCheckins.filter(c => c.status === "pending").length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground">
                    <CheckCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>All check-ins have been reviewed!</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {filteredPendingCheckins
                    .filter(c => c.status === "pending")
                    .map((checkin) => (
                      <Card key={checkin.id} data-testid={`card-pending-checkin-${checkin.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <p className="font-semibold">{checkin.user?.name}</p>
                                {checkin.user?.teamName && (
                                  <Badge variant="outline">{checkin.user.teamName}</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span>Week of {format(new Date(checkin.weekOf), "MMM d, yyyy")}</span>
                                <RatingStars rating={checkin.overallMood} size="sm" readonly />
                                <span>{formatDistanceToNow(new Date(checkin.createdAt))} ago</span>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => setReviewModal({ checkin })}
                              data-testid={`button-review-${checkin.id}`}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Review
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              )}
            </div>

            {/* Missing Check-ins */}
            {missingCheckins.length > 0 && (
              <div className="grid gap-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <UserMinus className="h-5 w-5" />
                  Missing Check-ins ({missingCheckins.length})
                </h3>
                <Card>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      {missingCheckins.map((item) => (
                        <div key={item.user.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{item.user.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.lastCheckin 
                                ? `Last check-in: ${item.daysSinceLastCheckin} days ago`
                                : "No check-ins yet"
                              }
                            </p>
                          </div>
                          <Checkbox
                            checked={selectedReminders.has(item.user.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedReminders(new Set([...selectedReminders, item.user.id]));
                              } else {
                                const newSet = new Set(selectedReminders);
                                newSet.delete(item.user.id);
                                setSelectedReminders(newSet);
                              }
                            }}
                            data-testid={`checkbox-reminder-${item.user.id}`}
                          />
                        </div>
                      ))}
                      {selectedReminders.size > 0 && (
                        <Button
                          onClick={() => sendReminderMutation.mutate(Array.from(selectedReminders))}
                          disabled={sendReminderMutation.isPending}
                          className="w-full"
                          data-testid="button-send-reminders"
                        >
                          <Bell className="mr-2 h-4 w-4" />
                          Send Reminder to {selectedReminders.size} {selectedReminders.size === 1 ? 'person' : 'people'}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Recently Reviewed */}
            <div className="grid gap-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Recently Reviewed
              </h3>
              {reviewedLoading ? (
                <Skeleton className="h-32" />
              ) : reviewedCheckins.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No reviewed check-ins yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {reviewedCheckins.slice(0, 5).map((checkin) => (
                    <Card key={checkin.id} className="bg-green-50/50 dark:bg-green-950/10">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{checkin.user?.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Reviewed {formatDistanceToNow(new Date(checkin.reviewedAt!))} ago
                            </p>
                          </div>
                          <Badge variant="success">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Reviewed
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {/* Organization View Tab */}
        {canViewOrganization && (
          <TabsContent value="organization" className="space-y-4 mt-6">
            {/* Organization Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Check-ins</p>
                      <p className="text-2xl font-bold">{orgStats.total}</p>
                    </div>
                    <ClipboardCheck className="h-8 w-8 text-primary opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Pending Review</p>
                      <p className="text-2xl font-bold">{orgStats.pending}</p>
                    </div>
                    <Clock className="h-8 w-8 text-orange-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Reviewed</p>
                      <p className="text-2xl font-bold">{orgStats.reviewed}</p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-green-600 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Mood</p>
                      <div className="flex items-center gap-2">
                        <p className="text-2xl font-bold">{orgStats.avgMood.toFixed(1)}</p>
                        <RatingStars rating={Math.round(orgStats.avgMood)} size="sm" readonly />
                      </div>
                    </div>
                    <Heart className="h-8 w-8 text-red-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Organization-wide Check-ins</CardTitle>
                  <div className="flex gap-2">
                    <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                      <SelectTrigger className="w-[180px]" data-testid="select-team-filter">
                        <SelectValue placeholder="All teams" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All teams</SelectItem>
                        {teams.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={selectedFilter} onValueChange={setSelectedFilter}>
                      <SelectTrigger className="w-[140px]" data-testid="select-org-status-filter">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="reviewed">Reviewed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {orgCheckinsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20" />
                    ))}
                  </div>
                ) : filteredOrgCheckins.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No check-ins found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredOrgCheckins.map((checkin) => (
                      <div
                        key={checkin.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">{checkin.user?.name}</p>
                            {checkin.user?.teamName && (
                              <Badge variant="outline" className="text-xs">
                                {checkin.user.teamName}
                              </Badge>
                            )}
                            <Badge variant={checkin.status === "reviewed" ? "success" : "secondary"}>
                              {checkin.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>Week of {format(new Date(checkin.weekOf), "MMM d")}</span>
                            <RatingStars rating={checkin.overallMood} size="sm" readonly />
                            <span>{formatDistanceToNow(new Date(checkin.createdAt))} ago</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setReviewModal({ checkin })}
                          data-testid={`button-view-org-${checkin.id}`}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Check-in Submission Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-checkin-form">
          <DialogHeader>
            <DialogTitle>
              {selectedWeekStart 
                ? `Submit Late Check-in (Week of ${format(getCheckinWeekFriday(selectedWeekStart), "MMMM d")})`
                : "Submit Weekly Check-in"
              }
            </DialogTitle>
            <DialogDescription>
              Take a moment to reflect on your week and share how you're doing.
            </DialogDescription>
          </DialogHeader>

          {selectedWeekStart && (
            <Alert className="bg-orange-50 dark:bg-orange-950/20 border-orange-200">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <AlertDescription>
                You're submitting a late check-in for the week of {format(selectedWeekStart, "MMMM d")}
              </AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="overallMood"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Overall Mood</FormLabel>
                    <FormControl>
                      <RatingStars
                        rating={field.value}
                        onChange={field.onChange}
                        size="lg"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              {questionsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-32" />
                  <Skeleton className="h-32" />
                </div>
              ) : questions.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No questions are configured for this week. Please contact your admin.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-6">
                  {questions.map((question, index) => (
                    <div key={question.id} className="space-y-3">
                      <FormField
                        control={form.control}
                        name={`responses.${question.id}`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-start gap-2">
                              <span className="inline-block min-w-[24px] h-6 px-2 bg-primary text-primary-foreground rounded-full text-xs font-medium text-center">
                                {index + 1}
                              </span>
                              <span className="flex-1">{question.text}</span>
                            </FormLabel>
                            <FormControl>
                              <div className="space-y-2">
                                <Textarea
                                  {...field}
                                  placeholder="Share your thoughts..."
                                  className="min-h-[100px]"
                                  data-testid={`textarea-response-${question.id}`}
                                />
                                
                                {/* Quick Emoji Selection */}
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-muted-foreground">Feeling:</span>
                                  <div className="flex gap-1">
                                    {COMMON_EMOJIS.map((emoji) => (
                                      <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => {
                                          const currentEmojis = form.getValues("responseEmojis") || {};
                                          form.setValue(`responseEmojis.${question.id}`, 
                                            currentEmojis[question.id] === emoji ? "" : emoji
                                          );
                                        }}
                                        className={`p-1 text-lg hover:bg-accent rounded transition-colors ${
                                          form.watch(`responseEmojis.${question.id}`) === emoji 
                                            ? "bg-accent ring-2 ring-primary" 
                                            : ""
                                        }`}
                                        data-testid={`emoji-${question.id}-${emoji}`}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* Response Flags */}
                                <div className="flex gap-4 text-sm">
                                  <label className="flex items-center gap-2">
                                    <Checkbox
                                      checked={form.watch(`responseFlags.${question.id}.addToOneOnOne`) || false}
                                      onCheckedChange={(checked) => {
                                        form.setValue(`responseFlags.${question.id}.addToOneOnOne`, !!checked);
                                      }}
                                      data-testid={`checkbox-one-on-one-${question.id}`}
                                    />
                                    <span className="text-muted-foreground">Add to 1:1 agenda</span>
                                  </label>
                                  <label className="flex items-center gap-2">
                                    <Checkbox
                                      checked={form.watch(`responseFlags.${question.id}.flagForFollowUp`) || false}
                                      onCheckedChange={(checked) => {
                                        form.setValue(`responseFlags.${question.id}.flagForFollowUp`, !!checked);
                                      }}
                                      data-testid={`checkbox-follow-up-${question.id}`}
                                    />
                                    <span className="text-muted-foreground">Flag for follow-up</span>
                                  </label>
                                </div>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ))}
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    form.reset();
                    setSelectedWeekStart(null);
                  }}
                  data-testid="button-cancel-checkin"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitCheckinMutation.isPending || questions.length === 0}
                  data-testid="button-submit-checkin-form"
                >
                  {submitCheckinMutation.isPending ? "Submitting..." : "Submit Check-in"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Check-in Detail Dialog */}
      {selectedCheckin && (
        <CheckinDetail
          checkin={selectedCheckin}
          isOpen={isDetailDialogOpen}
          onClose={() => {
            setIsDetailDialogOpen(false);
            setSelectedCheckin(null);
          }}
        />
      )}

      {/* Review Modal */}
      {reviewModal && (
        <ReviewModal
          checkin={reviewModal.checkin}
          onClose={() => setReviewModal(null)}
          onReviewed={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
            setReviewModal(null);
          }}
        />
      )}
    </div>
  );
}