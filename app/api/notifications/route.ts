import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase.from('users').select('id, org_id').eq('auth_id', user.id).single();
  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const userId = (userRow as { id: string; org_id: string }).id;
  const orgId = (userRow as { id: string; org_id: string }).org_id;

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get('unread') === 'true';
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  let query = supabase
    .from('notifications')
    .select('*')
    .or(`user_id.eq.${userId},user_id.is.null`)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Count unread
  const { count: unreadCount } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .or(`user_id.eq.${userId},user_id.is.null`)
    .eq('org_id', orgId)
    .eq('is_read', false);

  return NextResponse.json({
    notifications: data,
    unread_count: unreadCount ?? 0,
  });
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase.from('users').select('id, org_id').eq('auth_id', user.id).single();
  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const userId = (userRow as { id: string; org_id: string }).id;
  const orgId = (userRow as { id: string; org_id: string }).org_id;

  const body = await request.json();
  const { notification_ids, mark_all_read } = body ?? {};

  if (mark_all_read) {
    // Mark all notifications as read for this user
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true } as never)
      .or(`user_id.eq.${userId},user_id.is.null`)
      .eq('org_id', orgId)
      .eq('is_read', false);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'All notifications marked as read' });
  }

  if (notification_ids && Array.isArray(notification_ids) && notification_ids.length > 0) {
    // Mark specific notifications as read
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true } as never)
      .in('id', notification_ids)
      .eq('org_id', orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated: notification_ids.length });
  }

  return NextResponse.json({ error: 'notification_ids or mark_all_read required' }, { status: 400 });
}
