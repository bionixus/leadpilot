import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Public routes that don't require authentication
const publicRoutes = ['/', '/login', '/signup', '/forgot-password', '/reset-password'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Skip middleware for public routes - allow them without any auth processing
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }
  
  // For all other routes, update the session
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     * - api routes that don't need auth
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/webhooks).*)',
  ],
};
