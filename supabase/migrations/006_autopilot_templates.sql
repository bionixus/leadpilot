-- ===========================================
-- Phase 3: Sequence Templates
-- ===========================================
CREATE TABLE IF NOT EXISTS sequence_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- NULL = system template
  
  name TEXT NOT NULL,
  description TEXT,
  industry TEXT,      -- 'saas', 'agency', 'recruiting', 'real_estate', 'consulting'
  use_case TEXT,      -- 'cold_outreach', 'follow_up', 'event_invitation', 'recruitment'
  
  -- Template steps with placeholders
  steps JSONB NOT NULL,
  
  -- Channels this template supports
  channels TEXT[] DEFAULT '{email}',
  
  is_public BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Phase 6: Autopilot Sessions
-- ===========================================
CREATE TABLE IF NOT EXISTS autopilot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Session status
  status TEXT DEFAULT 'onboarding' CHECK (status IN (
    'onboarding',
    'collecting_info',
    'finding_leads',
    'generating',
    'awaiting_approval',
    'sending',
    'paused',
    'completed'
  )),
  
  -- Conversation history
  conversation_history JSONB DEFAULT '[]'::jsonb,
  
  -- Collected info from 5 questions
  target_customer TEXT,
  target_countries TEXT[],
  target_titles TEXT[],
  company_size TEXT,
  competitors TEXT[],
  
  -- Business info
  business_description TEXT,
  benefits TEXT,
  cta TEXT,
  
  -- Autopilot configuration
  autopilot_level TEXT CHECK (autopilot_level IN (
    'full_autopilot',
    'approve_list',
    'approve_all'
  )),
  
  -- Related records
  campaign_id UUID,
  scraping_job_id UUID,
  
  -- Progress stats
  leads_found INTEGER DEFAULT 0,
  leads_approved INTEGER DEFAULT 0,
  sequences_generated INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  
  -- Errors and logs
  last_error TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Update sequences table with approval fields
-- ===========================================
ALTER TABLE sequences 
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);

-- ===========================================
-- Indexes
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_templates_org ON sequence_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_templates_public ON sequence_templates(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_templates_industry ON sequence_templates(industry);
CREATE INDEX IF NOT EXISTS idx_autopilot_org ON autopilot_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_autopilot_status ON autopilot_sessions(status);
CREATE INDEX IF NOT EXISTS idx_autopilot_user ON autopilot_sessions(user_id);

-- ===========================================
-- RLS Policies
-- ===========================================
ALTER TABLE sequence_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopilot_sessions ENABLE ROW LEVEL SECURITY;

-- Templates: view public or own
DROP POLICY IF EXISTS "View public or own templates" ON sequence_templates;
CREATE POLICY "View public or own templates" ON sequence_templates
  FOR SELECT USING (is_public = true OR org_id = auth.user_org_id() OR org_id IS NULL);

DROP POLICY IF EXISTS "Manage own templates" ON sequence_templates;
CREATE POLICY "Manage own templates" ON sequence_templates
  FOR ALL USING (org_id = auth.user_org_id());

-- Autopilot sessions: org access
DROP POLICY IF EXISTS "Org access autopilot" ON autopilot_sessions;
CREATE POLICY "Org access autopilot" ON autopilot_sessions
  FOR ALL USING (org_id = auth.user_org_id());

-- ===========================================
-- Triggers
-- ===========================================
DROP TRIGGER IF EXISTS update_templates_updated_at ON sequence_templates;
CREATE TRIGGER update_templates_updated_at 
  BEFORE UPDATE ON sequence_templates 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_autopilot_updated_at ON autopilot_sessions;
CREATE TRIGGER update_autopilot_updated_at 
  BEFORE UPDATE ON autopilot_sessions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- Seed System Templates
-- ===========================================
INSERT INTO sequence_templates (name, description, industry, use_case, steps, channels, is_public, is_system) 
VALUES
(
  'SaaS Cold Outreach',
  'Professional B2B SaaS outreach sequence with 3 follow-ups',
  'saas',
  'cold_outreach',
  '[
    {"step": 1, "delay_days": 0, "channel": "email", "subject": "Quick question about {{company}}", "body": "Hi {{first_name}},\n\nI noticed {{company}} is growing fast. Congrats!\n\nI''m curious - how are you currently handling {{pain_point}}?\n\nWe''ve helped similar companies reduce costs by 30%.\n\nWorth a quick chat?\n\n{{sender_name}}"},
    {"step": 2, "delay_days": 3, "channel": "email", "subject": "Re: Quick question about {{company}}", "body": "Hi {{first_name}},\n\nJust bumping this up. I know you''re busy, but I thought this might be relevant.\n\nWould a 15-min call work?\n\n{{sender_name}}"},
    {"step": 3, "delay_days": 5, "channel": "email", "subject": "Last try - {{first_name}}", "body": "Hi {{first_name}},\n\nI''ll keep this short - I don''t want to spam you.\n\nIf this isn''t a priority right now, no worries. But if it ever becomes one, I''d love to help.\n\nWishing you and {{company}} continued success.\n\n{{sender_name}}"}
  ]'::jsonb,
  '{email}',
  true,
  true
),
(
  'Agency New Client',
  'Outreach sequence for agencies seeking new clients',
  'agency',
  'cold_outreach',
  '[
    {"step": 1, "delay_days": 0, "channel": "email", "subject": "Loved {{company}}''s recent work", "body": "Hi {{first_name}},\n\nI came across {{company}}''s recent work and was really impressed.\n\nWe''re a digital agency and we''ve helped brands like yours achieve great results.\n\nI have a few ideas that could help {{company}} grow.\n\nWould you be open to a quick call?\n\n{{sender_name}}"},
    {"step": 2, "delay_days": 4, "channel": "email", "subject": "Re: Ideas for {{company}}", "body": "Hi {{first_name}},\n\nFollowing up on my last note. I put together a quick audit - found some interesting opportunities.\n\nHappy to walk you through it - no strings attached.\n\n{{sender_name}}"},
    {"step": 3, "delay_days": 6, "channel": "email", "subject": "Quick question", "body": "Hi {{first_name}},\n\nIs growth something you''re focused on right now? If not, I''ll stop reaching out.\n\nBut if it is, I''d love to share what we''ve learned working with similar brands.\n\n{{sender_name}}"}
  ]'::jsonb,
  '{email}',
  true,
  true
),
(
  'Recruitment Outreach',
  'Candidate sourcing sequence for recruiters',
  'recruiting',
  'recruitment',
  '[
    {"step": 1, "delay_days": 0, "channel": "email", "subject": "Exciting opportunity at {{hiring_company}}", "body": "Hi {{first_name}},\n\nI came across your profile and was impressed by your experience at {{company}}.\n\nI''m recruiting for a {{job_title}} role at {{hiring_company}} that I think would be a great fit.\n\nWould you be open to learning more?\n\n{{sender_name}}"},
    {"step": 2, "delay_days": 3, "channel": "email", "subject": "Re: {{job_title}} opportunity", "body": "Hi {{first_name}},\n\nJust following up - this role offers {{key_benefit}} and the team is doing amazing work.\n\nEven if you''re not looking, I''d love to connect for future opportunities.\n\n{{sender_name}}"},
    {"step": 3, "delay_days": 5, "channel": "email", "subject": "Last check-in", "body": "Hi {{first_name}},\n\nI don''t want to keep reaching out if this isn''t a good time.\n\nIf you''re ever open to new opportunities, feel free to reach out. Happy to keep you in mind.\n\n{{sender_name}}"}
  ]'::jsonb,
  '{email}',
  true,
  true
)
ON CONFLICT DO NOTHING;
