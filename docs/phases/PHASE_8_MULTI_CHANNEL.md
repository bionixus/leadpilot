# Phase 8: Multi-Channel Messaging (WhatsApp & SMS)

> **Objective**: Implement WhatsApp and SMS messaging via Twilio, alongside existing email capabilities.

---

## 8.1 Overview

Multi-channel outreach allows users to reach leads via:
- **Email** (existing)
- **WhatsApp** (via Twilio or WhatsApp Business API)
- **SMS** (via Twilio)

This requires:
1. Messaging accounts management
2. Twilio integration
3. Unified message sending
4. Message status tracking

---

## 8.2 Encryption Setup

Before storing sensitive credentials, ensure encryption is working.

### File: `src/lib/encryption/index.ts`

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY = process.env.ENCRYPTION_KEY!;

if (!KEY) {
  throw new Error('ENCRYPTION_KEY environment variable is required');
}

// Derive a 32-byte key from the env variable
const getKey = (): Buffer => {
  return crypto.createHash('sha256').update(KEY).digest();
};

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }
  
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

---

## 8.3 Twilio Integration

### File: `src/lib/messaging/twilio.ts`

```typescript
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
    const from = options.channel === 'whatsapp' 
      ? `whatsapp:${fromNumber}` 
      : fromNumber;
    
    const to = options.channel === 'whatsapp'
      ? `whatsapp:${options.to}`
      : options.to;

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
  } catch (error: any) {
    console.error('Twilio send error:', error);
    return {
      success: false,
      error: error.message || 'Failed to send message',
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
  } catch (error: any) {
    return { error: error.message };
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
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
```

---

## 8.4 Messaging Accounts API

### File: `app/api/messaging-accounts/route.ts`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { encrypt } from '@/lib/encryption';
import { testTwilioConnection } from '@/lib/messaging/twilio';

// GET - List messaging accounts
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const { data, error } = await supabase
    .from('messaging_accounts')
    .select(`
      id,
      provider,
      channel,
      phone_number,
      display_name,
      daily_limit,
      messages_sent_today,
      is_active,
      connection_status,
      last_error,
      created_at
    `)
    .eq('org_id', userData!.org_id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST - Create new messaging account
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id, id')
    .eq('auth_id', user.id)
    .single();

  if (!userData?.org_id) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 });
  }

  const body = await request.json();
  const {
    provider = 'twilio',
    channel,
    phone_number,
    display_name,
    account_sid,
    auth_token,
    daily_limit = 100,
  } = body;

  // Validate required fields
  if (!channel || !phone_number || !account_sid || !auth_token) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  // Test connection
  const testResult = await testTwilioConnection(account_sid, auth_token);
  if (!testResult.success) {
    return NextResponse.json(
      { error: `Connection test failed: ${testResult.error}` },
      { status: 400 }
    );
  }

  // Encrypt credentials
  const encryptedSid = encrypt(account_sid);
  const encryptedToken = encrypt(auth_token);

  // Create account
  const { data, error } = await supabase
    .from('messaging_accounts')
    .insert({
      org_id: userData.org_id,
      user_id: userData.id,
      provider,
      channel,
      phone_number,
      display_name: display_name || phone_number,
      account_sid_encrypted: encryptedSid,
      auth_token_encrypted: encryptedToken,
      daily_limit,
      connection_status: 'connected',
      is_active: true,
    })
    .select(`
      id,
      provider,
      channel,
      phone_number,
      display_name,
      daily_limit,
      is_active,
      connection_status,
      created_at
    `)
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'This phone number is already connected' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
```

### File: `app/api/messaging-accounts/[id]/route.ts`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - Get single account
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const { data, error } = await supabase
    .from('messaging_accounts')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', userData!.org_id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Don't return encrypted credentials
  const { account_sid_encrypted, auth_token_encrypted, ...safeData } = data;
  return NextResponse.json(safeData);
}

// PATCH - Update account
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const body = await request.json();
  const allowedFields = ['display_name', 'daily_limit', 'is_active'];
  const updateData: any = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field];
    }
  }

  const { data, error } = await supabase
    .from('messaging_accounts')
    .update(updateData)
    .eq('id', params.id)
    .eq('org_id', userData!.org_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE - Remove account
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const { error } = await supabase
    .from('messaging_accounts')
    .delete()
    .eq('id', params.id)
    .eq('org_id', userData!.org_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

---

## 8.5 Unified Message Sending

### File: `src/lib/messaging/send.ts`

```typescript
import { sendEmail } from '@/lib/email/send';
import { sendWhatsApp, sendSMS, MessagingAccount } from '@/lib/messaging/twilio';

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface MessagePayload {
  channel: 'email' | 'whatsapp' | 'sms';
  to: string;  // Email address or phone number
  subject?: string;  // Email only
  body: string;
  
  // Account references
  emailAccountId?: string;
  messagingAccountId?: string;
}

