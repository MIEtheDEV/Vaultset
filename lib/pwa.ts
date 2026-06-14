// Client-only PWA environment checks. Call from effects/handlers (they touch
// window/navigator), never during SSR/render.

/** True when the app is running as an installed PWA (standalone window). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes this non-standard flag instead of display-mode.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** True for Safari on iOS/iPadOS (which can't fire `beforeinstallprompt`). */
export function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS reports as Mac
  const webkit = /WebKit/.test(ua);
  const notOtherBrowser = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua); // Chrome/FF/Edge/Opera on iOS
  return iOS && webkit && notOtherBrowser;
}
