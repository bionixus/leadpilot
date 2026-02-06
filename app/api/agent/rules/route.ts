import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  rule_type: z.enum(['filter', 'constraint', 'escalation', 'automation']),
  condition: z.string().min(1),
  condition_json: z.record(z.unknown()).optional(),
  action: z.string().min(1),
  action_json: z.record(z.unknown()).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  is_enabled: z.boolean().optional(),
});

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
  const parsed = createRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
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
      ...parsed.data,
      priority: parsed.data.priority ?? 0,
      is_enabled: parsed.data.is_enabled ?? true,
    } as never)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
