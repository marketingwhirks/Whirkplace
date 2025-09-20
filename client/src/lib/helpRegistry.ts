// Help content registry for contextual help system
export interface HelpContent {
  title: string;
  tips: string[];
  quickActions?: Array<{
    label: string;
    action: () => void;
  }>;
}

export const helpRegistry: Record<string, HelpContent> = {
  "/": {
    title: "Dashboard Help",
    tips: [
      "View your team's overall health and recent activity",
      "Check pending tasks and upcoming deadlines",
      "Use the quick actions to navigate to common features",
      "Set your status and availability for the team"
    ]
  },
  "/checkins": {
    title: "Check-ins Help", 
    tips: [
      "Submit weekly check-ins to share your progress and mood",
      "Answer custom questions set by your organization",
      "Review and respond to team member check-ins if you're a manager",
      "Use filters to find specific check-ins or time periods"
    ]
  },
  "/one-on-ones": {
    title: "One-on-Ones Help",
    tips: [
      "Schedule and manage one-on-one meetings with team members",
      "Add notes and action items during or after meetings", 
      "Send meeting reports directly to Slack for easy sharing",
      "Track follow-up items and their completion status"
    ]
  },
  "/wins": {
    title: "Wins & Recognition Help",
    tips: [
      "Celebrate team achievements and milestones",
      "Nominate colleagues for recognition",
      "Share wins publicly or keep them private",
      "Tag wins with company values to reinforce culture"
    ]
  },
  "/teams": {
    title: "Team Management Help",
    tips: [
      "View team hierarchy and reporting relationships",
      "Manage team members and their roles",
      "Create sub-teams and departments for better organization",
      "Track team performance and engagement metrics"
    ]
  },
  "/analytics": {
    title: "Analytics Help",
    tips: [
      "View team health trends and engagement metrics",
      "Filter data by time periods, teams, or individuals",
      "Export reports for leadership presentations",
      "Use insights to identify areas for improvement"
    ]
  },
  "/settings": {
    title: "Settings Help",
    tips: [
      "Customize your organization's check-in questions",
      "Manage integrations with Slack and Microsoft Teams",
      "Configure notification preferences",
      "Update your profile and team information"
    ]
  }
};

export function getHelpContent(path: string): HelpContent {
  return helpRegistry[path] || {
    title: "General Help",
    tips: [
      "Use the navigation menu to explore different features",
      "Click on any card or item for more details",
      "Look for the 🆘 help button if you need assistance",
      "Contact support using 'Report a Problem' if you encounter issues"
    ]
  };
}