import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDistanceToNow, startOfWeek, addWeeks, isSameWeek, format, isToday, isPast } from "date-fns";
import { ClipboardCheck, Clock, CheckCircle, XCircle, AlertCircle, Plus, Calendar, Heart, MessageCircle, Smile, Flag, UserPlus, CheckCheck, Plane, Users } from "lucide-react";
import { getCheckinWeekFriday, getCheckinDueDate } from "@shared/utils/dueDates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TourGuide } from "@/components/TourGuide";
import { TOUR_IDS } from "@/lib/tours/tour-configs";
import { useManagedTour } from "@/contexts/TourProvider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { Checkin, Question, User, InsertCheckin, Vacation } from "@shared/schema";

// Common emoji options for quick selection
const COMMON_EMOJIS = ["😊", "😟", "🎯", "💪", "🤔", "😌", "😤", "🚀", "❤️", "✅"];

// Client-side form schema for check-in submission
// Only includes fields the user should provide - server computes the rest
// Always requires at least one question response
const createCheckinFormSchema = (questions: Question[]) => {
  // Always require responses - there should always be at least one question
  
  return z.object({
    overallMood: z.number().min(1, "Please provide a mood rating").max(5, "Rating must be between 1 and 5"),
    responses: z.record(z.string().min(1, "Please provide a response"))
      .refine(
        (responses) => {
          // Must have at least one response
          const responseCount = Object.keys(responses).filter(key => responses[key] && responses[key].trim() !== '').length;
          return responseCount > 0;
        },
        {
          message: "Please answer at least one question before submitting"
        }
      )
      .refine(
        (responses) => {
          // Check that all visible questions have responses
          const missingResponses = questions.filter(q => !responses[q.id] || responses[q.id].trim() === '');
          return missingResponses.length === 0;
        },
        {
          message: "Please answer all questions before submitting"
        }
      ),
    responseEmojis: z.record(z.string()).optional().default({}), // question_id -> emoji
    responseFlags: z.record(z.object({
      addToOneOnOne: z.boolean().default(false),
      flagForFollowUp: z.boolean().default(false),
    })).optional().default({}), // question_id -> flags
  });
};

type CheckinForm = {
  overallMood: number;
  responses: Record<string, string>;
  responseEmojis?: Record<string, string>;
  responseFlags?: Record<string, { addToOneOnOne: boolean; flagForFollowUp: boolean }>;
};

// Helper function to safely parse week dates
function safeParseWeek(weekOf: any): Date {
  if (!weekOf) {
    console.warn("safeParseWeek: weekOf is null/undefined, returning current date");
    return new Date();
  }
  
  // If it's already a Date object and valid, return it
  if (weekOf instanceof Date) {
    if (!isNaN(weekOf.getTime())) {
      return weekOf;
    }
    console.warn("safeParseWeek: weekOf is an Invalid Date, returning current date");
    return new Date();
  }
  
  // If it's a string, try to parse it
  if (typeof weekOf === 'string') {
    const parsed = new Date(weekOf);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    console.warn(`safeParseWeek: Failed to parse weekOf string: ${weekOf}, returning current date`);
    return new Date();
  }
  
  console.warn(`safeParseWeek: Unexpected weekOf type: ${typeof weekOf}, returning current date`);
  return new Date();
}

