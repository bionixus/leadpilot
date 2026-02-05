'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Play, Pause, MoreHorizontal, Edit2, Trash2 } from 'lucide-react';

type Props = {
  campaignId: string;
  status: string;
};

export function CampaignRowActions({ campaignId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleStart() {
    setLoading('start');
    try {
      await fetch(`/api/campaigns/${campaignId}/start`, { method: 'POST' });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function handlePause() {
    setLoading('pause');
    try {
      await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paused' }),
      });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete() {
    setLoading('delete');
    try {
      await fetch(`/api/campaigns/${campaignId}`, { method: 'DELETE' });
      router.push('/');
      router.refresh();
    } finally {
      setLoading(null);
      setConfirmDelete(false);
    }
  }

  const busy = loading !== null;

  return (
    <>
      <div className="flex items-center gap-2">
        {status === 'active' && (
          <button
            type="button"
            onClick={handlePause}
            disabled={busy}
            className="p-1.5 text-gray-400 hover:text-yellow-600 rounded hover:bg-gray-100"
            title="Pause"
          >
            <Pause className="w-4 h-4" />
          </button>
        )}
        {(status === 'draft' || status === 'paused') && (
          <button
            type="button"
            onClick={handleStart}
            disabled={busy}
            className="p-1.5 text-gray-400 hover:text-green-600 rounded hover:bg-gray-100"
            title="Start"
          >
            <Play className="w-4 h-4" />
          </button>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
            title="More"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                aria-hidden
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 py-1 w-40 bg-white border rounded-lg shadow-lg z-20">
                <Link
                  href={`/campaigns/${campaignId}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setMenuOpen(false)}
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="font-semibold mb-2">Delete campaign?</h3>
            <p className="text-gray-500 text-sm mb-4">This will remove the campaign from the list.</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="py-2 px-4 rounded-lg border"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={loading === 'delete'}
                className="py-2 px-4 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
