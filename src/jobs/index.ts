/**
 * LeadPilot Trigger.dev Jobs Index
 * 
 * This file exports all background jobs for Trigger.dev.
 * Jobs are organized by function:
 * 
 * AGENT JOBS (agent-orchestrator.ts)
 * - agentOrchestratorTask: Main agent loop, runs every minute
 * - processAgentTaskTrigger: Process individual agent tasks
 * - syncInboxTrigger: Sync email inbox for an account
 * - dailyResetTask: Reset daily counters at midnight
 * - sendScheduledMessagesTask: Send due messages every 5 minutes
 * 
 * CALENDAR JOBS (meeting-reminders.ts)
 * - sendMeetingRemindersTask: Send 24h and 1h meeting reminders
 * - markNoShowsTask: Mark completed/no-show meetings
 * - syncCalendarEventsTask: Sync events from calendar providers
 */

// Agent Jobs
export {
  agentOrchestratorTask,
  processAgentTaskTrigger,
  syncInboxTrigger,
  dailyResetTask,
  sendScheduledMessagesTask,
} from './agent-orchestrator';

// Calendar Jobs
export {
  sendMeetingRemindersTask,
  markNoShowsTask,
  syncCalendarEventsTask,
} from './meeting-reminders';

/**
 * Job Schedule Summary:
 * 
 * Every minute:
 *   - agentOrchestratorTask: Process agent tasks, check for work
 * 
 * Every 5 minutes:
 *   - sendScheduledMessagesTask: Send due emails/messages
 * 
 * Every 15 minutes:
 *   - sendMeetingRemindersTask: Send meeting reminders
 * 
 * Every 30 minutes:
 *   - syncCalendarEventsTask: Sync calendar events
 * 
 * Every hour:
 *   - markNoShowsTask: Mark completed meetings
 * 
 * Daily at midnight (UTC):
 *   - dailyResetTask: Reset email/message counters, cleanup old data
 */
