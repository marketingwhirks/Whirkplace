import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDistanceToNow, format } from "date-fns";
import { Send, MessageCircle, X, Edit, Trash2, Check } from "lucide-react";
import { getCheckinWeekFriday } from "@shared/utils/dueDates";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import RatingStars from "./rating-stars";

import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Checkin, Comment, User, Question } from "@shared/schema";

const commentSchema = z.object({
  content: z.string().min(1, "Comment cannot be empty"),
});

type CommentForm = z.infer<typeof commentSchema>;

interface CheckinDetailProps {
  checkin: Checkin & { user?: User };
  questions: Question[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CheckinDetail({ checkin, questions, open, onOpenChange }: CheckinDetailProps) {
  const { toast } = useToast();
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // Fetch comments for this check-in
  const { data: comments = [], isLoading: commentsLoading } = useQuery<Comment[]>({
    queryKey: ["/api/checkins", checkin.id, "comments"],
    enabled: open,
  });

  // Comment form
  const commentForm = useForm<CommentForm>({
    resolver: zodResolver(commentSchema),
    defaultValues: {
      content: "",
    },
  });

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: async (data: CommentForm) => {
      return apiRequest("POST", `/api/checkins/${checkin.id}/comments`, {
        content: data.content,
        userId: "admin-user", // TODO: Get actual current user ID from auth context
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkins", checkin.id, "comments"] });
      commentForm.reset();
      setShowCommentForm(false);
      toast({
        title: "Success",
        description: "Comment added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive",
      });
    },
  });

  // Update comment mutation
  const updateCommentMutation = useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string }) => {
      return apiRequest("PATCH", `/api/comments/${commentId}`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkins", checkin.id, "comments"] });
      setEditingCommentId(null);
      setEditContent("");
      toast({
        title: "Success",
        description: "Comment updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update comment",
        variant: "destructive",
      });
    },
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return apiRequest("DELETE", `/api/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkins", checkin.id, "comments"] });
      toast({
        title: "Success",
        description: "Comment deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete comment",
        variant: "destructive",
      });
    },
  });

  const handleSubmitComment = (data: CommentForm) => {
    createCommentMutation.mutate(data);
  };

  const handleEditComment = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditContent(comment.content);
  };

  const handleSaveEdit = () => {
    if (editingCommentId && editContent.trim()) {
      updateCommentMutation.mutate({
        commentId: editingCommentId,
        content: editContent.trim(),
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditContent("");
  };

  const handleDeleteComment = (commentId: string) => {
    if (confirm("Are you sure you want to delete this comment?")) {
      deleteCommentMutation.mutate(commentId);
    }
  };

  // Get question text for each response
  const getQuestionText = (questionId: string) => {
    // First check if the checkin has question snapshots stored
    if (checkin.questionSnapshots && typeof checkin.questionSnapshots === 'object') {
      const snapshots = checkin.questionSnapshots as Record<string, any>;
      if (snapshots[questionId]) {
        return snapshots[questionId].text || snapshots[questionId];
      }
    }
    // Fallback to looking up from active questions
    const question = questions.find(q => q.id === questionId);
    return question?.text || `Question`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-3">
            <div className="flex items-center space-x-3">
              {checkin.user?.avatar ? (
                <img
                  src={checkin.user.avatar}
                  alt={`${checkin.user.name} avatar`}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground font-medium">
                    {checkin.user?.name?.[0] || "?"}
                  </span>
                </div>
              )}
              <div>
                <div className="flex items-center space-x-2">
                  <p className="font-semibold">{checkin.user?.name || "Unknown User"}'s Check-in</p>
                  <Badge 
                    variant={checkin.reviewStatus === "pending" ? "secondary" : checkin.reviewStatus === "approved" ? "default" : "destructive"}
                    className="text-xs"
                    data-testid="badge-review-status-detail"
                  >
                    {checkin.reviewStatus === "pending" ? "Pending Review" : 
                     checkin.reviewStatus === "approved" ? "Approved" : 
                     checkin.reviewStatus === "rejected" ? "Rejected" : "Unknown"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {(() => {
                    try {
                      const date = new Date(checkin.createdAt);
                      if (isNaN(date.getTime())) {
                        return 'Unknown time';
                      }
                      return formatDistanceToNow(date, { addSuffix: true });
                    } catch (error) {
                      console.error('Error formatting check-in created date:', error, checkin.createdAt);
                      return 'Unknown time';
                    }
                  })()}
                </p>
              </div>
            </div>
          </DialogTitle>
          <DialogDescription>
            Weekly check-in for week ending {(() => {
              try {
                const weekDate = new Date(checkin.weekOf);
                if (isNaN(weekDate.getTime())) {
                  return 'Invalid date';
                }
                const friday = getCheckinWeekFriday(weekDate);
                if (!friday || isNaN(friday.getTime())) {
                  return 'Invalid date';
                }
                return format(friday, 'MMMM d, yyyy');
              } catch (error) {
                console.error('Error formatting check-in week date:', error, checkin.weekOf);
                return 'Invalid date';
              }
            })()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Overall Mood */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Overall Mood</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4">
                <RatingStars rating={checkin.overallMood} readonly size="lg" />
                <span className="text-2xl font-bold">{checkin.overallMood}/5</span>
                <Badge variant={checkin.overallMood >= 4 ? "default" : checkin.overallMood >= 3 ? "secondary" : "destructive"}>
                  {checkin.overallMood >= 4 ? "Great" : checkin.overallMood >= 3 ? "Good" : "Needs Support"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Responses */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Responses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {checkin.responses && Object.keys(checkin.responses).length > 0 ? (
                Object.entries(checkin.responses as Record<string, string>).map(([questionId, response]) => (
                  <div key={questionId} className="border-l-4 border-primary pl-4">
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">
                      {getQuestionText(questionId)}
                    </h4>
                    <p className="text-foreground">{response}</p>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground italic">No responses provided</p>
              )}
            </CardContent>
          </Card>

          {/* Comments Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center space-x-2">
                  <MessageCircle className="w-5 h-5" />
                  <span>Comments ({comments.length})</span>
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCommentForm(!showCommentForm)}
                  data-testid="button-add-comment"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Add Comment
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Comment Form */}
              {showCommentForm && (
                <div className="border rounded-lg p-4 bg-muted/50">
                  <Form {...commentForm}>
                    <form onSubmit={commentForm.handleSubmit(handleSubmitComment)} className="space-y-4">
                      <FormField
                        control={commentForm.control}
                        name="content"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Add a comment</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Share feedback, suggestions, or support..."
                                rows={3}
                                data-testid="textarea-comment-content"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end space-x-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setShowCommentForm(false);
                            commentForm.reset();
                          }}
                          data-testid="button-cancel-comment"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={createCommentMutation.isPending}
                          data-testid="button-submit-comment"
                        >
                          Post Comment
                        </Button>
                      </div>
                    </form>
                  </Form>
                </div>
              )}

              {/* Comments List */}
              {commentsLoading ? (
                <p className="text-muted-foreground">Loading comments...</p>
              ) : comments.length === 0 ? (
                <p className="text-muted-foreground italic">No comments yet. Be the first to share feedback!</p>
              ) : (
                <div className="space-y-3">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="flex items-start space-x-3 p-3 bg-background border rounded-lg"
                      data-testid={`comment-${comment.id}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                        <span className="text-xs font-medium">M</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center space-x-2">
                            <p className="text-sm font-medium">Manager</p>
                            <span className="text-xs text-muted-foreground">
                              {(() => {
                                try {
                                  const date = new Date(comment.createdAt);
                                  if (isNaN(date.getTime())) {
                                    return 'Unknown time';
                                  }
                                  return formatDistanceToNow(date, { addSuffix: true });
                                } catch (error) {
                                  console.error('Error formatting comment date:', error, comment.createdAt);
                                  return 'Unknown time';
                                }
                              })()}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditComment(comment)}
                              data-testid={`button-edit-comment-${comment.id}`}
                              className="h-6 px-2"
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteComment(comment.id)}
                              data-testid={`button-delete-comment-${comment.id}`}
                              className="h-6 px-2 text-destructive hover:text-destructive"
                              disabled={deleteCommentMutation.isPending}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        
                        {editingCommentId === comment.id ? (
                          <div className="space-y-2">
                            <Textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              rows={3}
                              data-testid={`textarea-edit-comment-${comment.id}`}
                            />
                            <div className="flex justify-end space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCancelEdit}
                                data-testid={`button-cancel-edit-${comment.id}`}
                              >
                                <X className="w-3 h-3 mr-1" />
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleSaveEdit}
                                disabled={updateCommentMutation.isPending || !editContent.trim()}
                                data-testid={`button-save-edit-${comment.id}`}
                              >
                                <Check className="w-3 h-3 mr-1" />
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-foreground">{comment.content}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-checkin-detail">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}