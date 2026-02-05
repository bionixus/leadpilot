# Step 6: Email Sending — Schedule, SMTP, Sender Job & Limits

Follow these steps in order. You will **schedule** sequence steps as rows in the `emails` table, add an **SMTP send** helper, a **sender job** (cron or Trigger.dev) that sends due emails, **rate limiting** and **warmup**, and post-send updates (lead/sequence/campaign).

**Existing:**

- **Campaign start:** `POST /api/campaigns/[id]/start` only sets `status: 'active'` and `started_at`. It does **not** create `emails` rows or schedule sends.
- **Tables:** `emails` (draft, scheduled, sending, sent, …), `sequences` (current_step, is_complete), `email_accounts` (daily_send_limit, emails_sent_today, warmup_enabled, warmup_day).
- **Trigger.dev:** `trigger.config.ts` points to `./src/jobs`; that folder may not exist yet — you will add a send job there (or use a Next.js API route + external cron).

**Missing:** Creating `emails` rows from sequences when a campaign runs, SMTP/OAuth send helper, a job that sends due emails and respects limits, and resetting `emails_sent_today` (e.g. daily).

---

## Part A: Scheduling — From sequence to `emails` rows

### Step 6.1 — When to create `emails` rows

Two options (pick one for MVP):

**A) When campaign is started**  
When the user clicks “Start campaign”, after setting campaign to `active`:
- For each lead in the campaign that has an **approved** sequence (e.g. `approved_at` not null) and is not already complete:
  - For each step in `sequence.emails`, create one row in `emails`: `org_id`, `campaign_id`, `sequence_id`, `lead_id`, `email_account_id` (from campaign), `step`, `subject`, `body_text` (and optional `body_html`), `status: 'scheduled'`, `scheduled_for` = computed time (see 6.2).

**B) Lazy / on-demand**  
When the sender job runs (or a “process queue” API is called), for each campaign that is `active` and has leads with approved sequences, create **only the next** `emails` row for each lead (the step that is due now), then send it. So you never pre-create all steps; you create one row per “next step” when it’s time.

Recommendation for clarity: **A** — when starting the campaign, create all scheduled `emails` rows so the queue is visible in the DB and you can show “scheduled” in the UI. Use campaign `settings` (timezone, send_window_start, send_window_end, delay_between_emails_days) to compute `scheduled_for`.

---

### Step 6.2 — Compute `scheduled_for`

- **Inputs:** Campaign `started_at`, campaign `settings.timezone`, `settings.send_window_start` / `send_window_end` (e.g. `"09:00"`, `"17:00"`), `settings.delay_between_emails_days` (e.g. `[0, 3, 5]`), and sequence step index (0, 1, 2, …).
- **Logic:** For step index `i`, “send day” = started_at date + `delay_between_emails_days[i]` days. On that day, pick a time inside the send window (e.g. random between 09:00 and 17:00 in the campaign timezone). Result = `scheduled_for` (ISO string or timestamp).
- **Edge case:** If campaign has no `started_at` yet, use “now” for step 0 and add delays for later steps.

---

### Step 6.3 — Implement “schedule” in campaign start (or dedicated endpoint)

- **Option 1 — Inside start:** In `POST /api/campaigns/[id]/start`, after updating campaign to active:
  1. Load campaign (with `email_account_id`, `settings`). If no `email_account_id`, return 400 “Set sending account first”.
  2. Find all leads for this campaign that have a sequence with `approved_at` not null and `is_complete = false`.
  3. For each such sequence, for each step in `sequence.emails`, insert into `emails` with `scheduled_for` as above, `status: 'scheduled'`.
  4. Return the campaign (and optionally count of scheduled emails).

- **Option 2 — Separate “Schedule campaign”:** Keep start as-is; add `POST /api/campaigns/[id]/schedule` that does steps 1–3 above. User flow: Start campaign → Schedule (or “Schedule” is called automatically when they start). Either way, one place must create the `emails` rows.

---

## Part B: SMTP / send helper

### Step 6.4 — Email send lib (server-only)

