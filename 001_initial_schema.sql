-- ===========================================
-- LeadPilot Database Schema
-- Migration: 001_initial_schema
-- ===========================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===========================================
-- ORGANIZATIONS (Multi-tenant)
-- ===========================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  
  -- Business context for LLM sequence generation
  business_context JSONB DEFAULT '{}'::jsonb,
  -- Expected structure:
  -- {
  --   "company_name": "...",
  --   "industry": "...",
  --   "target_audience": "...",
  --   "value_proposition": "...",
  --   "tone": "professional|casual|formal",
  --   "key_pain_points": ["..."],
  --   "case_studies": ["..."],
  --   "cta": "...",
  --   "sender_name": "...",
  --   "sender_title": "..."
  -- }
  
  settings JSONB DEFAULT '{
    "timezone": "UTC",
    "default_sequence_length": 3,
    "send_window_start": "09:00",
    "send_window_end": "17:00",
    "send_days": ["monday", "tuesday", "wednesday", "thursday", "friday"]
  }'::jsonb,
  
  -- Subscription/billing (future use)
  subscription_tier TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'active',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- USERS
-- ===========================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Supabase Auth user ID
  auth_id UUID UNIQUE NOT NULL,
  
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  
  -- Notification preferences
  notification_preferences JSONB DEFAULT '{
    "email_replies": true,
    "email_bounces": true,
    "daily_digest": true,
    "browser_push": true
  }'::jsonb,
  
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- EMAIL ACCOUNTS (Connected by clients)
-- ===========================================
CREATE TABLE email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  email_address TEXT NOT NULL,
  display_name TEXT,
  
  -- Provider info
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook', 'custom')),
  
  -- For OAuth providers (Gmail, Outlook)
  oauth_access_token_encrypted TEXT,
  oauth_refresh_token_encrypted TEXT,
  oauth_token_expires_at TIMESTAMPTZ,
  
  -- For custom IMAP/SMTP
  imap_host TEXT,
  imap_port INTEGER DEFAULT 993,
  imap_secure BOOLEAN DEFAULT true,
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_secure BOOLEAN DEFAULT true,
  credentials_encrypted TEXT, -- Encrypted JSON {username, password}
  
  -- Sending limits & warmup
  daily_send_limit INTEGER DEFAULT 50,
  emails_sent_today INTEGER DEFAULT 0,
  warmup_enabled BOOLEAN DEFAULT true,
  warmup_day INTEGER DEFAULT 0, -- Days since warmup started
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  connection_status TEXT DEFAULT 'pending' CHECK (connection_status IN ('pending', 'connected', 'error', 'revoked')),
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(org_id, email_address)
);

-- ===========================================
-- CAMPAIGNS
-- ===========================================
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Source of leads
  source TEXT NOT NULL CHECK (source IN ('csv', 'google_sheets', 'linkedin', 'apollo', 'google_maps', 'manual')),
  source_config JSONB DEFAULT '{}'::jsonb,
  -- For google_sheets: { sheet_id, range, sync_enabled }
  -- For linkedin: { search_url, filters }
  -- For apollo: { search_params }
  
  -- Which email account to send from
  email_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
  
  -- Campaign settings
  settings JSONB DEFAULT '{
    "sequence_length": 3,
    "delay_between_emails_days": [0, 3, 5],
    "stop_on_reply": true,
    "track_opens": true,
    "timezone": "UTC",
    "send_window_start": "09:00",
    "send_window_end": "17:00"
  }'::jsonb,
  
  -- LLM customization for this campaign (overrides org defaults)
  llm_context JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  
  -- Stats (denormalized for quick access)
  stats JSONB DEFAULT '{
    "total_leads": 0,
    "emails_sent": 0,
    "emails_opened": 0,
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
  
  -- Core info
  email TEXT NOT NULL,
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
  phone TEXT,
  
  -- Location
  city TEXT,
  state TEXT,
  country TEXT,
  timezone TEXT,
  
  -- Enrichment data from Apollo/other sources
  enrichment_data JSONB DEFAULT '{}'::jsonb,
  -- {
  --   "company_size": "...",
  --   "company_industry": "...",
  --   "company_revenue": "...",
  --   "seniority": "...",
  --   "departments": [...],
  --   "technologies": [...]
  -- }
  
  -- Custom fields (user-defined)
  custom_fields JSONB DEFAULT '{}'::jsonb,
  
  -- Lead status
  status TEXT DEFAULT 'new' CHECK (status IN (
    'new',           -- Just imported
    'sequenced',     -- Sequence generated
    'contacted',     -- First email sent
    'replied',       -- Received a reply
    'interested',    -- Positive reply
    'not_interested',-- Negative reply
    'bounced',       -- Email bounced
    'unsubscribed',  -- Requested removal
    'converted'      -- Meeting booked / deal closed
  )),
  
  -- Email validation
  email_valid BOOLEAN,
  email_validation_checked_at TIMESTAMPTZ,
  
  -- Source tracking
  source TEXT,
  source_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicates within same org+campaign
  UNIQUE(org_id, campaign_id, email)
);

