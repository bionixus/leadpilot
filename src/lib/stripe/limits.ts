import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getTierLimits, isWithinLimit } from './index';

type LimitCheckResult = {
  allowed: boolean;
  reason?: string;
  current?: number;
  limit?: number;
};

type OrgLimits = {
  emailAccounts: LimitCheckResult;
  leads: LimitCheckResult;
  emailsPerMonth: LimitCheckResult;
};

/**
 * Check if the organization can perform an action based on their subscription limits
 */
export async function checkOrgLimits(orgId: string): Promise<OrgLimits> {
  const supabase = await createServerSupabaseClient();

  // Get org subscription tier
  const { data: org } = await supabase
    .from('organizations')
    .select('subscription_tier')
    .eq('id', orgId)
    .single();

  const tier = (org as { subscription_tier?: string | null } | null)?.subscription_tier || 'free';
  const limits = getTierLimits(tier);

  // Get current usage
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

  const emailAccountsCount = emailAccountsResult.count ?? 0;
  const leadsCount = leadsResult.count ?? 0;
  const emailsCount = emailsThisMonthResult.count ?? 0;

  return {
    emailAccounts: {
      allowed: isWithinLimit(emailAccountsCount, limits.emailAccounts),
      current: emailAccountsCount,
      limit: limits.emailAccounts,
      reason: !isWithinLimit(emailAccountsCount, limits.emailAccounts)
        ? `You've reached the maximum of ${limits.emailAccounts} email account(s) on your plan. Upgrade to add more.`
        : undefined,
    },
    leads: {
      allowed: isWithinLimit(leadsCount, limits.leads),
      current: leadsCount,
      limit: limits.leads,
      reason: !isWithinLimit(leadsCount, limits.leads)
        ? `You've reached the maximum of ${limits.leads} leads on your plan. Upgrade to add more.`
        : undefined,
    },
    emailsPerMonth: {
      allowed: isWithinLimit(emailsCount, limits.emailsPerMonth),
      current: emailsCount,
      limit: limits.emailsPerMonth,
      reason: !isWithinLimit(emailsCount, limits.emailsPerMonth)
        ? `You've reached your monthly limit of ${limits.emailsPerMonth} emails. Upgrade for unlimited emails.`
        : undefined,
    },
  };
}

/**
 * Check if org can add email accounts
 */
export async function canAddEmailAccount(orgId: string): Promise<LimitCheckResult> {
  const limits = await checkOrgLimits(orgId);
  return limits.emailAccounts;
}

/**
 * Check if org can add leads
 */
export async function canAddLeads(orgId: string, count: number = 1): Promise<LimitCheckResult> {
  const supabase = await createServerSupabaseClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('subscription_tier')
    .eq('id', orgId)
    .single();

  const tier = (org as { subscription_tier?: string | null } | null)?.subscription_tier || 'free';
  const tierLimits = getTierLimits(tier);

  const { count: currentCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);

  const current = currentCount ?? 0;
  const wouldExceed = tierLimits.leads !== -1 && current + count > tierLimits.leads;

  return {
    allowed: !wouldExceed,
    current,
    limit: tierLimits.leads,
    reason: wouldExceed
      ? `Adding ${count} leads would exceed your limit of ${tierLimits.leads}. You have ${current} leads. Upgrade your plan to add more.`
      : undefined,
  };
}

/**
 * Check if org can send emails
 */
export async function canSendEmails(orgId: string): Promise<LimitCheckResult> {
  const limits = await checkOrgLimits(orgId);
  return limits.emailsPerMonth;
}
