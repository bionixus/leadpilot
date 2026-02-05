import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { fetchNewEmails, generateSnippet, type EmailAccountForFetch, type FetchedEmail } from '@/lib/email/imap';
import { classifyReplyPrompt } from '@/lib/inbox/classify';
import Anthropic from '@anthropic-ai/sdk';

type LeadRow = { id: string; email: string };
type EmailRow = { 
  id: string; 
  message_id: string | null; 
  lead_id: string; 
  campaign_id: string | null;
  body_text: string;
  thread_id: string | null;
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const adminSupabase = createSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 403 });

  // Fetch the full account details
  const { data: accountData } = await adminSupabase
    .from('email_accounts')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .single();

  if (!accountData) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const account = accountData as unknown as EmailAccountForFetch & { org_id: string };

  try {
    // Fetch new emails via IMAP
    const emails = await fetchNewEmails(account);

    if (emails.length === 0) {
      await adminSupabase
        .from('email_accounts')
        .update({ last_synced_at: new Date().toISOString() } as never)
        .eq('id', id);

      return NextResponse.json({ ok: true, fetched: 0, inserted: 0 });
    }

    // Fetch leads for matching
    const { data: leadsData } = await adminSupabase
      .from('leads')
      .select('id, email')
      .eq('org_id', orgId);

    const leadsMap = new Map(
      ((leadsData ?? []) as unknown as LeadRow[]).map((l) => [l.email.toLowerCase(), l])
    );

    let inserted = 0;
    let classified = 0;

    for (const email of emails) {
      try {
        const result = await processInboundEmail(
          adminSupabase,
          account,
          email,
          orgId,
          leadsMap
        );
        if (result.inserted) inserted++;
        if (result.classified) classified++;
      } catch (err) {
        console.error('Failed to process email:', err);
      }
    }

    // Update last_synced_at
    await adminSupabase
      .from('email_accounts')
      .update({ 
        last_synced_at: new Date().toISOString(),
        connection_status: 'connected',
        last_error: null,
      } as never)
      .eq('id', id);

    return NextResponse.json({ ok: true, fetched: emails.length, inserted, classified });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    
    // Update connection status to error
    await adminSupabase
      .from('email_accounts')
      .update({
        connection_status: 'error',
        last_error: message,
      } as never)
      .eq('id', id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function processInboundEmail(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  account: EmailAccountForFetch & { org_id: string },
  email: FetchedEmail,
  orgId: string,
  leadsMap: Map<string, LeadRow>
): Promise<{ inserted: boolean; classified: boolean }> {
  // Match to lead and campaign
  let leadId: string | null = null;
  let campaignId: string | null = null;
  let threadId: string | null = null;
  let originalOutreach: string | null = null;

  const referencesToCheck = [email.inReplyTo, ...email.references].filter(Boolean) as string[];

  if (referencesToCheck.length > 0) {
    const { data: outboundMatch } = await supabase
      .from('emails')
      .select('id, message_id, lead_id, campaign_id, body_text, thread_id')
      .in('message_id', referencesToCheck)
      .limit(1)
      .single();

    if (outboundMatch) {
      const match = outboundMatch as unknown as EmailRow;
      leadId = match.lead_id;
      campaignId = match.campaign_id;
      threadId = match.thread_id ?? match.message_id;
      originalOutreach = match.body_text;
    }
  }

  // Fallback: match by from_email
  if (!leadId && email.from?.address) {
    const lead = leadsMap.get(email.from.address.toLowerCase());
    if (lead) {
      leadId = lead.id;
    }
  }

  // Generate thread_id
  if (!threadId) {
    threadId = email.messageId ?? crypto.randomUUID();
  }

  // Insert into inbox_messages
  const toAddresses = email.to.map((t) => t.address);
  const ccAddresses = email.cc.map((c) => c.address);

  const insertRow = {
    org_id: orgId,
    email_account_id: account.id,
    lead_id: leadId,
    campaign_id: campaignId,
    direction: 'inbound',
    from_email: email.from.address,
    from_name: email.from.name,
    to_email: toAddresses[0] || account.email_address,
    to_name: null,
    cc: ccAddresses.length > 0 ? ccAddresses : null,
    subject: email.subject,
    body_text: email.bodyText,
    body_html: email.bodyHtml,
    snippet: generateSnippet(email.bodyText),
    message_id: email.messageId,
    in_reply_to: email.inReplyTo,
    references_header: email.references.length > 0 ? email.references : null,
    thread_id: threadId,
    attachments: email.attachments,
    received_at: email.date?.toISOString() || new Date().toISOString(),
    is_read: false,
  };

  const { error: insertErr } = await supabase
    .from('inbox_messages')
    .insert(insertRow as never);

  if (insertErr) {
    if (insertErr.code === '23505') {
      return { inserted: false, classified: false };
    }
    throw insertErr;
  }

  // Auto-classify if matched
  let classified = false;
  if (leadId && originalOutreach) {
    try {
      classified = await autoClassify(supabase, email, originalOutreach, leadId, campaignId, orgId);
    } catch (err) {
      console.error('Classification failed:', err);
    }
  }

  return { inserted: true, classified };
}

async function autoClassify(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  email: FetchedEmail,
  originalOutreach: string,
  leadId: string,
  campaignId: string | null,
  orgId: string
): Promise<boolean> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return false;

  const inboxMessage = {
    from_email: email.from.address,
    subject: email.subject,
    body_text: email.bodyText,
  };

  const prompt = classifyReplyPrompt(inboxMessage as never, originalOutreach);
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') return false;

  let result: { classification: string; confidence: number };
  try {
    result = JSON.parse(textBlock.text);
  } catch {
    return false;
  }

  const classification = result.classification?.toLowerCase();
  const confidence = result.confidence;

  if (email.messageId) {
    await supabase
      .from('inbox_messages')
      .update({ classification, classification_confidence: confidence } as never)
      .eq('message_id', email.messageId);
  }

  // Side effects
  if (classification === 'interested') {
    await supabase.from('leads').update({ status: 'interested' } as never).eq('id', leadId);
    await createNotification(supabase, orgId, 'positive_reply', 
      `Interested reply from ${email.from.name || email.from.address}`,
      generateSnippet(email.bodyText, 100), campaignId, leadId);
  } else if (classification === 'not_interested') {
    await supabase.from('leads').update({ status: 'not_interested' } as never).eq('id', leadId);
    await supabase.from('sequences').update({ is_complete: true } as never).eq('lead_id', leadId);
  } else if (classification === 'bounce') {
    await supabase.from('leads').update({ status: 'bounced' } as never).eq('id', leadId);
    await supabase.from('sequences').update({ is_complete: true } as never).eq('lead_id', leadId);
    await createNotification(supabase, orgId, 'bounce',
      `Email bounced for lead`, email.subject || 'Bounce', campaignId, leadId);
  } else if (classification === 'question') {
    await createNotification(supabase, orgId, 'reply_received',
      `Question from ${email.from.name || email.from.address}`,
      generateSnippet(email.bodyText, 100), campaignId, leadId);
  }

  return true;
}

async function createNotification(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  orgId: string,
  type: string,
  title: string,
  message: string,
  campaignId: string | null,
  leadId: string
) {
  const { data: users } = await supabase.from('users').select('id').eq('org_id', orgId);
  if (!users || users.length === 0) return;

  for (const user of users as { id: string }[]) {
    await supabase.from('notifications').insert({
      org_id: orgId, user_id: user.id, type, title, message,
      campaign_id: campaignId, lead_id: leadId, is_read: false,
    } as never);
  }
}
