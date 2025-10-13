import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Target, Plus, Search, Filter, Settings, Users, CheckCircle, 
  Circle, ChevronDown, Calendar, User, BarChart3, Edit2, X, Brain, Sparkles,
  MoreVertical, Trash2, CheckSquare, XSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
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
  Form,
  FormControl,
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useViewAsRole } from "@/hooks/useViewAsRole";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { KraTemplate, UserKra, User as UserType } from "@shared/schema";

// Template form validation schema using shared schema
import { insertKraTemplateSchema } from "@shared/schema";

const templateFormSchema = insertKraTemplateSchema.omit({ 
  organizationId: true, 
  createdBy: true 
}).extend({
  name: z.string().min(1, "Template name is required").max(200, "Template name must be under 200 characters"),
  description: z.string().max(1000, "Description must be under 1000 characters").optional(),
  goals: z.array(z.object({
    title: z.string().min(1, "Goal title is required"),
    description: z.string().optional(),
    target: z.string().optional(),
    metric: z.string().optional(),
  })).min(1, "At least one goal is required"),
});

interface KraTemplateWithMeta extends KraTemplate {
  assignmentCount?: number;
}

interface UserKraWithDetails extends UserKra {
  template?: KraTemplate;
  assignee?: UserType;
  assignedByUser?: UserType;
}

