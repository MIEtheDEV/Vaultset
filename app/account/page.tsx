import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { AccountSettingsForm } from "@/components/AccountSettingsForm";
import { SupporterBadge } from "@/components/SupporterBadge";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const username    = (user.user_metadata?.username as string) ?? "";
  const email       = user.email ?? "";
  const pendingEmail = (user as any).new_email as string | null ?? null;

  const [{ data: profile }, { data: rawItems }] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_supporter, bio, specialty, city, featured_item_id, avatar_url, avatar_color, followers_only_offers")
      .eq("id", user.id)
      .single(),
    supabase
      .from("collection_items")
      .select("id, cards(name, set_name, card_number, image_url)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const isSupporter     = profile?.is_supporter              ?? false;
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
