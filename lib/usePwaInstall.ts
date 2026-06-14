"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isStandalone, isIosSafari } from "@/lib/pwa";

// Same-device flag so any browser tab on a device that already installed the app
// can suppress the prompts without a network round-trip. The durable, cross-device
// record lives on the user's profile (see /api/pwa/installed).
const INSTALLED_FLAG = "vaultset_app_installed";

// Not in TS's DOM lib yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function readLocalFlag(): boolean {
  try {
    return localStorage.getItem(INSTALLED_FLAG) === "1";
  } catch {
    return false;
  }
}

/** Mark this device as having the app, and tell the server (once) who installed. */
export function reportInstalled() {
  try { localStorage.setItem(INSTALLED_FLAG, "1"); } catch { /* ignore */ }
  // Fire-and-forget; the route is idempotent and no-ops for logged-out visitors.
  fetch("/api/pwa/installed", { method: "POST", keepalive: true }).catch(() => { /* ignore */ });
}

/** Clear the same-device install flag (e.g. when the OS reports it's installable again). */
function clearLocalFlag() {
  try { localStorage.removeItem(INSTALLED_FLAG); } catch { /* ignore */ }
}

export interface PwaInstall {
  /**
   * Historical "has the app" signal (this device's flag or, via prop, any
   * device). Used to suppress marketing prompts. Note: there's no reliable
   * uninstall event, so this stays true after an uninstall — prefer `canPrompt`
   * when deciding whether to *offer* an install.
   */
  installed: boolean;
  /** True only while actually running the installed app (standalone window). */
  isRunningInstalled: boolean;
  /**
   * Chrome/Edge/Android captured a prompt we can fire from a click. This also
   * means the app is NOT currently installed on this device — the browser only
   * fires it for installable (i.e. not-yet-installed) apps, so it re-appears
   * after an uninstall.
   */
  canPrompt: boolean;
  /** iOS Safari, which needs manual "Add to Home Screen" instructions. */
  isIos: boolean;
  /** Fire the native install prompt. Resolves true if the user accepted. */
  promptInstall: () => Promise<boolean>;
}

/**
 * Shared install state for every "Install app" affordance. Captures the
 * `beforeinstallprompt` event, tracks install completion, and records the
 * install server-side. Pass `serverInstalled` from a server component that
 * already knows the user's profile to suppress prompts across devices.
 */
export function usePwaInstall(serverInstalled = false): PwaInstall {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isRunningInstalled, setIsRunningInstalled] = useState(false);
  const [installed, setInstalled] = useState(serverInstalled);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function onBeforeInstall(e: Event) {
      e.preventDefault(); // stash for our own button
      promptRef.current = e as BeforeInstallPromptEvent;
      setCanPrompt(true);
      // The browser only offers this for installable (not-currently-installed)
      // apps. If it fires, the app isn't installed on this device — clear the
      // sticky same-device flag so the install option re-appears after an
      // uninstall. (The historical server record is intentionally left intact.)
      clearLocalFlag();
      setInstalled(false);
    }
    function onInstalled() {
      promptRef.current = null;
      setCanPrompt(false);
      setInstalled(true);
      reportInstalled();
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // Deferred so the state updates land in a callback, not synchronously here.
    queueMicrotask(() => {
      if (isStandalone()) {
        setIsRunningInstalled(true);
        setInstalled(true);
        reportInstalled(); // a standalone launch confirms the install
        return;
      }
      if (readLocalFlag()) setInstalled(true);
      if (isIosSafari()) setIsIos(true);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const e = promptRef.current;
    if (!e) return false;
    await e.prompt();
    const { outcome } = await e.userChoice;
    promptRef.current = null;
    setCanPrompt(false);
    if (outcome === "accepted") {
      setInstalled(true);
      reportInstalled();
      return true;
    }
    return false;
  }, []);

  // `installed` is the historical signal that suppresses marketing nags (nav
  // pill, callout banner). The explicit install surfaces (settings card, FAQ)
  // instead key off `canPrompt`/`isRunningInstalled` so they can offer a
  // re-install when the OS reports the app is installable again.
  return { installed: installed || serverInstalled, isRunningInstalled, canPrompt, isIos, promptInstall };
}
