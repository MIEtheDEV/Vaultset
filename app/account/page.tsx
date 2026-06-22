/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { ProfileSettingsForm } from "@/components/ProfileSettingsForm";
import { PasswordSettingsForm } from "@/components/PasswordSettingsForm";
import { DangerZone } from "@/components/DangerZone";
import { VacationModeCard } from "@/components/VacationModeCard";
import { PushToggle } from "@/components/PushToggle";
import { hasProAccess } from "@/lib/proStatus";
import { InstallAppCard } from "@/components/InstallAppCard";
import { NotificationPreferences } from "@/components/NotificationPreferences";
import { SupporterBadge } from "@/components/SupporterBadge";
import { EditReviewButton } from "@/components/EditReviewButton";
import { ManageBillingButton } from "@/components/ManageBillingButton";
import { isUserAdmin } from "@/lib/auth/admin";

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

  const [{ data: profile }, { data: rawItems }, { data: existingReview }, { data: notifPrefs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_supporter, is_pro, pro_expires_at, pro_auto_renews, bio, specialty, city, featured_item_id, avatar_url, avatar_color, followers_only_offers, vacation_mode, vacation_message, vacation_starts_at, vacation_ends_at, pwa_installed_at")
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
    supabase
      .from("notification_preferences")
      .select("push_messages, push_offers, push_followers, push_alerts, push_achievements")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  // Opt-out model: no row means everything is on.
  const notificationPrefs = {
    push_messages:     (notifPrefs as any)?.push_messages     ?? true,
    push_offers:       (notifPrefs as any)?.push_offers       ?? true,
    push_followers:    (notifPrefs as any)?.push_followers    ?? true,
    push_alerts:       (notifPrefs as any)?.push_alerts       ?? true,
    push_achievements: (notifPrefs as any)?.push_achievements ?? true,
  };

  const isSupporter     = profile?.is_supporter              ?? false;
  const isPro           = (profile as any)?.is_pro           as boolean ?? false;
  const proExpiresAt    = (profile as any)?.pro_expires_at   as string | null ?? null;
  const proAutoRenews   = (profile as any)?.pro_auto_renews  as boolean ?? false;
  const canPro          = hasProAccess(profile as any); // entitlement (expiry-aware)
  // is_admin isn't exposed to the authenticated role (column-level grants);
  // read it authoritatively via the service-role helper instead of the SELECT.
  const isAdmin         = await isUserAdmin(user.id);
  const bio             = (profile as any)?.bio              as string ?? "";
  const specialty       = (profile as any)?.specialty        as string ?? "";
  const city            = (profile as any)?.city             as string ?? "";
  const featuredItemId  = (profile as any)?.featured_item_id as string | null ?? null;
  const avatarUrl       = (profile as any)?.avatar_url        as string | null ?? null;
  const avatarColor           = (profile as any)?.avatar_color           as string | null ?? null;
  const followersOnlyOffers   = (profile as any)?.followers_only_offers  as boolean ?? false;
  const vacationMode          = (profile as any)?.vacation_mode          as boolean ?? false;
  const vacationMessage       = (profile as any)?.vacation_message       as string | null ?? null;
  const vacationStartsAt      = (profile as any)?.vacation_starts_at     as string | null ?? null;
  const vacationEndsAt        = (profile as any)?.vacation_ends_at       as string | null ?? null;
  const pwaInstalled          = Boolean((profile as any)?.pwa_installed_at);

  // Normalise the cards join — Supabase may return object or single-element array
  const collectionItems = (rawItems ?? []).map((item) => {
    const raw   = (item as any).cards;
    const cards = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
    return { id: item.id, cards };
  });

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
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

      <InstallAppCard serverInstalled={pwaInstalled} />

      <CollapsibleSection
        title="Profile"
        description="Avatar, username, email, bio, and public profile details."
        defaultOpen
      >
        <ProfileSettingsForm
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
      </CollapsibleSection>

      <CollapsibleSection
        title="Marketplace Availability"
        description="Pause your listings while you're away."
      >
        <VacationModeCard
          bare
          userId={user.id}
          canSchedule={canPro}
          initialVacationMode={vacationMode}
          initialMessage={vacationMessage ?? ""}
          initialStartsAt={vacationStartsAt}
          initialEndsAt={vacationEndsAt}
        />
      </CollapsibleSection>

      <PushToggle />

      <NotificationPreferences userId={user.id} initial={notificationPrefs} />

      <CollapsibleSection
        title="Password & Account"
        description="Change your password or delete your account."
      >
        <div className="space-y-6">
          <PasswordSettingsForm initialEmail={email} />
          <div className="border-t border-border" />
          <DangerZone />
        </div>
      </CollapsibleSection>
    </div>
  );
}
