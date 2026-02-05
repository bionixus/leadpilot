-- ===========================================
-- PHASE 12: AUTONOMOUS AGENT SYSTEM
-- ===========================================

-- ===========================================
-- AGENT CONFIGURATION
-- ===========================================
CREATE TABLE IF NOT EXISTS agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL DEFAULT 'LeadPilot Agent',
  
  -- Agent state
  is_enabled BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'idle' CHECK (status IN (
    'idle', 'running', 'paused', 'error'
  )),
  
  -- LLM settings for agent
  llm_provider TEXT DEFAULT 'anthropic',
  llm_model TEXT DEFAULT 'claude-sonnet-4-20250514',
  temperature FLOAT DEFAULT 0.7,
  
  -- Scheduling
  schedule_enabled BOOLEAN DEFAULT true,
  schedule_timezone TEXT DEFAULT 'UTC',
  schedule_days TEXT[] DEFAULT '{monday,tuesday,wednesday,thursday,friday}',
  schedule_start_time TIME DEFAULT '09:00',
  schedule_end_time TIME DEFAULT '17:00',
  
  -- Rate limits
  max_leads_per_day INTEGER DEFAULT 50,
  max_messages_per_day INTEGER DEFAULT 100,
  max_actions_per_hour INTEGER DEFAULT 20,
  
  -- Behavior settings
  auto_respond_to_positive BOOLEAN DEFAULT false,
  auto_respond_to_questions BOOLEAN DEFAULT true,
  auto_book_meetings BOOLEAN DEFAULT false,
  require_approval_for TEXT[] DEFAULT '{send_message,book_meeting}',
  
  -- Notifications
  notify_on_positive_reply BOOLEAN DEFAULT true,
  notify_on_meeting_booked BOOLEAN DEFAULT true,
  notify_on_error BOOLEAN DEFAULT true,
  notify_email TEXT,
  notify_slack_webhook TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(org_id)
);

-- ===========================================
-- AGENT RULES (User-defined constraints)
-- ===========================================
CREATE TABLE IF NOT EXISTS agent_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_config_id UUID REFERENCES agent_configs(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Rule type
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'filter',        -- Filter leads (e.g., "skip competitors")
    'action',        -- Trigger action (e.g., "if interested, book meeting")
    'constraint',    -- Limit behavior (e.g., "max 3 follow-ups")
    'template',      -- Response template (e.g., "for pricing questions, use...")
    'schedule',      -- Timing rule (e.g., "don't contact on weekends")
    'escalation'     -- When to alert human (e.g., "if angry, stop and alert")
  )),
  
  -- Rule definition (natural language + structured)
  condition TEXT NOT NULL,        -- Natural language condition
  condition_json JSONB,           -- Structured condition for evaluation
  action TEXT NOT NULL,           -- What to do when condition matches
  action_json JSONB,              -- Structured action
  
  -- Priority (higher = evaluated first)
  priority INTEGER DEFAULT 0,
  
  is_enabled BOOLEAN DEFAULT true,
  
  -- Stats
  times_triggered INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- AGENT TASKS (Work queue)
-- ===========================================
CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_config_id UUID REFERENCES agent_configs(id) ON DELETE CASCADE,
  
  -- Task type
  task_type TEXT NOT NULL CHECK (task_type IN (
    'find_leads',
    'enrich_lead',
    'generate_sequence',
    'send_message',
    'check_inbox',
    'classify_reply',
    'respond_to_reply',
    'book_meeting',
    'follow_up',
    'report'
  )),
  
  -- Priority (higher = execute first)
  priority INTEGER DEFAULT 0,
  
  -- Related entities
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Task data
  input_data JSONB DEFAULT '{}'::jsonb,
  output_data JSONB,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',
    'running', 
    'awaiting_approval',
    'completed',
    'failed',
    'cancelled'
  )),
  
  -- Approval
  requires_approval BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Execution
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- AGENT MEMORY (Persistent context)
-- ===========================================
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Memory type
  memory_type TEXT NOT NULL CHECK (memory_type IN (
    'lead_context',      -- Info about a specific lead
    'conversation',      -- Conversation history
    'learning',          -- What agent has learned
    'preference',        -- User/org preferences
    'fact',              -- General facts
    'strategy'           -- What works/doesn't work
  )),
  
  -- Related entities
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- Memory content
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Importance (for retrieval ranking)
  importance FLOAT DEFAULT 0.5,
  
  -- Expiration
  expires_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- AGENT LOGS (Audit trail)
