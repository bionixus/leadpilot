import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ScrapingJobsList from './ScrapingJobsList';
import Link from 'next/link';

export const metadata = { title: 'Scraping Jobs | LeadPilot' };

type JobRow = {
  id: string;
  job_type: string;
  status: string;
  campaign_id: string | null;
  results_count: number | null;
  leads_created: number | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type CampaignRow = {
  id: string;
  name: string;
};

export default async function ScrapingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
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

  const params = await searchParams;
  const statusFilter = typeof params.status === 'string' ? params.status : null;

  // Fetch scraping jobs
  let query = supabase
    .from('scraping_jobs')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data: jobsData } = await query;
  const jobs = (jobsData ?? []) as unknown as JobRow[];

  // Fetch campaigns for display
  const campaignIds = Array.from(new Set(jobs.filter(j => j.campaign_id).map(j => j.campaign_id!)));
  let campaignsMap = new Map<string, CampaignRow>();

  if (campaignIds.length > 0) {
    const { data: campaignsData } = await supabase
      .from('campaigns')
      .select('id, name')
      .in('id', campaignIds);

    campaignsMap = new Map(
      ((campaignsData ?? []) as unknown as CampaignRow[]).map(c => [c.id, c])
    );
  }

  // Fetch all campaigns for the new scraping form
  const { data: allCampaigns } = await supabase
    .from('campaigns')
    .select('id, name')
    .eq('org_id', orgId)
    .order('name');

  const campaignList = (allCampaigns ?? []).map(c => ({
    id: (c as { id: string }).id,
    name: (c as { name: string }).name,
  }));

  // Augment jobs with campaign names
  const jobItems = jobs.map(j => ({
    ...j,
    campaignName: j.campaign_id ? campaignsMap.get(j.campaign_id)?.name : null,
  }));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Scraping Jobs</h1>
          <p className="text-sm text-gray-500">
            Import leads from LinkedIn, Apollo, or Google Maps
          </p>
        </div>
        <Link
          href="/scraping/new"
          className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90"
        >
          New Scraping Job
        </Link>
      </div>

      <div className="flex gap-2 mb-4">
        <Link
          href="/scraping"
          className={`px-3 py-1.5 text-sm rounded-lg ${
            !statusFilter ? 'bg-gray-200 text-gray-800' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          All
        </Link>
        <Link
          href="/scraping?status=running"
          className={`px-3 py-1.5 text-sm rounded-lg ${
            statusFilter === 'running' ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Running
        </Link>
        <Link
          href="/scraping?status=completed"
          className={`px-3 py-1.5 text-sm rounded-lg ${
            statusFilter === 'completed' ? 'bg-green-100 text-green-800' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Completed
        </Link>
        <Link
          href="/scraping?status=failed"
          className={`px-3 py-1.5 text-sm rounded-lg ${
            statusFilter === 'failed' ? 'bg-red-100 text-red-800' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Failed
        </Link>
      </div>

      <ScrapingJobsList jobs={jobItems} campaigns={campaignList} />
    </div>
  );
}
