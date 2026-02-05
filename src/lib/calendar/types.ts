// Calendar provider types
export type CalendarProvider = 'google' | 'cal_com' | 'calendly';

export interface CalendarAccount {
  id: string;
  org_id: string;
  user_id: string;
  provider: CalendarProvider;
  
  // Display
  name: string;
  email?: string;
  
  // OAuth tokens (encrypted)
  access_token_encrypted?: string;
  refresh_token_encrypted?: string;
  token_expires_at?: string;
  
  // API keys (for Cal.com/Calendly)
  api_key_encrypted?: string;
  
  // Provider-specific IDs
  calendar_id?: string;        // Google Calendar ID
  event_type_id?: string;      // Cal.com/Calendly event type
  scheduling_url?: string;     // Public booking link
  
  // Settings
  default_duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
}

export interface BookingRequest {
  calendar_account_id: string;
  lead_id: string;
  
  // Meeting details
  title: string;
  description?: string;
  duration_minutes: number;
  
  // Timing
  preferred_datetime?: Date;
  timezone: string;
  
  // Attendees
  attendee_email: string;
  attendee_name: string;
  
  // Optional
  location?: string;
  meeting_link?: string;
}

export interface BookingResult {
  success: boolean;
  booking_id?: string;
  event_id?: string;
  meeting_link?: string;
  start_time?: string;
  end_time?: string;
  error?: string;
}

export interface AvailabilityRequest {
  calendar_account_id: string;
  start_date: Date;
  end_date: Date;
  duration_minutes: number;
  timezone: string;
}

export interface ICalendarProvider {
  name: string;
  
  // Check available slots
  getAvailability(request: AvailabilityRequest): Promise<TimeSlot[]>;
  
  // Book a meeting
  bookMeeting(request: BookingRequest): Promise<BookingResult>;
  
  // Cancel a meeting
  cancelMeeting(eventId: string): Promise<{ success: boolean; error?: string }>;
  
  // Reschedule a meeting
  rescheduleMeeting(eventId: string, newDateTime: Date): Promise<BookingResult>;
  
  // Get scheduling link
  getSchedulingLink(): string;
}
