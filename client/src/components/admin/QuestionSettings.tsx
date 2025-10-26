import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Settings, Save, Shuffle, RotateCw, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

const settingsSchema = z.object({
  minimumQuestionsPerWeek: z.number().min(1).max(10),
  maximumQuestionsPerWeek: z.number().min(1).max(50),
  autoSelectEnabled: z.boolean(),
  selectionStrategy: z.enum(["random", "rotating", "smart"]),
  avoidRecentlyAskedDays: z.number().min(0).max(365),
  includeTeamSpecific: z.boolean(),
  includeUserKraRelated: z.boolean(),
  prioritizeCategories: z.array(z.string()),
});

type SettingsForm = z.infer<typeof settingsSchema>;

const strategyIcons = {
  random: <Shuffle className="w-4 h-4" />,
  rotating: <RotateCw className="w-4 h-4" />,
  smart: <Brain className="w-4 h-4" />
};

const strategyDescriptions = {
  random: "Randomly select questions each week",
  rotating: "Rotate through questions systematically",
  smart: "Smart selection based on usage history and user context"
};

export function QuestionSettings() {
  const { toast } = useToast();
  const [isTestingAutoSelect, setIsTestingAutoSelect] = useState(false);
  
  // Fetch current settings
  const { data: settings, isLoading } = useQuery<any>({
    queryKey: ["/api/organization/question-settings"],
  });
  
  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      minimumQuestionsPerWeek: 3,
      maximumQuestionsPerWeek: 10,
      autoSelectEnabled: false,
      selectionStrategy: "smart",
      avoidRecentlyAskedDays: 30,
      includeTeamSpecific: true,
      includeUserKraRelated: true,
      prioritizeCategories: [],
    },
  });
  
  // Update form when settings are loaded
  useEffect(() => {
    if (settings) {
      form.reset({
        minimumQuestionsPerWeek: settings.minimumQuestionsPerWeek || 3,
        maximumQuestionsPerWeek: settings.maximumQuestionsPerWeek || 10,
        autoSelectEnabled: settings.autoSelectEnabled || false,
        selectionStrategy: settings.selectionStrategy || "smart",
        avoidRecentlyAskedDays: settings.avoidRecentlyAskedDays || 30,
        includeTeamSpecific: settings.includeTeamSpecific !== false,
        includeUserKraRelated: settings.includeUserKraRelated !== false,
        prioritizeCategories: settings.prioritizeCategories || [],
      });
    }
  }, [settings, form]);
  
  // Save settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (data: SettingsForm) => {
      const response = await apiRequest("POST", "/api/organization/question-settings", data);
      if (!response.ok) throw new Error("Failed to save settings");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings Saved",
        description: "Your question selection settings have been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/organization/question-settings"] });
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save settings",
        variant: "destructive",
      });
    },
  });
  
  // Test auto-selection
  const testAutoSelectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/questions/auto-select", {
        teamId: null, // Test for organization level
        userId: null,
        kraCategories: [],
      });
      if (!response.ok) throw new Error("Failed to auto-select questions");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Auto-Selection Test",
        description: `Selected ${data.questions.length} questions based on your settings.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Test Failed",
        description: error.message || "Failed to test auto-selection",
        variant: "destructive",
      });
    },
  });
  
  const handleSubmit = (data: SettingsForm) => {
    saveSettingsMutation.mutate(data);
  };
  
  const handleTestAutoSelect = () => {
    setIsTestingAutoSelect(true);
    testAutoSelectMutation.mutate(undefined, {
      onSettled: () => setIsTestingAutoSelect(false),
    });
  };
  
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Question Selection Settings
          </h3>
          <p className="text-sm text-muted-foreground">
            Configure how questions are automatically selected for check-ins
          </p>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Automated Question Selection</CardTitle>
          <CardDescription>
            Configure rules for automatically selecting questions for weekly check-ins
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="autoSelectEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        Enable Auto-Selection
                      </FormLabel>
                      <FormDescription>
                        Automatically select questions for check-ins based on your configured strategy
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-auto-select"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="minimumQuestionsPerWeek"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minimum Questions per Week</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                        data-testid="input-min-questions"
                      />
                    </FormControl>
                    <FormDescription>
                      The minimum number of questions to include in each weekly check-in (1-10)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="selectionStrategy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selection Strategy</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-strategy">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(strategyDescriptions).map(([strategy, description]) => (
                          <SelectItem key={strategy} value={strategy}>
                            <div className="flex items-center gap-2">
                              {strategyIcons[strategy as keyof typeof strategyIcons]}
                              <div>
                                <div className="font-medium capitalize">{strategy}</div>
                                <div className="text-xs text-muted-foreground">{description}</div>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose how questions are selected for check-ins
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {form.watch("autoSelectEnabled") && (
                <Alert>
                  <AlertDescription>
                    When auto-selection is enabled, questions will be automatically chosen based on your 
                    selected strategy. Users can still add custom questions if needed.
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestAutoSelect}
                  disabled={isTestingAutoSelect}
                  data-testid="button-test-auto-select"
                >
                  {isTestingAutoSelect ? "Testing..." : "Test Auto-Selection"}
                </Button>
                
                <Button
                  type="submit"
                  disabled={saveSettingsMutation.isPending}
                  data-testid="button-save-settings"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saveSettingsMutation.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}