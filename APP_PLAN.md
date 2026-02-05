# LeadPilot — App Plan: What We Have & What We Need

**Last updated:** Feb 4, 2025

This document summarizes the current state of LeadPilot and what remains to build, aligned with the README phases and architecture.

---

## 1. What We Have

### 1.1 Foundation ✅

| Item | Status | Notes |
|------|--------|--------|
| **Project structure** | ✅ | Next.js 14 App Router, `app/` at root, `src/lib` + `src/types` |
| **Database schema** | ✅ | `001_initial_schema.sql` — orgs, users, email_accounts, campaigns, leads, sequences, emails, inbox_messages, notifications, scraping_jobs; RLS, triggers, indexes |
| **Supabase** | ✅ | Client in `src/lib/supabase/server.ts`, middleware in `src/lib/supabase/middleware.ts` |
| **Auth** | ✅ | Session via Supabase; middleware protects routes; signout at `POST /api/auth/signout` |
| **Dashboard layout** | ✅ | `app/layout.tsx` — sidebar (Campaigns, Leads, Sequences, Inbox, Email Accounts, Settings), user block, bell icon |
| **Login page** | ⚠️ | `app/login/page.tsx` exists but is placeholder (“Configure Supabase Auth…”) — no actual email/OAuth UI |
| **Environment** | ✅ | `env.example` documents Supabase, Anthropic, Apify, encryption, OAuth, Trigger, app URL |

### 1.2 API Routes (skeleton vs implemented)

| Route | GET | POST | PATCH | DELETE | Implementation |
|-------|-----|------|-------|--------|-----------------|
| **Campaigns** | ✅ | ✅ | ✅ | ✅ | Full CRUD; `[id]/start`, `[id]/leads` exist |
| **Leads** | — | — | ✅ | — | `[id]` GET/PATCH; **CSV import** ✅ (parsing + insert); **Google Sheets** route exists (not verified) |
| **Sequences** | ✅ | — | ✅ | — | `generate` POST exists; **Claude not wired** — returns “pending” + prompt preview |
| **Email accounts** | ✅ | ✅ | — | — | List + insert; **no OAuth/encryption** — raw body insert |
| **Email account [id]** | — | — | — | — | `test`, `sync` routes exist (implementation not verified) |
| **Inbox** | ✅ | — | — | — | List threads; `[threadId]` GET, `reply` POST, `classify` PATCH |
| **Scraping** | — | ✅ | — | — | `linkedin`, `apollo` POST return “pending”; `jobs/[id]` GET |
| **Webhooks** | — | ✅ | — | — | `api/webhooks/apify` POST exists |

### 1.3 Frontend Pages

| Route | Exists | Notes |
|-------|--------|--------|
| `/` (Campaigns) | ✅ | `app/page.tsx` — list campaigns, stats, table, links to `/campaigns/new` and `/campaigns/[id]` |
| `/login` | ✅ | Placeholder only |
| `/leads` | ❌ | In nav only — no `app/leads/page.tsx` |
| `/sequences` | ❌ | In nav only — no `app/sequences/page.tsx` |
| `/inbox` | ❌ | In nav only — no `app/inbox/page.tsx` |
| `/email-accounts` | ❌ | In nav only — no `app/email-accounts/page.tsx` |
| `/settings` | ❌ | In nav only — no `app/settings/page.tsx` |
| `/campaigns/new` | ❌ | Linked from UI — no create campaign page |
| `/campaigns/[id]` | ❌ | Linked from table — no campaign detail page |

### 1.4 Lib & Backend Logic

| Area | Status | Notes |
|------|--------|--------|
| **Supabase** | ✅ | Server client, middleware for session |
| **Sequence prompt** | ✅ | `src/lib/sequences/prompt.ts` — builds Claude prompt from business context + lead |
| **Utils** | ✅ | `src/lib/utils/index.ts` (e.g. formatDate, formatNumber, percentage) |
| **Types** | ✅ | `src/types/database.ts` (Supabase-generated or hand-typed) |
| **Claude/LLM** | ❌ | No `src/lib/claude/` — sequence generate does not call Anthropic |
| **Email (IMAP/SMTP)** | ❌ | No `src/lib/email/` — nodemailer/imap in package.json but not used in lib |
| **Apify** | ❌ | No `src/lib/apify/` — scraping routes are stubs |
| **Encryption** | ❌ | No `src/lib/encryption/` — credentials not encrypted |
| **Trigger.dev jobs** | ❌ | `trigger.config.ts` points to `./src/jobs` but **`src/jobs/` does not exist** |

### 1.5 Data & Config

| Item | Status |
|------|--------|
| **Seed** | `supabase/seed.sql` present |
| **Business context sample** | `data/business-context-bionixus.json` |
| **002_simplified_schema.sql** | Present (relationship to 001 unclear; may be alternate or migration) |

---

## 2. What We Need (by README phase)

### Phase 2: Lead Management

| Need | Priority | Notes |
|------|----------|--------|
| **Leads list page** | High | `app/leads/page.tsx` — table, filters, link to campaign |
| **Lead detail view** | Medium | e.g. `app/leads/[id]/page.tsx` |
| **CSV import UI** | High | Form to upload CSV + pick campaign; call existing `POST /api/leads/import/csv` |
| **Google Sheets integration** | Medium | Implement or verify `POST /api/leads/import/google-sheets` (OAuth + fetch sheet) |

### Phase 3: Email Accounts

