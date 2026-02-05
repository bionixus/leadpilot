import { decrypt } from '@/lib/encryption';
import type {
  CalendarAccount,
  TimeSlot,
  BookingRequest,
  BookingResult,
  AvailabilityRequest,
} from './types';

const CAL_COM_API_URL = 'https://api.cal.com/v1';

export class CalComProvider {
  name = 'cal_com';
  private account: CalendarAccount;
  private apiKey: string;

  constructor(account: CalendarAccount) {
    this.account = account;
    this.apiKey = decrypt(account.api_key_encrypted!);
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${CAL_COM_API_URL}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `Cal.com API error: ${response.status}`);
    }

    return response.json();
  }

  // Get event types for this user
  async getEventTypes(): Promise<any[]> {
    const data = await this.request('/event-types');
    return data.event_types || [];
  }

  // Get available time slots
  async getAvailability(request: AvailabilityRequest): Promise<TimeSlot[]> {
    const eventTypeId = this.account.event_type_id;
    
    if (!eventTypeId) {
      throw new Error('No event type configured for this calendar');
    }

    const params = new URLSearchParams({
      eventTypeId,
      startTime: request.start_date.toISOString(),
      endTime: request.end_date.toISOString(),
      timeZone: request.timezone,
    });

    const data = await this.request(`/availability?${params}`);
    
    // Transform Cal.com slots to our format
    const slots: TimeSlot[] = [];
    
    for (const slot of data.slots || []) {
      slots.push({
        start: new Date(slot.time),
        end: new Date(new Date(slot.time).getTime() + request.duration_minutes * 60 * 1000),
        available: true,
      });
    }

    return slots;
  }

  // Book a meeting
  async bookMeeting(request: BookingRequest): Promise<BookingResult> {
    const eventTypeId = this.account.event_type_id;
    
    if (!eventTypeId) {
      return { success: false, error: 'No event type configured' };
    }

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
          end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          duration_minutes: request.duration_minutes,
          timezone: request.timezone,
        });

        if (availability.length === 0) {
          return { success: false, error: 'No available slots' };
        }

        startTime = availability[0].start;
      }

      const data = await this.request('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          eventTypeId: parseInt(eventTypeId),
          start: startTime.toISOString(),
          end: new Date(startTime.getTime() + request.duration_minutes * 60 * 1000).toISOString(),
          responses: {
            name: request.attendee_name,
            email: request.attendee_email,
            notes: request.description,
          },
          timeZone: request.timezone,
          language: 'en',
          metadata: {
            lead_id: request.lead_id,
            source: 'leadpilot',
          },
        }),
      });

      return {
        success: true,
        booking_id: data.id?.toString(),
        event_id: data.uid,
        meeting_link: data.metadata?.videoCallUrl || this.getSchedulingLink(),
        start_time: data.startTime,
        end_time: data.endTime,
      };
    } catch (error: any) {
      console.error('Cal.com booking error:', error);
      return { success: false, error: error.message };
    }
  }

  // Cancel a meeting
  async cancelMeeting(bookingId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request(`/bookings/${bookingId}/cancel`, {
        method: 'DELETE',
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Reschedule a meeting
  async rescheduleMeeting(bookingId: string, newDateTime: Date): Promise<BookingResult> {
    try {
      const data = await this.request(`/bookings/${bookingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          start: newDateTime.toISOString(),
        }),
      });

      return {
        success: true,
        booking_id: data.id?.toString(),
        event_id: data.uid,
        start_time: data.startTime,
        end_time: data.endTime,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Get scheduling link
  getSchedulingLink(): string {
    return this.account.scheduling_url || '';
  }
}
