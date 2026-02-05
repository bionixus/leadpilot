import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import NewScrapingForm from './NewScrapingForm';

export const metadata = { title: 'New Scraping Job | LeadPilot' };

export default async function NewScrapingPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userRow } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) redirect('/login');

  // Fetch campaigns for the dropdown
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name')
    .eq('org_id', orgId)
    .order('name');

  const campaignList = (campaigns ?? []).map(c => ({
    id: (c as { id: string }).id,
    name: (c as { name: string }).name,
  }));

  return (
    <div className="p-6 max-w-2xl">
      <Link
        href="/scraping"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to scraping jobs
      </Link>

      <h1 className="text-2xl font-bold mb-2">New Scraping Job</h1>
      <p className="text-gray-500 mb-6">
        Import leads from LinkedIn, Apollo, or Google Maps using Apify scrapers.
      </p>

      <NewScrapingForm campaigns={campaignList} />
    </div>
  );
}
