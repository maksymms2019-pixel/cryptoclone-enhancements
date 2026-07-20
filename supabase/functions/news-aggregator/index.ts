// news-aggregator — fetches RSS/Atom from a wide list of crypto sources,
// normalizes URLs (unwraps Feedburner, strips utm_*), extracts thumbnails
// and short summaries, and upserts into news_cache. Idempotent on url.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SOURCES: { name: string; url: string }[] = [
  { name: "CoinDesk",        url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Decrypt",         url: "https://decrypt.co/feed" },
  { name: "Cointelegraph",   url: "https://cointelegraph.com/rss" },
  { name: "The Block",       url: "https://www.theblock.co/rss.xml" },
  { name: "Bitcoin Magazine",url: "https://bitcoinmagazine.com/.rss/full/" },
  { name: "CryptoSlate",     url: "https://cryptoslate.com/feed/" },
  { name: "BeInCrypto",      url: "https://beincrypto.com/feed/" },
  { name: "CryptoPotato",    url: "https://cryptopotato.com/feed/" },
  { name: "NewsBTC",         url: "https://www.newsbtc.com/feed/" },
  { name: "U.Today",         url: "https://u.today/rss" },
  { name: "Bankless",        url: "https://newsletter.banklesshq.com/feed" },
  { name: "Watcher.Guru",    url: "https://watcher.guru/news/feed" },
  { name: "Crypto Briefing", url: "https://cryptobriefing.com/feed/" },
  { name: "AMBCrypto",       url: "https://ambcrypto.com/feed/" },
  // Geopolitics & macro — markets react heavily to these.
  { name: "Reuters World",   url: "https://www.reutersagency.com/feed/?best-topics=political-general&post_type=best" },
  { name: "Al Jazeera",      url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "CNBC Economy",    url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258" },
  { name: "CNBC Finance",    url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664" },
  { name: "Investing.com",   url: "https://www.investing.com/rss/news_25.rss" },
  { name: "Yahoo Finance",   url: "https://finance.yahoo.com/news/rssindex" },
  { name: "ZeroHedge",       url: "https://feeds.feedburner.com/zerohedge/feed" },
];

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;/g, "’")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&hellip;/g, "…");
}
function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function normalizeUrl(raw: string, origLink?: string | null): string {
  let u = (origLink ?? raw).trim();
  // Unwrap common feedproxy redirects (best-effort)
  try {
    const parsed = new URL(u);
    if (parsed.hostname.includes("feedproxy.google.com") ||
        parsed.hostname.includes("feeds.feedburner.com")) {
      // Last segment is typically the destination slug; we keep the URL since
      // the redirect itself is HTTPS and resolves. The bigger fix is preferring
      // <feedburner:origLink>, which we already do via origLink param.
    }
    // Strip tracking params
    const toDelete: string[] = [];
    parsed.searchParams.forEach((_v, k) => {
      if (/^utm_/i.test(k) || k === "source" || k === "ref" || k === "from") toDelete.push(k);
    });
    toDelete.forEach((k) => parsed.searchParams.delete(k));
    return parsed.toString();
  } catch {
    return u;
  }
}

type Parsed = {
  title: string;
  link: string;
  pubDate: string;
  summary: string | null;
  image: string | null;
};

