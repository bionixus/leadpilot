import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { ensureUserAndOrg } from '@/lib/supabase/ensure-user-org';

/**
 * OAuth / code flow callback. Exchange code for session, ensure user+org exist, redirect to app.
 * Configure in Supabase: Redirect URLs = http://localhost:3000/api/auth/callback (and prod URL).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  const baseUrl = request.nextUrl.origin;
  const loginUrl = new URL('/login', baseUrl);
  const redirectUrl = new URL(next, baseUrl);

  if (!code) {
    return NextResponse.redirect(loginUrl);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.redirect(loginUrl);

  const response = NextResponse.redirect(redirectUrl);
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !user) {
    return NextResponse.redirect(loginUrl);
  }

  try {
    const admin = createSupabaseAdminClient();
    const result = await ensureUserAndOrg(admin, user);
    if ('error' in result) {
      console.error('Callback ensureUserAndOrg:', result.error);
    }
  } catch (e) {
    console.error('Callback ensureUserAndOrg error:', e);
  }

  return response;
}
