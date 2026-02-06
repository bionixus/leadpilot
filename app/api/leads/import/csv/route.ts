import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { canAddLeads } from '@/lib/stripe/limits';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const campaignId = formData.get('campaign_id') as string | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
    return {
      org_id: orgId,
      campaign_id: campaignId ?? null,
      email: obj.email ?? obj.Email ?? '',
      first_name: obj.first_name ?? obj['First Name'] ?? null,
      last_name: obj.last_name ?? obj['Last Name'] ?? null,
      company: obj.company ?? obj.Company ?? null,
      job_title: obj.job_title ?? obj['Job Title'] ?? null,
      linkedin_url: obj.linkedin_url ?? obj.linkedin ?? null,
      phone: obj.phone ?? null,
      location: obj.location ?? null,
    };
  });

  // Check subscription limits
  const limitCheck = await canAddLeads(orgId, rows.length);
  if (!limitCheck.allowed) {
    return NextResponse.json({ error: limitCheck.reason }, { status: 403 });
  }

  const { data, error } = await supabase.from('leads').insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ imported: data?.length ?? 0, leads: data });
}
