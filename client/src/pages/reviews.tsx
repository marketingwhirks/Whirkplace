import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle, XCircle, Clock, Eye, MessageSquare, Filter, Calendar, User } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiRequest, queryClient } from "@/lib/queryClient";
import RatingStars from "@/components/checkin/rating-stars";
import type { Checkin, User as UserType, Question, ReviewCheckin } from "@shared/schema";

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

  // Fetch questions for display context
  const { data: questions = [] } = useQuery<Question[]>({
    queryKey: ["/api/questions"],
  });

  // Fetch team members for filtering
  const { data: teamMembers = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    enabled: !!currentUser,
  });

  // Review mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ checkinId, reviewData }: { checkinId: string; reviewData: ReviewCheckin }) => {
      return apiRequest("PATCH", `/api/checkins/${checkinId}/review`, reviewData);
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
    <main className="flex-1 overflow-auto p-6 space-y-6">
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
        </Tabs>
      </main>

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