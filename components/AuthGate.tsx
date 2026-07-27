"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "@/utils/supabase/client";

// Auth-aware wrappers for public/crawlable pages. Resolves auth in the browser
// (like PublicNav) so using these does NOT introduce a cookies() read into the
// server render — the page subtree stays static/ISR. SSR and the pre-hydration
// paint render the signed-out branch, which is what crawlers should see.
//
// The instant hint is the (non-httpOnly) Supabase auth cookie, read through
// useSyncExternalStore so hydration stays clean — it means signed-in visitors
// don't watch a "Start for Free" button flash away while getUser() is in flight.
// getUser() is still the authority: the cookie can be present but expired.

function hasAuthCookie() {
  return /\bsb-[\w-]+-auth-token/.test(document.cookie);
}

// The cookie is only read once per mount; nothing external to subscribe to.
const noopSubscribe = () => () => {};

export function useSignedIn(): boolean {
  const cookieHint = useSyncExternalStore(noopSubscribe, hasAuthCookie, () => false);
  const [confirmed, setConfirmed] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setConfirmed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setConfirmed(!!session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return confirmed ?? cookieHint;
}

/** Renders children only for visitors without a session (and for crawlers). */
export function SignedOut({ children }: { children: React.ReactNode }) {
  return useSignedIn() ? null : <>{children}</>;
}

/** Renders children only once a session has been confirmed in the browser. */
export function SignedIn({ children }: { children: React.ReactNode }) {
  return useSignedIn() ? <>{children}</> : null;
}
