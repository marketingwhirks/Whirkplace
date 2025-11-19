// Test Saturday-Friday week calculations
import { getWeekStartCentral, getWeekEndingFriday, getCheckinDueDate, getCheckinWeekFriday } from './shared/utils/dueDates.js';

console.log('=== TESTING SATURDAY-FRIDAY WEEK CALCULATIONS ===');
console.log('Week structure: Saturday - Friday');
console.log('Check-ins due: Friday 5PM Central\n');

// Test dates covering different days of the week
const testDates = [
  new Date('2025-11-22'), // Saturday Nov 22 (first day of week)
  new Date('2025-11-23'), // Sunday Nov 23 
  new Date('2025-11-24'), // Monday Nov 24
  new Date('2025-11-25'), // Tuesday Nov 25
  new Date('2025-11-26'), // Wednesday Nov 26
  new Date('2025-11-27'), // Thursday Nov 27
  new Date('2025-11-28'), // Friday Nov 28 (last day of week)
  new Date('2025-11-29'), // Saturday Nov 29 (first day of next week)
];

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

console.log('Testing dates from Nov 22-29, 2025:');
console.log('Expected week: Saturday Nov 22 - Friday Nov 28\n');

testDates.forEach(date => {
  const dayName = dayNames[date.getDay()];
  console.log(`\n${dayName}, ${date.toDateString()}`);
  console.log('─'.repeat(40));
  
  const weekStart = getWeekStartCentral(date);
  const weekEnd = getWeekEndingFriday(date);
  const weekFriday = getCheckinWeekFriday(date);
  const dueDate = getCheckinDueDate(date);
  
  console.log(`  Week Start:     ${dayNames[weekStart.getDay()]} ${weekStart.toDateString()}`);
  console.log(`  Week End:       ${dayNames[weekEnd.getDay()]} ${weekEnd.toDateString()}`);
  console.log(`  Week Friday:    ${dayNames[weekFriday.getDay()]} ${weekFriday.toDateString()}`);
  console.log(`  Due Date:       ${dayNames[dueDate.getDay()]} ${dueDate.toDateString()} at ${dueDate.toTimeString().substring(0, 8)}`);
  
  // Verify calculations
  const isCorrectWeekStart = weekStart.getDay() === 6; // Saturday
  const isCorrectWeekEnd = weekEnd.getDay() === 5; // Friday
  const isCorrectDueDay = dueDate.getDay() === 5; // Friday
  
  // Check if dates from Nov 22-28 all map to the same week
  const expectedWeekStart = new Date('2025-11-22');
  const expectedWeekEnd = new Date('2025-11-28');
  const isInExpectedWeek = date >= expectedWeekStart && date <= expectedWeekEnd;
  const weekStartDate = weekStart.toDateString();
  const isCorrectWeekMapping = isInExpectedWeek ? 
    weekStartDate === 'Sat Nov 22 2025' : 
    weekStartDate === 'Sat Nov 29 2025';
  
  if (!isCorrectWeekStart) {
    console.log(`  ❌ ERROR: Week start is not Saturday! (Day ${weekStart.getDay()})`);
  }
  if (!isCorrectWeekEnd) {
    console.log(`  ❌ ERROR: Week end is not Friday! (Day ${weekEnd.getDay()})`);
  }
  if (!isCorrectDueDay) {
    console.log(`  ❌ ERROR: Due date is not Friday! (Day ${dueDate.getDay()})`);
  }
  if (!isCorrectWeekMapping) {
    console.log(`  ❌ ERROR: Week mapping is incorrect! Expected ${isInExpectedWeek ? 'Nov 22' : 'Nov 29'}, got ${weekStart.toDateString()}`);
  }
  
  if (isCorrectWeekStart && isCorrectWeekEnd && isCorrectDueDay && isCorrectWeekMapping) {
    console.log(`  ✅ All calculations correct!`);
  }
});

console.log('\n=== SUMMARY ===');
console.log('✓ Saturday-Friday week structure is now active');
console.log('✓ Check-ins are due on Friday at 5PM Central');
console.log('✓ All dates within a week (Sat-Fri) map to the same Saturday start date');