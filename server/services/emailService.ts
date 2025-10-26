// Email service using SendGrid integration from Replit blueprint
import { MailService } from '@sendgrid/mail';
import { isNotificationEnabled, shouldSendNotification } from './notificationPreferences';
import { storage } from '../storage';

// Configuration
const isEmailEnabled = process.env.EMAIL_ENABLED !== 'false';
const senderEmail = process.env.SENDGRID_FROM_EMAIL;
const senderName = process.env.SENDGRID_SENDER_NAME || 'Whirkplace';

// Initialize SendGrid only if email is enabled and configured
let mailService: MailService | null = null;

if (isEmailEnabled) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn("⚠️ SENDGRID_API_KEY not set - email sending disabled");
  } else if (!senderEmail) {
    console.warn("⚠️ SENDGRID_FROM_EMAIL not set - email sending disabled");
  } else {
    mailService = new MailService();
    mailService.setApiKey(process.env.SENDGRID_API_KEY!);
    console.log(`📧 Email service initialized with sender: ${senderEmail}`);
  }
}

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

// Helper function to get sender information - returns null if not configured
function tryGetSender(): { email: string; name: string } | null {
  if (!senderEmail) {
    return null;
  }
  return {
    email: senderEmail,
    name: senderName
  };
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  // Check if email is disabled or not configured
  if (!mailService) {
    console.log(`📧 Email sending disabled - would have sent email to ${params.to} with subject: ${params.subject}`);
    return false;
  }

  try {
    const emailData: any = {
      to: params.to,
      from: params.from,
      subject: params.subject,
    };
    
    if (params.text) {
      emailData.text = params.text;
    }
    
    if (params.html) {
      emailData.html = params.html;
    }
    
    await mailService.send(emailData);
    console.log(`📧 Email sent successfully to ${params.to}`);
    return true;
  } catch (error: any) {
    console.error('📧 SendGrid email error:', error);
    if (error.response && error.response.body) {
      console.error('📧 SendGrid error details:', JSON.stringify(error.response.body, null, 2));
    }
    return false;
  }
}

