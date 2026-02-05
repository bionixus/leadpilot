'use client';

import { useState, useEffect } from 'react';
import { Check, CreditCard, AlertCircle, ExternalLink } from 'lucide-react';
import { SUBSCRIPTION_TIERS } from '@/lib/stripe';

type Props = {
  org: {
    id: string;
    name: string;
    subscriptionTier: string;
    subscriptionStatus: string | null;
    hasStripeCustomer: boolean;
  };
  usage: {
    emailAccounts: number;
    leads: number;
    emailsThisMonth: number;
  };
  showSuccess?: boolean;
  showCanceled?: boolean;
};

export default function BillingSettings({ org, usage, showSuccess, showCanceled }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (showSuccess) {
      setMessage({ type: 'success', text: 'Your subscription has been activated!' });
    } else if (showCanceled) {
      setMessage({ type: 'info', text: 'Checkout was canceled.' });
    }
  }, [showSuccess, showCanceled]);

  const currentTier = SUBSCRIPTION_TIERS[org.subscriptionTier as keyof typeof SUBSCRIPTION_TIERS] || SUBSCRIPTION_TIERS.free;
  const limits = currentTier.limits;

  async function handleUpgrade(tier: string) {
    setLoading(tier);
    setMessage(null);

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error((data as { error?: string }).error || 'Failed to create checkout');
      }

      // Redirect to Stripe Checkout
      window.location.href = (data as { url: string }).url;
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to upgrade' });
      setLoading(null);
    }
  }

  async function handleManageSubscription() {
    setLoading('manage');
    setMessage(null);

    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error((data as { error?: string }).error || 'Failed to open portal');
      }

      window.location.href = (data as { url: string }).url;
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to open portal' });
      setLoading(null);
    }
  }

  const formatLimit = (value: number) => (value === -1 ? 'Unlimited' : value.toLocaleString());

  return (
    <div className="space-y-6">
      {/* Alert Messages */}
      {message && (
        <div
          className={`p-4 rounded-lg flex items-start gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800'
              : message.type === 'error'
              ? 'bg-red-50 text-red-800'
              : 'bg-blue-50 text-blue-800'
          }`}
        >
          {message.type === 'success' ? (
            <Check className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Past Due Warning */}
      {org.subscriptionStatus === 'past_due' && (
        <div className="p-4 rounded-lg bg-yellow-50 text-yellow-800 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-medium">Payment failed</p>
            <p className="text-sm">Please update your payment method to avoid service interruption.</p>
          </div>
        </div>
      )}

      {/* Current Plan */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-medium text-lg">Current Plan</h2>
            <p className="text-sm text-gray-500">
              {org.name} is on the <span className="font-medium">{currentTier.name}</span> plan
            </p>
          </div>
          {org.subscriptionTier !== 'free' && org.hasStripeCustomer && (
            <button
              onClick={handleManageSubscription}
              disabled={loading === 'manage'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" />
              {loading === 'manage' ? 'Loading...' : 'Manage Subscription'}
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Usage Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <UsageCard
            label="Email Accounts"
            used={usage.emailAccounts}
            limit={limits.emailAccounts}
          />
          <UsageCard
            label="Total Leads"
            used={usage.leads}
            limit={limits.leads}
          />
          <UsageCard
            label="Emails This Month"
            used={usage.emailsThisMonth}
            limit={limits.emailsPerMonth}
          />
        </div>
      </div>

      {/* Pricing Plans */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-medium text-lg mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Free Plan */}
          <div
            className={`rounded-xl border-2 p-6 ${
              org.subscriptionTier === 'free' ? 'border-primary bg-primary/5' : 'border-gray-200'
            }`}
          >
            <h3 className="font-semibold text-lg">Free</h3>
            <p className="text-3xl font-bold mt-2">
              $0<span className="text-sm font-normal text-gray-500">/month</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                1 email account
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                100 leads
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                50 emails/month
              </li>
            </ul>
            {org.subscriptionTier === 'free' && (
              <div className="mt-4 px-4 py-2 rounded-lg bg-gray-100 text-center text-sm font-medium">
                Current Plan
              </div>
            )}
          </div>

          {/* Pro Plan */}
          <div
            className={`rounded-xl border-2 p-6 ${
              org.subscriptionTier === 'pro' ? 'border-primary bg-primary/5' : 'border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Pro</h3>
              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
                Popular
              </span>
            </div>
            <p className="text-3xl font-bold mt-2">
              $49<span className="text-sm font-normal text-gray-500">/month</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                5 email accounts
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                5,000 leads
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Unlimited emails
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Priority support
              </li>
            </ul>
            {org.subscriptionTier === 'pro' ? (
              <div className="mt-4 px-4 py-2 rounded-lg bg-gray-100 text-center text-sm font-medium">
                Current Plan
              </div>
            ) : (
              <button
                onClick={() => handleUpgrade('pro')}
                disabled={loading === 'pro'}
                className="mt-4 w-full px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
              >
                {loading === 'pro' ? 'Loading...' : 'Upgrade to Pro'}
              </button>
            )}
          </div>

          {/* Enterprise Plan */}
          <div
            className={`rounded-xl border-2 p-6 ${
              org.subscriptionTier === 'enterprise' ? 'border-primary bg-primary/5' : 'border-gray-200'
            }`}
          >
            <h3 className="font-semibold text-lg">Enterprise</h3>
            <p className="text-3xl font-bold mt-2">
              Custom<span className="text-sm font-normal text-gray-500">/month</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Unlimited accounts
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Unlimited leads
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Unlimited emails
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Dedicated support
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Custom integrations
              </li>
            </ul>
            {org.subscriptionTier === 'enterprise' ? (
              <div className="mt-4 px-4 py-2 rounded-lg bg-gray-100 text-center text-sm font-medium">
                Current Plan
              </div>
            ) : (
              <a
                href="mailto:sales@leadpilot.io"
                className="mt-4 block w-full px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-center text-sm font-medium"
              >
                Contact Sales
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UsageCard({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const isUnlimited = limit === -1;
  const percentage = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);
  const isNearLimit = !isUnlimited && percentage >= 80;
  const isAtLimit = !isUnlimited && used >= limit;

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-sm font-medium">
          {used.toLocaleString()} / {isUnlimited ? '∞' : limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isAtLimit ? 'bg-red-500' : isNearLimit ? 'bg-yellow-500' : 'bg-primary'
          }`}
          style={{ width: isUnlimited ? '0%' : `${percentage}%` }}
        />
      </div>
      {isAtLimit && (
        <p className="text-xs text-red-600 mt-1">Limit reached. Upgrade to continue.</p>
      )}
    </div>
  );
}
