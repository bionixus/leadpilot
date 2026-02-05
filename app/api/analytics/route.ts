import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30', 10);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString();

  // Fetch key metrics
  const [
    leadsResult,
    campaignsResult,
    emailsResult,
    sequencesResult,
    inboxResult,
  ] = await Promise.all([
    // Total leads
    supabase
      .from('leads')
      .select('id, status, created_at', { count: 'exact' })
      .eq('org_id', orgId),

    // Campaigns
    supabase
      .from('campaigns')
      .select('id, status, stats, created_at')
      .eq('org_id', orgId),

    // Emails sent in time period
    supabase
      .from('emails')
      .select('id, status, sent_at, created_at')
      .eq('org_id', orgId)
      .gte('created_at', startDateStr),

    // Sequences
    supabase
      .from('sequences')
      .select('id, created_at', { count: 'exact' })
      .eq('org_id', orgId),

    // Inbox messages (replies)
    supabase
      .from('inbox_messages')
      .select('id, direction, classification, received_at')
      .eq('org_id', orgId)
      .eq('direction', 'inbound')
      .gte('received_at', startDateStr),
  ]);

  type LeadRow = { id: string; status: string; created_at: string };
  type CampaignRow = { id: string; status: string; stats: unknown; created_at: string };
  type EmailRow = { id: string; status: string; sent_at: string | null; created_at: string };
  type SequenceRow = { id: string; created_at: string };
  type InboxRow = { id: string; direction: string; classification: string | null; received_at: string | null };

  const leads = (leadsResult.data ?? []) as LeadRow[];
  const campaigns = (campaignsResult.data ?? []) as CampaignRow[];
  const emails = (emailsResult.data ?? []) as EmailRow[];
  const sequences = (sequencesResult.data ?? []) as SequenceRow[];
  const inboxMessages = (inboxResult.data ?? []) as InboxRow[];

  // Calculate overview metrics
  const totalLeads = leadsResult.count ?? leads.length;
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const totalCampaigns = campaigns.length;

  // Calculate emails stats
  const emailsSent = emails.filter(e => e.status === 'sent' || e.status === 'delivered' || e.status === 'opened').length;
  const emailsScheduled = emails.filter(e => e.status === 'scheduled').length;

  // Calculate reply stats
  const totalReplies = inboxMessages.length;
  const interestedReplies = inboxMessages.filter(m => (m as { classification?: string }).classification === 'interested').length;
  const questionReplies = inboxMessages.filter(m => (m as { classification?: string }).classification === 'question').length;

  // Reply rate
  const replyRate = emailsSent > 0 ? Math.round((totalReplies / emailsSent) * 100) : 0;

  // Lead status breakdown
  const leadStatusCounts: Record<string, number> = {};
  for (const lead of leads) {
    const status = lead.status || 'new';
    leadStatusCounts[status] = (leadStatusCounts[status] || 0) + 1;
  }

  const leadStatusData = Object.entries(leadStatusCounts).map(([status, count]) => ({
    status,
    count,
  }));

  // Emails over time (group by day)
  const emailsByDay: Record<string, number> = {};
  for (const email of emails) {
    if (email.sent_at) {
      const day = email.sent_at.slice(0, 10);
      emailsByDay[day] = (emailsByDay[day] || 0) + 1;
    }
  }

  // Replies over time
  const repliesByDay: Record<string, number> = {};
  for (const msg of inboxMessages) {
    if (msg.received_at) {
      const day = msg.received_at.slice(0, 10);
      repliesByDay[day] = (repliesByDay[day] || 0) + 1;
    }
  }

  // Build time series data
  const timeSeriesData: Array<{ date: string; emails: number; replies: number }> = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    timeSeriesData.push({
      date: dateStr,
      emails: emailsByDay[dateStr] || 0,
      replies: repliesByDay[dateStr] || 0,
    });
  }

  // Campaign performance
  const campaignPerformance = campaigns.map(c => {
    const stats = c.stats as {
      total_leads?: number;
      emails_sent?: number;
      replies_received?: number;
      positive_replies?: number;
    } | null;

    return {
      id: c.id,
      status: c.status,
      leads: stats?.total_leads ?? 0,
      sent: stats?.emails_sent ?? 0,
      replies: stats?.replies_received ?? 0,
      positive: stats?.positive_replies ?? 0,
      replyRate: stats?.emails_sent && stats.emails_sent > 0
        ? Math.round(((stats.replies_received ?? 0) / stats.emails_sent) * 100)
        : 0,
    };
  });

  return NextResponse.json({
    overview: {
      totalLeads,
      activeCampaigns,
      totalCampaigns,
      emailsSent,
      emailsScheduled,
      totalReplies,
      interestedReplies,
      questionReplies,
      replyRate,
      totalSequences: sequencesResult.count ?? sequences.length,
    },
    leadStatusData,
    timeSeriesData,
    campaignPerformance,
  });
}
