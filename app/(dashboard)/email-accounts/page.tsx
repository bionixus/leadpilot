import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { EmailAccountsClient } from './EmailAccountsClient';

export const metadata = { title: 'Email Accounts | LeadPilot' };

const SAFE_SELECT =
  'id, org_id, user_id, email_address, display_name, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, daily_send_limit, emails_sent_today, warmup_enabled, warmup_day, is_active, connection_status, last_error, last_synced_at, created_at, updated_at';

type SearchParams = Promise<{ connected?: string; error?: string }>;

export default async function EmailAccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userRow } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  if (!orgId) redirect('/');

  const { data: accounts, error } = await supabase
    .from('email_accounts')
    .select(SAFE_SELECT)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const list = (accounts ?? []) as Array<{
    id: string;
    email_address: string;
    display_name: string | null;
    provider: string;
    connection_status: string | null;
    last_error: string | null;
    last_synced_at: string | null;
    daily_send_limit: number | null;
    emails_sent_today: number | null;
    is_active: boolean | null;
    created_at: string;
  }>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Email Accounts</h1>
      <p className="text-gray-500 mb-6">
        Connect Gmail, Outlook, or a custom IMAP/SMTP account to send and sync emails.
      </p>
      <EmailAccountsClient
        accounts={list}
        flashConnected={params.connected === '1'}
        flashError={params.error ?? null}
      />
    </div>
  );
}
