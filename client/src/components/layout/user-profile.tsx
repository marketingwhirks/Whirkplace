import { useState } from "react";
import { useLocation } from "wouter";
import { LogOut, User, Settings, AlertTriangle, HelpCircle, CheckCircle2, Lightbulb, MessageSquare, Shield } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { queryClient } from "@/lib/queryClient";
import { SupportReportForm } from "@/components/support/SupportReportForm";
import { getHelpContent } from "@/lib/helpRegistry";
import { useRoleSwitch } from "@/hooks/useViewAsRole";
import RoleSwitcher from "@/components/admin/role-switcher";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function UserProfile() {
  const { data: currentUser } = useCurrentUser();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [isSupportFormOpen, setIsSupportFormOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isRoleSwitcherOpen, setIsRoleSwitcherOpen] = useState(false);
  const { canSwitchRoles } = useRoleSwitch();
  
  const helpContent = getHelpContent(location);

  const openSupportForm = (category: "bug" | "question" | "feature_request" = "question") => {
    setIsHelpOpen(false);
    setIsSupportFormOpen(true);
  };

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Add localStorage auth headers for proper authentication
      const authUserId = localStorage.getItem('auth_user_id');
      const headers: Record<string, string> = {};
      
      if (authUserId) {
        headers['x-auth-user-id'] = authUserId;
      }
      
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers
      });
      if (!response.ok) {
        throw new Error('Logout failed');
      }
      return response.json();
    },
    onSuccess: () => {
      // Clear ALL localStorage items related to authentication
      localStorage.removeItem('auth_user_id');
      localStorage.removeItem('auth_org_id');
      localStorage.removeItem('auth_session_token');
      localStorage.removeItem('auth_user_data');
      localStorage.removeItem('whirkplace-user');
      localStorage.removeItem('roleSwitch');
      
      // Clear all cached data
      queryClient.clear();
      
      // Force a hard redirect to fully clear client state
      window.location.replace("/");  // Go to home page instead of login
      
      toast({
        title: "Logged out successfully",
        description: "You have been signed out of your account",
      });
    },
    onError: (error) => {
      toast({
        title: "Logout failed",
        description: "Please try again",
        variant: "destructive",
      });
    }
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  if (!currentUser) {
    return null;
  }

  // Get profile picture from Slack or Microsoft, fallback to generic avatar
  const profilePicture = currentUser.slackAvatar || currentUser.microsoftAvatar || currentUser.avatar;
  
  // Get user initials for fallback
  const initials = currentUser.name
    .split(' ')
    .map(name => name[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          className="relative h-10 w-10 rounded-full p-0"
          data-testid="user-profile-button"
        >
          <Avatar className="h-10 w-10">
            {profilePicture && (
              <AvatarImage 
                src={profilePicture} 
                alt={currentUser.name}
                className="object-cover"
              />
            )}
            <AvatarFallback className="bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none" data-testid="user-name">
              {currentUser.name}
            </p>
            <p className="text-xs leading-none text-muted-foreground" data-testid="user-email">
              {currentUser.email}
            </p>
            <p className="text-xs leading-none text-muted-foreground capitalize" data-testid="user-role">
              {currentUser.role}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          className="cursor-pointer"
          data-testid="profile-menu-item"
        >
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem 
          className="cursor-pointer"
          onClick={() => setLocation('/settings')}
          data-testid="settings-menu-item"
        >
          <Settings className="mr-2 h-4 w-4" />
          <span>Settings</span>
        </DropdownMenuItem>
        {canSwitchRoles && (
          <DropdownMenuItem 
            className="cursor-pointer"
            data-testid="role-switcher-menu-item"
            onClick={() => setIsRoleSwitcherOpen(true)}
          >
            <Shield className="mr-2 h-4 w-4" />
            <span>Test as Role</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem 
          className="cursor-pointer"
          onClick={() => setIsHelpOpen(true)}
          data-testid="help-menu-item"
        >
          <HelpCircle className="mr-2 h-4 w-4" />
          <span>Help</span>
        </DropdownMenuItem>
        <DropdownMenuItem 
          className="cursor-pointer"
          onClick={() => setIsSupportFormOpen(true)}
          data-testid="support-menu-item"
        >
          <AlertTriangle className="mr-2 h-4 w-4" />
          <span>Report a Problem</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          className="cursor-pointer text-red-600 focus:text-red-600"
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
          data-testid="logout-menu-item"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{logoutMutation.isPending ? 'Signing out...' : 'Sign out'}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
      
      <SupportReportForm
        isOpen={isSupportFormOpen}
        onClose={() => setIsSupportFormOpen(false)}
        defaultCategory="bug"
      />

      <Sheet open={isHelpOpen} onOpenChange={setIsHelpOpen}>
        <SheetContent className="w-[400px] sm:w-[540px]" data-testid="sheet-help">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-blue-500" />
              {helpContent.title}
            </SheetTitle>
            <SheetDescription>
              Get help with this page and contact support
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-6 space-y-6">
            {/* Current Page Help */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Tips for this page
              </h3>
              <div className="space-y-2">
                {helpContent.tips.map((tip, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-700 dark:text-gray-300">{tip}</p>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Quick Actions */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Quick Actions
              </h3>
              <div className="grid gap-2">
                <Button
                  variant="outline"
                  className="justify-start h-auto p-3"
                  onClick={() => openSupportForm("question")}
                >
                  <MessageSquare className="w-4 h-4 mr-3 text-blue-500" />
                  <div className="text-left">
                    <div className="font-medium">Ask a Question</div>
                    <div className="text-xs text-muted-foreground">Get help from our support team</div>
                  </div>
                </Button>
                
                <Button
                  variant="outline"
                  className="justify-start h-auto p-3"
                  onClick={() => openSupportForm("feature_request")}
                >
                  <Lightbulb className="w-4 h-4 mr-3 text-yellow-500" />
                  <div className="text-left">
                    <div className="font-medium">Request a Feature</div>
                    <div className="text-xs text-muted-foreground">Suggest improvements or new features</div>
                  </div>
                </Button>
                
                <Button
                  variant="outline"
                  className="justify-start h-auto p-3"
                  onClick={() => openSupportForm("bug")}
                >
                  <AlertTriangle className="w-4 h-4 mr-3 text-red-500" />
                  <div className="text-left">
                    <div className="font-medium">Report a Bug</div>
                    <div className="text-xs text-muted-foreground">Let us know about any issues</div>
                  </div>
                </Button>
              </div>
            </div>

            <Separator />

            {/* Help Badge */}
            <div className="flex items-center justify-center">
              <Badge variant="secondary" className="text-xs">
                Need more help? Use the quick actions above
              </Badge>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      
      {/* Role Switcher Dialog for Super Admins */}
      {canSwitchRoles && (
        <Dialog open={isRoleSwitcherOpen} onOpenChange={setIsRoleSwitcherOpen}>
          <DialogContent className="max-w-lg" data-testid="dialog-role-switcher">
            <DialogHeader>
              <DialogTitle>Test as Different Role</DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              <RoleSwitcher />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </DropdownMenu>
  );
}