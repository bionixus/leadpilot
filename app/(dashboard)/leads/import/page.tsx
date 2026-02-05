import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ImportLeadsForm } from './ImportLeadsForm';

export const metadata = { title: 'Import Leads | LeadPilot' };

export default async function ImportLeadsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) redirect('/');

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name')
    .eq('org_id', orgId)
    .order('name');

  const campaignList = (campaigns ?? []).map((c) => ({ id: (c as { id: string }).id, name: (c as { name: string }).name }));

  return (
    <div>
      <Link
        href="/leads"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to leads
      </Link>
      <h1 className="text-2xl font-bold mb-2">Import leads</h1>
      <p className="text-gray-500 mb-6">Upload a CSV file to import leads. Optionally assign them to a campaign.</p>
      <ImportLeadsForm campaigns={campaignList} />
    </div>
  );
}
