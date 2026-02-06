import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

// POST - Start agent
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = checkRateLimit(`${user.id}:agent-start`, { windowMs: 60_000, maxRequests: 5 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfterMs || 60000) / 1000)) } });
  }

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const userTyped = userData as { org_id?: string | null } | null;
  if (!userTyped?.org_id) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 });
  }

  // Update agent status to running
  // In production, this would trigger a background job (e.g., Trigger.dev, BullMQ)
  const { data: configData, error } = await supabase
    .from('agent_configs')
    .update({
      status: 'running',
      is_enabled: true,
    } as never)
    .eq('org_id', userTyped.org_id)
    .select()
    .single();

  const config = configData as { id?: string } | null;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log the start action
  await supabase.from('agent_logs').insert({
    org_id: userTyped.org_id,
    agent_config_id: config?.id,
    log_type: 'action',
    message: 'Agent started by user',
  } as never);

  return NextResponse.json({
    success: true,
    message: 'Agent started',
    config,
  });
}
