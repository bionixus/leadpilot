import type { SupabaseClient } from '@supabase/supabase-js';
import { AgentBrain } from './brain';
import { AgentMemoryManager } from './memory';
import { AgentToolsManager } from './tools';
import type {
  AgentConfig,
  AgentTask,
  AgentRule,
  AgentDecision,
  TaskType,
  CreateTaskOptions,
  LogType,
} from './types';

export class AgentOrchestrator {
  private supabase: SupabaseClient;
  private orgId: string;
  private config!: AgentConfig;
  private brain!: AgentBrain;
  private memory!: AgentMemoryManager;
  private tools!: AgentToolsManager;
  private isRunning: boolean = false;
  private initialized: boolean = false;

  constructor(supabase: SupabaseClient, orgId: string) {
    this.supabase = supabase;
    this.orgId = orgId;
  }

  // Initialize the agent
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load config
    const { data: config, error: configError } = await this.supabase
      .from('agent_configs')
      .select('*')
      .eq('org_id', this.orgId)
      .single();

    if (configError || !config) {
      // Create default config if doesn't exist
      const { data: newConfig, error: createError } = await this.supabase
        .from('agent_configs')
        .insert({ org_id: this.orgId } as never)
        .select()
        .single();

      if (createError || !newConfig) {
        throw new Error('Failed to create agent configuration');
      }

      this.config = newConfig as AgentConfig;
    } else {
      this.config = config as AgentConfig;
    }

    // Load rules
    const { data: rules } = await this.supabase
      .from('agent_rules')
      .select('*')
      .eq('org_id', this.orgId)
      .eq('is_enabled', true)
      .order('priority', { ascending: false });

    // Initialize components
    this.memory = new AgentMemoryManager(this.supabase, this.orgId);
    this.tools = new AgentToolsManager(this.supabase, this.orgId);
    this.brain = new AgentBrain(
      this.config,
      (rules as AgentRule[]) || [],
      this.tools.getAll()
    );

