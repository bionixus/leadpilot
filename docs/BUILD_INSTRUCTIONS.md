# LeadPilot 2.0 — Complete Build Instructions

> **For AI Agents**: Follow these instructions sequentially to build LeadPilot, the first true autopilot lead generation and outreach platform.

---

## Project Overview

**LeadPilot** is an AI-powered platform that automates lead generation and multi-channel outreach (Email, WhatsApp, SMS). Users can either upload leads and choose templates, or let AI find leads and handle everything automatically.

### Two Main Modes

1. **Semi-Autopilot (Standard)**: User uploads leads → chooses template OR describes needs → AI generates sequences → user approves → send emails
2. **Full Autopilot (Premium)**: User chats with AI → AI asks 5 questions → AI finds leads → AI generates sequences → AI sends via email/WhatsApp/SMS

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL + Auth) |
| Styling | Tailwind CSS + shadcn/ui |
| LLM | Multi-provider (Anthropic, OpenAI, Gemini, DeepSeek, Groq) |
| Email | Nodemailer + IMAP |
| WhatsApp/SMS | Twilio |
| Scraping | Apify (LinkedIn, Apollo) |
| Background Jobs | Trigger.dev |
| Payments | Stripe |

---

## Build Phases

| Phase | Focus | Priority |
|-------|-------|----------|
| **Phase 1** | Foundation (Auth, DB, Layout) | Critical |
| **Phase 2** | Multi-LLM System | Critical |
| **Phase 3** | Template Library | High |
| **Phase 4** | Lead Management | High |
| **Phase 5** | Email Accounts & Sending | High |
| **Phase 6** | Autopilot Chat Interface | Critical |
| **Phase 7** | Lead Finding (Scraping) | High |
| **Phase 8** | WhatsApp & SMS | Medium |
| **Phase 9** | Inbox & Classification | Medium |
| **Phase 10** | Approval Workflows | High |
| **Phase 11** | Analytics & Billing | Low |

---

# PHASE 1: Foundation

## 1.1 Project Structure

Create or verify this structure exists:

```
leadpilot/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── page.tsx                    # Dashboard home
│   │   ├── layout.tsx                  # Sidebar + header
│   │   ├── autopilot/page.tsx          # NEW: Chat interface
│   │   ├── campaigns/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── leads/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── sequences/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── templates/page.tsx          # NEW: Template library
│   │   ├── inbox/
│   │   │   ├── page.tsx
│   │   │   └── [threadId]/page.tsx
│   │   ├── messaging/page.tsx          # NEW: WhatsApp/SMS accounts
│   │   ├── email-accounts/page.tsx
│   │   └── settings/
│   │       ├── page.tsx
│   │       └── billing/page.tsx
│   ├── api/
│   │   ├── auth/...
│   │   ├── campaigns/...
│   │   ├── leads/...
│   │   ├── sequences/...
│   │   ├── templates/...               # NEW
│   │   ├── autopilot/...               # NEW
│   │   ├── llm/...                     # NEW
│   │   ├── messaging/...               # NEW
│   │   ├── inbox/...
│   │   ├── email-accounts/...
│   │   ├── scraping/...
│   │   └── webhooks/...
│   └── layout.tsx
├── src/
│   ├── lib/
│   │   ├── llm/                        # NEW: Multi-LLM providers
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── anthropic.ts
│   │   │   ├── openai.ts
│   │   │   ├── gemini.ts
│   │   │   ├── deepseek.ts
│   │   │   └── groq.ts
│   │   ├── messaging/                  # NEW: WhatsApp/SMS
│   │   │   ├── twilio.ts
│   │   │   └── whatsapp.ts
│   │   ├── email/
│   │   │   ├── send.ts
│   │   │   └── imap.ts
│   │   ├── apify/
│   │   ├── encryption/
│   │   ├── supabase/
│   │   └── utils/
│   ├── types/
│   └── jobs/                           # Trigger.dev jobs
├── supabase/
│   ├── migrations/
│   └── seed.sql
└── ...config files
```

## 1.2 Database Schema

Create migration file `supabase/migrations/001_complete_schema.sql`:

