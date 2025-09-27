import { type Step, type Props as JoyrideProps } from 'react-joyride';

// Tour IDs as constants for type safety
export const TOUR_IDS = {
  DASHBOARD_INTRO: 'dashboard-intro',
  CHECKINS_GUIDE: 'checkins-guide',
  SHOUTOUTS_INTRO: 'shoutouts-intro',
  WINS_INTRO: 'wins-intro',
  ANALYTICS_GUIDE: 'analytics-guide',
  TEAM_MANAGEMENT: 'team-management',
  KRA_MANAGEMENT: 'kra-management',
  ONE_ON_ONES: 'one-on-ones',
} as const;

export type TourId = typeof TOUR_IDS[keyof typeof TOUR_IDS];

// Tour types for different purposes
export type TourType = 'intro' | 'feature' | 'update';

// Extended step type with custom properties
export interface TourStep extends Step {
  spotlightPadding?: number;
  disableOverlay?: boolean;
  disableOverlayClose?: boolean;
}

// Tour configuration interface
export interface TourConfig {
  id: TourId;
  type: TourType;
  title: string;
  description?: string;
  steps: TourStep[];
  showSkipButton?: boolean;
  showProgress?: boolean;
  showStepsProgress?: boolean;
  continuous?: boolean;
  scrollToFirstStep?: boolean;
  disableBeacon?: boolean;
}

// Default styles for all tours matching shadcn/ui theme
export const defaultTourStyles: JoyrideProps['styles'] = {
  options: {
    primaryColor: 'hsl(var(--primary))',
    textColor: 'hsl(var(--foreground))',
    backgroundColor: 'hsl(var(--background))',
    arrowColor: 'hsl(var(--background))',
    overlayColor: 'rgba(0, 0, 0, 0.6)',
    width: undefined,
    zIndex: 10000,
  },
  beacon: {
    inner: {
      backgroundColor: 'hsl(var(--primary))',
    },
    outer: {
      backgroundColor: 'hsl(var(--primary) / 0.2)',
      border: '2px solid hsl(var(--primary))',
    },
  },
  tooltip: {
    padding: '1.5rem',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    lineHeight: '1.5',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)',
    border: '1px solid hsl(var(--border))',
  },
  tooltipContainer: {
    textAlign: 'left',
  },
  tooltipTitle: {
    fontSize: '1.125rem',
    fontWeight: 600,
    marginBottom: '0.5rem',
    color: 'hsl(var(--foreground))',
  },
  tooltipContent: {
    fontSize: '0.875rem',
    color: 'hsl(var(--muted-foreground))',
    lineHeight: '1.6',
  },
  buttonNext: {
    backgroundColor: 'hsl(var(--primary))',
    color: 'hsl(var(--primary-foreground))',
    fontSize: '0.875rem',
    fontWeight: 500,
    padding: '0.5rem 1rem',
    borderRadius: '0.375rem',
    outline: 'none',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  buttonBack: {
    backgroundColor: 'transparent',
    color: 'hsl(var(--muted-foreground))',
    fontSize: '0.875rem',
    fontWeight: 500,
    padding: '0.5rem 1rem',
    marginRight: '0.5rem',
    borderRadius: '0.375rem',
    outline: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  buttonClose: {
    position: 'absolute',
    top: '0.75rem',
    right: '0.75rem',
    padding: '0.25rem',
    color: 'hsl(var(--muted-foreground))',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    transition: 'color 0.2s',
    width: '1.25rem',
    height: '1.25rem',
  },
  buttonSkip: {
    backgroundColor: 'transparent',
    color: 'hsl(var(--muted-foreground))',
    fontSize: '0.875rem',
    padding: '0.5rem 1rem',
    cursor: 'pointer',
    outline: 'none',
    transition: 'color 0.2s',
  },
  spotlight: {
    backgroundColor: 'transparent',
    borderRadius: '0.5rem',
  },
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    mixBlendMode: 'multiply',
  },
  floater: {
    arrow: {
      color: 'hsl(var(--background))',
    },
  },
  options: {
    zIndex: 10000,
  },
};

// Helper function to create a basic tour step
export function createTourStep(
  target: string,
  content: string,
  options?: Partial<TourStep>
): TourStep {
  return {
    target,
    content,
    placement: 'bottom',
    disableBeacon: true,
    ...options,
  };
}

// Helper function to create a feature highlight tour
export function createFeatureTour(
  id: TourId,
  title: string,
  steps: Array<{ target: string; content: string; title?: string }>
): TourConfig {
  return {
    id,
    type: 'feature',
    title,
    steps: steps.map(step => ({
      target: step.target,
      content: step.content,
      title: step.title,
      placement: 'bottom',
      disableBeacon: true,
      spotlightPadding: 8,
    })),
    showSkipButton: true,
    showProgress: true,
    continuous: true,
    scrollToFirstStep: true,
  };
}

// Helper function to create an intro tour
export function createIntroTour(
  id: TourId,
  title: string,
  description: string,
  steps: TourStep[]
): TourConfig {
  return {
    id,
    type: 'intro',
    title,
    description,
    steps,
    showSkipButton: true,
    showProgress: true,
    showStepsProgress: true,
    continuous: true,
    scrollToFirstStep: true,
    disableBeacon: true,
  };
}

