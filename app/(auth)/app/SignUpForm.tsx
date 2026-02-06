'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export function SignUpForm() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const _supabase = createBrowserSupabaseClient();
  if (!_supabase) return null;
  const supabase = _supabase;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') || undefined;
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, first_name: firstName.trim(), last_name: lastName.trim() } },
      });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      if (data.user && !data.session) {
        setEmailSent(true);
        setLoading(false);
        return;
      }
      if (data.session) {
        const res = await fetch('/api/auth/onboard', { method: 'POST' });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError((j as { error?: string }).error ?? 'Account created. Please sign in.');
          setLoading(false);
          return;
        }
        router.refresh();
        router.push('/campaigns');
        return;
      }
      setEmailSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (emailSent) {
    return (
      <div className="text-center space-y-2">
        <p className="text-sm text-gray-600">
          Check your email for a confirmation link to activate your account.
        </p>
        <p className="text-xs text-gray-400">
          Already confirmed? <Link href="/app" className="text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="signup-firstname" className="block text-sm font-medium text-gray-700 mb-1">
            First name
          </label>
          <input
            id="signup-firstname"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            autoComplete="given-name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="Jane"
          />
        </div>
        <div>
          <label htmlFor="signup-lastname" className="block text-sm font-medium text-gray-700 mb-1">
            Last name
          </label>
          <input
            id="signup-lastname"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            autoComplete="family-name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="Doe"
          />
        </div>
      </div>
      <div>
        <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          id="signup-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          id="signup-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          placeholder="At least 6 characters"
        />
      </div>
      <div>
        <label htmlFor="signup-confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
          Confirm password
        </label>
        <input
          id="signup-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          placeholder="Repeat your password"
        />
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary text-primary-foreground py-2 px-4 rounded-lg font-medium hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
      >
        {loading ? 'Creating account…' : 'Create account'}
      </button>
      <p className="text-xs text-gray-400 text-center">
        Already have an account? <Link href="/app" className="text-primary hover:underline">Sign in</Link>
      </p>
    </form>
  );
}
