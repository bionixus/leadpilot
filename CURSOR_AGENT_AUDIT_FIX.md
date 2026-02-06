# LeadPilot — Full Audit Fix Plan for Cursor AI Agent

You are tasked with fixing all bugs, security vulnerabilities, and code quality issues found during a comprehensive audit of the LeadPilot codebase. This is a Next.js 14 SaaS application for AI-powered cold outreach automation, using Supabase (PostgreSQL), Anthropic Claude, IMAP/SMTP email, Apify web scraping, Stripe billing, and Trigger.dev background jobs.

Work through each scenario sequentially. After completing each fix, verify there are no TypeScript errors introduced. Do NOT break existing functionality. Commit after each scenario with a descriptive message.

---

## SCENARIO 1: Fix Mass Assignment Vulnerability (CRITICAL SECURITY)

### Problem
`app/api/campaigns/route.ts` line 35 spreads the raw request body into the database insert:
```ts
.insert({ org_id: orgId, ...body })
```
An attacker can overwrite any column (`id`, `org_id` of another tenant, `status`, `created_at`, etc.).

### Files to Fix
- `app/api/campaigns/route.ts` — POST handler

### Instructions
1. Import `z` from `zod` (already installed).
2. Create a `createCampaignSchema`:
```ts
const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  settings: z.record(z.unknown()).optional(),
  llm_context: z.record(z.unknown()).optional(),
  email_account_id: z.string().uuid().optional().nullable(),
});
```
3. Parse the body with `safeParse`, return 400 on failure.
4. Use `parsed.data` (not `body`) in the insert.
5. Do NOT add fields, comments, or changes beyond what is needed.

---

## SCENARIO 2: Fix Non-Existent `messages` Table References (CRITICAL BUG)

### Problem
Multiple files query `supabase.from('messages')` but this table does not exist in the database schema. The actual tables are `inbox_messages` (received/sent messages) and `sent_emails` (campaign emails). This causes runtime crashes.

### Files to Fix
1. `src/lib/agent/orchestrator.ts` line 253 — `.from('messages')` in `checkForWork()`
2. `src/jobs/agent-orchestrator.ts` line 133 — `.from('messages')` in `checkForNewWork()`
3. `src/jobs/agent-orchestrator.ts` line 418 — `.from('messages')` in `processSendMessage()`
4. `src/jobs/agent-orchestrator.ts` line 623 — `.from('messages')` in `sendScheduledMessagesTask`
5. `src/jobs/agent-orchestrator.ts` line 644 — `.from('messages')` update
6. `src/jobs/agent-orchestrator.ts` line 658 — `.from('messages')` update
7. `src/jobs/agent-orchestrator.ts` line 680 — `.from('messages')` update
8. `src/lib/stripe/limits.ts` line 44 — `.from('emails')` in `checkOrgLimits()`

### Instructions
1. First, read `supabase/migrations/001_foundation.sql` to confirm the actual table names and columns.
2. Read `src/types/database.ts` to see the generated Supabase types.
3. For the orchestrator follow-up checks (items 1-2): These query for sent messages that haven't been replied to, older than 3 days. Map to the correct table and column names (likely `sent_emails` or `inbox_messages` with `direction = 'outbound'`).
4. For the scheduled message sender (items 3-7): This is the campaign email sending pipeline. It queries for messages with `status = 'scheduled'` and `scheduled_for <= now()`. Map to the correct table.
5. For the Stripe limits check (item 8): This counts sent emails this month. Map to the correct table with correct column names.
6. Adjust all column references (`status`, `sent_at`, `scheduled_for`, `lead_id`, `retry_count`, `channel`, etc.) to match the actual schema.

---

## SCENARIO 3: Fix Microsoft OAuth Token URL (CRITICAL BUG)

### Problem
Two files use `app.microsoftonline.com` instead of `login.microsoftonline.com`. All Microsoft/Outlook OAuth token refreshes fail.

### Files to Fix
1. `src/lib/email/send.ts` line 62
2. `src/lib/email/imap.ts` line 86

### Instructions
1. In both files, replace:
   - `'https://app.microsoftonline.com/common/oauth2/v2.0/token'`
   - with `'https://login.microsoftonline.com/common/oauth2/v2.0/token'`

