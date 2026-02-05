import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NewCampaignForm } from './NewCampaignForm';
import { ArrowLeft } from 'lucide-react';

export const metadata = { title: 'New Campaign | LeadPilot' };

export default async function NewCampaignPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userRow } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) redirect('/');

  const { data: emailAccounts } = await supabase
    .from('email_accounts')
    .select('id, email_address, display_name')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('email_address');

  const rows = (emailAccounts ?? []) as Array<{ id: string; email_address: string; display_name: string | null }>;
  const accounts = rows.map((a) => ({
    id: a.id,
    email_address: a.email_address,
    display_name: a.display_name ?? null,
  }));

  return (
    <div>
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to campaigns
      </Link>
      <h1 className="text-2xl font-bold mb-2">New Campaign</h1>
      <p className="text-gray-500 mb-6">Create a new outreach campaign and add leads.</p>
      <NewCampaignForm emailAccounts={accounts} />
    </div>
  );
}
