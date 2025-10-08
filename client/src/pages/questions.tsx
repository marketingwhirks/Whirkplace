import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { 
  Plus, Edit, Trash2, Eye, EyeOff, Search, Heart, TrendingUp, 
  MessageCircle, Star, Rocket, Scale, CheckCircle, User, 
  FolderPlus, ArrowRight, Wand2, BookOpen, AlertCircle, Loader2
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
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
import { cn } from "@/lib/utils";

import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Question, QuestionCategory, QuestionBank, User as UserType } from "@shared/schema";

// Category icons mapping with better icons
const categoryIcons: { [key: string]: any } = {
  "team-health": Heart,
  "work-life-balance": Scale,
  "growth-development": TrendingUp,
  "communication": MessageCircle,
  "recognition": Star,
  "engagement": Rocket,
};

// Category colors for badges and cards
const categoryColors: { [key: string]: string } = {
  "team-health": "bg-rose-100 text-rose-800 border-rose-200",
  "work-life-balance": "bg-purple-100 text-purple-800 border-purple-200",
  "growth-development": "bg-green-100 text-green-800 border-green-200",
  "communication": "bg-blue-100 text-blue-800 border-blue-200",
  "recognition": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "engagement": "bg-orange-100 text-orange-800 border-orange-200",
};

