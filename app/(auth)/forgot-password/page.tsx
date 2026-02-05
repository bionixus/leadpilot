import { redirect } from 'next/navigation';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = { title: 'Forgot Password | LeadPilot' };

export default async function ForgotPasswordPage() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect('/');
  } catch {
    // Supabase not configured
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl border shadow-sm p-6">
        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to login
        </Link>
        <h1 className="text-xl font-bold mb-2">Reset your password</h1>
        <p className="text-gray-500 text-sm mb-6">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
