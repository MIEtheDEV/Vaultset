import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { AccountSettingsForm } from "@/components/AccountSettingsForm";
import { SupporterBadge } from "@/components/SupporterBadge";
import { EditReviewButton } from "@/components/EditReviewButton";
import { ManageBillingButton } from "@/components/ManageBillingButton";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ subscription?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { subscription: subscriptionParam } = await searchParams;
  const username    = (user.user_metadata?.username as string) ?? "";
  const email       = user.email ?? "";
  const pendingEmail = (user as any).new_email as string | null ?? null;

  const [{ data: profile }, { data: rawItems }, { data: existingReview }] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_supporter, is_pro, pro_expires_at, pro_auto_renews, bio, specialty, city, featured_item_id, avatar_url, avatar_color, followers_only_offers")
      .eq("id", user.id)
      .single(),
    supabase
      .from("collection_items")
      .select("id, cards(name, set_name, card_number, image_url)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("reviews")
      .select("rating, body, display_name")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const isSupporter     = profile?.is_supporter              ?? false;
  const isPro           = (profile as any)?.is_pro           as boolean ?? false;
  const proExpiresAt    = (profile as any)?.pro_expires_at   as string | null ?? null;
  const proAutoRenews   = (profile as any)?.pro_auto_renews  as boolean ?? false;
  const isAdmin         = username === process.env.ADMIN_USERNAME;
  const bio             = (profile as any)?.bio              as string ?? "";
  const specialty       = (profile as any)?.specialty        as string ?? "";
  const city            = (profile as any)?.city             as string ?? "";
  const featuredItemId  = (profile as any)?.featured_item_id as string | null ?? null;
  const avatarUrl       = (profile as any)?.avatar_url        as string | null ?? null;
  const avatarColor           = (profile as any)?.avatar_color           as string | null ?? null;
  const followersOnlyOffers   = (profile as any)?.followers_only_offers  as boolean ?? false;

  // Normalise the cards join — Supabase may return object or single-element array
  const collectionItems = (rawItems ?? []).map((item) => {
    const raw   = (item as any).cards;
    const cards = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
    return { id: item.id, cards };
  });

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
          {isSupporter && <SupporterBadge />}
        </div>
        <p className="mt-1 text-sm text-foreground-muted">Manage your profile, password, and account.</p>
        {!isSupporter && (
          <Link href="/support" className="mt-1 inline-block text-xs text-foreground-muted hover:text-gold transition-colors">
            Help keep Vaultset free →
          </Link>
        )}
        <div className="mt-2">
          <EditReviewButton
            username={username}
            existingRating={existingReview?.rating ?? undefined}
            existingBody={existingReview?.body ?? undefined}
            existingDisplayName={existingReview?.display_name ?? undefined}
          />
        </div>
      </div>

      {/* Subscription */}
      <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Subscription</h2>
            <p className="mt-0.5 text-xs text-foreground-muted">
              {isPro
                ? proExpiresAt
                  ? `Vaultset Pro — ${proAutoRenews ? "renews" : "ends"} ${new Date(proExpiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
                  : "You're on Vaultset Pro."
                : "You're on the free plan."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isPro ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                  Pro
                </span>
                <ManageBillingButton />
              </>
            ) : (
              <Link
                href="/pricing"
                className="rounded-full bg-gold px-4 py-1.5 text-xs font-semibold text-background hover:bg-gold-light transition-colors"
              >
                Upgrade to Pro
              </Link>
            )}
          </div>
        </div>
        {subscriptionParam === "success" && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            You&apos;re now on Pro — welcome aboard!
          </div>
        )}
      </div>

      <AccountSettingsForm
        initialUsername={username}
        initialEmail={email}
        pendingEmail={pendingEmail}
        initialBio={bio}
        initialSpecialty={specialty}
        initialCity={city}
        initialFeaturedItemId={featuredItemId}
        initialAvatarUrl={avatarUrl}
        initialAvatarColor={avatarColor}
        userId={user.id}
        collectionItems={collectionItems}
        isAdmin={isAdmin}
        initialFollowersOnlyOffers={followersOnlyOffers}
      />
    </div>
  );
}
