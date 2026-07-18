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

export function computeEarnedSlugs(stats: BadgeStats): BadgeSlug[] {
  const earned: BadgeSlug[] = [];
  // Collection size
  if (stats.totalCards >= 1)         earned.push("first_card");
  if (stats.totalCards >= 10)        earned.push("collector");
  if (stats.totalCards >= 100)       earned.push("century");
  if (stats.totalCards >= 1000)      earned.push("thousand");
  if (stats.totalCards >= 5000)      earned.push("crown_collector");
  // Collection value
  if (stats.collectionValue >= 1000)  earned.push("high_roller");
  if (stats.collectionValue >= 5000)  earned.push("portfolio_builder");
  if (stats.collectionValue >= 10000) earned.push("high_stakes");
  if (stats.collectionValue >= 50000) earned.push("vault_guardian");
  // Marketplace
  if (stats.activeListings >= 1)     earned.push("first_listing");
  if (stats.activeListings >= 5)     earned.push("active_seller");
  if (stats.activeListings >= 10)    earned.push("market_maker");
  // Trading
  if (stats.forTradeCount >= 1)      earned.push("trader");
  // Grading
  if (stats.gradedCount >= 1)        earned.push("graded");
  if (stats.gradedCount >= 10)       earned.push("grading_enthusiast");
  if (stats.gradedCount >= 25)       earned.push("grading_expert");
  // Social: followers
  if (stats.followerCount >= 1)      earned.push("rising_star");
  if (stats.followerCount >= 10)     earned.push("connected");
  if (stats.followerCount >= 50)     earned.push("popular");
  if (stats.followerCount >= 100)    earned.push("influencer");
  // Social: following
  if (stats.followingCount >= 5)     earned.push("community");
  if (stats.followingCount >= 25)    earned.push("connector");
  return earned;
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
