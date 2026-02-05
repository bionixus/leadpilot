'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Play,
  Pause,
  Trash2,
  Edit2,
  Users,
  Mail,
  MessageSquare,
  Upload,
  X,
  BarChart3,
} from 'lucide-react';
import { formatDate, formatNumber } from '@/lib/utils';
import { CampaignAnalytics } from './CampaignAnalytics';
import type { CampaignSource, CampaignStatus } from '@/types/database';

const SOURCES: Record<string, string> = {
  manual: 'Manual',
  csv: 'CSV',
  google_sheets: 'Google Sheets',
  linkedin: 'LinkedIn',
  apollo: 'Apollo',
  google_maps: 'Google Maps',
};

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  archived: 'bg-gray-100 text-gray-500',
};

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  source: CampaignSource;
  status: CampaignStatus;
  email_account_id: string | null;
  stats?: {
    total_leads?: number;
    emails_sent?: number;
    replies_received?: number;
    emails_opened?: number;
    bounces?: number;
  };
  settings?: { sequence_length?: number };
  created_at: string;
};

type EmailAccount = { id: string; email_address: string; display_name: string | null };

type Props = {
  campaign: Campaign;
  leadCount: number;
  emailAccount: EmailAccount | null;
  emailAccounts: EmailAccount[];
};

