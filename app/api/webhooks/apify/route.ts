import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  fetchDatasetItems,
  getRunStatus,
  mapLinkedInToLead,
  mapApolloToLead,
  mapGoogleMapsToLead,
  type LinkedInResult,
  type ApolloResult,
  type GoogleMapsResult,
} from '@/lib/apify';

type ScrapingJobRow = {
  id: string;
  org_id: string;
  campaign_id: string | null;
  created_by: string | null;
  job_type: string;
  apify_run_id: string | null;
  status: string;
};

type ApifyWebhookPayload = {
  resource?: {
    id?: string;
    actorId?: string;
    status?: string;
    defaultDatasetId?: string;
    stats?: {
      computeUnits?: number;
    };
  };
  eventType?: string;
  // Fallback for simple payload format
  runId?: string;
  status?: string;
  datasetId?: string;
};

export async function POST(request: Request) {
  const supabase = createSupabaseAdminClient();

  // Parse query params for job_id (we pass this in webhookUrl)
  const { searchParams } = new URL(request.url);
  const jobIdFromQuery = searchParams.get('job_id');

  // Optionally verify webhook secret
  const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;
  if (webhookSecret) {
    const providedSecret = searchParams.get('secret');
    if (providedSecret !== webhookSecret) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    }
  }

  // Parse body - Apify sends different formats depending on configuration
  const body = (await request.json()) as ApifyWebhookPayload;

  // Extract run details - handle both formats
  const runId = body.resource?.id || body.runId;
  const status = body.resource?.status || body.status;
  const datasetId = body.resource?.defaultDatasetId || body.datasetId;
  const computeUnits = body.resource?.stats?.computeUnits;

  if (!runId) {
    return NextResponse.json({ error: 'No runId in payload' }, { status: 400 });
  }

  // Find the scraping job
  let job: ScrapingJobRow | null = null;

  if (jobIdFromQuery) {
    const { data } = await supabase
      .from('scraping_jobs')
      .select('*')
      .eq('id', jobIdFromQuery)
      .single();
    job = data as unknown as ScrapingJobRow | null;
  }

  // Fallback: find by apify_run_id
  if (!job) {
    const { data } = await supabase
      .from('scraping_jobs')
      .select('*')
      .eq('apify_run_id', runId)
      .single();
    job = data as unknown as ScrapingJobRow | null;
  }

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Normalize status
  const normalizedStatus = status?.toUpperCase();

  if (normalizedStatus === 'SUCCEEDED') {
    try {
      // Fetch run status for additional info if needed
      let finalDatasetId = datasetId;
      let finalComputeUnits = computeUnits;

      if (!finalDatasetId) {
        const runStatus = await getRunStatus(runId);
        finalDatasetId = runStatus.datasetId;
        finalComputeUnits = runStatus.stats?.computeUnits;
      }

      if (!finalDatasetId) {
        throw new Error('No datasetId available');
      }

      // Fetch dataset items
      const items = await fetchDatasetItems(finalDatasetId);

      // Map items to leads based on job type
      const leads: Record<string, unknown>[] = [];

      for (const item of items) {
        let lead: Record<string, unknown>;

        if (job.job_type === 'linkedin_search' || job.job_type === 'linkedin_profile') {
          lead = mapLinkedInToLead(item as LinkedInResult, job.org_id, job.campaign_id);
        } else if (job.job_type === 'apollo_search' || job.job_type === 'apollo_enrich') {
          lead = mapApolloToLead(item as ApolloResult, job.org_id, job.campaign_id);
        } else if (job.job_type === 'google_maps') {
          lead = mapGoogleMapsToLead(item as GoogleMapsResult, job.org_id, job.campaign_id);
        } else {
          // Generic mapping
          lead = {
            org_id: job.org_id,
            campaign_id: job.campaign_id,
            email: (item as Record<string, unknown>).email || '',
            source: job.job_type,
            status: 'new',
            enrichment_data: { raw: item },
          };
        }

        // Skip items without email for non-Google Maps jobs
        if (job.job_type !== 'google_maps' && !lead.email) {
          continue;
        }

        leads.push(lead);
      }

      // Insert leads, handling duplicates
      let leadsCreated = 0;

      if (leads.length > 0) {
        // Insert in batches to handle potential duplicates
        const batchSize = 100;
        for (let i = 0; i < leads.length; i += batchSize) {
          const batch = leads.slice(i, i + batchSize);

          // Use upsert with ignoreDuplicates to handle unique constraint
          const { data: inserted, error: insertErr } = await supabase
            .from('leads')
            .upsert(batch as never[], {
              onConflict: 'org_id,campaign_id,email',
              ignoreDuplicates: true,
            })
            .select('id');

          if (!insertErr && inserted) {
            leadsCreated += inserted.length;
          }
        }
      }

      // Update job as completed
      await supabase
        .from('scraping_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          results_count: items.length,
          leads_created: leadsCreated,
          compute_units_used: finalComputeUnits ?? null,
        } as never)
        .eq('id', job.id);

      // Create notification for the user who started the job
      if (job.created_by) {
        await supabase.from('notifications').insert({
          org_id: job.org_id,
          user_id: job.created_by,
          type: 'scraping_completed',
          title: `Scraping completed: ${leadsCreated} leads imported`,
          message: `${job.job_type.replace('_', ' ')} job finished. Found ${items.length} results, created ${leadsCreated} new leads.`,
          is_read: false,
        } as never);
      }

      return NextResponse.json({
        ok: true,
        job_id: job.id,
        status: 'completed',
        results_count: items.length,
        leads_created: leadsCreated,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process results';

      await supabase
        .from('scraping_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: errorMessage,
        } as never)
        .eq('id', job.id);

      return NextResponse.json({
        ok: false,
        job_id: job.id,
        error: errorMessage,
      });
    }
  } else if (normalizedStatus === 'FAILED' || normalizedStatus === 'ABORTED') {
    // Update job as failed
    await supabase
      .from('scraping_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: `Apify run ${normalizedStatus?.toLowerCase()}`,
        compute_units_used: computeUnits ?? null,
      } as never)
      .eq('id', job.id);

    // Notify user
    if (job.created_by) {
      await supabase.from('notifications').insert({
        org_id: job.org_id,
        user_id: job.created_by,
        type: 'scraping_completed',
        title: 'Scraping failed',
        message: `${job.job_type.replace('_', ' ')} job failed.`,
        is_read: false,
      } as never);
    }

    return NextResponse.json({
      ok: false,
      job_id: job.id,
      status: 'failed',
    });
  }

  // Unknown status, just acknowledge
  return NextResponse.json({
    ok: true,
    job_id: job.id,
    received_status: status,
  });
}
