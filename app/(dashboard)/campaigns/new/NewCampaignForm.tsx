'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const SOURCES = [
  { value: 'manual', label: 'Manual' },
  { value: 'csv', label: 'CSV' },
  { value: 'google_sheets', label: 'Google Sheets' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'apollo', label: 'Apollo' },
  { value: 'google_maps', label: 'Google Maps' },
] as const;

const DEFAULT_SETTINGS = {
  sequence_length: 3,
  delay_between_emails_days: [0, 3, 5],
  stop_on_reply: true,
  track_opens: true,
  timezone: 'UTC',
  send_window_start: '09:00',
  send_window_end: '17:00',
};

type EmailAccount = { id: string; email_address: string; display_name: string | null };

type Props = { emailAccounts: EmailAccount[] };

export function NewCampaignForm({ emailAccounts }: Props) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<string>('manual');
  const [emailAccountId, setEmailAccountId] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sequenceLength, setSequenceLength] = useState(3);
  const [delayDays, setDelayDays] = useState('0, 3, 5');
  const [stopOnReply, setStopOnReply] = useState(true);
  const [timezone, setTimezone] = useState('UTC');
  const [sendWindowStart, setSendWindowStart] = useState('09:00');
  const [sendWindowEnd, setSendWindowEnd] = useState('17:00');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    const delayArray = delayDays
      .split(/[\s,]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    if (delayArray.length === 0) delayArray.push(0, 3, 5);

    setLoading(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          source,
          source_config: {},
          email_account_id: emailAccountId || null,
          status: 'draft',
          settings: {
            ...DEFAULT_SETTINGS,
            sequence_length: sequenceLength,
            delay_between_emails_days: delayArray,
            stop_on_reply: stopOnReply,
            timezone,
            send_window_start: sendWindowStart,
            send_window_end: sendWindowEnd,
          },
          llm_context: {},
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Failed to create campaign');
        setLoading(false);
        return;
      }
      router.push(`/campaigns/${(data as { id: string }).id}`);
      router.refresh();
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Name *
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          placeholder="e.g. Q1 Outreach"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          id="description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          placeholder="Optional"
        />
      </div>

      <div>
        <label htmlFor="source" className="block text-sm font-medium text-gray-700 mb-1">
          Source *
        </label>
        <select
          id="source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
        >
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="email_account" className="block text-sm font-medium text-gray-700 mb-1">
          Send from (email account)
        </label>
        <select
          id="email_account"
          value={emailAccountId}
          onChange={(e) => setEmailAccountId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
        >
          <option value="">Select later</option>
          {emailAccounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.display_name || acc.email_address}
            </option>
          ))}
        </select>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-primary hover:underline"
        >
          {showAdvanced ? 'Hide' : 'Show'} advanced settings
        </button>
        {showAdvanced && (
          <div className="mt-4 p-4 border border-gray-200 rounded-lg space-y-4 bg-gray-50/50">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sequence length</label>
              <input
                type="number"
                min={1}
                max={10}
                value={sequenceLength}
                onChange={(e) => setSequenceLength(parseInt(e.target.value, 10) || 3)}
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delay between emails (days, comma-separated)</label>
              <input
                type="text"
                value={delayDays}
                onChange={(e) => setDelayDays(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="0, 3, 5"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="stop_on_reply"
                checked={stopOnReply}
                onChange={(e) => setStopOnReply(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="stop_on_reply" className="text-sm text-gray-700">Stop on reply</label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full max-w-[12rem] px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send window start</label>
                <input
                  type="time"
                  value={sendWindowStart}
                  onChange={(e) => setSendWindowStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send window end</label>
                <input
                  type="time"
                  value={sendWindowEnd}
                  onChange={(e) => setSendWindowEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="bg-primary text-primary-foreground py-2 px-4 rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create campaign'}
        </button>
        <Link
          href="/"
          className="py-2 px-4 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