function pickFirst(block: string, regexes: RegExp[]): string | null {
  for (const re of regexes) {
    const m = block.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function parseFeed(xml: string): Parsed[] {
  const items: Parsed[] = [];
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blockRe = isAtom ? /<entry[\s\S]*?<\/entry>/g : /<item[\s\S]*?<\/item>/g;
  const blocks = xml.match(blockRe) ?? [];

  for (const block of blocks) {
    const titleRaw =
      pickFirst(block, [/<title[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/title>/i, /<title[^>]*>([\s\S]*?)<\/title>/i]);
    if (!titleRaw) continue;
    const title = stripTags(titleRaw);

    // Prefer feedburner origLink to get the real publisher URL
    const orig = pickFirst(block, [/<feedburner:origLink>([\s\S]*?)<\/feedburner:origLink>/i]);

    let link: string | null = null;
    if (isAtom) {
      // Prefer alternate text/html
      const altMatch = block.match(/<link[^>]+rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i)
                    ?? block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
      link = altMatch?.[1] ?? null;
    } else {
      link = pickFirst(block, [/<link>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/link>/i, /<link>([\s\S]*?)<\/link>/i]);
    }
    if (!link) continue;

    const dateRaw =
      pickFirst(block, [
        /<pubDate>([\s\S]*?)<\/pubDate>/i,
        /<dc:date>([\s\S]*?)<\/dc:date>/i,
        /<published>([\s\S]*?)<\/published>/i,
        /<updated>([\s\S]*?)<\/updated>/i,
      ]) ?? new Date().toISOString();

    let pubDate: string;
    try { pubDate = new Date(dateRaw.trim()).toISOString(); }
    catch { pubDate = new Date().toISOString(); }

    // Summary candidates
    const summaryRaw =
      pickFirst(block, [
        /<description[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/description>/i,
        /<description[^>]*>([\s\S]*?)<\/description>/i,
        /<summary[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/summary>/i,
        /<summary[^>]*>([\s\S]*?)<\/summary>/i,
        /<content:encoded[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/content:encoded>/i,
      ]);
    let summary = summaryRaw ? stripTags(summaryRaw) : null;
    if (summary && summary.length > 220) summary = summary.slice(0, 217).trimEnd() + "…";

    // Image candidates
    let image: string | null =
      pickFirst(block, [
        /<media:content[^>]+url=["']([^"']+)["']/i,
        /<media:thumbnail[^>]+url=["']([^"']+)["']/i,
        /<enclosure[^>]+type=["']image\/[^"']+["'][^>]+url=["']([^"']+)["']/i,
        /<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\/[^"']+["']/i,
      ]);
    if (!image && summaryRaw) {
      const imgInHtml = summaryRaw.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgInHtml) image = imgInHtml[1];
    }

    items.push({
      title,
      link: normalizeUrl(link, orig),
      pubDate,
      summary,
      image,
    });
  }
  return items;
}

function deriveTags(title: string, summary: string | null): string[] {
  const t = `${title} ${summary ?? ""}`.toLowerCase();
  const tags: string[] = [];
  if (/(\bbtc\b|bitcoin)/.test(t)) tags.push("BTC");
  if (/(\beth\b|ethereum|ether\b)/.test(t)) tags.push("ETH");
  if (/(\bsol\b|solana)/.test(t)) tags.push("SOL");
  if (/(\betf\b)/.test(t)) tags.push("ETF");
  if (/(sec |\bsec\b|regul|cftc|law|court|sanction|lawsuit|enforce)/.test(t)) tags.push("Регуляції");
  if (/(\bfed\b|federal reserve|inflation|macro|\bcpi\b|fomc|\bgdp\b|rate cut|interest rate|jobs report|unemployment|recession|treasury yield|\bppi\b|jerome powell|gold price|oil price|crude|dollar index|\bdxy\b)/.test(t)) tags.push("Макро");
  if (/(\bwar\b|warfare|military|missile|geopolit|sanction|china|\bxi jinping\b|russia|ukraine|israel|gaza|iran|middle east|\bopec\b|tariff|trade war|election|white house|\btrump\b|\bnato\b|conflict|invasion|ceasefire)/.test(t)) tags.push("Геополітика");
  if (/(hack|exploit|drain|stolen|breach|phishing)/.test(t)) tags.push("Безпека");
  if (/(defi|dex|liquidity|tvl|staking)/.test(t)) tags.push("DeFi");
  if (/(\bnft\b|collectible)/.test(t)) tags.push("NFT");
  if (/(memecoin|meme coin|\bdoge\b|\bshib\b|\bpepe\b|\bwif\b|\bbonk\b)/.test(t)) tags.push("Меми");
  if (/(\bai\b|artificial intelligence|machine learning|gpt|openai)/.test(t)) tags.push("AI");
  return tags;
}

// Sources that publish broad news — only keep items relevant to a crypto investor.
const GENERAL_SOURCES = new Set(["Reuters World", "Al Jazeera", "CNBC Economy", "CNBC Finance", "Investing.com", "Yahoo Finance", "ZeroHedge"]);
const RELEVANT_TAGS = new Set(["BTC", "ETH", "SOL", "ETF", "Регуляції", "Макро", "Геополітика", "DeFi", "Безпека", "NFT", "Меми", "AI"]);
function isRelevantForInvestor(source: string, tags: string[]): boolean {
  if (!GENERAL_SOURCES.has(source)) return true;
  return tags.some((t) => RELEVANT_TAGS.has(t));
}

// ---- Smart ranking ----------------------------------------------------------
const TAG_WEIGHT: Record<string, number> = {
  BTC: 6, ETH: 5, ETF: 5, "Геополітика": 6, "Регуляції": 5, "Макро": 5, "Безпека": 5,
  SOL: 3, DeFi: 2, AI: 2, NFT: 1, "Меми": 1,
};
const SOURCE_TRUST: Record<string, number> = {
  "CoinDesk": 4, "Cointelegraph": 3, "The Block": 4, "Decrypt": 3, "Crypto Briefing": 3,
  "Bitcoin Magazine": 3, "Bankless": 3, "Watcher.Guru": 2,
  "Reuters World": 4, "CNBC Economy": 3, "CNBC Finance": 3, "Al Jazeera": 2,
};

function freshnessBoost(publishedAt: string): number {
  const ageH = (Date.now() - new Date(publishedAt).getTime()) / 3_600_000;
  if (ageH < 1) return 7;
  if (ageH < 3) return 5;
  if (ageH < 8) return 3;
  if (ageH < 24) return 1.5;
  if (ageH < 48) return 0.5;
  return 0;
}

// Hot coins reflect what the market reacts to right now.
async function fetchHotCoins(): Promise<{ symbols: Set<string>; movers: Record<string, number> }> {
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h",
      { signal: AbortSignal.timeout(7000) },
    );
    if (!r.ok) return { symbols: new Set(), movers: {} };
    const arr = (await r.json()) as Array<{ symbol: string; price_change_percentage_24h: number }>;
    const movers: Record<string, number> = {};
    for (const c of arr) {
      if (Math.abs(c.price_change_percentage_24h) >= 5) movers[c.symbol.toLowerCase()] = c.price_change_percentage_24h;
    }
    return { symbols: new Set(arr.map((c) => c.symbol.toLowerCase())), movers };
  } catch {
    return { symbols: new Set(), movers: {} };
  }
}

function computeScore(row: { title: string; source: string; tags: string[]; image_url: string | null; published_at: string }, hot: { symbols: Set<string>; movers: Record<string, number> }): number {
  let s = 0;
  for (const t of row.tags) s += TAG_WEIGHT[t] ?? 0;
  s += SOURCE_TRUST[row.source] ?? 1;
  s += freshnessBoost(row.published_at);
  if (row.image_url) s += 1.5;
  // money-mention boost: explicit price/amount in headline grabs attention
  if (/\$\s?\d|\d+%|\d+\s?(million|billion|trillion|млрд|млн)/i.test(row.title)) s += 2;
  // hot-coin mentions
  const title = row.title.toLowerCase();
  for (const sym of Object.keys(hot.movers)) {
    if (sym.length < 3) continue;
    if (new RegExp(`\\b${sym}\\b`).test(title)) {
      s += Math.min(4, Math.abs(hot.movers[sym]) / 3);
      break;
    }
  }
  // demote very short clickbait titles
  if (row.title.length < 30) s -= 1;
  return Math.round(s * 10) / 10;
}

// Token-based shingling for cheap clustering across sources
const STOPWORDS = new Set("a an the and or of to in for on at by with from is are was were be been being as that this it its will would could should has have had say says said new now today this week".split(" "));
function tokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}
function clusterKey(title: string): string {
  // Pick top-4 most distinctive tokens, sorted, as a deterministic cluster id.
  const tks = tokens(title);
  const uniq = Array.from(new Set(tks));
  // prefer longer/proper-noun-looking tokens first
  uniq.sort((a, b) => b.length - a.length);
  return uniq.slice(0, 4).sort().join("-") || title.slice(0, 24);
}

// ---- Ukrainian translation (controlled Gemini flow) ----------------------
const TR_SYSTEM = `Ти професійний перекладач крипто-новин українською.
Перекладай природно, коротко й зрозуміло для української аудиторії.
Не додавай фактів, оцінок, пояснень або коментарів.
Власні назви, тикери, бренди й абревіатури (Bitcoin, Ethereum, BTC, ETH, SEC, ETF, Coinbase) залишай латиницею.
На вхід надходить JSON-масив {id,title,summary}. Поверни тільки JSON-масив {id,title_uk,summary_uk}.`;

const TR_SINGLE_SYSTEM = `Ти професійний перекладач крипто-новин українською.
Перекладай природно, коротко й зрозуміло. Не додавай пояснень.
Власні назви, тикери, бренди й абревіатури залишай латиницею.
Поверни тільки два поля у форматі:
TITLE_UK: переклад заголовка
SUMMARY_UK: переклад опису`;

// Keep several direct Gemini model names because user-owned Gemini projects can
// expose different model generations. We try stable Flash variants first.
const TR_MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-flash"];
const TR_RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      id: { type: "STRING" },
      title_uk: { type: "STRING" },
      summary_uk: { type: "STRING" },
    },
    required: ["id", "title_uk", "summary_uk"],
  },
};

