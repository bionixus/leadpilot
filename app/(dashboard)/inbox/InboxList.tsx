'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  company_name: string | null;
};

type Campaign = {
  id: string;
  name: string;
};

type ThreadItem = {
  id: string;
  threadId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  snippet: string | null;
  classification: string | null;
  isRead: boolean;
  isStarred: boolean;
  receivedAt: string | null;
  direction: string;
  lead: Lead | null;
  campaign: Campaign | null;
};

const classificationColors: Record<string, string> = {
  interested: 'bg-green-100 text-green-800',
  question: 'bg-blue-100 text-blue-800',
  not_interested: 'bg-red-100 text-red-800',
  bounce: 'bg-orange-100 text-orange-800',
  out_of_office: 'bg-gray-100 text-gray-800',
  other: 'bg-gray-100 text-gray-600',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

export default function InboxList({ threads }: { threads: ThreadItem[] }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleMarkRead = async () => {
    // Bulk mark as read
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await fetch(`/api/inbox/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_read: true }),
      });
    }
    setSelectedIds(new Set());
    router.refresh();
  };

  const handleArchive = async () => {
    // Bulk archive
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await fetch(`/api/inbox/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: true }),
      });
    }
    setSelectedIds(new Set());
    router.refresh();
  };

  if (threads.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <p className="text-gray-500">No messages yet</p>
        <p className="text-sm text-gray-400 mt-1">
          Messages from your leads will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {selectedIds.size > 0 && (
        <div className="p-3 bg-gray-50 border-b flex items-center gap-4">
          <span className="text-sm text-gray-600">{selectedIds.size} selected</span>
          <button
            onClick={handleMarkRead}
            className="text-sm text-blue-600 hover:underline"
          >
            Mark read
          </button>
          <button
            onClick={handleArchive}
            className="text-sm text-red-600 hover:underline"
          >
            Archive
          </button>
        </div>
      )}

      <div className="divide-y">
        {threads.map((thread) => {
          const displayName = thread.lead
            ? [thread.lead.first_name, thread.lead.last_name].filter(Boolean).join(' ') ||
              thread.lead.email
            : thread.fromName || thread.fromEmail;

          const company = thread.lead?.company_name;

          return (
            <div
              key={thread.threadId}
              className={`flex items-start gap-4 p-4 hover:bg-gray-50 cursor-pointer ${
                !thread.isRead ? 'bg-blue-50/50' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(thread.threadId)}
                onChange={() => toggleSelect(thread.threadId)}
                className="mt-1"
                onClick={(e) => e.stopPropagation()}
              />

              <Link
                href={`/inbox/${thread.threadId}`}
                className="flex-1 min-w-0"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`font-medium truncate ${
                      !thread.isRead ? 'text-gray-900' : 'text-gray-700'
                    }`}
                  >
                    {displayName}
                  </span>
                  {company && (
                    <span className="text-sm text-gray-500 truncate">
                      @ {company}
                    </span>
                  )}
                  {thread.classification && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        classificationColors[thread.classification] ||
                        classificationColors.other
                      }`}
                    >
                      {thread.classification.replace('_', ' ')}
                    </span>
                  )}
                </div>

                <div
                  className={`text-sm truncate ${
                    !thread.isRead ? 'text-gray-800' : 'text-gray-600'
                  }`}
                >
                  {thread.subject || '(no subject)'}
                </div>

                <div className="text-sm text-gray-500 truncate mt-0.5">
                  {thread.snippet || ''}
                </div>

                {thread.campaign && (
                  <div className="text-xs text-gray-400 mt-1">
                    Campaign: {thread.campaign.name}
                  </div>
                )}
              </Link>

              <div className="text-xs text-gray-500 whitespace-nowrap">
                {formatDate(thread.receivedAt)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
