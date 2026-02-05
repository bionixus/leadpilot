'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);

  const _supabase = createBrowserSupabaseClient();
  if (!_supabase) return null;
  const supabase = _supabase;

  useEffect(() => {
    // Check if we have a valid session from the reset link
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsValidSession(!!session);
    };
    checkSession();

    // Listen for auth state changes (when user clicks the reset link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsValidSession(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      setSuccess(true);
      // Sign out and redirect to login after a delay
      setTimeout(async () => {
        await supabase.auth.signOut();
        router.push('/login?reset=success');
      }, 2000);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Still checking session
  if (isValidSession === null) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-sm text-gray-500 mt-4">Verifying reset link...</p>
      </div>
    );
  }

  // Invalid or expired link
  if (!isValidSession) {
    return (
      <div className="text-center py-4">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6 text-red-600" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Invalid or expired link</h2>
        <p className="text-gray-500 text-sm mb-6">
          This password reset link is invalid or has expired. Please request a new one.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block bg-primary text-primary-foreground py-2 px-4 rounded-lg font-medium hover:bg-primary/90"
        >
          Request new link
        </Link>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="text-center py-4">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-6 h-6 text-green-600" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Password updated!</h2>
        <p className="text-gray-500 text-sm mb-4">
          Your password has been reset successfully. Redirecting to login...
        </p>
      </div>
    );
  }

  const passwordStrength = getPasswordStrength(password);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          New password
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {password && (
          <div className="mt-2">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  className={`h-1 flex-1 rounded ${
                    level <= passwordStrength.level
                      ? passwordStrength.color
                      : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <p className={`text-xs mt-1 ${passwordStrength.textColor}`}>
              {passwordStrength.text}
            </p>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
          Confirm new password
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="••••••••"
          />
        </div>
        {confirmPassword && password !== confirmPassword && (
          <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || password.length < 8 || password !== confirmPassword}
        className="w-full bg-primary text-primary-foreground py-2 px-4 rounded-lg font-medium hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
      >
        {loading ? 'Updating...' : 'Update password'}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Minimum 8 characters required
      </p>
    </form>
  );
}

function getPasswordStrength(password: string): {
  level: number;
  text: string;
  color: string;
  textColor: string;
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 1, text: 'Weak', color: 'bg-red-500', textColor: 'text-red-500' };
  if (score === 2) return { level: 2, text: 'Fair', color: 'bg-yellow-500', textColor: 'text-yellow-600' };
  if (score === 3) return { level: 3, text: 'Good', color: 'bg-blue-500', textColor: 'text-blue-500' };
  return { level: 4, text: 'Strong', color: 'bg-green-500', textColor: 'text-green-500' };
}
