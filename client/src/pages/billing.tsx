import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  CreditCard, 
  Users, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  Calendar,
  AlertCircle,
  Plus,
  Minus,
  Receipt,
  RefreshCw,
  Info
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface BillingUsage {
  currentUserCount: number;
  billedUserCount: number;
  pendingChanges: any;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  pricePerUser: number;
  estimatedMonthlyCharge: number;
}

interface BillingEvent {
  id: string;
  organizationId: string;
  eventType: string;
  userId?: string;
  userCount: number;
  previousUserCount?: number;
  amount?: number;
  currency?: string;
  description?: string;
  createdAt: string;
}

interface PreviewChanges {
  currentUserCount: number;
  newUserCount: number;
  usersAdded: number;
  usersRemoved: number;
  proRataCharge: number;
  pricePerUser: number;
  currentMonthlyCharge: number;
  newMonthlyCharge: number;
  chargeToday: number;
  nextBillingPeriodChange?: string;
}

export default function BillingPage() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [previewUsers, setPreviewUsers] = useState({ add: 0, remove: 0 });
  const [showPreview, setShowPreview] = useState(false);

  // Fetch billing usage
  const { data: usage, isLoading: usageLoading, error: usageError } = useQuery<BillingUsage>({
    queryKey: ["/api/billing/usage"],
    enabled: currentUser?.role === 'admin',
  });

  // Fetch billing history
  const { data: history, isLoading: historyLoading } = useQuery<BillingEvent[]>({
    queryKey: ["/api/billing/history"],
    enabled: currentUser?.role === 'admin',
  });

  // Preview billing changes mutation
  const previewChangesMutation = useMutation({
    mutationFn: async (params: { addUsers: number; removeUsers: number }) => {
      const response = await apiRequest("POST", "/api/billing/preview-changes", params);
      return await response.json() as PreviewChanges;
    },
    onSuccess: (data) => {
      setShowPreview(true);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to preview changes",
        description: error.message || "An error occurred while previewing billing changes.",
      });
    },
  });

  // Initialize billing for organizations (super admin only)
  const initializeBillingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/billing/initialize", {});
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/usage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/history"] });
      toast({
        title: "Billing initialized",
        description: `Initialized ${data.initialized} organizations, skipped ${data.skipped}`,
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to initialize billing",
        description: error.message || "An error occurred while initializing billing.",
      });
    },
  });

  const handlePreviewChanges = () => {
    if (previewUsers.add === 0 && previewUsers.remove === 0) {
      toast({
        title: "No changes to preview",
        description: "Enter the number of users to add or remove.",
      });
      return;
    }
    previewChangesMutation.mutate({ 
      addUsers: previewUsers.add, 
      removeUsers: previewUsers.remove 
    });
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  if (userLoading) {
    return (
      <div className="container mx-auto py-6">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (currentUser?.role !== 'admin') {
    return (
      <div className="container mx-auto py-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Only administrators can view billing information.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (usageError) {
    return (
      <div className="container mx-auto py-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load billing information. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Billing & Usage</h1>
        <p className="text-muted-foreground mt-2">Manage your subscription and view usage details</p>
      </div>

      {/* Current Usage Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Current Billing Period
          </CardTitle>
          {usage && (
            <CardDescription>
              {format(new Date(usage.currentPeriodStart), 'MMM d, yyyy')} - {format(new Date(usage.currentPeriodEnd), 'MMM d, yyyy')}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {usageLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : usage ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Active Users</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold" data-testid="text-active-users">{usage.currentUserCount}</span>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Price Per User</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold" data-testid="text-price-per-user">{formatCurrency(usage.pricePerUser)}</span>
                    <span className="text-sm text-muted-foreground">/month</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Estimated Monthly Cost</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-primary" data-testid="text-monthly-cost">
                      {formatCurrency(usage.estimatedMonthlyCharge)}
                    </span>
                  </div>
                </div>
              </div>

              {usage.pendingChanges && Object.keys(usage.pendingChanges).length > 0 && (
                <>
                  <Separator />
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Pending changes for next billing cycle:</strong>
                      {usage.pendingChanges.userRemovals && (
                        <div className="mt-2">
                          <Badge variant="outline" className="gap-1">
                            <TrendingDown className="h-3 w-3" />
                            {usage.pendingChanges.userRemovals} user(s) will be removed
                          </Badge>
                        </div>
                      )}
                      {usage.pendingChanges.targetUserCount !== undefined && (
                        <div className="mt-1 text-sm">
                          Next period user count: {usage.pendingChanges.targetUserCount}
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                </>
              )}
            </div>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>No billing information available.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Preview Changes Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Preview Billing Changes
          </CardTitle>
          <CardDescription>
            Calculate the cost impact of adding or removing users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Users to Add</label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPreviewUsers(prev => ({ ...prev, add: Math.max(0, prev.add - 1) }))}
                    data-testid="button-decrease-add-users"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <input
                    type="number"
                    min="0"
                    value={previewUsers.add}
                    onChange={(e) => setPreviewUsers(prev => ({ ...prev, add: Math.max(0, parseInt(e.target.value) || 0) }))}
                    className="w-20 text-center border rounded px-2 py-1"
                    data-testid="input-add-users"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPreviewUsers(prev => ({ ...prev, add: prev.add + 1 }))}
                    data-testid="button-increase-add-users"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Users to Remove</label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPreviewUsers(prev => ({ ...prev, remove: Math.max(0, prev.remove - 1) }))}
                    data-testid="button-decrease-remove-users"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <input
                    type="number"
                    min="0"
                    value={previewUsers.remove}
                    onChange={(e) => setPreviewUsers(prev => ({ ...prev, remove: Math.max(0, parseInt(e.target.value) || 0) }))}
                    className="w-20 text-center border rounded px-2 py-1"
                    data-testid="input-remove-users"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPreviewUsers(prev => ({ ...prev, remove: prev.remove + 1 }))}
                    data-testid="button-increase-remove-users"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            
            <Button onClick={handlePreviewChanges} disabled={previewChangesMutation.isPending} data-testid="button-preview-changes">
              {previewChangesMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Preview Changes
                </>
              )}
            </Button>

            {showPreview && previewChangesMutation.data && (
              <Alert className="mt-4">
                <DollarSign className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <div className="font-medium">Preview Results:</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Current Users:</div>
                      <div>{previewChangesMutation.data.currentUserCount}</div>
                      <div>New User Count:</div>
                      <div className="font-medium">{previewChangesMutation.data.newUserCount}</div>
                      <div>Pro-rata Charge Today:</div>
                      <div className="font-medium text-primary">
                        {formatCurrency(previewChangesMutation.data.proRataCharge)}
                      </div>
                      <div>New Monthly Cost:</div>
                      <div className="font-medium">
                        {formatCurrency(previewChangesMutation.data.newMonthlyCharge)}
                      </div>
                    </div>
                    {previewChangesMutation.data.nextBillingPeriodChange && (
                      <div className="text-sm text-muted-foreground mt-2">
                        {previewChangesMutation.data.nextBillingPeriodChange}
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Billing History
          </CardTitle>
          <CardDescription>
            Recent billing events and user changes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : history && history.length > 0 ? (
            <div className="space-y-2">
              {history.slice(0, 10).map((event) => (
                <div key={event.id} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={event.eventType === 'user_added' ? 'default' : 'secondary'}>
                        {event.eventType.replace('_', ' ')}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(event.createdAt), 'MMM d, yyyy HH:mm')}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-sm">{event.description}</p>
                    )}
                  </div>
                  <div className="text-right">
                    {event.amount && event.amount > 0 && (
                      <div className="font-medium">{formatCurrency(event.amount)}</div>
                    )}
                    <div className="text-sm text-muted-foreground">
                      {event.userCount} user{event.userCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>No billing events to display.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Super Admin Actions */}
      {currentUser?.isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Super Admin Actions
            </CardTitle>
            <CardDescription>
              Administrative billing functions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => initializeBillingMutation.mutate()} 
              disabled={initializeBillingMutation.isPending}
              variant="outline"
              data-testid="button-initialize-billing"
            >
              {initializeBillingMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Initializing...
                </>
              ) : (
                <>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Initialize Billing for All Organizations
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}