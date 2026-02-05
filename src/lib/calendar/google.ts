import { google } from 'googleapis';
import { decrypt, encrypt } from '@/lib/encryption';
import type {
  CalendarAccount,
  TimeSlot,
  BookingRequest,
  BookingResult,
  AvailabilityRequest,
} from './types';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/calendar-google`
);

export class GoogleCalendarProvider {
  name = 'google';
  private account: CalendarAccount;
  private calendar: any;

  constructor(account: CalendarAccount) {
    this.account = account;
    this.initializeClient();
  }

  private initializeClient(): void {
    const accessToken = decrypt(this.account.access_token_encrypted!);
    const refreshToken = this.account.refresh_token_encrypted
      ? decrypt(this.account.refresh_token_encrypted)
      : undefined;

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  }

  // Get OAuth URL for connecting
  static getAuthUrl(state: string): string {
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
      state,
    });
  }

  // Exchange code for tokens
  static async exchangeCode(code: string): Promise<{
    access_token: string;
    refresh_token?: string;
    expiry_date?: number;
  }> {
    const { tokens } = await oauth2Client.getToken(code);
    return {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token ?? undefined,
      expiry_date: tokens.expiry_date ?? undefined,
    };
  }

  // Get available time slots
  async getAvailability(request: AvailabilityRequest): Promise<TimeSlot[]> {
    const calendarId = this.account.calendar_id || 'primary';
    const { duration_minutes, timezone } = request;

    // Get busy times
    const freeBusyResponse = await this.calendar.freebusy.query({
      requestBody: {
        timeMin: request.start_date.toISOString(),
        timeMax: request.end_date.toISOString(),
        timeZone: timezone,
        items: [{ id: calendarId }],
      },
    });

    const busyTimes = freeBusyResponse.data.calendars?.[calendarId]?.busy || [];

    // Generate available slots
    const slots: TimeSlot[] = [];
    const slotDuration = duration_minutes * 60 * 1000;
    const bufferBefore = (this.account.buffer_before_minutes || 0) * 60 * 1000;
    const bufferAfter = (this.account.buffer_after_minutes || 0) * 60 * 1000;

    // Working hours (9 AM to 5 PM by default)
    const workStart = 9;
    const workEnd = 17;

    let currentDate = new Date(request.start_date);
    while (currentDate < request.end_date) {
      // Skip weekends
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Set to work start
      const dayStart = new Date(currentDate);
      dayStart.setHours(workStart, 0, 0, 0);

      const dayEnd = new Date(currentDate);
      dayEnd.setHours(workEnd, 0, 0, 0);

      // Generate slots for this day
      let slotStart = dayStart;
      while (slotStart.getTime() + slotDuration <= dayEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + slotDuration);

        // Check if slot conflicts with busy times
        const isAvailable = !busyTimes.some((busy: any) => {
          const busyStart = new Date(busy.start).getTime() - bufferBefore;
          const busyEnd = new Date(busy.end).getTime() + bufferAfter;
          return slotStart.getTime() < busyEnd && slotEnd.getTime() > busyStart;
        });

        slots.push({
          start: new Date(slotStart),
          end: slotEnd,
          available: isAvailable,
        });

        // Move to next slot (30-minute increments)
        slotStart = new Date(slotStart.getTime() + 30 * 60 * 1000);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return slots.filter(s => s.available);
  }

  // Book a meeting
  async bookMeeting(request: BookingRequest): Promise<BookingResult> {
    const calendarId = this.account.calendar_id || 'primary';

    try {
      // Determine start time
      let startTime: Date;
      if (request.preferred_datetime) {
        startTime = request.preferred_datetime;
      } else {
        // Find next available slot
        const availability = await this.getAvailability({
          calendar_account_id: this.account.id,
          start_date: new Date(),
          end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next 7 days
          duration_minutes: request.duration_minutes,
          timezone: request.timezone,
        });

        if (availability.length === 0) {
          return { success: false, error: 'No available slots' };
        }

        startTime = availability[0].start;
      }

      const endTime = new Date(startTime.getTime() + request.duration_minutes * 60 * 1000);

      // Create Google Meet link
      const event = await this.calendar.events.insert({
        calendarId,
        conferenceDataVersion: 1,
        sendUpdates: 'all',
        requestBody: {
          summary: request.title,
          description: request.description,
          start: {
            dateTime: startTime.toISOString(),
            timeZone: request.timezone,
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: request.timezone,
          },
          attendees: [
            { email: request.attendee_email, displayName: request.attendee_name },
          ],
          conferenceData: {
            createRequest: {
              requestId: `leadpilot-${Date.now()}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 24 * 60 },
              { method: 'popup', minutes: 15 },
            ],
          },
        },
      });

      const meetLink = event.data.conferenceData?.entryPoints?.find(
        (e: any) => e.entryPointType === 'video'
      )?.uri;

      return {
        success: true,
        booking_id: event.data.id!,
        event_id: event.data.id!,
        meeting_link: meetLink || event.data.htmlLink!,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
      };
    } catch (error: any) {
      console.error('Google Calendar booking error:', error);
      return { success: false, error: error.message };
    }
  }

  // Cancel a meeting
  async cancelMeeting(eventId: string): Promise<{ success: boolean; error?: string }> {
    const calendarId = this.account.calendar_id || 'primary';

    try {
      await this.calendar.events.delete({
        calendarId,
        eventId,
        sendUpdates: 'all',
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Reschedule a meeting
  async rescheduleMeeting(eventId: string, newDateTime: Date): Promise<BookingResult> {
    const calendarId = this.account.calendar_id || 'primary';

    try {
      // Get existing event to preserve duration
      const existingEvent = await this.calendar.events.get({
        calendarId,
        eventId,
      });

      const startTime = new Date(existingEvent.data.start?.dateTime!);
      const endTime = new Date(existingEvent.data.end?.dateTime!);
      const duration = endTime.getTime() - startTime.getTime();

      const newEndTime = new Date(newDateTime.getTime() + duration);

      const event = await this.calendar.events.patch({
        calendarId,
        eventId,
        sendUpdates: 'all',
        requestBody: {
          start: {
            dateTime: newDateTime.toISOString(),
            timeZone: existingEvent.data.start?.timeZone,
          },
          end: {
            dateTime: newEndTime.toISOString(),
            timeZone: existingEvent.data.end?.timeZone,
          },
        },
      });

      return {
        success: true,
        event_id: event.data.id!,
        start_time: newDateTime.toISOString(),
        end_time: newEndTime.toISOString(),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Get scheduling link (for Google, we'd need to build our own or use Google Appointment Scheduling)
  getSchedulingLink(): string {
    return this.account.scheduling_url || '';
  }
}
