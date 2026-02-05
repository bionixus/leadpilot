import type { CalendarAccount, BookingRequest, BookingResult, AvailabilityRequest, TimeSlot } from './types';
import { GoogleCalendarProvider } from './google';
import { CalComProvider } from './calcom';
import { CalendlyProvider } from './calendly';

// Factory to get the right provider
export function getCalendarProvider(account: CalendarAccount) {
  switch (account.provider) {
    case 'google':
      return new GoogleCalendarProvider(account);
    case 'cal_com':
      return new CalComProvider(account);
    case 'calendly':
      return new CalendlyProvider(account);
    default:
      throw new Error(`Unknown calendar provider: ${account.provider}`);
  }
}

// High-level calendar operations
export class CalendarService {
  private supabase: any;
  private orgId: string;

  constructor(supabase: any, orgId: string) {
    this.supabase = supabase;
    this.orgId = orgId;
  }

  // Get default calendar account for org
  async getDefaultAccount(): Promise<CalendarAccount | null> {
    const { data } = await this.supabase
      .from('calendar_accounts')
      .select('*')
      .eq('org_id', this.orgId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    return data;
  }

  // Get all calendar accounts
  async getAccounts(): Promise<CalendarAccount[]> {
    const { data } = await this.supabase
      .from('calendar_accounts')
      .select('*')
      .eq('org_id', this.orgId)
      .order('created_at', { ascending: false });

    return data || [];
  }

  // Get available slots across all calendars or specific one
  async getAvailability(
    request: Omit<AvailabilityRequest, 'calendar_account_id'>,
    accountId?: string
  ): Promise<TimeSlot[]> {
    let account: CalendarAccount | null;

    if (accountId) {
      const { data } = await this.supabase
        .from('calendar_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('org_id', this.orgId)
        .single();
      account = data;
    } else {
      account = await this.getDefaultAccount();
    }

    if (!account) {
      throw new Error('No calendar account found');
    }

    const provider = getCalendarProvider(account);
    return provider.getAvailability({
      ...request,
      calendar_account_id: account.id,
    });
  }

  // Book a meeting
  async bookMeeting(
    request: Omit<BookingRequest, 'calendar_account_id'>,
    accountId?: string
  ): Promise<BookingResult> {
    let account: CalendarAccount | null;

    if (accountId) {
      const { data } = await this.supabase
        .from('calendar_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('org_id', this.orgId)
        .single();
      account = data;
    } else {
      account = await this.getDefaultAccount();
    }

    if (!account) {
      return { success: false, error: 'No calendar account found' };
    }

    const provider = getCalendarProvider(account);
    const result = await provider.bookMeeting({
      ...request,
      calendar_account_id: account.id,
    });

    // Store the booking
    if (result.success) {
      await this.supabase.from('calendar_bookings').insert({
        org_id: this.orgId,
        calendar_account_id: account.id,
        lead_id: request.lead_id,
        provider: account.provider,
        provider_event_id: result.event_id,
        provider_booking_id: result.booking_id,
        title: request.title,
        description: request.description,
        start_time: result.start_time,
        end_time: result.end_time,
        meeting_link: result.meeting_link,
        attendee_email: request.attendee_email,
        attendee_name: request.attendee_name,
        status: 'confirmed',
      });
    }

    return result;
  }

  // Cancel a meeting
  async cancelMeeting(bookingId: string): Promise<{ success: boolean; error?: string }> {
    const { data: booking } = await this.supabase
      .from('calendar_bookings')
      .select('*, calendar_accounts(*)')
      .eq('id', bookingId)
      .eq('org_id', this.orgId)
      .single();

    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }

    const provider = getCalendarProvider(booking.calendar_accounts);
    const result = await provider.cancelMeeting(booking.provider_event_id || booking.provider_booking_id);

    if (result.success) {
      await this.supabase
        .from('calendar_bookings')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', bookingId);
    }

    return result;
  }

  // Get scheduling link for a calendar
  async getSchedulingLink(accountId?: string): Promise<string | null> {
    let account: CalendarAccount | null;

    if (accountId) {
      const { data } = await this.supabase
        .from('calendar_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('org_id', this.orgId)
        .single();
      account = data;
    } else {
      account = await this.getDefaultAccount();
    }

    return account?.scheduling_url || null;
  }

  // Smart booking - finds best time and books
  async smartBook(
    leadId: string,
    options: {
      title: string;
      description?: string;
      duration_minutes?: number;
      timezone?: string;
      preferred_days?: number; // How many days ahead to search
    }
  ): Promise<BookingResult> {
    // Get lead info
    const { data: lead } = await this.supabase
      .from('leads')
      .select('email, first_name, last_name, timezone')
      .eq('id', leadId)
      .single();

    if (!lead || !lead.email) {
      return { success: false, error: 'Lead not found or no email' };
    }

    const account = await this.getDefaultAccount();
    if (!account) {
      return { success: false, error: 'No calendar configured' };
    }

    const timezone = options.timezone || lead.timezone || 'UTC';
    const duration = options.duration_minutes || account.default_duration_minutes || 30;
    const daysAhead = options.preferred_days || 7;

    // Get availability
    const slots = await this.getAvailability({
      start_date: new Date(),
      end_date: new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000),
      duration_minutes: duration,
      timezone,
    });

    if (slots.length === 0) {
      return { success: false, error: 'No available slots in the next ' + daysAhead + ' days' };
    }

    // Pick the first available slot
    const selectedSlot = slots[0];

    return this.bookMeeting({
      lead_id: leadId,
      title: options.title,
      description: options.description,
      duration_minutes: duration,
      preferred_datetime: selectedSlot.start,
      timezone,
      attendee_email: lead.email,
      attendee_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Lead',
    });
  }
}

// Export types and providers
export * from './types';
export { GoogleCalendarProvider } from './google';
export { CalComProvider } from './calcom';
export { CalendlyProvider } from './calendly';
