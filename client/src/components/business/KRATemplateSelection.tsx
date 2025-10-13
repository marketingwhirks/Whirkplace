import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Award, Check, ChevronRight, ChevronDown, Search, Clock,
  Briefcase, Plus, Loader2, Eye, Users, Target, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface KRATemplate {
  id: string;
  name: string;
  jobTitle: string;
  description: string;
  category: string;
  goals: any[];
}

interface GroupedTemplates {
  [category: string]: KRATemplate[];
}

interface KRATemplateSelectionProps {
  industry: string;
  organizationId: string;
  onComplete: (selectedTemplateIds: string[]) => void;
  onSkip?: () => void;
}

export function KRATemplateSelection({ 
  industry, 
  organizationId, 
  onComplete, 
  onSkip 
}: KRATemplateSelectionProps) {
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<KRATemplate | null>(null);
  const [generateJobTitle, setGenerateJobTitle] = useState("");
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const { toast } = useToast();
  
  // Fetch templates for the industry
  const { data: templateData, isLoading } = useQuery({
    queryKey: [`/api/kra-templates/industry/${industry}`],
    enabled: !!industry
  });
  
  // Import templates mutation
  const importMutation = useMutation({
    mutationFn: async (templateIds: string[]) => {
      return apiRequest('/api/kra-templates/import', {
        method: 'POST',
        body: JSON.stringify({ templateIds })
      });
    },
    onSuccess: () => {
      toast({
        title: "Templates Imported",
        description: `Successfully imported ${selectedTemplates.size} templates to your organization.`
      });
      onComplete(Array.from(selectedTemplates));
    },
    onError: () => {
      toast({
        title: "Import Failed",
        description: "Failed to import templates. Please try again.",
        variant: "destructive"
      });
    }
  });
  
  // Generate AI template mutation
  const generateMutation = useMutation({
    mutationFn: async (data: { jobTitle: string; industry: string }) => {
      return apiRequest('/api/kra-templates/generate', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Template Generated",
        description: `Successfully generated KRA template for ${generateJobTitle}.`
      });
      setShowGenerateDialog(false);
      setGenerateJobTitle("");
      // Add the generated template to selected
      if (data.template) {
        setSelectedTemplates(prev => new Set(prev).add(data.template.id));
      }
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Failed to generate template. Please try again.",
        variant: "destructive"
      });
    }
  });
  
  const templates = templateData?.templates || {};
  const categories = Object.keys(templates);
  const totalTemplates = Object.values(templates).reduce((acc: number, arr: any[]) => acc + arr.length, 0);
  
  // Filter templates based on search
  const filteredTemplates: GroupedTemplates = {};
  if (searchQuery) {
    categories.forEach(category => {
      const filtered = templates[category].filter((t: KRATemplate) =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.jobTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (filtered.length > 0) {
        filteredTemplates[category] = filtered;
      }
    });
  } else {
    Object.assign(filteredTemplates, templates);
  }
  
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };
  
  const toggleTemplate = (templateId: string) => {
    setSelectedTemplates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(templateId)) {
        newSet.delete(templateId);
      } else {
        newSet.add(templateId);
      }
      return newSet;
    });
  };
  
  const selectAllInCategory = (category: string) => {
    const categoryTemplates = templates[category] || [];
    setSelectedTemplates(prev => {
      const newSet = new Set(prev);
      categoryTemplates.forEach((t: KRATemplate) => newSet.add(t.id));
      return newSet;
    });
  };
  
  const deselectAllInCategory = (category: string) => {
    const categoryTemplates = templates[category] || [];
    setSelectedTemplates(prev => {
      const newSet = new Set(prev);
      categoryTemplates.forEach((t: KRATemplate) => newSet.delete(t.id));
      return newSet;
    });
  };
  
  const handleImport = () => {
    if (selectedTemplates.size === 0) {
      toast({
        title: "No Templates Selected",
        description: "Please select at least one template to import.",
        variant: "destructive"
      });
      return;
    }
    importMutation.mutate(Array.from(selectedTemplates));
  };
  
  const handleGenerate = () => {
    if (!generateJobTitle.trim()) {
      toast({
        title: "Job Title Required",
        description: "Please enter a job title to generate a template.",
        variant: "destructive"
      });
      return;
    }
    generateMutation.mutate({ jobTitle: generateJobTitle, industry });
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-semibold">Select KRA Templates</h3>
          <p className="text-muted-foreground mt-1">
            Choose templates relevant to your organization's roles
          </p>
        </div>
        <div className="text-right">
          <Badge variant="secondary" className="mb-2">
            <Award className="h-3 w-3 mr-1" />
            {totalTemplates} templates available
          </Badge>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-3 w-3" />
            Save ~2 hours per role
          </div>
        </div>
      </div>
      
      {/* Alert about benefits */}
      <Alert className="bg-blue-50 border-blue-200">
        <Sparkles className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          <strong>Pro tip:</strong> Using templates saves an average of 2 hours per role setup and ensures consistency across your organization.
        </AlertDescription>
      </Alert>
      
      {/* Search and actions bar */}
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates by name, role, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-template-search"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setShowGenerateDialog(true)}
          data-testid="button-generate-template"
        >
          <Plus className="h-4 w-4 mr-2" />
          Generate New
        </Button>
      </div>
      
      {/* Template categories */}
      <ScrollArea className="h-[400px] border rounded-lg">
        <div className="p-4 space-y-4">
          {Object.keys(filteredTemplates).map(category => {
            const categoryTemplates = filteredTemplates[category];
            const selectedCount = categoryTemplates.filter((t: KRATemplate) => 
              selectedTemplates.has(t.id)
            ).length;
            const isExpanded = expandedCategories.has(category);
            
            return (
              <Card key={category} className="overflow-hidden">
                <CardHeader 
                  className="pb-3 cursor-pointer"
                  onClick={() => toggleCategory(category)}
                  data-testid={`button-expand-${category}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isExpanded ? 
                        <ChevronDown className="h-4 w-4" /> : 
                        <ChevronRight className="h-4 w-4" />
                      }
                      <CardTitle className="text-base capitalize">
                        {category} Department
                      </CardTitle>
                      <Badge variant="outline">
                        {selectedCount}/{categoryTemplates.length} selected
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectAllInCategory(category);
                        }}
                        data-testid={`button-select-all-${category}`}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          deselectAllInCategory(category);
                        }}
                        data-testid={`button-deselect-all-${category}`}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent>
                    <div className="space-y-2">
                      {categoryTemplates.map((template: KRATemplate) => (
                        <div
                          key={template.id}
                          className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={selectedTemplates.has(template.id)}
                            onCheckedChange={() => toggleTemplate(template.id)}
                            data-testid={`checkbox-template-${template.id}`}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{template.jobTitle || template.name}</span>
                              <Badge variant="secondary" className="text-xs">
                                {template.goals?.length || 0} KRAs
                              </Badge>
                            </div>
                            {template.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {template.description.substring(0, 100)}...
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPreviewTemplate(template)}
                            data-testid={`button-preview-${template.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </ScrollArea>
      
      {/* Footer with actions */}
      <div className="flex items-center justify-between pt-4 border-t">
        <div className="text-sm text-muted-foreground">
          {selectedTemplates.size} template{selectedTemplates.size !== 1 ? 's' : ''} selected
        </div>
        <div className="flex items-center gap-3">
          {onSkip && (
            <Button
              variant="outline"
              onClick={onSkip}
              data-testid="button-skip-templates"
            >
              Skip This Step
            </Button>
          )}
          <Button
            onClick={handleImport}
            disabled={selectedTemplates.size === 0 || importMutation.isPending}
            data-testid="button-import-templates"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Import Selected Templates
              </>
            )}
          </Button>
        </div>
      </div>
      
      {/* Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewTemplate?.name}</DialogTitle>
            <DialogDescription>{previewTemplate?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Job Title</Label>
              <p className="text-sm mt-1">{previewTemplate?.jobTitle || previewTemplate?.name}</p>
            </div>
            <div>
              <Label>Key Result Areas</Label>
              <div className="space-y-2 mt-2">
                {previewTemplate?.goals?.map((goal: any, index: number) => (
                  <Card key={index}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{goal.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {goal.description && (
                        <p className="text-sm text-muted-foreground">{goal.description}</p>
                      )}
                      {goal.metric && (
                        <Badge variant="outline" className="mt-2">
                          <Target className="h-3 w-3 mr-1" />
                          {goal.metric}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
              Close
            </Button>
            <Button 
              onClick={() => {
                toggleTemplate(previewTemplate!.id);
                setPreviewTemplate(null);
              }}
              data-testid="button-select-from-preview"
            >
              {selectedTemplates.has(previewTemplate?.id || '') ? 
                'Remove from Selection' : 'Add to Selection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Generate Template Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate KRA Template with AI</DialogTitle>
            <DialogDescription>
              Enter a job title to generate a custom KRA template for your industry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Job Title</Label>
              <Input
                placeholder="e.g., Customer Success Manager, DevOps Engineer..."
                value={generateJobTitle}
                onChange={(e) => setGenerateJobTitle(e.target.value)}
                className="mt-1"
                data-testid="input-job-title"
              />
            </div>
            <Alert>
              <Sparkles className="h-4 w-4" />
              <AlertDescription>
                AI will generate relevant KRAs based on industry best practices for {industry}.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleGenerate}
              disabled={!generateJobTitle.trim() || generateMutation.isPending}
              data-testid="button-generate-ai"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Template
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}