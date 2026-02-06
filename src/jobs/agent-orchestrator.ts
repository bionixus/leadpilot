import { schedules, task, logger } from '@trigger.dev/sdk/v3';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email/send';

// Initialize Supabase client for jobs
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ===========================================
// MAIN AGENT ORCHESTRATOR - Runs every minute
// ===========================================
export const agentOrchestratorTask = schedules.task({
  id: 'agent-orchestrator',
  // Run every minute
  cron: '* * * * *',
  run: async () => {
    logger.info('Agent orchestrator starting...');

    // Get all enabled agents
    const { data: agents, error } = await supabase
      .from('agent_configs')
      .select('*, organizations(id, name)')
      .eq('is_enabled', true)
      .in('status', ['running', 'idle']);

    if (error) {
      logger.error('Failed to fetch agents', { error });
      return { processed: 0, error: error.message };
    }

    if (!agents || agents.length === 0) {
      logger.info('No active agents found');
      return { processed: 0 };
    }

    logger.info(`Found ${agents.length} active agents`);

    // Process each agent
    const results = await Promise.all(
      agents.map(async (agent) => {
        try {
          // Check if within schedule
          if (!isWithinSchedule(agent)) {
            logger.info(`Agent ${agent.id} outside schedule, skipping`);
            return { agent_id: agent.id, status: 'outside_schedule' };
          }

          // Process pending tasks for this agent
          const tasksProcessed = await processAgentTasks(agent);

          // Check for new work
          await checkForNewWork(agent);

          return { agent_id: agent.id, status: 'success', tasks_processed: tasksProcessed };
        } catch (err: any) {
          logger.error(`Error processing agent ${agent.id}`, { error: err.message });
          
          // Log error
          await supabase.from('agent_logs').insert({
            org_id: agent.org_id,
            agent_config_id: agent.id,
            log_type: 'error',
            message: `Orchestrator error: ${err.message}`,
            details: { stack: err.stack },
          });

          return { agent_id: agent.id, status: 'error', error: err.message };
        }
      })
    );

    return { processed: results.length, results };
  },
});

// ===========================================
// PROCESS AGENT TASKS
// ===========================================
async function processAgentTasks(agent: any): Promise<number> {
  // Atomically claim pending tasks using FOR UPDATE SKIP LOCKED to prevent
  // concurrent orchestrator runs from processing the same tasks
  const { data: tasks, error } = await supabase.rpc('claim_next_agent_task', {
    p_org_id: agent.org_id,
    p_limit: 5,
  });

  if (error || !tasks || tasks.length === 0) {
    return 0;
  }

  for (const t of tasks) {
    await processAgentTaskTrigger.trigger({
      task_id: t.id,
      org_id: agent.org_id,
      agent_config_id: agent.id,
    });
  }

  return tasks.length;
}