type TrIn = { id: string; title: string; summary: string | null; title_uk?: string | null };
type TrOut = { id: string; title_uk: string; summary_uk: string };
type TrStats = { requested: number; found: number; already: number; translated: number; failed: number; error?: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cyrillicCount(s: string): number {
  return (s.match(/[\u0400-\u04FF]/g) ?? []).length;
}

function isUsableTranslation(original: string, translated: string): boolean {
  const out = translated.trim();
  if (!out || out.length < 3) return false;
  if (cyrillicCount(original) > original.length * 0.25) return true;
  return cyrillicCount(out) >= 3 && out.toLowerCase() !== original.trim().toLowerCase();
}

function parseTranslationJson(raw: string): unknown {
  const clean = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf("[");
    const end = clean.lastIndexOf("]");
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw new Error("translation JSON parse failed");
  }
}

function normalizeTranslationResponse(parsed: unknown, source: TrIn[]): TrOut[] {
  const allowed = new Map(source.map((it) => [it.id, it]));
  const maybeObj = parsed as { items?: unknown; translations?: unknown; data?: unknown };
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray(maybeObj?.items)
      ? maybeObj.items
      : Array.isArray(maybeObj?.translations)
        ? maybeObj.translations
        : Array.isArray(maybeObj?.data)
          ? maybeObj.data
          : [];
  const byId = new Map<string, TrOut>();
  for (const x of arr) {
    const o = x as { id?: unknown; title_uk?: unknown; titleUk?: unknown; title?: unknown; summary_uk?: unknown; summaryUk?: unknown; summary?: unknown };
    const id = String(o.id ?? "").trim();
    const original = allowed.get(id);
    if (!original) continue;
    const title = String(o.title_uk ?? o.titleUk ?? o.title ?? "").trim();
    if (!isUsableTranslation(original.title, title)) continue;
    byId.set(id, {
      id,
      title_uk: title,
      summary_uk: String(o.summary_uk ?? o.summaryUk ?? o.summary ?? "").trim(),
    });
  }
  return Array.from(byId.values());
}

