"use client";

import { useEffect, useState } from "react";
import { usePwaInstall } from "@/lib/usePwaInstall";

const DISMISS_KEY = "vaultset_install_dismissed";

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold mt-0.5 shrink-0" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const BENEFITS = [
  "One-tap launch from your home screen — full-screen, no browser bars.",
  "Instant push notifications for offers, price alerts, and new followers.",
  "Faster loads, and no download or app-store account required.",
];

/**
 * Informational callout explaining that Vaultset isn't in the app stores but
 * can be installed as a PWA, with the benefits and platform-specific steps.
 * Self-hides when already running installed (standalone) or once dismissed.
 */
export function InstallPwaCallout({
  className = "",
  serverInstalled = false,
}: {
  className?: string;
  serverInstalled?: boolean;
}) {
  const { installed, isIos: ios } = usePwaInstall(serverInstalled);
  const [dismissed, setDismissed] = useState(true); // hidden until we confirm not dismissed

  useEffect(() => {
    // Deferred so the state update lands in a callback, not synchronously here.
    queueMicrotask(() => {
      try { setDismissed(localStorage.getItem(DISMISS_KEY) === "1"); }
      catch { setDismissed(false); }
    });
  }, []);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  }

  if (installed || dismissed) return null;

  return (
    <div className={`relative rounded-2xl border border-gold/20 bg-gold/5 p-5 sm:p-6 ${className}`}>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 text-foreground-muted hover:text-foreground transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <div className="min-w-0 pr-6">
          <h3 className="text-sm font-semibold text-foreground">Install Vaultset as an app</h3>
          <p className="mt-1 text-sm text-foreground-muted leading-relaxed">
            Vaultset isn&apos;t on the App Store or Google Play — but you can install it straight from
            your browser as a free app (PWA) in seconds.
          </p>

          <ul className="mt-3 space-y-1.5">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-foreground-muted">
                <CheckIcon />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-foreground-muted">
            {ios ? (
              <>
                <span className="font-medium text-foreground">On iPhone / iPad:</span> tap the{" "}
                <span className="font-medium text-foreground">Share</span> button in Safari, then{" "}
                <span className="font-medium text-foreground">Add to Home Screen</span>.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">To install:</span> tap{" "}
                <span className="font-medium text-gold">Install app</span> in the top bar — or open your
                browser menu and choose <span className="font-medium text-foreground">Install</span> /{" "}
                <span className="font-medium text-foreground">Add to Home Screen</span>.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
