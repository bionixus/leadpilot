import { schedules } from "@trigger.dev/sdk/v3";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchNewEmails, generateSnippet, type FetchedEmail, type EmailAccountForFetch } from "@/lib/email/imap";
import { classifyReplyPrompt } from "@/lib/inbox/classify";
import Anthropic from "@anthropic-ai/sdk";

type LeadRow = {
  id: string;
  email: string;
};

type EmailRow = {
  id: string;
  message_id: string | null;
  lead_id: string;
  campaign_id: string | null;
  sequence_id: string | null;
  body_text: string;
  thread_id: string | null;
};

type InboxMessageRow = {
  id: string;
  message_id: string | null;
  lead_id: string | null;
  campaign_id: string | null;
  thread_id: string | null;
  direction: string;
  body_text: string | null;
};

type SequenceRow = {
  id: string;
  lead_id: string;
};

type ClassificationResult = {
  classification: string;
  confidence: number;
  reason: string;
};

/**
 * Inbox sync job - runs every 10 minutes via Trigger.dev cron.
 *
 * For each active, connected email account:
 * 1. Fetch new emails via IMAP
 * 2. Match to leads/campaigns
 * 3. Insert into inbox_messages
 * 4. Auto-classify with Claude
 * 5. Run side-effects based on classification
 */
export const syncInboxTask = schedules.task({
  id: "sync-inbox",
  cron: "*/10 * * * *", // Every 10 minutes
  run: async () => {
    const supabase = createSupabaseAdminClient();

    // Fetch all active, connected email accounts
    const { data: accountsData, error: accountsErr } = await supabase
      .from("email_accounts")
      .select("*")
      .eq("is_active", true)
      .eq("connection_status", "connected");

    if (accountsErr) {
      console.error("Failed to fetch accounts:", accountsErr);
      return { error: accountsErr.message, processed: 0 };
    }

    const accounts = (accountsData ?? []) as unknown as EmailAccountForFetch[];
    if (accounts.length === 0) {
      return { message: "No active accounts", processed: 0 };
    }

    let totalFetched = 0;
    let totalInserted = 0;
    let totalClassified = 0;

    for (const account of accounts) {
      try {
        // Fetch new emails
        const emails = await fetchNewEmails(account);
        totalFetched += emails.length;

        if (emails.length === 0) {
          await updateLastSynced(supabase, account.id);
          continue;
        }

        // Get org_id for this account
        const { data: accRow } = await supabase
          .from("email_accounts")
          .select("org_id")
          .eq("id", account.id)
          .single();

        const orgId = (accRow as { org_id: string } | null)?.org_id;
        if (!orgId) continue;

        // Fetch leads for matching by email
        const { data: leadsData } = await supabase
          .from("leads")
          .select("id, email")
          .eq("org_id", orgId);

        const leadsMap = new Map(
          ((leadsData ?? []) as unknown as LeadRow[]).map((l) => [
            l.email.toLowerCase(),
            l,
          ])
        );

        // Process each email
        for (const email of emails) {
          try {
            const result = await processInboundEmail(
              supabase,
              account,
              email,
              orgId,
              leadsMap
            );
            if (result.inserted) totalInserted++;
            if (result.classified) totalClassified++;
          } catch (err) {
            console.error("Failed to process email:", err);
          }
        }

        await updateLastSynced(supabase, account.id);
      } catch (err) {
        console.error(`Sync failed for account ${account.id}:`, err);
        // Update connection status to error
        await supabase
          .from("email_accounts")
          .update({
            connection_status: "error",
            last_error: err instanceof Error ? err.message : "Sync failed",
          } as never)
          .eq("id", account.id);
      }
    }

    return {
      accountsProcessed: accounts.length,
      totalFetched,
      totalInserted,
      totalClassified,
    };
  },
});

async function updateLastSynced(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  accountId: string
) {
  await supabase
    .from("email_accounts")
    .update({ last_synced_at: new Date().toISOString() } as never)
    .eq("id", accountId);
}