// Email templates for different types of notifications
export const emailTemplates = {
  slackPasswordSetup: (userName: string, organizationName: string, setupLink: string) => ({
    subject: `Set up your password for ${organizationName}`,
    text: `Hi ${userName},

You're currently using Slack to sign in to ${organizationName} on Whirkplace. We're giving you the option to also log in using an email and password.

This is completely optional - you can continue using Slack to sign in if you prefer.

If you'd like to set up a password for direct login, click the link below:
${setupLink}

This link will expire in 24 hours for security reasons.

Benefits of setting up a password:
• Sign in directly without going through Slack
• Access your account even when Slack is unavailable
• Use either method - Slack or password - whatever is more convenient

If you didn't request this or prefer to keep using only Slack authentication, you can safely ignore this email.

Best regards,
The ${organizationName} Team`,
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="width: 60px; height: 60px; background-color: #1b365d; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
          <div style="width: 24px; height: 24px; color: #84ae56;">💚</div>
        </div>
        <h1 style="color: #1b365d; margin: 0; font-size: 24px;">Whirkplace</h1>
      </div>
      
      <h2 style="color: #333; margin-bottom: 20px;">Set Up Your Password for ${organizationName}</h2>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">Hi ${userName},</p>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
        You're currently using <strong>Slack</strong> to sign in to ${organizationName} on Whirkplace. We're giving you the option to also log in using an email and password.
      </p>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
        <em>This is completely optional</em> - you can continue using Slack to sign in if you prefer.
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${setupLink}" style="background-color: #1b365d; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; display: inline-block; font-weight: bold;">
          Set Up Password
        </a>
      </div>
      
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #1b365d; margin-top: 0;">Benefits of setting up a password:</h3>
        <ul style="color: #666; line-height: 1.6; margin: 0; padding-left: 20px;">
          <li>Sign in directly without going through Slack</li>
          <li>Access your account even when Slack is unavailable</li>
          <li>Use either method - Slack or password - whatever is more convenient</li>
        </ul>
      </div>
      
      <p style="color: #999; font-size: 14px; margin-bottom: 20px;">
        ⏰ This link will expire in 24 hours for security reasons.
      </p>
      
      <div style="background-color: #e8f4fd; border: 1px solid #bee5eb; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <p style="color: #0c5460; margin: 0; font-size: 14px;">
          <strong>Note:</strong> If you didn't request this or prefer to keep using only Slack authentication, you can safely ignore this email.
        </p>
      </div>
      
      <div style="text-align: center; padding-top: 30px; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 14px; margin: 0;">
          Best regards,<br>
          The ${organizationName} Team
        </p>
      </div>
    </div>`
  }),

  welcome: (userName: string, organizationName: string) => ({
    subject: `Welcome to ${organizationName} on Whirkplace!`,
    text: `Hi ${userName},

Welcome to ${organizationName} on Whirkplace! We're excited to have you on board.

Whirkplace helps teams build stronger connections through regular check-ins, team analytics, and win recognition. 

To get started:
1. Complete your profile
2. Participate in your first team check-in
3. Celebrate wins with your colleagues

If you have any questions, our support team is here to help.

Best regards,
The Whirkplace Team`,
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="width: 60px; height: 60px; background-color: #1b365d; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
          <div style="width: 24px; height: 24px; color: #84ae56;">💚</div>
        </div>
        <h1 style="color: #1b365d; margin: 0; font-size: 24px;">Whirkplace</h1>
      </div>
      
      <h2 style="color: #333; margin-bottom: 20px;">Welcome to ${organizationName}!</h2>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">Hi ${userName},</p>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
        Welcome to ${organizationName} on Whirkplace! We're excited to have you on board.
      </p>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
        Whirkplace helps teams build stronger connections through regular check-ins, team analytics, and win recognition.
      </p>
      
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #1b365d; margin-top: 0;">To get started:</h3>
        <ul style="color: #666; line-height: 1.6; margin: 0; padding-left: 20px;">
          <li>Complete your profile</li>
          <li>Participate in your first team check-in</li>
          <li>Celebrate wins with your colleagues</li>
        </ul>
      </div>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
        If you have any questions, our support team is here to help.
      </p>
      
      <div style="text-align: center; padding-top: 30px; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 14px; margin: 0;">
          Best regards,<br>
          The Whirkplace Team
        </p>
      </div>
    </div>`
  }),

  passwordReset: (userName: string, resetLink: string, organizationName: string) => ({
    subject: `Reset your ${organizationName} password`,
    text: `Hi ${userName},

You requested to reset your password for ${organizationName} on Whirkplace.

Click the link below to reset your password:
${resetLink}

This link will expire in 1 hour for security reasons.

If you didn't request this password reset, please ignore this email or contact support if you have concerns.

Best regards,
The Whirkplace Team`,
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="width: 60px; height: 60px; background-color: #1b365d; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
          <div style="width: 24px; height: 24px; color: #84ae56;">💚</div>
        </div>
        <h1 style="color: #1b365d; margin: 0; font-size: 24px;">Whirkplace</h1>
      </div>
      
      <h2 style="color: #333; margin-bottom: 20px;">Password Reset Request</h2>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">Hi ${userName},</p>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
        You requested to reset your password for ${organizationName} on Whirkplace.
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="background-color: #1b365d; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; display: inline-block; font-weight: bold;">
          Reset Password
        </a>
      </div>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
        This link will expire in 1 hour for security reasons.
      </p>
      
      <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <p style="color: #856404; margin: 0; font-size: 14px;">
          <strong>Security Notice:</strong> If you didn't request this password reset, please ignore this email or contact support if you have concerns.
        </p>
      </div>
      
      <div style="text-align: center; padding-top: 30px; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 14px; margin: 0;">
          Best regards,<br>
          The Whirkplace Team
        </p>
      </div>
    </div>`
  }),

  teamInvite: (inviterName: string, teamName: string, organizationName: string, inviteLink: string) => ({
    subject: `${inviterName} invited you to join ${teamName} on Whirkplace`,
    text: `Hi there,

${inviterName} has invited you to join the ${teamName} team on Whirkplace for ${organizationName}.

Whirkplace helps teams build stronger connections through regular check-ins, team analytics, and win recognition.

Click the link below to accept the invitation:
${inviteLink}

We're excited to have you join the team!

Best regards,
The Whirkplace Team`,
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="width: 60px; height: 60px; background-color: #1b365d; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
          <div style="width: 24px; height: 24px; color: #84ae56;">💚</div>
        </div>
        <h1 style="color: #1b365d; margin: 0; font-size: 24px;">Whirkplace</h1>
      </div>
      
      <h2 style="color: #333; margin-bottom: 20px;">Team Invitation</h2>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">Hi there,</p>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
        <strong>${inviterName}</strong> has invited you to join the <strong>${teamName}</strong> team on Whirkplace for ${organizationName}.
      </p>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
        Whirkplace helps teams build stronger connections through regular check-ins, team analytics, and win recognition.
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${inviteLink}" style="background-color: #84ae56; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; display: inline-block; font-weight: bold;">
          Join Team
        </a>
      </div>
      
      <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
        We're excited to have you join the team!
      </p>
      
      <div style="text-align: center; padding-top: 30px; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 14px; margin: 0;">
          Best regards,<br>
          The Whirkplace Team
        </p>
      </div>
    </div>`
  })
};

