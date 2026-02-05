// Re-export database types from root (single source of truth)
export type {
  Database,
  Json,
  BusinessContext,
  OrganizationSettings,
  NotificationPreferences,
  CampaignSettings,
  CampaignStats,
  LeadEnrichmentData,
  SequenceEmail,
  Organization,
  User,
  EmailAccount,
  Campaign,
  Lead,
  Sequence,
  Email,
  InboxMessage,
  Notification,
  ScrapingJob,
} from '../../database';

export type {
  CampaignSource,
  CampaignStatus,
  LeadStatus,
  EmailStatus,
  MessageClassification,
  NotificationType,
  ScrapingJobType,
  ScrapingJobStatus,
} from '../../database';

export type { Tables, InsertTables, UpdateTables } from '../../database';
