import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { 
  Clock, 
  Trophy, 
  ClipboardCheck, 
  Users, 
  Sparkles,
  MessageSquare,
  Calendar,
  ChevronRight 
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export interface ActivityItem {
  id: string;
  type: "checkin" | "win" | "shoutout" | "meeting" | "system" | "user";
  title: string;
  description?: string;
  user?: {
    id: string;
    name: string;
    avatar?: string;
    initials?: string;
  };
  timestamp: Date;
  status?: "completed" | "pending" | "cancelled" | "active";
  priority?: "low" | "medium" | "high";
  metadata?: Record<string, any>;
}

export interface RecentActivityProps {
  title?: string;
  activities: ActivityItem[];
  maxItems?: number;
  showViewAll?: boolean;
  onViewAll?: () => void;
  onActivityClick?: (activity: ActivityItem) => void;
  isLoading?: boolean;
  className?: string;
}

const activityIcons = {
  checkin: ClipboardCheck,
  win: Trophy,
  shoutout: Sparkles,
  meeting: Calendar,
  system: MessageSquare,
  user: Users,
};

const activityColors = {
  checkin: "text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900",
  win: "text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900",
  shoutout: "text-pink-600 bg-pink-100 dark:text-pink-400 dark:bg-pink-900",
  meeting: "text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900",
  system: "text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900",
  user: "text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900",
};

const statusColors = {
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  active: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
};

export function RecentActivity({
  title = "Recent Activity",
  activities,
  maxItems = 5,
  showViewAll = true,
  onViewAll,
  onActivityClick,
  isLoading = false,
  className,
}: RecentActivityProps) {
  const displayActivities = activities.slice(0, maxItems);

  if (isLoading) {
    return (
      <Card className={className} data-testid="recent-activity-loading">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: maxItems }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card className={className} data-testid="recent-activity-empty">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No recent activity</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className} data-testid="recent-activity">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle data-testid="activity-title">{title}</CardTitle>
        {showViewAll && onViewAll && activities.length > maxItems && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewAll}
            className="text-muted-foreground"
            data-testid="view-all-button"
          >
            View All
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {displayActivities.map((activity, index) => {
            const ActivityIcon = activityIcons[activity.type];
            const iconColor = activityColors[activity.type];
            
            return (
              <div key={activity.id}>
                <div 
                  className={cn(
                    "flex items-start gap-3",
                    onActivityClick && "cursor-pointer hover:bg-muted/50 -m-2 p-2 rounded-md"
                  )}
                  onClick={() => onActivityClick?.(activity)}
                  data-testid={`activity-item-${activity.id}`}
                >
                  <div className="relative">
                    <div className={cn("rounded-full p-2", iconColor)}>
                      <ActivityIcon className="h-4 w-4" />
                    </div>
                    {activity.priority === "high" && (
                      <div className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full border-2 border-background" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate" data-testid="activity-title">
                          {activity.title}
                        </p>
                        {activity.description && (
                          <p className="text-sm text-muted-foreground truncate" data-testid="activity-description">
                            {activity.description}
                          </p>
                        )}
                        {activity.user && (
                          <div className="flex items-center gap-2 mt-1">
                            <Avatar className="h-4 w-4">
                              <AvatarImage src={activity.user.avatar} />
                              <AvatarFallback className="text-xs">
                                {activity.user.initials || activity.user.name.slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-muted-foreground">
                              {activity.user.name}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-xs text-muted-foreground" data-testid="activity-time">
                          {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                        </span>
                        {activity.status && (
                          <Badge 
                            variant="secondary"
                            className={cn("text-xs", statusColors[activity.status])}
                            data-testid="activity-status"
                          >
                            {activity.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {index < displayActivities.length - 1 && (
                  <Separator className="mt-4" />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// Preset activity components for common use cases
export function TeamActivity({ activities, isLoading, ...props }: Omit<RecentActivityProps, "title">) {
  return (
    <RecentActivity
      title="Team Activity"
      activities={activities}
      isLoading={isLoading}
      {...props}
    />
  );
}

export function PersonalActivity({ activities, isLoading, ...props }: Omit<RecentActivityProps, "title">) {
  return (
    <RecentActivity
      title="Your Activity"
      activities={activities}
      isLoading={isLoading}
      {...props}
    />
  );
}

export function SystemActivity({ activities, isLoading, ...props }: Omit<RecentActivityProps, "title">) {
  return (
    <RecentActivity
      title="System Updates"
      activities={activities}
      isLoading={isLoading}
      {...props}
    />
  );
}