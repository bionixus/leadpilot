import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { generateSequencePrompt } from '@/lib/sequences/prompt';
import { generateSequence } from '@/lib/claude';
import { checkRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const generateSequenceSchema = z.object({
  campaign_id: z.string().uuid(),
  lead_id: z.string().uuid(),
});

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = checkRateLimit(`${user.id}:sequences-generate`, { windowMs: 60_000, maxRequests: 10 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfterMs || 60000) / 1000)) } });
  }

  const body = await request.json();
  const parsed = generateSequenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }
  const { campaign_id, lead_id } = parsed.data;

  const { data: lead } = await supabase.from('leads').select('*').eq('id', lead_id).single();
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', campaign_id).single();
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  const campaignOrgId = (campaign as { org_id?: string }).org_id;
  if (!campaignOrgId) return NextResponse.json({ error: 'Campaign has no org' }, { status: 400 });

  // Verify user belongs to this org
  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const userOrgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (userOrgId !== campaignOrgId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: org } = await supabase.from('organizations').select('business_context, llm_provider, llm_api_key_encrypted').eq('id', campaignOrgId).single();
  const orgBusinessContext = ((org as { business_context?: unknown } | null)?.business_context ?? {}) as Record<string, unknown>;

  // Determine which LLM model the org is configured to use
  const orgLlmProvider = (org as { llm_provider?: string | null } | null)?.llm_provider ?? 'anthropic';
  const llmModelName = orgLlmProvider === 'anthropic' ? 'claude-sonnet-4-20250514' : orgLlmProvider;

  // Merge campaign llm_context if present
  const campaignLlmContext = ((campaign as { llm_context?: unknown }).llm_context ?? {}) as Record<string, unknown>;
  const campaignSettings = ((campaign as { settings?: unknown }).settings ?? {}) as { sequence_length?: number };
  const businessContext = {
    ...orgBusinessContext,
    ...campaignLlmContext,
    sequence_length: campaignSettings.sequence_length ?? orgBusinessContext.sequence_length ?? 3,
  };

  const prompt = generateSequencePrompt(
    businessContext as Parameters<typeof generateSequencePrompt>[0],
    lead as Parameters<typeof generateSequencePrompt>[1]
  );

  // Call Claude
  let result;
  try {
    result = await generateSequence(prompt);
  } catch (err) {
    console.error('Claude generateSequence error:', err);
    const message = err instanceof Error ? err.message : 'Failed to generate sequence';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Check if sequence already exists for this lead
  const { data: existingSeq } = await supabase
    .from('sequences')
    .select('id')
    .eq('lead_id', lead_id)
    .single();

  let sequence;
  if (existingSeq) {
    // Update existing sequence (regenerate)
    const { data, error } = await supabase
      .from('sequences')
      .update({
        emails: result.emails,
        llm_model: llmModelName,
        llm_prompt_tokens: result.usage?.input_tokens ?? null,
        llm_completion_tokens: result.usage?.output_tokens ?? null,
        current_step: 0,
        is_complete: false,
        stopped_reason: null,
        approved_at: null,
        approved_by: null,
        generated_at: new Date().toISOString(),
      } as never)
      .eq('id', (existingSeq as { id: string }).id)
      .select()
      .single();

    if (error) {
      console.error('Update sequence error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    sequence = data;
  } else {
    // Insert new sequence
    const insertRow = {
      org_id: campaignOrgId,
      campaign_id,
      lead_id,
      emails: result.emails,
      llm_model: llmModelName,
      llm_prompt_tokens: result.usage?.input_tokens ?? null,
      llm_completion_tokens: result.usage?.output_tokens ?? null,
      current_step: 0,
      is_complete: false,
    };
    const { data, error } = await supabase
      .from('sequences')
      .insert(insertRow as never)
      .select()
      .single();

    if (error) {
      console.error('Insert sequence error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    sequence = data;
  }

  // Update lead status to sequenced
  await supabase
    .from('leads')
    .update({ status: 'sequenced' } as never)
    .eq('id', lead_id);

  return NextResponse.json({ sequence });
}
