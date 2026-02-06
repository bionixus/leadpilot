import nodemailer from 'nodemailer';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/encryption';
import { getValidOAuthToken } from '@/lib/email/oauth';

export type SendEmailOptions = {
  accountId: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  inReplyTo?: string;
  references?: string;
  messageId?: string; // Optional custom Message-ID
};

export type SendEmailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

type EmailAccountRow = {
  id: string;
  email_address: string;
  display_name: string | null;
  provider: string;
  oauth_access_token_encrypted: string | null;
  oauth_refresh_token_encrypted: string | null;
  oauth_token_expires_at: string | null;
  credentials_encrypted: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
};

/**
 * Send an email via the specified email account.
 * Supports Gmail/Outlook OAuth and custom SMTP.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { accountId, to, subject, bodyText, bodyHtml, inReplyTo, references, messageId } = options;

  const supabase = createSupabaseAdminClient();
  const { data: account, error: fetchError } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (fetchError || !account) {
    return { success: false, error: 'Email account not found' };
  }

  const acc = account as unknown as EmailAccountRow;

  try {
    let transport: nodemailer.Transporter;

    if (acc.provider === 'gmail') {
      const accessToken = await getValidOAuthToken(acc);
      transport = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: acc.email_address,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          accessToken,
        },
      });
    } else if (acc.provider === 'outlook') {
      const accessToken = await getValidOAuthToken(acc);
      // For Outlook, use SMTP with XOAUTH2
      transport = nodemailer.createTransport({
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
        auth: {
          type: 'OAuth2',
          user: acc.email_address,
          clientId: process.env.MICROSOFT_CLIENT_ID,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
          accessToken,
        },
      });
    } else if (acc.provider === 'custom') {
      const credEnc = acc.credentials_encrypted;
      if (!credEnc) {
        return { success: false, error: 'No credentials for custom account' };
      }
      const smtpHost = acc.smtp_host;
      const smtpPort = acc.smtp_port ?? 587;
      const smtpSecure = acc.smtp_secure !== false;
      if (!smtpHost) {
        return { success: false, error: 'No SMTP host configured' };
      }
      const cred = JSON.parse(decrypt(credEnc)) as { username: string; password: string };
      transport = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: cred.username, pass: cred.password },
      });
    } else {
      return { success: false, error: `Unknown provider: ${acc.provider}` };
    }

    // Build from address
    const fromAddress = acc.display_name
      ? `"${acc.display_name}" <${acc.email_address}>`
      : acc.email_address;

    // Build mail options
    const mailOptions: nodemailer.SendMailOptions = {
      from: fromAddress,
      to,
      subject,
      text: bodyText,
      html: bodyHtml,
    };

    // Set custom Message-ID if provided
    if (messageId) {
      mailOptions.messageId = messageId;
    }

    // Threading headers
    if (inReplyTo) {
      mailOptions.inReplyTo = inReplyTo;
    }
    if (references) {
      mailOptions.references = references;
    }

    const result = await transport.sendMail(mailOptions);

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    console.error('sendEmail error:', message);
    return { success: false, error: message };
  }
}

/**
 * Generate a unique Message-ID for an outbound email.
 */
export function generateMessageId(domain?: string): string {
  const uuid = crypto.randomUUID();
  const d = domain ?? 'leadpilot.local';
  return `<${uuid}@${d}>`;
}
