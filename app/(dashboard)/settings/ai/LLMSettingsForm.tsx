'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Bot, Key, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface Provider {
  id: string;
  name: string;
  models: { id: string; name: string }[];
}

interface LLMSettings {
  provider: string;
  settings: Record<string, unknown>;
  hasCustomApiKey: boolean;
  availableProviders: Provider[];
}

export function LLMSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [settings, setSettings] = useState<LLMSettings | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('anthropic');
  const [customApiKey, setCustomApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const res = await fetch('/api/settings/llm');
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data = await res.json();
      setSettings(data);
      setSelectedProvider(data.provider || 'anthropic');
    } catch (error) {
      toast.error('Failed to load LLM settings');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/settings/llm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          ...(customApiKey && { apiKey: customApiKey }),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      const data = await res.json();
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              provider: data.provider,
              settings: data.settings,
              hasCustomApiKey: data.hasCustomApiKey,
            }
          : null
      );
      setCustomApiKey('');
      toast.success('LLM settings saved successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveApiKey() {
    setSaving(true);

    try {
      const res = await fetch('/api/settings/llm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: '' }),
      });

      if (!res.ok) throw new Error('Failed to remove API key');

      setSettings((prev) => (prev ? { ...prev, hasCustomApiKey: false } : null));
      toast.success('Custom API key removed');
    } catch (error) {
      toast.error('Failed to remove API key');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/llm/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Say "Connection successful!" in one sentence.' }),
      });

      const data = await res.json();

      if (data.success) {
        setTestResult({
          success: true,
          message: `${data.provider}: ${data.response}`,
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Connection failed',
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Failed to test connection',
      });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading LLM settings...
        </div>
      </div>
    );
  }

  const currentProvider = settings?.availableProviders?.find((p) => p.id === selectedProvider);

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          AI Provider
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Provider</label>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              {settings?.availableProviders?.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>

          {currentProvider && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Available Models:</p>
              <div className="flex flex-wrap gap-2">
                {currentProvider.models.map((model) => (
                  <span key={model.id} className="px-2 py-1 bg-white border rounded text-xs text-gray-600">
                    {model.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* API Key */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-primary" />
          API Key
        </h3>

        <div className="space-y-4">
          {settings?.hasCustomApiKey ? (
            <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Custom API key configured</span>
              </div>
              <button
                onClick={handleRemoveApiKey}
                disabled={saving}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                Using LeadPilot&apos;s API key. Add your own for higher limits or specific providers.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {settings?.hasCustomApiKey ? 'Replace' : 'Add'} API Key (optional)
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary pr-20"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-500 hover:text-gray-700"
              >
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Your API key is encrypted and securely stored.
            </p>
          </div>
        </div>
      </div>

      {/* Test Connection */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold mb-4">Test Connection</h3>

        {testResult && (
          <div
            className={`mb-4 p-3 rounded-lg flex items-start gap-2 ${
              testResult.success
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {testResult.success ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            )}
            <span className="text-sm">{testResult.message}</span>
          </div>
        )}

        <button
          onClick={handleTestConnection}
          disabled={testing}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm flex items-center gap-2"
        >
          {testing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Testing...
            </>
          ) : (
            'Test Connection'
          )}
        </button>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </button>
      </div>
    </div>
  );
}
