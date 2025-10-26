import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Bell, Mail, MessageSquare, Clock, Moon, Sun, Calendar } from "lucide-react";
import { SiSlack } from "react-icons/si";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface NotificationPreferences {
  email: {
    checkinReminders: boolean;
    checkinSubmissions: boolean;
    winAnnouncements: boolean;
    shoutouts: boolean;
    teamUpdates: boolean;
    weeklyDigest: boolean;
  };
  slack: {
    checkinReminders: boolean;
    checkinSubmissions: boolean;
    winAnnouncements: boolean;
    shoutouts: boolean;
    directMessages: boolean;
  };
  inApp: {
    checkinReminders: boolean;
    checkinSubmissions: boolean;
    winAnnouncements: boolean;
    shoutouts: boolean;
    teamUpdates: boolean;
    systemAlerts: boolean;
  };
}

interface NotificationSchedule {
  doNotDisturb: boolean;
  doNotDisturbStart: string;
  doNotDisturbEnd: string;
  weekendNotifications: boolean;
  timezone: string;
}

export function NotificationPreferences() {
  const { toast } = useToast();
  const { data: currentUser } = useCurrentUser();
  const [activeTab, setActiveTab] = useState("channels");

  // Fetch notification preferences
  const { data: preferencesData, isLoading, refetch } = useQuery({
    queryKey: [`/api/users/${currentUser?.id}/notification-preferences`],
    queryFn: async () => {
      const response = await fetch(`/api/users/${currentUser?.id}/notification-preferences`);
      if (!response.ok) throw new Error("Failed to fetch notification preferences");
      return response.json();
    },
    enabled: !!currentUser?.id,
  });

  const form = useForm<{
    preferences: NotificationPreferences;
    schedule: NotificationSchedule;
  }>({
    defaultValues: {
      preferences: {
        email: {
          checkinReminders: true,
          checkinSubmissions: true,
          winAnnouncements: true,
          shoutouts: true,
          teamUpdates: true,
          weeklyDigest: true,
        },
        slack: {
          checkinReminders: true,
          checkinSubmissions: true,
          winAnnouncements: true,
          shoutouts: true,
          directMessages: true,
        },
        inApp: {
          checkinReminders: true,
          checkinSubmissions: true,
          winAnnouncements: true,
          shoutouts: true,
          teamUpdates: true,
          systemAlerts: true,
        },
      },
      schedule: {
        doNotDisturb: false,
        doNotDisturbStart: "18:00",
        doNotDisturbEnd: "09:00",
        weekendNotifications: false,
        timezone: "America/Chicago",
      },
    },
  });

  // Update form when data is loaded
  useEffect(() => {
    if (preferencesData) {
      form.reset({
        preferences: preferencesData.preferences,
        schedule: preferencesData.schedule,
      });
    }
  }, [preferencesData, form]);

  // Update preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: { preferences: NotificationPreferences; schedule: NotificationSchedule }) => {
      return apiRequest("PATCH", `/api/users/${currentUser?.id}/notification-preferences`, data);
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: [`/api/users/${currentUser?.id}/notification-preferences`] });
      toast({
        title: "Preferences updated",
        description: "Your notification preferences have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Failed to save your preferences. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: { preferences: NotificationPreferences; schedule: NotificationSchedule }) => {
    updatePreferencesMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-muted rounded w-1/3"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-32 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Notification Preferences
        </CardTitle>
        <CardDescription>
          Customize how and when you receive notifications
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-2 w-full max-w-md">
                <TabsTrigger value="channels">Notification Channels</TabsTrigger>
                <TabsTrigger value="schedule">Schedule & Timing</TabsTrigger>
              </TabsList>

              <TabsContent value="channels" className="space-y-6 mt-6">
                {/* Email Notifications */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-base font-medium">
                    <Mail className="w-4 h-4" />
                    Email Notifications
                  </div>
                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="preferences.email.checkinReminders"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">Check-in Reminders</FormLabel>
                            <FormDescription className="text-xs">
                              Weekly reminders to submit your check-in
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
                      control={form.control}
                      name="preferences.email.checkinSubmissions"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">Check-in Submissions</FormLabel>
                            <FormDescription className="text-xs">
                              When your team members submit check-ins
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-email-checkin-submissions"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="preferences.email.winAnnouncements"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">Win Announcements</FormLabel>
                            <FormDescription className="text-xs">
                              When team wins are shared
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
                      control={form.control}
                      name="preferences.email.shoutouts"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">Shoutouts</FormLabel>
                            <FormDescription className="text-xs">
                              When you receive or are mentioned in shoutouts
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
                      control={form.control}
                      name="preferences.email.teamUpdates"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">Team Updates</FormLabel>
                            <FormDescription className="text-xs">
                              Important team announcements and changes
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-email-team-updates"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="preferences.email.weeklyDigest"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">Weekly Digest</FormLabel>
                            <FormDescription className="text-xs">
                              Weekly summary of team activity
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

                <Separator />

                {/* Slack Notifications */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-base font-medium">
                    <SiSlack className="w-4 h-4" />
                    Slack Notifications
                  </div>
                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="preferences.slack.checkinReminders"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">Check-in Reminders</FormLabel>
                            <FormDescription className="text-xs">
                              Direct messages for check-in reminders
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
                      control={form.control}
                      name="preferences.slack.checkinSubmissions"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">Check-in Submissions</FormLabel>
                            <FormDescription className="text-xs">
                              Notifications when team members submit
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-slack-checkin-submissions"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="preferences.slack.winAnnouncements"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">Win Announcements</FormLabel>
                            <FormDescription className="text-xs">
                              Channel announcements for wins
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
                      control={form.control}
                      name="preferences.slack.shoutouts"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">Shoutouts</FormLabel>
                            <FormDescription className="text-xs">
                              Notifications for shoutouts
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
                    <FormField
                      control={form.control}
                      name="preferences.slack.directMessages"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">Direct Messages</FormLabel>
                            <FormDescription className="text-xs">
                              Personal notifications via DM
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-slack-direct-messages"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Separator />

                {/* In-App Notifications */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-base font-medium">
                    <MessageSquare className="w-4 h-4" />
                    In-App Notifications
                  </div>
                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="preferences.inApp.checkinReminders"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">Check-in Reminders</FormLabel>
                            <FormDescription className="text-xs">
                              In-app reminders for check-ins
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-inapp-checkin-reminders"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="preferences.inApp.checkinSubmissions"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">Check-in Submissions</FormLabel>
                            <FormDescription className="text-xs">
                              Notifications for team check-ins
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-inapp-checkin-submissions"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="preferences.inApp.winAnnouncements"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">Win Announcements</FormLabel>
                            <FormDescription className="text-xs">
                              In-app win notifications
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-inapp-win-announcements"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="preferences.inApp.shoutouts"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">Shoutouts</FormLabel>
                            <FormDescription className="text-xs">
                              In-app shoutout notifications
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-inapp-shoutouts"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="preferences.inApp.teamUpdates"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">Team Updates</FormLabel>
                            <FormDescription className="text-xs">
                              In-app team announcements
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-inapp-team-updates"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="preferences.inApp.systemAlerts"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">System Alerts</FormLabel>
                            <FormDescription className="text-xs">
                              Important system notifications
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-inapp-system-alerts"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="schedule" className="space-y-6 mt-6">
                {/* Do Not Disturb */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-base font-medium">
                    <Moon className="w-4 h-4" />
                    Do Not Disturb
                  </div>
                  <FormField
                    control={form.control}
                    name="schedule.doNotDisturb"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm">Enable Do Not Disturb</FormLabel>
                          <FormDescription className="text-xs">
                            Pause notifications during specific hours
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-do-not-disturb"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  {form.watch("schedule.doNotDisturb") && (
                    <div className="grid grid-cols-2 gap-4 pl-4">
                      <FormField
                        control={form.control}
                        name="schedule.doNotDisturbStart"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm">Start Time</FormLabel>
                            <FormControl>
                              <Input
                                type="time"
                                {...field}
                                data-testid="input-dnd-start"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="schedule.doNotDisturbEnd"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm">End Time</FormLabel>
                            <FormControl>
                              <Input
                                type="time"
                                {...field}
                                data-testid="input-dnd-end"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>

                <Separator />

                {/* Weekend Notifications */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-base font-medium">
                    <Calendar className="w-4 h-4" />
                    Weekend Preferences
                  </div>
                  <FormField
                    control={form.control}
                    name="schedule.weekendNotifications"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm">Weekend Notifications</FormLabel>
                          <FormDescription className="text-xs">
                            Receive notifications on weekends
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-weekend-notifications"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                {/* Timezone */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-base font-medium">
                    <Clock className="w-4 h-4" />
                    Timezone
                  </div>
                  <FormField
                    control={form.control}
                    name="schedule.timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">Your Timezone</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-timezone">
                              <SelectValue placeholder="Select timezone" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="America/New_York">Eastern Time</SelectItem>
                            <SelectItem value="America/Chicago">Central Time</SelectItem>
                            <SelectItem value="America/Denver">Mountain Time</SelectItem>
                            <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                            <SelectItem value="America/Phoenix">Arizona Time</SelectItem>
                            <SelectItem value="Pacific/Honolulu">Hawaii Time</SelectItem>
                            <SelectItem value="America/Anchorage">Alaska Time</SelectItem>
                            <SelectItem value="Europe/London">London</SelectItem>
                            <SelectItem value="Europe/Paris">Paris</SelectItem>
                            <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                            <SelectItem value="Australia/Sydney">Sydney</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">
                          All notification times will be adjusted to your timezone
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => form.reset()}
                disabled={updatePreferencesMutation.isPending}
              >
                Reset
              </Button>
              <Button
                type="submit"
                disabled={updatePreferencesMutation.isPending}
                data-testid="button-save-notification-preferences"
              >
                Save Preferences
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}