// ===========================================
// CHECK FOR NEW WORK
// ===========================================
async function checkForNewWork(agent: any): Promise<void> {
  // Check inbox for new replies (if no recent check)
  const { data: recentInboxCheck } = await supabase
    .from('agent_tasks')
    .select('id')
    .eq('org_id', agent.org_id)
    .eq('task_type', 'check_inbox')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // Last 5 min
    .limit(1);

  if (!recentInboxCheck || recentInboxCheck.length === 0) {
    await supabase.from('agent_tasks').insert({
      org_id: agent.org_id,
      agent_config_id: agent.id,
      task_type: 'check_inbox',
      input_data: {},
      priority: 10,
    });
  }

  // Check for follow-ups needed
  const { data: needsFollowUp } = await supabase
    .from('emails')
    .select('id, lead_id, sequence_id')
    .eq('org_id', agent.org_id)
    .eq('status', 'sent')
    .lt('sent_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()) // 3+ days ago
    .limit(10);

  for (const msg of needsFollowUp || []) {
    // Check if follow-up task already exists
    const { data: existingTask } = await supabase
      .from('agent_tasks')
      .select('id')
      .eq('org_id', agent.org_id)
      .eq('task_type', 'follow_up')
      .contains('input_data', { lead_id: msg.lead_id })
      .in('status', ['pending', 'running'])
      .limit(1);

    if (!existingTask || existingTask.length === 0) {
      await supabase.from('agent_tasks').insert({
        org_id: agent.org_id,
        agent_config_id: agent.id,
        task_type: 'follow_up',
        input_data: { lead_id: msg.lead_id, message_id: msg.id },
        priority: 5,
      });
    }
  }
}

// ===========================================
// INDIVIDUAL TASK PROCESSOR
// ===========================================
export const processAgentTaskTrigger = task({
  id: 'process-agent-task',
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: { task_id: string; org_id: string; agent_config_id: string }) => {
    const { task_id, org_id, agent_config_id } = payload;

    logger.info(`Processing task ${task_id}`);

    // Get task
    const { data: task, error: taskError } = await supabase
      .from('agent_tasks')
      .select('*')
      .eq('id', task_id)
      .single();

    if (taskError || !task) {
      logger.error('Task not found', { task_id });
      return { success: false, error: 'Task not found' };
    }

    // Mark as running
    await supabase
      .from('agent_tasks')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', task_id);

    try {
      // Get agent config and rules
      const [{ data: config }, { data: rules }] = await Promise.all([
        supabase.from('agent_configs').select('*').eq('id', agent_config_id).single(),
        supabase.from('agent_rules').select('*').eq('org_id', org_id).eq('is_enabled', true),
      ]);

      // Process based on task type
      let result;
      switch (task.task_type) {
        case 'check_inbox':
          result = await processCheckInbox(org_id, config);
          break;
        case 'classify_reply':
          result = await processClassifyReply(task, config);
          break;
        case 'respond_to_reply':
          result = await processRespondToReply(task, config, rules || []);
          break;
        case 'send_message':
          result = await processSendMessage(task, config, rules || []);
          break;
        case 'follow_up':
          result = await processFollowUp(task, config);
          break;
        case 'generate_sequence':
          result = await processGenerateSequence(task, config);
          break;
        default:
          result = { success: false, error: `Unknown task type: ${task.task_type}` };
      }

      // Update task status
      await supabase
        .from('agent_tasks')
        .update({
          status: result.success ? 'completed' : 'failed',
          output_data: result,
          completed_at: new Date().toISOString(),
          error_message: result.error,
        })
        .eq('id', task_id);

      // Log success
      await supabase.from('agent_logs').insert({
        org_id,
        agent_config_id,
        task_id,
        log_type: result.success ? 'action' : 'error',
        message: result.success ? `Completed: ${task.task_type}` : `Failed: ${result.error}`,
        details: result,
      });

      return result;
    } catch (err: any) {
      logger.error(`Task ${task_id} failed`, { error: err.message });

      // Update task with error
      const retryCount = (task.retry_count || 0) + 1;
      await supabase
        .from('agent_tasks')
        .update({
          status: retryCount >= 3 ? 'failed' : 'pending',
          retry_count: retryCount,
          error_message: err.message,
          scheduled_for: new Date(Date.now() + retryCount * 60000).toISOString(),
        })
        .eq('id', task_id);

      throw err;
    }
  },
});

// ===========================================
// TASK PROCESSORS
// ===========================================

async function processCheckInbox(orgId: string, config: any): Promise<any> {
  // Get email accounts
  const { data: emailAccounts } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true);

  if (!emailAccounts || emailAccounts.length === 0) {
    return { success: true, message: 'No email accounts' };
  }

  // Trigger IMAP sync for each account
  for (const account of emailAccounts) {
    await syncInboxTrigger.trigger({
      email_account_id: account.id,
      org_id: orgId,
    });
  }

  return { success: true, accounts_synced: emailAccounts.length };
}

async function processClassifyReply(task: any, config: any): Promise<any> {
  const { reply_content, original_outreach, inbox_message_id } = task.input_data;

  // Use LLM to classify
  const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/llm/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      org_id: task.org_id,
      reply_content,
      original_outreach,
    }),
  });

  const classification = await response.json();

  // Update inbox message with classification
  if (inbox_message_id) {
    await supabase
      .from('inbox_messages')
      .update({
        classification: classification.classification,
        classification_confidence: classification.confidence,
      })
      .eq('id', inbox_message_id);
  }

  // Create follow-up task based on classification
  if (classification.classification === 'interested' || classification.classification === 'question') {
    await supabase.from('agent_tasks').insert({
      org_id: task.org_id,
      agent_config_id: config.id,
      task_type: 'respond_to_reply',
      input_data: {
        ...task.input_data,
        classification,
      },
      priority: classification.classification === 'interested' ? 20 : 15,
      requires_approval: config.require_approval_for?.includes('respond_to_reply'),
    });
  }

  return { success: true, classification };
}

