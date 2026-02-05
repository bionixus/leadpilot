import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { encrypt } from '@/lib/encryption';

// GET - List calendar accounts
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
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
    .from('calendar_accounts')
    .select(`
      id,
      provider,
      name,
      email,
      scheduling_url,
      event_type_id,
      default_duration_minutes,
      buffer_before_minutes,
      buffer_after_minutes,
      working_hours,
      is_active,
      is_default,
      created_at
    ` as never)
    .eq('org_id', userTyped.org_id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST - Create calendar account (for API key based like Cal.com)
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData2 } = await supabase
    .from('users')
    .select('org_id, id')
    .eq('auth_id', user.id)
    .single();

  const userTyped2 = userData2 as { org_id?: string | null; id?: string } | null;
  if (!userTyped2?.org_id) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 });
  }

  const body = await request.json();
  const { provider, name, api_key, scheduling_url, event_type_id, settings } = body;

  // Validate
  if (!provider || !name) {
    return NextResponse.json({ error: 'Provider and name are required' }, { status: 400 });
  }

  if (provider === 'cal_com' && !api_key) {
    return NextResponse.json({ error: 'API key is required for Cal.com' }, { status: 400 });
  }

  // Test the connection
  if (provider === 'cal_com') {
    try {
      const testResponse = await fetch('https://api.cal.com/v1/me', {
        headers: { Authorization: `Bearer ${api_key}` },
      });
      if (!testResponse.ok) {
        return NextResponse.json({ error: 'Invalid Cal.com API key' }, { status: 400 });
      }
    } catch (e) {
      return NextResponse.json({ error: 'Failed to verify Cal.com API key' }, { status: 400 });
    }
  }

  // Check if this is the first calendar (make it default)
  const { count } = await supabase
    .from('calendar_accounts')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', userTyped2.org_id);

  const isFirstCalendar = count === 0;

  const { data, error } = await supabase
    .from('calendar_accounts')
    .insert({
      org_id: userTyped2.org_id,
      user_id: userTyped2.id,
      provider,
      name,
      api_key_encrypted: api_key ? encrypt(api_key) : null,
      scheduling_url,
      event_type_id,
      default_duration_minutes: settings?.default_duration_minutes || 30,
      buffer_before_minutes: settings?.buffer_before_minutes || 0,
      buffer_after_minutes: settings?.buffer_after_minutes || 0,
      working_hours: settings?.working_hours,
      is_default: isFirstCalendar,
      is_active: true,
    } as never)
    .select(`
      id,
      provider,
      name,
      scheduling_url,
      is_active,
      is_default,
      created_at
    ` as never)
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Calendar already connected' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
