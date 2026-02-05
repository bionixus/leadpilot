import { schedules } from "@trigger.dev/sdk/v3";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail, generateMessageId } from "@/lib/email/send";
import { canSendNow } from "@/lib/email/schedule";

type EmailRow = {
  id: string;
  org_id: string;
  campaign_id: string | null;
  sequence_id: string | null;
  lead_id: string;
  email_account_id: string;
  step: number;
  subject: string;
  body_text: string;
  body_html: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  thread_id: string | null;
  scheduled_for: string;
  status: string;
};

type LeadRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
};

type EmailAccountRow = {
  id: string;
  email_address: string;
  daily_send_limit: number;
  emails_sent_today: number;
  warmup_enabled: boolean;
  warmup_day: number;
  is_active: boolean;
  connection_status: string;
};

type SequenceRow = {
  id: string;
  current_step: number;
  emails: Array<{ step: number }>;
  is_complete: boolean;
};

/**
 * Email sender job - runs every minute via Trigger.dev cron.
 *
 * Queries all emails with status='scheduled' and scheduled_for <= now,
 * respects per-account rate limits and warmup, sends via sendEmail lib,
 * and updates statuses.
 */
export const sendEmailsTask = schedules.task({
  id: "send-scheduled-emails",
  cron: "* * * * *", // Every minute
  run: async () => {
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    // Fetch due emails
    const { data: emailsData, error: fetchErr } = await supabase
      .from("emails")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(100); // Process in batches

    if (fetchErr) {
      console.error("Failed to fetch emails:", fetchErr);
      return { sent: 0, skipped: 0, failed: 0, error: fetchErr.message };
    }

    const emails = (emailsData ?? []) as unknown as EmailRow[];
    if (emails.length === 0) {
      return { sent: 0, skipped: 0, failed: 0 };
    }

    // Collect unique account IDs and lead IDs
    const accountIds = Array.from(new Set(emails.map((e) => e.email_account_id)));
    const leadIds = Array.from(new Set(emails.map((e) => e.lead_id)));
    const sequenceIds = Array.from(
      new Set(emails.filter((e) => e.sequence_id).map((e) => e.sequence_id!))
    );

    // Fetch accounts
    const { data: accountsData } = await supabase
      .from("email_accounts")
      .select("id, email_address, daily_send_limit, emails_sent_today, warmup_enabled, warmup_day, is_active, connection_status")
      .in("id", accountIds);

    const accountsMap = new Map(
      ((accountsData ?? []) as unknown as EmailAccountRow[]).map((a) => [a.id, a])
    );

    // Fetch leads
    const { data: leadsData } = await supabase
      .from("leads")
      .select("id, email, first_name, last_name, status")
      .in("id", leadIds);

    const leadsMap = new Map(
      ((leadsData ?? []) as unknown as LeadRow[]).map((l) => [l.id, l])
    );

    // Fetch sequences for step tracking
    const { data: sequencesData } = await supabase
      .from("sequences")
      .select("id, current_step, emails, is_complete")
      .in("id", sequenceIds);

    const sequencesMap = new Map(
      ((sequencesData ?? []) as unknown as SequenceRow[]).map((s) => [s.id, s])
    );

    // Track sends per account for this batch
    const accountSendCount = new Map<string, number>();

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const email of emails) {
      const account = accountsMap.get(email.email_account_id);
      const lead = leadsMap.get(email.lead_id);

      if (!account || !lead) {
        // Mark as failed
        await supabase
          .from("emails")
          .update({ status: "failed", error_message: "Account or lead not found" } as never)
          .eq("id", email.id);
        failed++;
        continue;
      }

      // Check account status
      if (account.connection_status !== "connected") {
        await supabase
          .from("emails")
          .update({ status: "failed", error_message: "Account not connected" } as never)
          .eq("id", email.id);
        failed++;
        continue;
      }

      // Check if lead has replied (stop_on_reply logic)
      if (lead.status === "replied") {
        await supabase
          .from("emails")
          .update({ status: "draft", error_message: "Lead already replied" } as never)
          .eq("id", email.id);
        skipped++;
        continue;
      }

      // Check rate limits (including warmup)
      const batchCount = accountSendCount.get(account.id) ?? 0;
      const effectiveAccount = {
        ...account,
        emails_sent_today: account.emails_sent_today + batchCount,
      };

      const { canSend, reason } = canSendNow(effectiveAccount);
      if (!canSend) {
        // Will retry next minute, just skip for now
        skipped++;
        continue;
      }

      // Mark as sending
      await supabase
        .from("emails")
        .update({ status: "sending" } as never)
        .eq("id", email.id);

      // Get previous email in thread for in_reply_to
      let inReplyTo: string | undefined;
      let references: string | undefined;
      if (email.step > 1 && email.sequence_id) {
        const { data: prevEmails } = await supabase
          .from("emails")
          .select("message_id")
          .eq("sequence_id", email.sequence_id)
          .eq("lead_id", email.lead_id)
          .eq("status", "sent")
          .lt("step", email.step)
          .order("step", { ascending: false })
          .limit(1);

        if (prevEmails && prevEmails.length > 0) {
          const prevMsgId = (prevEmails[0] as unknown as { message_id: string | null }).message_id;
          if (prevMsgId) {
            inReplyTo = prevMsgId;
            references = prevMsgId;
          }
        }
      }

      // Generate message ID if not present
      const messageId = email.message_id ?? generateMessageId();

      // Send!
      const result = await sendEmail({
        accountId: account.id,
        to: lead.email,
        subject: email.subject,
        bodyText: email.body_text,
        bodyHtml: email.body_html ?? undefined,
        messageId,
        inReplyTo,
        references,
      });

      if (result.success) {
        // Update email as sent
        await supabase
          .from("emails")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            message_id: result.messageId ?? messageId,
          } as never)
          .eq("id", email.id);

        // Increment account's emails_sent_today
        await supabase.rpc("increment_emails_sent_today" as never, { account_id: account.id } as never);

        // Update sequence current_step
        if (email.sequence_id) {
          const seq = sequencesMap.get(email.sequence_id);
          if (seq) {
            const totalSteps = seq.emails?.length ?? 1;
            const isComplete = email.step >= totalSteps;

            await supabase
              .from("sequences")
              .update({
                current_step: email.step,
                is_complete: isComplete,
              } as never)
              .eq("id", email.sequence_id);
          }
        }

        // Update lead status to 'contacted' if first email
        if (email.step === 1) {
          await supabase
            .from("leads")
            .update({ status: "contacted" } as never)
            .eq("id", email.lead_id);
        }

        accountSendCount.set(account.id, batchCount + 1);
        sent++;
      } else {
        // Mark as failed with retry
        const retryCount = (email as { retry_count?: number }).retry_count ?? 0;

        if (retryCount < 3) {
          // Reschedule for 5 minutes later
          const nextAttempt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          await supabase
            .from("emails")
            .update({
              status: "scheduled",
              scheduled_for: nextAttempt,
              retry_count: retryCount + 1,
              error_message: result.error,
            } as never)
            .eq("id", email.id);
        } else {
          await supabase
            .from("emails")
            .update({
              status: "failed",
              error_message: result.error,
            } as never)
            .eq("id", email.id);
        }
        failed++;
      }
    }

    return { sent, skipped, failed };
  },
});
