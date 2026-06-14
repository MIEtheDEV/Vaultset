"use client";

import { usePwaInstall } from "@/lib/usePwaInstall";

const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

/**
 * Account-settings card for installing Vaultset as a PWA. Mirrors the home-page
 * callout but lives in settings so users can install (or confirm they have it)
 * at any time. Shows a confirmation once installed.
 */
export function InstallAppCard({ serverInstalled = false }: { serverInstalled?: boolean }) {
  const { installed, isRunningInstalled, canPrompt, isIos, promptInstall } = usePwaInstall(serverInstalled);

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-foreground">Install App</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Vaultset isn&apos;t on the App Store or Google Play — install it straight from your browser
          as a free app (PWA) for a full-screen, home-screen launch and instant push notifications.
        </p>
      </div>

      {/* A live install prompt (canPrompt) means it isn't installed on this
          device right now — so it takes priority and also covers re-installing
          after an uninstall. */}
      {canPrompt ? (
        <button
          type="button"
          onClick={promptInstall}
          className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold hover:bg-gold/20 transition-colors"
        >
          <DownloadIcon />
          Install the app
        </button>
      ) : isRunningInstalled || installed ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            You&apos;ve installed the Vaultset app.
          </p>
          <p className="text-xs text-foreground-muted">
            Removed it? You can reinstall any time from your browser menu
            {isIos ? " (Safari Share → Add to Home Screen)" : " (Install / Add to Home Screen)"}.
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-sm text-foreground-muted leading-relaxed">
          {isIos ? (
            <>
              <span className="font-medium text-foreground">On iPhone / iPad:</span> tap the{" "}
              <span className="font-medium text-foreground">Share</span> button in Safari, then{" "}
              <span className="font-medium text-foreground">Add to Home Screen</span>.
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">To install:</span> open your browser menu and
              choose <span className="font-medium text-foreground">Install</span> /{" "}
              <span className="font-medium text-foreground">Add to Home Screen</span>. On some browsers an
              install icon appears in the address bar.
            </>
          )}
        </p>
      )}
    </div>
  );
}