interface KraTemplatesResponse {
  templates: KraTemplateWithMeta[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface UserKrasResponse {
  kras: UserKraWithDetails[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function CreateTemplateDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  
  const form = useForm<z.infer<typeof templateFormSchema>>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "general",
      goals: [{ title: "", description: "", target: "", metric: "" }],
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: z.infer<typeof templateFormSchema>) => {
      const response = await apiRequest("POST", "/api/kra-templates", data);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "KRA template created successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/kra-templates"] });
      setOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create KRA template",
        variant: "destructive",
      });
    },
  });

  const generateKrasMutation = useMutation({
    mutationFn: async (data: { role: string; department: string; company?: string }) => {
      const response = await apiRequest("POST", "/api/ai/generate-kras", data);
      return await response.json();
    },
    onSuccess: (response: any) => {
      const suggestions = response.suggestions || [];
      if (suggestions.length > 0) {
        // Replace existing goals with AI suggestions
        form.setValue("goals", suggestions);
        toast({
          title: "AI Suggestions Generated!",
          description: `Generated ${suggestions.length} KRA suggestions. Review and customize as needed.`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "AI Error",
        description: error.message || "Failed to generate KRA suggestions",
        variant: "destructive",
      });
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "goals",
  });

  const onSubmit = (data: z.infer<typeof templateFormSchema>) => {
    createTemplateMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New KRA Template</DialogTitle>
          <DialogDescription>
            Create a reusable template for Key Result Areas that can be assigned to team members.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Template Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Template Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., Sales Executive KRAs"
                      data-testid="input-template-name"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Describe what this KRA template is for..."
                      className="min-h-[80px]"
                      data-testid="textarea-template-description"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category */}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-template-category">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="engineering">Engineering</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="hr">Human Resources</SelectItem>
                      <SelectItem value="finance">Finance</SelectItem>
                      <SelectItem value="operations">Operations</SelectItem>
                      <SelectItem value="customer_success">Customer Success</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Goals Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Key Result Areas</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const templateName = form.getValues("name");
                      const category = form.getValues("category");
                      
                      if (!templateName || !category) {
                        toast({
                          title: "Missing Information",
                          description: "Please enter template name and category first for better AI suggestions.",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      generateKrasMutation.mutate({
                        role: templateName,
                        department: category,
                      });
                    }}
                    disabled={generateKrasMutation.isPending}
                    data-testid="button-ai-generate-kras"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    {generateKrasMutation.isPending ? "Generating..." : "AI Generate KRAs"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ title: "", description: "", target: "", metric: "" })}
                    data-testid="button-add-goal"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add KRA
                  </Button>
                </div>
              </div>

              {fields.map((field, index) => (
                <Card key={field.id} className="p-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">KRA {index + 1}</h4>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(index)}
                          data-testid={`button-remove-goal-${index}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    <FormField
                      control={form.control}
                      name={`goals.${index}.title`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., Revenue Growth"
                              data-testid={`input-goal-title-${index}`}
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`goals.${index}.description`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Detailed description of this KRA..."
                              data-testid={`textarea-goal-description-${index}`}
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`goals.${index}.target`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Target</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="e.g., $100K ARR"
                                data-testid={`input-goal-target-${index}`}
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`goals.${index}.metric`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Metric</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="e.g., Monthly Revenue"
                                data-testid={`input-goal-metric-${index}`}
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* AI Assistant Tip */}
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Brain className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                    AI-Powered KRA Generation
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-200">
                    Use AI to generate comprehensive KRA suggestions based on your template name and category. 
                    You can then customize and refine the generated KRAs to match your specific requirements.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="button-cancel-template"
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={createTemplateMutation.isPending}
                data-testid="button-submit-template"
              >
                {createTemplateMutation.isPending ? "Creating..." : "Create Template"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditTemplateDialog({ template, open, onClose }: { template: KraTemplateWithMeta; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  
  const form = useForm<z.infer<typeof templateFormSchema>>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: template.name,
      description: template.description || "",
      category: template.category || "general",
      goals: (template.goals as any[]) || [{ title: "", description: "", target: "", metric: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "goals",
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async (data: z.infer<typeof templateFormSchema>) => {
      const response = await apiRequest("PATCH", `/api/kra-templates/${template.id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "KRA template updated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/kra-templates"] });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update KRA template",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof templateFormSchema>) => {
    updateTemplateMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit KRA Template</DialogTitle>
          <DialogDescription>
            Update the template details and goals.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Template Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Template Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., Sales Executive KRAs"
                      data-testid="input-edit-template-name"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Describe what this KRA template is for..."
                      className="min-h-[80px]"
                      data-testid="textarea-edit-template-description"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category */}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-edit-template-category">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="engineering">Engineering</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="hr">Human Resources</SelectItem>
                      <SelectItem value="finance">Finance</SelectItem>
                      <SelectItem value="operations">Operations</SelectItem>
                      <SelectItem value="customer_success">Customer Success</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Goals Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Key Result Areas</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ title: "", description: "", target: "", metric: "" })}
                  data-testid="button-add-goal"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Goal
                </Button>
              </div>
              
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="border rounded-lg p-4 space-y-3 relative">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                      className="absolute top-2 right-2"
                      data-testid={`button-remove-goal-${index}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    
                    <FormField
                      control={form.control}
                      name={`goals.${index}.title`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Goal Title</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., Achieve monthly sales target"
                              data-testid={`input-edit-goal-title-${index}`}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name={`goals.${index}.description`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (Optional)</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Provide more details about this goal..."
                              className="min-h-[60px]"
                              data-testid={`textarea-edit-goal-description-${index}`}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name={`goals.${index}.target`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Target (Optional)</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="e.g., $100,000"
                                data-testid={`input-edit-goal-target-${index}`}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name={`goals.${index}.metric`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Metric (Optional)</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="e.g., Revenue, Units"
                                data-testid={`input-edit-goal-metric-${index}`}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                data-testid="button-cancel-edit-template"
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={updateTemplateMutation.isPending}
                data-testid="button-submit-edit-template"
              >
                {updateTemplateMutation.isPending ? "Updating..." : "Update Template"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AssignKraDialog({ trigger, template }: { trigger: React.ReactNode; template?: KraTemplateWithMeta }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  
  // Fetch active templates if not passed as prop
  const { data: templatesResponse, isLoading: templatesLoading } = useQuery<KraTemplatesResponse>({
    queryKey: ["/api/kra-templates", { active: true }],
    enabled: open && !template,
  });
  
  // Extract templates array from response, default to empty array
  const templates = templatesResponse?.templates || [];
  
  // Fetch assignable users - use regular users endpoint as fallback
  const { data: assignableUsers, isLoading: assignableLoading, error: assignableError } = useQuery<UserType[]>({
    queryKey: ["/api/users/assignable"],
    enabled: open,
  });
  
  // Fallback to regular users endpoint if assignable endpoint fails or returns empty
  const { data: allUsers = [], isLoading: allUsersLoading } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    enabled: open && (!assignableUsers || assignableUsers.length === 0 || assignableError),
  });
  
  // Use assignable users if available, otherwise use all users
  const users = (assignableUsers && assignableUsers.length > 0) ? assignableUsers : allUsers;
  const usersLoading = assignableLoading || allUsersLoading;
  
  const form = useForm({
    defaultValues: {
      templateId: template?.id || "",
      userIds: [] as string[],
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: "",
      reviewDate: "",
    },
  });
  
  // Update templateId when template prop changes
  useEffect(() => {
    if (template?.id) {
      form.setValue("templateId", template.id);
    }
  }, [template, form]);
  
  const selectedTemplate = template || templates.find(t => t.id === form.watch("templateId"));
  const selectedUserIds = form.watch("userIds");
  
  const assignKraMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/kra-assignments", {
        templateId: data.templateId,
        userIds: data.userIds,
        startDate: data.startDate,
        endDate: data.endDate || undefined,
        reviewDate: data.reviewDate || undefined,
        name: selectedTemplate?.name || "New KRA",
        description: selectedTemplate?.description || "",
        goals: selectedTemplate?.goals || [],
      });
      return await response.json();
    },
    onSuccess: (response) => {
      toast({
        title: "Success",
        description: response.message || "KRA assigned successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user-kras"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kra-templates"] });
      setOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign KRA",
        variant: "destructive",
      });
    },
  });
  
  const onSubmit = (data: any) => {
    if (data.userIds.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one user",
        variant: "destructive",
      });
      return;
    }
    
    if (!template && !data.templateId) {
      toast({
        title: "Error",
        description: "Please select a template",
        variant: "destructive",
      });
      return;
    }
    
    assignKraMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign KRA to Team Members</DialogTitle>
          <DialogDescription>
            {template 
              ? `Assign "${template.name}" to team members with specific dates.`
              : "Select a template and assign it to team members with specific dates."}
          </DialogDescription>
        </DialogHeader>
        
        {(templatesLoading || usersLoading) ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Template Selection - only show if no template prop */}
              {!template && (
                <FormField
                  control={form.control}
                  name="templateId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select Template</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger data-testid="select-template">
                          <SelectValue placeholder="Choose a template..." />
                        </SelectTrigger>
                        <SelectContent>
                          {templates && templates.length > 0 ? (
                            templates.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name} ({t.category})
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="" disabled>
                              No templates available
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              {/* User Selection (Multi-select) */}
              <FormField
                control={form.control}
                name="userIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Team Members</FormLabel>
                    <div className="border rounded-md p-2 max-h-32 overflow-y-auto">
                      {users && users.length > 0 ? users.map((user) => (
                        <div key={user.id} className="flex items-center space-x-2 py-1">
                          <input
                            type="checkbox"
                            id={`user-${user.id}`}
                            value={user.id}
                            checked={field.value.includes(user.id)}
                            onChange={(e) => {
                              const userId = e.target.value;
                              if (e.target.checked) {
                                field.onChange([...field.value, userId]);
                              } else {
                                field.onChange(field.value.filter((id: string) => id !== userId));
                              }
                            }}
                            className="rounded border-gray-300"
                            data-testid={`checkbox-user-${user.id}`}
                          />
                          <label 
                            htmlFor={`user-${user.id}`} 
                            className="text-sm flex-1 cursor-pointer"
                          >
                            {user.name} {user.email && `(${user.email})`}
                          </label>
                        </div>
                      )) : (
                        <p className="text-sm text-muted-foreground py-2">No users available</p>
                      )}
                    </div>
                    {selectedUserIds.length > 0 && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedUserIds.length} user(s) selected
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Date Fields */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          data-testid="input-start-date"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Date (Optional)</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          data-testid="input-end-date"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="reviewDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Review Date (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        data-testid="input-review-date"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Goals Preview */}
              {selectedTemplate && selectedTemplate.goals && (
                <div className="border rounded-lg p-4 bg-muted/50">
                  <Label className="text-sm font-medium mb-2 block">Goals to be Assigned</Label>
                  <div className="space-y-2">
                    {(selectedTemplate.goals as any[]).map((goal, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{goal.title}</p>
                          {goal.description && (
                            <p className="text-xs text-muted-foreground">{goal.description}</p>
                          )}
                          {(goal.target || goal.metric) && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {goal.target && `Target: ${goal.target}`}
                              {goal.target && goal.metric && " • "}
                              {goal.metric && `Metric: ${goal.metric}`}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setOpen(false)}
                  data-testid="button-cancel-assign"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={assignKraMutation.isPending}
                  data-testid="button-submit-assign"
                >
                  {assignKraMutation.isPending ? "Assigning..." : "Assign KRA"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({ template }: { template: KraTemplateWithMeta }) {
  const { data: currentUser } = useViewAsRole();
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/kra-templates/${template.id}`);
      if (!response.ok) {
        throw new Error("Failed to delete template");
      }
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Template deleted successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/kra-templates"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete template",
        variant: "destructive",
      });
    },
  });
  
  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async (active: boolean) => {
      const response = await apiRequest("PATCH", `/api/kra-templates/${template.id}/approve`, {
        active
      });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: template.isActive ? "Template deactivated" : "Template activated",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/kra-templates"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update template status",
        variant: "destructive",
      });
    },
  });
  
  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete "${template.name}"? This action cannot be undone.`)) {
      deleteTemplateMutation.mutate();
    }
  };
  
  const handleToggleActive = () => {
    toggleActiveMutation.mutate(!template.isActive);
  };

  return (
    <>
      <Card className="hover:shadow-md transition-shadow" data-testid={`card-template-${template.id}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="w-4 h-4" />
                {template.name}
              </CardTitle>
              <CardDescription>
                {template.description || "No description provided"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={template.isActive ? "default" : "secondary"}>
                {template.isActive ? "Active" : "Inactive"}
              </Badge>
              <Badge variant="outline">
                {template.category || "General"}
              </Badge>
              
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 w-8 p-0"
                      data-testid={`button-menu-${template.id}`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setEditDialogOpen(true)}
                      data-testid={`menu-edit-${template.id}`}
                    >
                      <Edit2 className="w-4 h-4 mr-2" />
                      Edit Template
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem
                      onClick={handleToggleActive}
                      disabled={toggleActiveMutation.isPending}
                      data-testid={`menu-toggle-active-${template.id}`}
                    >
                      {template.isActive ? (
                        <>
                          <XSquare className="w-4 h-4 mr-2" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <CheckSquare className="w-4 h-4 mr-2" />
                          Activate
                        </>
                      )}
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem
                      onClick={handleDelete}
                      disabled={deleteTemplateMutation.isPending}
                      className="text-destructive"
                      data-testid={`menu-delete-${template.id}`}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0">
          <div className="space-y-3">
            {template.goals && Array.isArray(template.goals) && template.goals.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Goals ({template.goals.length}):</p>
                <div className="space-y-1">
                  {template.goals.slice(0, 2).map((goal: any, index: number) => (
                    <div key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Circle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-1">{String(goal.title || goal)}</span>
                    </div>
                  ))}
                  {template.goals.length > 2 && (
                    <p className="text-xs text-muted-foreground ml-5">
                      +{template.goals.length - 2} more goals
                    </p>
                  )}
                </div>
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  Assignments: {template.assignmentCount || 0}
                </span>
              </div>
              
              <div className="flex gap-2">
                {canManage && (
                  <AssignKraDialog 
                    template={template}
                    trigger={
                      <Button variant="outline" size="sm" data-testid={`button-assign-${template.id}`}>
                        <Users className="w-3 h-3 mr-1" />
                        Assign
                      </Button>
                    }
                  />
                )}
                <Button variant="outline" size="sm" data-testid={`button-view-template-${template.id}`}>
                  View Details
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Edit Template Dialog */}
      {editDialogOpen && (
        <EditTemplateDialog 
          template={template}
          open={editDialogOpen}
          onClose={() => setEditDialogOpen(false)}
        />
      )}
    </>
  );
}

