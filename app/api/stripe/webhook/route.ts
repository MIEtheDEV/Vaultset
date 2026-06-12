import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/utils/stripe";
import { createAdminClient } from "@/utils/supabase/admin";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Webhook signature verification failed" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session    = event.data.object as Stripe.Checkout.Session;
        const userId     = session.client_reference_id;
        const customerId = session.customer as string | null;

        if (userId && customerId) {
          const update: Record<string, unknown> = { stripe_customer_id: customerId, is_pro: true };
          if (session.mode === "payment") {
            update.pro_expires_at  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            update.pro_auto_renews = false;
          } else {
            update.pro_auto_renews = true;
          }
          const { error } = await admin.from("profiles").update(update).eq("id", userId);
          if (error) throw new Error(`DB update failed: ${error.message}`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub        = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const isActive   = (sub.status === "active" || sub.status === "trialing");

        const periodEnd = sub.items.data[0]?.current_period_end;
        const { error } = await admin
          .from("profiles")
          .update({
            is_pro:          isActive,
            pro_expires_at:  periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
            pro_auto_renews: !sub.cancel_at_period_end && !sub.cancel_at,
          })
          .eq("stripe_customer_id", customerId);
        if (error) throw new Error(`DB update failed: ${error.message}`);
        break;
      }

      case "customer.subscription.deleted": {
        const sub        = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        const { error } = await admin
          .from("profiles")
          .update({ is_pro: false, pro_expires_at: null, pro_auto_renews: false })
          .eq("stripe_customer_id", customerId);
        if (error) throw new Error(`DB update failed: ${error.message}`);
        break;
      }
    }
  } catch (err) {
    console.error("[stripe-webhook]", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
