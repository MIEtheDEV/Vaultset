import type { PushPayload } from "@/lib/push";

/** Columns on `notification_preferences` that gate push per notification type. */
export type PrefKey = "push_offers" | "push_followers" | "push_alerts" | "push_achievements" | "push_messages";

export type NotificationRow = {
  type: string;
  data?: Record<string, unknown> | null;
};

/**
 * The preference toggle that gates a notification type, or null for types that
 * are always delivered (e.g. admin review alerts, or any future/unmapped type —
 * fail open so a new type is never silently swallowed).
 */
export function prefKeyForType(type: string): PrefKey | null {
  switch (type) {
    case "new_offer":               return "push_offers";
    case "new_message":             return "push_messages";
    case "new_follower":            return "push_followers";
    case "price_alert":             return "push_alerts";
    case "wishlist_listing_match":  return "push_alerts";
    case "badge_earned":            return "push_achievements";
    default:                        return null;
  }
}

const OFFER_LABEL: Record<string, string> = {
  trade: "trade offer",
  bundle: "bundle request",
  cash: "cash offer",
};

/**
 * Build the push payload (title/body/url/tag) for a notification. `actorUsername`
 * is the resolved username of `actor_id` when present. Mirrors the in-app copy
 * rendered on /notifications so push and the feed stay consistent.
 */
export function buildPushPayload(n: NotificationRow, actorUsername: string | null): PushPayload {
  const data = (n.data ?? {}) as Record<string, unknown>;
  const str = (k: string): string | undefined => (typeof data[k] === "string" ? (data[k] as string) : undefined);
  const num = (k: string): number => (typeof data[k] === "number" ? (data[k] as number) : Number(data[k] ?? 0));
  const actor = actorUsername ? `@${actorUsername}` : "Someone";

  switch (n.type) {
    case "new_follower":
      return {
        title: "New follower",
        body: `${actor} started following you`,
        url: actorUsername ? `/profile/${actorUsername}` : "/notifications",
        tag: "new_follower",
      };

    case "new_offer": {
      const offerId = str("offer_id");
      const label = OFFER_LABEL[str("offer_type") ?? ""] ?? "offer";
      return {
        title: "New offer",
        body: `${actor} sent you a ${label}`,
        url: offerId ? `/offers/${offerId}` : "/offers",
        tag: offerId ? `new_offer:${offerId}` : "new_offer",
      };
    }

    case "new_message": {
      const convId = str("conversation_id");
      const preview = str("preview");
      return {
        title: actorUsername ? `@${actorUsername}` : "New message",
        body: preview && preview.length > 0 ? preview : "Sent you a message",
        url: convId ? `/messages/${convId}` : "/messages",
        // Collapse rapid messages from the same conversation into one notification.
        tag: convId ? `message:${convId}` : "new_message",
      };
    }

    case "price_alert": {
      const listingId = str("listing_id");
      return {
        title: "Price alert",
        body: `${str("card_name") ?? "A wishlist card"} is listed at $${num("list_price").toFixed(2)}`,
        url: listingId ? `/marketplace/${listingId}` : "/notifications",
        tag: listingId ? `price_alert:${listingId}` : "price_alert",
      };
    }

    case "wishlist_listing_match": {
      const listingId = str("listing_id");
      return {
        title: "Wishlist match",
        body: `${str("card_name") ?? "A card on your wishlist"} was just listed`,
        url: listingId ? `/marketplace/${listingId}` : "/notifications",
        tag: listingId ? `wishlist_match:${listingId}` : "wishlist_match",
      };
    }

    case "badge_earned": {
      const slug = str("badge_slug");
      return {
        title: "Achievement unlocked",
        body: `You earned the ${str("badge_label") ?? slug ?? "new"} badge`,
        url: "/dashboard",
        tag: slug ? `badge:${slug}` : "badge_earned",
      };
    }

    case "new_review":
      return {
        title: "New review",
        body: `${str("reviewer_username") ? `@${str("reviewer_username")}` : "A collector"} submitted a review`,
        url: "/admin/reviews",
        tag: "new_review",
      };

    case "test_push":
      return {
        title: "Vaultset",
        body: "🔔 Push notifications are working!",
        url: "/account",
        tag: "test_push",
      };

    default:
      return {
        title: "Vaultset",
        body: "You have a new notification",
        url: "/notifications",
        tag: n.type || "notification",
      };
  }
}
