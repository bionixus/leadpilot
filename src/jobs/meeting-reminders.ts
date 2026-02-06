import { schedules, logger } from '@trigger.dev/sdk/v3';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ===========================================
// SEND MEETING REMINDERS - Runs every 15 minutes
// ===========================================
export const sendMeetingRemindersTask = schedules.task({
  id: 'send-meeting-reminders',
  cron: '*/15 * * * *', // Every 15 minutes
  run: async () => {
    logger.info('Checking for meeting reminders...');

    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);
    const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // 24-hour reminders
    const { data: meetings24h } = await supabase
      .from('calendar_bookings')
      .select(`
        *,
        leads(email, first_name, last_name),
        calendar_accounts(email)
      `)
      .eq('status', 'confirmed')
      .eq('reminder_sent_24h', false)
      .gte('start_time', in24Hours.toISOString())
      .lt('start_time', new Date(in24Hours.getTime() + 15 * 60 * 1000).toISOString());

    logger.info(`Found ${meetings24h?.length || 0} meetings needing 24h reminder`);

    for (const meeting of meetings24h || []) {
      await send24HourReminder(meeting);
    }

    // 1-hour reminders
    const { data: meetings1h } = await supabase
      .from('calendar_bookings')
      .select(`
        *,
        leads(email, first_name, last_name),
        calendar_accounts(email)
      `)
      .eq('status', 'confirmed')
      .eq('reminder_sent_1h', false)
      .gte('start_time', in1Hour.toISOString())
      .lt('start_time', in2Hours.toISOString());

    logger.info(`Found ${meetings1h?.length || 0} meetings needing 1h reminder`);

    for (const meeting of meetings1h || []) {
      await send1HourReminder(meeting);
    }

    return {
      sent_24h: meetings24h?.length || 0,
      sent_1h: meetings1h?.length || 0,
    };
  },
});

async function send24HourReminder(meeting: any) {
  const lead = meeting.leads;
  if (!lead?.email) return;

  const startTime = new Date(meeting.start_time);
  const formattedTime = startTime.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  // Create email content
  const subject = `Reminder: ${meeting.title} tomorrow`;
  const body = `Hi ${lead.first_name || 'there'},

Just a friendly reminder about our meeting tomorrow!

📅 ${meeting.title}
🕐 ${formattedTime}
${meeting.meeting_link ? `🔗 ${meeting.meeting_link}` : ''}

Looking forward to speaking with you!

Best regards`;

  // Queue the reminder email
  await supabase.from('emails').insert({
    org_id: meeting.org_id,
    lead_id: meeting.lead_id,
    step: 0,
    subject,
    body,
    scheduled_for: new Date().toISOString(),
    status: 'scheduled',
  });

  // Mark reminder as sent
  await supabase
    .from('calendar_bookings')
    .update({ reminder_sent_24h: true })
    .eq('id', meeting.id);

  logger.info(`Sent 24h reminder for meeting ${meeting.id}`);
}

async function send1HourReminder(meeting: any) {
  const lead = meeting.leads;
  if (!lead?.email) return;

  const startTime = new Date(meeting.start_time);
  const formattedTime = startTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const subject = `Starting soon: ${meeting.title}`;
  const body = `Hi ${lead.first_name || 'there'},

Quick reminder - we're meeting in about an hour!

📅 ${meeting.title}
🕐 ${formattedTime}
${meeting.meeting_link ? `🔗 Join here: ${meeting.meeting_link}` : ''}

See you soon!`;

  await supabase.from('emails').insert({
    org_id: meeting.org_id,
    lead_id: meeting.lead_id,
    step: 0,
    subject,
    body,
    scheduled_for: new Date().toISOString(),
    status: 'scheduled',
  });

  await supabase
    .from('calendar_bookings')
    .update({ reminder_sent_1h: true })
    .eq('id', meeting.id);

  logger.info(`Sent 1h reminder for meeting ${meeting.id}`);
}

// ===========================================
// MARK NO-SHOWS - Runs every hour
// ===========================================
export const markNoShowsTask = schedules.task({
  id: 'mark-meeting-no-shows',
  cron: '0 * * * *', // Every hour
  run: async () => {
    logger.info('Checking for no-shows...');

    // Meetings that ended more than 30 minutes ago without being marked
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);

    const { data: possibleNoShows } = await supabase
      .from('calendar_bookings')
      .select('*')
      .eq('status', 'confirmed')
      .lt('end_time', cutoff.toISOString())
      .is('outcome', null);

    logger.info(`Found ${possibleNoShows?.length || 0} meetings to check`);

    // For now, just mark as completed (in real app, you'd check if meeting actually happened)
    for (const meeting of possibleNoShows || []) {
      await supabase
        .from('calendar_bookings')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', meeting.id);
    }

    return { checked: possibleNoShows?.length || 0 };
  },
});

// ===========================================
// SYNC CALENDAR EVENTS - Runs every 30 minutes
// ===========================================
export const syncCalendarEventsTask = schedules.task({
  id: 'sync-calendar-events',
  cron: '*/30 * * * *',
  run: async () => {
    logger.info('Syncing calendar events...');

    // Get all active calendar accounts
    const { data: accounts } = await supabase
      .from('calendar_accounts')
      .select('*')
      .eq('is_active', true);

    if (!accounts || accounts.length === 0) {
      return { synced: 0 };
    }

    let synced = 0;

    for (const account of accounts) {
      try {
        // Sync events for this account
        // This would fetch events from the calendar provider and update our bookings
        // For now, just log
        logger.info(`Would sync account ${account.id} (${account.provider})`);
        synced++;
      } catch (error: any) {
        logger.error(`Failed to sync account ${account.id}`, { error: error.message });
      }
    }

    return { synced };
  },
});
