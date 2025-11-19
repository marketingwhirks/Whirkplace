import { startOfWeek, endOfWeek, setHours, setMinutes, setSeconds, setMilliseconds, addDays, isSaturday, isSunday } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { Organization } from '../schema';

// Central Time zone identifier (default)
const DEFAULT_TIMEZONE = 'America/Chicago';

// Default check-in configuration
const DEFAULT_CHECKIN_CONFIG = {
  checkinDueDay: 5, // Friday
  checkinDueTime: "17:00", // 5 PM
  checkinReminderDay: null, // Same as due day
  checkinReminderTime: "09:00", // 9 AM
  timezone: DEFAULT_TIMEZONE
};

/**
 * Parse time string (HH:MM) into hours and minutes
 */
function parseTimeString(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

/**
 * Calculates the check-in due date for the week containing the given date,
 * using the organization's custom schedule settings.
 * 
 * @param weekOf - The date within the week for which to calculate the due date
 * @param organization - The organization with custom schedule settings (optional)
 * @returns A Date object representing the due date in the organization's timezone (stored as UTC)
 * 
 * @example
 * ```typescript
 * // For an organization with Friday 5 PM due date
 * const dueDate = getCheckinDueDate(new Date('2025-01-15'), org);
 * // Returns: Friday, Jan 17, 2025 at 5:00 PM in org's timezone
 * ```
 */
export function getCheckinDueDate(weekOf: Date, organization?: Partial<Organization>): Date {
  // Get configuration from organization or use defaults
  const config = {
    checkinDueDay: organization?.checkinDueDay ?? DEFAULT_CHECKIN_CONFIG.checkinDueDay,
    checkinDueTime: organization?.checkinDueTime ?? DEFAULT_CHECKIN_CONFIG.checkinDueTime,
    timezone: organization?.timezone ?? DEFAULT_TIMEZONE
  };
  
  // Convert the input date to the organization's timezone
  const localWeekOf = toZonedTime(weekOf, config.timezone);
  
  // Get the start of the week (Saturday) in the organization's timezone
  // Week runs Saturday-Friday, so Saturday = 6
  const saturday = startOfWeek(localWeekOf, { weekStartsOn: 6 });
  
  // Add days to get to the configured due day (0=Sunday, 1=Monday, ..., 6=Saturday)
  // From Saturday: Saturday=0, Sunday=1, Monday=2, Tuesday=3, Wednesday=4, Thursday=5, Friday=6
  let daysToAdd: number;
  if (config.checkinDueDay === 6) {
    // Saturday - first day of week
    daysToAdd = 0;
  } else if (config.checkinDueDay === 5) {
    // Friday - last day of week
    daysToAdd = 6;
  } else if (config.checkinDueDay === 0) {
    // Sunday - second day of week
    daysToAdd = 1;
  } else if (config.checkinDueDay < 0) {
    // Invalid day, default to Friday
    daysToAdd = 6;
  } else {
    // Monday(1)=2, Tuesday(2)=3, Wednesday(3)=4, Thursday(4)=5
    daysToAdd = config.checkinDueDay + 1;
  }
  const dueDay = addDays(saturday, daysToAdd);
  
  // Parse the due time
  const { hours, minutes } = parseTimeString(config.checkinDueTime);
  
  // Set the time on the due day
  const dueDateWithTime = setMilliseconds(
    setSeconds(
      setMinutes(
        setHours(dueDay, hours),
        minutes
      ),
      0
    ),
    0
  );
  
  // Convert back to UTC for storage
  return fromZonedTime(dueDateWithTime, config.timezone);
}

/**
 * Calculates the check-in reminder date/time for the week containing the given date,
 * using the organization's custom schedule settings.
 * 
 * @param weekOf - The date within the week for which to calculate the reminder date
 * @param organization - The organization with custom schedule settings (optional)
 * @returns A Date object representing the reminder date/time in the organization's timezone (stored as UTC)
 */
export function getCheckinReminderDate(weekOf: Date, organization?: Partial<Organization>): Date {
  // Get configuration from organization or use defaults
  const config = {
    checkinDueDay: organization?.checkinDueDay ?? DEFAULT_CHECKIN_CONFIG.checkinDueDay,
    checkinReminderDay: organization?.checkinReminderDay,
    checkinReminderTime: organization?.checkinReminderTime ?? DEFAULT_CHECKIN_CONFIG.checkinReminderTime,
    timezone: organization?.timezone ?? DEFAULT_TIMEZONE
  };
  
  // If no specific reminder day is set, use the same day as the due day
  const reminderDay = config.checkinReminderDay ?? config.checkinDueDay;
  
  // Convert the input date to the organization's timezone
  const localWeekOf = toZonedTime(weekOf, config.timezone);
  
  // Get the start of the week (Saturday) in the organization's timezone
  // Week runs Saturday-Friday, so Saturday = 6
  const saturday = startOfWeek(localWeekOf, { weekStartsOn: 6 });
  
  // Add days to get to the reminder day
  // From Saturday: Saturday=0, Sunday=1, Monday=2, Tuesday=3, Wednesday=4, Thursday=5, Friday=6
  let daysToAdd: number;
  if (reminderDay === 6) {
    // Saturday - first day of week
    daysToAdd = 0;
  } else if (reminderDay === 5) {
    // Friday - last day of week
    daysToAdd = 6;
  } else if (reminderDay === 0) {
    // Sunday - second day of week
    daysToAdd = 1;
  } else if (reminderDay < 0) {
    // Invalid day, default to Friday
    daysToAdd = 6;
  } else {
    // Monday(1)=2, Tuesday(2)=3, Wednesday(3)=4, Thursday(4)=5
    daysToAdd = reminderDay + 1;
  }
  const reminderDate = addDays(saturday, daysToAdd);
  
  // Parse the reminder time
  const { hours, minutes } = parseTimeString(config.checkinReminderTime);
  
  // Set the time on the reminder day
  const reminderDateWithTime = setMilliseconds(
    setSeconds(
      setMinutes(
        setHours(reminderDate, hours),
        minutes
      ),
      0
    ),
    0
  );
  
  // Convert back to UTC for storage
  return fromZonedTime(reminderDateWithTime, config.timezone);
}

/**
 * Calculates the review due date for the week containing the given date.
 * Reviews are due at the same time as check-ins by default.
 * 
 * @param weekOf - The date within the week for which to calculate the review due date
 * @param organization - The organization with custom schedule settings (optional)
 * @returns A Date object representing the review due date
 */
export function getReviewDueDate(weekOf: Date, organization?: Partial<Organization>): Date {
  return getCheckinDueDate(weekOf, organization);
}

/**
 * Checks if a submission was made on time (on or before the due date).
 * 
 * @param submittedAt - The timestamp when the submission was made (null if not submitted)
 * @param dueDate - The due date for the submission
 * @returns true if the submission was made on or before the due date, false otherwise
 * 
 * @example
 * ```typescript
 * const dueDate = getCheckinDueDate(new Date('2025-01-15'), org);
 * const submittedAt = new Date('2025-01-17T16:30:00Z'); // Friday before 5 PM
 * 
 * const onTime = isSubmittedOnTime(submittedAt, dueDate); // true
 * const notSubmitted = isSubmittedOnTime(null, dueDate); // false
 * ```
 */
export function isSubmittedOnTime(submittedAt: Date | null, dueDate: Date): boolean {
  if (!submittedAt) {
    return false;
  }
  
  return submittedAt <= dueDate;
}

/**
 * Checks if a review was completed on time (on or before the review due date).
 * 
 * @param reviewedAt - The timestamp when the review was completed (null if not reviewed)
 * @param reviewDueDate - The due date for the review
 * @returns true if the review was completed on or before the due date, false otherwise
 */
export function isReviewedOnTime(reviewedAt: Date | null, reviewDueDate: Date): boolean {
  if (!reviewedAt) {
    return false;
  }
  
  return reviewedAt <= reviewDueDate;
}

/**
 * Utility function to get a human-readable string representation of the due date.
 * This is useful for displaying due dates to users.
 * 
 * @param weekOf - The date within the week for which to get the due date string
 * @param organization - The organization with custom schedule settings (optional)
 * @returns A formatted string showing the due date in the organization's timezone
 * 
 * @example
 * ```typescript
 * const dueDateString = getDueDateString(new Date('2025-01-15'), org);
 * // Returns: "Friday, January 17, 2025 at 5:00 PM CT"
 * ```
 */
export function getDueDateString(weekOf: Date, organization?: Partial<Organization>): string {
  const dueDate = getCheckinDueDate(weekOf, organization);
  const timezone = organization?.timezone ?? DEFAULT_TIMEZONE;
  
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
    timeZoneName: 'short'
  };
  
  return dueDate.toLocaleDateString('en-US', options);
}

