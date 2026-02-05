# Step 7: Inbox CRM — IMAP Sync, Thread View, Reply, Classification & Notifications

Follow these steps in order. You will add an **IMAP sync** job that fetches new messages from connected email accounts, match them to leads/campaigns, **classify** replies with AI, build the **Inbox** page with **thread view** and **reply composer**, and send **notifications** on important events.

**Existing:**

- `GET /api/inbox` — list threads (latest message per thread) or messages for a given `thread_id`.
- `GET /api/inbox/[threadId]` — get all messages in a thread.
- `POST /api/inbox/[threadId]/reply` — stub ("SMTP implementation pending").
- `PATCH /api/inbox/[threadId]/classify` — manually set classification on a message.
- `src/lib/inbox/classify.ts` — `classifyReplyPrompt(email, originalOutreach)` builds a prompt for Claude; expects JSON response `{ classification, confidence, reason }`.
- `POST /api/email-accounts/[id]/sync` — stub ("Sync triggered (implementation pending)").

**Schema:** `inbox_messages` with `direction` (inbound/outbound), `thread_id`, `message_id`, `in_reply_to`, `classification`, `is_read`, `is_starred`, `is_archived`, `lead_id`, `campaign_id`, `email_account_id`, `received_at`, `attachments`, etc.

**Missing:** IMAP fetch logic, reply matching (find lead/campaign from headers), auto-classification with Claude, storing outbound replies, real sync job, Inbox page + thread view, reply send, and notifications.

---

## Part A: IMAP Sync — Fetch new messages

### Step 7.1 — IMAP fetch lib (server-only)

