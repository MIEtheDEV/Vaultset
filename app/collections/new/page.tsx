import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { CollectionCreator } from "@/components/CollectionCreator";

export const metadata: Metadata = {
  title: "New Collection",
  robots: { index: false },
};

export default async function NewCollectionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const username = user.user_metadata?.username as string;

  return (
    <div className="space-y-6">
      <Link
        href={`/profile/${username}`}
        className="text-sm text-foreground-muted hover:text-foreground transition-colors flex items-center gap-1.5 w-fit"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
        </svg>
        Back to profile
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">New Collection</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Track your progress completing a set, hunting a rarity, or building a custom list.
        </p>
      </div>

      <CollectionCreator />
    </div>
  );
}