    this.initialized = true;
  }

  // Start the agent loop
  async start(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.log('error', `Agent error: ${errorMessage}`, {
          error: error instanceof Error ? error.stack : undefined,
        });
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
      const decision = await this.brain.decide(context, memories, this.getAvailableActions(task.task_type));

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
      const result = await this.executeAction(decision.action, decision.data || {}, task);

      // Handle special results
      if (result.delayed) {
        await this.supabase
          .from('agent_tasks')
          .update({
            status: 'pending',
            scheduled_for: result.new_scheduled_for,
          } as never)
          .eq('id', task.id);
        return;
      }

      if (result.escalated) {
        await this.updateTaskStatus(task.id, 'awaiting_approval');
        return;
      }

      // Store result
      await this.supabase
        .from('agent_tasks')
        .update({
          status: 'completed',
          output_data: result,
          completed_at: new Date().toISOString(),
        } as never)
        .eq('id', task.id);

      // Learn from success
      await this.memory.store({
        memory_type: 'learning',
        key: `success_${task.task_type}`,
        value: `Successfully executed ${decision.action}`,
        metadata: { task_type: task.task_type, action: decision.action, result },
        importance: 0.7,
      });
    } catch (error) {
      await this.handleTaskError(task, error instanceof Error ? error : new Error(String(error)));
    }
  }

  // Execute an action using tools
  private async executeAction(
    action: string,
    data: Record<string, unknown>,
    task: AgentTask
  ): Promise<Record<string, unknown>> {
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
        await this.log('rule_triggered', `Rule "${rule.name}" blocked action`, {
          rule_id: rule.id,
        });
        throw new Error(`Blocked by rule: ${rule.name}`);
      }

      await this.log('rule_triggered', `Rule "${rule.name}" triggered`, { rule_id: rule.id });

      // Increment rule trigger count
      await this.supabase
        .from('agent_rules')
        .update({
          times_triggered: rule.times_triggered + 1,
          last_triggered_at: new Date().toISOString(),
        } as never)
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
      .from('emails')
      .select('*, leads(*)')
      .eq('org_id', this.orgId)
      .eq('status', 'sent')
      .lt('sent_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
      .limit(10);

    for (const message of (pendingFollowUps as Array<{ lead_id: string; id: string }>) || []) {
      await this.createTask('follow_up', {
        lead_id: message.lead_id,
        message_id: message.id,
      });
    }
  }

  // Create a new task
  async createTask(
    taskType: TaskType,
    inputData: Record<string, unknown>,
    options: CreateTaskOptions = {}
  ): Promise<string | null> {
    const requiresApproval =
      options.requires_approval ?? this.config.require_approval_for.includes(taskType);

    const { data, error } = await this.supabase
      .from('agent_tasks')
      .insert({
        org_id: this.orgId,
        agent_config_id: this.config.id,
        task_type: taskType,
        priority: options.priority ?? 0,
        input_data: inputData,
        requires_approval: requiresApproval,
        scheduled_for: options.scheduled_for ?? new Date().toISOString(),
        status: 'pending',
        campaign_id: options.campaign_id,
        lead_id: options.lead_id,
      } as never)
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create task:', error);
      return null;
    }

    return (data as { id: string })?.id || null;
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

    return data as AgentTask | null;
  }

  // Build context string for a task
  private buildTaskContext(task: AgentTask): string {
    const input = task.input_data;

    switch (task.task_type) {
      case 'send_message':
        return `I need to send a message.
Lead: ${JSON.stringify(input.lead)}
Sequence step: ${input.step}
Previous messages: ${input.previous_messages || 'None'}`;

      case 'classify_reply':
        return `I received a reply that needs classification.
From: ${input.from}
Subject: ${input.subject}
Body: ${input.body}
Original outreach: ${input.original_outreach}`;

      case 'respond_to_reply':
        return `I need to respond to this reply.
Classification: ${input.classification}
Reply: ${input.reply}
Lead context: ${JSON.stringify(input.lead)}`;

      case 'check_inbox':
        return 'I need to check the inbox for new replies and process them.';

      case 'follow_up':
        return `I need to follow up with a lead who hasn't responded.
Lead ID: ${input.lead_id}
Original message ID: ${input.message_id}
Days since last contact: ${input.days_since_contact || 'unknown'}`;

      case 'find_leads':
        return `I need to find new leads matching the criteria.
Campaign: ${JSON.stringify(input.campaign)}
Target: ${input.target}
Quantity: ${input.quantity || 10}`;

      case 'enrich_lead':
        return `I need to enrich data for a lead.
Lead ID: ${input.lead_id}
Current data: ${JSON.stringify(input.current_data)}`;

      case 'generate_sequence':
        return `I need to generate a personalized outreach sequence.
Lead: ${JSON.stringify(input.lead)}
Campaign: ${JSON.stringify(input.campaign)}
Number of steps: ${input.steps || 3}`;

      case 'book_meeting':
        return `I need to book a meeting with a lead.
Lead: ${JSON.stringify(input.lead)}
Preferred times: ${input.preferred_times || 'Any available'}`;

      case 'report':
        return `I need to generate a report.
Report type: ${input.report_type}
Date range: ${input.date_range}`;

      default:
        return `Task: ${task.task_type}\nData: ${JSON.stringify(input)}`;
    }
  }

  // Get available actions for a task type
  private getAvailableActions(taskType: TaskType): string[] {
    const baseActions = ['skip', 'escalate', 'delay'];

    switch (taskType) {
      case 'classify_reply':
        return [
          ...baseActions,
          'classify_interested',
          'classify_not_interested',
          'classify_question',
          'classify_out_of_office',
          'classify_other',
        ];
      case 'respond_to_reply':
        return [...baseActions, 'send_response', 'book_meeting', 'add_to_sequence'];
      case 'send_message':
        return [...baseActions, 'send_email', 'send_whatsapp', 'send_sms'];
      case 'find_leads':
        return [...baseActions, 'search_linkedin', 'search_apollo', 'search_google_maps'];
      case 'book_meeting':
        return [...baseActions, 'book_meeting', 'send_scheduling_link'];
      case 'check_inbox':
        return [...baseActions, 'process_inbox'];
      default:
        return baseActions;
    }
  }

  // Check if within operating schedule
  private isWithinSchedule(): boolean {
    if (!this.config.schedule_enabled) return true;

    const now = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const day = dayNames[now.getDay()];

    if (!this.config.schedule_days.includes(day)) return false;

    // Get current time in config timezone
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      timeZone: this.config.schedule_timezone,
    };

    const currentTime = now.toLocaleTimeString('en-US', timeOptions);

    return (
      currentTime >= this.config.schedule_start_time && currentTime <= this.config.schedule_end_time
    );
  }

  // Helper methods
  private async updateStatus(status: string): Promise<void> {
    await this.supabase
      .from('agent_configs')
      .update({ status } as never)
      .eq('id', this.config.id);

    this.config.status = status as AgentConfig['status'];
  }

  private async updateTaskStatus(taskId: string, status: string): Promise<void> {
    const update: Record<string, unknown> = { status };
    if (status === 'running') update.started_at = new Date().toISOString();

    await this.supabase.from('agent_tasks').update(update as never).eq('id', taskId);
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
        } as never)
        .eq('id', task.id);
    } else {
      await this.supabase
        .from('agent_tasks')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString(),
        } as never)
        .eq('id', task.id);

      await this.log('error', `Task failed after ${retryCount} retries: ${error.message}`, {
        task_id: task.id,
      });
    }
  }

  private async log(
    logType: LogType,
    message: string,
    details: Record<string, unknown> = {}
  ): Promise<void> {
    await this.supabase.from('agent_logs').insert({
      org_id: this.orgId,
      agent_config_id: this.config.id,
      task_id: details.task_id,
      log_type: logType,
      message,
      details,
      reasoning: details.reasoning as string | undefined,
      confidence: details.confidence as number | undefined,
      rule_id: details.rule_id as string | undefined,
    } as never);
  }

  private async notifyApprovalNeeded(task: AgentTask, decision: AgentDecision): Promise<void> {
    // Create notification
    await this.supabase.from('notifications').insert({
      org_id: this.orgId,
      type: 'approval_needed',
      title: `Agent needs approval: ${decision.action}`,
      message: decision.reasoning,
      action_url: `/agent/tasks/${task.id}`,
    } as never);

    // TODO: Send email/Slack notification if configured
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Public getters
  getConfig(): AgentConfig {
    return this.config;
  }

  isAgentRunning(): boolean {
    return this.isRunning;
  }
}