function geminiBody(items: TrIn[], withSchema: boolean): Record<string, unknown> {
  const payload = items.map((it) => ({
    id: it.id,
    title: it.title.slice(0, 260),
    summary: (it.summary ?? "").slice(0, 420),
  }));
  const generationConfig: Record<string, unknown> = {
    temperature: 0,
    topP: 0.8,
    maxOutputTokens: Math.max(1024, items.length * 340),
    responseMimeType: "application/json",
  };
  if (withSchema) generationConfig.responseSchema = TR_RESPONSE_SCHEMA;
  return {
    systemInstruction: { parts: [{ text: TR_SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
    generationConfig,
  };
}

async function callGeminiBatch(items: TrIn[]): Promise<TrOut[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  let lastErr = "";

  for (const model of TR_MODELS) {
    for (const withSchema of [true, false]) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(geminiBody(items, withSchema)),
          signal: AbortSignal.timeout(9_000),
        });
        const bodyText = await r.text();
        if (!r.ok) {
          lastErr = `${model} ${r.status}: ${bodyText.slice(0, 180)}`;
          if (r.status === 400 && withSchema) continue;
          if (r.status === 429) await sleep(900);
          continue;
        }
        const j = JSON.parse(bodyText);
        const raw = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
        if (!raw.trim()) {
          lastErr = `${model} empty response ${JSON.stringify(j).slice(0, 240)}`;
          continue;
        }
        const normalized = normalizeTranslationResponse(parseTranslationJson(raw), items);
        if (normalized.length) return normalized;
        lastErr = `${model} produced no usable rows`;
      } catch (e) {
        lastErr = String((e as Error)?.message ?? e);
      }
    }
  }
  throw new Error(lastErr || "Gemini translation failed");
}

