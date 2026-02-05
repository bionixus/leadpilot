# Phase 12: Autonomous Agent System

> **Objective**: Build a fully autonomous AI agent for LeadPilot inspired by OpenClaw/Clawdbot architecture, with configurable rules and full user control.

---

## 12.1 Overview

The LeadPilot Agent is an autonomous system that can:

1. **Find Leads** - Search LinkedIn, Apollo, Google Maps automatically based on ICP
2. **Enrich Data** - Gather additional info about leads from multiple sources
3. **Generate Sequences** - Create personalized outreach for each lead
4. **Send Messages** - Execute outreach via Email, WhatsApp, SMS
5. **Handle Replies** - Classify, respond, escalate based on rules
6. **Book Meetings** - Integrate with calendars to schedule calls
7. **Learn & Adapt** - Improve based on what works

All while respecting user-defined rules and constraints.

---

## 12.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      LEADPILOT AGENT                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │    BRAIN     │  │   MEMORY     │  │    RULES     │       │
│  │  (LLM Core)  │  │  (Context)   │  │  (Constraints│       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │                │
│         └────────────┬────┴────────────────┘                │
│                      │                                       │
│              ┌───────▼────────┐                              │
│              │   ORCHESTRATOR │                              │
│              │   (Task Queue) │                              │
│              └───────┬────────┘                              │
│                      │                                       │
│    ┌────────┬────────┼────────┬────────┬────────┐           │
│    │        │        │        │        │        │           │
│    ▼        ▼        ▼        ▼        ▼        ▼           │
│ ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐           │
│ │Scout ││Writer││Sender││Reader││Booker││Learn │           │
│ │Agent ││Agent ││Agent ││Agent ││Agent ││Agent │           │
│ └──────┘└──────┘└──────┘└──────┘└──────┘└──────┘           │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                        TOOLS                                 │
│  [LinkedIn] [Apollo] [Email] [WhatsApp] [Calendar] [Browser] │
└─────────────────────────────────────────────────────────────┘
```

### Components

| Component | Purpose |
|-----------|---------|
| **Brain** | LLM core for reasoning and decision-making |
| **Memory** | Persistent context, conversation history, learnings |
| **Rules** | User-defined constraints, limits, and behaviors |
| **Orchestrator** | Task queue, scheduling, agent coordination |
| **Agents** | Specialized workers for specific tasks |
| **Tools** | Integrations with external services |

---

## 12.3 Database Schema Updates

Add to your migration:

```sql
-- ===========================================
-- AGENT CONFIGURATION
-- ===========================================
CREATE TABLE agent_configs (
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
CREATE TABLE agent_rules (
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
CREATE TABLE agent_tasks (
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
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  inbox_message_id UUID REFERENCES inbox_messages(id) ON DELETE CASCADE,
  
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
CREATE TABLE agent_memory (
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
CREATE TABLE agent_logs (
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

-- Indexes
CREATE INDEX idx_agent_configs_org ON agent_configs(org_id);
CREATE INDEX idx_agent_rules_org ON agent_rules(org_id);
CREATE INDEX idx_agent_rules_type ON agent_rules(rule_type);
CREATE INDEX idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX idx_agent_tasks_scheduled ON agent_tasks(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_agent_memory_lead ON agent_memory(lead_id);
CREATE INDEX idx_agent_memory_type ON agent_memory(memory_type);
CREATE INDEX idx_agent_logs_task ON agent_logs(task_id);
CREATE INDEX idx_agent_logs_created ON agent_logs(created_at);

-- RLS
ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org access" ON agent_configs FOR ALL USING (org_id = auth.user_org_id());
CREATE POLICY "Org access" ON agent_rules FOR ALL USING (org_id = auth.user_org_id());
CREATE POLICY "Org access" ON agent_tasks FOR ALL USING (org_id = auth.user_org_id());
CREATE POLICY "Org access" ON agent_memory FOR ALL USING (org_id = auth.user_org_id());
CREATE POLICY "Org access" ON agent_logs FOR ALL USING (org_id = auth.user_org_id());
```

---

## 12.4 Agent Core Types

### File: `src/lib/agent/types.ts`

```typescript
// Agent configuration
export interface AgentConfig {
  id: string;
  org_id: string;
  name: string;
  is_enabled: boolean;
  status: 'idle' | 'running' | 'paused' | 'error';
  
  // LLM
  llm_provider: string;
  llm_model: string;
  temperature: number;
  
  // Schedule
  schedule_enabled: boolean;
  schedule_timezone: string;
  schedule_days: string[];
  schedule_start_time: string;
  schedule_end_time: string;
  
  // Limits
  max_leads_per_day: number;
  max_messages_per_day: number;
  max_actions_per_hour: number;
  
  // Behavior
  auto_respond_to_positive: boolean;
  auto_respond_to_questions: boolean;
  auto_book_meetings: boolean;
  require_approval_for: string[];
}

// Rule definition
export interface AgentRule {
  id: string;
  name: string;
  rule_type: 'filter' | 'action' | 'constraint' | 'template' | 'schedule' | 'escalation';
  condition: string;
  condition_json?: Record<string, any>;
  action: string;
  action_json?: Record<string, any>;
  priority: number;
  is_enabled: boolean;
}

// Task in the queue
export interface AgentTask {
  id: string;
  task_type: TaskType;
  priority: number;
  status: 'pending' | 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled';
  input_data: Record<string, any>;
  output_data?: Record<string, any>;
  requires_approval: boolean;
  scheduled_for: string;
  error_message?: string;
}

export type TaskType = 
  | 'find_leads'
  | 'enrich_lead'
  | 'generate_sequence'
  | 'send_message'
  | 'check_inbox'
  | 'classify_reply'
  | 'respond_to_reply'
  | 'book_meeting'
  | 'follow_up'
  | 'report';

// Memory entry
export interface AgentMemory {
  id: string;
  memory_type: 'lead_context' | 'conversation' | 'learning' | 'preference' | 'fact' | 'strategy';
  key: string;
  value: string;
  metadata?: Record<string, any>;
  importance: number;
  lead_id?: string;
  campaign_id?: string;
}

// Agent decision with reasoning
export interface AgentDecision {
  action: string;
  reasoning: string;
  confidence: number;
  requires_approval: boolean;
  data?: Record<string, any>;
}

// Tool that agent can use
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (params: any) => Promise<any>;
}
```

---

## 12.5 Agent Brain (LLM Core)

### File: `src/lib/agent/brain.ts`

```typescript
import { getLLMProvider } from '@/lib/llm';
import type { AgentConfig, AgentRule, AgentMemory, AgentDecision, AgentTool } from './types';

export class AgentBrain {
  private config: AgentConfig;
  private rules: AgentRule[];
  private tools: AgentTool[];
  private llmProvider: any;
  
  constructor(
    config: AgentConfig,
    rules: AgentRule[],
    tools: AgentTool[]
  ) {
    this.config = config;
    this.rules = rules.filter(r => r.is_enabled).sort((a, b) => b.priority - a.priority);
    this.tools = tools;
    this.llmProvider = getLLMProvider(config.llm_provider as any);
  }
  
  // Main decision-making method
  async decide(
    context: string,
    memories: AgentMemory[],
    availableActions: string[]
  ): Promise<AgentDecision> {
    const systemPrompt = this.buildSystemPrompt();
    const contextPrompt = this.buildContextPrompt(context, memories, availableActions);
    
    const response = await this.llmProvider.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contextPrompt },
    ], { temperature: this.config.temperature });
    
    return this.parseDecision(response.content);
  }
  
  // Evaluate rules against a situation
  async evaluateRules(situation: Record<string, any>): Promise<AgentRule[]> {
    const triggeredRules: AgentRule[] = [];
    
    for (const rule of this.rules) {
      if (await this.checkRuleCondition(rule, situation)) {
        triggeredRules.push(rule);
      }
    }
    
    return triggeredRules;
  }
  
  // Check if a specific rule condition is met
  private async checkRuleCondition(
    rule: AgentRule,
    situation: Record<string, any>
  ): Promise<boolean> {
    // If structured condition exists, evaluate it
    if (rule.condition_json) {
      return this.evaluateStructuredCondition(rule.condition_json, situation);
    }
    
    // Otherwise, use LLM to evaluate natural language condition
    const prompt = `Evaluate if this condition is TRUE or FALSE based on the situation.

CONDITION: "${rule.condition}"

SITUATION:
${JSON.stringify(situation, null, 2)}

Respond with only TRUE or FALSE.`;

    const response = await this.llmProvider.chat([
      { role: 'system', content: 'You evaluate conditions. Respond only TRUE or FALSE.' },
      { role: 'user', content: prompt },
    ], { temperature: 0 });
    
    return response.content.trim().toUpperCase() === 'TRUE';
  }
  
  // Evaluate structured condition (JSON-based rules)
  private evaluateStructuredCondition(
    condition: Record<string, any>,
    situation: Record<string, any>
  ): boolean {
    const { field, operator, value } = condition;
    const actualValue = this.getNestedValue(situation, field);
    
    switch (operator) {
      case 'equals':
        return actualValue === value;
      case 'not_equals':
        return actualValue !== value;
      case 'contains':
        return String(actualValue).toLowerCase().includes(String(value).toLowerCase());
      case 'not_contains':
        return !String(actualValue).toLowerCase().includes(String(value).toLowerCase());
      case 'greater_than':
        return Number(actualValue) > Number(value);
      case 'less_than':
        return Number(actualValue) < Number(value);
      case 'in':
        return Array.isArray(value) && value.includes(actualValue);
      case 'not_in':
        return Array.isArray(value) && !value.includes(actualValue);
      case 'exists':
        return actualValue !== undefined && actualValue !== null;
      case 'not_exists':
        return actualValue === undefined || actualValue === null;
      case 'and':
        return condition.conditions.every((c: any) => 
          this.evaluateStructuredCondition(c, situation)
        );
      case 'or':
        return condition.conditions.some((c: any) => 
          this.evaluateStructuredCondition(c, situation)
        );
      default:
        return false;
    }
  }
  
  private getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }
  
  // Build system prompt with rules
  private buildSystemPrompt(): string {
    const rulesText = this.rules.map(r => 
      `- ${r.name}: IF ${r.condition} THEN ${r.action}`
    ).join('\n');
    
    const toolsText = this.tools.map(t =>
      `- ${t.name}: ${t.description}`
    ).join('\n');
    
    return `You are the LeadPilot Agent, an autonomous AI assistant for B2B sales outreach.

YOUR GOAL: Help the user find leads, reach out to them, handle replies, and book meetings.

RULES YOU MUST FOLLOW:
${rulesText || 'No specific rules defined.'}

TOOLS AVAILABLE:
${toolsText}

CONSTRAINTS:
- Max ${this.config.max_messages_per_day} messages per day
- Max ${this.config.max_leads_per_day} new leads per day
- Only operate during: ${this.config.schedule_days.join(', ')} ${this.config.schedule_start_time}-${this.config.schedule_end_time} ${this.config.schedule_timezone}
${this.config.require_approval_for.length > 0 
  ? `- Require human approval for: ${this.config.require_approval_for.join(', ')}`
  : ''}

BEHAVIOR:
- Always explain your reasoning
- Be proactive but respect the rules
- Escalate to human when uncertain
- Learn from what works and what doesn't

When making a decision, respond in this JSON format:
{
  "action": "action_name",
  "reasoning": "Why you chose this action",
  "confidence": 0.0-1.0,
  "requires_approval": true/false,
  "data": { ... any relevant data ... }
}`;
  }
  
  // Build context prompt
  private buildContextPrompt(
    context: string,
    memories: AgentMemory[],
    availableActions: string[]
  ): string {
    const memoryText = memories.length > 0
      ? `RELEVANT MEMORIES:\n${memories.map(m => `- [${m.memory_type}] ${m.key}: ${m.value}`).join('\n')}`
      : '';
    
    return `CURRENT SITUATION:
${context}

${memoryText}

AVAILABLE ACTIONS:
${availableActions.map(a => `- ${a}`).join('\n')}

What should I do next? Respond with a JSON decision.`;
  }
  
  // Parse LLM response into decision
  private parseDecision(content: string): AgentDecision {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Check if action requires approval based on config
      const requiresApproval = 
        parsed.requires_approval || 
        this.config.require_approval_for.includes(parsed.action);
      
      return {
        action: parsed.action || 'none',
        reasoning: parsed.reasoning || 'No reasoning provided',
        confidence: parsed.confidence ?? 0.5,
        requires_approval: requiresApproval,
        data: parsed.data || {},
      };
    } catch (error) {
      return {
        action: 'error',
        reasoning: `Failed to parse decision: ${content}`,
        confidence: 0,
        requires_approval: true,
        data: { raw_response: content },
      };
    }
  }
}
```

---

## 12.6 Agent Orchestrator

### File: `src/lib/agent/orchestrator.ts`

```typescript
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { AgentBrain } from './brain';
import { AgentMemory } from './memory';
import { AgentTools } from './tools';
import type { AgentConfig, AgentTask, AgentRule } from './types';

export class AgentOrchestrator {
  private supabase: any;
  private orgId: string;
  private config: AgentConfig;
  private brain: AgentBrain;
  private memory: AgentMemory;
  private tools: AgentTools;
  private isRunning: boolean = false;
  
  constructor(orgId: string) {
    this.orgId = orgId;
  }
  
  // Initialize the agent
  async initialize(): Promise<void> {
    this.supabase = await createServiceSupabaseClient();
    
    // Load config
    const { data: config } = await this.supabase
      .from('agent_configs')
      .select('*')
      .eq('org_id', this.orgId)
      .single();
    
    if (!config) {
      throw new Error('Agent not configured for this organization');
    }
    
    this.config = config;
    
    // Load rules
    const { data: rules } = await this.supabase
      .from('agent_rules')
      .select('*')
      .eq('org_id', this.orgId)
      .eq('is_enabled', true)
      .order('priority', { ascending: false });
    
    // Initialize components
    this.memory = new AgentMemory(this.supabase, this.orgId);
    this.tools = new AgentTools(this.supabase, this.orgId);
    this.brain = new AgentBrain(this.config, rules || [], this.tools.getAll());
  }
  
  // Start the agent loop
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    await this.updateStatus('running');
    await this.log('action', 'Agent started');
    
    while (this.isRunning) {
      try {
        // Check if within schedule
        if (!this.isWithinSchedule()) {
          await this.sleep(60000); // Check again in 1 minute
          continue;
        }
        
        // Process next task
        const task = await this.getNextTask();
        
        if (task) {
          await this.processTask(task);
        } else {
          // No tasks, check for new work
          await this.checkForWork();
        }
        
        // Small delay between iterations
        await this.sleep(5000);
        
      } catch (error: any) {
        await this.log('error', `Agent error: ${error.message}`, { error: error.stack });
        await this.sleep(30000); // Wait before retrying
      }
    }
  }
  
  // Stop the agent
  async stop(): Promise<void> {
    this.isRunning = false;
    await this.updateStatus('paused');
    await this.log('action', 'Agent stopped');
  }
  
  // Process a single task
  private async processTask(task: AgentTask): Promise<void> {
    await this.updateTaskStatus(task.id, 'running');
    await this.log('action', `Processing task: ${task.task_type}`, { task_id: task.id });
    
    try {
      // Get relevant memories for context
      const memories = await this.memory.getRelevant(task);
      
      // Build context
      const context = this.buildTaskContext(task);
      
      // Let brain decide how to handle
      const decision = await this.brain.decide(
        context,
        memories,
        this.getAvailableActions(task.task_type)
      );
      
      await this.log('decision', decision.reasoning, {
        task_id: task.id,
        action: decision.action,
        confidence: decision.confidence,
      });
      
      // Check if approval needed
      if (decision.requires_approval) {
        await this.updateTaskStatus(task.id, 'awaiting_approval');
        await this.log('approval', `Awaiting approval for: ${decision.action}`, {
          task_id: task.id,
          decision,
        });
        await this.notifyApprovalNeeded(task, decision);
        return;
      }
      
      // Execute the action
      const result = await this.executeAction(decision.action, decision.data, task);
      
      // Store result
      await this.supabase
        .from('agent_tasks')
        .update({
          status: 'completed',
          output_data: result,
          completed_at: new Date().toISOString(),
        })
        .eq('id', task.id);
      
      // Learn from success
      await this.memory.store({
        memory_type: 'learning',
        key: `success_${task.task_type}`,
        value: `Successfully executed ${decision.action}`,
        metadata: { task_type: task.task_type, action: decision.action, result },
        importance: 0.7,
      });
      
    } catch (error: any) {
      await this.handleTaskError(task, error);
    }
  }
  
  // Execute an action using tools
  private async executeAction(
    action: string,
    data: Record<string, any>,
    task: AgentTask
  ): Promise<any> {
    const tool = this.tools.get(action);
    
    if (!tool) {
      throw new Error(`Unknown action: ${action}`);
    }
    
    // Check rules before executing
    const triggeredRules = await this.brain.evaluateRules({
      action,
      data,
      task,
    });
    
    // Handle any blocking rules
    for (const rule of triggeredRules) {
      if (rule.rule_type === 'filter') {
        await this.log('rule_triggered', `Rule "${rule.name}" blocked action`, { rule_id: rule.id });
        throw new Error(`Blocked by rule: ${rule.name}`);
      }
      
      await this.log('rule_triggered', `Rule "${rule.name}" triggered`, { rule_id: rule.id });
      
      // Increment rule trigger count
      await this.supabase
        .from('agent_rules')
        .update({
          times_triggered: rule.times_triggered + 1,
          last_triggered_at: new Date().toISOString(),
        })
        .eq('id', rule.id);
    }
    
    // Execute the tool
    return await tool.execute(data);
  }
  
  // Check for new work to do
  private async checkForWork(): Promise<void> {
    // Check inbox for new replies
    await this.createTask('check_inbox', {});
    
    // Check if any campaigns need follow-ups
    const { data: pendingFollowUps } = await this.supabase
      .from('messages')
      .select('*, leads(*)')
      .eq('org_id', this.orgId)
      .eq('status', 'sent')
      .lt('scheduled_for', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()) // 3 days ago
      .limit(10);
    
    for (const message of pendingFollowUps || []) {
      await this.createTask('follow_up', {
        lead_id: message.lead_id,
        message_id: message.id,
      });
    }
  }
  
  // Create a new task
  async createTask(
    taskType: string,
    inputData: Record<string, any>,
    options: { priority?: number; scheduled_for?: string; requires_approval?: boolean } = {}
  ): Promise<void> {
    const requiresApproval = 
      options.requires_approval ?? 
      this.config.require_approval_for.includes(taskType);
    
    await this.supabase.from('agent_tasks').insert({
      org_id: this.orgId,
      agent_config_id: this.config.id,
      task_type: taskType,
      priority: options.priority ?? 0,
      input_data: inputData,
      requires_approval: requiresApproval,
      scheduled_for: options.scheduled_for ?? new Date().toISOString(),
      status: 'pending',
    });
  }
  
  // Get next task to process
  private async getNextTask(): Promise<AgentTask | null> {
    const { data } = await this.supabase
      .from('agent_tasks')
      .select('*')
      .eq('org_id', this.orgId)
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    
    return data;
  }
  
  // Build context string for a task
  private buildTaskContext(task: AgentTask): string {
    switch (task.task_type) {
      case 'send_message':
        return `I need to send a message.
Lead: ${JSON.stringify(task.input_data.lead)}
Sequence step: ${task.input_data.step}
Previous messages: ${task.input_data.previous_messages || 'None'}`;
      
      case 'classify_reply':
        return `I received a reply that needs classification.
From: ${task.input_data.from}
Subject: ${task.input_data.subject}
Body: ${task.input_data.body}
Original outreach: ${task.input_data.original_outreach}`;
      
      case 'respond_to_reply':
        return `I need to respond to this reply.
Classification: ${task.input_data.classification}
Reply: ${task.input_data.reply}
Lead context: ${JSON.stringify(task.input_data.lead)}`;
      
      default:
        return `Task: ${task.task_type}\nData: ${JSON.stringify(task.input_data)}`;
    }
  }
  
  // Get available actions for a task type
  private getAvailableActions(taskType: string): string[] {
    const baseActions = ['skip', 'escalate', 'delay'];
    
    switch (taskType) {
      case 'classify_reply':
        return [...baseActions, 'classify_interested', 'classify_not_interested', 'classify_question', 'classify_out_of_office', 'classify_other'];
      case 'respond_to_reply':
        return [...baseActions, 'send_response', 'book_meeting', 'add_to_sequence'];
      case 'send_message':
        return [...baseActions, 'send_email', 'send_whatsapp', 'send_sms'];
      default:
        return baseActions;
    }
  }
  
  // Check if within operating schedule
  private isWithinSchedule(): boolean {
    if (!this.config.schedule_enabled) return true;
    
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'lowercase' });
    
    if (!this.config.schedule_days.includes(day)) return false;
    
    const currentTime = now.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: this.config.schedule_timezone,
    });
    
    return currentTime >= this.config.schedule_start_time && 
           currentTime <= this.config.schedule_end_time;
  }
  
  // Helper methods
  private async updateStatus(status: string): Promise<void> {
    await this.supabase
      .from('agent_configs')
      .update({ status })
      .eq('id', this.config.id);
  }
  
  private async updateTaskStatus(taskId: string, status: string): Promise<void> {
    const update: any = { status };
    if (status === 'running') update.started_at = new Date().toISOString();
    
    await this.supabase
      .from('agent_tasks')
      .update(update)
      .eq('id', taskId);
  }
  
  private async handleTaskError(task: AgentTask, error: Error): Promise<void> {
    const retryCount = task.retry_count + 1;
    
    if (retryCount < task.max_retries) {
      await this.supabase
        .from('agent_tasks')
        .update({
          status: 'pending',
          retry_count: retryCount,
          error_message: error.message,
          scheduled_for: new Date(Date.now() + retryCount * 60000).toISOString(),
        })
        .eq('id', task.id);
    } else {
      await this.supabase
        .from('agent_tasks')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', task.id);
      
      await this.log('error', `Task failed after ${retryCount} retries: ${error.message}`, {
        task_id: task.id,
      });
    }
  }
  
  private async log(
    logType: string,
    message: string,
    details: Record<string, any> = {}
  ): Promise<void> {
    await this.supabase.from('agent_logs').insert({
      org_id: this.orgId,
      agent_config_id: this.config.id,
      task_id: details.task_id,
      log_type: logType,
      message,
      details,
      reasoning: details.reasoning,
      confidence: details.confidence,
      rule_id: details.rule_id,
    });
  }
  
  private async notifyApprovalNeeded(task: AgentTask, decision: any): Promise<void> {
    // Create notification
    await this.supabase.from('notifications').insert({
      org_id: this.orgId,
      type: 'approval_needed',
      title: `Agent needs approval: ${decision.action}`,
      message: decision.reasoning,
      action_url: `/agent/tasks/${task.id}`,
    });
    
    // TODO: Send email/Slack notification if configured
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## 12.7 Agent Memory System

### File: `src/lib/agent/memory.ts`

```typescript
import type { AgentMemory as AgentMemoryType, AgentTask } from './types';

export class AgentMemory {
  private supabase: any;
  private orgId: string;
  
  constructor(supabase: any, orgId: string) {
    this.supabase = supabase;
    this.orgId = orgId;
  }
  
  // Store a memory
  async store(memory: Omit<AgentMemoryType, 'id'>): Promise<void> {
    await this.supabase.from('agent_memory').upsert({
      org_id: this.orgId,
      ...memory,
    }, {
      onConflict: 'org_id,memory_type,key',
    });
  }
  
  // Get memories relevant to a task
  async getRelevant(task: AgentTask, limit: number = 10): Promise<AgentMemoryType[]> {
    const queries = [];
    
    // Get task-type specific learnings
    queries.push(
      this.supabase
        .from('agent_memory')
        .select('*')
        .eq('org_id', this.orgId)
        .eq('memory_type', 'learning')
        .ilike('key', `%${task.task_type}%`)
        .order('importance', { ascending: false })
        .limit(3)
    );
    
    // Get lead-specific context if applicable
    if (task.lead_id) {
      queries.push(
        this.supabase
          .from('agent_memory')
          .select('*')
          .eq('org_id', this.orgId)
          .eq('lead_id', task.lead_id)
          .order('updated_at', { ascending: false })
          .limit(5)
      );
    }
    
    // Get campaign-specific context if applicable
    if (task.campaign_id) {
      queries.push(
        this.supabase
          .from('agent_memory')
          .select('*')
          .eq('org_id', this.orgId)
          .eq('campaign_id', task.campaign_id)
          .order('updated_at', { ascending: false })
          .limit(3)
      );
    }
    
    // Get general strategies
    queries.push(
      this.supabase
        .from('agent_memory')
        .select('*')
        .eq('org_id', this.orgId)
        .eq('memory_type', 'strategy')
        .order('importance', { ascending: false })
        .limit(3)
    );
    
    const results = await Promise.all(queries);
    const memories = results.flatMap(r => r.data || []);
    
    // Dedupe and sort by importance
    const seen = new Set<string>();
    return memories
      .filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      })
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }
  
  // Get all memories for a lead
  async getForLead(leadId: string): Promise<AgentMemoryType[]> {
    const { data } = await this.supabase
      .from('agent_memory')
      .select('*')
      .eq('org_id', this.orgId)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    
    return data || [];
  }
  
  // Search memories
  async search(query: string, limit: number = 10): Promise<AgentMemoryType[]> {
    const { data } = await this.supabase
      .from('agent_memory')
      .select('*')
      .eq('org_id', this.orgId)
      .or(`key.ilike.%${query}%,value.ilike.%${query}%`)
      .order('importance', { ascending: false })
      .limit(limit);
    
    return data || [];
  }
  
  // Clear old memories
  async cleanup(olderThanDays: number = 90): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    
    const { count } = await this.supabase
      .from('agent_memory')
      .delete()
      .eq('org_id', this.orgId)
      .lt('updated_at', cutoff.toISOString())
      .lt('importance', 0.8);  // Keep important memories
    
    return count || 0;
  }
}
```

---

## 12.8 Agent Tools

### File: `src/lib/agent/tools.ts`

```typescript
import type { AgentTool } from './types';
import { sendMessage } from '@/lib/messaging/send';
import { getLLMProviderForOrg } from '@/lib/llm';

export class AgentTools {
  private supabase: any;
  private orgId: string;
  private tools: Map<string, AgentTool> = new Map();
  
  constructor(supabase: any, orgId: string) {
    this.supabase = supabase;
    this.orgId = orgId;
    this.registerTools();
  }
  
  private registerTools(): void {
    // Send Email
    this.register({
      name: 'send_email',
      description: 'Send an email to a lead',
      parameters: {
        lead_id: 'string',
        subject: 'string',
        body: 'string',
        email_account_id: 'string',
      },
      execute: async (params) => {
        const { data: lead } = await this.supabase
          .from('leads')
          .select('email')
          .eq('id', params.lead_id)
          .single();
        
        return sendMessage(this.supabase, this.orgId, {
          channel: 'email',
          to: lead.email,
          subject: params.subject,
          body: params.body,
          emailAccountId: params.email_account_id,
        });
      },
    });
    
    // Send WhatsApp
    this.register({
      name: 'send_whatsapp',
      description: 'Send a WhatsApp message to a lead',
      parameters: {
        lead_id: 'string',
        body: 'string',
        messaging_account_id: 'string',
      },
      execute: async (params) => {
        const { data: lead } = await this.supabase
          .from('leads')
          .select('phone, whatsapp')
          .eq('id', params.lead_id)
          .single();
        
        return sendMessage(this.supabase, this.orgId, {
          channel: 'whatsapp',
          to: lead.whatsapp || lead.phone,
          body: params.body,
          messagingAccountId: params.messaging_account_id,
        });
      },
    });
    
    // Send SMS
    this.register({
      name: 'send_sms',
      description: 'Send an SMS to a lead',
      parameters: {
        lead_id: 'string',
        body: 'string',
        messaging_account_id: 'string',
      },
      execute: async (params) => {
        const { data: lead } = await this.supabase
          .from('leads')
          .select('phone')
          .eq('id', params.lead_id)
          .single();
        
        return sendMessage(this.supabase, this.orgId, {
          channel: 'sms',
          to: lead.phone,
          body: params.body,
          messagingAccountId: params.messaging_account_id,
        });
      },
    });
    
    // Classify Reply
    this.register({
      name: 'classify_reply',
      description: 'Classify an incoming reply using AI',
      parameters: {
        reply_content: 'string',
        original_outreach: 'string',
      },
      execute: async (params) => {
        const provider = await getLLMProviderForOrg(this.supabase, this.orgId);
        return provider.classifyReply(params.reply_content, params.original_outreach);
      },
    });
    
    // Generate Response
    this.register({
      name: 'generate_response',
      description: 'Generate a response to a reply',
      parameters: {
        reply_content: 'string',
        classification: 'string',
        lead_context: 'object',
        tone: 'string',
      },
      execute: async (params) => {
        const provider = await getLLMProviderForOrg(this.supabase, this.orgId);
        
        const prompt = `Generate a response to this ${params.classification} reply.

REPLY: ${params.reply_content}

LEAD CONTEXT: ${JSON.stringify(params.lead_context)}

TONE: ${params.tone || 'professional'}

Requirements:
- Be helpful and address their specific points
- Keep it concise (2-3 sentences)
- Include a clear next step or CTA
- Don't be pushy

Return JSON: {"subject": "Re: ...", "body": "..."}`;

        const response = await provider.chat([
          { role: 'system', content: 'You write sales responses. Return JSON only.' },
          { role: 'user', content: prompt },
        ]);
        
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : { body: response.content };
      },
    });
    
    // Update Lead Status
    this.register({
      name: 'update_lead_status',
      description: 'Update the status of a lead',
      parameters: {
        lead_id: 'string',
        status: 'string',
      },
      execute: async (params) => {
        await this.supabase
          .from('leads')
          .update({ status: params.status })
          .eq('id', params.lead_id);
        return { success: true };
      },
    });
    
    // Calendar Tools - see src/lib/agent/tools/calendar.ts
    // Import and register calendar tools
    const { createCalendarTools } = require('./tools/calendar');
    const calendarTools = createCalendarTools(this.supabase, this.orgId);
    calendarTools.forEach((tool: AgentTool) => this.register(tool));
    
    // Skip action (do nothing)
    this.register({
      name: 'skip',
      description: 'Skip this task and move on',
      parameters: {},
      execute: async () => ({ skipped: true }),
    });
    
    // Escalate to human
    this.register({
      name: 'escalate',
      description: 'Escalate this task to a human for review',
      parameters: {
        reason: 'string',
      },
      execute: async (params) => {
        return { escalated: true, reason: params.reason };
      },
    });
    
    // Delay task
    this.register({
      name: 'delay',
      description: 'Delay this task to be processed later',
      parameters: {
        delay_hours: 'number',
      },
      execute: async (params) => {
        return { 
          delayed: true, 
          new_scheduled_for: new Date(Date.now() + params.delay_hours * 60 * 60 * 1000).toISOString(),
        };
      },
    });
  }
  
  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }
  
  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }
  
  getAll(): AgentTool[] {
    return Array.from(this.tools.values());
  }
}
```

---

## 12.9 Agent API Routes

### File: `app/api/agent/config/route.ts`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - Get agent config
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  let { data: config } = await supabase
    .from('agent_configs')
    .select('*')
    .eq('org_id', userData!.org_id)
    .single();

  // Create default config if doesn't exist
  if (!config) {
    const { data: newConfig } = await supabase
      .from('agent_configs')
      .insert({ org_id: userData!.org_id })
      .select()
      .single();
    config = newConfig;
  }

  return NextResponse.json(config);
}

