import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const MS_SCOPES = ['openid', 'email', 'profile', 'https://graph.microsoft.com/Mail.Read', 'https://graph.microsoft.com/Mail.Send', 'offline_access'].join(' ');

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/app', request.url));

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL('/email-accounts?error=missing_microsoft_config', request.url));

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin || 'http://localhost:3000';
  const redirectUri = `${baseUrl}/api/auth/callback/email-microsoft`;
  const state = Buffer.from(JSON.stringify({ type: 'email_connect', provider: 'microsoft' })).toString('base64url');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: MS_SCOPES,
    state,
  });

  const url = `https://app.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  return NextResponse.redirect(url);
}
