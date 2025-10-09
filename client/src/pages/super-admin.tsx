import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Crown, Settings, DollarSign, Ticket, Users, Building2, Trash2, Edit, Plus, Eye, ShieldAlert, AlertCircle, CheckCircle2, RefreshCw, Key, Info, ChevronDown, CreditCard } from "lucide-react";
import { format } from "date-fns";
import type { User as CurrentUser } from "@shared/schema";

// Types
interface SuperAdminStats {
  totalOrganizations: number;
  totalUsers: number;
  activeDiscountCodes: number;
  systemSettings: number;
  timestamp: string;
}

interface SystemSetting {
  id: string;
  key: string;
  value: any;
  description?: string;
  category: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PricingPlan {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  billingPeriod: string;
  stripePriceId?: string;
  features: string[];
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface DiscountCode {
  id: string;
  code: string;
  name: string;
  description?: string;
  discountType: string;
  discountValue: number;
  minimumAmount?: number;
  maximumDiscount?: number;
  usageLimit?: number;
  usageCount: number;
  validFrom: string;
  validTo?: string;
  applicablePlans: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Organization Pricing interfaces
interface OrganizationPricing {
  organizationId: string;
  name: string;
  plan: string;
  billingPricePerUser: number;
  billingUserCount: number;
  billingCycle: string;
}

interface PricingUpdateData {
  pricePerUser: number;
  billingCycle: "monthly" | "annual";
}

// Form schemas
const systemSettingSchema = z.object({
  key: z.string().min(1, "Setting key is required"),
  value: z.any(),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  isActive: z.boolean().default(true),
});

const pricingPlanSchema = z.object({
  name: z.string().min(1, "Plan name is required"),
  description: z.string().optional(),
  price: z.number().min(0, "Price must be positive"),
  currency: z.string().default("usd"),
  billingPeriod: z.enum(["monthly", "yearly", "one_time"]),
  stripePriceId: z.string().optional(),
  features: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  isPopular: z.boolean().default(false),
  sortOrder: z.number().default(0),
});

const discountCodeSchema = z.object({
  code: z.string().min(1, "Discount code is required").toUpperCase(),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  discountType: z.enum(["percentage", "fixed_amount"]),
  discountValue: z.number().min(0, "Discount value must be positive"),
  minimumAmount: z.number().optional(),
  maximumDiscount: z.number().optional(),
  usageLimit: z.number().optional(),
  validFrom: z.string(),
  validTo: z.string().optional(),
  applicablePlans: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

// Form schema for pricing update
const pricingUpdateSchema = z.object({
  pricePerUser: z.number().min(0, "Price must be non-negative"),
  billingCycle: z.enum(["monthly", "annual"]),
});

type PricingUpdateFormData = z.infer<typeof pricingUpdateSchema>;

export default function SuperAdminPage() {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("dashboard");
  const [editingItem, setEditingItem] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [backdoorKey, setBackdoorKey] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<any>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const [showUserDeleteConfirmation, setShowUserDeleteConfirmation] = useState(false);
  
  // Pricing management state
  const [selectedOrgForPricing, setSelectedOrgForPricing] = useState<OrganizationPricing | null>(null);
  const [showPricingEditDialog, setShowPricingEditDialog] = useState(false);
  
  // Get current user to check super admin status
  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = (currentUser as CurrentUser)?.isSuperAdmin || false;
  const currentOrganizationId = (currentUser as CurrentUser)?.organizationId;
  
  // Handle super admin authentication
  const handleSuperAdminLogin = async () => {
    if (!backdoorKey) {
      toast({
        title: "Error",
        description: "Please enter the backdoor key",
        variant: "destructive",
      });
      return;
    }
    
    setIsAuthenticating(true);
    try {
      // First logout current session
      const logoutResponse = await fetch('/api/auth/logout', { 
        method: 'POST', 
        credentials: 'include' 
      });
      
      if (!logoutResponse.ok) {
        throw new Error('Failed to logout current session');
      }
      
      // Then login as super admin
      const response = await fetch('/api/auth/super-admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: 'mpatrick@whirks.com',
          key: backdoorKey
        })
      });
      
      if (response.ok) {
        toast({
          title: "Success",
          description: "Authenticated as super admin! Reloading...",
        });
        // Reload page to get new session
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Authentication failed');
      }
    } catch (error: any) {
      toast({
        title: "Authentication Failed",
        description: error.message || "Failed to authenticate as super admin",
        variant: "destructive",
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Queries
  const { data: stats } = useQuery<SuperAdminStats>({
    queryKey: ["/api/super-admin/stats"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: systemSettings } = useQuery<SystemSetting[]>({
    queryKey: ["/api/super-admin/settings"],
  });

  const { data: pricingPlans } = useQuery<PricingPlan[]>({
    queryKey: ["/api/super-admin/pricing-plans"],
  });

  const { data: discountCodes } = useQuery<DiscountCode[]>({
    queryKey: ["/api/super-admin/discount-codes"],
  });

  const { data: organizations } = useQuery({
    queryKey: ["/api/super-admin/organizations"],
  });


  const { data: users } = useQuery({
    queryKey: ["/api/super-admin/users"],
  });
  
  // Fetch organizations pricing
  const { data: organizationsPricing = [], isLoading: pricingLoading, refetch: refetchPricing } = useQuery<OrganizationPricing[]>({
    queryKey: ["/api/admin/organizations/pricing"],
    enabled: isSuperAdmin === true,
  });

  // Mutations
  const createSystemSettingMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/super-admin/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/settings"] });
      toast({ title: "System setting created successfully" });
      setDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to create system setting", variant: "destructive" });
    },
  });

  const updateSystemSettingMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      apiRequest("PUT", `/api/super-admin/settings/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/settings"] });
      toast({ title: "System setting updated successfully" });
      setDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to update system setting", variant: "destructive" });
    },
  });

  const deleteSystemSettingMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/super-admin/settings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/settings"] });
      toast({ title: "System setting deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete system setting", variant: "destructive" });
    },
  });

  const createPricingPlanMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/super-admin/pricing-plans", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/pricing-plans"] });
      toast({ title: "Pricing plan created successfully" });
      setDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to create pricing plan", variant: "destructive" });
    },
  });

  const updatePricingPlanMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      apiRequest("PUT", `/api/super-admin/pricing-plans/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/pricing-plans"] });
      toast({ title: "Pricing plan updated successfully" });
      setDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to update pricing plan", variant: "destructive" });
    },
  });

  const deletePricingPlanMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/super-admin/pricing-plans/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/pricing-plans"] });
      toast({ title: "Pricing plan deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete pricing plan", variant: "destructive" });
    },
  });

