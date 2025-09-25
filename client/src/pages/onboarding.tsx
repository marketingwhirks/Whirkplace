import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  Building, CreditCard, Users, Heart, UserPlus, Settings, 
  Check, ChevronRight, Loader2, AlertCircle, Slack, Mail, Download,
  Search, X, UserCheck, Building2
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface OnboardingStatus {
  status: 'not_started' | 'in_progress' | 'completed';
  currentStep?: string;
  completedSteps: {
    workspace: boolean;
    billing: boolean;
    roles: boolean;
    values: boolean;
    members: boolean;
    settings: boolean;
  };
  completedAt?: string;
}

interface AuthContext {
  authProvider: 'slack' | 'microsoft' | 'google' | 'email';
  organizationId: string | null;
  organizationName: string | null;
  capabilities: {
    canImportMembers: boolean;
    canImportRoles: boolean;
    canImportWorkspace: boolean;
    hasWorkspaceName: boolean;
    hasMembers: boolean;
    memberCount: number;
  };
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

// Step interface with smart onboarding properties
interface Step {
  id: string;
  title: string;
  icon: any;
  description: string;
  skipped?: boolean;
  skipReason?: string;
  canImport?: boolean;
  importProvider?: string;
  canAutoImport?: boolean;
}

// Static steps for reference - actual steps will be filtered based on auth context
const ALL_STEPS: Step[] = [
  { id: 'workspace', title: 'Workspace', icon: Building, description: 'Confirm your workspace details' },
  { id: 'billing', title: 'Billing', icon: CreditCard, description: 'Choose monthly or annual billing' },
  { id: 'roles', title: 'Roles', icon: Users, description: 'Configure team roles and permissions' },
  { id: 'values', title: 'Values', icon: Heart, description: 'Define your company values' },
  { id: 'members', title: 'Team', icon: UserPlus, description: 'Import or invite team members' },
  { id: 'settings', title: 'Settings', icon: Settings, description: 'Configure check-in schedules' },
];

// Provider icon component
const ProviderIcon = ({ provider }: { provider: string }) => {
  switch(provider) {
    case 'slack':
      return <Slack className="h-4 w-4" />;
    case 'microsoft':
      return <Building2 className="h-4 w-4" />;
    case 'google':
      return <Building className="h-4 w-4" />;
    default:
      return <Mail className="h-4 w-4" />;
  }
};

// Provider name helper
const getProviderName = (provider: string) => {
  switch(provider) {
    case 'slack': return 'Slack';
    case 'microsoft': return 'Microsoft';
    case 'google': return 'Google Workspace';
    default: return 'Email';
  }
};

// User type for import selection
interface ImportUser {
  id: string;
  email: string;
  name: string;
  department?: string;
  title?: string;
  avatar?: string | null;
  alreadyImported: boolean;
}

// User Import Selector Component
function UserImportSelector({ provider, onImportComplete }: { provider: string; onImportComplete: () => void }) {
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<ImportUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const { toast } = useToast();
  
  // Fetch available users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await apiRequest('GET', '/api/onboarding/available-users');
        const data = await res.json();
        setAvailableUsers(data.users || []);
        
        // Pre-select non-imported users
        const initialSelected = new Set(
          data.users
            .filter((u: ImportUser) => !u.alreadyImported)
            .map((u: ImportUser) => u.id)
        );
        setSelectedUsers(initialSelected);
      } catch (error) {
        toast({
          title: 'Failed to load users',
          description: 'Unable to fetch team members from ' + getProviderName(provider),
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchUsers();
  }, [provider, toast]);
  
  // Get unique departments for filter
  const departments = Array.from(new Set(availableUsers.map(u => u.department).filter(Boolean)));
  
  // Filter users based on search and department
  const filteredUsers = availableUsers.filter(user => {
    const matchesSearch = !searchQuery || 
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDepartment = departmentFilter === 'all' || user.department === departmentFilter;
    return matchesSearch && matchesDepartment;
  });
  
  // Handle select all/none
  const handleSelectAll = () => {
    const newSelected = new Set(
      filteredUsers
        .filter(u => !u.alreadyImported)
        .map(u => u.id)
    );
    setSelectedUsers(newSelected);
  };
  
  const handleSelectNone = () => {
    setSelectedUsers(new Set());
  };
  
  // Handle user selection
  const toggleUser = (userId: string, alreadyImported: boolean) => {
    if (alreadyImported) return;
    
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };
  
  // Handle import
  const handleImport = async () => {
    if (selectedUsers.size === 0) {
      toast({
        title: 'No users selected',
        description: 'Please select at least one user to import',
        variant: 'destructive'
      });
      return;
    }
    
    setImporting(true);
    try {
      const res = await apiRequest('POST', '/api/onboarding/import-selected-users', {
        userIds: Array.from(selectedUsers)
      });
      const data = await res.json();
      
      toast({
        title: 'Import successful',
        description: data.message
      });
      
      // Call the completion callback
      onImportComplete();
    } catch (error) {
      toast({
        title: 'Import failed',
        description: 'Unable to import selected users',
        variant: 'destructive'
      });
    } finally {
      setImporting(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading team members from {getProviderName(provider)}...</span>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Select Team Members to Import</h3>
          <p className="text-sm text-muted-foreground">
            Choose which team members to add to Whirkplace
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-1">
          <ProviderIcon provider={provider} />
          {availableUsers.length} available
        </Badge>
      </div>
      
      {/* Filters */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {departments.length > 0 && (
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(dept => (
                <SelectItem key={dept} value={dept || 'unknown'}>{dept}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      
      {/* Quick actions */}
      <div className="flex justify-between items-center border-b pb-2">
        <div className="text-sm text-muted-foreground">
          {selectedUsers.size} of {filteredUsers.filter(u => !u.alreadyImported).length} selected
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleSelectAll}>
            Select All
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSelectNone}>
            Select None
          </Button>
        </div>
      </div>
      
      {/* User list */}
      <div className="max-h-[400px] overflow-y-auto space-y-2 border rounded-lg p-2">
        {filteredUsers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No users found matching your criteria
          </div>
        ) : (
          filteredUsers.map(user => (
            <div 
              key={user.id}
              className={`flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 cursor-pointer ${
                user.alreadyImported ? 'opacity-50' : ''
              }`}
              onClick={() => toggleUser(user.id, user.alreadyImported)}
            >
              <Checkbox
                checked={user.alreadyImported || selectedUsers.has(user.id)}
                disabled={user.alreadyImported}
                onCheckedChange={() => toggleUser(user.id, user.alreadyImported)}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex-1">
                <div className="font-medium">{user.name}</div>
                <div className="text-sm text-muted-foreground">{user.email}</div>
                {(user.department || user.title) && (
                  <div className="text-xs text-muted-foreground">
                    {user.title && <span>{user.title}</span>}
                    {user.title && user.department && <span> · </span>}
                    {user.department && <span>{user.department}</span>}
                  </div>
                )}
              </div>
              {user.alreadyImported && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <UserCheck className="h-3 w-3" />
                  Already added
                </Badge>
              )}
            </div>
          ))
        )}
      </div>
      
      {/* Import button */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          You can always add more members later
        </p>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={onImportComplete}
            disabled={importing}
          >
            Skip for now
          </Button>
          <Button 
            onClick={handleImport}
            disabled={importing || selectedUsers.size === 0}
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Import {selectedUsers.size} {selectedUsers.size === 1 ? 'Member' : 'Members'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function OnboardingPage() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState<any>({
    workspace: { name: '', industry: '' },
    billing: {},
    roles: {},
    values: [],
    members: [],
    settings: {}
  });

  // Get org slug from query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const orgSlug = urlParams.get('org');

  // Get authentication context for smart onboarding
  const { data: authContext } = useQuery<AuthContext>({
    queryKey: ['/api/auth/context'],
    enabled: !!currentUser
  });

  // Get onboarding status
  const { data: onboardingStatus, isLoading: statusLoading } = useQuery<OnboardingStatus>({
    queryKey: ['/api/onboarding/status'],
    enabled: !!currentUser
  });

  // Get organization details - try by slug first (for new orgs), then by user's org ID
  const { data: organization, error: orgError } = useQuery({
    queryKey: orgSlug ? [`/api/organizations/by-slug/${orgSlug}`] : [`/api/organizations/${currentUser?.organizationId}`],
    enabled: !!orgSlug || !!currentUser?.organizationId,
    retry: 2
  });
  
  // Handle OAuth authentication parameters from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authUserIdFromUrl = params.get('auth_user_id');
    const authOrgIdFromUrl = params.get('auth_org_id');
    const authSessionFromUrl = params.get('auth_session');
    
    // If we have auth params in URL, set them in localStorage and clean the URL
    if (authUserIdFromUrl) {
      console.log('Setting authentication from OAuth redirect:', {
        userId: authUserIdFromUrl,
        orgId: authOrgIdFromUrl,
        hasSession: !!authSessionFromUrl,
        orgSlug
      });
      
      // Set auth in localStorage
      localStorage.setItem('x-auth-user-id', authUserIdFromUrl);
      if (authOrgIdFromUrl) {
        localStorage.setItem('x-auth-org-id', authOrgIdFromUrl);
      }
      if (authSessionFromUrl) {
        localStorage.setItem('auth_session_token', authSessionFromUrl);
      }
      
      // Clean URL by removing auth params but keeping org param
      const cleanParams = new URLSearchParams();
      if (orgSlug) {
        cleanParams.set('org', orgSlug);
      }
      const cleanUrl = window.location.pathname + (cleanParams.toString() ? '?' + cleanParams.toString() : '');
      window.history.replaceState({}, '', cleanUrl);
      
      // Reload to pick up the new auth
      window.location.reload();
      return;
    }
  }, [orgSlug]);
  
  // Log organization fetch status for debugging
  useEffect(() => {
    const authUserId = localStorage.getItem('x-auth-user-id');
    console.log('Onboarding page auth status:', {
      hasAuthUserId: !!authUserId,
      authUserId,
      orgSlug,
      currentUserId: currentUser?.id,
      currentUserOrgId: currentUser?.organizationId
    });
    
    if (orgError) {
      console.error('Failed to fetch organization:', orgError);
    }
    if (organization) {
      console.log('Organization fetched:', organization);
    }
  }, [organization, orgError, currentUser, orgSlug]);

  // Create smart steps based on auth context
  const getSmartSteps = () => {
    if (!authContext) return ALL_STEPS;
    
    const steps = [...ALL_STEPS];
    
    // Mark steps that can be skipped based on auth provider
    return steps.map(step => {
      const stepCopy = { ...step };
      
      // Workspace step - skip if data already imported
      if (step.id === 'workspace' && authContext.capabilities.hasWorkspaceName) {
        return { ...stepCopy, skipped: true, skipReason: `Imported from ${getProviderName(authContext.authProvider)}` };
      }
      
      // Roles step - skip if can be imported
      if (step.id === 'roles' && authContext.capabilities.canImportRoles && authContext.authProvider !== 'email') {
        return { ...stepCopy, canAutoImport: true };
      }
      
      // Members step - modify if can import
      if (step.id === 'members') {
        if (authContext.capabilities.hasMembers) {
          return { ...stepCopy, skipped: true, skipReason: `${authContext.capabilities.memberCount} members already imported` };
        }
        if (authContext.capabilities.canImportMembers) {
          return { ...stepCopy, canImport: true, importProvider: authContext.authProvider };
        }
      }
      
      return stepCopy;
    }).filter(step => !step.skipped); // Remove skipped steps
  };
  
  const STEPS = getSmartSteps();

  // Complete step mutation
  const completeStepMutation = useMutation({
    mutationFn: async (step: string) => {
      try {
        const res = await apiRequest('POST', '/api/onboarding/complete-step', { step });
        return res.json();
      } catch (error: any) {
        // For now, return success to allow continuing through onboarding
        // The step completion tracking is optional
        console.warn('Step completion tracking failed, continuing anyway:', error);
        return { success: true };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/status'] });
    }
  });

  // Complete onboarding mutation
  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/onboarding/complete');
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Welcome aboard!',
        description: 'Onboarding completed successfully'
      });
      setLocation('/dashboard');
    }
  });

  // Update organization mutation
  const updateOrganizationMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('PATCH', `/api/organizations/${currentUser?.organizationId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${currentUser?.organizationId}`] });
    }
  });

  // Set current step based on status
  useEffect(() => {
    if (onboardingStatus) {
      if (onboardingStatus.status === 'completed') {
        setLocation('/dashboard');
        return;
      }

      // Find the first incomplete step
      const incompleteSteIndex = STEPS.findIndex(step => 
        !onboardingStatus.completedSteps[step.id as keyof typeof onboardingStatus.completedSteps]
      );
      if (incompleteSteIndex !== -1) {
        setCurrentStepIndex(incompleteSteIndex);
      }
    }
  }, [onboardingStatus, setLocation]);

  // Pre-populate form data from organization data (e.g., from Slack OAuth)
  useEffect(() => {
    if (organization) {
      setFormData(prev => ({
        ...prev,
        workspace: {
          ...prev.workspace,
          // Pre-fill organization name if it exists and form is empty
          name: prev.workspace.name || organization.name || '',
          // Pre-fill industry if it exists and form is empty
          industry: prev.workspace.industry || organization.industry || ''
        },
        // Pre-fill company values if they exist
        values: prev.values.length > 0 ? prev.values : (organization.customValues || [])
      }));
    }
  }, [organization]);

  const handleNext = async () => {
    const currentStep = STEPS[currentStepIndex];
    
    // Save current step data
    try {
      switch(currentStep.id) {
        case 'workspace':
          // Only send data if fields are filled
          const hasData = formData.workspace.name || formData.workspace.industry;
          if (hasData) {
            const workspaceData: any = {};
            if (formData.workspace.name) workspaceData.name = formData.workspace.name;
            if (formData.workspace.industry === 'other' && formData.workspace.customIndustry) {
              workspaceData.industry = formData.workspace.customIndustry;
            } else if (formData.workspace.industry && formData.workspace.industry !== 'other') {
              workspaceData.industry = formData.workspace.industry;
            }
            
            // Only call API if we have data to send
            if (Object.keys(workspaceData).length > 0) {
              await updateOrganizationMutation.mutateAsync(workspaceData);
            }
          }
          break;
        case 'values':
          if (formData.values && formData.values.length > 0) {
            await updateOrganizationMutation.mutateAsync({ 
              customValues: formData.values 
            });
          }
          break;
        case 'settings':
          // Only send settings that have been changed
          const settingsData: any = {};
          if (formData.settings.checkinFrequency) settingsData.checkinFrequency = formData.settings.checkinFrequency;
          if (formData.settings.notificationsEnabled !== undefined) settingsData.notificationsEnabled = formData.settings.notificationsEnabled;
          
          if (Object.keys(settingsData).length > 0) {
            await updateOrganizationMutation.mutateAsync(settingsData);
          }
          break;
      }

      // Move to next step or complete
      if (currentStepIndex === STEPS.length - 1) {
        // For now, just redirect to dashboard when done
        toast({
          title: 'Setup complete!',
          description: 'Welcome to Whirkplace'
        });
        setLocation('/dashboard');
      } else {
        setCurrentStepIndex(currentStepIndex + 1);
      }
    } catch (error: any) {
      console.error('Onboarding error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save progress',
        variant: 'destructive'
      });
    }
  };

  const handleSkip = () => {
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const renderStepContent = () => {
    const step = STEPS[currentStepIndex];
    
    switch(step.id) {
      case 'workspace':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                id="org-name"
                value={formData.workspace.name || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  workspace: { ...formData.workspace, name: e.target.value }
                })}
                placeholder="Enter your organization name"
              />
            </div>
            <div>
              <Label htmlFor="industry">Industry</Label>
              <Select
                value={formData.workspace.industry || ''}
                onValueChange={(value) => setFormData({
                  ...formData,
                  workspace: { ...formData.workspace, industry: value }
                })}
              >
                <SelectTrigger id="industry">
                  <SelectValue placeholder="Select your industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accounting">Accounting Firm</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="fitness">Fitness</SelectItem>
                  <SelectItem value="healthcare">Healthcare</SelectItem>
                  <SelectItem value="home_care">Home Care</SelectItem>
                  <SelectItem value="home_services">Home Services</SelectItem>
                  <SelectItem value="law">Law Firm</SelectItem>
                  <SelectItem value="restaurant">Restaurant</SelectItem>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="technology">Technology</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              {formData.workspace.industry === 'other' && (
                <Input
                  className="mt-2"
                  placeholder="Please specify your industry"
                  value={formData.workspace.customIndustry || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    workspace: { ...formData.workspace, customIndustry: e.target.value }
                  })}
                />
              )}
            </div>
          </div>
        );

      case 'billing':
        return (
          <div className="space-y-4">
            <div className="text-center p-6 border rounded-lg">
              <CreditCard className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold mb-2">Choose Your Plan</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Choose monthly or annual billing. Save up to 22% with annual plans.
              </p>
              <div className="grid gap-4 mt-6">
                <Card className="cursor-pointer hover:border-primary">
                  <CardHeader>
                    <CardTitle>Starter</CardTitle>
                    <CardDescription>$8/month or $75/year (save 22%)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm space-y-1">
                      <li>✓ Weekly check-ins</li>
                      <li>✓ Shout outs & recognition</li>
                      <li>✓ Wins board</li>
                    </ul>
                  </CardContent>
                </Card>
                <Card className="cursor-pointer hover:border-primary">
                  <CardHeader>
                    <CardTitle>Professional</CardTitle>
                    <CardDescription>$15/month or $145/year (save 19%)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm space-y-1">
                      <li>✓ One-on-ones</li>
                      <li>✓ KRA management</li>
                      <li>✓ Advanced analytics</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
              <Button className="mt-4 w-full" variant="outline">
                Set Up Payment Later
              </Button>
            </div>
          </div>
        );

      case 'roles':
        return (
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Default Roles</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span>Admin</span>
                  <Badge>Full Access</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Manager</span>
                  <Badge variant="secondary">Team Management</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Member</span>
                  <Badge variant="outline">Basic Access</Badge>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              You can customize roles and permissions after setup
            </p>
          </div>
        );

      case 'values':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add up to 6 company values that represent your culture
            </p>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Input
                key={index}
                placeholder={`Value ${index + 1}`}
                value={formData.values[index] || ''}
                onChange={(e) => {
                  const newValues = [...formData.values];
                  newValues[index] = e.target.value;
                  setFormData({ ...formData, values: newValues });
                }}
              />
            ))}
          </div>
        );

      case 'members':
        const currentStep = STEPS[currentStepIndex];
        const canImport = currentStep?.canImport;
        const importProvider = currentStep?.importProvider;
        
        // If can't import, show simple message
        if (!canImport || !importProvider) {
          return (
            <div className="space-y-4">
              <div className="text-center p-6 border rounded-lg">
                <UserPlus className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">Team Members</h3>
                <p className="text-sm text-muted-foreground">
                  You can add team members after completing setup
                </p>
              </div>
            </div>
          );
        }
        
        // User selection interface for import
        return (
          <UserImportSelector 
            provider={importProvider}
            onImportComplete={() => {
              // Move to next step after import
              handleNext();
            }}
          />
        );

      case 'settings':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="checkin-day">Weekly Check-in Day</Label>
              <Select
                value={formData.settings.weeklyCheckInSchedule || 'friday'}
                onValueChange={(value) => setFormData({
                  ...formData,
                  settings: { ...formData.settings, weeklyCheckInSchedule: value }
                })}
              >
                <SelectTrigger id="checkin-day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monday">Monday</SelectItem>
                  <SelectItem value="tuesday">Tuesday</SelectItem>
                  <SelectItem value="wednesday">Wednesday</SelectItem>
                  <SelectItem value="thursday">Thursday</SelectItem>
                  <SelectItem value="friday">Friday</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="checkin-time">Reminder Time</Label>
              <Input
                id="checkin-time"
                type="time"
                value={formData.settings.checkInReminderTime || '09:00'}
                onChange={(e) => setFormData({
                  ...formData,
                  settings: { ...formData.settings, checkInReminderTime: e.target.value }
                })}
              />
            </div>
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={formData.settings.timezone || 'America/Chicago'}
                onValueChange={(value) => setFormData({
                  ...formData,
                  settings: { ...formData.settings, timezone: value }
                })}
              >
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern Time</SelectItem>
                  <SelectItem value="America/Chicago">Central Time</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (userLoading || statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'super_admin')) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <AlertCircle className="w-8 h-8 text-destructive mb-2" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              Only administrators and super administrators can complete the onboarding process
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation('/dashboard')}>
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStep = STEPS[currentStepIndex];
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold">Welcome to Whirkplace!</h1>
            {authContext && authContext.authProvider !== 'email' && (
              <Badge variant="secondary" className="flex items-center gap-1.5">
                <ProviderIcon provider={authContext.authProvider} />
                {getProviderName(authContext.authProvider)} Setup
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {authContext && authContext.authProvider !== 'email' 
              ? `Setting up your workspace with ${getProviderName(authContext.authProvider)} - this will only take a moment`
              : 'Let\'s get your workspace set up in just a few steps'}
          </p>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              Step {currentStepIndex + 1} of {STEPS.length}
            </span>
            <span className="text-sm font-medium">
              {Math.round(progress)}% Complete
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Steps Navigation */}
        <div className="mb-8">
          <div className="flex justify-between">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isCompleted = onboardingStatus?.completedSteps[step.id as keyof typeof onboardingStatus.completedSteps];
              const isCurrent = index === currentStepIndex;
              
              return (
                <div
                  key={step.id}
                  className={`flex flex-col items-center ${
                    index < currentStepIndex || isCompleted
                      ? 'text-primary'
                      : isCurrent
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                      index < currentStepIndex || isCompleted
                        ? 'bg-primary text-primary-foreground'
                        : isCurrent
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <span className="text-xs hidden sm:block">{step.title}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              {React.createElement(currentStep.icon, { className: "w-6 h-6 text-primary" })}
              <div>
                <CardTitle>{currentStep.title}</CardTitle>
                <CardDescription>{currentStep.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {renderStepContent()}
          </CardContent>
          <div className="p-6 pt-0 flex justify-between">
            <div className="flex gap-2">
              {currentStepIndex > 0 && (
                <Button
                  variant="outline"
                  onClick={handleBack}
                >
                  Back
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={handleSkip}
                disabled={currentStepIndex === STEPS.length - 1}
              >
                Skip for now
              </Button>
            </div>
            <Button
              onClick={handleNext}
              disabled={completeStepMutation.isPending}
            >
              {completeStepMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : currentStepIndex === STEPS.length - 1 ? (
                'Complete Setup'
              ) : (
                <>
                  Continue
                  <ChevronRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}