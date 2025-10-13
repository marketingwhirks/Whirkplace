import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { 
  HelpCircle, Plus, Settings, ToggleLeft, ToggleRight, 
  Users, Building, ChevronLeft, Trash2, Edit 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter,
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useViewAsRole } from "@/hooks/useViewAsRole";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Question, Team } from "@shared/schema";

interface TeamQuestionSetting {
  id: string;
  teamId: string;
  questionId: string;
  isDisabled: boolean;
  disabledBy: string | null;
  reason: string | null;
  disabledAt: Date | null;
}

interface QuestionWithSettings extends Question {
  isTeamSpecific?: boolean;
  isDisabled?: boolean;
  disabledReason?: string | null;
  disabledBy?: string | null;
  disabledAt?: Date | null;
}

function AddTeamQuestionDialog({ teamId, onSuccess }: { teamId: string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const { toast } = useToast();
  
  const createQuestion = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/teams/${teamId}/questions`, {
        text: questionText,
        order: 999 // Will be at the end
      });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Question Added",
        description: "The team-specific question has been added successfully.",
      });
      setQuestionText("");
      setOpen(false);
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add question",
        variant: "destructive",
      });
    },
  });
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-team-question">
          <Plus className="w-4 h-4 mr-2" />
          Add Team Question
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Team-Specific Question</DialogTitle>
          <DialogDescription>
            Create a question that will only appear for this team's check-ins.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="question">Question Text</Label>
            <Textarea
              id="question"
              placeholder="Enter your team-specific question..."
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              data-testid="input-question-text"
            />
          </div>
        </div>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => setOpen(false)}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button 
            onClick={() => createQuestion.mutate()}
            disabled={!questionText || questionText.length < 5 || createQuestion.isPending}
            data-testid="button-save-question"
          >
            {createQuestion.isPending ? "Adding..." : "Add Question"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionSettingCard({ 
  question, 
  teamId, 
  onUpdate 
}: { 
  question: QuestionWithSettings;
  teamId: string;
  onUpdate: () => void;
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [disableReason, setDisableReason] = useState("");
  const { toast } = useToast();
  
  const updateSetting = useMutation({
    mutationFn: async (data: { isDisabled: boolean; reason?: string }) => {
      const response = await apiRequest(
        "PUT", 
        `/api/teams/${teamId}/question-settings/${question.id}`,
        data
      );
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: question.isDisabled ? "Question Enabled" : "Question Disabled",
        description: question.isDisabled 
          ? "This question will now appear in check-ins." 
          : "This question will not appear in team check-ins.",
      });
      setShowReasonDialog(false);
      setDisableReason("");
      onUpdate();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update question setting",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsUpdating(false);
    }
  });
  
  const handleToggle = (checked: boolean) => {
    if (!checked && !question.isTeamSpecific) {
      // Disabling an org question - ask for reason
      setShowReasonDialog(true);
    } else {
      setIsUpdating(true);
      updateSetting.mutate({ isDisabled: !checked });
    }
  };
  
  const confirmDisable = () => {
    setIsUpdating(true);
    updateSetting.mutate({ 
      isDisabled: true, 
      reason: disableReason || undefined 
    });
  };
  
  return (
    <>
      <Card className="hover:shadow-sm transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                {question.isTeamSpecific ? (
                  <Badge variant="secondary">
                    <Users className="w-3 h-3 mr-1" />
                    Team Question
                  </Badge>
                ) : (
                  <Badge variant="outline">
                    <Building className="w-3 h-3 mr-1" />
                    Organization Question
                  </Badge>
                )}
                {question.categoryId && (
                  <Badge variant="outline">{question.categoryId}</Badge>
                )}
              </div>
              <p className="text-sm font-medium mb-1" data-testid={`text-question-${question.id}`}>
                {question.text}
              </p>
              {question.isDisabled && question.disabledReason && (
                <p className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">Disabled reason:</span> {question.disabledReason}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={!question.isDisabled}
                onCheckedChange={handleToggle}
                disabled={isUpdating}
                data-testid={`switch-question-${question.id}`}
              />
              <span className="text-xs text-muted-foreground">
                {question.isDisabled ? "Disabled" : "Enabled"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Dialog open={showReasonDialog} onOpenChange={setShowReasonDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable Organization Question</DialogTitle>
            <DialogDescription>
              Why do you want to disable this question for your team? This helps track customization decisions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (Optional)</Label>
              <Textarea
                id="reason"
                placeholder="e.g., Not relevant to our team's work..."
                value={disableReason}
                onChange={(e) => setDisableReason(e.target.value)}
                data-testid="input-disable-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowReasonDialog(false)}
              data-testid="button-cancel-disable"
            >
              Cancel
            </Button>
            <Button 
              onClick={confirmDisable}
              data-testid="button-confirm-disable"
            >
              Disable Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function TeamQuestionManagementPage() {
  const { teamId } = useParams();
  const { data: currentUser } = useViewAsRole();
  const { toast } = useToast();
  
  // Fetch team details
  const { data: team, isLoading: teamLoading } = useQuery<Team>({
    queryKey: ["/api/teams", teamId],
    enabled: !!teamId,
  });
  
  // Fetch team questions
  const { data: questions, isLoading: questionsLoading, refetch: refetchQuestions } = useQuery<QuestionWithSettings[]>({
    queryKey: ["/api/teams", teamId, "questions"],
    enabled: !!teamId,
  });
  
  // Fetch team question settings
  const { data: settings, refetch: refetchSettings } = useQuery<TeamQuestionSetting[]>({
    queryKey: ["/api/teams", teamId, "question-settings"],
    enabled: !!teamId,
  });
  
  // Combine questions with their settings
  const questionsWithSettings = questions?.map(q => {
    const setting = settings?.find(s => s.questionId === q.id);
    return {
      ...q,
      isTeamSpecific: q.teamId === teamId,
      isDisabled: setting?.isDisabled || false,
      disabledReason: setting?.reason,
      disabledBy: setting?.disabledBy,
      disabledAt: setting?.disabledAt,
    };
  }) || [];
  
  const handleUpdate = () => {
    refetchQuestions();
    refetchSettings();
  };
  
  // Check permissions
  const canManage = currentUser?.role === 'admin' || 
    (currentUser?.role === 'manager' && (currentUser?.teamId === teamId || team?.leaderId === currentUser?.id));
  
  if (teamLoading || questionsLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }
  
  if (!team) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Team Not Found</h2>
          <p className="text-muted-foreground mb-4">The team you're looking for doesn't exist.</p>
          <Link href="/teams">
            <Button variant="outline">
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Teams
            </Button>
          </Link>
        </div>
      </div>
    );
  }
  
  if (!canManage) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-4">You don't have permission to manage questions for this team.</p>
          <Link href="/teams">
            <Button variant="outline">
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Teams
            </Button>
          </Link>
        </div>
      </div>
    );
  }
  
  const orgQuestions = questionsWithSettings.filter(q => !q.isTeamSpecific);
  const teamQuestions = questionsWithSettings.filter(q => q.isTeamSpecific);
  const enabledCount = questionsWithSettings.filter(q => !q.isDisabled).length;
  
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/teams">
              <Button variant="ghost" size="sm">
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </Link>
            <h2 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
              Team Question Management
            </h2>
          </div>
          <p className="text-muted-foreground">
            Customize check-in questions for <span className="font-medium">{team.name}</span>
          </p>
        </div>
        <AddTeamQuestionDialog teamId={teamId!} onSuccess={handleUpdate} />
      </div>
      
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-questions">
              {questionsWithSettings.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Available for check-ins
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Enabled Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-enabled-questions">
              {enabledCount}
            </div>
            <p className="text-xs text-muted-foreground">
              Active in check-ins
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Team-Specific</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-team-questions">
              {teamQuestions.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Custom for this team
            </p>
          </CardContent>
        </Card>
      </div>
      
      <div className="space-y-6">
        {/* Organization Questions */}
        <div>
          <div className="mb-3">
            <h3 className="text-lg font-semibold">Organization Questions</h3>
            <p className="text-sm text-muted-foreground">
              These questions apply to all teams by default. You can disable them for your team if they're not relevant.
            </p>
          </div>
          <div className="space-y-2">
            {orgQuestions.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <HelpCircle className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No organization questions configured yet.</p>
                </CardContent>
              </Card>
            ) : (
              orgQuestions.map((question) => (
                <QuestionSettingCard
                  key={question.id}
                  question={question}
                  teamId={teamId!}
                  onUpdate={handleUpdate}
                />
              ))
            )}
          </div>
        </div>
        
        {/* Team-Specific Questions */}
        <div>
          <div className="mb-3">
            <h3 className="text-lg font-semibold">Team-Specific Questions</h3>
            <p className="text-sm text-muted-foreground">
              These questions only appear for this team's check-ins.
            </p>
          </div>
          <div className="space-y-2">
            {teamQuestions.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground mb-4">No team-specific questions yet.</p>
                  <AddTeamQuestionDialog teamId={teamId!} onSuccess={handleUpdate} />
                </CardContent>
              </Card>
            ) : (
              teamQuestions.map((question) => (
                <QuestionSettingCard
                  key={question.id}
                  question={question}
                  teamId={teamId!}
                  onUpdate={handleUpdate}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}