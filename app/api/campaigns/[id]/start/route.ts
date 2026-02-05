import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { computeScheduleTimes } from '@/lib/email/schedule';
import { generateMessageId } from '@/lib/email/send';
import type { CampaignSettings, SequenceEmail } from '@/types/database';

type SequenceRow = {
  id: string;
  lead_id: string;
  emails: SequenceEmail[];
};

type LeadRow = {
  id: string;
  email: string;
  campaign_id: string | null;
};

type CampaignRow = {
  id: string;
  org_id: string;
  email_account_id: string | null;
  settings: CampaignSettings | null;
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify user belongs to org
  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  // Fetch campaign
  const { data: campaignData, error: campaignErr } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('org_id', orgId)
    .single();

  if (campaignErr || !campaignData) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  const campaign = campaignData as unknown as CampaignRow;

  if (!campaign.email_account_id) {
    return NextResponse.json(
      { error: 'Campaign has no email account configured' },
      { status: 400 }
    );
  }

  const startedAt = new Date().toISOString();

  // Update campaign status
  const { error: updateErr } = await supabase
    .from('campaigns')
    .update({ status: 'active', started_at: startedAt } as never)
    .eq('id', campaignId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Fetch all approved sequences for this campaign
  const { data: sequencesData } = await supabase
    .from('sequences')
    .select('id, lead_id, emails')
    .eq('campaign_id', campaignId)
    .not('approved_at', 'is', null); // Only approved sequences

  const sequences = (sequencesData ?? []) as unknown as SequenceRow[];

  if (sequences.length === 0) {
    return NextResponse.json({
      message: 'Campaign started, but no approved sequences found',
      campaign: { id: campaignId, status: 'active' },
    });
  }

  // Fetch leads for these sequences to get email addresses
  const leadIds = sequences.map((s) => s.lead_id);
  const { data: leadsData } = await supabase
    .from('leads')
    .select('id, email, campaign_id')
    .in('id', leadIds);

  const leadsMap = new Map(
    ((leadsData ?? []) as unknown as LeadRow[]).map((l) => [l.id, l])
  );

  const campaignSettings: CampaignSettings = campaign.settings ?? {
    sequence_length: 3,
    delay_between_emails_days: [1, 2, 3],
    stop_on_reply: true,
    track_opens: true,
    timezone: 'UTC',
    send_window_start: '09:00',
    send_window_end: '17:00',
  };

  // Build email rows for insertion
  const emailRows: Array<{
    org_id: string;
    campaign_id: string;
    sequence_id: string;
    lead_id: string;
    email_account_id: string;
    step: number;
    subject: string;
    body_text: string;
    body_html: string | null;
    message_id: string;
    scheduled_for: string;
    status: string;
  }> = [];

  for (const seq of sequences) {
    const lead = leadsMap.get(seq.lead_id);
    if (!lead?.email) continue;

    const emails = seq.emails ?? [];
    if (emails.length === 0) continue;

    // Compute scheduled times for this sequence
    const scheduled = computeScheduleTimes({
      campaignSettings,
      sequenceEmails: emails,
      campaignStartedAt: startedAt,
    });

    let prevMessageId: string | null = null;

    for (const email of scheduled) {
      const msgId = generateMessageId();
      emailRows.push({
        org_id: orgId,
        campaign_id: campaignId,
        sequence_id: seq.id,
        lead_id: seq.lead_id,
        email_account_id: campaign.email_account_id!,
        step: email.step,
        subject: email.subject,
        body_text: email.body,
        body_html: null, // Plain text for now
        message_id: msgId,
        scheduled_for: email.scheduledFor.toISOString(),
        status: 'scheduled',
      });

      prevMessageId = msgId;
    }

    // Update sequence current_step to 0 (not started yet)
    await supabase
      .from('sequences')
      .update({ current_step: 0 } as never)
      .eq('id', seq.id);
  }

  // Batch insert emails
  if (emailRows.length > 0) {
    const { error: insertErr } = await supabase
      .from('emails')
      .insert(emailRows as never);

    if (insertErr) {
      console.error('Failed to insert emails:', insertErr);
      return NextResponse.json(
        { error: 'Failed to schedule emails', details: insertErr.message },
        { status: 500 }
      );
    }
  }

  // Update leads to 'active' status
  await supabase
    .from('leads')
    .update({ status: 'active' } as never)
    .in('id', leadIds);

  return NextResponse.json({
    message: 'Campaign started',
    campaign: { id: campaignId, status: 'active' },
    emailsScheduled: emailRows.length,
    sequencesActivated: sequences.length,
  });
}
