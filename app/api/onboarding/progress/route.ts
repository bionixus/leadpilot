import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 403 });

  // Check progress
  const [orgResult, emailAccountsResult, campaignsResult, leadsResult, sequencesResult] = await Promise.all([
    supabase
      .from('organizations')
      .select('business_context')
      .eq('id', orgId)
      .single(),
    supabase
      .from('email_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabase
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabase
      .from('sequences')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
  ]);

  const org = orgResult.data as { business_context?: Record<string, unknown> | null } | null;
  const businessContext = org?.business_context || {};

  // Check if business context has meaningful data
  const hasBusinessContext = Boolean(
    businessContext.company_name ||
    businessContext.value_proposition ||
    businessContext.target_audience
  );

  return NextResponse.json({
    hasBusinessContext,
    hasEmailAccount: (emailAccountsResult.count ?? 0) > 0,
    hasCampaign: (campaignsResult.count ?? 0) > 0,
    hasLeads: (leadsResult.count ?? 0) > 0,
    hasSequences: (sequencesResult.count ?? 0) > 0,
  });
}
