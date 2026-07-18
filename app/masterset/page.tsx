import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { getSetCompletionSummaries } from "@/lib/sets/masterset";
import { MasterSetIndexGrid } from "@/components/masterset/MasterSetIndexGrid";

export const metadata: Metadata = { title: "Master Sets", robots: { index: false } };

export default async function MasterSetIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const summaries = await getSetCompletionSummaries(supabase, user!.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Master Sets</h1>
        <p className="mt-2 text-foreground-muted max-w-2xl">
          Track your progress toward completing every Pokémon TCG set. Open a set to see every card —
          dimmed until you own it — and switch between <span className="text-foreground">Complete Set</span>{" "}
          (one of each card) and <span className="text-foreground">Master Set</span> (every finish).
        </p>
      </div>

      <MasterSetIndexGrid summaries={summaries} />
    </div>
  );
}
