-- ===========================================
-- CALENDAR ACCOUNTS
-- ===========================================
CREATE TABLE calendar_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Provider
  provider TEXT NOT NULL CHECK (provider IN ('google', 'cal_com', 'calendly')),
  
  -- Display
  name TEXT NOT NULL,
  email TEXT,
  
  -- OAuth tokens (encrypted) - for Google/Calendly
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  
  -- API key (encrypted) - for Cal.com
  api_key_encrypted TEXT,
  
  -- Provider-specific
  calendar_id TEXT,           -- Google Calendar ID
  event_type_id TEXT,         -- Cal.com/Calendly event type URI
  scheduling_url TEXT,        -- Public booking link
  
  -- Settings
  default_duration_minutes INTEGER DEFAULT 30,
  buffer_before_minutes INTEGER DEFAULT 0,
  buffer_after_minutes INTEGER DEFAULT 0,
  
  -- Working hours (JSON)
  working_hours JSONB DEFAULT '{
    "monday": {"start": "09:00", "end": "17:00"},
    "tuesday": {"start": "09:00", "end": "17:00"},
    "wednesday": {"start": "09:00", "end": "17:00"},
    "thursday": {"start": "09:00", "end": "17:00"},
    "friday": {"start": "09:00", "end": "17:00"}
  }'::jsonb,
  
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(org_id, provider, email)
);

-- ===========================================
-- CALENDAR BOOKINGS
-- ===========================================
CREATE TABLE calendar_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  calendar_account_id UUID REFERENCES calendar_accounts(id) ON DELETE SET NULL,
  
  -- Related entities
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  autopilot_session_id UUID REFERENCES autopilot_sessions(id) ON DELETE SET NULL,
  
  -- Provider info
  provider TEXT NOT NULL,
  provider_event_id TEXT,
  provider_booking_id TEXT,
  
  -- Meeting details
  title TEXT NOT NULL,
  description TEXT,
  
  -- Timing
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  
  -- Location/link
  location TEXT,
  meeting_link TEXT,
  
  -- Attendees
  attendee_email TEXT NOT NULL,
  attendee_name TEXT,
  
  -- Status
  status TEXT DEFAULT 'confirmed' CHECK (status IN (
    'pending',
    'confirmed',
    'cancelled',
    'completed',
    'no_show',
    'rescheduled'
  )),
  
  -- Outcome (filled after meeting)
  outcome TEXT CHECK (outcome IN (
    'interested',
    'not_interested',
    'follow_up_needed',
    'deal_closed',
    'other'
  )),
  outcome_notes TEXT,
  
  -- Timestamps
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Reminders sent
  reminder_sent_24h BOOLEAN DEFAULT false,
  reminder_sent_1h BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- INDEXES
-- ===========================================
CREATE INDEX idx_calendar_accounts_org ON calendar_accounts(org_id);
CREATE INDEX idx_calendar_accounts_provider ON calendar_accounts(provider);
CREATE INDEX idx_calendar_accounts_active ON calendar_accounts(is_active) WHERE is_active = true;

CREATE INDEX idx_calendar_bookings_org ON calendar_bookings(org_id);
CREATE INDEX idx_calendar_bookings_lead ON calendar_bookings(lead_id);
CREATE INDEX idx_calendar_bookings_calendar ON calendar_bookings(calendar_account_id);
CREATE INDEX idx_calendar_bookings_start ON calendar_bookings(start_time);
CREATE INDEX idx_calendar_bookings_status ON calendar_bookings(status);
CREATE INDEX idx_calendar_bookings_upcoming ON calendar_bookings(start_time, status) 
  WHERE status = 'confirmed' AND start_time > NOW();

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================
ALTER TABLE calendar_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org access" ON calendar_accounts FOR ALL USING (org_id = auth.user_org_id());
CREATE POLICY "Org access" ON calendar_bookings FOR ALL USING (org_id = auth.user_org_id());

-- ===========================================
-- TRIGGERS
-- ===========================================
CREATE TRIGGER update_calendar_accounts_updated_at 
  BEFORE UPDATE ON calendar_accounts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_calendar_bookings_updated_at 
  BEFORE UPDATE ON calendar_bookings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- FUNCTION: Set default calendar
-- ===========================================
CREATE OR REPLACE FUNCTION set_default_calendar()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is being set as default, unset others
  IF NEW.is_default = true THEN
    UPDATE calendar_accounts 
    SET is_default = false 
    WHERE org_id = NEW.org_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_single_default_calendar
  BEFORE INSERT OR UPDATE ON calendar_accounts
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION set_default_calendar();
