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

  // Idempotency: Stripe may redeliver the same event (and retries whenever we
  // answer 5xx). Record each processed event id; a unique-violation on insert
  // means we've already handled it, so acknowledge and skip reprocessing. If
  // the handler later fails, we delete the row (in the catch) so Stripe's retry
  // can reprocess. A missing table degrades idempotency but never drops events.
  const { error: dedupError } = await admin.from("stripe_events").insert({ id: event.id });
  if (dedupError?.code === "23505") {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (dedupError) {
    console.error("[stripe-webhook] dedup insert failed:", dedupError.code, dedupError.message);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session    = event.data.object as Stripe.Checkout.Session;
        const userId     = session.client_reference_id;
        // Only act on settled payments. Async/delayed methods can fire
        // checkout.session.completed while still "unpaid"/"no_payment_required";
        // granting on those hands out entitlements before funds settle.
        const isPaid     = session.payment_status === "paid";

        // Donations grant the Supporter flag only — never Pro. Checked first so
        // a donation (mode: "payment" with a client_reference_id) is never
        // mistaken for a one-time Pro purchase by the logic below.
        if (session.metadata?.type === "donation") {
          if (userId && isPaid) {
            const { error } = await admin.from("profiles").update({ is_supporter: true }).eq("id", userId);
            if (error) throw new Error(`DB update failed: ${error.message}`);
          }
          break;
        }

        const customerId = session.customer as string | null;

        if (userId && customerId && isPaid) {
          const update: Record<string, unknown> = { stripe_customer_id: customerId, is_pro: true };
          if (session.mode === "payment") {
            update.pro_expires_at  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            update.pro_auto_renews = false;
            update.pro_plan        = "one_time";
          } else {
            update.pro_auto_renews = true;
            update.pro_plan        = "subscription";
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
            pro_plan:        "subscription",
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
          .update({ is_pro: false, pro_expires_at: null, pro_auto_renews: false, pro_plan: null })
          .eq("stripe_customer_id", customerId);
        if (error) throw new Error(`DB update failed: ${error.message}`);
        break;
      }
    }
  } catch (err) {
    console.error("[stripe-webhook]", err);
    // Release the idempotency record so Stripe's retry can reprocess this event.
    await admin.from("stripe_events").delete().eq("id", event.id);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
