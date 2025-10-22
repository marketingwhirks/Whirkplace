import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, Plus, Clock, CheckSquare, User, Filter, Search, ChevronDown, MessageSquare, CalendarDays, MapPin, Repeat, Star, Target, AlertCircle, FileText, CheckCircle2, Download, MoreVertical, Edit, SkipForward, X } from "lucide-react";
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
  DropdownMenuTrigger,
  DropdownMenuSeparator
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
import { getCheckinWeekFriday } from "@shared/utils/dueDates";
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
  // If recurring, must have pattern, interval, and either end date or count
  if (data.isRecurring) {
    return data.recurrencePattern && data.recurrenceInterval && (data.recurrenceEndDate || data.recurrenceEndCount);
  }
  return true;
}, {
  message: "Recurring meetings must have a recurrence pattern, interval, and either an end date or occurrence count",
  path: ["isRecurring"]
});

type ScheduleMeetingForm = z.infer<typeof scheduleMeetingSchema>;

// Meeting Detail Dialog - Shows KRAs, ratings, flagged check-ins, and action items
function MeetingDetailDialog({ 
  meeting, 
  trigger, 
  open: controlledOpen, 
  onOpenChange: controlledOnOpenChange 
}: { 
  meeting: OneOnOneMeeting; 
  trigger: React.ReactNode | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [activeTab, setActiveTab] = useState("checkins"); // Start with check-ins tab
  const [kraRatings, setKraRatings] = useState<Record<string, number>>({});
  const [newActionItem, setNewActionItem] = useState({ description: "", dueDate: "", assignedTo: "" });
  const { toast } = useToast();
  const { data: currentUser } = useViewAsRole();

  // Fetch comprehensive agenda (KRAs, check-ins, action items)
  const { data: agenda, isLoading: agendaLoading, refetch: refetchAgenda } = useQuery<{
    kras?: any[];
    flaggedCheckins?: any[];
    actionItems?: any[];
  }>({
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
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
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
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={async () => {
                  try {
                    // Download PDF
                    const response = await fetch(`/api/one-on-ones/${meeting.id}/pdf`, {
                      method: 'GET',
                      credentials: 'include'
                    });
                    
                    if (!response.ok) {
                      throw new Error('Failed to generate PDF');
                    }
                    
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `one-on-one-${meeting.participant?.name?.replace(/\s+/g, '-') || 'meeting'}-${format(
                      typeof meeting.scheduledAt === "string"
                        ? parseISO(meeting.scheduledAt)
                        : new Date(meeting.scheduledAt),
                      "yyyy-MM-dd"
                    )}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                    
                    toast({
                      title: "PDF Exported! 📄",
                      description: "Your meeting notes have been exported to PDF.",
                    });
                  } catch (error) {
                    toast({
                      title: "Export Failed",
                      description: "Failed to export meeting notes to PDF. Please try again.",
                      variant: "destructive",
                    });
                  }
                }}
                data-testid={`button-export-pdf-${meeting.id}`}
              >
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={async () => {
                  try {
                    await apiRequest("POST", `/api/one-on-ones/${meeting.id}/send-to-slack`);
                    toast({
                      title: "Sent to Slack! 📤",
                      description: "Meeting summary has been sent to Slack.",
                    });
                  } catch (error) {
                    toast({
                      title: "Failed to send",
                      description: "Failed to send to Slack. Please try again.",
                      variant: "destructive",
                    });
                  }
                }}
                data-testid={`button-send-slack-${meeting.id}`}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Share to Slack
              </Button>
            </div>
          </div>
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
                  {agenda?.kras && agenda.kras.length > 0 ? (
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
                  {agenda?.flaggedCheckins && agenda.flaggedCheckins.length > 0 ? (
                    <div className="space-y-3">
                      {agenda.flaggedCheckins.map((checkin: any) => (
                        <Card key={checkin.id} data-testid={`checkin-card-${checkin.id}`}>
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <CardTitle className="text-sm font-medium">
                                  Week ending {format(
                                    getCheckinWeekFriday(
                                      typeof checkin.weekOf === 'string' 
                                        ? parseISO(checkin.weekOf) 
                                        : new Date(checkin.weekOf)
                                    ), 
                                    "MMMM d, yyyy"
                                  )}
                                </CardTitle>
                                <CardDescription className="text-xs mt-1">
                                  {checkin.flagForFollowUp && "Flagged for follow-up"}
                                  {checkin.addToOneOnOne && " • Added to one-on-one"}
                                </CardDescription>
                              </div>
                              <div className="flex items-center gap-2">
                                {checkin.moodRating && (
                                  <Badge variant={checkin.moodRating >= 4 ? "default" : checkin.moodRating >= 3 ? "secondary" : "destructive"}>
                                    Mood: {checkin.moodRating}/5
                                  </Badge>
                                )}
                                <Badge variant="destructive">
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  Flagged
                                </Badge>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-3">
                              {/* Display questions and answers */}
                              {checkin.responses && Object.entries(checkin.responses).map(([questionId, response]) => {
                                // Check if this specific question is flagged
                                const questionFlags = checkin.responseFlags?.[questionId];
                                const isFlagged = questionFlags?.flagForFollowUp || questionFlags?.addToOneOnOne;
                                
                                return (
                                  <div key={questionId} className={`space-y-1 ${isFlagged ? 'border-l-2 border-destructive pl-3' : ''}`}>
                                    <p className="text-sm font-medium text-muted-foreground">
                                      {checkin.questions?.find((q: any) => q.id === questionId)?.text || "Question"}
                                    </p>
                                    <p className="text-sm">
                                      {response as string || "No response"}
                                    </p>
                                    {isFlagged && (
                                      <Badge variant="outline" className="text-xs">
                                        <AlertCircle className="w-3 h-3 mr-1" />
                                        {questionFlags?.flagForFollowUp ? "Needs Follow-up" : "Added to 1:1"}
                                      </Badge>
                                    )}
                                    {checkin.responseComments?.[questionId] && (
                                      <div className="mt-2 p-2 bg-muted/30 rounded text-sm">
                                        <strong>Manager Note:</strong> {checkin.responseComments[questionId]}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              
                              {/* Show review comments if present */}
                              {checkin.reviewComments && (
                                <div className="pt-2 border-t">
                                  <p className="text-sm font-medium">Manager Review Comments:</p>
                                  <p className="text-sm text-muted-foreground">{checkin.reviewComments}</p>
                                </div>
                              )}
                              
                              {/* Action button to mark as resolved */}
                              <div className="pt-3 border-t">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    // TODO: Implement API endpoint to mark check-in as resolved
                                    toast({
                                      title: "Marked as Resolved",
                                      description: "This check-in has been marked as resolved."
                                    });
                                  }}
                                  className="w-full"
                                  data-testid={`button-resolve-${checkin.id}`}
                                >
                                  <CheckCircle2 className="w-4 h-4 mr-2" />
                                  Mark as Resolved
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
                        <p className="font-medium text-muted-foreground">No Flagged Check-ins</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Check-ins flagged for follow-up will appear here
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
                    {agenda?.actionItems && agenda.actionItems.length > 0 ? (
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
      const meetingData: any = {
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
        isRecurring: data.isRecurring
      };

      // Only include recurring fields when isRecurring is true
      if (data.isRecurring) {
        meetingData.recurrencePattern = data.recurrencePattern;
        meetingData.recurrenceInterval = data.recurrenceInterval;
        if (data.recurrenceEndDate) {
          meetingData.recurrenceEndDate = data.recurrenceEndDate;
        }
        if (data.recurrenceEndCount) {
          meetingData.recurrenceEndCount = data.recurrenceEndCount;
        }
      } else {
        // Don't send recurring fields if not recurring
        delete meetingData.recurrencePattern;
        delete meetingData.recurrenceInterval;
        delete meetingData.recurrenceEndDate;
        delete meetingData.recurrenceEndCount;
      }

      // Create the one-on-one meeting first
      const response = await apiRequest("POST", "/api/one-on-ones", meetingData);
      const createdMeeting = await response.json();

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
          const calendarResponse = await apiRequest("POST", "/api/calendar/events", calendarEventData);
          const calendarEvent = await calendarResponse.json();
          
          // Update meeting with calendar event details
          if (calendarEvent?.id) {
            const updateResponse = await apiRequest("PUT", `/api/one-on-ones/${createdMeeting.id}`, {
              outlookEventId: calendarEvent.id,
              meetingUrl: calendarEvent.meetingUrl || null
            });
            await updateResponse.json(); // Parse the response even if we don't use it
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
    onSuccess: (createdMeeting) => {
      const successMessage = calendarStatus?.connected && form.getValues("syncWithOutlook")
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

  // Clone the trigger element and add onClick handler
  const triggerWithHandler = trigger ? (
    <div onClick={() => setOpen(true)} style={{ display: 'inline-block' }}>
      {trigger}
    </div>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerWithHandler}
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
            {calendarStatus?.connected ? (
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
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-sync-outlook"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            ) : (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-800">
                      Outlook Calendar Not Connected
                    </p>
                    <p className="text-xs text-yellow-700 mt-1">
                      Connect your Microsoft account to sync meetings with Outlook.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => window.location.href = '/settings'}
                      data-testid="button-connect-outlook"
                    >
                      Connect Outlook in Settings
                    </Button>
                  </div>
                </div>
              </div>
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
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          // Set default values when toggling recurring on
                          if (checked) {
                            // Set default recurrence pattern to weekly if not already set
                            if (!form.getValues("recurrencePattern")) {
                              form.setValue("recurrencePattern", "weekly");
                            }
                            // Set default interval to 1 if not already set
                            if (!form.getValues("recurrenceInterval")) {
                              form.setValue("recurrenceInterval", 1);
                            }
                            // Set default end count to 4 meetings if neither end date nor count is set
                            if (!form.getValues("recurrenceEndDate") && !form.getValues("recurrenceEndCount")) {
                              form.setValue("recurrenceEndCount", 4);
                            }
                          }
                        }}
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
  const [detailOpen, setDetailOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const scheduledDate = typeof meeting.scheduledAt === 'string' 
    ? parseISO(meeting.scheduledAt) 
    : new Date(meeting.scheduledAt);
  const isUpcoming = scheduledDate > new Date();
  const isSkipped = meeting.status === "skipped";
  
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
  
  // Mutation for canceling meeting
  const cancelMeetingMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/one-on-ones/${meeting.id}`),
    onSuccess: () => {
      toast({
        title: "Meeting cancelled",
        description: "The meeting has been cancelled and removed.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/one-on-ones"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to cancel meeting",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Mutation for skipping meeting
  const skipMeetingMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/one-on-ones/${meeting.id}/skip`),
    onSuccess: () => {
      toast({
        title: "Meeting skipped",
        description: "The meeting has been marked as skipped.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/one-on-ones"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to skip meeting",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Mutation for updating meeting
  const updateMeetingMutation = useMutation({
    mutationFn: (data: Partial<OneOnOne>) => 
      apiRequest("PUT", `/api/one-on-ones/${meeting.id}`, data),
    onSuccess: () => {
      toast({
        title: "Meeting updated",
        description: "The meeting details have been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/one-on-ones"] });
      setEditDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update meeting",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Edit Meeting Dialog Component
  const EditMeetingDialog = () => {
    const [editForm, setEditForm] = useState({
      agenda: meeting.agenda || "",
      notes: meeting.notes || "",
      location: meeting.location || "",
      duration: meeting.duration || 30,
    });
    
    const handleUpdateMeeting = () => {
      updateMeetingMutation.mutate(editForm);
    };
    
    return (
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Edit Meeting Details</DialogTitle>
            <DialogDescription>
              Update the details for this one-on-one meeting.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-agenda">Agenda</Label>
              <Textarea
                id="edit-agenda"
                placeholder="What topics will be discussed?"
                value={editForm.agenda}
                onChange={(e) => setEditForm({ ...editForm, agenda: e.target.value })}
                className="min-h-[80px]"
                data-testid="textarea-edit-agenda"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Meeting Notes</Label>
              <Textarea
                id="edit-notes"
                placeholder="Add meeting notes, outcomes, and decisions..."
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className="min-h-[100px]"
                data-testid="textarea-edit-notes"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-location">Location</Label>
              <Input
                id="edit-location"
                placeholder="Meeting room, virtual link, or location"
                value={editForm.location}
                onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                data-testid="input-edit-location"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-duration">Duration (minutes)</Label>
              <Input
                id="edit-duration"
                type="number"
                min="15"
                max="240"
                value={editForm.duration}
                onChange={(e) => setEditForm({ ...editForm, duration: parseInt(e.target.value) || 30 })}
                data-testid="input-edit-duration"
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={updateMeetingMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateMeeting}
              disabled={updateMeetingMutation.isPending}
              data-testid="button-save-meeting-edit"
            >
              {updateMeetingMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  };
  
  return (
    <>
      <Card 
        className="hover:shadow-lg transition-all hover:scale-[1.02] cursor-pointer border-l-4"
        style={{ borderLeftColor: isUpcoming ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
        onClick={() => setDetailOpen(true)}
        data-testid={`card-meeting-${meeting.id}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1">
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="p-2 rounded-full bg-primary/10">
                  <User className="w-4 h-4 text-primary" />
                </div>
                {meeting.participant?.name || "Meeting Participant"}
              </CardTitle>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  {format(scheduledDate, "EEE, MMM d")}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(scheduledDate, "h:mm a")}
                </span>
                {meeting.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {meeting.location}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge 
                variant={
                  isSkipped ? "outline" : 
                  isUpcoming ? "default" : 
                  "secondary"
                } 
                className={
                  isSkipped ? "border-yellow-500 text-yellow-700 dark:text-yellow-400" :
                  isUpcoming ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400" : 
                  ""
                }
              >
                {isSkipped ? "Skipped" : isUpcoming ? "Upcoming" : "Completed"}
              </Badge>
              
              {/* Actions Dropdown Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" data-testid={`button-actions-${meeting.id}`}>
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditDialogOpen(true);
                    }}
                    data-testid={`menu-edit-${meeting.id}`}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  
                  {isUpcoming && !isSkipped && (
                    <>
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          skipMeetingMutation.mutate();
                        }}
                        disabled={skipMeetingMutation.isPending}
                        data-testid={`menu-skip-${meeting.id}`}
                      >
                        <SkipForward className="w-4 h-4 mr-2" />
                        Skip
                      </DropdownMenuItem>
                      
                      <DropdownMenuSeparator />
                      
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Are you sure you want to cancel this meeting? This action cannot be undone.")) {
                            cancelMeetingMutation.mutate();
                          }
                        }}
                        disabled={cancelMeetingMutation.isPending}
                        className="text-destructive"
                        data-testid={`menu-cancel-${meeting.id}`}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0">
          <div className="space-y-3">
            {meeting.agenda && (
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-sm font-medium mb-1 flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  Agenda
                </p>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {meeting.agenda}
                </p>
              </div>
            )}
            
            {meeting.notes && !isUpcoming && (
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-sm font-medium mb-1 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  Meeting Notes
                </p>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {meeting.notes}
                </p>
              </div>
            )}
            
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckSquare className="w-3 h-3" />
                  Action Items
                </span>
                {meeting.isRecurring && (
                  <span className="flex items-center gap-1 text-primary">
                    <Repeat className="w-3 h-3" />
                    Recurring
                  </span>
                )}
              </div>
              
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={(e) => {
                    e.stopPropagation();
                    sendToSlackMutation.mutate();
                  }}
                  disabled={sendToSlackMutation.isPending}
                  data-testid={`button-slack-${meeting.id}`}
                >
                  <MessageSquare className="w-3 h-3 mr-1" />
                  {sendToSlackMutation.isPending ? "Sending..." : "Share"}
                </Button>
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetailOpen(true);
                  }}
                  data-testid={`button-view-${meeting.id}`}
                >
                  <ChevronDown className="w-3 h-3 mr-1" />
                  View Details
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Meeting Detail Dialog */}
      <MeetingDetailDialog 
        meeting={meeting}
        trigger={null}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
      
      {/* Edit Meeting Dialog */}
      <EditMeetingDialog />
    </>
  );
}

function UpcomingMeetings() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPeriod, setFilterPeriod] = useState<"all" | "today" | "week">("all");
  const [showAll, setShowAll] = useState(false);
  
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
  
  // Show only next 2 meetings by default, unless search/filter is active or user clicked "Show All"
  const hasActiveFilter = searchQuery || filterPeriod !== "all";
  const displayedMeetings = hasActiveFilter || showAll 
    ? filteredMeetings 
    : filteredMeetings.slice(0, 2);

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
          {displayedMeetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} />
          ))}
          
          {/* Show "View All" button if there are more meetings */}
          {!hasActiveFilter && !showAll && filteredMeetings.length > 2 && (
            <div className="text-center py-4">
              <Button 
                variant="outline" 
                onClick={() => setShowAll(true)}
                data-testid="button-show-all-upcoming"
              >
                View All {filteredMeetings.length} Upcoming Meetings
              </Button>
            </div>
          )}
          
          {/* Show "Show Less" button when viewing all */}
          {!hasActiveFilter && showAll && filteredMeetings.length > 2 && (
            <div className="text-center py-4">
              <Button 
                variant="outline" 
                onClick={() => setShowAll(false)}
                data-testid="button-show-less-upcoming"
              >
                Show Only Next 2 Meetings
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
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
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