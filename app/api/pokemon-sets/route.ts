import { NextResponse } from "next/server";

export async function GET() {
  const headers: Record<string, string> = {};
  if (process.env.POKEMON_TCG_API_KEY) {
    headers["X-Api-Key"] = process.env.POKEMON_TCG_API_KEY;
  }

  const params = new URLSearchParams({
    pageSize: "250",
    select:   "id,name,series,releaseDate,total,printedTotal",
    orderBy:  "-releaseDate",
  });

  const res = await fetch(`https://api.pokemontcg.io/v2/sets?${params}`, {
    headers,
    next: { revalidate: 86400 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch sets" }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
