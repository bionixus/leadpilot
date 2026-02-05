import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { encrypt } from '@/lib/encryption';
import { testTwilioConnection } from '@/lib/messaging/twilio';

// GET - List messaging accounts
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const orgId = (userData as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  const { data, error } = await supabase
    .from('messaging_accounts')
    .select(
      `
      id,
      provider,
      channel,
      phone_number,
      display_name,
      daily_limit,
      messages_sent_today,
      is_active,
      connection_status,
      last_error,
      created_at
    `
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST - Create new messaging account
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase
    .from('users')
    .select('org_id, id')
    .eq('auth_id', user.id)
    .single();

  const orgId = (userData as { org_id?: string | null } | null)?.org_id;
  const userId = (userData as { id?: string } | null)?.id;

  if (!orgId) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 });
  }

  const body = await request.json();
  const {
    provider = 'twilio',
    channel,
    phone_number,
    display_name,
    account_sid,
    auth_token,
    daily_limit = 100,
  } = body;

  // Validate required fields
  if (!channel || !phone_number || !account_sid || !auth_token) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Test connection
  const testResult = await testTwilioConnection(account_sid, auth_token);
  if (!testResult.success) {
    return NextResponse.json(
      { error: `Connection test failed: ${testResult.error}` },
      { status: 400 }
    );
  }

  // Encrypt credentials
  const encryptedSid = encrypt(account_sid);
  const encryptedToken = encrypt(auth_token);

  // Create account
  const { data, error } = await supabase
    .from('messaging_accounts')
    .insert({
      org_id: orgId,
      user_id: userId,
      provider,
      channel,
      phone_number,
      display_name: display_name || phone_number,
      account_sid_encrypted: encryptedSid,
      auth_token_encrypted: encryptedToken,
      daily_limit,
      connection_status: 'connected',
      is_active: true,
    } as never)
    .select(
      `
      id,
      provider,
      channel,
      phone_number,
      display_name,
      daily_limit,
      is_active,
      connection_status,
      created_at
    `
    )
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'This phone number is already connected' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