// PATCH - Update agent config
export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const body = await request.json();

  const { data, error } = await supabase
    .from('agent_configs')
    .update(body)
    .eq('org_id', userData!.org_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

### File: `app/api/agent/rules/route.ts`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - List rules
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const { data, error } = await supabase
    .from('agent_rules')
    .select('*')
    .eq('org_id', userData!.org_id)
    .order('priority', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST - Create rule
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const body = await request.json();

  const { data, error } = await supabase
    .from('agent_rules')
    .insert({
      org_id: userData!.org_id,
      ...body,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

### File: `app/api/agent/start/route.ts`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { AgentOrchestrator } from '@/lib/agent/orchestrator';

// POST - Start agent
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  // Start agent (in production, this would be a background job)
  const orchestrator = new AgentOrchestrator(userData!.org_id);
  await orchestrator.initialize();
  
  // Don't await - let it run in background
  orchestrator.start().catch(console.error);

  return NextResponse.json({ success: true, message: 'Agent started' });
}
```

---

## 12.10 Agent Dashboard UI

### File: `app/(dashboard)/agent/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import {
  Bot,
  Play,
  Pause,
  Settings,
  Plus,
  Trash2,
  CheckCircle,
  Clock,
  AlertTriangle,
  Activity,
} from 'lucide-react';

interface AgentConfig {
  id: string;
  name: string;
  is_enabled: boolean;
  status: string;
  max_leads_per_day: number;
  max_messages_per_day: number;
  schedule_enabled: boolean;
  schedule_days: string[];
  schedule_start_time: string;
  schedule_end_time: string;
}

interface AgentRule {
  id: string;
  name: string;
  rule_type: string;
  condition: string;
  action: string;
  priority: number;
  is_enabled: boolean;
  times_triggered: number;
}

export default function AgentPage() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [rules, setRules] = useState<AgentRule[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRuleModal, setShowRuleModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [configRes, rulesRes, logsRes] = await Promise.all([
      fetch('/api/agent/config'),
      fetch('/api/agent/rules'),
      fetch('/api/agent/logs?limit=20'),
    ]);
    
    setConfig(await configRes.json());
    setRules(await rulesRes.json());
    setLogs((await logsRes.json()) || []);
    setLoading(false);
  };

  const toggleAgent = async () => {
    if (!config) return;
    
    if (config.status === 'running') {
      await fetch('/api/agent/stop', { method: 'POST' });
    } else {
      await fetch('/api/agent/start', { method: 'POST' });
    }
    
    loadData();
  };

  const updateConfig = async (updates: Partial<AgentConfig>) => {
    await fetch('/api/agent/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agent Control Center</h1>
          <p className="text-gray-500">Configure and monitor your autonomous AI agent</p>
        </div>
        <button
          onClick={toggleAgent}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
            config?.status === 'running'
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {config?.status === 'running' ? (
            <>
              <Pause className="w-5 h-5" />
              Stop Agent
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              Start Agent
            </>
          )}
        </button>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className={`p-4 rounded-xl ${
            config?.status === 'running' ? 'bg-green-100' : 'bg-gray-100'
          }`}>
            <Bot className={`w-8 h-8 ${
              config?.status === 'running' ? 'text-green-600' : 'text-gray-400'
            }`} />
          </div>
          <div>
            <h2 className="text-xl font-bold">{config?.name || 'LeadPilot Agent'}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-1 text-xs rounded-full ${
                config?.status === 'running' 
                  ? 'bg-green-100 text-green-700' 
                  : config?.status === 'error'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-gray-100 text-gray-700'
              }`}>
                {config?.status || 'idle'}
              </span>
              {config?.schedule_enabled && (
                <span className="text-sm text-gray-500">
                  {config.schedule_days.join(', ')} {config.schedule_start_time}-{config.schedule_end_time}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-2xl font-bold">{config?.max_leads_per_day || 0}</div>
            <div className="text-sm text-gray-500">Max Leads/Day</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-2xl font-bold">{config?.max_messages_per_day || 0}</div>
            <div className="text-sm text-gray-500">Max Messages/Day</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-2xl font-bold">{rules.filter(r => r.is_enabled).length}</div>
            <div className="text-sm text-gray-500">Active Rules</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-2xl font-bold">{logs.length}</div>
            <div className="text-sm text-gray-500">Recent Actions</div>
          </div>
        </div>
      </div>

      {/* Rules Section */}
      <div className="bg-white rounded-xl border">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">Agent Rules</h3>
          <button
            onClick={() => setShowRuleModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Rule
          </button>
        </div>
        
        {rules.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No rules configured. Add rules to control agent behavior.
          </div>
        ) : (
          <div className="divide-y">
            {rules.map((rule) => (
              <div key={rule.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full ${
                    rule.is_enabled ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                  <div>
                    <div className="font-medium">{rule.name}</div>
                    <div className="text-sm text-gray-500">
                      IF {rule.condition} → {rule.action}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-400">
                    Triggered {rule.times_triggered}x
                  </span>
                  <span className={`px-2 py-1 text-xs rounded ${
                    rule.rule_type === 'filter' ? 'bg-red-100 text-red-700' :
                    rule.rule_type === 'action' ? 'bg-blue-100 text-blue-700' :
                    rule.rule_type === 'escalation' ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {rule.rule_type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity Log */}
      <div className="bg-white rounded-xl border">
        <div className="px-6 py-4 border-b flex items-center gap-2">
          <Activity className="w-5 h-5 text-gray-400" />
          <h3 className="font-semibold">Recent Activity</h3>
        </div>
        
        <div className="max-h-96 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No activity yet. Start the agent to see logs.
            </div>
          ) : (
            <div className="divide-y">
              {logs.map((log, i) => (
                <div key={i} className="px-6 py-3 flex items-start gap-3">
                  <div className={`mt-1 p-1 rounded ${
                    log.log_type === 'error' ? 'bg-red-100' :
                    log.log_type === 'decision' ? 'bg-blue-100' :
                    log.log_type === 'action' ? 'bg-green-100' :
                    'bg-gray-100'
                  }`}>
                    {log.log_type === 'error' ? <AlertTriangle className="w-4 h-4 text-red-600" /> :
                     log.log_type === 'decision' ? <Bot className="w-4 h-4 text-blue-600" /> :
                     <CheckCircle className="w-4 h-4 text-green-600" />}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm">{log.message}</div>
                    {log.reasoning && (
                      <div className="text-xs text-gray-500 mt-1">
                        Reasoning: {log.reasoning}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(log.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## 12.11 Verification Checklist

After completing Phase 12, verify:

- [ ] Database tables created (agent_configs, agent_rules, agent_tasks, agent_memory, agent_logs)
- [ ] Agent config API works (GET, PATCH)
- [ ] Rules API works (GET, POST, PATCH, DELETE)
- [ ] Agent can be started and stopped
- [ ] Brain makes decisions with reasoning
- [ ] Rules are evaluated correctly
- [ ] Memory stores and retrieves context
- [ ] Tools execute actions
- [ ] Tasks queue and process correctly
- [ ] Logs capture all activity
- [ ] UI shows status and controls

---

## Example Rules to Add

```json
[
  {
    "name": "Skip Competitors",
    "rule_type": "filter",
    "condition": "Lead company name contains any of our competitors",
    "action": "Skip this lead and log reason",
    "priority": 100
  },
  {
    "name": "Auto-respond to Questions",
    "rule_type": "action",
    "condition": "Reply is classified as 'question'",
    "action": "Generate and send helpful response",
    "priority": 50
  },
  {
    "name": "Escalate Angry Replies",
    "rule_type": "escalation",
    "condition": "Reply contains negative sentiment or complaints",
    "action": "Stop sequence and notify human immediately",
    "priority": 90
  },
  {
    "name": "Book Meeting for Interested",
    "rule_type": "action",
    "condition": "Reply is classified as 'interested' and mentions availability",
    "action": "Send calendar link and suggest times",
    "priority": 80
  },
  {
    "name": "Max 3 Follow-ups",
    "rule_type": "constraint",
    "condition": "Lead has received 3 or more messages with no reply",
    "action": "Stop sequence for this lead",
    "priority": 70
  }
]
```

---

## Next Steps

After implementing the agent:

1. **Add Trigger.dev job** to run the orchestrator on a schedule
2. **Add webhook handlers** for real-time inbox processing
3. **Integrate calendar** (Calendly, Cal.com, Google Calendar)
4. **Add browser automation** for LinkedIn actions
5. **Build reporting dashboard** for agent performance
