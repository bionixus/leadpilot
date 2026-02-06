import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { SequencesList } from './SequencesList';

export const metadata = { title: 'Sequences | LeadPilot' };

const LIMIT = 20;

type SearchParams = Promise<{ campaign_id?: string; page?: string }>;

type SequenceRow = {
  id: string;
  org_id: string;
  campaign_id: string;
  lead_id: string;
  emails: Array<{ step: number; delay_days: number; subject: string; body: string }>;
  llm_model: string | null;
  current_step: number;
  is_complete: boolean;
  stopped_reason: string | null;
  approved_at: string | null;
  created_at: string;
};

export default async function SequencesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/app');

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) redirect('/');

  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const offset = (page - 1) * LIMIT;

  // Load campaigns for filter dropdown
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name')
    .eq('org_id', orgId)
    .order('name');

  // Load sequences
  let query = supabase
    .from('sequences')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (params.campaign_id) {
    query = query.eq('campaign_id', params.campaign_id);
  }

  const { data: sequences, error, count } = await query.range(offset, offset + LIMIT - 1);

  if (error) throw new Error(error.message);

  // Load lead and campaign info for display
  const seqRows = (sequences ?? []) as SequenceRow[];
  const leadIds = Array.from(new Set(seqRows.map((s) => s.lead_id)));
  const campaignIds = Array.from(new Set(seqRows.map((s) => s.campaign_id)));

  const { data: leads } = leadIds.length
    ? await supabase.from('leads').select('id, email, first_name, last_name, company').in('id', leadIds)
    : { data: [] };

  const { data: campaignsForSeq } = campaignIds.length
    ? await supabase.from('campaigns').select('id, name').in('id', campaignIds)
    : { data: [] };

  const leadMap = new Map(
    ((leads ?? []) as Array<{ id: string; email: string; first_name: string | null; last_name: string | null; company: string | null }>).map((l) => [l.id, l])
  );
  const campaignMap = new Map(
    ((campaignsForSeq ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c])
  );

  const sequencesWithInfo = seqRows.map((s) => ({
    ...s,
    lead: leadMap.get(s.lead_id) ?? null,
    campaign: campaignMap.get(s.campaign_id) ?? null,
  }));

  const campaignList = ((campaigns ?? []) as Array<{ id: string; name: string }>).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Sequences</h1>
      <p className="text-gray-500 mb-6">AI-generated email sequences for your leads.</p>
      <SequencesList
        sequences={sequencesWithInfo}
        campaigns={campaignList}
        selectedCampaignId={params.campaign_id ?? null}
        currentPage={page}
        totalCount={count ?? 0}
        pageSize={LIMIT}
      />
    </div>
  );
}
