'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Edit2, Sparkles, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { LeadStatus } from '@/types/database';

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
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
  linkedin_url: string | null;
  website: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  status: LeadStatus;
  source: string | null;
  campaign_id: string | null;
  created_at: string;
  updated_at: string;
  enrichment_data?: unknown;
};

type Props = { lead: Lead; campaignName: string | null; sequenceId: string | null };

export function LeadDetail({ lead, campaignName, sequenceId }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: lead.email,
    first_name: lead.first_name ?? '',
    last_name: lead.last_name ?? '',
    company: lead.company ?? '',
    job_title: lead.job_title ?? '',
    phone: lead.phone ?? '',
    linkedin_url: lead.linkedin_url ?? '',
    website: lead.website ?? '',
    city: lead.city ?? '',
    state: lead.state ?? '',
    country: lead.country ?? '',
    status: lead.status,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          first_name: form.first_name || null,
          last_name: form.last_name || null,
          company: form.company || null,
          job_title: form.job_title || null,
          phone: form.phone || null,
          linkedin_url: form.linkedin_url || null,
          website: form.website || null,
          city: form.city || null,
          state: form.state || null,
          country: form.country || null,
          status: form.status,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setEditing(false);
      setMessage({ type: 'success', text: 'Saved.' });
      router.refresh();
    } catch {
      setMessage({ type: 'error', text: 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(newStatus: LeadStatus) {
    setMessage(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      setForm((f) => ({ ...f, status: newStatus }));
      router.refresh();
    } catch {
      setMessage({ type: 'error', text: 'Failed to update status.' });
    }
  }

  async function handleGenerateSequence() {
    if (!lead.campaign_id) {
      setGenError('Lead must be assigned to a campaign first.');
      return;
    }
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch('/api/sequences/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: lead.campaign_id, lead_id: lead.id }),
      });
      const data = (await res.json()) as { sequence?: { id: string }; error?: string };
      if (!res.ok) {
        setGenError(data.error ?? 'Failed to generate sequence');
        return;
      }
      if (data.sequence?.id) {
        router.push(`/sequences/${data.sequence.id}`);
      } else {
        router.refresh();
      }
    } catch {
      setGenError('Request failed');
    } finally {
      setGenerating(false);
    }
  }

  const displayName = lead.full_name ?? ([lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{displayName}</h1>
          <p className="text-gray-500">{lead.email}</p>
          <div className="mt-2">
            <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
              {lead.status}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          className="inline-flex items-center gap-2 py-2 px-3 rounded-lg border hover:bg-gray-50 text-sm"
        >
          <Edit2 className="w-4 h-4" />
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {message && (
        <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      {editing ? (
        <form onSubmit={handleSave} className="bg-white rounded-xl border p-6 space-y-4 max-w-xl">
          <h2 className="font-medium">Contact</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as LeadStatus }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job title</label>
              <input
                type="text"
                value={form.job_title}
                onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn</label>
              <input
                type="url"
                value={form.linkedin_url}
                onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
              <input
                type="url"
                value={form.website}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <input
                type="text"
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-primary text-primary-foreground py-2 px-4 rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      ) : (
        <>
          <div className="bg-white rounded-xl border p-6">
            <h2 className="font-medium mb-3">Contact</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><dt className="text-gray-500">Email</dt><dd>{lead.email}</dd></div>
              <div><dt className="text-gray-500">Name</dt><dd>{displayName}</dd></div>
              <div><dt className="text-gray-500">Company</dt><dd>{lead.company ?? '—'}</dd></div>
              <div><dt className="text-gray-500">Job title</dt><dd>{lead.job_title ?? '—'}</dd></div>
              <div><dt className="text-gray-500">Phone</dt><dd>{lead.phone ?? '—'}</dd></div>
              <div><dt className="text-gray-500">LinkedIn</dt><dd>{lead.linkedin_url ? <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Link</a> : '—'}</dd></div>
              <div><dt className="text-gray-500">Website</dt><dd>{lead.website ? <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Link</a> : '—'}</dd></div>
              <div><dt className="text-gray-500">Location</dt><dd>{[lead.city, lead.state, lead.country].filter(Boolean).join(', ') || '—'}</dd></div>
            </dl>
          </div>

          <div className="bg-white rounded-xl border p-6">
            <h2 className="font-medium mb-3">Status & campaign</h2>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-gray-500">Quick status:</span>
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => handleStatusChange(o.value)}
                  className={`px-2.5 py-1 rounded text-xs font-medium ${lead.status === o.value ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Campaign: {lead.campaign_id && campaignName ? (
                <Link href={`/campaigns/${lead.campaign_id}`} className="text-primary hover:underline">{campaignName}</Link>
              ) : '—'}
            </p>
          </div>

          {/* Sequence section */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="font-medium mb-3">Sequence</h2>
            {sequenceId ? (
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-sm text-gray-600">This lead has a generated sequence.</p>
                <Link
                  href={`/sequences/${sequenceId}`}
                  className="inline-flex items-center gap-2 py-2 px-3 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90"
                >
                  <Sparkles className="w-4 h-4" />
                  View sequence
                </Link>
              </div>
            ) : (
              <div>
                {!lead.campaign_id ? (
                  <p className="text-sm text-gray-500">Assign this lead to a campaign to generate a sequence.</p>
                ) : (
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm text-gray-600">No sequence yet.</p>
                    <button
                      type="button"
                      onClick={handleGenerateSequence}
                      disabled={generating}
                      className="inline-flex items-center gap-2 py-2 px-3 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
                    >
                      {generating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating…
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Generate sequence
                        </>
                      )}
                    </button>
                  </div>
                )}
                {genError && <p className="text-sm text-red-600 mt-2">{genError}</p>}
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400">
            Created {formatDate(lead.created_at)} · Updated {formatDate(lead.updated_at)}
          </p>
        </>
      )}
    </div>
  );
}