export default function Checkins() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCheckin, setSelectedCheckin] = useState<(Checkin & { user?: User }) | null>(null);
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [checkinToReview, setCheckinToReview] = useState<Checkin | null>(null);
  const [showPreviousWeekDialog, setShowPreviousWeekDialog] = useState(false);
  const [isSubmittingLate, setIsSubmittingLate] = useState(false);
  const [showVacationDialog, setShowVacationDialog] = useState(false);
  const [selectedVacationWeek, setSelectedVacationWeek] = useState<Date | null>(null);
  const [vacationNote, setVacationNote] = useState("");
  const [selectedTeamMemberId, setSelectedTeamMemberId] = useState<string>("");
  
  // Tour management
  const tourManager = useManagedTour(TOUR_IDS.CHECKINS_GUIDE);
  
  // Check if user needs self-review capability (no manager)
  const needsSelfReview = currentUser && !currentUser.managerId;

  // Get current week start (Saturday) - wrap in try-catch for debugging
  let currentWeekStart: Date;
  let previousWeekStart: Date;
  
  try {
    const today = new Date();
    currentWeekStart = startOfWeek(today, { weekStartsOn: 6 });
    
    // Get previous week start (Saturday)
    previousWeekStart = addWeeks(currentWeekStart, -1);
  } catch (error) {
    // Fallback to safe defaults
    currentWeekStart = new Date();
    previousWeekStart = new Date();
  }

  // Fetch active questions (with team-specific questions if applicable)
  const { data: questions = [], isLoading: questionsLoading } = useQuery<Question[]>({
    queryKey: ["/api/questions?forCheckin=true"],
  });

  // Fetch user's check-ins
  const { data: checkins = [], isLoading: checkinsLoading, error: checkinsError } = useQuery<Checkin[]>({
    queryKey: ["/api/checkins"],
    enabled: !!currentUser
  });

  // Fetch users for name lookups
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Get current week's check-in
  const { data: currentCheckin } = useQuery<Checkin | null>({
    queryKey: ["/api/users", currentUser?.id, "current-checkin"],
    enabled: !!currentUser?.id,
  });

  // Get previous week's check-in
  const { data: previousCheckin } = useQuery<Checkin | null>({
    queryKey: ["/api/users", currentUser?.id, "previous-checkin"],
    enabled: !!currentUser?.id,
  });

  // Fetch team members for managers and admins
  const { data: teamMembers = [] } = useQuery<User[]>({
    queryKey: currentUser?.role === 'admin' 
      ? ["/api/users?includeInactive=false"]
      : ["/api/users", currentUser?.id, "reports"],
    queryFn: async () => {
      if (!currentUser) return [];
      
      // Admins can see all users
      if (currentUser.role === 'admin') {
        const response = await apiRequest("GET", "/api/users?includeInactive=false");
        if (!response.ok) throw new Error('Failed to fetch users');
        const allUsers = await response.json() as User[];
        // Filter out the current user
        return allUsers.filter(u => u.id !== currentUser.id);
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

  // Fetch vacations - for now just fetch current user's vacations
  const { data: vacations = [], refetch: refetchVacations } = useQuery<Vacation[]>({
    queryKey: ["/api/vacations"],
    enabled: !!currentUser,
  });
  
  // Fetch all team member vacations for managers and admins
  const { data: allTeamVacations = [] } = useQuery<Vacation[]>({
    queryKey: ["/api/vacations/team", teamMembers.map(m => m.id).join(',')],
    queryFn: async () => {
      if (!currentUser || !teamMembers.length) return [];
      
      const allVacations: Vacation[] = [];
      
      // For admins, we can potentially fetch all at once
      // For now, fetch individually (this could be optimized later)
      for (const member of teamMembers) {
        try {
          const response = await apiRequest("GET", `/api/vacations?userId=${member.id}`);
          if (response.ok) {
            const memberVacations = await response.json() as Vacation[];
            allVacations.push(...memberVacations);
          }
        } catch (error) {
          console.error(`Failed to fetch vacations for ${member.name}:`, error);
        }
      }
      
      return allVacations;
    },
    enabled: !!currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager') && teamMembers.length > 0,
  });
  
  // Combine current user vacations with team vacations
  const allVacations = useMemo(() => {
    if (currentUser?.role === 'admin' || currentUser?.role === 'manager') {
      // Combine and deduplicate
      const combined = [...vacations, ...allTeamVacations];
      return combined.filter((v, index, self) =>
        index === self.findIndex((t) => t.id === v.id)
      );
    }
    return vacations;
  }, [vacations, allTeamVacations, currentUser]);

  // Fetch current organization data for due date calculation
  const { data: currentOrganization } = useQuery({
    queryKey: ["/api/organizations", currentUser?.organizationId],
    queryFn: async () => {
      if (!currentUser?.organizationId) return null;
      const response = await apiRequest("GET", `/api/organizations/${currentUser.organizationId}`);
      if (!response.ok) throw new Error('Failed to fetch organization');
      return response.json();
    },
    enabled: !!currentUser?.organizationId,
  });

  // Check if current week is marked as vacation
  const currentWeekVacation = useMemo(() => {
    return vacations.find(v => 
      isSameWeek(safeParseWeek(v.weekOf), currentWeekStart, { weekStartsOn: 6 })
    );
  }, [vacations, currentWeekStart]);

  // Check if previous week was marked as vacation
  const previousWeekVacation = useMemo(() => {
    return vacations.find(v => 
      isSameWeek(safeParseWeek(v.weekOf), previousWeekStart, { weekStartsOn: 6 })
    );
  }, [vacations, previousWeekStart]);

  // Filter for only active questions
  const activeQuestions = questions.filter(q => q.isActive);
  
  // Create check-in form with dynamic schema based on questions
  const form = useForm<CheckinForm>({
    resolver: zodResolver(createCheckinFormSchema(activeQuestions)),
    defaultValues: {
      overallMood: 3, // Start with neutral value (valid range is 1-5)
      responses: {},
      responseEmojis: {},
      responseFlags: {},
    },
  });

  // Enhanced checkins with user data
  const enrichedCheckins = useMemo(() => {
    return checkins.map(checkin => ({
      ...checkin,
      user: users.find(u => u.id === checkin.userId) || currentUser,
    }));
  }, [checkins, users, currentUser]);

  // Sort checkins by date (newest first)
  const sortedCheckins = useMemo(() => {
    return enrichedCheckins.sort((a, b) => safeParseWeek(b.weekOf).getTime() - safeParseWeek(a.weekOf).getTime());
  }, [enrichedCheckins]);

  // Separate current week and historical checkins
  const currentWeekCheckin = currentCheckin || sortedCheckins.find(checkin => 
    isSameWeek(safeParseWeek(checkin.weekOf), currentWeekStart, { weekStartsOn: 6 })
  );
  
  const historicalCheckins = sortedCheckins.filter(checkin => 
    !isSameWeek(safeParseWeek(checkin.weekOf), currentWeekStart, { weekStartsOn: 6 })
  );

  // Vacation management mutations
  const markVacationMutation = useMutation({
    mutationFn: async ({ weekOf, note, targetUserId }: { weekOf: Date, note?: string, targetUserId?: string }) => {
      const response = await apiRequest("POST", "/api/vacations", {
        weekOf: weekOf.toISOString(),
        note: note || undefined,
        targetUserId: targetUserId || undefined,
      });
      return await response.json();
    },
    onSuccess: (_, variables) => {
      refetchVacations();
      queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", currentUser?.id, "current-checkin"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", currentUser?.id, "previous-checkin"] });
      
      const targetUser = variables.targetUserId && variables.targetUserId !== currentUser?.id
        ? teamMembers.find(u => u.id === variables.targetUserId)
        : null;
      
      toast({
        title: "Vacation marked",
        description: targetUser 
          ? `${targetUser.name} has been marked on vacation for this week.`
          : "This week has been marked as vacation.",
      });
      setShowVacationDialog(false);
      setVacationNote("");
      setSelectedTeamMemberId("");
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to mark vacation",
        description: "There was an error marking vacation. Please try again.",
      });
    },
  });

  const unmarkVacationMutation = useMutation({
    mutationFn: async (weekOf: Date) => {
      const response = await apiRequest("DELETE", `/api/vacations/${weekOf.toISOString()}`);
      if (!response.ok && response.status !== 204) {
        throw new Error("Failed to unmark vacation");
      }
    },
    onSuccess: () => {
      refetchVacations();
      queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", currentUser?.id, "current-checkin"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", currentUser?.id, "previous-checkin"] });
      toast({
        title: "Vacation removed",
        description: "This week is no longer marked as vacation.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to remove vacation",
        description: "There was an error removing your vacation. Please try again.",
      });
    },
  });

  // Create/Update check-in mutation
  const createCheckinMutation = useMutation({
    mutationFn: async (data: CheckinForm & { weekStartDate?: string }) => {
      // Only send user-provided data - server computes due dates and other fields
      const checkinPayload = {
        userId: currentUser!.id,
        weekOf: data.weekStartDate || currentWeekStart.toISOString(), // Use provided date for late submission
        weekStartDate: data.weekStartDate, // Pass this for backend validation
        overallMood: data.overallMood,
        responses: data.responses,
        isComplete: true,
      };

      let response: Response;
      
      // If updating existing check-in (either current or previous week)
      if (data.weekStartDate && previousCheckin) {
        response = await apiRequest("PATCH", `/api/checkins/${previousCheckin.id}`, checkinPayload);
      } else if (!data.weekStartDate && currentWeekCheckin) {
        response = await apiRequest("PATCH", `/api/checkins/${currentWeekCheckin.id}`, checkinPayload);
      } else {
        response = await apiRequest("POST", "/api/checkins", checkinPayload);
      }
      
      // Parse and return the JSON response
      // This ensures React Query receives the actual data, not the Response object
      return await response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", currentUser?.id, "current-checkin"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", currentUser?.id, "previous-checkin"] });
      form.reset();
      setShowCreateDialog(false);
      setShowPreviousWeekDialog(false);
      setIsSubmittingLate(false);
      
      const isLateSubmission = variables.weekStartDate ? true : false;
      toast({
        title: isLateSubmission ? "Late check-in submitted!" : "Check-in submitted!",
        description: isLateSubmission 
          ? "Your late check-in for the previous week has been submitted for review."
          : "Your weekly check-in has been submitted for review.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Submission failed",
        description: "There was an error submitting your check-in. Please try again.",
      });
    },
  });

  // Handle form submission
  const handleSubmit = (data: CheckinForm) => {
    // React Hook Form already handles validation, so if we get here the data is valid
    console.log('handleSubmit called with data:', data);
    console.log('currentWeekStart:', currentWeekStart);
    createCheckinMutation.mutate({
      ...data,
      weekStartDate: currentWeekStart.toISOString()
    });
  };
  
  // Handle form validation errors
  const handleSubmitError = (errors: any) => {
    console.error("Form validation errors:", errors);
    console.error("Form values at error:", form.getValues());
    console.error("Active questions:", activeQuestions);
    
    // Get error message string
    let errorMessage = "Please answer all questions before submitting";
    if (errors.overallMood?.message) {
      errorMessage = String(errors.overallMood.message);
    } else if (errors.responses && typeof errors.responses === 'object' && 'message' in errors.responses) {
      errorMessage = String((errors.responses as any).message);
    }
    
    toast({
      variant: "destructive",
      title: "Please complete all required fields",
      description: errorMessage,
    });
  };

  // Handle edit current check-in
  const handleEditCurrentCheckin = () => {
    if (currentWeekCheckin) {
      form.reset({
        overallMood: currentWeekCheckin.overallMood,
        responses: currentWeekCheckin.responses as Record<string, string>,
      });
      setShowCreateDialog(true);
    }
  };

  // Get status info for current week
  const getCurrentWeekStatus = () => {
    if (!currentWeekCheckin) {
      return { status: "not-submitted", label: "Not Submitted", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" };
    }
    
    switch (currentWeekCheckin.reviewStatus) {
      case "pending":
        return { status: "pending", label: "Pending Review", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" };
      case "approved":
        return { status: "approved", label: "Approved", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" };
      case "rejected":
        return { status: "rejected", label: "Needs Revision", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" };
      default:
        return { status: "unknown", label: "Unknown", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" };
    }
  };

  const currentStatus = getCurrentWeekStatus();

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "not-submitted":
        return <Clock className="w-4 h-4" />;
      case "pending":
        return <AlertCircle className="w-4 h-4" />;
      case "approved":
        return <CheckCircle className="w-4 h-4" />;
      case "rejected":
        return <XCircle className="w-4 h-4" />;
      default:
        return <ClipboardCheck className="w-4 h-4" />;
    }
  };

  if (userLoading) {
    return (
      <main className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
      </main>
    );
  }

  return (
    <>
      {/* Tour Guide for check-ins */}
      {tourManager.shouldShow && (
        <TourGuide
          tourId={TOUR_IDS.CHECKINS_GUIDE}
          onComplete={tourManager.handleComplete}
          onSkip={tourManager.handleSkip}
          autoStart={true}
          delay={1000}
        />
      )}

      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* Self-Review Alert for Users Without Managers */}
        {needsSelfReview && currentWeekCheckin && currentWeekCheckin.reviewStatus === 'pending' && (
          <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription>
              <span className="font-medium text-blue-900 dark:text-blue-300">Self-Review Required:</span>
              <span className="text-blue-800 dark:text-blue-400 ml-2">
                Since you don't have an assigned manager, you need to self-review your check-ins. 
                Click the "Self-Review" button below to approve your weekly check-in.
              </span>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Late Check-in Alert - Show if previous week's check-in is missing and NOT on vacation */}
        {!previousCheckin && !previousWeekVacation && activeQuestions.length > 0 && (
          <Alert className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
            <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-orange-900 dark:text-orange-300">Previous Week Check-in Missing:</span>
                  <span className="text-orange-800 dark:text-orange-400 ml-2">
                    You missed your check-in for the week ending {(() => {
                      try {
                        if (previousWeekStart && !isNaN(previousWeekStart.getTime())) {
                          const friday = getCheckinWeekFriday(previousWeekStart);
                          if (friday && !isNaN(friday.getTime())) {
                            return format(friday, 'MMMM d, yyyy');
                          }
                        }
                      } catch (error) {
                        // Error formatting date - return fallback
                      }
                      return 'last week';
                    })()}. 
                    You can still submit it now as a late submission.
                  </span>
                </div>
                <Dialog open={showPreviousWeekDialog} onOpenChange={(open) => {
                  setShowPreviousWeekDialog(open);
                  if (open) {
                    // Reset form with proper defaults when opening dialog
                    form.reset({
                      overallMood: 3,
                      responses: {},
                      responseEmojis: {},
                      responseFlags: {},
                    });
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="ml-4 border-orange-500 text-orange-700 hover:bg-orange-50 dark:border-orange-400 dark:text-orange-400 dark:hover:bg-orange-900/20"
                      data-testid="button-submit-late-checkin"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Submit Late Check-in
                    </Button>
                  </DialogTrigger>
                </Dialog>
              </div>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Current Week Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center space-x-2">
                  {getStatusIcon(currentStatus.status)}
                  <span>This Week's Check-in</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Week ending {(() => {
                    try {
                      const today = new Date();
                      if (!isNaN(today.getTime())) {
                        const friday = getCheckinWeekFriday(today);
                        if (friday && !isNaN(friday.getTime())) {
                          return format(friday, 'MMMM d, yyyy');
                        }
                      }
                      return 'this week';
                    } catch (error) {
                      // Error formatting date - return fallback
                      return 'this week';
                    }
                  })()}
                  {currentWeekVacation && (
                    <Badge variant="secondary" className="ml-2 gap-1">
                      <Plane className="w-3 h-3" />
                      On Vacation
                    </Badge>
                  )}
                </p>
              </div>
              <Badge className={currentStatus.color} data-testid="badge-current-status">
                {currentWeekVacation ? "On Vacation" : currentStatus.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {currentWeekVacation ? (
              <div className="text-center py-8">
                <Plane className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">You're on vacation this week</h3>
                <p className="text-muted-foreground mb-4">
                  No check-in is required while you're on vacation. Enjoy your time off!
                </p>
                {currentWeekVacation.note && (
                  <p className="text-sm text-muted-foreground italic">"{currentWeekVacation.note}"</p>
                )}
              </div>
            ) : !currentWeekCheckin ? (
              <div className="text-center py-8">
                <ClipboardCheck className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Ready to check in?</h3>
                <p className="text-muted-foreground mb-4">
                  {(() => {
                    try {
                      const dueDate = currentOrganization ? getCheckinDueDate(new Date(), currentOrganization) : null;
                      if (dueDate && !isNaN(dueDate.getTime())) {
                        if (isToday(dueDate)) {
                          return `Due today by ${format(dueDate, 'h:mm a')}`;
                        } else if (isPast(dueDate)) {
                          return `Past due - was due ${format(dueDate, 'EEEE, MMMM d')} at ${format(dueDate, 'h:mm a')}`;
                        } else {
                          return `Due by ${format(dueDate, 'EEEE, MMMM d')} at ${format(dueDate, 'h:mm a')}`;
                        }
                      }
                    } catch (error) {
                      // Error formatting date - return fallback
                    }
                    return "Submit your weekly check-in to share how you're doing with your team.";
                  })()}
                </p>
                <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-submit-checkin">
                      <Plus className="w-4 h-4 mr-2" />
                      Submit Check-in
                    </Button>
                  </DialogTrigger>
                </Dialog>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Heart className="w-5 h-5 fill-accent stroke-accent" />
                      <span className="font-medium">Mood:</span>
                      <RatingStars rating={currentWeekCheckin.overallMood} readonly size="sm" />
                      <span className="text-sm text-muted-foreground">({currentWeekCheckin.overallMood}/5)</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setSelectedCheckin({ ...currentWeekCheckin, user: currentUser || undefined })} 
                      data-testid="button-view-current"
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      View Details
                    </Button>
                    {currentWeekCheckin.reviewStatus === 'pending' && (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={handleEditCurrentCheckin}
                          data-testid="button-edit-current"
                        >
                          Edit
                        </Button>
                        {needsSelfReview && (
                          <Button 
                            variant="default" 
                            size="sm" 
                            onClick={() => {
                              setCheckinToReview(currentWeekCheckin);
                              setShowReviewModal(true);
                            }}
                            data-testid="button-self-review"
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <CheckCheck className="w-4 h-4 mr-2" />
                            Self-Review
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Submitted {(() => {
                    try {
                      const date = new Date(currentWeekCheckin.createdAt);
                      if (!isNaN(date.getTime())) {
                        return formatDistanceToNow(date, { addSuffix: true });
                      }
                    } catch (error) {
                      // Error formatting date - return fallback
                    }
                    return "recently";
                  })()}
                  {currentWeekCheckin.reviewedAt && (
                    <span> • Reviewed {(() => {
                      try {
                        const date = new Date(currentWeekCheckin.reviewedAt);
                        if (!isNaN(date.getTime())) {
                          return formatDistanceToNow(date, { addSuffix: true });
                        }
                      } catch (error) {
                        // Error formatting date - return fallback
                      }
                      return "recently";
                    })()}</span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs for Current/History */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "current" | "history")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="current" data-testid="tab-current">Current Week</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">History ({historicalCheckins.length})</TabsTrigger>
          </TabsList>
          
          <TabsContent value="current" className="space-y-6">
            {questionsLoading ? (
              <Card>
                <CardContent className="p-6">
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-muted rounded w-1/3"></div>
                    <div className="h-20 bg-muted rounded"></div>
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                    <div className="h-16 bg-muted rounded"></div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              !currentWeekCheckin && (
                <Card>
                  <CardHeader>
                    <CardTitle>Weekly Check-in Questions</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Please respond to these questions and rate your overall mood.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(handleSubmit, handleSubmitError)} className="space-y-6">
                        {/* Overall Mood Rating */}
                        <FormField
                          control={form.control}
                          name="overallMood"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Overall Mood (1-5 scale)</FormLabel>
                              <FormControl>
                                <div className="flex items-center space-x-4">
                                  <RatingStars
                                    rating={field.value}
                                    onRatingChange={field.onChange}
                                    size="lg"
                                  />
                                  {field.value > 0 && (
                                    <Badge variant={field.value >= 4 ? "default" : field.value >= 3 ? "secondary" : "destructive"}>
                                      {field.value >= 4 ? "Great" : field.value >= 3 ? "Good" : "Needs Support"}
                                    </Badge>
                                  )}
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Question Responses */}
                        {activeQuestions.length > 0 ? (
                          <div className="space-y-4">
                            <div className="text-sm text-muted-foreground mb-2">
                              <span className="text-red-500">*</span> All questions are required
                            </div>
                            {activeQuestions.map((question, index) => (
                              <Card key={question.id} className="p-4">
                                <FormField
                                  control={form.control}
                                  name={`responses.${question.id}`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>
                                        {question.text} <span className="text-red-500">*</span>
                                      </FormLabel>
                                      <FormControl>
                                        <Textarea
                                          placeholder="Share your thoughts..."
                                          rows={3}
                                          data-testid={`textarea-question-${index}`}
                                          {...field}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                
                                {/* Emoji Selection */}
                                <div className="mt-3 flex items-center gap-2">
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" size="sm" type="button">
                                        <Smile className="w-4 h-4 mr-1" />
                                        {form.watch(`responseEmojis.${question.id}`) || "Add Emoji"}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-64">
                                      <div className="grid grid-cols-5 gap-2">
                                        {COMMON_EMOJIS.map((emoji) => (
                                          <Button
                                            key={emoji}
                                            variant="ghost"
                                            size="sm"
                                            type="button"
                                            className="text-2xl hover:bg-muted"
                                            onClick={() => {
                                              form.setValue(`responseEmojis.${question.id}`, emoji);
                                            }}
                                          >
                                            {emoji}
                                          </Button>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  
                                  {form.watch(`responseEmojis.${question.id}`) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      type="button"
                                      onClick={() => form.setValue(`responseEmojis.${question.id}`, "")}
                                    >
                                      Clear
                                    </Button>
                                  )}
                                </div>
                                
                                {/* Flags */}
                                <div className="mt-3 flex flex-wrap gap-4">
                                  <FormField
                                    control={form.control}
                                    name={`responseFlags.${question.id}.addToOneOnOne`}
                                    render={({ field }) => (
                                      <div className="flex items-center space-x-2">
                                        <Checkbox
                                          id={`oneOnOne-${question.id}`}
                                          checked={field.value || false}
                                          onCheckedChange={field.onChange}
                                        />
                                        <label
                                          htmlFor={`oneOnOne-${question.id}`}
                                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center"
                                        >
                                          <UserPlus className="w-4 h-4 mr-1" />
                                          Add to one-on-one
                                        </label>
                                      </div>
                                    )}
                                  />
                                  
                                  <FormField
                                    control={form.control}
                                    name={`responseFlags.${question.id}.flagForFollowUp`}
                                    render={({ field }) => (
                                      <div className="flex items-center space-x-2">
                                        <Checkbox
                                          id={`followUp-${question.id}`}
                                          checked={field.value || false}
                                          onCheckedChange={field.onChange}
                                        />
                                        <label
                                          htmlFor={`followUp-${question.id}`}
                                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center"
                                        >
                                          <Flag className="w-4 h-4 mr-1" />
                                          Flag for follow-up
                                        </label>
                                      </div>
                                    )}
                                  />
                                </div>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-500" />
                            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                              Check-ins cannot be submitted without questions.
                            </p>
                            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                              Please contact your administrator to set up check-in questions.
                            </p>
                          </div>
                        )}

                        <div className="flex justify-end space-x-3">
                          <Button
                            type="submit"
                            disabled={createCheckinMutation.isPending || activeQuestions.length === 0}
                            data-testid="button-submit-form"
                          >
                            {createCheckinMutation.isPending ? "Submitting..." : "Submit Check-in"}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              )
            )}
          </TabsContent>
          
          <TabsContent value="history" className="space-y-4">
            {checkinsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <div className="animate-pulse space-y-3">
                        <div className="h-4 bg-muted rounded w-1/4"></div>
                        <div className="h-3 bg-muted rounded w-1/3"></div>
                        <div className="h-16 bg-muted rounded"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : checkinsError ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
                  <h3 className="text-lg font-semibold mb-2">Failed to load check-ins</h3>
                  <p className="text-muted-foreground mb-4">
                    There was an error loading your check-in history.
                  </p>
                  <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/checkins"] })}>
                    Try Again
                  </Button>
                </CardContent>
              </Card>
            ) : historicalCheckins.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No previous check-ins</h3>
                  <p className="text-muted-foreground">
                    Your check-in history will appear here once you submit more check-ins.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {historicalCheckins.map((checkin) => (
                  <Card key={checkin.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedCheckin({ ...checkin, user: currentUser || undefined })}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-4">
                          <div>
                            <h4 className="font-medium" data-testid={`checkin-week-${checkin.id}`}>
                              Week ending {(() => {
                                try {
                                  const weekDate = safeParseWeek(checkin.weekOf);
                                  const friday = getCheckinWeekFriday(weekDate);
                                  if (friday && !isNaN(friday.getTime())) {
                                    return format(friday, 'MMMM d, yyyy');
                                  }
                                } catch (error) {
                                  // Error formatting date - return fallback
                                }
                                return 'Unknown week';
                              })()}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              Submitted {(() => {
                                try {
                                  const date = new Date(checkin.createdAt);
                                  if (isNaN(date.getTime())) {
                                    console.error("[DEBUG Checkins] Invalid createdAt:", checkin.createdAt);
                                    return "recently";
                                  }
                                  return formatDistanceToNow(date, { addSuffix: true });
                                } catch (error) {
                                  console.error("[DEBUG Checkins] Error formatting createdAt:", error, checkin.createdAt);
                                  return "recently";
                                }
                              })()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-2">
                            <RatingStars rating={checkin.overallMood} readonly size="sm" />
                            <span className="text-sm text-muted-foreground">({checkin.overallMood}/5)</span>
                          </div>
                          <Badge
                            variant={checkin.reviewStatus === "approved" ? "default" : checkin.reviewStatus === "pending" ? "secondary" : "destructive"}
                            data-testid={`badge-status-${checkin.id}`}
                          >
                            {checkin.reviewStatus === "pending" ? "Pending" : 
                             checkin.reviewStatus === "approved" ? "Approved" : 
                             checkin.reviewStatus === "rejected" ? "Rejected" : "Unknown"}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {Object.keys(checkin.responses as Record<string, string>).length} responses provided
                        {checkin.reviewedAt && (
                          <span> • Reviewed {(() => {
                            try {
                              const date = new Date(checkin.reviewedAt);
                              if (!isNaN(date.getTime())) {
                                return formatDistanceToNow(date, { addSuffix: true });
                              }
                            } catch (error) {
                              // Error formatting date - return fallback
                            }
                            return "recently";
                          })()}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Vacation Management Section - Compact */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plane className="w-4 h-4" />
              Vacation Management
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {/* Current and Previous Week - Compact */}
              <div className="grid gap-2">
                {/* Current Week */}
                <div className="flex items-center justify-between p-2 rounded-lg border bg-background">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Current Week</span>
                    {currentWeekVacation && (
                      <Badge variant="secondary" className="text-xs">
                        <Plane className="w-3 h-3 mr-1" />
                        On Vacation
                      </Badge>
                    )}
                  </div>
                  {currentWeekVacation ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => unmarkVacationMutation.mutate(currentWeekStart)}
                      disabled={unmarkVacationMutation.isPending}
                      data-testid="button-unmark-current-vacation"
                    >
                      <XCircle className="w-3 h-3" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedVacationWeek(currentWeekStart);
                        setShowVacationDialog(true);
                      }}
                      disabled={!!currentWeekCheckin}
                      data-testid="button-mark-current-vacation"
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  )}
                </div>

                {/* Previous Week (if no check-in) */}
                {!previousCheckin && (
                  <div className="flex items-center justify-between p-2 rounded-lg border bg-background">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Previous Week</span>
                      {previousWeekVacation && (
                        <Badge variant="secondary" className="text-xs">
                          <Plane className="w-3 h-3 mr-1" />
                          Was on Vacation
                        </Badge>
                      )}
                    </div>
                    {previousWeekVacation ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => unmarkVacationMutation.mutate(previousWeekStart)}
                        disabled={unmarkVacationMutation.isPending}
                        data-testid="button-unmark-previous-vacation"
                      >
                        <XCircle className="w-3 h-3" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedVacationWeek(previousWeekStart);
                          setShowVacationDialog(true);
                        }}
                        data-testid="button-mark-previous-vacation"
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Future Vacations - Compact Grid */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Future Weeks</p>
                <div className="grid grid-cols-2 gap-2">
                  {[1, 2, 3, 4].map(weeksAhead => {
                    const futureWeek = addWeeks(currentWeekStart, weeksAhead);
                    const futureVacation = vacations.find(v => 
                      isSameWeek(safeParseWeek(v.weekOf), futureWeek, { weekStartsOn: 6 })
                    );
                    return (
                      <div key={weeksAhead} className="flex items-center justify-between p-2 rounded-lg border bg-background">
                        <span className="text-xs">
                          {(() => {
                            try {
                              if (!isNaN(futureWeek.getTime())) {
                                const friday = getCheckinWeekFriday(futureWeek);
                                if (friday && !isNaN(friday.getTime())) {
                                  return format(friday, 'MMM d');
                                }
                              }
                            } catch (error) {
                              // Error formatting date - return fallback
                            }
                            return 'Invalid date';
                          })()}
                          {futureVacation && (
                            <Plane className="w-3 h-3 ml-1 inline text-muted-foreground" />
                          )}
                        </span>
                        {futureVacation ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => unmarkVacationMutation.mutate(futureWeek)}
                            disabled={unmarkVacationMutation.isPending}
                            data-testid={`button-unmark-future-vacation-${weeksAhead}`}
                            className="h-6 w-6 p-0"
                          >
                            <XCircle className="w-3 h-3" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedVacationWeek(futureWeek);
                              setShowVacationDialog(true);
                            }}
                            data-testid={`button-mark-future-vacation-${weeksAhead}`}
                            className="h-6 w-6 p-0"
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Team Member Management - Compact */}
              {currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager') && teamMembers.length > 0 && (
                <div className="pt-2 border-t">
                  {/* Show team members on vacation */}
                  {(() => {
                    const teamMembersOnVacation = teamMembers.filter(member => 
                      allVacations.some(v => 
                        v.userId === member.id && 
                        isSameWeek(safeParseWeek(v.weekOf), currentWeekStart, { weekStartsOn: 6 })
                      )
                    );
                    
                    if (teamMembersOnVacation.length > 0) {
                      return (
                        <div className="mb-2 text-xs">
                          <span className="text-muted-foreground">Team on vacation: </span>
                          {teamMembersOnVacation.map((member, index) => (
                            <span key={member.id}>
                              {member.name}{index < teamMembersOnVacation.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedVacationWeek(currentWeekStart);
                      setShowVacationDialog(true);
                      setSelectedTeamMemberId("");
                    }}
                    data-testid="button-mark-team-vacation"
                    className="w-full h-8 text-xs"
                  >
                    <UserPlus className="w-3 h-3 mr-1" />
                    Mark Team Member on Vacation
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Late Check-in Dialog for Previous Week */}
        <Dialog open={showPreviousWeekDialog} onOpenChange={setShowPreviousWeekDialog}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-orange-600" />
                <span>Submit Late Check-in</span>
              </DialogTitle>
              <DialogDescription>
                <div className="space-y-2">
                  <p>Week ending {(() => {
                    try {
                      if (previousWeekStart && !isNaN(previousWeekStart.getTime())) {
                        const friday = getCheckinWeekFriday(previousWeekStart);
                        if (friday && !isNaN(friday.getTime())) {
                          return format(friday, 'MMMM d, yyyy');
                        }
                      }
                    } catch (error) {
                      // Error formatting date - return fallback
                    }
                    return 'last week';
                  })()}</p>
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
                    Late Submission
                  </Badge>
                </div>
              </DialogDescription>
            </DialogHeader>
            
            {questionsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => {
                  createCheckinMutation.mutate({
                    ...data,
                    weekStartDate: previousWeekStart.toISOString()
                  });
                }, handleSubmitError)} className="space-y-6">
                  {/* Overall Mood Rating */}
                  <FormField
                    control={form.control}
                    name="overallMood"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>How were you feeling that week? (1-5 scale)</FormLabel>
                        <FormControl>
                          <div className="flex items-center space-x-4">
                            <RatingStars
                              rating={field.value}
                              onRatingChange={field.onChange}
                              size="lg"
                            />
                            {field.value > 0 && (
                              <Badge variant={field.value >= 4 ? "default" : field.value >= 3 ? "secondary" : "destructive"}>
                                {field.value >= 4 ? "Great" : field.value >= 3 ? "Good" : "Needs Support"}
                              </Badge>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Question Responses */}
                  {activeQuestions.length > 0 ? (
                    <div className="space-y-4">
                      <div className="text-sm text-muted-foreground mb-2">
                        <span className="text-red-500">*</span> All questions are required
                      </div>
                      {activeQuestions.map((question, index) => (
                        <FormField
                          key={question.id}
                          control={form.control}
                          name={`responses.${question.id}`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                {question.text} <span className="text-red-500">*</span>
                              </FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Share your thoughts..."
                                  rows={3}
                                  data-testid={`dialog-late-textarea-question-${index}`}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-500" />
                      <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                        Check-ins cannot be submitted without questions.
                      </p>
                      <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                        Please contact your administrator to set up check-in questions.
                      </p>
                    </div>
                  )}

                <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowPreviousWeekDialog(false)}
                      data-testid="button-cancel-late-dialog"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createCheckinMutation.isPending || activeQuestions.length === 0}
                      data-testid="checkin-late-submit"
                      className="bg-orange-600 hover:bg-orange-700"
                    >
                      {createCheckinMutation.isPending ? "Submitting Late Check-in..." : "Submit Late Check-in"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            )}
          </DialogContent>
        </Dialog>

        {/* Create/Edit Check-in Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (open && !currentWeekCheckin) {
            // Reset form with proper defaults when opening dialog for new check-in
            form.reset({
              overallMood: 3,
              responses: {},
              responseEmojis: {},
              responseFlags: {},
            });
          }
        }}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {currentWeekCheckin ? "Edit Check-in" : "Submit Weekly Check-in"}
              </DialogTitle>
              <DialogDescription>
                Week ending {(() => {
                  try {
                    const today = new Date();
                    if (!isNaN(today.getTime())) {
                      const friday = getCheckinWeekFriday(today);
                      if (friday && !isNaN(friday.getTime())) {
                        return format(friday, 'MMMM d, yyyy');
                      }
                    }
                    return 'this week';
                  } catch (error) {
                    // Error formatting date - return fallback
                    return 'this week';
                  }
                })()}
              </DialogDescription>
            </DialogHeader>
            
            {questionsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit, handleSubmitError)} className="space-y-6">
                  {/* Overall Mood Rating */}
                  <FormField
                    control={form.control}
                    name="overallMood"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>How are you feeling this week? (1-5 scale)</FormLabel>
                        <FormControl>
                          <div className="flex items-center space-x-4">
                            <RatingStars
                              rating={field.value}
                              onRatingChange={field.onChange}
                              size="lg"
                            />
                            {field.value > 0 && (
                              <Badge variant={field.value >= 4 ? "default" : field.value >= 3 ? "secondary" : "destructive"}>
                                {field.value >= 4 ? "Great" : field.value >= 3 ? "Good" : "Needs Support"}
                              </Badge>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Question Responses */}
                  {activeQuestions.length > 0 ? (
                    <div className="space-y-4">
                      <div className="text-sm text-muted-foreground mb-2">
                        <span className="text-red-500">*</span> All questions are required
                      </div>
                      {activeQuestions.map((question, index) => (
                        <FormField
                          key={question.id}
                          control={form.control}
                          name={`responses.${question.id}`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                {question.text} <span className="text-red-500">*</span>
                              </FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Share your thoughts..."
                                  rows={3}
                                  data-testid={`dialog-textarea-question-${index}`}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-500" />
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                      Check-ins cannot be submitted without questions.
                    </p>
                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                      Please contact your administrator to set up check-in questions.
                    </p>
                  </div>
                )}

                <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowCreateDialog(false)}
                      data-testid="button-cancel-dialog"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createCheckinMutation.isPending || activeQuestions.length === 0}
                      data-testid="checkin-submit"
                    >
                      {createCheckinMutation.isPending ? "Submitting..." : currentWeekCheckin ? "Update Check-in" : "Submit Check-in"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            )}
          </DialogContent>
        </Dialog>

        {/* Check-in Detail Dialog */}
        {selectedCheckin && (
          <CheckinDetail
            checkin={selectedCheckin}
            questions={questions}
            open={!!selectedCheckin}
            onOpenChange={(open) => !open && setSelectedCheckin(null)}
          />
        )}
        
        {/* Self-Review Modal */}
        <ReviewModal
          isOpen={showReviewModal}
          onClose={() => {
            setShowReviewModal(false);
            setCheckinToReview(null);
          }}
          checkin={checkinToReview && currentUser ? {
            ...checkinToReview,
            user: {
              id: currentUser.id,
              name: currentUser.name,
              email: currentUser.email,
              teamId: currentUser.teamId,
              teamName: null
            }
          } : null}
          questions={questions}
          onReviewComplete={async () => {
            // Invalidate queries to refresh the data
            queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
            queryClient.invalidateQueries({ queryKey: ["/api/users", currentUser?.id, "current-checkin"] });
            
            setShowReviewModal(false);
            setCheckinToReview(null);
            
            toast({
              title: "Self-review completed",
              description: "Your check-in has been successfully self-reviewed.",
            });
          }}
          disabled={false}
        />

        {/* Vacation Dialog */}
        <Dialog open={showVacationDialog} onOpenChange={(open) => {
          setShowVacationDialog(open);
          if (!open) {
            setSelectedTeamMemberId("");
            setVacationNote("");
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plane className="w-5 h-5" />
                Mark Vacation Week
              </DialogTitle>
              <DialogDescription>
                {selectedTeamMemberId && selectedTeamMemberId !== currentUser?.id
                  ? `Mark team member on vacation for the week ending ${(() => {
                    try {
                      if (selectedVacationWeek && !isNaN(selectedVacationWeek.getTime())) {
                        const friday = getCheckinWeekFriday(selectedVacationWeek);
                        if (friday && !isNaN(friday.getTime())) {
                          return format(friday, 'MMMM d, yyyy');
                        }
                      }
                    } catch (error) {
                      // Error formatting date - return fallback
                    }
                    return 'selected week';
                  })()}`
                  : `Mark the week ending ${(() => {
                    try {
                      if (selectedVacationWeek && !isNaN(selectedVacationWeek.getTime())) {
                        const friday = getCheckinWeekFriday(selectedVacationWeek);
                        if (friday && !isNaN(friday.getTime())) {
                          return format(friday, 'MMMM d, yyyy');
                        }
                      }
                    } catch (error) {
                      // Error formatting date - return fallback
                    }
                    return 'selected week';
                  })()} as vacation`
                }
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Team Member Selection - Only show for managers/admins */}
              {currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager') && teamMembers.length > 0 && (
                <div>
                  <Label htmlFor="team-member-select">Select Person</Label>
                  <Select
                    value={selectedTeamMemberId || currentUser.id}
                    onValueChange={setSelectedTeamMemberId}
                  >
                    <SelectTrigger id="team-member-select" data-testid="select-team-member">
                      <SelectValue placeholder="Select team member">
                        {selectedTeamMemberId 
                          ? selectedTeamMemberId === currentUser.id 
                            ? `${currentUser.name} (Self)`
                            : teamMembers.find(u => u.id === selectedTeamMemberId)?.name || "Unknown"
                          : currentUser.id && `${currentUser.name} (Self)`
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={currentUser.id} data-testid={`select-item-self`}>
                        {currentUser.name} (Self)
                      </SelectItem>
                      {teamMembers.map(member => (
                        <SelectItem 
                          key={member.id} 
                          value={member.id}
                          data-testid={`select-item-${member.id}`}
                        >
                          {member.name} {member.role === 'manager' && '(Manager)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label htmlFor="vacation-note">Note (optional)</Label>
                <Textarea
                  id="vacation-note"
                  placeholder="e.g., Family vacation, PTO, etc."
                  value={vacationNote}
                  onChange={(e) => setVacationNote(e.target.value)}
                  rows={3}
                  data-testid="textarea-vacation-note"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowVacationDialog(false);
                  setVacationNote("");
                  setSelectedTeamMemberId("");
                }}
                data-testid="button-cancel-vacation"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedVacationWeek) {
                    const targetUserId = selectedTeamMemberId || currentUser?.id;
                    markVacationMutation.mutate({
                      weekOf: selectedVacationWeek,
                      note: vacationNote || undefined,
                      targetUserId: targetUserId !== currentUser?.id ? targetUserId : undefined,
                    });
                  }
                }}
                disabled={!selectedVacationWeek || markVacationMutation.isPending}
                data-testid="button-confirm-vacation"
              >
                <Plane className="w-4 h-4 mr-2" />
                {markVacationMutation.isPending 
                  ? "Marking..." 
                  : selectedTeamMemberId && selectedTeamMemberId !== currentUser?.id
                    ? `Mark ${teamMembers.find(u => u.id === selectedTeamMemberId)?.name || "Team Member"} as on Vacation`
                    : "Mark as Vacation"
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </>
  );
}