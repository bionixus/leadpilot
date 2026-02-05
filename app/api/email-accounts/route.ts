import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { encrypt } from '@/lib/encryption';
import { canAddEmailAccount } from '@/lib/stripe/limits';

const SAFE_SELECT = 'id, org_id, user_id, email_address, display_name, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, daily_send_limit, emails_sent_today, warmup_enabled, warmup_day, is_active, connection_status, last_error, last_synced_at, created_at, updated_at';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const { data, error } = await supabase
    .from('email_accounts')
    .select(SAFE_SELECT)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 403 });

  // Check subscription limits
  const limitCheck = await canAddEmailAccount(orgId);
  if (!limitCheck.allowed) {
    return NextResponse.json({ error: limitCheck.reason }, { status: 403 });
  }

  const body = await request.json() as Record<string, unknown>;

  const provider = body.provider as 'gmail' | 'outlook' | 'custom' | undefined;
  if (!provider || !['gmail', 'outlook', 'custom'].includes(provider)) {
    return NextResponse.json({ error: 'Invalid or missing provider' }, { status: 400 });
  }

  const email_address = body.email_address as string | undefined;
  if (!email_address?.trim()) return NextResponse.json({ error: 'email_address required' }, { status: 400 });

  const insert: Record<string, unknown> = {
    org_id: orgId,
    user_id: body.user_id ?? null,
    email_address: email_address.trim(),
    display_name: (body.display_name as string)?.trim() || null,
    provider,
    connection_status: 'pending',
    daily_send_limit: typeof body.daily_send_limit === 'number' ? body.daily_send_limit : 100,
    emails_sent_today: 0,
    warmup_enabled: false,
    warmup_day: 0,
    is_active: true,
    imap_port: 993,
    imap_secure: true,
    smtp_port: 587,
    smtp_secure: true,
  };

  if (provider === 'gmail' || provider === 'outlook') {
    const access_token = body.access_token as string | undefined;
    const refresh_token = body.refresh_token as string | undefined;
    if (!access_token && !refresh_token) return NextResponse.json({ error: 'OAuth tokens required' }, { status: 400 });
    try {
      if (access_token) insert.oauth_access_token_encrypted = encrypt(access_token);
      if (refresh_token) insert.oauth_refresh_token_encrypted = encrypt(refresh_token);
    } catch (e) {
      return NextResponse.json({ error: 'Encryption failed. Is ENCRYPTION_KEY set?' }, { status: 500 });
    }
    const expires_in = body.expires_in as number | undefined;
    if (typeof expires_in === 'number') {
      const d = new Date();
      d.setSeconds(d.getSeconds() + expires_in);
      insert.oauth_token_expires_at = d.toISOString();
    }
    insert.imap_host = null;
    insert.smtp_host = null;
    insert.credentials_encrypted = null;
  } else {
    const username = (body.username as string)?.trim();
    const password = body.password as string;
    if (!username || password == null) return NextResponse.json({ error: 'username and password required for custom' }, { status: 400 });
    try {
      insert.credentials_encrypted = encrypt(JSON.stringify({ username, password }));
    } catch (e) {
      return NextResponse.json({ error: 'Encryption failed. Is ENCRYPTION_KEY set?' }, { status: 500 });
    }
    insert.oauth_access_token_encrypted = null;
    insert.oauth_refresh_token_encrypted = null;
    insert.oauth_token_expires_at = null;
    insert.imap_host = (body.imap_host as string)?.trim() || null;
    insert.imap_port = typeof body.imap_port === 'number' ? body.imap_port : 993;
    insert.imap_secure = body.imap_secure !== false;
    insert.smtp_host = (body.smtp_host as string)?.trim() || null;
    insert.smtp_port = typeof body.smtp_port === 'number' ? body.smtp_port : 587;
    insert.smtp_secure = body.smtp_secure !== false;
  }

  const { data, error } = await supabase
    .from('email_accounts')
    .insert(insert as never)
    .select(SAFE_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
