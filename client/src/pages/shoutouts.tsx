import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDistanceToNow } from "date-fns";
import { Plus, Edit, Trash2, Users, Lock, Unlock, Sparkles, Star, MessageCircle, Send, Gift, Check, ChevronsUpDown, X, InfoIcon, User2, UsersIcon, Heart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";

import type { Shoutout, User, InsertShoutout, Team } from "@shared/schema";
import { insertShoutoutSchema, defaultCompanyValuesArray } from "@shared/schema";

// Form schema for shoutout creation - fromUserId is set server-side  
const shoutoutFormSchema = insertShoutoutSchema.omit({
  toUserId: true,
  toTeamId: true,
}).extend({
  recipientType: z.enum(["individual", "team"]).default("individual"),
  message: z.string().min(1, "Message is required").max(500, "Message too long"),
  toUserIds: z.array(z.string()).optional(),
  toTeamId: z.string().optional(),
  values: z.array(z.string()).min(1, "At least one company value must be selected"),
}).refine((data) => {
  if (data.recipientType === "individual") {
    return data.toUserIds && data.toUserIds.length > 0;
  } else {
    return !!data.toTeamId;
  }
}, {
  message: data => data.recipientType === "individual" 
    ? "Please select at least one recipient" 
    : "Please select a team",
  path: ["recipientType"]
});

type ShoutoutForm = z.infer<typeof shoutoutFormSchema>;

export default function ShoutoutsPage() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingShoutout, setEditingShoutout] = useState<Shoutout | null>(null);
  const [filter, setFilter] = useState<"all" | "received" | "given" | "public">("all");
  const [deleteShoutout, setDeleteShoutout] = useState<Shoutout | null>(null);
  const [recipientSelectorOpen, setRecipientSelectorOpen] = useState(false);
  const [teamSelectorOpen, setTeamSelectorOpen] = useState(false);

  // Fetch shoutouts with proper filter parameters
  const { data: shoutouts = [], isLoading: shoutoutsLoading } = useQuery<Shoutout[]>({
    queryKey: ["/api/shoutouts", {
      ...(filter === "public" && { public: "true" }),
      ...(filter === "received" && { userId: "current-user-id", type: "received" }),
      ...(filter === "given" && { userId: "current-user-id", type: "given" }),
    }],
  });

  // Fetch users for recipient selection and display names
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Fetch teams for team shoutouts
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  // Fetch current user for defaults
  const { data: currentUser } = useCurrentUser();

  // Create shoutout form
  const createForm = useForm<ShoutoutForm>({
    resolver: zodResolver(shoutoutFormSchema),
    defaultValues: {
      recipientType: "individual",
      message: "",
      toUserIds: [],
      toTeamId: undefined,
      isPublic: false,
      values: [],
      organizationId: "",
    },
  });

  // Update form defaults when current user loads  
  useEffect(() => {
    if (currentUser) {
      createForm.setValue('organizationId', currentUser.organizationId, { shouldDirty: false });
    }
  }, [currentUser, createForm]);

  // Edit shoutout form
  const editFormSchema = z.object({
    message: z.string().min(1, "Message is required").max(500, "Message too long"),
    isPublic: z.boolean().default(false),
    values: z.array(z.string()).min(1, "At least one company value must be selected"),
  });

  const editForm = useForm<z.infer<typeof editFormSchema>>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      message: "",
      isPublic: false,
      values: [],
    },
  });

  // Create shoutout mutation
  const createShoutoutMutation = useMutation({
    mutationFn: async (data: ShoutoutForm) => {
      // Prepare data based on recipient type
      const payload: any = {
        message: data.message,
        isPublic: data.isPublic,
        values: data.values,
        organizationId: data.organizationId,
      };
      
      if (data.recipientType === "individual") {
        payload.toUserIds = data.toUserIds;
      } else {
        payload.toTeamId = data.toTeamId;
      }
      
      return apiRequest("POST", "/api/shoutouts", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shoutouts"] });
      createForm.reset({
        recipientType: "individual",
        message: "",
        toUserIds: [],
        toTeamId: undefined,
        isPublic: false,
        values: [],
        organizationId: currentUser?.organizationId || ""
      });
      setShowCreateDialog(false);
      toast({
        title: "Success",
        description: "Shoutout sent successfully! 🎉",
      });
    },
    onError: (error) => {
      console.error("Shoutout creation error:", error);
      toast({
        title: "Error",
        description: "Failed to send shoutout",
        variant: "destructive",
      });
    },
  });

  // Update shoutout mutation
  const updateShoutoutMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ShoutoutForm> }) => {
      return apiRequest("PATCH", `/api/shoutouts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shoutouts"] });
      setEditingShoutout(null);
      editForm.reset();
      toast({
        title: "Success",
        description: "Shoutout updated successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update shoutout",
        variant: "destructive",
      });
    },
  });

  // Delete shoutout mutation
  const deleteShoutoutMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/shoutouts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shoutouts"] });
      toast({
        title: "Success",
        description: "Shoutout deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete shoutout",
        variant: "destructive",
      });
    },
  });

  // Get user name by ID
  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user?.name || "Unknown User";
  };

  // Get team name by ID
  const getTeamName = (teamId: string) => {
    const team = teams.find(t => t.id === teamId);
    return team?.name || "Unknown Team";
  };

  // Get user initials for avatar
  const getUserInitials = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user?.name) return "?";
    return user.name
      .split(" ")
      .map(name => name.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Handle create form submission
  const onCreateSubmit = createForm.handleSubmit((data) => {
    // fromUserId is now set server-side for security
    createShoutoutMutation.mutate(data);
  });

  // Handle edit form submission
  const onEditSubmit = editForm.handleSubmit((data) => {
    if (!editingShoutout) return;
    updateShoutoutMutation.mutate({
      id: editingShoutout.id,
      data,
    });
  });

  // Open edit dialog
  const openEditDialog = (shoutoutItem: Shoutout) => {
    setEditingShoutout(shoutoutItem);
    editForm.reset({
      message: shoutoutItem.message,
      isPublic: shoutoutItem.isPublic,
      values: shoutoutItem.values,
    });
  };

  // No client-side filtering needed - server handles all filtering based on API parameters

  return (
    <div className="flex-1 container mx-auto px-4 py-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">Shout Outs</h1>
              <p className="text-muted-foreground">
                Celebrate and recognize your teammates' great work
              </p>
            </div>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button data-testid="button-give-kudos">
                  <Gift className="mr-2 h-4 w-4" />
                  Give Shout Out
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Give Shout Out</DialogTitle>
                  <DialogDescription>
                    Recognize someone for their amazing work and the company values they demonstrate.
                  </DialogDescription>
                </DialogHeader>

                <Form {...createForm}>
                  <form onSubmit={onCreateSubmit} className="space-y-4">
                    {/* Recipient Type Selection */}
                    <FormField
                      control={createForm.control}
                      name="recipientType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Recognize</FormLabel>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              value={field.value}
                              className="flex flex-row space-x-4"
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="individual" id="individual" />
                                <label htmlFor="individual" className="flex items-center cursor-pointer">
                                  <User2 className="mr-1 h-4 w-4" />
                                  Individual
                                </label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="team" id="team" />
                                <label htmlFor="team" className="flex items-center cursor-pointer">
                                  <UsersIcon className="mr-1 h-4 w-4" />
                                  Team
                                </label>
                              </div>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Individual Recipients Selection */}
                    {createForm.watch("recipientType") === "individual" && (
                    <FormField
                      control={createForm.control}
                      name="toUserIds"
                      render={({ field }) => {
                        const selectedUsers = (field.value || [])
                          .map(id => users.find(u => u.id === id))
                          .filter((user): user is User => user !== undefined);
                        
                        return (
                          <FormItem>
                            <FormLabel>Recipients *</FormLabel>
                            <FormDescription className="text-sm text-muted-foreground">
                              Select one or more people to recognize
                            </FormDescription>
                            
                            {/* Selected recipients display */}
                            {selectedUsers.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-2">
                                {selectedUsers.map((user) => (
                                  <Badge 
                                    key={user.id} 
                                    variant="secondary" 
                                    className="text-xs"
                                    data-testid={`badge-selected-${user.id}`}
                                  >
                                    <Avatar className="h-4 w-4 mr-1">
                                      <AvatarFallback className="text-xs">
                                        {getUserInitials(user.id)}
                                      </AvatarFallback>
                                    </Avatar>
                                    {user.name}
                                    <span
                                      className="ml-1 hover:bg-destructive/20 rounded-full cursor-pointer"
                                      onClick={() => {
                                        field.onChange(field.value?.filter(id => id !== user.id) || []);
                                      }}
                                      data-testid={`button-remove-${user.id}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </span>
                                  </Badge>
                                ))}
                              </div>
                            )}
                            
                            <FormControl>
                              <Popover open={recipientSelectorOpen} onOpenChange={setRecipientSelectorOpen}>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={recipientSelectorOpen}
                                    aria-label="Select recipients"
                                    aria-controls="recipients-popover"
                                    className="w-full justify-between"
                                    data-testid="button-select-recipients"
                                  >
                                    {selectedUsers.length === 0 
                                      ? "Choose recipients..." 
                                      : `${selectedUsers.length} recipient${selectedUsers.length === 1 ? '' : 's'} selected`
                                    }
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-full p-0" id="recipients-popover">
                                  <Command>
                                    <CommandInput placeholder="Search people..." />
                                    <CommandEmpty>No users found.</CommandEmpty>
                                    <CommandGroup>
                                      {users.map((user) => {
                                        const isSelected = field.value?.includes(user.id) || false;
                                        return (
                                          <CommandItem
                                            key={user.id}
                                            value={user.name}
                                            onSelect={() => {
                                              const currentIds = field.value || [];
                                              if (isSelected) {
                                                field.onChange(currentIds.filter(id => id !== user.id));
                                              } else {
                                                field.onChange([...currentIds, user.id]);
                                              }
                                            }}
                                            data-testid={`option-recipient-${user.id}`}
                                          >
                                            <div className="flex items-center gap-2 flex-1">
                                              <Avatar className="h-6 w-6">
                                                <AvatarFallback className="text-xs">
                                                  {getUserInitials(user.id)}
                                                </AvatarFallback>
                                              </Avatar>
                                              {user.name}
                                            </div>
                                            <Check
                                              className={`ml-auto h-4 w-4 ${
                                                isSelected ? "opacity-100" : "opacity-0"
                                              }`}
                                            />
                                          </CommandItem>
                                        );
                                      })}
                                    </CommandGroup>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                    )}

                    {/* Team Selection */}
                    {createForm.watch("recipientType") === "team" && (
                    <FormField
                      control={createForm.control}
                      name="toTeamId"
                      render={({ field }) => {
                        const selectedTeam = teams.find(t => t.id === field.value);
                        
                        return (
                          <FormItem>
                            <FormLabel>Team *</FormLabel>
                            <FormDescription className="text-sm text-muted-foreground">
                              Select a team to recognize
                            </FormDescription>
                            
                            <FormControl>
                              <Popover open={teamSelectorOpen} onOpenChange={setTeamSelectorOpen}>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={teamSelectorOpen}
                                    aria-label="Select team"
                                    aria-controls="team-popover"
                                    className="w-full justify-between"
                                    data-testid="button-select-team"
                                  >
                                    {selectedTeam ? selectedTeam.name : "Choose team..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-full p-0" id="team-popover">
                                  <Command>
                                    <CommandInput placeholder="Search teams..." />
                                    <CommandEmpty>No teams found.</CommandEmpty>
                                    <CommandGroup>
                                      {teams.map((team) => (
                                        <CommandItem
                                          key={team.id}
                                          value={team.name}
                                          onSelect={() => {
                                            field.onChange(team.id);
                                            setTeamSelectorOpen(false);
                                          }}
                                          data-testid={`option-team-${team.id}`}
                                        >
                                          <UsersIcon className="mr-2 h-4 w-4" />
                                          {team.name}
                                          <Check
                                            className={`ml-auto h-4 w-4 ${
                                              field.value === team.id ? "opacity-100" : "opacity-0"
                                            }`}
                                          />
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                    )}

                    {/* Message */}
                    <FormField
                      control={createForm.control}
                      name="message"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your Message *</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Tell everyone what makes this person amazing..."
                              className="min-h-[100px]"
                              data-testid="input-message"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Company Values */}
                    <FormField
                      control={createForm.control}
                      name="values"
                      render={() => (
                        <FormItem>
                          <FormLabel>Company Values Demonstrated *</FormLabel>
                          <div className="grid grid-cols-1 gap-3 mt-2">
                            {defaultCompanyValuesArray.map((value) => (
                              <FormField
                                key={value}
                                control={createForm.control}
                                name="values"
                                render={({ field }) => (
                                  <FormItem
                                    key={value}
                                    className="flex flex-row items-center space-x-3 space-y-0"
                                  >
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(value)}
                                        onCheckedChange={(checked: boolean) => {
                                          return checked
                                            ? field.onChange([...(field.value || []), value])
                                            : field.onChange(
                                                (field.value || []).filter(
                                                  (val) => val !== value
                                                )
                                              );
                                        }}
                                        data-testid={`checkbox-value-${value.replace(/\s+/g, '-')}`}
                                      />
                                    </FormControl>
                                    <FormLabel className="text-sm font-normal capitalize">
                                      {value}
                                    </FormLabel>
                                  </FormItem>
                                )}
                              />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Public/Private Toggle */}
                    <FormField
                      control={createForm.control}
                      name="isPublic"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">
                              Public Recognition
                            </FormLabel>
                            <FormDescription className="text-sm text-muted-foreground">
                              Share this shoutout with the team and post to Slack
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-public"
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
                        data-testid="button-cancel"
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={createShoutoutMutation.isPending}
                        data-testid="button-send-shoutout"
                      >
                        {createShoutoutMutation.isPending ? (
                          <>Sending...</>
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            Send Shoutout
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Explanatory Text */}
          <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <CardContent className="pt-6">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <Heart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-sm text-muted-foreground flex-1">
                  Recognize your teammates. A simple thank you goes a long way in building strong team relationships.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Tabs for filtering */}
          <Tabs value={filter} onValueChange={(value) => setFilter(value as any)}>
            <TabsList>
              <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
              <TabsTrigger value="received" data-testid="tab-received">Received</TabsTrigger>
              <TabsTrigger value="given" data-testid="tab-given">Given</TabsTrigger>
              <TabsTrigger value="public" data-testid="tab-public">Public</TabsTrigger>
            </TabsList>

            {/* Shoutouts Feed */}
            <div className="mt-6">
              {shoutoutsLoading ? (
                <div className="grid gap-4">
                  {[...Array(3)].map((_, i) => (
                    <Card key={i} data-testid={`skeleton-${i}`}>
                      <CardContent className="p-6">
                        <div className="animate-pulse space-y-4">
                          <div className="h-4 bg-muted rounded w-3/4"></div>
                          <div className="h-4 bg-muted rounded w-1/2"></div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : shoutouts.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Sparkles className="mx-auto h-12 w-12 fill-accent stroke-accent mb-4" />
                    <h3 className="text-lg font-medium mb-2">No shoutouts yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Be the first to recognize someone's great work!
                    </p>
                    <Button 
                      onClick={() => setShowCreateDialog(true)}
                      data-testid="button-give-first-shoutout"
                    >
                      <Gift className="mr-2 h-4 w-4" />
                      Give First Shout Out
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4" data-testid="shoutouts-feed">
                  {shoutouts.map((shoutoutItem) => (
                    <Card key={shoutoutItem.id} data-testid={`shoutout-${shoutoutItem.id}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback>
                                {getUserInitials(shoutoutItem.fromUserId)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">
                                <span data-testid={`text-from-${shoutoutItem.fromUserId}`}>
                                  {getUserName(shoutoutItem.fromUserId)}
                                </span>
                                {" → "}
                                {shoutoutItem.toTeamId ? (
                                  <span className="inline-flex items-center" data-testid={`text-to-team-${shoutoutItem.toTeamId}`}>
                                    <UsersIcon className="mr-1 h-4 w-4" />
                                    Team: {getTeamName(shoutoutItem.toTeamId)}
                                  </span>
                                ) : (
                                  <span data-testid={`text-to-${shoutoutItem.toUserId}`}>
                                    {getUserName(shoutoutItem.toUserId || "")}
                                  </span>
                                )}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {formatDistanceToNow(new Date(shoutoutItem.createdAt))} ago
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {shoutoutItem.isPublic ? (
                              <Badge variant="secondary" data-testid={`badge-public-${shoutoutItem.id}`}>
                                <Users className="mr-1 h-3 w-3" />
                                Public
                              </Badge>
                            ) : (
                              <Badge variant="outline" data-testid={`badge-private-${shoutoutItem.id}`}>
                                <Lock className="mr-1 h-3 w-3" />
                                Private
                              </Badge>
                            )}
                            {/* Admin-only delete button */}
                            {(currentUser?.role === "admin" || currentUser?.isSuperAdmin) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteShoutout(shoutoutItem)}
                                data-testid={`button-delete-shoutout-${shoutoutItem.id}`}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="mb-3 text-sm leading-relaxed" data-testid={`text-message-${shoutoutItem.id}`}>
                          {shoutoutItem.message}
                        </p>
                        {shoutoutItem.values.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {shoutoutItem.values.map((value) => (
                              <Badge 
                                key={value} 
                                variant="outline" 
                                className="text-xs"
                                data-testid={`badge-value-${value.replace(/\s+/g, '-')}-${shoutoutItem.id}`}
                              >
                                <Star className="mr-1 h-3 w-3" />
                                {value}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </Tabs>
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteShoutout} onOpenChange={(open) => !open && setDeleteShoutout(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Shoutout</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this shoutout? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deleteShoutout) {
                    deleteShoutoutMutation.mutate(deleteShoutout.id);
                    setDeleteShoutout(null);
                  }
                }}
                disabled={deleteShoutoutMutation.isPending}
                data-testid="button-confirm-delete-shoutout"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete Shoutout
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
  );
}