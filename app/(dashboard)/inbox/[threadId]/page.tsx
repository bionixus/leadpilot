import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import ThreadDetail from './ThreadDetail';

export const metadata = { title: 'Thread | LeadPilot' };

type InboxMessageRow = {
  id: string;
  thread_id: string | null;
  from_email: string;
  from_name: string | null;
  to_email: string;
  to_name: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  classification: string | null;
  classification_confidence: number | null;
  is_read: boolean;
  received_at: string | null;
  direction: string;
  lead_id: string | null;
  campaign_id: string | null;
  email_account_id: string;
  message_id: string | null;
};

type LeadRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  company_name: string | null;
  status: string;
};

type CampaignRow = {
  id: string;
  name: string;
};

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/app');

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) redirect('/app');

  // Fetch messages in thread
  const { data: messagesData, error } = await supabase
    .from('inbox_messages')
    .select('*')
    .eq('thread_id', threadId)
    .eq('org_id', orgId)
    .order('received_at', { ascending: true });

  if (error || !messagesData || messagesData.length === 0) {
    notFound();
  }

  const messages = messagesData as unknown as InboxMessageRow[];
  const firstMessage = messages[0];

  // Mark unread messages as read
  const unreadIds = messages.filter(m => !m.is_read).map(m => m.id);
  if (unreadIds.length > 0) {
    await supabase
      .from('inbox_messages')
      .update({ is_read: true } as never)
      .in('id', unreadIds);
  }

  // Fetch lead if exists
  let lead: LeadRow | null = null;
  if (firstMessage.lead_id) {
    const { data: leadData } = await supabase
      .from('leads')
      .select('id, first_name, last_name, email, company_name, status')
      .eq('id', firstMessage.lead_id)
      .single();
    lead = leadData as unknown as LeadRow | null;
  }

  // Fetch campaign if exists
  let campaign: CampaignRow | null = null;
  if (firstMessage.campaign_id) {
    const { data: campaignData } = await supabase
      .from('campaigns')
      .select('id, name')
      .eq('id', firstMessage.campaign_id)
      .single();
    campaign = campaignData as unknown as CampaignRow | null;
  }

  // Get sender email account info for reply
  const { data: accountData } = await supabase
    .from('email_accounts')
    .select('id, email_address, display_name')
    .eq('id', firstMessage.email_account_id)
    .single();

  const account = accountData as { id: string; email_address: string; display_name: string | null } | null;

  // Build message objects for client
  const messageItems = messages.map(m => ({
    id: m.id,
    fromEmail: m.from_email,
    fromName: m.from_name,
    toEmail: m.to_email,
    toName: m.to_name,
    subject: m.subject,
    bodyText: m.body_text,
    bodyHtml: m.body_html,
    classification: m.classification,
    classificationConfidence: m.classification_confidence,
    receivedAt: m.received_at,
    direction: m.direction as 'inbound' | 'outbound',
    messageId: m.message_id,
  }));

  // Determine reply to address (the other party)
  const lastInbound = messages.filter(m => m.direction === 'inbound').pop();
  const replyToEmail = lastInbound?.from_email || firstMessage.from_email;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <ThreadDetail
        threadId={threadId}
        messages={messageItems}
        lead={lead}
        campaign={campaign}
        account={account}
        replyToEmail={replyToEmail}
        subject={firstMessage.subject}
      />
    </div>
  );
}
