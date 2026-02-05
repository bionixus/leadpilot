import { CalendarService } from '@/lib/calendar';
import type { AgentTool } from '../types';

export function createCalendarTools(supabase: any, orgId: string): AgentTool[] {
  const calendarService = new CalendarService(supabase, orgId);

  return [
    // Book a meeting
    {
      name: 'book_meeting',
      description: 'Book a meeting with a lead. Will find the next available slot and send calendar invite.',
      parameters: {
        lead_id: 'string - The ID of the lead to book with',
        title: 'string - Meeting title (e.g., "Discovery Call with John")',
        description: 'string (optional) - Meeting description/agenda',
        duration_minutes: 'number (optional) - Meeting duration (default: 30)',
        preferred_date: 'string (optional) - Preferred date in ISO format',
      },
      execute: async (params) => {
        const {
          lead_id,
          title,
          description,
          duration_minutes = 30,
        } = params as {
          lead_id: string;
          title?: string;
          description?: string;
          duration_minutes?: number;
          preferred_date?: string;
        };

        // Get lead info
        const { data: lead } = await supabase
          .from('leads')
          .select('email, first_name, last_name, timezone, company')
          .eq('id', lead_id)
          .single();

        if (!lead || !lead.email) {
          return { success: false, error: 'Lead not found or no email' };
        }

        // Format title with lead name if not provided
        const meetingTitle = title || `Call with ${lead.first_name || 'Lead'} from ${lead.company || 'their company'}`;

        try {
          const result = await calendarService.smartBook(lead_id, {
            title: meetingTitle,
            description: description || `Meeting scheduled via LeadPilot`,
            duration_minutes,
            timezone: lead.timezone,
            preferred_days: 7,
          });

          if (result.success) {
            // Update lead status
            await supabase
              .from('leads')
              .update({ status: 'interested' })
              .eq('id', lead_id);

            // Log the booking
            await supabase.from('agent_logs').insert({
              org_id: orgId,
              log_type: 'action',
              message: `Booked meeting with ${lead.first_name} ${lead.last_name} at ${lead.company}`,
              details: result,
            });
          }

          return result;
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      },
    },

    // Get availability
    {
      name: 'check_availability',
      description: 'Check available meeting slots for the next N days',
      parameters: {
        days_ahead: 'number (optional) - How many days to check (default: 7)',
        duration_minutes: 'number (optional) - Meeting duration (default: 30)',
        timezone: 'string (optional) - Timezone (default: UTC)',
      },
      execute: async (params) => {
        const {
          days_ahead = 7,
          duration_minutes = 30,
          timezone = 'UTC',
        } = params as { days_ahead?: number; duration_minutes?: number; timezone?: string };

        try {
          const slots = await calendarService.getAvailability({
            start_date: new Date(),
            end_date: new Date(Date.now() + days_ahead * 24 * 60 * 60 * 1000),
            duration_minutes,
            timezone,
          });

          return {
            success: true,
            available_slots: slots.length,
            next_available: slots[0]?.start.toISOString(),
            slots: slots.slice(0, 10).map(s => ({
              start: s.start.toISOString(),
              end: s.end.toISOString(),
            })),
          };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      },
    },

    // Send scheduling link
    {
      name: 'send_scheduling_link',
      description: 'Generate a message containing the scheduling link for a lead to self-book',
      parameters: {
        lead_id: 'string - The ID of the lead',
        message_template: 'string (optional) - Custom message template',
      },
      execute: async (params) => {
        const { lead_id, message_template } = params as { lead_id: string; message_template?: string };

        // Get scheduling link
        const schedulingLink = await calendarService.getSchedulingLink();

        if (!schedulingLink) {
          return { success: false, error: 'No scheduling link configured' };
        }

        // Get lead info
        const { data: lead } = await supabase
          .from('leads')
          .select('first_name')
          .eq('id', lead_id)
          .single();

        const defaultTemplate = `Hi ${lead?.first_name || 'there'},

I'd love to find a time to chat! Here's my calendar - feel free to pick a slot that works for you:

${schedulingLink}

Looking forward to connecting!`;

        return {
          success: true,
          scheduling_link: schedulingLink,
          suggested_message: message_template || defaultTemplate,
        };
      },
    },

    // Cancel a meeting
    {
      name: 'cancel_meeting',
      description: 'Cancel an existing meeting',
      parameters: {
        booking_id: 'string - The booking ID to cancel',
        reason: 'string (optional) - Cancellation reason',
      },
      execute: async (params) => {
        const { booking_id, reason } = params as { booking_id: string; reason?: string };

        try {
          const result = await calendarService.cancelMeeting(booking_id);

          if (result.success) {
            await supabase.from('agent_logs').insert({
              org_id: orgId,
              log_type: 'action',
              message: `Cancelled meeting ${booking_id}${reason ? `: ${reason}` : ''}`,
            });
          }

          return result;
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      },
    },

    // Get upcoming meetings
    {
      name: 'get_upcoming_meetings',
      description: 'Get list of upcoming meetings',
      parameters: {
        days_ahead: 'number (optional) - How many days to look ahead (default: 7)',
        lead_id: 'string (optional) - Filter by specific lead',
      },
      execute: async (params) => {
        const { days_ahead = 7, lead_id } = params as { days_ahead?: number; lead_id?: string };

        let query = supabase
          .from('calendar_bookings')
          .select('*, leads(first_name, last_name, company, email)')
          .eq('org_id', orgId)
          .eq('status', 'confirmed')
          .gte('start_time', new Date().toISOString())
          .lte('start_time', new Date(Date.now() + days_ahead * 24 * 60 * 60 * 1000).toISOString())
          .order('start_time', { ascending: true });

        if (lead_id) {
          query = query.eq('lead_id', lead_id);
        }

        const { data: meetings, error } = await query;

        if (error) {
          return { success: false, error: error.message };
        }

        return {
          success: true,
          count: meetings?.length || 0,
          meetings: meetings?.map((m: Record<string, unknown>) => ({
            id: m.id,
            title: m.title,
            start_time: m.start_time,
            end_time: m.end_time,
            meeting_link: m.meeting_link,
            lead: m.leads ? {
              name: `${(m.leads as Record<string, string>).first_name} ${(m.leads as Record<string, string>).last_name}`,
              company: (m.leads as Record<string, string>).company,
              email: (m.leads as Record<string, string>).email,
            } : null,
          })),
        };
      },
    },
  ];
}
