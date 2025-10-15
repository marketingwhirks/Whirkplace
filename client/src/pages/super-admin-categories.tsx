import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Plus, Edit, Trash2, FolderTree, AlertCircle, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import type { KraCategory, QuestionCategory, KraTemplate, Question } from "@shared/schema";

// Form schemas
const categorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(50, "Category name too long"),
  description: z.string().max(200, "Description too long").optional(),
  order: z.number().int().min(0, "Order must be non-negative").default(0),
});

type CategoryFormData = z.infer<typeof categorySchema>;

export default function SuperAdminCategories() {
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const [selectedTab, setSelectedTab] = useState<"kra" | "question">("kra");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<KraCategory | QuestionCategory | null>(null);
  
  // Ensure only super admins can access this page
  if (!user?.isSuperAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>This page is only accessible to super administrators.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fetch KRA categories
  const { data: kraCategories, isLoading: isLoadingKra } = useQuery<KraCategory[]>({
    queryKey: ["/api/kra-categories"],
    enabled: selectedTab === "kra",
  });

  // Fetch question categories
  const { data: questionCategories, isLoading: isLoadingQuestion } = useQuery<QuestionCategory[]>({
    queryKey: ["/api/question-categories"],
    enabled: selectedTab === "question",
  });

  // Fetch KRA templates to count usage
  const { data: kraTemplates } = useQuery<KraTemplate[]>({
    queryKey: ["/api/kra/templates"],
    enabled: selectedTab === "kra",
  });

  // Fetch questions to count usage
  const { data: questions } = useQuery<Question[]>({
    queryKey: ["/api/questions"],
    enabled: selectedTab === "question",
  });

  // Count KRA templates using each category
  const getKraCategoryUsageCount = (categoryName: string) => {
    return kraTemplates?.filter(template => template.category === categoryName).length || 0;
  };

  // Count questions using each category
  const getQuestionCategoryUsageCount = (categoryId: string) => {
    return questions?.filter(question => question.categoryId === categoryId).length || 0;
  };

  // Create category form
  const createForm = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      description: "",
      order: 0,
    },
  });

  // Edit category form
  const editForm = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      description: "",
      order: 0,
    },
  });

  // Create KRA category mutation
  const createKraCategoryMutation = useMutation({
    mutationFn: async (data: CategoryFormData) => {
      return await apiRequest("/api/kra-categories", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kra-categories"] });
      toast({
        title: "Success",
        description: "KRA category created successfully",
      });
      setIsCreateDialogOpen(false);
      createForm.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create KRA category",
        variant: "destructive",
      });
    },
  });

  // Update KRA category mutation
  const updateKraCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CategoryFormData }) => {
      return await apiRequest(`/api/kra-categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kra-categories"] });
      toast({
        title: "Success",
        description: "KRA category updated successfully",
      });
      setIsEditDialogOpen(false);
      setSelectedCategory(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update KRA category",
        variant: "destructive",
      });
    },
  });

  // Delete KRA category mutation
  const deleteKraCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/kra-categories/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kra-categories"] });
      toast({
        title: "Success",
        description: "KRA category deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete KRA category",
        variant: "destructive",
      });
    },
  });

  // Create question category mutation
  const createQuestionCategoryMutation = useMutation({
    mutationFn: async (data: CategoryFormData) => {
      return await apiRequest("/api/question-categories", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/question-categories"] });
      toast({
        title: "Success",
        description: "Question category created successfully",
      });
      setIsCreateDialogOpen(false);
      createForm.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create question category",
        variant: "destructive",
      });
    },
  });

  // Update question category mutation
  const updateQuestionCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CategoryFormData }) => {
      return await apiRequest(`/api/question-categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/question-categories"] });
      toast({
        title: "Success",
        description: "Question category updated successfully",
      });
      setIsEditDialogOpen(false);
      setSelectedCategory(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update question category",
        variant: "destructive",
      });
    },
  });

  // Delete question category mutation
  const deleteQuestionCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/question-categories/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/question-categories"] });
      toast({
        title: "Success",
        description: "Question category deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete question category",
        variant: "destructive",
      });
    },
  });

  const handleCreateSubmit = (data: CategoryFormData) => {
    if (selectedTab === "kra") {
      createKraCategoryMutation.mutate(data);
    } else {
      createQuestionCategoryMutation.mutate(data);
    }
  };

  const handleEditSubmit = (data: CategoryFormData) => {
    if (!selectedCategory) return;
    
    if (selectedTab === "kra") {
      updateKraCategoryMutation.mutate({ id: selectedCategory.id, data });
    } else {
      updateQuestionCategoryMutation.mutate({ id: selectedCategory.id, data });
    }
  };

  const handleEdit = (category: KraCategory | QuestionCategory) => {
    setSelectedCategory(category);
    editForm.reset({
      name: category.name,
      description: category.description || "",
      order: "order" in category ? category.order : 0,
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (selectedTab === "kra") {
      deleteKraCategoryMutation.mutate(id);
    } else {
      deleteQuestionCategoryMutation.mutate(id);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FolderTree className="h-6 w-6" />
                Category Management
              </CardTitle>
              <CardDescription>
                Manage KRA and Question categories for the platform
              </CardDescription>
            </div>
            <Badge variant="destructive">Super Admin Only</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedTab} onValueChange={(value) => setSelectedTab(value as "kra" | "question")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="kra">KRA Categories</TabsTrigger>
              <TabsTrigger value="question">Question Categories</TabsTrigger>
            </TabsList>

            {/* KRA Categories Tab */}
            <TabsContent value="kra">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">KRA Categories</h3>
                  <Button onClick={() => {
                    createForm.reset();
                    setIsCreateDialogOpen(true);
                  }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Category
                  </Button>
                </div>

                {isLoadingKra ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Templates Using</TableHead>
                        <TableHead>Created Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kraCategories?.map((category) => (
                        <TableRow key={category.id}>
                          <TableCell className="font-medium">{category.name}</TableCell>
                          <TableCell>{category.description || "-"}</TableCell>
                          <TableCell>{category.order}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {getKraCategoryUsageCount(category.name)} templates
                            </Badge>
                          </TableCell>
                          <TableCell>{format(new Date(category.createdAt), "MMM dd, yyyy")}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEdit(category)}
                                data-testid={`button-edit-kra-${category.id}`}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    data-testid={`button-delete-kra-${category.id}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete KRA Category</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete "{category.name}"? 
                                      {getKraCategoryUsageCount(category.name) > 0 && (
                                        <span className="block mt-2 text-yellow-600">
                                          Warning: This category is used by {getKraCategoryUsageCount(category.name)} template(s).
                                        </span>
                                      )}
                                      This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(category.id)}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!kraCategories || kraCategories.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-gray-500">
                            No KRA categories found. Create your first category.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>
            </TabsContent>

            {/* Question Categories Tab */}
            <TabsContent value="question">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Question Categories</h3>
                  <Button onClick={() => {
                    createForm.reset();
                    setIsCreateDialogOpen(true);
                  }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Category
                  </Button>
                </div>

                {isLoadingQuestion ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Icon</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Questions Using</TableHead>
                        <TableHead>Created Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {questionCategories?.map((category) => (
                        <TableRow key={category.id}>
                          <TableCell className="font-medium">{category.name}</TableCell>
                          <TableCell>{category.description || "-"}</TableCell>
                          <TableCell>{category.icon || "-"}</TableCell>
                          <TableCell>{category.order}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {getQuestionCategoryUsageCount(category.id)} questions
                            </Badge>
                          </TableCell>
                          <TableCell>{format(new Date(category.createdAt), "MMM dd, yyyy")}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEdit(category)}
                                data-testid={`button-edit-question-${category.id}`}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    data-testid={`button-delete-question-${category.id}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Question Category</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete "{category.name}"? 
                                      {getQuestionCategoryUsageCount(category.id) > 0 && (
                                        <span className="block mt-2 text-yellow-600">
                                          Warning: This category is used by {getQuestionCategoryUsageCount(category.id)} question(s).
                                        </span>
                                      )}
                                      This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(category.id)}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!questionCategories || questionCategories.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-gray-500">
                            No question categories found. Create your first category.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Create Category Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create {selectedTab === "kra" ? "KRA" : "Question"} Category</DialogTitle>
            <DialogDescription>
              Add a new category for {selectedTab === "kra" ? "KRA templates" : "questions"}.
            </DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(handleCreateSubmit)} className="space-y-4">
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter category name"
                        {...field}
                        data-testid="input-category-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter category description"
                        {...field}
                        data-testid="input-category-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        data-testid="input-category-order"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    selectedTab === "kra"
                      ? createKraCategoryMutation.isPending
                      : createQuestionCategoryMutation.isPending
                  }
                  data-testid="button-create-category"
                >
                  Create Category
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Category Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {selectedTab === "kra" ? "KRA" : "Question"} Category</DialogTitle>
            <DialogDescription>
              Update the category details.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter category name"
                        {...field}
                        data-testid="input-edit-category-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter category description"
                        {...field}
                        data-testid="input-edit-category-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        data-testid="input-edit-category-order"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    selectedTab === "kra"
                      ? updateKraCategoryMutation.isPending
                      : updateQuestionCategoryMutation.isPending
                  }
                  data-testid="button-update-category"
                >
                  Update Category
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}