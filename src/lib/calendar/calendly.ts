import { decrypt } from '@/lib/encryption';
import type {
  CalendarAccount,
  TimeSlot,
  BookingRequest,
  BookingResult,
  AvailabilityRequest,
} from './types';

const CALENDLY_API_URL = 'https://api.calendly.com';

export class CalendlyProvider {
  name = 'calendly';
  private account: CalendarAccount;
  private accessToken: string;

  constructor(account: CalendarAccount) {
    this.account = account;
    // Calendly uses OAuth, so we use access_token
    this.accessToken = account.access_token_encrypted 
      ? decrypt(account.access_token_encrypted)
      : decrypt(account.api_key_encrypted!);
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = endpoint.startsWith('http') ? endpoint : `${CALENDLY_API_URL}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `Calendly API error: ${response.status}`);
    }

    return response.json();
  }

  // Get current user info
  async getCurrentUser(): Promise<any> {
    const data = await this.request('/users/me');
    return data.resource;
  }

  // Get event types for user
  async getEventTypes(): Promise<any[]> {
    const user = await this.getCurrentUser();
    const data = await this.request(`/event_types?user=${user.uri}`);
    return data.collection || [];
  }

  // Get available time slots
  async getAvailability(request: AvailabilityRequest): Promise<TimeSlot[]> {
    const eventTypeUri = this.account.event_type_id;
    
    if (!eventTypeUri) {
      // Get first active event type
      const eventTypes = await this.getEventTypes();
      const activeType = eventTypes.find((et: any) => et.active);
      if (!activeType) {
        throw new Error('No active event types found');
      }
    }

    // Calendly's availability endpoint
    const params = new URLSearchParams({
      event_type: eventTypeUri || '',
      start_time: request.start_date.toISOString(),
      end_time: request.end_date.toISOString(),
    });

    const data = await this.request(`/event_type_available_times?${params}`);
    
    // Transform to our format
    const slots: TimeSlot[] = [];
    
    for (const slot of data.collection || []) {
      slots.push({
        start: new Date(slot.start_time),
        end: new Date(new Date(slot.start_time).getTime() + request.duration_minutes * 60 * 1000),
        available: slot.status === 'available',
      });
    }

    return slots.filter(s => s.available);
  }

  // Book a meeting
  // Note: Calendly doesn't have a direct API for creating bookings
  // You typically share the scheduling link and let leads book themselves
  // However, we can use their Scheduled Events API for certain plans
  async bookMeeting(request: BookingRequest): Promise<BookingResult> {
    const eventTypeUri = this.account.event_type_id;
    
    if (!eventTypeUri) {
      return { 
        success: false, 
        error: 'Calendly requires the invitee to book via scheduling link' 
      };
    }

    try {
      // For Calendly, we typically can't book on behalf of someone
      // We'll return the scheduling link for them to book
      const schedulingLink = this.getSchedulingLink();
      
      // If this is a higher-tier Calendly plan with the invitations API:
      const user = await this.getCurrentUser();
      
      // Try to create a one-off scheduling link
      const data = await this.request('/scheduling_links', {
        method: 'POST',
        body: JSON.stringify({
          max_event_count: 1,
          owner: user.uri,
          owner_type: 'User',
        }),
      });

      return {
        success: true,
        booking_id: data.resource?.uri,
        meeting_link: data.resource?.booking_url || schedulingLink,
      };
    } catch (error: any) {
      console.error('Calendly booking error:', error);
      
      // Fall back to returning the scheduling link
      return {
        success: true,
        meeting_link: this.getSchedulingLink(),
        error: 'Could not create direct booking, use scheduling link',
      };
    }
  }

  // Cancel a meeting
  async cancelMeeting(eventUri: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request(eventUri, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Cancelled via LeadPilot',
        }),
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Reschedule is not directly supported via API
  // The invitee must use the reschedule link in their confirmation email
  async rescheduleMeeting(eventUri: string, newDateTime: Date): Promise<BookingResult> {
    return {
      success: false,
      error: 'Calendly requires the invitee to reschedule via email link',
    };
  }

  // Get scheduling link
  getSchedulingLink(): string {
    return this.account.scheduling_url || '';
  }

  // Get OAuth URL for connecting
  static getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.CALENDLY_CLIENT_ID!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/calendar-calendly`,
      response_type: 'code',
      state,
    });

    return `https://auth.calendly.com/oauth/authorize?${params}`;
  }

  // Exchange code for tokens
  static async exchangeCode(code: string): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }> {
    const response = await fetch('https://auth.calendly.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.CALENDLY_CLIENT_ID!,
        client_secret: process.env.CALENDLY_CLIENT_SECRET!,
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/calendar-calendly`,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to exchange Calendly code');
    }

    return response.json();
  }
}
