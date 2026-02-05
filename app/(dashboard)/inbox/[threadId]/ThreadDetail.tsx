'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Message = {
  id: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  toName: string | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  classification: string | null;
  classificationConfidence: number | null;
  receivedAt: string | null;
  direction: 'inbound' | 'outbound';
  messageId: string | null;
};

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  company_name: string | null;
  status: string;
};

type Campaign = {
  id: string;
  name: string;
};

type Account = {
  id: string;
  email_address: string;
  display_name: string | null;
} | null;

const classificationColors: Record<string, string> = {
  interested: 'bg-green-100 text-green-800 border-green-200',
  question: 'bg-blue-100 text-blue-800 border-blue-200',
  not_interested: 'bg-red-100 text-red-800 border-red-200',
  bounce: 'bg-orange-100 text-orange-800 border-orange-200',
  out_of_office: 'bg-gray-100 text-gray-800 border-gray-200',
  other: 'bg-gray-100 text-gray-600 border-gray-200',
};

const classifications = [
  { value: 'interested', label: 'Interested' },
  { value: 'question', label: 'Question' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'out_of_office', label: 'Out of Office' },
  { value: 'other', label: 'Other' },
];

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ThreadDetail({
  threadId,
  messages,
  lead,
  campaign,
  account,
  replyToEmail,
  subject,
}: {
  threadId: string;
  messages: Message[];
  lead: Lead | null;
  campaign: Campaign | null;
  account: Account;
  replyToEmail: string;
  subject: string | null;
}) {
  const router = useRouter();
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [classifyingId, setClassifyingId] = useState<string | null>(null);

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);

    try {
      const res = await fetch(`/api/inbox/${threadId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: replyText,
          to_email: replyToEmail,
        }),
      });

      if (res.ok) {
        setReplyText('');
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to send reply');
      }
    } catch (err) {
      alert('Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const handleClassify = async (messageId: string, classification: string) => {
    setClassifyingId(messageId);
    try {
      await fetch(`/api/inbox/${threadId}/classify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId, classification }),
      });
      router.refresh();
    } catch {
      alert('Failed to update classification');
    } finally {
      setClassifyingId(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link
            href="/inbox"
            className="text-sm text-blue-600 hover:underline mb-2 inline-block"
          >
            &larr; Back to Inbox
          </Link>
          <h1 className="text-xl font-semibold">
            {subject || '(no subject)'}
          </h1>
        </div>
      </div>

      {/* Context */}
      {(lead || campaign) && (
        <div className="bg-gray-50 rounded-lg p-4 mb-6 flex gap-6">
          {lead && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Lead</div>
              <Link
                href={`/leads/${lead.id}`}
                className="text-blue-600 hover:underline font-medium"
              >
                {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email}
              </Link>
              {lead.company_name && (
                <span className="text-gray-500 ml-1">@ {lead.company_name}</span>
              )}
              <div className="text-xs text-gray-500 mt-1">Status: {lead.status}</div>
            </div>
          )}
          {campaign && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Campaign</div>
              <Link
                href={`/campaigns/${campaign.id}`}
                className="text-blue-600 hover:underline font-medium"
              >
                {campaign.name}
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="space-y-4 mb-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-lg border p-4 ${
              msg.direction === 'outbound'
                ? 'bg-blue-50 border-blue-100 ml-8'
                : 'bg-white'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-medium">
                  {msg.direction === 'outbound' ? 'You' : msg.fromName || msg.fromEmail}
                </div>
                <div className="text-sm text-gray-500">
                  {msg.direction === 'outbound'
                    ? `To: ${msg.toEmail}`
                    : `From: ${msg.fromEmail}`}
                </div>
              </div>
              <div className="text-sm text-gray-500">
                {formatDateTime(msg.receivedAt)}
              </div>
            </div>

            {/* Classification (for inbound) */}
            {msg.direction === 'inbound' && (
              <div className="mb-3 flex items-center gap-2">
                {msg.classification && (
                  <span
                    className={`text-xs px-2 py-1 rounded border ${
                      classificationColors[msg.classification] || classificationColors.other
                    }`}
                  >
                    {msg.classification.replace('_', ' ')}
                    {msg.classificationConfidence !== null &&
                      ` (${Math.round(msg.classificationConfidence * 100)}%)`}
                  </span>
                )}
                <select
                  value={msg.classification || ''}
                  onChange={(e) => handleClassify(msg.id, e.target.value)}
                  disabled={classifyingId === msg.id}
                  className="text-xs border rounded px-2 py-1 bg-white"
                >
                  <option value="">Set classification...</option>
                  {classifications.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Body */}
            <div className="prose prose-sm max-w-none">
              {msg.bodyHtml ? (
                <div
                  dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}
                  className="text-sm"
                />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {msg.bodyText || '(no content)'}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Reply composer */}
      <div className="bg-white rounded-lg border p-4">
        <div className="text-sm text-gray-500 mb-2">
          Reply to: {replyToEmail}
          {account && <span className="ml-2">from: {account.email_address}</span>}
        </div>
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Write your reply..."
          rows={5}
          className="w-full border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex justify-end mt-3">
          <button
            onClick={handleSendReply}
            disabled={sending || !replyText.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
          >
            {sending ? 'Sending...' : 'Send Reply'}
          </button>
        </div>
      </div>
    </div>
  );
}