// Schema for creating/editing questions
const questionSchema = z.object({
  text: z.string().min(5, "Question must be at least 5 characters"),
  order: z.number().min(0, "Order must be 0 or greater").default(0),
  categoryId: z.string().optional().nullable(),
  assignedToUserId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

type QuestionForm = z.infer<typeof questionSchema>;

export default function QuestionsPage() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBankBrowser, setShowBankBrowser] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isSeeding, setIsSeeding] = useState(false);
  
  const isManager = currentUser && ((currentUser as any).role === "manager" || (currentUser as any).role === "admin");
  const isSuperAdmin = currentUser && (currentUser as any).isSuperAdmin === true;

  // Fetch active questions
  const { data: questions = [], isLoading: questionsLoading, refetch: refetchQuestions } = useQuery<Question[]>({
    queryKey: ["/api/questions"],
    enabled: !userLoading && !!currentUser && !!isManager,
  });

  // Fetch question categories
  const { data: categories = [], isLoading: categoriesLoading, refetch: refetchCategories } = useQuery<QuestionCategory[]>({
    queryKey: ["/api/question-categories"],
    enabled: !userLoading && !!currentUser && !!isManager,
  });

  // Fetch question bank
  const { data: questionBank = [], isLoading: bankLoading, refetch: refetchBank } = useQuery<QuestionBank[]>({
    queryKey: ["/api/question-bank"],
    enabled: !userLoading && !!currentUser && !!isManager,
  });

  // Auto-seed question bank if it's empty - ONLY for super admins
  useEffect(() => {
    if (!bankLoading && !categoriesLoading && isSuperAdmin && !isSeeding) {
      if (categories.length === 0 && questionBank.length === 0) {
        console.log("Question bank is empty, auto-seeding for super admin...");
        handleSeedQuestionBank();
      }
    }
  }, [bankLoading, categoriesLoading, categories.length, questionBank.length, isSuperAdmin, isSeeding]);

  // Seed question bank mutation
  const seedQuestionBank = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/seed-question-bank");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "✅ Question Bank Populated!",
        description: data.details 
          ? `Created ${data.details.categoriesCreated} categories and ${data.details.questionsCreated} questions`
          : "Question bank populated successfully",
      });
      refetchCategories();
      refetchBank();
    },
    onError: (error: any) => {
      toast({
        title: "Error Seeding Question Bank",
        description: error.message || "Failed to populate question bank",
        variant: "destructive",
      });
    },
  });

  // Create question mutation
  const createQuestion = useMutation({
    mutationFn: async (data: QuestionForm) => {
      const response = await apiRequest("POST", "/api/questions", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "✅ Question Created",
        description: "The question has been added to your active questions",
      });
      refetchQuestions();
      setShowCreateDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error Creating Question",
        description: error.message || "Failed to create question",
        variant: "destructive",
      });
    },
  });

  // Update question mutation
  const updateQuestion = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<QuestionForm> }) => {
      const response = await apiRequest("PATCH", `/api/questions/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "✅ Question Updated",
        description: "The question has been updated successfully",
      });
      refetchQuestions();
      setEditingQuestion(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error Updating Question",
        description: error.message || "Failed to update question",
        variant: "destructive",
      });
    },
  });

  // Delete question mutation
  const deleteQuestion = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/questions/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "✅ Question Deleted",
        description: "The question has been removed from active questions",
      });
      refetchQuestions();
    },
    onError: (error: any) => {
      toast({
        title: "Error Deleting Question",
        description: error.message || "Failed to delete question",
        variant: "destructive",
      });
    },
  });

  // Use question from bank mutation
  const useFromBank = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/question-bank/${id}/use`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "✅ Question Added",
        description: "The question has been added to your active questions",
      });
      refetchQuestions();
    },
    onError: (error: any) => {
      toast({
        title: "Error Adding Question",
        description: error.message || "Failed to add question from bank",
        variant: "destructive",
      });
    },
  });

  const handleSeedQuestionBank = async () => {
    setIsSeeding(true);
    try {
      await seedQuestionBank.mutateAsync();
    } finally {
      setIsSeeding(false);
    }
  };

  const form = useForm<QuestionForm>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      text: "",
      order: questions.length,
      categoryId: null,
      assignedToUserId: null,
      isActive: true,
    },
  });

  // Filter questions based on search and category
  const filteredQuestions = questions.filter((q) => {
    const matchesSearch = q.text.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || q.categoryId === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Filter bank questions
  const filteredBankQuestions = questionBank.filter((q) => {
    const matchesSearch = q.text.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || q.categoryId === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Group questions by category
  const questionsByCategory = categories.map((cat) => ({
    category: cat,
    activeQuestions: questions.filter((q) => q.categoryId === cat.id),
    bankQuestions: questionBank.filter((q) => q.categoryId === cat.id),
  }));

  if (userLoading || !currentUser) {
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="space-y-4">
          <Skeleton className="h-10 w-48" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isManager) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You need manager or admin permissions to manage questions.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Show empty state if question bank is completely empty
  if (!questionsLoading && !categoriesLoading && !bankLoading && 
      categories.length === 0 && questionBank.length === 0) {
    
    // Different UI for super admins vs regular admins/managers
    if (isSuperAdmin) {
      return (
        <div className="container mx-auto p-6 max-w-4xl">
          <Card className="text-center py-12">
            <CardContent className="space-y-6">
              <BookOpen className="h-16 w-16 mx-auto text-muted-foreground" />
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Welcome to Questions!</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Your question bank is empty. Let's populate it with carefully crafted questions 
                  to help your team have meaningful check-ins.
                </p>
              </div>
              <Button 
                onClick={handleSeedQuestionBank} 
                disabled={isSeeding}
                size="lg"
                className="gap-2"
                data-testid="button-seed-question-bank"
              >
                {isSeeding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Populating Question Bank...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Populate Question Bank
                  </>
                )}
              </Button>
              <p className="text-sm text-muted-foreground">
                This will create 6 categories with 5 questions each (30 total questions)
              </p>
            </CardContent>
          </Card>
        </div>
      );
    } else {
      // Graceful empty state for non-super admin managers/admins
      return (
        <div className="container mx-auto p-6 max-w-4xl">
          <Card className="text-center py-12">
            <CardContent className="space-y-6">
              <BookOpen className="h-16 w-16 mx-auto text-muted-foreground" />
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Welcome to Questions!</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  The question bank is currently empty. You can start by creating your own custom questions 
                  for your team's check-ins.
                </p>
              </div>
              <div className="flex gap-3 justify-center">
                <Button 
                  onClick={() => setShowCreateDialog(true)}
                  size="lg"
                  className="gap-2"
                  data-testid="button-create-first-question"
                >
                  <Plus className="h-4 w-4" />
                  Create Your First Question
                </Button>
              </div>
              <Alert className="max-w-md mx-auto">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Contact your super administrator to populate the question bank with pre-built templates.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      );
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Questions</h1>
              <p className="text-muted-foreground mt-1">
                Manage check-in questions for your team
              </p>
            </div>
            <div className="flex gap-2">
              {isSuperAdmin && (
                <Button
                  onClick={handleSeedQuestionBank}
                  disabled={isSeeding}
                  variant="outline"
                  size="sm"
                  data-testid="button-reseed-question-bank"
                  title="Seed Question Bank"
                >
                  {isSeeding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                </Button>
              )}
              <Button 
                onClick={() => setShowBankBrowser(true)}
                variant="outline"
                data-testid="button-browse-bank"
              >
                <BookOpen className="h-4 w-4 mr-2" />
                Browse Question Bank
              </Button>
              <Button 
                onClick={() => setShowCreateDialog(true)}
                data-testid="button-create-custom"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Custom Question
              </Button>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Active Questions</p>
                  <p className="text-2xl font-bold">{questions.filter(q => q.isActive).length}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <BookOpen className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Question Bank</p>
                  <p className="text-2xl font-bold">{questionBank.length}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <FolderPlus className="h-8 w-8 text-purple-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Categories</p>
                  <p className="text-2xl font-bold">{categories.length}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <Eye className="h-8 w-8 text-orange-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Inactive</p>
                  <p className="text-2xl font-bold">{questions.filter(q => !q.isActive).length}</p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="active" className="space-y-4">
          <TabsList>
            <TabsTrigger value="active">Active Questions</TabsTrigger>
            <TabsTrigger value="categories">By Category</TabsTrigger>
          </TabsList>

          {/* Active Questions Tab */}
          <TabsContent value="active" className="space-y-4">
            <div className="flex gap-4 mb-4">
              <div className="flex-1">
                <Input
                  placeholder="Search questions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                  data-testid="input-search"
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-48" data-testid="select-category-filter">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filteredQuestions.length === 0 ? (
              <Card className="p-8 text-center">
                <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Active Questions</h3>
                <p className="text-muted-foreground mb-4">
                  You haven't added any questions to your active list yet.
                </p>
                <Button onClick={() => setShowBankBrowser(true)}>
                  Browse Question Bank
                </Button>
              </Card>
            ) : (
              <div className="grid gap-3">
                {filteredQuestions.map((question) => {
                  const category = categories.find((c) => c.id === question.categoryId);
                  const Icon = category ? categoryIcons[category.id] || Heart : Heart;
                  
                  return (
                    <Card key={question.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            {category && (
                              <Badge className={cn("gap-1", categoryColors[category.id] || "")}>
                                <Icon className="h-3 w-3" />
                                {category.name}
                              </Badge>
                            )}
                            <Badge variant={question.isActive ? "default" : "secondary"}>
                              {question.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium">{question.text}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              updateQuestion.mutate({
                                id: question.id,
                                data: { isActive: !question.isActive },
                              });
                            }}
                            data-testid={`button-toggle-${question.id}`}
                          >
                            {question.isActive ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingQuestion(question)}
                            data-testid={`button-edit-${question.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this question?")) {
                                deleteQuestion.mutate(question.id);
                              }
                            }}
                            data-testid={`button-delete-${question.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories" className="space-y-4">
            <div className="grid gap-4">
              {questionsByCategory.map(({ category, activeQuestions, bankQuestions }) => {
                const Icon = categoryIcons[category.id] || Heart;
                
                return (
                  <Card key={category.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2 rounded-lg", categoryColors[category.id]?.replace("text-", "bg-").replace("800", "100"))}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{category.name}</CardTitle>
                            <CardDescription>{category.description}</CardDescription>
                          </div>
                        </div>
                        <div className="flex gap-2 text-sm">
                          <Badge variant="outline">
                            {activeQuestions.length} active
                          </Badge>
                          <Badge variant="secondary">
                            {bankQuestions.length} in bank
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {activeQuestions.length > 0 ? (
                          activeQuestions.slice(0, 3).map((q) => (
                            <div key={q.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                              <p className="text-sm">{q.text}</p>
                              <Badge variant={q.isActive ? "default" : "secondary"} className="text-xs">
                                {q.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No active questions in this category
                          </p>
                        )}
                        {activeQuestions.length > 3 && (
                          <p className="text-sm text-muted-foreground">
                            +{activeQuestions.length - 3} more questions
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Question Bank Browser Dialog */}
      <Dialog open={showBankBrowser} onOpenChange={setShowBankBrowser}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Question Bank</DialogTitle>
            <DialogDescription>
              Browse and add questions from the pre-built question bank
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex gap-4">
              <Input
                placeholder="Search question bank..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
                data-testid="input-search-bank"
              />
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-48" data-testid="select-category-bank">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ScrollArea className="h-[400px]">
              <div className="space-y-3 pr-4">
                {filteredBankQuestions.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No questions found matching your criteria</p>
                  </div>
                ) : (
                  filteredBankQuestions.map((bankQuestion) => {
                    const category = categories.find((c) => c.id === bankQuestion.categoryId);
                    const Icon = category ? categoryIcons[category.id] || Heart : Heart;
                    const isAlreadyActive = questions.some((q) => q.text === bankQuestion.text);
                    
                    return (
                      <Card key={bankQuestion.id} className={cn("p-4", isAlreadyActive && "opacity-60")}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              {category && (
                                <Badge className={cn("gap-1", categoryColors[category.id] || "")}>
                                  <Icon className="h-3 w-3" />
                                  {category.name}
                                </Badge>
                              )}
                              {isAlreadyActive && (
                                <Badge variant="secondary">Already Active</Badge>
                              )}
                            </div>
                            <p className="text-sm font-medium">{bankQuestion.text}</p>
                            {bankQuestion.description && (
                              <p className="text-xs text-muted-foreground">{bankQuestion.description}</p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant={isAlreadyActive ? "secondary" : "default"}
                            disabled={isAlreadyActive}
                            onClick={() => useFromBank.mutate(bankQuestion.id)}
                            data-testid={`button-use-${bankQuestion.id}`}
                          >
                            {isAlreadyActive ? "In Use" : "Add"}
                            {!isAlreadyActive && <ArrowRight className="h-3 w-3 ml-1" />}
                          </Button>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Question Dialog */}
      <Dialog open={showCreateDialog || !!editingQuestion} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setEditingQuestion(null);
          form.reset();
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingQuestion ? "Edit Question" : "Create Custom Question"}
            </DialogTitle>
            <DialogDescription>
              {editingQuestion 
                ? "Update the question details" 
                : "Create a custom question for your team's check-ins"}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => {
              if (editingQuestion) {
                updateQuestion.mutate({ id: editingQuestion.id, data });
              } else {
                createQuestion.mutate(data);
              }
            })} className="space-y-4">
              <FormField
                control={form.control}
                name="text"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Question Text</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What would you like to ask your team?"
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
                    <FormLabel>Category</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value || undefined}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-question-category">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.icon} {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Active</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Active questions appear in check-in forms
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateDialog(false);
                    setEditingQuestion(null);
                    form.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" data-testid="button-save-question">
                  {editingQuestion ? "Update" : "Create"} Question
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}