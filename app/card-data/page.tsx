import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { CardSearchBrowser } from "@/components/CardSearchBrowser";

export const metadata: Metadata = {
  title: "Card Search",
  description: "Search any trading card and see its market value, price history, condition & graded prices, and marketplace availability on Vaultset.",
  alternates: { canonical: "/card-data" },
};

export default async function CardSearchPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Card Search</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Look up any card — even ones not yet in our data. Market value and history are pulled on demand.
        </p>
      </div>

      <CardSearchBrowser autoFocus loggedIn={!!user} />
    </div>
  );
}
