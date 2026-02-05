import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - List agent logs
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
  const logType = searchParams.get('log_type');
  const taskId = searchParams.get('task_id');
  const limit = parseInt(searchParams.get('limit') || '50');

  let query = supabase
    .from('agent_logs')
    .select('*')
    .eq('org_id', userTyped.org_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (logType) {
    query = query.eq('log_type', logType);
  }

  if (taskId) {
    query = query.eq('task_id', taskId);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
