import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import InboxList from './InboxList';

export const metadata = { title: 'Inbox | LeadPilot' };

type InboxMessageRow = {
  id: string;
  thread_id: string | null;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  snippet: string | null;
  classification: string | null;
  is_read: boolean;
  is_starred: boolean;
  received_at: string | null;
  lead_id: string | null;
  campaign_id: string | null;
  direction: string;
};

type LeadRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  company_name: string | null;
};

type CampaignRow = {
  id: string;
  name: string;
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/app');

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) redirect('/app');

  const params = await searchParams;
  const classificationFilter = typeof params.classification === 'string' ? params.classification : null;
  const isReadFilter = params.is_read === 'false' ? false : params.is_read === 'true' ? true : null;

  // Fetch messages
  let query = supabase
    .from('inbox_messages')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_archived', false)
    .order('received_at', { ascending: false });

  if (classificationFilter) {
    query = query.eq('classification', classificationFilter);
  }
  if (isReadFilter !== null) {
    query = query.eq('is_read', isReadFilter);
  }

  const { data: messagesData } = await query;
  const messages = (messagesData ?? []) as unknown as InboxMessageRow[];

  // Group by thread_id, keep only the latest message per thread
  const threadsMap = new Map<string, InboxMessageRow>();
  for (const msg of messages) {
    const tid = msg.thread_id ?? msg.id;
    if (!threadsMap.has(tid)) {
      threadsMap.set(tid, msg);
    }
  }
  const threads = Array.from(threadsMap.values());

  // Fetch related leads
  const leadIds = Array.from(new Set(threads.filter(t => t.lead_id).map(t => t.lead_id!)));
  let leadsMap = new Map<string, LeadRow>();
  if (leadIds.length > 0) {
    const { data: leadsData } = await supabase
      .from('leads')
      .select('id, first_name, last_name, email, company_name')
      .in('id', leadIds);
    leadsMap = new Map(
      ((leadsData ?? []) as unknown as LeadRow[]).map(l => [l.id, l])
    );
  }

  // Fetch related campaigns
  const campaignIds = Array.from(new Set(threads.filter(t => t.campaign_id).map(t => t.campaign_id!)));
  let campaignsMap = new Map<string, CampaignRow>();
  if (campaignIds.length > 0) {
    const { data: campaignsData } = await supabase
      .from('campaigns')
      .select('id, name')
      .in('id', campaignIds);
    campaignsMap = new Map(
      ((campaignsData ?? []) as unknown as CampaignRow[]).map(c => [c.id, c])
    );
  }

  // Count unread
  const { count: unreadCount } = await supabase
    .from('inbox_messages')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('is_read', false)
    .eq('is_archived', false);

  // Build thread objects with lead/campaign info
  const threadItems = threads.map(t => ({
    id: t.id,
    threadId: t.thread_id ?? t.id,
    fromEmail: t.from_email,
    fromName: t.from_name,
    subject: t.subject,
    snippet: t.snippet,
    classification: t.classification,
    isRead: t.is_read,
    isStarred: t.is_starred,
    receivedAt: t.received_at,
    direction: t.direction,
    lead: t.lead_id ? leadsMap.get(t.lead_id) || null : null,
    campaign: t.campaign_id ? campaignsMap.get(t.campaign_id) || null : null,
  }));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Inbox</h1>
          <p className="text-sm text-gray-500">
            {unreadCount ?? 0} unread messages
          </p>
        </div>
        <div className="flex gap-2">
          <select
            className="px-3 py-2 border rounded-lg text-sm bg-white"
            defaultValue={classificationFilter || ''}
          >
            <option value="">All</option>
            <option value="interested">Interested</option>
            <option value="question">Questions</option>
            <option value="not_interested">Not Interested</option>
            <option value="bounce">Bounced</option>
            <option value="out_of_office">Out of Office</option>
          </select>
        </div>
      </div>

      <InboxList threads={threadItems} />
    </div>
  );
}
