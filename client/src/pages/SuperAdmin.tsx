import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, Edit, Trash2, Plus, MoveRight, Shield, Briefcase, Link2, TrendingUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export default function SuperAdmin() {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("organizations");
  const [orgDialog, setOrgDialog] = useState(false);
  const [userDialog, setUserDialog] = useState(false);
  const [moveUserDialog, setMoveUserDialog] = useState(false);
  const [partnerDialog, setPartnerDialog] = useState(false);
  const [attachOrgDialog, setAttachOrgDialog] = useState(false);
  const [editingOrg, setEditingOrg] = useState<any>(null);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editingPartner, setEditingPartner] = useState<any>(null);
  const [movingUser, setMovingUser] = useState<any>(null);
  const [targetOrgId, setTargetOrgId] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [selectedPartner, setSelectedPartner] = useState<any>(null);

  // System stats
  const { data: stats } = useQuery({
    queryKey: ['/api/super-admin/stats'],
  });

  // Organizations
  const { data: organizations, isLoading: orgsLoading } = useQuery({
    queryKey: ['/api/super-admin/organizations'],
  });

  // Users
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['/api/super-admin/users'],
  });

  // Organization mutations
  const createOrgMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/super-admin/organizations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/stats'] });
      setOrgDialog(false);
      setEditingOrg(null);
      toast({ title: "Organization created successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create organization", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const updateOrgMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PUT', `/api/super-admin/organizations/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/organizations'] });
      setOrgDialog(false);
      setEditingOrg(null);
      toast({ title: "Organization updated successfully" });
    }
  });

  const deleteOrgMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/super-admin/organizations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/stats'] });
      toast({ title: "Organization deleted successfully" });
    }
  });

  // User mutations
  const createUserMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/super-admin/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/stats'] });
      setUserDialog(false);
      setEditingUser(null);
      toast({ title: "User created successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create user", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PUT', `/api/super-admin/users/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/users'] });
      setUserDialog(false);
      setEditingUser(null);
      toast({ title: "User updated successfully" });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/super-admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/stats'] });
      toast({ title: "User deleted successfully" });
    }
  });

  const moveUserMutation = useMutation({
    mutationFn: (data: { userId: string; targetOrganizationId: string }) => 
      apiRequest('POST', `/api/super-admin/users/${data.userId}/move`, { targetOrganizationId: data.targetOrganizationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/organizations'] });
      setMoveUserDialog(false);
      setMovingUser(null);
      setTargetOrgId("");
      toast({ title: "User moved successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to move user", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Partner queries
  const { data: partners, isLoading: partnersLoading } = useQuery({
    queryKey: ['/api/partners/firms'],
  });

  const { data: partnerStats } = useQuery({
    queryKey: ['/api/partners/firms', selectedPartnerId, 'stats'],
    enabled: !!selectedPartnerId,
  });

  const { data: partnerOrgs } = useQuery({
    queryKey: ['/api/partners/firms', selectedPartnerId, 'organizations'],
    enabled: !!selectedPartnerId,
  });

  // Partner mutations
  const createPartnerMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/partners/firms', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/partners/firms'] });
      setPartnerDialog(false);
      setEditingPartner(null);
      toast({ title: "Partner firm created successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create partner firm", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const updatePartnerMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PUT', `/api/partners/firms/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/partners/firms'] });
      setPartnerDialog(false);
      setEditingPartner(null);
      toast({ title: "Partner firm updated successfully" });
    }
  });

  const deletePartnerMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/partners/firms/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/partners/firms'] });
      toast({ title: "Partner firm deleted successfully" });
    }
  });

  const attachOrgToPartnerMutation = useMutation({
    mutationFn: (data: { partnerId: string; orgId: string }) => 
      apiRequest('POST', `/api/partners/firms/${data.partnerId}/organizations/${data.orgId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/partners/firms'] });
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/organizations'] });
      setAttachOrgDialog(false);
      toast({ title: "Organization attached to partner successfully" });
    }
  });

  const promoteOrgToPartnerMutation = useMutation({
    mutationFn: (data: { orgId: string; partnerConfig: any }) => 
      apiRequest('POST', `/api/partners/promote/${data.orgId}`, data.partnerConfig),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/partners/firms'] });
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/organizations'] });
      toast({ title: "Organization promoted to partner successfully" });
    }
  });

  const handleOrgSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      slug: formData.get('slug'),
      plan: formData.get('plan'),
      isActive: formData.get('isActive') === 'true'
    };

    if (editingOrg) {
      updateOrgMutation.mutate({ ...data, id: editingOrg.id });
    } else {
      createOrgMutation.mutate(data);
    }
  };

  const handleUserSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      email: formData.get('email'),
      organizationId: formData.get('organizationId'),
      role: formData.get('role'),
      password: formData.get('password'),
      isActive: formData.get('isActive') === 'true'
    };

    if (editingUser) {
      const updateData: any = {
        id: editingUser.id,
        name: data.name,
        email: data.email,
        role: data.role,
        isActive: data.isActive
      };
      if (data.password) {
        updateData.password = data.password;
      }
      updateUserMutation.mutate(updateData);
    } else {
      createUserMutation.mutate(data);
    }
  };

  const handleMoveUser = () => {
    if (movingUser && targetOrgId) {
      moveUserMutation.mutate({ 
        userId: movingUser.id, 
        targetOrganizationId: targetOrgId 
      });
    }
  };

  const handlePartnerSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      slug: formData.get('slug'),
      description: formData.get('description'),
      logoUrl: formData.get('logoUrl'),
      primaryColor: formData.get('primaryColor'),
      websiteUrl: formData.get('websiteUrl'),
      contactEmail: formData.get('contactEmail'),
      contactPhone: formData.get('contactPhone'),
      commissionRate: parseFloat(formData.get('commissionRate') as string) || 20,
      isActive: formData.get('isActive') === 'true'
    };

    if (editingPartner) {
      updatePartnerMutation.mutate({ ...data, id: editingPartner.id });
    } else {
      createPartnerMutation.mutate(data);
    }
  };

  const handlePromoteToPartner = (org: any) => {
    const partnerConfig = {
      name: org.name,
      slug: org.slug,
      description: `Partner firm: ${org.name}`,
      commissionRate: 20,
      isActive: true
    };
    promoteOrgToPartnerMutation.mutate({ orgId: org.id, partnerConfig });
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="w-8 h-8" />
            Super Admin Panel
          </h1>
          <p className="text-muted-foreground">System-wide management and monitoring</p>
        </div>
      </div>

      {/* System Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Organizations</CardDescription>
              <CardTitle className="text-2xl">{stats.totalOrganizations}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Organizations</CardDescription>
              <CardTitle className="text-2xl">{stats.activeOrganizations}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Users</CardDescription>
              <CardTitle className="text-2xl">{stats.totalUsers}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Users</CardDescription>
              <CardTitle className="text-2xl">{stats.activeUsers}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="organizations">
            <Building2 className="w-4 h-4 mr-2" />
            Organizations
          </TabsTrigger>
          <TabsTrigger value="partners">
            <Briefcase className="w-4 h-4 mr-2" />
            Partners
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="w-4 h-4 mr-2" />
            Users
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organizations" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Organizations</h2>
            <Dialog open={orgDialog} onOpenChange={setOrgDialog}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingOrg(null)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Organization
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingOrg ? 'Edit' : 'Add'} Organization</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleOrgSubmit}>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="name">Name</Label>
                      <Input 
                        id="name" 
                        name="name" 
                        defaultValue={editingOrg?.name} 
                        required 
                      />
                    </div>
                    <div>
                      <Label htmlFor="slug">Slug</Label>
                      <Input 
                        id="slug" 
                        name="slug" 
                        defaultValue={editingOrg?.slug} 
                        required 
                        pattern="[a-z0-9-]+"
                        title="Lowercase letters, numbers, and hyphens only"
                      />
                    </div>
                    <div>
                      <Label htmlFor="plan">Plan</Label>
                      <Select name="plan" defaultValue={editingOrg?.plan || 'starter'}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="starter">Starter</SelectItem>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="isActive">Status</Label>
                      <Select name="isActive" defaultValue={editingOrg?.isActive?.toString() || 'true'}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Active</SelectItem>
                          <SelectItem value="false">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter className="mt-4">
                    <Button type="submit">
                      {editingOrg ? 'Update' : 'Create'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Active Users</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgsLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center">Loading...</TableCell>
                    </TableRow>
                  ) : organizations?.map((org: any) => (
                    <TableRow key={org.id}>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell>{org.slug}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{org.plan}</Badge>
                      </TableCell>
                      <TableCell>{org.stats?.userCount || 0}</TableCell>
                      <TableCell>{org.stats?.activeUsers || 0}</TableCell>
                      <TableCell>
                        <Badge variant={org.isActive ? "default" : "secondary"}>
                          {org.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingOrg(org);
                              setOrgDialog(true);
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {org.id !== 'enterprise-whirkplace' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (confirm(`Delete organization ${org.name}? This will delete all users and data.`)) {
                                  deleteOrgMutation.mutate(org.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="partners" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Partner Firms</h2>
            <Dialog open={partnerDialog} onOpenChange={setPartnerDialog}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingPartner(null)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Partner
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{editingPartner ? 'Edit' : 'Add'} Partner Firm</DialogTitle>
                  <DialogDescription>
                    Partner firms can resell Whirkplace under a co-branded model
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handlePartnerSubmit}>
                  <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="name">Partner Name</Label>
                        <Input 
                          id="name" 
                          name="name" 
                          defaultValue={editingPartner?.name} 
                          required 
                          placeholder="Partner Organization"
                        />
                      </div>
                      <div>
                        <Label htmlFor="slug">URL Slug</Label>
                        <Input 
                          id="slug" 
                          name="slug" 
                          defaultValue={editingPartner?.slug} 
                          required 
                          pattern="[a-z0-9-]+"
                          placeholder="patrick-accounting"
                          title="Lowercase letters, numbers, and hyphens only"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea 
                        id="description" 
                        name="description" 
                        defaultValue={editingPartner?.description} 
                        placeholder="Full-service accounting and advisory firm..."
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="logoUrl">Logo URL</Label>
                        <Input 
                          id="logoUrl" 
                          name="logoUrl" 
                          type="url"
                          defaultValue={editingPartner?.logoUrl} 
                          placeholder="https://example.com/logo.png"
                        />
                      </div>
                      <div>
                        <Label htmlFor="primaryColor">Primary Color</Label>
                        <Input 
                          id="primaryColor" 
                          name="primaryColor" 
                          defaultValue={editingPartner?.primaryColor || '#000000'} 
                          placeholder="#000000"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="websiteUrl">Website</Label>
                        <Input 
                          id="websiteUrl" 
                          name="websiteUrl" 
                          type="url"
                          defaultValue={editingPartner?.websiteUrl} 
                          placeholder="https://example.com"
                        />
                      </div>
                      <div>
                        <Label htmlFor="contactEmail">Contact Email</Label>
                        <Input 
                          id="contactEmail" 
                          name="contactEmail" 
                          type="email"
                          defaultValue={editingPartner?.contactEmail} 
                          placeholder="contact@example.com"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="contactPhone">Contact Phone</Label>
                        <Input 
                          id="contactPhone" 
                          name="contactPhone" 
                          defaultValue={editingPartner?.contactPhone} 
                          placeholder="+1 (555) 123-4567"
                        />
                      </div>
                      <div>
                        <Label htmlFor="commissionRate">Commission Rate (%)</Label>
                        <Input 
                          id="commissionRate" 
                          name="commissionRate" 
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          defaultValue={editingPartner?.commissionRate || 20} 
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="isActive">Status</Label>
                      <Select name="isActive" defaultValue={editingPartner?.isActive?.toString() || 'true'}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Active</SelectItem>
                          <SelectItem value="false">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter className="mt-4">
                    <Button type="submit">
                      {editingPartner ? 'Update' : 'Create'} Partner
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Partner Firms Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Organizations</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partnersLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">Loading...</TableCell>
                    </TableRow>
                  ) : partners?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">No partner firms yet</TableCell>
                    </TableRow>
                  ) : partners?.map((partner: any) => (
                    <TableRow key={partner.id} 
                      className={selectedPartnerId === partner.id ? "bg-muted" : ""}
                      onClick={() => {
                        setSelectedPartnerId(partner.id);
                        setSelectedPartner(partner);
                      }}
                    >
                      <TableCell className="font-medium">
                        {partner.name}
                        {partner.logoUrl && (
                          <img src={partner.logoUrl} alt={partner.name} className="h-6 w-auto mt-1" />
                        )}
                      </TableCell>
                      <TableCell>{partner.slug}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {partnerOrgs?.filter((o: any) => o.partnerFirmId === partner.id).length || 0} orgs
                        </Badge>
                      </TableCell>
                      <TableCell>{partner.commissionRate}%</TableCell>
                      <TableCell>
                        <Badge variant={partner.isActive ? "default" : "secondary"}>
                          {partner.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPartner(partner);
                              setPartnerDialog(true);
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete partner ${partner.name}? This will detach all organizations.`)) {
                                deletePartnerMutation.mutate(partner.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Partner Details */}
          {selectedPartner && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="w-5 h-5" />
                  {selectedPartner.name} Details
                </CardTitle>
                <CardDescription>
                  Partner statistics and organization management
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Partner Stats */}
                {partnerStats && (
                  <div className="grid gap-4 md:grid-cols-3 mb-6">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Organizations</CardDescription>
                        <CardTitle>{partnerStats.totalOrganizations}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Total Users</CardDescription>
                        <CardTitle>{partnerStats.totalUsers}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Active Users</CardDescription>
                        <CardTitle>{partnerStats.activeUsers}</CardTitle>
                      </CardHeader>
                    </Card>
                  </div>
                )}

                {/* Partner Organizations */}
                <div>
                  <h3 className="text-lg font-semibold mb-2">Partner Organizations</h3>
                  {partnerOrgs?.length === 0 ? (
                    <p className="text-muted-foreground">No organizations attached to this partner</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Organization</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Users</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {partnerOrgs?.map((org: any) => (
                          <TableRow key={org.id}>
                            <TableCell>{org.name}</TableCell>
                            <TableCell>
                              <Badge>{org.plan}</Badge>
                            </TableCell>
                            <TableCell>{org.stats?.userCount || 0}</TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (confirm(`Detach ${org.name} from ${selectedPartner.name}?`)) {
                                    apiRequest(`/api/partners/organizations/${org.id}/partner`, 'DELETE')
                                      .then(() => {
                                        queryClient.invalidateQueries({ queryKey: ['/api/partners/firms'] });
                                        toast({ title: "Organization detached successfully" });
                                      });
                                  }
                                }}
                              >
                                Detach
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Promote Organization to Partner */}
          <Card>
            <CardHeader>
              <CardTitle>Promote Organization to Partner</CardTitle>
              <CardDescription>
                Convert an existing organization into a partner firm that can resell Whirkplace
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {organizations?.filter((org: any) => !org.partnerFirmId && org.plan !== 'partner')
                  .map((org: any) => (
                    <div key={org.id} className="flex items-center justify-between p-3 border rounded">
                      <div>
                        <p className="font-medium">{org.name}</p>
                        <p className="text-sm text-muted-foreground">{org.slug}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handlePromoteToPartner(org)}
                      >
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Promote to Partner
                      </Button>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Users</h2>
            <Dialog open={userDialog} onOpenChange={setUserDialog}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingUser(null)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingUser ? 'Edit' : 'Add'} User</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleUserSubmit}>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="name">Name</Label>
                      <Input 
                        id="name" 
                        name="name" 
                        defaultValue={editingUser?.name} 
                        required 
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input 
                        id="email" 
                        name="email" 
                        type="email"
                        defaultValue={editingUser?.email} 
                        required 
                      />
                    </div>
                    {!editingUser && (
                      <div>
                        <Label htmlFor="organizationId">Organization</Label>
                        <Select name="organizationId" required>
                          <SelectTrigger>
                            <SelectValue placeholder="Select organization" />
                          </SelectTrigger>
                          <SelectContent>
                            {organizations?.map((org: any) => (
                              <SelectItem key={org.id} value={org.id}>
                                {org.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label htmlFor="role">Role</Label>
                      <Select name="role" defaultValue={editingUser?.role || 'member'}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="password">
                        {editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
                      </Label>
                      <Input 
                        id="password" 
                        name="password" 
                        type="password"
                        required={!editingUser}
                      />
                    </div>
                    <div>
                      <Label htmlFor="isActive">Status</Label>
                      <Select name="isActive" defaultValue={editingUser?.isActive?.toString() || 'true'}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Active</SelectItem>
                          <SelectItem value="false">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter className="mt-4">
                    <Button type="submit">
                      {editingUser ? 'Update' : 'Create'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">Loading...</TableCell>
                    </TableRow>
                  ) : users?.map((user: any) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.name}
                        {user.is_super_admin && (
                          <Badge variant="destructive" className="ml-2">
                            Super Admin
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.organizationName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{user.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.isActive ? "default" : "secondary"}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingUser(user);
                              setUserDialog(true);
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setMovingUser(user);
                              setMoveUserDialog(true);
                            }}
                          >
                            <MoveRight className="w-4 h-4" />
                          </Button>
                          {!user.is_super_admin && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (confirm(`Delete user ${user.name}?`)) {
                                  deleteUserMutation.mutate(user.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Move User Dialog */}
      <Dialog open={moveUserDialog} onOpenChange={setMoveUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move User to Different Organization</DialogTitle>
            <DialogDescription>
              Moving {movingUser?.name} ({movingUser?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Current Organization</Label>
              <p className="text-sm text-muted-foreground">{movingUser?.organizationName}</p>
            </div>
            <div>
              <Label htmlFor="targetOrg">Target Organization</Label>
              <Select value={targetOrgId} onValueChange={setTargetOrgId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations?.filter((org: any) => org.id !== movingUser?.organizationId).map((org: any) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setMoveUserDialog(false);
                setMovingUser(null);
                setTargetOrgId("");
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleMoveUser}
              disabled={!targetOrgId}
            >
              Move User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}