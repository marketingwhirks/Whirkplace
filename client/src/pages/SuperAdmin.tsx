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
import { Building2, Users, Edit, Trash2, Plus, MoveRight, Shield } from "lucide-react";

export default function SuperAdmin() {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("organizations");
  const [orgDialog, setOrgDialog] = useState(false);
  const [userDialog, setUserDialog] = useState(false);
  const [moveUserDialog, setMoveUserDialog] = useState(false);
  const [editingOrg, setEditingOrg] = useState<any>(null);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [movingUser, setMovingUser] = useState<any>(null);
  const [targetOrgId, setTargetOrgId] = useState("");

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
    mutationFn: (data: any) => apiRequest('/api/super-admin/organizations', 'POST', data),
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
    mutationFn: (data: any) => apiRequest(`/api/super-admin/organizations/${data.id}`, 'PUT', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/organizations'] });
      setOrgDialog(false);
      setEditingOrg(null);
      toast({ title: "Organization updated successfully" });
    }
  });

  const deleteOrgMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/super-admin/organizations/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/stats'] });
      toast({ title: "Organization deleted successfully" });
    }
  });

  // User mutations
  const createUserMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/super-admin/users', 'POST', data),
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
    mutationFn: (data: any) => apiRequest(`/api/super-admin/users/${data.id}`, 'PUT', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/users'] });
      setUserDialog(false);
      setEditingUser(null);
      toast({ title: "User updated successfully" });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/super-admin/users/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/stats'] });
      toast({ title: "User deleted successfully" });
    }
  });

  const moveUserMutation = useMutation({
    mutationFn: (data: { userId: string; targetOrganizationId: string }) => 
      apiRequest(`/api/super-admin/users/${data.userId}/move`, 'POST', { targetOrganizationId: data.targetOrganizationId }),
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