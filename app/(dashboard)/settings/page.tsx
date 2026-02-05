import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SettingsForm } from './SettingsForm';
import type { BusinessContext } from '@/types/database';
import { CreditCard, Building2, Bot } from 'lucide-react';

export const metadata = { title: 'Settings | LeadPilot' };

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  business_context: BusinessContext;
  settings: unknown;
};

export default async function SettingsPage() {
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

  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, name, slug, business_context, settings')
    .eq('id', orgId)
    .single();

  if (error || !org) redirect('/');

  const organization = org as OrgRow;
  const businessContext = (organization.business_context ?? {}) as BusinessContext;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Settings</h1>
      <p className="text-gray-500 mb-6">Manage your organization and business context for AI sequences.</p>
      
      {/* Settings Navigation */}
      <div className="flex gap-2 mb-6 border-b pb-4">
        <Link
          href="/settings"
          className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium"
        >
          <Building2 className="w-4 h-4" />
          Organization
        </Link>
        <Link
          href="/settings/ai"
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
        >
          <Bot className="w-4 h-4" />
          AI Provider
        </Link>
        <Link
          href="/settings/billing"
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
        >
          <CreditCard className="w-4 h-4" />
          Billing
        </Link>
      </div>
      
      <SettingsForm
        orgId={organization.id}
        initialName={organization.name}
        initialBusinessContext={{
          company_name: businessContext.company_name ?? '',
          industry: businessContext.industry ?? '',
          target_audience: businessContext.target_audience ?? '',
          value_proposition: businessContext.value_proposition ?? '',
          tone: businessContext.tone ?? 'professional',
          key_pain_points: Array.isArray(businessContext.key_pain_points) ? businessContext.key_pain_points : [],
          case_studies: Array.isArray(businessContext.case_studies) ? businessContext.case_studies : [],
          cta: businessContext.cta ?? '',
          sender_name: businessContext.sender_name ?? '',
          sender_title: businessContext.sender_title ?? '',
          sequence_length: businessContext.sequence_length ?? 3,
        }}
      />
    </div>
  );
}
