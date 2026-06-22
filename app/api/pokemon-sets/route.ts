import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    // Don't leak the upstream status (e.g. pokemontcg.io 429/403) to the client.
    return NextResponse.json({ error: "Failed to fetch sets" }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
