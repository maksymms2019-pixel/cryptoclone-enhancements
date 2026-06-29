// On-demand Ukrainian translation via Lovable AI (edge function `translate-uk`).
// Uses a small client-side localStorage cache (keyed by sha256(text)) so the
// same piece of content is only translated once per device.

import { supabase } from "@/integrations/supabase/client";

const LS_PREFIX = "cryptotime.tr.uk.v1:";

async function sha256(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function translateToUk(text: string, kind: "coin_description" | "news" | "generic" = "generic"): Promise<string> {
  const clean = (text ?? "").trim();
  if (!clean) return "";
  // Heuristic: if it already looks Ukrainian (Cyrillic-heavy) skip.
  const cyr = (clean.match(/[\u0400-\u04FF]/g) ?? []).length;
  if (cyr > clean.length * 0.35) return clean;

  const key = await sha256(`${kind}:${clean}`);
  try {
    const cached = localStorage.getItem(LS_PREFIX + key);
    if (cached) return cached;
  } catch { /* ignore */ }

  try {
    const { data, error } = await supabase.functions.invoke("translate-uk", {
      body: { text: clean, kind, key },
    });
    if (error) throw error;
    const out = (data as { text_uk?: string })?.text_uk ?? clean;
    try { localStorage.setItem(LS_PREFIX + key, out); } catch { /* ignore */ }
    return out;
  } catch (e) {
    console.warn("[translate-uk] failed", e);
    return clean;
  }
}