- **File:** `src/lib/email/send.ts` (or `src/lib/email/index.ts`).
- **Dependencies:** Use **nodemailer** (already in package.json). For Gmail/Outlook use OAuth2 (refresh token if needed); for custom use username/password from decrypted `credentials_encrypted`.
- **API:** e.g. `sendEmail(options: { accountId: string; to: string; subject: string; bodyText: string; bodyHtml?: string; inReplyTo?: string; references?: string }): Promise<{ messageId?: string; error?: string }>`.
  - Load `email_accounts` row by `accountId` (with encrypted fields). Decrypt tokens or credentials (use your encryption lib from Step 4).
  - **Gmail/Outlook:** If access token expired, refresh using refresh_token and token endpoint; update stored tokens if you refresh. Create nodemailer transport with OAuth2 (e.g. `nodemailer.createTransport({ service: 'gmail', auth: { type: 'OAuth2', user, clientId, clientSecret, refreshToken, accessToken } })`). Send mail.
  - **Custom:** Create transport with host, port, secure, and auth from decrypted credentials. Send mail.
  - Return `{ messageId }` on success (from send result) or `{ error }` on failure. Do not throw sensitive data to the client; log errors safely.

---

### Step 6.5 — Get “from” address and display name

- Use `email_accounts.email_address` and `email_accounts.display_name` for the “From” header. Pass them into the send helper so the recipient sees the right sender.

---

## Part C: Sender job — pick due emails and send

### Step 6.6 — Who runs the sender

Choose one:

**A) Trigger.dev job**  
- Create `src/jobs/send-scheduled-emails.ts` (or similar). Job runs on a schedule (e.g. every 5–15 minutes). In the job: query `emails` where `status = 'scheduled'` and `scheduled_for <= now()`, optionally limited by org or batch size (e.g. 50). For each row, apply rate limit (Step 6.8), then call send helper, then update DB (Step 6.9). Trigger.dev lets you set a cron trigger.

**B) Next.js API route + external cron**  
- Create `POST /api/cron/send-scheduled-emails` (or `GET` with a secret in headers/query). The route does the same: query due emails, send, update. Secure it with a secret (e.g. `CRON_SECRET`) so only your cron service (Vercel Cron, GitHub Actions, etc.) can call it. Call this route every 5–15 minutes.

**C) Same logic in both**  
- Put the “get due emails → for each apply limit and send → update” logic in a shared function (e.g. `processScheduledEmails()` in `src/lib/email/process.ts`). Call it from the Trigger job or from the cron API route.

---

### Step 6.7 — Query due emails

- Query: `emails` where `status = 'scheduled'` and `scheduled_for <= now()` (use DB time or application time consistently). Order by `scheduled_for` asc. Limit batch size (e.g. 50) to avoid timeouts. Optionally filter by `org_id` or process one org per run if you need fairness.

---

### Step 6.8 — Rate limit and warmup per account

- Before sending an email from `email_account_id`, load the account and check:
  - **Daily limit:** `emails_sent_today < daily_send_limit`. If at or over, skip this email (or defer to next run).
  - **Warmup (optional):** If `warmup_enabled`, use a lower effective limit for that account (e.g. `min(daily_send_limit, 5 + warmup_day * 2)` up to a max). So new accounts send fewer emails per day until “warmed up”.
- After a **successful** send, increment `email_accounts.emails_sent_today` by 1 (and optionally update `last_synced_at` or a “last_sent_at” if you add it). Resetting `emails_sent_today` to 0 daily is Step 6.11.

---

### Step 6.9 — After send: update DB

- **On success:**  
  - Set `emails.status = 'sent'`, `emails.sent_at = now()`, `emails.message_id = result.messageId` (if returned).  
  - Update `sequences`: increment `current_step` by 1; if `current_step` equals number of steps, set `is_complete = true`, `stopped_reason = 'completed'`.  
  - Update `leads`: if this was the first email (step 1), set `status = 'contacted'`; otherwise leave as is (or keep “contacted” until reply).  
  - Optionally update `campaigns.stats` (emails_sent, etc.) via a small helper or trigger.

- **On failure:**  
  - Set `emails.status = 'failed'`, `emails.error_message = error`. Increment `emails.retry_count`. If `retry_count` &lt; max (e.g. 3), you can leave status as `'scheduled'` and set a new `scheduled_for` (e.g. +1 hour) for retry; otherwise mark as failed and optionally update lead/sequence (e.g. stop sequence for this lead).