async function translateTextFallback(text: string): Promise<string> {
  const clean = text.trim();
  if (!clean) return "";
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=uk&dt=t&q=${encodeURIComponent(clean)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`fallback translate ${r.status}`);
  const j = await r.json();
  const out = Array.isArray(j?.[0]) ? j[0].map((part: unknown[]) => part?.[0] ?? "").join("") : "";
  return String(out || clean).trim();
}

async function translateOneFallback(item: TrIn): Promise<TrOut | null> {
  try {
    const combined = item.summary ? `${item.title}\n---SUMMARY---\n${item.summary}` : item.title;
    const out = await translateTextFallback(combined);
    const [titleRaw, summaryRaw = ""] = out.split(/\n---SUMMARY---\n|---SUMMARY---/);
    const title_uk = titleRaw.trim();
    if (!isUsableTranslation(item.title, title_uk)) return null;
    return { id: item.id, title_uk, summary_uk: summaryRaw.trim() };
  } catch (e) {
    console.warn("[translate fallback] skipped", item.id, (e as Error)?.message);
    return null;
  }
}

function parseSingleTranslation(raw: string, item: TrIn): TrOut | null {
  const clean = raw.trim().replace(/^```[a-z]*\s*/i, "").replace(/```$/i, "").trim();
  const titleMatch = clean.match(/TITLE_UK\s*:\s*([\s\S]*?)(?:\n\s*SUMMARY_UK\s*:|$)/i);
  const summaryMatch = clean.match(/SUMMARY_UK\s*:\s*([\s\S]*)$/i);
  let title_uk = (titleMatch?.[1] ?? "").trim();
  let summary_uk = (summaryMatch?.[1] ?? "").trim();

  if (!title_uk) {
    const lines = clean.split(/\n+/).map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim()).filter(Boolean);
    title_uk = lines[0] ?? "";
    summary_uk = lines.slice(1).join(" ").trim();
  }

  title_uk = title_uk.replace(/^['"“”]+|['"“”]+$/g, "").trim();
  summary_uk = summary_uk.replace(/^['"“”]+|['"“”]+$/g, "").trim();
  if (!isUsableTranslation(item.title, title_uk)) return null;
  return { id: item.id, title_uk, summary_uk };
}

async function callGeminiOne(item: TrIn): Promise<TrOut | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const prompt = `Заголовок:\n${item.title}\n\nОпис:\n${item.summary ?? ""}`;
  let lastErr = "";

  for (const model of TR_MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: TR_SINGLE_SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 520 },
        }),
        signal: AbortSignal.timeout(8_000),
      });
      const bodyText = await r.text();
      if (!r.ok) {
        lastErr = `${model} ${r.status}: ${bodyText.slice(0, 160)}`;
        if (r.status === 429) await sleep(700);
        continue;
      }
      const j = JSON.parse(bodyText);
      const raw = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
      const parsed = parseSingleTranslation(raw, item);
      if (parsed) return parsed;
      lastErr = `${model} unusable single response`;
    } catch (e) {
      lastErr = String((e as Error)?.message ?? e);
    }
  }
  console.warn("[translate one] failed", item.id, lastErr);
  return null;
}

