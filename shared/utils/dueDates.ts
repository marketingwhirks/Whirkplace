import { startOfWeek, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';

/**
 * Determines if a given date is in Daylight Saving Time (DST) for US Central Time.
 * DST runs from the second Sunday in March to the first Sunday in November.
 * 
 * @param date - The date to check
 * @returns true if the date is in DST, false otherwise
 */
function isInDST(date: Date): boolean {
  const year = date.getFullYear();
  
  // Second Sunday in March (DST begins)
  const march = new Date(year, 2, 1); // March 1st
  const firstSunday = new Date(year, 2, 7 - march.getDay());
  const dstStart = new Date(year, 2, firstSunday.getDate() + 7);
  
  // First Sunday in November (DST ends)
  const november = new Date(year, 10, 1); // November 1st
  const dstEnd = new Date(year, 10, 7 - november.getDay());
  
  return date >= dstStart && date < dstEnd;
}

/**
 * Converts a UTC date to Central Time.
 * 
 * @param utcDate - The UTC date to convert
 * @returns A new Date object representing the Central Time equivalent
 */
function utcToCentral(utcDate: Date): Date {
  const offsetHours = isInDST(utcDate) ? 5 : 6; // UTC-5 for CDT, UTC-6 for CST
  return new Date(utcDate.getTime() - offsetHours * 60 * 60 * 1000);
}

/**
 * Converts a Central Time date to UTC.
 * 
 * @param centralDate - The Central Time date to convert
 * @returns A new Date object representing the UTC equivalent
 */
function centralToUTC(centralDate: Date): Date {
  const offsetHours = isInDST(centralDate) ? 5 : 6; // UTC-5 for CDT, UTC-6 for CST
  return new Date(centralDate.getTime() + offsetHours * 60 * 60 * 1000);
}

/**
 * Calculates the Monday 9am Central Time due date for the week containing the given date.
 * 
 * This function finds the Monday of the week that contains the `weekOf` date and sets
 * the time to 9:00 AM Central Time. The week is considered to start on Monday.
 * 
 * @param weekOf - The date within the week for which to calculate the due date
 * @returns A Date object representing Monday at 9:00 AM Central Time for that week
 * 
 * @example
 * ```typescript
 * // For a date in the week of Jan 13-19, 2025 (Monday is Jan 13)
 * const dueDate = getCheckinDueDate(new Date('2025-01-15')); // Wednesday
 * // Returns: Monday, Jan 13, 2025 at 9:00 AM Central Time
 * ```
 */
export function getCheckinDueDate(weekOf: Date): Date {
  // Get the Monday of the week (week starts on Monday = 1)
  const monday = startOfWeek(weekOf, { weekStartsOn: 1 });
  
  // Set time to 9:00 AM (9:00:00.000)
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
  
  // Convert from local time to Central Time, then to UTC for storage
  return centralToUTC(mondayAt9AM);
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
  const centralDueDate = utcToCentral(dueDate);
  
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago', // Central Time
    timeZoneName: 'short'
  };
  
  return centralDueDate.toLocaleDateString('en-US', options);
}