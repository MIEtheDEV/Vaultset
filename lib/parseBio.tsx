import Link from "next/link";

const SEGMENT_RE = /(\[[^\]]+\]\(\/[^)]+\))/;
const LINK_RE    = /\[([^\]]+)\]\((\/[^)]+)\)/;

export function parseBio(bio: string): React.ReactNode {
  const segments = bio.split(SEGMENT_RE);
  return segments.map((seg, i) => {
    const match = LINK_RE.exec(seg);
    if (match) {
      const [, label, href] = match;
      return (
        <Link
          key={i}
          href={href}
          className="text-gold hover:text-gold-light underline underline-offset-2 transition-colors"
        >
          {label}
        </Link>
      );
    }
    return seg;
  });
}
