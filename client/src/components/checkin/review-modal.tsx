import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle, XCircle, MessageSquare, X, Eye } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import RatingStars from "@/components/checkin/rating-stars";
import type { Checkin, Question, ReviewCheckin } from "@shared/schema";

interface EnhancedCheckin extends Checkin {
  user?: {
    id: string;
    name: string;
    email: string;
    teamId?: string | null;
    teamName?: string | null;
  };
  reviewer?: {
    id: string;
    name: string;
    email: string;
  };
}

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkin: EnhancedCheckin | null;
  questions?: Question[];
  onReviewComplete?: (reviewedCheckin: EnhancedCheckin) => void;
  disabled?: boolean;
}

export default function ReviewModal({
  isOpen,
  onClose,
  checkin,
  questions = [],
  onReviewComplete,
  disabled = false,
}: ReviewModalProps) {
  const { toast } = useToast();
  const [addToOneOnOne, setAddToOneOnOne] = useState(false);
  const [flagForFollowUp, setFlagForFollowUp] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [responseComments, setResponseComments] = useState<Record<string, string>>(
    checkin?.responseComments || {}
  );
  const [responseFlags, setResponseFlags] = useState<Record<string, { addToOneOnOne: boolean; flagForFollowUp: boolean }>>(
    checkin?.responseFlags || {}
  );
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);

  // Review mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ checkinId, reviewData }: { checkinId: string; reviewData: ReviewCheckin }): Promise<Response> => {
      return apiRequest("PATCH", `/api/checkins/${checkinId}/review`, reviewData);
    },
    onSuccess: (data: any) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/checkins/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkins/review-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkins/leadership-view"] });
      
      toast({
        title: "Review submitted",
        description: "Check-in has been reviewed.",
      });

      // Call completion callback
      if (onReviewComplete) {
        onReviewComplete(data);
      }

      // Reset state and close modal
      handleClose();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Review failed",
        description: error.message || "Failed to submit review",
      });
    },
  });

  // Handle review action selection
  const handleReviewAction = (action: "approve" | "reject") => {
    setReviewAction(action);
    setShowConfirmation(true);
  };

  // Handle review submission
  const handleReview = () => {
    setShowConfirmation(true);
  };

  // Handle review submission
  const handleSubmitReview = async () => {
    if (!checkin || !reviewAction) return;

    // Add approve/reject indication to comments if not already specified
    let finalComments = reviewComment.trim();
    if (!finalComments && reviewAction) {
      finalComments = reviewAction === "approve" ? "Approved" : "Needs improvement";
    } else if (finalComments && reviewAction) {
      finalComments = `${reviewAction === "approve" ? "[APPROVED]" : "[NEEDS IMPROVEMENT]"} ${finalComments}`;
    }

    const reviewData: ReviewCheckin = {
      reviewStatus: "reviewed",
      reviewComments: finalComments || undefined,
      responseComments,
      responseFlags,
      addToOneOnOne,
      flagForFollowUp,
    };

    reviewMutation.mutate({
      checkinId: checkin.id,
      reviewData,
    });
  };

  // Handle modal close
  const handleClose = () => {
    setAddToOneOnOne(false);
    setFlagForFollowUp(false);
    setReviewComment("");
    setResponseComments({});
    setResponseFlags({});
    setShowConfirmation(false);
    setReviewAction(null);
    onClose();
  };

  // Don't render if not open or no checkin
  if (!isOpen || !checkin) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {showConfirmation ? (
                  <>
                    <Eye className="w-5 h-5 text-blue-600" />
                    Review Check-in
                  </>
                ) : (
                  "Review Check-in"
                )}
              </CardTitle>
              <CardDescription>
                {showConfirmation 
                  ? `Confirm review for ${checkin.user?.name}'s check-in`
                  : `Review check-in from ${checkin.user?.name}`
                }
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={reviewMutation.isPending}
              data-testid="button-close-review-modal"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {!showConfirmation ? (
            // Review Details View
            <>
              {/* User and Status Info */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-primary-foreground font-medium">
                      {checkin.user?.name?.[0] || "?"}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium" data-testid="text-user-name">
                      {checkin.user?.name || "Unknown User"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {checkin.user?.teamName && `${checkin.user.teamName} • `}
                      Submitted {formatDistanceToNow(new Date(checkin.createdAt))} ago
                    </p>
                  </div>
                </div>
                <Badge 
                  variant={checkin.reviewStatus === "pending" ? "secondary" : "default"}
                  data-testid="badge-review-status"
                >
                  {checkin.reviewStatus}
                </Badge>
              </div>

              {/* Overall Mood */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Overall Mood Rating</Label>
                <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
                  <RatingStars rating={checkin.overallMood} readonly />
                  <span className="text-sm text-muted-foreground">
                    ({checkin.overallMood}/5)
                  </span>
                </div>
              </div>

              {/* Question Responses */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Question Responses</Label>
                {Object.entries(checkin.responses as Record<string, string>).length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    No responses provided
                  </p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(checkin.responses as Record<string, string>).map(([questionId, response]) => {
                      // Use questionSnapshots for question text if available
                      const questionSnapshot = (checkin.questionSnapshots as any)?.[questionId];
                      const questionText = questionSnapshot?.text || 
                                         questions.find(q => q.id === questionId)?.text || 
                                         `Question ${questionId}`;
                      const questionFlags = responseFlags[questionId] || { addToOneOnOne: false, flagForFollowUp: false };
                      const questionComment = responseComments[questionId] || '';
                      
                      return (
                        <div key={questionId} className="bg-muted p-4 rounded-lg space-y-3">
                          <div>
                            <p className="text-sm font-medium mb-2">
                              {questionText}
                            </p>
                            <p className="text-sm text-muted-foreground">{response}</p>
                          </div>
                          
                          {/* Per-question flags and comments (only if pending review) */}
                          {checkin.reviewStatus === "pending" && !disabled && (
                            <div className="space-y-3 pt-3 border-t border-border/50">
                              {/* Flags */}
                              <div className="flex flex-wrap gap-4">
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="checkbox"
                                    id={`follow-up-${questionId}`}
                                    checked={questionFlags.flagForFollowUp}
                                    onChange={(e) => {
                                      setResponseFlags(prev => ({
                                        ...prev,
                                        [questionId]: {
                                          ...prev[questionId],
                                          flagForFollowUp: e.target.checked
                                        }
                                      }));
                                    }}
                                    className="h-4 w-4 rounded border-gray-300"
                                  />
                                  <Label 
                                    htmlFor={`follow-up-${questionId}`} 
                                    className="text-xs font-normal cursor-pointer"
                                  >
                                    Flag for follow-up
                                  </Label>
                                </div>
                                
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="checkbox"
                                    id={`one-on-one-${questionId}`}
                                    checked={questionFlags.addToOneOnOne}
                                    onChange={(e) => {
                                      setResponseFlags(prev => ({
                                        ...prev,
                                        [questionId]: {
                                          ...prev[questionId],
                                          addToOneOnOne: e.target.checked
                                        }
                                      }));
                                    }}
                                    className="h-4 w-4 rounded border-gray-300"
                                  />
                                  <Label 
                                    htmlFor={`one-on-one-${questionId}`}
                                    className="text-xs font-normal cursor-pointer"
                                  >
                                    Add to 1:1 agenda
                                  </Label>
                                </div>
                              </div>
                              
                              {/* Comment */}
                              <div className="space-y-1">
                                <Label htmlFor={`comment-${questionId}`} className="text-xs">
                                  Manager comment
                                </Label>
                                <input
                                  type="text"
                                  id={`comment-${questionId}`}
                                  value={questionComment}
                                  onChange={(e) => {
                                    setResponseComments(prev => ({
                                      ...prev,
                                      [questionId]: e.target.value
                                    }));
                                  }}
                                  placeholder="Add a comment about this response..."
                                  className="w-full text-xs px-2 py-1 border rounded-md bg-background"
                                />
                              </div>
                            </div>
                          )}
                          
                          {/* Show existing flags/comments if already reviewed */}
                          {checkin.reviewStatus === "reviewed" && (questionFlags.flagForFollowUp || questionFlags.addToOneOnOne || questionComment) && (
                            <div className="pt-3 border-t border-border/50 space-y-2">
                              {(questionFlags.flagForFollowUp || questionFlags.addToOneOnOne) && (
                                <div className="flex flex-wrap gap-3">
                                  {questionFlags.flagForFollowUp && (
                                    <Badge variant="secondary" className="text-xs">
                                      Flagged for follow-up
                                    </Badge>
                                  )}
                                  {questionFlags.addToOneOnOne && (
                                    <Badge variant="secondary" className="text-xs">
                                      Added to 1:1 agenda
                                    </Badge>
                                  )}
                                </div>
                              )}
                              {questionComment && (
                                <p className="text-xs text-muted-foreground">
                                  <span className="font-medium">Manager comment:</span> {questionComment}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Previous Review Info (if already reviewed) */}
              {checkin.reviewStatus !== "pending" && checkin.reviewer && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Previous Review</Label>
                  <div className="bg-muted p-3 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Reviewed by:</span>
                      <span className="text-sm font-medium">{checkin.reviewer.name}</span>
                    </div>
                    {checkin.reviewedAt && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Review date:</span>
                        <span className="text-sm">
                          {formatDistanceToNow(new Date(checkin.reviewedAt))} ago
                        </span>
                      </div>
                    )}
                    {checkin.reviewComments && (
                      <div>
                        <p className="text-sm font-medium mb-1">Comments:</p>
                        <p className="text-sm text-muted-foreground">{checkin.reviewComments}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Review Actions */}
              {checkin.reviewStatus === "pending" && !disabled && (
                <div className="flex gap-3 justify-end pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => handleReviewAction("reject")}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    data-testid="button-reject-checkin"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    onClick={() => handleReviewAction("approve")}
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="button-approve-checkin"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                </div>
              )}

              {disabled && checkin.reviewStatus === "pending" && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  You don't have permission to review this check-in
                </div>
              )}
            </>
          ) : (
            // Confirmation View
            <>
              <div className="text-center py-4">
                <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
                  reviewAction === "approve" ? "bg-green-100" : "bg-red-100"
                }`}>
                  {reviewAction === "approve" ? (
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  ) : (
                    <XCircle className="w-8 h-8 text-red-600" />
                  )}
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  {reviewAction === "approve" ? "Approve Check-in?" : "Reject Check-in?"}
                </h3>
                <p className="text-muted-foreground">
                  This action will {reviewAction === "approve" ? "approve" : "reject"} {checkin.user?.name}'s check-in.
                  {reviewAction === "reject" && " Please provide feedback to help them improve."}
                </p>
              </div>

              {/* Review Comment */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Review Comments 
                  {reviewAction === "reject" && <span className="text-red-500 ml-1">*</span>}
                  <span className="text-muted-foreground font-normal ml-1">
                    ({reviewAction === "reject" ? "Required" : "Optional"})
                  </span>
                </Label>
                <Textarea
                  placeholder={`Add your ${reviewAction === "approve" ? "approval" : "rejection"} comments...`}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  rows={4}
                  className="resize-none"
                  data-testid="textarea-review-comment"
                />
                {reviewAction === "reject" && !reviewComment.trim() && (
                  <p className="text-sm text-red-500">
                    Please provide feedback when rejecting a check-in
                  </p>
                )}
              </div>

              {/* Confirmation Actions */}
              <div className="flex gap-3 justify-end pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmation(false)}
                  disabled={reviewMutation.isPending}
                  data-testid="button-back-to-review"
                >
                  Back to Review
                </Button>
                <Button
                  onClick={handleSubmitReview}
                  disabled={
                    reviewMutation.isPending || 
                    (reviewAction === "reject" && !reviewComment.trim())
                  }
                  className={reviewAction === "approve" ? 
                    "bg-green-600 hover:bg-green-700" : 
                    "bg-red-600 hover:bg-red-700"
                  }
                  data-testid="button-confirm-review"
                >
                  {reviewMutation.isPending ? (
                    "Submitting..."
                  ) : (
                    <>
                      {reviewAction === "approve" ? (
                        <CheckCircle className="w-4 h-4 mr-2" />
                      ) : (
                        <XCircle className="w-4 h-4 mr-2" />
                      )}
                      Confirm {reviewAction === "approve" ? "Approval" : "Rejection"}
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Quick Review Actions Component for inline use
interface QuickReviewActionsProps {
  checkin: EnhancedCheckin;
  onReview: (action: "approve" | "reject") => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

export function QuickReviewActions({ 
  checkin, 
  onReview, 
  disabled = false, 
  size = "md" 
}: QuickReviewActionsProps) {
  if (checkin.reviewStatus !== "pending" || disabled) {
    return null;
  }

  const buttonSize = size === "sm" ? "sm" : size === "lg" ? "lg" : "default";

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size={buttonSize}
        onClick={() => onReview("reject")}
        className="text-red-600 border-red-200 hover:bg-red-50"
        data-testid={`quick-reject-${checkin.id}`}
      >
        <XCircle className="w-4 h-4 mr-1" />
        {size !== "sm" && "Reject"}
      </Button>
      <Button
        size={buttonSize}
        onClick={() => onReview("approve")}
        className="bg-green-600 hover:bg-green-700"
        data-testid={`quick-approve-${checkin.id}`}
      >
        <CheckCircle className="w-4 h-4 mr-1" />
        {size !== "sm" && "Approve"}
      </Button>
    </div>
  );
}

// Review Status Display Component
interface ReviewStatusDisplayProps {
  checkin: EnhancedCheckin;
  showReviewer?: boolean;
  showComments?: boolean;
}

export function ReviewStatusDisplay({ 
  checkin, 
  showReviewer = false, 
  showComments = false 
}: ReviewStatusDisplayProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge 
          variant={checkin.reviewStatus === "pending" ? "secondary" : 
                 checkin.reviewStatus === "approved" ? "default" : "destructive"}
        >
          {checkin.reviewStatus}
        </Badge>
        {checkin.reviewedAt && (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(checkin.reviewedAt))} ago
          </span>
        )}
      </div>
      
      {showReviewer && checkin.reviewer && (
        <p className="text-xs text-muted-foreground">
          Reviewed by {checkin.reviewer.name}
        </p>
      )}
      
      {showComments && checkin.reviewComments && (
        <div className="bg-muted p-2 rounded text-xs">
          <MessageSquare className="w-3 h-3 inline mr-1" />
          {checkin.reviewComments}
        </div>
      )}
    </div>
  );
}