import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const body = await request.json();
  const leads = Array.isArray(body) ? body : body.leads ?? [];
  const rows = leads.map((l: Record<string, unknown>) => ({
    org_id: orgId,
    campaign_id: campaignId,
    email: l.email,
    first_name: l.first_name ?? null,
    last_name: l.last_name ?? null,
    company: l.company ?? null,
    job_title: l.job_title ?? null,
    linkedin_url: l.linkedin_url ?? null,
    phone: l.phone ?? null,
    location: l.location ?? null,
    enrichment_data: l.enrichment_data ?? {},
  }));

  const { data, error } = await supabase.from('leads').insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
