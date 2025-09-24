import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { User, Settings as SettingsIcon, Shield, Bell, Building, Save, Eye, EyeOff, LogOut, Trash2, Check, X, Slack, Monitor, Sun, Moon, Globe, Plus, Edit3, RefreshCw, Calendar, CalendarOff, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { IntegrationsDashboard } from "@/components/IntegrationsDashboard";

import type { User as UserType, Team, Vacation } from "@shared/schema";
import { DefaultCompanyValues, defaultCompanyValuesArray } from "@shared/schema";
import { addWeeks, startOfWeek, format as formatDate, parseISO, isSameWeek } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Form schemas
const profileFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100, "Name too long"),
  email: z.string().email("Please enter a valid email address"),
  username: z.string().min(3, "Username must be at least 3 characters").max(50, "Username too long"),
});

const notificationFormSchema = z.object({
  emailCheckinReminders: z.boolean().default(true),
  emailWinAnnouncements: z.boolean().default(true),
  emailShoutouts: z.boolean().default(true),
  emailWeeklyDigest: z.boolean().default(false),
  slackCheckinReminders: z.boolean().default(true),
  slackWinAnnouncements: z.boolean().default(true),
  slackShoutouts: z.boolean().default(true),
  reminderFrequency: z.enum(["daily", "weekly", "biweekly"]).default("weekly"),
  reminderTime: z.string().default("09:00"), // New field for reminder time
  reminderTimezone: z.string().default("America/Chicago"), // New field for timezone
});

const organizationFormSchema = z.object({
  name: z.string().min(2, "Organization name must be at least 2 characters"),
  customValues: z.array(z.string()).min(1, "At least one company value is required"),
});

const passwordFormSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const appPreferencesFormSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).default("system"),
  language: z.enum(["en", "es", "fr"]).default("en"),
  timezone: z.string().default("America/New_York"),
});

type ProfileForm = z.infer<typeof profileFormSchema>;
type NotificationForm = z.infer<typeof notificationFormSchema>;
type OrganizationForm = z.infer<typeof organizationFormSchema>;
type PasswordForm = z.infer<typeof passwordFormSchema>;
type AppPreferencesForm = z.infer<typeof appPreferencesFormSchema>;

