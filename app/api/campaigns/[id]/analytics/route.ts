import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
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

  // Verify campaign belongs to org
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, org_id, stats')
    .eq('id', campaignId)
    .single();

  if (!campaign || (campaign as { org_id?: string }).org_id !== orgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Fetch lead statistics
  const { data: leads } = await supabase
    .from('leads')
    .select('id, status')
    .eq('campaign_id', campaignId);

  // Fetch email statistics
  const { data: emails } = await supabase
    .from('emails')
    .select('id, status, sent_at, opened_at')
    .eq('campaign_id', campaignId);

  // Fetch inbox messages (replies)
  const { data: inboxMessages } = await supabase
    .from('inbox_messages')
    .select('id, direction, classification, received_at')
    .eq('campaign_id', campaignId)
    .eq('direction', 'inbound');

  const leadsArray = leads ?? [];
  const emailsArray = emails ?? [];
  const repliesArray = inboxMessages ?? [];

  // Calculate overview stats
  const totalLeads = leadsArray.length;
  const contacted = leadsArray.filter(l => 
    ['contacted', 'active', 'replied', 'interested', 'not_interested', 'meeting_booked', 'converted'].includes((l as { status: string }).status)
  ).length;
  const replied = leadsArray.filter(l => 
    ['replied', 'interested', 'not_interested', 'meeting_booked', 'converted'].includes((l as { status: string }).status)
  ).length;
  const interested = leadsArray.filter(l => 
    ['interested', 'meeting_booked', 'converted'].includes((l as { status: string }).status)
  ).length;
  const notInterested = leadsArray.filter(l => 
    (l as { status: string }).status === 'not_interested'
  ).length;
  const bounced = leadsArray.filter(l => 
    (l as { status: string }).status === 'bounced'
  ).length;

  const emailsSent = emailsArray.filter(e => 
    ['sent', 'delivered', 'opened'].includes((e as { status: string }).status)
  ).length;
  const emailsOpened = emailsArray.filter(e => 
    (e as { opened_at?: string | null }).opened_at != null
  ).length;

  const replyRate = emailsSent > 0 ? Math.round((replied / emailsSent) * 100) : 0;
  const openRate = emailsSent > 0 ? Math.round((emailsOpened / emailsSent) * 100) : 0;

  // Build funnel data
  const funnel = [
    { stage: 'Total Leads', count: totalLeads, color: '#94a3b8' },
    { stage: 'Contacted', count: contacted, color: '#60a5fa' },
    { stage: 'Replied', count: replied, color: '#a78bfa' },
    { stage: 'Interested', count: interested, color: '#4ade80' },
  ];

  // Build timeline data (last 30 days)
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sentByDay: Record<string, number> = {};
  const repliesByDay: Record<string, number> = {};

  for (const email of emailsArray) {
    const sentAt = (email as { sent_at?: string | null }).sent_at;
    if (sentAt) {
      const day = sentAt.slice(0, 10);
      sentByDay[day] = (sentByDay[day] || 0) + 1;
    }
  }

  for (const reply of repliesArray) {
    const receivedAt = (reply as { received_at?: string | null }).received_at;
    if (receivedAt) {
      const day = receivedAt.slice(0, 10);
      repliesByDay[day] = (repliesByDay[day] || 0) + 1;
    }
  }

  const timeline: Array<{ date: string; sent: number; replies: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    timeline.push({
      date: dateStr,
      sent: sentByDay[dateStr] || 0,
      replies: repliesByDay[dateStr] || 0,
    });
  }

  return NextResponse.json({
    overview: {
      totalLeads,
      contacted,
      replied,
      interested,
      notInterested,
      bounced,
      emailsSent,
      emailsOpened,
      replyRate,
      openRate,
    },
    timeline,
    funnel,
  });
}