```sql
-- ===========================================
-- EXTENSIONS
-- ===========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===========================================
-- ORGANIZATIONS
-- ===========================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  
  -- Business context for AI
  business_context JSONB DEFAULT '{}'::jsonb,
  -- {
  --   "company_name": "...",
  --   "industry": "...",
  --   "target_audience": "...",
  --   "value_proposition": "...",
  --   "tone": "professional",
  --   "key_pain_points": ["..."],
  --   "case_studies": ["..."],
  --   "cta": "...",
  --   "sender_name": "...",
  --   "sender_title": "..."
  -- }
  
  -- LLM Settings (NEW)
  llm_provider TEXT DEFAULT 'anthropic', -- 'anthropic', 'openai', 'gemini', 'deepseek', 'groq'
  llm_api_key_encrypted TEXT,            -- User's own API key (optional)
  llm_settings JSONB DEFAULT '{}'::jsonb,
  
  -- Organization settings
  settings JSONB DEFAULT '{
    "timezone": "UTC",
    "default_sequence_length": 3,
    "send_window_start": "09:00",
    "send_window_end": "17:00",
    "send_days": ["monday", "tuesday", "wednesday", "thursday", "friday"]
  }'::jsonb,
  
  -- Subscription
  subscription_tier TEXT DEFAULT 'free', -- 'free', 'pro', 'enterprise'
  subscription_status TEXT DEFAULT 'active',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- USERS
-- ===========================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  auth_id UUID UNIQUE NOT NULL,
  
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  
  notification_preferences JSONB DEFAULT '{
    "email_replies": true,
    "whatsapp_replies": true,
    "sms_replies": true,
    "daily_digest": true,
    "browser_push": true
  }'::jsonb,
  
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- SEQUENCE TEMPLATES (NEW)
-- ===========================================
CREATE TABLE sequence_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- NULL = system template
  
  name TEXT NOT NULL,
  description TEXT,
  industry TEXT,      -- 'saas', 'agency', 'recruiting', 'real_estate', 'consulting'
  use_case TEXT,      -- 'cold_outreach', 'follow_up', 'event_invitation', 'recruitment'
  
  -- Template steps with placeholders
  steps JSONB NOT NULL,
  -- [
  --   { "step": 1, "delay_days": 0, "subject": "Quick question about {{company}}", "body": "Hi {{first_name}}..." },
  --   { "step": 2, "delay_days": 3, "subject": "Re: Quick question", "body": "..." },
  --   { "step": 3, "delay_days": 5, "subject": "Last try", "body": "..." }
  -- ]
  
  -- Channels this template supports
  channels TEXT[] DEFAULT '{email}', -- 'email', 'whatsapp', 'sms'
  
  is_public BOOLEAN DEFAULT false,   -- Visible to all users
  is_system BOOLEAN DEFAULT false,   -- Created by platform
  usage_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- AUTOPILOT SESSIONS (NEW)
-- ===========================================
CREATE TABLE autopilot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Session status
  status TEXT DEFAULT 'onboarding' CHECK (status IN (
    'onboarding',       -- Asking questions
    'collecting_info',  -- Getting business details
    'finding_leads',    -- Searching for leads
    'generating',       -- Creating sequences
    'awaiting_approval',-- Waiting for user approval
    'sending',          -- Actively sending
    'paused',           -- User paused
    'completed'         -- Done
  )),
  
  -- Conversation history
  conversation_history JSONB DEFAULT '[]'::jsonb,
  -- [{ "role": "assistant", "content": "...", "timestamp": "..." }, ...]
  
  -- Collected info from 5 questions
  target_customer TEXT,
  target_countries TEXT[],
  target_titles TEXT[],
  company_size TEXT,       -- '1-10', '11-50', '51-200', '201-500', '500+'
  competitors TEXT[],
  
  -- Business info
  business_description TEXT,
  benefits TEXT,
  advantages TEXT,
  cta TEXT,
  
  -- Autopilot settings
  autopilot_level TEXT DEFAULT 'approve_all' CHECK (autopilot_level IN (
    'full_autopilot',   -- AI does everything
    'approve_list',     -- User approves lead list
    'approve_all'       -- User approves list + content
  )),
  
  -- Channels to use
  channels TEXT[] DEFAULT '{email}',
  
  -- Progress tracking
  leads_found INTEGER DEFAULT 0,
  leads_approved INTEGER,
  sequences_generated INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  replies_received INTEGER DEFAULT 0,
  
  -- Linked campaign
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- EMAIL ACCOUNTS
-- ===========================================
CREATE TABLE email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  email_address TEXT NOT NULL,
  display_name TEXT,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook', 'custom')),
  
  -- OAuth (Gmail/Outlook)
  oauth_access_token_encrypted TEXT,
  oauth_refresh_token_encrypted TEXT,
  oauth_token_expires_at TIMESTAMPTZ,
  
  -- Custom IMAP/SMTP
  imap_host TEXT,
  imap_port INTEGER DEFAULT 993,
  imap_secure BOOLEAN DEFAULT true,
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_secure BOOLEAN DEFAULT true,
  credentials_encrypted TEXT,
  
  -- Limits & warmup
  daily_send_limit INTEGER DEFAULT 50,
  emails_sent_today INTEGER DEFAULT 0,
  warmup_enabled BOOLEAN DEFAULT true,
  warmup_day INTEGER DEFAULT 0,
  
  is_active BOOLEAN DEFAULT true,
  connection_status TEXT DEFAULT 'pending',
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(org_id, email_address)
);

-- ===========================================
-- MESSAGING ACCOUNTS (NEW - WhatsApp/SMS)
-- ===========================================
CREATE TABLE messaging_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  provider TEXT NOT NULL CHECK (provider IN ('twilio', 'whatsapp_business', 'messagebird')),
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms')),
  
  phone_number TEXT NOT NULL,
  display_name TEXT,
  
  -- Credentials (encrypted)
  account_sid_encrypted TEXT,
  auth_token_encrypted TEXT,
  
  -- WhatsApp specific
  whatsapp_business_id TEXT,
  
  -- Limits
  daily_limit INTEGER DEFAULT 100,
  messages_sent_today INTEGER DEFAULT 0,
  
  is_active BOOLEAN DEFAULT true,
  connection_status TEXT DEFAULT 'pending',
  last_error TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(org_id, phone_number, channel)
);

-- ===========================================
-- CAMPAIGNS
-- ===========================================
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  autopilot_session_id UUID REFERENCES autopilot_sessions(id) ON DELETE SET NULL,
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Lead source
  source TEXT NOT NULL CHECK (source IN ('csv', 'google_sheets', 'linkedin', 'apollo', 'google_maps', 'manual', 'autopilot')),
  source_config JSONB DEFAULT '{}'::jsonb,
  
  -- Sending account (email)
  email_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
  
  -- Channels for this campaign
  channels TEXT[] DEFAULT '{email}',
  
  -- Template used (if any)
  template_id UUID REFERENCES sequence_templates(id) ON DELETE SET NULL,
  
  -- Settings
  settings JSONB DEFAULT '{
    "sequence_length": 3,
    "delay_between_steps_days": [0, 3, 5],
    "stop_on_reply": true,
    "timezone": "UTC",
    "send_window_start": "09:00",
    "send_window_end": "17:00"
  }'::jsonb,
  
  -- LLM context override
  llm_context JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  
  -- Stats
  stats JSONB DEFAULT '{
    "total_leads": 0,
    "emails_sent": 0,
    "whatsapp_sent": 0,
    "sms_sent": 0,
    "replies_received": 0,
    "positive_replies": 0,
    "bounces": 0
  }'::jsonb,
  
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- LEADS
-- ===========================================
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- Contact info
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  
  -- Personal info
  first_name TEXT,
  last_name TEXT,
  full_name TEXT GENERATED ALWAYS AS (
    COALESCE(first_name, '') || 
    CASE WHEN first_name IS NOT NULL AND last_name IS NOT NULL THEN ' ' ELSE '' END || 
    COALESCE(last_name, '')
  ) STORED,
  
  -- Professional info
  company TEXT,
  job_title TEXT,
  linkedin_url TEXT,
  website TEXT,
  
  -- Location
  city TEXT,
  state TEXT,
  country TEXT,
  timezone TEXT,
  
  -- Enrichment data
  enrichment_data JSONB DEFAULT '{}'::jsonb,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  status TEXT DEFAULT 'new' CHECK (status IN (
    'new', 'sequenced', 'contacted', 'replied',
    'interested', 'not_interested', 'bounced',
    'unsubscribed', 'converted'
  )),
  
  -- Approval (for autopilot)
  is_approved BOOLEAN DEFAULT true,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  
  -- Source
  source TEXT,
  source_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Allow same email in different campaigns
  UNIQUE(org_id, campaign_id, email)
);

-- ===========================================
-- SEQUENCES
-- ===========================================
CREATE TABLE sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  template_id UUID REFERENCES sequence_templates(id) ON DELETE SET NULL,
  
  -- Generated steps
  steps JSONB NOT NULL,
  -- [
  --   { "step": 1, "delay_days": 0, "channel": "email", "subject": "...", "body": "..." },
  --   { "step": 2, "delay_days": 3, "channel": "whatsapp", "body": "..." },
  --   { "step": 3, "delay_days": 5, "channel": "email", "subject": "...", "body": "..." }
  -- ]
  
  -- LLM metadata
  llm_provider TEXT,
  llm_model TEXT,
  llm_prompt_tokens INTEGER,
  llm_completion_tokens INTEGER,
  
  -- Progress
  current_step INTEGER DEFAULT 0,
  is_complete BOOLEAN DEFAULT false,
  stopped_reason TEXT,
  
  -- Approval (for autopilot)
  is_approved BOOLEAN DEFAULT false,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(lead_id)
);

-- ===========================================
-- MESSAGES (Unified - Email/WhatsApp/SMS)
-- ===========================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES sequences(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Channel
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms')),
  
  -- Account used
  email_account_id UUID REFERENCES email_accounts(id),
  messaging_account_id UUID REFERENCES messaging_accounts(id),
  
  -- Content
  step INTEGER NOT NULL,
  subject TEXT,        -- Email only
  body_text TEXT NOT NULL,
  body_html TEXT,      -- Email only
  
  -- Threading (email)
  message_id TEXT UNIQUE,
  in_reply_to TEXT,
  thread_id TEXT,
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ,
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'scheduled', 'sending', 'sent',
    'delivered', 'read', 'replied', 'bounced', 'failed'
  )),
  
  -- Timestamps
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  
  -- Provider metadata
  provider_message_id TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- INBOX MESSAGES
-- ===========================================
CREATE TABLE inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Account
  email_account_id UUID REFERENCES email_accounts(id),
  messaging_account_id UUID REFERENCES messaging_accounts(id),
  
  -- Linked entities
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  
  -- Channel & direction
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  
  -- Contact info
  from_address TEXT NOT NULL,  -- Email or phone
  from_name TEXT,
  to_address TEXT NOT NULL,
  to_name TEXT,
  
  -- Content
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  snippet TEXT,
  
  -- Threading
  message_id TEXT UNIQUE,
  in_reply_to TEXT,
  thread_id TEXT,
  
  -- Attachments
  attachments JSONB DEFAULT '[]'::jsonb,
  
  -- Classification
  classification TEXT CHECK (classification IN (
    'interested', 'not_interested', 'question',
    'out_of_office', 'bounce', 'unsubscribe', 'other'
  )),
  classification_confidence FLOAT,
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  is_starred BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  
  -- Provider metadata
  provider_message_id TEXT,
  provider_thread_id TEXT,
  
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- NOTIFICATIONS
-- ===========================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  type TEXT NOT NULL CHECK (type IN (
    'reply_received', 'positive_reply', 'bounce',
    'campaign_completed', 'scraping_completed',
    'autopilot_update', 'approval_needed',
    'daily_digest', 'system'
  )),
  
  title TEXT NOT NULL,
  message TEXT,
  
  -- Related entities
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  inbox_message_id UUID REFERENCES inbox_messages(id) ON DELETE CASCADE,
  autopilot_session_id UUID REFERENCES autopilot_sessions(id) ON DELETE CASCADE,
  
  action_url TEXT,
  
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- SCRAPING JOBS
-- ===========================================
CREATE TABLE scraping_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  autopilot_session_id UUID REFERENCES autopilot_sessions(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Apify details
  apify_actor_id TEXT NOT NULL,
  apify_run_id TEXT,
  
  -- Job type
  job_type TEXT NOT NULL CHECK (job_type IN (
    'linkedin_search', 'linkedin_profile',
    'apollo_search', 'apollo_enrich',
    'google_maps', 'hunter_search'
  )),
  
  -- Input config
  input_config JSONB NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'cancelled'
  )),
  
  -- Results
  results_count INTEGER,
  leads_created INTEGER,
  error_message TEXT,
  compute_units_used FLOAT,
  
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- INDEXES
-- ===========================================
CREATE INDEX idx_users_org ON users(org_id);
CREATE INDEX idx_users_auth ON users(auth_id);
CREATE INDEX idx_templates_org ON sequence_templates(org_id);
CREATE INDEX idx_templates_public ON sequence_templates(is_public) WHERE is_public = true;
CREATE INDEX idx_autopilot_org ON autopilot_sessions(org_id);
CREATE INDEX idx_autopilot_status ON autopilot_sessions(status);
CREATE INDEX idx_email_accounts_org ON email_accounts(org_id);
CREATE INDEX idx_messaging_accounts_org ON messaging_accounts(org_id);
CREATE INDEX idx_campaigns_org ON campaigns(org_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_leads_campaign ON leads(campaign_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_sequences_campaign ON sequences(campaign_id);
CREATE INDEX idx_sequences_lead ON sequences(lead_id);
CREATE INDEX idx_messages_campaign ON messages(campaign_id);
CREATE INDEX idx_messages_lead ON messages(lead_id);
CREATE INDEX idx_messages_scheduled ON messages(status, scheduled_for) WHERE status = 'scheduled';
CREATE INDEX idx_inbox_org ON inbox_messages(org_id);
CREATE INDEX idx_inbox_thread ON inbox_messages(thread_id);
CREATE INDEX idx_inbox_unread ON inbox_messages(is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(is_read) WHERE is_read = false;
CREATE INDEX idx_scraping_jobs_org ON scraping_jobs(org_id);

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopilot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;

-- Helper function
CREATE OR REPLACE FUNCTION auth.user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM users WHERE auth_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Apply RLS policies (org-based access)
-- Organizations
CREATE POLICY "Users can view their org" ON organizations
  FOR SELECT USING (id = auth.user_org_id());
CREATE POLICY "Owners can update their org" ON organizations
  FOR UPDATE USING (id = auth.user_org_id());

-- Users
CREATE POLICY "Users can view org members" ON users
  FOR SELECT USING (org_id = auth.user_org_id());
CREATE POLICY "Users can update themselves" ON users
  FOR UPDATE USING (auth_id = auth.uid());

-- Templates (public or own org)
CREATE POLICY "View public or own templates" ON sequence_templates
  FOR SELECT USING (is_public = true OR org_id = auth.user_org_id() OR org_id IS NULL);
CREATE POLICY "Manage own templates" ON sequence_templates
  FOR ALL USING (org_id = auth.user_org_id());

-- All other tables: org-based access
CREATE POLICY "Org access" ON autopilot_sessions FOR ALL USING (org_id = auth.user_org_id());
CREATE POLICY "Org access" ON email_accounts FOR ALL USING (org_id = auth.user_org_id());
CREATE POLICY "Org access" ON messaging_accounts FOR ALL USING (org_id = auth.user_org_id());
CREATE POLICY "Org access" ON campaigns FOR ALL USING (org_id = auth.user_org_id());
CREATE POLICY "Org access" ON leads FOR ALL USING (org_id = auth.user_org_id());
CREATE POLICY "Org access" ON sequences FOR ALL USING (org_id = auth.user_org_id());
CREATE POLICY "Org access" ON messages FOR ALL USING (org_id = auth.user_org_id());
CREATE POLICY "Org access" ON inbox_messages FOR ALL USING (org_id = auth.user_org_id());
CREATE POLICY "Org access" ON scraping_jobs FOR ALL USING (org_id = auth.user_org_id());
CREATE POLICY "User notifications" ON notifications
  FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ===========================================
-- TRIGGERS
-- ===========================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON sequence_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_autopilot_updated_at BEFORE UPDATE ON autopilot_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_email_accounts_updated_at BEFORE UPDATE ON email_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_messaging_accounts_updated_at BEFORE UPDATE ON messaging_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_sequences_updated_at BEFORE UPDATE ON sequences FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_inbox_messages_updated_at BEFORE UPDATE ON inbox_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_scraping_jobs_updated_at BEFORE UPDATE ON scraping_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

## 1.3 Environment Variables

Create `.env.example`:

```env
# ===========================================
# SUPABASE
# ===========================================
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# ===========================================
# LLM PROVIDERS
# ===========================================
# Platform default keys (users can add their own)
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
GOOGLE_AI_API_KEY=xxx
DEEPSEEK_API_KEY=xxx
GROQ_API_KEY=xxx