// Predefined tour configurations
export const TOUR_CONFIGS: Record<TourId, TourConfig> = {
  [TOUR_IDS.DASHBOARD_INTRO]: createIntroTour(
    TOUR_IDS.DASHBOARD_INTRO,
    'Welcome to Your Dashboard',
    'Let\'s take a quick tour of your dashboard and key features',
    [
      createTourStep(
        '[data-testid="sidebar"]',
        'Navigate through different sections of the app using the sidebar',
        { title: 'Navigation Menu', placement: 'right' }
      ),
      createTourStep(
        '[data-testid="dashboard-widgets"]',
        'Your dashboard shows key metrics and recent activity at a glance',
        { title: 'Dashboard Widgets' }
      ),
      createTourStep(
        '[data-testid="header-notifications"]',
        'Stay updated with notifications about important events',
        { title: 'Notifications', placement: 'bottom-end' }
      ),
      createTourStep(
        '[data-testid="user-profile"]',
        'Access your profile and settings here',
        { title: 'Profile & Settings', placement: 'bottom-end' }
      ),
    ]
  ),

  [TOUR_IDS.CHECKINS_GUIDE]: createFeatureTour(
    TOUR_IDS.CHECKINS_GUIDE,
    'Weekly Check-ins',
    [
      {
        target: '[data-testid="button-new-checkin"]',
        title: 'Start Your Check-in',
        content: 'Click here to start your weekly check-in and share how your week went',
      },
      {
        target: '[data-testid="checkin-questions"]',
        title: 'Answer Questions',
        content: 'Answer a few quick questions about your week and mood',
      },
      {
        target: '[data-testid="checkin-submit"]',
        title: 'Submit Check-in',
        content: 'Submit your check-in to share with your team and manager',
      },
    ]
  ),

  [TOUR_IDS.SHOUTOUTS_INTRO]: createFeatureTour(
    TOUR_IDS.SHOUTOUTS_INTRO,
    'Give Shoutouts',
    [
      {
        target: '[data-testid="button-new-shoutout"]',
        title: 'Give a Shoutout',
        content: 'Recognize your teammates for their great work',
      },
      {
        target: '[data-testid="shoutout-list"]',
        title: 'Recent Shoutouts',
        content: 'See shoutouts from across your organization',
      },
    ]
  ),

  [TOUR_IDS.WINS_INTRO]: createFeatureTour(
    TOUR_IDS.WINS_INTRO,
    'Celebrate Wins',
    [
      {
        target: '[data-testid="button-new-win"]',
        title: 'Share a Win',
        content: 'Share your accomplishments and celebrate successes',
      },
      {
        target: '[data-testid="wins-list"]',
        title: 'Team Wins',
        content: 'See what your team has been achieving',
      },
    ]
  ),

  [TOUR_IDS.ANALYTICS_GUIDE]: createFeatureTour(
    TOUR_IDS.ANALYTICS_GUIDE,
    'Analytics & Insights',
    [
      {
        target: '[data-testid="analytics-filters"]',
        title: 'Filter Data',
        content: 'Filter analytics by date range, team, or individual',
      },
      {
        target: '[data-testid="analytics-charts"]',
        title: 'Visualizations',
        content: 'View trends and insights through interactive charts',
      },
      {
        target: '[data-testid="analytics-export"]',
        title: 'Export Data',
        content: 'Export analytics data for further analysis',
      },
    ]
  ),

  [TOUR_IDS.TEAM_MANAGEMENT]: createFeatureTour(
    TOUR_IDS.TEAM_MANAGEMENT,
    'Team Management',
    [
      {
        target: '[data-testid="team-members"]',
        title: 'Team Members',
        content: 'View and manage your team members',
      },
      {
        target: '[data-testid="button-invite-member"]',
        title: 'Invite Members',
        content: 'Invite new members to join your team',
      },
    ]
  ),

  [TOUR_IDS.KRA_MANAGEMENT]: createFeatureTour(
    TOUR_IDS.KRA_MANAGEMENT,
    'KRA Management',
    [
      {
        target: '[data-testid="kra-list"]',
        title: 'Key Result Areas',
        content: 'Manage and track Key Result Areas for your team',
      },
      {
        target: '[data-testid="button-new-kra"]',
        title: 'Create KRA',
        content: 'Define new KRAs for team members',
      },
    ]
  ),

  [TOUR_IDS.ONE_ON_ONES]: createFeatureTour(
    TOUR_IDS.ONE_ON_ONES,
    '1:1 Meetings',
    [
      {
        target: '[data-testid="one-on-one-schedule"]',
        title: 'Schedule 1:1s',
        content: 'Schedule regular 1:1 meetings with your team',
      },
      {
        target: '[data-testid="one-on-one-notes"]',
        title: 'Meeting Notes',
        content: 'Keep track of discussion points and action items',
      },
    ]
  ),
};

// Mobile-responsive adjustments
export const getMobileAdjustedStyles = (isMobile: boolean): JoyrideProps['styles'] => {
  if (!isMobile) return defaultTourStyles;

  return {
    ...defaultTourStyles,
    tooltip: {
      ...defaultTourStyles.tooltip,
      maxWidth: '90vw',
      padding: '1rem',
    },
    tooltipTitle: {
      ...defaultTourStyles.tooltipTitle,
      fontSize: '1rem',
    },
    tooltipContent: {
      ...defaultTourStyles.tooltipContent,
      fontSize: '0.813rem',
    },
  };
};