/**
 * Calculates the Saturday 00:00 (start of week) for the week containing the given date.
 * 
 * @param date - The date within the week for which to calculate the week start
 * @param organization - The organization with custom timezone settings (optional)
 * @returns A Date object representing Saturday at 00:00 in the organization's timezone (stored as UTC)
 */
export function getWeekStartCentral(date: Date, organization?: Partial<Organization>): Date {
  const timezone = organization?.timezone ?? DEFAULT_TIMEZONE;
  
  // Convert the input date to the organization's timezone
  const localDate = toZonedTime(date, timezone);
  
  // Get the Saturday of the week (week starts on Saturday = 6)
  const saturday = startOfWeek(localDate, { weekStartsOn: 6 });
  
  // Set time to 00:00:00.000
  const saturdayAt00AM = setMilliseconds(
    setSeconds(
      setMinutes(
        setHours(saturday, 0),
        0
      ),
      0
    ),
    0
  );
  
  // Convert back to UTC for storage
  return fromZonedTime(saturdayAt00AM, timezone);
}

/**
 * Calculates the Friday 23:59:59.999 (end of week) for the week containing the given date.
 * 
 * @param date - The date within the week for which to calculate the week ending
 * @param organization - The organization with custom timezone settings (optional)
 * @returns A Date object representing Friday at 23:59:59.999 in the organization's timezone (stored as UTC)
 */
