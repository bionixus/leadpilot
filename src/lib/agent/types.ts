// ===========================================
// AGENT CORE TYPES
// ===========================================

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
  
  // Notifications
  notify_on_positive_reply: boolean;
  notify_on_meeting_booked: boolean;
  notify_on_error: boolean;
  notify_email?: string;
  notify_slack_webhook?: string;
  
  created_at: string;
  updated_at: string;
}

// Rule definition
export interface AgentRule {
  id: string;
  org_id: string;
  agent_config_id?: string;
  name: string;
  description?: string;
  rule_type: 'filter' | 'action' | 'constraint' | 'template' | 'schedule' | 'escalation';
  condition: string;
  condition_json?: Record<string, unknown>;
  action: string;
  action_json?: Record<string, unknown>;
  priority: number;
  is_enabled: boolean;
  times_triggered: number;
  last_triggered_at?: string;
  created_at: string;
  updated_at: string;
}

// Task types
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

// Task in the queue
export interface AgentTask {
  id: string;
  org_id: string;
  agent_config_id?: string;
  task_type: TaskType;
  priority: number;
  campaign_id?: string;
  lead_id?: string;
  input_data: Record<string, unknown>;
  output_data?: Record<string, unknown>;
  status: 'pending' | 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled';
  requires_approval: boolean;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  retry_count: number;
  max_retries: number;
  scheduled_for: string;
  created_at: string;
  updated_at: string;
}

// Memory types
export type MemoryType = 'lead_context' | 'conversation' | 'learning' | 'preference' | 'fact' | 'strategy';

// Memory entry
export interface AgentMemory {
  id: string;
  org_id: string;
  memory_type: MemoryType;
  key: string;
  value: string;
  metadata?: Record<string, unknown>;
  importance: number;
  lead_id?: string;
  campaign_id?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

// Log types
export type LogType = 'decision' | 'action' | 'observation' | 'learning' | 'error' | 'approval' | 'rule_triggered';

// Agent log entry
export interface AgentLog {
  id: string;
  org_id: string;
  agent_config_id?: string;
  task_id?: string;
  log_type: LogType;
  message: string;
  details?: Record<string, unknown>;
  reasoning?: string;
  confidence?: number;
  rule_id?: string;
  created_at: string;
}

// Agent decision with reasoning
export interface AgentDecision {
  action: string;
  reasoning: string;
  confidence: number;
  requires_approval: boolean;
  data?: Record<string, unknown>;
}

// Tool result type - flexible to accommodate various return types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AgentToolResult = Record<string, any> & {
  success: boolean;
  error?: string;
};

// Tool that agent can use
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, string>;
  execute: (params: Record<string, unknown>) => Promise<AgentToolResult>;
}

// Structured condition for rule evaluation
export interface StructuredCondition {
  field?: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'in' | 'not_in' | 'exists' | 'not_exists' | 'and' | 'or';
  value?: unknown;
  conditions?: StructuredCondition[];
}

// Task creation options
export interface CreateTaskOptions {
  priority?: number;
  scheduled_for?: string;
  requires_approval?: boolean;
  campaign_id?: string;
  lead_id?: string;
}

// Memory storage input
export interface StoreMemoryInput {
  memory_type: MemoryType;
  key: string;
  value: string;
  metadata?: Record<string, unknown>;
  importance?: number;
  lead_id?: string;
  campaign_id?: string;
  expires_at?: string;
}
