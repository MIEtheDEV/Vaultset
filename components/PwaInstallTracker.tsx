"use client";

import { useEffect } from "react";
import { isStandalone } from "@/lib/pwa";
import { reportInstalled } from "@/lib/usePwaInstall";

/**
 * Records a PWA install for the signed-in user on every standalone launch and on
 * the `appinstalled` event — independent of whether any "Install app" button is
 * mounted on the current page. Renders nothing.
 */
export function PwaInstallTracker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) reportInstalled();
    window.addEventListener("appinstalled", reportInstalled);
    return () => window.removeEventListener("appinstalled", reportInstalled);
  }, []);

  return null;
}
