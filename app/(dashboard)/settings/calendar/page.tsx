'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Calendar,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
  Settings,
} from 'lucide-react';

interface CalendarAccount {
  id: string;
  provider: 'google' | 'cal_com' | 'calendly';
  name: string;
  email?: string;
  scheduling_url?: string;
  default_duration_minutes: number;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

const PROVIDER_INFO = {
  google: {
    name: 'Google Calendar',
    icon: '📅',
    color: 'bg-blue-100 text-blue-700',
    connectText: 'Connect Google Calendar',
  },
  cal_com: {
    name: 'Cal.com',
    icon: '📆',
    color: 'bg-purple-100 text-purple-700',
    connectText: 'Connect Cal.com',
  },
  calendly: {
    name: 'Calendly',
    icon: '🗓️',
    color: 'bg-green-100 text-green-700',
    connectText: 'Connect Calendly',
  },
};

export default function CalendarSettingsPage() {
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'google' | 'cal_com' | 'calendly' | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [schedulingUrl, setSchedulingUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  
  const searchParams = useSearchParams();

  useEffect(() => {
    loadAccounts();
    
    // Check for OAuth callback result
    const success = searchParams.get('success');
    const errorParam = searchParams.get('error');
    
    if (success) {
      // Show success toast
      console.log('Calendar connected successfully');
    }
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    }
  }, [searchParams]);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/calendar/accounts');
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  const connectGoogle = () => {
    // Redirect to Google OAuth
    window.location.href = '/api/auth/connect/calendar-google';
  };

  const connectCalendly = () => {
    // Redirect to Calendly OAuth
    window.location.href = '/api/auth/connect/calendar-calendly';
  };

  const connectCalCom = async () => {
    if (!apiKey) {
      setError('API key is required');
      return;
    }

    setConnecting(true);
    setError('');

    try {
      const res = await fetch('/api/calendar/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'cal_com',
          name: 'Cal.com',
          api_key: apiKey,
          scheduling_url: schedulingUrl,
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Failed to connect');
        return;
      }

      setAccounts(prev => [data, ...prev]);
      setShowAddModal(false);
      setSelectedProvider(null);
      setApiKey('');
      setSchedulingUrl('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const deleteAccount = async (id: string) => {
    if (!confirm('Are you sure you want to disconnect this calendar?')) return;

    try {
      await fetch(`/api/calendar/accounts/${id}`, { method: 'DELETE' });
      setAccounts(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const setDefault = async (id: string) => {
    try {
      await fetch(`/api/calendar/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      });
      loadAccounts();
    } catch (err) {
      console.error('Failed to set default:', err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendar Integration</h1>
          <p className="text-gray-500">Connect your calendar to automatically book meetings with leads</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Connect Calendar
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Accounts List */}
      {loading ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-medium text-gray-900 mb-2">No calendars connected</h3>
          <p className="text-gray-500 mb-4">
            Connect a calendar to enable automatic meeting booking
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="text-blue-600 hover:underline"
          >
            Connect your first calendar
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="divide-y">
            {accounts.map((account) => {
              const info = PROVIDER_INFO[account.provider];
              return (
                <div key={account.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${info.color}`}>
                      <span className="text-2xl">{info.icon}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{account.name}</span>
                        {account.is_default && (
                          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                            Default
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{info.name}</div>
                      {account.email && (
                        <div className="text-sm text-gray-400">{account.email}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {account.scheduling_url && (
                      <a
                        href={account.scheduling_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Booking Link
                      </a>
                    )}
                    
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <Clock className="w-4 h-4" />
                      {account.default_duration_minutes}min
                    </div>

                    {account.is_active ? (
                      <span className="flex items-center gap-1 text-sm text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-sm text-gray-400">
                        <XCircle className="w-4 h-4" />
                        Inactive
                      </span>
                    )}

                    <div className="flex items-center gap-1 border-l pl-3 ml-2">
                      {!account.is_default && (
                        <button
                          onClick={() => setDefault(account.id)}
                          className="p-2 text-gray-500 hover:bg-gray-100 rounded"
                          title="Set as default"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteAccount(account.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded"
                        title="Disconnect"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Features Info */}
      <div className="bg-gray-50 rounded-xl border p-6">
        <h3 className="font-medium text-gray-900 mb-4">What you can do with calendar integration:</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
            <div>
              <div className="font-medium">Automatic Meeting Booking</div>
              <div className="text-sm text-gray-500">Agent books meetings when leads show interest</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
            <div>
              <div className="font-medium">Smart Availability</div>
              <div className="text-sm text-gray-500">Shows only times when you're free</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
            <div>
              <div className="font-medium">Meeting Reminders</div>
              <div className="text-sm text-gray-500">Automated 24h and 1h reminders to leads</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
            <div>
              <div className="font-medium">Video Conferencing</div>
              <div className="text-sm text-gray-500">Auto-generates Google Meet / Zoom links</div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Calendar Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">Connect Calendar</h2>

            {!selectedProvider ? (
              <div className="space-y-3">
                <p className="text-gray-500 mb-4">Choose your calendar provider:</p>
                
                <button
                  onClick={connectGoogle}
                  className="w-full p-4 border-2 rounded-xl flex items-center gap-4 hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  <span className="text-3xl">📅</span>
                  <div className="text-left">
                    <div className="font-medium">Google Calendar</div>
                    <div className="text-sm text-gray-500">Connect via Google account</div>
                  </div>
                </button>

                <button
                  onClick={() => setSelectedProvider('cal_com')}
                  className="w-full p-4 border-2 rounded-xl flex items-center gap-4 hover:border-purple-500 hover:bg-purple-50 transition-colors"
                >
                  <span className="text-3xl">📆</span>
                  <div className="text-left">
                    <div className="font-medium">Cal.com</div>
                    <div className="text-sm text-gray-500">Connect with API key</div>
                  </div>
                </button>

                <button
                  onClick={connectCalendly}
                  className="w-full p-4 border-2 rounded-xl flex items-center gap-4 hover:border-green-500 hover:bg-green-50 transition-colors"
                >
                  <span className="text-3xl">🗓️</span>
                  <div className="text-left">
                    <div className="font-medium">Calendly</div>
                    <div className="text-sm text-gray-500">Connect via Calendly account</div>
                  </div>
                </button>

                <button
                  onClick={() => setShowAddModal(false)}
                  className="w-full mt-4 py-2 text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            ) : selectedProvider === 'cal_com' ? (
              <div className="space-y-4">
                <p className="text-gray-500">
                  Get your API key from{' '}
                  <a
                    href="https://app.cal.com/settings/developer/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Cal.com Settings → Developer → API Keys
                  </a>
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="cal_live_..."
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Scheduling URL (optional)
                  </label>
                  <input
                    type="url"
                    value={schedulingUrl}
                    onChange={(e) => setSchedulingUrl(e.target.value)}
                    placeholder="https://cal.com/yourname/30min"
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setSelectedProvider(null);
                      setApiKey('');
                      setSchedulingUrl('');
                      setError('');
                    }}
                    className="flex-1 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={connectCalCom}
                    disabled={connecting || !apiKey}
                    className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {connecting ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
