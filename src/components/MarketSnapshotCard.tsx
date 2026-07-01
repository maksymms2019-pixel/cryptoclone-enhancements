import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toPng } from "html-to-image";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchGlobal, fetchFearGreed, fetchMarkets } from "@/lib/markets";
import { fmtUsd } from "@/lib/format";
import { fetchMarketMetrics } from "@/lib/metrics";

// Palette — flat, scannable, Incrypted-style.
const BG = "#0B0F14";
const PANEL = "#111820";
const LINE = "rgba(255,255,255,.06)";
const TEXT = "#F5F7FA";
const MUTED = "#8592A0";
const GOLD = "#E7B650";
const GREEN = "#22C55E";
const RED = "#EF4444";

function fgLabel(v: number): string {
  if (v <= 24) return "Extreme Fear";
  if (v <= 44) return "Fear";
  if (v <= 55) return "Neutral";
  if (v <= 74) return "Greed";
  return "Extreme Greed";
}

export function MarketSnapshotCard() {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);

  const global = useQuery({ queryKey: ["global"], queryFn: fetchGlobal });
  const fg = useQuery({ queryKey: ["fg"], queryFn: fetchFearGreed });
  const metrics = useQuery({ queryKey: ["market-metrics"], queryFn: fetchMarketMetrics, staleTime: 300_000 });
  const top = useQuery({ queryKey: ["markets", "snapshot", 8], queryFn: () => fetchMarkets({ perPage: 12, sparkline: false }) });

  const ready = global.data && fg.data && metrics.data && top.data;
  const dateStr = new Date().toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });

  async function save() {
    if (!cardRef.current || !ready) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: BG });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `cryptotime-${new Date().toISOString().slice(0, 10)}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "CryptoTime — Огляд ринку" });
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = file.name;
        a.click();
      }
      toast.success("Картинку збережено");
    } catch (e) {
      toast.error("Не вдалось згенерувати картинку");
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  const capChange = global.data?.market_cap_change_percentage_24h_usd ?? 0;
  const fgVal = fg.data?.value ?? 50;
  const btcDom = global.data?.btc_dominance ?? 0;
  const coins = (top.data ?? []).filter((c) => c.id !== "figure-heloc").slice(0, 8);

  return (
    <section className="surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Огляд ринку</h2>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">Картинка для Telegram / Instagram</p>
        </div>
        <button
          onClick={save}
          disabled={busy || !ready}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#1A0F00] disabled:opacity-50"
          style={{ background: "var(--grad-active)" }}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          Картинка
        </button>
      </div>

      {/* Off-screen 1600x900 share card */}
      <div style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none" }} aria-hidden>
        <div
          ref={cardRef}
          style={{
            width: 1600,
            height: 900,
            background: BG,
            color: TEXT,
            fontFamily: "Inter, system-ui, sans-serif",
            boxSizing: "border-box",
            padding: 56,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* HEADER — logotype left, date right, gold hairline underneath */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", paddingBottom: 22, borderBottom: `1px solid ${GOLD}55` }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: 1, lineHeight: 1 }}>
                CRYPTO<span style={{ color: GOLD }}>TIME</span>
              </div>
              <div style={{ fontSize: 18, color: MUTED, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase" }}>
                Market Overview
              </div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: TEXT, letterSpacing: 0.3 }}>
              {dateStr}
            </div>
          </div>

          {/* KPI ROW — 4 equal panels */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, marginTop: 32 }}>
            <Kpi label="Капіталізація" value={fmtUsd(global.data?.total_market_cap_usd, { compact: true })} pct={capChange} />
            <Kpi label="Обʼєм 24 год" value={fmtUsd(global.data?.total_volume_usd, { compact: true })} />
            <Kpi label="BTC Dominance" value={`${btcDom.toFixed(2)}%`} />
            <Kpi label="Fear & Greed" value={String(fgVal)} pill={fgLabel(fgVal)} />
          </div>

          {/* TOP COINS TABLE */}
          <div style={{ marginTop: 34, flex: 1, background: PANEL, borderRadius: 20, padding: "8px 32px", display: "flex", flexDirection: "column" }}>
            {/* Header row */}
            <div style={{ display: "grid", gridTemplateColumns: "48px 72px 1fr 220px 160px", alignItems: "center", padding: "16px 4px", borderBottom: `1px solid ${LINE}`, fontSize: 14, letterSpacing: 2, textTransform: "uppercase", color: MUTED, fontWeight: 700 }}>
              <div>#</div>
              <div></div>
              <div>Актив</div>
              <div style={{ textAlign: "right" }}>Ціна</div>
              <div style={{ textAlign: "right" }}>24 год</div>
            </div>
            {coins.map((c, i) => {
              const pct = c.price_change_percentage_24h ?? 0;
              const up = pct >= 0;
              return (
                <div
                  key={c.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "48px 72px 1fr 220px 160px",
                    alignItems: "center",
                    padding: "0 4px",
                    flex: 1,
                    borderBottom: i === coins.length - 1 ? "none" : `1px solid ${LINE}`,
                  }}
                >
                  <div style={{ fontSize: 22, fontWeight: 700, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{i + 1}</div>
                  <div>
                    <img src={c.image} crossOrigin="anonymous" width={44} height={44} style={{ borderRadius: 999, display: "block" }} alt="" />
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: TEXT, letterSpacing: 0.4 }}>{c.symbol.toUpperCase()}</div>
                    <div style={{ fontSize: 18, color: MUTED, fontWeight: 500 }}>{c.name}</div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 26, fontWeight: 700, color: TEXT, fontVariantNumeric: "tabular-nums", letterSpacing: -0.2 }}>
                    {fmtUsd(c.current_price, { digits: c.current_price < 1 ? 4 : 2 })}
                  </div>
                  <div style={{ textAlign: "right", fontSize: 22, fontWeight: 800, color: up ? GREEN : RED, fontVariantNumeric: "tabular-nums" }}>
                    {up ? "+" : "−"}{Math.abs(pct).toFixed(2)}%
                  </div>
                </div>
              );
            })}
          </div>

          {/* FOOTER */}
          <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, color: MUTED, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
            <div>Джерело · CoinGecko · Alternative.me</div>
            <div>cryptotime</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Kpi({ label, value, pct, pill }: { label: string; value: string; pct?: number; pill?: string }) {
  const showPct = typeof pct === "number" && isFinite(pct);
  const up = (pct ?? 0) >= 0;
  return (
    <div style={{ background: PANEL, borderRadius: 20, padding: "24px 26px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 14, color: MUTED, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 42, fontWeight: 800, color: TEXT, lineHeight: 1.05, letterSpacing: -0.8, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {showPct && (
        <div style={{ fontSize: 20, fontWeight: 800, color: up ? GREEN : RED, fontVariantNumeric: "tabular-nums" }}>
          {up ? "+" : "−"}{Math.abs(pct!).toFixed(2)}%
        </div>
      )}
      {pill && (
        <div style={{ fontSize: 18, fontWeight: 700, color: GOLD, letterSpacing: 0.3 }}>{pill}</div>
      )}
    </div>
  );
}
