/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";

export type OfferType = "cash" | "trade" | "bundle";

const OFFER_EXPIRY_DAYS = 7;
const MAX_PENDING_PER_LISTING = 3;

function isExpired(createdAt: string): boolean {
  const expiry = new Date(createdAt);
  expiry.setDate(expiry.getDate() + OFFER_EXPIRY_DAYS);
  return new Date() > expiry;
}

export async function createOffer(params: {
  listingId: string;
  recipientId: string;
  offerType: OfferType;
  offerAmount?: number | null;
  selectedItems?: { itemId: string; role: "offered" | "requested" }[];
  message?: string | null;
}): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (user.id === params.recipientId) throw new Error("Cannot offer to yourself");

  // Rate limit: max 3 non-expired pending offers per sender/listing pair
  const expiryThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("offers")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", user.id)
    .eq("listing_id", params.listingId)
    .eq("status", "pending")
    .gt("created_at", expiryThreshold);

  if ((count ?? 0) >= MAX_PENDING_PER_LISTING) {
    throw new Error(
      `You already have ${MAX_PENDING_PER_LISTING} pending offers on this listing. Wait for a response before sending more.`
    );
  }

  const { data, error } = await supabase
    .from("offers")
    .insert({
      listing_id:   params.listingId,
      sender_id:    user.id,
      recipient_id: params.recipientId,
      offer_type:   params.offerType,
      offer_amount: params.offerAmount ?? null,
      message:      params.message ?? null,
      status:       "pending",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error("Failed to create offer");

  const items = params.selectedItems ?? [];
  if (items.length > 0) {
    const admin = createAdminClient();
    const { error: itemsError } = await admin.from("offer_items").insert(
      items.map((item) => ({
        offer_id:           data.id,
        collection_item_id: item.itemId,
        role:               item.role,
      }))
    );
    if (itemsError) throw new Error("Failed to save offer items");
  }

  revalidatePath("/offers");
  return { id: data.id };
}

export async function respondToOffer(
  offerId: string,
  action: "accepted" | "declined",
  keptItemIds?: string[]
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (action === "accepted") {
    const admin = createAdminClient();

    const { data: offer } = await supabase
      .from("offers")
      .select("listing_id, sender_id, offer_type, offer_amount, message, created_at")
      .eq("id", offerId)
      .eq("recipient_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (!offer) throw new Error("Offer not found or already responded to");

    if (isExpired(offer.created_at as string)) {
      throw new Error("This offer has expired and can no longer be accepted.");
    }

    const { data: listing } = await admin
      .from("collection_items")
      .select("id, card_id, condition, finish, grader, grade, cert_number, notes, quantity, for_sale, for_trade, cards(name)")
      .eq("id", offer.listing_id)
      .maybeSingle();

    if (!listing) throw new Error("Listing not found");

    // ── Inventory operations FIRST so a failure leaves status=pending ──

    // 1. Hold seller's main listing; explicitly clear availability flags
    const { error: holdErr } = await supabase
      .from("collection_items")
      .update({ on_hold: true, hold_offer_id: offerId, for_sale: false, for_trade: false })
      .eq("id", (listing as any).id);

    if (holdErr) throw new Error("Failed to reserve listing");

    // Record the listing's original availability so it can be restored on cancel
    await admin.from("offer_items").insert({
      offer_id:           offerId,
      collection_item_id: (listing as any).id,
      role:               "listing",
      original_for_sale:  (listing as any).for_sale  ?? false,
      original_for_trade: (listing as any).for_trade ?? false,
    });

    // 2. Create pending copy of listing for buyer
    const { error: pendingErr } = await admin.from("collection_items").insert({
      user_id:         offer.sender_id,
      card_id:         (listing as any).card_id,
      condition:       listing.condition            ?? null,
      finish:          (listing as any).finish       ?? null,
      grader:          listing.grader               ?? null,
      grade:           listing.grade                ?? null,
      cert_number:     (listing as any).cert_number ?? null,
      notes:           listing.notes                ?? null,
      quantity:        1,
      for_sale:        false,
      for_trade:       false,
      transfer_status: "pending",
      from_offer_id:   offerId,
    });

    if (pendingErr) {
      await supabase.from("collection_items")
        .update({ on_hold: false, hold_offer_id: null })
        .eq("id", (listing as any).id);
      throw new Error("Failed to create pending item for buyer");
    }

    // 3. Trade: put buyer's offered cards on hold, create pending copies for seller
    if (offer.offer_type === "trade") {
      const { data: offeredRows } = await admin
        .from("offer_items")
        .select("collection_item_id")
        .eq("offer_id", offerId)
        .eq("role", "offered");

      const offeredIds = (offeredRows ?? []).map((r) => r.collection_item_id as string);

      if (offeredIds.length > 0) {
        const { data: offeredCards } = await admin
          .from("collection_items")
          .select("id, card_id, condition, finish, grader, grade, cert_number, notes, for_sale, for_trade")
          .in("id", offeredIds)
          .eq("on_hold", false)
          .is("transfer_status", null);

        if (!offeredCards || offeredCards.length !== offeredIds.length) {
          // Rollback: release the main listing hold and delete the pending copy
          await supabase.from("collection_items")
            .update({ on_hold: false, hold_offer_id: null })
            .eq("id", (listing as any).id);
          await admin.from("collection_items").delete()
            .eq("from_offer_id", offerId).eq("transfer_status", "pending");
          throw new Error("One or more of the offered items are no longer available.");
        }

        // Store original availability so it can be restored if this deal is cancelled
        for (const card of offeredCards) {
          await admin
            .from("offer_items")
            .update({
              original_for_sale:  (card as any).for_sale  ?? false,
              original_for_trade: (card as any).for_trade ?? false,
            })
            .eq("offer_id", offerId)
            .eq("collection_item_id", card.id)
            .eq("role", "offered");
        }

        await admin.from("collection_items")
          .update({ on_hold: true, hold_offer_id: offerId, for_sale: false, for_trade: false })
          .in("id", offeredIds);

        await admin.from("collection_items").insert(
          offeredCards.map((c) => ({
            user_id:         user.id,
            card_id:         (c as any).card_id,
            condition:       c.condition            ?? null,
            finish:          (c as any).finish       ?? null,
            grader:          c.grader               ?? null,
            grade:           c.grade                ?? null,
            cert_number:     (c as any).cert_number ?? null,
            notes:           c.notes                ?? null,
            quantity:        1,
            for_sale:        false,
            for_trade:       false,
            transfer_status: "pending",
            from_offer_id:   offerId,
          }))
        );
      }
    }

    // 4. Bundle: hold seller's requested items, create pending copies for buyer
    if (offer.offer_type === "bundle") {
      const { data: requestedRows } = await admin
        .from("offer_items")
        .select("collection_item_id")
        .eq("offer_id", offerId)
        .eq("role", "requested");

      let requestedIds = (requestedRows ?? []).map((r) => r.collection_item_id as string);

      // Partial acceptance: filter to only items the seller chose to keep
      if (keptItemIds && keptItemIds.length > 0) {
        requestedIds = requestedIds.filter((id) => keptItemIds.includes(id));
      }

      if (requestedIds.length > 0) {
        const { data: requestedItems } = await admin
          .from("collection_items")
          .select("id, card_id, condition, finish, grader, grade, cert_number, notes, for_sale, for_trade")
          .in("id", requestedIds)
          .eq("on_hold", false)
          .is("transfer_status", null);

        const validItems = requestedItems ?? [];

        if (validItems.length > 0) {
          // Store original availability so it can be restored if this deal is cancelled
          for (const item of validItems) {
            await admin
              .from("offer_items")
              .update({
                original_for_sale:  (item as any).for_sale  ?? false,
                original_for_trade: (item as any).for_trade ?? false,
              })
              .eq("offer_id", offerId)
              .eq("collection_item_id", item.id)
              .eq("role", "requested");
          }

          await admin.from("collection_items")
            .update({ on_hold: true, hold_offer_id: offerId, for_sale: false, for_trade: false })
            .in("id", validItems.map((i) => i.id));

          await admin.from("collection_items").insert(
            validItems.map((c) => ({
              user_id:         offer.sender_id,
              card_id:         (c as any).card_id,
              condition:       c.condition            ?? null,
              finish:          (c as any).finish       ?? null,
              grader:          c.grader               ?? null,
              grade:           c.grade                ?? null,
              cert_number:     (c as any).cert_number ?? null,
              notes:           c.notes                ?? null,
              quantity:        1,
              for_sale:        false,
              for_trade:       false,
              transfer_status: "pending",
              from_offer_id:   offerId,
            }))
          );
        }
      }
    }

    // 5. Mark offer accepted AFTER all inventory work
    const { error: offerErr } = await supabase
      .from("offers")
      .update({ status: "accepted" })
      .eq("id", offerId);

    if (offerErr) throw new Error("Failed to accept offer");

    // 6. Get or create conversation, send acceptance message
    const [p1, p2] = [user.id, offer.sender_id as string].sort() as [string, string];
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id")
      .eq("participant_1", p1)
      .eq("participant_2", p2)
      .maybeSingle();

    let convId: string;
    if (existingConv) {
      convId = existingConv.id;
    } else {
      const { data: newConv, error: convErr } = await supabase
        .from("conversations")
        .insert({ participant_1: p1, participant_2: p2, listing_id: offer.listing_id })
        .select("id")
        .single();
      if (convErr || !newConv) throw new Error("Failed to create conversation");
      convId = newConv.id;
    }

    const cardsRaw = (listing as any).cards;
    const cardName: string = (Array.isArray(cardsRaw) ? cardsRaw[0]?.name : cardsRaw?.name) ?? "the card";
    const LABEL: Record<string, string> = { cash: "Cash Offer", trade: "Trade Offer", bundle: "Bundle Request" };
    const typeLabel = LABEL[offer.offer_type as string] ?? offer.offer_type;

    let body = `I have accepted your ${typeLabel} for ${cardName}.`;
    if (offer.offer_type === "cash" && offer.offer_amount != null) {
      body = `I have accepted your Cash Offer of $${Number(offer.offer_amount).toFixed(2)} for ${cardName}.`;
    }
    body += " Please message me to arrange shipping.";

    await supabase.from("messages").insert({
      conversation_id: convId,
      sender_id:       user.id,
      body,
      is_system:       true,
    });

    revalidatePath("/messages");
    revalidatePath(`/messages/${convId}`);

  } else {
    // Soft-delete: update status rather than destroying the row
    const { error } = await supabase
      .from("offers")
      .update({ status: "declined" })
      .eq("id", offerId)
      .eq("recipient_id", user.id)
      .eq("status", "pending");

    if (error) throw new Error("Failed to decline offer");
  }

  revalidatePath("/offers");
  revalidatePath(`/offers/${offerId}`);
}

export async function cancelOffer(offerId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("offers")
    .update({ status: "cancelled" })
    .eq("id", offerId)
    .eq("sender_id", user.id)
    .eq("status", "pending");

  if (error) throw new Error("Failed to cancel offer");
  revalidatePath("/offers");
  revalidatePath(`/offers/${offerId}`);
}

export async function cancelAcceptedOffer(offerId: string) {
  const supabase = await createClient();
  const admin    = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: offer } = await supabase
    .from("offers")
    .select("id, sender_id, recipient_id, listing_id")
    .eq("id", offerId)
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .eq("status", "accepted")
    .maybeSingle();

  if (!offer) throw new Error("Offer not found or cannot be cancelled");

  // Delete all pending inventory copies created for this offer
  await admin
    .from("collection_items")
    .delete()
    .eq("from_offer_id", offerId)
    .eq("transfer_status", "pending");

  // Release all held originals, restoring their original for_sale/for_trade flags
  const { data: heldOriginals } = await admin
    .from("collection_items")
    .select("id")
    .eq("hold_offer_id", offerId);

  const { data: cancelOfferItems } = await admin
    .from("offer_items")
    .select("collection_item_id, original_for_sale, original_for_trade")
    .eq("offer_id", offerId);

  const restoreMap = new Map(
    (cancelOfferItems ?? []).map((oi) => [
      oi.collection_item_id as string,
      { for_sale: (oi as any).original_for_sale as boolean | null, for_trade: (oi as any).original_for_trade as boolean | null },
    ])
  );

  for (const held of heldOriginals ?? []) {
    const restore = restoreMap.get(held.id as string);
    const update: Record<string, unknown> = { on_hold: false, hold_offer_id: null };
    if (restore?.for_sale  != null) update.for_sale  = restore.for_sale;
    if (restore?.for_trade != null) update.for_trade = restore.for_trade;
    await admin.from("collection_items").update(update).eq("id", held.id as string);
  }

  // Mark cancelled
  await admin
    .from("offers")
    .update({ status: "cancelled" })
    .eq("id", offerId);

  // Notify the other party via the existing message thread if one exists
  const [p1, p2] = [offer.sender_id as string, offer.recipient_id as string].sort() as [string, string];
  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("participant_1", p1)
    .eq("participant_2", p2)
    .maybeSingle();

  if (conv) {
    await supabase.from("messages").insert({
      conversation_id: conv.id,
      sender_id:       user.id,
      body:            "This accepted offer has been cancelled. All held items have been released.",
      is_system:       true,
    });
    revalidatePath("/messages");
    revalidatePath(`/messages/${conv.id}`);
  }

  revalidatePath("/offers");
  revalidatePath(`/offers/${offerId}`);
}

export async function markItemReceived(offerId: string) {
  const supabase = await createClient();
  const admin    = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: offer } = await supabase
    .from("offers")
    .select("sender_id, recipient_id")
    .eq("id", offerId)
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .eq("status", "accepted")
    .maybeSingle();

  if (!offer) throw new Error("Offer not found");

  const otherId = user.id === offer.sender_id ? offer.recipient_id : offer.sender_id;

  // Promote this user's pending items to normal inventory
  const { data: myPendingItems } = await supabase
    .from("collection_items")
    .select("id")
    .eq("from_offer_id", offerId)
    .eq("user_id", user.id)
    .eq("transfer_status", "pending");

  if (!myPendingItems || myPendingItems.length === 0) {
    throw new Error("No pending items found. You may have already confirmed receipt.");
  }

  await supabase
    .from("collection_items")
    .update({ transfer_status: null, from_offer_id: null })
    .in("id", myPendingItems.map((i) => i.id));

  // Check if the other party still has pending items (two-phase gate)
  const { data: theirPendingItems } = await admin
    .from("collection_items")
    .select("id")
    .eq("from_offer_id", offerId)
    .eq("user_id", otherId as string)
    .eq("transfer_status", "pending");

  if ((theirPendingItems ?? []).length === 0) {
    // Both parties confirmed — clean up held originals and complete the offer
    const [{ data: heldItems }, { data: completionOfferItems }] = await Promise.all([
      admin
        .from("collection_items")
        .select("id, quantity")
        .eq("hold_offer_id", offerId),
      admin
        .from("offer_items")
        .select("collection_item_id, original_for_sale, original_for_trade")
        .eq("offer_id", offerId),
    ]);

    const completionRestoreMap = new Map(
      (completionOfferItems ?? []).map((oi) => [
        oi.collection_item_id as string,
        { for_sale: (oi as any).original_for_sale as boolean | null, for_trade: (oi as any).original_for_trade as boolean | null },
      ])
    );

    for (const held of heldItems ?? []) {
      const qty = (held as any).quantity ?? 1;
      if (qty > 1) {
        const restore = completionRestoreMap.get(held.id as string);
        const update: Record<string, unknown> = { quantity: qty - 1, on_hold: false, hold_offer_id: null };
        if (restore?.for_sale  != null) update.for_sale  = restore.for_sale;
        if (restore?.for_trade != null) update.for_trade = restore.for_trade;
        await admin.from("collection_items").update(update).eq("id", (held as any).id);
      } else {
        await admin
          .from("collection_items")
          .delete()
          .eq("id", (held as any).id);
      }
    }

    await admin
      .from("offers")
      .update({ status: "completed" })
      .eq("id", offerId);
  }
  // else: other party still needs to confirm — leave offer as accepted

  revalidatePath("/inventory");
  revalidatePath("/offers");
  revalidatePath(`/offers/${offerId}`);
}

