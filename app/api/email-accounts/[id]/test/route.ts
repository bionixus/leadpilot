import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { decrypt } from '@/lib/encryption';
import nodemailer from 'nodemailer';

type AccountRow = {
  id: string;
  org_id: string;
  provider: string;
  email_address: string;
  oauth_access_token_encrypted: string | null;
  oauth_refresh_token_encrypted: string | null;
  oauth_token_expires_at: string | null;
  credentials_encrypted: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_secure: boolean | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
};

async function setConnectionStatus(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  id: string,
  status: 'connected' | 'error',
  lastError: string | null
) {
  await supabase
    .from('email_accounts')
    .update({ connection_status: status, last_error: lastError } as never)
    .eq('id', id);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const { data: account, error: fetchError } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .single();

  if (fetchError || !account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const row = account as unknown as AccountRow;

  try {
    if (row.provider === 'gmail' || row.provider === 'outlook') {
      let accessToken: string;
      const refreshEnc = row.oauth_refresh_token_encrypted;
      const accessEnc = row.oauth_access_token_encrypted;
      const expiresAt = row.oauth_token_expires_at;

      if (!accessEnc && !refreshEnc) {
        await setConnectionStatus(supabase, id, 'error', 'No tokens stored');
        return NextResponse.json({ ok: false, error: 'No tokens stored' });
      }

      if (accessEnc) {
        try {
          accessToken = decrypt(accessEnc);
        } catch {
          accessToken = '';
        }
      } else {
        accessToken = '';
      }

      const now = new Date();
      const expired = expiresAt ? new Date(expiresAt) <= new Date(now.getTime() + 60_000) : true;

      if ((!accessToken || expired) && refreshEnc) {
        const refreshToken = decrypt(refreshEnc);
        const clientId =
          row.provider === 'gmail'
            ? process.env.GOOGLE_CLIENT_ID
            : process.env.MICROSOFT_CLIENT_ID;
        const clientSecret =
          row.provider === 'gmail'
            ? process.env.GOOGLE_CLIENT_SECRET
            : process.env.MICROSOFT_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          await setConnectionStatus(supabase, id, 'error', 'OAuth not configured');
          return NextResponse.json({ ok: false, error: 'OAuth not configured' });
        }

        if (row.provider === 'gmail') {
          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: refreshToken,
              grant_type: 'refresh_token',
            }),
          });
          if (!tokenRes.ok) {
            const errText = await tokenRes.text();
            await setConnectionStatus(supabase, id, 'error', 'Token refresh failed');
            return NextResponse.json({ ok: false, error: 'Token refresh failed' });
          }
          const tokens = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
          accessToken = tokens.access_token ?? '';
          if (accessToken && typeof tokens.expires_in === 'number') {
            const d = new Date();
            d.setSeconds(d.getSeconds() + tokens.expires_in);
            const { encrypt } = await import('@/lib/encryption');
            await supabase
              .from('email_accounts')
              .update({
                oauth_access_token_encrypted: encrypt(accessToken),
                oauth_token_expires_at: d.toISOString(),
              } as never)
              .eq('id', id);
          }
        } else {
          const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: refreshToken,
              grant_type: 'refresh_token',
            }),
          });
          if (!tokenRes.ok) {
            await setConnectionStatus(supabase, id, 'error', 'Token refresh failed');
            return NextResponse.json({ ok: false, error: 'Token refresh failed' });
          }
          const tokens = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
          accessToken = tokens.access_token ?? '';
          if (accessToken && typeof tokens.expires_in === 'number') {
            const d = new Date();
            d.setSeconds(d.getSeconds() + tokens.expires_in);
            const { encrypt } = await import('@/lib/encryption');
            await supabase
              .from('email_accounts')
              .update({
                oauth_access_token_encrypted: encrypt(accessToken),
                oauth_token_expires_at: d.toISOString(),
              } as never)
              .eq('id', id);
          }
        }
      }

      if (!accessToken) {
        await setConnectionStatus(supabase, id, 'error', 'No valid access token');
        return NextResponse.json({ ok: false, error: 'No valid access token' });
      }

      if (row.provider === 'gmail') {
        const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!profileRes.ok) {
          await setConnectionStatus(supabase, id, 'error', 'Gmail API check failed');
          return NextResponse.json({ ok: false, error: 'Gmail API check failed' });
        }
      } else {
        const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!meRes.ok) {
          await setConnectionStatus(supabase, id, 'error', 'Microsoft Graph check failed');
          return NextResponse.json({ ok: false, error: 'Microsoft Graph check failed' });
        }
      }

      await setConnectionStatus(supabase, id, 'connected', null);
      return NextResponse.json({ ok: true });
    }

    if (row.provider === 'custom') {
      const credEnc = row.credentials_encrypted;
      const smtpHost = row.smtp_host;
      const smtpPort = row.smtp_port ?? 587;
      const smtpSecure = row.smtp_secure !== false;
      if (!credEnc || !smtpHost) {
        await setConnectionStatus(supabase, id, 'error', 'Missing credentials or SMTP host');
        return NextResponse.json({ ok: false, error: 'Missing credentials or SMTP host' });
      }
      const cred = JSON.parse(decrypt(credEnc)) as { username: string; password: string };
      const transport = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: cred.username, pass: cred.password },
      });
      await transport.verify();
      await setConnectionStatus(supabase, id, 'connected', null);
      return NextResponse.json({ ok: true });
    }

    await setConnectionStatus(supabase, id, 'error', 'Unknown provider');
    return NextResponse.json({ ok: false, error: 'Unknown provider' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection test failed';
    await setConnectionStatus(supabase, id, 'error', message);
    return NextResponse.json({ ok: false, error: message });
  }
}
