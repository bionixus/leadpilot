'use client';

import { useState, useEffect } from 'react';
import {
  Phone,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  MessageSquare,
  Smartphone,
  Loader2,
} from 'lucide-react';

interface MessagingAccount {
  id: string;
  provider: string;
  channel: 'whatsapp' | 'sms';
  phone_number: string;
  display_name: string;
  daily_limit: number;
  messages_sent_today: number;
  is_active: boolean;
  connection_status: string;
  created_at: string;
}

export default function MessagingAccountsPage() {
  const [accounts, setAccounts] = useState<MessagingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [formData, setFormData] = useState({
    channel: 'whatsapp' as 'whatsapp' | 'sms',
    phone_number: '',
    display_name: '',
    account_sid: '',
    auth_token: '',
    daily_limit: 100,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/messaging-accounts');
      const data = await res.json();
      if (Array.isArray(data)) {
        setAccounts(data);
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const addAccount = async () => {
    setError('');
    setAddingAccount(true);

    try {
      const res = await fetch('/api/messaging-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      setAccounts((prev) => [data, ...prev]);
      setShowAddModal(false);
      setFormData({
        channel: 'whatsapp',
        phone_number: '',
        display_name: '',
        account_sid: '',
        auth_token: '',
        daily_limit: 100,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add account';
      setError(errorMessage);
    } finally {
      setAddingAccount(false);
    }
  };

  const deleteAccount = async (id: string) => {
    if (!confirm('Are you sure you want to remove this account?')) return;

    try {
      await fetch(`/api/messaging-accounts/${id}`, { method: 'DELETE' });
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await fetch(`/api/messaging-accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      });
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, is_active: !isActive } : a)));
    } catch (error) {
      console.error('Failed to toggle:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messaging Accounts</h1>
          <p className="text-gray-500">Connect WhatsApp and SMS for multi-channel outreach</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Add Account
        </button>
      </div>

      {/* Accounts List */}
      {loading ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <Phone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-medium text-gray-900 mb-2">No messaging accounts</h3>
          <p className="text-gray-500 mb-4">
            Connect your WhatsApp or SMS provider to start multi-channel outreach
          </p>
          <button onClick={() => setShowAddModal(true)} className="text-blue-600 hover:underline">
            Add your first account
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Account
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Channel
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Usage Today
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((account) => (
                <tr key={account.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          account.channel === 'whatsapp' ? 'bg-green-100' : 'bg-blue-100'
                        }`}
                      >
                        {account.channel === 'whatsapp' ? (
                          <MessageSquare className="w-5 h-5 text-green-600" />
                        ) : (
                          <Smartphone className="w-5 h-5 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{account.display_name}</div>
                        <div className="text-sm text-gray-500">{account.phone_number}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        account.channel === 'whatsapp'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {account.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      <span className="font-medium">{account.messages_sent_today}</span>
                      <span className="text-gray-500"> / {account.daily_limit}</span>
                    </div>
                    <div className="w-32 h-2 bg-gray-200 rounded-full mt-1">
                      <div
                        className={`h-2 rounded-full ${
                          account.messages_sent_today / account.daily_limit > 0.8
                            ? 'bg-red-500'
                            : 'bg-green-500'
                        }`}
                        style={{
                          width: `${Math.min(
                            (account.messages_sent_today / account.daily_limit) * 100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {account.is_active ? (
                      <span className="flex items-center gap-1 text-green-600 text-sm">
                        <CheckCircle className="w-4 h-4" />
                        Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-gray-500 text-sm">
                        <XCircle className="w-4 h-4" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => toggleActive(account.id, account.is_active)}
                        className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                      >
                        {account.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => deleteAccount(account.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">Add Messaging Account</h2>

            <div className="space-y-4">
              {/* Channel Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Channel</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData((f) => ({ ...f, channel: 'whatsapp' }))}
                    className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 ${
                      formData.channel === 'whatsapp'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <MessageSquare className="w-6 h-6 text-green-600" />
                    <span className="text-sm font-medium">WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((f) => ({ ...f, channel: 'sms' }))}
                    className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 ${
                      formData.channel === 'sms'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Smartphone className="w-6 h-6 text-blue-600" />
                    <span className="text-sm font-medium">SMS</span>
                  </button>
                </div>
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={formData.phone_number}
                  onChange={(e) => setFormData((f) => ({ ...f, phone_number: e.target.value }))}
                  placeholder="+1234567890"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name (optional)
                </label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData((f) => ({ ...f, display_name: e.target.value }))}
                  placeholder="My WhatsApp"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>

              {/* Twilio Credentials */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="text-sm font-medium text-gray-900">Twilio Credentials</div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Account SID</label>
                  <input
                    type="text"
                    value={formData.account_sid}
                    onChange={(e) => setFormData((f) => ({ ...f, account_sid: e.target.value }))}
                    placeholder="ACxxxxx..."
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Auth Token</label>
                  <input
                    type="password"
                    value={formData.auth_token}
                    onChange={(e) => setFormData((f) => ({ ...f, auth_token: e.target.value }))}
                    placeholder="Your auth token"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              {/* Daily Limit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Daily Message Limit
                </label>
                <input
                  type="number"
                  value={formData.daily_limit}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, daily_limit: parseInt(e.target.value) }))
                  }
                  min={1}
                  max={1000}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={addAccount}
                  disabled={
                    addingAccount ||
                    !formData.phone_number ||
                    !formData.account_sid ||
                    !formData.auth_token
                  }
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {addingAccount ? 'Connecting...' : 'Connect Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
