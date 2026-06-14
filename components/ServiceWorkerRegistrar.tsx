"use client";

import { useEffect } from "react";

/**
 * Registers the service worker for every visitor (not just push opt-ins) so the
 * app qualifies as an installable Android WebAPK — a real home-screen/app-drawer
 * icon instead of a bookmark shortcut. Push subscription is layered on top of
 * this same registration in PushToggle. Renders nothing.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // register() is idempotent — safe alongside PushToggle's own call.
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* registration failures are non-fatal; the app still works without it */
    });
  }, []);

  return null;
}
