# LeadPilot - AI-Powered Cold Outreach Automation Platform

A SaaS platform that automates lead collection, AI-generated email sequences, and inbox management for cold outreach campaigns.

## 🎯 Core Features

- **Lead Ingestion**: CSV upload, Google Sheets sync, LinkedIn/Apollo scraping via Apify
- **AI Sequences**: Claude-powered personalized email sequence generation
- **Email Sending**: SMTP via client's connected email accounts with warmup
- **Inbox CRM**: Full conversation view with reply detection and classification
- **Notifications**: Real-time alerts when leads reply

## 🏗️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router) |
| Backend | Next.js API Routes + Server Actions |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + OAuth (Google, Microsoft) |
| Background Jobs | Trigger.dev |
| LLM | Claude API (Anthropic) |
| Scraping | Apify (LinkedIn, Apollo, Google Maps) |
| Email | IMAP/SMTP (client accounts) |
| Styling | Tailwind CSS + shadcn/ui |

## 📁 Project Structure

```
leadpilot/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # Auth routes (login, signup)
│   │   ├── (dashboard)/       # Protected dashboard routes
│   │   │   ├── campaigns/     # Campaign management
│   │   │   ├── leads/         # Lead lists
│   │   │   ├── inbox/         # Email inbox/CRM
│   │   │   ├── sequences/     # AI sequences
│   │   │   ├── settings/      # Org & account settings
│   │   │   └── email-accounts/# Connected email accounts
│   │   ├── api/               # API routes
│   │   │   ├── campaigns/
│   │   │   ├── leads/
│   │   │   ├── sequences/
│   │   │   ├── inbox/
│   │   │   ├── email-accounts/
│   │   │   ├── scraping/
│   │   │   └── webhooks/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ui/                # shadcn/ui components
│   │   ├── campaigns/         # Campaign-specific components
│   │   ├── leads/             # Lead management components
│   │   ├── inbox/             # Inbox/CRM components
│   │   ├── sequences/         # Sequence viewer/editor
│   │   └── shared/            # Shared components
│   ├── lib/
│   │   ├── supabase/          # Supabase client & utilities
│   │   ├── claude/            # Claude API integration
│   │   ├── email/             # IMAP/SMTP utilities
│   │   ├── apify/             # Apify integration
│   │   ├── encryption/        # Credential encryption
│   │   └── utils/             # General utilities
│   ├── hooks/                 # Custom React hooks
│   ├── types/                 # TypeScript types
│   └── jobs/                  # Trigger.dev job definitions
├── supabase/
│   ├── migrations/            # Database migrations
│   └── seed.sql              # Seed data
├── public/
├── .env.example
├── .env.local                # Local environment (gitignored)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── trigger.config.ts
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- Supabase account (free tier)
- Anthropic API key
- Apify account (for scraping)

### Installation

```bash
# Clone and install
cd leadpilot
pnpm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your keys

# Setup Supabase
pnpm supabase:setup

# Run migrations
pnpm db:migrate

# Start development
pnpm dev
```

### Preview the app

1. From the project root, run **`npm run dev`** (or `pnpm dev`).
2. In the terminal, note the **Local** URL (e.g. `http://localhost:3000`). If 3000 is in use, Next.js will use 3001, 3002, etc.
3. Open that URL in your browser. You’ll be redirected to **/login** if you’re not signed in. The login page works without Supabase; add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local` to enable full auth.

Global styles (Tailwind) are loaded from `app/layout.tsx`; the dashboard and login pages should render with correct styling.

### Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic (Claude)
ANTHROPIC_API_KEY=

# Apify
APIFY_API_TOKEN=

# Encryption (generate with: openssl rand -base64 32)
ENCRYPTION_KEY=

# OAuth (Google)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# OAuth (Microsoft)
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# Trigger.dev
TRIGGER_API_KEY=
TRIGGER_API_URL=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 📋 Development Phases

### Phase 1: Foundation ✅
- [x] Project structure
- [x] Database schema
- [x] Supabase setup
- [x] Authentication
- [x] Basic dashboard layout

### Phase 2: Lead Management
- [ ] CSV import
- [ ] Google Sheets integration
- [ ] Lead list views
- [ ] Lead detail view

### Phase 3: Email Accounts
- [ ] Google OAuth (Gmail)
- [ ] Microsoft OAuth (Outlook)
- [ ] Generic IMAP/SMTP
- [ ] Connection testing
- [ ] Credential encryption

### Phase 4: AI Sequences
- [ ] Claude integration
- [ ] Business context form
- [ ] Sequence generation
- [ ] Sequence editor

### Phase 5: Email Sending
- [ ] SMTP sending
- [ ] Scheduling system
- [ ] Rate limiting
- [ ] Bounce handling

### Phase 6: Inbox CRM
- [ ] IMAP sync
- [ ] Thread view
- [ ] Reply composer
- [ ] Classification

### Phase 7: Scraping
- [ ] Apify LinkedIn integration
- [ ] Apollo enrichment
- [ ] Job tracking

### Phase 8: Polish
- [ ] Analytics dashboard
- [ ] Billing (Stripe)
- [ ] Documentation

## 🗄️ Database Schema

See `supabase/migrations/` for full schema. Key tables:

- `organizations` - Multi-tenant orgs with business context
- `users` - Users with org membership
- `email_accounts` - Connected email accounts (encrypted)
- `campaigns` - Outreach campaigns
- `leads` - Lead records with enrichment data
- `sequences` - AI-generated email sequences
- `emails` - Sent/scheduled emails
- `inbox_messages` - Received messages
- `notifications` - User notifications
- `scraping_jobs` - Apify job tracking

## 🔐 Security

- All email credentials encrypted at rest using AES-256-GCM
- Row Level Security (RLS) on all tables
- OAuth tokens stored securely
- API routes protected by auth middleware

## 📖 API Documentation

### Campaigns
- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns` - Create campaign
- `GET /api/campaigns/[id]` - Get campaign
- `PATCH /api/campaigns/[id]` - Update campaign
- `DELETE /api/campaigns/[id]` - Delete campaign
- `POST /api/campaigns/[id]/start` - Activate campaign

### Leads
- `POST /api/leads/import/csv` - Import from CSV
- `POST /api/leads/import/sheets` - Import from Google Sheets
- `GET /api/leads` - List leads (with filters)
- `GET /api/leads/[id]` - Get lead
- `PATCH /api/leads/[id]` - Update lead

### Sequences
- `POST /api/sequences/generate` - Generate AI sequence
- `GET /api/sequences/[id]` - Get sequence
- `PATCH /api/sequences/[id]` - Update sequence

### Email Accounts
- `GET /api/email-accounts` - List connected accounts
- `POST /api/email-accounts` - Connect account
- `DELETE /api/email-accounts/[id]` - Disconnect
- `POST /api/email-accounts/[id]/test` - Test connection

### Inbox
- `GET /api/inbox` - List threads
- `GET /api/inbox/[threadId]` - Get thread
- `POST /api/inbox/[threadId]/reply` - Send reply

### Scraping
- `POST /api/scraping/linkedin` - Start LinkedIn scrape
- `POST /api/scraping/apollo` - Start Apollo scrape
- `GET /api/scraping/jobs/[id]` - Job status

## 🤝 Contributing

This is a private project. See CONTRIBUTING.md for guidelines.

## 📄 License

Proprietary - All rights reserved.
