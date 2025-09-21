import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Plus, 
  ClipboardCheck, 
  Trophy, 
  Users, 
  Settings,
  Calendar,
  BarChart3,
  MessageSquare 
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface QuickAction {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  variant?: "default" | "secondary" | "outline" | "ghost";
  disabled?: boolean;
  badge?: string | number;
}

export interface QuickActionsProps {
  title?: string;
  actions: QuickAction[];
  layout?: "grid" | "list";
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}

export function QuickActions({
  title = "Quick Actions",
  actions,
  layout = "grid",
  columns = 2,
  className,
}: QuickActionsProps) {
  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2", 
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <Card className={className} data-testid="quick-actions">
      <CardHeader>
        <CardTitle data-testid="quick-actions-title">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {layout === "grid" ? (
          <div className={cn("grid gap-3", gridCols[columns])}>
            {actions.map((action, index) => (
              <Button
                key={action.id}
                variant={action.variant || "outline"}
                onClick={action.onClick}
                disabled={action.disabled}
                className="h-auto p-4 flex flex-col items-center gap-2 relative"
                data-testid={`action-button-${action.id}`}
              >
                <action.icon className="h-6 w-6" />
                <div className="text-center">
                  <div className="font-medium text-sm">{action.label}</div>
                  {action.description && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {action.description}
                    </div>
                  )}
                </div>
                {action.badge && (
                  <div className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {action.badge}
                  </div>
                )}
              </Button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {actions.map((action, index) => (
              <div key={action.id}>
                <Button
                  variant={action.variant || "ghost"}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className="w-full justify-start gap-3 h-auto p-3 relative"
                  data-testid={`action-button-${action.id}`}
                >
                  <action.icon className="h-5 w-5" />
                  <div className="flex-1 text-left">
                    <div className="font-medium">{action.label}</div>
                    {action.description && (
                      <div className="text-sm text-muted-foreground">
                        {action.description}
                      </div>
                    )}
                  </div>
                  {action.badge && (
                    <div className="bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {action.badge}
                    </div>
                  )}
                </Button>
                {index < actions.length - 1 && <Separator className="my-2" />}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Preset quick action components for common use cases
export function TeamManagerActions({ onNewCheckin, onViewTeam, onViewAnalytics, pendingCheckins }: {
  onNewCheckin: () => void;
  onViewTeam: () => void;
  onViewAnalytics: () => void;
  pendingCheckins?: number;
}) {
  const actions: QuickAction[] = [
    {
      id: "new-checkin",
      label: "New Check-in",
      description: "Start a team check-in",
      icon: ClipboardCheck,
      onClick: onNewCheckin,
      variant: "default",
    },
    {
      id: "view-team",
      label: "View Team",
      description: "Manage team members",
      icon: Users,
      onClick: onViewTeam,
    },
    {
      id: "view-analytics",
      label: "Analytics",
      description: "View team insights",
      icon: BarChart3,
      onClick: onViewAnalytics,
      badge: pendingCheckins,
    },
  ];

  return (
    <QuickActions
      title="Team Management"
      actions={actions}
      columns={3}
    />
  );
}

export function PersonalActions({ onNewWin, onScheduleMeeting, onViewProfile }: {
  onNewWin: () => void;
  onScheduleMeeting: () => void;
  onViewProfile: () => void;
}) {
  const actions: QuickAction[] = [
    {
      id: "new-win",
      label: "Share a Win",
      description: "Celebrate an achievement",
      icon: Trophy,
      onClick: onNewWin,
      variant: "default",
    },
    {
      id: "schedule-meeting",
      label: "Schedule 1:1",
      description: "Book time with manager",
      icon: Calendar,
      onClick: onScheduleMeeting,
    },
    {
      id: "view-profile",
      label: "My Profile",
      description: "Update your information",
      icon: Settings,
      onClick: onViewProfile,
    },
  ];

  return (
    <QuickActions
      title="Personal Actions"
      actions={actions}
      columns={3}
    />
  );
}

export function AdminActions({ onManageUsers, onSystemSettings, onViewReports, pendingReports }: {
  onManageUsers: () => void;
  onSystemSettings: () => void;
  onViewReports: () => void;
  pendingReports?: number;
}) {
  const actions: QuickAction[] = [
    {
      id: "manage-users",
      label: "Manage Users",
      description: "Add or edit team members",
      icon: Users,
      onClick: onManageUsers,
    },
    {
      id: "system-settings",
      label: "Settings",
      description: "Configure system preferences",
      icon: Settings,
      onClick: onSystemSettings,
    },
    {
      id: "view-reports",
      label: "Reports",
      description: "Review system reports",
      icon: BarChart3,
      onClick: onViewReports,
      badge: pendingReports,
    },
  ];

  return (
    <QuickActions
      title="Admin Tools"
      actions={actions}
      layout="list"
    />
  );
}