async function processRespondToReply(task: any, config: any, rules: any[]): Promise<any> {
  const { classification, lead_id, reply_content } = task.input_data;

  // Check rules for this situation
  for (const rule of rules) {
    if (rule.rule_type === 'escalation' && classification.classification === 'not_interested') {
      // Stop and don't respond
      return { success: true, action: 'skipped_by_rule', rule: rule.name };
    }
  }

  // Check if needs approval
  if (task.requires_approval && !task.approved_at) {
    await supabase
      .from('agent_tasks')
      .update({ status: 'awaiting_approval' })
      .eq('id', task.id);

    // Create notification
    await supabase.from('notifications').insert({
      org_id: task.org_id,
      type: 'approval_needed',
      title: `Approve response to ${classification.classification} reply`,
      message: `The agent wants to respond to a reply. Review and approve.`,
      action_url: `/agent/tasks/${task.id}`,
    });

    return { success: true, status: 'awaiting_approval' };
  }

  // Generate and send response
  const responseResult = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/llm/generate-response`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      org_id: task.org_id,
      lead_id,
      classification: classification.classification,
      reply_content,
    }),
  });

  const generatedResponse = await responseResult.json();

  // TODO: Actually send the response via email/messaging
  // For now, just log it
  logger.info('Would send response', { generatedResponse });

  return { success: true, response_generated: generatedResponse };
}

async function processSendMessage(task: any, config: any, rules: any[]): Promise<any> {
  const { lead_id, channel, subject, body, email_account_id, messaging_account_id } = task.input_data;

  // Check daily limits
  if (channel === 'email') {
    const { data: account } = await supabase
      .from('email_accounts')
      .select('emails_sent_today, daily_send_limit')
      .eq('id', email_account_id)
      .single();

    if (account && account.emails_sent_today >= account.daily_send_limit) {
      return { success: false, error: 'Daily email limit reached' };
    }
  }

  // Check rules
  for (const rule of rules) {
    if (rule.rule_type === 'constraint') {
      // Check max follow-ups rule
      if (rule.condition_json?.max_messages) {
        const { count } = await supabase
          .from('emails')
          .select('*', { count: 'exact', head: true })
          .eq('lead_id', lead_id);

        if (count && count >= rule.condition_json.max_messages) {
          return { success: false, error: `Blocked by rule: ${rule.name}` };
        }
      }
    }
  }

  // Send message via API
  const sendResult = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/messages/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      org_id: task.org_id,
      lead_id,
      channel,
      subject,
      body,
      email_account_id,
      messaging_account_id,
    }),
  });

  const result = await sendResult.json();
  return result;
}

async function processFollowUp(task: any, config: any): Promise<any> {
  const { lead_id, message_id } = task.input_data;

  // Get lead and previous messages
  const [{ data: lead }, { data: messages }] = await Promise.all([
    supabase.from('leads').select('*').eq('id', lead_id).single(),
    supabase.from('emails').select('*').eq('lead_id', lead_id).order('created_at', { ascending: false }).limit(5),
  ]);

  if (!lead) {
    return { success: false, error: 'Lead not found' };
  }

  // Check if we should follow up
  const messageCount = messages?.length || 0;
  if (messageCount >= (config.max_follow_ups || 3)) {
    // Update lead status and stop
    await supabase.from('leads').update({ status: 'not_interested' }).eq('id', lead_id);
    return { success: true, action: 'stopped', reason: 'max_follow_ups_reached' };
  }

  // Create send_message task for follow-up
  await supabase.from('agent_tasks').insert({
    org_id: task.org_id,
    agent_config_id: config.id,
    task_type: 'send_message',
    input_data: {
      lead_id,
      channel: 'email',
      // TODO: Generate follow-up content
      subject: `Following up`,
      body: `Hi ${lead.first_name}, just following up on my previous message...`,
    },
    priority: 5,
    requires_approval: config.require_approval_for?.includes('send_message'),
  });

  return { success: true, action: 'follow_up_scheduled' };
}

async function processGenerateSequence(task: any, config: any): Promise<any> {
  const { lead_id, campaign_id, template_id } = task.input_data;

  // Generate sequence via API
  const result = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/sequences/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      org_id: task.org_id,
      lead_id,
      campaign_id,
      template_id,
    }),
  });

  return await result.json();
}

// ===========================================
// INBOX SYNC TASK
// ===========================================
export const syncInboxTrigger = task({
  id: 'sync-inbox',
  retry: {
    maxAttempts: 2,
  },
  run: async (payload: { email_account_id: string; org_id: string }) => {
    const { email_account_id, org_id } = payload;

    logger.info(`Syncing inbox for account ${email_account_id}`);

    // Get account
    const { data: account } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', email_account_id)
      .single();

    if (!account) {
      return { success: false, error: 'Account not found' };
    }

    // TODO: Implement actual IMAP sync
    // For now, placeholder
    logger.info('Would sync IMAP', { account_id: email_account_id });

    // Update last synced
    await supabase
      .from('email_accounts')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', email_account_id);

    return { success: true, account_id: email_account_id };
  },
});

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function isWithinSchedule(agent: any): boolean {
  if (!agent.schedule_enabled) return true;

  const now = new Date();
  
  // Check day
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDay = dayNames[now.getDay()];
  
  if (!agent.schedule_days?.includes(currentDay)) {
    return false;
  }

  // Check time
  const currentTime = now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    timeZone: agent.schedule_timezone || 'UTC',
  });

  const startTime = agent.schedule_start_time || '09:00';
  const endTime = agent.schedule_end_time || '17:00';

  return currentTime >= startTime && currentTime <= endTime;
}

// ===========================================
// DAILY RESET TASK
// ===========================================
export const dailyResetTask = schedules.task({
  id: 'agent-daily-reset',
  // Run at midnight UTC
  cron: '0 0 * * *',
  run: async () => {
    logger.info('Running daily reset...');

    // Reset email send counters (only active accounts)
    await supabase
      .from('email_accounts')
      .update({ emails_sent_today: 0 })
      .eq('is_active', true);

    // Reset messaging send counters (only active accounts)
    await supabase
      .from('messaging_accounts')
      .update({ messages_sent_today: 0 })
      .eq('is_active', true);

    // Cleanup old completed tasks (older than 7 days)
    await supabase
      .from('agent_tasks')
      .delete()
      .eq('status', 'completed')
      .lt('completed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    // Cleanup old logs (older than 30 days)
    await supabase
      .from('agent_logs')
      .delete()
      .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    logger.info('Daily reset complete');
    return { success: true };
  },
});

// ===========================================
// SCHEDULED MESSAGES SENDER
// ===========================================
export const sendScheduledMessagesTask = schedules.task({
  id: 'send-scheduled-messages',
  // Run every 5 minutes
  cron: '*/5 * * * *',
  run: async () => {
    logger.info('Checking for scheduled messages...');

    // Get due emails
    const { data: scheduledEmails } = await supabase
      .from('emails')
      .select('*, leads(*), email_accounts(*)')
      .eq('status', 'scheduled')
      .lte('scheduled_for', new Date().toISOString())
      .limit(50);

    if (!scheduledEmails || scheduledEmails.length === 0) {
      return { sent: 0 };
    }

    logger.info(`Found ${scheduledEmails.length} emails to send`);

    let sent = 0;
    let failed = 0;

    for (const message of scheduledEmails) {
      try {
        // Update status to sending
        await supabase
          .from('emails')
          .update({ status: 'sending' })
          .eq('id', message.id);

        const result = await sendEmailMessage(message);

        if (result?.success) {
          await supabase
            .from('emails')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              message_id: result.messageId,
            })
            .eq('id', message.id);

          // Update counters
          if (message.email_account_id) {
            await supabase.rpc('increment_emails_sent', { account_id: message.email_account_id });
          }

          sent++;
        } else {
          throw new Error(result?.error || 'Unknown error');
        }
      } catch (err: any) {
        logger.error(`Failed to send email ${message.id}`, { error: err.message });

        await supabase
          .from('emails')
          .update({
            status: 'failed',
          })
          .eq('id', message.id);

        failed++;
      }
    }

    return { sent, failed, total: scheduledEmails.length };
  },
});

async function sendEmailMessage(message: any): Promise<any> {
  if (!message.email_account_id) {
    return { success: false, error: 'No email account configured' };
  }

  const lead = message.leads;
  if (!lead?.email) {
    return { success: false, error: 'No lead email address' };
  }

  const result = await sendEmail({
    accountId: message.email_account_id,
    to: lead.email,
    subject: message.subject || '',
    bodyText: message.body || '',
    messageId: message.message_id || undefined,
    inReplyTo: message.in_reply_to || undefined,
    references: message.references || undefined,
  });

  return result;
}
