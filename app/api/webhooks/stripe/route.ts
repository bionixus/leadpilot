import { stripe } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.client_reference_id || session.metadata?.org_id;
        const tier = session.metadata?.tier || 'pro';

        if (orgId) {
          await supabase
            .from('organizations')
            .update({
              subscription_tier: tier,
              subscription_status: 'active',
              stripe_customer_id: session.customer as string,
            } as never)
            .eq('id', orgId);

          console.log(`Subscription activated for org ${orgId}: ${tier}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find org by customer ID
        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (org) {
          const status = subscription.status === 'active' ? 'active' : subscription.status;
          await supabase
            .from('organizations')
            .update({ subscription_status: status } as never)
            .eq('id', (org as { id: string }).id);

          console.log(`Subscription updated for org ${(org as { id: string }).id}: ${status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (org) {
          // Downgrade to free
          await supabase
            .from('organizations')
            .update({
              subscription_tier: 'free',
              subscription_status: 'cancelled',
            } as never)
            .eq('id', (org as { id: string }).id);

          console.log(`Subscription cancelled for org ${(org as { id: string }).id}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (org) {
          await supabase
            .from('organizations')
            .update({ subscription_status: 'past_due' } as never)
            .eq('id', (org as { id: string }).id);

          // Optionally create a notification
          const { data: users } = await supabase
            .from('users')
            .select('id')
            .eq('org_id', (org as { id: string }).id)
            .limit(1);

          if (users && users.length > 0) {
            await supabase.from('notifications').insert({
              user_id: (users[0] as { id: string }).id,
              org_id: (org as { id: string }).id,
              type: 'billing',
              title: 'Payment failed',
              message: 'Your subscription payment failed. Please update your payment method.',
            } as never);
          }

          console.log(`Payment failed for org ${(org as { id: string }).id}`);
        }
        break;
      }

      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing Stripe webhook:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