| Need | Priority | Notes |
|------|----------|--------|
| **Email accounts page** | High | `app/email-accounts/page.tsx` — list, add, disconnect, test |
| **Google OAuth (Gmail)** | High | Auth callback, store tokens; use encryption for tokens |
| **Microsoft OAuth (Outlook)** | High | Same as Google |
| **Generic IMAP/SMTP** | Medium | Form for host/port/credentials; encrypt and store |
| **Encryption lib** | High | `src/lib/encryption/` — encrypt/decrypt credentials (ENCRYPTION_KEY) |
| **Connection test** | Medium | Implement `POST /api/email-accounts/[id]/test` (SMTP/IMAP check) |

### Phase 4: AI Sequences

| Need | Priority | Notes |
|------|----------|--------|
| **Claude integration** | High | `src/lib/claude/` — call Anthropic in `POST /api/sequences/generate`, parse JSON, insert into `sequences` |
| **Business context form** | High | Settings (or onboarding) — form to fill org `business_context` |
| **Sequences page** | High | `app/sequences/page.tsx` — list by campaign/lead, “Generate” action |
| **Sequence editor** | Medium | View/edit steps (subject, body, delay); PATCH `api/sequences/[id]` |

### Phase 5: Email Sending

| Need | Priority | Notes |
|------|----------|--------|
| **SMTP sending** | High | Use nodemailer + credentials from `email_accounts` (decrypt); send from API or Trigger job |
| **Scheduling** | High | Use `emails.scheduled_for`; Trigger job or cron to send when due |
| **Rate limiting / warmup** | Medium | Respect `daily_send_limit`, `warmup_*` on email_accounts |
| **Bounce handling** | Medium | Parse bounce from IMAP or webhook; update `emails` + `leads` |

### Phase 6: Inbox CRM

| Need | Priority | Notes |
|------|----------|--------|
| **IMAP sync** | High | Trigger job (or API) to fetch from connected accounts → `inbox_messages` |
| **Inbox page** | High | `app/inbox/page.tsx` — thread list, filters |
| **Thread view** | High | `app/inbox/[threadId]/page.tsx` — messages + reply composer |
| **Reply composer** | High | POST to `api/inbox/[threadId]/reply` (use SMTP for sending) |
| **Classification** | Medium | Optional LLM or rules for `classification` on inbound messages |

### Phase 7: Scraping

| Need | Priority | Notes |
|------|----------|--------|
| **Apify client** | High | `src/lib/apify/` — start runs, poll status |
| **LinkedIn job** | High | Implement `POST /api/scraping/linkedin` — start actor, insert `scraping_jobs`, return job id |
| **Apollo job** | Medium | Same for Apollo actor |
| **Webhook** | Medium | `POST /api/webhooks/apify` — receive completion, create leads, update job |
| **Trigger jobs** | Medium | Optional: run Apify from `src/jobs` and process results |

### Phase 8: Polish

| Need | Priority | Notes |
|------|----------|--------|
| **Campaign create/detail** | High | `app/campaigns/new/page.tsx`, `app/campaigns/[id]/page.tsx` — name, source, settings, start |
| **Settings page** | High | `app/settings/page.tsx` — org name, business context, notification prefs |
| **Real login/signup** | High | Email + password and/or OAuth buttons; Supabase Auth UI or custom |
| **Auth callback routes** | High | e.g. `app/api/auth/callback/google`, Microsoft — create/link user + org |
| **Analytics dashboard** | Low | Charts (recharts already in deps) on campaign/lead stats |
| **Billing (Stripe)** | Low | Subscription tiers, usage, webhooks |

---

## 3. Suggested Build Order

1. **Auth & core pages**  
   Login/signup (and OAuth callbacks), then Settings (org + business context). Ensures every user has an org and context for sequences.

2. **Campaigns**  
   Create campaign (`/campaigns/new`) and campaign detail (`/campaigns/[id]`) so campaigns can be created and configured before leads.

3. **Leads**  
   Leads list + CSV import UI; optional lead detail. Gets leads into the system and attached to campaigns.

4. **Email accounts**  
   Encryption lib → Email accounts page → Gmail/Outlook OAuth (or custom IMAP/SMTP). Required before any sending or inbox sync.

5. **AI sequences**  
   Claude lib → wire `POST /api/sequences/generate` → Sequences page + simple editor. Enables generating and editing sequences per lead.

6. **Sending**  
   SMTP send (API or Trigger), scheduling job, respect limits/warmup. Makes sequences actionable.

7. **Inbox**  
   IMAP sync job → Inbox page + thread view + reply. Closes the loop for replies.

8. **Scraping**  
   Apify lib + LinkedIn/Apollo routes + webhook. Optional but completes lead acquisition.

9. **Polish**  
   Notifications, analytics, billing as needed.

---

## 4. Quick Reference: Gaps

- **Missing pages:** `/leads`, `/sequences`, `/inbox`, `/email-accounts`, `/settings`, `/campaigns/new`, `/campaigns/[id]`.
- **Login:** Placeholder only; need real auth + OAuth callbacks.
- **Missing lib:** `src/lib/claude/`, `src/lib/email/`, `src/lib/apify/`, `src/lib/encryption/`.
- **Missing jobs:** `src/jobs/` (Trigger.dev) — send, IMAP sync, optional Apify.
- **Stub APIs:** Sequence generate (no Claude), scraping (no Apify), email accounts (no OAuth/encryption).

Use this plan to tick off items as you implement them and to keep README phases and ARCHITECTURE.md in sync.
