import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - List rules
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

  const { data, error } = await supabase
    .from('agent_rules')
    .select('*')
    .eq('org_id', userTyped.org_id)
    .order('priority', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST - Create rule
export async function POST(request: Request) {
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

  // Validate required fields
  if (!body.name || !body.rule_type || !body.condition || !body.action) {
    return NextResponse.json(
      { error: 'name, rule_type, condition, and action are required' },
      { status: 400 }
    );
  }

  // Get agent config ID
  const { data: configData } = await supabase
    .from('agent_configs')
    .select('id')
    .eq('org_id', userTyped.org_id)
    .single();

  const configTyped = configData as { id?: string } | null;

  const { data, error } = await supabase
    .from('agent_rules')
    .insert({
      org_id: userTyped.org_id,
      agent_config_id: configTyped?.id,
      name: body.name,
      description: body.description,
      rule_type: body.rule_type,
      condition: body.condition,
      condition_json: body.condition_json,
      action: body.action,
      action_json: body.action_json,
      priority: body.priority ?? 0,
      is_enabled: body.is_enabled ?? true,
    } as never)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