---

### Step 6.10 — Threading (Message-ID, In-Reply-To)

- For the **first** email in a sequence, generate a unique `Message-ID` (e.g. `<uuid@yourdomain.com>`) and set it on the outgoing message; store it in `emails.message_id`.
- For **follow-ups**, set `In-Reply-To` and `References` to the first (or previous) message’s Message-ID so clients thread them. Store `in_reply_to` and optionally `thread_id` in the `emails` row if you use them for reply matching later (Step 7).

---

## Part D: Reset daily count and bounces

### Step 6.11 — Reset `emails_sent_today` daily

- Once per day (e.g. 00:00 in a chosen timezone, or per-account midnight in account timezone), set `email_accounts.emails_sent_today = 0` for all accounts (or for accounts where “today” has rolled over). Options:
  - A **Trigger.dev** scheduled job (daily).
  - A **cron API route** (e.g. `POST /api/cron/reset-daily-send-count`) called daily.
  - Or, when reading the account, compute “today” in the account’s timezone and if the stored “last reset date” is in the past, reset the count and update the date (requires an extra column like `emails_sent_today_reset_at`).

---

### Step 6.12 — Bounce handling (high level)

- When an email **bounces**, the bounce usually arrives as an inbound message (IMAP). In **Step 7 (Inbox)**, when you classify a message as `bounce`, update the corresponding `emails` row: `status = 'bounced'`, `bounced_at = now()`. Update the lead: `status = 'bounced'`. Optionally stop the sequence for that lead (`is_complete = true`, `stopped_reason = 'bounced'`). So **Step 6** only needs to send; bounce handling is implemented in the Inbox sync/classification step.

---

## Part E: API and UI (optional)

### Step 6.13 — List scheduled/sent emails (optional)

- **GET /api/campaigns/[id]/emails** or **GET /api/emails?campaign_id=…&status=…**  
  Return scheduled and sent emails for a campaign (or for a lead) so the UI can show a simple “Sent” / “Scheduled” list. Useful for campaign detail or sequence detail.

---

### Step 6.14 — UI: show scheduled and sent

- On **campaign detail** or **sequence detail**, show for each step: status (scheduled / sent / failed), scheduled_for, sent_at. Optionally a “Pause campaign” that sets campaign back to `paused` and stops creating new sends (sender job can skip campaigns that are not `active`).

---

## Checklist (summary)

- [ ] **6.1** Decide: create all `emails` rows when campaign starts (recommended) or create on-demand when sending.
- [ ] **6.2** Compute `scheduled_for` from campaign started_at, timezone, send window, and delay_between_emails_days.
- [ ] **6.3** In start (or separate schedule endpoint): create `emails` rows for each approved sequence step with `status: 'scheduled'`.
- [ ] **6.4** `src/lib/email/send.ts` — send helper: load account, decrypt, create transport (OAuth2 or SMTP), send; return messageId or error.
- [ ] **6.5** Use email_accounts.email_address and display_name for From.
- [ ] **6.6** Sender: Trigger.dev job or cron API route that runs every 5–15 min.
- [ ] **6.7** Query emails where status = 'scheduled' and scheduled_for <= now(); limit batch.
- [ ] **6.8** Before send: check daily_send_limit and warmup; after send: increment emails_sent_today.
- [ ] **6.9** After send: update email (sent/failed), sequence (current_step, is_complete), lead (contacted), optional campaign stats.
- [ ] **6.10** Set Message-ID (first email) and In-Reply-To/References (follow-ups) for threading.
- [ ] **6.11** Daily job or logic to reset emails_sent_today.
- [ ] **6.12** Document that bounce handling is in Inbox (Step 7); no send-side bounce in Step 6.
- [ ] **6.13** (Optional) GET emails for campaign/lead.
- [ ] **6.14** (Optional) UI: scheduled/sent per step; pause campaign.

After this, campaigns can schedule sequence emails, and a background process sends them via SMTP/OAuth with rate limits and warmup; bounces are handled in the Inbox step.
