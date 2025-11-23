import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { formatDistanceToNow, formatDistance, format, startOfWeek, addWeeks, differenceInDays, endOfWeek, isSameWeek, isToday, isPast } from "date-fns";
import { getCheckinWeekFriday } from "@shared/utils/dueDates";
import { 
  CheckCircle, XCircle, Clock, Eye, MessageSquare, Filter, Calendar, User, AlertCircle, Send, UserMinus, Bell,
  Plane, Download, Users, TrendingDown, TrendingUp, ChevronLeft, ChevronRight, Activity, BellRing, Info, CheckCheck,
  ChevronDown, ChevronUp, BarChart3, Target, Award, AlertTriangle, Sparkles, Shield, Zap, Heart, Plus,
  ClipboardList, ClipboardCheck, FileText, TrendingUp as TrendUp, TrendingDown as TrendDown, Smile, Flag, UserPlus
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import CheckinDetail from "@/components/checkin/checkin-detail";
import ReviewModal from "@/components/checkin/review-modal";
import { cn } from "@/lib/utils";
import Papa from "papaparse";
import { getCheckinDueDate, getWeekStartCentral, getDueDateString } from "@shared/utils/dueDates";
import type { Checkin, User as UserType, Question, ReviewCheckin, Team, Vacation, Organization } from "@shared/schema";

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
  status: 'submitted' | 'missing' | 'overdue' | 'on-vacation' | 'exempted';
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

// Helper function to get compliance color
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

// Client-side form schema for check-in submission
const createCheckinFormSchema = (questions: Question[]) => {
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
    responseEmojis: z.record(z.string()).optional().default({}),
    responseFlags: z.record(z.object({
      addToOneOnOne: z.boolean().default(false),
      flagForFollowUp: z.boolean().default(false),
    })).optional().default({}),
  });
};

type CheckinForm = {
  overallMood: number;
  responses: Record<string, string>;
  responseEmojis?: Record<string, string>;
  responseFlags?: Record<string, { addToOneOnOne: boolean; flagForFollowUp: boolean }>;
};

