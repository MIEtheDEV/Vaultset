import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { stripe } from "@/utils/stripe";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Creates a pay-what-you-want donation Checkout Session for the signed-in user.
 *
 * Unlike the static Stripe Payment Link (used for logged-out donors), this ties
 * the payment to the user via `client_reference_id` and tags it with
 * `metadata.type = "donation"` so the webhook can grant the Supporter flag and
 * — importantly — never mistake it for a one-time Pro purchase.
 *
 * Requires STRIPE_PRICE_DONATION: a Price with `custom_unit_amount` enabled
 * ("customers choose what to pay").
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const priceId = process.env.STRIPE_PRICE_DONATION;
  if (!priceId) {
    return NextResponse.json({ error: "Donations are not configured." }, { status: 501 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    submit_type: "donate",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    customer_email: user.email,
    metadata: { type: "donation", supabase_user_id: user.id },
    success_url: `${SITE_URL}/support/thank-you`,
    cancel_url:  `${SITE_URL}/support`,
  });

  return NextResponse.json({ url: session.url });
}
