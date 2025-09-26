import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Plus, Edit, Trash2, GripVertical, Eye, EyeOff, Send, XCircle, Search, BookOpen, Users, Heart, Briefcase, TrendingUp, MessageCircle, Target, Sparkles, Wand2, Lightbulb, Library, Upload, CheckCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";

import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Question, QuestionCategory, QuestionBank } from "@shared/schema";

// Only allow client to set fields they should control
const createQuestionSchema = z.object({
  text: z.string().min(5, "Question must be at least 5 characters"),
  order: z.number().min(0, "Order must be 0 or greater").default(0),
  categoryId: z.string().optional(),
  addToBank: z.boolean().default(false),
});

type CreateQuestionForm = z.infer<typeof createQuestionSchema>;

// Schema for contributing to question bank
const contributeQuestionSchema = z.object({
  text: z.string().min(5, "Question must be at least 5 characters").max(500, "Question text too long"),
  categoryId: z.string().min(1, "Category is required"),
  description: z.string().max(200, "Description too long").optional(),
  tags: z.array(z.string()).default([]),
});

type ContributeQuestionForm = z.infer<typeof contributeQuestionSchema>;

export default function Questions() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showContributeDialog, setShowContributeDialog] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [creationMode, setCreationMode] = useState<"custom" | "template">("template");
  const [selectedTemplate, setSelectedTemplate] = useState<QuestionBank | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [aiTheme, setAITheme] = useState("");
  const [aiTeamFocus, setAITeamFocus] = useState("");
  const [aiCount, setAICount] = useState(3);
  const [generatedQuestions, setGeneratedQuestions] = useState<any[]>([]);

  // Fetch questions
  const { data: questions = [], isLoading } = useQuery<Question[]>({
    queryKey: ["/api/questions"],
    enabled: !userLoading && !!currentUser && ((currentUser as any).role === "manager" || (currentUser as any).role === "admin"),
  });

  // Fetch question categories
  const { data: categories = [], isLoading: categoriesLoading } = useQuery<QuestionCategory[]>({
    queryKey: ["/api/question-categories"],
    enabled: !userLoading && !!currentUser && ((currentUser as any).role === "manager" || (currentUser as any).role === "admin"),
  });

  // Fetch question bank
  const { data: questionBank = [], isLoading: bankLoading } = useQuery<QuestionBank[]>({
    queryKey: ["/api/question-bank", selectedCategory],
    queryFn: async () => {
      const params = selectedCategory ? `?categoryId=${selectedCategory}` : "";
      const response = await fetch(`/api/question-bank${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch question bank");
      return response.json();
    },
    enabled: !userLoading && !!currentUser && ((currentUser as any).role === "manager" || (currentUser as any).role === "admin"),
  });

  // Sort questions by order
  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

  // Filter question bank by search
  const filteredQuestionBank = questionBank.filter(q =>
    q.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (q.description && q.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Form for creating/editing questions
  const form = useForm<CreateQuestionForm>({
    resolver: zodResolver(createQuestionSchema),
    defaultValues: {
      text: "",
      order: questions.length,
      categoryId: undefined,
      addToBank: false,
    },
  });

  // Form for contributing questions
  const contributeForm = useForm<ContributeQuestionForm>({
    resolver: zodResolver(contributeQuestionSchema),
    defaultValues: {
      text: "",
      categoryId: "",
      description: "",
      tags: [],
    },
  });

  // Create question mutation
  const createQuestionMutation = useMutation({
    mutationFn: async (data: CreateQuestionForm) => {
      return apiRequest("POST", "/api/questions", data);
    },
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      handleDialogClose(false);
      toast({
        title: "Success",
        description: data.addToBank 
          ? "Question created and submitted to the bank for review" 
          : "Question created successfully",
      });
      
      // If addToBank is true, also contribute to the bank
      if (data.addToBank && data.categoryId) {
        contributeToBank({
          text: data.text,
          categoryId: data.categoryId,
          description: "",
          tags: [],
        });
      }
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
    mutationFn: async (data: { id: string; updates: Partial<Question> }) => {
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

  // Use question from bank mutation
  const useQuestionFromBankMutation = useMutation({
    mutationFn: async (bankQuestionId: string) => {
      return apiRequest("POST", `/api/question-bank/${bankQuestionId}/use`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/question-bank"] });
      setSelectedTemplate(null);
      setShowCreateDialog(false);
      toast({
        title: "Success",
        description: "Question added from bank",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to use question from bank",
        variant: "destructive",
      });
    },
  });

  // Contribute question to bank mutation
  const contributeQuestionMutation = useMutation({
    mutationFn: async (data: ContributeQuestionForm) => {
      return apiRequest("POST", "/api/question-bank", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/question-bank"] });
      setShowContributeDialog(false);
      contributeForm.reset();
      toast({
        title: "Success",
        description: "Question submitted to the bank for review",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to contribute question",
        variant: "destructive",
      });
    },
  });

  const contributeToBank = (data: ContributeQuestionForm) => {
    contributeQuestionMutation.mutate(data);
  };

  // Toggle question visibility
  const toggleQuestionVisibility = async (question: Question) => {
    updateQuestionMutation.mutate({
      id: question.id,
      updates: { isActive: !question.isActive },
    });
  };

  // Handle dialog open/close
  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setShowCreateDialog(false);
      setEditingQuestion(null);
      form.reset();
      setSelectedTemplate(null);
      setCreationMode("template");
    } else {
      setShowCreateDialog(true);
    }
  };

  // Generate AI questions
  const generateAIQuestions = async () => {
    if (!aiTheme && !aiTeamFocus) {
      toast({
        title: "Error",
        description: "Please provide at least a theme or team focus",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/questions/generate", {
        theme: aiTheme,
        teamFocus: aiTeamFocus,
        count: aiCount,
      });
      
      if (response && response.questions) {
        setGeneratedQuestions(response.questions);
        toast({
          title: "Success",
          description: `Generated ${response.questions.length} questions`,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate questions",
        variant: "destructive",
      });
    }
  };

  // Add generated question
  const addGeneratedQuestion = (question: any, index: number) => {
    form.setValue("text", question.text);
    setGeneratedQuestions(prev => prev.filter((_, i) => i !== index));
    setShowAIGenerator(false);
  };

  // Improve question with AI
  const improveQuestion = async (questionId: string) => {
    try {
      const response = await apiRequest("POST", `/api/questions/${questionId}/improve`, {});
      
      if (response && response.improvedText) {
        updateQuestionMutation.mutate({
          id: questionId,
          updates: { text: response.improvedText },
        });
        toast({
          title: "Success",
          description: "Question improved successfully",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to improve question",
        variant: "destructive",
      });
    }
  };

  const onSubmit = (data: CreateQuestionForm) => {
    if (editingQuestion) {
      updateQuestionMutation.mutate({
        id: editingQuestion.id,
        updates: data,
      });
    } else {
      createQuestionMutation.mutate(data);
    }
  };

  const onContributeSubmit = (data: ContributeQuestionForm) => {
    contributeQuestionMutation.mutate(data);
  };

  if (userLoading || isLoading || categoriesLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!currentUser || ((currentUser as any).role !== "manager" && (currentUser as any).role !== "admin")) {
    return (
      <div className="container mx-auto py-8">
        <Alert>
          <AlertDescription>
            You don't have permission to manage questions.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Question Management</h1>
        <p className="text-muted-foreground">
          Manage check-in questions for your team
        </p>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="active">Active Questions</TabsTrigger>
          <TabsTrigger value="bank">Question Bank</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {sortedQuestions.filter(q => q.isActive).length} active questions
            </div>
            <div className="flex gap-2">
              <Dialog open={showCreateDialog} onOpenChange={handleDialogClose}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-question">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Question
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {editingQuestion ? "Edit Question" : "Add Question"}
                    </DialogTitle>
                    <DialogDescription>
                      {editingQuestion 
                        ? "Update the question details" 
                        : "Choose from templates or create a custom question"}
                    </DialogDescription>
                  </DialogHeader>

                  {!editingQuestion && (
                    <Tabs value={creationMode} onValueChange={(v) => setCreationMode(v as "custom" | "template")}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="template" data-testid="tab-template">From Template</TabsTrigger>
                        <TabsTrigger value="custom" data-testid="tab-custom">Custom Question</TabsTrigger>
                      </TabsList>

                      <TabsContent value="template" className="space-y-4">
                        <div className="space-y-4">
                          <div className="flex gap-2">
                            <Select
                              value={selectedCategory}
                              onValueChange={setSelectedCategory}
                            >
                              <SelectTrigger data-testid="select-category">
                                <SelectValue placeholder="All Categories" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">All Categories</SelectItem>
                                {categories.map(cat => (
                                  <SelectItem key={cat.id} value={cat.id} data-testid={`category-${cat.id}`}>
                                    {cat.icon && <span className="mr-2">{cat.icon}</span>}
                                    {cat.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder="Search questions..."
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="flex-1"
                              data-testid="input-search-questions"
                            />
                          </div>

                          <ScrollArea className="h-96">
                            <div className="space-y-2">
                              {bankLoading ? (
                                <div className="text-center py-8 text-muted-foreground">
                                  Loading question bank...
                                </div>
                              ) : filteredQuestionBank.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                  No questions found
                                </div>
                              ) : (
                                filteredQuestionBank.map((template) => (
                                  <Card
                                    key={template.id}
                                    className={`cursor-pointer transition-colors ${
                                      selectedTemplate?.id === template.id
                                        ? "border-primary bg-primary/5"
                                        : ""
                                    }`}
                                    onClick={() => setSelectedTemplate(template)}
                                    data-testid={`template-${template.id}`}
                                  >
                                    <CardContent className="p-4 space-y-2">
                                      <div className="flex items-start justify-between">
                                        <p className="font-medium flex-1">{template.text}</p>
                                        {template.isApproved && (
                                          <CheckCircle className="h-4 w-4 text-green-500 ml-2" />
                                        )}
                                      </div>
                                      {template.description && (
                                        <p className="text-sm text-muted-foreground">
                                          {template.description}
                                        </p>
                                      )}
                                      <div className="flex items-center gap-2">
                                        {template.tags && template.tags.map(tag => (
                                          <Badge key={tag} variant="secondary" className="text-xs">
                                            {tag}
                                          </Badge>
                                        ))}
                                        {template.usageCount > 0 && (
                                          <Badge variant="outline" className="text-xs">
                                            Used {template.usageCount} times
                                          </Badge>
                                        )}
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))
                              )}
                            </div>
                          </ScrollArea>

                          {selectedTemplate && (
                            <Button
                              onClick={() => useQuestionFromBankMutation.mutate(selectedTemplate.id)}
                              disabled={useQuestionFromBankMutation.isPending}
                              data-testid="button-use-template"
                            >
                              Use Selected Question
                            </Button>
                          )}
                        </div>
                      </TabsContent>

                      <TabsContent value="custom" className="space-y-4">
                        <Form {...form}>
                          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField
                              control={form.control}
                              name="text"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Question Text</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder="Enter your question..."
                                      className="min-h-[100px]"
                                      {...field}
                                      data-testid="textarea-question-text"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="categoryId"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Category (Optional)</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-question-category">
                                        <SelectValue placeholder="Select a category" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {categories.map(cat => (
                                        <SelectItem key={cat.id} value={cat.id}>
                                          {cat.icon && <span className="mr-2">{cat.icon}</span>}
                                          {cat.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormDescription>
                                    Categorize your question for better organization
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="addToBank"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-base">
                                      Share with Question Bank
                                    </FormLabel>
                                    <FormDescription>
                                      Contribute this question to the shared bank for others to use
                                    </FormDescription>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      disabled={!form.watch("categoryId")}
                                      data-testid="switch-add-to-bank"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />

                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowAIGenerator(true)}
                                data-testid="button-ai-generate"
                              >
                                <Sparkles className="mr-2 h-4 w-4" />
                                AI Generate
                              </Button>
                              <Button type="submit" className="flex-1" data-testid="button-create-question">
                                {editingQuestion ? "Update" : "Create"} Question
                              </Button>
                            </div>
                          </form>
                        </Form>
                      </TabsContent>
                    </Tabs>
                  )}

                  {editingQuestion && (
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                          control={form.control}
                          name="text"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Question Text</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Enter your question..."
                                  className="min-h-[100px]"
                                  {...field}
                                  data-testid="textarea-edit-question"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Button type="submit" className="w-full" data-testid="button-update-question">
                          Update Question
                        </Button>
                      </form>
                    </Form>
                  )}
                </DialogContent>
              </Dialog>

              <Button
                variant="outline"
                onClick={() => setShowContributeDialog(true)}
                data-testid="button-contribute-bank"
              >
                <Upload className="mr-2 h-4 w-4" />
                Contribute to Bank
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {sortedQuestions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No questions yet. Add your first question to get started.
                </div>
              ) : (
                <div className="divide-y">
                  {sortedQuestions.map((question, index) => {
                    const category = question.categoryId ? categories.find(c => c.id === question.categoryId) : null;
                    return (
                      <div
                        key={question.id}
                        className="p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors"
                        data-testid={`question-row-${question.id}`}
                      >
                        <GripVertical className="h-5 w-5 text-muted-foreground cursor-move" />
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <p className={`${!question.isActive ? "line-through text-muted-foreground" : ""}`} data-testid={`question-text-${question.id}`}>
                              {question.text}
                            </p>
                            {category && (
                              <Badge variant="outline" className="text-xs">
                                {category.icon && <span className="mr-1">{category.icon}</span>}
                                {category.name}
                              </Badge>
                            )}
                            {question.bankQuestionId && (
                              <Badge variant="secondary" className="text-xs">
                                <Library className="h-3 w-3 mr-1" />
                                From Bank
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Question {index + 1}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingQuestion(question);
                              form.reset({
                                text: question.text,
                                order: question.order,
                                categoryId: question.categoryId || undefined,
                                addToBank: false,
                              });
                              setShowCreateDialog(true);
                            }}
                            data-testid={`button-edit-${question.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleQuestionVisibility(question)}
                            data-testid={`button-toggle-${question.id}`}
                          >
                            {question.isActive ? (
                              <Eye className="h-4 w-4" />
                            ) : (
                              <EyeOff className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => improveQuestion(question.id)}
                            data-testid={`button-improve-${question.id}`}
                          >
                            <Wand2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteQuestionMutation.mutate(question.id)}
                            data-testid={`button-delete-${question.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bank" className="space-y-4">
          <div className="space-y-4">
            <div className="flex gap-2">
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger className="w-[200px]" data-testid="select-bank-category">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.icon && <span className="mr-2">{cat.icon}</span>}
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Search question bank..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
                data-testid="input-search-bank"
              />
              <Button onClick={() => setShowContributeDialog(true)} data-testid="button-contribute">
                <Upload className="mr-2 h-4 w-4" />
                Contribute
              </Button>
            </div>

            <div className="grid gap-4">
              {bankLoading ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    Loading question bank...
                  </CardContent>
                </Card>
              ) : filteredQuestionBank.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    No questions found in the bank
                  </CardContent>
                </Card>
              ) : (
                filteredQuestionBank.map((item) => {
                  const category = categories.find(c => c.id === item.categoryId);
                  return (
                    <Card key={item.id} data-testid={`bank-item-${item.id}`}>
                      <CardContent className="p-6">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1 flex-1">
                              <p className="font-medium">{item.text}</p>
                              {item.description && (
                                <p className="text-sm text-muted-foreground">
                                  {item.description}
                                </p>
                              )}
                            </div>
                            <Button
                              size="sm"
                              onClick={() => useQuestionFromBankMutation.mutate(item.id)}
                              data-testid={`button-use-bank-${item.id}`}
                            >
                              Use Question
                            </Button>
                          </div>
                          
                          <div className="flex items-center gap-2 flex-wrap">
                            {category && (
                              <Badge variant="outline">
                                {category.icon && <span className="mr-1">{category.icon}</span>}
                                {category.name}
                              </Badge>
                            )}
                            {item.isApproved && (
                              <Badge variant="secondary">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Approved
                              </Badge>
                            )}
                            {item.isSystem && (
                              <Badge variant="secondary">
                                System
                              </Badge>
                            )}
                            {item.tags && item.tags.map(tag => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {item.usageCount > 0 && (
                              <Badge variant="outline" className="text-xs">
                                Used {item.usageCount} times
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Contribute to Bank Dialog */}
      <Dialog open={showContributeDialog} onOpenChange={setShowContributeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contribute to Question Bank</DialogTitle>
            <DialogDescription>
              Share your question with other organizations. Your contribution will be reviewed before being made available.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...contributeForm}>
            <form onSubmit={contributeForm.handleSubmit(onContributeSubmit)} className="space-y-4">
              <FormField
                control={contributeForm.control}
                name="text"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Question Text</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter your question..."
                        className="min-h-[100px]"
                        {...field}
                        data-testid="textarea-contribute-text"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={contributeForm.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-contribute-category">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.icon && <span className="mr-2">{cat.icon}</span>}
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={contributeForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Brief description of when to use this question"
                        {...field}
                        data-testid="input-contribute-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowContributeDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={contributeQuestionMutation.isPending} data-testid="button-submit-contribution">
                  Submit for Review
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* AI Generator Dialog */}
      <Dialog open={showAIGenerator} onOpenChange={setShowAIGenerator}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>AI Question Generator</DialogTitle>
            <DialogDescription>
              Generate custom questions based on your team's needs
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Theme or Topic</label>
              <Input
                placeholder="e.g., remote work challenges, team collaboration"
                value={aiTheme}
                onChange={(e) => setAITheme(e.target.value)}
                data-testid="input-ai-theme"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Team Focus</label>
              <Input
                placeholder="e.g., engineering team, customer success"
                value={aiTeamFocus}
                onChange={(e) => setAITeamFocus(e.target.value)}
                data-testid="input-ai-focus"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Number of Questions</label>
              <Input
                type="number"
                min={1}
                max={10}
                value={aiCount}
                onChange={(e) => setAICount(Number(e.target.value))}
                data-testid="input-ai-count"
              />
            </div>

            <Button onClick={generateAIQuestions} className="w-full" data-testid="button-generate-ai">
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Questions
            </Button>

            {generatedQuestions.length > 0 && (
              <div className="space-y-2">
                <Separator />
                <h4 className="font-medium">Generated Questions</h4>
                <ScrollArea className="h-64">
                  <div className="space-y-2">
                    {generatedQuestions.map((q, idx) => (
                      <Card key={idx} data-testid={`generated-question-${idx}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <p className="flex-1">{q.text}</p>
                            <Button
                              size="sm"
                              onClick={() => addGeneratedQuestion(q, idx)}
                              data-testid={`button-use-generated-${idx}`}
                            >
                              Use
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}