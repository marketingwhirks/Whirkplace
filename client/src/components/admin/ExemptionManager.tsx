import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, startOfWeek, addWeeks, subWeeks } from "date-fns";
import { Shield, Plus, Trash2, Calendar, User, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getWeekStartCentral } from "@shared/utils/dueDates";
import type { User as UserType, CheckinExemption } from "@shared/schema";

interface ExemptionWithUser extends CheckinExemption {
  user?: UserType;
  createdByUser?: UserType;
}

export default function ExemptionManager() {
  const { toast } = useToast();
  const [selectedWeek, setSelectedWeek] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [exemptionReason, setExemptionReason] = useState<string>("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteExemptionId, setDeleteExemptionId] = useState<string | null>(null);

  // Fetch all users
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["/api/users"],
  });

  // Fetch exemptions for the selected week
  const { data: weekExemptions = [], isLoading: exemptionsLoading, refetch: refetchExemptions } = useQuery({
    queryKey: ["/api/checkin-exemptions", { weekOf: selectedWeek.toISOString() }],
    queryFn: async () => {
      const response = await fetch(`/api/checkin-exemptions?weekOf=${selectedWeek.toISOString()}`);
      if (!response.ok) throw new Error("Failed to fetch exemptions");
      return response.json();
    }
  });

  // Create exemption mutation
  const createExemption = useMutation({
    mutationFn: async (data: { userId: string; weekOf: Date; reason?: string }) => {
      return await apiRequest("/api/checkin-exemptions", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Exemption created",
        description: "The check-in exemption has been created successfully.",
      });
      setIsCreateDialogOpen(false);
      setSelectedUserId("");
      setExemptionReason("");
      refetchExemptions();
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["/api/checkin-exemptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create exemption",
        variant: "destructive",
      });
    },
  });

  // Delete exemption mutation
  const deleteExemption = useMutation({
    mutationFn: async (exemptionId: string) => {
      return await apiRequest(`/api/checkin-exemptions/${exemptionId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Exemption removed",
        description: "The check-in exemption has been removed successfully.",
      });
      setDeleteExemptionId(null);
      refetchExemptions();
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["/api/checkin-exemptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete exemption",
        variant: "destructive",
      });
    },
  });

  const handleCreateExemption = () => {
    if (!selectedUserId) {
      toast({
        title: "Error",
        description: "Please select a user",
        variant: "destructive",
      });
      return;
    }

    createExemption.mutate({
      userId: selectedUserId,
      weekOf: selectedWeek,
      reason: exemptionReason || undefined,
    });
  };

  const handleDeleteExemption = (exemptionId: string) => {
    deleteExemption.mutate(exemptionId);
  };

  // Navigate weeks
  const goToPreviousWeek = () => {
    setSelectedWeek(prev => subWeeks(prev, 1));
  };

  const goToNextWeek = () => {
    setSelectedWeek(prev => addWeeks(prev, 1));
  };

  const goToCurrentWeek = () => {
    setSelectedWeek(startOfWeek(new Date(), { weekStartsOn: 1 }));
  };

  // Enhance exemptions with user data
  const exemptionsWithUsers: ExemptionWithUser[] = weekExemptions.map((exemption: CheckinExemption) => {
    const user = users.find((u: UserType) => u.id === exemption.userId);
    const createdByUser = users.find((u: UserType) => u.id === exemption.createdBy);
    return {
      ...exemption,
      user,
      createdByUser
    };
  });

  if (usersLoading || exemptionsLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Check-in Exemptions
            </CardTitle>
            <CardDescription>
              Grant exemptions to excuse users from check-in requirements for specific weeks
            </CardDescription>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Exemption
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Check-in Exemption</DialogTitle>
                <DialogDescription>
                  Grant a user an exemption from check-in requirements for a specific week
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="user">User</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger id="user">
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user: UserType) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="week">Week</Label>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      Week of {format(selectedWeek, "MMM d, yyyy")}
                    </span>
                  </div>
                </div>
                <div>
                  <Label htmlFor="reason">Reason (Optional)</Label>
                  <Textarea
                    id="reason"
                    placeholder="Enter the reason for this exemption..."
                    value={exemptionReason}
                    onChange={(e) => setExemptionReason(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateExemption} disabled={createExemption.isPending}>
                  {createExemption.isPending ? "Creating..." : "Create Exemption"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {/* Week Navigation */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goToPreviousWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[200px] text-center">
              <p className="text-lg font-semibold">
                Week of {format(selectedWeek, "MMM d, yyyy")}
              </p>
            </div>
            <Button variant="outline" size="icon" onClick={goToNextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToCurrentWeek} className="ml-2">
              Current Week
            </Button>
          </div>
        </div>

        {/* Exemptions Table */}
        {exemptionsWithUsers.length === 0 ? (
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              No exemptions for this week. Click "Add Exemption" to create one.
            </AlertDescription>
          </Alert>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exemptionsWithUsers.map((exemption) => (
                <TableRow key={exemption.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{exemption.user?.name || "Unknown User"}</p>
                        <p className="text-sm text-muted-foreground">{exemption.user?.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {exemption.reason ? (
                      <div className="flex items-start gap-2 max-w-xs">
                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <p className="text-sm">{exemption.reason}</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">No reason provided</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {exemption.createdByUser?.name || "Unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(exemption.createdAt), "MMM d, h:mm a")}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <AlertDialog open={deleteExemptionId === exemption.id} onOpenChange={(open) => !open && setDeleteExemptionId(null)}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteExemptionId(exemption.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove Exemption</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to remove this exemption for {exemption.user?.name}? 
                            This action cannot be undone and the user will be required to submit their check-in.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => setDeleteExemptionId(null)}>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteExemption(exemption.id)}>
                            Remove Exemption
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}