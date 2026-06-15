"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Prefs = {
  push_messages: boolean;
  push_offers: boolean;
  push_followers: boolean;
  push_alerts: boolean;
  push_achievements: boolean;
};

const ROWS: { key: keyof Prefs; label: string; description: string }[] = [
  { key: "push_messages",     label: "Messages",               description: "New chat messages. Mute individual conversations from the thread." },
  { key: "push_offers",       label: "Offers",                 description: "New cash, trade, and bundle offers on your listings." },
  { key: "push_alerts",       label: "Price & wishlist alerts", description: "When a wishlist card is listed or drops to your target price." },
  { key: "push_followers",    label: "New followers",          description: "When another collector follows you." },
  { key: "push_achievements", label: "Achievements",           description: "When you unlock a milestone badge." },
];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`relative mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors ${
        on ? "border-gold bg-gold" : "border-border bg-surface-raised"
      }`}
    >
      <span
        className={`h-4 w-4 rounded-full bg-background shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function NotificationPreferences({
  userId,
  initial,
}: {
  userId: string;
  initial: Prefs;
}) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function toggle(key: keyof Prefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    setSuccess("");
  }

  async function handleSave() {
    setError("");
    setSuccess("");
    setLoading(true);
    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("notification_preferences")
      .upsert({ user_id: userId, ...prefs, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

    if (saveError) {
      setError(saveError.message);
      setLoading(false);
      return;
    }
    setSuccess("Notification preferences saved.");
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-foreground">Notification Preferences</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Choose which push notifications to receive. These apply to any device where you&apos;ve
          turned on push above; in-app notifications always show in your bell.
        </p>
      </div>

      <div className="divide-y divide-border">
        {ROWS.map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">{row.label}</p>
              <p className="mt-0.5 text-xs text-foreground-muted">{row.description}</p>
            </div>
            <Toggle on={prefs[row.key]} onClick={() => toggle(row.key)} />
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>
      )}
      {success && (
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-400">{success}</p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={loading}
        className="rounded-full bg-gold px-8 py-3 text-sm font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
      >
        {loading ? "Saving…" : "Save Preferences"}
      </button>
    </div>
  );
}
