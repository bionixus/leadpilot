'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Mail,
  Plus,
  Wifi,
  RefreshCw,
  Unplug,
  X,
  Server,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

const PROVIDER_LABELS: Record<string, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  custom: 'Custom IMAP/SMTP',
};

const STATUS_STYLES: Record<string, string> = {
  connected: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  error: 'bg-red-100 text-red-700',
};

type Account = {
  id: string;
  email_address: string;
  display_name: string | null;
  provider: string;
  connection_status: string | null;
  last_error: string | null;
  last_synced_at: string | null;
  daily_send_limit: number | null;
  emails_sent_today: number | null;
  is_active: boolean | null;
  created_at: string;
};

type Props = {
  accounts: Account[];
  flashConnected?: boolean;
  flashError?: string | null;
};

export function EmailAccountsClient({ accounts, flashConnected, flashError }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (flashConnected) {
      setMessage({ type: 'success', text: 'Email account connected successfully.' });
      router.replace('/email-accounts', { scroll: false });
    }
  }, [flashConnected, router]);

  useEffect(() => {
    if (flashError) {
      setMessage({ type: 'error', text: decodeURIComponent(flashError) });
      router.replace('/email-accounts', { scroll: false });
    }
  }, [flashError, router]);

  async function handleTest(id: string) {
    setActionLoading(`test-${id}`);
    setMessage(null);
    try {
      const res = await fetch(`/api/email-accounts/${id}/test`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (data.ok) {
        setMessage({ type: 'success', text: 'Connection test passed.' });
        router.refresh();
      } else {
        setMessage({ type: 'error', text: data.error ?? 'Test failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Test request failed' });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSync(id: string) {
    setActionLoading(`sync-${id}`);
    setMessage(null);
    try {
      const res = await fetch(`/api/email-accounts/${id}/sync`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (data.ok) {
        setMessage({ type: 'success', text: data.message ?? 'Sync triggered.' });
        router.refresh();
      } else {
        setMessage({ type: 'error', text: data.error ?? 'Sync failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Sync request failed' });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDisconnect(id: string) {
    setActionLoading(`delete-${id}`);
    setMessage(null);
    try {
      const res = await fetch(`/api/email-accounts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Account disconnected.' });
        setDisconnectId(null);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: (data as { error?: string }).error ?? 'Failed to disconnect' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Request failed' });
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
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

      {/* Connect options */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-medium mb-3">Connect account</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/api/auth/connect/google"
            className="inline-flex items-center gap-2 py-2.5 px-4 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm font-medium"
          >
            <Mail className="w-5 h-5" />
            Connect Gmail
          </Link>
          <Link
            href="/api/auth/connect/microsoft"
            className="inline-flex items-center gap-2 py-2.5 px-4 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm font-medium"
          >
            <Mail className="w-5 h-5" />
            Connect Outlook
          </Link>
          <button
            type="button"
            onClick={() => setShowCustomForm(true)}
            className="inline-flex items-center gap-2 py-2.5 px-4 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm font-medium"
          >
            <Server className="w-5 h-5" />
            Add custom IMAP/SMTP
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <h2 className="font-medium p-4 border-b">Connected accounts</h2>
        {accounts.length === 0 ? (
          <p className="p-6 text-gray-500 text-sm">No email accounts yet. Connect one above.</p>
        ) : (
          <ul className="divide-y">
            {accounts.map((acc) => (
              <li key={acc.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {acc.display_name || acc.email_address}
                    {acc.display_name && (
                      <span className="text-gray-500 font-normal ml-1">({acc.email_address})</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-gray-500">{PROVIDER_LABELS[acc.provider] ?? acc.provider}</span>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        STATUS_STYLES[acc.connection_status ?? 'pending'] ?? STATUS_STYLES.pending
                      }`}
                    >
                      {acc.connection_status ?? 'pending'}
                    </span>
                    {acc.last_synced_at && (
                      <span className="text-xs text-gray-400">Synced {formatDate(acc.last_synced_at)}</span>
                    )}
                    {acc.last_error && (
                      <span className="text-xs text-red-600 truncate max-w-[200px]" title={acc.last_error}>
                        {acc.last_error}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleTest(acc.id)}
                    disabled={actionLoading !== null}
                    className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm disabled:opacity-50"
                    title="Test connection"
                  >
                    {actionLoading === `test-${acc.id}` ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wifi className="w-4 h-4" />
                    )}
                    Test
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSync(acc.id)}
                    disabled={actionLoading !== null}
                    className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm disabled:opacity-50"
                    title="Sync"
                  >
                    {actionLoading === `sync-${acc.id}` ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Sync
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisconnectId(acc.id)}
                    disabled={actionLoading !== null}
                    className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-sm disabled:opacity-50"
                    title="Disconnect"
                  >
                    <Unplug className="w-4 h-4" />
                    Disconnect
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showCustomForm && (
        <CustomAccountModal
          onClose={() => {
            setShowCustomForm(false);
            router.refresh();
          }}
        />
      )}

      {disconnectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="font-semibold mb-2">Disconnect this account?</h3>
            <p className="text-gray-500 text-sm mb-4">
              You will need to reconnect to send or sync from this account again.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDisconnectId(null)}
                className="py-2 px-4 rounded-lg border"
              >
                Cancel
              </button>
              <button
                onClick={() => disconnectId && handleDisconnect(disconnectId)}
                disabled={actionLoading !== null}
                className="py-2 px-4 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading === `delete-${disconnectId}` ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomAccountModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email_address, setEmail_address] = useState('');
  const [display_name, setDisplay_name] = useState('');
  const [imap_host, setImap_host] = useState('');
  const [imap_port, setImap_port] = useState(993);
  const [imap_secure, setImap_secure] = useState(true);
  const [smtp_host, setSmtp_host] = useState('');
  const [smtp_port, setSmtp_port] = useState(587);
  const [smtp_secure, setSmtp_secure] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email_address.trim()) {
      setError('Email address is required');
      return;
    }
    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }
    if (!imap_host.trim() || !smtp_host.trim()) {
      setError('IMAP and SMTP host are required');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/email-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'custom',
          email_address: email_address.trim(),
          display_name: display_name.trim() || null,
          imap_host: imap_host.trim(),
          imap_port,
          imap_secure,
          smtp_host: smtp_host.trim(),
          smtp_port,
          smtp_secure,
          username: username.trim(),
          password,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Failed to add account');
        setLoading(false);
        return;
      }
      onClose();
    } catch {
      setError('Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl p-6 max-w-lg w-full my-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Add custom IMAP/SMTP account</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email address (from)</label>
            <input
              type="email"
              value={email_address}
              onChange={(e) => setEmail_address(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display name (optional)</label>
            <input
              type="text"
              value={display_name}
              onChange={(e) => setDisplay_name(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Your Name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IMAP host</label>
              <input
                type="text"
                value={imap_host}
                onChange={(e) => setImap_host(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="imap.example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IMAP port</label>
              <input
                type="number"
                value={imap_port}
                onChange={(e) => setImap_port(parseInt(e.target.value, 10) || 993)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="imap_secure"
              checked={imap_secure}
              onChange={(e) => setImap_secure(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="imap_secure" className="text-sm text-gray-700">IMAP SSL/TLS</label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SMTP host</label>
              <input
                type="text"
                value={smtp_host}
                onChange={(e) => setSmtp_host(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="smtp.example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SMTP port</label>
              <input
                type="number"
                value={smtp_port}
                onChange={(e) => setSmtp_port(parseInt(e.target.value, 10) || 587)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="smtp_secure"
              checked={smtp_secure}
              onChange={(e) => setSmtp_secure(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="smtp_secure" className="text-sm text-gray-700">SMTP SSL/TLS</label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Often same as email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="App password or account password"
              autoComplete="new-password"
            />
            <p className="text-xs text-gray-500 mt-1">Stored encrypted. Never shown after save.</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="py-2 px-4 rounded-lg border">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="py-2 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Adding…' : 'Add account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