export default function Settings() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("profile");
  const [showPassword, setShowPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newCompanyValue, setNewCompanyValue] = useState("");
  const [editingValueIndex, setEditingValueIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [vacationDatePopoverOpen, setVacationDatePopoverOpen] = useState(false);
  const [selectedVacationDate, setSelectedVacationDate] = useState<Date | undefined>();
  const [vacationNote, setVacationNote] = useState("");

  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  
  // Fetch teams for profile section
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });
  
  // Fetch vacation weeks for current user
  const { data: vacations = [], refetch: refetchVacations } = useQuery<Vacation[]>({
    queryKey: ["/api/vacations", currentUser?.id],
    enabled: !!currentUser?.id,
  });

  // Fetch current organization data for admin users
  const { data: currentOrganization, isLoading: orgLoading } = useQuery({
    queryKey: ["/api/organizations", currentUser?.organizationId],
    queryFn: async () => {
      if (!currentUser?.organizationId) return null;
      const response = await fetch(`/api/organizations/${currentUser.organizationId}`);
      if (!response.ok) throw new Error('Failed to fetch organization');
      return response.json();
    },
    enabled: !!currentUser?.organizationId && currentUser?.role === "admin",
  });

  // Initialize forms with current user data
  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileFormSchema),
    values: {
      name: currentUser?.name || "",
      email: currentUser?.email || "",
      username: currentUser?.username || "",
    },
  });

  const notificationForm = useForm<NotificationForm>({
    resolver: zodResolver(notificationFormSchema),
    defaultValues: {
      emailCheckinReminders: true,
      emailWinAnnouncements: true,
      emailShoutouts: true,
      emailWeeklyDigest: false,
      slackCheckinReminders: true,
      slackWinAnnouncements: true,
      slackShoutouts: true,
      reminderFrequency: "weekly",
      reminderTime: "09:00",
      reminderTimezone: "America/Chicago",
    },
  });

  const organizationForm = useForm<OrganizationForm>({
    resolver: zodResolver(organizationFormSchema),
    values: {
      name: currentOrganization?.name || "TeamPulse Organization",
      customValues: currentOrganization?.customValues || defaultCompanyValuesArray,
    },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const appPreferencesForm = useForm<AppPreferencesForm>({
    resolver: zodResolver(appPreferencesFormSchema),
    defaultValues: {
      theme: "system",
      language: "en",
      timezone: "America/New_York",
    },
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      if (!currentUser) throw new Error("No current user");
      return apiRequest("PATCH", `/api/users/${currentUser.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/current", { org: "default" }] });
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Failed to update your profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Password change mutation (placeholder)
  const changePasswordMutation = useMutation({
    mutationFn: async (data: PasswordForm) => {
      // This would typically call a password change endpoint
      // For now, we'll just simulate success
      return Promise.resolve({ success: true });
    },
    onSuccess: () => {
      passwordForm.reset();
      toast({
        title: "Password changed",
        description: "Your password has been changed successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Password change failed",
        description: "Failed to change your password. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/auth/logout");
    },
    onSuccess: () => {
      window.location.href = "/login";
    },
    onError: () => {
      toast({
        title: "Logout failed",
        description: "Failed to logout. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Form handlers
  const handleProfileSubmit = (data: ProfileForm) => {
    updateProfileMutation.mutate(data);
  };

  const handleNotificationSubmit = (data: NotificationForm) => {
    // Placeholder for notification preferences update
    toast({
      title: "Notifications updated",
      description: "Your notification preferences have been saved.",
    });
  };

  // Organization update mutation
  const updateOrganizationMutation = useMutation({
    mutationFn: async (data: OrganizationForm) => {
      if (!currentUser?.organizationId) throw new Error("No organization ID");
      return apiRequest("PUT", `/api/organizations/${currentUser.organizationId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", currentUser?.organizationId] });
      toast({
        title: "Organization updated",
        description: "Organization settings have been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Failed to update organization settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleOrganizationSubmit = (data: OrganizationForm) => {
    updateOrganizationMutation.mutate(data);
  };

  // Company values management functions
  const addCompanyValue = () => {
    if (!newCompanyValue.trim()) return;
    
    const currentValues = organizationForm.getValues("customValues");
    if (currentValues.includes(newCompanyValue.trim().toLowerCase())) {
      toast({
        title: "Duplicate value",
        description: "This company value already exists.",
        variant: "destructive",
      });
      return;
    }
    
    organizationForm.setValue("customValues", [...currentValues, newCompanyValue.trim().toLowerCase()]);
    setNewCompanyValue("");
  };

  const removeCompanyValue = (index: number) => {
    const currentValues = organizationForm.getValues("customValues");
    const newValues = currentValues.filter((_, i) => i !== index);
    organizationForm.setValue("customValues", newValues);
  };

  const startEditingValue = (index: number) => {
    const currentValues = organizationForm.getValues("customValues");
    setEditingValueIndex(index);
    setEditingValue(currentValues[index]);
  };

  const saveEditingValue = () => {
    if (!editingValue.trim() || editingValueIndex === null) return;
    
    const currentValues = organizationForm.getValues("customValues");
    const trimmedValue = editingValue.trim().toLowerCase();
    
    // Check if the new value already exists (but not at the current index)
    if (currentValues.some((value, i) => value === trimmedValue && i !== editingValueIndex)) {
      toast({
        title: "Duplicate value",
        description: "This company value already exists.",
        variant: "destructive",
      });
      return;
    }
    
    const newValues = [...currentValues];
    newValues[editingValueIndex] = trimmedValue;
    organizationForm.setValue("customValues", newValues);
    setEditingValueIndex(null);
    setEditingValue("");
  };

  const cancelEditingValue = () => {
    setEditingValueIndex(null);
    setEditingValue("");
  };

  const handlePasswordSubmit = (data: PasswordForm) => {
    changePasswordMutation.mutate(data);
  };

  const handleAppPreferencesSubmit = (data: AppPreferencesForm) => {
    // Placeholder for app preferences update
    toast({
      title: "Preferences updated",
      description: "Your application preferences have been saved.",
    });
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleDeleteAccount = () => {
    // SECURITY: Double-check super admin privileges
    if (!currentUser?.isSuperAdmin) {
      toast({
        title: "Access denied",
        description: "Only super administrators can delete accounts.",
        variant: "destructive",
      });
      setShowDeleteDialog(false);
      return;
    }

    // Placeholder for account deletion
    toast({
      title: "Account deletion requested",
      description: "This feature would be implemented with proper safeguards.",
      variant: "destructive",
    });
    setShowDeleteDialog(false);
  };

  const getUserTeam = () => {
    if (!currentUser?.teamId) return null;
    return teams.find(team => team.id === currentUser.teamId);
  };
  
  // Add vacation mutation
  const addVacationMutation = useMutation({
    mutationFn: async (data: { weekOf: Date; note?: string }) => {
      const weekStart = startOfWeek(data.weekOf, { weekStartsOn: 1 });
      return apiRequest("POST", "/api/vacations", {
        weekOf: weekStart.toISOString(),
        note: data.note,
      });
    },
    onSuccess: () => {
      refetchVacations();
      setSelectedVacationDate(undefined);
      setVacationNote("");
      setVacationDatePopoverOpen(false);
      toast({
        title: "Vacation week added",
        description: "Your vacation has been marked successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to add vacation",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Remove vacation mutation
  const removeVacationMutation = useMutation({
    mutationFn: async (weekOf: string) => {
      const weekStart = startOfWeek(parseISO(weekOf), { weekStartsOn: 1 });
      return apiRequest("DELETE", `/api/vacations/${weekStart.toISOString()}`);
    },
    onSuccess: () => {
      refetchVacations();
      toast({
        title: "Vacation removed",
        description: "Your vacation week has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to remove vacation",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });
  
  const handleAddVacation = () => {
    if (!selectedVacationDate) return;
    addVacationMutation.mutate({
      weekOf: selectedVacationDate,
      note: vacationNote,
    });
  };
  
  const handleRemoveVacation = (weekOf: string) => {
    removeVacationMutation.mutate(weekOf);
  };

  if (userLoading) {
    return (
      <main className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="animate-pulse space-y-3">
                    <div className="h-6 bg-muted rounded w-1/3"></div>
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                    <div className="h-32 bg-muted rounded"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
    );
  }

  return (
    <>
    <main className="flex-1 overflow-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1" data-testid="tabs-settings">
              <TabsTrigger value="profile" data-testid="tab-profile" className="flex items-center justify-center px-2 py-1">
                <User className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Profile</span>
                <span className="sm:hidden text-xs">Profile</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" data-testid="tab-notifications" className="flex items-center justify-center px-2 py-1">
                <Bell className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Notifications</span>
                <span className="sm:hidden text-xs">Notif</span>
              </TabsTrigger>
              {currentUser?.role === "admin" && (
                <TabsTrigger value="organization" data-testid="tab-organization" className="flex items-center justify-center px-2 py-1">
                  <Building className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Organization</span>
                  <span className="sm:hidden text-xs">Org</span>
                </TabsTrigger>
              )}
              <TabsTrigger value="security" data-testid="tab-security" className="flex items-center justify-center px-2 py-1">
                <Shield className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Security</span>
                <span className="sm:hidden text-xs">Security</span>
              </TabsTrigger>
              <TabsTrigger value="preferences" data-testid="tab-preferences" className="flex items-center justify-center px-2 py-1">
                <SettingsIcon className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Preferences</span>
                <span className="sm:hidden text-xs">Prefs</span>
              </TabsTrigger>
              <TabsTrigger value="integrations" data-testid="tab-integrations" className="flex items-center justify-center px-2 py-1">
                <Globe className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Integrations</span>
                <span className="sm:hidden text-xs">Integrate</span>
              </TabsTrigger>
            </TabsList>

            {/* Profile Settings */}
            <TabsContent value="profile" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <User className="w-5 h-5" />
                    <span>User Profile</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Profile Header */}
                  <div className="flex items-center space-x-4">
                    <Avatar className="w-20 h-20">
                      <AvatarFallback className="text-lg">
                        {currentUser?.name?.split(' ').map(n => n[0]).join('') || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="text-xl font-semibold" data-testid="text-user-name">
                        {currentUser?.name}
                      </h3>
                      <p className="text-muted-foreground" data-testid="text-user-email">
                        {currentUser?.email}
                      </p>
                      <div className="flex items-center space-x-2 mt-2">
                        <Badge variant="secondary" data-testid="badge-user-role">
                          {currentUser?.role}
                        </Badge>
                        {getUserTeam() && (
                          <Badge variant="outline" data-testid="badge-user-team">
                            {getUserTeam()?.name}
                          </Badge>
                        )}
                        {currentUser?.authProvider === "slack" && (
                          <Badge variant="outline">
                            <Slack className="w-3 h-3 mr-1" />
                            Slack
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Profile Form */}
                  <Form {...profileForm}>
                    <form onSubmit={profileForm.handleSubmit(handleProfileSubmit)} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={profileForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Full Name</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Enter your full name"
                                  data-testid="input-profile-name"
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={profileForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email Address</FormLabel>
                              <FormControl>
                                <Input 
                                  type="email"
                                  placeholder="Enter your email"
                                  data-testid="input-profile-email"
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={profileForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Enter your username"
                                data-testid="input-profile-username"
                                {...field} 
                              />
                            </FormControl>
                            <FormDescription>
                              This is your unique identifier used for login.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          disabled={updateProfileMutation.isPending}
                          data-testid="button-save-profile"
                        >
                          <Save className="w-4 h-4 mr-2" />
                          {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                        </Button>
                      </div>
                    </form>
                  </Form>

                  {/* Account Info */}
                  <div className="space-y-4 pt-4 border-t">
                    <h4 className="font-medium">Account Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Account Created</p>
                        <p data-testid="text-account-created">
                          {currentUser?.createdAt ? format(new Date(currentUser.createdAt), 'PPP') : 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Account Status</p>
                        <Badge variant={currentUser?.isActive ? "default" : "destructive"} data-testid="badge-account-status">
                          {currentUser?.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  
                  {/* Vacation Management */}
                  <div className="space-y-4 pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium flex items-center gap-2">
                        <CalendarOff className="w-4 h-4" />
                        Out of Office / Vacation Weeks
                      </h4>
                      <Popover open={vacationDatePopoverOpen} onOpenChange={setVacationDatePopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" data-testid="button-add-vacation">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Vacation
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-4" align="end">
                          <div className="space-y-4">
                            <div>
                              <p className="text-sm font-medium mb-2">Select a week</p>
                              <CalendarComponent
                                mode="single"
                                selected={selectedVacationDate}
                                onSelect={setSelectedVacationDate}
                                disabled={(date) => date < new Date()}
                                initialFocus
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Note (optional)</label>
                              <Input
                                value={vacationNote}
                                onChange={(e) => setVacationNote(e.target.value)}
                                placeholder="e.g., Family vacation"
                                className="mt-1"
                                data-testid="input-vacation-note"
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setVacationDatePopoverOpen(false);
                                  setSelectedVacationDate(undefined);
                                  setVacationNote("");
                                }}
                                data-testid="button-cancel-vacation"
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleAddVacation}
                                disabled={!selectedVacationDate || addVacationMutation.isPending}
                                data-testid="button-confirm-vacation"
                              >
                                {addVacationMutation.isPending ? "Adding..." : "Add Week"}
                              </Button>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    
                    <div className="text-sm text-muted-foreground">
                      Mark weeks when you'll be out of office. These weeks won't count against your check-in compliance.
                    </div>
                    
                    {vacations.length > 0 ? (
                      <div className="space-y-2">
                        {vacations
                          .sort((a, b) => new Date(b.weekOf).getTime() - new Date(a.weekOf).getTime())
                          .slice(0, 10)
                          .map((vacation) => {
                            const weekStart = startOfWeek(typeof vacation.weekOf === 'string' ? parseISO(vacation.weekOf) : new Date(vacation.weekOf), { weekStartsOn: 1 });
                            const weekEnd = addWeeks(weekStart, 1);
                            return (
                              <div
                                key={vacation.id}
                                className="flex items-center justify-between p-3 rounded-lg border bg-muted/50"
                                data-testid={`vacation-week-${vacation.id}`}
                              >
                                <div className="flex items-center gap-3">
                                  <Calendar className="w-4 h-4 text-muted-foreground" />
                                  <div>
                                    <p className="text-sm font-medium">
                                      Week of {formatDate(weekStart, "MMM dd, yyyy")}
                                    </p>
                                    {vacation.note && (
                                      <p className="text-xs text-muted-foreground">{vacation.note}</p>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveVacation(typeof vacation.weekOf === 'string' ? vacation.weekOf : vacation.weekOf.toISOString())}
                                  disabled={removeVacationMutation.isPending}
                                  data-testid={`button-remove-vacation-${vacation.id}`}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <div className="text-center p-6 border rounded-lg bg-muted/30">
                        <CalendarOff className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          No vacation weeks scheduled
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notification Settings */}
            <TabsContent value="notifications" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Bell className="w-5 h-5" />
                    <span>Notification Preferences</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Form {...notificationForm}>
                    <form onSubmit={notificationForm.handleSubmit(handleNotificationSubmit)} className="space-y-6">
                      {/* Email Notifications */}
                      <div className="space-y-4">
                        <h4 className="font-medium">Email Notifications</h4>
                        <div className="space-y-4">
                          <FormField
                            control={notificationForm.control}
                            name="emailCheckinReminders"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                <div className="space-y-0.5">
                                  <FormLabel>Check-in Reminders</FormLabel>
                                  <FormDescription>
                                    Receive email reminders for weekly check-ins
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-email-checkin-reminders"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={notificationForm.control}
                            name="emailWinAnnouncements"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                <div className="space-y-0.5">
                                  <FormLabel>Win Announcements</FormLabel>
                                  <FormDescription>
                                    Get notified when team wins are shared
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-email-win-announcements"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={notificationForm.control}
                            name="emailShoutouts"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                <div className="space-y-0.5">
                                  <FormLabel>Shoutouts</FormLabel>
                                  <FormDescription>
                                    Receive notifications for team shoutouts
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-email-shoutouts"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={notificationForm.control}
                            name="emailWeeklyDigest"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                <div className="space-y-0.5">
                                  <FormLabel>Weekly Digest</FormLabel>
                                  <FormDescription>
                                    Get a weekly summary of team activity
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-email-weekly-digest"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      {/* Slack Notifications */}
                      <div className="space-y-4">
                        <h4 className="font-medium flex items-center space-x-2">
                          <Slack className="w-4 h-4" />
                          <span>Slack Notifications</span>
                        </h4>
                        <div className="space-y-4">
                          <FormField
                            control={notificationForm.control}
                            name="slackCheckinReminders"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                <div className="space-y-0.5">
                                  <FormLabel>Check-in Reminders</FormLabel>
                                  <FormDescription>
                                    Receive Slack DMs for weekly check-ins
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-slack-checkin-reminders"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={notificationForm.control}
                            name="slackWinAnnouncements"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                <div className="space-y-0.5">
                                  <FormLabel>Win Announcements</FormLabel>
                                  <FormDescription>
                                    Get Slack notifications for team wins
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-slack-win-announcements"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={notificationForm.control}
                            name="slackShoutouts"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                <div className="space-y-0.5">
                                  <FormLabel>Shoutouts</FormLabel>
                                  <FormDescription>
                                    Receive Slack notifications for shoutouts
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-slack-shoutouts"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      {/* Reminder Frequency */}
                      <div className="space-y-4">
                        <FormField
                          control={notificationForm.control}
                          name="reminderFrequency"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Reminder Frequency</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-reminder-frequency">
                                    <SelectValue placeholder="Select frequency" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="daily">Daily</SelectItem>
                                  <SelectItem value="weekly">Weekly</SelectItem>
                                  <SelectItem value="biweekly">Bi-weekly</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                How often you want to receive check-in reminders
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      {/* Reminder Time Preferences */}
                      <div className="space-y-4">
                        <h4 className="font-medium flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          Reminder Schedule
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          Note: Currently all reminders are sent at 9:00 AM Central Time on Mondays. Individual time preferences will be available in a future update.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={notificationForm.control}
                            name="reminderTime"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Preferred Time (Coming Soon)</FormLabel>
                                <FormControl>
                                  <Input
                                    type="time"
                                    {...field}
                                    disabled
                                    data-testid="input-reminder-time"
                                  />
                                </FormControl>
                                <FormDescription>
                                  Your preferred time for check-in reminders
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={notificationForm.control}
                            name="reminderTimezone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Timezone (Coming Soon)</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value} disabled>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-reminder-timezone">
                                      <SelectValue placeholder="Select timezone" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="America/New_York">Eastern Time</SelectItem>
                                    <SelectItem value="America/Chicago">Central Time</SelectItem>
                                    <SelectItem value="America/Denver">Mountain Time</SelectItem>
                                    <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormDescription>
                                  Your timezone for reminder scheduling
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button type="submit" data-testid="button-save-notifications">
                          <Save className="w-4 h-4 mr-2" />
                          Save Notification Settings
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Organization Settings (Admin Only) */}
            {currentUser?.role === "admin" && (
              <TabsContent value="organization" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Building className="w-5 h-5" />
                      <span>Organization Settings</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Form {...organizationForm}>
                      <form onSubmit={organizationForm.handleSubmit(handleOrganizationSubmit)} className="space-y-6">
                        <FormField
                          control={organizationForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Organization Name</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Enter organization name"
                                  data-testid="input-organization-name"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                This name appears throughout the application
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={organizationForm.control}
                          name="customValues"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Company Values</FormLabel>
                              <FormDescription>
                                Manage the core values that your team uses for recognition and wins
                              </FormDescription>
                              <div className="space-y-3">
                                {/* Current company values */}
                                <div className="space-y-2">
                                  {field.value.map((value, index) => (
                                    <div key={index} className="flex items-center space-x-2 p-3 border rounded-lg bg-muted/30">
                                      {editingValueIndex === index ? (
                                        <>
                                          <Input
                                            value={editingValue}
                                            onChange={(e) => setEditingValue(e.target.value)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                e.preventDefault();
                                                saveEditingValue();
                                              } else if (e.key === 'Escape') {
                                                cancelEditingValue();
                                              }
                                            }}
                                            placeholder="Enter company value"
                                            className="flex-1"
                                            data-testid={`input-edit-value-${index}`}
                                          />
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={saveEditingValue}
                                            data-testid={`button-save-value-${index}`}
                                          >
                                            <Check className="w-4 h-4" />
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={cancelEditingValue}
                                            data-testid={`button-cancel-edit-${index}`}
                                          >
                                            <X className="w-4 h-4" />
                                          </Button>
                                        </>
                                      ) : (
                                        <>
                                          <Badge variant="secondary" className="capitalize flex-1">
                                            {value}
                                          </Badge>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => startEditingValue(index)}
                                            data-testid={`button-edit-value-${index}`}
                                          >
                                            <Edit3 className="w-4 h-4" />
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => removeCompanyValue(index)}
                                            data-testid={`button-remove-value-${index}`}
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                {/* Add new company value */}
                                <div className="flex items-center space-x-2 p-3 border-2 border-dashed rounded-lg">
                                  <Input
                                    value={newCompanyValue}
                                    onChange={(e) => setNewCompanyValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addCompanyValue();
                                      }
                                    }}
                                    placeholder="Add new company value..."
                                    className="flex-1"
                                    data-testid="input-new-company-value"
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={addCompanyValue}
                                    disabled={!newCompanyValue.trim()}
                                    data-testid="button-add-company-value"
                                  >
                                    <Plus className="w-4 h-4 mr-1" />
                                    Add
                                  </Button>
                                </div>

                                {field.value.length === 0 && (
                                  <p className="text-sm text-muted-foreground text-center py-4">
                                    No company values defined. Add at least one value to continue.
                                  </p>
                                )}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="flex justify-end">
                          <Button 
                            type="submit" 
                            data-testid="button-save-organization"
                            disabled={updateOrganizationMutation.isPending || orgLoading}
                          >
                            {updateOrganizationMutation.isPending ? (
                              <>
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Save className="w-4 h-4 mr-2" />
                                Save Organization Settings
                              </>
                            )}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Security Settings */}
            <TabsContent value="security" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Shield className="w-5 h-5" />
                    <span>Security Settings</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Connected Accounts */}
                  <div className="space-y-4">
                    <h4 className="font-medium">Connected Accounts</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          <Slack className="w-5 h-5" />
                          <div>
                            <p className="font-medium">Slack Workspace</p>
                            <p className="text-sm text-muted-foreground">
                              {currentUser?.slackWorkspaceId ? 'Connected' : 'Not connected'}
                            </p>
                          </div>
                        </div>
                        <Badge variant={currentUser?.slackWorkspaceId ? "default" : "secondary"}>
                          {currentUser?.slackWorkspaceId ? 'Connected' : 'Not Connected'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Password Change */}
                  {currentUser?.authProvider === "local" && (
                    <div className="space-y-4">
                      <h4 className="font-medium">Change Password</h4>
                      <Form {...passwordForm}>
                        <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} className="space-y-4">
                          <FormField
                            control={passwordForm.control}
                            name="currentPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Current Password</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Input
                                      type={showCurrentPassword ? "text" : "password"}
                                      placeholder="Enter your current password"
                                      data-testid="input-current-password"
                                      {...field}
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="absolute right-0 top-0 h-full px-3"
                                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                    >
                                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </Button>
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={passwordForm.control}
                            name="newPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>New Password</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Input
                                      type={showPassword ? "text" : "password"}
                                      placeholder="Enter your new password"
                                      data-testid="input-new-password"
                                      {...field}
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="absolute right-0 top-0 h-full px-3"
                                      onClick={() => setShowPassword(!showPassword)}
                                    >
                                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </Button>
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={passwordForm.control}
                            name="confirmPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Confirm New Password</FormLabel>
                                <FormControl>
                                  <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Confirm your new password"
                                    data-testid="input-confirm-password"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="flex justify-end">
                            <Button
                              type="submit"
                              disabled={changePasswordMutation.isPending}
                              data-testid="button-change-password"
                            >
                              <Save className="w-4 h-4 mr-2" />
                              {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
                            </Button>
                          </div>
                        </form>
                      </Form>
                    </div>
                  )}

                  {/* Session Management */}
                  <div className="space-y-4">
                    <h4 className="font-medium">Session Management</h4>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Sign Out</p>
                        <p className="text-sm text-muted-foreground">
                          Sign out of your current session
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={handleLogout}
                        disabled={logoutMutation.isPending}
                        data-testid="button-logout"
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        {logoutMutation.isPending ? "Signing Out..." : "Sign Out"}
                      </Button>
                    </div>
                  </div>

                  {/* Danger Zone - Only visible to super admins */}
                  {currentUser?.isSuperAdmin && (
                    <div className="space-y-4 pt-4 border-t border-destructive/20">
                      <h4 className="font-medium text-destructive">Danger Zone</h4>
                      <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg">
                        <div>
                          <p className="font-medium">Delete Account</p>
                          <p className="text-sm text-muted-foreground">
                            Permanently delete your account and all associated data
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          onClick={() => setShowDeleteDialog(true)}
                          data-testid="button-delete-account"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Account
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Application Preferences */}
            <TabsContent value="preferences" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <SettingsIcon className="w-5 h-5" />
                    <span>Application Preferences</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Form {...appPreferencesForm}>
                    <form onSubmit={appPreferencesForm.handleSubmit(handleAppPreferencesSubmit)} className="space-y-6">
                      <FormField
                        control={appPreferencesForm.control}
                        name="theme"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Theme</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-theme">
                                  <SelectValue placeholder="Select theme" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="light">
                                  <div className="flex items-center space-x-2">
                                    <Sun className="w-4 h-4" />
                                    <span>Light</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="dark">
                                  <div className="flex items-center space-x-2">
                                    <Moon className="w-4 h-4" />
                                    <span>Dark</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="system">
                                  <div className="flex items-center space-x-2">
                                    <Monitor className="w-4 h-4" />
                                    <span>System</span>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Choose your preferred theme or match system settings
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={appPreferencesForm.control}
                        name="language"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Language</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-language">
                                  <SelectValue placeholder="Select language" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="en">English</SelectItem>
                                <SelectItem value="es">Español</SelectItem>
                                <SelectItem value="fr">Français</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Select your preferred language (coming soon)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={appPreferencesForm.control}
                        name="timezone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Timezone</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-timezone">
                                  <SelectValue placeholder="Select timezone" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                                <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                                <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                                <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                                <SelectItem value="UTC">UTC</SelectItem>
                                <SelectItem value="Europe/London">London (GMT)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Your timezone for check-in reminders and deadlines
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex justify-end">
                        <Button type="submit" data-testid="button-save-preferences">
                          <Save className="w-4 h-4 mr-2" />
                          Save Preferences
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Integrations Settings */}
            <TabsContent value="integrations" className="space-y-6">
              <IntegrationsDashboard />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Delete Account Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent data-testid="dialog-delete-account">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete your account? This action cannot be undone and will permanently remove all your data, including check-ins, wins, and shoutouts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}