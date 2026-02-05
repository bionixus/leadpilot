import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * GET /api/leads — list leads with optional filters and pagination.
 * Query params: campaign_id?, status?, search?, limit?, offset?
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaign_id') ?? undefined;
  const status = searchParams.get('status') ?? undefined;
  const search = searchParams.get('search')?.trim();
  const limit = Math.min(
    Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    MAX_LIMIT
  );
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0);

  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (campaignId) query = query.eq('campaign_id', campaignId);
  if (status) query = query.eq('status', status);

  if (search && search.length > 0) {
    const term = `%${search.replace(/%/g, '\\%')}%`;
    query = query.or(`email.ilike.${term},first_name.ilike.${term},last_name.ilike.${term},company.ilike.${term}`);
  }

  const { data: rows, error, count } = await query.range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    leads: rows ?? [],
    total: count ?? 0,
  });
}
