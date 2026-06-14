"use client";

import { useEffect, useState } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** Convert a base64url VAPID key into the Uint8Array the PushManager expects. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

type Status = "loading" | "unsupported" | "off" | "on" | "denied" | "working" | "error";

export function PushToggle({ isPro = false }: { isPro?: boolean }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [testState, setTestState] = useState<"idle" | "sending" | "sent" | "none" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    // Feature-detect and reflect any existing subscription. Runs async so the
    // state updates land in callbacks rather than synchronously in the effect.
    (async () => {
      if (typeof window === "undefined") return;
      const supported =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported || !VAPID_PUBLIC_KEY) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!cancelled) setStatus(sub ? "on" : "off");
    })();
    return () => { cancelled = true; };
  }, []);

  async function enable() {
    setError("");
    setStatus("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save subscription.");

      setStatus("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't enable push notifications.");
      setStatus("error");
    }
  }

  async function disable() {
    setError("");
    setStatus("working");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't disable push notifications.");
      setStatus("error");
    }
  }

  async function sendTest() {
    setTestState("sending");
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send test.");
      setTestState(json.subscriptions ? "sent" : "none");
    } catch {
      setTestState("error");
    }
  }

  const on = status === "on";

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-foreground">Push Notifications</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Get price alerts and offers pushed to this device — even when Vaultset isn&apos;t open.
          {isPro
            ? " As a Pro member, your alerts are delivered instantly."
            : " Price alerts are free for everyone; Pro members get instant priority delivery."}
        </p>
      </div>

      {status === "unsupported" ? (
        <p className="rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-sm text-foreground-muted">
          This browser doesn&apos;t support push notifications, or push isn&apos;t configured.
        </p>
      ) : status === "denied" ? (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-400">
          Notifications are blocked in your browser settings. Allow them for this site to enable push.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-foreground-muted">
            {on ? "Push is on for this device." : "Push is off for this device."}
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            disabled={status === "loading" || status === "working"}
            onClick={on ? disable : enable}
            className={`relative flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors disabled:opacity-50 ${
              on ? "border-gold bg-gold" : "border-border bg-surface-raised"
            }`}
          >
            <span
              className={`h-4 w-4 rounded-full bg-background shadow transition-transform ${
                on ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      )}

      {on && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={sendTest}
            disabled={testState === "sending"}
            className="rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors disabled:opacity-50"
          >
            {testState === "sending" ? "Sending…" : "Send a test notification"}
          </button>
          {testState === "sent" && (
            <span className="text-xs text-emerald-400">Sent — it should arrive on this device shortly.</span>
          )}
          {testState === "none" && (
            <span className="text-xs text-amber-400">No subscribed devices found — try toggling push off and on.</span>
          )}
          {testState === "error" && (
            <span className="text-xs text-red-400">Couldn&apos;t send the test. Check push configuration.</span>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
