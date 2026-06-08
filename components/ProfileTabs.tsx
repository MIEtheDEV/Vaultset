"use client";

import { useState } from "react";

type TabId = "listings" | "vault" | "collection" | "wishlist";

export function ProfileTabs({
  listingsContent,
  vaultContent,
  collectionContent,
  wishlistContent,
  listingCount,
  vaultCount,
  collectionCount,
  wishlistCount,
}: {
  listingsContent: React.ReactNode;
  vaultContent?: React.ReactNode;
  collectionContent: React.ReactNode;
  wishlistContent?: React.ReactNode;
  listingCount: number;
  vaultCount?: number;
  collectionCount: number;
  wishlistCount?: number;
}) {
  const [active, setActive] = useState<TabId>(vaultContent !== undefined ? "vault" : "listings");

  const tabs: { id: TabId; label: string; count: number }[] = [
    ...(vaultContent !== undefined
      ? [{ id: "vault" as const, label: "Vault", count: vaultCount ?? 0 }]
      : []),
    { id: "listings",   label: "Listings",    count: listingCount    },
    { id: "collection", label: "Collections", count: collectionCount },
    ...(wishlistContent !== undefined
      ? [{ id: "wishlist" as const, label: "Wishlist", count: wishlistCount ?? 0 }]
      : []),
  ];

  return (
    <div>
      <div className="flex border-b border-border overflow-x-auto">
        {tabs.map(({ id, label, count }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              active === id
                ? "border-gold text-gold"
                : "border-transparent text-foreground-muted hover:text-foreground"
            }`}
          >
            {label}
            <span className="ml-1.5 text-xs font-normal opacity-70">({count})</span>
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-8">
        {active === "listings"   && listingsContent}
        {active === "vault"      && vaultContent}
        {active === "collection" && collectionContent}
        {active === "wishlist"   && wishlistContent}
      </div>
    </div>
  );
}
