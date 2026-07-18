// Pure, client-safe display helpers for master-set UI (no server-only deps).

/**
 * Split a tracked card count into numbered base cards vs secret rares (the cards
 * numbered above `printedTotal`, e.g. #192+ in a 191-card set).
 */
export function splitSecretRares(total: number, printedTotal?: number): { regular: number; secret: number } {
  const secret = printedTotal && printedTotal < total ? total - printedTotal : 0;
  return { regular: total - secret, secret };
}
