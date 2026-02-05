'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Campaign = { id: string; name: string };

type Props = { campaigns: Campaign[] };

export function ImportLeadsForm({ campaigns }: Props) {
  const router = useRouter();
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
      const redirectUrl = campaignId ? `/leads?campaign_id=${campaignId}` : '/leads';
      setTimeout(() => router.push(redirectUrl), 1200);
    } catch {
      setError('Import failed');
    } finally {
      setLoading(false);
    }
  }

  if (imported !== null) {
    return (
      <div className="bg-white rounded-xl border p-6 max-w-md">
        <p className="text-green-600 font-medium">Imported {imported} lead(s).</p>
        <p className="text-sm text-gray-500 mt-1">Redirecting to leads…</p>
        <Link href="/leads" className="text-sm text-primary hover:underline mt-2 inline-block">
          Go to leads
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Campaign (optional)</label>
        <select
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
        >
          <option value="">No campaign</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">CSV file *</label>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-primary-foreground"
        />
        <p className="text-xs text-gray-500 mt-1">
          CSV should have headers: email, first_name, last_name, company, job_title, linkedin_url, phone, location.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || !file}
          className="bg-primary text-primary-foreground py-2 px-4 rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Importing…' : 'Import'}
        </button>
        <Link href="/leads" className="py-2 px-4 rounded-lg border hover:bg-gray-50">
          Cancel
        </Link>
      </div>
    </form>
  );
}
