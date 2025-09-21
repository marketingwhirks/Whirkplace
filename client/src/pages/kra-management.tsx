import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Target, Plus, Search, Filter, Settings, Users, CheckCircle, 
  Circle, ChevronDown, Calendar, User, BarChart3, Edit2, X, Brain, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import Header from "@/components/layout/header";
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
      return apiRequest("/api/kra-templates", {
        method: "POST",
        body: JSON.stringify(data),
      });
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
      return apiRequest("/api/ai/generate-kras", {
        method: "POST",
        body: JSON.stringify(data),
      });
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

function AssignKraDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  
  const handleAssign = () => {
    toast({
      title: "Coming Soon",
      description: "KRA assignment interface will be available soon!",
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign KRA to Team Member</DialogTitle>
          <DialogDescription>
            Select a template and assign it to a team member with specific goals and deadlines.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-center py-8">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Assignment interface coming soon...
            </p>
            <Button 
              className="mt-4" 
              onClick={handleAssign}
              data-testid="button-assign-kra-placeholder"
            >
              Assign KRA
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({ template }: { template: KraTemplateWithMeta }) {
  const { data: currentUser } = useViewAsRole();
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  return (
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
      <>
        <Header
          title="KRA Management"
          description="Manage Key Result Areas for your team members"
        />
        <UpgradePrompt
        feature="kra_management"
        title="KRA Management"
        description="Unlock comprehensive Key Result Area management to set clear goals, track performance, and drive accountability across your organization."
      />
      </>
    );
  }
  
  return (
    <>
      <Header
        title="KRA Management"
        description="Manage Key Result Areas templates and track team progress"
      />
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
    </>
  );
}