async function translateRowsIndividually(rows: TrIn[], concurrency: number): Promise<TrOut[]> {
  const out: TrOut[] = [];
  for (let i = 0; i < rows.length; i += concurrency) {
    const group = rows.slice(i, i + concurrency);
    const results = await Promise.allSettled(group.map((row) => callGeminiOne(row)));
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) out.push(result.value);
    }
    if (i + concurrency < rows.length) await sleep(700);
  }
  return out;
}

async function translateChunkReliably(items: TrIn[], depth = 0): Promise<TrOut[]> {
  if (!items.length) return [];
  try {
    const rows = await callGeminiBatch(items);
    const translatedIds = new Set(rows.map((r) => r.id));
    const missing = items.filter((it) => !translatedIds.has(it.id));
    if (!missing.length || items.length === 1 || depth >= 3) return rows;
    await sleep(450);
    return [...rows, ...(await translateChunkReliably(missing, depth + 1))];
  } catch (e) {
    console.warn("[translate] chunk failed", items.map((it) => it.id), (e as Error)?.message);
    if (items.length === 1 || depth >= 3) return [];
    const mid = Math.ceil(items.length / 2);
    await sleep(650 + depth * 350);
    const left = await translateChunkReliably(items.slice(0, mid), depth + 1);
    await sleep(650 + depth * 350);
    const right = await translateChunkReliably(items.slice(mid), depth + 1);
    return [...left, ...right];
  }
}

async function translateRows(rows: TrIn[], options: { batchSize: number; fallbackBudget: number; preferFallback?: boolean }): Promise<TrOut[]> {
  const byId = new Map<string, TrOut>();

  if (options.preferFallback) {
    const translated = await translateRowsIndividually(rows, options.batchSize);
    for (const tr of translated) byId.set(tr.id, tr);
    return Array.from(byId.values());
  }

  for (let i = 0; i < rows.length; i += options.batchSize) {
    const chunk = rows.slice(i, i + options.batchSize);
    const translated = await translateChunkReliably(chunk);
    for (const tr of translated) byId.set(tr.id, tr);
    if (i + options.batchSize < rows.length) await sleep(900);
  }

  // Public fallback is deliberately tiny and sequential. It prevents one-off
  // failures but avoids the 429 storm that made previous translation unstable.
  let fallbackLeft = options.fallbackBudget;
  for (const row of rows) {
    if (fallbackLeft <= 0) break;
    if (byId.has(row.id)) continue;
    await sleep(1400);
    const tr = await translateOneFallback(row);
    if (tr) byId.set(row.id, tr);
    fallbackLeft--;
  }
  return Array.from(byId.values());
}

// deno-lint-ignore no-explicit-any
async function persistTranslations(supabase: any, translated: TrOut[]): Promise<number> {
  let done = 0;
  for (const tr of translated) {
    const { error } = await supabase
      .from("news_cache")
      .update({ title_uk: tr.title_uk.trim(), summary_uk: tr.summary_uk?.trim() || null })
      .eq("id", tr.id);
    if (error) {
      console.warn("[translate] update failed", tr.id, error.message);
    } else {
      done++;
    }
  }
  return done;
}

// deno-lint-ignore no-explicit-any
async function translateSelected(supabase: any, ids: string[]): Promise<TrStats> {
  const cleanIds = Array.from(new Set(ids.map((id) => String(id)).filter(Boolean))).slice(0, 24);
  if (cleanIds.length === 0) return { requested: 0, found: 0, already: 0, translated: 0, failed: 0 };

  const { data, error } = await supabase
    .from("news_cache")
    .select("id,title,summary,title_uk")
    .in("id", cleanIds);
  if (error) {
    console.warn("[translateSelected] fetch failed", error.message);
    return { requested: cleanIds.length, found: 0, already: 0, translated: 0, failed: cleanIds.length, error: error.message };
  }

  const fetched = (data ?? []) as TrIn[];
  const rows = fetched.filter((row) => !row.title_uk?.trim());
  const already = fetched.length - rows.length;
  if (!rows.length) return { requested: cleanIds.length, found: fetched.length, already, translated: 0, failed: 0 };

  try {
    const translated = await translateRows(rows, { batchSize: 4, fallbackBudget: rows.length, preferFallback: true });
    const saved = await persistTranslations(supabase, translated);
    return {
      requested: cleanIds.length,
      found: fetched.length,
      already,
      translated: saved,
      failed: Math.max(0, rows.length - saved),
    };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    console.warn("[translateSelected] failed", msg);
    return { requested: cleanIds.length, found: fetched.length, already, translated: 0, failed: rows.length, error: msg };
  }
}

