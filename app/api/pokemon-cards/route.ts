import { NextResponse } from "next/server";
import { getSearchProvider } from "@/lib/search";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw    = searchParams.get("q")?.trim() ?? "";
  const set    = searchParams.get("set")?.trim()    || undefined;
  const number = searchParams.get("number")?.trim() || undefined;

  const promoRequested = /\bpromo\b/i.test(raw);
  const nameQuery      = raw.replace(/\bpromo\b/gi, "").trim();

  if (nameQuery.length < 2) {
    return NextResponse.json({ data: [] });
  }

  // Polymorphic: swapping the game string here switches the entire
  // search implementation without touching any other code.
  const provider = getSearchProvider("pokemon");

  const results = await provider.search(nameQuery, { set, number, promoRequested });
  return NextResponse.json({ data: results });
}
