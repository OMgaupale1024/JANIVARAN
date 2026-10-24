import { after } from 'next/server';
import { Complaint, ComplaintStatus } from '@/types/backend';
import nodemailer from 'nodemailer';

// Email interface
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

// Outcome of one delivery attempt, recorded in logs (and on the user for the welcome email)
export type DeliveryStatus = 'sent' | 'skipped' | 'failed';

// What an API response can honestly say: 'queued' = will be attempted after the response
// (best effort), 'skipped' = no email will be sent. Never 'sent': delivery happens later.
export type NotificationStatus = 'queued' | 'skipped';

// Bound every SMTP phase and the whole send so a slow server cannot pin a function
const SMTP_TIMEOUTS = { dnsTimeout: 5_000, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 };
const SEND_DEADLINE_MS = 30_000;

// Reserved names (RFC 2606/6761), e.g. the demo accounts, can never receive mail
const UNDELIVERABLE = /@(?:.+\.)?(?:test|example|invalid|localhost)$|@example\.(?:com|net|org)$/i;

// Where a message would go, or null when no email should be attempted
function recipient(to: string): string | null {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  // EMAIL_OVERRIDE_TO routes every message to a test inbox (never real citizens)
  const target = process.env.EMAIL_OVERRIDE_TO || to;
  return target && !UNDELIVERABLE.test(target) ? target : null;
}

// Escape user-supplied text before interpolating it into email HTML
function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
}

const ref = (complaint: Complaint) => esc(complaint.trackingId || complaint.id);

