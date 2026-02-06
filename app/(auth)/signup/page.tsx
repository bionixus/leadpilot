import { redirect } from 'next/navigation';
import { SignUpForm } from '../app/SignUpForm';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const metadata = { title: 'Sign up | LeadPilot' };

const hasSupabase =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === 'string' &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === 'string' &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

export default async function SignUpPage() {
  if (hasSupabase) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) redirect('/campaigns');
    } catch {
      // Supabase not configured
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl border shadow-sm p-6">
        <h1 className="text-xl font-bold text-center mb-2">LeadPilot</h1>
        <p className="text-gray-500 text-center text-sm mb-6">
          Create your account to get started.
        </p>
        {hasSupabase ? (
          <SignUpForm />
        ) : (
          <p className="text-center text-sm text-gray-400">
            Add <code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{' '}
            <code className="bg-gray-100 px-1 rounded">.env.local</code> to enable sign up.
          </p>
        )}
      </div>
    </div>
  );
}
