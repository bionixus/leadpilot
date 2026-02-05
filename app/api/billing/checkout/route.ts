import { createServerSupabaseClient } from '@/lib/supabase/server';
import { stripe, SUBSCRIPTION_TIERS } from '@/lib/stripe';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow } = await supabase
    .from('users')
    .select('org_id, organizations(*)')
    .eq('auth_id', user.id)
    .single();

  const orgId = (userRow as { org_id?: string | null } | null)?.org_id;
  const org = (userRow as { organizations?: { id: string; stripe_customer_id?: string | null } | null } | null)?.organizations;

  if (!orgId || !org) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const tier = (body as { tier?: string }).tier || 'pro';

  const tierConfig = SUBSCRIPTION_TIERS[tier as keyof typeof SUBSCRIPTION_TIERS];
  if (!tierConfig || !('priceId' in tierConfig) || !tierConfig.priceId) {
    return NextResponse.json({ error: 'Invalid tier or price not configured' }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    // Create or reuse Stripe customer
    let customerId = org.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { org_id: orgId },
      });
      customerId = customer.id;

      // Save customer ID
      await supabase
        .from('organizations')
        .update({ stripe_customer_id: customerId } as never)
        .eq('id', orgId);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: tierConfig.priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/settings/billing?success=1`,
      cancel_url: `${appUrl}/settings/billing?canceled=1`,
      client_reference_id: orgId,
      metadata: { org_id: orgId, tier },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
