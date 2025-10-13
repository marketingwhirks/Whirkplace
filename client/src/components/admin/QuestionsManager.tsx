import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  HelpCircle, Plus, RefreshCw, Search, Filter, Check, X, 
  MessageSquare, AlertCircle, Database, Eye, EyeOff, Heart,
  Scale, TrendingUp, MessageCircle, Star, Rocket
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { QuestionBank, QuestionCategory } from "@shared/schema";
import { defaultQuestionCategories, getTotalQuestionsCount } from "@shared/defaultQuestions";

interface QuestionBankWithCategory extends QuestionBank {
  categoryName?: string;
  categoryIcon?: string;
  categoryColor?: string;
}

interface QuestionsResponse {
  questions: QuestionBankWithCategory[];
  total: number;
}

interface QuestionStats {
  totalCategories: number;
  totalQuestions: number;
  categoryCounts: Array<{
    categoryId: string;
    categoryName: string;
    count: number;
  }>;
  defaultCategoriesAvailable: number;
  defaultQuestionsAvailable: number;
}

// Category icon mapping
const categoryIcons: Record<string, JSX.Element> = {
  "team-health": <Heart className="w-4 h-4" />,
  "work-life-balance": <Scale className="w-4 h-4" />,
  "growth-development": <TrendingUp className="w-4 h-4" />,
  "communication": <MessageCircle className="w-4 h-4" />,
  "recognition": <Star className="w-4 h-4" />,
  "engagement": <Rocket className="w-4 h-4" />
};

// Category color mapping
const categoryColors: Record<string, string> = {
  "team-health": "bg-rose-100 text-rose-800 dark:bg-rose-900/20 dark:text-rose-400",
  "work-life-balance": "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400",
  "growth-development": "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
  "communication": "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
  "recognition": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400",
  "engagement": "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400"
};

function QuestionCard({ question, onToggle }: { question: QuestionBankWithCategory; onToggle: () => void }) {
  const [isActive, setIsActive] = useState(question.isActive !== false);
  
  const handleToggle = () => {
    setIsActive(!isActive);
    onToggle();
  };
  
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-sm font-medium leading-relaxed">{question.text}</p>
            {question.description && (
              <p className="text-xs text-muted-foreground mt-1">{question.description}</p>
            )}
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={handleToggle}
            aria-label="Toggle question active status"
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge 
            variant="secondary" 
            className={`${categoryColors[question.categoryId] || ''} text-xs`}
          >
            <span className="mr-1">{question.categoryIcon || categoryIcons[question.categoryId]}</span>
            {question.categoryName || question.categoryId}
          </Badge>
          {question.tags?.map((tag, idx) => (
            <Badge key={idx} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
          {question.isSystem && (
            <Badge variant="default" className="text-xs">
              System
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function QuestionsManager() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionBankWithCategory | null>(null);
  
  // Fetch question statistics
  const { data: stats, isLoading: statsLoading } = useQuery<QuestionStats>({
    queryKey: ["/api/questions/stats"],
  });
  
  // Fetch existing questions
  const { data: questionsResponse, isLoading: questionsLoading, refetch } = useQuery<QuestionsResponse>({
    queryKey: ["/api/questions/bank", { categoryId: filterCategory === "all" ? undefined : filterCategory, search: searchTerm }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterCategory !== "all") params.append("categoryId", filterCategory);
      if (searchTerm) params.append("search", searchTerm);
      
      const response = await fetch(`/api/questions/bank?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch questions");
      return response.json();
    },
  });
  
  const questions = questionsResponse?.questions || [];
  
  // Restore default questions mutation
  const restoreQuestionsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/questions/seed-defaults", {});
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `Restored ${data.questionsCreated} questions and ${data.categoriesCreated} categories`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/questions/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/questions/bank"] });
      setShowRestoreDialog(false);
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Restore Failed",
        description: error.message || "Failed to restore default questions",
        variant: "destructive",
      });
    },
  });
  
  // Toggle question active status mutation
  const toggleQuestionMutation = useMutation({
    mutationFn: async (questionId: string) => {
      const response = await apiRequest("PATCH", `/api/questions/bank/${questionId}/toggle`, {});
      if (!response.ok) throw new Error("Failed to toggle question status");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.message,
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Toggle Failed",
        description: error.message || "Failed to toggle question status",
        variant: "destructive",
      });
    },
  });
  
  const handleRestore = () => {
    restoreQuestionsMutation.mutate();
  };
  
  if (statsLoading || questionsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  
  const needsQuestions = !stats || stats.totalQuestions === 0;
  
  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Question Bank Management</h3>
          <p className="text-sm text-muted-foreground">
            Manage check-in questions for your organization
          </p>
        </div>
        <Button 
          onClick={() => setShowRestoreDialog(true)}
          className="flex items-center gap-2"
          variant={needsQuestions ? "default" : "outline"}
          data-testid="button-restore-questions"
        >
          <RefreshCw className="w-4 h-4" />
          Restore Default Questions
        </Button>
      </div>
      
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="w-4 h-4" />
              Total Questions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalQuestions || 0}</div>
            <p className="text-xs text-muted-foreground">
              Currently in your question bank
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalCategories || 0}</div>
            <p className="text-xs text-muted-foreground">
              Question categories available
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Available to Restore
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{getTotalQuestionsCount()}</div>
            <p className="text-xs text-muted-foreground">
              Default questions ready to import
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Category breakdown */}
      {stats && stats.categoryCounts && stats.categoryCounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Questions by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {stats.categoryCounts.map((cat) => (
                <div key={cat.categoryId} className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {categoryIcons[cat.categoryId]}
                    <span className="text-sm font-medium">{cat.categoryName}</span>
                  </div>
                  <Badge variant="secondary" className="ml-auto">
                    {cat.count}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search questions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
            data-testid="input-search-questions"
          />
        </div>
        
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48" data-testid="select-filter-category">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {defaultQuestionCategories.map(cat => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Questions List */}
      {questions.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {needsQuestions ? "No Questions Found" : "No Questions Match Your Search"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {needsQuestions 
                ? "Your question bank is empty. Restore default questions to get started with pre-built check-in questions."
                : "Try adjusting your search criteria or filters."}
            </p>
            {needsQuestions && (
              <Button 
                onClick={() => setShowRestoreDialog(true)}
                data-testid="button-restore-empty"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Restore Default Questions
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[600px] pr-4">
          <div className="grid gap-3">
            {questions.map((question) => (
              <QuestionCard 
                key={question.id} 
                question={question}
                onToggle={() => toggleQuestionMutation.mutate(question.id)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
      
      {/* Restore Dialog */}
      <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Default Questions</DialogTitle>
            <DialogDescription>
              This will restore the default question bank with pre-built check-in questions.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium mb-1">What will be restored:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• 6 question categories</li>
                    <li>• {getTotalQuestionsCount()} pre-built questions</li>
                    <li>• Questions cover team health, growth, communication, and more</li>
                    <li>• Duplicate questions will be skipped automatically</li>
                  </ul>
                </div>
              </div>
            </div>
            
            {stats && stats.totalQuestions > 0 && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Note:</strong> You already have {stats.totalQuestions} questions. This action will only add missing questions, not replace existing ones.
                </p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowRestoreDialog(false)}
              data-testid="button-cancel-restore"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleRestore}
              disabled={restoreQuestionsMutation.isPending}
              data-testid="button-confirm-restore"
            >
              {restoreQuestionsMutation.isPending ? "Restoring..." : "Restore Questions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}