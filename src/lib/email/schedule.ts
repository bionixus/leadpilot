import type { CampaignSettings, SequenceEmail } from '@/types/database';

export type ScheduleEmailInput = {
  campaignSettings: CampaignSettings;
  sequenceEmails: SequenceEmail[];
  campaignStartedAt?: Date | string;
};

export type ScheduledEmail = SequenceEmail & {
  scheduledFor: Date;
};

/**
 * Compute the scheduled_for timestamp for each email step.
 *
 * Rules:
 * - Step 1 sends at the first valid send window after campaign starts.
 * - Subsequent steps use delay_between_emails_days array (index step-2, else last value).
 * - Scheduled time is randomized within send_window_start and send_window_end.
 * - All times are in the campaign's timezone, converted to UTC.
 */
export function computeScheduleTimes(input: ScheduleEmailInput): ScheduledEmail[] {
  const { campaignSettings, sequenceEmails, campaignStartedAt } = input;

  const {
    delay_between_emails_days: delays = [1],
    send_window_start = '09:00',
    send_window_end = '17:00',
    timezone = 'UTC',
  } = campaignSettings;

  const startDate = campaignStartedAt ? new Date(campaignStartedAt) : new Date();

  const result: ScheduledEmail[] = [];

  let cursor = startDate;

  for (let i = 0; i < sequenceEmails.length; i++) {
    const email = sequenceEmails[i];
    const step = email.step ?? i + 1;

    // Determine days offset from previous email
    let daysDelay = 0;
    if (i > 0) {
      // Use delay from settings or fall back to last value or email's own delay
      const delayIdx = i - 1;
      daysDelay =
        delays[delayIdx] ??
        delays[delays.length - 1] ??
        email.delay_days ??
        1;
    }

    // Move cursor forward by delay
    const sendDate = new Date(cursor);
    sendDate.setDate(sendDate.getDate() + daysDelay);

    // Compute a random time within the send window on that day
    const scheduledFor = randomTimeInWindow(
      sendDate,
      send_window_start,
      send_window_end,
      timezone
    );

    result.push({
      ...email,
      step,
      scheduledFor,
    });

    // Update cursor for next iteration
    cursor = scheduledFor;
  }

  return result;
}

/**
 * Generate a random Date within the send window on the given day.
 */
function randomTimeInWindow(
  baseDate: Date,
  windowStart: string,
  windowEnd: string,
  timezone: string
): Date {
  // Parse HH:mm
  const [startH, startM] = windowStart.split(':').map(Number);
  const [endH, endM] = windowEnd.split(':').map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  // Random minute within window
  const randomMinute =
    startMinutes + Math.floor(Math.random() * (endMinutes - startMinutes));
  const hour = Math.floor(randomMinute / 60);
  const minute = randomMinute % 60;

  // Build date string in local time then convert to timezone
  const dateStr = baseDate.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

  // Create date in the specified timezone
  // We use Intl.DateTimeFormat to convert local representation to UTC
  try {
    // Compose a local datetime in the target timezone
    const localDateTimeStr = `${dateStr}T${timeStr}`;

    // Use a hacky but widely-supported approach: offset calculation
    const targetDate = new Date(localDateTimeStr);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Get the offset between UTC and target timezone on this date
    const utcDate = new Date(localDateTimeStr + 'Z');
    const parts = formatter.formatToParts(utcDate);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    const tzOffsetDate = new Date(
      `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}Z`
    );

    // Offset = how much the timezone differs from UTC
    const offsetMs = utcDate.getTime() - tzOffsetDate.getTime();

    // Apply offset to get the correct UTC time for the local time in that timezone
    return new Date(targetDate.getTime() + offsetMs);
  } catch {
    // Fallback: just return the date interpreted as UTC
    return new Date(`${dateStr}T${timeStr}Z`);
  }
}

/**
 * Check if an email account can send now, considering rate limits and warmup.
 */
export function canSendNow(account: {
  daily_send_limit: number;
  emails_sent_today: number;
  warmup_enabled: boolean;
  warmup_day: number;
  is_active: boolean;
}): { canSend: boolean; remaining: number; reason?: string } {
  if (!account.is_active) {
    return { canSend: false, remaining: 0, reason: 'Account not active' };
  }

  let effectiveLimit = account.daily_send_limit;

  // Apply warmup ramp if enabled
  if (account.warmup_enabled) {
    // Warmup schedule: start at 10/day, increase by ~10/day
    // Day 1: 10, Day 2: 20, Day 3: 30, ... Day 10: 100, etc.
    const warmupLimit = Math.min(10 + (account.warmup_day - 1) * 10, account.daily_send_limit);
    effectiveLimit = Math.min(effectiveLimit, warmupLimit);
  }

  const remaining = Math.max(0, effectiveLimit - account.emails_sent_today);

  if (remaining <= 0) {
    return { canSend: false, remaining: 0, reason: 'Daily limit reached' };
  }

  return { canSend: true, remaining };
}
