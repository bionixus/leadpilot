# Phase 1: Foundation

> **Objective**: Set up authentication, database, and core layout.

---

## 1.1 Prerequisites Checklist

Before starting:
- [ ] Supabase project created at https://supabase.com
- [ ] Node.js 18+ installed
- [ ] npm/pnpm installed
- [ ] Get Supabase URL, Anon Key, and Service Role Key

---

## 1.2 Database Setup

### Step 1: Run the migration

Copy the complete schema from `docs/BUILD_INSTRUCTIONS.md` section 1.2 into:
```
supabase/migrations/001_complete_schema.sql
```

Then run:
```bash
npx supabase db push
```

Or apply directly in Supabase SQL Editor.

### Step 2: Verify tables created

Check these tables exist:
- organizations
- users
- sequence_templates
- autopilot_sessions
- email_accounts
- messaging_accounts
- campaigns
- leads
- sequences
- messages
- inbox_messages
- notifications
- scraping_jobs

---

## 1.3 Environment Variables

### Step 1: Create `.env.local`

Copy from `.env.example` and fill in:

```env
# Required for Phase 1
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Optional but recommended
ENCRYPTION_KEY=  # Run: openssl rand -base64 32
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 1.4 Supabase Client Setup

### File: `src/lib/supabase/server.ts`

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore in Server Components
          }
        },
      },
    }
  );
}

// Admin client for service role operations
export async function createServiceSupabaseClient() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

### File: `src/lib/supabase/client.ts`

```typescript
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

export function createClientSupabaseClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### File: `src/lib/supabase/middleware.ts`

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect dashboard routes
  if (!user && request.nextUrl.pathname.startsWith('/(dashboard)')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Redirect logged in users away from auth pages
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

### File: `middleware.ts` (root)

```typescript
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

---

## 1.5 TypeScript Types

### File: `src/types/database.ts`

Generate from Supabase:
```bash
npx supabase gen types typescript --local > src/types/database.ts
```

Or manually create interface matching your schema:

```typescript
export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          business_context: Record<string, any>;
          llm_provider: string;
          llm_api_key_encrypted: string | null;
          llm_settings: Record<string, any>;
          settings: Record<string, any>;
          subscription_tier: string;
          subscription_status: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['organizations']['Row']>;
        Update: Partial<Database['public']['Tables']['organizations']['Row']>;
      };
      // ... add other tables as needed
    };
  };
};
```

---

## 1.6 Auth Routes

### File: `app/api/auth/callback/route.ts`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && user) {
      // Check if user exists in our users table
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, org_id')
        .eq('auth_id', user.id)
        .single();

      if (!existingUser) {
        // First time user - create organization and user record
        const orgName = user.user_metadata?.full_name
          ? `${user.user_metadata.full_name}'s Organization`
          : 'My Organization';

        const slug = orgName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);

        // Create organization
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: orgName,
            slug,
          })
          .select()
          .single();

        if (orgError) {
          console.error('Error creating org:', orgError);
          return NextResponse.redirect(`${origin}/login?error=org_creation_failed`);
        }

        // Create user
        const { error: userError } = await supabase.from('users').insert({
          org_id: org.id,
          auth_id: user.id,
          email: user.email!,
          full_name: user.user_metadata?.full_name || null,
          avatar_url: user.user_metadata?.avatar_url || null,
          role: 'owner',
        });

        if (userError) {
          console.error('Error creating user:', userError);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth failed
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
```

### File: `app/api/auth/signout/route.ts`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/login`);
}
```

---

## 1.7 Auth Pages

### File: `app/(auth)/layout.tsx`

```typescript
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {children}
    </div>
  );
}
```

### File: `app/(auth)/login/page.tsx`

```typescript
'use client';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const supabase = createClientSupabaseClient();

  useEffect(() => {
    // Check for error in URL
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError('Authentication failed. Please try again.');
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/');
      router.refresh();
    }
  };

  const handleOAuth = async (provider: 'google' | 'azure') => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {/* Logo */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">LeadPilot</h1>
            <p className="text-gray-500 mt-2">Sign in to your account</p>
          </div>

          {/* OAuth Buttons */}
          <div className="space-y-3 mb-6">
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <button
              type="button"
              onClick={() => handleOAuth('azure')}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 23 23">
                <path fill="#f35325" d="M1 1h10v10H1z"/>
                <path fill="#81bc06" d="M12 1h10v10H12z"/>
                <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                <path fill="#ffba08" d="M12 12h10v10H12z"/>
              </svg>
              Continue with Microsoft
            </button>
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500">or continue with email</span>
            </div>
          </div>

          {/* Email Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder="you@company.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <Link href="/signup" className="text-blue-600 hover:underline font-medium">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
```

### File: `app/(auth)/signup/page.tsx`

```typescript
'use client';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  
  const supabase = createClientSupabaseClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Check your email</h2>
          <p className="text-gray-500">
            We've sent a confirmation link to <strong>{email}</strong>. Click the link to activate your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">LeadPilot</h1>
          <p className="text-gray-500 mt-2">Create your account</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              placeholder="John Doe"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              placeholder="you@company.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              placeholder="Min. 8 characters"
              minLength={8}
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
```

---

## 1.8 Dashboard Layout

### File: `app/(dashboard)/layout.tsx`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  
  // Get user data with org
  const { data: userData } = await supabase
    .from('users')
    .select('*, organizations(*)')
    .eq('auth_id', user.id)
    .single();
  
  if (!userData) redirect('/login');

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={userData} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={userData} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

### File: `src/components/layout/sidebar.tsx`

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Mail,
  InboxIcon,
  Settings,
  BarChart3,
  FileText,
  Zap,
  Phone,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Autopilot', href: '/autopilot', icon: Zap },
  { name: 'Campaigns', href: '/campaigns', icon: FileText },
  { name: 'Leads', href: '/leads', icon: Users },
  { name: 'Sequences', href: '/sequences', icon: MessageSquare },
  { name: 'Templates', href: '/templates', icon: FileText },
  { name: 'Inbox', href: '/inbox', icon: InboxIcon },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { divider: true },
  { name: 'Email Accounts', href: '/email-accounts', icon: Mail },
  { name: 'Messaging', href: '/messaging', icon: Phone },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar({ user }: { user: any }) {
  const pathname = usePathname();

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-gray-200">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl">LeadPilot</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item, idx) =>
          item.divider ? (
            <div key={idx} className="h-px bg-gray-200 my-3" />
          ) : (
            <Link
              key={item.name}
              href={item.href!}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === item.href
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          )
        )}
      </nav>

      {/* Organization */}
      <div className="p-4 border-t border-gray-200">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Organization</div>
        <div className="font-medium text-sm truncate">{user.organizations?.name}</div>
        <div className="text-xs text-gray-500 capitalize">{user.organizations?.subscription_tier} plan</div>
      </div>
    </div>
  );
}
```

### File: `src/components/layout/header.tsx`

```typescript
'use client';