2. Then extract the duplicated OAuth refresh logic into a shared module:
   - Create `src/lib/email/oauth.ts`
   - Move the token refresh function there
   - The shared function must persist the refreshed token back to the database (the `send.ts` version does this but `imap.ts` does not — both must persist)
   - Update both `send.ts` and `imap.ts` to import from `oauth.ts`
   - Remove the duplicated functions from both files

---

## SCENARIO 4: Fix CSV Parser to Use PapaParse (BUG)

### Problem
`app/api/leads/import/csv/route.ts` lines 20-25 use naive `line.split(',')` which breaks on quoted fields containing commas (e.g., `"Acme, Inc."`). PapaParse is already installed as a dependency.

### File to Fix
- `app/api/leads/import/csv/route.ts`

### Instructions
1. Import PapaParse: `import Papa from 'papaparse';`
2. Replace lines 20-38 with:
```ts
const text = await file.text();
const parsed = Papa.parse<Record<string, string>>(text, {
  header: true,
  skipEmptyLines: true,
  transformHeader: (h: string) => h.trim(),
});

if (parsed.errors.length > 0) {
  return NextResponse.json(
    { error: 'CSV parsing failed', details: parsed.errors.slice(0, 5) },
    { status: 400 }
  );
}

const rows = parsed.data.map((obj) => ({
  org_id: orgId,
  campaign_id: campaignId ?? null,
  email: obj.email ?? obj.Email ?? '',
  first_name: obj.first_name ?? obj['First Name'] ?? null,
  last_name: obj.last_name ?? obj['Last Name'] ?? null,
  company: obj.company ?? obj.Company ?? null,
  job_title: obj.job_title ?? obj['Job Title'] ?? null,
  linkedin_url: obj.linkedin_url ?? obj.linkedin ?? null,
  phone: obj.phone ?? null,
  location: obj.location ?? null,
}));
```
3. Remove the old manual CSV parsing code (the `lines`, `headers`, `values` logic).

---

## SCENARIO 5: Fix IMAP Race Condition (BUG)

### Problem
In `src/lib/email/imap.ts` lines 231-316, the IMAP fetch's `end` event calls `imap.end()`, triggering `resolve(emails)`. But `msg.once('end')` handlers contain `await simpleParser(buffer)` which is async — the Promise may resolve before all emails are parsed.

### File to Fix
- `src/lib/email/imap.ts`

### Instructions
Replace the fetch event handling section (starting from `const fetch = imap.fetch(...)` through `fetch.once('end', ...)`) with:

```ts
const fetch = imap.fetch(limitedUids, {
  bodies: '',
  struct: true,
});

const parsePromises: Promise<void>[] = [];

fetch.on('message', (msg) => {
  let uid = 0;
  let buffer = '';

  msg.on('body', (stream) => {
    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
    });
  });

  msg.once('attributes', (attrs) => {
    uid = attrs.uid;
  });

  const parsePromise = new Promise<void>((resolveMsg) => {
    msg.once('end', async () => {
      try {
        const parsed: ParsedMail = await simpleParser(buffer);
        const from = extractAddresses(parsed.from);
        const to = extractAddresses(parsed.to);
        const cc = extractAddresses(parsed.cc);

        const references: string[] = [];
        if (parsed.references) {
          if (Array.isArray(parsed.references)) {
            references.push(...parsed.references);
          } else {
            references.push(parsed.references);
          }
        }

        const attachments = (parsed.attachments || []).map((att) => ({
          filename: att.filename || 'attachment',
          mimeType: att.contentType || 'application/octet-stream',
          size: att.size || 0,
        }));

        emails.push({
          messageId: parsed.messageId || null,
          inReplyTo: parsed.inReplyTo || null,
          references,
          from: from[0] || { address: 'unknown', name: null },
          to,
          cc,
          subject: parsed.subject || null,
          bodyText: parsed.text || null,
          bodyHtml: parsed.html || null,
          date: parsed.date || null,
          attachments,
          uid,
        });
      } catch (parseErr) {
        console.error('Failed to parse email:', parseErr);
      } finally {
        resolveMsg();
      }
    });
  });
  parsePromises.push(parsePromise);
});

fetch.once('error', (fetchErr: Error) => {
  imap.end();
  reject(new Error(`Fetch failed: ${fetchErr.message}`));
});

fetch.once('end', async () => {
  await Promise.all(parsePromises);
  imap.end();
});
```

