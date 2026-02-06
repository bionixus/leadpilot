import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { LeadDetail } from './LeadDetail';
import type { LeadStatus } from '@/types/database';

type LeadRow = {
  id: string;
  org_id: string;
  campaign_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  company: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  website: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  status: LeadStatus;
  source: string | null;
  created_at: string;
  updated_at: string;
  enrichment_data: unknown;
};

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/app');

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) redirect('/');

  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !lead || (lead as { org_id: string }).org_id !== orgId) notFound();

  let campaignName: string | null = null;
  const leadData = lead as LeadRow;
  if (leadData.campaign_id) {
    const { data: camp } = await supabase
      .from('campaigns')
      .select('name')
      .eq('id', leadData.campaign_id)
      .single();
    campaignName = (camp as { name: string } | null)?.name ?? null;
  }

  // Check if lead has a sequence
  const { data: existingSequence } = await supabase
    .from('sequences')
    .select('id')
    .eq('lead_id', id)
    .single();
  const sequenceId = existingSequence ? (existingSequence as { id: string }).id : null;

  return (
    <div>
      <Link
        href="/leads"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to leads
      </Link>
      <LeadDetail lead={leadData} campaignName={campaignName} sequenceId={sequenceId} />
    </div>
  );
}