# ===========================================
# ENCRYPTION
# ===========================================
ENCRYPTION_KEY=xxx  # openssl rand -base64 32

# ===========================================
# EMAIL OAUTH
# ===========================================
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
MICROSOFT_CLIENT_ID=xxx
MICROSOFT_CLIENT_SECRET=xxx

# ===========================================
# TWILIO (WhatsApp/SMS)
# ===========================================
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1xxx

# ===========================================
# APIFY (Scraping)
# ===========================================
APIFY_API_TOKEN=xxx
APIFY_WEBHOOK_SECRET=xxx

# LinkedIn actor IDs
APIFY_LINKEDIN_SEARCH_ACTOR=xxx
APIFY_LINKEDIN_PROFILE_ACTOR=xxx
APIFY_APOLLO_ACTOR=xxx

# ===========================================
# STRIPE (Billing)
# ===========================================
STRIPE_SECRET_KEY=sk_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_xxx

# ===========================================
# TRIGGER.DEV
# ===========================================
TRIGGER_API_KEY=xxx
TRIGGER_API_URL=https://api.trigger.dev

# ===========================================
# APP
# ===========================================
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 1.4 Auth Setup

### 1.4.1 Supabase Client (`src/lib/supabase/server.ts`)

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore in Server Components
          }
        },
      },
    }
  );
}
```

### 1.4.2 Auth Callback (`app/api/auth/callback/route.ts`)

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  
  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error && user) {
      // Check if user exists in our users table
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, org_id')
        .eq('auth_id', user.id)
        .single();
      
      if (!existingUser) {
        // Create org and user
        const orgName = user.user_metadata?.full_name 
          ? `${user.user_metadata.full_name}'s Organization`
          : 'My Organization';
        
        const { data: org } = await supabase
          .from('organizations')
          .insert({
            name: orgName,
            slug: orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          })
          .select()
          .single();
        
        if (org) {
          await supabase.from('users').insert({
            org_id: org.id,
            auth_id: user.id,
            email: user.email!,
            full_name: user.user_metadata?.full_name || null,
            role: 'owner',
          });
        }
      }
      
      return NextResponse.redirect(`${origin}/`);
    }
  }
  
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
```

### 1.4.3 Login Page (`app/(auth)/login/page.tsx`)

```typescript
'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/');
    }
  };
  
  const handleOAuth = async (provider: 'google' | 'azure') => {
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-sm border">
        <h1 className="text-2xl font-bold text-center mb-6">Welcome to LeadPilot</h1>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
            required
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-primary text-white rounded-lg"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        
        <div className="my-6 flex items-center gap-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-gray-500 text-sm">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
        
        <div className="space-y-3">
          <button
            onClick={() => handleOAuth('google')}
            className="w-full py-2 border rounded-lg flex items-center justify-center gap-2"
          >
            Continue with Google
          </button>
          <button
            onClick={() => handleOAuth('azure')}
            className="w-full py-2 border rounded-lg flex items-center justify-center gap-2"
          >
            Continue with Microsoft
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

# PHASE 2: Multi-LLM System

## 2.1 LLM Types (`src/lib/llm/types.ts`)

```typescript
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface SequenceStep {
  step: number;
  delay_days: number;
  channel: 'email' | 'whatsapp' | 'sms';
  subject?: string;
  body: string;
}

export interface GeneratedSequence {
  steps: SequenceStep[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface Classification {
  classification: 'interested' | 'not_interested' | 'question' | 'out_of_office' | 'bounce' | 'other';
  confidence: number;
  reason: string;
}

export interface LLMProvider {
  name: string;
  chat(messages: LLMMessage[]): Promise<LLMResponse>;
  generateSequence(prompt: string): Promise<GeneratedSequence>;
  classifyReply(email: string, originalOutreach: string): Promise<Classification>;
}

export type LLMProviderName = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'groq';
```

## 2.2 Anthropic Provider (`src/lib/llm/anthropic.ts`)

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMMessage, LLMResponse, GeneratedSequence, Classification } from './types';

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private client: Anthropic;
  
  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }
  
  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');
    
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemMessage?.content || '',
      messages: otherMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });
    
    return {
      content: response.content[0].type === 'text' ? response.content[0].text : '',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
  
  async generateSequence(prompt: string): Promise<GeneratedSequence> {
    const response = await this.chat([
      { role: 'system', content: 'You are an expert cold outreach copywriter. Always return valid JSON.' },
      { role: 'user', content: prompt },
    ]);
    
    // Parse JSON from response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid response format');
    
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      steps: parsed.steps || parsed.emails,
      usage: response.usage,
    };
  }
  
  async classifyReply(email: string, originalOutreach: string): Promise<Classification> {
    const prompt = `Classify this email reply to a cold outreach.

ORIGINAL OUTREACH:
${originalOutreach}

REPLY:
${email}

Classify as one of: INTERESTED, NOT_INTERESTED, QUESTION, OUT_OF_OFFICE, BOUNCE, OTHER

Return JSON: {"classification": "...", "confidence": 0.0-1.0, "reason": "..."}`;

    const response = await this.chat([
      { role: 'system', content: 'You classify email replies. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ]);
    
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid response format');
    
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      classification: parsed.classification.toLowerCase(),
      confidence: parsed.confidence,
      reason: parsed.reason,
    };
  }
}
```

## 2.3 OpenAI Provider (`src/lib/llm/openai.ts`)

```typescript
import OpenAI from 'openai';
import type { LLMProvider, LLMMessage, LLMResponse, GeneratedSequence, Classification } from './types';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI;
  
  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }
  
  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });
    
    return {
      content: response.choices[0].message.content || '',
      usage: response.usage ? {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
      } : undefined,
    };
  }
  
  async generateSequence(prompt: string): Promise<GeneratedSequence> {
    const response = await this.chat([
      { role: 'system', content: 'You are an expert cold outreach copywriter. Always return valid JSON.' },
      { role: 'user', content: prompt },
    ]);
    
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid response format');
    
    const parsed = JSON.parse(jsonMatch[0]);
    return { steps: parsed.steps || parsed.emails, usage: response.usage };
  }
  
  async classifyReply(email: string, originalOutreach: string): Promise<Classification> {
    // Same implementation as Anthropic
    const prompt = `Classify this reply: ${email}\n\nOriginal: ${originalOutreach}\n\nReturn JSON.`;
    const response = await this.chat([
      { role: 'system', content: 'Classify email replies. Return JSON only.' },
      { role: 'user', content: prompt },
    ]);
    
    const parsed = JSON.parse(response.content.match(/\{[\s\S]*\}/)![0]);
    return { classification: parsed.classification.toLowerCase(), confidence: parsed.confidence, reason: parsed.reason };
  }
}
```

## 2.4 LLM Factory (`src/lib/llm/index.ts`)

```typescript
import type { LLMProvider, LLMProviderName } from './types';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
// Import other providers similarly

