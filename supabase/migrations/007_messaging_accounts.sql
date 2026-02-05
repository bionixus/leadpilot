-- ===========================================
-- Phase 8: Messaging Accounts (WhatsApp/SMS)
-- ===========================================
CREATE TABLE IF NOT EXISTS messaging_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  provider TEXT NOT NULL DEFAULT 'twilio' CHECK (provider IN ('twilio', 'whatsapp_business', 'messagebird')),
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
  connection_status TEXT DEFAULT 'pending' CHECK (connection_status IN ('pending', 'connected', 'error', 'revoked')),
  last_error TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(org_id, phone_number, channel)
);

-- Add phone fields to leads table for multi-channel
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp TEXT;

-- ===========================================
-- Indexes
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_messaging_accounts_org ON messaging_accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_messaging_accounts_channel ON messaging_accounts(channel);

-- ===========================================
-- RLS
-- ===========================================
ALTER TABLE messaging_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org access messaging" ON messaging_accounts;
CREATE POLICY "Org access messaging" ON messaging_accounts
  FOR ALL USING (org_id = auth.user_org_id());

-- ===========================================
-- Triggers
-- ===========================================
DROP TRIGGER IF EXISTS update_messaging_accounts_updated_at ON messaging_accounts;
CREATE TRIGGER update_messaging_accounts_updated_at 
  BEFORE UPDATE ON messaging_accounts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Reset daily counters at midnight (run via cron)
-- CREATE OR REPLACE FUNCTION reset_messaging_daily_counters()
-- RETURNS void AS $$
-- BEGIN
--   UPDATE messaging_accounts SET messages_sent_today = 0;
-- END;
-- $$ LANGUAGE plpgsql;
