import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AnalyticsDashboard from './AnalyticsDashboard';

export const metadata = { title: 'Analytics | LeadPilot' };

export default async function AnalyticsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/app');

  const { data: userRow } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .single();

  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) redirect('/app');

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-gray-500">
          Track your outreach performance and campaign metrics
        </p>
      </div>
      <AnalyticsDashboard />
    </div>
  );
}
