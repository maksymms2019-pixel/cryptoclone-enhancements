// translate-uk — on-demand Ukrainian translation via direct Google Gemini API.
// Body: { text: string, kind?: string, key?: string }
// Returns: { text_uk: string }
//
// Uses public.translation_cache for cross-user caching, keyed by sha256(text).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SYSTEM = `Ти перекладач для української крипто-аудиторії.
Перекладай простою, природною українською. Уникай складного жаргону.
Якщо в тексті є HTML — зберігай теги <a>, <p>, <br>, <strong>, <em>.
Власні назви (Bitcoin, Ethereum, Coinbase) залишай як є.
Жодних пояснень, тільки переклад.`;

const GEMINI_MODELS = ["gemini-2.5-flash"];

async function callGemini(text: string): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  let lastErr = "";
  for (const model of GEMINI_MODELS) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: "user", parts: [{ text }] }],
            generationConfig: { temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!r.ok) {
        lastErr = `gemini ${model} ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`;
        if (r.status === 429 || r.status >= 500) continue;
        throw new Error(lastErr);
      }
      const j = await r.json();
      const out = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
      return String(out).trim();
    } catch (e) {
      lastErr = String((e as Error)?.message ?? e);
    }
  }
  throw new Error(lastErr || "gemini failed");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { text, kind = "generic", key: providedKey } = await req.json();
    const clean = String(text ?? "").trim();
    if (!clean) return new Response(JSON.stringify({ text_uk: "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (clean.length > 20_000) {
      return new Response(JSON.stringify({ error: "text too long" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const key = providedKey || await sha256(`${kind}:${clean}`);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cached = await supabase.from("translation_cache").select("text_uk").eq("key", key).maybeSingle();
    if (cached.data?.text_uk) {
      return new Response(JSON.stringify({ text_uk: cached.data.text_uk, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const translated = await callGemini(clean);
    await supabase.from("translation_cache").upsert({ key, kind, text_uk: translated });

    return new Response(JSON.stringify({ text_uk: translated, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[translate-uk]", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