Also remove the unused `seqno` parameter from the `fetch.on('message', (msg, seqno) =>` callback — change to `(msg)`.

---

## SCENARIO 6: Add Email Threading Headers to Campaign Start (BUG)

### Problem
`app/api/campaigns/[id]/start/route.ts` lines 140-158 compute `prevMessageId` but never use it for threading. Follow-up emails appear as separate conversations.

### File to Fix
- `app/api/campaigns/[id]/start/route.ts`

### Instructions
1. Add `in_reply_to` and `references_header` to the emailRows type and push:
```ts
emailRows.push({
  // ...existing fields...
  message_id: msgId,
  in_reply_to: email.step > 1 ? prevMessageId : null,
  references_header: email.step > 1 && prevMessageId ? prevMessageId : null,
  scheduled_for: email.scheduledFor.toISOString(),
  status: 'scheduled',
});
prevMessageId = msgId;
```
2. Update the `emailRows` type definition to include `in_reply_to: string | null` and `references_header: string | null`.
3. Check if the target database table has these columns. If not, create a new migration file in `supabase/migrations/` to add them:
```sql
ALTER TABLE sent_emails ADD COLUMN IF NOT EXISTS in_reply_to text;
ALTER TABLE sent_emails ADD COLUMN IF NOT EXISTS references_header text;
```
(Use the actual table name from migration 001.)

---

## SCENARIO 7: Fix Warmup Day 0 Bug (BUG)

### Problem
`src/lib/email/schedule.ts` line 163:
```ts
const warmupLimit = Math.min(10 + (account.warmup_day - 1) * 10, account.daily_send_limit);
```
When `warmup_day` is 0 (default for new accounts), this evaluates to `10 + (-10) = 0`, blocking all emails.

### File to Fix
- `src/lib/email/schedule.ts` line 163

### Instructions
Replace:
```ts
const warmupLimit = Math.min(10 + (account.warmup_day - 1) * 10, account.daily_send_limit);
```
With:
```ts
const warmupLimit = Math.min(10 * Math.max(1, account.warmup_day), account.daily_send_limit);
```
This gives: Day 0 or 1 → 10 emails, Day 2 → 20, Day 3 → 30, etc.

---

## SCENARIO 8: Implement Stub Email/SMS Send Functions (BUG)

### Problem
`src/jobs/agent-orchestrator.ts` lines 696-704, `sendEmailMessage()` and `sendMessagingMessage()` are stubs returning fake success. The `sendScheduledMessagesTask` (runs every 5 min) marks messages as "sent" with fake messageIds without actually sending anything.

### File to Fix
- `src/jobs/agent-orchestrator.ts`

### Instructions
1. Import the real send function at the top:
```ts
import { sendEmail } from '@/lib/email/send';
```

2. Replace `sendEmailMessage`:
```ts
async function sendEmailMessage(message: any): Promise<any> {
  const lead = message.leads;
  const emailAccount = message.email_accounts;

  if (!lead?.email || !message.email_account_id) {
    return { success: false, error: 'Missing recipient email or sender account' };
  }

  const result = await sendEmail({
    accountId: message.email_account_id,
    to: lead.email,
    subject: message.subject || '',
    bodyText: message.body_text || '',
    bodyHtml: message.body_html || undefined,
    messageId: message.message_id || undefined,
    inReplyTo: message.in_reply_to || undefined,
    references: message.references_header || undefined,
  });

  return {
    success: result.success,
    messageId: result.messageId,
    error: result.error,
  };
}
```

3. For `sendMessagingMessage`, check if `src/lib/messaging/twilio.ts` has a send function and wire it up similarly. If it's also a stub, leave a clear TODO with the expected interface.

---

## SCENARIO 9: Fix Agent Background Job Auth for Internal API Calls (SECURITY)

### Problem
`src/jobs/agent-orchestrator.ts` lines 303, 375, 429, 491 call internal API routes via `fetch()` without auth headers. These either return 401 or bypass tenant isolation.

### File to Fix
- `src/jobs/agent-orchestrator.ts`

### Instructions
Replace HTTP fetch calls with direct library imports. The background jobs already have a Supabase admin client, so they should call the underlying functions directly:

