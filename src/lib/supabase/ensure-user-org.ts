import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const defaultOrgSettings = {
  timezone: 'UTC',
  default_sequence_length: 3,
  send_window_start: '09:00',
  send_window_end: '17:00',
  send_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
};

const defaultNotificationPrefs = {
  email_replies: true,
  email_bounces: true,
  daily_digest: false,
  browser_push: false,
};

const defaultBusinessContext = {
  company_name: '',
  industry: '',
  target_audience: '',
  value_proposition: '',
  tone: 'professional',
  key_pain_points: [],
  case_studies: [],
  cta: '',
  sender_name: '',
  sender_title: '',
  sequence_length: 3,
};

/** Creates org + user row if missing. Uses admin client (bypasses RLS). Returns true if created or already existed. */
export async function ensureUserAndOrg(
  admin: SupabaseClient<Database>,
  user: User
): Promise<{ ok: true } | { error: string }> {
  const { data: existing } = await admin.from('users').select('id').eq('auth_id', user.id).single();
  if (existing) return { ok: true };

  const orgName = user.user_metadata?.full_name
    ? `${user.user_metadata.full_name}'s Organization`
    : 'My Organization';
  const slug = `org-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({
      name: orgName,
      slug,
      business_context: defaultBusinessContext,
      settings: defaultOrgSettings,
      subscription_tier: 'free',
      subscription_status: 'active',
    } as never)
    .select('id')
    .single();

  if (orgError || !org) {
    console.error('ensureUserAndOrg org error:', orgError);
    return { error: 'Failed to create organization' };
  }

  const orgId = (org as { id: string }).id;
  const { error: userError } = await admin.from('users').insert({
    auth_id: user.id,
    email: user.email ?? '',
    full_name: user.user_metadata?.full_name ?? null,
    avatar_url: user.user_metadata?.avatar_url ?? null,
    org_id: orgId,
    role: 'owner',
    notification_preferences: defaultNotificationPrefs,
  } as never);

  if (userError) {
    console.error('ensureUserAndOrg user error:', userError);
    return { error: 'Failed to create user record' };
  }

  return { ok: true };
}