- **File:** `src/lib/email/imap.ts` (or add to `src/lib/email/index.ts`).
- **Dependencies:** Use **imap** package (already in deps) and **mailparser** for parsing (`AddressObject`, `simpleParser`).
- **API:** e.g. `fetchNewEmails(account: EmailAccount): Promise<ParsedMail[]>`.
  - Build IMAP config: for **Gmail** or **Outlook** OAuth, create XOAUTH2 token (see `imap` docs for XOAUTH2 or use nodemailer's `xoauth2` generator); for **custom**, use host/port/secure from account and username/password from decrypted `credentials_encrypted`.
  - Connect, open INBOX, search for unseen (or since `last_synced_at` date), fetch the matching UIDs. For each, fetch body and parse with `simpleParser`.
  - After success, mark messages as seen (optional — some users prefer to leave unseen) or just track UIDs you've processed.
  - Return array of parsed messages (from, to, subject, textAsHtml or text, date, messageId, inReplyTo, references, attachments metadata).
  - On error: throw with a clear message; caller handles status update.

---

### Step 7.2 — Sync job (Trigger.dev or cron)

- **Option A — Trigger.dev:** `src/jobs/sync-inbox.ts` runs on schedule (e.g. every 10 min). For each email account with `is_active = true` and `connection_status = 'connected'`, call `fetchNewEmails`, then process (7.3–7.6), then update `last_synced_at`.
- **Option B — Cron API:** `POST /api/cron/sync-inbox` (secured) does the same; called by external cron every 10 min.
- **Scope:** You can run one global job that loops over all accounts (with rate limiting), or one job per account triggered by the existing `/api/email-accounts/[id]/sync` route (useful for manual "Sync now").

---

### Step 7.3 — Match message to lead and campaign

For each fetched inbound message:

1. **By `In-Reply-To` / `References`:** If the message has an `inReplyTo` or `references` header, look up `emails.message_id` or `inbox_messages.message_id` that matches. If found, get `lead_id` and `campaign_id` from that row; also set `thread_id` to that thread.
2. **By from_email:** If no match from headers, try to match `from_email` to a lead in the org. If multiple leads, pick the most recent, or leave `lead_id` null.
3. **Generate `thread_id`:** If matched to an existing thread, use its `thread_id`. Otherwise generate a new one (e.g. first message_id, or a UUID).

---

### Step 7.4 — Insert into `inbox_messages`

Insert the inbound message:
- `org_id`, `email_account_id`, `lead_id` (if matched), `campaign_id` (if matched), `direction: 'inbound'`, `from_email`, `from_name`, `to_email`, `to_name`, `cc` / `bcc` (if present), `subject`, `body_text`, `body_html`, `snippet` (first ~200 chars of body_text), `message_id`, `in_reply_to`, `references_header`, `thread_id`, `attachments` (JSON metadata), `received_at` (from parsed date), `is_read: false`.
- Handle duplicates: `message_id UNIQUE` — if insert fails with unique violation, skip (already synced).

---

### Step 7.5 — Auto-classify with Claude

If the message is matched to a lead/campaign (i.e. it's a reply to outreach):

1. Find the **original outreach** email: `emails` or `inbox_messages` where `thread_id` matches and `direction = 'outbound'` and step = 1, or the first outbound message in the thread. Get its `body_text` (or subject + body).
2. Build prompt: `classifyReplyPrompt(inboxMessage, originalOutreach)` (existing helper).
3. Call Claude (same lib as Step 5): send prompt, parse JSON `{ classification, confidence, reason }`.
4. Update `inbox_messages` row: `classification`, `classification_confidence = confidence`.
5. (Optional) Run side-effects based on classification — see Step 7.6.

---

### Step 7.6 — Side-effects on classification

Depending on `classification`, update related records:

| Classification | Action |
|----------------|--------|
| **interested** | Update `leads.status = 'interested'`; send notification (Step 7.11). |
| **not_interested** | Update `leads.status = 'not_interested'`; stop sequence (`sequences.is_complete = true`, `stopped_reason = 'replied'`). |
| **bounce** | Update `leads.status = 'bounced'`; stop sequence; optionally mark related `emails` row as `bounced`. |
| **out_of_office** | No lead change; optionally send notification or ignore. |
| **question** | Update `leads.status = 'replied'` (or keep as-is); send notification. |
| **other** | No auto-update; let user classify manually. |

Also: for any inbound reply, the DB trigger in `001_initial_schema.sql` (`stop_sequence_on_reply`) already sets `leads.status = 'replied'` and stops the sequence. Make sure the trigger doesn't conflict with your manual updates (e.g. trigger sets 'replied', then your code sets 'interested' — that's fine).

---

## Part B: Inbox Page

### Step 7.7 — Inbox page shell

- **File:** `app/(dashboard)/inbox/page.tsx`
- **Behavior:**
  - Server component. `metadata = { title: 'Inbox | LeadPilot' }`.
  - Fetch threads via `GET /api/inbox` (or server-side Supabase).
  - Pass threads to list UI. Optionally support filters: `?classification=interested`, `?is_read=false`, etc.

---

### Step 7.8 — Thread list UI

- **List:** For each thread, show: from (lead name or email), subject (or snippet), classification badge (interested, question, etc.), date, read/unread indicator.
- **Click:** Navigate to thread detail `/inbox/[threadId]` or open a slide-over panel (client component).
- **Actions (optional):** Archive, star, mark read/unread.

---

### Step 7.9 — Thread detail page

- **File:** `app/(dashboard)/inbox/[threadId]/page.tsx`
- **Behavior:**
  - Load messages via `GET /api/inbox/[threadId]` (or server-side by `thread_id`).
  - Show messages in chronological order (oldest first or newest first — your choice). For each: from, date, body (render HTML safely or show text), classification if inbound.
  - Show lead info (link to lead detail) and campaign if matched.
  - At the bottom: **reply composer** (Step 7.10).
- **Mark as read:** On open, call PATCH to set `is_read = true` for unread messages in the thread (or do it in the GET/server).

---

## Part C: Reply Composer

### Step 7.10 — Implement reply send

- **File:** `app/api/inbox/[threadId]/reply/route.ts` (replace stub).
- **Body:** `{ body: string; to_email: string; subject?: string }`. Optionally `email_account_id` (or pick from thread).
- **Flow:**
  1. Load the thread (get the first message's `email_account_id` and `thread_id`). Load `email_accounts` row to send from.
  2. Build In-Reply-To / References from the last inbound message's `message_id`.
  3. Call `sendEmail(...)` (from Step 6) with account, to_email, subject (default "Re: {original_subject}"), body, inReplyTo, references.
  4. On success: insert into `inbox_messages` with `direction: 'outbound'`, `from_email` (account), `to_email`, subject, body, `message_id` (from send result), `in_reply_to`, `thread_id`, `received_at: now()` (or `sent_at`), `is_read: true`.
  5. Return success or error.
- **UI:** In the thread detail, a textarea + "Send" button. On send, POST to `/api/inbox/[threadId]/reply`, then refresh thread or append the new message.

---

## Part D: Manual Classification & Bulk Actions

### Step 7.11 — Manual classification UI

- On thread detail (or message row), allow user to change classification: dropdown or buttons (Interested, Not Interested, Question, Bounce, Other). On change: call `PATCH /api/inbox/[threadId]/classify` with `{ message_id, classification }`. Optionally run the same side-effects as auto-classification (Step 7.6).

---

### Step 7.12 — Bulk actions (optional)

- On inbox list: checkboxes, then "Archive selected" / "Mark read" / "Mark unread". Call a batch API (e.g. `PATCH /api/inbox/bulk` with `{ ids: [...], action: 'archive' }`) or loop over single updates.

---

## Part E: Notifications

### Step 7.13 — Create notification on important events

- **When:** After auto-classification, if `classification` in (`interested`, `question`, `bounce`), or for any new reply.
- **Insert into `notifications`:**
  - `org_id`, `user_id` (owner or all users with notification pref), `type` = `'reply_received'` or `'positive_reply'` or `'bounce'`, `title` = "New reply from {lead}", `message` = snippet, `campaign_id`, `lead_id`, `inbox_message_id`, `action_url` = `/inbox/{threadId}`.
- **Who:** Notify users in the org who have `notification_preferences.email_replies = true` (or `browser_push`, etc.).

---

### Step 7.14 — Show notifications in UI

- The sidebar already has a bell icon with a red dot. Wire it to:
  - `GET /api/notifications` — list unread notifications for the current user.
  - On click: open a dropdown or page with notifications; mark as read on view.
  - Each notification links to its `action_url`.
- **API:** Add `app/api/notifications/route.ts` with GET (list) and PATCH (mark read).

---

### Step 7.15 — Email notification (optional)

- For users with `notification_preferences.email_replies = true`, send an email (via a system email account or transactional service like SendGrid/Postmark) summarizing the reply. Or batch into a daily digest.

---

## Checklist (summary)

- [ ] **7.1** `src/lib/email/imap.ts` — `fetchNewEmails(account)` returns parsed messages via IMAP; supports OAuth and custom creds.
- [ ] **7.2** Sync job: Trigger.dev or cron; loops over active accounts, fetches, processes.
- [ ] **7.3** Match inbound to lead/campaign via In-Reply-To/References or from_email; assign thread_id.
- [ ] **7.4** Insert into `inbox_messages` with direction='inbound', handle duplicates by message_id.
- [ ] **7.5** Auto-classify with Claude (`classifyReplyPrompt` + call Claude); store classification, confidence.
- [ ] **7.6** Side-effects: update lead status, stop sequence on bounce/not_interested; create notification on interested/question/bounce.
- [ ] **7.7** `app/(dashboard)/inbox/page.tsx` — fetch and display thread list.
- [ ] **7.8** Thread list UI: from, subject, snippet, classification badge, date, unread indicator; click → detail.
- [ ] **7.9** `app/(dashboard)/inbox/[threadId]/page.tsx` — messages in order, lead/campaign link, reply composer; mark read.
- [ ] **7.10** Reply: POST `/api/inbox/[threadId]/reply` sends via SMTP, inserts outbound `inbox_messages`, returns success.
- [ ] **7.11** Manual classification: dropdown; PATCH classify; optional side-effects.
- [ ] **7.12** (Optional) Bulk archive/read/unread.
- [ ] **7.13** Notifications: insert on reply/classification; `notifications` table.
- [ ] **7.14** `GET /api/notifications`, PATCH mark read; UI dropdown or page.
- [ ] **7.15** (Optional) Email/push notifications.

After this, you have a working Inbox: replies are synced from IMAP, matched to leads, auto-classified, viewable in threads, and users can reply and receive notifications.
