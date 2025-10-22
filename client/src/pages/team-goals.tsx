import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Trophy,
  Target,
  Plus,
  Calendar,
  Users,
  Sparkles,
  Clock,
  Edit,
  Trash2,
  Gift,
  TrendingUp,
  CalendarIcon,
  ArrowUp,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, differenceInDays, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Validation schema for team goal form
const teamGoalSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(1000, "Description too long").optional(),
  teamId: z.string().optional(),
  targetValue: z.coerce.number().int().min(1, "Target value must be at least 1"),
  goalType: z.enum(["weekly", "monthly", "quarterly", "custom"]),
  metric: z.string().min(1, "Metric is required").max(100, "Metric too long"),
  prize: z.string().max(500, "Prize description too long").optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// Schema for progress update
const progressUpdateSchema = z.object({
  currentValue: z.coerce.number().int().min(0, "Progress value must be at least 0"),
  note: z.string().max(500, "Note too long").optional(),
});

type TeamGoalFormData = z.infer<typeof teamGoalSchema>;

interface TeamGoal {
  id: string;
  organizationId: string;
  teamId?: string;
  title: string;
  description?: string;
  targetValue: number;
  currentValue: number;
  goalType: string;
  metric: string;
  prize?: string;
  startDate: string;
  endDate: string;
  status: string;
  completedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  teamName?: string; // Added to display team name
}

interface Team {
  id: string;
  name: string;
}

