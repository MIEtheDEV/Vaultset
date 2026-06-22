/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const BASE = "https://api.pokemontcg.io/v2";

// Bound the work a single request can trigger: each unique set name and each
// unresolved row can cost one outbound pokemontcg.io call, so cap the input to
// stop an authenticated user amplifying one request into thousands of fetches.
const MAX_ROWS = 200;
const MAX_FIELD_LEN = 120;

// Escape characters that have meaning in pokemontcg.io's Lucene-style `q` param
// so user input can't break out of the quoted clause (query injection).
function escapeLucene(value: string): string {
  return value.replace(/["\\]/g, "\\$&").slice(0, MAX_FIELD_LEN);
}

type InputRow = { name: string; set_name: string; card_number?: string };

export type ResolvedCard = {
  pokemon_api_id: string;
  name: string;
  set_name: string;
  card_number: string;
  image_url: string;
  rarity: string;
  is_promo: boolean;
};

function getHeaders(): Record<string, string> {
  return process.env.POKEMON_TCG_API_KEY
    ? { "X-Api-Key": process.env.POKEMON_TCG_API_KEY }
    : {};
}

function mapRarity(apiRarity: string): string {
  const map: Record<string, string> = {
    "common":                    "common",
    "uncommon":                  "uncommon",
    "rare":                      "rare",
    "rare holo":                 "rare_holo",
    "ace spec rare":             "ace_spec_rare",
    "double rare":               "double_rare",
    "ultra rare":                "ultra_rare",
    "illustration rare":         "illustration_rare",
    "special illustration rare": "special_illustration_rare",
    "hyper rare":                "hyper_rare",
    "mega hyper rare":           "hyper_rare",
    "secret rare":               "secret_rare",
    "rare holo v":               "rare_holo_v",
    "rare holo vmax":            "rare_holo_vmax",
    "rare holo vstar":           "rare_holo_vstar",
    "rare ultra":                "rare_ultra",
    "rare rainbow":              "rare_rainbow",
    "rare secret":               "rare_secret",
    "rare shiny":                "rare_shiny",
    "rare shiny gx":             "rare_shiny_gx",
  };
  return map[apiRarity.toLowerCase()] ?? "";
}

function toResolved(card: Record<string, any>): ResolvedCard {
  return {
    pokemon_api_id: card.id,
    name:           card.name,
    set_name:       card.set?.name ?? "",
    card_number:    card.number ?? "",
    image_url:      card.images?.small ?? "",
    rarity:         card.rarity ? mapRarity(card.rarity) : "",
    is_promo:       /promo/i.test(card.set?.name ?? ""),
  };
}

async function fetchSetCards(setName: string): Promise<Record<string, any>[]> {
  try {
    const params = new URLSearchParams({
      q:        `set.name:"${escapeLucene(setName)}"`,
      pageSize: "250",
      select:   "id,name,number,rarity,images,set",
    });
    const res = await fetch(`${BASE}/cards?${params}`, {
      headers: getHeaders(),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return (await res.json()).data ?? [];
  } catch {
    return [];
  }
}

async function fetchByName(name: string): Promise<Record<string, any> | null> {
  try {
    const params = new URLSearchParams({
      q:        `name:"${escapeLucene(name)}"`,
      pageSize: "1",
      select:   "id,name,number,rarity,images,set",
      orderBy:  "-set.releaseDate",
    });
    const res = await fetch(`${BASE}/cards?${params}`, {
      headers: getHeaders(),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return (await res.json()).data?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const rows: InputRow[] = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return NextResponse.json({ results: [] });
  if (rows.length > MAX_ROWS)
    return NextResponse.json(
      { error: `Too many rows. Import at most ${MAX_ROWS} at a time.` },
      { status: 413 },
    );

  // Batch: one request per unique set name instead of one per card
  const uniqueSets = [...new Set(rows.map((r) => r.set_name).filter(Boolean))];

  type SetLookup = { byNumber: Map<string, Record<string, any>>; byName: Map<string, Record<string, any>> };
  const setMaps = new Map<string, SetLookup>();

  for (const setName of uniqueSets) {
    const cards = await fetchSetCards(setName);
    const byNumber = new Map<string, Record<string, any>>();
    const byName   = new Map<string, Record<string, any>>();
    for (const card of cards) {
      if (card.number) byNumber.set(String(card.number).toLowerCase(), card);
      if (card.name)   byName.set(String(card.name).toLowerCase(), card);
    }
    setMaps.set(setName, { byNumber, byName });
  }

  const results: (ResolvedCard | null)[] = [];

  for (const row of rows) {
    let resolved: ResolvedCard | null = null;

    const lookup = row.set_name ? setMaps.get(row.set_name) : undefined;
    if (lookup) {
      // Prefer card number (most precise), fall back to name within set
      const byNum = row.card_number ? lookup.byNumber.get(row.card_number.toLowerCase()) : undefined;
      const byNm  = lookup.byName.get(row.name.toLowerCase());
      const card  = byNum ?? byNm ?? null;
      if (card) resolved = toResolved(card);
    }

    // Fall back to individual name search when set lookup missed
    if (!resolved) {
      const card = await fetchByName(row.name);
      if (card) resolved = toResolved(card);
    }

    results.push(resolved);
  }

  return NextResponse.json({ results });
}
