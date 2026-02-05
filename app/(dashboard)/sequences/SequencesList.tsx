'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, XCircle } from 'lucide-react';

type Lead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
};

type Campaign = {
  id: string;
  name: string;
};

type SequenceEmail = {
  step: number;
  delay_days: number;
  subject: string;
  body: string;
};

type Sequence = {
  id: string;
  campaign_id: string;
  lead_id: string;
  emails: SequenceEmail[];
  current_step: number;
  is_complete: boolean;
  stopped_reason: string | null;
  approved_at: string | null;
  created_at: string;
  lead: Lead | null;
  campaign: Campaign | null;
};

type Props = {
  sequences: Sequence[];
  campaigns: Campaign[];
  selectedCampaignId: string | null;
  currentPage: number;
  totalCount: number;
  pageSize: number;
};

export function SequencesList({
  sequences,
  campaigns,
  selectedCampaignId,
  currentPage,
  totalCount,
  pageSize,
}: Props) {
  const router = useRouter();
  const totalPages = Math.ceil(totalCount / pageSize);

  function handleCampaignChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const params = new URLSearchParams();
    if (val) params.set('campaign_id', val);
    router.push(`/sequences${params.toString() ? `?${params.toString()}` : ''}`);
  }

  function goToPage(page: number) {
    const params = new URLSearchParams();
    if (selectedCampaignId) params.set('campaign_id', selectedCampaignId);
    if (page > 1) params.set('page', String(page));
    router.push(`/sequences${params.toString() ? `?${params.toString()}` : ''}`);
  }

  function getStatus(seq: Sequence): { label: string; color: string; icon: React.ReactNode } {
    if (seq.is_complete) {
      return { label: seq.stopped_reason ?? 'Completed', color: 'bg-gray-100 text-gray-700', icon: <CheckCircle2 className="w-4 h-4" /> };
    }
    if (seq.approved_at) {
      return { label: 'Active', color: 'bg-green-100 text-green-700', icon: <Clock className="w-4 h-4" /> };
    }
    return { label: 'Draft', color: 'bg-yellow-100 text-yellow-700', icon: <XCircle className="w-4 h-4" /> };
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="bg-white rounded-xl border p-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Filter by campaign</label>
        <select
          value={selectedCampaignId ?? ''}
          onChange={handleCampaignChange}
          className="w-full sm:w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {sequences.length === 0 ? (
          <p className="p-6 text-gray-500 text-sm">
            No sequences yet. Generate a sequence from a campaign lead.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lead
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Campaign
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Steps
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Generated
                  </th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sequences.map((seq) => {
                  const status = getStatus(seq);
                  const leadName = seq.lead
                    ? [seq.lead.first_name, seq.lead.last_name].filter(Boolean).join(' ') || seq.lead.email
                    : 'Unknown';
                  return (
                    <tr key={seq.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{leadName}</div>
                        {seq.lead?.company && (
                          <div className="text-xs text-gray-500">{seq.lead.company}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {seq.campaign?.name ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {seq.current_step}/{seq.emails.length}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${status.color}`}
                        >
                          {status.icon}
                          {status.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatDate(seq.created_at)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/sequences/${seq.id}`}
                          className="text-primary hover:underline text-sm font-medium"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {currentPage} of {totalPages} ({totalCount} sequences)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