export default function TeamGoals() {
  const { data: user } = useCurrentUser();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<TeamGoal | null>(null);
  const [completedGoal, setCompletedGoal] = useState<TeamGoal | null>(null);
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  
  // Add error handling wrapper
  const safeOpenDialog = () => {
    try {
      setCreateDialogOpen(true);
    } catch (error) {
      console.error("Error opening create dialog:", error);
      toast({
        title: "Error",
        description: "Failed to open create dialog. Please refresh and try again.",
        variant: "destructive",
      });
    }
  };

  // Check for team leader role (case-insensitive to handle "Admin", "admin", "ADMIN", etc.)
  // Also check for super admin status
  const isTeamLeader = user?.isSuperAdmin || user?.role?.toLowerCase() === "admin" || user?.role?.toLowerCase() === "manager";
  const isAdmin = user?.isSuperAdmin || user?.role?.toLowerCase() === "admin";
  
  // Debug logging to troubleshoot button visibility
  console.log("Team Goals Debug:", {
    user: user,
    role: user?.role,
    isSuperAdmin: user?.isSuperAdmin,
    isTeamLeader: isTeamLeader,
    isAdmin: isAdmin
  });

  // Fetch team goals
  const { data: goals = [], isLoading } = useQuery<TeamGoal[]>({
    queryKey: ["/api/team-goals"],
    enabled: !!user,
  });

  // Fetch teams for the dropdown
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
    enabled: !!user && isTeamLeader,
  });

  // Create goal mutation
  const createGoalMutation = useMutation({
    mutationFn: async (data: TeamGoalFormData) => {
      try {
        const response = await apiRequest("POST", "/api/team-goals", data);
        return response;
      } catch (error: any) {
        console.error("Error creating team goal:", error);
        throw error;
      }
    },
    onSuccess: (newGoal) => {
      toast({
        title: "Success",
        description: "Team goal created successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-goals"] });
      setCreateDialogOpen(false);
      createForm.reset();
    },
    onError: (error: any) => {
      console.error("Create goal error:", error);
      const errorMessage = error?.message || error?.response?.data?.message || "Failed to create team goal";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Update goal mutation
  const updateGoalMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TeamGoalFormData> }) =>
      apiRequest("PATCH", `/api/team-goals/${id}`, data),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Team goal updated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-goals"] });
      setEditDialogOpen(false);
      editForm.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update team goal",
        variant: "destructive",
      });
    },
  });

  // Update progress mutation
  const updateProgressMutation = useMutation({
    mutationFn: ({ id, progress }: { id: string; progress: number }) =>
      apiRequest("POST", `/api/team-goals/${id}/progress`, { increment: progress }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Progress updated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-goals"] });
      setProgressDialogOpen(false);
      progressForm.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update progress",
        variant: "destructive",
      });
    },
  });

  // Delete goal mutation
  const deleteGoalMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/team-goals/${id}`),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Team goal deleted successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-goals"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete team goal",
        variant: "destructive",
      });
    },
  });

  // Forms
  const createForm = useForm<TeamGoalFormData>({
    resolver: zodResolver(teamGoalSchema),
    defaultValues: {
      title: "",
      description: "",
      targetValue: 10,
      goalType: "weekly",
      metric: "wins",
      prize: "",
    },
  });

  const editForm = useForm<TeamGoalFormData>({
    resolver: zodResolver(teamGoalSchema),
  });

  const progressForm = useForm<z.infer<typeof progressUpdateSchema>>({
    resolver: zodResolver(progressUpdateSchema),
    defaultValues: {
      currentValue: 0,
      note: "",
    },
  });

  // Group goals by status
  const activeGoals = goals.filter((g) => g.status === "active");
  const completedGoals = goals.filter((g) => g.status === "completed");
  const expiredGoals = goals.filter((g) => g.status === "expired");

  // Group goals by team for admin view
  const groupGoalsByTeam = (goalsList: TeamGoal[]) => {
    if (!isAdmin) return { "All Goals": goalsList };
    
    const grouped = goalsList.reduce((acc, goal) => {
      const teamKey = goal.teamName || "Organization-wide";
      if (!acc[teamKey]) acc[teamKey] = [];
      acc[teamKey].push(goal);
      return acc;
    }, {} as Record<string, TeamGoal[]>);
    
    // Sort teams alphabetically, with Organization-wide first
    const sortedTeams = Object.keys(grouped).sort((a, b) => {
      if (a === "Organization-wide") return -1;
      if (b === "Organization-wide") return 1;
      return a.localeCompare(b);
    });
    
    const sortedGrouped: Record<string, TeamGoal[]> = {};
    sortedTeams.forEach(team => {
      sortedGrouped[team] = grouped[team];
    });
    
    return sortedGrouped;
  };

  // Check for newly completed goals
  const checkCompletedGoals = () => {
    const newlyCompleted = activeGoals.filter(
      (g) => g.currentValue >= g.targetValue
    );
    if (newlyCompleted.length > 0) {
      setCompletedGoal(newlyCompleted[0]);
      setCelebrationOpen(true);
    }
  };

  const getProgressPercentage = (goal: TeamGoal) => {
    return Math.min(100, (goal.currentValue / goal.targetValue) * 100);
  };

  const getTimeRemaining = (endDate: string) => {
    const days = differenceInDays(new Date(endDate), new Date());
    if (days < 0) return "Expired";
    if (days === 0) return "Ends today";
    if (days === 1) return "1 day left";
    return `${days} days left`;
  };

  const getMetricIcon = (metric: string) => {
    switch (metric.toLowerCase()) {
      case "wins":
        return <Trophy className="h-4 w-4" />;
      case "check-ins":
      case "checkins":
        return <Calendar className="h-4 w-4" />;
      case "kudos":
      case "shoutouts":
        return <Sparkles className="h-4 w-4" />;
      default:
        return <Target className="h-4 w-4" />;
    }
  };

  const handleEditGoal = (goal: TeamGoal) => {
    setSelectedGoal(goal);
    editForm.reset({
      title: goal.title,
      description: goal.description || "",
      teamId: goal.teamId || "",
      targetValue: goal.targetValue,
      goalType: goal.goalType as "weekly" | "monthly" | "quarterly",
      metric: goal.metric,
      prize: goal.prize || "",
    });
    setEditDialogOpen(true);
  };

  const onCreateSubmit = (data: TeamGoalFormData) => {
    console.log("Submitting team goal data:", data);
    
    let startDate = data.startDate;
    let endDate = data.endDate;
    
    // Calculate dates based on goal type if not custom
    if (data.goalType !== "custom") {
      const now = new Date();
      switch (data.goalType) {
        case "weekly":
          startDate = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
          endDate = endOfWeek(now, { weekStartsOn: 1 }).toISOString();
          break;
        case "monthly":
          startDate = startOfMonth(now).toISOString();
          endDate = endOfMonth(now).toISOString();
          break;
        case "quarterly":
          startDate = startOfQuarter(now).toISOString();
          endDate = endOfQuarter(now).toISOString();
          break;
      }
    }
    
    // Handle "organization" value as no team (organization-wide)
    const submissionData = {
      ...data,
      teamId: data.teamId === "organization" ? undefined : data.teamId,
      startDate,
      endDate
    };
    
    console.log("Processed submission data:", submissionData);
    createGoalMutation.mutate(submissionData);
  };

  const onEditSubmit = (data: TeamGoalFormData) => {
    if (selectedGoal) {
      updateGoalMutation.mutate({ id: selectedGoal.id, data });
    }
  };

  const GoalCard = ({ goal }: { goal: TeamGoal }) => {
    const progress = getProgressPercentage(goal);
    const timeRemaining = getTimeRemaining(goal.endDate);
    const isCompleted = goal.status === "completed";
    const isExpired = goal.status === "expired";

    return (
      <Card
        className={`relative overflow-hidden transition-all hover:shadow-lg ${
          isCompleted ? "border-green-500 bg-green-50 dark:bg-green-950/20" : ""
        } ${isExpired ? "opacity-60" : ""}`}
        data-testid={`card-team-goal-${goal.id}`}
      >
        {isCompleted && (
          <div className="absolute top-2 right-2">
            <Badge className="bg-green-500">
              <Trophy className="mr-1 h-3 w-3" />
              Completed
            </Badge>
          </div>
        )}
        
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg flex items-center gap-2">
                {getMetricIcon(goal.metric)}
                {goal.title}
              </CardTitle>
              <CardDescription className="mt-1">
                {goal.description}
              </CardDescription>
            </div>
            {isTeamLeader && !isCompleted && !isExpired && (
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setSelectedGoal(goal);
                    progressForm.setValue('currentValue', goal.currentValue);
                    setProgressDialogOpen(true);
                  }}
                  title="Update Progress"
                  data-testid={`button-update-progress-${goal.id}`}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                {(isAdmin || goal.createdBy === user?.id) && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleEditGoal(goal)}
                      data-testid={`button-edit-goal-${goal.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteGoalMutation.mutate(goal.id)}
                      data-testid={`button-delete-goal-${goal.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeRemaining}
            </span>
            <Badge variant="outline">{goal.goalType}</Badge>
            {goal.teamName && isAdmin ? (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {goal.teamName}
              </Badge>
            ) : goal.teamId ? (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {goal.teamName || "Team Goal"}
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                Organization Goal
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-semibold">
                {goal.currentValue} / {goal.targetValue} {goal.metric}
              </span>
            </div>

            <Progress value={progress} className="h-3" />

            {goal.prize && (
              <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg">
                <Gift className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Prize: {goal.prize}</span>
              </div>
            )}

            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {format(new Date(goal.startDate), "MMM dd, yyyy")}
              </span>
              <span>
                {format(new Date(goal.endDate), "MMM dd, yyyy")}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-48">
              <CardContent className="flex items-center justify-center h-full">
                <div className="animate-pulse text-muted-foreground">
                  Loading team goals...
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Target className="h-8 w-8 text-primary" />
            Team Goals
          </h1>
          <p className="text-muted-foreground mt-2">
            Compete, collaborate, and win together! Join team contests, track progress, and earn prizes.
          </p>
        </div>

        {isTeamLeader && (
          <Button
            onClick={safeOpenDialog}
            data-testid="button-create-goal"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Goal
          </Button>
        )}
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList data-testid="tabs-goal-status">
          <TabsTrigger value="active">
            Active ({activeGoals.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({completedGoals.length})
          </TabsTrigger>
          <TabsTrigger value="expired">
            Expired ({expiredGoals.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {activeGoals.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Target className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No active goals</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {isTeamLeader
                    ? "Create a new team goal to get started"
                    : "Your team leaders will create goals soon"}
                </p>
              </CardContent>
            </Card>
          ) : isAdmin ? (
            // Admin view: Group goals by team
            <div className="space-y-6">
              {Object.entries(groupGoalsByTeam(activeGoals)).map(([teamName, teamGoals]) => (
                <div key={teamName} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">{teamName}</h3>
                    <Badge variant="outline">{teamGoals.length} goal{teamGoals.length !== 1 ? 's' : ''}</Badge>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {teamGoals.map((goal) => (
                      <GoalCard key={goal.id} goal={goal} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Non-admin view: Simple grid
            <div className="grid gap-4 md:grid-cols-2">
              {activeGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {completedGoals.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No completed goals yet</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Keep working towards your active goals!
                </p>
              </CardContent>
            </Card>
          ) : isAdmin ? (
            // Admin view: Group goals by team
            <div className="space-y-6">
              {Object.entries(groupGoalsByTeam(completedGoals)).map(([teamName, teamGoals]) => (
                <div key={teamName} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-green-500" />
                    <h3 className="text-lg font-semibold">{teamName}</h3>
                    <Badge variant="outline" className="bg-green-50">
                      {teamGoals.length} completed
                    </Badge>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {teamGoals.map((goal) => (
                      <GoalCard key={goal.id} goal={goal} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Non-admin view: Simple grid
            <div className="grid gap-4 md:grid-cols-2">
              {completedGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="expired" className="space-y-4">
          {expiredGoals.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No expired goals</p>
                <p className="text-sm text-muted-foreground mt-2">
                  All goals are either active or completed!
                </p>
              </CardContent>
            </Card>
          ) : isAdmin ? (
            // Admin view: Group goals by team
            <div className="space-y-6">
              {Object.entries(groupGoalsByTeam(expiredGoals)).map(([teamName, teamGoals]) => (
                <div key={teamName} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-gray-500" />
                    <h3 className="text-lg font-semibold">{teamName}</h3>
                    <Badge variant="outline" className="bg-gray-50">
                      {teamGoals.length} expired
                    </Badge>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {teamGoals.map((goal) => (
                      <GoalCard key={goal.id} goal={goal} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Non-admin view: Simple grid
            <div className="grid gap-4 md:grid-cols-2">
              {expiredGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Goal Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create New Team Goal</DialogTitle>
            <DialogDescription>
              Set a new goal for your team or organization to work towards
            </DialogDescription>
          </DialogHeader>

          <Form {...createForm}>
            <form
              onSubmit={createForm.handleSubmit(onCreateSubmit)}
              className="space-y-4"
            >
              <FormField
                control={createForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Q1 Sales Target"
                        {...field}
                        data-testid="input-goal-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the goal and why it's important..."
                        {...field}
                        data-testid="input-goal-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={createForm.control}
                  name="goalType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Goal Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-goal-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="custom">Custom Period</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="teamId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scope</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || "organization"}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-goal-scope">
                            <SelectValue placeholder="Select scope" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="organization">Organization-wide</SelectItem>
                          {teams.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Choose a specific team or make it organization-wide
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={createForm.control}
                  name="metric"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Metric</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., wins, check-ins, kudos"
                          {...field}
                          data-testid="input-goal-metric"
                        />
                      </FormControl>
                      <FormDescription>
                        What are you measuring?
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="targetValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Value</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          {...field}
                          data-testid="input-goal-target"
                        />
                      </FormControl>
                      <FormDescription>
                        The number to reach
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Date Selection for Custom Period */}
              {createForm.watch("goalType") === "custom" && (
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={createForm.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Start Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(new Date(field.value), "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={field.value ? new Date(field.value) : undefined}
                              onSelect={(date) => field.onChange(date?.toISOString())}
                              disabled={(date) => date < new Date()}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          When the goal period starts
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>End Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(new Date(field.value), "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={field.value ? new Date(field.value) : undefined}
                              onSelect={(date) => field.onChange(date?.toISOString())}
                              disabled={(date) => {
                                const startDateValue = createForm.getValues("startDate");
                                return date < new Date() || (startDateValue ? date < new Date(startDateValue) : false);
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          When the goal period ends
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <FormField
                control={createForm.control}
                name="prize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prize (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g., Team lunch at fancy restaurant, Extra day off"
                        {...field}
                        data-testid="input-goal-prize"
                      />
                    </FormControl>
                    <FormDescription>
                      What will the team earn for achieving this goal?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createGoalMutation.isPending}
                  data-testid="button-submit-goal"
                >
                  {createGoalMutation.isPending
                    ? "Creating..."
                    : "Create Goal"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Goal Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Team Goal</DialogTitle>
            <DialogDescription>
              Update the goal details
            </DialogDescription>
          </DialogHeader>

          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit(onEditSubmit)}
              className="space-y-4"
            >
              <FormField
                control={editForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="targetValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Value</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="prize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prize</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateGoalMutation.isPending}
                >
                  {updateGoalMutation.isPending ? "Updating..." : "Update Goal"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Progress Update Dialog */}
      <Dialog open={progressDialogOpen} onOpenChange={setProgressDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Goal Progress</DialogTitle>
            <DialogDescription>
              Update the current progress for "{selectedGoal?.title}"
            </DialogDescription>
          </DialogHeader>

          {selectedGoal && (
            <div className="mb-4 p-3 bg-muted rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current Progress</span>
                <span className="font-semibold">
                  {selectedGoal.currentValue} / {selectedGoal.targetValue} {selectedGoal.metric}
                </span>
              </div>
              <Progress value={getProgressPercentage(selectedGoal)} className="h-2 mt-2" />
            </div>
          )}

          <Form {...progressForm}>
            <form
              onSubmit={progressForm.handleSubmit((data) => {
                if (selectedGoal) {
                  const newValue = data.currentValue - selectedGoal.currentValue;
                  updateProgressMutation.mutate({ 
                    id: selectedGoal.id, 
                    progress: newValue 
                  });
                }
              })}
              className="space-y-4"
            >
              <FormField
                control={progressForm.control}
                name="currentValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Progress Value</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max={selectedGoal?.targetValue}
                        {...field}
                        placeholder={`Enter value (0-${selectedGoal?.targetValue})`}
                        data-testid="input-progress-value"
                      />
                    </FormControl>
                    <FormDescription>
                      Enter the new total progress value
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={progressForm.control}
                name="note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Note (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add a note about this update..."
                        {...field}
                        data-testid="input-progress-note"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setProgressDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateProgressMutation.isPending}
                  data-testid="button-submit-progress"
                >
                  {updateProgressMutation.isPending ? "Updating..." : "Update Progress"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Celebration Modal */}
      <Dialog open={celebrationOpen} onOpenChange={setCelebrationOpen}>
        <DialogContent className="sm:max-w-md text-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <Trophy className="h-20 w-20 text-yellow-500 animate-bounce" />
              <Sparkles className="h-8 w-8 text-yellow-400 absolute -top-2 -right-2 animate-pulse" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-2xl">
                Goal Achieved! 🎉
              </DialogTitle>
              {completedGoal && (
                <DialogDescription className="text-lg">
                  <strong>{completedGoal.title}</strong> has been completed!
                  {completedGoal.prize && (
                    <div className="mt-4 p-3 bg-primary/10 rounded-lg">
                      <Gift className="h-5 w-5 mx-auto mb-2" />
                      <p className="font-medium">Prize Unlocked:</p>
                      <p>{completedGoal.prize}</p>
                    </div>
                  )}
                </DialogDescription>
              )}
            </DialogHeader>
            <Button
              onClick={() => setCelebrationOpen(false)}
              className="mt-4"
            >
              Awesome!
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}