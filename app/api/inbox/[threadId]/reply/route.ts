import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { sendEmail, generateMessageId } from '@/lib/email/send';

type InboxMessageRow = {
  id: string;
  org_id: string;
  email_account_id: string;
  thread_id: string | null;
  message_id: string | null;
  subject: string | null;
  direction: string;
  lead_id: string | null;
  campaign_id: string | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get org_id
  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const body = await request.json();
  const { body: replyBody, subject: customSubject, to_email } = body ?? {};
  if (!replyBody || !to_email) {
    return NextResponse.json({ error: 'body and to_email required' }, { status: 400 });
  }

  // Fetch thread messages to get context
  const { data: messagesData, error: fetchErr } = await supabase
    .from('inbox_messages')
    .select('*')
    .eq('thread_id', threadId)
    .eq('org_id', orgId)
    .order('received_at', { ascending: true });

  if (fetchErr || !messagesData || messagesData.length === 0) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
  }

  const messages = messagesData as unknown as InboxMessageRow[];
  const firstMessage = messages[0];
  const lastInbound = messages.filter(m => m.direction === 'inbound').pop();
  
  // Get email account to send from
  const accountId = firstMessage.email_account_id;
  
  // Build subject
  let subject = customSubject;
  if (!subject && firstMessage.subject) {
    subject = firstMessage.subject.startsWith('Re:') 
      ? firstMessage.subject 
      : `Re: ${firstMessage.subject}`;
  }
  subject = subject || 'Re: ';

  // Build In-Reply-To and References
  const inReplyTo = lastInbound?.message_id || null;
  const references = messages
    .filter(m => m.message_id)
    .map(m => m.message_id!)
    .join(' ');

  // Generate new message ID
  const newMessageId = generateMessageId();

  // Send the email
  const result = await sendEmail({
    accountId,
    to: to_email,
    subject,
    bodyText: replyBody,
    messageId: newMessageId,
    inReplyTo: inReplyTo || undefined,
    references: references || undefined,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Send failed' }, { status: 500 });
  }

  // Fetch email account to get email address
  const { data: accountData } = await supabase
    .from('email_accounts')
    .select('email_address, display_name')
    .eq('id', accountId)
    .single();

  const account = accountData as { email_address: string; display_name: string | null } | null;

  // Insert outbound message into inbox_messages
  const insertRow = {
    org_id: orgId,
    email_account_id: accountId,
    lead_id: firstMessage.lead_id,
    campaign_id: firstMessage.campaign_id,
    direction: 'outbound',
    from_email: account?.email_address || '',
    from_name: account?.display_name || null,
    to_email,
    to_name: null,
    subject,
    body_text: replyBody,
    body_html: null,
    snippet: replyBody.slice(0, 200),
    message_id: result.messageId || newMessageId,
    in_reply_to: inReplyTo,
    references_header: references ? references.split(' ') : null,
    thread_id: threadId,
    received_at: new Date().toISOString(),
    is_read: true,
  };

  const { data: insertedMsg, error: insertErr } = await supabase
    .from('inbox_messages')
    .insert(insertRow as never)
    .select()
    .single();

  if (insertErr) {
    console.error('Failed to save outbound message:', insertErr);
    // Email was sent, but saving failed - still return success
    return NextResponse.json({
      ok: true,
      message: 'Reply sent (but failed to save to inbox)',
      thread_id: threadId,
      message_id: result.messageId,
    });
  }

  return NextResponse.json({
    ok: true,
    message: 'Reply sent',
    thread_id: threadId,
    message_id: result.messageId,
    inbox_message: insertedMsg,
  });
}