-- ===========================================
-- SEQUENCES (LLM Generated)
-- ===========================================
CREATE TABLE sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- The generated sequence
  emails JSONB NOT NULL,
  -- [
  --   { "step": 1, "delay_days": 0, "subject": "...", "body": "..." },
  --   { "step": 2, "delay_days": 3, "subject": "Re: ...", "body": "..." },
  --   { "step": 3, "delay_days": 5, "subject": "...", "body": "..." }
  -- ]
  
  -- LLM metadata
  llm_model TEXT DEFAULT 'claude-sonnet-4-5-20250929',
  llm_prompt_tokens INTEGER,
  llm_completion_tokens INTEGER,
  
  -- Current progress
  current_step INTEGER DEFAULT 0, -- 0 = not started
  is_complete BOOLEAN DEFAULT false,
  stopped_reason TEXT, -- 'completed', 'replied', 'bounced', 'manual'
  
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(lead_id) -- One sequence per lead
);

-- ===========================================
-- EMAILS (Sent/Scheduled)
-- ===========================================
CREATE TABLE emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES sequences(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  email_account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  
  -- Email content
  step INTEGER NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  
  -- Headers for threading
  message_id TEXT UNIQUE, -- Our generated Message-ID
  in_reply_to TEXT,       -- For follow-ups in same thread
  thread_id TEXT,         -- Gmail/Outlook thread ID
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ,
  
  -- Status tracking
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft',      -- Not yet scheduled
    'scheduled',  -- Queued for sending
    'sending',    -- Currently being sent
    'sent',       -- Successfully sent
    'delivered',  -- Delivery confirmed (if available)
    'opened',     -- Recipient opened
    'clicked',    -- Link clicked
    'bounced',    -- Hard or soft bounce
    'failed'      -- Failed to send
  )),
  
  -- Timestamps
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  
  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Tracking
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- INBOX MESSAGES (Replies & Conversations)
-- ===========================================
CREATE TABLE inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email_account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  
  -- Direction
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  
  -- Email headers
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_email TEXT NOT NULL,
  to_name TEXT,
  cc TEXT[],
  bcc TEXT[],
  
  subject TEXT,
  
  -- Content
  body_text TEXT,
  body_html TEXT,
  snippet TEXT, -- First ~200 chars for preview
  
  -- Threading
  message_id TEXT UNIQUE,
  in_reply_to TEXT,
  references_header TEXT[],
  thread_id TEXT, -- Our internal thread grouping
  
  -- Attachments (metadata only)
  attachments JSONB DEFAULT '[]'::jsonb,
  -- [{ "filename": "...", "mime_type": "...", "size": 123 }]
  
  -- Classification (for inbound)
  classification TEXT CHECK (classification IN (
    'interested',     -- Positive response
    'not_interested', -- Negative response
    'question',       -- Has questions
    'out_of_office',  -- Auto-reply
    'bounce',         -- Bounce notification
    'unsubscribe',    -- Unsubscribe request
    'other'
  )),
  classification_confidence FLOAT,
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  is_starred BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  
  -- Provider metadata
  provider_message_id TEXT, -- Gmail/Outlook message ID
  provider_thread_id TEXT,  -- Gmail/Outlook thread ID
  
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
    'reply_received',
    'positive_reply',
    'bounce',
    'campaign_completed',
    'scraping_completed',
    'daily_digest',
    'system'
  )),
  
  title TEXT NOT NULL,
  message TEXT,
  
  -- Related entities
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  inbox_message_id UUID REFERENCES inbox_messages(id) ON DELETE CASCADE,
  
  -- Link to relevant page
  action_url TEXT,
  
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- SCRAPING JOBS (Apify)
-- ===========================================
CREATE TABLE scraping_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Apify details
  apify_actor_id TEXT NOT NULL,
  apify_run_id TEXT,
  
  -- Job type
  job_type TEXT NOT NULL CHECK (job_type IN (
    'linkedin_search',
    'linkedin_profile',
    'apollo_search',
    'apollo_enrich',
    'google_maps'
  )),
  
  -- Input configuration
  input_config JSONB NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',    -- Created, not yet started
    'running',    -- Apify job in progress
    'completed',  -- Successfully finished
    'failed',     -- Job failed
    'cancelled'   -- Manually cancelled
  )),
  
  -- Results
  results_count INTEGER,
  leads_created INTEGER,
  error_message TEXT,
  
  -- Cost tracking
  compute_units_used FLOAT,
  
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- INDEXES
-- ===========================================

