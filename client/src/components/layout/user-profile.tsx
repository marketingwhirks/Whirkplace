import { useState } from "react";
import { LogOut, User, Settings, AlertTriangle } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { queryClient } from "@/lib/queryClient";
import { SupportReportForm } from "@/components/support/SupportReportForm";

export function UserProfile() {
  const { data: currentUser } = useCurrentUser();
  const { toast } = useToast();
  const [isSupportFormOpen, setIsSupportFormOpen] = useState(false);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Logout failed');
      }
      return response.json();
    },
    onSuccess: () => {
      // Clear all cached data
      queryClient.clear();
      
      // Force redirect to login page instead of invalidating queries
      // This prevents race conditions and runtime errors
      window.location.href = "/login?org=default";
      
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
          data-testid="settings-menu-item"
        >
          <Settings className="mr-2 h-4 w-4" />
          <span>Settings</span>
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
    </DropdownMenu>
  );
}