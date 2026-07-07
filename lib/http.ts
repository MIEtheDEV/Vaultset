// fetch() with a hard timeout. Server-side upstream calls (pokemontcg.io,
// JustTCG) had no timeout, so a slow/hanging provider blocked the whole request
// until the platform killed the function — surfacing to the client as
// "Failed to fetch" (e.g. the card scanner hanging when JustTCG stalls). This
// bounds each call so a stalled upstream fails fast and the caller can degrade
// (return [] / fall back) instead of hanging.
export async function fetchWithTimeout(
  url: string,
  opts: RequestInit & { next?: { revalidate?: number | false } } = {},
  ms = 5000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
