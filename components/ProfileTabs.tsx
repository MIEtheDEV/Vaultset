"use client";

import { useState } from "react";

type TabId = "listings" | "collection" | "wishlist";

export function ProfileTabs({
  listingsContent,
  collectionContent,
  wishlistContent,
  listingCount,
  collectionCount,
  wishlistCount,
}: {
  listingsContent: React.ReactNode;
  collectionContent: React.ReactNode;
  wishlistContent?: React.ReactNode;
  listingCount: number;
  collectionCount: number;
  wishlistCount?: number;
}) {
  const [active, setActive] = useState<TabId>("listings");

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "listings",   label: "Listings",   count: listingCount   },
    { id: "collection", label: "Collection", count: collectionCount },
    ...(wishlistContent !== undefined
      ? [{ id: "wishlist" as const, label: "Wishlist", count: wishlistCount ?? 0 }]
      : []),
  ];

  return (
    <div>
      <div className="flex border-b border-border">
        {tabs.map(({ id, label, count }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
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
        {active === "collection" && collectionContent}
        {active === "wishlist"   && wishlistContent}
      </div>
    </div>
  );
}
