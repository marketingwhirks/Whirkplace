import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Building2, ChevronDown, Check, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  customValues?: string[];
  isActive?: boolean;
}

interface UserOrganization {
  organization: Organization;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  isCurrent: boolean;
}

interface SwitchOrganizationResponse {
  message: string;
  organization: Organization;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  session: {
    organizationId: string;
    organizationSlug: string;
    userId: string;
    role: string;
  };
}

export default function OrganizationSwitcher() {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  // Fetch user's organizations
  const { data: organizationsData, isLoading, error } = useQuery<{
    organizations: UserOrganization[];
    currentOrganizationId: string;
  }>({
    queryKey: ['/api/auth/my-organizations'],
    retry: 1,
  });

  // Switch organization mutation with proper typing and error handling
  const switchOrgMutation = useMutation<SwitchOrganizationResponse, Error, string>({
    mutationFn: async (organizationId: string) => {
      return apiRequest('/api/auth/switch-organization', {
        method: 'POST',
        body: JSON.stringify({ organizationId }),
      });
    },
    onSuccess: (data) => {
      // Verify session was properly updated
      if (data.session && data.organization) {
        toast({
          title: "Organization Switched",
          description: `Successfully switched to ${data.organization.name} as ${data.session.role}`,
        });

        // Invalidate all queries to refresh data with new organization context
        queryClient.invalidateQueries({ queryKey: ['/api'] });
        queryClient.invalidateQueries({ queryKey: ['/users'] });
        
        // Small delay to allow toast to show before reload
        setTimeout(() => {
          window.location.reload();
        }, 300);
      } else {
        // Unexpected response format
        toast({
          title: "Switch Incomplete",
          description: "Organization switch may not have completed properly. Please try again.",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      // Provide more detailed error messages
      let errorMessage = "Failed to switch organization";
      
      if (error.response?.status === 403) {
        errorMessage = "You don't have access to this organization";
      } else if (error.response?.status === 500) {
        errorMessage = "Internal server error. Please try again later";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Switch Failed",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Re-open the dropdown so user can try again
      setIsOpen(true);
    },
  });

  const handleSwitchOrganization = async (organizationId: string) => {
    // Don't switch if already in that organization
    const currentOrg = organizationsData?.organizations.find(o => o.isCurrent);
    if (currentOrg?.organization.id === organizationId) {
      toast({
        title: "Already Active",
        description: "You are already in this organization",
      });
      setIsOpen(false);
      return;
    }

    // Close dropdown immediately to show loading state on button
    setIsOpen(false);
    
    // Perform the switch with proper error handling
    try {
      await switchOrgMutation.mutateAsync(organizationId);
    } catch (error) {
      // Error is already handled in onError callback
      console.error("Failed to switch organization:", error);
    }
  };

  // Don't show switcher if user only has one organization
  if (!organizationsData || organizationsData.organizations.length <= 1) {
    return null;
  }

  if (error) {
    return null; // Silently fail if we can't load organizations
  }

  const currentOrg = organizationsData.organizations.find(o => o.isCurrent);
  const otherOrgs = organizationsData.organizations.filter(o => !o.isCurrent);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
          data-testid="button-organization-switcher"
          disabled={switchOrgMutation.isPending}
        >
          {switchOrgMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="max-w-[150px] truncate">Switching...</span>
            </>
          ) : (
            <>
              <Building2 className="h-4 w-4" />
              <span className="max-w-[150px] truncate">
                {currentOrg?.organization.name || "Select Org"}
              </span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[250px]">
        <DropdownMenuLabel>Switch Organization</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {/* Current Organization */}
        {currentOrg && (
          <>
            <DropdownMenuItem
              disabled
              className="flex items-center justify-between"
              data-testid={`org-current-${currentOrg.organization.id}`}
            >
              <div className="flex flex-col">
                <span className="font-medium">{currentOrg.organization.name}</span>
                <span className="text-xs text-muted-foreground">
                  {currentOrg.user.role} · Current
                </span>
              </div>
              <Check className="h-4 w-4 text-green-600" />
            </DropdownMenuItem>
            {otherOrgs.length > 0 && <DropdownMenuSeparator />}
          </>
        )}
        
        {/* Other Organizations */}
        {otherOrgs.map((org) => (
          <DropdownMenuItem
            key={org.organization.id}
            onClick={() => handleSwitchOrganization(org.organization.id)}
            disabled={switchOrgMutation.isPending}
            className="cursor-pointer"
            data-testid={`org-switch-${org.organization.id}`}
          >
            <div className="flex flex-col">
              <span className="font-medium">{org.organization.name}</span>
              <span className="text-xs text-muted-foreground">
                {org.user.role} · {org.organization.plan}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
        
        {otherOrgs.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            No other organizations available
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}