export function getLLMProvider(provider: LLMProviderName, apiKey?: string): LLMProvider {
  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey);
    case 'openai':
      return new OpenAIProvider(apiKey);
    case 'gemini':
      // return new GeminiProvider(apiKey);
      throw new Error('Gemini provider not yet implemented');
    case 'deepseek':
      // return new DeepSeekProvider(apiKey);
      throw new Error('DeepSeek provider not yet implemented');
    case 'groq':
      // return new GroqProvider(apiKey);
      throw new Error('Groq provider not yet implemented');
    default:
      return new AnthropicProvider(apiKey);
  }
}

export * from './types';
```

---

# PHASE 3: Template Library

## 3.1 Seed Templates (`supabase/seed_templates.sql`)

```sql
-- System templates (org_id = NULL, is_system = true)
INSERT INTO sequence_templates (name, description, industry, use_case, steps, channels, is_public, is_system) VALUES
(
  'SaaS Cold Outreach',
  'Professional B2B SaaS outreach sequence',
  'saas',
  'cold_outreach',
  '[
    {"step": 1, "delay_days": 0, "channel": "email", "subject": "Quick question about {{company}}", "body": "Hi {{first_name}},\n\nI noticed {{company}} is growing fast in the {{industry}} space. Congrats!\n\nI''m curious - how are you currently handling {{pain_point}}?\n\nWe''ve helped similar companies like {{competitor}} reduce {{metric}} by {{percentage}}.\n\nWorth a quick chat?\n\n{{sender_name}}"},
    {"step": 2, "delay_days": 3, "channel": "email", "subject": "Re: Quick question about {{company}}", "body": "Hi {{first_name}},\n\nJust bumping this up. I know {{job_title}}s are busy, but I thought this might be relevant.\n\nWe recently helped a {{company_size}} company in {{industry}} achieve {{result}}.\n\nHappy to share how - would a 15-min call work?\n\n{{sender_name}}"},
    {"step": 3, "delay_days": 5, "channel": "email", "subject": "Last try - {{first_name}}", "body": "Hi {{first_name}},\n\nI''ll keep this short - I don''t want to spam you.\n\nIf {{pain_point}} isn''t a priority right now, no worries. But if it ever becomes one, I''d love to help.\n\nEither way, wishing you and {{company}} continued success.\n\n{{sender_name}}"}
  ]'::jsonb,
  '{email}',
  true,
  true
),
(
  'Agency New Client',
  'Agency outreach for new client acquisition',
  'agency',
  'cold_outreach',
  '[
    {"step": 1, "delay_days": 0, "channel": "email", "subject": "Loved what {{company}} did with {{recent_work}}", "body": "Hi {{first_name}},\n\nI came across {{company}}''s recent {{recent_work}} and was really impressed.\n\nWe''re a {{agency_type}} agency and we''ve helped brands like {{client_example}} achieve {{result}}.\n\nI have a few ideas that could help {{company}} {{goal}}.\n\nWould you be open to a quick call?\n\n{{sender_name}}"},
    {"step": 2, "delay_days": 4, "channel": "email", "subject": "Re: Ideas for {{company}}", "body": "Hi {{first_name}},\n\nFollowing up on my last note. I put together a quick audit of {{company}}''s {{area}} - found some interesting opportunities.\n\nHappy to walk you through it - no strings attached.\n\n{{sender_name}}"},
    {"step": 3, "delay_days": 6, "channel": "email", "subject": "Quick question", "body": "Hi {{first_name}},\n\nIs {{area}} something you''re focused on right now? If not, I''ll stop reaching out.\n\nBut if it is, I''d love to share what we''ve learned working with similar brands.\n\n{{sender_name}}"}
  ]'::jsonb,
  '{email}',
  true,
  true
),
(
  'Multi-Channel Outreach',
  'Email + WhatsApp combined sequence',
  'general',
  'cold_outreach',
  '[
    {"step": 1, "delay_days": 0, "channel": "email", "subject": "{{first_name}}, quick question", "body": "Hi {{first_name}},\n\n{{personalized_opener}}\n\nI''d love to share how we''ve helped companies like yours {{benefit}}.\n\nWorth a quick chat?\n\n{{sender_name}}"},
    {"step": 2, "delay_days": 2, "channel": "whatsapp", "body": "Hi {{first_name}}, I sent you an email a couple days ago about {{topic}}. Did you get a chance to see it? Happy to jump on a quick call if helpful. - {{sender_name}}"},
    {"step": 3, "delay_days": 4, "channel": "email", "subject": "Re: {{first_name}}, quick question", "body": "Hi {{first_name}},\n\nJust following up. I know you''re busy.\n\nHere''s a quick case study that might be relevant: {{case_study_link}}\n\nLet me know if you''d like to discuss.\n\n{{sender_name}}"},
    {"step": 4, "delay_days": 7, "channel": "whatsapp", "body": "Hey {{first_name}}, last message from me! If now isn''t the right time, totally understand. But if {{pain_point}} becomes a priority, I''d love to help. - {{sender_name}}"}
  ]'::jsonb,
  '{email,whatsapp}',
  true,
  true
);
```

## 3.2 Templates API (`app/api/templates/route.ts`)

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { searchParams } = new URL(request.url);
  const industry = searchParams.get('industry');
  const useCase = searchParams.get('use_case');
  
  const { data: userData } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  
  let query = supabase
    .from('sequence_templates')
    .select('*')
    .or(`is_public.eq.true,org_id.eq.${userData?.org_id},org_id.is.null`);
  
  if (industry) query = query.eq('industry', industry);
  if (useCase) query = query.eq('use_case', useCase);
  
  const { data, error } = await query.order('usage_count', { ascending: false });
  
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { data: userData } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  if (!userData?.org_id) return NextResponse.json({ error: 'No org' }, { status: 403 });
  
  const body = await request.json();
  const { data, error } = await supabase
    .from('sequence_templates')
    .insert({
      org_id: userData.org_id,
      ...body,
      is_public: false,
      is_system: false,
    })
    .select()
    .single();
  
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

---

# PHASE 4-5: See existing STEP docs

Refer to:
- `docs/STEP3_LEADS.md` for Lead Management
- `docs/STEP4_EMAIL_ACCOUNTS.md` for Email Accounts & Encryption
- `docs/STEP6_EMAIL_SENDING.md` for Email Sending

---

# PHASE 6: Autopilot Chat Interface

## 6.1 Autopilot API (`app/api/autopilot/route.ts`)

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getLLMProvider } from '@/lib/llm';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { data: userData } = await supabase
    .from('users')
    .select('org_id, organizations(llm_provider, llm_api_key_encrypted)')
    .eq('auth_id', user.id)
    .single();
  
  if (!userData?.org_id) return NextResponse.json({ error: 'No org' }, { status: 403 });
  
  const body = await request.json();
  const { session_id, message } = body;
  
  // Get or create session
  let session;
  if (session_id) {
    const { data } = await supabase
      .from('autopilot_sessions')
      .select('*')
      .eq('id', session_id)
      .single();
    session = data;
  }
  
  if (!session) {
    const { data } = await supabase
      .from('autopilot_sessions')
      .insert({
        org_id: userData.org_id,
        user_id: user.id,
        conversation_history: [],
      })
      .select()
      .single();
    session = data;
  }
  
  // Add user message to history
  const history = [...(session.conversation_history || [])];
  history.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
  
  // Get LLM provider
  const org = userData.organizations as any;
  const provider = getLLMProvider(org?.llm_provider || 'anthropic');
  
  // Build system prompt based on session state
  const systemPrompt = buildAutopilotSystemPrompt(session);
  
  // Get AI response
  const response = await provider.chat([
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
  ]);
  
  // Add assistant response
  history.push({ role: 'assistant', content: response.content, timestamp: new Date().toISOString() });
  
  // Parse response for structured data extraction
  const extracted = extractStructuredData(response.content, session.status);
  
  // Update session
  const { data: updatedSession } = await supabase
    .from('autopilot_sessions')
    .update({
      conversation_history: history,
      ...extracted,
    })
    .eq('id', session.id)
    .select()
    .single();
  
  return NextResponse.json({
    session: updatedSession,
    message: response.content,
  });
}

function buildAutopilotSystemPrompt(session: any): string {
  const basePrompt = `You are LeadPilot's AI assistant. You help users find leads and create outreach campaigns.

