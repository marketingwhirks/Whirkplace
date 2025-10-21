import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  HelpCircle, Plus, RefreshCw, Search, Filter, Check, X, 
  MessageSquare, AlertCircle, Database, Eye, EyeOff, Heart,
  Scale, TrendingUp, MessageCircle, Star, Rocket, BarChart2,
  Clock, Users, History, ToggleLeft, ToggleRight
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
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { QuestionBank, QuestionCategory, Question } from "@shared/schema";
import { defaultQuestionCategories, getTotalQuestionsCount } from "@shared/defaultQuestions";
import { format } from "date-fns";

interface QuestionWithStats extends Question {
  categoryName?: string;
  stats?: {
    timesAsked: number;
    lastAsked: Date | null;
    uniqueUsers: number;
    teams: string[];
  };
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

function QuestionCard({ 
  question, 
  onToggle,
  onViewStats 
}: { 
  question: QuestionWithStats; 
  onToggle: () => void;
  onViewStats?: () => void;
}) {
  const handleToggle = () => {
    onToggle();
  };
  
  return (
    <Card className={`hover:shadow-md transition-all ${!question.isActive ? 'opacity-60' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-sm font-medium leading-relaxed">{question.text}</p>
            {/* Usage Statistics */}
            {question.stats && (
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <BarChart2 className="w-3 h-3" />
                  <span>{question.stats.timesAsked} times asked</span>
                </div>
                {question.stats.lastAsked && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>Last: {format(new Date(question.stats.lastAsked), 'MMM dd, yyyy')}</span>
                  </div>
                )}
                {question.stats.uniqueUsers > 0 && (
                  <div className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    <span>{question.stats.uniqueUsers} users</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onViewStats && question.stats && question.stats.timesAsked > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onViewStats}
                data-testid={`button-view-stats-${question.id}`}
              >
                <History className="w-4 h-4" />
              </Button>
            )}
            <Switch
              checked={question.isActive}
              onCheckedChange={handleToggle}
              aria-label="Toggle question active status"
              data-testid={`switch-active-${question.id}`}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge 
            variant={question.isActive ? "secondary" : "outline"} 
            className={`${question.categoryId ? categoryColors[question.categoryId] : ''} text-xs`}
          >
            {question.categoryId ? categoryIcons[question.categoryId] : <HelpCircle className="w-3 h-3" />}
            <span className="ml-1">{question.categoryId || 'Uncategorized'}</span>
          </Badge>
          {!question.isActive && (
            <Badge variant="outline" className="text-xs">
              <EyeOff className="w-3 h-3 mr-1" />
              Inactive
            </Badge>
          )}
          {question.teamId && (
            <Badge variant="outline" className="text-xs">
              Team Specific
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
  const [showInactive, setShowInactive] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showStatsDialog, setShowStatsDialog] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionWithStats | null>(null);
  const [questionHistory, setQuestionHistory] = useState<any[]>([]);
  
  // Fetch all questions with optional inactive
  const { data: questions = [], isLoading: questionsLoading, refetch } = useQuery<QuestionWithStats[]>({
    queryKey: ["/api/questions/all", { includeInactive: showInactive }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("includeInactive", showInactive.toString());
      
      const response = await fetch(`/api/questions/all?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch questions");
      const allQuestions = await response.json();
      
      // Fetch stats for each question in parallel
      const questionsWithStats = await Promise.all(
        allQuestions.map(async (q: Question) => {
          try {
            const statsResponse = await fetch(`/api/questions/${q.id}/usage-stats`);
            if (statsResponse.ok) {
              const { stats } = await statsResponse.json();
              return { ...q, stats };
            }
          } catch {
            // Ignore stats fetch errors
          }
          return q;
        })
      );
      
      return questionsWithStats;
    },
  });
  
  // Filter questions based on search and category
  const filteredQuestions = questions.filter(q => {
    const matchesSearch = searchTerm === "" || 
      q.text.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "all" || 
      q.categoryId === filterCategory;
    return matchesSearch && matchesCategory;
  });
  
  // Toggle question active status mutation
  const toggleQuestionMutation = useMutation({
    mutationFn: async (questionId: string) => {
      const response = await apiRequest("PATCH", `/api/questions/${questionId}/toggle-active`, {});
      if (!response.ok) throw new Error("Failed to toggle question status");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.isActive ? "Question activated" : "Question deactivated",
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
  
  // View question stats
  const viewQuestionStats = async (question: QuestionWithStats) => {
    setSelectedQuestion(question);
    try {
      const response = await fetch(`/api/questions/${question.id}/usage-stats`);
      if (response.ok) {
        const { history } = await response.json();
        setQuestionHistory(history);
        setShowStatsDialog(true);
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to load question history",
        variant: "destructive",
      });
    }
  };
  
  if (questionsLoading) {
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
  
  const activeQuestions = questions.filter(q => q.isActive);
  const inactiveQuestions = questions.filter(q => !q.isActive);
  
  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Questions Management</h3>
          <p className="text-sm text-muted-foreground">
            Manage and track check-in questions for your organization
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="show-inactive" className="text-sm">
              Show Inactive
            </Label>
            <Switch
              id="show-inactive"
              checked={showInactive}
              onCheckedChange={setShowInactive}
              data-testid="switch-show-inactive"
            />
          </div>
        </div>
      </div>
      
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Active Questions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeQuestions.length}</div>
            <p className="text-xs text-muted-foreground">
              Currently active for check-ins
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <EyeOff className="w-4 h-4" />
              Inactive Questions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inactiveQuestions.length}</div>
            <p className="text-xs text-muted-foreground">
              Currently deactivated
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart2 className="w-4 h-4" />
              Total Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {questions.reduce((sum, q) => sum + (q.stats?.timesAsked || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total times questions asked
            </p>
          </CardContent>
        </Card>
      </div>
      
      
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
      {filteredQuestions.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              No Questions Found
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {questions.length === 0 
                ? "Your organization doesn't have any questions yet."
                : "Try adjusting your search criteria or filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[600px] pr-4">
          <div className="grid gap-3">
            {filteredQuestions.map((question) => (
              <QuestionCard 
                key={question.id} 
                question={question}
                onToggle={() => toggleQuestionMutation.mutate(question.id)}
                onViewStats={() => viewQuestionStats(question)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
      
      {/* Question Stats Dialog */}
      <Dialog open={showStatsDialog} onOpenChange={setShowStatsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Question Usage History</DialogTitle>
            <DialogDescription>
              {selectedQuestion?.text}
            </DialogDescription>
          </DialogHeader>
          
          {selectedQuestion && selectedQuestion.stats && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Times Asked</p>
                  <p className="text-2xl font-semibold">{selectedQuestion.stats.timesAsked}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Unique Users</p>
                  <p className="text-2xl font-semibold">{selectedQuestion.stats.uniqueUsers}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Last Asked</p>
                  <p className="text-sm font-medium">
                    {selectedQuestion.stats.lastAsked 
                      ? format(new Date(selectedQuestion.stats.lastAsked), 'MMM dd, yyyy')
                      : 'Never'}
                  </p>
                </div>
              </div>
              
              {questionHistory && questionHistory.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Recent Usage</h4>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2">
                      {questionHistory.map((entry: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded-lg text-sm">
                          <span>Used in check-in</span>
                          <span className="text-muted-foreground">
                            {format(new Date(entry.createdAt), 'MMM dd, yyyy HH:mm')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowStatsDialog(false)}
              data-testid="button-close-stats"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}