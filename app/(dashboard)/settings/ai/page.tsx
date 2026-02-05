import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LLMSettingsForm } from './LLMSettingsForm';
import { CreditCard, Building2, Bot } from 'lucide-react';

export const metadata = { title: 'AI Settings | LeadPilot' };

export default async function AISettingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userRow } = await supabase
    .from('users')
    .select('org_id, role')
    .eq('auth_id', user.id)
    .single();

  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  const userRole = (userRow as { role?: string } | null)?.role;

  if (!orgId) redirect('/');

  // Only owners and admins can access AI settings
  if (!['owner', 'admin'].includes(userRole || '')) {
    redirect('/settings');
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">AI Settings</h1>
      <p className="text-gray-500 mb-6">Configure your AI provider and API keys for sequence generation.</p>

      {/* Settings Navigation */}
      <div className="flex gap-2 mb-6 border-b pb-4">
        <Link
          href="/settings"
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
        >
          <Building2 className="w-4 h-4" />
          Organization
        </Link>
        <Link
          href="/settings/ai"
          className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium"
        >
          <Bot className="w-4 h-4" />
          AI Provider
        </Link>
        <Link
          href="/settings/billing"
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
        >
          <CreditCard className="w-4 h-4" />
          Billing
        </Link>
      </div>

      <LLMSettingsForm />
    </div>
  );
}
