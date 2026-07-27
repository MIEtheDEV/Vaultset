import { moderateReview } from "@/lib/reviews/moderation";

const review = (body: string, username = "collector") =>
  moderateReview({ body, username });

describe("moderateReview", () => {
  describe("genuine negative reviews are never suppressed", () => {
    // This is the load-bearing guarantee of the whole module: moderation keys on the
    // *form* of the text, never its sentiment. If any of these start failing, the
    // system has become a review-suppression tool.
    const negatives = [
      "Prices are wrong and the scanner missed half my cards. Disappointing.",
      "Buggy, slow, and the market values are way off. Would not recommend.",
      "Worst tracker I have tried. Lost two cards from my collection.",
      "Pro is not worth the money. Very little extra for the price.",
      "I hate the new layout, it is much harder to use than before.",
    ];

    it.each(negatives)("passes untouched: %s", (body) => {
      const r = review(body);
      expect(r.hidden).toBe(false);
      expect(r.flags).toEqual([]);
      expect(r.body).toBe(body);
      expect(r.bodyRaw).toBeNull();
    });
  });

  describe("hate speech", () => {
    it("hides rather than masks", () => {
      const r = review("this app is for retards");
      expect(r.hidden).toBe(true);
      expect(r.flags).toContain("hate_speech");
    });

    it("forces anonymity when the username is a slur, without burying the review", () => {
      // The username can't be rewritten, so the only lever is whether it's rendered.
      // The review itself is clean, so it still publishes — as "Anonymous collector".
      const r = review("Great app, love the set tracker!", "n1gger");
      expect(r.forceAnonymous).toBe(true);
      expect(r.flags).toContain("username_flagged");
      expect(r.hidden).toBe(false);
    });

    it("sees through leetspeak and punctuation separators", () => {
      expect(review("f.a.g.g.o.t").hidden).toBe(true);
      expect(review("f4gg0t").hidden).toBe(true);
    });
  });

  describe("profanity is masked, not hidden", () => {
    it("masks and publishes", () => {
      const r = review("this app is fucking great");
      expect(r.hidden).toBe(false);
      expect(r.body).toBe("this app is f****** great");
      expect(r.flags).toEqual(["profanity_masked"]);
    });

    it("preserves the original for false-positive recovery", () => {
      const r = review("prices are shit");
      expect(r.bodyRaw).toBe("prices are shit");
      expect(r.body).toBe("prices are s***");
    });

    it("masks suffixed forms", () => {
      expect(review("shitty market data").body).toBe("s***** market data");
    });

    it("hides a profane username behind anonymity rather than masking it", () => {
      // "s***lord" would read as broken next to a review; anonymity is cleaner.
      const r = review("Solid tracker.", "shitlord");
      expect(r.forceAnonymous).toBe(true);
      expect(r.hidden).toBe(false);
    });

    it("leaves a clean username displayable", () => {
      const r = review("Solid tracker.", "AshK");
      expect(r.forceAnonymous).toBe(false);
      expect(r.flags).toEqual([]);
    });
  });

  describe("links and contact details are held", () => {
    it.each([
      "Check out https://cheapcards.example for better prices",
      "email me at seller@example.com to buy direct",
      "dm me @cardflipper99 for deals",
      "buy from me: www.notascam.example",
    ])("hides: %s", (body) => {
      const r = review(body);
      expect(r.hidden).toBe(true);
      expect(r.flags).toContain("link_or_contact");
    });
  });

  describe("false positives", () => {
    // Every one of these contains a blocklist word as a substring. The matcher must
    // not fire on any of them, or ordinary collector talk gets mangled.
    const innocent = [
      "spicy pull from that pack!",
      "the Arsenal card art is great",
      "made a cocktail while sorting my binder",
      "the title screen is clean",
      "cumulative value went up nicely",
      "my shaggy Eevee card is mint",
      "prickly cactus Pokemon are underrated",
      "Dickinson set is hard to find",
      "raccoon Pokemon deserve more love",
      "assassin themed decks are fun",
      "a classy binder setup",
      "titan sized collection goals",
    ];

    it.each(innocent)("does not flag: %s", (body) => {
      const r = review(body);
      expect(r.flags).toEqual([]);
      expect(r.hidden).toBe(false);
      expect(r.body).toBe(body);
    });

    it("does not treat Japanese-card shorthand as a slur", () => {
      // "jap" is deliberately absent from the list: in TCG context it is shorthand
      // for Japanese cards, not an ethnic slur.
      expect(review("love the jap exclusives").hidden).toBe(false);
    });

    it("does not match across word boundaries via whitespace", () => {
      // Separator tolerance covers punctuation only. If it covered whitespace, the
      // initials of innocent phrases would collide with blocklist words.
      expect(review("first hit is tough").flags).toEqual([]);
    });
  });

  describe("mild expletives are left alone", () => {
    it.each(["damn this is rare", "hell of a pull", "the app is crap sometimes"])(
      "does not mask: %s",
      (body) => {
        expect(review(body).body).toBe(body);
      },
    );
  });
});
