const PATTERNS: RegExp[] = [
  // Expand this list with slurs, hate speech patterns, and contact-solicitation phrases.
  // Each entry is a case-insensitive regex matched against the full text.
  /\b(discord\s*:\s*\S+|telegram\s*:\s*\S+|whatsapp\s*:\s*\S+)/i, // contact solicitation
  /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/,                               // phone numbers
];

export function checkText(text: string): string | null {
  for (const pattern of PATTERNS) {
    if (pattern.test(text)) {
      return "Your text contains content that is not permitted.";
    }
  }
  return null;
}
