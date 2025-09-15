import { startOfWeek, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

// Central Time zone identifier
const CENTRAL_TIME_ZONE = 'America/Chicago';

/**
 * Calculates the Monday 9am Central Time due date for the week containing the given date.
 * 
 * This function finds the Monday of the week that contains the `weekOf` date and sets
 * the time to 9:00 AM Central Time, properly handling DST transitions. The week is
 * considered to start on Monday.
 * 
 * @param weekOf - The date within the week for which to calculate the due date
 * @returns A Date object representing Monday at 9:00 AM Central Time (in UTC)
 * 
 * @example
 * ```typescript
 * // For a date in the week of Jan 13-19, 2025 (Monday is Jan 13)
 * const dueDate = getCheckinDueDate(new Date('2025-01-15')); // Wednesday
 * // Returns: Monday, Jan 13, 2025 at 9:00 AM Central Time (stored as UTC)
 * ```
 */
export function getCheckinDueDate(weekOf: Date): Date {
  // First, convert the input date to Central Time to find the correct Monday
  const centralWeekOf = toZonedTime(weekOf, CENTRAL_TIME_ZONE);
  
  // Get the Monday of the week in Central Time (week starts on Monday = 1)
  const monday = startOfWeek(centralWeekOf, { weekStartsOn: 1 });
  
  // Set time to 9:00 AM (9:00:00.000) in Central Time
  const mondayAt9AM = setMilliseconds(
    setSeconds(
      setMinutes(
        setHours(monday, 9),
        0
      ),
      0
    ),
    0
  );
  
  // Convert the Central Time date to UTC for storage
  return fromZonedTime(mondayAt9AM, CENTRAL_TIME_ZONE);
}

/**
 * Calculates the Monday 9am Central Time review due date for the week containing the given date.
 * 
 * This function is identical to `getCheckinDueDate` and exists for semantic clarity.
 * Both check-ins and reviews are due on Monday at 9:00 AM Central Time.
 * 
 * @param weekOf - The date within the week for which to calculate the review due date
 * @returns A Date object representing Monday at 9:00 AM Central Time for that week
 * 
 * @example
 * ```typescript
 * // For a date in the week of Jan 13-19, 2025 (Monday is Jan 13)
 * const reviewDueDate = getReviewDueDate(new Date('2025-01-15')); // Wednesday
 * // Returns: Monday, Jan 13, 2025 at 9:00 AM Central Time
 * ```
 */
export function getReviewDueDate(weekOf: Date): Date {
  return getCheckinDueDate(weekOf);
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
 * const dueDate = getCheckinDueDate(new Date('2025-01-15'));
 * const submittedAt = new Date('2025-01-13T08:30:00Z'); // Sunday before due date
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
 * 
 * @example
 * ```typescript
 * const reviewDueDate = getReviewDueDate(new Date('2025-01-15'));
 * const reviewedAt = new Date('2025-01-13T10:00:00Z'); // Monday after due time
 * 
 * const onTime = isReviewedOnTime(reviewedAt, reviewDueDate); // false (after 9am)
 * const notReviewed = isReviewedOnTime(null, reviewDueDate); // false
 * ```
 */
export function isReviewedOnTime(reviewedAt: Date | null, reviewDueDate: Date): boolean {
  if (!reviewedAt) {
    return false;
  }
  
  return reviewedAt <= reviewDueDate;
}

/**
 * Utility function to get a human-readable string representation of the due date in Central Time.
 * This is useful for displaying due dates to users.
 * 
 * @param weekOf - The date within the week for which to get the due date string
 * @returns A formatted string showing the due date in Central Time
 * 
 * @example
 * ```typescript
 * const dueDateString = getDueDateString(new Date('2025-01-15'));
 * // Returns: "Monday, January 13, 2025 at 9:00 AM CT"
 * ```
 */
export function getDueDateString(weekOf: Date): string {
  const dueDate = getCheckinDueDate(weekOf);
  
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: CENTRAL_TIME_ZONE,
    timeZoneName: 'short'
  };
  
  return dueDate.toLocaleDateString('en-US', options);
}

/**
 * Calculates the Monday 00:00 Central Time (start of week) for the week containing the given date.
 * 
 * This function finds the Monday of the week that contains the `date` and sets
 * the time to 00:00 AM Central Time, properly handling DST transitions. The week is
 * considered to start on Monday.
 * 
 * @param date - The date within the week for which to calculate the week start
 * @returns A Date object representing Monday at 00:00 AM Central Time (in UTC)
 * 
 * @example
 * ```typescript
 * // For a date in the week of Jan 13-19, 2025 (Monday is Jan 13)
 * const weekStart = getWeekStartCentral(new Date('2025-01-15')); // Wednesday
 * // Returns: Monday, Jan 13, 2025 at 00:00 AM Central Time (stored as UTC)
 * ```
 */
export function getWeekStartCentral(date: Date): Date {
  // First, convert the input date to Central Time to find the correct Monday
  const centralDate = toZonedTime(date, CENTRAL_TIME_ZONE);
  
  // Get the Monday of the week in Central Time (week starts on Monday = 1)
  const monday = startOfWeek(centralDate, { weekStartsOn: 1 });
  
  // Set time to 00:00 AM (00:00:00.000) in Central Time
  const mondayAt00AM = setMilliseconds(
    setSeconds(
      setMinutes(
        setHours(monday, 0),
        0
      ),
      0
    ),
    0
  );
  
  // Convert the Central Time date to UTC for storage
  return fromZonedTime(mondayAt00AM, CENTRAL_TIME_ZONE);
}