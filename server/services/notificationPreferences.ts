import { storage } from '../storage';
import { User } from '@shared/schema';

/**
 * Notification preference types
 */
export type NotificationChannel = 'email' | 'slack' | 'inApp';
export type NotificationType = 
  | 'checkinReminders'
  | 'checkinSubmissions'
  | 'winAnnouncements'
  | 'shoutouts'
  | 'directMessages'
  | 'teamUpdates'
  | 'weeklyDigest'
  | 'systemAlerts';

/**
 * Interface for notification preferences
 */
interface NotificationPreferences {
  email?: {
    checkinReminders?: boolean;
    checkinSubmissions?: boolean;
    winAnnouncements?: boolean;
    shoutouts?: boolean;
    teamUpdates?: boolean;
    weeklyDigest?: boolean;
  };
  slack?: {
    checkinReminders?: boolean;
    checkinSubmissions?: boolean;
    winAnnouncements?: boolean;
    shoutouts?: boolean;
    directMessages?: boolean;
  };
  inApp?: {
    checkinReminders?: boolean;
    checkinSubmissions?: boolean;
    winAnnouncements?: boolean;
    shoutouts?: boolean;
    teamUpdates?: boolean;
    systemAlerts?: boolean;
  };
}

/**
 * Interface for notification schedule
 */
interface NotificationSchedule {
  doNotDisturb?: {
    enabled?: boolean;
    start?: string; // HH:MM format
    end?: string; // HH:MM format
  };
  timezone?: string;
  workingHours?: {
    start?: string; // HH:MM format
    end?: string; // HH:MM format
    days?: string[]; // ['Monday', 'Tuesday', ...]
  };
}

/**
 * Default notification preferences if none are set
 */
const DEFAULT_PREFERENCES: NotificationPreferences = {
  email: {
    checkinReminders: true,
    checkinSubmissions: true,
    winAnnouncements: true,
    shoutouts: true,
    teamUpdates: true,
    weeklyDigest: true,
  },
  slack: {
    checkinReminders: true,
    checkinSubmissions: true,
    winAnnouncements: true,
    shoutouts: true,
    directMessages: true,
  },
  inApp: {
    checkinReminders: true,
    checkinSubmissions: true,
    winAnnouncements: true,
    shoutouts: true,
    teamUpdates: true,
    systemAlerts: true,
  },
};

/**
 * Check if a user has a specific notification enabled for a channel
 * @param user - The user object or user ID
 * @param channel - The notification channel (email, slack, inApp)
 * @param notificationType - The type of notification
 * @param organizationId - The organization ID (required if user is provided as ID)
 * @returns true if the notification is enabled, false otherwise
 */
export async function isNotificationEnabled(
  user: User | string,
  channel: NotificationChannel,
  notificationType: NotificationType,
  organizationId?: string
): Promise<boolean> {
  try {
    // If user is a string ID, fetch the user object
    let userObj: User | undefined;
    if (typeof user === 'string') {
      if (!organizationId) {
        console.warn(`Cannot check notification preferences: organizationId required when user is provided as ID`);
        return true; // Default to enabled if we can't fetch preferences
      }
      userObj = await storage.getUser(organizationId, user);
      if (!userObj) {
        console.warn(`User ${user} not found in organization ${organizationId}`);
        return true; // Default to enabled if user not found
      }
    } else {
      userObj = user;
    }

    // Check if user is active
    if (userObj.isActive === false) {
      console.log(`User ${userObj.email} is inactive, skipping notification`);
      return false;
    }

    // Get user preferences or use defaults
    const preferences = (userObj.notificationPreferences as NotificationPreferences) || DEFAULT_PREFERENCES;
    
    // Check if the channel exists in preferences
    const channelPrefs = preferences[channel];
    if (!channelPrefs) {
      // If channel preferences don't exist, use default
      return DEFAULT_PREFERENCES[channel]?.[notificationType as keyof typeof DEFAULT_PREFERENCES[typeof channel]] ?? true;
    }

    // Check if the notification type exists for this channel
    const isEnabled = channelPrefs[notificationType as keyof typeof channelPrefs];
    
    // If preference is not set, use default
    if (isEnabled === undefined) {
      return DEFAULT_PREFERENCES[channel]?.[notificationType as keyof typeof DEFAULT_PREFERENCES[typeof channel]] ?? true;
    }

    return isEnabled;
  } catch (error) {
    console.error(`Error checking notification preferences:`, error);
    return true; // Default to enabled on error
  }
}

/**
 * Check if multiple users have a specific notification enabled
 * @param userIds - Array of user IDs
 * @param organizationId - The organization ID
 * @param channel - The notification channel
 * @param notificationType - The type of notification
 * @returns Array of user IDs that have the notification enabled
 */
export async function filterUsersWithNotificationEnabled(
  userIds: string[],
  organizationId: string,
  channel: NotificationChannel,
  notificationType: NotificationType
): Promise<string[]> {
  const enabledUserIds: string[] = [];
  
  for (const userId of userIds) {
    const isEnabled = await isNotificationEnabled(userId, channel, notificationType, organizationId);
    if (isEnabled) {
      enabledUserIds.push(userId);
    }
  }
  
  return enabledUserIds;
}

