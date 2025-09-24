import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

export default function SelectOrganizationPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);

  // Fetch available organizations for super admin
  const { data: organizations, isLoading, error } = useQuery({
    queryKey: ['/api/super-admin/organizations'],
  });

  // Check if coming from Slack OAuth
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    
    if (action === 'slack') {
      toast({
        title: "Authentication Successful",
        description: "Please select an organization to continue.",
      });
    }
  }, [toast]);

  const handleOrganizationSelect = (orgSlug: string) => {
    // Store the selected organization
    localStorage.setItem('selected-org', orgSlug);
    
    // Redirect to the organization's dashboard
    setLocation(`/dashboard?org=${orgSlug}`);
  };

  const handleCreateNewOrganization = () => {
    // Redirect to signup page to create new organization
    setLocation('/signup');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading organizations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
            <CardDescription>Failed to load organizations</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Select Organization</h1>
          <p className="mt-2 text-gray-600">
            Choose an organization to manage or create a new one
          </p>
        </div>

        <div className="space-y-4">
          {organizations && organizations.length > 0 ? (
            organizations.map((org: any) => (
              <Card 
                key={org.id} 
                className={`cursor-pointer transition-all hover:shadow-lg ${
                  selectedOrg === org.slug ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => setSelectedOrg(org.slug)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Building2 className="h-8 w-8 text-blue-600" />
                      <div>
                        <CardTitle>{org.name}</CardTitle>
                        <CardDescription>
                          {org.slug} • {org.plan} plan
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOrganizationSelect(org.slug);
                      }}
                      variant={selectedOrg === org.slug ? "default" : "outline"}
                    >
                      Select
                    </Button>
                  </div>
                </CardHeader>
                {org.id === 'whirkplace' && (
                  <CardContent>
                    <p className="text-sm text-gray-500">
                      Super Admin Organization - Full platform access
                    </p>
                  </CardContent>
                )}
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-gray-500">No organizations available</p>
              </CardContent>
            </Card>
          )}

          <Card 
            className="cursor-pointer border-dashed border-2 hover:border-blue-500 hover:bg-blue-50 transition-all"
            onClick={handleCreateNewOrganization}
          >
            <CardHeader>
              <div className="flex items-center justify-center space-x-3">
                <Plus className="h-8 w-8 text-blue-600" />
                <div>
                  <CardTitle>Create New Organization</CardTitle>
                  <CardDescription>
                    Set up a new organization for your team
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
}