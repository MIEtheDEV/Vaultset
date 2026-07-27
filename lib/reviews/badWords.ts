/**
 * Vendored word lists for review moderation.
 *
 * Source: "List of Dirty, Naughty, Obscene, and Otherwise Bad Words" (LDNOOBW),
 * maintained by Shutterstock — https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words
 * Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0):
 * https://creativecommons.org/licenses/by/4.0/
 *
 * Vendored (not installed) so there's no runtime dependency and the list stays
 * auditable and editable in-repo. Curated down from the 403-entry English list to
 * single tokens that could plausibly appear in a 140-character card review — the
 * long tail of multi-word adult-search phrases was dropped as noise, and terms
 * absent from LDNOOBW but relevant here were added by hand.
 *
 * TWO TIERS, TWO DIFFERENT ACTIONS:
 *   HATE_WORDS      → the review is hidden from every public surface pending review.
 *                     Masking is not enough: "go back to your ****" is still hateful.
 *   PROFANITY_WORDS → the word is masked in place and the review publishes normally.
 *                     "prices are s***" is legitimate feedback, not abuse.
 *
 * Deliberately NOT included:
 *   - Mild expletives (damn, hell, crap, ass, jerk) — masking these reads as prissy
 *     and none of them are what anyone means by "vulgar".
 *   - "jap" — in a Pokémon TCG context this is overwhelmingly shorthand for Japanese
 *     cards ("jap exclusives"), so matching it would fire on ordinary collector talk.
 *   - "nip", "abo", "gyp" — same problem: common words or abbreviations in normal use.
 */

/** Matched with an optional suffix by default, so plurals and -ing/-ed forms are caught. */
export const HATE_WORDS = [
  "beaner", "bulldyke", "chink", "coon", "darkie", "fag", "faggot", "gook",
  "honkey", "jigaboo", "kike", "nigga", "nigger", "nigra", "paki", "raghead",
  "retard", "shemale", "towelhead", "tranny", "wetback", "wigger", "zipperhead",
] as const;

export const PROFANITY_WORDS = [
  "apeshit", "arse", "arsehole", "asshole", "bastard", "bitch", "blowjob",
  "bollocks", "bullshit", "clit", "clitoris", "clusterfuck", "cock", "cum",
  "cunt", "dick", "dildo", "douche", "fuck", "handjob", "jizz", "motherfucker",
  "piss", "prick", "pussy", "shag", "shit", "slut", "tit", "titty", "twat",
  "wank", "whore",
] as const;

/**
 * Words where a suffix match would swallow an innocent word. These match exactly,
 * on word boundaries only.
 *
 *   spic  → spice, spicy ("spicy pull!" is ordinary collector slang)
 *   arse  → arsenal
 *   cock  → cocktail
 *   dick  → Dickinson
 *   tit   → title, titan
 *   cum   → cumulative, cumin
 *   shag  → shaggy
 *   prick → prickly
 */
export const EXACT_ONLY = new Set([
  "spic", "arse", "cock", "dick", "tit", "cum", "shag", "prick",
]);

/** Short slurs whose plural has to be listed explicitly because they're EXACT_ONLY. */
export const HATE_EXACT_EXTRA = ["spic", "spics", "spick", "spicks"] as const;