-- ===========================================
CREATE TABLE IF NOT EXISTS agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_config_id UUID REFERENCES agent_configs(id),
  task_id UUID REFERENCES agent_tasks(id) ON DELETE CASCADE,
  
  -- Log type
  log_type TEXT NOT NULL CHECK (log_type IN (
    'decision',      -- Agent made a decision
    'action',        -- Agent took an action
    'observation',   -- Agent observed something
    'learning',      -- Agent learned something
    'error',         -- Something went wrong
    'approval',      -- Approval requested/granted/denied
    'rule_triggered' -- A rule was triggered
  )),
  
  -- Log content
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  
  -- For decisions, capture reasoning
  reasoning TEXT,
  confidence FLOAT,
  
  -- Related rule if triggered
  rule_id UUID REFERENCES agent_rules(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- INDEXES
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_agent_configs_org ON agent_configs(org_id);
CREATE INDEX IF NOT EXISTS idx_agent_rules_org ON agent_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_agent_rules_type ON agent_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_scheduled ON agent_tasks(scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_agent_tasks_org ON agent_tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_lead ON agent_memory(lead_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_type ON agent_memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_agent_memory_org ON agent_memory(org_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_task ON agent_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_created ON agent_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_logs_org ON agent_logs(org_id);

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================
ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;

-- Policies for agent_configs
DROP POLICY IF EXISTS "Users can view own org agent config" ON agent_configs;
CREATE POLICY "Users can view own org agent config" ON agent_configs
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own org agent config" ON agent_configs;
CREATE POLICY "Users can update own org agent config" ON agent_configs
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own org agent config" ON agent_configs;
CREATE POLICY "Users can insert own org agent config" ON agent_configs
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
  );

-- Policies for agent_rules
DROP POLICY IF EXISTS "Users can manage own org agent rules" ON agent_rules;
CREATE POLICY "Users can manage own org agent rules" ON agent_rules
  FOR ALL USING (
    org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
  );

-- Policies for agent_tasks
DROP POLICY IF EXISTS "Users can manage own org agent tasks" ON agent_tasks;
CREATE POLICY "Users can manage own org agent tasks" ON agent_tasks
  FOR ALL USING (
    org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
  );

-- Policies for agent_memory
DROP POLICY IF EXISTS "Users can manage own org agent memory" ON agent_memory;
CREATE POLICY "Users can manage own org agent memory" ON agent_memory
  FOR ALL USING (
    org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
  );

-- Policies for agent_logs
DROP POLICY IF EXISTS "Users can view own org agent logs" ON agent_logs;
CREATE POLICY "Users can view own org agent logs" ON agent_logs
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own org agent logs" ON agent_logs;
CREATE POLICY "Users can insert own org agent logs" ON agent_logs
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid())
  );

-- ===========================================
-- TRIGGERS
-- ===========================================
CREATE OR REPLACE FUNCTION update_agent_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_configs_updated_at ON agent_configs;
CREATE TRIGGER agent_configs_updated_at
  BEFORE UPDATE ON agent_configs
  FOR EACH ROW EXECUTE FUNCTION update_agent_configs_updated_at();

DROP TRIGGER IF EXISTS agent_rules_updated_at ON agent_rules;
CREATE TRIGGER agent_rules_updated_at
  BEFORE UPDATE ON agent_rules
  FOR EACH ROW EXECUTE FUNCTION update_agent_configs_updated_at();

DROP TRIGGER IF EXISTS agent_tasks_updated_at ON agent_tasks;
CREATE TRIGGER agent_tasks_updated_at
  BEFORE UPDATE ON agent_tasks
  FOR EACH ROW EXECUTE FUNCTION update_agent_configs_updated_at();

DROP TRIGGER IF EXISTS agent_memory_updated_at ON agent_memory;
CREATE TRIGGER agent_memory_updated_at
  BEFORE UPDATE ON agent_memory
  FOR EACH ROW EXECUTE FUNCTION update_agent_configs_updated_at();
