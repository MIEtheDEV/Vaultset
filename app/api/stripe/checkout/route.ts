import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { stripe } from "@/utils/stripe";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const PRICE_IDS: Record<string, string> = {
  single:     process.env.STRIPE_PRICE_SINGLE!,
  monthly:    process.env.STRIPE_PRICE_MONTHLY!,
  quarterly:  process.env.STRIPE_PRICE_QUARTERLY!,
  semiannual: process.env.STRIPE_PRICE_SEMIANNUAL!,
  annual:     process.env.STRIPE_PRICE_ANNUAL!,
};

// One-time payment plans — everything else is a recurring subscription
const ONE_TIME_PLANS = new Set(["single"]);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { plan } = await request.json() as { plan?: string };
  if (!plan || !PRICE_IDS[plan]) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, is_pro")
    .eq("id", user.id)
    .single();

  if ((profile as any)?.is_pro) {
    return NextResponse.json({ error: "Already subscribed" }, { status: 400 });
  }

  let customerId = (profile as any)?.stripe_customer_id as string | null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email:    user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const isOneTime = ONE_TIME_PLANS.has(plan);

  const session = await stripe.checkout.sessions.create({
    mode: isOneTime ? "payment" : "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
    customer: customerId,
    allow_promotion_codes: true,
    client_reference_id: user.id,
    metadata: { supabase_user_id: user.id, plan },
    success_url: `${SITE_URL}/account?subscription=success`,
    cancel_url:  `${SITE_URL}/account`,
  });

  return NextResponse.json({ url: session.url });
}