export function CampaignDetail({ campaign, leadCount, emailAccount, emailAccounts }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [showAddLeads, setShowAddLeads] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit form state
  const [editName, setEditName] = useState(campaign.name);
  const [editDescription, setEditDescription] = useState(campaign.description ?? '');
  const [editEmailAccountId, setEditEmailAccountId] = useState(campaign.email_account_id ?? '');

  async function handleStart() {
    setActionLoading('start');
    setMessage(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/start`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      router.refresh();
    } catch {
      setMessage({ type: 'error', text: 'Failed to start campaign' });
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePause() {
    setActionLoading('pause');
    setMessage(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paused' }),
      });
      if (!res.ok) throw new Error('Failed');
      router.refresh();
    } catch {
      setMessage({ type: 'error', text: 'Failed to pause campaign' });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete() {
    setActionLoading('delete');
    setMessage(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      router.push('/');
      router.refresh();
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete campaign' });
    } finally {
      setActionLoading(null);
      setShowDeleteConfirm(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading('edit');
    setMessage(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
          email_account_id: editEmailAccountId || null,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setEditing(false);
      router.refresh();
    } catch {
      setMessage({ type: 'error', text: 'Failed to save' });
    } finally {
      setActionLoading(null);
    }
  }

  const stats = campaign.stats ?? {};
  const totalLeads = stats.total_leads ?? leadCount;
  const emailsSent = stats.emails_sent ?? 0;
  const repliesReceived = stats.replies_received ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {editing ? (
            <form onSubmit={handleSaveEdit} className="space-y-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-2xl font-bold border border-gray-300 rounded-lg px-3 py-1.5 w-full max-w-md"
              />
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
                className="text-gray-500 border border-gray-300 rounded-lg px-3 py-2 w-full max-w-md text-sm"
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send from</label>
                <select
                  value={editEmailAccountId}
                  onChange={(e) => setEditEmailAccountId(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Not set</option>
                  {emailAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.display_name || a.email_address}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={actionLoading === 'edit'}
                  className="bg-primary text-primary-foreground py-1.5 px-3 rounded-lg text-sm"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setEditing(false); setEditName(campaign.name); setEditDescription(campaign.description ?? ''); setEditEmailAccountId(campaign.email_account_id ?? ''); }}
                  className="py-1.5 px-3 rounded-lg border text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">{campaign.name}</h1>
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[campaign.status] ?? STATUS_STYLES.draft}`}>
                  {campaign.status}
                </span>
              </div>
              {campaign.description && (
                <p className="text-gray-500 mt-1">{campaign.description}</p>
              )}
            </>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-2 py-2 px-3 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
            {(campaign.status === 'draft' || campaign.status === 'paused') && (
              <button
                onClick={handleStart}
                disabled={actionLoading !== null}
                className="inline-flex items-center gap-2 py-2 px-3 rounded-lg bg-green-600 text-white hover:bg-green-700 text-sm disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                Start campaign
              </button>
            )}
            {campaign.status === 'active' && (
              <button
                onClick={handlePause}
                disabled={actionLoading !== null}
                className="inline-flex items-center gap-2 py-2 px-3 rounded-lg border border-yellow-500 text-yellow-700 hover:bg-yellow-50 text-sm disabled:opacity-50"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
            )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={actionLoading !== null}
              className="inline-flex items-center gap-2 py-2 px-3 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-sm disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}
      </div>

      {message && (
        <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      {/* Summary & Stats */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-medium mb-3">Summary</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-gray-500">Source</dt>
            <dd>{SOURCES[campaign.source] ?? campaign.source}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Send from</dt>
            <dd>{emailAccount ? (emailAccount.display_name || emailAccount.email_address) : 'Not set'}</dd>
          </div>
        </dl>
        <div className="mt-4 pt-4 border-t flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-400" />
            <span className="font-medium">{formatNumber(totalLeads)}</span>
            <span className="text-gray-500">Leads</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-gray-400" />
            <span className="font-medium">{formatNumber(emailsSent)}</span>
            <span className="text-gray-500">Sent</span>
          </div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-gray-400" />
            <span className="font-medium">{formatNumber(repliesReceived)}</span>
            <span className="text-gray-500">Replies</span>
          </div>
        </div>
      </div>

      {/* Analytics Section */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <button
          onClick={() => setShowAnalytics(!showAnalytics)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-gray-400" />
            <h2 className="font-medium">Analytics</h2>
          </div>
          <span className="text-gray-400 text-sm">{showAnalytics ? 'Hide' : 'Show'}</span>
        </button>
        {showAnalytics && (
          <div className="px-6 pb-6">
            <CampaignAnalytics campaignId={campaign.id} />
          </div>
        )}
      </div>

      {/* Leads section */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium">Leads</h2>
          <button
            type="button"
            onClick={() => setShowAddLeads(true)}
            className="inline-flex items-center gap-2 py-2 px-3 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90"
          >
            <Upload className="w-4 h-4" />
            Add leads
          </button>
        </div>
        <p className="text-gray-500 text-sm">
          {leadCount === 0
            ? 'No leads yet. Add leads via CSV or import.'
            : `${leadCount} lead(s) in this campaign.`}
        </p>
      </div>

      {/* Add leads modal */}
      {showAddLeads && (
        <AddLeadsModal
          campaignId={campaign.id}
          onClose={() => { setShowAddLeads(false); router.refresh(); }}
        />
      )}

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="font-semibold mb-2">Delete campaign?</h3>
            <p className="text-gray-500 text-sm mb-4">
              This cannot be undone. The campaign and its leads will remain in the database but the campaign will be removed from the list.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="py-2 px-4 rounded-lg border"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading === 'delete'}
                className="py-2 px-4 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">Created {formatDate(campaign.created_at)}</p>
    </div>
  );
}

function AddLeadsModal({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
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
      formData.set('campaign_id', campaignId);
      const res = await fetch('/api/leads/import/csv', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Import failed');
        setLoading(false);
        return;
      }
      setImported((data as { imported?: number }).imported ?? 0);
      setFile(null);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch {
      setError('Import failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Add leads (CSV)</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Upload a CSV with columns: <code className="bg-gray-100 px-1 rounded">email</code>, and optionally <code className="bg-gray-100 px-1 rounded">first_name</code>, <code className="bg-gray-100 px-1 rounded">last_name</code>, <code className="bg-gray-100 px-1 rounded">company</code>, <code className="bg-gray-100 px-1 rounded">job_title</code>.
        </p>
        {imported !== null ? (
          <p className="text-green-600 text-sm">Imported {imported} lead(s). Closing…</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-primary-foreground"
            />
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            <div className="flex gap-2 mt-4 justify-end">
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
