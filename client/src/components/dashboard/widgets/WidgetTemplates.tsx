import { DashboardWidget } from "./index";

// Predefined widget templates that can be added to dashboards
export interface WidgetTemplate {
  id: string;
  name: string;
  description: string;
  category: "metrics" | "charts" | "actions" | "activity";
  component: string;
  defaultConfig: Record<string, any>;
  defaultSize: {
    w: number;
    h: number;
  };
  previewImage?: string;
}

// Common widget templates
export const WIDGET_TEMPLATES: WidgetTemplate[] = [
  // Metric Templates
  {
    id: "team-health-metric",
    name: "Team Health Score",
    description: "Shows the overall team health rating based on check-ins",
    category: "metrics",
    component: "TeamHealthMetric",
    defaultConfig: {
      variant: "success",
      showTrend: true,
    },
    defaultSize: { w: 6, h: 4 },
  },
  {
    id: "checkin-completion-metric",
    name: "Check-in Completion Rate",
    description: "Displays the percentage of completed check-ins",
    category: "metrics",
    component: "CheckinCompletionMetric",
    defaultConfig: {
      variant: "default",
      showTrend: true,
    },
    defaultSize: { w: 6, h: 4 },
  },
  {
    id: "active-users-metric",
    name: "Active Users",
    description: "Shows the number of active team members",
    category: "metrics",
    component: "ActiveUsersMetric",
    defaultConfig: {
      variant: "default",
      showTrend: false,
    },
    defaultSize: { w: 6, h: 4 },
  },
  {
    id: "recent-wins-metric",
    name: "Recent Wins",
    description: "Displays the count of recent team wins",
    category: "metrics",
    component: "RecentWinsMetric",
    defaultConfig: {
      variant: "warning",
      showTrend: true,
    },
    defaultSize: { w: 6, h: 4 },
  },

  // Chart Templates
  {
    id: "team-mood-chart",
    name: "Team Mood Trend",
    description: "Line chart showing team mood over time",
    category: "charts",
    component: "TeamMoodChart",
    defaultConfig: {
      type: "line",
      period: "30d",
      height: 300,
    },
    defaultSize: { w: 12, h: 8 },
  },
  {
    id: "checkin-completion-chart",
    name: "Check-in Completion Chart",
    description: "Bar chart showing daily check-in completion rates",
    category: "charts",
    component: "CheckinCompletionChart",
    defaultConfig: {
      type: "bar",
      period: "14d",
      height: 300,
    },
    defaultSize: { w: 12, h: 8 },
  },
  {
    id: "wins-category-chart",
    name: "Wins by Category",
    description: "Pie chart showing distribution of wins across categories",
    category: "charts",
    component: "WinsCategoryChart",
    defaultConfig: {
      type: "pie",
      period: "30d",
      height: 300,
    },
    defaultSize: { w: 8, h: 8 },
  },

  // Action Templates
  {
    id: "team-manager-actions",
    name: "Team Management",
    description: "Quick actions for team managers",
    category: "actions",
    component: "TeamManagerActions",
    defaultConfig: {
      layout: "grid",
      columns: 3,
    },
    defaultSize: { w: 12, h: 6 },
  },
  {
    id: "personal-actions",
    name: "Personal Actions",
    description: "Quick actions for individual team members",
    category: "actions",
    component: "PersonalActions",
    defaultConfig: {
      layout: "grid",
      columns: 3,
    },
    defaultSize: { w: 12, h: 6 },
  },
  {
    id: "admin-actions",
    name: "Admin Tools",
    description: "Administrative quick actions",
    category: "actions",
    component: "AdminActions",
    defaultConfig: {
      layout: "list",
    },
    defaultSize: { w: 8, h: 8 },
  },

  // Activity Templates
  {
    id: "team-activity",
    name: "Team Activity Feed",
    description: "Recent activity from all team members",
    category: "activity",
    component: "TeamActivity",
    defaultConfig: {
      maxItems: 10,
      showViewAll: true,
    },
    defaultSize: { w: 8, h: 10 },
  },
  {
    id: "personal-activity",
    name: "Your Activity",
    description: "Your recent activity and updates",
    category: "activity",
    component: "PersonalActivity",
    defaultConfig: {
      maxItems: 5,
      showViewAll: true,
    },
    defaultSize: { w: 8, h: 8 },
  },
  {
    id: "system-activity",
    name: "System Updates",
    description: "Recent system changes and notifications",
    category: "activity",
    component: "SystemActivity",
    defaultConfig: {
      maxItems: 5,
      showViewAll: false,
    },
    defaultSize: { w: 8, h: 6 },
  },
];

// Helper functions for widget templates
export function getTemplatesByCategory(category: WidgetTemplate["category"]): WidgetTemplate[] {
  return WIDGET_TEMPLATES.filter(template => template.category === category);
}

export function getTemplateById(id: string): WidgetTemplate | undefined {
  return WIDGET_TEMPLATES.find(template => template.id === id);
}

export function createWidgetFromTemplate(
  template: WidgetTemplate,
  position: { x: number; y: number }
): DashboardWidget {
  return {
    id: `${template.id}-${Date.now()}`,
    type: template.category === "metrics" ? "metric" :
          template.category === "charts" ? "chart" :
          template.category === "actions" ? "actions" : "activity",
    title: template.name,
    position: {
      x: position.x,
      y: position.y,
      w: template.defaultSize.w,
      h: template.defaultSize.h,
    },
    config: {
      component: template.component,
      ...template.defaultConfig,
    },
  };
}

// Default dashboard layouts for different roles
export const DEFAULT_LAYOUTS = {
  admin: [
    { templateId: "team-health-metric", position: { x: 0, y: 0 } },
    { templateId: "active-users-metric", position: { x: 6, y: 0 } },
    { templateId: "checkin-completion-metric", position: { x: 0, y: 4 } },
    { templateId: "recent-wins-metric", position: { x: 6, y: 4 } },
    { templateId: "team-mood-chart", position: { x: 0, y: 8 } },
    { templateId: "admin-actions", position: { x: 12, y: 0 } },
    { templateId: "team-activity", position: { x: 12, y: 8 } },
  ],
  manager: [
    { templateId: "team-health-metric", position: { x: 0, y: 0 } },
    { templateId: "checkin-completion-metric", position: { x: 6, y: 0 } },
    { templateId: "team-mood-chart", position: { x: 0, y: 4 } },
    { templateId: "team-manager-actions", position: { x: 12, y: 0 } },
    { templateId: "team-activity", position: { x: 12, y: 6 } },
  ],
  member: [
    { templateId: "team-health-metric", position: { x: 0, y: 0 } },
    { templateId: "recent-wins-metric", position: { x: 6, y: 0 } },
    { templateId: "personal-actions", position: { x: 0, y: 4 } },
    { templateId: "personal-activity", position: { x: 12, y: 0 } },
  ],
};

export function getDefaultLayoutForRole(role: "admin" | "manager" | "member"): DashboardWidget[] {
  const layout = DEFAULT_LAYOUTS[role] || DEFAULT_LAYOUTS.member;
  
  return layout.map(item => {
    const template = getTemplateById(item.templateId);
    if (!template) {
      throw new Error(`Template not found: ${item.templateId}`);
    }
    return createWidgetFromTemplate(template, item.position);
  });
}