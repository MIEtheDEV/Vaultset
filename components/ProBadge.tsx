const STAR = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

/** Gold "Pro" pill shown beside a member's username on subscriber surfaces. */
export function ProBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold">
      {STAR}
      Pro
    </span>
  );
}

/** Compact "Pro Seller" pill shown on marketplace listings + listing detail. */
export function ProSellerBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-gold whitespace-nowrap">
      {STAR}
      Pro Seller
    </span>
  );
}

/** Inline "Pro Member" title shown under the username on profile/storefront headers. */
export function ProTitle() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gold">
      {STAR}
      Pro Member
    </span>
  );
}