function UserKraCard({ userKra }: { userKra: UserKraWithDetails }) {
  const { data: currentUser } = useViewAsRole();
  const canEdit = currentUser?.role === 'admin' || 
    (currentUser?.role === 'manager' && userKra.assignee?.id !== currentUser.id);
  
  const progress = userKra.progress || 0;
  const targetProgress = 100; // Default target progress
  const progressPercentage = Math.min(progress, 100);
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'in_progress': return 'secondary';
      case 'overdue': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow" data-testid={`card-user-kra-${userKra.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              {userKra.template?.name || "KRA Assignment"}
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <User className="w-3 h-3" />
              {userKra.assignee?.name || "Unknown User"}
              {userKra.endDate && (
                <>
                  <span>•</span>
                  <Calendar className="w-3 h-3" />
                  Due: {format(typeof userKra.endDate === 'string' ? parseISO(userKra.endDate) : new Date(userKra.endDate), "MMM d, yyyy")}
                </>
              )}
            </CardDescription>
          </div>
          <Badge variant={getStatusColor(userKra.status)}>
            {userKra.status.replace('_', ' ')}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-4">
          {/* Progress Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm text-muted-foreground">
                {progress} / {targetProgress} ({Math.round(progressPercentage)}%)
              </span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>
          
          {/* Goals */}
          {userKra.goals && Array.isArray(userKra.goals) && userKra.goals.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Goals:</p>
              <div className="space-y-1">
                {userKra.goals.slice(0, 2).map((goal: any, index: number) => (
                  <div key={index} className="flex items-start gap-2 text-sm">
                    {goal.completed ? (
                      <CheckCircle className="w-3 h-3 mt-0.5 text-green-600 flex-shrink-0" />
                    ) : (
                      <Circle className="w-3 h-3 mt-0.5 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className={goal.completed ? "line-through text-muted-foreground" : ""}>
                      {String(goal.title || goal)}
                    </span>
                  </div>
                ))}
                {userKra.goals.length > 2 && (
                  <p className="text-xs text-muted-foreground ml-5">
                    +{userKra.goals.length - 2} more goals
                  </p>
                )}
              </div>
            </div>
          )}
          
          {/* Description as notes */}
          {userKra.description && (
            <div>
              <p className="text-sm font-medium mb-1">Description:</p>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {userKra.description}
              </p>
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Assigned by: {userKra.assignedByUser?.name || "Unknown"}
            </div>
            
            <div className="flex gap-2">
              {canEdit && (
                <Button variant="outline" size="sm" data-testid={`button-edit-kra-${userKra.id}`}>
                  <Edit2 className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              )}
              <Button variant="outline" size="sm" data-testid={`button-view-kra-${userKra.id}`}>
                View Details
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KraTemplates() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  
  const { data: templatesData, isLoading } = useQuery<KraTemplatesResponse>({
    queryKey: ["/api/kra-templates", { 
      page: 1, 
      limit: 20, 
      activeOnly: filterStatus === "active",
      category: filterCategory !== "all" ? filterCategory : undefined
    }],
    staleTime: 60 * 1000, // Cache for 1 minute
  });

  const filteredTemplates = templatesData?.templates?.filter(template => {
    const matchesSearch = !searchQuery || 
      template.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = filterStatus === "all" || 
      (filterStatus === "active" && template.isActive) ||
      (filterStatus === "inactive" && !template.isActive);
    
    return matchesSearch && matchesStatus;
  }) || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-templates"
          />
        </div>
        
        <div className="flex gap-2">
          {/* Persistent Create Template Button */}
          <CreateTemplateDialog 
            trigger={
              <Button data-testid="button-create-template-persistent">
                <Plus className="w-4 h-4 mr-2" />
                Create Template
              </Button>
            }
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="justify-between min-w-32" data-testid="button-filter-category">
                <Filter className="w-4 h-4 mr-2" />
                {filterCategory === "all" ? "All Categories" : filterCategory}
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setFilterCategory("all")}>
                All Categories
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterCategory("general")}>
                General
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterCategory("sales")}>
                Sales
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterCategory("engineering")}>
                Engineering
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="justify-between min-w-24" data-testid="button-filter-status">
                {filterStatus === "all" ? "All" : filterStatus === "active" ? "Active" : "Inactive"}
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setFilterStatus("all")}>
                All Templates
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterStatus("active")}>
                Active Only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterStatus("inactive")}>
                Inactive Only
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Templates List */}
      {filteredTemplates.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Templates Found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || filterStatus !== "all" || filterCategory !== "all" 
                  ? "No templates match your search criteria." 
                  : "Start by creating your first KRA template."}
              </p>
              <CreateTemplateDialog 
                trigger={
                  <Button data-testid="button-create-first-template">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Template
                  </Button>
                }
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredTemplates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
          
          {filteredTemplates.length < (templatesData?.pagination.total || 0) && (
            <div className="text-center py-4">
              <Button variant="outline" data-testid="button-load-more-templates">
                Load More Templates
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UserKras() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  const { data: krasData, isLoading } = useQuery<UserKrasResponse>({
    queryKey: ["/api/user-kras", { page: 1, limit: 20 }],
    staleTime: 30 * 1000, // Cache for 30 seconds
  });

  const filteredKras = krasData?.kras?.filter(kra => {
    const matchesSearch = !searchQuery || 
      kra.assignee?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      kra.template?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = filterStatus === "all" || kra.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  }) || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by user or template name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-kras"
          />
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="justify-between min-w-32" data-testid="button-filter-kra-status">
              <Filter className="w-4 h-4 mr-2" />
              {filterStatus === "all" ? "All Status" : filterStatus.replace('_', ' ')}
              <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setFilterStatus("all")}>
              All Status
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterStatus("not_started")}>
              Not Started
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterStatus("in_progress")}>
              In Progress
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterStatus("completed")}>
              Completed
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterStatus("overdue")}>
              Overdue
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* KRAs List */}
      {filteredKras.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No KRA Assignments</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || filterStatus !== "all"
                  ? "No KRA assignments match your search criteria."
                  : "No KRA assignments have been created yet."}
              </p>
              <AssignKraDialog 
                trigger={
                  <Button data-testid="button-assign-first-kra">
                    <Users className="w-4 h-4 mr-2" />
                    Assign First KRA
                  </Button>
                }
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredKras.map((kra) => (
            <UserKraCard key={kra.id} userKra={kra} />
          ))}
          
          {filteredKras.length < (krasData?.pagination.total || 0) && (
            <div className="text-center py-4">
              <Button variant="outline" data-testid="button-load-more-kras">
                Load More KRAs
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function KraManagementPage() {
  const { data: currentUser } = useViewAsRole();
  const { canAccessKraManagement, isLoading: featureLoading } = useFeatureAccess();
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  
  // Show loading while checking feature access
  if (featureLoading) {
    return (
      <>
        <Header
          title="KRA Management"
          description="Manage Key Result Areas for your team members"
        />
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
      </>
    );
  }
  
  // Show upgrade prompt if user doesn't have access to KRA Management
  if (!canAccessKraManagement) {
    return (
        <UpgradePrompt
        feature="kra_management"
        title="KRA Management"
        description="Unlock comprehensive Key Result Area management to set clear goals, track performance, and drive accountability across your organization."
      />
    );
  }
  
  return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">KRA Management</h2>
            <p className="text-muted-foreground">
              Manage Key Result Areas templates and track team progress.
            </p>
          </div>
        
          {canManage && (
          <div className="flex gap-2">
            <AssignKraDialog 
              trigger={
                <Button variant="outline" data-testid="button-assign-kra">
                  <Users className="w-4 h-4 mr-2" />
                  Assign KRA
                </Button>
              }
            />
            <CreateTemplateDialog 
              trigger={
                <Button data-testid="button-create-template">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Template
                </Button>
              }
            />
          </div>
          )}
        </div>

      {/* Main Content */}
      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="templates" data-testid="tab-templates">
            KRA Templates
          </TabsTrigger>
          <TabsTrigger value="assignments" data-testid="tab-assignments">
            KRA Assignments
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="templates" className="space-y-4">
          <KraTemplates />
        </TabsContent>
        
        <TabsContent value="assignments" className="space-y-4">
          <UserKras />
        </TabsContent>
      </Tabs>
    </div>
  );
}