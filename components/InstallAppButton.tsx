"use client";

import { useEffect, useRef, useState } from "react";
import { isStandalone, isIosSafari } from "@/lib/pwa";

// Not in TS's DOM lib yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export function InstallAppButton() {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [iosHelp, setIosHelp]     = useState(false);
  const [showIos, setShowIos]     = useState(false);
  const [hidden, setHidden]       = useState(true); // hidden until we know it's useful

  useEffect(() => {
    if (typeof window === "undefined" || isStandalone()) return; // already installed → nothing to do

    function onBeforeInstall(e: Event) {
      e.preventDefault(); // stash for our own button
      promptRef.current = e as BeforeInstallPromptEvent;
      setCanPrompt(true);
      setHidden(false);
    }
    function onInstalled() {
      promptRef.current = null;
      setCanPrompt(false);
      setHidden(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS can't fire beforeinstallprompt — offer manual instructions instead.
    // Deferred so the state update lands in a callback, not synchronously here.
    if (isIosSafari()) {
      queueMicrotask(() => {
        setShowIos(true);
        setHidden(false);
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleClick() {
    if (canPrompt && promptRef.current) {
      const e = promptRef.current;
      await e.prompt();
      const { outcome } = await e.userChoice;
      if (outcome === "accepted") setHidden(true);
      promptRef.current = null;
      setCanPrompt(false);
    } else if (showIos) {
      setIosHelp((v) => !v);
    }
  }

  if (hidden) return null;

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

      {iosHelp && showIos && (
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