1. **Line 303 — `processClassifyReply`**: Instead of fetching `/api/llm/classify`, import and use the LLM provider directly:
```ts
import { getLLMProvider } from '@/lib/llm';

// Inside processClassifyReply:
const provider = getLLMProvider('anthropic');
const classification = await provider.classifyReply(
  reply_content,
  original_outreach
);
```

2. **Line 375 — `processRespondToReply`**: Instead of fetching `/api/llm/generate-response`, use the LLM provider's chat method directly to generate the response.

3. **Line 429 — `processSendMessage`**: Instead of fetching `/api/messages/send`, use `sendEmail` from `src/lib/email/send.ts` directly (as done in Scenario 8).

4. **Line 491 — `processGenerateSequence`**: Instead of fetching `/api/sequences/generate`, import `generateSequence` from `src/lib/claude` and call it directly.

For each replacement, pass the necessary data (org_id, lead info, etc.) directly to the function rather than through HTTP.

---

## SCENARIO 10: Add Rate Limiting to API Routes (SECURITY)

### Files to Create
- `src/lib/rate-limit.ts`

### Files to Update
- Key API routes (start with the most abuse-prone):
  - `app/api/sequences/generate/route.ts` — LLM calls (expensive)
  - `app/api/leads/import/csv/route.ts` — bulk operations
  - `app/api/scraping/linkedin/route.ts` — external API calls
  - `app/api/scraping/apollo/route.ts`
  - `app/api/scraping/google-maps/route.ts`
  - `app/api/agent/start/route.ts`
  - `app/api/inbox/[threadId]/reply/route.ts` — email sending

### Instructions
1. Create `src/lib/rate-limit.ts` with a simple in-memory sliding window rate limiter:

```ts
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1 };
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: entry.resetAt - now,
    };
  }

  entry.count++;
  return { allowed: true, remaining: config.maxRequests - entry.count };
}
```

2. In each target route, add at the top of the handler (after auth check):
```ts
import { checkRateLimit } from '@/lib/rate-limit';

// After getting user:
const rateLimit = checkRateLimit(`${user.id}:sequences-generate`, {
  windowMs: 60_000,
  maxRequests: 10,
});
if (!rateLimit.allowed) {
  return NextResponse.json(
    { error: 'Too many requests' },
    {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((rateLimit.retryAfterMs || 60000) / 1000)) },
    }
  );
}
```

3. Use these limits:
   - LLM generation: 10 req/min
   - Bulk import: 5 req/min
   - Scraping: 10 req/min
   - Email sending: 30 req/min
   - Agent start/stop: 5 req/min

---

## SCENARIO 11: Add Zod Validation to POST/PATCH Endpoints (SECURITY)

### Files to Update
Apply Zod validation to these endpoints (Zod is already installed):

1. `app/api/campaigns/[id]/route.ts` — PATCH:
```ts
const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
  settings: z.record(z.unknown()).optional(),
  llm_context: z.record(z.unknown()).optional(),
  email_account_id: z.string().uuid().optional().nullable(),
}).strict();
```

2. `app/api/sequences/generate/route.ts` — POST:
```ts
const generateSequenceSchema = z.object({
  campaign_id: z.string().uuid(),
  lead_id: z.string().uuid(),
});
```

3. `app/api/agent/rules/route.ts` — POST:
```ts
const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  rule_type: z.enum(['filter', 'constraint', 'escalation', 'automation']),
  condition: z.string().min(1),
  condition_json: z.record(z.unknown()).optional(),
  action: z.string().min(1),
  priority: z.number().int().min(0).max(100).optional(),
  is_enabled: z.boolean().optional(),
});
```

4. `app/api/agent/tasks/route.ts` — POST:
```ts
const createTaskSchema = z.object({
  task_type: z.string().min(1),
  input_data: z.record(z.unknown()).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  lead_id: z.string().uuid().optional().nullable(),
  campaign_id: z.string().uuid().optional().nullable(),
  scheduled_for: z.string().datetime().optional(),
  requires_approval: z.boolean().optional(),
});
```

5. `app/api/inbox/[threadId]/reply/route.ts` — POST:
```ts
const replySchema = z.object({
  body: z.string().min(1).max(50000),
  subject: z.string().max(500).optional(),
  to_email: z.string().email(),
});
```

