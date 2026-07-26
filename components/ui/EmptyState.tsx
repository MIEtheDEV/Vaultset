import Link from "next/link";

/**
 * The single empty-state primitive.
 *
 * Consolidates two hand-rolled variants that had drifted apart: the compact one
 * that lived (unexported) inside the dashboard page, and the larger full-panel
 * one in `InventoryGrid`. Same anatomy — icon well, title, description, one CTA —
 * at two scales.
 *
 * `size="sm"` is for a panel that already has its own border/heading (dashboard
 * sections). `size="lg"` is the standalone case and wraps itself in a surface
 * panel, so it doesn't need a container.
 */
export function EmptyState({
  icon,
  title,
  description,
  cta,
  href,
  size = "sm",
  panel,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  /** CTA label. Renders a link when paired with `href`. */
  cta?: string;
  href?: string;
  size?: "sm" | "lg";
  /** Wrap in a bordered surface panel. Defaults on for `lg`, off for `sm`. */
  panel?: boolean;
  /** Extra actions (e.g. "Clear filter") rendered below the CTA. */
  children?: React.ReactNode;
}) {
  const lg = size === "lg";
  const wrap = panel ?? lg;

  return (
    <div
      className={[
        "flex flex-col items-center justify-center text-center",
        lg ? "py-24 gap-4" : "py-12 gap-3",
        wrap ? "rounded-2xl border border-border bg-surface" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={`flex items-center justify-center rounded-full bg-surface-raised text-foreground-muted ${
          lg ? "h-14 w-14" : "h-12 w-12"
        }`}
      >
        {icon}
      </div>

      <div>
        <p className={lg ? "font-semibold text-foreground" : "text-sm font-medium text-foreground"}>
          {title}
        </p>
        {description && (
          <p className={lg ? "mt-1 text-sm text-foreground-muted" : "mt-0.5 text-xs text-foreground-muted"}>
            {description}
          </p>
        )}
      </div>

      {cta && href && (
        <Link
          href={href}
          className={
            lg
              ? "rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
              : "mt-1 rounded-full border border-border px-4 py-1.5 text-xs font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
          }
        >
          {cta}
        </Link>
      )}

      {children}
    </div>
  );
}
