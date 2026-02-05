import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - Get a single task
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    .from('agent_tasks')
    .select('*')
    .eq('id', id)
    .eq('org_id', userTyped.org_id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  return NextResponse.json(data);
}

// PATCH - Update task (approve/reject/cancel)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id, id')
    .eq('auth_id', user.id)
    .single();

  const userTyped = userData as { org_id?: string | null; id?: string } | null;
  if (!userTyped?.org_id) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 });
  }

  const body = await request.json();
  const { action } = body;

  // Handle approve/reject actions
  if (action === 'approve') {
    const { data, error } = await supabase
      .from('agent_tasks')
      .update({
        status: 'pending',
        approved_by: userTyped.id,
        approved_at: new Date().toISOString(),
        requires_approval: false,
      } as never)
      .eq('id', id)
      .eq('org_id', userTyped.org_id)
      .eq('status', 'awaiting_approval')
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'reject') {
    const { data, error } = await supabase
      .from('agent_tasks')
      .update({
        status: 'cancelled',
        rejection_reason: body.reason || 'Rejected by user',
        completed_at: new Date().toISOString(),
      } as never)
      .eq('id', id)
      .eq('org_id', userTyped.org_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'cancel') {
    const { data, error } = await supabase
      .from('agent_tasks')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      } as never)
      .eq('id', id)
      .eq('org_id', userTyped.org_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// DELETE - Delete a task
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const { error } = await supabase
    .from('agent_tasks')
    .delete()
    .eq('id', id)
    .eq('org_id', userTyped.org_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
