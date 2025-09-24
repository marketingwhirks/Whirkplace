import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, Plus, Clock, CheckSquare, User, Filter, Search, ChevronDown, MessageSquare, CalendarDays, MapPin, Repeat, Star, Target, AlertCircle, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useViewAsRole } from "@/hooks/useViewAsRole";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, isToday, isThisWeek, parseISO, addMinutes } from "date-fns";
import type { OneOnOne, User as UserType } from "@shared/schema";

interface OneOnOneMeeting extends OneOnOne {
  participant?: UserType;
  manager?: UserType;
}

interface UpcomingMeetingsResponse {
  meetings: OneOnOneMeeting[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface PastMeetingsResponse {
  meetings: OneOnOneMeeting[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// Meeting scheduling form schema
const scheduleMeetingSchema = z.object({
  participantId: z.string().min(1, "Please select a participant"),
  scheduledAt: z.string()
    .min(1, "Please select a date and time")
    .refine((date) => {
      const selectedDate = new Date(date);
      const now = new Date();
      return selectedDate > now;
    }, "Meeting must be scheduled for a future date and time"),
  duration: z.preprocess(
    (val) => parseInt(val as string, 10),
    z.number().min(15, "Duration must be at least 15 minutes").max(240, "Duration cannot exceed 4 hours")
  ),
  agenda: z.string().optional(),
  notes: z.string().optional(),
  location: z.string().optional(),
  isOnlineMeeting: z.boolean().default(false),
  syncWithOutlook: z.boolean().default(false),
  // Recurring meeting fields
  isRecurring: z.boolean().default(false),
  recurrencePattern: z.enum(["weekly", "biweekly", "monthly", "quarterly"]).optional(),
  recurrenceInterval: z.preprocess(
    (val) => val ? parseInt(val as string, 10) : 1,
    z.number().min(1).max(12).default(1)
  ).optional(),
  recurrenceEndDate: z.string().optional(),
  recurrenceEndCount: z.preprocess(
    (val) => val ? parseInt(val as string, 10) : undefined,
    z.number().min(1).max(52).optional()
  )
}).refine((data) => {
  // If recurring, must have pattern and either end date or count
  if (data.isRecurring) {
    return data.recurrencePattern && (data.recurrenceEndDate || data.recurrenceEndCount);
  }
  return true;
}, {
  message: "Recurring meetings must have a recurrence pattern and either an end date or occurrence count",
  path: ["isRecurring"]
});

type ScheduleMeetingForm = z.infer<typeof scheduleMeetingSchema>;

// Meeting Detail Dialog - Shows KRAs, ratings, flagged check-ins, and action items
function MeetingDetailDialog({ meeting, trigger }: { meeting: OneOnOneMeeting; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("checkins"); // Start with check-ins tab
  const [kraRatings, setKraRatings] = useState<Record<string, number>>({});
  const [newActionItem, setNewActionItem] = useState({ description: "", dueDate: "", assignedTo: "" });
  const { toast } = useToast();
  const { data: currentUser } = useViewAsRole();

  // Fetch comprehensive agenda (KRAs, check-ins, action items)
  const { data: agenda, isLoading: agendaLoading, refetch: refetchAgenda } = useQuery({
    queryKey: [`/api/one-on-ones/${meeting.id}/agenda`],
    enabled: open,
  });

  // Submit KRA ratings
  const submitRatingsMutation = useMutation({
    mutationFn: (ratings: Array<{ kraId: string; rating: number; note?: string }>) =>
      apiRequest("POST", `/api/one-on-ones/${meeting.id}/kra-ratings`, ratings),
    onSuccess: () => {
      toast({
        title: "Ratings saved",
        description: "Your KRA ratings have been saved successfully.",
      });
      refetchAgenda();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save ratings",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create action item
  const createActionItemMutation = useMutation({
    mutationFn: (actionItem: { description: string; dueDate?: string; assignedTo: string; assignedBy: string }) =>
      apiRequest("POST", `/api/one-on-ones/${meeting.id}/action-items`, {
        ...actionItem,
        oneOnOneId: meeting.id,
        status: "open",
        carryForward: true,
      }),
    onSuccess: () => {
      toast({
        title: "Action item created",
        description: "The action item has been added to the meeting.",
      });
      setNewActionItem({ description: "", dueDate: "", assignedTo: "" });
      refetchAgenda();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create action item",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update action item status
  const updateActionItemMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PUT", `/api/action-items/${id}`, { status }),
    onSuccess: () => {
      toast({
        title: "Action item updated",
        description: "The action item status has been updated.",
      });
      refetchAgenda();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update action item",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSaveRatings = () => {
    const ratings = Object.entries(kraRatings).map(([kraId, rating]) => ({
      kraId,
      rating,
    }));
    if (ratings.length > 0) {
      submitRatingsMutation.mutate(ratings);
    }
  };

  const handleCreateActionItem = () => {
    if (!newActionItem.description || !newActionItem.assignedTo) {
      toast({
        title: "Missing information",
        description: "Please provide a description and assignee for the action item.",
        variant: "destructive",
      });
      return;
    }
    createActionItemMutation.mutate({
      ...newActionItem,
      assignedBy: currentUser?.id || "",
    });
  };

  const renderRatingStars = (kraId: string, currentRating?: number) => {
    const rating = kraRatings[kraId] || currentRating || 0;
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => setKraRatings({ ...kraRatings, [kraId]: star })}
            className="p-0 hover:scale-110 transition-transform"
            type="button"
            data-testid={`rating-star-${kraId}-${star}`}
          >
            <Star
              className={`w-5 h-5 ${
                star <= rating
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-gray-300"
              }`}
            />
          </button>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>One-on-One Meeting Details</DialogTitle>
          <DialogDescription>
            Meeting with {meeting.participant?.name || "Unknown"} on{" "}
            {format(
              typeof meeting.scheduledAt === "string"
                ? parseISO(meeting.scheduledAt)
                : new Date(meeting.scheduledAt),
              "PPP"
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="checkins">
              <AlertCircle className="w-4 h-4 mr-2" />
              Check-ins
            </TabsTrigger>
            <TabsTrigger value="kras">
              <Target className="w-4 h-4 mr-2" />
              KRAs
            </TabsTrigger>
            <TabsTrigger value="actions">
              <CheckSquare className="w-4 h-4 mr-2" />
              Actions
            </TabsTrigger>
            <TabsTrigger value="notes">
              <FileText className="w-4 h-4 mr-2" />
              Notes
            </TabsTrigger>
          </TabsList>

          {agendaLoading ? (
            <div className="p-4 text-center">
              <p className="text-muted-foreground">Loading meeting details...</p>
            </div>
          ) : (
            <>
              <TabsContent value="kras" className="space-y-4">
                <ScrollArea className="h-[400px] pr-4">
                  {agenda?.kras?.length > 0 ? (
                    <div className="space-y-4">
                      {agenda.kras.map((kra: any) => (
                        <Card key={kra.kra.id} data-testid={`kra-card-${kra.kra.id}`}>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">{kra.kra.name}</CardTitle>
                            {kra.kra.description && (
                              <CardDescription>{kra.kra.description}</CardDescription>
                            )}
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-3">
                              <div>
                                <Label className="text-sm font-medium">Your Rating</Label>
                                {renderRatingStars(kra.kra.id, kra.currentSelfRating?.rating)}
                              </div>
                              {kra.lastSupervisorRating && (
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">
                                    Last Supervisor Rating:
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary">
                                      {kra.lastSupervisorRating.rating}/5
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {format(
                                        parseISO(kra.lastSupervisorRating.createdAt),
                                        "MMM d"
                                      )}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {Object.keys(kraRatings).length > 0 && (
                        <Button
                          onClick={handleSaveRatings}
                          disabled={submitRatingsMutation.isPending}
                          className="w-full"
                          data-testid="button-save-ratings"
                        >
                          Save Ratings
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">No KRAs assigned yet</p>
                      </CardContent>
                    </Card>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="checkins" className="space-y-4">
                <ScrollArea className="h-[400px] pr-4">
                  {agenda?.recentCheckins?.length > 0 ? (
                    <div className="space-y-3">
                      {agenda.recentCheckins.map((checkin: any) => (
                        <Card key={checkin.id} data-testid={`checkin-card-${checkin.id}`}>
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <CardTitle className="text-sm font-medium">
                                Week of {format(parseISO(checkin.weekOf), "MMM d, yyyy")}
                              </CardTitle>
                              <div className="flex items-center gap-2">
                                <Badge variant={checkin.moodRating >= 4 ? "default" : checkin.moodRating >= 3 ? "secondary" : "destructive"}>
                                  Mood: {checkin.moodRating}/5
                                </Badge>
                                {checkin.flagged && (
                                  <Badge variant="outline">
                                    <AlertCircle className="w-3 h-3 mr-1" />
                                    Flagged
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-3">
                              {/* Display questions and answers */}
                              {checkin.responses && checkin.responses.length > 0 ? (
                                checkin.responses.map((response: any, index: number) => (
                                  <div key={index} className="space-y-1">
                                    <p className="text-sm font-medium text-muted-foreground">
                                      {response.question || "Question"}
                                    </p>
                                    <p className="text-sm pl-2 border-l-2 border-muted">
                                      {response.answer || "No response"}
                                    </p>
                                  </div>
                                ))
                              ) : (
                                <div className="space-y-1">
                                  <p className="text-sm font-medium text-muted-foreground">
                                    Is there anything I can help you with?
                                  </p>
                                  <p className="text-sm pl-2 border-l-2 border-muted italic text-muted-foreground">
                                    No questions answered yet
                                  </p>
                                </div>
                              )}
                              
                              {/* Show flag notes if present */}
                              {checkin.flagNotes && (
                                <div className="pt-2 border-t">
                                  <p className="text-sm font-medium text-orange-600">Flag Note:</p>
                                  <p className="text-sm text-muted-foreground">{checkin.flagNotes}</p>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">No check-ins available</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Check-ins will appear here once team members submit them
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="actions" className="space-y-4">
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="New action item..."
                      value={newActionItem.description}
                      onChange={(e) =>
                        setNewActionItem({ ...newActionItem, description: e.target.value })
                      }
                      data-testid="input-action-description"
                    />
                    <Select
                      value={newActionItem.assignedTo}
                      onValueChange={(value) =>
                        setNewActionItem({ ...newActionItem, assignedTo: value })
                      }
                    >
                      <SelectTrigger className="w-[150px]" data-testid="select-action-assignee">
                        <SelectValue placeholder="Assignee" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={meeting.participantOneId}>
                          {meeting.participant?.name || "Participant"}
                        </SelectItem>
                        <SelectItem value={meeting.participantTwoId}>
                          {meeting.manager?.name || "Manager"}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      value={newActionItem.dueDate}
                      onChange={(e) =>
                        setNewActionItem({ ...newActionItem, dueDate: e.target.value })
                      }
                      className="w-[140px]"
                      data-testid="input-action-due-date"
                    />
                    <Button
                      onClick={handleCreateActionItem}
                      disabled={createActionItemMutation.isPending}
                      data-testid="button-add-action"
                    >
                      Add
                    </Button>
                  </div>

                  <Separator />

                  <ScrollArea className="h-[350px] pr-4">
                    {agenda?.actionItems?.length > 0 ? (
                      <div className="space-y-3">
                        {agenda.actionItems.map((item: any) => (
                          <Card
                            key={item.id}
                            className={item.status === "completed" ? "opacity-60" : ""}
                            data-testid={`action-item-${item.id}`}
                          >
                            <CardContent className="pt-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1 space-y-1">
                                  <p className="text-sm font-medium">{item.description}</p>
                                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                    <span>
                                      Assigned to:{" "}
                                      {item.assignedTo === meeting.participantOneId
                                        ? meeting.participant?.name
                                        : meeting.manager?.name}
                                    </span>
                                    {item.dueDate && (
                                      <span>Due: {format(parseISO(item.dueDate), "MMM d")}</span>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  variant={item.status === "completed" ? "ghost" : "outline"}
                                  size="sm"
                                  onClick={() =>
                                    updateActionItemMutation.mutate({
                                      id: item.id,
                                      status: item.status === "completed" ? "open" : "completed",
                                    })
                                  }
                                  disabled={updateActionItemMutation.isPending}
                                  data-testid={`button-toggle-${item.id}`}
                                >
                                  {item.status === "completed" ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <CheckSquare className="w-4 h-4" />
                                  )}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <Card>
                        <CardContent className="py-8 text-center">
                          <CheckSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                          <p className="text-muted-foreground">No action items yet</p>
                        </CardContent>
                      </Card>
                    )}
                  </ScrollArea>
                </div>
              </TabsContent>

                <TabsContent value="notes" className="space-y-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        {meeting.agenda && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">Agenda</h4>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                              {meeting.agenda}
                            </p>
                          </div>
                        )}
                        {meeting.notes && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">Notes</h4>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                              {meeting.notes}
                            </p>
                          </div>
                        )}
                        {!meeting.agenda && !meeting.notes && (
                          <p className="text-center text-muted-foreground py-4">
                            No notes added yet
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
            </>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleMeetingDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { data: currentUser } = useViewAsRole();
  
  // Fetch team members for participant selection
  const { data: users = [], isLoading: usersLoading } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    enabled: open, // Only fetch when dialog is open
  });

  // Check calendar connection status
  const { data: calendarStatus } = useQuery<{connected: boolean; provider?: string}>({
    queryKey: ["/api/calendar/status"],
    enabled: open,
  });

  const form = useForm<ScheduleMeetingForm>({
    resolver: zodResolver(scheduleMeetingSchema),
    defaultValues: {
      participantId: "",
      scheduledAt: "",
      duration: 30,
      agenda: "",
      notes: "",
      location: "",
      isOnlineMeeting: false,
      syncWithOutlook: false,
      isRecurring: false,
      recurrencePattern: undefined,
      recurrenceInterval: 1,
      recurrenceEndDate: "",
      recurrenceEndCount: undefined,
    },
  });

  const scheduleMeetingMutation = useMutation({
    mutationFn: async (data: ScheduleMeetingForm) => {
      // Validate currentUser is available
      if (!currentUser?.id) {
        throw new Error("User authentication required. Please refresh the page and try again.");
      }

      // Get participant details for calendar event
      const participant = users.find(user => user.id === data.participantId);
      if (!participant) {
        throw new Error("Selected participant not found. Please refresh and try again.");
      }
      
      // Create meeting data with current user as one participant
      const meetingData = {
        participantOneId: currentUser.id, // Current user (usually manager)
        participantTwoId: data.participantId, // Selected participant
        scheduledAt: data.scheduledAt,
        duration: data.duration,
        agenda: data.agenda || null,
        notes: data.notes || null,
        location: data.location || null,
        isOnlineMeeting: data.isOnlineMeeting,
        syncWithOutlook: data.syncWithOutlook,
        status: "scheduled",
        // Recurring meeting fields
        isRecurring: data.isRecurring,
        recurrencePattern: data.isRecurring ? data.recurrencePattern : null,
        recurrenceInterval: data.isRecurring ? data.recurrenceInterval : null,
        recurrenceEndDate: data.isRecurring && data.recurrenceEndDate ? data.recurrenceEndDate : null,
        recurrenceEndCount: data.isRecurring && data.recurrenceEndCount ? data.recurrenceEndCount : null
      };

      // Create the one-on-one meeting first
      const createdMeeting = await apiRequest("POST", "/api/one-on-ones", meetingData);

      // If Outlook sync is enabled and calendar is connected, create calendar event
      if (data.syncWithOutlook && calendarStatus?.connected && participant) {
        try {
          const startTime = new Date(data.scheduledAt);
          const endTime = addMinutes(startTime, data.duration);
          
          const calendarEventData = {
            title: `One-on-One: ${currentUser.name} & ${participant.name}`,
            description: data.agenda ? `Agenda: ${data.agenda}` : "One-on-one meeting",
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            location: data.location || "To be determined",
            isOnlineMeeting: data.isOnlineMeeting,
            attendees: [
              {
                email: participant.email,
                name: participant.name,
                type: "required"
              }
            ]
          };

          // Create calendar event
          const calendarEvent = await apiRequest("POST", "/api/calendar/events", calendarEventData);
          
          // Update meeting with calendar event details
          if (calendarEvent?.id) {
            await apiRequest("PUT", `/api/one-on-ones/${createdMeeting.id}`, {
              outlookEventId: calendarEvent.id,
              meetingUrl: calendarEvent.meetingUrl || null
            });
          }
        } catch (calendarError) {
          console.warn("Failed to create calendar event:", calendarError);
          // Show user-friendly warning but don't fail the meeting creation
          toast({
            title: "Meeting Scheduled with Calendar Sync Issue",
            description: "Your meeting was created successfully, but we couldn't sync it to your calendar. You can manually add it to your calendar.",
            variant: "default",
          });
        }
      }

      return createdMeeting;
    },
    onSuccess: (data) => {
      const successMessage = data?.syncWithOutlook && calendarStatus?.connected
        ? "Your one-on-one meeting has been successfully scheduled and added to your calendar!"
        : "Your one-on-one meeting has been successfully scheduled.";
        
      toast({
        title: "Meeting Scheduled! 🎉",
        description: successMessage,
      });
      
      // Reset form and close dialog
      form.reset();
      setOpen(false);
      
      // Invalidate relevant queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/one-on-ones/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/one-on-ones"] });
    },
    onError: (error: any) => {
      console.error("Meeting scheduling error:", error);
      toast({
        title: "Failed to Schedule Meeting",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSchedule = (data: ScheduleMeetingForm) => {
    scheduleMeetingMutation.mutate(data);
  };

  // Filter users to exclude current user and show only active team members
  const availableParticipants = users.filter(user => 
    user.id !== currentUser?.id && 
    user.isActive && 
    user.id
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule New One-on-One</DialogTitle>
          <DialogDescription>
            Schedule a one-on-one meeting with a team member.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSchedule)} className="space-y-4">
            {/* Participant Selection */}
            <FormField
              control={form.control}
              name="participantId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Participant</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-participant">
                        <SelectValue placeholder="Select team member" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {usersLoading ? (
                        <SelectItem value="loading" disabled>Loading team members...</SelectItem>
                      ) : availableParticipants.length === 0 ? (
                        <SelectItem value="none" disabled>No team members available</SelectItem>
                      ) : (
                        availableParticipants.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name} ({user.role})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Date and Time */}
            <FormField
              control={form.control}
              name="scheduledAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date & Time</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      {...field}
                      min={new Date().toISOString().slice(0, 16)}
                      data-testid="input-scheduled-at"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Duration */}
            <FormField
              control={form.control}
              name="duration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (minutes)</FormLabel>
                  <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={String(field.value)}>
                    <FormControl>
                      <SelectTrigger data-testid="select-duration">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="90">1.5 hours</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Location */}
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location (Optional)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Conference Room A, Virtual, etc."
                      {...field}
                      data-testid="input-location"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Agenda */}
            <FormField
              control={form.control}
              name="agenda"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agenda (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Meeting agenda or topics to discuss..."
                      {...field}
                      rows={3}
                      data-testid="textarea-agenda"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Microsoft Calendar Integration */}
            {calendarStatus?.connected && (
              <FormField
                control={form.control}
                name="syncWithOutlook"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-medium">
                        Add to Outlook Calendar
                      </FormLabel>
                      <FormDescription className="text-xs">
                        Automatically create a calendar event
                      </FormDescription>
                    </div>
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={field.onChange}
                        className="data-[state=checked]:bg-primary"
                        data-testid="checkbox-sync-outlook"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            {/* Recurring Meeting Options */}
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center space-x-2">
                <Repeat className="w-4 h-4 text-primary" />
                <FormLabel className="text-sm font-medium">Recurring Meeting</FormLabel>
              </div>
              
              <FormField
                control={form.control}
                name="isRecurring"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-medium">
                        Make this a recurring meeting
                      </FormLabel>
                      <FormDescription className="text-xs">
                        Schedule multiple meetings at regular intervals
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-recurring"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              {form.watch("isRecurring") && (
                <div className="space-y-4 ml-4 border-l-2 border-primary/20 pl-4">
                  {/* Recurrence Pattern */}
                  <FormField
                    control={form.control}
                    name="recurrencePattern"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Frequency</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-recurrence-pattern">
                              <SelectValue placeholder="Select frequency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="biweekly">Bi-weekly (Every 2 weeks)</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Recurrence Interval */}
                  <FormField
                    control={form.control}
                    name="recurrenceInterval"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Repeat every</FormLabel>
                        <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={String(field.value)}>
                          <FormControl>
                            <SelectTrigger data-testid="select-recurrence-interval">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {[1, 2, 3, 4, 5, 6].map((num) => (
                              <SelectItem key={num} value={String(num)}>
                                {num} {form.watch("recurrencePattern")?.replace('ly', '').replace('weekly', 'week')}
                                {num > 1 ? 's' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* End Options */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="recurrenceEndDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              min={new Date().toISOString().split('T')[0]}
                              data-testid="input-recurrence-end-date"
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            When to stop the recurring series
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="recurrenceEndCount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Number of Meetings (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              max="52"
                              placeholder="e.g., 10"
                              {...field}
                              data-testid="input-recurrence-end-count"
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Total meetings to schedule
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg">
                    <strong>Note:</strong> Either specify an end date or number of meetings. If both are provided, the series will end when the first condition is met.
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex justify-end space-x-3 pt-4">
              <Button 
                variant="secondary" 
                type="button" 
                onClick={() => setOpen(false)}
                disabled={scheduleMeetingMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={scheduleMeetingMutation.isPending || !currentUser?.id}
                data-testid="button-schedule-meeting"
              >
                {scheduleMeetingMutation.isPending ? "Scheduling..." : "Schedule Meeting"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function MeetingCard({ meeting }: { meeting: OneOnOneMeeting }) {
  const { toast } = useToast();
  const scheduledDate = typeof meeting.scheduledAt === 'string' 
    ? parseISO(meeting.scheduledAt) 
    : new Date(meeting.scheduledAt);
  const isUpcoming = scheduledDate > new Date();
  
  // Mutation for sending meeting report to Slack
  const sendToSlackMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/one-on-ones/${meeting.id}/send-to-slack`),
    onSuccess: () => {
      toast({
        title: "Sent to Slack! 📤",
        description: "Your meeting report has been sent to your Slack DMs.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send",
        description: error.message || "Please check your Slack connection and try again.",
        variant: "destructive",
      });
    },
  });
  
  return (
    <Card className="hover:shadow-md transition-shadow" data-testid={`card-meeting-${meeting.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="w-4 h-4" />
              {meeting.participant?.name || "Unknown Participant"}
            </CardTitle>
            <CardDescription className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(scheduledDate, "PPP 'at' p")}
            </CardDescription>
          </div>
          <Badge variant={isUpcoming ? "default" : "secondary"}>
            {isUpcoming ? "Upcoming" : "Completed"}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-3">
          {meeting.notes && (
            <div>
              <p className="text-sm font-medium mb-1">Latest Notes:</p>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {meeting.notes}
              </p>
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckSquare className="w-3 h-3" />
                Action Items: 0
              </span>
              <span>
                Status: {meeting.status}
              </span>
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => sendToSlackMutation.mutate()}
                disabled={sendToSlackMutation.isPending}
                data-testid={`button-slack-${meeting.id}`}
              >
                <MessageSquare className="w-3 h-3 mr-1" />
                {sendToSlackMutation.isPending ? "Sending..." : "Send to Slack"}
              </Button>
              <MeetingDetailDialog 
                meeting={meeting}
                trigger={
                  <Button variant="outline" size="sm" data-testid={`button-view-${meeting.id}`}>
                    View Details
                  </Button>
                }
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UpcomingMeetings() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPeriod, setFilterPeriod] = useState<"all" | "today" | "week">("all");
  
  const { data: upcomingData, isLoading } = useQuery<UpcomingMeetingsResponse>({
    queryKey: ["/api/one-on-ones/upcoming", { page: 1, limit: 20 }],
    staleTime: 30 * 1000, // Cache for 30 seconds
  });

  const filteredMeetings = upcomingData?.meetings?.filter(meeting => {
    const meetingDate = typeof meeting.scheduledAt === 'string' 
      ? parseISO(meeting.scheduledAt) 
      : new Date(meeting.scheduledAt);
    const matchesSearch = !searchQuery || 
      meeting.participant?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesPeriod = filterPeriod === "all" || 
      (filterPeriod === "today" && isToday(meetingDate)) ||
      (filterPeriod === "week" && isThisWeek(meetingDate));
    
    return matchesSearch && matchesPeriod;
  }) || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by participant name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-meetings"
          />
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="justify-between min-w-32" data-testid="button-filter-period">
              <Filter className="w-4 h-4 mr-2" />
              {filterPeriod === "all" ? "All" : filterPeriod === "today" ? "Today" : "This Week"}
              <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setFilterPeriod("all")}>
              All Meetings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterPeriod("today")}>
              Today
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterPeriod("week")}>
              This Week
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Meetings List */}
      {filteredMeetings.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Upcoming Meetings</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? "No meetings match your search criteria." : "You don't have any upcoming one-on-one meetings scheduled."}
              </p>
              <ScheduleMeetingDialog 
                trigger={
                  <Button data-testid="button-schedule-first">
                    <Plus className="w-4 h-4 mr-2" />
                    Schedule Your First Meeting
                  </Button>
                }
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredMeetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} />
          ))}
          
          {filteredMeetings.length < (upcomingData?.pagination.total || 0) && (
            <div className="text-center py-4">
              <Button variant="outline" data-testid="button-load-more-upcoming">
                Load More Meetings
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PastMeetings() {
  const [searchQuery, setSearchQuery] = useState("");
  
  const { data: pastData, isLoading } = useQuery<PastMeetingsResponse>({
    queryKey: ["/api/one-on-ones/past", { page: 1, limit: 20 }],
    staleTime: 60 * 1000, // Cache for 1 minute
  });

  const filteredMeetings = pastData?.meetings?.filter(meeting => {
    return !searchQuery || 
      meeting.participant?.name?.toLowerCase().includes(searchQuery.toLowerCase());
  }) || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search past meetings..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="input-search-past-meetings"
        />
      </div>

      {/* Meetings List */}
      {filteredMeetings.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Past Meetings</h3>
              <p className="text-muted-foreground">
                {searchQuery ? "No past meetings match your search criteria." : "You haven't had any one-on-one meetings yet."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredMeetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} />
          ))}
          
          {pastData?.pagination.hasMore && (
            <div className="text-center py-4">
              <Button variant="outline" data-testid="button-load-more-past">
                Load More Meetings
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OneOnOnesPage() {
  const { data: currentUser } = useViewAsRole();
  const { canAccessOneOnOnes, isLoading: featureLoading } = useFeatureAccess();
  
  // Show loading while checking feature access
  if (featureLoading) {
    return (
      <>
        <Header
          title="One-on-One Meetings"
          description="Schedule and manage one-on-one meetings with your team"
        />
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
      </>
    );
  }
  
  // Show upgrade prompt if user doesn't have access to One-on-Ones
  if (!canAccessOneOnOnes) {
    return (
        <UpgradePrompt
        feature="one_on_ones"
        title="One-on-One Meetings"
        description="Unlock powerful 1:1 meeting management to build stronger relationships with your team members and track their professional development."
      />
    );
  }
  
  return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">One-on-One Meetings</h2>
            <p className="text-muted-foreground">
              Manage your one-on-one meetings and track progress with your team.
            </p>
          </div>
        
          <ScheduleMeetingDialog 
            trigger={
              <Button data-testid="button-schedule-meeting">
                <Plus className="w-4 h-4 mr-2" />
                Schedule Meeting
              </Button>
            }
          />
        </div>

      {/* Main Content */}
      <Tabs defaultValue="upcoming" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upcoming" data-testid="tab-upcoming">
            Upcoming Meetings
          </TabsTrigger>
          <TabsTrigger value="past" data-testid="tab-past">
            Past Meetings
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="upcoming" className="space-y-4">
          <UpcomingMeetings />
        </TabsContent>
        
        <TabsContent value="past" className="space-y-4">
          <PastMeetings />
        </TabsContent>
      </Tabs>
    </div>
  );
}