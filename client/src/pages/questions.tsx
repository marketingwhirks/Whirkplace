import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Plus, Edit, Trash2, GripVertical, Eye, EyeOff, Send, XCircle, Search, BookOpen, Users, Heart, Briefcase, TrendingUp, MessageCircle, Target, Sparkles, Wand2, Lightbulb, Library, Upload, CheckCircle, User, UserCheck, Pencil, Settings2, FolderPlus, ArrowUpDown, Smile } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Question, QuestionCategory, QuestionBank, User as UserType } from "@shared/schema";

// Category icons mapping
const categoryIcons: { [key: string]: any } = {
  "team-health": Heart,
  "personal-growth": TrendingUp,
  "work-progress": Briefcase,
  "wellbeing": Heart,
  "feedback": MessageCircle,
  "innovation": Lightbulb,
  "Team Health": Heart,
  "Personal Growth": TrendingUp,
  "Work Progress": Briefcase,
  "Wellbeing": Heart,
  "Productivity": Target,
  "Goals & Objectives": Target,
  "Challenges": XCircle,
  "Learning & Growth": TrendingUp,
  "Collaboration": Users,
  "Feedback & Recognition": MessageCircle,
  "Innovation & Ideas": Lightbulb,
};

// Schema for creating/editing questions with assignment
const questionSchema = z.object({
  text: z.string().min(5, "Question must be at least 5 characters"),
  order: z.number().min(0, "Order must be 0 or greater").default(0),
  categoryId: z.string().optional().nullable(),
  assignedToUserId: z.string().optional().nullable(),
  addToBank: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

// Schema for creating/editing categories
const categorySchema = z.object({
  name: z.string().min(1, "Category name is required"),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  order: z.number().min(0).default(0),
});

type QuestionForm = z.infer<typeof questionSchema>;
type CategoryForm = z.infer<typeof categorySchema>;

// Available icons for categories
const availableIcons = [
  { value: "❤️", label: "Heart" },
  { value: "📈", label: "Growth" },
  { value: "💼", label: "Work" },
  { value: "🎯", label: "Target" },
  { value: "💡", label: "Ideas" },
  { value: "👥", label: "Team" },
  { value: "💬", label: "Chat" },
  { value: "🌟", label: "Star" },
  { value: "🚀", label: "Rocket" },
  { value: "🏆", label: "Trophy" },
  { value: "🎨", label: "Creative" },
  { value: "📚", label: "Learning" },
  { value: "🔥", label: "Fire" },
  { value: "✨", label: "Sparkle" },
  { value: "🌈", label: "Rainbow" },
];

export default function QuestionsEnhanced() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBankDialog, setShowBankDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showManageCategoriesDialog, setShowManageCategoriesDialog] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editingCategory, setEditingCategory] = useState<QuestionCategory | null>(null);
  const [creationMode, setCreationMode] = useState<"custom" | "bank">("bank");
  const [selectedBankQuestion, setSelectedBankQuestion] = useState<QuestionBank | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [assignmentType, setAssignmentType] = useState<"all" | "specific">("all");
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // Fetch questions
  const { data: questions = [], isLoading, refetch: refetchQuestions } = useQuery<Question[]>({
    queryKey: ["/api/questions"],
    enabled: !userLoading && !!currentUser && ((currentUser as any).role === "manager" || (currentUser as any).role === "admin"),
  });

  // Fetch users for assignment dropdown
  const { data: users = [], isLoading: usersLoading } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    enabled: !userLoading && !!currentUser && ((currentUser as any).role === "manager" || (currentUser as any).role === "admin"),
  });

  // Fetch question categories
  const { data: categories = [], isLoading: categoriesLoading, refetch: refetchCategories } = useQuery<QuestionCategory[]>({
    queryKey: ["/api/question-categories"],
    enabled: !userLoading && !!currentUser && ((currentUser as any).role === "manager" || (currentUser as any).role === "admin"),
  });

  // Fetch question bank
  const { data: questionBank = [], isLoading: bankLoading, refetch: refetchQuestionBank } = useQuery<QuestionBank[]>({
    queryKey: ["/api/question-bank", selectedCategory],
    queryFn: async () => {
      const params = selectedCategory && selectedCategory !== "all" ? `?categoryId=${selectedCategory}` : "";
      const response = await fetch(`/api/question-bank${params}`, {
        credentials: "include",
      });
      if (!response.ok) {
        console.error("Failed to fetch question bank:", response.status, response.statusText);
        return [];
      }
      return response.json();
    },
    enabled: !userLoading && !!currentUser && ((currentUser as any).role === "manager" || (currentUser as any).role === "admin"),
  });

  // Group questions by category
  const questionsByCategory = questions.reduce((acc, question) => {
    const categoryId = question.categoryId || "uncategorized";
    if (!acc[categoryId]) acc[categoryId] = [];
    acc[categoryId].push(question);
    return acc;
  }, {} as Record<string, Question[]>);

  // Filter question bank by search
  const filteredQuestionBank = questionBank.filter(q =>
    q.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (q.description && q.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Form for creating questions
  const createForm = useForm<QuestionForm>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      text: "",
      order: questions.length,
      categoryId: null,
      assignedToUserId: null,
      addToBank: false,
      isActive: true,
    },
  });

  // Form for editing questions
  const editForm = useForm<QuestionForm>({
    resolver: zodResolver(questionSchema),
  });

  // Form for creating/editing categories
  const categoryForm = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      description: "",
      icon: "❤️",
      order: 0,
    },
  });

  // Create category mutation
  const createCategoryMutation = useMutation({
    mutationFn: async (data: CategoryForm) => {
      return apiRequest("POST", "/api/question-categories", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/question-categories"] });
      refetchCategories();
      categoryForm.reset();
      setShowCategoryDialog(false);
      toast({
        title: "Success",
        description: "Category created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create category",
        variant: "destructive",
      });
    },
  });

  // Update category mutation
  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CategoryForm> }) => {
      return apiRequest("PATCH", `/api/question-categories/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/question-categories"] });
      refetchCategories();
      categoryForm.reset();
      setEditingCategory(null);
      setShowCategoryDialog(false);
      toast({
        title: "Success",
        description: "Category updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update category",
        variant: "destructive",
      });
    },
  });

  // Delete category mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/question-categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/question-categories"] });
      refetchCategories();
      toast({
        title: "Success",
        description: "Category deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete category",
        variant: "destructive",
      });
    },
  });

  // Create question mutation
  const createQuestionMutation = useMutation({
    mutationFn: async (data: QuestionForm) => {
      const submitData = {
        ...data,
        assignedToUserId: assignmentType === "specific" ? selectedUserId : null,
      };
      return apiRequest("POST", "/api/questions", submitData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      refetchQuestions();
      handleCreateDialogClose();
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
    mutationFn: async ({ id, data }: { id: string; data: Partial<QuestionForm> }) => {
      return apiRequest("PATCH", `/api/questions/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      refetchQuestions();
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

  // Toggle active status mutation  
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/questions/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      refetchQuestions();
      toast({
        title: "Success",
        description: "Question status updated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update question status",
        variant: "destructive",
      });
    },
  });

  // Use question from bank mutation
  const useQuestionFromBankMutation = useMutation({
    mutationFn: async (data: { bankQuestionId: string; assignedToUserId: string | null; order: number }) => {
      return apiRequest("POST", `/api/question-bank/${data.bankQuestionId}/use`, {
        assignedToUserId: data.assignedToUserId,
        order: data.order,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/question-bank"] });
      refetchQuestions();
      refetchQuestionBank();
      handleBankDialogClose();
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

  // Delete question mutation
  const deleteQuestionMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/questions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      refetchQuestions();
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

  // Handle create dialog close
  const handleCreateDialogClose = () => {
    setShowCreateDialog(false);
    createForm.reset();
    setAssignmentType("all");
    setSelectedUserId("");
  };

  // Handle edit dialog open
  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question);
    editForm.reset({
      text: question.text,
      order: question.order || 0,
      categoryId: question.categoryId || null,
      assignedToUserId: question.assignedToUserId || null,
      isActive: question.isActive !== undefined ? question.isActive : true,
    });
    setShowEditDialog(true);
  };

  // Handle edit dialog close
  const handleEditDialogClose = () => {
    setShowEditDialog(false);
    setEditingQuestion(null);
    editForm.reset();
  };

  // Handle bank dialog close
  const handleBankDialogClose = () => {
    setShowBankDialog(false);
    setSelectedBankQuestion(null);
    setAssignmentType("all");
    setSelectedUserId("");
  };

  // Handle category dialog open for edit
  const handleEditCategory = (category: QuestionCategory) => {
    setEditingCategory(category);
    categoryForm.reset({
      name: category.name,
      description: category.description || "",
      icon: category.icon || "❤️",
      order: (category as any).order || 0,
    });
    setShowCategoryDialog(true);
  };

  // Handle category dialog close
  const handleCategoryDialogClose = () => {
    setShowCategoryDialog(false);
    setEditingCategory(null);
    categoryForm.reset();
  };

  // Handle adding question from bank
  const handleAddFromBank = () => {
    if (!selectedBankQuestion) return;
    
    useQuestionFromBankMutation.mutate({
      bankQuestionId: selectedBankQuestion.id,
      assignedToUserId: assignmentType === "specific" ? selectedUserId : null,
      order: questions.length,
    });
  };

  // Submit create form
  const onCreateSubmit = (data: QuestionForm) => {
    createQuestionMutation.mutate(data);
  };

  // Submit edit form
  const onEditSubmit = (data: QuestionForm) => {
    if (!editingQuestion) return;
    updateQuestionMutation.mutate({
      id: editingQuestion.id,
      data,
    });
    handleEditDialogClose();
  };

  // Submit category form
  const onCategorySubmit = (data: CategoryForm) => {
    if (editingCategory) {
      updateCategoryMutation.mutate({
        id: editingCategory.id,
        data,
      });
    } else {
      createCategoryMutation.mutate(data);
    }
  };

  // Handle toggle active
  const handleToggleActive = (questionId: string, currentStatus: boolean) => {
    toggleActiveMutation.mutate({
      id: questionId,
      isActive: !currentStatus,
    });
  };

  // Get category name
  const getCategoryName = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.name || "Uncategorized";
  };

  // Get category icon
  const getCategoryIcon = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (category?.icon) return category.icon;
    const Icon = categoryIcons[getCategoryName(categoryId)] || categoryIcons[categoryId] || BookOpen;
    return typeof Icon === "string" ? Icon : null;
  };

  // Get user name
  const getUserName = (userId: string | null) => {
    if (!userId) return "All Team";
    const user = users.find(u => u.id === userId);
    return user ? `${user.name}` : "Unknown User";
  };

  if (userLoading || !currentUser) {
    return <div>Loading...</div>;
  }

  const isManager = (currentUser as any).role === "manager" || (currentUser as any).role === "admin";
  const isAdmin = (currentUser as any).role === "admin";

  if (!isManager) {
    return (
      <div className="container mx-auto py-10">
        <Alert>
          <AlertDescription>
            Only managers and admins can manage questions.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Check-in Questions
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage weekly check-in questions for your team
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button
              onClick={() => setShowManageCategoriesDialog(true)}
              variant="outline"
              data-testid="button-manage-categories"
            >
              <Settings2 className="w-4 h-4 mr-2" />
              Manage Categories
            </Button>
          )}
          <Button
            onClick={() => setShowBankDialog(true)}
            variant="outline"
            data-testid="button-add-from-bank"
          >
            <Library className="w-4 h-4 mr-2" />
            Add from Bank
          </Button>
          <Button
            onClick={() => {
              setCreationMode("custom");
              setShowCreateDialog(true);
            }}
            data-testid="button-add-custom"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Custom Question
          </Button>
        </div>
      </div>

      {/* Display loading categories message if needed */}
      {categoriesLoading && (
        <Alert className="mb-4">
          <AlertDescription>Loading categories...</AlertDescription>
        </Alert>
      )}

      {/* Display stats */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Questions</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{questions.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Categories</CardTitle>
            <FolderPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Question Bank</CardTitle>
            <Library className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{questionBank.length}</div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : questions.length === 0 ? (
        <Card>
          <CardContent className="text-center py-10">
            <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-semibold mb-2">No questions yet</p>
            <p className="text-muted-foreground mb-4">
              Start by adding questions from the bank or creating custom ones
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => setShowBankDialog(true)}>
                <Library className="w-4 h-4 mr-2" />
                Browse Question Bank
              </Button>
              <Button onClick={() => {
                setCreationMode("custom");
                setShowCreateDialog(true);
              }}>
                <Plus className="w-4 h-4 mr-2" />
                Create Custom
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Questions grouped by category */}
          {Object.entries(questionsByCategory).map(([categoryId, categoryQuestions]) => {
            const category = categories.find(c => c.id === categoryId);
            const icon = getCategoryIcon(categoryId);
            const Icon = categoryIcons[getCategoryName(categoryId)] || categoryIcons[categoryId] || BookOpen;
            
            return (
              <Card key={categoryId}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {icon ? <span className="text-2xl">{icon}</span> : (typeof Icon === 'function' ? <Icon className="w-5 h-5" /> : null)}
                    {getCategoryName(categoryId)}
                    <Badge variant="secondary" className="ml-2">
                      {categoryQuestions.length} {categoryQuestions.length === 1 ? "question" : "questions"}
                    </Badge>
                  </CardTitle>
                  {category?.description && (
                    <CardDescription>{category.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {categoryQuestions
                      .sort((a, b) => (a.order || 0) - (b.order || 0))
                      .map((question) => (
                      <div
                        key={question.id}
                        className={cn(
                          "flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors",
                          question.isActive === false && "opacity-60"
                        )}
                        data-testid={`question-item-${question.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-5 w-5 text-muted-foreground" />
                          <Switch
                            checked={question.isActive !== false}
                            onCheckedChange={() => handleToggleActive(question.id, question.isActive !== false)}
                            aria-label="Toggle question active status"
                            data-testid={`toggle-active-${question.id}`}
                          />
                        </div>
                        
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn(
                              "font-medium",
                              question.isActive === false && "line-through"
                            )}>
                              {question.text}
                            </p>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditQuestion(question)}
                                data-testid={`edit-question-${question.id}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteQuestionMutation.mutate(question.id)}
                                data-testid={`button-delete-${question.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 flex-wrap">
                            {question.isActive === false && (
                              <Badge variant="secondary" className="text-xs">
                                <EyeOff className="w-3 h-3 mr-1" />
                                Inactive
                              </Badge>
                            )}
                            {question.isFromBank && (
                              <Badge variant="outline" className="text-xs">
                                <Library className="w-3 h-3 mr-1" />
                                From Bank
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-xs">
                              {question.assignedToUserId ? (
                                <>
                                  <User className="w-3 h-3 mr-1" />
                                  {getUserName(question.assignedToUserId)}
                                </>
                              ) : (
                                <>
                                  <Users className="w-3 h-3 mr-1" />
                                  All Team Members
                                </>
                              )}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Question Bank Dialog */}
      <Dialog open={showBankDialog} onOpenChange={setShowBankDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Question Bank</DialogTitle>
            <DialogDescription>
              Browse and add pre-defined questions to your team's check-ins
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Search and Filter */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search questions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.length > 0 ? (
                    categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.icon} {category.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-categories" disabled>No categories available</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Questions List */}
            <ScrollArea className="h-[400px] pr-4">
              {bankLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : filteredQuestionBank.length === 0 ? (
                <div className="text-center py-8">
                  <Library className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No questions found in the bank</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {searchTerm ? "Try adjusting your search" : "Questions will appear here as they are added"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredQuestionBank.map((bankQuestion) => {
                    const category = categories.find(c => c.id === bankQuestion.categoryId);
                    return (
                      <div
                        key={bankQuestion.id}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedBankQuestion?.id === bankQuestion.id
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => setSelectedBankQuestion(bankQuestion)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-1">
                            <p className="font-medium">{bankQuestion.text}</p>
                            {bankQuestion.description && (
                              <p className="text-sm text-muted-foreground">
                                {bankQuestion.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2">
                              {category && (
                                <Badge variant="secondary" className="text-xs">
                                  {category.icon} {category.name}
                                </Badge>
                              )}
                              {bankQuestion.usageCount && bankQuestion.usageCount > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  Used {bankQuestion.usageCount} times
                                </Badge>
                              )}
                            </div>
                          </div>
                          {selectedBankQuestion?.id === bankQuestion.id && (
                            <CheckCircle className="w-5 h-5 text-primary" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* Assignment Options */}
            {selectedBankQuestion && (
              <div className="space-y-4 border-t pt-4">
                <div className="space-y-2">
                  <Label>Assign to</Label>
                  <RadioGroup value={assignmentType} onValueChange={(value: any) => setAssignmentType(value)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="all" id="all-team" />
                      <Label htmlFor="all-team">All team members</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="specific" id="specific-user" />
                      <Label htmlFor="specific-user">Specific team member</Label>
                    </div>
                  </RadioGroup>
                </div>

                {assignmentType === "specific" && (
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          <div className="flex items-center gap-2">
                            <User className="w-3 h-3" />
                            {user.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleBankDialogClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddFromBank}
              disabled={!selectedBankQuestion || (assignmentType === "specific" && !selectedUserId)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Categories Dialog */}
      <Dialog open={showManageCategoriesDialog} onOpenChange={setShowManageCategoriesDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
            <DialogDescription>
              Create, edit, and organize question categories
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setEditingCategory(null);
                  categoryForm.reset();
                  setShowCategoryDialog(true);
                }}
                data-testid="button-add-category"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Category
              </Button>
            </div>

            <ScrollArea className="h-[400px] pr-4">
              {categoriesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : categories.length === 0 ? (
                <div className="text-center py-8">
                  <FolderPlus className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No categories yet</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Create your first category to organize questions
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {categories
                    .sort((a, b) => ((a as any).order || 0) - ((b as any).order || 0))
                    .map((category) => {
                      const questionCount = questions.filter(q => q.categoryId === category.id).length;
                      return (
                        <div
                          key={category.id}
                          className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                          data-testid={`category-item-${category.id}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                {category.icon && <span className="text-xl">{category.icon}</span>}
                                <span className="font-medium">{category.name}</span>
                                <Badge variant="secondary" className="text-xs ml-2">
                                  {questionCount} {questionCount === 1 ? "question" : "questions"}
                                </Badge>
                              </div>
                              {category.description && (
                                <p className="text-sm text-muted-foreground">
                                  {category.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditCategory(category)}
                                data-testid={`edit-category-${category.id}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm(`Are you sure you want to delete "${category.name}"? This will not delete questions in this category.`)) {
                                    deleteCategoryMutation.mutate(category.id);
                                  }
                                }}
                                disabled={questionCount > 0}
                                data-testid={`delete-category-${category.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManageCategoriesDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={handleCategoryDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Edit Category" : "Create Category"}</DialogTitle>
            <DialogDescription>
              {editingCategory ? "Update the category details" : "Add a new category for questions"}
            </DialogDescription>
          </DialogHeader>

          <Form {...categoryForm}>
            <form onSubmit={categoryForm.handleSubmit(onCategorySubmit)} className="space-y-4">
              <FormField
                control={categoryForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Team Health" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={categoryForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        value={field.value || ""}
                        placeholder="Brief description of this category" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={categoryForm.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Icon</FormLabel>
                    <Select value={field.value || "❤️"} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableIcons.map((icon) => (
                          <SelectItem key={icon.value} value={icon.value}>
                            <span className="flex items-center gap-2">
                              <span className="text-xl">{icon.value}</span>
                              <span>{icon.label}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={categoryForm.control}
                name="order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="number" 
                        min="0"
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </FormControl>
                    <FormDescription>
                      Lower numbers appear first
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button variant="outline" type="button" onClick={handleCategoryDialogClose}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingCategory ? "Update" : "Create"} Category
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Create Question Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={handleCreateDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Custom Question</DialogTitle>
            <DialogDescription>
              Add a new custom question for your team's check-ins
            </DialogDescription>
          </DialogHeader>

          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
              <FormField
                control={createForm.control}
                name="text"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Question</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Enter your question..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select 
                      value={field.value || ""} 
                      onValueChange={(value) => field.onChange(value || null)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">No Category</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.icon} {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="addToBank"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3 space-y-0">
                    <div className="space-y-0.5">
                      <FormLabel>Contribute to Question Bank</FormLabel>
                      <FormDescription>
                        Share this question with other organizations (requires approval)
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button variant="outline" type="button" onClick={handleCreateDialogClose}>
                  Cancel
                </Button>
                <Button type="submit">Create Question</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Question Dialog */}
      <Dialog open={showEditDialog} onOpenChange={handleEditDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Question</DialogTitle>
            <DialogDescription>
              Update the question details
            </DialogDescription>
          </DialogHeader>

          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="text"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Question</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Enter your question..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select 
                      value={field.value || ""} 
                      onValueChange={(value) => field.onChange(value || null)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">No Category</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.icon} {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="assignedToUserId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned To</FormLabel>
                    <Select 
                      value={field.value || ""} 
                      onValueChange={(value) => field.onChange(value || null)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="All team members" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">All Team Members</SelectItem>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3 space-y-0">
                    <div className="space-y-0.5">
                      <FormLabel>Active</FormLabel>
                      <FormDescription>
                        Active questions will be included in check-ins
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button variant="outline" type="button" onClick={handleEditDialogClose}>
                  Cancel
                </Button>
                <Button type="submit">Update Question</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}