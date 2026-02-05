import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - Get agent config
export async function GET() {
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

  let { data: config } = await supabase
    .from('agent_configs')
    .select('*')
    .eq('org_id', userTyped.org_id)
    .single();

  // Create default config if doesn't exist
  if (!config) {
    const { data: newConfig } = await supabase
      .from('agent_configs')
      .insert({ org_id: userTyped.org_id } as never)
      .select()
      .single();
    config = newConfig;
  }

  return NextResponse.json(config);
}

// PATCH - Update agent config
export async function PATCH(request: Request) {
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

  const body = await request.json();

  // Remove fields that shouldn't be updated directly
  delete body.id;
  delete body.org_id;
  delete body.created_at;

  const { data, error } = await supabase
    .from('agent_configs')
    .update(body as never)
    .eq('org_id', userTyped.org_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
