import type { SupabaseClient } from "@supabase/supabase-js";

export type BadgeSlug =
  // Collection size
  | "first_card"
  | "collector"
  | "century"
  | "thousand"
  | "crown_collector"
  // Collection value
  | "high_roller"
  | "portfolio_builder"
  | "high_stakes"
  | "vault_guardian"
  // Marketplace: listings
  | "first_listing"
  | "active_seller"
  | "market_maker"
  | "dual_lister"
  // Marketplace: trading
  | "trader"
  // Grading
  | "graded"
  | "grading_enthusiast"
  | "grading_expert"
  | "perfect_grade"
  // Sealed products
  | "sealed_collector"
  | "box_hoarder"
  // Pack reveals
  | "pack_logger"
  | "prolific_puller"
  | "box_breaker"
  // Transactions
  | "deal_maker"
  | "trusted_seller"
  | "trusted_buyer"
  | "volume_trader"
  | "deal_bundler"
  | "negotiator"
  // Watchlist
  | "deal_watcher"
  // Wishlist
  | "wishlist_curator"
  | "deal_hunter"
  | "serious_hunter"
  // Social: followers
  | "rising_star"
  | "connected"
  | "popular"
  | "influencer"
  // Social: following
  | "community"
  | "connector"
  | "mutual_collector"
  // Messages
  | "conversationalist"
  | "community_voice"
  // Profile
  | "specialist"
  | "complete_profile"
  // Reviews
  | "reviewer"
  // ROI & Analytics
  | "roi_positive"
  | "price_historian"
  // Longevity
  | "founding_collector"
  | "veteran"
  // Multi-format
  | "multi_format"
  // Set completion
  | "set_finisher"
  | "master_setter";

export type BadgeMeta = {
  slug: BadgeSlug;
  label: string;
  description: string;
  color: "emerald" | "blue" | "purple" | "gold" | "amber" | "pink" | "teal";
};

