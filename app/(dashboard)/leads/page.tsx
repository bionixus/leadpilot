import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LeadsList } from './LeadsList';
import type { LeadStatus } from '@/types/database';

const LIMIT = 20;

export const metadata = { title: 'Leads | LeadPilot' };

type SearchParams = Promise<{ campaign_id?: string; status?: string; search?: string; page?: string }>;

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) redirect('/');

  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const offset = (page - 1) * LIMIT;

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name')
    .eq('org_id', orgId)
    .order('name');

  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (params.campaign_id) query = query.eq('campaign_id', params.campaign_id);
  if (params.status) query = query.eq('status', params.status as LeadStatus);
  if (params.search?.trim()) {
    const term = `%${params.search.trim().replace(/%/g, '\\%')}%`;
    query = query.or(`email.ilike.${term},first_name.ilike.${term},last_name.ilike.${term},company.ilike.${term}`);
  }

  const { data: leads, error, count } = await query.range(offset, offset + LIMIT - 1);

  if (error) throw new Error(error.message);

  const campaignList = (campaigns ?? []).map((c) => ({ id: (c as { id: string }).id, name: (c as { name: string }).name }));
  const leadRows = (leads ?? []) as Array<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    company: string | null;
    job_title: string | null;
    status: string;
    campaign_id: string | null;
    created_at: string;
  }>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-gray-500">View and manage your leads</p>
        </div>
      </div>
      <Suspense fallback={<div className="bg-white rounded-xl border p-8 text-center text-gray-500">Loading leads…</div>}>
      <LeadsList
        leads={leadRows}
        total={count ?? 0}
        campaigns={campaignList}
        currentPage={page}
        limit={LIMIT}
        filters={{
          campaign_id: params.campaign_id ?? '',
          status: params.status ?? '',
          search: params.search ?? '',
        }}
      />
      </Suspense>
    </div>
  );
}
