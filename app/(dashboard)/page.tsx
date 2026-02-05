import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Plus, Users, Mail, MessageSquare } from 'lucide-react';
import { formatDate, formatNumber, percentage } from '@/lib/utils';
import { CampaignRowActions } from './CampaignRowActions';

export const metadata = { title: 'Campaigns' };

export default async function CampaignsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: userData } = await supabase.from('users').select('org_id').eq('auth_id', user.id).single();
  const orgId = (userData as { org_id?: string | null } | null)?.org_id;
  const result = orgId
    ? await supabase.from('campaigns').select('*').eq('org_id', orgId).order('created_at', { ascending: false })
    : { data: [] as { id: string; name: string; source?: string | null; status: string; stats?: { total_leads?: number; emails_sent?: number; replies_received?: number }; created_at: string }[] };
  const campaigns = result.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-gray-500">Manage your outreach campaigns</p>
        </div>
        <Link href="/campaigns/new" className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          New Campaign
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Campaigns" value={campaigns?.length || 0} />
        <StatCard label="Active" value={campaigns?.filter(c => c.status === 'active').length || 0} />
        <StatCard label="Total Leads" value={campaigns?.reduce((acc, c) => acc + (c.stats?.total_leads || 0), 0) || 0} />
        <StatCard label="Avg Reply Rate" value={`${calculateAvgReplyRate(campaigns)}%`} />
      </div>
      {campaigns && campaigns.length > 0 ? (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Campaign</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Leads</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Sent</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Replies</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link href={`/campaigns/${campaign.id}`} className="font-medium hover:text-primary">{campaign.name}</Link>
                    <p className="text-sm text-gray-500">{campaign.source}</p>
                  </td>
                  <td className="px-6 py-4"><StatusBadge status={campaign.status} /></td>
                  <td className="px-6 py-4"><div className="flex items-center gap-1 text-gray-600"><Users className="w-4 h-4" />{formatNumber(campaign.stats?.total_leads || 0)}</div></td>
                  <td className="px-6 py-4"><div className="flex items-center gap-1 text-gray-600"><Mail className="w-4 h-4" />{formatNumber(campaign.stats?.emails_sent || 0)}</div></td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-gray-600">
                      <MessageSquare className="w-4 h-4" />
                      {formatNumber(campaign.stats?.replies_received || 0)}
                      {(campaign.stats?.emails_sent ?? 0) > 0 && (
                        <span className="text-xs text-gray-400 ml-1">({percentage(campaign.stats?.replies_received ?? 0, campaign.stats?.emails_sent ?? 0)}%)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(campaign.created_at)}</td>
                  <td className="px-6 py-4">
                    <CampaignRowActions campaignId={campaign.id} status={campaign.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border p-12 text-center">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4"><Mail className="w-6 h-6 text-primary" /></div>
          <h3 className="text-lg font-medium mb-2">No campaigns yet</h3>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">Create your first campaign to start reaching out to leads with AI-generated email sequences.</p>
          <Link href="/campaigns/new" className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"><Plus className="w-4 h-4" />Create Campaign</Link>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = { draft: 'bg-gray-100 text-gray-700', active: 'bg-green-100 text-green-700', paused: 'bg-yellow-100 text-yellow-700', completed: 'bg-blue-100 text-blue-700', archived: 'bg-gray-100 text-gray-500' };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.draft}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

function calculateAvgReplyRate(campaigns: { stats?: { emails_sent?: number; replies_received?: number } }[] | null): number {
  if (!campaigns || campaigns.length === 0) return 0;
  const totalSent = campaigns.reduce((acc, c) => acc + (c.stats?.emails_sent || 0), 0);
  const totalReplies = campaigns.reduce((acc, c) => acc + (c.stats?.replies_received || 0), 0);
  if (totalSent === 0) return 0;
  return Math.round((totalReplies / totalSent) * 100);
}
