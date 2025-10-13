import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Target, Plus, Upload, Trash2, Edit2, CheckCircle, Eye, 
  Building, Briefcase, Filter, Search, Download, AlertCircle, Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { KraTemplate } from "@shared/schema";
import { getUniqueCategories, getUniqueDepartments } from "@shared/defaultKraTemplates";

interface KraTemplateWithMeta extends KraTemplate {
  assignmentCount?: number;
  jobTitle?: string;
  industries?: string;
}

interface KraTemplatesResponse {
  templates: KraTemplateWithMeta[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function TemplatePreviewDialog({ template, open, onClose }: { 
  template: KraTemplateWithMeta | null; 
  open: boolean; 
  onClose: () => void;
}) {
  if (!template) return null;
  
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template.name}</DialogTitle>
          <DialogDescription>{template.description}</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Category</h4>
            <Badge variant="outline">{template.category}</Badge>
          </div>
          
          {template.jobTitle && (
            <div>
              <h4 className="font-medium mb-2">Job Title</h4>
              <p className="text-sm text-muted-foreground">{template.jobTitle}</p>
            </div>
          )}
          
          {template.industries && (
            <div>
              <h4 className="font-medium mb-2">Industries</h4>
              <div className="flex flex-wrap gap-1">
                {template.industries.split(',').map((industry, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {industry.trim()}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          <div>
            <h4 className="font-medium mb-2">Key Result Areas</h4>
            <div className="space-y-3">
              {(template.goals as any[]).map((goal, index) => (
                <div key={index} className="border rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{goal.title}</p>
                      {goal.description && (
                        <p className="text-xs text-muted-foreground mt-1">{goal.description}</p>
                      )}
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        {goal.target && <span>Target: {goal.target}</span>}
                        {goal.metric && <span>Metric: {goal.metric}</span>}
                        {goal.weight && <span>Weight: {goal.weight}%</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function KraTemplatesManager() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<KraTemplateWithMeta | null>(null);
  const [importType, setImportType] = useState<"all" | "patrick" | "whirks">("all");
  
  const categories = getUniqueCategories();
  const departments = getUniqueDepartments();
  
  // Fetch existing templates
  const { data: templatesResponse, isLoading, refetch } = useQuery<KraTemplatesResponse>({
    queryKey: ["/api/kra-templates", { all: true }],
  });
  
  const templates = templatesResponse?.templates || [];
  
  // Check if default templates exist
  const { data: templateStats } = useQuery({
    queryKey: ["/api/kra-templates/stats"],
  });
  
  // Import default templates
  const importTemplateMutation = useMutation({
    mutationFn: async (organization: "all" | "patrick" | "whirks") => {
      // Use simpler endpoint for "all" to ensure reliability in production
      const endpoint = organization === "all" 
        ? "/api/kra-templates/import-all" 
        : "/api/kra-templates/import-defaults";
      
      const body = organization === "all" ? {} : { organization };
      
      const response = await apiRequest("POST", endpoint, body);
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `Imported ${data.imported} templates successfully!`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/kra-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kra-templates/stats"] });
      setShowImportDialog(false);
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import templates",
        variant: "destructive",
      });
    },
  });
  
  // Delete template
  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await apiRequest("DELETE", `/api/kra-templates/${templateId}`);
      if (!response.ok) throw new Error("Failed to delete template");
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Template deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/kra-templates"] });
      setDeleteTemplateId(null);
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete template",
        variant: "destructive",
      });
    },
  });
  
  // Filter templates
  const filteredTemplates = templates.filter(template => {
    const matchesSearch = searchTerm === "" || 
      template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = filterCategory === "all" || template.category === filterCategory;
    const matchesDepartment = filterDepartment === "all" || 
      (template.jobTitle?.toLowerCase().includes(filterDepartment.toLowerCase()) ||
       template.category?.toLowerCase().includes(filterDepartment.toLowerCase()));
    
    return matchesSearch && matchesCategory && matchesDepartment;
  });
  
  const handleImport = () => {
    importTemplateMutation.mutate(importType);
  };
  
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">KRA Template Library</h3>
          <p className="text-sm text-muted-foreground">
            Manage and import Key Result Area templates for your organization
          </p>
        </div>
        <Button 
          onClick={() => setShowImportDialog(true)}
          className="flex items-center gap-2"
          data-testid="button-import-templates"
        >
          <Upload className="w-4 h-4" />
          Import Default Templates
        </Button>
      </div>
      
      {/* Statistics */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Templates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{templates.length}</div>
            <p className="text-xs text-muted-foreground">
              Available in your organization
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
            <p className="text-xs text-muted-foreground">
              Different template categories
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Available to Import</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">28</div>
            <p className="text-xs text-muted-foreground">
              Default templates ready to import
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
            data-testid="input-search-templates"
          />
        </div>
        
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48" data-testid="select-filter-category">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={filterDepartment} onValueChange={setFilterDepartment}>
          <SelectTrigger className="w-48" data-testid="select-filter-department">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map(dept => (
              <SelectItem key={dept} value={dept.toLowerCase()}>{dept}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Templates List */}
      {filteredTemplates.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Templates Found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {templates.length === 0 
                ? "Import default templates to get started with pre-built KRA templates."
                : "No templates match your search criteria."}
            </p>
            {templates.length === 0 && (
              <Button 
                onClick={() => setShowImportDialog(true)}
                data-testid="button-import-empty"
              >
                Import Default Templates
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredTemplates.map((template) => (
            <Card key={template.id}>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-base">{template.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {template.description}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setPreviewTemplate(template)}
                      data-testid={`button-preview-${template.id}`}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setDeleteTemplateId(template.id)}
                      data-testid={`button-delete-${template.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm">
                  <Badge variant="secondary">{template.category}</Badge>
                  {template.assignmentCount && template.assignmentCount > 0 && (
                    <span className="text-muted-foreground">
                      {template.assignmentCount} assignments
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {(template.goals as any[]).length} KRAs
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Default KRA Templates</DialogTitle>
            <DialogDescription>
              Import pre-built KRA templates for common roles and departments.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium mb-1">Available Templates</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• 19 templates from Patrick Accounting</li>
                    <li>• 9 templates from Whirks</li>
                    <li>• Total: 28 role-specific templates</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Import Options</label>
              <Select value={importType} onValueChange={(value: any) => setImportType(value)}>
                <SelectTrigger data-testid="select-import-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Templates (28)</SelectItem>
                  <SelectItem value="patrick">Patrick Accounting Only (19)</SelectItem>
                  <SelectItem value="whirks">Whirks Only (9)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="text-sm text-muted-foreground">
              <p>Templates will be imported with:</p>
              <ul className="mt-1 space-y-1">
                <li>• Role-specific KRAs and metrics</li>
                <li>• Industry categorization</li>
                <li>• Default weights and targets</li>
              </ul>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowImportDialog(false)}
              data-testid="button-cancel-import"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleImport}
              disabled={importTemplateMutation.isPending}
              data-testid="button-confirm-import"
            >
              {importTemplateMutation.isPending ? "Importing..." : "Import Templates"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTemplateId} onOpenChange={() => setDeleteTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
              Any existing KRA assignments using this template will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteTemplateId && deleteTemplateMutation.mutate(deleteTemplateId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Preview Dialog */}
      <TemplatePreviewDialog 
        template={previewTemplate}
        open={!!previewTemplate}
        onClose={() => setPreviewTemplate(null)}
      />
    </div>
  );
}