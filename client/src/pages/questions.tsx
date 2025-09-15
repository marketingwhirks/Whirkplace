import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Plus, Edit, Trash2, GripVertical, Eye, EyeOff, Send, XCircle, Search, BookOpen, Users, Heart, Briefcase, TrendingUp, MessageCircle, Target } from "lucide-react";

import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";

import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Question, InsertQuestion } from "@shared/schema";
import { insertQuestionSchema } from "@shared/schema";
import { questionCategories, questionTemplates, getQuestionsByCategory, getCategoryById, type QuestionTemplate } from "@/lib/questionBank";

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
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [creationMode, setCreationMode] = useState<"custom" | "template">("template");
  const [selectedTemplate, setSelectedTemplate] = useState<QuestionTemplate | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("mood-wellness");

  // Fetch questions
  const { data: questions = [], isLoading } = useQuery<Question[]>({
    queryKey: ["/api/questions"],
    enabled: !userLoading && !!currentUser && (currentUser.role === "manager" || currentUser.role === "admin"),
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
      const questionData = {
        text: data.text,
        createdBy: currentUser?.id || "admin-user", // Use current user ID
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
      setSelectedTemplate(null);
      setCreationMode("template");
      setSearchTerm("");
      form.reset({
        text: "",
        order: questions.length,
      });
    } else if (open && !editingQuestion) {
      // When opening for create (not edit), set order to append to end
      form.setValue("order", questions.length);
    }
  };

  // Handle template selection
  const handleTemplateSelect = (template: QuestionTemplate) => {
    setSelectedTemplate(template);
    form.setValue("text", template.text);
  };

  // Handle switching creation modes
  const handleCreationModeChange = (mode: "custom" | "template") => {
    setCreationMode(mode);
    if (mode === "custom") {
      setSelectedTemplate(null);
      form.setValue("text", "");
    }
  };

  // Helper function to get icon component
  const getIconComponent = (iconName: string) => {
    const iconMap: Record<string, React.ComponentType<any>> = {
      Heart,
      Users,
      Briefcase,
      TrendingUp,
      MessageCircle,
      Target,
    };
    const IconComponent = iconMap[iconName];
    return IconComponent ? <IconComponent className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />;
  };

  // Filter questions based on search term
  const filteredQuestions = searchTerm
    ? questionTemplates.filter(q => 
        q.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (q.description && q.description.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : getQuestionsByCategory(selectedCategory);

  // Show access denied for non-managers/admins
  if (!userLoading && currentUser && currentUser.role === "member") {
    return (
      <>
        <Header
          title="Questions"
          description="Access Denied"
        />
        <main className="flex-1 overflow-auto p-6">
          <Card>
            <CardContent className="p-6 text-center">
              <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
              <p className="text-muted-foreground">
                You need manager or admin privileges to access question management.
              </p>
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  if (userLoading) {
    return (
      <>
        <Header title="Questions" description="Loading..." />
        <main className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </main>
      </>
    );
  }

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
              <DialogContent className="max-w-4xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>
                  {editingQuestion ? "Edit Question" : "Create New Question"}
                </DialogTitle>
                <DialogDescription>
                  {editingQuestion 
                    ? "Update the question that team members will answer during check-ins."
                    : "Choose from our question bank or create a custom question for your team's weekly check-ins."
                  }
                </DialogDescription>
              </DialogHeader>
              
              {/* Only show tabs when creating new questions (not editing) */}
              {!editingQuestion && (
                <Tabs value={creationMode} onValueChange={handleCreationModeChange} className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="template" data-testid="tab-question-bank">
                      <BookOpen className="w-4 h-4 mr-2" />
                      Choose from Bank
                    </TabsTrigger>
                    <TabsTrigger value="custom" data-testid="tab-custom-question">
                      <Plus className="w-4 h-4 mr-2" />
                      Custom Question
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="template" className="mt-4">
                    <div className="space-y-4">
                      {/* Search Bar */}
                      <div className="flex items-center space-x-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search question templates..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8"
                            data-testid="input-search-templates"
                          />
                        </div>
                        {searchTerm && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSearchTerm("")}
                            data-testid="button-clear-search"
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                      
                      {/* Category Selection (only show when not searching) */}
                      {!searchTerm && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Categories</h4>
                          <div className="grid grid-cols-2 gap-2">
                            {questionCategories.map((category) => (
                              <Button
                                key={category.id}
                                variant={selectedCategory === category.id ? "default" : "outline"}
                                size="sm"
                                onClick={() => setSelectedCategory(category.id)}
                                className="justify-start h-auto p-3"
                                data-testid={`button-category-${category.id}`}
                              >
                                <div className="flex items-center space-x-2">
                                  {getIconComponent(category.icon)}
                                  <div className="text-left">
                                    <div className="font-medium">{category.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {getQuestionsByCategory(category.id).length} questions
                                    </div>
                                  </div>
                                </div>
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Question Templates */}
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">
                          {searchTerm ? `Search Results (${filteredQuestions.length})` : 
                           `${getCategoryById(selectedCategory)?.name || 'Questions'} (${filteredQuestions.length})`}
                        </h4>
                        <ScrollArea className="h-64 w-full rounded-md border p-2">
                          <div className="space-y-2">
                            {filteredQuestions.map((template) => (
                              <Card 
                                key={template.id} 
                                className={`cursor-pointer transition-colors ${
                                  selectedTemplate?.id === template.id 
                                    ? 'ring-2 ring-primary bg-accent' 
                                    : 'hover:bg-accent'
                                }`}
                                onClick={() => handleTemplateSelect(template)}
                                data-testid={`card-template-${template.id}`}
                              >
                                <CardContent className="p-3">
                                  <p className="text-sm font-medium">{template.text}</p>
                                  {template.description && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {template.description}
                                    </p>
                                  )}
                                </CardContent>
                              </Card>
                            ))}
                            {filteredQuestions.length === 0 && (
                              <div className="text-center text-muted-foreground py-8">
                                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">
                                  {searchTerm ? 'No questions match your search' : 'No questions in this category'}
                                </p>
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                      </div>
                      
                      {selectedTemplate && (
                        <div className="p-3 bg-muted rounded-lg">
                          <p className="text-sm text-muted-foreground mb-1">Selected Template:</p>
                          <p className="text-sm font-medium">{selectedTemplate.text}</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="custom" className="mt-4">
                    <div className="text-center py-4 text-muted-foreground">
                      <Plus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Create your own custom question below</p>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
              
              {/* Question Form - always visible */}
              <div className="mt-4">
                <Separator className="mb-4" />
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
                          {selectedTemplate && (
                            <p className="text-xs text-muted-foreground">
                              You can customize the selected template before creating the question.
                            </p>
                          )}
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
              </div>
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