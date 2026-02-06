import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import BillingSettings from './BillingSettings';

export const metadata = { title: 'Billing | LeadPilot' };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/app');

  const { data: userRow } = await supabase
    .from('users')
    .select('org_id, organizations(*)')
    .eq('auth_id', user.id)
    .single();

  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  const org = (userRow as { 
    organizations?: { 
      id: string;
      name?: string;
      subscription_tier?: string | null;
      subscription_status?: string | null;
      stripe_customer_id?: string | null;
    } | null 
  } | null)?.organizations;

  if (!orgId || !org) redirect('/');

  // Get usage stats
  const [emailAccountsResult, leadsResult, emailsThisMonthResult] = await Promise.all([
    supabase
      .from('email_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabase
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'sent')
      .gte('sent_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ]);

  const usage = {
    emailAccounts: emailAccountsResult.count ?? 0,
    leads: leadsResult.count ?? 0,
    emailsThisMonth: emailsThisMonthResult.count ?? 0,
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="text-sm text-gray-500">
          Manage your subscription and billing settings
        </p>
      </div>
      <BillingSettings
        org={{
          id: org.id,
          name: org.name || 'Organization',
          subscriptionTier: org.subscription_tier || 'free',
          subscriptionStatus: org.subscription_status || null,
          hasStripeCustomer: !!org.stripe_customer_id,
        }}
        usage={usage}
        showSuccess={params.success === '1'}
        showCanceled={params.canceled === '1'}
      />
    </div>
  );
}
