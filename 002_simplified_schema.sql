-- ===========================================
-- LeadPilot Simplified Schema
-- Migration: 002_simplified_schema
-- Run after 001 or as standalone on fresh DB
-- ===========================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===========================================
-- Organizations (multi-tenant)
-- ===========================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  business_context JSONB, -- LLM uses this for personalization
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Users
-- ===========================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  auth_id UUID UNIQUE, -- Supabase Auth user ID (auth.uid())
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'member', -- admin, member
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Connected Email Accounts
-- ===========================================
CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  email_address TEXT NOT NULL,
  provider TEXT NOT NULL, -- gmail, outlook, custom
  imap_host TEXT,
  imap_port INTEGER,
  smtp_host TEXT,
  smtp_port INTEGER,
  credentials_encrypted TEXT, -- encrypted OAuth tokens or app passwords
  daily_send_limit INTEGER DEFAULT 50,
  warmup_enabled BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Lead Lists (Campaigns)
-- ===========================================
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  source TEXT, -- csv, google_sheets, linkedin, apollo
  source_config JSONB, -- sheet ID, LinkedIn search URL, etc.
  status TEXT DEFAULT 'draft', -- draft, active, paused, completed
  settings JSONB, -- send times, timezone, delays between emails
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Leads
-- ===========================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  campaign_id UUID REFERENCES campaigns(id),
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  job_title TEXT,
  linkedin_url TEXT,
  phone TEXT,
  location TEXT,
  enrichment_data JSONB, -- additional data from Apollo/enrichment
  status TEXT DEFAULT 'new', -- new, contacted, replied, interested, not_interested, bounced
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, email, campaign_id)
);

-- ===========================================
-- Email Sequences (LLM Generated)
-- ===========================================
CREATE TABLE IF NOT EXISTS sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),
  lead_id UUID REFERENCES leads(id),
  emails JSONB NOT NULL, -- array of {step, subject, body, delay_days}
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  llm_model TEXT DEFAULT 'claude-sonnet-4-5-20250929'
);

-- ===========================================
-- Sent Emails
-- ===========================================
CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  sequence_id UUID REFERENCES sequences(id),
  lead_id UUID REFERENCES leads(id),
  email_account_id UUID REFERENCES email_accounts(id),
  step INTEGER NOT NULL, -- 1, 2, 3, etc.
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'scheduled', -- scheduled, sent, delivered, opened, bounced, failed
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  message_id TEXT, -- email Message-ID header for threading
  thread_id TEXT, -- for Gmail API threading
  opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Inbox (Replies & All Conversations)
-- ===========================================
CREATE TABLE IF NOT EXISTS inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  email_account_id UUID REFERENCES email_accounts(id),
  lead_id UUID REFERENCES leads(id),
  direction TEXT NOT NULL, -- inbound, outbound
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  message_id TEXT UNIQUE,
  in_reply_to TEXT, -- links to parent message
  thread_id TEXT,
  is_read BOOLEAN DEFAULT false,
  classification TEXT, -- interested, not_interested, ooo, bounce, question
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Notifications
-- ===========================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  type TEXT NOT NULL, -- reply, bounce, lead_interested
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Apify Job Tracking
-- ===========================================
CREATE TABLE IF NOT EXISTS scraping_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  campaign_id UUID REFERENCES campaigns(id),
  apify_run_id TEXT,
  actor_id TEXT, -- linkedin-scraper, apollo-scraper
  input_config JSONB,
  status TEXT DEFAULT 'pending', -- pending, running, completed, failed
  results_count INTEGER,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Indexes for performance
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_leads_org_status ON leads(org_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_emails_scheduled ON emails(status, scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_inbox_org_unread ON inbox_messages(org_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_inbox_thread ON inbox_messages(thread_id);

-- Optional: indexes for users and org lookups (Supabase Auth)
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_auth ON users(auth_id) WHERE auth_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_org ON campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_org ON email_accounts(org_id);
