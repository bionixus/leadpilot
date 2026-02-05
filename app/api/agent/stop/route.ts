import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// POST - Stop agent
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const userTyped = userData as { org_id?: string | null } | null;
  if (!userTyped?.org_id) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 });
  }

  // Update agent status to paused
  const { data: configData, error } = await supabase
    .from('agent_configs')
    .update({
      status: 'paused',
      is_enabled: false,
    } as never)
    .eq('org_id', userTyped.org_id)
    .select()
    .single();

  const config = configData as { id?: string } | null;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log the stop action
  await supabase.from('agent_logs').insert({
    org_id: userTyped.org_id,
    agent_config_id: config?.id,
    log_type: 'action',
    message: 'Agent stopped by user',
  } as never);

  return NextResponse.json({
    success: true,
    message: 'Agent stopped',
    config,
  });
}
