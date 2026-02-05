# LeadPilot Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                         │
├─────────────────────────────────────────────────────────────────────┤
│  Dashboard │ Lead Lists │ Sequences │ Inbox/CRM │ Settings │ Auth   │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND (Next.js API + Trigger.dev)              │
├─────────────────────────────────────────────────────────────────────┤
│  Lead Import │ Apify Jobs │ LLM Sequences │ Email Send │ IMAP Sync │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
              ┌──────────┐  ┌───────────┐  ┌──────────────┐
              │ Supabase │  │ Apify API │  │ Claude API   │
              │ (DB+Auth)│  │ (Scraping)│  │ (Sequences)  │
              └──────────┘  └───────────┘  └──────────────┘
                    │
                    ▼
              ┌───────────────────────────────────────┐
              │  Client Email Accounts (IMAP/SMTP)    │
              │  Gmail, Outlook, Custom SMTP          │
              └───────────────────────────────────────┘
```

## Frontend (Next.js App Router)

| Area | Purpose |
|------|--------|
| **Dashboard** | Campaigns overview, stats, quick actions |
| **Lead Lists** | Lead management, CSV/Sheets import, list views |
| **Sequences** | AI sequence editor, steps, scheduling |
| **Inbox/CRM** | Thread view, reply composer, classification |
| **Settings** | Org, business context, notification prefs |
| **Auth** | Login, signup, OAuth (Google/Microsoft), sign out |

Implemented via: `layout.tsx` (sidebar nav), pages under dashboard routes, Supabase Auth + middleware.

## Backend (Next.js API + Trigger.dev)

| Capability | Description |
|------------|-------------|
| **Lead Import** | CSV upload, Google Sheets sync; can enqueue Trigger jobs for heavy work |
| **Apify Jobs** | LinkedIn/Apollo/Google Maps scraping; jobs defined in `src/jobs`, call Apify API |
| **LLM Sequences** | Claude-powered sequence generation; API routes + optional Trigger for long runs |
| **Email Send** | SMTP via client-connected accounts; sending + scheduling (Trigger for queue) |
| **IMAP Sync** | Sync inbox from client accounts; typically Trigger.dev jobs for polling/processing |

API routes live under `app/api/` (or equivalent). Trigger.dev jobs live in `src/jobs` (see `trigger.config.ts`).

## External Services

| Service | Role |
|---------|------|
| **Supabase** | PostgreSQL DB, Auth (email + OAuth), RLS |
| **Apify** | Scraping actors (LinkedIn, Apollo, etc.) |
| **Claude (Anthropic)** | Sequence generation, personalization |
| **Client IMAP/SMTP** | Gmail, Outlook, custom SMTP for send/receive |

## Data Flow (high level)

1. **Auth**: Supabase Auth → middleware updates session → dashboard/layout loads user + org.
2. **Leads**: Import (API) → Supabase `leads` (+ campaigns); scraping via Apify → Trigger job → DB.
3. **Sequences**: Org business context + campaign/lead context → Claude API → store in `sequences` / campaign.
4. **Email**: Campaign/sequence + lead → pick sender account → SMTP send (API or Trigger); replies → IMAP sync (Trigger) → `inbox_messages` → Inbox/CRM UI.
5. **Inbox/CRM**: Read from `inbox_messages` + threads; reply composer uses same SMTP path.

## Project layout (target)

- **Frontend**: `app/` (or `src/app/`) — dashboard, leads, sequences, inbox, settings, auth routes.
- **API**: `app/api/` — campaigns, leads, sequences, inbox, email-accounts, scraping, webhooks.
- **Shared lib**: `src/lib/` — supabase, claude, email (IMAP/SMTP), apify, encryption, utils.
- **Jobs**: `src/jobs/` — Trigger.dev tasks for Apify, IMAP sync, email send, etc.
- **Types**: `src/types/` — e.g. `database.ts` from Supabase codegen.

This matches the diagram and the README; implement or refactor under this layout as you build out each phase.