export const BADGES: BadgeMeta[] = [
  // Collection size
  { slug: "first_card",         label: "First Card",          description: "Added your first card to the vault",              color: "emerald" },
  { slug: "collector",          label: "Collector",           description: "10 cards in your collection",                     color: "blue"    },
  { slug: "century",            label: "Century",             description: "100 cards in your collection",                    color: "purple"  },
  { slug: "thousand",           label: "Thousand",            description: "1,000 cards in your collection",                  color: "purple"  },
  { slug: "crown_collector",    label: "Crown Collector",     description: "5,000 cards in your collection",                  color: "gold"    },
  // Collection value
  { slug: "high_roller",        label: "High Roller",         description: "$1,000+ collection value",                        color: "gold"    },
  { slug: "portfolio_builder",  label: "Portfolio Builder",   description: "$5,000+ collection value",                        color: "emerald" },
  { slug: "high_stakes",        label: "High Stakes",         description: "$10,000+ collection value",                       color: "blue"    },
  { slug: "vault_guardian",     label: "Vault Guardian",      description: "$50,000+ collection value",                       color: "purple"  },
  // Marketplace: listings
  { slug: "first_listing",      label: "Merchant",            description: "Listed your first card for sale",                 color: "gold"    },
  { slug: "active_seller",      label: "Active Seller",       description: "5 or more active listings",                      color: "gold"    },
  { slug: "market_maker",       label: "Market Maker",        description: "10 or more active listings",                     color: "gold"    },
  { slug: "dual_lister",        label: "Dual Lister",         description: "Listed cards for both sale and trade",            color: "blue"    },
  // Marketplace: trading
  { slug: "trader",             label: "Trader",              description: "Listed a card for trade",                         color: "blue"    },
  // Grading
  { slug: "graded",             label: "Grader",              description: "Added a professionally graded card",              color: "amber"   },
  { slug: "grading_enthusiast", label: "Grade Enthusiast",    description: "10 graded cards in your collection",              color: "amber"   },
  { slug: "grading_expert",     label: "Grading Expert",      description: "25 graded cards in your collection",              color: "amber"   },
  { slug: "perfect_grade",      label: "Perfect Grade",       description: "A card graded 9.5 or higher",                    color: "gold"    },
  // Sealed products
  { slug: "sealed_collector",   label: "Sealed Collector",    description: "Added your first sealed product",                 color: "blue"    },
  { slug: "box_hoarder",        label: "Box Hoarder",         description: "10 or more sealed products in inventory",         color: "purple"  },
  // Pack reveals
  { slug: "pack_logger",        label: "Pack Logger",         description: "Logged your first pack reveal",                   color: "teal"    },
  { slug: "prolific_puller",    label: "Prolific Puller",     description: "50 pack reveals logged",                         color: "teal"    },
  { slug: "box_breaker",        label: "Box Breaker",         description: "150 pack reveals logged",                        color: "teal"    },
  // Transactions
  { slug: "deal_maker",         label: "Deal Maker",          description: "Completed your first transaction",                color: "emerald" },
  { slug: "trusted_seller",     label: "Trusted Seller",      description: "10 completed sales",                             color: "gold"    },
  { slug: "trusted_buyer",      label: "Trusted Buyer",       description: "10 completed purchases",                         color: "blue"    },
  { slug: "volume_trader",      label: "Volume Trader",       description: "50 total completed transactions",                 color: "purple"  },
  { slug: "deal_bundler",       label: "Deal Bundler",        description: "Completed a bundle offer",                       color: "amber"   },
  { slug: "negotiator",         label: "Negotiator",          description: "Sent 5 or more counter-offers",                  color: "amber"   },
  // Watchlist
  { slug: "deal_watcher",       label: "Deal Watcher",        description: "10 items on your watchlist",                     color: "blue"    },
  // Wishlist
  { slug: "wishlist_curator",   label: "Wishlist Curator",    description: "10 or more items on your wishlist",               color: "purple"  },
  { slug: "deal_hunter",        label: "Deal Hunter",         description: "5 or more price alerts set",                     color: "amber"   },
  { slug: "serious_hunter",     label: "Serious Hunter",      description: "25 or more items on your wishlist",               color: "purple"  },
  // Social: followers
  { slug: "rising_star",        label: "Rising Star",         description: "Got your first follower",                        color: "pink"    },
  { slug: "connected",          label: "Connected",           description: "10 followers",                                   color: "pink"    },
  { slug: "popular",            label: "Popular",             description: "50 followers",                                   color: "pink"    },
  { slug: "influencer",         label: "Influencer",          description: "100 followers",                                  color: "pink"    },
  // Social: following
  { slug: "community",          label: "Community",           description: "Following 5 or more collectors",                 color: "teal"    },
  { slug: "connector",          label: "Connector",           description: "Following 25 or more collectors",                color: "teal"    },
  { slug: "mutual_collector",   label: "Mutual Collector",    description: "5 or more mutual follows",                       color: "teal"    },
  // Messages
  { slug: "conversationalist",  label: "Conversationalist",   description: "Sent 25 messages",                               color: "teal"    },
  { slug: "community_voice",    label: "Community Voice",     description: "Sent 100 messages",                              color: "teal"    },
  // Profile
  { slug: "specialist",         label: "Specialist",          description: "Set a specialty on your profile",                color: "blue"    },
  { slug: "complete_profile",   label: "Complete Profile",    description: "Filled out all profile fields",                  color: "gold"    },
  // Reviews
  { slug: "reviewer",           label: "Reviewer",            description: "Submitted your first review",                    color: "emerald" },
  // ROI & Analytics
  { slug: "roi_positive",       label: "In the Green",        description: "Portfolio market value exceeds cost basis",      color: "emerald" },
  { slug: "price_historian",    label: "Price Historian",     description: "30 days of portfolio price history",             color: "blue"    },
  // Longevity
  { slug: "founding_collector", label: "Established",         description: "Member for 6 or more months",                   color: "gold"    },
  { slug: "veteran",            label: "Year One",            description: "Member for 1 or more years",                    color: "purple"  },
  // Multi-format
  { slug: "multi_format",       label: "Multi-Format",        description: "Cards and sealed products in your inventory",    color: "teal"    },
  // Set completion
  { slug: "set_finisher",       label: "Set Finisher",        description: "Completed a full set — one of every card",       color: "emerald" },
  { slug: "master_setter",      label: "Master Setter",       description: "Completed a master set — every finish of every card", color: "gold" },
];

