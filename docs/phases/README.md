# LeadPilot 2.0 - Build Phases

> **For AI Agents**: This directory contains detailed step-by-step instructions for building LeadPilot, organized by phase.

---

## Quick Start

1. Start with **Phase 1: Foundation** to set up the core infrastructure
2. Follow phases in order, as each builds on the previous
3. Verify each checklist before moving to the next phase
4. Refer to `docs/BUILD_INSTRUCTIONS.md` for the complete overview

---

## Phase Overview

| Phase | File | Description | Priority |
|-------|------|-------------|----------|
| 1 | `PHASE_1_FOUNDATION.md` | Auth, DB schema, layout, Supabase setup | **Critical** |
| 2 | `PHASE_2_LLM.md` | Multi-LLM provider system (Anthropic, OpenAI, etc.) | **Critical** |
| 3 | (See existing docs) | Template library for sequences | High |
| 4 | (See `STEP3_LEADS.md`) | Lead management and CSV import | High |
| 5 | (See `STEP4_EMAIL_ACCOUNTS.md`) | Email accounts with OAuth | High |
| 6 | `PHASE_6_AUTOPILOT_CHAT.md` | Conversational AI chat interface | **Critical** |
| 7 | (See `STEP8_SCRAPING.md`) | Lead finding via Apify/LinkedIn | High |
| 8 | `PHASE_8_MULTI_CHANNEL.md` | WhatsApp and SMS via Twilio | Medium |
| 9 | (See `STEP7_INBOX_CRM.md`) | Inbox, IMAP sync, classification | Medium |
| 10 | (See Phase 6 approval section) | Approval workflows | High |
| 11 | (See `STEP9_POLISH.md`) | Analytics, billing, polish | Low |
| **12** | `PHASE_12_AUTONOMOUS_AGENT.md` | **Full autonomous agent system (OpenClaw-style)** | **Critical** |

---

## Dependencies Between Phases

```
Phase 1 (Foundation)
    ├── Phase 2 (LLM) ─────────┐
    │                          │
    ├── Phase 3 (Templates) ───┼──► Phase 6 (Autopilot Chat) ──┐
    │                          │                               │
    ├── Phase 4 (Leads) ───────┤                               │
    │                          │                               │
    └── Phase 5 (Email) ───────┴──► Phase 9 (Inbox) ───────────┤
                                      │                        │
    Phase 7 (Scraping) ───────────────┤                        │
                                      │                        │
    Phase 8 (Multi-Channel) ──────────┴────────────────────────┴──► Phase 12 (Autonomous Agent)
```

---

## Key Files to Create

### Phase 1
- `supabase/migrations/001_complete_schema.sql`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/client.ts`
- `src/lib/supabase/middleware.ts`
- `middleware.ts`
- `app/api/auth/callback/route.ts`
- `app/(auth)/login/page.tsx`
- `app/(dashboard)/layout.tsx`
- `src/components/layout/sidebar.tsx`
- `src/components/layout/header.tsx`

### Phase 2
- `src/lib/llm/types.ts`
- `src/lib/llm/base.ts`
- `src/lib/llm/anthropic.ts`
- `src/lib/llm/openai.ts`
- `src/lib/llm/gemini.ts`
- `src/lib/llm/deepseek.ts`
- `src/lib/llm/groq.ts`
- `src/lib/llm/index.ts`
- `app/api/settings/llm/route.ts`
- `app/api/llm/test/route.ts`

### Phase 6
- `app/api/autopilot/route.ts`
- `app/api/autopilot/[id]/route.ts`
- `app/(dashboard)/autopilot/page.tsx`
- `app/(dashboard)/autopilot/[id]/review/page.tsx`

### Phase 8
- `src/lib/encryption/index.ts`
- `src/lib/messaging/twilio.ts`
- `src/lib/messaging/send.ts`
- `app/api/messaging-accounts/route.ts`
- `app/api/messaging-accounts/[id]/route.ts`
- `app/(dashboard)/messaging/page.tsx`

### Phase 12 (Autonomous Agent)
- `src/lib/agent/types.ts`
- `src/lib/agent/brain.ts`
- `src/lib/agent/orchestrator.ts`
- `src/lib/agent/memory.ts`
- `src/lib/agent/tools.ts`
- `app/api/agent/config/route.ts`
- `app/api/agent/rules/route.ts`
- `app/api/agent/tasks/route.ts`
- `app/api/agent/start/route.ts`
- `app/api/agent/stop/route.ts`
- `app/api/agent/logs/route.ts`
- `app/(dashboard)/agent/page.tsx`

---

## Existing Documentation

These existing docs should be used alongside the phase docs:

| File | Content |
|------|---------|
| `docs/STEP1_AUTH_AND_SETTINGS.md` | Detailed auth setup (use with Phase 1) |
| `docs/STEP2_CAMPAIGNS.md` | Campaign CRUD |
| `docs/STEP3_LEADS.md` | Lead management (use with Phase 4) |
| `docs/STEP4_EMAIL_ACCOUNTS.md` | Email accounts (use with Phase 5) |
| `docs/STEP5_AI_SEQUENCES.md` | Sequence generation |
| `docs/STEP6_EMAIL_SENDING.md` | Email sending |
| `docs/STEP7_INBOX_CRM.md` | Inbox and classification (use with Phase 9) |
| `docs/STEP8_SCRAPING.md` | Apify integration (use with Phase 7) |
| `docs/STEP9_POLISH.md` | Final polish (use with Phase 11) |
| `docs/UPDATED_WORKFLOW.md` | Product vision and requirements |
| `docs/BUILD_INSTRUCTIONS.md` | Complete build overview |

---

## Environment Variables Required

```env
# Critical (Phase 1)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ENCRYPTION_KEY=

# Phase 2 (LLM)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_AI_API_KEY=
DEEPSEEK_API_KEY=
GROQ_API_KEY=

# Phase 5 (Email)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# Phase 7 (Scraping)
APIFY_API_TOKEN=

# Phase 8 (Messaging)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Phase 11 (Billing)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## npm Dependencies by Phase

```bash
# Phase 1 (if not already installed)
npm install @supabase/supabase-js @supabase/ssr

# Phase 2
npm install @anthropic-ai/sdk openai @google/generative-ai groq-sdk

# Phase 5
npm install nodemailer imap mailparser

# Phase 7
npm install apify-client

# Phase 8
npm install twilio

# Phase 11
npm install stripe
```

---

## Testing Strategy

1. **After each phase**, run through the verification checklist
2. **Test API routes** using curl or Postman before building UI
3. **Test encryption** early - many features depend on it
4. **Test LLM providers** with the test endpoint
5. **Test multi-channel** in sandbox/test mode first

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Auth redirect loop | Check middleware matcher, verify callback URL |
| Encryption fails | Ensure ENCRYPTION_KEY is set and consistent |
| LLM returns invalid JSON | Improve system prompts, add retry logic |
| Twilio not sending | Verify WhatsApp number is registered, check sandbox |
| Supabase RLS blocking | Check user has org_id, verify policy conditions |

---

## Support

If stuck on a phase:
1. Check the verification checklist for what might be missing
2. Review the related existing docs (`STEP*.md`)
3. Check error logs and Supabase dashboard
4. Verify environment variables are set correctly