// deno-lint-ignore no-explicit-any
async function translateRecent(supabase: any): Promise<TrStats> {
  const { data, error } = await supabase
    .from("news_cache")
    .select("id,title,summary,title_uk")
    .is("title_uk", null)
    .order("published_at", { ascending: false })
    .limit(48);
  if (error) return { requested: 48, found: 0, already: 0, translated: 0, failed: 0, error: error.message };
  const rows = (data ?? []) as TrIn[];
  if (!rows.length) return { requested: 0, found: 0, already: 0, translated: 0, failed: 0 };

  try {
    const translated = await translateRows(rows, { batchSize: 4, fallbackBudget: 0 });
    const saved = await persistTranslations(supabase, translated);
    return { requested: rows.length, found: rows.length, already: 0, translated: saved, failed: Math.max(0, rows.length - saved) };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    console.warn("[translateRecent] failed", msg);
    return { requested: rows.length, found: rows.length, already: 0, translated: 0, failed: rows.length, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let body: { translate_ids?: unknown } = {};
    try { body = await req.json(); } catch { body = {}; }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (Array.isArray(body.translate_ids)) {
      const stats = await translateSelected(supabase, body.translate_ids.map(String));
      return new Response(JSON.stringify({ ok: true, ...stats }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    type Row = {
      url: string; title: string; source: string;
      published_at: string; tags: string[];
      summary: string | null; image_url: string | null;
      title_uk: string | null; summary_uk: string | null; sentiment: null;
      importance_score: number; cluster_id: string;
    };
    const all: Row[] = [];
    const hot = await fetchHotCoins();

    const results = await Promise.allSettled(SOURCES.map(async (src) => {
      const r = await fetch(src.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; CryptoTimeBot/1.0; +https://cryptotime.app)",
          "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8",
        },
        signal: AbortSignal.timeout(9000),
      });
      if (!r.ok) throw new Error(`${src.name} ${r.status}`);
      const xml = await r.text();
      const items = parseFeed(xml).slice(0, 18);
      for (const it of items) {
        const tags = deriveTags(it.title, it.summary);
        if (!isRelevantForInvestor(src.name, tags)) continue;
        const base = {
          url: it.link,
          title: it.title,
          source: src.name,
          published_at: it.pubDate,
          tags,
          summary: it.summary,
          image_url: it.image,
        };
        all.push({
          ...base,
          title_uk: null,
          summary_uk: null,
          sentiment: null,
          importance_score: computeScore(base, hot),
          cluster_id: clusterKey(it.title),
        });
      }
    }));

    const failed = results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason?.message ?? "?");
    if (failed.length) console.warn("[news] failed sources:", failed);

    if (all.length === 0) {
      return new Response(JSON.stringify({ ok: true, inserted: 0, failed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // De-dup by url within this batch (some sources cross-post)
    const seen = new Set<string>();
    const unique = all.filter((it) => (seen.has(it.url) ? false : (seen.add(it.url), true)));

    const { error } = await supabase
      .from("news_cache")
      .upsert(unique, { onConflict: "url", ignoreDuplicates: true });
    if (error) throw error;

    // Translate the freshest, most important pieces to Ukrainian so the
    // News page reads natively for non-English speakers.
    let translationStats: TrStats = { requested: 0, found: 0, already: 0, translated: 0, failed: 0 };
    try {
      translationStats = await translateRecent(supabase);
    } catch (e) {
      console.warn("[news-aggregator] translate step failed:", (e as Error)?.message);
    }

    return new Response(JSON.stringify({ ok: true, inserted: unique.length, sources: SOURCES.length, translated: translationStats.translated, translation: translationStats, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[news-aggregator]", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