// Send message through appropriate channel
export async function sendMessage(
  supabase: any,
  orgId: string,
  payload: MessagePayload
): Promise<SendResult> {
  const { channel, to, subject, body, emailAccountId, messagingAccountId } = payload;

  try {
    switch (channel) {
      case 'email': {
        if (!emailAccountId) {
          return { success: false, error: 'No email account specified' };
        }
        
        // Get email account
        const { data: emailAccount } = await supabase
          .from('email_accounts')
          .select('*')
          .eq('id', emailAccountId)
          .eq('org_id', orgId)
          .single();

        if (!emailAccount) {
          return { success: false, error: 'Email account not found' };
        }

        // Check daily limit
        if (emailAccount.emails_sent_today >= emailAccount.daily_send_limit) {
          return { success: false, error: 'Daily email limit reached' };
        }

        // Send email
        const result = await sendEmail({
          account: emailAccount,
          to,
          subject: subject || '',
          body,
        });

        if (result.success) {
          // Increment counter
          await supabase
            .from('email_accounts')
            .update({ emails_sent_today: emailAccount.emails_sent_today + 1 })
            .eq('id', emailAccountId);
        }

        return result;
      }

      case 'whatsapp':
      case 'sms': {
        let messagingAccount: MessagingAccount | undefined;

        if (messagingAccountId) {
          const { data } = await supabase
            .from('messaging_accounts')
            .select('*')
            .eq('id', messagingAccountId)
            .eq('org_id', orgId)
            .eq('channel', channel)
            .single();
          
          messagingAccount = data;
        } else {
          // Get default account for this channel
          const { data } = await supabase
            .from('messaging_accounts')
            .select('*')
            .eq('org_id', orgId)
            .eq('channel', channel)
            .eq('is_active', true)
            .single();
          
          messagingAccount = data;
        }

        if (messagingAccount) {
          // Check daily limit
          if (messagingAccount.messages_sent_today >= messagingAccount.daily_limit) {
            return { success: false, error: `Daily ${channel} limit reached` };
          }
        }

        // Send message
        const sendFn = channel === 'whatsapp' ? sendWhatsApp : sendSMS;
        const result = await sendFn(to, body, messagingAccount);

        if (result.success && messagingAccount) {
          // Increment counter
          await supabase
            .from('messaging_accounts')
            .update({
              messages_sent_today: messagingAccount.messages_sent_today + 1,
            })
            .eq('id', messagingAccount.id);
        }

        return {
          success: result.success,
          messageId: result.sid,
          error: result.error,
        };
      }

      default:
        return { success: false, error: `Unknown channel: ${channel}` };
    }
  } catch (error: any) {
    console.error('Send message error:', error);
    return { success: false, error: error.message };
  }
}

// Send message from a sequence step
export async function sendSequenceStep(
  supabase: any,
  message: any  // From messages table
): Promise<SendResult> {
  const { data: lead } = await supabase
    .from('leads')
    .select('email, phone, whatsapp')
    .eq('id', message.lead_id)
    .single();

  if (!lead) {
    return { success: false, error: 'Lead not found' };
  }

  // Determine recipient based on channel
  let to: string;
  switch (message.channel) {
    case 'email':
      to = lead.email;
      break;
    case 'whatsapp':
      to = lead.whatsapp || lead.phone;
      break;
    case 'sms':
      to = lead.phone;
      break;
    default:
      return { success: false, error: 'Unknown channel' };
  }

  if (!to) {
    return { success: false, error: `No ${message.channel} contact for lead` };
  }

  return sendMessage(supabase, message.org_id, {
    channel: message.channel,
    to,
    subject: message.subject,
    body: message.body_text,
    emailAccountId: message.email_account_id,
    messagingAccountId: message.messaging_account_id,
  });
}
```

---

## 8.6 Messaging Accounts UI

### File: `app/(dashboard)/messaging/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import {
  Phone,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  MessageSquare,
  Smartphone,
} from 'lucide-react';

interface MessagingAccount {
  id: string;
  provider: string;
  channel: 'whatsapp' | 'sms';
  phone_number: string;
  display_name: string;
  daily_limit: number;
  messages_sent_today: number;
  is_active: boolean;
  connection_status: string;
  created_at: string;
}

