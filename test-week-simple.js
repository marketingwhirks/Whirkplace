import { startOfWeek, addDays } from 'date-fns';

console.log('Testing Saturday-Friday week structure:');
console.log('');

// Test with November 22, 2025 (Saturday)
const testDate = new Date('2025-11-22T12:00:00');
console.log('Test Date:', testDate.toDateString(), '(Day', testDate.getDay() + ')');

// Get week start with Saturday as first day
const weekStart = startOfWeek(testDate, { weekStartsOn: 6 });
console.log('Week Start:', weekStart.toDateString(), '(Day', weekStart.getDay() + ')');

// Get week end by adding 6 days to Saturday
const weekEnd = addDays(weekStart, 6);
console.log('Week End:', weekEnd.toDateString(), '(Day', weekEnd.getDay() + ')');

console.log('');
console.log('Testing different days of the same week:');
for (let i = 0; i <= 6; i++) {
  const date = addDays(weekStart, i);
  const calculatedWeekStart = startOfWeek(date, { weekStartsOn: 6 });
  console.log(`  Day ${i}: ${date.toDateString()} -> Week starts ${calculatedWeekStart.toDateString()}`);
}
