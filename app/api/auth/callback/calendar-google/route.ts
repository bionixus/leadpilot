import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { encrypt } from '@/lib/encryption';
import { GoogleCalendarProvider } from '@/lib/calendar/google';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${origin}/settings/calendar?error=${error}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/settings/calendar?error=no_code`);
  }

  try {
    // Exchange code for tokens
    const tokens = await GoogleCalendarProvider.exchangeCode(code);

    // Get user info
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.redirect(`${origin}/login`);
    }

    const { data: userData } = await supabase
      .from('users')
      .select('org_id, id, email')
      .eq('auth_id', user.id)
      .single();

    const userDataTyped = userData as { org_id?: string | null; id?: string; email?: string } | null;

    if (!userDataTyped?.org_id) {
      return NextResponse.redirect(`${origin}/settings/calendar?error=no_org`);
    }

    // Get user's email from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const googleUser = await userInfoResponse.json();

    // Check if this is the first calendar
    const { count } = await supabase
      .from('calendar_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', userDataTyped.org_id);

    const isFirstCalendar = count === 0;

    // Create calendar account
    const { error: insertError } = await supabase
      .from('calendar_accounts')
      .insert({
        org_id: userDataTyped.org_id,
        user_id: userDataTyped.id,
        provider: 'google',
        name: `Google Calendar (${googleUser.email})`,
        email: googleUser.email,
        access_token_encrypted: encrypt(tokens.access_token),
        refresh_token_encrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        token_expires_at: tokens.expiry_date 
          ? new Date(tokens.expiry_date).toISOString() 
          : null,
        calendar_id: 'primary',
        is_default: isFirstCalendar,
        is_active: true,
      } as never)
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        // Already connected
        return NextResponse.redirect(`${origin}/settings/calendar?error=already_connected`);
      }
      throw insertError;
    }

    return NextResponse.redirect(`${origin}/settings/calendar?success=google_connected`);
  } catch (err: any) {
    console.error('Google Calendar OAuth error:', err);
    return NextResponse.redirect(`${origin}/settings/calendar?error=${encodeURIComponent(err.message)}`);
  }
}
