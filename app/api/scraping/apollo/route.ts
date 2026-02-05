import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { startActor, ACTOR_IDS } from '@/lib/apify';

type UserRow = { id: string; org_id: string | null };

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase
    .from('users')
    .select('id, org_id')
    .eq('auth_id', user.id)
    .single();

  const typedUser = userRow as UserRow | null;
  if (!typedUser?.org_id) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const orgId = typedUser.org_id;
  const userId = typedUser.id;

  const body = await request.json();
  const { campaign_id, input_config, job_type } = body ?? {};

  if (!input_config) {
    return NextResponse.json({ error: 'input_config required' }, { status: 400 });
  }

  const actorId = ACTOR_IDS.APOLLO_SEARCH;
  const jobType = job_type === 'apollo_enrich' ? 'apollo_enrich' : 'apollo_search';

  // 1. Insert scraping job with pending status
  const { data: job, error: insertErr } = await supabase
    .from('scraping_jobs')
    .insert({
      org_id: orgId,
      campaign_id: campaign_id ?? null,
      created_by: userId,
      apify_actor_id: actorId,
      job_type: jobType,
      input_config,
      status: 'pending',
    } as never)
    .select()
    .single();

  if (insertErr || !job) {
    return NextResponse.json(
      { error: 'Failed to create job', details: insertErr?.message },
      { status: 500 }
    );
  }

  const jobId = (job as { id: string }).id;

  // 2. Build webhook URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const webhookUrl = `${baseUrl}/api/webhooks/apify?job_id=${jobId}`;

  try {
    // 3. Start Apify actor
    const { runId } = await startActor(actorId, input_config, webhookUrl);

    // 4. Update job with run ID and status
    await supabase
      .from('scraping_jobs')
      .update({
        apify_run_id: runId,
        status: 'running',
        started_at: new Date().toISOString(),
      } as never)
      .eq('id', jobId);

    return NextResponse.json({
      job_id: jobId,
      run_id: runId,
      status: 'running',
      job_type: jobType,
    });
  } catch (err) {
    // Update job to failed status
    const errorMessage = err instanceof Error ? err.message : 'Failed to start actor';
    await supabase
      .from('scraping_jobs')
      .update({
        status: 'failed',
        error_message: errorMessage,
      } as never)
      .eq('id', jobId);

    return NextResponse.json({ error: errorMessage, job_id: jobId }, { status: 500 });
  }
}
