import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createTaskSchema = z.object({
  task_type: z.string().min(1),
  input_data: z.record(z.unknown()).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  lead_id: z.string().uuid().optional().nullable(),
  campaign_id: z.string().uuid().optional().nullable(),
  scheduled_for: z.string().datetime().optional(),
  requires_approval: z.boolean().optional(),
});

// GET - List tasks
export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const taskType = searchParams.get('task_type');
  const limit = parseInt(searchParams.get('limit') || '50');

  let query = supabase
    .from('agent_tasks')
    .select('*')
    .eq('org_id', userTyped.org_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  if (taskType) {
    query = query.eq('task_type', taskType);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST - Create a task manually
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
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  // Get agent config
  const { data: configData } = await supabase
    .from('agent_configs')
    .select('id')
    .eq('org_id', userTyped.org_id)
    .single();

  const configTyped = configData as { id?: string } | null;

  const { data, error } = await supabase
    .from('agent_tasks')
    .insert({
      org_id: userTyped.org_id,
      agent_config_id: configTyped?.id,
      task_type: parsed.data.task_type,
      priority: parsed.data.priority ?? 0,
      input_data: parsed.data.input_data ?? {},
      requires_approval: parsed.data.requires_approval ?? false,
      scheduled_for: parsed.data.scheduled_for ?? new Date().toISOString(),
      campaign_id: parsed.data.campaign_id,
      lead_id: parsed.data.lead_id,
      status: 'pending',
    } as never)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