export async function reportDispute(params: {
  offerId: string;
  cardName: string;
  otherUsername: string;
  description: string;
}): Promise<string> {
  const supabase = await createClient();
  const admin    = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const adminUsername = process.env.ADMIN_USERNAME;
  if (!adminUsername) throw new Error("Support contact is not configured.");

  const { data: adminProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("username", adminUsername)
    .maybeSingle();

  if (!adminProfile) throw new Error("Support is unavailable right now.");

  const [p1, p2] = [user.id, adminProfile.id as string].sort() as [string, string];

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("participant_1", p1)
    .eq("participant_2", p2)
    .maybeSingle();

  let convId: string;
  if (existing) {
    convId = existing.id;
  } else {
    const { data: newConv, error } = await supabase
      .from("conversations")
      .insert({ participant_1: p1, participant_2: p2 })
      .select("id")
      .single();
    if (error || !newConv) throw new Error("Failed to open support thread.");
    convId = newConv.id;
  }

  await supabase.from("messages").insert({
    conversation_id: convId,
    sender_id: user.id,
    body: `[Dispute — Offer ${params.offerId}]\nCard: ${params.cardName}\nOther party: @${params.otherUsername}\n\n${params.description}`,
  });

  revalidatePath("/messages");
  revalidatePath(`/messages/${convId}`);
  return convId;
}

export async function counterOffer(params: {
  offerId: string;
  counterAmount?: number | null;
  message?: string | null;
}): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: original } = await supabase
    .from("offers")
    .select("id, listing_id, sender_id, offer_type, offer_amount, created_at")
    .eq("id", params.offerId)
    .eq("recipient_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  if (!original) throw new Error("Offer not found or cannot be countered");

  if (isExpired(original.created_at as string)) {
    throw new Error("This offer has expired.");
  }

  // Create counter-offer with sender/recipient reversed
  const { data: newOffer, error } = await supabase
    .from("offers")
    .insert({
      listing_id:      original.listing_id,
      sender_id:       user.id,
      recipient_id:    original.sender_id,
      offer_type:      original.offer_type,
      offer_amount:    params.counterAmount ?? null,
      message:         params.message ?? null,
      status:          "pending",
      parent_offer_id: original.id,
    })
    .select("id")
    .single();

  if (error || !newOffer) {
    if (error?.message?.includes("parent_offer_id")) {
      throw new Error("Counter-offers require the offer system migration to be run first. See docs/offer-system-migration.sql.");
    }
    throw new Error("Failed to create counter-offer");
  }

  // Soft-close the original offer
  await supabase
    .from("offers")
    .update({ status: "countered" })
    .eq("id", params.offerId);

  revalidatePath("/offers");
  revalidatePath(`/offers/${params.offerId}`);
  return { id: newOffer.id };
}
