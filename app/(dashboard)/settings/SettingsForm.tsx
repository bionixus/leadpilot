'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BusinessContext } from '@/types/database';

const TONE_OPTIONS = ['professional', 'professional but warm', 'casual', 'formal'] as const;

type SettingsFormProps = {
  orgId: string;
  initialName: string;
  initialBusinessContext: BusinessContext & { key_pain_points: string[]; case_studies: string[] };
};

export function SettingsForm({ initialName, initialBusinessContext }: SettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [ctx, setCtx] = useState(initialBusinessContext);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  function updateCtx<K extends keyof BusinessContext>(key: K, value: BusinessContext[K]) {
    setCtx((prev: typeof ctx) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      const res = await fetch('/api/organizations/current', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          business_context: {
            ...ctx,
            key_pain_points: ctx.key_pain_points?.filter(Boolean) ?? [],
            case_studies: ctx.case_studies?.filter(Boolean) ?? [],
          },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: (j as { error?: string }).error ?? 'Failed to save' });
        return;
      }
      setMessage({ type: 'success', text: 'Settings saved.' });
      router.refresh();
    } catch {
      setMessage({ type: 'error', text: 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  const painPointsText = (ctx.key_pain_points ?? []).join('\n');
  const caseStudiesText = (ctx.case_studies ?? []).join('\n');

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div>
        <label htmlFor="org-name" className="block text-sm font-medium text-gray-700 mb-1">
          Organization name
        </label>
        <input
          id="org-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
        />
      </div>

      <div className="border-t pt-6">
        <h2 className="text-lg font-medium text-gray-900 mb-3">Business context (for AI sequences)</h2>
        <p className="text-sm text-gray-500 mb-4">Used to personalize generated email sequences.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company name</label>
            <input
              type="text"
              value={ctx.company_name ?? ''}
              onChange={(e) => updateCtx('company_name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
            <input
              type="text"
              value={ctx.industry ?? ''}
              onChange={(e) => updateCtx('industry', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Target audience</label>
          <input
            type="text"
            value={ctx.target_audience ?? ''}
            onChange={(e) => updateCtx('target_audience', e.target.value)}
            placeholder="e.g. Pharma brand managers, medical affairs directors"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Value proposition</label>
          <textarea
            rows={2}
            value={ctx.value_proposition ?? ''}
            onChange={(e) => updateCtx('value_proposition', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Tone</label>
          <select
            value={ctx.tone ?? 'professional'}
            onChange={(e) => updateCtx('tone', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          >
            {TONE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Key pain points (one per line)</label>
          <textarea
            rows={3}
            value={painPointsText}
            onChange={(e) => updateCtx('key_pain_points', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
            placeholder="finding the right KOLs&#10;understanding MENA regulatory landscape"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Case studies (one per line)</label>
          <textarea
            rows={2}
            value={caseStudiesText}
            onChange={(e) => updateCtx('case_studies', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
            placeholder="Helped AZ launch biologics in UAE"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Call to action (CTA)</label>
          <input
            type="text"
            value={ctx.cta ?? ''}
            onChange={(e) => updateCtx('cta', e.target.value)}
            placeholder="e.g. 15-minute discovery call"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sender name</label>
            <input
              type="text"
              value={ctx.sender_name ?? ''}
              onChange={(e) => updateCtx('sender_name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sender title</label>
            <input
              type="text"
              value={ctx.sender_title ?? ''}
              onChange={(e) => updateCtx('sender_title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Default sequence length (emails)</label>
          <input
            type="number"
            min={1}
            max={10}
            value={ctx.sequence_length ?? 3}
            onChange={(e) => updateCtx('sequence_length', parseInt(e.target.value, 10) || 3)}
            className="w-full max-w-[6rem] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="bg-primary text-primary-foreground py-2 px-4 rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  );
}