async function processInboundEmail(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  account: EmailAccountForFetch,
  email: FetchedEmail,
  orgId: string,
  leadsMap: Map<string, LeadRow>
): Promise<{ inserted: boolean; classified: boolean }> {
  // 1. Match to lead and campaign via In-Reply-To / References
  let leadId: string | null = null;
  let campaignId: string | null = null;
  let threadId: string | null = null;
  let originalOutreach: string | null = null;

  // Try to match by In-Reply-To or References
  const referencesToCheck = [
    email.inReplyTo,
    ...email.references,
  ].filter(Boolean) as string[];

  if (referencesToCheck.length > 0) {
    // Check emails table (outbound)
    const { data: outboundMatch } = await supabase
      .from("emails")
      .select("id, message_id, lead_id, campaign_id, sequence_id, body_text, thread_id")
      .in("message_id", referencesToCheck)
      .limit(1)
      .single();

    if (outboundMatch) {
      const match = outboundMatch as unknown as EmailRow;
      leadId = match.lead_id;
      campaignId = match.campaign_id;
      threadId = match.thread_id ?? match.message_id;
      originalOutreach = match.body_text;
    } else {
      // Check inbox_messages table
      const { data: inboxMatch } = await supabase
        .from("inbox_messages")
        .select("id, message_id, lead_id, campaign_id, thread_id, direction, body_text")
        .in("message_id", referencesToCheck)
        .limit(1)
        .single();

      if (inboxMatch) {
        const match = inboxMatch as unknown as InboxMessageRow;
        leadId = match.lead_id;
        campaignId = match.campaign_id;
        threadId = match.thread_id ?? match.message_id;
        if (match.direction === "outbound") {
          originalOutreach = match.body_text;
        }
      }
    }
  }

  // 2. Fallback: match by from_email to lead
  if (!leadId && email.from?.address) {
    const lead = leadsMap.get(email.from.address.toLowerCase());
    if (lead) {
      leadId = lead.id;
      // Try to find campaign from lead's sequences
      const { data: seqData } = await supabase
        .from("sequences")
        .select("id, lead_id")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (seqData) {
        // Get campaign_id from the sequence's email
        const { data: emailData } = await supabase
          .from("emails")
          .select("campaign_id, body_text")
          .eq("sequence_id", (seqData as unknown as SequenceRow).id)
          .eq("step", 1)
          .single();

        if (emailData) {
          campaignId = (emailData as { campaign_id: string | null; body_text: string }).campaign_id;
          originalOutreach = (emailData as { campaign_id: string | null; body_text: string }).body_text;
        }
      }
    }
  }

  // 3. Generate thread_id if not found
  if (!threadId) {
    threadId = email.messageId ?? crypto.randomUUID();
  }

  // 4. Insert into inbox_messages
  const toAddresses = email.to.map((t) => t.address);
  const ccAddresses = email.cc.map((c) => c.address);

  const insertRow = {
    org_id: orgId,
    email_account_id: account.id,
    lead_id: leadId,
    campaign_id: campaignId,
    direction: "inbound",
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
    .from("inbox_messages")
    .insert(insertRow as never);

  if (insertErr) {
    // Check for duplicate (unique constraint on message_id)
    if (insertErr.code === "23505") {
      return { inserted: false, classified: false };
    }
    throw insertErr;
  }

  // 5. Auto-classify if matched to outreach
  let classified = false;
  if (leadId && originalOutreach) {
    try {
      classified = await autoClassifyMessage(
        supabase,
        email,
        originalOutreach,
        leadId,
        campaignId,
        orgId
      );
    } catch (classifyErr) {
      console.error("Classification failed:", classifyErr);
    }
  }

  return { inserted: true, classified };
}

async function autoClassifyMessage(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  email: FetchedEmail,
  originalOutreach: string,
  leadId: string,
  campaignId: string | null,
  orgId: string
): Promise<boolean> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY not set, skipping classification");
    return false;
  }

  // Build the inbox message object for the prompt
  const inboxMessage = {
    from_email: email.from.address,
    subject: email.subject,
    body_text: email.bodyText,
  };

  const prompt = classifyReplyPrompt(inboxMessage as never, originalOutreach);

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  // Extract text from response
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return false;
  }

  // Parse JSON response
  let result: ClassificationResult;
  try {
    result = JSON.parse(textBlock.text) as ClassificationResult;
  } catch {
    console.error("Failed to parse classification response");
    return false;
  }

  const classification = result.classification?.toLowerCase();
  const confidence = result.confidence;

  // Update inbox_messages with classification
  if (email.messageId) {
    await supabase
      .from("inbox_messages")
      .update({
        classification,
        classification_confidence: confidence,
      } as never)
      .eq("message_id", email.messageId);
  }

  // Run side-effects based on classification
  await runClassificationSideEffects(
    supabase,
    classification,
    leadId,
    campaignId,
    orgId,
    email
  );

  return true;
}

async function runClassificationSideEffects(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  classification: string,
  leadId: string,
  campaignId: string | null,
  orgId: string,
  email: FetchedEmail
) {
  switch (classification) {
    case "interested":
      // Update lead status
      await supabase
        .from("leads")
        .update({ status: "interested" } as never)
        .eq("id", leadId);

      // Create notification
      await createNotification(
        supabase,
        orgId,
        "positive_reply",
        `Interested reply from ${email.from.name || email.from.address}`,
        generateSnippet(email.bodyText, 100),
        campaignId,
        leadId
      );
      break;

    case "not_interested":
      // Update lead status
      await supabase
        .from("leads")
        .update({ status: "not_interested" } as never)
        .eq("id", leadId);

      // Stop sequence
      await supabase
        .from("sequences")
        .update({ is_complete: true } as never)
        .eq("lead_id", leadId);
      break;

    case "bounce":
      // Update lead status
      await supabase
        .from("leads")
        .update({ status: "bounced" } as never)
        .eq("id", leadId);

      // Stop sequence
      await supabase
        .from("sequences")
        .update({ is_complete: true } as never)
        .eq("lead_id", leadId);

      // Create notification
      await createNotification(
        supabase,
        orgId,
        "bounce",
        `Email bounced for ${email.from.name || email.from.address}`,
        email.subject || "Bounce notification",
        campaignId,
        leadId
      );
      break;

    case "question":
      // Create notification
      await createNotification(
        supabase,
        orgId,
        "reply_received",
        `Question from ${email.from.name || email.from.address}`,
        generateSnippet(email.bodyText, 100),
        campaignId,
        leadId
      );
      break;

    case "out_of_office":
      // No action needed
      break;

    default:
      // 'other' - no auto action
      break;
  }
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
  // Get users in org to notify
  const { data: users } = await supabase
    .from("users")
    .select("id")
    .eq("org_id", orgId);

  if (!users || users.length === 0) return;

  for (const user of users as { id: string }[]) {
    await supabase.from("notifications").insert({
      org_id: orgId,
      user_id: user.id,
      type,
      title,
      message,
      campaign_id: campaignId,
      lead_id: leadId,
      is_read: false,
    } as never);
  }
}