/**
 * Check if current time is within user's Do Not Disturb period
 * @param user - The user object
 * @returns true if currently in DND period, false otherwise
 */
export function isInDoNotDisturbPeriod(user: User): boolean {
  try {
    const schedule = (user.notificationSchedule as NotificationSchedule) || {};
    
    if (!schedule.doNotDisturb?.enabled) {
      return false;
    }

    const { start, end } = schedule.doNotDisturb;
    if (!start || !end) {
      return false;
    }

    // Get current time in user's timezone or default to UTC
    const timezone = schedule.timezone || 'UTC';
    const now = new Date();
    const userTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    
    const currentHour = userTime.getHours();
    const currentMinute = userTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    // Parse start and end times
    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);
    const startTimeMinutes = startHour * 60 + startMinute;
    const endTimeMinutes = endHour * 60 + endMinute;

    // Check if current time is within DND period
    if (startTimeMinutes <= endTimeMinutes) {
      // DND period doesn't cross midnight
      return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes < endTimeMinutes;
    } else {
      // DND period crosses midnight
      return currentTimeMinutes >= startTimeMinutes || currentTimeMinutes < endTimeMinutes;
    }
  } catch (error) {
    console.error(`Error checking DND period:`, error);
    return false;
  }
}

/**
 * Check if current time is within user's working hours
 * @param user - The user object
 * @returns true if currently in working hours, false otherwise
 */
export function isInWorkingHours(user: User): boolean {
  try {
    const schedule = (user.notificationSchedule as NotificationSchedule) || {};
    const workingHours = schedule.workingHours;
    
    if (!workingHours?.start || !workingHours?.end) {
      return true; // If no working hours set, assume always available
    }

    // Get current time in user's timezone
    const timezone = schedule.timezone || 'UTC';
    const now = new Date();
    const userTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    
    // Check if today is a working day
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = dayNames[userTime.getDay()];
    
    if (workingHours.days && workingHours.days.length > 0) {
      if (!workingHours.days.includes(currentDay)) {
        return false; // Not a working day
      }
    }

    // Check if current time is within working hours
    const currentHour = userTime.getHours();
    const currentMinute = userTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    const [startHour, startMinute] = workingHours.start.split(':').map(Number);
    const [endHour, endMinute] = workingHours.end.split(':').map(Number);
    const startTimeMinutes = startHour * 60 + startMinute;
    const endTimeMinutes = endHour * 60 + endMinute;

    return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes < endTimeMinutes;
  } catch (error) {
    console.error(`Error checking working hours:`, error);
    return true; // Default to available on error
  }
}

/**
 * Check if a notification should be sent considering all preferences and schedules
 * @param user - The user object or user ID
 * @param channel - The notification channel
 * @param notificationType - The type of notification
 * @param organizationId - The organization ID (required if user is provided as ID)
 * @param respectSchedule - Whether to respect DND and working hours (default: true for non-urgent)
 * @returns true if notification should be sent, false otherwise
 */
export async function shouldSendNotification(
  user: User | string,
  channel: NotificationChannel,
  notificationType: NotificationType,
  organizationId?: string,
  respectSchedule: boolean = true
): Promise<boolean> {
  // First check if notification type is enabled
  const isEnabled = await isNotificationEnabled(user, channel, notificationType, organizationId);
  if (!isEnabled) {
    return false;
  }

  // If we should respect schedule, check DND and working hours
  if (respectSchedule) {
    let userObj: User | undefined;
    if (typeof user === 'string') {
      if (!organizationId) {
        return isEnabled; // Can't check schedule without user object
      }
      userObj = await storage.getUser(organizationId, user);
      if (!userObj) {
        return isEnabled; // Can't check schedule without user object
      }
    } else {
      userObj = user;
    }

    // Check if in DND period
    if (isInDoNotDisturbPeriod(userObj)) {
      console.log(`User ${userObj.email} is in DND period, skipping notification`);
      return false;
    }

    // For certain notification types, also check working hours
    const workHoursSensitive = ['checkinReminders', 'teamUpdates', 'weeklyDigest'];
    if (workHoursSensitive.includes(notificationType) && !isInWorkingHours(userObj)) {
      console.log(`User ${userObj.email} is outside working hours, skipping ${notificationType}`);
      return false;
    }
  }

  return true;
}

/**
 * Get all enabled notification channels for a user and notification type
 * @param user - The user object
 * @param notificationType - The type of notification
 * @returns Array of enabled channels
 */
export function getEnabledChannels(
  user: User,
  notificationType: NotificationType
): NotificationChannel[] {
  const enabledChannels: NotificationChannel[] = [];
  const preferences = (user.notificationPreferences as NotificationPreferences) || DEFAULT_PREFERENCES;

  const channels: NotificationChannel[] = ['email', 'slack', 'inApp'];
  
  for (const channel of channels) {
    const channelPrefs = preferences[channel] || DEFAULT_PREFERENCES[channel];
    if (channelPrefs?.[notificationType as keyof typeof channelPrefs] !== false) {
      enabledChannels.push(channel);
    }
  }

  return enabledChannels;
}