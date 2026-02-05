import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const SAFE_SELECT = 'id, org_id, user_id, email_address, display_name, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, daily_send_limit, emails_sent_today, warmup_enabled, warmup_day, is_active, connection_status, last_error, last_synced_at, created_at, updated_at';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const { data, error } = await supabase
    .from('email_accounts')
    .select(SAFE_SELECT)
    .eq('id', id)
    .eq('org_id', orgId)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const { data: existing } = await supabase.from('email_accounts').select('id').eq('id', id).eq('org_id', orgId).single();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json() as Record<string, unknown>;
  const allowed: Record<string, unknown> = {};
  if (typeof body.display_name === 'string') allowed.display_name = body.display_name.trim() || null;
  if (typeof body.daily_send_limit === 'number') allowed.daily_send_limit = body.daily_send_limit;
  if (typeof body.warmup_enabled === 'boolean') allowed.warmup_enabled = body.warmup_enabled;
  if (typeof body.is_active === 'boolean') allowed.is_active = body.is_active;

  if (Object.keys(allowed).length === 0) return NextResponse.json({ error: 'No allowed fields to update' }, { status: 400 });

  const { data, error } = await supabase
    .from('email_accounts')
    .update(allowed as never)
    .eq('id', id)
    .select(SAFE_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const { error } = await supabase.from('email_accounts').delete().eq('id', id).eq('org_id', orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