Current session status: ${session.status}

Your goal is to collect the following information through conversation:
1. Target customer profile (who they sell to)
2. Target countries/regions
3. Target job titles
4. Company size preference
5. Top competitors
6. Business description, benefits, and CTA

Be conversational and friendly. Ask one question at a time. When you have all info, summarize and ask how they want to proceed:
- Full Autopilot: You find leads and send automatically
- Approve List: They approve leads before you proceed
- Approve All: They approve leads and content

Based on collected info so far:
- Target customer: ${session.target_customer || 'Not yet collected'}
- Countries: ${session.target_countries?.join(', ') || 'Not yet collected'}
- Titles: ${session.target_titles?.join(', ') || 'Not yet collected'}
- Company size: ${session.company_size || 'Not yet collected'}
- Competitors: ${session.competitors?.join(', ') || 'Not yet collected'}
- Business info: ${session.business_description || 'Not yet collected'}
`;

  return basePrompt;
}

function extractStructuredData(response: string, currentStatus: string): any {
  // Parse AI response for extracted data
  // This would use regex or another LLM call to extract structured info
  // For now, return empty - implement based on conversation flow
  return {};
}
```

## 6.2 Autopilot Chat UI (`app/(dashboard)/autopilot/page.tsx`)

```typescript
'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function AutopilotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Initial greeting
    setMessages([{
      role: 'assistant',
      content: `Hi! I'm your LeadPilot assistant. I can help you:
      