  const createDiscountCodeMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/super-admin/discount-codes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/discount-codes"] });
      toast({ title: "Discount code created successfully" });
      setDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to create discount code", variant: "destructive" });
    },
  });

  const updateDiscountCodeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      apiRequest("PUT", `/api/super-admin/discount-codes/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/discount-codes"] });
      toast({ title: "Discount code updated successfully" });
      setDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to update discount code", variant: "destructive" });
    },
  });

  const deleteDiscountCodeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/super-admin/discount-codes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/discount-codes"] });
      toast({ title: "Discount code deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete discount code", variant: "destructive" });
    },
  });

  const deleteOrganizationMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/super-admin/organizations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/organizations"] });
      toast({ title: "Organization deleted successfully" });
      setShowDeleteConfirmation(false);
      setOrgToDelete(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete organization", 
        description: error.message || "An error occurred while deleting the organization",
        variant: "destructive" 
      });
      setShowDeleteConfirmation(false);
      setOrgToDelete(null);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/super-admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/users"] });
      toast({ title: "User deleted successfully" });
      setShowUserDeleteConfirmation(false);
      setUserToDelete(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete user", 
        description: error.message || "An error occurred while deleting the user",
        variant: "destructive" 
      });
      setShowUserDeleteConfirmation(false);
      setUserToDelete(null);
    },
  });
  
  // Update organization pricing mutation
  const updatePricingMutation = useMutation({
    mutationFn: async ({ orgId, pricePerUser, billingCycle }: { orgId: string; pricePerUser: number; billingCycle: "monthly" | "annual" }) => {
      const response = await apiRequest("PATCH", `/api/admin/organizations/${orgId}/pricing`, {
        pricePerUser,
        billingCycle
      });
      if (!response.ok) {
        const error = await response.json();
        throw error;
      }
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations/pricing"] });
      toast({
        title: "Pricing updated successfully",
        description: `Updated pricing for ${data.name}`,
      });
      setShowPricingEditDialog(false);
      setSelectedOrgForPricing(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to update pricing",
        description: error.message || "An error occurred while updating organization pricing.",
      });
    },
  });

  const handleDeleteOrganization = (org: any) => {
    setOrgToDelete(org);
    setShowDeleteConfirmation(true);
  };

  const confirmDeleteOrganization = () => {
    if (orgToDelete) {
      deleteOrganizationMutation.mutate(orgToDelete.id);
    }
  };

  const handleDeleteUser = (user: any) => {
    setUserToDelete(user);
    setShowUserDeleteConfirmation(true);
  };

  const confirmDeleteUser = () => {
    if (userToDelete) {
      deleteUserMutation.mutate(userToDelete.id);
    }
  };
  
  // Pricing management form
  const pricingForm = useForm<PricingUpdateFormData>({
    resolver: zodResolver(pricingUpdateSchema),
    defaultValues: {
      pricePerUser: 0,
      billingCycle: "monthly",
    },
  });

  const handleEditPricing = (org: OrganizationPricing) => {
    setSelectedOrgForPricing(org);
    // Convert cents to dollars for display
    const priceInDollars = org.billingPricePerUser / 100;
    pricingForm.reset({
      pricePerUser: priceInDollars,
      billingCycle: org.billingCycle as "monthly" | "annual",
    });
    setShowPricingEditDialog(true);
  };

  const handlePricingSubmit = (data: PricingUpdateFormData) => {
    if (selectedOrgForPricing) {
      // Convert dollars to cents for API
      const priceInCents = Math.round(data.pricePerUser * 100);
      updatePricingMutation.mutate({
        orgId: selectedOrgForPricing.organizationId,
        pricePerUser: priceInCents,
        billingCycle: data.billingCycle,
      });
    }
  };

  const setPredefinedPrice = (plan: string, cycle: "monthly" | "annual") => {
    let price = 0;
    if (plan === "professional") {
      price = cycle === "monthly" ? 20 : 200;
    } else if (plan === "enterprise") {
      price = cycle === "monthly" ? 50 : 500;
    }
    pricingForm.setValue("pricePerUser", price);
    pricingForm.setValue("billingCycle", cycle);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-purple-900 dark:to-indigo-900">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl text-white">
              <Crown className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Super Admin Panel
              </h1>
              <p className="text-gray-600 dark:text-gray-300 text-lg">
                System-wide management and configuration
              </p>
            </div>
          </div>
        
        {/* Super Admin Authentication Section */}
        {!isSuperAdmin && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Super Admin Authentication Required</AlertTitle>
            <AlertDescription>
              You are not authenticated as super admin. Please authenticate below to access super admin features.
            </AlertDescription>
          </Alert>
        )}
        
        {/* Authentication Status Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Super Admin Status
            </CardTitle>
            <CardDescription>
              Current authentication status and super admin controls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Current User</Label>
                <div className="flex items-center gap-2">
                  <span className="font-medium" data-testid="text-current-email">
                    {currentUser?.email || 'Not logged in'}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Super Admin Status</Label>
                <div className="flex items-center gap-2">
                  {isSuperAdmin ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <span className="font-medium text-green-600" data-testid="text-super-admin-status">
                        ✓ Authenticated as Super Admin
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                      <span className="font-medium text-amber-600" data-testid="text-super-admin-status">
                        ⚠️ Not authenticated as Super Admin
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            {/* Authentication Form - Always visible when not super admin */}
            {!isSuperAdmin && (
              <div className="border-t pt-4">
                <Label className="text-base font-semibold mb-3 block">
                  Authenticate as Super Admin
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="super-admin-email">Email</Label>
                    <Input
                      id="super-admin-email"
                      type="email"
                      value="mpatrick@whirks.com"
                      disabled
                      data-testid="input-super-admin-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="backdoor-key">Backdoor Key</Label>
                    <Input
                      id="backdoor-key"
                      type="password"
                      placeholder="Enter backdoor key"
                      value={backdoorKey}
                      onChange={(e) => setBackdoorKey(e.target.value)}
                      disabled={isAuthenticating}
                      data-testid="input-backdoor-key"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleSuperAdminLogin}
                      disabled={isAuthenticating || !backdoorKey}
                      className="w-full"
                      data-testid="button-authenticate-super-admin"
                    >
                      {isAuthenticating ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Authenticating...
                        </>
                      ) : (
                        <>
                          <Key className="mr-2 h-4 w-4" />
                          Authenticate as Super Admin
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

          {/* Stats Overview */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card data-testid="stat-organizations">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-8 w-8 text-blue-500" />
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Organizations</p>
                      <p className="text-2xl font-bold">{stats.totalOrganizations}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="stat-users">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Users className="h-8 w-8 text-green-500" />
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Total Users</p>
                      <p className="text-2xl font-bold">{stats.totalUsers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="stat-discount-codes">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Ticket className="h-8 w-8 text-orange-500" />
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Active Discounts</p>
                      <p className="text-2xl font-bold">{stats.activeDiscountCodes}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="stat-system-settings">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Settings className="h-8 w-8 text-purple-500" />
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">System Settings</p>
                      <p className="text-2xl font-bold">{stats.systemSettings}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Main Content */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-7 lg:w-[840px]">
            <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="organizations" data-testid="tab-organizations">Organizations</TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
            <TabsTrigger value="pricing" data-testid="tab-pricing">Pricing</TabsTrigger>
            <TabsTrigger value="discounts" data-testid="tab-discounts">Discounts</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
            <TabsTrigger value="org-pricing" data-testid="tab-org-pricing">Org Pricing</TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Organizations Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {organizations?.slice(0, 5).map((org: any) => (
                      <div key={org.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex-1">
                          <p className="font-medium">{org.name}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{org.plan} plan</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={org.isActive ? "default" : "secondary"}>
                            {org.isActive ? "Active" : "Inactive"}
                          </Badge>
                          {isSuperAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteOrganization(org)}
                              disabled={org.id === currentOrganizationId}
                              data-testid={`button-delete-org-${org.id}`}
                              title={org.id === currentOrganizationId ? "Cannot delete your current organization" : "Delete organization"}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Ticket className="h-5 w-5" />
                    Recent Discount Codes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {discountCodes?.slice(0, 5).map((code) => (
                      <div key={code.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div>
                          <p className="font-medium font-mono">{code.code}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {code.discountType === "percentage" 
                              ? `${code.discountValue}% off` 
                              : `$${(code.discountValue / 100).toFixed(2)} off`}
                          </p>
                        </div>
                        <Badge variant={code.isActive ? "default" : "secondary"}>
                          {code.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Organizations Tab */}
          <TabsContent value="organizations" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Organizations Management</h2>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Total: {organizations?.length || 0} organizations
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr className="text-left">
                        <th className="p-4 font-medium">Organization Name</th>
                        <th className="p-4 font-medium">Plan</th>
                        <th className="p-4 font-medium">Users</th>
                        <th className="p-4 font-medium">Status</th>
                        <th className="p-4 font-medium">Created</th>
                        <th className="p-4 font-medium text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {organizations?.map((org: any) => (
                        <tr key={org.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="p-4">
                            <div>
                              <p className="font-medium">{org.name}</p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">{org.id}</p>
                            </div>
                          </td>
                          <td className="p-4">
                            <Badge variant="outline">{org.plan || 'Free'}</Badge>
                          </td>
                          <td className="p-4 text-gray-600 dark:text-gray-400">
                            {org.userCount || 0}
                          </td>
                          <td className="p-4">
                            <Badge variant={org.isActive ? "default" : "secondary"}>
                              {org.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="p-4 text-sm text-gray-600 dark:text-gray-400">
                            {org.createdAt ? format(new Date(org.createdAt), "MMM dd, yyyy") : 'N/A'}
                          </td>
                          <td className="p-4 text-center">
                            {isSuperAdmin ? (
                              <div className="flex justify-center gap-2">
                                {org.id === currentOrganizationId ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled
                                    title="Cannot delete your current organization"
                                    data-testid={`button-delete-org-disabled-${org.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteOrganization(org)}
                                    data-testid={`button-delete-org-${org.id}`}
                                    className="hover:bg-red-50 hover:text-red-600 hover:border-red-300 dark:hover:bg-red-900/20"
                                    title="Delete organization"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-500">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(!organizations || organizations.length === 0) && (
                    <div className="p-8 text-center text-gray-500">
                      No organizations found
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* System Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">System Settings</h2>
              <SystemSettingDialog 
                editingItem={null}
                onSave={(data) => createSystemSettingMutation.mutate(data)}
                isPending={createSystemSettingMutation.isPending}
              />
            </div>

            <div className="grid gap-4">
              {systemSettings?.map((setting) => (
                <Card key={setting.id} data-testid={`setting-${setting.id}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold">{setting.key}</h3>
                          <Badge variant="outline">{setting.category}</Badge>
                          <Badge variant={setting.isActive ? "default" : "secondary"}>
                            {setting.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        {setting.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {setting.description}
                          </p>
                        )}
                        <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono">
                          {JSON.stringify(setting.value)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <SystemSettingDialog 
                          editingItem={setting}
                          onSave={(data) => updateSystemSettingMutation.mutate({ id: setting.id, data })}
                          isPending={updateSystemSettingMutation.isPending}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteSystemSettingMutation.mutate(setting.id)}
                          data-testid={`button-delete-setting-${setting.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Pricing Plans Tab */}
          <TabsContent value="pricing" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Pricing Plans</h2>
              <PricingPlanDialog 
                editingItem={null}
                onSave={(data) => createPricingPlanMutation.mutate(data)}
                isPending={createPricingPlanMutation.isPending}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pricingPlans?.map((plan) => (
                <Card key={plan.id} className={`relative ${plan.isPopular ? 'ring-2 ring-blue-500' : ''}`} data-testid={`plan-${plan.id}`}>
                  {plan.isPopular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <Badge className="bg-blue-500">Most Popular</Badge>
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{plan.name}</span>
                      <Badge variant={plan.isActive ? "default" : "secondary"}>
                        {plan.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </CardTitle>
                    <div className="text-3xl font-bold">
                      ${(plan.price / 100).toFixed(2)}
                      <span className="text-sm font-normal text-gray-600 dark:text-gray-400">
                        /{plan.billingPeriod}
                      </span>
                    </div>
                    {plan.description && (
                      <p className="text-gray-600 dark:text-gray-400">{plan.description}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 mb-4">
                      {plan.features.map((feature, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          <div className="w-1 h-1 bg-green-500 rounded-full" />
                          {feature}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <PricingPlanDialog 
                        editingItem={plan}
                        onSave={(data) => updatePricingPlanMutation.mutate({ id: plan.id, data })}
                        isPending={updatePricingPlanMutation.isPending}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deletePricingPlanMutation.mutate(plan.id)}
                        data-testid={`button-delete-plan-${plan.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Discount Codes Tab */}
          <TabsContent value="discounts" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Discount Codes</h2>
              <DiscountCodeDialog 
                editingItem={null}
                onSave={(data) => createDiscountCodeMutation.mutate(data)}
                isPending={createDiscountCodeMutation.isPending}
              />
            </div>

            <div className="grid gap-4">
              {discountCodes?.map((code) => (
                <Card key={code.id} data-testid={`discount-${code.id}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold font-mono text-lg">{code.code}</h3>
                          <Badge variant={code.isActive ? "default" : "secondary"}>
                            {code.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Badge variant="outline">
                            {code.discountType === "percentage" 
                              ? `${code.discountValue}% off` 
                              : `$${(code.discountValue / 100).toFixed(2)} off`}
                          </Badge>
                        </div>
                        <p className="text-lg font-medium mt-1">{code.name}</p>
                        {code.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {code.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                          <span>Valid from: {format(new Date(code.validFrom), "MMM dd, yyyy")}</span>
                          {code.validTo && (
                            <span>Valid to: {format(new Date(code.validTo), "MMM dd, yyyy")}</span>
                          )}
                          <span>Used: {code.usageCount}{code.usageLimit && `/${code.usageLimit}`}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <DiscountCodeDialog 
                          editingItem={code}
                          onSave={(data) => updateDiscountCodeMutation.mutate({ id: code.id, data })}
                          isPending={updateDiscountCodeMutation.isPending}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteDiscountCodeMutation.mutate(code.id)}
                          data-testid={`button-delete-discount-${code.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-6">
            <h2 className="text-2xl font-bold">System Users</h2>
            
            <div className="grid gap-4">
              {users?.map((user: any) => (
                <Card key={user.id} data-testid={`user-${user.id}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                          {user.name?.charAt(0) || user.email.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-semibold">{user.name || "No Name"}</h3>
                          <p className="text-gray-600 dark:text-gray-400">{user.email}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline">{user.role}</Badge>
                            {user.isSuperAdmin && (
                              <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                                <Crown className="h-3 w-3 mr-1" />
                                Super Admin
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          Created: {format(new Date(user.createdAt), "MMM dd, yyyy")}
                        </p>
                        {isSuperAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteUser(user)}
                            disabled={
                              user.id === currentUser?.id || 
                              user.email === "mpatrick@whirks.com"
                            }
                            data-testid={`button-delete-user-${user.id}`}
                            className="hover:bg-red-50 hover:text-red-600 hover:border-red-300 dark:hover:bg-red-900/20"
                            title={
                              user.id === currentUser?.id 
                                ? "Cannot delete your own account" 
                                : user.email === "mpatrick@whirks.com"
                                ? "Cannot delete the main super admin"
                                : "Delete user"
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
          
          {/* Organization Pricing Tab */}
          <TabsContent value="org-pricing" className="space-y-6">
            <Card data-testid="card-org-pricing-management">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Organization Pricing Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Configure billing prices for each organization. Set monthly or annual billing cycles and custom pricing.
                  </p>
                  
                  {pricingLoading ? (
                    <div className="space-y-2">
                      <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    </div>
                  ) : organizationsPricing.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CreditCard className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No organizations found</p>
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left p-3 font-medium">Organization</th>
                            <th className="text-left p-3 font-medium">Plan</th>
                            <th className="text-left p-3 font-medium">Price per User</th>
                            <th className="text-left p-3 font-medium">Billing Cycle</th>
                            <th className="text-left p-3 font-medium">Billed Users</th>
                            <th className="text-left p-3 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {organizationsPricing.map((org) => (
                            <tr key={org.organizationId} className="border-t hover:bg-muted/50">
                              <td className="p-3">
                                <div className="font-medium">{org.name}</div>
                                <div className="text-xs text-muted-foreground">{org.organizationId}</div>
                              </td>
                              <td className="p-3">
                                <Badge variant={
                                  org.plan === 'enterprise' ? 'default' : 
                                  org.plan === 'professional' ? 'secondary' : 
                                  'outline'
                                }>
                                  {org.plan}
                                </Badge>
                              </td>
                              <td className="p-3">
                                <div className="font-mono">
                                  ${(org.billingPricePerUser / 100).toFixed(2)}
                                </div>
                                {org.billingCycle === 'annual' && (
                                  <div className="text-xs text-muted-foreground">
                                    ${(org.billingPricePerUser / 100 / 12).toFixed(2)}/mo
                                  </div>
                                )}
                              </td>
                              <td className="p-3">
                                <Badge variant="outline" className="capitalize">
                                  {org.billingCycle}
                                </Badge>
                              </td>
                              <td className="p-3">{org.billingUserCount}</td>
                              <td className="p-3">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditPricing(org)}
                                  data-testid={`button-edit-pricing-${org.organizationId}`}
                                >
                                  <Edit className="w-3 h-3 mr-1" />
                                  Edit
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        {/* Delete Organization Confirmation Dialog */}
        <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the organization <strong>{orgToDelete?.name}</strong> and all associated data.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setShowDeleteConfirmation(false);
                setOrgToDelete(null);
              }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDeleteOrganization}
                className="bg-red-600 hover:bg-red-700"
                disabled={deleteOrganizationMutation.isPending}
                data-testid="button-confirm-delete-org"
              >
                {deleteOrganizationMutation.isPending ? "Deleting..." : "Delete Organization"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete User Confirmation Dialog */}
        <AlertDialog open={showUserDeleteConfirmation} onOpenChange={setShowUserDeleteConfirmation}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the user <strong>{userToDelete?.name || userToDelete?.email}</strong> and all associated data.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setShowUserDeleteConfirmation(false);
                setUserToDelete(null);
              }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDeleteUser}
                className="bg-red-600 hover:bg-red-700"
                disabled={deleteUserMutation.isPending}
                data-testid="button-confirm-delete-user"
              >
                {deleteUserMutation.isPending ? "Deleting..." : "Delete User"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        
        {/* Pricing Edit Dialog */}
        <Dialog open={showPricingEditDialog} onOpenChange={(open) => {
          if (!open) {
            setShowPricingEditDialog(false);
            setSelectedOrgForPricing(null);
            pricingForm.reset();
          }
        }}>
          <DialogContent data-testid="dialog-edit-pricing" className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Organization Pricing</DialogTitle>
              <DialogDescription>
                Configure pricing for {selectedOrgForPricing?.name}
              </DialogDescription>
            </DialogHeader>
            
            <Form {...pricingForm}>
              <form onSubmit={pricingForm.handleSubmit(handlePricingSubmit)} className="space-y-4">
                {/* Billing Cycle Selection */}
                <FormField
                  control={pricingForm.control}
                  name="billingCycle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Billing Cycle</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-billing-cycle">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="monthly" data-testid="option-monthly">Monthly</SelectItem>
                          <SelectItem value="annual" data-testid="option-annual">Annual (Save ~17%)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Predefined Pricing Suggestions */}
                <div>
                  <Label>Quick Price Options</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPredefinedPrice("standard", pricingForm.getValues("billingCycle"))}
                      data-testid="button-price-free"
                    >
                      <DollarSign className="w-3 h-3 mr-1" />
                      Free
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPredefinedPrice("professional", pricingForm.getValues("billingCycle"))}
                      data-testid="button-price-professional"
                    >
                      <DollarSign className="w-3 h-3 mr-1" />
                      Professional
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPredefinedPrice("enterprise", pricingForm.getValues("billingCycle"))}
                      data-testid="button-price-enterprise"
                    >
                      <DollarSign className="w-3 h-3 mr-1" />
                      Enterprise
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2 space-y-1">
                    <div>• Professional: $20/mo or $200/year ($16.67/mo)</div>
                    <div>• Enterprise: $50/mo or $500/year ($41.67/mo)</div>
                  </div>
                </div>

                {/* Price per User Input */}
                <FormField
                  control={pricingForm.control}
                  name="pricePerUser"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price per User (in dollars)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            min="0"
                            className="pl-8"
                            placeholder="0.00"
                            data-testid="input-price-per-user"
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </div>
                      </FormControl>
                      {pricingForm.watch("billingCycle") === "annual" && pricingForm.watch("pricePerUser") > 0 && (
                        <p className="text-sm text-muted-foreground">
                          Monthly equivalent: ${(pricingForm.watch("pricePerUser") / 12).toFixed(2)}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Summary */}
                <div className="bg-muted rounded-lg p-3">
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Organization:</span>
                      <span className="font-medium">{selectedOrgForPricing?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Current Plan:</span>
                      <Badge variant="outline" className="capitalize">
                        {selectedOrgForPricing?.plan}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Billed Users:</span>
                      <span className="font-medium">{selectedOrgForPricing?.billingUserCount}</span>
                    </div>
                    <div className="border-t pt-1 mt-1">
                      <div className="flex justify-between font-medium">
                        <span>New Monthly Charge:</span>
                        <span>
                          ${((pricingForm.watch("pricePerUser") || 0) * (selectedOrgForPricing?.billingUserCount || 0)).toFixed(2)}
                          {pricingForm.watch("billingCycle") === "annual" && " (billed annually)"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex justify-end gap-2">
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => {
                      setShowPricingEditDialog(false);
                      setSelectedOrgForPricing(null);
                      pricingForm.reset();
                    }}
                    data-testid="button-cancel-pricing"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={updatePricingMutation.isPending}
                    data-testid="button-save-pricing"
                  >
                    {updatePricingMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// Dialog Components
function SystemSettingDialog({ editingItem, onSave, isPending }: { editingItem: SystemSetting | null; onSave: (data: any) => void; isPending: boolean }) {
  const [open, setOpen] = useState(false);
  const form = useForm({
    resolver: zodResolver(systemSettingSchema),
    defaultValues: editingItem || {
      key: "",
      value: "",
      description: "",
      category: "general",
      isActive: true,
    },
  });

  const handleSave = (data: any) => {
    try {
      // Parse JSON value if it's a string
      if (typeof data.value === "string") {
        try {
          data.value = JSON.parse(data.value);
        } catch {
          // Keep as string if not valid JSON
        }
      }
      onSave(data);
      setOpen(false);
      form.reset();
    } catch (error) {
      console.error("Failed to save setting:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid={editingItem ? `button-edit-setting-${editingItem.id}` : "button-create-setting"}>
          {editingItem ? <Edit className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editingItem ? "" : "Add Setting"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingItem ? "Edit System Setting" : "Create System Setting"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
            <FormField
              control={form.control}
              name="key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Setting Key</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., signup_enabled" data-testid="input-setting-key" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-setting-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="signup">Signup</SelectItem>
                      <SelectItem value="pricing">Pricing</SelectItem>
                      <SelectItem value="features">Features</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Value (JSON)</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      value={typeof field.value === "string" ? field.value : JSON.stringify(field.value, null, 2)}
                      placeholder='{"enabled": true}'
                      data-testid="textarea-setting-value"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Description of this setting" data-testid="input-setting-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active</FormLabel>
                    <div className="text-sm text-muted-foreground">
                      Enable this setting
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-setting-active"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-setting">
                {isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function PricingPlanDialog({ editingItem, onSave, isPending }: { editingItem: PricingPlan | null; onSave: (data: any) => void; isPending: boolean }) {
  const [open, setOpen] = useState(false);
  const [features, setFeatures] = useState<string[]>(editingItem?.features || []);
  const [newFeature, setNewFeature] = useState("");
  
  const form = useForm({
    resolver: zodResolver(pricingPlanSchema),
    defaultValues: editingItem || {
      name: "",
      description: "",
      price: 0,
      currency: "usd",
      billingPeriod: "monthly",
      stripePriceId: "",
      features: [],
      isActive: true,
      isPopular: false,
      sortOrder: 0,
    },
  });

  const handleSave = (data: any) => {
    onSave({ ...data, features });
    setOpen(false);
    form.reset();
    setFeatures([]);
  };

  const addFeature = () => {
    if (newFeature.trim()) {
      setFeatures([...features, newFeature.trim()]);
      setNewFeature("");
    }
  };

  const removeFeature = (index: number) => {
    setFeatures(features.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid={editingItem ? `button-edit-plan-${editingItem.id}` : "button-create-plan"}>
          {editingItem ? <Edit className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editingItem ? "" : "Add Plan"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingItem ? "Edit Pricing Plan" : "Create Pricing Plan"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Professional" data-testid="input-plan-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price (cents)</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="number" 
                        placeholder="2999"
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        data-testid="input-plan-price"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Description of this plan" data-testid="textarea-plan-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="billingPeriod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Billing Period</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-plan-billing">
                          <SelectValue placeholder="Select period" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                        <SelectItem value="one_time">One Time</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="number" 
                        placeholder="0"
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        data-testid="input-plan-sort-order"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="stripePriceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stripe Price ID (Optional)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="price_..." data-testid="input-plan-stripe-id" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Features Section */}
            <div className="space-y-2">
              <Label>Features</Label>
              <div className="flex gap-2">
                <Input
                  value={newFeature}
                  onChange={(e) => setNewFeature(e.target.value)}
                  placeholder="Add a feature"
                  onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addFeature())}
                  data-testid="input-new-feature"
                />
                <Button type="button" onClick={addFeature} size="sm" data-testid="button-add-feature">
                  Add
                </Button>
              </div>
              <div className="space-y-1">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                    <span className="text-sm">{feature}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFeature(index)}
                      data-testid={`button-remove-feature-${index}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 flex-1">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        Enable this plan
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-plan-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="isPopular"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 flex-1">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Popular</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        Mark as popular
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-plan-popular"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-plan">
                {isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function DiscountCodeDialog({ editingItem, onSave, isPending }: { editingItem: DiscountCode | null; onSave: (data: any) => void; isPending: boolean }) {
  const [open, setOpen] = useState(false);
  
  const form = useForm({
    resolver: zodResolver(discountCodeSchema),
    defaultValues: editingItem || {
      code: "",
      name: "",
      description: "",
      discountType: "percentage",
      discountValue: 0,
      minimumAmount: undefined,
      maximumDiscount: undefined,
      usageLimit: undefined,
      validFrom: new Date().toISOString().split('T')[0],
      validTo: "",
      applicablePlans: [],
      isActive: true,
    },
  });

  const handleSave = (data: any) => {
    onSave(data);
    setOpen(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid={editingItem ? `button-edit-discount-${editingItem.id}` : "button-create-discount"}>
          {editingItem ? <Edit className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editingItem ? "" : "Add Discount"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingItem ? "Edit Discount Code" : "Create Discount Code"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discount Code</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="WELCOME50" className="uppercase" data-testid="input-discount-code" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Welcome Discount" data-testid="input-discount-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Description of this discount" data-testid="textarea-discount-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="discountType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discount Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-discount-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="fixed_amount">Fixed Amount</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="discountValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discount Value</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="number" 
                        placeholder="50"
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        data-testid="input-discount-value"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="validFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valid From</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" data-testid="input-discount-valid-from" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="validTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valid To (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" data-testid="input-discount-valid-to" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="usageLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Usage Limit (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="number" 
                        placeholder="100"
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        data-testid="input-discount-usage-limit"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="minimumAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minimum Amount (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="number" 
                        placeholder="5000"
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        data-testid="input-discount-minimum-amount"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active</FormLabel>
                    <div className="text-sm text-muted-foreground">
                      Enable this discount code
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-discount-active"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-discount">
                {isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}