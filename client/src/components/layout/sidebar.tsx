import React, { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { 
  Heart, ClipboardList, Users, Trophy, HelpCircle, BarChart3, Settings, Menu, Gift, 
  ClipboardCheck, Shield, Crown, Calendar, Target, Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useViewAsRole } from "@/hooks/useViewAsRole";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { Checkin } from "@shared/schema";


// Helper function to determine if a navigation item is active
function getIsActive(currentLocation: string, itemHref: string): boolean {
  // Normalize paths by removing trailing slashes
  const normalizedLocation = currentLocation.replace(/\/+$/, '') || '/';
  const normalizedHref = itemHref.replace(/\/+$/, '') || '/';
  
  // Handle root path specially - only exact match
  if (normalizedHref === "/") {
    return normalizedLocation === "/";
  }
  
  // For all other paths, only match exact paths to prevent multiple highlights
  return normalizedLocation === normalizedHref;
}

// Base navigation items available to all users
const baseNavigation = [
  { name: "Dashboard", href: "/", icon: BarChart3, roles: ["member", "manager", "admin"] },
  { name: "Check-ins", href: "/checkins", icon: ClipboardList, roles: ["member", "manager", "admin"] },
  { name: "One-on-Ones", href: "/one-on-ones", icon: Calendar, roles: ["member", "manager", "admin"] },
  { name: "KRA Management", href: "/kra-management", icon: Target, roles: ["member", "manager", "admin"] },
  { name: "Team", href: "/team", icon: Users, roles: ["member", "manager", "admin"] },
  { name: "Wins", href: "/wins", icon: Trophy, roles: ["member", "manager", "admin"] },
  { name: "Shout Outs", href: "/shoutouts", icon: Gift, roles: ["member", "manager", "admin"] },
  { name: "Questions", href: "/questions", icon: HelpCircle, roles: ["manager", "admin"] },
  { name: "Reviews", href: "/reviews", icon: ClipboardCheck, roles: ["manager", "admin"], hasBadge: true },
  { name: "Leadership Dashboard", href: "/leadership-dashboard", icon: Crown, roles: ["admin"] },
  { name: "Analytics", href: "/analytics", icon: BarChart3, roles: ["member", "manager", "admin"] },
  { name: "Admin Panel", href: "/admin", icon: Shield, roles: ["admin"] },
  { name: "Super Admin", href: "/super-admin", icon: Lock, roles: ["admin"] },
  { name: "Settings", href: "/settings", icon: Settings, roles: ["member", "manager", "admin"] },
];

// Sidebar content component
function SidebarContent() {
  const [location] = useLocation();
  const { data: currentUser, isLoading: userLoading, canSwitchRoles } = useViewAsRole();
  const { canAccessOneOnOnes, canAccessKraManagement, isLoading: featureLoading } = useFeatureAccess();

  // Fetch pending check-ins count for badge
  const { data: pendingCheckins = [], isLoading: pendingLoading } = useQuery<Checkin[]>({
    queryKey: ["/api/checkins/pending"],
    enabled: !userLoading && !!currentUser && (currentUser.role === "manager" || currentUser.role === "admin"),
    staleTime: 60 * 1000, // Cache for 1 minute
  });

  // Filter navigation items based on user role and feature access
  const visibleNavigation = useMemo(() => {
    if (!currentUser || !currentUser.role) {
      return [];
    }
    return baseNavigation.filter(item => {
      // Normal role-based filtering
      if (!item.roles.includes(currentUser.role)) {
        // Special exception: Allow Admin Panel access for users who can switch roles
        // This ensures Matthew Patrick can always access the role switcher
        if (item.name === "Admin Panel" && canSwitchRoles) {
          return true;
        }
        // Special exception: Super Admin only for users with isSuperAdmin flag
        if (item.name === "Super Admin" && currentUser.isSuperAdmin) {
          return true;
        }
        return false;
      }
      
      // Plan-based feature filtering
      if (item.name === "One-on-Ones" && !canAccessOneOnOnes) {
        return false;
      }
      
      if (item.name === "KRA Management" && !canAccessKraManagement) {
        return false;
      }
      
      return true;
    });
  }, [currentUser, canSwitchRoles, canAccessOneOnOnes, canAccessKraManagement]);

  // Get badge count for items with badges
  const getBadgeCount = (item: typeof baseNavigation[0]) => {
    if (!item.hasBadge || !currentUser) return undefined;
    
    switch (item.name) {
      case "Reviews":
        return pendingLoading ? undefined : pendingCheckins.length;
      default:
        return undefined;
    }
  };

  return (
    <div className="h-full bg-card border-r border-border flex flex-col">
      {/* Logo/Brand */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{backgroundColor: '#1b365d'}}>
            <Heart className="w-4 h-4 fill-accent stroke-accent" strokeWidth="2" />
          </div>
          <h1 className="text-xl font-bold" style={{color: '#1b365d'}}>WhirkPlace</h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {userLoading ? (
          // Loading skeleton for navigation
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          (visibleNavigation || []).map((item) => {
            // More robust active state detection with exact matching
            const isActive = getIsActive(location, item.href);
            const badgeCount = getBadgeCount(item);
            const showBadge = badgeCount !== undefined && badgeCount > 0;
            
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "sidebar-link flex items-center space-x-3 p-3 rounded-lg transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
                data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <item.icon className="w-5 h-5" />
                <span className={cn("font-medium", isActive && "font-medium")}>
                  {item.name}
                </span>
                {showBadge && (
                  <span className="ml-auto notification-badge bg-primary text-primary-foreground text-xs rounded-full px-2 py-1">
                    {badgeCount}
                  </span>
                )}
                {/* Show loading indicator for badges */}
                {item.hasBadge && pendingLoading && item.name === "Reviews" && (
                  <div className="ml-auto w-5 h-5">
                    <Skeleton className="w-5 h-5 rounded-full" />
                  </div>
                )}
              </Link>
            );
          })
        )}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-border">
        {userLoading ? (
          <div className="flex items-center space-x-3">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-20 mb-1" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="w-4 h-4" />
          </div>
        ) : currentUser ? (
          <div className="flex items-center space-x-3">
            {currentUser.avatar ? (
              <img
                src={currentUser.avatar}
                alt="User avatar"
                className="w-10 h-10 rounded-full"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-medium">
                  {currentUser.name?.[0] || "U"}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {currentUser.name}
              </p>
              <p className="text-xs text-muted-foreground truncate capitalize">
                {currentUser.role}
                {currentUser.role === "admin" && (
                  <Shield className="w-3 h-3 inline ml-1" />
                )}
                {currentUser.role === "manager" && (
                  <ClipboardCheck className="w-3 h-3 inline ml-1" />
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground">
            Not authenticated
          </div>
        )}
      </div>
    </div>
  );
}

// Mobile trigger button
export function MobileSidebarTrigger() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" data-testid="mobile-menu-trigger">
          <Menu className="h-6 w-6" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SidebarContent />
      </SheetContent>
    </Sheet>
  );
}

// Main sidebar component
export default function Sidebar() {
  const isMobile = useIsMobile();

  // On mobile, don't render the static sidebar
  if (isMobile) {
    return null;
  }

  // On desktop, show the static sidebar
  return (
    <div className="w-64">
      <SidebarContent />
    </div>
  );
}
