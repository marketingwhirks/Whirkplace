import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Trash2, AlertCircle, Copy, FolderTree } from "lucide-react";

interface CategoryWithCounts {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  order: number;
  isDefault: boolean;
  createdAt: string;
  questionBankCount: number;
  organizationQuestionsCount: number;
  totalQuestions: number;
  duplicateCount?: number;
}

export function CategoryManager() {
  const { toast } = useToast();
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryWithCounts | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  // Fetch categories with counts
  const { data: categories = [], isLoading, refetch } = useQuery<CategoryWithCounts[]>({
    queryKey: ["/api/superadmin/categories"],
  });

  // Delete category mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      const response = await apiRequest("DELETE", `/api/superadmin/categories/${categoryId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete category");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Category deleted successfully",
      });
      refetch();
      setShowDeleteConfirmation(false);
      setCategoryToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete category",
        variant: "destructive",
      });
      setShowDeleteConfirmation(false);
    },
  });

  // Group categories by name to find duplicates
  const categoriesByName = categories.reduce((acc, category) => {
    const key = category.name.toLowerCase().trim();
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(category);
    return acc;
  }, {} as Record<string, CategoryWithCounts[]>);

  // Find duplicate categories
  const duplicateGroups = Object.entries(categoriesByName).filter(([_, cats]) => cats.length > 1);

  const handleDeleteClick = (category: CategoryWithCounts) => {
    setCategoryToDelete(category);
    setShowDeleteConfirmation(true);
  };

  const confirmDelete = () => {
    if (categoryToDelete) {
      deleteCategoryMutation.mutate(categoryToDelete.id);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Question Category Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Duplicate Categories Alert */}
          {duplicateGroups.length > 0 && (
            <Alert className="mb-6 border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <AlertTitle>Duplicate Categories Detected</AlertTitle>
              <AlertDescription>
                Found {duplicateGroups.length} set(s) of duplicate categories. Categories with the same name are highlighted below.
              </AlertDescription>
            </Alert>
          )}

          {/* Categories Table */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">Question Bank</TableHead>
                    <TableHead className="text-center">Org Questions</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories
                    .sort((a, b) => {
                      // Sort duplicates to the top
                      const aDupe = categoriesByName[a.name.toLowerCase().trim()]?.length > 1;
                      const bDupe = categoriesByName[b.name.toLowerCase().trim()]?.length > 1;
                      if (aDupe && !bDupe) return -1;
                      if (!aDupe && bDupe) return 1;
                      // Then by name
                      return a.name.localeCompare(b.name);
                    })
                    .map((category) => {
                      const isDuplicate = categoriesByName[category.name.toLowerCase().trim()]?.length > 1;
                      const canDelete = category.totalQuestions === 0 && !category.isDefault;

                      return (
                        <TableRow 
                          key={category.id} 
                          className={isDuplicate ? "bg-orange-50 dark:bg-orange-950/20" : ""}
                          data-testid={`row-category-${category.id}`}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {category.icon && <span>{category.icon}</span>}
                              {category.name}
                              {isDuplicate && (
                                <Badge variant="outline" className="text-orange-600">
                                  <Copy className="mr-1 h-3 w-3" />
                                  Duplicate
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {category.description || "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={category.questionBankCount > 0 ? "secondary" : "outline"}>
                              {category.questionBankCount}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={category.organizationQuestionsCount > 0 ? "secondary" : "outline"}>
                              {category.organizationQuestionsCount}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={category.totalQuestions > 0 ? "default" : "outline"}>
                              {category.totalQuestions}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {category.isDefault && (
                                <Badge variant="outline" className="text-xs">
                                  System
                                </Badge>
                              )}
                              {category.totalQuestions === 0 && (
                                <Badge variant="outline" className="text-xs text-green-600">
                                  Empty
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {canDelete ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteClick(category)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                data-testid={`button-delete-${category.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {category.isDefault ? "System" : "In use"}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Summary Stats */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{categories.length}</div>
                <p className="text-xs text-muted-foreground">Total Categories</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{duplicateGroups.length}</div>
                <p className="text-xs text-muted-foreground">Duplicate Sets</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {categories.filter(c => c.totalQuestions === 0 && !c.isDefault).length}
                </div>
                <p className="text-xs text-muted-foreground">Can Delete</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {categories.reduce((sum, c) => sum + c.totalQuestions, 0)}
                </div>
                <p className="text-xs text-muted-foreground">Total Questions</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the category "{categoryToDelete?.name}"?
              {categoryToDelete && categoriesByName[categoryToDelete.name.toLowerCase().trim()]?.length > 1 && (
                <Alert className="mt-4 border-orange-200 bg-orange-50">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <AlertDescription>
                    This is one of {categoriesByName[categoryToDelete.name.toLowerCase().trim()].length} categories with the same name. 
                    Deleting this will help clean up duplicates.
                  </AlertDescription>
                </Alert>
              )}
              <div className="mt-4 text-sm">
                This action cannot be undone. This category has:
                <ul className="mt-2 space-y-1">
                  <li>• {categoryToDelete?.questionBankCount || 0} questions in the question bank</li>
                  <li>• {categoryToDelete?.organizationQuestionsCount || 0} organization questions</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete Category
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}