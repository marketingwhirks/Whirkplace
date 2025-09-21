// Metric Cards
export {
  MetricCard,
  TeamHealthMetric,
  CheckinCompletionMetric,
  ActiveUsersMetric,
  RecentWinsMetric,
  type MetricCardProps,
} from "./MetricCard";

// Chart Widgets
export {
  ChartWidget,
  TeamMoodChart,
  CheckinCompletionChart,
  WinsCategoryChart,
  type ChartWidgetProps,
} from "./ChartWidget";

// Quick Actions
export {
  QuickActions,
  TeamManagerActions,
  PersonalActions,
  AdminActions,
  type QuickAction,
  type QuickActionsProps,
} from "./QuickActions";

// Recent Activity
export {
  RecentActivity,
  TeamActivity,
  PersonalActivity,
  SystemActivity,
  type ActivityItem,
  type RecentActivityProps,
} from "./RecentActivity";

// Widget type definitions for dashboard configuration
export interface DashboardWidget {
  id: string;
  type: "metric" | "chart" | "actions" | "activity";
  title: string;
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  config: {
    [key: string]: any;
  };
}

export interface DashboardLayout {
  widgets: DashboardWidget[];
  columns: number;
  rowHeight: number;
}

// Widget Component Registry for dynamic rendering
export const WIDGET_COMPONENTS = {
  // Metric Cards
  MetricCard: MetricCard,
  TeamHealthMetric: TeamHealthMetric,
  CheckinCompletionMetric: CheckinCompletionMetric,
  ActiveUsersMetric: ActiveUsersMetric,
  RecentWinsMetric: RecentWinsMetric,
  
  // Chart Widgets
  ChartWidget: ChartWidget,
  TeamMoodChart: TeamMoodChart,
  CheckinCompletionChart: CheckinCompletionChart,
  WinsCategoryChart: WinsCategoryChart,
  
  // Quick Actions
  QuickActions: QuickActions,
  TeamManagerActions: TeamManagerActions,
  PersonalActions: PersonalActions,
  AdminActions: AdminActions,
  
  // Recent Activity
  RecentActivity: RecentActivity,
  TeamActivity: TeamActivity,
  PersonalActivity: PersonalActivity,
  SystemActivity: SystemActivity,
} as const;

export type WidgetComponentKey = keyof typeof WIDGET_COMPONENTS;

// Helper function to get component from registry
export function getWidgetComponent(componentName: string) {
  return WIDGET_COMPONENTS[componentName as WidgetComponentKey];
}