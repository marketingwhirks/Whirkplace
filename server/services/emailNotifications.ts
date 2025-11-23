// Email notification functions that respect user preferences
import { sendEmail, emailTemplates } from './emailService';
import { isNotificationEnabled, shouldSendNotification } from './notificationPreferences';
import { storage } from '../storage';

/**
 * Send check-in reminder email to a user if they have email reminders enabled
 */
export async function sendCheckinReminderEmail(
  userId: string,
  organizationId: string,
  userEmail?: string,
  userName?: string,
  organizationName?: string
): Promise<boolean> {
  try {
    // Check if user has check-in reminders enabled for email
    const shouldSend = await shouldSendNotification(
      userId,
      'email',
      'checkinReminders',
      organizationId,
      true // Respect DND and working hours
    );
    
    if (!shouldSend) {
      console.log(`Skipping check-in reminder email for user ${userId} - notifications disabled or outside schedule`);
      return false;
    }

    // Fetch user details if not provided
    if (!userEmail || !userName) {
      const user = await storage.getUser(organizationId, userId);
      if (!user) {
        console.error(`User ${userId} not found in organization ${organizationId}`);
        return false;
      }
      userEmail = userEmail || user.email;
      userName = userName || user.name || user.username;
    }

    // Fetch organization name if not provided
    if (!organizationName) {
      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        console.error(`Organization ${organizationId} not found`);
        return false;
      }
      organizationName = organization.name;
    }

    // Create check-in reminder email template
    const appUrl = process.env.BASE_URL || 'https://app.whirkplace.com';
    const checkinUrl = `${appUrl}/#/checkins`;
    
    const emailContent = {
      subject: `Time for your weekly check-in at ${organizationName}`,
      text: `Hi ${userName},

It's time for your weekly check-in at ${organizationName}!

Your feedback helps us build a better team culture and understand how to support you better.

Complete your check-in here:
${checkinUrl}

Best regards,
The ${organizationName} Team`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="width: 60px; height: 60px; background-color: #1b365d; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
            <div style="width: 24px; height: 24px; color: #84ae56;">📝</div>
          </div>
          <h1 style="color: #1b365d; margin: 0; font-size: 24px;">Weekly Check-in Reminder</h1>
        </div>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">Hi ${userName},</p>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
          It's time for your weekly check-in at ${organizationName}!
        </p>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
          Your feedback helps us build a better team culture and understand how to support you better.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${checkinUrl}" style="background-color: #1b365d; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; display: inline-block; font-weight: bold;">
            Complete Check-in
          </a>
        </div>
        
        <div style="text-align: center; padding-top: 30px; border-top: 1px solid #eee;">
          <p style="color: #888; font-size: 14px; margin: 0;">
            Best regards,<br>
            The ${organizationName} Team
          </p>
        </div>
      </div>`
    };

    return await sendEmail({
      to: userEmail,
      from: `${organizationName} <${process.env.SENDGRID_FROM_EMAIL || 'noreply@whirkplace.com'}>`,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html
    });
  } catch (error) {
    console.error(`Error sending check-in reminder email:`, error);
    return false;
  }
}

/**
 * Send review reminder email to a manager/reviewer if they have review reminders enabled
 */
export async function sendReviewReminderEmail(
  reviewerId: string,
  organizationId: string,
  pendingCount: number,
  teamMemberNames?: string[],
  reviewerEmail?: string,
  reviewerName?: string,
  organizationName?: string
): Promise<boolean> {
  try {
    // Check if user has review reminders enabled for email
    const shouldSend = await shouldSendNotification(
      reviewerId,
      'email',
      'checkinSubmissions', // Use same preference as check-in submission notifications
      organizationId,
      true // Respect DND and working hours
    );
    
    if (!shouldSend) {
      console.log(`Skipping review reminder email for reviewer ${reviewerId} - notifications disabled or outside schedule`);
      return false;
    }

    // Fetch reviewer details if not provided
    if (!reviewerEmail || !reviewerName) {
      const reviewer = await storage.getUser(organizationId, reviewerId);
      if (!reviewer) {
        console.error(`Reviewer ${reviewerId} not found in organization ${organizationId}`);
        return false;
      }
      reviewerEmail = reviewerEmail || reviewer.email;
      reviewerName = reviewerName || reviewer.name || reviewer.username;
    }

    // Fetch organization name if not provided
    if (!organizationName) {
      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        console.error(`Organization ${organizationId} not found`);
        return false;
      }
      organizationName = organization.name;
    }

    // Create review reminder email template
    const appUrl = process.env.BASE_URL || 'https://app.whirkplace.com';
    const reviewUrl = `${appUrl}/#/reviews`;
    
    const teamMembersList = teamMemberNames?.length ? teamMemberNames.slice(0, 3).join(', ') : 'team members';
    const andMore = teamMemberNames && teamMemberNames.length > 3 ? ` and ${teamMemberNames.length - 3} more` : '';
    
    const emailContent = {
      subject: `You have ${pendingCount} pending check-in review${pendingCount > 1 ? 's' : ''} at ${organizationName}`,
      text: `Hi ${reviewerName},

You have ${pendingCount} pending check-in review${pendingCount > 1 ? 's' : ''} waiting for your feedback.

${teamMemberNames?.length ? `Team members waiting for review: ${teamMembersList}${andMore}` : ''}

Review their check-ins and provide feedback to help your team grow and succeed.

Review check-ins here:
${reviewUrl}

Best regards,
The ${organizationName} Team`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="width: 60px; height: 60px; background-color: #1b365d; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
            <div style="width: 24px; height: 24px; color: #84ae56;">👁️</div>
          </div>
          <h1 style="color: #1b365d; margin: 0; font-size: 24px;">Pending Check-in Reviews</h1>
        </div>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">Hi ${reviewerName},</p>
        
        <div style="background-color: #f8f9fa; border-left: 4px solid #1b365d; padding: 15px; margin-bottom: 20px;">
          <p style="color: #333; margin: 0; font-weight: bold;">
            You have ${pendingCount} pending check-in review${pendingCount > 1 ? 's' : ''} waiting for your feedback.
          </p>
          ${teamMemberNames?.length ? `
          <p style="color: #666; margin: 10px 0 0 0; font-size: 14px;">
            Team members: ${teamMembersList}${andMore}
          </p>
          ` : ''}
        </div>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
          Your team members are counting on your feedback to help them grow and succeed. Take a few minutes to review their check-ins and provide thoughtful comments.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${reviewUrl}" style="background-color: #1b365d; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; display: inline-block; font-weight: bold;">
            Review Check-ins Now
          </a>
        </div>
        
        <div style="text-align: center; padding-top: 30px; border-top: 1px solid #eee;">
          <p style="color: #888; font-size: 14px; margin: 0;">
            Best regards,<br>
            The ${organizationName} Team
          </p>
        </div>
      </div>`
    };

    return await sendEmail({
      to: reviewerEmail,
      from: `${organizationName} <${process.env.SENDGRID_FROM_EMAIL || 'noreply@whirkplace.com'}>`,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html
    });
  } catch (error) {
    console.error(`Error sending review reminder email:`, error);
    return false;
  }
}

/**
 * Send win announcement email to a user if they have win announcements enabled
 */
export async function sendWinAnnouncementEmail(
  recipientUserId: string,
  organizationId: string,
  winTitle: string,
  winDescription: string,
  nominatedBy?: string
): Promise<boolean> {
  try {
    // Check if user has win announcements enabled for email
    const isEnabled = await isNotificationEnabled(
      recipientUserId,
      'email',
      'winAnnouncements',
      organizationId
    );
    
    if (!isEnabled) {
      console.log(`Skipping win announcement email for user ${recipientUserId} - notifications disabled`);
      return false;
    }

    // Fetch user and organization details
    const user = await storage.getUser(organizationId, recipientUserId);
    if (!user) {
      console.error(`User ${recipientUserId} not found`);
      return false;
    }

    const organization = await storage.getOrganization(organizationId);
    if (!organization) {
      console.error(`Organization ${organizationId} not found`);
      return false;
    }

    const announcement = nominatedBy 
      ? `${nominatedBy} recognized you` 
      : `You've been recognized`;

    const emailContent = {
      subject: `🏆 ${announcement} at ${organization.name}!`,
      text: `Hi ${user.name || user.username},

${announcement} for your outstanding achievement!

${winTitle}

${winDescription}

Keep up the amazing work!

Best regards,
The ${organization.name} Team`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="width: 60px; height: 60px; background-color: #1b365d; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
            <div style="width: 24px; height: 24px; color: #84ae56;">🏆</div>
          </div>
          <h1 style="color: #1b365d; margin: 0; font-size: 24px;">Congratulations!</h1>
        </div>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">Hi ${user.name || user.username},</p>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
          <strong>${announcement}</strong> for your outstanding achievement!
        </p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #1b365d; margin-top: 0;">${winTitle}</h3>
          <p style="color: #666; line-height: 1.6; margin: 0;">${winDescription}</p>
        </div>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
          Keep up the amazing work! 🚀✨
        </p>
        
        <div style="text-align: center; padding-top: 30px; border-top: 1px solid #eee;">
          <p style="color: #888; font-size: 14px; margin: 0;">
            Best regards,<br>
            The ${organization.name} Team
          </p>
        </div>
      </div>`
    };

    return await sendEmail({
      to: user.email,
      from: `${organization.name} <${process.env.SENDGRID_FROM_EMAIL || 'noreply@whirkplace.com'}>`,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html
    });
  } catch (error) {
    console.error(`Error sending win announcement email:`, error);
    return false;
  }
}

/**
 * Send shoutout email to a user if they have shoutouts enabled
 */
export async function sendShoutoutEmail(
  recipientUserId: string,
  organizationId: string,
  message: string,
  fromUserName: string,
  companyValues: string[] = []
): Promise<boolean> {
  try {
    // Check if user has shoutouts enabled for email
    const isEnabled = await isNotificationEnabled(
      recipientUserId,
      'email',
      'shoutouts',
      organizationId
    );
    
    if (!isEnabled) {
      console.log(`Skipping shoutout email for user ${recipientUserId} - notifications disabled`);
      return false;
    }

    // Fetch user and organization details
    const user = await storage.getUser(organizationId, recipientUserId);
    if (!user) {
      console.error(`User ${recipientUserId} not found`);
      return false;
    }

    const organization = await storage.getOrganization(organizationId);
    if (!organization) {
      console.error(`Organization ${organizationId} not found`);
      return false;
    }

    const valuesText = companyValues.length > 0 
      ? `\n\nYou exemplified these company values: ${companyValues.join(', ')}`
      : '';

    const emailContent = {
      subject: `🎉 ${fromUserName} gave you a shoutout at ${organization.name}!`,
      text: `Hi ${user.name || user.username},

${fromUserName} gave you a shoutout:

"${message}"${valuesText}

Great work!

Best regards,
The ${organization.name} Team`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="width: 60px; height: 60px; background-color: #1b365d; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
            <div style="width: 24px; height: 24px; color: #84ae56;">🎉</div>
          </div>
          <h1 style="color: #1b365d; margin: 0; font-size: 24px;">You Got a Shoutout!</h1>
        </div>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">Hi ${user.name || user.username},</p>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
          <strong>${fromUserName}</strong> gave you a shoutout:
        </p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <blockquote style="margin: 0; padding-left: 15px; border-left: 3px solid #84ae56;">
            <p style="color: #333; line-height: 1.6; font-style: italic;">"${message}"</p>
          </blockquote>
          ${companyValues.length > 0 ? `
          <div style="margin-top: 15px;">
            <p style="color: #666; margin: 0; font-size: 14px;">
              <strong>Company values exemplified:</strong>
            </p>
            <div style="margin-top: 10px;">
              ${companyValues.map(value => `<span style="display: inline-block; background: #84ae56; color: white; padding: 5px 10px; border-radius: 15px; font-size: 12px; margin: 2px;">${value}</span>`).join(' ')}
            </div>
          </div>
          ` : ''}
        </div>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
          Great work! 🌟
        </p>
        
        <div style="text-align: center; padding-top: 30px; border-top: 1px solid #eee;">
          <p style="color: #888; font-size: 14px; margin: 0;">
            Best regards,<br>
            The ${organization.name} Team
          </p>
        </div>
      </div>`
    };

    return await sendEmail({
      to: user.email,
      from: `${organization.name} <${process.env.SENDGRID_FROM_EMAIL || 'noreply@whirkplace.com'}>`,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html
    });
  } catch (error) {
    console.error(`Error sending shoutout email:`, error);
    return false;
  }
}

/**
 * Send check-in submission notification email to team leader
 */
export async function sendCheckinSubmissionEmail(
  teamLeaderUserId: string,
  organizationId: string,
  submitterName: string,
  overallMood: number,
  submissionSummary?: string
): Promise<boolean> {
  try {
    // Check if team leader has check-in submission notifications enabled for email
    const shouldSend = await shouldSendNotification(
      teamLeaderUserId,
      'email',
      'checkinSubmissions',
      organizationId,
      false // Important notifications - don't respect DND
    );
    
    if (!shouldSend) {
      console.log(`Skipping check-in submission email for team leader ${teamLeaderUserId} - notifications disabled`);
      return false;
    }

    // Fetch team leader and organization details
    const teamLeader = await storage.getUser(organizationId, teamLeaderUserId);
    if (!teamLeader) {
      console.error(`Team leader ${teamLeaderUserId} not found`);
      return false;
    }

    const organization = await storage.getOrganization(organizationId);
    if (!organization) {
      console.error(`Organization ${organizationId} not found`);
      return false;
    }

    const moodEmoji = overallMood >= 4 ? '😊' : overallMood >= 2 ? '😐' : '😟';
    const appUrl = process.env.BASE_URL || 'https://app.whirkplace.com';
    const reviewUrl = `${appUrl}/#/reviews`;

    const emailContent = {
      subject: `${submitterName} submitted their check-in for review`,
      text: `Hi ${teamLeader.name || teamLeader.username},

${submitterName} has submitted their weekly check-in for review.

Overall Mood: ${moodEmoji} ${overallMood}/5
${submissionSummary ? `\nSummary: ${submissionSummary}` : ''}

Please review their check-in here:
${reviewUrl}

Best regards,
The ${organization.name} Team`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="width: 60px; height: 60px; background-color: #1b365d; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
            <div style="width: 24px; height: 24px; color: #84ae56;">📋</div>
          </div>
          <h1 style="color: #1b365d; margin: 0; font-size: 24px;">Check-in Submitted for Review</h1>
        </div>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">Hi ${teamLeader.name || teamLeader.username},</p>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
          <strong>${submitterName}</strong> has submitted their weekly check-in for review.
        </p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="color: #333; margin: 0; line-height: 1.6;">
            <strong>Overall Mood:</strong> ${moodEmoji} ${overallMood}/5
          </p>
          ${submissionSummary ? `
          <p style="color: #333; margin: 10px 0 0 0; line-height: 1.6;">
            <strong>Summary:</strong> ${submissionSummary}
          </p>
          ` : ''}
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${reviewUrl}" style="background-color: #1b365d; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; display: inline-block; font-weight: bold;">
            Review Check-in
          </a>
        </div>
        
        <div style="text-align: center; padding-top: 30px; border-top: 1px solid #eee;">
          <p style="color: #888; font-size: 14px; margin: 0;">
            Best regards,<br>
            The ${organization.name} Team
          </p>
        </div>
      </div>`
    };

    return await sendEmail({
      to: teamLeader.email,
      from: `${organization.name} <${process.env.SENDGRID_FROM_EMAIL || 'noreply@whirkplace.com'}>`,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html
    });
  } catch (error) {
    console.error(`Error sending check-in submission email:`, error);
    return false;
  }
}