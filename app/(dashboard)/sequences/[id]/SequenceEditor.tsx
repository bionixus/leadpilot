'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Clock,
  Edit2,
  RefreshCw,
  Save,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

type SequenceEmail = {
  step: number;
  delay_days: number;
  subject: string;
  body: string;
};

type Sequence = {
  id: string;
  emails: SequenceEmail[];
  current_step: number;
  is_complete: boolean;
  stopped_reason: string | null;
  approved_at: string | null;
  generated_at: string | null;
  created_at: string;
};

type Props = {
  sequence: Sequence;
  campaignId: string;
  leadId: string;
  userId: string;
};

export function SequenceEditor({ sequence, campaignId, leadId, userId }: Props) {
  const router = useRouter();
  const [emails, setEmails] = useState<SequenceEmail[]>(sequence.emails);
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isApproved = !!sequence.approved_at;

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/sequences/${sequence.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setMessage({ type: 'success', text: 'Changes saved.' });
      setEditingStep(null);
      router.refresh();
    } catch {
      setMessage({ type: 'error', text: 'Failed to save changes.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/sequences/${sequence.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved_at: new Date().toISOString(),
          approved_by: userId,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setMessage({ type: 'success', text: 'Sequence approved. It is now ready to send.' });
      router.refresh();
    } catch {
      setMessage({ type: 'error', text: 'Failed to approve.' });
    } finally {
      setApproving(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/sequences/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, lead_id: leadId }),
      });
      const data = (await res.json()) as { sequence?: { emails: SequenceEmail[] }; error?: string };
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? 'Failed to regenerate' });
        return;
      }
      if (data.sequence?.emails) {
        setEmails(data.sequence.emails);
      }
      setMessage({ type: 'success', text: 'Sequence regenerated.' });
      router.refresh();
    } catch {
      setMessage({ type: 'error', text: 'Request failed.' });
    } finally {
      setRegenerating(false);
    }
  }

  function updateEmail(step: number, field: 'subject' | 'body' | 'delay_days', value: string | number) {
    setEmails((prev) =>
      prev.map((e) => (e.step === step ? { ...e, [field]: value } : e))
    );
  }

  function getStepStatus(step: number) {
    if (sequence.is_complete) return 'completed';
    if (step <= sequence.current_step) return 'sent';
    return 'pending';
  }

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            {isApproved ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <CheckCircle2 className="w-4 h-4" />
                Approved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                <Clock className="w-4 h-4" />
                Draft
              </span>
            )}
          </div>
          <div className="text-sm text-gray-500">
            Progress: {sequence.current_step}/{emails.length} steps
          </div>
          {sequence.is_complete && (
            <span className="text-sm text-gray-500">
              ({sequence.stopped_reason ?? 'Completed'})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating || saving}
            className="inline-flex items-center gap-2 py-2 px-3 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm disabled:opacity-50"
          >
            {regenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Regenerate
          </button>
          {!isApproved && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={approving || saving}
              className="inline-flex items-center gap-2 py-2 px-3 rounded-lg bg-green-600 text-white hover:bg-green-700 text-sm disabled:opacity-50"
            >
              {approving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Approve
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Email steps */}
      <div className="space-y-4">
        {emails.map((email, idx) => {
          const status = getStepStatus(email.step);
          const isEditing = editingStep === email.step;

          return (
            <div
              key={email.step}
              className={`bg-white rounded-xl border p-6 ${
                status === 'sent' ? 'border-green-200' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-sm font-medium">
                    {email.step}
                  </span>
                  <div>
                    <h3 className="font-medium">Step {email.step}</h3>
                    <p className="text-xs text-gray-500">
                      {email.delay_days === 0 ? 'Send immediately' : `Wait ${email.delay_days} day(s)`}
                      {status === 'sent' && (
                        <span className="ml-2 text-green-600">Sent</span>
                      )}
                    </p>
                  </div>
                </div>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => setEditingStep(email.step)}
                    className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Delay (days)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={email.delay_days}
                      onChange={(e) =>
                        updateEmail(email.step, 'delay_days', parseInt(e.target.value, 10) || 0)
                      }
                      className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={email.subject}
                      onChange={(e) => updateEmail(email.step, 'subject', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Body
                    </label>
                    <textarea
                      rows={6}
                      value={email.body}
                      onChange={(e) => updateEmail(email.step, 'body', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="inline-flex items-center gap-2 py-2 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmails(sequence.emails);
                        setEditingStep(null);
                      }}
                      className="py-2 px-4 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-gray-800 mb-2">{email.subject}</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{email.body}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Metadata */}
      <p className="text-xs text-gray-400">
        Generated {sequence.generated_at ? formatDate(sequence.generated_at) : formatDate(sequence.created_at)}
      </p>
    </div>
  );
}
