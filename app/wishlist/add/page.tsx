"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { PokemonCardSearch } from "@/components/PokemonCardSearch";
import { checkText } from "@/lib/moderation";

interface SelectedCard {
  id: string;
  name: string;
  number: string;
  set: { id: string; name: string };
  images: { small: string; large: string };
}

export default function WishlistAddPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedCard | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleSelect(card: SelectedCard) {
    setSelected(card);
    setNotes("");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;

    const notesValue = notes.trim();
    const notesViolation = notesValue ? checkText(notesValue) : null;
    if (notesViolation) {
      setError(`Notes: ${notesViolation}`);
      return;
    }

    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not signed in."); setLoading(false); return; }

    const { error: dbError } = await supabase.from("wishlist_items").insert({
      user_id:       user.id,
      pokemon_api_id: selected.id,
      card_name:     selected.name,
      set_name:      selected.set.name,
      card_number:   selected.number || null,
      image_url:     selected.images.large || null,
      notes:         notesValue || null,
    });

    if (dbError) {
      if (dbError.code === "23505") {
        setError("This card is already on your wishlist.");
      } else {
        setError(dbError.message);
      }
      setLoading(false);
      return;
    }

    router.push("/wishlist");
    router.refresh();
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link
          href="/wishlist"
          className="text-foreground-muted hover:text-foreground transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Add to Wishlist</h1>
          <p className="mt-0.5 text-sm text-foreground-muted">Search for a card you&apos;re looking for</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Search */}
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Find a Card</h2>
          <PokemonCardSearch onSelect={handleSelect} />
        </div>

        {/* Selected card preview */}
        {selected && (
          <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-raised border border-border">
                {selected.images.large ? (
                  <Image
                    src={selected.images.large}
                    alt={selected.name}
                    fill
                    sizes="80px"
                    className="object-contain"
                  />
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">{selected.name}</p>
                <p className="text-sm text-foreground-muted">{selected.set.name}</p>
                {selected.number && (
                  <p className="text-xs text-foreground-muted">#{selected.number}</p>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground-muted">
                Notes <span className="font-normal">(optional)</span>
              </label>
              <textarea
                maxLength={200}
                rows={2}
                placeholder="e.g. Looking for NM or better, open to PSA graded…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full resize-none rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
              />
              <p className="mt-1 text-xs text-foreground-muted">{notes.length}/200</p>
            </div>

            {error && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="rounded-full bg-gold px-8 py-3 text-sm font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
              >
                {loading ? "Adding…" : "Add to Wishlist"}
              </button>
              <button
                type="button"
                onClick={() => { setSelected(null); setNotes(""); setError(""); }}
                className="rounded-full border border-border px-8 py-3 text-sm font-medium text-foreground-muted hover:text-foreground hover:border-gold/40 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