export default function MessagingAccountsPage() {
  const [accounts, setAccounts] = useState<MessagingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [formData, setFormData] = useState({
    channel: 'whatsapp' as 'whatsapp' | 'sms',
    phone_number: '',
    display_name: '',
    account_sid: '',
    auth_token: '',
    daily_limit: 100,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/messaging-accounts');
      const data = await res.json();
      setAccounts(data);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const addAccount = async () => {
    setError('');
    setAddingAccount(true);
    
    try {
      const res = await fetch('/api/messaging-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error);
        return;
      }

      setAccounts(prev => [data, ...prev]);
      setShowAddModal(false);
      setFormData({
        channel: 'whatsapp',
        phone_number: '',
        display_name: '',
        account_sid: '',
        auth_token: '',
        daily_limit: 100,
      });
    } catch (error: any) {
      setError(error.message);
    } finally {
      setAddingAccount(false);
    }
  };

  const deleteAccount = async (id: string) => {
    if (!confirm('Are you sure you want to remove this account?')) return;
    
    try {
      await fetch(`/api/messaging-accounts/${id}`, { method: 'DELETE' });
      setAccounts(prev => prev.filter(a => a.id !== id));
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await fetch(`/api/messaging-accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      });
      setAccounts(prev =>
        prev.map(a => (a.id === id ? { ...a, is_active: !isActive } : a))
      );
    } catch (error) {
      console.error('Failed to toggle:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messaging Accounts</h1>
          <p className="text-gray-500">Connect WhatsApp and SMS for multi-channel outreach</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Add Account
        </button>
      </div>

      {/* Accounts List */}
      {loading ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <Phone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-medium text-gray-900 mb-2">No messaging accounts</h3>
          <p className="text-gray-500 mb-4">
            Connect your WhatsApp or SMS provider to start multi-channel outreach
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="text-blue-600 hover:underline"
          >
            Add your first account
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Account
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Channel
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Usage Today
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((account) => (
                <tr key={account.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        account.channel === 'whatsapp' ? 'bg-green-100' : 'bg-blue-100'
                      }`}>
                        {account.channel === 'whatsapp' ? (
                          <MessageSquare className="w-5 h-5 text-green-600" />
                        ) : (
                          <Smartphone className="w-5 h-5 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {account.display_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {account.phone_number}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      account.channel === 'whatsapp'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {account.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      <span className="font-medium">{account.messages_sent_today}</span>
                      <span className="text-gray-500"> / {account.daily_limit}</span>
                    </div>
                    <div className="w-32 h-2 bg-gray-200 rounded-full mt-1">
                      <div
                        className={`h-2 rounded-full ${
                          account.messages_sent_today / account.daily_limit > 0.8
                            ? 'bg-red-500'
                            : 'bg-green-500'
                        }`}
                        style={{
                          width: `${Math.min(
                            (account.messages_sent_today / account.daily_limit) * 100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {account.is_active ? (
                      <span className="flex items-center gap-1 text-green-600 text-sm">
                        <CheckCircle className="w-4 h-4" />
                        Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-gray-500 text-sm">
                        <XCircle className="w-4 h-4" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => toggleActive(account.id, account.is_active)}
                        className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                      >
                        {account.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => deleteAccount(account.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">Add Messaging Account</h2>
            
            <div className="space-y-4">
              {/* Channel Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Channel
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData(f => ({ ...f, channel: 'whatsapp' }))}
                    className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 ${
                      formData.channel === 'whatsapp'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <MessageSquare className="w-6 h-6 text-green-600" />
                    <span className="text-sm font-medium">WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(f => ({ ...f, channel: 'sms' }))}
                    className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 ${
                      formData.channel === 'sms'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Smartphone className="w-6 h-6 text-blue-600" />
                    <span className="text-sm font-medium">SMS</span>
                  </button>
                </div>
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={formData.phone_number}
                  onChange={(e) => setFormData(f => ({ ...f, phone_number: e.target.value }))}
                  placeholder="+1234567890"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name (optional)
                </label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData(f => ({ ...f, display_name: e.target.value }))}
                  placeholder="My WhatsApp"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>

              {/* Twilio Credentials */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="text-sm font-medium text-gray-900">Twilio Credentials</div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Account SID
                  </label>
                  <input
                    type="text"
                    value={formData.account_sid}
                    onChange={(e) => setFormData(f => ({ ...f, account_sid: e.target.value }))}
                    placeholder="ACxxxxx..."
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Auth Token
                  </label>
                  <input
                    type="password"
                    value={formData.auth_token}
                    onChange={(e) => setFormData(f => ({ ...f, auth_token: e.target.value }))}
                    placeholder="Your auth token"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              {/* Daily Limit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Daily Message Limit
                </label>
                <input
                  type="number"
                  value={formData.daily_limit}
                  onChange={(e) => setFormData(f => ({ ...f, daily_limit: parseInt(e.target.value) }))}
                  min={1}
                  max={1000}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={addAccount}
                  disabled={addingAccount || !formData.phone_number || !formData.account_sid || !formData.auth_token}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {addingAccount ? 'Connecting...' : 'Connect Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## 8.7 Install Dependencies

```bash
npm install twilio
```

---

## 8.8 Verification Checklist

After completing Phase 8, verify:

- [ ] Encryption lib works (encrypt/decrypt)
- [ ] Twilio lib sends WhatsApp messages
- [ ] Twilio lib sends SMS messages
- [ ] GET `/api/messaging-accounts` returns list
- [ ] POST `/api/messaging-accounts` creates with test
- [ ] DELETE removes account
- [ ] UI shows accounts list
- [ ] Add modal validates credentials
- [ ] Daily limits are tracked and enforced
- [ ] Unified send function routes to correct channel

---

## Next Steps

Once Phase 8 is complete, proceed to:
- **Phase 9**: Inbox & Reply Classification
- **Phase 10**: Approval Workflows
