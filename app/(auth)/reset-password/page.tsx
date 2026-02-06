import { ResetPasswordForm } from './ResetPasswordForm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = { title: 'Reset Password | LeadPilot' };

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl border shadow-sm p-6">
        <Link
          href="/app"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to login
        </Link>
        <h1 className="text-xl font-bold mb-2">Set new password</h1>
        <p className="text-gray-500 text-sm mb-6">
          Enter your new password below.
        </p>
        <ResetPasswordForm />
      </div>
    </div>
  );
}
