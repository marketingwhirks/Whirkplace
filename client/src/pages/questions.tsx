import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Plus, Edit, Trash2, GripVertical, Eye, EyeOff, Send, XCircle, Search, BookOpen, Users, Heart, Briefcase, TrendingUp, MessageCircle, Target, Sparkles, Wand2, Lightbulb, Library, Upload, CheckCircle, User, UserCheck } from "lucide-react";

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
};

// Schema for creating questions with assignment
const createQuestionSchema = z.object({
  text: z.string().min(5, "Question must be at least 5 characters"),
  order: z.number().min(0, "Order must be 0 or greater").default(0),
  categoryId: z.string().optional(),
  assignedToUserId: z.string().optional().nullable(),
  addToBank: z.boolean().default(false),
});

type CreateQuestionForm = z.infer<typeof createQuestionSchema>;

export default function QuestionsEnhanced() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBankDialog, setShowBankDialog] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [creationMode, setCreationMode] = useState<"custom" | "bank">("bank");
  const [selectedBankQuestion, setSelectedBankQuestion] = useState<QuestionBank | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [assignmentType, setAssignmentType] = useState<"all" | "specific">("all");
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // Fetch questions
  const { data: questions = [], isLoading } = useQuery<Question[]>({
    queryKey: ["/api/questions"],
    enabled: !userLoading && !!currentUser && ((currentUser as any).role === "manager" || (currentUser as any).role === "admin"),
  });

  // Fetch users for assignment dropdown
  const { data: users = [], isLoading: usersLoading } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
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
      const params = selectedCategory && selectedCategory !== "all" ? `?categoryId=${selectedCategory}` : "";
      const response = await fetch(`/api/question-bank${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch question bank");
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

  // Form for creating/editing questions
  const form = useForm<CreateQuestionForm>({
    resolver: zodResolver(createQuestionSchema),
    defaultValues: {
      text: "",
      order: questions.length,
      categoryId: undefined,
      assignedToUserId: null,
      addToBank: false,
    },
  });

  // Create question mutation
  const createQuestionMutation = useMutation({
    mutationFn: async (data: CreateQuestionForm) => {
      return apiRequest("POST", "/api/questions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      handleDialogClose();
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

  // Handle dialog close
  const handleDialogClose = () => {
    setShowCreateDialog(false);
    setEditingQuestion(null);
    form.reset();
    setAssignmentType("all");
    setSelectedUserId("");
  };

  // Handle bank dialog close
  const handleBankDialogClose = () => {
    setShowBankDialog(false);
    setSelectedBankQuestion(null);
    setAssignmentType("all");
    setSelectedUserId("");
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

  // Submit form
  const onSubmit = (data: CreateQuestionForm) => {
    const submitData = {
      ...data,
      assignedToUserId: assignmentType === "specific" ? selectedUserId : null,
    };
    createQuestionMutation.mutate(submitData);
  };

  // Get category name
  const getCategoryName = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.name || "Uncategorized";
  };

  // Get user name
  const getUserName = (userId: string | null) => {
    if (!userId) return "All Team";
    const user = users.find(u => u.id === userId);
    return user?.name || "Unknown User";
  };

  if (userLoading || !currentUser) {
    return <div>Loading...</div>;
  }

  const isManager = (currentUser as any).role === "manager" || (currentUser as any).role === "admin";

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
            const Icon = categoryIcons[categoryId] || BookOpen;
            
            return (
              <Card key={categoryId}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {category?.icon && <span className="text-2xl">{category.icon}</span>}
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
                    {categoryQuestions.map((question) => (
                      <div
                        key={question.id}
                        className="flex items-start justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{question.text}</p>
                            {question.isFromBank && (
                              <Badge variant="outline" className="text-xs">
                                <Library className="w-3 h-3 mr-1" />
                                From Bank
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              {question.assignedToUserId ? (
                                <>
                                  <User className="w-3 h-3" />
                                  <span>Assigned to: {getUserName(question.assignedToUserId)}</span>
                                </>
                              ) : (
                                <>
                                  <Users className="w-3 h-3" />
                                  <span>All Team Members</span>
                                </>
                              )}
                            </div>
                            {!question.isActive && (
                              <Badge variant="secondary">Hidden</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
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
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.icon} {category.name}
                    </SelectItem>
                  ))}
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
                  <p className="text-muted-foreground">No questions found</p>
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
                              <Badge variant="secondary" className="text-xs">
                                {category?.icon} {category?.name}
                              </Badge>
                              {bankQuestion.tags && bankQuestion.tags.length > 0 && (
                                <>
                                  {bankQuestion.tags.map((tag) => (
                                    <Badge key={tag} variant="outline" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </>
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
              <div className="space-y-3 pt-4 border-t">
                <Label>Assign Question To:</Label>
                <RadioGroup value={assignmentType} onValueChange={(value: "all" | "specific") => setAssignmentType(value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="all" id="all" />
                    <Label htmlFor="all" className="flex items-center gap-2 cursor-pointer">
                      <Users className="w-4 h-4" />
                      All Team Members
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="specific" id="specific" />
                    <Label htmlFor="specific" className="flex items-center gap-2 cursor-pointer">
                      <UserCheck className="w-4 h-4" />
                      Specific Team Member
                    </Label>
                  </div>
                </RadioGroup>
                
                {assignmentType === "specific" && (
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name || user.email}
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

      {/* Custom Question Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Custom Question</DialogTitle>
            <DialogDescription>
              Create a custom check-in question for your team
            </DialogDescription>
          </DialogHeader>
          
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
                        {...field}
                        placeholder="What would you like to ask your team?"
                        className="min-h-[100px]"
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
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

              <div className="space-y-3">
                <Label>Assign To:</Label>
                <RadioGroup value={assignmentType} onValueChange={(value: "all" | "specific") => setAssignmentType(value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="all" id="custom-all" />
                    <Label htmlFor="custom-all" className="flex items-center gap-2 cursor-pointer">
                      <Users className="w-4 h-4" />
                      All Team Members
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="specific" id="custom-specific" />
                    <Label htmlFor="custom-specific" className="flex items-center gap-2 cursor-pointer">
                      <UserCheck className="w-4 h-4" />
                      Specific Team Member
                    </Label>
                  </div>
                </RadioGroup>
                
                {assignmentType === "specific" && (
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name || user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <FormField
                control={form.control}
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
                <Button type="button" variant="outline" onClick={handleDialogClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createQuestionMutation.isPending}>
                  {createQuestionMutation.isPending ? "Creating..." : "Create Question"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}