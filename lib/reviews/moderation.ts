import {
  EXACT_ONLY,
  HATE_EXACT_EXTRA,
  HATE_WORDS,
  PROFANITY_WORDS,
} from "@/lib/reviews/badWords";

/**
 * Deterministic review moderation — pure functions, no network, no API key, no cost.
 *
 * Runs in-process inside `submitReview` before the row is written. Two outcomes:
 *   - hate speech      → `hidden: true`, held off every public surface for admin review
 *   - profanity        → masked in place ("f***ing"), publishes immediately
 *   - links / contacts → `hidden: true` (a URL inside 140 chars is near-certainly spam)
 *
 * Everything here keys on the *form* of the text, never its sentiment. A one-star
 * review calling the prices wrong must sail straight through — suppressing genuine
 * negative feedback is both dishonest and an FTC problem. Nothing in this file
 * inspects the rating.
 */

/** Leetspeak substitutions, applied per character when building a matcher. */
const LEET: Record<string, string> = {
  a: "a4@", b: "b8", e: "e3", g: "g9", i: "i1!|", l: "l1", o: "o0",
  s: "s5$", t: "t7+", z: "z2",
};

/**
 * Separators tolerated *between* letters, so "f.u.c.k" and "s-h-i-t" still match.
 * Whitespace is deliberately excluded — allowing it would let a matcher span word
 * boundaries and flag innocent phrases whose initials happen to line up.
 */
const SEP = "[._\\-*+]?";

function escape(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Builds a leetspeak- and separator-tolerant matcher for one word. */
function toPattern(word: string, allowSuffix: boolean): string {
  const body = word
    .split("")
    .map((ch) => {
      const variants = LEET[ch];
      return variants ? `[${variants}]` : escape(ch);
    })
    .join(SEP);
  // Lookarounds rather than \b: the character classes above include punctuation
  // like "$" and "!", which \b would treat as a boundary and match across.
  return `(?<![a-z0-9])${body}${allowSuffix ? "[a-z]*" : ""}(?![a-z0-9])`;
}

function buildRegex(words: readonly string[]): RegExp {
  const patterns = words.map((w) => toPattern(w, !EXACT_ONLY.has(w)));
  return new RegExp(patterns.join("|"), "gi");
}

// Built once at module load — these lists never change at runtime.
const HATE_RE = buildRegex([...HATE_WORDS, ...HATE_EXACT_EXTRA]);
const PROFANITY_RE = buildRegex(PROFANITY_WORDS);

/**
 * Links, emails, @handles, and phone numbers. Inside a 140-character card review
 * these are near-certainly spam, so this is the highest-precision signal we have.
 */
const CONTACT_RE =
  /(https?:\/\/|www\.[a-z0-9-]+\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\b(?:t\.me|discord\.gg|wa\.me)\b|@[a-z0-9_]{4,}|\+?\d[\d\s().-]{8,}\d)/i;

/** Regexes are stateful with the /g flag — reset before every use. */
function test(re: RegExp, text: string): boolean {
  re.lastIndex = 0;
  return re.test(text);
}

/** Replaces each matched word with its first character followed by asterisks. */
function mask(text: string): string {
  PROFANITY_RE.lastIndex = 0;
  return text.replace(PROFANITY_RE, (m) => m[0] + "*".repeat(Math.max(m.length - 1, 1)));
}

export type ModerationFlag =
  | "hate_speech"
  | "link_or_contact"
  | "profanity_masked"
  | "username_flagged";

export type ModerationResult = {
  /** Why this review was flagged. Empty means it passed cleanly. */
  flags: ModerationFlag[];
  /** True when the review must be withheld from public surfaces pending admin review. */
  hidden: boolean;
  /** The body to store and display — profanity masked. */
  body: string;
  /** The untouched original, kept only when masking changed something. */
  bodyRaw: string | null;
  /**
   * True when the author's username itself trips the word list, so it must not be
   * rendered next to the review. The review can still publish under "Anonymous"; the
   * `username_flagged` flag surfaces it in the admin queue, because a username that
   * trips this list is a profile-wide problem, not a review problem.
   */
  forceAnonymous: boolean;
};

export function moderateReview({
  body,
  username,
}: {
  body: string;
  /** The author's profile username. Never free text — see enforce_review_display_name(). */
  username: string;
}): ModerationResult {
  const flags: ModerationFlag[] = [];

  const hate = test(HATE_RE, body);
  if (hate) flags.push("hate_speech");

  const contact = CONTACT_RE.test(body);
  if (contact) flags.push("link_or_contact");

  const maskedBody = mask(body);
  if (maskedBody !== body) flags.push("profanity_masked");

  // The username can't be masked or rewritten — it's the user's identity elsewhere on
  // the site — so the only lever here is whether it gets displayed.
  const forceAnonymous =
    test(HATE_RE, username) || test(PROFANITY_RE, username) || CONTACT_RE.test(username);
  if (forceAnonymous) flags.push("username_flagged");

  return {
    flags,
    hidden: hate || contact,
    body: maskedBody,
    bodyRaw: maskedBody !== body ? body : null,
    forceAnonymous,
  };
}
