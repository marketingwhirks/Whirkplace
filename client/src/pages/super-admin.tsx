import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Crown, Settings, DollarSign, Ticket, Users, Building2, Trash2, Edit, Plus, Eye } from "lucide-react";
import { format } from "date-fns";

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

export default function SuperAdminPage() {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("dashboard");
  const [editingItem, setEditingItem] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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
          <TabsList className="grid w-full grid-cols-5 lg:w-[600px]">
            <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
            <TabsTrigger value="pricing" data-testid="tab-pricing">Pricing</TabsTrigger>
            <TabsTrigger value="discounts" data-testid="tab-discounts">Discounts</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
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
                        <div>
                          <p className="font-medium">{org.name}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{org.plan} plan</p>
                        </div>
                        <Badge variant={org.isActive ? "default" : "secondary"}>
                          {org.isActive ? "Active" : "Inactive"}
                        </Badge>
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
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Created: {format(new Date(user.createdAt), "MMM dd, yyyy")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
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