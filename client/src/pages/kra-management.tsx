import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Target, Plus, Search, Filter, Settings, Users, CheckCircle, 
  Circle, ChevronDown, Calendar, User, BarChart3, Edit2
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
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useViewAsRole } from "@/hooks/useViewAsRole";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import type { KraTemplate, UserKra, User as UserType } from "@shared/schema";

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
  
  const handleCreate = () => {
    toast({
      title: "Coming Soon",
      description: "KRA template creation will be available soon!",
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
          <DialogTitle>Create New KRA Template</DialogTitle>
          <DialogDescription>
            Create a reusable template for Key Result Areas that can be assigned to team members.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-center py-8">
            <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Template creation interface coming soon...
            </p>
            <Button 
              className="mt-4" 
              onClick={handleCreate}
              data-testid="button-create-template-placeholder"
            >
              Create Template
            </Button>
          </div>
        </div>
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
              <DropdownMenuItem onClick={() => setFilterCategory("development")}>
                Development
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
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Header */}
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