import { buildPushPayload } from "@/lib/notificationPush";

// Bulk listing rolls many wishlist matches into ONE notification (see
// notify_wishlist_matches). Before that, listing a 30-card set fired 30 pushes at
// every wisher at once. These lock in that the rolled-up payload reads correctly
// and — just as important — that the single-match payload is unchanged, since
// that's what every non-bulk listing still produces.

describe("buildPushPayload — wishlist_listing_match", () => {
  it("leaves the single-match payload exactly as it was", () => {
    const p = buildPushPayload(
      { type: "wishlist_listing_match", data: { card_name: "Charizard", listing_id: "abc", match_count: 1 } },
      "seller",
    );

    expect(p.title).toBe("Wishlist match");
    expect(p.body).toBe("Charizard was just listed");
    expect(p.url).toBe("/marketplace/abc");
    expect(p.tag).toBe("wishlist_match:abc");
  });

  it("treats a payload with no match_count as a single match", () => {
    // Notifications written before the rollup shipped have no match_count.
    const p = buildPushPayload(
      { type: "wishlist_listing_match", data: { card_name: "Charizard", listing_id: "abc" } },
      "seller",
    );

    expect(p.title).toBe("Wishlist match");
    expect(p.url).toBe("/marketplace/abc");
  });

  it("summarises a bulk listing and links to the seller's storefront", () => {
    const p = buildPushPayload(
      { type: "wishlist_listing_match", data: { card_name: "Charizard", listing_id: "abc", match_count: 12 } },
      "seller",
    );

    expect(p.title).toBe("Wishlist matches");
    expect(p.body).toBe("Charizard and 11 more cards on your wishlist were just listed");
    // A single listing would strand the other 11 cards this covers.
    expect(p.url).toBe("/marketplace/user/seller");
    // Seller-scoped so two bulk listings from the same seller collapse.
    expect(p.tag).toBe("wishlist_match:seller:seller");
  });

  it("uses the singular when exactly one other card matched", () => {
    const p = buildPushPayload(
      { type: "wishlist_listing_match", data: { card_name: "Charizard", listing_id: "abc", match_count: 2 } },
      "seller",
    );

    expect(p.body).toBe("Charizard and 1 more card on your wishlist were just listed");
  });

  it("falls back to the marketplace when the seller's username is unknown", () => {
    const p = buildPushPayload(
      { type: "wishlist_listing_match", data: { card_name: "Charizard", listing_id: "abc", match_count: 5 } },
      null,
    );

    expect(p.url).toBe("/marketplace");
    expect(p.tag).toBe("wishlist_match");
  });
});
