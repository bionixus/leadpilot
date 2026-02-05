import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { SequenceEditor } from './SequenceEditor';

type SequenceEmail = {
  step: number;
  delay_days: number;
  subject: string;
  body: string;
};

type SequenceRow = {
  id: string;
  org_id: string;
  campaign_id: string;
  lead_id: string;
  emails: SequenceEmail[];
  llm_model: string | null;
  llm_prompt_tokens: number | null;
  llm_completion_tokens: number | null;
  current_step: number;
  is_complete: boolean;
  stopped_reason: string | null;
  generated_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

export default async function SequenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) redirect('/');

  const { data: sequence, error } = await supabase
    .from('sequences')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !sequence || (sequence as { org_id?: string }).org_id !== orgId) {
    notFound();
  }

  const seqData = sequence as SequenceRow;

  // Load lead and campaign for context
  const { data: lead } = await supabase
    .from('leads')
    .select('id, email, first_name, last_name, company')
    .eq('id', seqData.lead_id)
    .single();

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, name')
    .eq('id', seqData.campaign_id)
    .single();

  const leadInfo = lead as { id: string; email: string; first_name: string | null; last_name: string | null; company: string | null } | null;
  const campaignInfo = campaign as { id: string; name: string } | null;

  const leadName = leadInfo
    ? [leadInfo.first_name, leadInfo.last_name].filter(Boolean).join(' ') || leadInfo.email
    : 'Unknown lead';

  return (
    <div>
      <Link
        href="/sequences"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to sequences
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Sequence for {leadName}</h1>
        <p className="text-gray-500">
          {campaignInfo ? (
            <>
              Campaign:{' '}
              <Link href={`/campaigns/${campaignInfo.id}`} className="text-primary hover:underline">
                {campaignInfo.name}
              </Link>
            </>
          ) : (
            'No campaign'
          )}
          {leadInfo?.company && <> · {leadInfo.company}</>}
        </p>
      </div>
      <SequenceEditor
        sequence={{
          id: seqData.id,
          emails: seqData.emails,
          current_step: seqData.current_step,
          is_complete: seqData.is_complete,
          stopped_reason: seqData.stopped_reason,
          approved_at: seqData.approved_at,
          generated_at: seqData.generated_at,
          created_at: seqData.created_at,
        }}
        campaignId={seqData.campaign_id}
        leadId={seqData.lead_id}
        userId={user.id}
      />
    </div>
  );
}
