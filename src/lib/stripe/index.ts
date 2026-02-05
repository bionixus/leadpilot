import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY not configured - billing features will be disabled');
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-04-30.basil' as Stripe.LatestApiVersion,
    })
  : null;

// Subscription tiers
export const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    price: 0,
    limits: {
      emailAccounts: 1,
      leads: 100,
      emailsPerMonth: 50,
    },
  },
  pro: {
    name: 'Pro',
    price: 49,
    priceId: process.env.STRIPE_PRO_PRICE_ID || '',
    limits: {
      emailAccounts: 5,
      leads: 5000,
      emailsPerMonth: -1, // unlimited
    },
  },
  enterprise: {
    name: 'Enterprise',
    price: -1, // custom
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
    limits: {
      emailAccounts: -1, // unlimited
      leads: -1, // unlimited
      emailsPerMonth: -1, // unlimited
    },
  },
} as const;

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;

export function getTierLimits(tier: string | null): {
  emailAccounts: number;
  leads: number;
  emailsPerMonth: number;
} {
  const tierKey = (tier || 'free') as SubscriptionTier;
  const tierConfig = SUBSCRIPTION_TIERS[tierKey] || SUBSCRIPTION_TIERS.free;
  return tierConfig.limits;
}

export function isWithinLimit(current: number, limit: number): boolean {
  return limit === -1 || current < limit;
}