export default function CheckinManagement() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [location, setLocation] = useLocation();
  
  // Get initial tab from URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const initialTabParam = urlParams.get('tab');
  
  // Map query parameter values to internal tab names
  const mapParamToTab = (param: string | null): "my-checkin" | "team-checkins" | "reviews" | "compliance" | "reminders" => {
    switch(param) {
      case 'my-checkin':
        return 'my-checkin';
      case 'team':
        return 'team-checkins';
      case 'reviews':
        return 'reviews';
      case 'compliance':
        return 'compliance';
      case 'reminders':
        return 'reminders';
      default:
        return 'my-checkin';
    }
  };
  
  // Map internal tab names to query parameter values
  const mapTabToParam = (tab: string): string => {
    switch(tab) {
      case 'my-checkin':
        return 'my-checkin';
      case 'team-checkins':
        return 'team';
      case 'reviews':
        return 'reviews';
      case 'compliance':
        return 'compliance';
      case 'reminders':
        return 'reminders';
      default:
        return 'my-checkin';
    }
  };
  
  const [activeTab, setActiveTab] = useState<"my-checkin" | "team-checkins" | "reviews" | "compliance" | "reminders">(
    mapParamToTab(initialTabParam)
  );
  const [selectedWeek, setSelectedWeek] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 6 }));
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    const tab = value as "my-checkin" | "team-checkins" | "reviews" | "compliance" | "reminders";
    setActiveTab(tab);
    
    // Update URL with the new tab parameter
    const params = new URLSearchParams(window.location.search);
    params.set('tab', mapTabToParam(tab));
    
    // Keep the organization parameter if it exists
    const orgParam = params.get('org');
    const queryString = params.toString();
    const newUrl = `/checkin-management${queryString ? '?' + queryString : ''}`;
    
    setLocation(newUrl);
  };
  
  // Sync URL with tab state (handle browser back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      setActiveTab(mapParamToTab(tabParam));
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCheckin, setSelectedCheckin] = useState<(Checkin & { user?: UserType }) | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [checkinToReview, setCheckinToReview] = useState<Checkin | null>(null);
  const [reviewsTab, setReviewsTab] = useState<"pending" | "reviewed" | "missing">("pending");
  const [selectedUsersForReminder, setSelectedUsersForReminder] = useState<Set<string>>(new Set());
  const [reminderMessage, setReminderMessage] = useState("");
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  const [complianceView, setComplianceView] = useState<"teams" | "individuals">("teams");
  const [vacationNote, setVacationNote] = useState("");
  const [showVacationDialog, setShowVacationDialog] = useState(false);
  const [showPreviousWeekDialog, setShowPreviousWeekDialog] = useState(false);
  const [isSubmittingLate, setIsSubmittingLate] = useState(false);

  // Get current week and previous week starts
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 6 });
  const previousWeekStart = addWeeks(currentWeekStart, -1);
  const isCurrentWeek = isSameWeek(selectedWeek, currentWeekStart, { weekStartsOn: 6 });
  const isPreviousWeek = isSameWeek(selectedWeek, previousWeekStart, { weekStartsOn: 6 });

  // Calculate if user is admin or manager
  const isAdmin = currentUser?.role === "admin";
  const isManager = currentUser?.role === "manager";
  const canViewReviews = isAdmin || isManager;
  const canSendReminders = isAdmin || isManager;
  const canViewCompliance = isAdmin || isManager;
  const needsSelfReview = currentUser && !currentUser.managerId;

  // Fetch teams for filtering
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
    enabled: !userLoading && !!currentUser && isAdmin,
  });

  // Fetch questions for check-in form
  const { data: questions = [], isLoading: questionsLoading } = useQuery<Question[]>({
    queryKey: ["/api/questions?forCheckin=true"],
  });

  // Filter for only active questions
  const activeQuestions = questions.filter(q => q.isActive);

  // Fetch user's check-ins
  const { data: userCheckins = [], isLoading: checkinsLoading, refetch: refetchCheckins } = useQuery<Checkin[]>({
    queryKey: ["/api/checkins", { userId: currentUser?.id }],
    enabled: !userLoading && !!currentUser,
  });

  // Sort check-ins by date (newest first)
  const sortedCheckins = useMemo(() => {
    return [...userCheckins].sort((a, b) => 
      new Date(b.weekOf).getTime() - new Date(a.weekOf).getTime()
    );
  }, [userCheckins]);

  // Find current week check-in
  const currentWeekCheckin = sortedCheckins.find(checkin => 
    isSameWeek(new Date(checkin.weekOf), currentWeekStart, { weekStartsOn: 6 })
  );

  // Find previous week check-in for late submission
  const previousWeekCheckin = sortedCheckins.find(checkin =>
    isSameWeek(new Date(checkin.weekOf), previousWeekStart, { weekStartsOn: 6 })
  );

  // Get historical check-ins (last 6 weeks excluding current)
  const historicalCheckins = sortedCheckins.filter(checkin => 
    !isSameWeek(new Date(checkin.weekOf), currentWeekStart, { weekStartsOn: 6 })
  ).slice(0, 6);

  // Fetch vacations
  const { data: vacations = [] } = useQuery<Vacation[]>({
    queryKey: ["/api/vacations", { userId: currentUser?.id }],
    enabled: !userLoading && !!currentUser,
  });

  // Check if current week is marked as vacation
  const currentWeekVacation = useMemo(() => {
    return vacations.find(v => 
      isSameWeek(new Date(v.weekOf), currentWeekStart, { weekStartsOn: 6 })
    );
  }, [vacations, currentWeekStart]);

  // Check if previous week was marked as vacation
  const previousWeekVacation = useMemo(() => {
    return vacations.find(v => 
      isSameWeek(new Date(v.weekOf), previousWeekStart, { weekStartsOn: 6 })
    );
  }, [vacations, previousWeekStart]);

  // Fetch team check-ins for selected week
  const { data: teamCheckinsData = { checkins: [] }, isLoading: teamCheckinsLoading } = useQuery({
    queryKey: ["/api/checkins/team", selectedWeek.toISOString(), selectedTeamId],
    queryFn: async () => {
      const weekStart = getWeekStartCentral(selectedWeek);
      
      const params = new URLSearchParams({
        weekStart: weekStart.toISOString(),
        ...(selectedTeamId && { teamId: selectedTeamId })
      });
      
      const response = await fetch(`/api/checkins/team?${params}`);
      if (!response.ok) throw new Error("Failed to fetch team check-ins");
      const data = await response.json();
      
      return data;
    },
    enabled: !userLoading && !!currentUser && canViewReviews,
  });

  // Fetch check-ins for review
  // CRITICAL: Include selectedWeek in query key so reviewed/missing refresh when week changes
  // The backend returns ALL pending reviews regardless of week, but reviewed/missing are filtered by week
  const { data: reviewCheckins = { pending: [], reviewed: [], missing: [] }, isLoading: reviewCheckinsLoading } = useQuery({
    queryKey: ["/api/checkins/reviews", selectedWeek.toISOString()], // Include week for cache invalidation
    queryFn: async () => {
      const weekStart = getWeekStartCentral(selectedWeek);
      
      // The server returns ALL pending reviews regardless of week
      // But we still send weekStart for reviewed/missing filtering
      const response = await fetch(`/api/checkins/reviews?weekStart=${weekStart.toISOString()}`);
      if (!response.ok) throw new Error("Failed to fetch review check-ins");
      const data = await response.json();
      
      return data;
    },
    enabled: !userLoading && !!currentUser && canViewReviews,
  });

  // Fetch compliance data
  const { data: complianceData = null, isLoading: complianceLoading } = useQuery<{
    teams: TeamComplianceData[];
    organization: OrganizationSummary;
  }>({
    queryKey: ["/api/checkins/compliance", selectedWeek.toISOString()],
    queryFn: async () => {
      const weekStart = getWeekStartCentral(selectedWeek);
      const response = await fetch(`/api/checkins/compliance?weekStart=${weekStart.toISOString()}`);
      if (!response.ok) throw new Error("Failed to fetch compliance data");
      return response.json();
    },
    enabled: !userLoading && !!currentUser && canViewCompliance,
  });

  // Fetch users without check-ins for reminders
  const { data: usersWithoutCheckins = [], isLoading: remindersLoading } = useQuery<UserWithoutCheckin[]>({
    queryKey: ["/api/checkins/missing", selectedWeek.toISOString()],
    queryFn: async () => {
      const weekStart = getWeekStartCentral(selectedWeek);
      const response = await fetch(`/api/checkins/missing?weekStart=${weekStart.toISOString()}`);
      if (!response.ok) throw new Error("Failed to fetch missing check-ins");
      return response.json();
    },
    enabled: !userLoading && !!currentUser && canSendReminders && isCurrentWeek,
  });

  // Update effect for reviewCheckins changes
  useEffect(() => {
    if (reviewCheckins) {
      // Review checkins have been updated
    }
  }, [reviewCheckins, activeTab, reviewsTab]);

  // Create check-in form with dynamic schema based on questions
  const form = useForm<CheckinForm>({
    resolver: zodResolver(createCheckinFormSchema(activeQuestions)),
    defaultValues: {
      overallMood: 5,
      responses: {},
      responseEmojis: {},
      responseFlags: {},
    },
  });

  // Create/update check-in mutation
  const createCheckinMutation = useMutation({
    mutationFn: async (data: CheckinForm & { weekStartDate?: string }) => {
      const checkinPayload = {
        userId: currentUser!.id,
        weekOf: data.weekStartDate || currentWeekStart.toISOString(),
        weekStartDate: data.weekStartDate,
        overallMood: data.overallMood,
        moodRating: data.overallMood,
        responses: data.responses,
        responseEmojis: data.responseEmojis,
        responseFlags: data.responseFlags,
        teamId: currentUser?.teamId,
        managerId: currentUser?.managerId,
        isComplete: true,
        createdAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
      };

      if (currentWeekCheckin && !data.weekStartDate) {
        // Update existing check-in
        return await apiRequest("PATCH", `/api/checkins/${currentWeekCheckin.id}`, checkinPayload);
      } else {
        // Create new check-in
        return await apiRequest("POST", "/api/checkins", checkinPayload);
      }
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: isSubmittingLate 
          ? "Your late check-in has been submitted successfully!"
          : currentWeekCheckin 
            ? "Your check-in has been updated successfully!" 
            : "Your check-in has been submitted successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
      setShowCreateDialog(false);
      setShowPreviousWeekDialog(false);
      setIsSubmittingLate(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit check-in",
        variant: "destructive",
      });
    },
  });

  // Mark vacation mutation
  const markVacationMutation = useMutation({
    mutationFn: async ({ weekOf, note }: { weekOf: Date, note?: string }) => {
      return await apiRequest("POST", "/api/vacations", {
        weekOf: weekOf.toISOString(),
        note
      });
    },
    onSuccess: () => {
      toast({
        title: "Vacation marked",
        description: "Your vacation has been recorded successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vacations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
      setShowVacationDialog(false);
      setVacationNote("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark vacation",
        variant: "destructive",
      });
    },
  });

  // Send reminder mutation
  const sendReminderMutation = useMutation({
    mutationFn: async ({ userIds, message }: { userIds: string[], message?: string }) => {
      return await apiRequest("POST", "/api/checkins/reminders", {
        userIds,
        message,
        weekStart: selectedWeek.toISOString()
      });
    },
    onSuccess: () => {
      toast({
        title: "Reminders sent",
        description: "Check-in reminders have been sent successfully",
      });
      setSelectedUsersForReminder(new Set());
      setReminderMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/checkins/missing"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send reminders",
        variant: "destructive",
      });
    },
  });

  // Handle check-in submission
  const handleSubmitCheckin = async (data: CheckinForm) => {
    await createCheckinMutation.mutateAsync(data);
  };

  // Handle late check-in submission
  const handleLateCheckinSubmit = async (data: CheckinForm) => {
    await createCheckinMutation.mutateAsync({
      ...data,
      weekStartDate: previousWeekStart.toISOString()
    });
  };

  // Handle bulk reminder sending
  const handleSendReminders = async () => {
    if (selectedUsersForReminder.size === 0) {
      toast({
        title: "No users selected",
        description: "Please select at least one user to send reminders",
        variant: "destructive",
      });
      return;
    }

    setIsSendingReminders(true);
    try {
      await sendReminderMutation.mutateAsync({
        userIds: Array.from(selectedUsersForReminder),
        message: reminderMessage
      });
    } finally {
      setIsSendingReminders(false);
    }
  };

  // Export compliance data to CSV
  const exportComplianceData = () => {
    if (!complianceData) return;

    const csvData: any[] = [];

    // Add headers
    csvData.push({
      "Team": "",
      "Member": "",
      "Email": "",
      "Status": "",
      "Compliance Rate": "",
      "On-Time Rate": "",
      "Current Week": "",
      "Mood Rating": "",
      "Submitted At": ""
    });

    // Add team data
    complianceData.teams.forEach(team => {
      team.members.forEach(member => {
        csvData.push({
          "Team": team.teamName,
          "Member": member.userName,
          "Email": member.email,
          "Status": member.status,
          "Compliance Rate": `${member.compliance.rate}%`,
          "On-Time Rate": `${member.compliance.onTimeRate}%`,
          "Current Week": member.status === 'submitted' ? 'Yes' : member.status === 'on-vacation' ? 'Vacation' : member.status === 'exempted' ? 'Exempted' : 'No',
          "Mood Rating": member.moodRating || '-',
          "Submitted At": member.submittedAt ? format(new Date(member.submittedAt), 'MMM dd, yyyy HH:mm') : '-'
        });
      });
    });

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `compliance_report_${format(selectedWeek, 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Check-in Management</h1>
            <p className="text-muted-foreground mt-1">
              Manage all check-in activities in one place
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Week selector */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSelectedWeek(addWeeks(selectedWeek, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[200px] text-center">
                <div className="font-semibold">
                  {format(selectedWeek, 'MMM dd')} - {format(endOfWeek(selectedWeek, { weekStartsOn: 6 }), 'MMM dd, yyyy')}
                </div>
                {isCurrentWeek && (
                  <Badge variant="default" className="mt-1">Current Week</Badge>
                )}
                {isPreviousWeek && (
                  <Badge variant="secondary" className="mt-1">Previous Week</Badge>
                )}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSelectedWeek(addWeeks(selectedWeek, 1))}
                disabled={selectedWeek >= currentWeekStart}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Main tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 gap-2 h-auto">
            <TabsTrigger value="my-checkin" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              My Check-in
            </TabsTrigger>
            {canViewReviews && (
              <TabsTrigger value="team-checkins" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team Check-ins
              </TabsTrigger>
            )}
            {canViewReviews && (
              <TabsTrigger value="reviews" className="flex items-center gap-2 relative">
                <ClipboardCheck className="h-4 w-4" />
                Reviews
                {reviewCheckins.pending.length > 0 && (
                  <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center">
                    {reviewCheckins.pending.length}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            {canViewCompliance && (
              <TabsTrigger value="compliance" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Compliance
              </TabsTrigger>
            )}
            {canSendReminders && isCurrentWeek && (
              <TabsTrigger value="reminders" className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Send Reminders
                {usersWithoutCheckins.length > 0 && (
                  <Badge variant="secondary">
                    {usersWithoutCheckins.length}
                  </Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          {/* Tab 1: My Check-in */}
          <TabsContent value="my-checkin" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Current week status */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Current Week Check-in</CardTitle>
                    {isCurrentWeek && (
                      <div className="flex gap-2">
                        {!currentWeekCheckin && !currentWeekVacation && (
                          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                            <DialogTrigger asChild>
                              <Button>
                                <Plus className="mr-2 h-4 w-4" />
                                Submit Check-in
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>Submit Your Weekly Check-in</DialogTitle>
                                <DialogDescription>
                                  Reflect on your week and share your progress
                                </DialogDescription>
                              </DialogHeader>
                              <Form {...form}>
                                <form onSubmit={form.handleSubmit(handleSubmitCheckin)} className="space-y-6">
                                  {/* Mood rating */}
                                  <FormField
                                    control={form.control}
                                    name="overallMood"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>How are you feeling overall?</FormLabel>
                                        <FormControl>
                                          <RatingStars
                                            rating={field.value}
                                            onRatingChange={field.onChange}
                                            size="lg"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />

                                  {/* Questions */}
                                  {activeQuestions.map((question) => (
                                    <div key={question.id} className="space-y-2">
                                      <FormField
                                        control={form.control}
                                        name={`responses.${question.id}`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>{question.text}</FormLabel>
                                            <FormControl>
                                              <Textarea
                                                {...field}
                                                placeholder="Share your thoughts..."
                                                className="min-h-[100px]"
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      
                                      {/* Response options */}
                                      <div className="flex items-center gap-4 ml-4">
                                        <FormField
                                          control={form.control}
                                          name={`responseEmojis.${question.id}`}
                                          render={({ field }) => (
                                            <Popover>
                                              <PopoverTrigger asChild>
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-8"
                                                >
                                                  <Smile className="h-4 w-4 mr-1" />
                                                  {field.value || "Add emoji"}
                                                </Button>
                                              </PopoverTrigger>
                                              <PopoverContent className="w-auto p-2">
                                                <div className="grid grid-cols-5 gap-1">
                                                  {COMMON_EMOJIS.map((emoji) => (
                                                    <Button
                                                      key={emoji}
                                                      type="button"
                                                      variant="ghost"
                                                      size="sm"
                                                      className="h-8 w-8 p-0"
                                                      onClick={() => field.onChange(emoji)}
                                                    >
                                                      {emoji}
                                                    </Button>
                                                  ))}
                                                </div>
                                              </PopoverContent>
                                            </Popover>
                                          )}
                                        />
                                        
                                        <FormField
                                          control={form.control}
                                          name={`responseFlags.${question.id}.addToOneOnOne`}
                                          render={({ field }) => (
                                            <div className="flex items-center space-x-2">
                                              <Checkbox
                                                id={`one-on-one-${question.id}`}
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                              />
                                              <Label
                                                htmlFor={`one-on-one-${question.id}`}
                                                className="text-sm font-normal cursor-pointer"
                                              >
                                                Add to 1:1
                                              </Label>
                                            </div>
                                          )}
                                        />
                                        
                                        <FormField
                                          control={form.control}
                                          name={`responseFlags.${question.id}.flagForFollowUp`}
                                          render={({ field }) => (
                                            <div className="flex items-center space-x-2">
                                              <Checkbox
                                                id={`follow-up-${question.id}`}
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                              />
                                              <Label
                                                htmlFor={`follow-up-${question.id}`}
                                                className="text-sm font-normal cursor-pointer"
                                              >
                                                Flag for follow-up
                                              </Label>
                                            </div>
                                          )}
                                        />
                                      </div>
                                    </div>
                                  ))}

                                  <DialogFooter>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => setShowCreateDialog(false)}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      type="submit"
                                      disabled={createCheckinMutation.isPending}
                                    >
                                      {createCheckinMutation.isPending ? (
                                        <>
                                          <Clock className="mr-2 h-4 w-4 animate-spin" />
                                          Submitting...
                                        </>
                                      ) : (
                                        currentWeekCheckin ? "Update Check-in" : "Submit Check-in"
                                      )}
                                    </Button>
                                  </DialogFooter>
                                </form>
                              </Form>
                            </DialogContent>
                          </Dialog>
                        )}
                        {currentWeekCheckin && (
                          <Button
                            variant="outline"
                            onClick={() => setShowCreateDialog(true)}
                          >
                            Edit Check-in
                          </Button>
                        )}
                        {!currentWeekCheckin && !currentWeekVacation && (
                          <Button
                            variant="outline"
                            onClick={() => setShowVacationDialog(true)}
                          >
                            <Plane className="mr-2 h-4 w-4" />
                            Mark as Vacation
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {currentWeekVacation ? (
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Plane className="h-5 w-5" />
                      <div>
                        <p className="font-medium">You're on vacation this week</p>
                        {currentWeekVacation.note && (
                          <p className="text-sm mt-1">{currentWeekVacation.note}</p>
                        )}
                      </div>
                    </div>
                  ) : currentWeekCheckin ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <RatingStars rating={currentWeekCheckin.overallMood || 0} />
                          <Badge variant="default">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Submitted
                          </Badge>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(currentWeekCheckin.submittedAt || currentWeekCheckin.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      
                      {/* Show responses */}
                      {currentWeekCheckin.responses && typeof currentWeekCheckin.responses === 'object' && Object.keys(currentWeekCheckin.responses as Record<string, any>).length > 0 ? (
                        <div className="space-y-3 pt-2">
                          {Object.entries(currentWeekCheckin.responses as Record<string, string>).map(([questionId, response]) => {
                            const question = activeQuestions.find(q => q.id === questionId);
                            if (!question) return null;
                            
                            return (
                              <div key={questionId} className="space-y-1">
                                <p className="text-sm font-medium">{question.text}</p>
                                <p className="text-sm text-muted-foreground pl-4">{response}</p>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div>
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          No check-in submitted for this week yet.
                          {isCurrentWeek && " Submit your check-in before the deadline!"}
                        </AlertDescription>
                      </Alert>
                      
                      {/* Show option for late submission if previous week not submitted */}
                      {isPast(getCheckinDueDate(previousWeekStart)) && !previousWeekCheckin && !previousWeekVacation && (
                        <Alert className="mt-4">
                          <Clock className="h-4 w-4" />
                          <AlertDescription>
                            <div className="flex items-center justify-between">
                              <span>You missed last week's check-in. You can still submit it late.</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setIsSubmittingLate(true);
                                  setShowPreviousWeekDialog(true);
                                }}
                              >
                                Submit Late
                              </Button>
                            </div>
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Submission history */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Recent Check-ins</CardTitle>
                  <CardDescription>Your last 6 check-ins</CardDescription>
                </CardHeader>
                <CardContent>
                  {historicalCheckins.length > 0 ? (
                    <div className="space-y-3">
                      {historicalCheckins.map((checkin) => (
                        <div
                          key={checkin.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                          onClick={() => setSelectedCheckin(checkin as any)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "h-2 w-2 rounded-full",
                              checkin.isComplete ? "bg-green-500" : "bg-yellow-500"
                            )} />
                            <div>
                              <p className="font-medium">
                                Week ending {format(getCheckinWeekFriday(new Date(checkin.weekOf)), 'MMM dd, yyyy')}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <RatingStars rating={checkin.overallMood || 0} size="sm" />
                                {checkin.reviewStatus === 'reviewed' && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Eye className="mr-1 h-3 w-3" />
                                    Reviewed
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No previous check-ins found</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Late submission dialog */}
            <Dialog open={showPreviousWeekDialog} onOpenChange={setShowPreviousWeekDialog}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Submit Late Check-in</DialogTitle>
                  <DialogDescription>
                    Submit your check-in for the week of {format(previousWeekStart, 'MMM dd, yyyy')}
                  </DialogDescription>
                </DialogHeader>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    This check-in will be marked as submitted late.
                  </AlertDescription>
                </Alert>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleLateCheckinSubmit)} className="space-y-6">
                    {/* Mood rating */}
                    <FormField
                      control={form.control}
                      name="overallMood"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>How were you feeling that week?</FormLabel>
                          <FormControl>
                            <RatingStars
                              rating={field.value}
                              onRatingChange={field.onChange}
                              size="lg"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Questions */}
                    {activeQuestions.map((question) => (
                      <FormField
                        key={question.id}
                        control={form.control}
                        name={`responses.${question.id}`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{question.text}</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                placeholder="Share your thoughts..."
                                className="min-h-[100px]"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowPreviousWeekDialog(false);
                          setIsSubmittingLate(false);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={createCheckinMutation.isPending}
                      >
                        {createCheckinMutation.isPending ? (
                          <>
                            <Clock className="mr-2 h-4 w-4 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          "Submit Late Check-in"
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>

            {/* Vacation dialog */}
            <Dialog open={showVacationDialog} onOpenChange={setShowVacationDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Mark as Vacation</DialogTitle>
                  <DialogDescription>
                    Mark this week as vacation to skip the check-in requirement
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Vacation note (optional)</Label>
                    <Textarea
                      value={vacationNote}
                      onChange={(e) => setVacationNote(e.target.value)}
                      placeholder="e.g., Out of office for family vacation"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowVacationDialog(false);
                      setVacationNote("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => markVacationMutation.mutate({
                      weekOf: currentWeekStart,
                      note: vacationNote
                    })}
                    disabled={markVacationMutation.isPending}
                  >
                    <Plane className="mr-2 h-4 w-4" />
                    Mark as Vacation
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Tab 2: Team Check-ins */}
          {canViewReviews && (
            <TabsContent value="team-checkins" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Team Check-ins</CardTitle>
                        <CardDescription>
                          View check-in status for all team members
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        {isAdmin && teams.length > 0 && (
                          <Select
                            value={selectedTeamId || "all"}
                            onValueChange={(value) => {
                              setSelectedTeamId(value === "all" ? null : value);
                              setSelectedUserId(null); // Reset user filter when team changes
                            }}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Filter by team" />
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
                        )}
                        {teamCheckinsData?.checkins && teamCheckinsData.checkins.length > 0 && (
                          <Select
                            value={selectedUserId || "all"}
                            onValueChange={(value) => setSelectedUserId(value === "all" ? null : value)}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Filter by user" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Users</SelectItem>
                              {(Array.from(new Map((teamCheckinsData?.checkins || []).map((c: EnhancedCheckin) => [
                                c.user?.id, 
                                { id: c.user?.id, name: c.user?.name }
                              ])).values()) as { id: string; name: string }[])
                                .filter(u => u.id)
                                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                                .map((user) => (
                                  <SelectItem key={user.id} value={user.id!}>
                                    {user.name || 'Unknown User'}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Info className="h-4 w-4" />
                      <span>Showing check-ins for week of {format(selectedWeek, 'MMMM d, yyyy')}</span>
                      {selectedTeamId && <Badge variant="outline">{teams.find(t => t.id === selectedTeamId)?.name || 'Team'}</Badge>}
                      {selectedUserId && <Badge variant="outline">User filtered</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {teamCheckinsLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : teamCheckinsData?.checkins && teamCheckinsData.checkins.length > 0 ? (
                    <div className="space-y-3">
                      {teamCheckinsData.checkins
                        .filter((checkin: EnhancedCheckin) => {
                          // Apply user filter
                          if (selectedUserId && checkin.user?.id !== selectedUserId) {
                            return false;
                          }
                          return true;
                        })
                        .map((checkin: EnhancedCheckin) => (
                        <div
                          key={checkin.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <Avatar>
                              <AvatarFallback>
                                {checkin.user?.name?.split(' ').map(n => n[0]).join('') || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{checkin.user?.name || 'Unknown User'}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm text-muted-foreground">
                                  {checkin.user?.teamName || 'No Team'}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  Week ending {format(getCheckinWeekFriday(new Date(checkin.weekOf)), 'MMM d')}
                                </Badge>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <RatingStars rating={checkin.overallMood || 0} size="sm" />
                            {checkin.reviewStatus === 'reviewed' ? (
                              <Badge variant="secondary">
                                <CheckCheck className="mr-1 h-3 w-3" />
                                Reviewed
                              </Badge>
                            ) : checkin.reviewStatus === 'pending' ? (
                              <Badge variant="outline">
                                <Clock className="mr-1 h-3 w-3" />
                                Pending Review
                              </Badge>
                            ) : (
                              <Badge variant="default">
                                <CheckCircle className="mr-1 h-3 w-3" />
                                Submitted
                              </Badge>
                            )}
                            <span className="text-sm text-muted-foreground">
                              {formatDistanceToNow(new Date(checkin.submittedAt || checkin.createdAt), { addSuffix: true })}
                            </span>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedCheckin(checkin as any)}
                                data-testid={`button-view-team-${checkin.id}`}
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                View Details
                              </Button>
                              {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && checkin.reviewStatus === 'pending' && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setCheckinToReview(checkin);
                                    setShowReviewModal(true);
                                  }}
                                  data-testid={`button-review-team-${checkin.id}`}
                                >
                                  <Eye className="mr-2 h-4 w-4" />
                                  Review
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-2">
                        No check-ins found for week of {format(selectedWeek, 'MMM d, yyyy')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {selectedTeamId ? 'Selected team has no check-ins for this week' : 'No team members have submitted check-ins yet'}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Tab 3: Reviews */}
          {canViewReviews && (
            <TabsContent value="reviews" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Check-in Reviews</CardTitle>
                  <CardDescription>
                    Review and provide feedback on team check-ins
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs value={reviewsTab} onValueChange={(v) => setReviewsTab(v as any)}>
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="pending" className="relative">
                        Pending
                        {reviewCheckins.pending.length > 0 && (
                          <Badge variant="destructive" className="ml-2">
                            {reviewCheckins.pending.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="reviewed">
                        Reviewed
                      </TabsTrigger>
                      <TabsTrigger value="missing">
                        Missing
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="pending" className="space-y-3 mt-4">
                      {reviewCheckins.pending.length > 0 ? (
                        reviewCheckins.pending.map((checkin: EnhancedCheckin) => (
                          <div
                            key={checkin.id}
                            className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex items-center gap-4">
                              <Avatar>
                                <AvatarFallback>
                                  {checkin.user?.name?.split(' ').map(n => n[0]).join('') || '?'}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{checkin.user?.name || 'Unknown User'}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <RatingStars rating={checkin.overallMood || 0} size="sm" />
                                  <Badge variant="outline" className="text-xs">
                                    Week ending {format(getCheckinWeekFriday(new Date(checkin.weekOf)), 'MMM d, yyyy')}
                                  </Badge>
                                  <span className="text-sm text-muted-foreground">
                                    Submitted {formatDistanceToNow(new Date(checkin.submittedAt || checkin.createdAt), { addSuffix: true })}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedCheckin(checkin as any)}
                                data-testid={`button-view-details-${checkin.id}`}
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                View Details
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setCheckinToReview(checkin);
                                  setShowReviewModal(true);
                                }}
                                data-testid={`button-review-${checkin.id}`}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Review
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground mb-2">
                            No pending reviews
                          </p>
                          <p className="text-sm text-muted-foreground">
                            All check-ins have been reviewed or no submissions yet
                          </p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="reviewed" className="space-y-3 mt-4">
                      {reviewCheckins.reviewed.length > 0 ? (
                        reviewCheckins.reviewed.map((checkin: EnhancedCheckin) => (
                          <div
                            key={checkin.id}
                            className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex items-center gap-4">
                              <Avatar>
                                <AvatarFallback>
                                  {checkin.user?.name?.split(' ').map(n => n[0]).join('') || '?'}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{checkin.user?.name || 'Unknown User'}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <RatingStars rating={checkin.overallMood || 0} size="sm" />
                                  <Badge variant="secondary">
                                    <CheckCheck className="mr-1 h-3 w-3" />
                                    Reviewed by {checkin.reviewer?.name || 'Unknown'}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    Week ending {format(getCheckinWeekFriday(new Date(checkin.weekOf)), 'MMM d, yyyy')}
                                  </Badge>
                                  <span className="text-sm text-muted-foreground">
                                    {checkin.reviewedAt && formatDistanceToNow(new Date(checkin.reviewedAt), { addSuffix: true })}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedCheckin(checkin as any)}
                              data-testid={`button-view-reviewed-${checkin.id}`}
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              View Details
                            </Button>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground mb-2">
                            No reviewed check-ins for week ending {format(getCheckinWeekFriday(selectedWeek), 'MMM d, yyyy')}
                          </p>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="inline-block h-4 w-4 ml-2 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Reviews are completed by managers after check-ins are submitted</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="missing" className="space-y-3 mt-4">
                      {reviewCheckins.missing.length > 0 ? (
                        reviewCheckins.missing.map((user: UserType) => (
                          <div
                            key={user.id}
                            className="flex items-center justify-between p-4 border rounded-lg"
                          >
                            <div className="flex items-center gap-4">
                              <Avatar>
                                <AvatarFallback>
                                  {user.name?.split(' ').map(n => n[0]).join('') || '?'}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{user.name}</p>
                                <p className="text-sm text-muted-foreground">{user.email}</p>
                              </div>
                            </div>
                            <Badge variant="destructive">
                              <XCircle className="mr-1 h-3 w-3" />
                              Not Submitted
                            </Badge>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground text-center py-8">
                          All team members have submitted their check-ins
                        </p>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Tab 4: Compliance */}
          {canViewCompliance && (
            <TabsContent value="compliance" className="space-y-6">
              <div className="grid gap-4 md:grid-cols-4">
                {/* Overview metrics */}
                {complianceData && (
                  <>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Overall Submission Rate</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {complianceData.organization.overall.submissionRate}%
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {complianceData.organization.overall.submitted} of {complianceData.organization.overall.expected}
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Active Users</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {complianceData.organization.overall.totalActive}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {complianceData.organization.overall.onVacation} on vacation
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Top Performing Team</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {complianceData.organization.teams.topPerforming[0] ? (
                          <>
                            <div className="text-lg font-semibold truncate">
                              {complianceData.organization.teams.topPerforming[0].teamName}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {complianceData.organization.teams.topPerforming[0].submissionRate}% compliance
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">No data</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Actions</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={exportComplianceData}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Export CSV
                        </Button>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>

              {/* Team compliance data */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Compliance by Team</CardTitle>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="compliance-view">View:</Label>
                      <Select
                        value={complianceView}
                        onValueChange={(v) => setComplianceView(v as any)}
                      >
                        <SelectTrigger id="compliance-view" className="w-[150px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="teams">By Team</SelectItem>
                          <SelectItem value="individuals">By Individual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {complianceLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                      ))}
                    </div>
                  ) : complianceData ? (
                    <div className="space-y-4">
                      {complianceView === "teams" ? (
                        complianceData.teams.map((team) => (
                          <Collapsible key={team.teamId}>
                            <CollapsibleTrigger className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors w-full">
                              <div className="flex items-center gap-4">
                                <div className={cn(
                                  "h-3 w-3 rounded-full",
                                  team.metrics.submissionRate >= 80 ? "bg-green-500" :
                                  team.metrics.submissionRate >= 50 ? "bg-yellow-500" : "bg-red-500"
                                )} />
                                <div>
                                  <p className="font-medium text-left">{team.teamName}</p>
                                  <p className="text-sm text-muted-foreground text-left">
                                    {team.members.length} members
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <div className={cn("text-lg font-bold", getComplianceColor(team.metrics.submissionRate))}>
                                    {team.metrics.submissionRate}%
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {team.metrics.submitted}/{team.metrics.expected} submitted
                                  </p>
                                </div>
                                {team.metrics.averageMood && (
                                  <RatingStars rating={team.metrics.averageMood} size="sm" />
                                )}
                                <ChevronDown className="h-4 w-4" />
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="px-4 pt-2">
                              <div className="space-y-2">
                                {team.members.map((member) => (
                                  <div
                                    key={member.userId}
                                    className="flex items-center justify-between p-3 bg-accent/20 rounded-lg"
                                  >
                                    <div className="flex items-center gap-3">
                                      <Avatar className="h-8 w-8">
                                        <AvatarFallback className="text-xs">
                                          {member.userName?.split(' ').map(n => n[0]).join('') || '?'}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div>
                                        <p className="text-sm font-medium">{member.userName}</p>
                                        <p className="text-xs text-muted-foreground">{member.email}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      {member.status === 'submitted' ? (
                                        <>
                                          <Badge variant="default" className="text-xs">
                                            <CheckCircle className="mr-1 h-3 w-3" />
                                            Submitted
                                          </Badge>
                                          {member.moodRating && (
                                            <RatingStars rating={member.moodRating} size="sm" />
                                          )}
                                        </>
                                      ) : member.status === 'on-vacation' ? (
                                        <Badge variant="secondary" className="text-xs">
                                          <Plane className="mr-1 h-3 w-3" />
                                          Vacation
                                        </Badge>
                                      ) : member.status === 'exempted' ? (
                                        <Badge variant="outline" className="text-xs">
                                          <Shield className="mr-1 h-3 w-3" />
                                          Exempted
                                        </Badge>
                                      ) : (
                                        <Badge variant="destructive" className="text-xs">
                                          <XCircle className="mr-1 h-3 w-3" />
                                          Missing
                                        </Badge>
                                      )}
                                      <div className="text-right min-w-[100px]">
                                        <div className={cn("text-sm font-semibold", getComplianceColor(member.compliance.rate))}>
                                          {member.compliance.rate}%
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                          {member.compliance.recentText}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        ))
                      ) : (
                        <div className="space-y-2">
                          {complianceData.teams.flatMap(team => team.members)
                            .sort((a, b) => b.compliance.rate - a.compliance.rate)
                            .map((member) => (
                              <div
                                key={member.userId}
                                className="flex items-center justify-between p-3 border rounded-lg"
                              >
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-8 w-8">
                                    <AvatarFallback className="text-xs">
                                      {member.userName?.split(' ').map(n => n[0]).join('') || '?'}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="text-sm font-medium">{member.userName}</p>
                                    <p className="text-xs text-muted-foreground">{member.email}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  {member.status === 'submitted' ? (
                                    <>
                                      <Badge variant="default" className="text-xs">
                                        <CheckCircle className="mr-1 h-3 w-3" />
                                        This Week
                                      </Badge>
                                      {member.moodRating && (
                                        <RatingStars rating={member.moodRating} size="sm" />
                                      )}
                                    </>
                                  ) : member.status === 'on-vacation' ? (
                                    <Badge variant="secondary" className="text-xs">
                                      <Plane className="mr-1 h-3 w-3" />
                                      Vacation
                                    </Badge>
                                  ) : member.status === 'exempted' ? (
                                    <Badge variant="outline" className="text-xs">
                                      <Shield className="mr-1 h-3 w-3" />
                                      Exempted
                                    </Badge>
                                  ) : (
                                    <Badge variant="destructive" className="text-xs">
                                      <XCircle className="mr-1 h-3 w-3" />
                                      Missing
                                    </Badge>
                                  )}
                                  <div className="text-right min-w-[120px]">
                                    <div className={cn("text-lg font-bold", getComplianceColor(member.compliance.rate))}>
                                      {member.compliance.rate}%
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {member.compliance.totalSubmitted}/{member.compliance.totalExpected} total
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      No compliance data available
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Tab 5: Send Reminders */}
          {canSendReminders && isCurrentWeek && (
            <TabsContent value="reminders" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Send Check-in Reminders</CardTitle>
                      <CardDescription>
                        Send reminders to users who haven't submitted their check-ins
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (selectedUsersForReminder.size === usersWithoutCheckins.length) {
                            setSelectedUsersForReminder(new Set());
                          } else {
                            setSelectedUsersForReminder(new Set(usersWithoutCheckins.map(u => u.user.id)));
                          }
                        }}
                      >
                        {selectedUsersForReminder.size === usersWithoutCheckins.length ? "Deselect All" : "Select All"}
                      </Button>
                      <Button
                        onClick={handleSendReminders}
                        disabled={selectedUsersForReminder.size === 0 || isSendingReminders}
                      >
                        {isSendingReminders ? (
                          <>
                            <Clock className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            Send Reminders ({selectedUsersForReminder.size})
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Custom message input */}
                  <div className="space-y-2">
                    <Label>Custom Message (optional)</Label>
                    <Textarea
                      value={reminderMessage}
                      onChange={(e) => setReminderMessage(e.target.value)}
                      placeholder="Add a personal message to the reminder..."
                      className="h-20"
                    />
                  </div>

                  {/* Users list */}
                  {remindersLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : usersWithoutCheckins.length > 0 ? (
                    <div className="space-y-2">
                      {usersWithoutCheckins.map(({ user, lastCheckin, daysSinceLastCheckin, lastReminderSent }) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={selectedUsersForReminder.has(user.id)}
                              onCheckedChange={(checked) => {
                                const newSet = new Set(selectedUsersForReminder);
                                if (checked) {
                                  newSet.add(user.id);
                                } else {
                                  newSet.delete(user.id);
                                }
                                setSelectedUsersForReminder(newSet);
                              }}
                            />
                            <Avatar>
                              <AvatarFallback>
                                {user.name?.split(' ').map(n => n[0]).join('') || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {user.teamName || 'No team'} • {user.email}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            {daysSinceLastCheckin !== null && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant={daysSinceLastCheckin > 14 ? "destructive" : "secondary"}>
                                      {daysSinceLastCheckin === 0 ? "Today" :
                                       daysSinceLastCheckin === 1 ? "1 day ago" :
                                       `${daysSinceLastCheckin} days ago`}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Last check-in submitted
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {lastReminderSent && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline">
                                      <BellRing className="mr-1 h-3 w-3" />
                                      {formatDistanceToNow(new Date(lastReminderSent), { addSuffix: true })}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Last reminder sent
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        Great! All team members have submitted their check-ins for this week.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        {/* Check-in detail modal */}
        {selectedCheckin && !showReviewModal && (
          <CheckinDetail
            checkin={selectedCheckin}
            questions={activeQuestions}
            open={!!selectedCheckin}
            onOpenChange={(open) => {
              if (!open) setSelectedCheckin(null);
            }}
          />
        )}

        {/* Review modal */}
        {showReviewModal && checkinToReview && (
          <ReviewModal
            isOpen={true}
            checkin={checkinToReview}
            onClose={() => {
              setShowReviewModal(false);
              setCheckinToReview(null);
            }}
            onReviewComplete={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/checkins/reviews"] });
              queryClient.invalidateQueries({ queryKey: ["/api/checkins/team"] });
              setShowReviewModal(false);
              setCheckinToReview(null);
            }}
          />
        )}
      </div>
    </div>
  );
}