export function getWeekEndingFriday(date: Date, organization?: Partial<Organization>): Date {
  const timezone = organization?.timezone ?? DEFAULT_TIMEZONE;
  
  // Convert the input date to the organization's timezone
  const localDate = toZonedTime(date, timezone);
  
  // Get this week's Friday (week runs Saturday-Friday)
  // Week starts on Saturday = 6
  const saturday = startOfWeek(localDate, { weekStartsOn: 6 });
  const friday = addDays(saturday, 6);  // Saturday + 6 days = Friday
  
  // Set time to 23:59:59.999 (end of day)
  const fridayEndOfDay = setMilliseconds(
    setSeconds(
      setMinutes(
        setHours(friday, 23),
        59
      ),
      59
    ),
    999
  );
  
  // Convert back to UTC for storage
  return fromZonedTime(fridayEndOfDay, timezone);
}

/**
 * Gets the Friday (week ending) date for display purposes.
 * Returns Friday at 00:00:00 for consistent date display.
 * 
 * @param date - The date within the week
 * @param organization - The organization with custom timezone settings (optional)
 * @returns A Date object representing Friday at 00:00:00 in the organization's timezone (stored as UTC)
 */
export function getCheckinWeekFriday(date: Date, organization?: Partial<Organization>): Date {
  const timezone = organization?.timezone ?? DEFAULT_TIMEZONE;
  
  // Convert the input date to the organization's timezone
  const localDate = toZonedTime(date, timezone);
  
  // Get this week's Friday (week runs Saturday-Friday)
  // Week starts on Saturday = 6
  const saturday = startOfWeek(localDate, { weekStartsOn: 6 });
  const friday = addDays(saturday, 6);  // Saturday + 6 days = Friday
  
  // Set time to 00:00:00.000 (start of day for display)
  const fridayStartOfDay = setMilliseconds(
    setSeconds(
      setMinutes(
        setHours(friday, 0),
        0
      ),
      0
    ),
    0
  );
  
  // Convert back to UTC for storage
  return fromZonedTime(fridayStartOfDay, timezone);
}

/**
 * Converts a legacy day name to the new numeric format
 * @param dayName - Day name like "monday", "tuesday", etc.
 * @returns Numeric day (0=Sunday, 1=Monday, ..., 6=Saturday)
 */
export function convertLegacyDayToNumeric(dayName?: string | null): number {
  if (!dayName) return DEFAULT_CHECKIN_CONFIG.checkinDueDay;
  
  const dayMap: Record<string, number> = {
    'sunday': 0,
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6
  };
  
  return dayMap[dayName.toLowerCase()] ?? DEFAULT_CHECKIN_CONFIG.checkinDueDay;
}

/**
 * Gets the day name from a numeric day value
 * @param dayNum - Numeric day (0=Sunday, 1=Monday, ..., 6=Saturday)
 * @returns Day name like "Monday", "Tuesday", etc.
 */
export function getDayName(dayNum: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayNum] || 'Friday';
}

/**
 * Formats a date as "Week ending [Friday date]" for UI display
 * @param date - Any date within the week
 * @param organization - The organization with custom timezone settings (optional)
 * @returns Formatted string like "Week ending Nov 14, 2025"
 */
export function formatWeekEndingLabel(date: Date, organization?: Partial<Organization>): string {
  const friday = getCheckinWeekFriday(date, organization);
  return `Week ending ${friday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}