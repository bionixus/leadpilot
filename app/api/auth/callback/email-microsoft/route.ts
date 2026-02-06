import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/encryption';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin || 'http://localhost:3000';
  const redirectBase = `${baseUrl}/email-accounts`;

  if (!code) {
    return NextResponse.redirect(`${redirectBase}?error=no_code`);
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${baseUrl}/app`);

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.redirect(`${redirectBase}?error=no_org`);

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.redirect(`${redirectBase}?error=missing_config`);

  const redirectUri = `${baseUrl}/api/auth/callback/email-microsoft`;
  const tokenRes = await fetch('https://app.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error('Microsoft token exchange failed', err);
    return NextResponse.redirect(`${redirectBase}?error=token_exchange`);
  }
  const tokens = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  const access_token = tokens.access_token;
  const refresh_token = tokens.refresh_token;
  if (!access_token) return NextResponse.redirect(`${redirectBase}?error=no_tokens`);

  let email_address = '';
  try {
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (meRes.ok) {
      const me = (await meRes.json()) as { mail?: string; userPrincipalName?: string };
      email_address = (me.mail || me.userPrincipalName || '').trim();
    }
  } catch {
    // ignore
  }
  if (!email_address) email_address = `outlook-${user.id.slice(0, 8)}@placeholder.local`;

  try {
    const oauth_access_token_encrypted = encrypt(access_token);
    const oauth_refresh_token_encrypted = refresh_token ? encrypt(refresh_token) : null;
    const expires_at = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const insertRow = {
      org_id: orgId,
      user_id: user.id,
      email_address,
      display_name: null,
      provider: 'outlook',
      oauth_access_token_encrypted,
      oauth_refresh_token_encrypted,
      oauth_token_expires_at: expires_at,
      connection_status: 'connected',
      imap_host: null,
      imap_port: 993,
      imap_secure: true,
      smtp_host: null,
      smtp_port: 587,
      smtp_secure: true,
      credentials_encrypted: null,
      daily_send_limit: 100,
      emails_sent_today: 0,
      warmup_enabled: false,
      warmup_day: 0,
      is_active: true,
    };
    const { error } = await supabase.from('email_accounts').insert(insertRow as never);
    if (error) {
      if (error.code === '23505') {
        const updateRow = {
          oauth_access_token_encrypted: encrypt(access_token),
          oauth_refresh_token_encrypted: refresh_token ? encrypt(refresh_token) : null,
          oauth_token_expires_at: expires_at,
          connection_status: 'connected',
          last_error: null,
          updated_at: new Date().toISOString(),
        };
        await supabase
          .from('email_accounts')
          .update(updateRow as never)
          .eq('org_id', orgId)
          .eq('email_address', email_address);
      } else {
        console.error('Insert email_account failed', error);
        return NextResponse.redirect(`${redirectBase}?error=insert`);
      }
    }
  } catch (e) {
    console.error('Encrypt or insert failed', e);
    return NextResponse.redirect(`${redirectBase}?error=encrypt`);
  }

  return NextResponse.redirect(`${redirectBase}?connected=1`);
}
