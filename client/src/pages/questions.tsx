import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Plus, Edit, Trash2, GripVertical, Eye, EyeOff, Send } from "lucide-react";

import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Question, InsertQuestion } from "@shared/schema";
import { insertQuestionSchema } from "@shared/schema";

const createQuestionSchema = insertQuestionSchema.omit({
  createdBy: true,
  isActive: true,
}).extend({
  text: z.string().min(5, "Question must be at least 5 characters"),
  order: z.number().min(0, "Order must be 0 or greater").default(0),
});

type CreateQuestionForm = z.infer<typeof createQuestionSchema>;

export default function Questions() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  // Fetch questions
  const { data: questions = [], isLoading } = useQuery<Question[]>({
    queryKey: ["/api/questions"],
  });

  // Sort questions by order
  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

  // Form for creating/editing questions
  const form = useForm<CreateQuestionForm>({
    resolver: zodResolver(createQuestionSchema),
    defaultValues: {
      text: "",
      order: questions.length,
    },
  });

  // Create question mutation
  const createQuestionMutation = useMutation({
    mutationFn: async (data: CreateQuestionForm) => {
      const questionData: InsertQuestion = {
        text: data.text,
        createdBy: "admin-user", // TODO: Replace with actual current user ID from auth context
        isActive: true,
        order: data.order,
      };
      return apiRequest("POST", "/api/questions", questionData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      handleDialogClose(false);
      toast({
        title: "Success",
        description: "Question created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create question",
        variant: "destructive",
      });
    },
  });

  // Update question mutation
  const updateQuestionMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<InsertQuestion> }) => {
      return apiRequest("PATCH", `/api/questions/${data.id}`, data.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      handleDialogClose(false);
      toast({
        title: "Success",
        description: "Question updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update question",
        variant: "destructive",
      });
    },
  });

  // Delete question mutation
  const deleteQuestionMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/questions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      toast({
        title: "Success",
        description: "Question deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete question",
        variant: "destructive",
      });
    },
  });

  // Send check-in reminder mutation
  const sendCheckinReminderMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/slack/send-checkin-reminder", {});
    },
    onSuccess: (data: any) => {
      toast({
        title: "Check-in Reminder Sent",
        description: `Reminder sent to ${data.userCount} team members with ${data.questionsIncluded} questions included`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send check-in reminder",
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const handleSubmit = (data: CreateQuestionForm) => {
    if (editingQuestion) {
      updateQuestionMutation.mutate({
        id: editingQuestion.id,
        updates: { text: data.text, order: data.order }
      });
    } else {
      createQuestionMutation.mutate(data);
    }
  };

  // Handle edit question
  const handleEdit = (question: Question) => {
    setEditingQuestion(question);
    form.setValue("text", question.text);
    form.setValue("order", question.order);
    setShowCreateDialog(true);
  };

  // Handle delete question
  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this question?")) {
      deleteQuestionMutation.mutate(id);
    }
  };

  // Toggle active status
  const toggleActive = (question: Question) => {
    updateQuestionMutation.mutate({
      id: question.id,
      updates: { isActive: !question.isActive }
    });
  };

  // Reset form and editing state when dialog closes
  const handleDialogClose = (open: boolean) => {
    setShowCreateDialog(open);
    if (!open) {
      setEditingQuestion(null);
      form.reset({
        text: "",
        order: questions.length,
      });
    } else if (open && !editingQuestion) {
      // When opening for create (not edit), set order to append to end
      form.setValue("order", questions.length);
    }
  };

  return (
    <>
      <Header
        title="Questions"
        description="Manage check-in questions for your team"
      />

      <main className="flex-1 overflow-auto p-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Question Management</h1>
            <p className="text-muted-foreground">
              Create and manage questions that team members will answer during their weekly check-ins.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <Button 
              variant="outline"
              onClick={() => sendCheckinReminderMutation.mutate()}
              disabled={sendCheckinReminderMutation.isPending}
              data-testid="button-send-reminder"
              className="w-full sm:w-auto"
            >
              <Send className="w-4 h-4 mr-2" />
              {sendCheckinReminderMutation.isPending ? "Sending..." : "Send Check-in Reminder"}
            </Button>
            <Dialog open={showCreateDialog} onOpenChange={handleDialogClose}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-question" className="w-full sm:w-auto">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Question
                </Button>
              </DialogTrigger>
              <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingQuestion ? "Edit Question" : "Create New Question"}
                </DialogTitle>
                <DialogDescription>
                  {editingQuestion 
                    ? "Update the question that team members will answer during check-ins."
                    : "Add a new question that team members will answer during their weekly check-ins."
                  }
                </DialogDescription>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="text"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Question Text</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="e.g., How satisfied are you with your work-life balance?"
                            rows={3}
                            data-testid="input-question-text"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="order"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Order</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            placeholder="0"
                            data-testid="input-question-order"
                            {...field}
                            onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleDialogClose(false)}
                      data-testid="button-cancel-question"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createQuestionMutation.isPending || updateQuestionMutation.isPending}
                      data-testid="button-submit-question"
                    >
                      {editingQuestion ? "Update Question" : "Create Question"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-center text-muted-foreground">Loading questions...</p>
            </CardContent>
          </Card>
        ) : sortedQuestions.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-2">No Questions Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Get started by creating your first check-in question.
                </p>
                <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-question">
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Question
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {sortedQuestions.map((question, index) => (
              <Card key={question.id} data-testid={`card-question-${question.id}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className="flex items-center space-x-2 mt-1">
                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">
                          #{question.order}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium leading-6" data-testid={`text-question-${question.id}`}>
                          {question.text}
                        </p>
                        <div className="flex items-center space-x-2 mt-2">
                          <Badge 
                            variant={question.isActive ? "default" : "secondary"}
                            data-testid={`badge-status-${question.id}`}
                          >
                            {question.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Created {question.createdAt ? new Date(question.createdAt).toLocaleDateString() : "Just now"}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive(question)}
                        disabled={updateQuestionMutation.isPending}
                        data-testid={`button-toggle-${question.id}`}
                      >
                        {question.isActive ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(question)}
                        data-testid={`button-edit-${question.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(question.id)}
                        disabled={deleteQuestionMutation.isPending}
                        data-testid={`button-delete-${question.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}