import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get('thread_id');

  if (threadId) {
    const { data, error } = await supabase
      .from('inbox_messages')
      .select('*')
      .eq('org_id', orgId)
      .eq('thread_id', threadId)
      .order('received_at', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // List threads: group by thread_id, return latest message per thread
  const { data: messages, error } = await supabase
    .from('inbox_messages')
    .select('*')
    .eq('org_id', orgId)
    .order('received_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type InboxRow = { id: string; thread_id?: string | null; [key: string]: unknown };
  const list = (messages ?? []) as InboxRow[];
  const byThread = list.reduce<Record<string, InboxRow>>((acc, m) => {
    const tid = m.thread_id ?? m.id;
    if (!acc[tid]) acc[tid] = m;
    return acc;
  }, {});
  const threads = Object.values(byThread);
  return NextResponse.json(threads);
}
