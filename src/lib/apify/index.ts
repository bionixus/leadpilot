import { ApifyClient } from 'apify-client';

// Actor IDs - can be overridden via env vars
export const ACTOR_IDS = {
  LINKEDIN_SEARCH: process.env.APIFY_LINKEDIN_SEARCH_ACTOR ?? 'curious_coder/linkedin-search',
  LINKEDIN_PROFILE: process.env.APIFY_LINKEDIN_PROFILE_ACTOR ?? 'anchor/linkedin-profile-scraper',
  APOLLO_SEARCH: process.env.APIFY_APOLLO_ACTOR ?? 'code_monk/apollo-io-scraper',
  GOOGLE_MAPS: process.env.APIFY_GOOGLE_MAPS_ACTOR ?? 'compass/google-maps-scraper',
};

export type ApifyRunStatus = {
  id: string;
  status: string;
  datasetId?: string;
  startedAt?: string;
  finishedAt?: string;
  stats?: {
    computeUnits?: number;
    inputBodyLen?: number;
    restartCount?: number;
    resurpieces?: number;
  };
};

export type StartActorResult = {
  runId: string;
};

function getClient(): ApifyClient {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error('APIFY_API_TOKEN is not set');
  }
  return new ApifyClient({ token });
}

/**
 * Start an Apify actor with the given input.
 * Optionally registers a webhook to be called on completion.
 */
export async function startActor(
  actorId: string,
  input: Record<string, unknown>,
  webhookUrl?: string
): Promise<StartActorResult> {
  const client = getClient();

  try {
    // Build webhooks array if URL provided
    const webhooks = webhookUrl
      ? [
          {
            eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.ABORTED'] as ('ACTOR.RUN.SUCCEEDED' | 'ACTOR.RUN.FAILED' | 'ACTOR.RUN.ABORTED')[],
            requestUrl: webhookUrl,
          },
        ]
      : undefined;

    const run = await client.actor(actorId).start(input, {
      webhooks,
    });

    return { runId: run.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start actor';
    throw new Error(`Apify startActor failed: ${message}`);
  }
}

/**
 * Get the status of an Apify run.
 */
export async function getRunStatus(runId: string): Promise<ApifyRunStatus> {
  const client = getClient();

  try {
    const run = await client.run(runId).get();

    if (!run) {
      throw new Error('Run not found');
    }

    return {
      id: run.id,
      status: run.status,
      datasetId: run.defaultDatasetId,
      startedAt: run.startedAt?.toISOString(),
      finishedAt: run.finishedAt?.toISOString(),
      stats: {
        computeUnits: run.stats?.computeUnits,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get run status';
    throw new Error(`Apify getRunStatus failed: ${message}`);
  }
}

/**
 * Fetch all items from an Apify dataset.
 */
export async function fetchDatasetItems<T = Record<string, unknown>>(
  datasetId: string
): Promise<T[]> {
  const client = getClient();

  try {
    const dataset = client.dataset(datasetId);
    const result = await dataset.listItems();

    return result.items as T[];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch dataset';
    throw new Error(`Apify fetchDatasetItems failed: ${message}`);
  }
}

// ============================================
// Lead Mapping Utilities
// ============================================

export type LinkedInResult = {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  companyName?: string;
  location?: string;
  profileUrl?: string;
  email?: string;
  connectionDegree?: string;
  publicIdentifier?: string;
};

export type ApolloResult = {
  email?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  company?: {
    name?: string;
    domain?: string;
    industry?: string;
    employee_count?: number;
  };
  linkedin_url?: string;
  city?: string;
  state?: string;
  country?: string;
  phone_numbers?: string[];
};

export type GoogleMapsResult = {
  title?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  email?: string;
  category?: string;
};

/**
 * Parse city from LinkedIn location string.
 * e.g. "San Francisco, California, United States" -> "San Francisco"
 */
function parseCity(location?: string): string | null {
  if (!location) return null;
  const parts = location.split(',').map((p) => p.trim());
  return parts[0] || null;
}

/**
 * Map a LinkedIn result to lead fields.
 */
export function mapLinkedInToLead(
  item: LinkedInResult,
  orgId: string,
  campaignId?: string | null
): Record<string, unknown> {
  // Try to extract job title from headline (e.g. "CEO at Acme" -> "CEO")
  let jobTitle = item.headline;
  if (item.headline && item.headline.includes(' at ')) {
    jobTitle = item.headline.split(' at ')[0].trim();
  }

  return {
    org_id: orgId,
    campaign_id: campaignId ?? null,
    email: item.email || '',
    first_name: item.firstName || null,
    last_name: item.lastName || null,
    full_name: item.fullName || null,
    company_name: item.companyName || null,
    job_title: jobTitle || null,
    linkedin_url: item.profileUrl || null,
    city: parseCity(item.location),
    source: 'linkedin',
    source_url: item.profileUrl || null,
    status: 'new',
    enrichment_data: { raw: item },
  };
}

/**
 * Map an Apollo result to lead fields.
 */
export function mapApolloToLead(
  item: ApolloResult,
  orgId: string,
  campaignId?: string | null
): Record<string, unknown> {
  return {
    org_id: orgId,
    campaign_id: campaignId ?? null,
    email: item.email || '',
    first_name: item.first_name || null,
    last_name: item.last_name || null,
    full_name: item.first_name && item.last_name 
      ? `${item.first_name} ${item.last_name}` 
      : null,
    company_name: item.company?.name || null,
    job_title: item.title || null,
    linkedin_url: item.linkedin_url || null,
    city: item.city || null,
    country: item.country || null,
    phone: item.phone_numbers?.[0] || null,
    source: 'apollo',
    status: 'new',
    enrichment_data: { 
      raw: item,
      company_domain: item.company?.domain,
      company_industry: item.company?.industry,
      company_size: item.company?.employee_count,
    },
  };
}

/**
 * Map a Google Maps result to lead fields.
 */
export function mapGoogleMapsToLead(
  item: GoogleMapsResult,
  orgId: string,
  campaignId?: string | null
): Record<string, unknown> {
  return {
    org_id: orgId,
    campaign_id: campaignId ?? null,
    email: item.email || '',
    company_name: item.title || null,
    phone: item.phone || null,
    website: item.website || null,
    city: item.city || null,
    source: 'google_maps',
    status: 'new',
    enrichment_data: { 
      raw: item,
      address: item.address,
      category: item.category,
    },
  };
}
