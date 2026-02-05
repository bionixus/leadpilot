'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Upload, Search } from 'lucide-react';
import { formatDate } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'sequenced', label: 'Sequenced' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'replied', label: 'Replied' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
  { value: 'converted', label: 'Converted' },
];

type Lead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  company: string | null;
  job_title: string | null;
  status: string;
  campaign_id: string | null;
  created_at: string;
};

type Campaign = { id: string; name: string };

type Props = {
  leads: Lead[];
  total: number;
  campaigns: Campaign[];
  currentPage: number;
  limit: number;
  filters: { campaign_id: string; status: string; search: string };
};

export function LeadsList({ leads, total, campaigns, currentPage, limit, filters }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(filters.search);
  const [isPending, startTransition] = useTransition();
  const [showImport, setShowImport] = useState(false);

  function updateUrl(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    next.delete('page');
    router.push(`/leads?${next.toString()}`);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(() => updateUrl({ ...filters, search: searchInput.trim() }));
  }

  const campaignMap = new Map(campaigns.map((c) => [c.id, c.name]));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasFilters = filters.campaign_id || filters.status || filters.search;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-white rounded-xl border p-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign</label>
            <select
              value={filters.campaign_id}
              onChange={(e) => startTransition(() => updateUrl({ ...filters, campaign_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="">All campaigns</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => startTransition(() => updateUrl({ ...filters, status: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="flex gap-2">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Email, name, company..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
              <button
                type="submit"
                className="py-2 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-2 py-2 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Upload className="w-4 h-4" />
            Import leads
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {isPending && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 rounded-xl" />
        )}
        {leads.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {hasFilters ? 'No leads match your filters.' : 'No leads yet. Import leads via CSV or add them from a campaign.'}
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Campaign</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link href={`/leads/${lead.id}`} className="text-primary hover:underline font-medium">
                        {lead.email}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-gray-900">
                      {lead.full_name ?? ([lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—')}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{lead.company ?? '—'}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {lead.campaign_id ? campaignMap.get(lead.campaign_id) ?? '—' : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDate(lead.created_at)}</td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-3 border-t flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Showing {(currentPage - 1) * limit + 1}–{Math.min(currentPage * limit, total)} of {total}
                </p>
                <div className="flex gap-2">
                  {currentPage <= 1 ? (
                    <span className="py-1.5 px-3 rounded border text-sm text-gray-400 cursor-not-allowed">Previous</span>
                  ) : (
                    <Link
                      href={`/leads?${new URLSearchParams({ ...Object.fromEntries(searchParams.entries()), page: String(currentPage - 1) }).toString()}`}
                      className="py-1.5 px-3 rounded border text-sm hover:bg-gray-50"
                    >
                      Previous
                    </Link>
                  )}
                  {currentPage >= totalPages ? (
                    <span className="py-1.5 px-3 rounded border text-sm text-gray-400 cursor-not-allowed">Next</span>
                  ) : (
                    <Link
                      href={`/leads?${new URLSearchParams({ ...Object.fromEntries(searchParams.entries()), page: String(currentPage + 1) }).toString()}`}
                      className="py-1.5 px-3 rounded border text-sm hover:bg-gray-50"
                    >
                      Next
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showImport && (
        <ImportLeadsModal
          campaigns={campaigns}
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            setShowImport(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ImportLeadsModal({
  campaigns,
  onClose,
  onSuccess,
}: {
  campaigns: Campaign[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [campaignId, setCampaignId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Select a CSV file');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.set('file', file);
      if (campaignId) formData.set('campaign_id', campaignId);
      const res = await fetch('/api/leads/import/csv', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Import failed');
        setLoading(false);
        return;
      }
      setImported((data as { imported?: number }).imported ?? 0);
      setTimeout(onSuccess, 1200);
    } catch {
      setError('Import failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-md w-full">
        <h3 className="font-semibold mb-2">Import leads (CSV)</h3>
        <p className="text-sm text-gray-500 mb-4">
          CSV should have headers. We use: <code className="bg-gray-100 px-1 rounded">email</code>,{' '}
          <code className="bg-gray-100 px-1 rounded">first_name</code>, <code className="bg-gray-100 px-1 rounded">last_name</code>,{' '}
          <code className="bg-gray-100 px-1 rounded">company</code>, <code className="bg-gray-100 px-1 rounded">job_title</code>,{' '}
          <code className="bg-gray-100 px-1 rounded">linkedin_url</code>, <code className="bg-gray-100 px-1 rounded">phone</code>, <code className="bg-gray-100 px-1 rounded">location</code>.
          {' '}<Link href="/leads/import" className="text-primary hover:underline">Use full import page</Link>
        </p>
        {imported !== null ? (
          <p className="text-green-600 text-sm">Imported {imported} lead(s).</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Campaign (optional)</label>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">No campaign</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">CSV file *</label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-primary-foreground"
              />
            </div>
            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={onClose} className="py-2 px-4 rounded-lg border">
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !file}
                className="py-2 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? 'Importing…' : 'Import'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
