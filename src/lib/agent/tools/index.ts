import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentTool, AgentToolResult } from '../types';
import { getLLMProviderForOrg } from '@/lib/llm';

export class AgentToolsManager {
  private supabase: SupabaseClient;
  private orgId: string;
  private tools: Map<string, AgentTool> = new Map();

  constructor(supabase: SupabaseClient, orgId: string) {
    this.supabase = supabase;
    this.orgId = orgId;
    this.registerTools();
  }

  private registerTools(): void {
    // ===========================================
    // MESSAGING TOOLS
    // ===========================================

    // Send Email
    this.register({
      name: 'send_email',
      description: 'Send an email to a lead',
      parameters: {
        lead_id: 'string - The ID of the lead',
        subject: 'string - Email subject',
        body: 'string - Email body',
        email_account_id: 'string - The email account to send from',
      },
      execute: async (params): Promise<AgentToolResult> => {
        const { lead_id, subject, body, email_account_id } = params as {
          lead_id: string;
          subject: string;
          body: string;
          email_account_id: string;
        };

        const { data: lead } = await this.supabase
          .from('leads')
          .select('email, first_name, last_name')
          .eq('id', lead_id)
          .single();

        if (!lead?.email) {
          return { success: false, error: 'Lead has no email address' };
        }

        // Create message record
        const { data: message, error } = await this.supabase
          .from('messages')
          .insert({
            org_id: this.orgId,
            lead_id,
            email_account_id,
            channel: 'email',
            direction: 'outbound',
            subject,
            body,
            status: 'queued',
          } as never)
          .select()
          .single();

        if (error) {
          return { success: false, error: error.message };
        }

        return {
          success: true,
          message_id: message?.id,
          to: lead.email,
        };
      },
    });

    // Send WhatsApp
    this.register({
      name: 'send_whatsapp',
      description: 'Send a WhatsApp message to a lead',
      parameters: {
        lead_id: 'string - The ID of the lead',
        body: 'string - Message body',
        messaging_account_id: 'string - The messaging account to use',
      },
      execute: async (params): Promise<AgentToolResult> => {
        const { lead_id, body, messaging_account_id } = params as {
          lead_id: string;
          body: string;
          messaging_account_id: string;
        };

        const { data: lead } = await this.supabase
          .from('leads')
          .select('phone, whatsapp')
          .eq('id', lead_id)
          .single();

        const phone = lead?.whatsapp || lead?.phone;
        if (!phone) {
          return { success: false, error: 'Lead has no WhatsApp number' };
        }

        const { data: message, error } = await this.supabase
          .from('messages')
          .insert({
            org_id: this.orgId,
            lead_id,
            messaging_account_id,
            channel: 'whatsapp',
            direction: 'outbound',
            body,
            status: 'queued',
          } as never)
          .select()
          .single();

        if (error) {
          return { success: false, error: error.message };
        }

        return {
          success: true,
          message_id: message?.id,
          to: phone,
        };
      },
    });

    // Send SMS
    this.register({
      name: 'send_sms',
      description: 'Send an SMS to a lead',
      parameters: {
        lead_id: 'string - The ID of the lead',
        body: 'string - SMS body',
        messaging_account_id: 'string - The messaging account to use',
      },
      execute: async (params): Promise<AgentToolResult> => {
        const { lead_id, body, messaging_account_id } = params as {
          lead_id: string;
          body: string;
          messaging_account_id: string;
        };

        const { data: lead } = await this.supabase
          .from('leads')
          .select('phone')
          .eq('id', lead_id)
          .single();

        if (!lead?.phone) {
          return { success: false, error: 'Lead has no phone number' };
        }

        const { data: message, error } = await this.supabase
          .from('messages')
          .insert({
            org_id: this.orgId,
            lead_id,
            messaging_account_id,
            channel: 'sms',
            direction: 'outbound',
            body,
            status: 'queued',
          } as never)
          .select()
          .single();

        if (error) {
          return { success: false, error: error.message };
        }

        return {
          success: true,
          message_id: message?.id,
          to: lead.phone,
        };
      },
    });

    // ===========================================
    // AI TOOLS
    // ===========================================

    // Classify Reply
    this.register({
      name: 'classify_reply',
      description: 'Classify an incoming reply using AI',
      parameters: {
        reply_content: 'string - The reply text',
        original_outreach: 'string - The original message sent',
      },
      execute: async (params): Promise<AgentToolResult> => {
        const { reply_content, original_outreach } = params as {
          reply_content: string;
          original_outreach: string;
        };

        try {
          const provider = await getLLMProviderForOrg(this.supabase, this.orgId);

          const prompt = `Classify this email reply into one of these categories:
- interested: They want to learn more or have a call
- not_interested: They explicitly decline or unsubscribe
- question: They have questions about the product/service
- out_of_office: Auto-reply or vacation message
- other: Anything else

ORIGINAL MESSAGE:
${original_outreach}

REPLY:
${reply_content}

Respond with JSON: {"classification": "...", "confidence": 0.0-1.0, "reason": "..."}`;

          const response = await provider.chat([
            { role: 'system', content: 'You classify email replies. Return JSON only.' },
            { role: 'user', content: prompt },
          ]);

          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            return {
              success: true,
              classification: result.classification,
              confidence: result.confidence,
              reason: result.reason,
            };
          }

          return { success: false, error: 'Failed to parse classification' };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    });

    // Generate Response
    this.register({
      name: 'generate_response',
      description: 'Generate a response to a reply',
      parameters: {
        reply_content: 'string - The reply to respond to',
        classification: 'string - The reply classification',
        lead_context: 'object - Information about the lead',
        tone: 'string - Response tone (professional, friendly, etc)',
      },
      execute: async (params): Promise<AgentToolResult> => {
        const { reply_content, classification, lead_context, tone } = params as {
          reply_content: string;
          classification: string;
          lead_context: Record<string, unknown>;
          tone?: string;
        };

        try {
          const provider = await getLLMProviderForOrg(this.supabase, this.orgId);

          const prompt = `Generate a response to this ${classification} reply.

REPLY: ${reply_content}

LEAD CONTEXT: ${JSON.stringify(lead_context)}

TONE: ${tone || 'professional'}

Requirements:
- Be helpful and address their specific points
- Keep it concise (2-3 sentences)
- Include a clear next step or CTA
- Don't be pushy

Return JSON: {"subject": "Re: ...", "body": "..."}`;

          const response = await provider.chat([
            { role: 'system', content: 'You write sales responses. Return JSON only.' },
            { role: 'user', content: prompt },
          ]);

          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return { success: true, ...JSON.parse(jsonMatch[0]) };
          }

          return { success: true, body: response.content };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    });

    // ===========================================
    // LEAD MANAGEMENT TOOLS
    // ===========================================

    // Update Lead Status
    this.register({
      name: 'update_lead_status',
      description: 'Update the status of a lead',
      parameters: {
        lead_id: 'string - The lead ID',
        status: 'string - New status (new, contacted, interested, not_interested, etc)',
      },
      execute: async (params): Promise<AgentToolResult> => {
        const { lead_id, status } = params as { lead_id: string; status: string };

        const { error } = await this.supabase
          .from('leads')
          .update({ status } as never)
          .eq('id', lead_id)
          .eq('org_id', this.orgId);

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true, lead_id, new_status: status };
      },
    });

    // Get Lead Info
    this.register({
      name: 'get_lead_info',
      description: 'Get information about a lead',
      parameters: {
        lead_id: 'string - The lead ID',
      },
      execute: async (params): Promise<AgentToolResult> => {
        const { lead_id } = params as { lead_id: string };

        const { data: lead, error } = await this.supabase
          .from('leads')
          .select('*')
          .eq('id', lead_id)
          .eq('org_id', this.orgId)
          .single();

        if (error || !lead) {
          return { success: false, error: error?.message || 'Lead not found' };
        }

        return { success: true, lead };
      },
    });

    // ===========================================
    // CALENDAR TOOLS
    // ===========================================

    // Book Meeting (placeholder)
    this.register({
      name: 'book_meeting',
      description: 'Book a meeting with a lead',
      parameters: {
        lead_id: 'string - The lead ID',
        datetime: 'string - Preferred datetime in ISO format',
        duration_minutes: 'number - Meeting duration (default: 30)',
        title: 'string - Meeting title',
      },
      execute: async (params): Promise<AgentToolResult> => {
        const { lead_id, datetime, duration_minutes, title } = params as {
          lead_id: string;
          datetime?: string;
          duration_minutes?: number;
          title?: string;
        };

        // Get lead info
        const { data: lead } = await this.supabase
          .from('leads')
          .select('email, first_name, last_name, company')
          .eq('id', lead_id)
          .single();

        if (!lead?.email) {
          return { success: false, error: 'Lead has no email for calendar invite' };
        }

        // TODO: Integrate with actual calendar (Cal.com, Calendly, Google Calendar)
        // For now, return a mock booking
        return {
          success: true,
          booking_id: `booking_${Date.now()}`,
          lead_id,
          title: title || `Call with ${lead.first_name || 'Lead'}`,
          datetime: datetime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          duration_minutes: duration_minutes || 30,
          meeting_url: 'https://calendly.com/leadpilot/meeting',
        };
      },
    });

    // ===========================================
    // CONTROL TOOLS
    // ===========================================

    // Skip action (do nothing)
    this.register({
      name: 'skip',
      description: 'Skip this task and move on',
      parameters: {
        reason: 'string (optional) - Reason for skipping',
      },
      execute: async (params): Promise<AgentToolResult> => {
        const { reason } = params as { reason?: string };
        return { success: true, skipped: true, reason };
      },
    });

    // Escalate to human
    this.register({
      name: 'escalate',
      description: 'Escalate this task to a human for review',
      parameters: {
        reason: 'string - Why this needs human attention',
        priority: 'string (optional) - low, medium, high',
      },
      execute: async (params): Promise<AgentToolResult> => {
        const { reason, priority } = params as { reason: string; priority?: string };

        // Create notification
        await this.supabase.from('notifications').insert({
          org_id: this.orgId,
          type: 'agent_escalation',
          title: 'Agent needs human attention',
          message: reason,
          priority: priority || 'medium',
        } as never);

        return { success: true, escalated: true, reason, priority };
      },
    });

    // Delay task
    this.register({
      name: 'delay',
      description: 'Delay this task to be processed later',
      parameters: {
        delay_hours: 'number - Hours to delay',
        reason: 'string (optional) - Reason for delay',
      },
      execute: async (params): Promise<AgentToolResult> => {
        const { delay_hours, reason } = params as { delay_hours: number; reason?: string };

        const newScheduledFor = new Date(Date.now() + delay_hours * 60 * 60 * 1000);

        return {
          success: true,
          delayed: true,
          delay_hours,
          new_scheduled_for: newScheduledFor.toISOString(),
          reason,
        };
      },
    });
  }

  // Register a tool
  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  // Get a specific tool
  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  // Get all tools
  getAll(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  // Check if a tool exists
  has(name: string): boolean {
    return this.tools.has(name);
  }

  // Get tool names
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }
}
