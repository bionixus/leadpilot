// ===========================================
// Database Types (Generated from Supabase)
// Run: pnpm db:types to regenerate
// ===========================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          business_context: BusinessContext;
          settings: OrganizationSettings;
          subscription_tier: string;
          subscription_status: string;
          llm_provider: string | null;
          llm_api_key_encrypted: string | null;
          llm_settings: Json | null;
          stripe_customer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['organizations']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>;
      };
      users: {
        Row: {
          id: string;
          org_id: string | null;
          auth_id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: 'owner' | 'admin' | 'member';
          notification_preferences: NotificationPreferences;
          last_active_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      email_accounts: {
        Row: {
          id: string;
          org_id: string;
          user_id: string | null;
          email_address: string;
          display_name: string | null;
          provider: 'gmail' | 'outlook' | 'custom';
          oauth_access_token_encrypted: string | null;
          oauth_refresh_token_encrypted: string | null;
          oauth_token_expires_at: string | null;
          imap_host: string | null;
          imap_port: number;
          imap_secure: boolean;
          smtp_host: string | null;
          smtp_port: number;
          smtp_secure: boolean;
          credentials_encrypted: string | null;
          daily_send_limit: number;
          emails_sent_today: number;
          warmup_enabled: boolean;
          warmup_day: number;
          is_active: boolean;
          connection_status: 'pending' | 'connected' | 'error' | 'revoked';
          last_error: string | null;
          last_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['email_accounts']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['email_accounts']['Insert']>;
      };
      campaigns: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          description: string | null;
          source: CampaignSource;
          source_config: Json;
          email_account_id: string | null;
          settings: CampaignSettings;
          llm_context: Json;
          status: CampaignStatus;
          stats: CampaignStats;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['campaigns']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['campaigns']['Insert']>;
      };
      leads: {
        Row: {
          id: string;
          org_id: string;
          campaign_id: string | null;
          email: string;
          first_name: string | null;
          last_name: string | null;
          full_name: string | null;
          company: string | null;
          job_title: string | null;
          linkedin_url: string | null;
          website: string | null;
          phone: string | null;
          city: string | null;
          state: string | null;
          country: string | null;
          timezone: string | null;
          enrichment_data: LeadEnrichmentData;
          custom_fields: Json;
          status: LeadStatus;
          email_valid: boolean | null;
          email_validation_checked_at: string | null;
          source: string | null;
          source_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['leads']['Row'], 'id' | 'full_name' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['leads']['Insert']>;
      };
      sequences: {
        Row: {
          id: string;
          org_id: string;
          campaign_id: string;
          lead_id: string;
          emails: SequenceEmail[];
          llm_model: string;
          llm_prompt_tokens: number | null;
          llm_completion_tokens: number | null;
          current_step: number;
          is_complete: boolean;
          stopped_reason: string | null;
          generated_at: string;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['sequences']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['sequences']['Insert']>;
      };
      emails: {
        Row: {
          id: string;
          org_id: string;
          campaign_id: string | null;
          sequence_id: string | null;
          lead_id: string;
          email_account_id: string;
          step: number;
          subject: string;
          body_text: string;
          body_html: string | null;
          message_id: string | null;
          in_reply_to: string | null;
          thread_id: string | null;
          scheduled_for: string | null;
          status: EmailStatus;
          sent_at: string | null;
          delivered_at: string | null;
          opened_at: string | null;
          clicked_at: string | null;
          bounced_at: string | null;
          error_message: string | null;
          retry_count: number;
          open_count: number;
          click_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['emails']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['emails']['Insert']>;
      };
      inbox_messages: {
        Row: {
          id: string;
          org_id: string;
          email_account_id: string;
          lead_id: string | null;
          campaign_id: string | null;
          direction: 'inbound' | 'outbound';
          from_email: string;
          from_name: string | null;
          to_email: string;
          to_name: string | null;
          cc: string[] | null;
          bcc: string[] | null;
          subject: string | null;
          body_text: string | null;
          body_html: string | null;
          snippet: string | null;
          message_id: string | null;
          in_reply_to: string | null;
          references_header: string[] | null;
          thread_id: string | null;
          attachments: Json;
          classification: MessageClassification | null;
          classification_confidence: number | null;
          is_read: boolean;
          is_starred: boolean;
          is_archived: boolean;
          provider_message_id: string | null;
          provider_thread_id: string | null;
          received_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['inbox_messages']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['inbox_messages']['Insert']>;
      };
      notifications: {
        Row: {
          id: string;
          org_id: string;
          user_id: string | null;
          type: NotificationType;
          title: string;
          message: string | null;
          campaign_id: string | null;
          lead_id: string | null;
          inbox_message_id: string | null;
          action_url: string | null;
          is_read: boolean;
          read_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
      };
      scraping_jobs: {
        Row: {
          id: string;
          org_id: string;
          campaign_id: string | null;
          created_by: string | null;
          apify_actor_id: string;
          apify_run_id: string | null;
          job_type: ScrapingJobType;
          input_config: Json;
          status: ScrapingJobStatus;
          results_count: number | null;
          leads_created: number | null;
          error_message: string | null;
          compute_units_used: number | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['scraping_jobs']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['scraping_jobs']['Insert']>;
      };
    };
  };
}

// ===========================================
// Custom Types
// ===========================================

export interface BusinessContext {
  company_name?: string;
  industry?: string;
  target_audience?: string;
  value_proposition?: string;
  tone?: string; // e.g. 'professional', 'professional but warm', 'casual', 'formal'
  key_pain_points?: string[];
  case_studies?: string[];
  cta?: string;
  sender_name?: string;
  sender_title?: string;
  sequence_length?: number; // default 3 for LLM generation
}

export interface OrganizationSettings {
  timezone: string;
  default_sequence_length: number;
  send_window_start: string;
  send_window_end: string;
  send_days: string[];
}

export interface NotificationPreferences {
  email_replies: boolean;
  email_bounces: boolean;
  daily_digest: boolean;
  browser_push: boolean;
}

export interface CampaignSettings {
  sequence_length: number;
  delay_between_emails_days: number[];
  stop_on_reply: boolean;
  track_opens: boolean;
  timezone: string;
  send_window_start: string;
  send_window_end: string;
}

export interface CampaignStats {
  total_leads: number;
  emails_sent: number;
  emails_opened: number;
  replies_received: number;
  positive_replies: number;
  bounces: number;
}

export interface LeadEnrichmentData {
  company_size?: string;
  company_industry?: string;
  company_revenue?: string;
  seniority?: string;
  departments?: string[];
  technologies?: string[];
  [key: string]: unknown;
}

export interface SequenceEmail {
  step: number;
  delay_days: number;
  subject: string;
  body: string;
}

export type CampaignSource = 'csv' | 'google_sheets' | 'linkedin' | 'apollo' | 'google_maps' | 'manual';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';
export type LeadStatus = 'new' | 'sequenced' | 'contacted' | 'replied' | 'interested' | 'not_interested' | 'bounced' | 'unsubscribed' | 'converted';
export type EmailStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
export type MessageClassification = 'interested' | 'not_interested' | 'question' | 'out_of_office' | 'bounce' | 'unsubscribe' | 'other';
export type NotificationType = 'reply_received' | 'positive_reply' | 'bounce' | 'campaign_completed' | 'scraping_completed' | 'daily_digest' | 'system';
export type ScrapingJobType = 'linkedin_search' | 'linkedin_profile' | 'apollo_search' | 'apollo_enrich' | 'google_maps';
export type ScrapingJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

// ===========================================
// Utility Types
// ===========================================

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

// Shorthand types
export type Organization = Tables<'organizations'>;
export type User = Tables<'users'>;
export type EmailAccount = Tables<'email_accounts'>;
export type Campaign = Tables<'campaigns'>;
export type Lead = Tables<'leads'>;
export type Sequence = Tables<'sequences'>;
export type Email = Tables<'emails'>;
export type InboxMessage = Tables<'inbox_messages'>;
export type Notification = Tables<'notifications'>;
export type ScrapingJob = Tables<'scraping_jobs'>;