-- Organizations
CREATE INDEX idx_orgs_slug ON organizations(slug);

-- Users
CREATE INDEX idx_users_org ON users(org_id);
CREATE INDEX idx_users_auth ON users(auth_id);
CREATE INDEX idx_users_email ON users(email);

-- Email Accounts
CREATE INDEX idx_email_accounts_org ON email_accounts(org_id);
CREATE INDEX idx_email_accounts_active ON email_accounts(org_id, is_active) WHERE is_active = true;

-- Campaigns
CREATE INDEX idx_campaigns_org ON campaigns(org_id);
CREATE INDEX idx_campaigns_status ON campaigns(org_id, status);

-- Leads
CREATE INDEX idx_leads_org ON leads(org_id);
CREATE INDEX idx_leads_campaign ON leads(campaign_id);
CREATE INDEX idx_leads_email ON leads(org_id, email);
CREATE INDEX idx_leads_status ON leads(campaign_id, status);

-- Sequences
CREATE INDEX idx_sequences_campaign ON sequences(campaign_id);
CREATE INDEX idx_sequences_lead ON sequences(lead_id);
CREATE INDEX idx_sequences_pending ON sequences(campaign_id, is_complete) WHERE is_complete = false;

-- Emails
CREATE INDEX idx_emails_org ON emails(org_id);
CREATE INDEX idx_emails_campaign ON emails(campaign_id);
CREATE INDEX idx_emails_lead ON emails(lead_id);
CREATE INDEX idx_emails_scheduled ON emails(status, scheduled_for) WHERE status = 'scheduled';
CREATE INDEX idx_emails_thread ON emails(thread_id);
CREATE INDEX idx_emails_message_id ON emails(message_id);

-- Inbox Messages
CREATE INDEX idx_inbox_org ON inbox_messages(org_id);
CREATE INDEX idx_inbox_account ON inbox_messages(email_account_id);
CREATE INDEX idx_inbox_lead ON inbox_messages(lead_id);
CREATE INDEX idx_inbox_thread ON inbox_messages(thread_id);
CREATE INDEX idx_inbox_unread ON inbox_messages(org_id, is_read) WHERE is_read = false;
CREATE INDEX idx_inbox_message_id ON inbox_messages(message_id);

-- Notifications
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- Scraping Jobs
CREATE INDEX idx_scraping_jobs_org ON scraping_jobs(org_id);
CREATE INDEX idx_scraping_jobs_campaign ON scraping_jobs(campaign_id);
CREATE INDEX idx_scraping_jobs_status ON scraping_jobs(org_id, status);

-- ===========================================
-- ROW LEVEL SECURITY (RLS)
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
CREATE OR REPLACE FUNCTION auth.user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM users WHERE auth_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Organizations: Users can only see their own org
CREATE POLICY "Users can view their organization"
  ON organizations FOR SELECT
  USING (id = auth.user_org_id());

CREATE POLICY "Owners can update their organization"
  ON organizations FOR UPDATE
  USING (id = auth.user_org_id())
  WITH CHECK (id = auth.user_org_id());

-- Users: Users can see members of their org
CREATE POLICY "Users can view org members"
  ON users FOR SELECT
  USING (org_id = auth.user_org_id());

CREATE POLICY "Users can update themselves"
  ON users FOR UPDATE
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- Email Accounts: Org members can view, admins can modify
CREATE POLICY "Org members can view email accounts"
  ON email_accounts FOR SELECT
  USING (org_id = auth.user_org_id());

CREATE POLICY "Org members can manage email accounts"
  ON email_accounts FOR ALL
  USING (org_id = auth.user_org_id())
  WITH CHECK (org_id = auth.user_org_id());

-- Campaigns: Org members can view and manage
CREATE POLICY "Org members can view campaigns"
  ON campaigns FOR SELECT
  USING (org_id = auth.user_org_id());

CREATE POLICY "Org members can manage campaigns"
  ON campaigns FOR ALL
  USING (org_id = auth.user_org_id())
  WITH CHECK (org_id = auth.user_org_id());

-- Leads: Org members can view and manage
CREATE POLICY "Org members can view leads"
  ON leads FOR SELECT
  USING (org_id = auth.user_org_id());

CREATE POLICY "Org members can manage leads"
  ON leads FOR ALL
  USING (org_id = auth.user_org_id())
  WITH CHECK (org_id = auth.user_org_id());

-- Sequences: Org members can view and manage
CREATE POLICY "Org members can view sequences"
  ON sequences FOR SELECT
  USING (org_id = auth.user_org_id());