// Send one email now; never throws
export async function deliverEmail(email: EmailMessage): Promise<DeliveryStatus> {
  const to = recipient(email.to);
  if (!to) {
    console.warn('⚠️ [EMAIL] Not sent (SMTP not configured or undeliverable address):', email.subject);
    return 'skipped';
  }

  // Created per send so it always reflects the current configuration
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    ...SMTP_TIMEOUTS,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const info = await Promise.race([
      transporter.sendMail({
        from: `"JanNivaran" <${process.env.SMTP_USER}>`, // sender address
        to,
        subject: email.subject,
        html: email.html,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('SMTP send timed out'), { code: 'ETIMEDOUT' })), SEND_DEADLINE_MS);
      }),
    ]);
    console.log(`📧 [EMAIL SENT] MessageId: ${info.messageId}`);
    return 'sent';
  } catch (error) {
    // Codes only: SMTP errors can echo addresses and server responses
    const { code, responseCode, command } = error as { code?: string; responseCode?: number; command?: string };
    console.error('❌ [EMAIL FAILED]', { code, responseCode, command, subject: email.subject });
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Deliver an email after the response has been sent (Next.js after(), which
 * Vercel keeps alive via waitUntil). Best effort: the outcome is logged and
 * passed to onResult, and the caller can only report 'queued' or 'skipped'.
 */
export function queueEmail(email: EmailMessage, onResult?: (status: DeliveryStatus) => Promise<unknown>): NotificationStatus {
  if (!recipient(email.to)) return 'skipped';
  after(async () => {
    const status = await deliverEmail(email);
    await onResult?.(status);
    return status;
  });
  return 'queued';
}


// Email template wrapper
function createEmailTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #1e3a2e 0%, #2d5a3d 100%); color: #ffffff; padding: 32px 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .content { padding: 32px 24px; }
    .status-badge { display: inline-block; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-submitted { background-color: #dbeafe; color: #1e40af; }
    .badge-in-progress { background-color: #fef3c7; color: #92400e; }
    .badge-escalated { background-color: #fee2e2; color: #991b1b; }
    .badge-resolved { background-color: #d1fae5; color: #065f46; }
    .info-box { background-color: #f1f5f9; border-left: 4px solid #2d5a3d; padding: 16px; margin: 20px 0; border-radius: 4px; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .info-row:last-child { border-bottom: none; }
    .info-label { font-weight: 600; color: #475569; }
    .info-value { color: #1e293b; }
    .warning-box { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px; }
    .danger-box { background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0; border-radius: 4px; }
    .footer { background-color: #f8fafc; padding: 24px; text-align: center; font-size: 14px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .button { display: inline-block; padding: 12px 24px; background-color: #2d5a3d; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏛️ JanNivaran</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">Citizen Grievance Redressal Platform</p>
    </div>
    ${content}
    <div class="footer">
      <p>This is an automated notification from JanNivaran.</p>
      <p style="margin-top: 8px;">For support, contact: support@jannivaran.gov.in</p>
    </div>
  </div>
</body>
</html>
  `;
}

// Get status badge HTML
function getStatusBadge(status: ComplaintStatus | string): string {
  const badges: Record<string, string> = {
    'pending': '<span class="status-badge badge-submitted">Pending</span>',
    'under-review': '<span class="status-badge badge-submitted">Under Review</span>',
    'in-progress': '<span class="status-badge badge-in-progress">In Progress</span>',
    'escalated': '<span class="status-badge badge-escalated">Escalated</span>',
    'resolved': '<span class="status-badge badge-resolved">Resolved</span>',
    'closed': '<span class="status-badge badge-resolved">Closed</span>',
  };
  return badges[status] || `<span class="status-badge">${esc(status)}</span>`;
}

// 0. Welcome Email
export function welcomeEmail(
  user: { displayName: string; email: string }
): EmailMessage {
  const content = `
    <div class="content">
      <h2 style="color: #2d5a3d; margin-top: 0;">👋 Welcome to JanNivaran!</h2>
      <p>Dear ${esc(user.displayName)},</p>
      <p>Your account has been successfully created. You can now use the JanNivaran portal to file grievances, track their status, and engage with the administration.</p>
      
      <div class="info-box">
        <p><strong>What you can do:</strong></p>
        <ul style="margin: 0; padding-left: 20px;">
          <li>File new complaints with photo evidence</li>
          <li>Track real-time status updates</li>
          <li>Receive notifications on progress</li>
        </ul>
      </div>

      <p style="margin-top: 24px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/file-complaint" class="button">File a Complaint</a>
      </p>
    </div>
  `;

  return {
    to: user.email,
    subject: `Welcome to JanNivaran - Registration Successful`,
    html: createEmailTemplate(content),
  };
}

// 1. Complaint Submitted Email
export function complaintSubmittedEmail(
  complaint: Complaint,
  userEmail: string
): EmailMessage {
  const content = `
    <div class="content">
      <h2 style="color: #2d5a3d; margin-top: 0;">✅ Your Complaint Has Been Submitted</h2>
      <p>Thank you for reaching out. Your grievance has been successfully registered in our system.</p>
      
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Complaint ID:</span>
          <span class="info-value"><strong>${ref(complaint)}</strong></span>
        </div>
        <div class="info-row">
          <span class="info-label">Category:</span>
          <span class="info-value">${esc(complaint.category)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Status:</span>
          <span class="info-value">${getStatusBadge(complaint.status)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Priority:</span>
          <span class="info-value">${esc(complaint.priority)}</span>
        </div>
      </div>

      <h3>What Happens Next?</h3>
      <p>Your complaint is being routed to the appropriate department. You will receive updates via email as your complaint progresses.</p>
      
      <p style="margin-top: 24px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/citizen/dashboard" class="button">View Complaint Status</a>
      </p>
    </div>
  `;

  return {
    to: userEmail,
    subject: `Complaint #${complaint.trackingId || complaint.id} - Successfully Submitted`,
    html: createEmailTemplate(content),
  };
}

// 2. Status Change Email
export function statusChangeEmail(
  complaint: Complaint,
  userEmail: string,
  oldStatus: ComplaintStatus,
  newStatus: ComplaintStatus
): EmailMessage {
  const content = `
    <div class="content">
      <h2 style="color: #2d5a3d; margin-top: 0;">📊 Complaint Status Updated</h2>
      <p>The status of your complaint has been updated.</p>
      
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Complaint ID:</span>
          <span class="info-value"><strong>${ref(complaint)}</strong></span>
        </div>
        <div class="info-row">
          <span class="info-label">Previous Status:</span>
          <span class="info-value">${getStatusBadge(oldStatus)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">New Status:</span>
          <span class="info-value">${getStatusBadge(newStatus)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Time of Update:</span>
          <span class="info-value">${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Department:</span>
          <span class="info-value">${esc(complaint.assignedDepartment || 'Not assigned')}</span>
        </div>
      </div>

      ${newStatus === 'resolved' ? `
        <div style="background-color: #d1fae5; padding: 20px; border-radius: 8px; margin: 24px 0; text-align: center; border: 1px solid #a7f3d0;">
          <h3 style="color: #065f46; margin-top: 0; font-size: 18px;">🎉 Issue Resolved!</h3>
          <p style="color: #047857; margin-bottom: 20px;">We hope we were able to address your concern satisfactorily.</p>
          
          <p style="font-weight: 600; color: #1e293b; margin-bottom: 12px;">How did we do?</p>
          <div style="display: flex; justify-content: center; gap: 12px; margin-bottom: 16px;">
             <!-- Simple Mailto Feedback Link -->
             <a href="mailto:support@jannivaran.gov.in?subject=Feedback: Complaint %23${encodeURIComponent(complaint.trackingId || complaint.id)}&body=I would like to share the following feedback regarding the resolution of my complaint..." 
                style="background-color: #059669; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">
                Rate Service & Share Feedback
             </a>
          </div>
          <p style="font-size: 12px; color: #64748b; margin-top: 12px;">Your feedback helps us improve our services for everyone.</p>
        </div>
      ` : ''}

      <p style="margin-top: 24px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/citizen/dashboard" class="button">View Details</a>
      </p>
    </div>
  `;

  return {
    to: userEmail,
    subject: `Complaint #${complaint.trackingId || complaint.id} - Status Updated to ${newStatus}`,
    html: createEmailTemplate(content),
  };
}

// 3. Complaint Routed Email (department comes from the stored complaint)
export function complaintRoutedEmail(
  complaint: Complaint,
  userEmail: string
): EmailMessage {
  const department = complaint.assignedDepartment || complaint.department;
  const content = `
    <div class="content">
      <h2 style="color: #2d5a3d; margin-top: 0;">🎯 Complaint Routed to Department</h2>
      <p>Your complaint has been assigned to the appropriate department for resolution.</p>
      
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Complaint ID:</span>
          <span class="info-value"><strong>${ref(complaint)}</strong></span>
        </div>
        <div class="info-row">
          <span class="info-label">Assigned Department:</span>
          <span class="info-value"><strong>${esc(department)}</strong></span>
        </div>
        <div class="info-row">
          <span class="info-label">Status:</span>
          <span class="info-value">${getStatusBadge(complaint.status)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Priority:</span>
          <span class="info-value">${esc(complaint.priority)}</span>
        </div>
      </div>

      <p>The ${esc(department)} will review your complaint and take appropriate action. You will be notified of any status changes.</p>
      
      <p style="margin-top: 24px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/citizen/dashboard" class="button">Track Progress</a>
      </p>
    </div>
  `;

  return {
    to: userEmail,
    subject: `Complaint #${complaint.trackingId || complaint.id} - Assigned to ${department}`,
    html: createEmailTemplate(content),
  };
}
