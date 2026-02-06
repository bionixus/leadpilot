-- ===========================================
-- LeadPilot Foundation Schema
-- Run this FIRST in Supabase SQL Editor
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
  business_context JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Users
-- ===========================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  auth_id UUID UNIQUE,
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Connected Email Accounts
-- ===========================================
CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  email_address TEXT NOT NULL,
  provider TEXT NOT NULL,
  imap_host TEXT,
  imap_port INTEGER,
  smtp_host TEXT,
  smtp_port INTEGER,
  credentials_encrypted TEXT,
  daily_send_limit INTEGER DEFAULT 50,
  warmup_enabled BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Campaigns (Lead Lists)
-- ===========================================
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  source TEXT,
  source_config JSONB,
  status TEXT DEFAULT 'draft',
  settings JSONB,
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
  enrichment_data JSONB,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, email, campaign_id)
);

-- ===========================================
-- Email Sequences
-- ===========================================
CREATE TABLE IF NOT EXISTS sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),
  lead_id UUID REFERENCES leads(id),
  emails JSONB NOT NULL,
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
  step INTEGER NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'scheduled',
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  message_id TEXT,
  thread_id TEXT,
  opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Inbox Messages
-- ===========================================
CREATE TABLE IF NOT EXISTS inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  email_account_id UUID REFERENCES email_accounts(id),
  lead_id UUID REFERENCES leads(id),
  direction TEXT NOT NULL,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  message_id TEXT UNIQUE,
  in_reply_to TEXT,
  thread_id TEXT,
  is_read BOOLEAN DEFAULT false,
  classification TEXT,
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
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Scraping Jobs
-- ===========================================
CREATE TABLE IF NOT EXISTS scraping_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  campaign_id UUID REFERENCES campaigns(id),
  apify_run_id TEXT,
  actor_id TEXT,
  input_config JSONB,
  status TEXT DEFAULT 'pending',
  results_count INTEGER,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Indexes
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_leads_org_status ON leads(org_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_emails_scheduled ON emails(status, scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_inbox_org_unread ON inbox_messages(org_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_inbox_thread ON inbox_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_auth ON users(auth_id) WHERE auth_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_org ON campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_org ON email_accounts(org_id);

-- ===========================================
-- Row Level Security (RLS)
-- ===========================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's org_id
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM users WHERE auth_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Organizations: users can only see their own org
CREATE POLICY "Users can view own organization"
  ON organizations FOR SELECT
  USING (id = get_user_org_id());

CREATE POLICY "Users can update own organization"
  ON organizations FOR UPDATE
  USING (id = get_user_org_id());

-- Users: can see users in same org
CREATE POLICY "Users can view org members"
  ON users FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth_id = auth.uid());

-- Generic org-based policies for other tables
CREATE POLICY "Org access" ON email_accounts FOR ALL USING (org_id = get_user_org_id());
CREATE POLICY "Org access" ON campaigns FOR ALL USING (org_id = get_user_org_id());
CREATE POLICY "Org access" ON leads FOR ALL USING (org_id = get_user_org_id());
CREATE POLICY "Org access" ON emails FOR ALL USING (org_id = get_user_org_id());
CREATE POLICY "Org access" ON inbox_messages FOR ALL USING (org_id = get_user_org_id());
CREATE POLICY "Org access" ON notifications FOR ALL USING (org_id = get_user_org_id());
CREATE POLICY "Org access" ON scraping_jobs FOR ALL USING (org_id = get_user_org_id());

-- Sequences need to check via campaign
CREATE POLICY "Org access via campaign" ON sequences FOR ALL
  USING (campaign_id IN (SELECT id FROM campaigns WHERE org_id = get_user_org_id()));