CREATE POLICY "Org members can manage sequences"
  ON sequences FOR ALL
  USING (org_id = auth.user_org_id())
  WITH CHECK (org_id = auth.user_org_id());

-- Emails: Org members can view and manage
CREATE POLICY "Org members can view emails"
  ON emails FOR SELECT
  USING (org_id = auth.user_org_id());

CREATE POLICY "Org members can manage emails"
  ON emails FOR ALL
  USING (org_id = auth.user_org_id())
  WITH CHECK (org_id = auth.user_org_id());

-- Inbox Messages: Org members can view and manage
CREATE POLICY "Org members can view inbox"
  ON inbox_messages FOR SELECT
  USING (org_id = auth.user_org_id());

CREATE POLICY "Org members can manage inbox"
  ON inbox_messages FOR ALL
  USING (org_id = auth.user_org_id())
  WITH CHECK (org_id = auth.user_org_id());

-- Notifications: Users can only see their own
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Scraping Jobs: Org members can view and manage
CREATE POLICY "Org members can view scraping jobs"
  ON scraping_jobs FOR SELECT
  USING (org_id = auth.user_org_id());

CREATE POLICY "Org members can manage scraping jobs"
  ON scraping_jobs FOR ALL
  USING (org_id = auth.user_org_id())
  WITH CHECK (org_id = auth.user_org_id());

-- ===========================================
-- FUNCTIONS & TRIGGERS
-- ===========================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_email_accounts_updated_at
  BEFORE UPDATE ON email_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_sequences_updated_at
  BEFORE UPDATE ON sequences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_emails_updated_at
  BEFORE UPDATE ON emails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_inbox_messages_updated_at
  BEFORE UPDATE ON inbox_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_scraping_jobs_updated_at
  BEFORE UPDATE ON scraping_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to update campaign stats
CREATE OR REPLACE FUNCTION update_campaign_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE campaigns
  SET stats = (
    SELECT jsonb_build_object(
      'total_leads', COUNT(*),
      'emails_sent', COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'opened')),
      'emails_opened', COUNT(*) FILTER (WHERE status = 'opened'),
      'replies_received', COUNT(*) FILTER (WHERE status IN ('replied', 'interested', 'not_interested')),
      'positive_replies', COUNT(*) FILTER (WHERE status = 'interested'),
      'bounces', COUNT(*) FILTER (WHERE status = 'bounced')
    )
    FROM leads
    WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id)
  )
  WHERE id = COALESCE(NEW.campaign_id, OLD.campaign_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_campaign_stats
  AFTER INSERT OR UPDATE OF status OR DELETE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_campaign_stats();

-- Function to stop sequence on reply
CREATE OR REPLACE FUNCTION stop_sequence_on_reply()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.direction = 'inbound' AND NEW.lead_id IS NOT NULL THEN
    UPDATE sequences
    SET is_complete = true,
        stopped_reason = 'replied'
    WHERE lead_id = NEW.lead_id
      AND is_complete = false;
    
    UPDATE leads
    SET status = 'replied'
    WHERE id = NEW.lead_id
      AND status NOT IN ('interested', 'not_interested', 'converted');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_stop_sequence_on_reply
  AFTER INSERT ON inbox_messages
  FOR EACH ROW EXECUTE FUNCTION stop_sequence_on_reply();

-- ===========================================
-- SEED DATA FUNCTION (for development)
-- ===========================================

CREATE OR REPLACE FUNCTION seed_demo_data(demo_org_name TEXT, demo_user_auth_id UUID)
RETURNS void AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
BEGIN
  -- Create demo organization
  INSERT INTO organizations (name, slug, business_context)
  VALUES (
    demo_org_name,
    lower(replace(demo_org_name, ' ', '-')),
    '{
      "company_name": "Demo Company",
      "industry": "SaaS",
      "target_audience": "B2B decision makers",
      "value_proposition": "We help companies automate their outreach",
      "tone": "professional",
      "key_pain_points": ["manual outreach", "low response rates"],
      "case_studies": ["Increased response rates by 300%"],
      "cta": "15-minute discovery call",
      "sender_name": "Demo User",
      "sender_title": "Founder"
    }'::jsonb
  )
  RETURNING id INTO v_org_id;
  
  -- Create demo user
  INSERT INTO users (org_id, auth_id, email, full_name, role)
  VALUES (v_org_id, demo_user_auth_id, 'demo@example.com', 'Demo User', 'owner')
  RETURNING id INTO v_user_id;
  
  RAISE NOTICE 'Created org % and user %', v_org_id, v_user_id;
END;
$$ LANGUAGE plpgsql;
