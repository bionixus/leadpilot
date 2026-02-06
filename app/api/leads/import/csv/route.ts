import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { canAddLeads } from '@/lib/stripe/limits';
import Papa from 'papaparse';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = checkRateLimit(`${user.id}:csv-import`, { windowMs: 60_000, maxRequests: 5 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfterMs || 60000) / 1000)) } });
  }

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const campaignId = formData.get('campaign_id') as string | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const text = await file.text();

  // Use PapaParse for robust CSV parsing (handles quoted fields, commas in values, etc.)
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim().replace(/^"|"$/g, ''),
  });

  if (parsed.errors.length > 0) {
    const firstError = parsed.errors[0];
    return NextResponse.json(
      { error: `CSV parse error at row ${firstError.row}: ${firstError.message}` },
      { status: 400 }
    );
  }

  const rows = parsed.data.map((obj) => ({
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
  }));

  // Filter out rows with no email
  const validRows = rows.filter((r) => r.email && r.email.length > 0);

  if (validRows.length === 0) {
    return NextResponse.json({ error: 'No valid rows with email addresses found' }, { status: 400 });
  }

  // Check subscription limits
  const limitCheck = await canAddLeads(orgId, validRows.length);
  if (!limitCheck.allowed) {
    return NextResponse.json({ error: limitCheck.reason }, { status: 403 });
  }

  const { data, error } = await supabase.from('leads').insert(validRows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ imported: data?.length ?? 0, leads: data });
}
