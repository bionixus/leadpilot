import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

// Auth routes - redirect to dashboard if already logged in
const authRoutes = ['/app', '/signup'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Create response
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Check if Supabase is configured
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    return response;
  }

  try {
    // Create Supabase client
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    // Get user session
    const { data: { user } } = await supabase.auth.getUser();

    // For auth routes (login, signup), redirect to dashboard if already logged in
    if (authRoutes.includes(pathname)) {
      if (user) {
        return NextResponse.redirect(new URL('/campaigns', request.url));
      }
      return response;
    }

    // For protected routes, redirect to login if not authenticated
    if (!user) {
      return NextResponse.redirect(new URL('/app', request.url));
    }

    return response;
  } catch {
    // On error, allow request - page-level auth will handle it
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match specific paths that need middleware processing.
     * Exclude: static files, api routes, and public pages.
     */
    '/campaigns/:path*',
    '/leads/:path*',
    '/inbox/:path*',
    '/sequences/:path*',
    '/email-accounts/:path*',
    '/settings/:path*',
    '/agent/:path*',
    '/autopilot/:path*',
    '/analytics/:path*',
    '/scraping/:path*',
    '/messaging/:path*',
    '/app',
    '/signup',
  ],
};
