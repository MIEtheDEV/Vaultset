import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { stripe } from "@/utils/stripe";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Read the billing id via the service-role client (see checkout/route.ts):
  // stripe_customer_id is never exposed to or settable by the user, so the
  // portal can only ever target the customer the server bound to this account.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single<{ stripe_customer_id: string | null }>();

  const customerId = profile?.stripe_customer_id ?? null;
  if (!customerId) {
    return NextResponse.json({ error: "No billing account found" }, { status: 404 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${SITE_URL}/account`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe-portal]", err);
    return NextResponse.json({ error: "Failed to open billing portal" }, { status: 500 });
  }
}