### Instructions
For each file:
1. Import `z` from `zod`.
2. Define the schema above the handler function.
3. Parse with `safeParse` and return 400 with error details on failure.
4. Use `parsed.data` instead of raw `body` for all downstream operations.
5. Use `.strict()` where appropriate to reject unknown fields.

---

## SCENARIO 12: Fix PostgREST Filter Injection (SECURITY)

### Problem
`app/api/leads/route.ts` line 44-45 injects user search input into a PostgREST filter string. Only `%` is escaped, but PostgREST operators (`.`, `,`, `(`, `)`) are not.

### File to Fix
- `app/api/leads/route.ts`

### Instructions
Replace the search filter construction (lines 43-46) with properly escaped values:

```ts
if (search && search.length > 0) {
  // Escape PostgREST special characters in the search term
  const escaped = search
    .replace(/%/g, '\\%')
    .replace(/\\/g, '\\\\');
  const term = `%${escaped}%`;
  // Use individual filter calls instead of raw string interpolation
  query = query.or(
    `email.ilike.${encodeURIComponent(term)},first_name.ilike.${encodeURIComponent(term)},last_name.ilike.${encodeURIComponent(term)},company.ilike.${encodeURIComponent(term)}`
  );
}
```

---

## SCENARIO 13: Add Task Locking for Agent Concurrency (BUG)

### Problem
The agent orchestrator runs every minute via cron. Multiple invocations can process the same pending task simultaneously, leading to duplicate actions (double-sending emails, etc.).

### Files to Create
- `supabase/migrations/009_claim_agent_task.sql`

### Files to Fix
- `src/jobs/agent-orchestrator.ts` — `processAgentTasks()` function

### Instructions
1. Create migration `supabase/migrations/009_claim_agent_task.sql`:
```sql
CREATE OR REPLACE FUNCTION claim_next_agent_task(p_org_id uuid, p_limit int DEFAULT 5)
RETURNS SETOF agent_tasks AS $$
  UPDATE agent_tasks
  SET status = 'running', started_at = now()
  WHERE id IN (
    SELECT id FROM agent_tasks
    WHERE org_id = p_org_id
      AND status = 'pending'
      AND scheduled_for <= now()
    ORDER BY priority DESC, created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql;
```

2. In `src/jobs/agent-orchestrator.ts`, replace the `processAgentTasks` function:
```ts
async function processAgentTasks(agent: any): Promise<number> {
  const { data: tasks, error } = await supabase.rpc('claim_next_agent_task', {
    p_org_id: agent.org_id,
    p_limit: 5,
  });

  if (error || !tasks || tasks.length === 0) {
    return 0;
  }

  for (const t of tasks) {
    await processAgentTaskTrigger.trigger({
      task_id: t.id,
      org_id: agent.org_id,
      agent_config_id: agent.id,
    });
  }

  return tasks.length;
}
```

---

## SCENARIO 14: Fix Hardcoded LLM Model in Sequence Generation (BUG)

### Problem
`app/api/sequences/generate/route.ts` lines 74 and 100 hardcode `'claude-sonnet-4-20250514'` instead of using the organization's configured LLM provider and model.

### File to Fix
- `app/api/sequences/generate/route.ts`

### Instructions
1. Import the org LLM provider utility:
```ts
import { getLLMProviderForOrg } from '@/lib/llm';
```

2. After fetching the org data, get the configured provider:
```ts
const llmProvider = await getLLMProviderForOrg(supabase, campaignOrgId);
```

3. Replace the `generateSequence(prompt)` call with the provider's method, or pass the provider info to `generateSequence`.

4. Replace the hardcoded `'claude-sonnet-4-20250514'` in both the update and insert with the actual model used:
```ts
llm_model: llmProvider.name, // or the actual model ID returned from the generation
```

---

## FINAL CHECKLIST

After completing all scenarios:
1. Run `npx tsc --noEmit` to verify no TypeScript errors.
2. Search the entire codebase for any remaining `as never` casts and assess if they hide real type issues.
3. Verify all Supabase table references match the actual migration schema.
4. Ensure no `.env` secrets are committed (check `.gitignore`).
5. Run `npx next build` to verify the build succeeds.
