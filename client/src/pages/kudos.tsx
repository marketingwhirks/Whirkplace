import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDistanceToNow } from "date-fns";
import { Plus, Edit, Trash2, Users, Lock, Unlock, Heart, Star, MessageCircle, Send, Gift } from "lucide-react";

import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

import type { Kudos, User, InsertKudos } from "@shared/schema";
import { insertKudosSchema, defaultCompanyValuesArray } from "@shared/schema";

// Form schema for kudos creation - fromUserId is set server-side
const kudosFormSchema = insertKudosSchema.extend({
  message: z.string().min(1, "Message is required").max(500, "Message too long"),
  toUserId: z.string().min(1, "Please select a recipient"),
});

type KudosForm = z.infer<typeof kudosFormSchema>;

export default function KudosPage() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingKudos, setEditingKudos] = useState<Kudos | null>(null);
  const [filter, setFilter] = useState<"all" | "received" | "given" | "public">("all");
  const [deleteKudos, setDeleteKudos] = useState<Kudos | null>(null);

  // Fetch kudos with proper filter parameters
  const { data: kudos = [], isLoading: kudosLoading } = useQuery<Kudos[]>({
    queryKey: ["/api/kudos", {
      ...(filter === "public" && { public: "true" }),
      ...(filter === "received" && { userId: "current-user-id", type: "received" }),
      ...(filter === "given" && { userId: "current-user-id", type: "given" }),
    }],
  });

  // Fetch users for recipient selection and display names
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Create kudos form
  const createForm = useForm<KudosForm>({
    resolver: zodResolver(kudosFormSchema),
    defaultValues: {
      message: "",
      toUserId: "",
      isPublic: true,
      values: [],
    },
  });

  // Edit kudos form
  const editFormSchema = z.object({
    message: z.string().min(1, "Message is required").max(500, "Message too long"),
    isPublic: z.boolean().default(true),
    values: z.array(z.string()).min(1, "At least one company value must be selected"),
  });

  const editForm = useForm<z.infer<typeof editFormSchema>>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      message: "",
      isPublic: true,
      values: [],
    },
  });

  // Create kudos mutation
  const createKudosMutation = useMutation({
    mutationFn: async (data: KudosForm) => {
      return apiRequest("POST", "/api/kudos", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kudos"] });
      createForm.reset();
      setShowCreateDialog(false);
      toast({
        title: "Success",
        description: "Kudos sent successfully! 🎉",
      });
    },
    onError: (error) => {
      console.error("Kudos creation error:", error);
      toast({
        title: "Error",
        description: "Failed to send kudos",
        variant: "destructive",
      });
    },
  });

  // Update kudos mutation
  const updateKudosMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<KudosForm> }) => {
      return apiRequest("PATCH", `/api/kudos/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kudos"] });
      setEditingKudos(null);
      editForm.reset();
      toast({
        title: "Success",
        description: "Kudos updated successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update kudos",
        variant: "destructive",
      });
    },
  });

  // Delete kudos mutation
  const deleteKudosMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/kudos/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kudos"] });
      toast({
        title: "Success",
        description: "Kudos deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete kudos",
        variant: "destructive",
      });
    },
  });

  // Get user name by ID
  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user?.name || "Unknown User";
  };

  // Get user initials for avatar
  const getUserInitials = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user?.name) return "?";
    return user.name
      .split(" ")
      .map(name => name.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Handle create form submission
  const onCreateSubmit = createForm.handleSubmit((data) => {
    // fromUserId is now set server-side for security
    createKudosMutation.mutate(data);
  });

  // Handle edit form submission
  const onEditSubmit = editForm.handleSubmit((data) => {
    if (!editingKudos) return;
    updateKudosMutation.mutate({
      id: editingKudos.id,
      data,
    });
  });

  // Open edit dialog
  const openEditDialog = (kudosItem: Kudos) => {
    setEditingKudos(kudosItem);
    editForm.reset({
      message: kudosItem.message,
      isPublic: kudosItem.isPublic,
      values: kudosItem.values,
    });
  };

  // No client-side filtering needed - server handles all filtering based on API parameters

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header 
        title="Team Kudos"
        description="Recognize your teammates and celebrate wins together"
      />
      <div className="flex-1 container mx-auto px-4 py-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">Kudos</h1>
              <p className="text-muted-foreground">
                Celebrate and recognize your teammates' great work
              </p>
            </div>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button data-testid="button-give-kudos">
                  <Gift className="mr-2 h-4 w-4" />
                  Give Kudos
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Give Kudos</DialogTitle>
                  <DialogDescription>
                    Recognize someone for their amazing work and the company values they demonstrate.
                  </DialogDescription>
                </DialogHeader>

                <Form {...createForm}>
                  <form onSubmit={onCreateSubmit} className="space-y-4">
                    {/* Recipient Selection */}
                    <FormField
                      control={createForm.control}
                      name="toUserId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Recipient *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-recipient">
                                <SelectValue placeholder="Choose someone to recognize" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {users.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  <div className="flex items-center gap-2">
                                    <Avatar className="h-6 w-6">
                                      <AvatarFallback className="text-xs">
                                        {getUserInitials(user.id)}
                                      </AvatarFallback>
                                    </Avatar>
                                    {user.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Message */}
                    <FormField
                      control={createForm.control}
                      name="message"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your Message *</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Tell everyone what makes this person amazing..."
                              className="min-h-[100px]"
                              data-testid="input-message"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Company Values */}
                    <FormField
                      control={createForm.control}
                      name="values"
                      render={() => (
                        <FormItem>
                          <FormLabel>Company Values Demonstrated *</FormLabel>
                          <div className="grid grid-cols-1 gap-3 mt-2">
                            {defaultCompanyValuesArray.map((value) => (
                              <FormField
                                key={value}
                                control={createForm.control}
                                name="values"
                                render={({ field }) => (
                                  <FormItem
                                    key={value}
                                    className="flex flex-row items-center space-x-3 space-y-0"
                                  >
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(value)}
                                        onCheckedChange={(checked) => {
                                          return checked
                                            ? field.onChange([...field.value, value])
                                            : field.onChange(
                                                field.value?.filter(
                                                  (val) => val !== value
                                                )
                                              );
                                        }}
                                        data-testid={`checkbox-value-${value.replace(/\s+/g, '-')}`}
                                      />
                                    </FormControl>
                                    <FormLabel className="text-sm font-normal capitalize">
                                      {value}
                                    </FormLabel>
                                  </FormItem>
                                )}
                              />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Public/Private Toggle */}
                    <FormField
                      control={createForm.control}
                      name="isPublic"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">
                              Public Recognition
                            </FormLabel>
                            <FormDescription className="text-sm text-muted-foreground">
                              Share this kudos with the team and post to Slack
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-public"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowCreateDialog(false)}
                        data-testid="button-cancel"
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={createKudosMutation.isPending}
                        data-testid="button-send-kudos"
                      >
                        {createKudosMutation.isPending ? (
                          <>Sending...</>
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            Send Kudos
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Tabs for filtering */}
          <Tabs value={filter} onValueChange={(value) => setFilter(value as any)}>
            <TabsList>
              <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
              <TabsTrigger value="received" data-testid="tab-received">Received</TabsTrigger>
              <TabsTrigger value="given" data-testid="tab-given">Given</TabsTrigger>
              <TabsTrigger value="public" data-testid="tab-public">Public</TabsTrigger>
            </TabsList>

            {/* Kudos Feed */}
            <div className="mt-6">
              {kudosLoading ? (
                <div className="grid gap-4">
                  {[...Array(3)].map((_, i) => (
                    <Card key={i} data-testid={`skeleton-${i}`}>
                      <CardContent className="p-6">
                        <div className="animate-pulse space-y-4">
                          <div className="h-4 bg-muted rounded w-3/4"></div>
                          <div className="h-4 bg-muted rounded w-1/2"></div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : kudos.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Heart className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No kudos yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Be the first to recognize someone's great work!
                    </p>
                    <Button 
                      onClick={() => setShowCreateDialog(true)}
                      data-testid="button-give-first-kudos"
                    >
                      <Gift className="mr-2 h-4 w-4" />
                      Give First Kudos
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4" data-testid="kudos-feed">
                  {kudos.map((kudosItem) => (
                    <Card key={kudosItem.id} data-testid={`kudos-${kudosItem.id}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback>
                                {getUserInitials(kudosItem.fromUserId)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">
                                <span data-testid={`text-from-${kudosItem.fromUserId}`}>
                                  {getUserName(kudosItem.fromUserId)}
                                </span>
                                {" → "}
                                <span data-testid={`text-to-${kudosItem.toUserId}`}>
                                  {getUserName(kudosItem.toUserId)}
                                </span>
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {formatDistanceToNow(new Date(kudosItem.createdAt))} ago
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {kudosItem.isPublic ? (
                              <Badge variant="secondary" data-testid={`badge-public-${kudosItem.id}`}>
                                <Users className="mr-1 h-3 w-3" />
                                Public
                              </Badge>
                            ) : (
                              <Badge variant="outline" data-testid={`badge-private-${kudosItem.id}`}>
                                <Lock className="mr-1 h-3 w-3" />
                                Private
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="mb-3 text-sm leading-relaxed" data-testid={`text-message-${kudosItem.id}`}>
                          {kudosItem.message}
                        </p>
                        {kudosItem.values.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {kudosItem.values.map((value) => (
                              <Badge 
                                key={value} 
                                variant="outline" 
                                className="text-xs"
                                data-testid={`badge-value-${value.replace(/\s+/g, '-')}-${kudosItem.id}`}
                              >
                                <Star className="mr-1 h-3 w-3" />
                                {value}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}