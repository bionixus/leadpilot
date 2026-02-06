'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Mail, CheckCircle } from 'lucide-react';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const _supabase = createBrowserSupabaseClient();
  if (!_supabase) return null;
  const supabase = _supabase;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Use NEXT_PUBLIC_SITE_URL if set, otherwise fall back to window.location.origin
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
        (typeof window !== 'undefined' ? window.location.origin : '');
      const redirectUrl = `${baseUrl}/reset-password`;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (resetError) {
        setError(resetError.message);
        setLoading(false);
        return;
      }

      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center py-4">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-6 h-6 text-green-600" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Check your email</h2>
        <p className="text-gray-500 text-sm mb-4">
          We&apos;ve sent a password reset link to <strong>{email}</strong>
        </p>
        <p className="text-gray-400 text-xs mb-6">
          Didn&apos;t receive the email? Check your spam folder or{' '}
          <button
            onClick={() => setSent(false)}
            className="text-primary hover:underline"
          >
            try again
          </button>
        </p>
        <Link
          href="/app"
          className="text-sm text-primary hover:underline font-medium"
        >
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email address
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="you@example.com"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !email}
        className="w-full bg-primary text-primary-foreground py-2 px-4 rounded-lg font-medium hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
      >
        {loading ? 'Sending...' : 'Send reset link'}
      </button>

      <p className="text-xs text-gray-400 text-center pt-2">
        Remember your password?{' '}
        <Link href="/app" className="text-primary hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </form>
  );
}
