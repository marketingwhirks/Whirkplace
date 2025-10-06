import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDistanceToNow, format } from "date-fns";
import { Plus, Edit, Trash2, Users, Lock, Unlock, Trophy, Star, MessageCircle, Check, InfoIcon, Flame, Medal, TrendingUp, Award } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { TourGuide } from "@/components/TourGuide";
import { TOUR_IDS } from "@/lib/tours/tour-configs";
import { useManagedTour } from "@/contexts/TourProvider";

import type { Win, User, InsertWin, CompanyValue } from "@shared/schema";
import { insertWinSchema, DefaultCompanyValues, defaultCompanyValuesArray } from "@shared/schema";

// Form schemas - extend shared schema for UI-specific validation
const winFormSchema = insertWinSchema.extend({
  title: z.string().min(1, "Title is required").max(100, "Title too long"),
  description: z.string().min(1, "Description is required").max(500, "Description too long"),
  userId: z.string().min(1, "User is required"),
  nominatedBy: z.string().optional(),
  values: z.array(z.string()).min(1, "At least one company value must be selected"),
});

type WinForm = z.infer<typeof winFormSchema>;

export default function Wins() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingWin, setEditingWin] = useState<Win | null>(null);
  const [filter, setFilter] = useState<"all" | "public" | "private">("all");
  const [deleteWin, setDeleteWin] = useState<Win | null>(null);
  
  // Tour management
  const tourManager = useManagedTour(TOUR_IDS.WINS_INTRO);

  // Fetch wins
  const { data: wins = [], isLoading: winsLoading } = useQuery<Win[]>({
    queryKey: ["/api/wins"],
  });

  // Fetch users for display names
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Fetch current user for defaults
  const { data: currentUser } = useCurrentUser();
  
  // Fetch team leaderboard
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<"all" | "week" | "month">("all");
  const { data: leaderboard = [] } = useQuery<Array<{
    teamId: string;
    teamName: string;
    totalWins: number;
    points: number;
    currentStreak: number;
    longestStreak: number;
    rank: number;
  }>>({
    queryKey: [`/api/wins/leaderboard?period=${leaderboardPeriod}`],
  });

  // Fetch current user's team stats
  const { data: teamStats } = useQuery<{
    totalWins: number;
    points: number;
    currentStreak: number;
    longestStreak: number;
    badges: Array<{
      id: string;
      name: string;
      description: string;
      earnedDate: Date;
      icon: string;
    }>;
    weeklyWins: Array<{
      week: Date;
      count: number;
    }>;
    recentWins: Win[];
  }>({
    queryKey: [`/api/wins/team-stats/${currentUser?.teamId}`],
    enabled: !!currentUser?.teamId,
  });

  // Create win form
  const createForm = useForm<WinForm>({
    resolver: zodResolver(winFormSchema),
    defaultValues: {
      title: "",
      description: "",
      isPublic: false,
      userId: "",
      nominatedBy: "",
      values: [],
      organizationId: "",
    },
  });

  // Update form defaults when current user loads  
  useEffect(() => {
    if (currentUser) {
      createForm.setValue('organizationId', currentUser.organizationId, { shouldDirty: false });
      createForm.setValue('nominatedBy', currentUser.id, { shouldDirty: false });
    }
  }, [currentUser, createForm]);

  // Edit win form  
  const editFormSchema = z.object({
    title: z.string().min(1, "Title is required").max(100, "Title too long"),
    description: z.string().min(1, "Description is required").max(500, "Description too long"),
    isPublic: z.boolean().default(false),
    nominatedBy: z.string().optional().nullable(),
    values: z.array(z.string()).min(1, "At least one company value must be selected"),
  });
  
  const editForm = useForm<z.infer<typeof editFormSchema>>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      title: "",
      description: "",
      isPublic: false,
      nominatedBy: "",
      values: [],
    },
  });

  // Create win mutation
  const createWinMutation = useMutation({
    mutationFn: async (data: WinForm) => {
      return apiRequest("POST", "/api/wins", {
        ...data,
        nominatedBy: data.nominatedBy === "none" ? null : data.nominatedBy || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wins"] });
      createForm.reset({
        title: "",
        description: "",
        isPublic: false,
        userId: "",
        nominatedBy: currentUser?.id || "",
        values: [],
        organizationId: currentUser?.organizationId || "",
      });
      setShowCreateDialog(false);
      toast({
        title: "Success",
        description: "Win created successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create win",
        variant: "destructive",
      });
    },
  });

  // Update win mutation
  const updateWinMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<WinForm> }) => {
      return apiRequest("PATCH", `/api/wins/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wins"] });
      setEditingWin(null);
      editForm.reset();
      toast({
        title: "Success",
        description: "Win updated successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update win",
        variant: "destructive",
      });
    },
  });

  // Delete win mutation
  const deleteWinMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/wins/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wins"] });
      toast({
        title: "Success",
        description: "Win deleted successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete win",
        variant: "destructive",
      });
    },
  });

  // Get user name by ID
  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user?.name || "Unknown User";
  };

  // Filter wins based on current filter
  const filteredWins = wins.filter(win => {
    if (filter === "public") return win.isPublic;
    if (filter === "private") return !win.isPublic;
    return true;
  });

  // Handle create form submission
  const handleCreateSubmit = (data: WinForm) => {
    createWinMutation.mutate(data);
  };

  // Handle edit form submission
  const handleEditSubmit = (data: z.infer<typeof editFormSchema>) => {
    if (editingWin) {
      updateWinMutation.mutate({ 
        id: editingWin.id, 
        data: {
          ...data,
          nominatedBy: data.nominatedBy || undefined, // Normalize empty string to undefined
        }
      });
    }
  };

  // Handle edit win
  const handleEditWin = (win: Win) => {
    setEditingWin(win);
    editForm.reset({
      title: win.title,
      description: win.description,
      isPublic: win.isPublic,
      nominatedBy: win.nominatedBy || "",
      values: (win.values || []) as CompanyValue[],
    });
  };

  // Handle delete win
  const handleDeleteWin = (win: Win) => {
    setDeleteWin(win);
  };

  const confirmDeleteWin = () => {
    if (deleteWin) {
      deleteWinMutation.mutate(deleteWin.id);
      setDeleteWin(null);
    }
  };

  return (
    <main className="flex-1 overflow-auto p-4 md:p-6">
      {/* Tour Guide for wins */}
      {tourManager.shouldShow && (
        <TourGuide
          tourId={TOUR_IDS.WINS_INTRO}
          onComplete={tourManager.handleComplete}
          onSkip={tourManager.handleSkip}
          autoStart={true}
          delay={1000}
        />
      )}
      
      <div className="space-y-6" data-testid="wins-container">
          {/* Explanatory Text */}
          <Alert>
            <InfoIcon className="h-4 w-4" />
            <AlertDescription>
              Wins are personal or professional achievements worth celebrating. Share your successes, milestones, and accomplishments with your team to foster a culture of recognition and positivity.
            </AlertDescription>
          </Alert>

          {/* Team Leaderboard Section */}
          <Card className="border-primary/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  <CardTitle>Team Leaderboard</CardTitle>
                </div>
                <Tabs value={leaderboardPeriod} onValueChange={(value) => setLeaderboardPeriod(value as any)} className="w-auto">
                  <TabsList className="grid grid-cols-3">
                    <TabsTrigger value="all" data-testid="leaderboard-filter-all">All Time</TabsTrigger>
                    <TabsTrigger value="month" data-testid="leaderboard-filter-month">This Month</TabsTrigger>
                    <TabsTrigger value="week" data-testid="leaderboard-filter-week">This Week</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              {leaderboard.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  No team wins recorded yet
                </div>
              ) : (
                <div className="space-y-3">
                  {leaderboard.slice(0, 5).map((team) => (
                    <div
                      key={team.teamId}
                      className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                        currentUser?.teamId === team.teamId ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50'
                      }`}
                      data-testid={`leaderboard-team-${team.teamId}`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center justify-center w-8 h-8">
                          {team.rank === 1 && <span className="text-2xl">🥇</span>}
                          {team.rank === 2 && <span className="text-2xl">🥈</span>}
                          {team.rank === 3 && <span className="text-2xl">🥉</span>}
                          {team.rank > 3 && (
                            <span className="text-lg font-semibold text-muted-foreground">#{team.rank}</span>
                          )}
                        </div>
                        <div>
                          <div className="font-semibold flex items-center space-x-2">
                            <span>{team.teamName}</span>
                            {team.currentStreak > 3 && (
                              <div className="flex items-center space-x-1" title={`${team.currentStreak} week streak!`}>
                                <Flame className="h-4 w-4 text-orange-500" />
                                <span className="text-xs text-orange-500 font-bold">{team.currentStreak}</span>
                              </div>
                            )}
                            {currentUser?.teamId === team.teamId && (
                              <Badge variant="secondary" className="text-xs">Your Team</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {team.totalWins} wins · {team.points} points
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {team.currentStreak > 0 && team.currentStreak <= 3 && (
                          <div className="text-sm text-muted-foreground">
                            {team.currentStreak} week streak
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Team Stats Card for Current User's Team */}
          {teamStats && currentUser?.teamId && (
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <CardTitle>Your Team Stats</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Stats Overview */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-background rounded-lg">
                    <div className="text-2xl font-bold text-primary">{teamStats.totalWins}</div>
                    <div className="text-xs text-muted-foreground">Total Wins</div>
                  </div>
                  <div className="text-center p-3 bg-background rounded-lg">
                    <div className="text-2xl font-bold text-primary">{teamStats.points}</div>
                    <div className="text-xs text-muted-foreground">Points</div>
                  </div>
                  <div className="text-center p-3 bg-background rounded-lg">
                    <div className="text-2xl font-bold text-primary flex items-center justify-center">
                      {teamStats.currentStreak}
                      {teamStats.currentStreak > 3 && <Flame className="h-5 w-5 ml-1 text-orange-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground">Current Streak</div>
                  </div>
                  <div className="text-center p-3 bg-background rounded-lg">
                    <div className="text-2xl font-bold text-primary">{teamStats.longestStreak}</div>
                    <div className="text-xs text-muted-foreground">Best Streak</div>
                  </div>
                </div>

                {/* Badges Section */}
                {teamStats.badges.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center">
                      <Award className="h-4 w-4 mr-1" />
                      Achievements Earned
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {teamStats.badges.map((badge) => (
                        <div
                          key={badge.id}
                          className="flex items-center space-x-2 p-2 bg-background rounded-lg"
                          title={badge.description}
                          data-testid={`badge-${badge.id}`}
                        >
                          <span className="text-xl">{badge.icon}</span>
                          <div className="flex-1">
                            <div className="text-sm font-medium">{badge.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {badge.earnedDate && format(new Date(badge.earnedDate), 'MMM d')}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Streak Message */}
                {teamStats.currentStreak > 3 && (
                  <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
                    <Flame className="h-4 w-4 text-orange-500" />
                    <AlertDescription className="text-orange-700 dark:text-orange-400">
                      Your team is on a {teamStats.currentStreak}-week win streak! Keep the momentum going! 🔥
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {/* Actions Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <Tabs value={filter} onValueChange={(value) => setFilter(value as any)} className="w-full sm:w-auto">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all" data-testid="filter-all">All Wins</TabsTrigger>
                <TabsTrigger value="public" data-testid="filter-public">Public</TabsTrigger>
                <TabsTrigger value="private" data-testid="filter-private">Private</TabsTrigger>
              </TabsList>
            </Tabs>

            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button data-testid="button-new-win" className="w-full sm:w-auto">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Win
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Win</DialogTitle>
                  <DialogDescription>
                    Celebrate a team achievement or personal success
                  </DialogDescription>
                </DialogHeader>
                <Form {...createForm}>
                  <form onSubmit={createForm.handleSubmit(handleCreateSubmit)} className="space-y-4 pb-4">
                    <FormField
                      control={createForm.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Enter win title..."
                              data-testid="input-win-title"
                              {...field} 
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
                              placeholder="Describe the achievement..."
                              rows={3}
                              data-testid="textarea-win-description"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="userId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Team Member</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-win-user">
                                <SelectValue placeholder="Select team member..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
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
                      control={createForm.control}
                      name="nominatedBy"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nominated By (Optional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || currentUser?.id || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-win-nominator">
                                <SelectValue placeholder="Select nominator..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {users.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.name} {user.id === currentUser?.id ? "(You)" : ""}
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
                      name="values"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Values</FormLabel>
                          <div className="text-[0.8rem] text-muted-foreground mb-3">
                            Select the company values this win demonstrates
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            {defaultCompanyValuesArray.map((value) => (
                              <div key={value} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`value-${value}`}
                                  checked={field.value.includes(value)}
                                  onCheckedChange={(checked) => {
                                    const updatedValues = checked
                                      ? [...field.value, value]
                                      : field.value.filter((v) => v !== value);
                                    field.onChange(updatedValues);
                                  }}
                                  data-testid={`checkbox-value-${value.replace(/\s+/g, '-')}`}
                                />
                                <label
                                  htmlFor={`value-${value}`}
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 capitalize cursor-pointer"
                                >
                                  {value}
                                </label>
                              </div>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="isPublic"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <FormLabel>Public Win</FormLabel>
                            <div className="text-[0.8rem] text-muted-foreground">
                              Share this win with the entire team
                            </div>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-win-public"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowCreateDialog(false)}
                        data-testid="button-cancel-create"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={createWinMutation.isPending}
                        data-testid="button-submit-create"
                      >
                        Create Win
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Wins List */}
          {winsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="animate-pulse space-y-3">
                      <div className="h-4 bg-muted rounded w-3/4"></div>
                      <div className="h-3 bg-muted rounded w-1/2"></div>
                      <div className="h-16 bg-muted rounded"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredWins.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Trophy className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No wins yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start celebrating your team's achievements!
                </p>
                <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-win">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Win
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredWins.map((win) => (
                <Card key={win.id} className="relative">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <Avatar className="w-10 h-10">
                          <AvatarFallback>
                            {getUserName(win.userId).split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <h3 className="font-semibold text-lg" data-testid={`win-title-${win.id}`}>
                              {win.title}
                            </h3>
                            <Badge variant={win.isPublic ? "default" : "secondary"} className="ml-2">
                              {win.isPublic ? (
                                <>
                                  <Users className="w-3 h-3 mr-1" />
                                  Public
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3 h-3 mr-1" />
                                  Private
                                </>
                              )}
                            </Badge>
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                            <span>By {getUserName(win.userId)}</span>
                            {win.nominatedBy && (
                              <span>Nominated by {getUserName(win.nominatedBy)}</span>
                            )}
                            <span>{win.createdAt ? formatDistanceToNow(new Date(win.createdAt), { addSuffix: true }) : "Just now"}</span>
                          </div>
                        </div>
                      </div>
                      {/* Admin-only edit and delete buttons */}
                      {(currentUser?.role === "admin" || currentUser?.isSuperAdmin) && (
                        <div className="flex items-center space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditWin(win)}
                            data-testid={`button-edit-win-${win.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteWin(win)}
                            data-testid={`button-delete-win-${win.id}`}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-foreground mb-4" data-testid={`win-description-${win.id}`}>
                      {win.description}
                    </p>
                    {win.values && win.values.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {win.values.map((value) => (
                          <Badge key={value} variant="secondary" className="text-xs" data-testid={`badge-value-${value.replace(/\s+/g, '-')}-${win.id}`}>
                            <Star className="w-3 h-3 mr-1" />
                            {value}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {win.slackMessageId && (
                      <Badge variant="outline" className="mb-2">
                        <MessageCircle className="w-3 h-3 mr-1" />
                        Shared on Slack
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Edit Win Dialog */}
          <Dialog open={!!editingWin} onOpenChange={(open) => !open && setEditingWin(null)}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Edit Win</DialogTitle>
                <DialogDescription>
                  Update the win details
                </DialogDescription>
              </DialogHeader>
              <Form {...editForm}>
                <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
                  <FormField
                    control={editForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter win title..."
                            data-testid="input-edit-win-title"
                            {...field} 
                          />
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
                          <Textarea
                            placeholder="Describe the achievement..."
                            rows={3}
                            data-testid="textarea-edit-win-description"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="nominatedBy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nominated By (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-win-nominator">
                              <SelectValue placeholder="Select nominator..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
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
                    name="values"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Values</FormLabel>
                        <div className="text-[0.8rem] text-muted-foreground mb-3">
                          Select the company values this win demonstrates
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          {defaultCompanyValuesArray.map((value) => (
                            <div key={value} className="flex items-center space-x-2">
                              <Checkbox
                                id={`edit-value-${value}`}
                                checked={field.value.includes(value)}
                                onCheckedChange={(checked) => {
                                  const updatedValues = checked
                                    ? [...field.value, value]
                                    : field.value.filter((v) => v !== value);
                                  field.onChange(updatedValues);
                                }}
                                data-testid={`checkbox-edit-value-${value.replace(/\s+/g, '-')}`}
                              />
                              <label
                                htmlFor={`edit-value-${value}`}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 capitalize cursor-pointer"
                              >
                                {value}
                              </label>
                            </div>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="isPublic"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Public Win</FormLabel>
                          <div className="text-[0.8rem] text-muted-foreground">
                            Share this win with the entire team
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-edit-win-public"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditingWin(null)}
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={updateWinMutation.isPending}
                      data-testid="button-submit-edit"
                    >
                      Update Win
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation Dialog */}
          <AlertDialog open={!!deleteWin} onOpenChange={(open) => !open && setDeleteWin(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Win</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{deleteWin?.title}"? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmDeleteWin}
                  disabled={deleteWinMutation.isPending}
                  data-testid="button-confirm-delete"
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete Win
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </main>
  );
}
