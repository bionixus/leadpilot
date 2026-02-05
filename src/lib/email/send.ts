import nodemailer from 'nodemailer';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/encryption';

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
 * Refresh OAuth access token if expired.
 * Returns the new access token or throws if refresh fails.
 */
async function refreshOAuthToken(
  account: EmailAccountRow,
  supabase: Awaited<ReturnType<typeof createSupabaseAdminClient>>
): Promise<string> {
  const refreshEnc = account.oauth_refresh_token_encrypted;
  if (!refreshEnc) throw new Error('No refresh token available');

  const refreshToken = decrypt(refreshEnc);
  const clientId =
    account.provider === 'gmail'
      ? process.env.GOOGLE_CLIENT_ID
      : process.env.MICROSOFT_CLIENT_ID;
  const clientSecret =
    account.provider === 'gmail'
      ? process.env.GOOGLE_CLIENT_SECRET
      : process.env.MICROSOFT_CLIENT_SECRET;

  if (!clientId || !clientSecret) throw new Error('OAuth not configured');

  const tokenUrl =
    account.provider === 'gmail'
      ? 'https://oauth2.googleapis.com/token'
      : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token refresh failed: ${errText}`);
  }

  const tokens = (await res.json()) as { access_token?: string; expires_in?: number };
  const accessToken = tokens.access_token;
  if (!accessToken) throw new Error('No access token in refresh response');

  // Update stored tokens
  const { encrypt } = await import('@/lib/encryption');
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  await supabase
    .from('email_accounts')
    .update({
      oauth_access_token_encrypted: encrypt(accessToken),
      oauth_token_expires_at: expiresAt,
    } as never)
    .eq('id', account.id);

  return accessToken;
}

/**
 * Get a valid OAuth access token, refreshing if needed.
 */
async function getOAuthAccessToken(
  account: EmailAccountRow,
  supabase: Awaited<ReturnType<typeof createSupabaseAdminClient>>
): Promise<string> {
  const accessEnc = account.oauth_access_token_encrypted;
  const expiresAt = account.oauth_token_expires_at;

  // Check if we have a valid token
  if (accessEnc) {
    const now = new Date();
    const expires = expiresAt ? new Date(expiresAt) : null;
    // Add 60s buffer
    if (!expires || expires > new Date(now.getTime() + 60_000)) {
      try {
        return decrypt(accessEnc);
      } catch {
        // Decryption failed, try refresh
      }
    }
  }

  // Need to refresh
  return refreshOAuthToken(account, supabase);
}

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
      const accessToken = await getOAuthAccessToken(acc, supabase);
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
      const accessToken = await getOAuthAccessToken(acc, supabase);
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
