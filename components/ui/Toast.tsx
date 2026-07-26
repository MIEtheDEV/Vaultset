"use client";

import { Toaster } from "sonner";

/**
 * App-wide toast host. Mounted once in the root layout.
 *
 * Before this, the app had no async-feedback layer at all — every mutation was a
 * silent wait, an inline "Saving…" string, or a hard refresh, and there was a
 * single `aria-live` region in the entire codebase. Sonner is used rather than a
 * hand-rolled toaster specifically because it brings the accessibility parts
 * (live region, focus handling, dismissal, hover-to-pause) that the app's seven
 * hand-rolled modals are already missing.
 *
 * Theming goes through sonner's CSS custom properties rather than class
 * overrides so the toasts track our tokens instead of fighting sonner's own
 * styles with `!important`.
 */
export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      theme="dark"
      closeButton
      // Long enough to read a card name, short enough not to linger.
      duration={4500}
      style={
        {
          "--normal-bg": "var(--color-surface-raised)",
          "--normal-border": "var(--color-border)",
          "--normal-text": "var(--color-foreground)",
          "--success-bg": "var(--color-surface-raised)",
          "--success-border": "color-mix(in oklab, var(--color-success) 40%, transparent)",
          "--success-text": "var(--color-success)",
          "--error-bg": "var(--color-surface-raised)",
          "--error-border": "color-mix(in oklab, var(--color-danger) 40%, transparent)",
          "--error-text": "var(--color-danger)",
          "--warning-bg": "var(--color-surface-raised)",
          "--warning-border": "color-mix(in oklab, var(--color-warning) 40%, transparent)",
          "--warning-text": "var(--color-warning)",
          "--info-bg": "var(--color-surface-raised)",
          "--info-border": "color-mix(in oklab, var(--color-info) 40%, transparent)",
          "--info-text": "var(--color-info)",
          "--border-radius": "0.75rem",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          description: "text-foreground-muted",
        },
      }}
    />
  );
}

/**
 * Re-exported so callers have one import site for the whole toast layer
 * (`import { toast } from "@/components/ui/Toast"`).
 */
export { toast } from "sonner";
