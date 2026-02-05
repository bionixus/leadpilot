import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const LIMIT = 20;

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const url = new URL(request.url);
  const campaign_id = url.searchParams.get('campaign_id');
  const lead_id = url.searchParams.get('lead_id');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? String(LIMIT), 10) || LIMIT, 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;

  let query = supabase
    .from('sequences')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (campaign_id) query = query.eq('campaign_id', campaign_id);
  if (lead_id) query = query.eq('lead_id', lead_id);

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sequences: data, total: count ?? 0 });
}
