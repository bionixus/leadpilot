import twilio from 'twilio';
import { decrypt } from '@/lib/encryption';

// Types
export interface SendMessageResult {
  success: boolean;
  sid?: string;
  error?: string;
  status?: string;
}

export interface MessagingAccount {
  id: string;
  provider: string;
  channel: 'whatsapp' | 'sms';
  phone_number: string;
  account_sid_encrypted: string;
  auth_token_encrypted: string;
}

// Send a message via Twilio
export async function sendTwilioMessage(options: {
  to: string;
  body: string;
  channel: 'whatsapp' | 'sms';
  account?: MessagingAccount;
}): Promise<SendMessageResult> {
  try {
    // Use account credentials or platform defaults
    const accountSid = options.account
      ? decrypt(options.account.account_sid_encrypted)
      : process.env.TWILIO_ACCOUNT_SID;

    const authToken = options.account
      ? decrypt(options.account.auth_token_encrypted)
      : process.env.TWILIO_AUTH_TOKEN;

    const fromNumber = options.account?.phone_number || process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return { success: false, error: 'Missing Twilio credentials' };
    }

    const client = twilio(accountSid, authToken);

    // Format numbers for WhatsApp
    const from = options.channel === 'whatsapp' ? `whatsapp:${fromNumber}` : fromNumber;

    const to = options.channel === 'whatsapp' ? `whatsapp:${options.to}` : options.to;

    const message = await client.messages.create({
      body: options.body,
      from,
      to,
    });

    return {
      success: true,
      sid: message.sid,
      status: message.status,
    };
  } catch (error: unknown) {
    console.error('Twilio send error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// Send WhatsApp message
export async function sendWhatsApp(
  to: string,
  body: string,
  account?: MessagingAccount
): Promise<SendMessageResult> {
  return sendTwilioMessage({
    to,
    body,
    channel: 'whatsapp',
    account,
  });
}

// Send SMS
export async function sendSMS(
  to: string,
  body: string,
  account?: MessagingAccount
): Promise<SendMessageResult> {
  return sendTwilioMessage({
    to,
    body,
    channel: 'sms',
    account,
  });
}

// Get message status
export async function getMessageStatus(
  messageSid: string,
  account?: MessagingAccount
): Promise<{ status: string } | { error: string }> {
  try {
    const accountSid = account
      ? decrypt(account.account_sid_encrypted)
      : process.env.TWILIO_ACCOUNT_SID;

    const authToken = account
      ? decrypt(account.auth_token_encrypted)
      : process.env.TWILIO_AUTH_TOKEN;

    const client = twilio(accountSid!, authToken!);
    const message = await client.messages(messageSid).fetch();

    return { status: message.status };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { error: errorMessage };
  }
}

// Test connection
export async function testTwilioConnection(
  accountSid: string,
  authToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = twilio(accountSid, authToken);
    await client.api.accounts(accountSid).fetch();
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Connection failed';
    return { success: false, error: errorMessage };
  }
}