export const BADGE_MAP = new Map<BadgeSlug, BadgeMeta>(
  BADGES.map((b) => [b.slug, b])
);

export type BadgeStats = {
  totalCards: number;
  activeListings: number;
  forTradeCount: number;
  gradedCount: number;
  collectionValue: number;
  followerCount: number;
  followingCount: number;
};

/**
 * The count-derivable badges, as data rather than an if-chain.
 *
 * Extracted so the same numbers can drive both awarding and a
 * progress-to-next-badge UI. While these lived as hardcoded `if` statements there
 * was no way to ask "how far off is the next one?", which is why the app could
 * award a badge but never show anyone what they were working toward.
 *
 * Order is significant: `computeEarnedSlugs` returns slugs in this order, and it
 * matches the original if-chain exactly so the output is unchanged. There is a
 * parity test pinning this (`__tests__/lib/badges.test.ts`) — if you reorder these
 * rows, that test is what will tell you.
 *
 * NOTE: the other ~28 slugs are awarded by the SQL `check_user_badges()` RPC and
 * still hold their thresholds in that function. Milestones therefore only cover
 * the badges listed here. Unifying the two is tracked in TODO.md's backlog.
 */
export type BadgeThreshold = {
  slug: BadgeSlug;
  stat: keyof BadgeStats;
  threshold: number;
};

export const BADGE_THRESHOLDS: BadgeThreshold[] = [
  // Collection size
  { slug: "first_card",         stat: "totalCards",      threshold: 1     },
  { slug: "collector",          stat: "totalCards",      threshold: 10    },
  { slug: "century",            stat: "totalCards",      threshold: 100   },
  { slug: "thousand",           stat: "totalCards",      threshold: 1000  },
  { slug: "crown_collector",    stat: "totalCards",      threshold: 5000  },
  // Collection value
  { slug: "high_roller",        stat: "collectionValue", threshold: 1000  },
  { slug: "portfolio_builder",  stat: "collectionValue", threshold: 5000  },
  { slug: "high_stakes",        stat: "collectionValue", threshold: 10000 },
  { slug: "vault_guardian",     stat: "collectionValue", threshold: 50000 },
  // Marketplace
  { slug: "first_listing",      stat: "activeListings",  threshold: 1     },
  { slug: "active_seller",      stat: "activeListings",  threshold: 5     },
  { slug: "market_maker",       stat: "activeListings",  threshold: 10    },
  // Trading
  { slug: "trader",             stat: "forTradeCount",   threshold: 1     },
  // Grading
  { slug: "graded",             stat: "gradedCount",     threshold: 1     },
  { slug: "grading_enthusiast", stat: "gradedCount",     threshold: 10    },
  { slug: "grading_expert",     stat: "gradedCount",     threshold: 25    },
  // Social: followers
  { slug: "rising_star",        stat: "followerCount",   threshold: 1     },
  { slug: "connected",          stat: "followerCount",   threshold: 10    },
  { slug: "popular",            stat: "followerCount",   threshold: 50    },
  { slug: "influencer",         stat: "followerCount",   threshold: 100   },
  // Social: following
  { slug: "community",          stat: "followingCount",  threshold: 5     },
  { slug: "connector",          stat: "followingCount",  threshold: 25    },
];

export function computeEarnedSlugs(stats: BadgeStats): BadgeSlug[] {
  return BADGE_THRESHOLDS
    .filter(({ stat, threshold }) => stats[stat] >= threshold)
    .map(({ slug }) => slug);
}

export async function awardBadges(
  supabase: SupabaseClient,
  userId: string,
  newSlugs: BadgeSlug[],
): Promise<BadgeSlug[]> {
  if (newSlugs.length === 0) return [];
  const { error } = await supabase.from("user_badges").upsert(
    newSlugs.map((badge_slug) => ({ user_id: userId, badge_slug })),
    { onConflict: "user_id,badge_slug", ignoreDuplicates: true },
  );
  if (error) return [];
  return newSlugs;
}
