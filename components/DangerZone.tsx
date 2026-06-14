"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

/** Permanently delete the user's account and all associated data. */
export function DangerZone() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  async function handleDelete() {
    setLoading(true);
    setError("");

    const res  = await fetch("/api/account/delete", { method: "POST" });
    const json = await res.json();

    if (!res.ok) {
      setError(json.error ?? "Failed to delete account.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-red-400">Delete account</p>
        <p className="mt-1 text-sm text-foreground-muted">
          Permanently delete your account and all associated collection data. This cannot be undone.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {error}
        </p>
      )}

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-full border border-red-500/40 px-6 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
        >
          Delete Account
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="rounded-full bg-red-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60 transition-colors"
          >
            {loading ? "Deleting…" : "Yes, delete my account"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-full border border-border px-6 py-2.5 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
