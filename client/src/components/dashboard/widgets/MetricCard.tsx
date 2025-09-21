import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: {
    value: number;
    direction: "up" | "down" | "neutral";
    label?: string;
  };
  icon?: React.ComponentType<{ className?: string }>;
  variant?: "default" | "success" | "warning" | "destructive";
  isLoading?: boolean;
  className?: string;
}

const variantStyles = {
  default: "border-border",
  success: "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950",
  warning: "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950",
  destructive: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950",
};

const trendStyles = {
  up: "text-green-600 dark:text-green-400",
  down: "text-red-600 dark:text-red-400", 
  neutral: "text-muted-foreground",
};

export function MetricCard({
  title,
  value,
  description,
  trend,
  icon: Icon,
  variant = "default",
  isLoading = false,
  className,
}: MetricCardProps) {
  if (isLoading) {
    return (
      <Card className={cn(variantStyles[variant], className)} data-testid="metric-card-loading">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
          {description && (
            <div className="mt-4">
              <Skeleton className="h-3 w-20" />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const TrendIcon = trend?.direction === "up" ? TrendingUp : 
                   trend?.direction === "down" ? TrendingDown : Minus;

  return (
    <Card className={cn(variantStyles[variant], className)} data-testid="metric-card">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground" data-testid="metric-title">
              {title}
            </p>
            <p className="text-2xl font-bold" data-testid="metric-value">
              {value}
            </p>
          </div>
          {Icon && (
            <div className="rounded-lg bg-muted p-2">
              <Icon className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </div>
        
        {(description || trend) && (
          <div className="mt-4 flex items-center justify-between">
            {description && (
              <p className="text-xs text-muted-foreground" data-testid="metric-description">
                {description}
              </p>
            )}
            {trend && (
              <div className={cn("flex items-center text-xs font-medium", trendStyles[trend.direction])}>
                <TrendIcon className="mr-1 h-3 w-3" />
                <span data-testid="metric-trend-value">
                  {trend.value > 0 ? "+" : ""}{trend.value}%
                </span>
                {trend.label && (
                  <span className="ml-1 text-muted-foreground" data-testid="metric-trend-label">
                    {trend.label}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Preset metric card components for common use cases
export function TeamHealthMetric({ isLoading, ...props }: Omit<MetricCardProps, "title" | "icon">) {
  return (
    <MetricCard
      title="Team Health"
      icon={({ className }) => <div className={cn("rounded-full bg-green-100 dark:bg-green-900 p-1", className)}>❤️</div>}
      variant="success"
      isLoading={isLoading}
      {...props}
    />
  );
}

export function CheckinCompletionMetric({ isLoading, ...props }: Omit<MetricCardProps, "title" | "icon">) {
  return (
    <MetricCard
      title="Check-in Completion"
      icon={({ className }) => <div className={cn("rounded-full bg-blue-100 dark:bg-blue-900 p-1", className)}>✅</div>}
      isLoading={isLoading}
      {...props}
    />
  );
}

export function ActiveUsersMetric({ isLoading, ...props }: Omit<MetricCardProps, "title" | "icon">) {
  return (
    <MetricCard
      title="Active Users"
      icon={({ className }) => <div className={cn("rounded-full bg-purple-100 dark:bg-purple-900 p-1", className)}>👥</div>}
      isLoading={isLoading}
      {...props}
    />
  );
}

export function RecentWinsMetric({ isLoading, ...props }: Omit<MetricCardProps, "title" | "icon">) {
  return (
    <MetricCard
      title="Recent Wins"
      icon={({ className }) => <div className={cn("rounded-full bg-yellow-100 dark:bg-yellow-900 p-1", className)}>🏆</div>}
      isLoading={isLoading}
      {...props}
    />
  );
}