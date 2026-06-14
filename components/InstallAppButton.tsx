"use client";

import { useState } from "react";
import { usePwaInstall } from "@/lib/usePwaInstall";

const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

interface InstallAppButtonProps {
  /** "nav" (compact pill, self-hides when it can't help) or "inline" (always shown unless installed). */
  variant?: "nav" | "inline";
  /** Server-known install status to suppress the prompt across devices. */
  serverInstalled?: boolean;
}

export function InstallAppButton({ variant = "nav", serverInstalled = false }: InstallAppButtonProps) {
  const { installed, isRunningInstalled, canPrompt, isIos, promptInstall } = usePwaInstall(serverInstalled);
  const [showHelp, setShowHelp] = useState(false);

  async function handleClick() {
    if (canPrompt) {
      await promptInstall();
    } else {
      // iOS, or a browser that hasn't offered a prompt — show manual instructions.
      setShowHelp((v) => !v);
    }
  }

  // The nav pill is a marketing nag: hide it for anyone who's (historically)
  // installed, and only show it when it can actually do something. The inline
  // FAQ button is an explicit "how do I install" answer: keep it available
  // unless we're already running inside the installed app, so it still offers a
  // re-install path after an uninstall.
  if (variant === "nav") {
    const useful = canPrompt || isIos;
    if (installed || !useful) return null;
  } else if (isRunningInstalled) {
    return null;
  }

  if (variant === "inline") {
    return (
      <div>
        <button
          type="button"
          onClick={handleClick}
          className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold hover:bg-gold/20 transition-colors"
        >
          <DownloadIcon />
          Install the app
        </button>

        {showHelp && (
          <div className="mt-3 rounded-xl border border-border bg-surface-raised p-3 text-xs text-foreground-muted leading-relaxed">
            {isIos ? (
              <>
                <span className="font-medium text-foreground">On iPhone / iPad:</span> tap the{" "}
                <span className="font-medium text-foreground">Share</span> button in Safari, then{" "}
                <span className="font-medium text-foreground">Add to Home Screen</span>.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">To install:</span> open your browser menu
                and choose <span className="font-medium text-foreground">Install</span> /{" "}
                <span className="font-medium text-foreground">Add to Home Screen</span>. On some browsers
                an install icon appears in the address bar.
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold hover:bg-gold/20 transition-colors"
        aria-label="Install Vaultset app"
      >
        <DownloadIcon />
        <span className="hidden sm:inline">Install app</span>
      </button>

      {showHelp && isIos && (
        <div className="fixed right-3 top-16 z-[60] w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-surface p-3 text-xs text-foreground-muted shadow-lg">
          <p className="font-medium text-foreground mb-1">Install on iPhone / iPad</p>
          <p className="leading-relaxed">
            Tap the <span className="font-semibold text-foreground">Share</span> button in Safari, then{" "}
            <span className="font-semibold text-foreground">Add to Home Screen</span>.
          </p>
        </div>
      )}
    </div>
  );
}
