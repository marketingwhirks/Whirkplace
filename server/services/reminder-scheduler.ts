import * as cron from 'node-cron';
import { getCheckinReminderDate } from '@shared/utils/dueDates';
import type { Organization } from '@shared/schema';

/**
 * Initialize the reminder scheduler that runs every hour to check if any organization
 * needs to send reminders based on their custom schedule settings
 */
export function initializeReminderScheduler(storage: any) {
  console.log('Initializing reminder scheduler for all organizations...');
  
  // Run every hour at minute 0 to check if any organization needs reminders
  const cronTask = cron.schedule('0 * * * *', async () => {
    try {
      console.log('Checking organizations for scheduled reminders...');
      
      const now = new Date();
      const organizations = await storage.getAllOrganizations();
      
      for (const org of organizations) {
        try {
          // Skip if organization is not active or doesn't have Slack enabled
          if (!org.isActive || !org.enableSlackIntegration) {
            continue;
          }
          
          // Calculate when the reminder should be sent for this organization
          const reminderDate = getCheckinReminderDate(now, org);
          
          // Check if we're within the same hour as the reminder time
          const hourDiff = Math.abs(now.getTime() - reminderDate.getTime()) / (1000 * 60 * 60);
          
          if (hourDiff < 1) {
            // It's time to send reminders for this organization
            console.log(`Sending scheduled reminders for organization ${org.name}...`);
            
            // Import the scheduleWeeklyReminders function from slack service
            const { scheduleWeeklyReminders } = await import('./slack');
            const result = await scheduleWeeklyReminders(org.id, storage);
            
            console.log(`Reminders for ${org.name}: ${result.remindersSent} sent, ${result.errors} errors`);
          }
        } catch (orgError) {
          console.error(`Failed to check/send reminders for organization ${org.name}:`, orgError);
        }
      }
      
      console.log('Reminder check completed for all organizations');
    } catch (error) {
      console.error('Error in reminder scheduler:', error);
    }
  });
  
  console.log('✅ Reminder scheduler initialized - checking every hour for organizations that need reminders');
  
  // For development: Run a check shortly after startup
  if (process.env.NODE_ENV === 'development') {
    setTimeout(async () => {
      try {
        console.log('Running development reminder check...');
        const organizations = await storage.getAllOrganizations();
        
        for (const org of organizations.slice(0, 1)) { // Just check first org in dev
          if (org.isActive && org.enableSlackIntegration) {
            const { scheduleWeeklyReminders } = await import('./slack');
            const result = await scheduleWeeklyReminders(org.id, storage);
            console.log(`Development reminder check for ${org.name}: ${result.remindersSent} sent, ${result.errors} errors`);
          }
        }
      } catch (error) {
        console.error('Development reminder check failed:', error);
      }
    }, 30000); // 30 seconds after startup
  }
  
  return cronTask;
}

/**
 * Check if reminders should be sent for a specific organization based on their schedule
 */
export function shouldSendReminders(organization: Organization): boolean {
  const now = new Date();
  const reminderDate = getCheckinReminderDate(now, organization);
  
  // Get current day and time in the organization's timezone
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: organization.timezone || 'America/Chicago'
  };
  
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(now);
  
  const currentDay = parts.find(p => p.type === 'weekday')?.value;
  const currentHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const currentMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  
  // Get reminder day and time
  const reminderDay = organization.checkinReminderDay ?? organization.checkinDueDay ?? 5; // Default Friday
  const reminderTime = organization.checkinReminderTime || '09:00';
  const [reminderHour, reminderMinute] = reminderTime.split(':').map(Number);
  
  // Convert day name to number
  const dayMap: Record<string, number> = {
    'Sunday': 0,
    'Monday': 1,
    'Tuesday': 2,
    'Wednesday': 3,
    'Thursday': 4,
    'Friday': 5,
    'Saturday': 6
  };
  
  const currentDayNum = dayMap[currentDay || 'Friday'];
  
  // Check if it's the right day and within the hour of the reminder time
  return currentDayNum === reminderDay && 
         currentHour === reminderHour &&
         Math.abs(currentMinute - reminderMinute) < 60; // Within the hour
}

/**
 * Manual trigger for testing reminders for a specific organization
 */
export async function triggerTestReminders(organizationId: string, storage: any) {
  console.log(`Manual test trigger for reminders - Organization: ${organizationId}`);
  
  try {
    const { scheduleWeeklyReminders } = await import('./slack');
    const result = await scheduleWeeklyReminders(organizationId, storage);
    console.log('Test reminders completed:', result);
    return result;
  } catch (error) {
    console.error('Error in test reminders:', error);
    throw error;
  }
}