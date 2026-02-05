import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const body = await request.json();
  const { sheet_id, range, campaign_id } = body ?? {};
  if (!sheet_id) return NextResponse.json({ error: 'sheet_id required' }, { status: 400 });

  // TODO: integrate Google Sheets API with OAuth token; for now return placeholder
  return NextResponse.json({
    message: 'Google Sheets import not yet implemented',
    sheet_id,
    range: range ?? 'Sheet1',
    campaign_id: campaign_id ?? null,
  });
}
