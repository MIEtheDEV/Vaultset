/**
 * @jest-environment node
 *
 * READ-ONLY diagnostic — runs the (fixed) JustTcgPriceProvider against the
 * user's REAL collection to see, per card, whether a price + per-condition data
 * comes back. Does NOT write to card_prices or collection_items. Opt-in:
 *
 *   RUN_DIAG=1 npx jest diag.collection
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { JustTcgPriceProvider } from "@/lib/pricing/JustTcgPriceProvider";
import { priceApiId } from "@/lib/pricing/cardIdentity";
import type { CardRef, FetchContext } from "@/lib/pricing/PriceProvider";

const run = process.env.RUN_DIAG ? it : it.skip;

run("reports per-card JustTCG resolution for the real collection", async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: items } = await db
    .from("collection_items")
    .select("id, cards ( id, name, set_name, set_code, card_number, game_data )");

  // Build distinct refs, attaching any known tcgplayer_id from card_prices.
  const refs = new Map<string, CardRef>();
  for (const it of items ?? []) {
    const c: any = Array.isArray(it.cards) ? it.cards[0] : it.cards;
    const gd = (c?.game_data ?? {}) as Record<string, unknown>;
    const apiId = priceApiId(gd, c?.id);
    if (!apiId || refs.has(apiId)) continue;
    refs.set(apiId, {
      apiId,
      tcgplayerId: (gd.tcgplayer_id as string) ?? null,
      name: c?.name, setName: c?.set_name, setCode: c?.set_code, number: c?.card_number,
    });
  }
  const ids = [...refs.keys()];
  const { data: priceRows } = await db.from("card_prices").select("card_api_id, tcgplayer_id").in("card_api_id", ids);
  for (const row of priceRows ?? []) {
    const r = refs.get(row.card_api_id);
    if (r && !r.tcgplayerId) r.tcgplayerId = row.tcgplayer_id ?? null;
  }

  const provider = new JustTcgPriceProvider();
  const ctx: FetchContext = { allowResolve: true, recordRequest: async () => true };
  const out = await provider.fetchBatch([...refs.values()], ctx);

  let priced = 0, withCond = 0;
  const lines: string[] = [];
  for (const r of refs.values()) {
    const p = out.get(r.apiId);
    if (p) priced++;
    if (p?.conditionPrices && Object.keys(p.conditionPrices).length) withCond++;
    lines.push(
      `${p ? "✓" : "✗"} ${r.apiId.padEnd(14)} #${(r.number ?? "?").toString().padEnd(8)} ` +
      `map=${r.tcgplayerId ? "Y" : "n"} ${p ? `cond=${Object.keys(p.conditionPrices ?? {}).length}` : "(no match)"}  ${r.name}`,
    );
  }
  // eslint-disable-next-line no-console
  console.log(`\nDIAG: ${refs.size} cards | priced ${priced} | with per-condition ${withCond}\n` + lines.join("\n") + "\n");
  expect(refs.size).toBeGreaterThan(0);
}, 60000);
