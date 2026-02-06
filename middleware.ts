import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

// Auth routes - redirect to dashboard if already logged in
const authRoutes = ['/login', '/signup'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // IMPORTANT: Allow root path (/) immediately - no auth check needed for marketing page
  if (pathname === '/') {
    return NextResponse.next();
  }
  
  // Allow other public auth-related routes without requiring login
  if (pathname === '/forgot-password' || pathname === '/reset-password') {
    return NextResponse.next();
  }

  // Create response for routes that need session handling
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Check if Supabase is configured
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    // Supabase not configured, allow all requests
    return response;
  }

  try {
    // Create Supabase client
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
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

    // For all other routes (protected), redirect to login if not authenticated
    if (!user) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    return response;
  } catch {
    // On any error, allow the request to proceed
    // The page-level auth checks will handle it
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     * - api routes
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api).*)',
  ],
};
