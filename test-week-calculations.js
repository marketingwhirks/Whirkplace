// Test script to verify week calculations are working correctly
// Run with: node test-week-calculations.js

const { getWeekStartCentral, getWeekEndingFriday, getCheckinDueDate, getCheckinWeekFriday } = require('./shared/utils/dueDates');

// Test dates
const testDates = [
  new Date('2025-10-27'), // Monday Oct 27 (today)
  new Date('2025-10-31'), // Friday Oct 31 (week ending)
  new Date('2025-11-01'), // Saturday Nov 1 (next week start)
  new Date('2025-10-25'), // Saturday Oct 25 (current week start)
  new Date('2025-10-26'), // Sunday Oct 26
];

console.log('=== TESTING WEEK CALCULATIONS ===');
console.log('Today is: Monday, October 27, 2025');
console.log('Expected: Week should be Saturday Oct 25 - Friday Oct 31\n');

testDates.forEach(date => {
  console.log(`\nTesting date: ${date.toDateString()}`);
  
  const weekStart = getWeekStartCentral(date);
  const weekEnd = getWeekEndingFriday(date);
  const weekFriday = getCheckinWeekFriday(date);
  const dueDate = getCheckinDueDate(date);
  
  console.log(`  Week Start (Saturday): ${weekStart.toDateString()} ${weekStart.toTimeString().substring(0, 8)}`);
  console.log(`  Week End (Friday):     ${weekEnd.toDateString()} ${weekEnd.toTimeString().substring(0, 8)}`);
  console.log(`  Week Friday Display:   ${weekFriday.toDateString()}`);
  console.log(`  Check-in Due Date:     ${dueDate.toDateString()} ${dueDate.toTimeString().substring(0, 8)}`);
  
  // Verify calculations
  const isCorrectWeekStart = weekStart.getDay() === 6; // Saturday
  const isCorrectWeekEnd = weekEnd.getDay() === 5; // Friday
  const isCorrectDueDay = dueDate.getDay() === 5; // Friday
  
  if (!isCorrectWeekStart) {
    console.log(`  ❌ ERROR: Week start is not Saturday! (Day ${weekStart.getDay()})`);
  }
  if (!isCorrectWeekEnd) {
    console.log(`  ❌ ERROR: Week end is not Friday! (Day ${weekEnd.getDay()})`);
  }
  if (!isCorrectDueDay) {
    console.log(`  ❌ ERROR: Due date is not Friday! (Day ${dueDate.getDay()})`);
  }
  
  if (isCorrectWeekStart && isCorrectWeekEnd && isCorrectDueDay) {
    console.log(`  ✅ All calculations correct!`);
  }
});

console.log('\n=== VERIFICATION RESULTS ===');
console.log('Testing for current week (Oct 25-31, 2025):');

// Test that all dates in current week resolve to same week boundaries
const currentWeekDates = [
  new Date('2025-10-25'), // Saturday
  new Date('2025-10-26'), // Sunday
  new Date('2025-10-27'), // Monday
  new Date('2025-10-28'), // Tuesday
  new Date('2025-10-29'), // Wednesday
  new Date('2025-10-30'), // Thursday
  new Date('2025-10-31'), // Friday
];

let allCorrect = true;
const expectedStart = new Date('2025-10-25');
expectedStart.setHours(0, 0, 0, 0);
const expectedEnd = new Date('2025-10-31');
expectedEnd.setHours(23, 59, 59, 999);

currentWeekDates.forEach(date => {
  const weekStart = getWeekStartCentral(date);
  const weekEnd = getWeekEndingFriday(date);
  
  // Compare dates (ignoring time for start comparison)
  const startDateOnly = new Date(weekStart);
  startDateOnly.setHours(0, 0, 0, 0);
  const expectedStartDateOnly = new Date(expectedStart);
  expectedStartDateOnly.setHours(0, 0, 0, 0);
  
  if (startDateOnly.getTime() !== expectedStartDateOnly.getTime()) {
    console.log(`❌ ${date.toDateString()} - Wrong week start: ${weekStart.toDateString()}`);
    allCorrect = false;
  }
  
  const endDateOnly = new Date(weekEnd);
  endDateOnly.setHours(23, 59, 59, 999);
  const expectedEndDateOnly = new Date(expectedEnd);
  expectedEndDateOnly.setHours(23, 59, 59, 999);
  
  if (Math.abs(endDateOnly.getTime() - expectedEndDateOnly.getTime()) > 1000) { // Allow 1 second tolerance
    console.log(`❌ ${date.toDateString()} - Wrong week end: ${weekEnd.toDateString()}`);
    allCorrect = false;
  }
});

if (allCorrect) {
  console.log('✅ All dates in current week resolve to Saturday Oct 25 - Friday Oct 31');
} else {
  console.log('❌ Some dates are not resolving to the correct week boundaries!');
}

console.log('\n=== SUMMARY ===');
console.log('This week: Saturday Oct 25, 2025 - Friday Oct 31, 2025');
console.log('Check-ins due: Friday Oct 31, 2025 at 5:00 PM');
console.log('Next week starts: Saturday Nov 1, 2025');