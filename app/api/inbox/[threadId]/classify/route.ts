import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { message_id, classification } = body ?? {};
  if (!message_id) return NextResponse.json({ error: 'message_id required' }, { status: 400 });

  const { data, error } = await supabase
    .from('inbox_messages')
    // @ts-expect-error Supabase Update type inference
    .update({ classification: classification ?? null })
    .eq('id', message_id)
    .eq('thread_id', threadId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
