// Test script to verify check-in date calculations are correct
// Today is Friday, October 11, 2025
// With Thursday as due date, the current check-in should be for October 10, 2025 (Thursday)

const { getWeekStartCentral, getCheckinDueDate, getCheckinWeekFriday } = require('./shared/utils/dueDates');

// Mock organization with Thursday due date
const mockOrg = {
  checkinDueDay: 4, // Thursday (0=Sunday, 1=Monday, ..., 4=Thursday, ..., 6=Saturday)
  checkinDueTime: "17:00",
  timezone: "America/Chicago"
};

// Test date: Friday, October 11, 2025
const testDate = new Date('2025-10-11T10:00:00-05:00'); // 10 AM Central Time on Friday

console.log('=== Check-in Date Calculation Test ===');
console.log('Test Date (Today):', testDate.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
console.log('Organization Due Day: Thursday');
console.log('');

// Test getWeekStartCentral - should return Monday, October 6, 2025 (correct) or October 7, 2025
const weekStart = getWeekStartCentral(testDate, mockOrg);
console.log('Week Start (should be Monday Oct 7):', weekStart.toLocaleString('en-US', { timeZone: 'America/Chicago' }));

// Test getCheckinDueDate - should return Thursday, October 10, 2025 at 5 PM
const dueDate = getCheckinDueDate(testDate, mockOrg);
console.log('Check-in Due Date (should be Thu Oct 10, 5PM):', dueDate.toLocaleString('en-US', { timeZone: 'America/Chicago' }));

// Test getCheckinWeekFriday - should return Friday, October 11, 2025
const weekFriday = getCheckinWeekFriday(testDate, mockOrg);
console.log('Week Friday (should be Fri Oct 11):', weekFriday.toLocaleString('en-US', { timeZone: 'America/Chicago' }));

console.log('');
console.log('=== Test Results ===');

// Verify correct dates
const expectedWeekStart = new Date('2025-10-07T00:00:00-05:00'); // Monday Oct 7
const expectedDueDate = new Date('2025-10-10T17:00:00-05:00'); // Thursday Oct 10, 5 PM
const expectedWeekFriday = new Date('2025-10-11T00:00:00-05:00'); // Friday Oct 11

// Check if week start is correct (Monday)
const weekStartCorrect = weekStart.getDate() === 7 && weekStart.getMonth() === 9; // October is month 9
console.log('✓ Week Start Correct (Monday Oct 7)?', weekStartCorrect ? '✅ YES' : '❌ NO');

// Check if due date is correct (Thursday)
const dueDateCorrect = dueDate.getDate() === 10 && dueDate.getMonth() === 9; // October 10
console.log('✓ Due Date Correct (Thu Oct 10)?', dueDateCorrect ? '✅ YES' : '❌ NO');

// Check if week Friday is correct
const weekFridayCorrect = weekFriday.getDate() === 11 && weekFriday.getMonth() === 9; // October 11
console.log('✓ Week Friday Correct (Fri Oct 11)?', weekFridayCorrect ? '✅ YES' : '❌ NO');

// Most importantly: The check-in should NOT be for next week (Oct 17)
const notNextWeek = dueDate.getDate() !== 17;
console.log('✓ Check-in NOT for next week (Oct 17)?', notNextWeek ? '✅ YES - FIXED!' : '❌ NO - BUG STILL EXISTS');

console.log('');
if (weekStartCorrect && dueDateCorrect && weekFridayCorrect && notNextWeek) {
  console.log('🎉 ALL TESTS PASSED! The date calculation bug has been fixed!');
} else {
  console.log('❌ Some tests failed. The bug may still exist.');
}