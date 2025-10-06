import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDistanceToNow, startOfWeek, addWeeks, isSameWeek } from "date-fns";
import { ClipboardCheck, Clock, CheckCircle, XCircle, AlertCircle, Plus, Calendar, Heart, MessageCircle, Smile, Flag, UserPlus, CheckCheck } from "lucide-react";
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

import type { Checkin, Question, User, InsertCheckin } from "@shared/schema";

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

export default function Checkins() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCheckin, setSelectedCheckin] = useState<(Checkin & { user?: User }) | null>(null);
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [checkinToReview, setCheckinToReview] = useState<Checkin | null>(null);
  
  // Tour management
  const tourManager = useManagedTour(TOUR_IDS.CHECKINS_GUIDE);
  
  // Check if user needs self-review capability (no manager)
  const needsSelfReview = currentUser && !currentUser.managerId;

  // Get current week start (Monday)
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  // Fetch active questions
  const { data: questions = [], isLoading: questionsLoading } = useQuery<Question[]>({
    queryKey: ["/api/questions"],
  });

  // Fetch user's check-ins
  const { data: checkins = [], isLoading: checkinsLoading, error: checkinsError } = useQuery<Checkin[]>({
    queryKey: ["/api/checkins"],
    enabled: !!currentUser,
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

  // Filter for only active questions
  const activeQuestions = questions.filter(q => q.isActive);
  
  // Create check-in form with dynamic schema based on questions
  const form = useForm<CheckinForm>({
    resolver: zodResolver(createCheckinFormSchema(activeQuestions)),
    defaultValues: {
      overallMood: 0,
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
    return enrichedCheckins.sort((a, b) => new Date(b.weekOf).getTime() - new Date(a.weekOf).getTime());
  }, [enrichedCheckins]);

  // Separate current week and historical checkins
  const currentWeekCheckin = currentCheckin || sortedCheckins.find(checkin => 
    isSameWeek(new Date(checkin.weekOf), currentWeekStart, { weekStartsOn: 1 })
  );
  
  const historicalCheckins = sortedCheckins.filter(checkin => 
    !isSameWeek(new Date(checkin.weekOf), currentWeekStart, { weekStartsOn: 1 })
  );

  // Create/Update check-in mutation
  const createCheckinMutation = useMutation({
    mutationFn: async (data: CheckinForm) => {
      // Only send user-provided data - server computes due dates and other fields
      const checkinPayload = {
        userId: currentUser!.id,
        weekOf: currentWeekStart.toISOString(), // Convert to ISO string for server
        overallMood: data.overallMood,
        responses: data.responses,
        isComplete: true,
      };

      if (currentWeekCheckin) {
        return apiRequest("PATCH", `/api/checkins/${currentWeekCheckin.id}`, checkinPayload);
      } else {
        return apiRequest("POST", "/api/checkins", checkinPayload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", currentUser?.id, "current-checkin"] });
      form.reset();
      setShowCreateDialog(false);
      toast({
        title: "Check-in submitted!",
        description: "Your weekly check-in has been submitted for review.",
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
    createCheckinMutation.mutate(data);
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
                  Week of {currentWeekStart.toLocaleDateString()}
                </p>
              </div>
              <Badge className={currentStatus.color} data-testid="badge-current-status">
                {currentStatus.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {!currentWeekCheckin ? (
              <div className="text-center py-8">
                <ClipboardCheck className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Ready to check in?</h3>
                <p className="text-muted-foreground mb-4">
                  Submit your weekly check-in to share how you're doing with your team.
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
                  Submitted {formatDistanceToNow(new Date(currentWeekCheckin.createdAt), { addSuffix: true })}
                  {currentWeekCheckin.reviewedAt && (
                    <span> • Reviewed {formatDistanceToNow(new Date(currentWeekCheckin.reviewedAt), { addSuffix: true })}</span>
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
                      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
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
                              Week of {new Date(checkin.weekOf).toLocaleDateString()}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              Submitted {formatDistanceToNow(new Date(checkin.createdAt), { addSuffix: true })}
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
                          <span> • Reviewed {formatDistanceToNow(new Date(checkin.reviewedAt), { addSuffix: true })}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Create/Edit Check-in Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {currentWeekCheckin ? "Edit Check-in" : "Submit Weekly Check-in"}
              </DialogTitle>
              <DialogDescription>
                Week of {currentWeekStart.toLocaleDateString()}
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
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
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
      </main>
    </>
  );
}