// Helper functions for common email scenarios
export async function sendWelcomeEmail(
  userEmail: string, 
  userName: string, 
  organizationName: string
): Promise<boolean> {
  // Check if email service is configured
  if (!mailService) {
    console.log(`📧 Email sending disabled - would have sent welcome email to ${userEmail}`);
    return false;
  }
  
  const sender = tryGetSender();
  if (!sender) {
    console.log(`📧 Sender email not configured - cannot send welcome email to ${userEmail}`);
    return false;
  }
  
  const template = emailTemplates.welcome(userName, organizationName);
  
  return sendEmail({
    to: userEmail,
    from: `${sender.name} <${sender.email}>`,
    subject: template.subject,
    text: template.text,
    html: template.html
  });
}

export async function sendPasswordResetEmail(
  userEmail: string,
  userName: string,
  resetToken: string,
  organizationName: string,
  baseUrl?: string
): Promise<boolean> {
  // Check if email service is configured
  if (!mailService) {
    console.log(`📧 Email sending disabled - would have sent password reset email to ${userEmail}`);
    return false;
  }
  
  const sender = tryGetSender();
  if (!sender) {
    console.log(`📧 Sender email not configured - cannot send password reset email to ${userEmail}`);
    return false;
  }
  
  // Use dynamic base URL or default
  const resetBaseUrl = baseUrl || process.env.BASE_URL || 'https://app.whirkplace.com';
  const resetLink = `${resetBaseUrl}/reset-password?token=${resetToken}`;
  const template = emailTemplates.passwordReset(userName, resetLink, organizationName);
  
  return sendEmail({
    to: userEmail,
    from: `${sender.name} <${sender.email}>`,
    subject: template.subject,
    text: template.text,
    html: template.html
  });
}

export async function sendSlackPasswordSetupEmail(
  userEmail: string,
  userName: string,
  resetToken: string,
  organizationName: string,
  baseUrl?: string
): Promise<boolean> {
  // Check if email service is configured
  if (!mailService) {
    console.log(`📧 Email sending disabled - would have sent Slack password setup email to ${userEmail}`);
    return false;
  }
  
  const sender = tryGetSender();
  if (!sender) {
    console.log(`📧 Sender email not configured - cannot send Slack password setup email to ${userEmail}`);
    return false;
  }
  
  // Use dynamic base URL or default
  const resetBaseUrl = baseUrl || process.env.BASE_URL || 'https://app.whirkplace.com';
  const setupLink = `${resetBaseUrl}/reset-password?token=${resetToken}`;
  const template = emailTemplates.slackPasswordSetup(userName, organizationName, setupLink);
  
  return sendEmail({
    to: userEmail,
    from: `${sender.name} <${sender.email}>`,
    subject: template.subject,
    text: template.text,
    html: template.html
  });
}

export async function sendTeamInviteEmail(
  inviteeEmail: string,
  inviterName: string,
  teamName: string,
  organizationName: string,
  inviteToken: string,
  baseUrl?: string
): Promise<boolean> {
  // Check if email service is configured
  if (!mailService) {
    console.log(`📧 Email sending disabled - would have sent team invite email to ${inviteeEmail}`);
    return false;
  }
  
  const sender = tryGetSender();
  if (!sender) {
    console.log(`📧 Sender email not configured - cannot send team invite email to ${inviteeEmail}`);
    return false;
  }
  
  // Use dynamic base URL or default
  const inviteBaseUrl = baseUrl || process.env.BASE_URL || 'https://app.whirkplace.com';
  const inviteLink = `${inviteBaseUrl}/invite?token=${inviteToken}`;
  const template = emailTemplates.teamInvite(inviterName, teamName, organizationName, inviteLink);
  
  return sendEmail({
    to: inviteeEmail,
    from: `${sender.name} <${sender.email}>`,
    subject: template.subject,
    text: template.text,
    html: template.html
  });
}

// Email configuration status utility
export function getEmailConfiguration() {
  return {
    enabled: isEmailEnabled && !!mailService,
    configured: !!(senderEmail && process.env.SENDGRID_API_KEY),
    senderEmail: senderEmail || 'Not configured',
    senderName: senderName
  };
}