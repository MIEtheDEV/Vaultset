import type { ReactNode } from "react";

/**
 * A settings section rendered as a styled, collapsible card. The summary acts as
 * the card header (title + optional description + chevron); children render in
 * the body. Built on native <details> so children stay mounted while collapsed
 * (unsaved form input survives a toggle) with no client JS.
 */
export function CollapsibleSection({
  title,
  description,
  defaultOpen = false,
  danger = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className={`group rounded-2xl border bg-surface overflow-hidden ${danger ? "border-red-500/20" : "border-border"}`}
    >
      <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none select-none hover:bg-surface-raised transition-colors">
        <div className="min-w-0">
          <h2 className={`font-semibold ${danger ? "text-red-400" : "text-foreground"}`}>{title}</h2>
          {description && <p className="mt-0.5 text-sm text-foreground-muted">{description}</p>}
        </div>
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className="text-foreground-muted shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="px-6 pb-6 pt-4 border-t border-border">{children}</div>
    </details>
  );
}