• Find your ideal customers
• Create personalized outreach sequences
• Send messages via email, WhatsApp, or SMS

How would you like to get started?

**Option 1:** Upload a lead list (CSV)
**Option 2:** Let me find leads for you (I'll ask a few questions)`,
      timestamp: new Date().toISOString(),
    }]);
  }, []);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: new Date().toISOString() }]);
    setLoading(true);
    
    try {
      const response = await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: userMessage }),
      });
      
      const data = await response.json();
      
      if (data.session?.id) setSessionId(data.session.id);
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString(),
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Autopilot</h1>
          <p className="text-gray-500">Chat with AI to find leads and send outreach</p>
        </div>
        <select className="border rounded-lg px-3 py-2 text-sm">
          <option value="anthropic">Claude (Anthropic)</option>
          <option value="openai">GPT-4 (OpenAI)</option>
          <option value="gemini">Gemini (Google)</option>
          <option value="deepseek">DeepSeek</option>
        </select>
      </div>
      
      <div className="flex-1 bg-white rounded-xl border overflow-hidden flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
              )}
              <div className={`max-w-[70%] rounded-xl px-4 py-3 ${
                msg.role === 'user' ? 'bg-primary text-white' : 'bg-gray-100'
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-white" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <div className="bg-gray-100 rounded-xl px-4 py-3">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Input */}
        <div className="border-t p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type your message..."
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

# PHASE 7-8: Lead Finding & Multi-Channel

## 7.1 See existing docs:
- `docs/STEP8_SCRAPING.md` for Apify/LinkedIn/Apollo integration

## 8.1 Twilio Integration (`src/lib/messaging/twilio.ts`)

```typescript
import twilio from 'twilio';
import { decrypt } from '@/lib/encryption';

interface SendMessageOptions {
  to: string;
  body: string;
  channel: 'sms' | 'whatsapp';
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
}

export async function sendMessage(options: SendMessageOptions): Promise<{ sid: string } | { error: string }> {
  try {
    const client = twilio(
      options.accountSid || process.env.TWILIO_ACCOUNT_SID,
      options.authToken || process.env.TWILIO_AUTH_TOKEN
    );
    
    const from = options.channel === 'whatsapp'
      ? `whatsapp:${options.fromNumber || process.env.TWILIO_PHONE_NUMBER}`
      : options.fromNumber || process.env.TWILIO_PHONE_NUMBER;
    
    const to = options.channel === 'whatsapp'
      ? `whatsapp:${options.to}`
      : options.to;
    
    const message = await client.messages.create({
      body: options.body,
      from,
      to,
    });
    
    return { sid: message.sid };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function sendWhatsApp(to: string, body: string, account?: any): Promise<{ sid?: string; error?: string }> {
  if (account) {
    return sendMessage({
      to,
      body,
      channel: 'whatsapp',
      accountSid: decrypt(account.account_sid_encrypted),
      authToken: decrypt(account.auth_token_encrypted),
      fromNumber: account.phone_number,
    });
  }
  return sendMessage({ to, body, channel: 'whatsapp' });
}

export async function sendSMS(to: string, body: string, account?: any): Promise<{ sid?: string; error?: string }> {
  if (account) {
    return sendMessage({
      to,
      body,
      channel: 'sms',
      accountSid: decrypt(account.account_sid_encrypted),
      authToken: decrypt(account.auth_token_encrypted),
      fromNumber: account.phone_number,
    });
  }
  return sendMessage({ to, body, channel: 'sms' });
}
```

---

# PHASE 9-11: See existing docs

- `docs/STEP7_INBOX_CRM.md` for Inbox & Classification
- `docs/STEP5_AI_SEQUENCES.md` for Approval Workflows (extend with `is_approved` field)
- `docs/STEP9_POLISH.md` for Analytics & Billing

---

# Summary: Implementation Checklist

## Phase 1: Foundation
- [ ] Database schema migration
- [ ] Environment variables
- [ ] Auth (login, signup, callback)
- [ ] Dashboard layout with sidebar
- [ ] Middleware for auth protection

## Phase 2: Multi-LLM
- [ ] LLM types and interfaces
- [ ] Anthropic provider
- [ ] OpenAI provider
- [ ] Gemini provider (optional)
- [ ] DeepSeek provider (optional)
- [ ] Groq provider (optional)
- [ ] LLM factory and settings in org

## Phase 3: Templates
- [ ] Seed system templates
- [ ] Templates API (CRUD)
- [ ] Templates page UI
- [ ] Template selector in campaign creation

## Phase 4: Lead Management
- [ ] Leads API (list, create, update)
- [ ] CSV import
- [ ] Leads page with filters
- [ ] Lead detail page

## Phase 5: Email Accounts
- [ ] Encryption lib
- [ ] Email accounts API
- [ ] OAuth callbacks (Google, Microsoft)
- [ ] Custom IMAP/SMTP form
- [ ] Email accounts page

## Phase 6: Autopilot Chat
- [ ] Autopilot sessions table
- [ ] Autopilot API (conversation handler)
- [ ] Chat UI page
- [ ] Question flow (5 questions + business info)
- [ ] Autopilot level selection

## Phase 7: Lead Finding
- [ ] Apify lib
- [ ] LinkedIn scraping route
- [ ] Apollo scraping route
- [ ] Webhook handler
- [ ] Auto-import to campaign

## Phase 8: Multi-Channel
- [ ] Messaging accounts table
- [ ] Twilio integration
- [ ] WhatsApp sending
- [ ] SMS sending
- [ ] Messaging accounts page

## Phase 9: Inbox
- [ ] IMAP sync job
- [ ] Inbox API
- [ ] Inbox page
- [ ] Thread detail page
- [ ] Reply composer
- [ ] Auto-classification

## Phase 10: Approval Workflows
- [ ] Lead approval UI (autopilot mode)
- [ ] Sequence approval UI
- [ ] Approval status in list views
- [ ] Notifications for approval needed

## Phase 11: Polish
- [ ] Analytics dashboard
- [ ] Stripe billing
- [ ] Onboarding flow
- [ ] Error handling
- [ ] Loading states
- [ ] Documentation

---

# Notes for Building Agent

1. **Follow phases in order** - each phase builds on the previous
2. **Test each phase** before moving to the next
3. **Use existing code** where it exists (check the codebase first)
4. **Keep types consistent** - use the Database types from Supabase
5. **Handle errors gracefully** - never expose raw errors to users
6. **Encrypt all credentials** - use the encryption lib for tokens/passwords
7. **Respect rate limits** - check daily limits before sending
8. **Log important events** - for debugging and monitoring

Start with Phase 1 and proceed sequentially. Ask the user for clarification if requirements are unclear.
