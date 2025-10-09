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
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, differenceInDays } from "date-fns";

// Validation schema for team goal form
const teamGoalSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(1000, "Description too long").optional(),
  teamId: z.string().optional(),
  targetValue: z.coerce.number().int().min(1, "Target value must be at least 1"),
  goalType: z.enum(["weekly", "monthly", "quarterly"]),
  metric: z.string().min(1, "Metric is required").max(100, "Metric too long"),
  prize: z.string().max(500, "Prize description too long").optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
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
}

interface Team {
  id: string;
  name: string;
}

export default function TeamGoals() {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<TeamGoal | null>(null);
  const [completedGoal, setCompletedGoal] = useState<TeamGoal | null>(null);

  // Debug log to see actual role value
  console.log("Team Goals - User role:", user?.role, "User:", user);
  const isTeamLeader = user?.role === "admin" || user?.role === "manager";

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
    mutationFn: (data: TeamGoalFormData) =>
      apiRequest("/api/team-goals", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (newGoal) => {
      toast({
        title: "Success",
        description: "Team goal created successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-goals"] });
      setCreateDialogOpen(false);
      createForm.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create team goal",
        variant: "destructive",
      });
    },
  });

  // Update goal mutation
  const updateGoalMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TeamGoalFormData> }) =>
      apiRequest(`/api/team-goals/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
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

  // Delete goal mutation
  const deleteGoalMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/team-goals/${id}`, {
        method: "DELETE",
      }),
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

  // Group goals by status
  const activeGoals = goals.filter((g) => g.status === "active");
  const completedGoals = goals.filter((g) => g.status === "completed");
  const expiredGoals = goals.filter((g) => g.status === "expired");

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
    createGoalMutation.mutate(data);
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
            {isTeamLeader && goal.createdBy === user?.id && !isCompleted && !isExpired && (
              <div className="flex gap-1">
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
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeRemaining}
            </span>
            <Badge variant="outline">{goal.goalType}</Badge>
            {goal.teamId ? (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                Team Goal
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
            onClick={() => setCreateDialogOpen(true)}
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
          ) : (
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
          ) : (
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
          ) : (
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
                        value={field.value || ""}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-goal-scope">
                            <SelectValue placeholder="Select scope" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">Organization-wide</SelectItem>
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