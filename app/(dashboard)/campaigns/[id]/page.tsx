import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { CampaignDetail } from './CampaignDetail';
import type { CampaignSource, CampaignStatus } from '@/types/database';

type CampaignRow = {
  id: string;
  name: string;
  description: string | null;
  source: CampaignSource;
  source_config: unknown;
  email_account_id: string | null;
  settings: { sequence_length?: number } | undefined;
  llm_context: unknown;
  status: CampaignStatus;
  stats?: {
    total_leads?: number;
    emails_sent?: number;
    replies_received?: number;
    emails_opened?: number;
    bounces?: number;
  };
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type EmailAccountRow = { id: string; email_address: string; display_name: string | null };

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: campaign, error: campError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single();

  if (campError || !campaign || (campaign as { org_id?: string }).org_id !== orgId) {
    notFound();
  }

  const { count: leadCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', id);

  const { data: emailAccounts } = await supabase
    .from('email_accounts')
    .select('id, email_address, display_name')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('email_address');

  const campaignData = campaign as CampaignRow;
  const accounts = (emailAccounts ?? []) as EmailAccountRow[];
  const emailAccount = campaignData.email_account_id
    ? accounts.find((a) => a.id === campaignData.email_account_id)
    : null;

  return (
    <div>
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to campaigns
      </Link>
      <CampaignDetail
        campaign={campaignData}
        leadCount={leadCount ?? 0}
        emailAccount={emailAccount ?? null}
        emailAccounts={accounts}
      />
    </div>
  );
}