import { Bell, Search, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function Header({ user }: { user: any }) {
  const router = useRouter();

  const handleSignout = async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* Search */}
      <div className="flex items-center gap-2 w-96">
        <Search className="w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search..."
          className="flex-1 bg-transparent border-none focus:outline-none text-sm"
        />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* User menu */}
        <div className="relative group">
          <button className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-blue-700 font-medium text-sm">
                {user.full_name?.[0] || user.email[0].toUpperCase()}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-500" />
          </button>

          <div className="absolute right-0 top-full mt-1 w-48 bg-white border rounded-lg shadow-lg py-1 hidden group-hover:block z-50">
            <div className="px-3 py-2 border-b">
              <div className="font-medium text-sm">{user.full_name || 'User'}</div>
              <div className="text-xs text-gray-500">{user.email}</div>
            </div>
            <Link href="/settings" className="block px-3 py-2 text-sm hover:bg-gray-50">
              Settings
            </Link>
            <button
              onClick={handleSignout}
              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

import Link from 'next/link';
```

---

## 1.9 Dashboard Home Page

### File: `app/(dashboard)/page.tsx`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Link from 'next/link';
import {
  Users,
  Mail,
  TrendingUp,
  MessageSquare,
  Plus,
  ArrowRight,
} from 'lucide-react';

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user!.id)
    .single();

  // Get stats
  const [
    { count: totalLeads },
    { count: activeCampaigns },
    { count: totalMessages },
    { count: replies },
  ] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('org_id', userData!.org_id),
    supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('org_id', userData!.org_id).eq('status', 'active'),
    supabase.from('messages').select('*', { count: 'exact', head: true }).eq('org_id', userData!.org_id).eq('status', 'sent'),
    supabase.from('inbox_messages').select('*', { count: 'exact', head: true }).eq('org_id', userData!.org_id).eq('direction', 'inbound'),
  ]);

  // Get recent campaigns
  const { data: recentCampaigns } = await supabase
    .from('campaigns')
    .select('*')
    .eq('org_id', userData!.org_id)
    .order('created_at', { ascending: false })
    .limit(5);

  const stats = [
    { name: 'Total Leads', value: totalLeads || 0, icon: Users, color: 'blue' },
    { name: 'Active Campaigns', value: activeCampaigns || 0, icon: TrendingUp, color: 'green' },
    { name: 'Messages Sent', value: totalMessages || 0, icon: Mail, color: 'purple' },
    { name: 'Replies', value: replies || 0, icon: MessageSquare, color: 'orange' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Overview of your outreach performance</p>
        </div>
        <Link
          href="/autopilot"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Start Autopilot
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2 rounded-lg bg-${stat.color}-100`}>
                <stat.icon className={`w-5 h-5 text-${stat.color}-600`} />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{stat.value.toLocaleString()}</div>
            <div className="text-sm text-gray-500">{stat.name}</div>
          </div>
        ))}
      </div>

      {/* Recent Campaigns */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Campaigns</h2>
          <Link href="/campaigns" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        {recentCampaigns && recentCampaigns.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {recentCampaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className="px-6 py-4 flex items-center justify-between hover:bg-gray-50"
              >
                <div>
                  <div className="font-medium text-gray-900">{campaign.name}</div>
                  <div className="text-sm text-gray-500">
                    {new Date(campaign.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    campaign.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : campaign.status === 'draft'
                      ? 'bg-gray-100 text-gray-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {campaign.status}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="font-medium text-gray-900 mb-1">No campaigns yet</h3>
            <p className="text-gray-500 text-sm mb-4">
              Start your first campaign with Autopilot
            </p>
            <Link
              href="/autopilot"
              className="inline-flex items-center gap-2 text-blue-600 hover:underline"
            >
              Get started <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 1.10 Verification Checklist

After completing Phase 1, verify:

- [ ] Can run `npm run dev` without errors
- [ ] Login page loads at `/login`
- [ ] OAuth buttons redirect to Google/Microsoft
- [ ] Email/password login works
- [ ] New users get org + user record created
- [ ] Dashboard loads after login
- [ ] Sidebar navigation works
- [ ] User can sign out
- [ ] Protected routes redirect to login when not authenticated

---

## Next Steps

Once Phase 1 is complete and verified, proceed to:
- **Phase 2**: Multi-LLM System (`docs/phases/PHASE_2_LLM.md`)
