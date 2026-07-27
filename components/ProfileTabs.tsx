"use client";

import { useState } from "react";

type TabId = "showcase" | "listings" | "vault" | "collection" | "wishlist";

export function ProfileTabs({
  showcaseContent,
  listingsContent,
  vaultContent,
  collectionContent,
  wishlistContent,
  showcaseCount,
  listingCount,
  vaultCount,
  collectionCount,
  wishlistCount,
}: {
  showcaseContent?: React.ReactNode;
  listingsContent: React.ReactNode;
  vaultContent?: React.ReactNode;
  collectionContent: React.ReactNode;
  wishlistContent?: React.ReactNode;
  showcaseCount?: number;
  listingCount: number;
  vaultCount?: number;
  collectionCount: number;
  wishlistCount?: number;
}) {
  const [active, setActive] = useState<TabId>(
    showcaseContent !== undefined ? "showcase" : vaultContent !== undefined ? "vault" : "listings"
  );

  const tabs: { id: TabId; label: string; count: number }[] = [
    ...(showcaseContent !== undefined
      ? [{ id: "showcase" as const, label: "Showcase", count: showcaseCount ?? 0 }]
      : []),
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
      {/* Horizontal-only tab strip.
          The divider and the 1px overlap live on the WRAPPER, not on the buttons. When
          the buttons carried `-mb-px` themselves, their border box sat 1px below the
          scroller's content box — and because `overflow-x: auto` with `overflow-y:
          visible` promotes the y axis to `auto` as well, that 1px became a real
          vertical scroll on mobile. Now the scroller's content is exactly as tall as
          its tallest button, so there is nothing to scroll vertically; `overflow-y-
          hidden` states the intent and defeats the promotion outright. */}
      <div className="border-b border-border">
        <div className="-mb-px flex overflow-x-auto overflow-y-hidden overscroll-x-contain">
          {tabs.map(({ id, label, count }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={`shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
      </div>

      <div className="mt-6 space-y-8">
        {active === "showcase"     ? showcaseContent
          : active === "listings"   ? listingsContent
          : active === "vault"      ? vaultContent
          : active === "collection" ? collectionContent
          : active === "wishlist"   ? wishlistContent
          : null}
      </div>
    </div>
  );
}
