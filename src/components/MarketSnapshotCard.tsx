import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toPng } from "html-to-image";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchGlobal, fetchFearGreed, fetchMarkets } from "@/lib/markets";
import { fmtUsd, fmtPct } from "@/lib/format";
import { fetchMarketMetrics } from "@/lib/metrics";

const GREEN = "#22C55E";
const RED = "#EF4444";
const GOLD = "#E7B650";
const TEXT = "#F8FAFC";
const MUTED = "#8A9BA8";
const BG = "#0E1116";
const CARD = "#1A1D24";
const CARD_BORDER = "rgba(255,255,255,.06)";

function fgLabel(v: number): string {
  if (v <= 24) return "EXTREME FEAR";
  if (v <= 44) return "FEAR";
  if (v <= 55) return "NEUTRAL";
  if (v <= 74) return "GREED";
  return "EXTREME GREED";
}
function fgColor(v: number): string {
  if (v <= 24) return RED;
  if (v <= 44) return "#F97316";
  if (v <= 55) return GOLD;
  if (v <= 74) return "#84CC16";
  return GREEN;
}

export function MarketSnapshotCard() {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);

  const global = useQuery({ queryKey: ["global"], queryFn: fetchGlobal });
  const fg = useQuery({ queryKey: ["fg"], queryFn: fetchFearGreed });
  const metrics = useQuery({ queryKey: ["market-metrics"], queryFn: fetchMarketMetrics, staleTime: 300_000 });
  const top = useQuery({ queryKey: ["markets", "snapshot", 8], queryFn: () => fetchMarkets({ perPage: 12, sparkline: false }) });

  const ready = global.data && fg.data && metrics.data && top.data;
  const dateStr = new Date().toLocaleDateString("en-US", { day: "numeric", month: "long" });

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
  const altIdx = metrics.data?.altseason_index ?? 0;
  const btcDom = global.data?.btc_dominance ?? 0;
  const ethDom = global.data?.eth_dominance ?? 0;
  // Pseudo 24h changes for dominance (we don't have history, leave neutral pill)
  const coins = (top.data ?? []).filter((c) => c.id !== "figure-heloc").slice(0, 7);

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

      {/* Off-screen 1920x1080 share card — clean, scannable, Incrypted-style */}
      <div style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none" }} aria-hidden>
        <div
          ref={cardRef}
          style={{
            width: 1920,
            height: 1080,
            background: BG,
            color: TEXT,
            fontFamily: "Inter, system-ui, sans-serif",
            boxSizing: "border-box",
            padding: 48,
            display: "flex",
            flexDirection: "column",
            gap: 32,
          }}
        >
          {/* HEADER */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div
                style={{
                  width: 72, height: 72, borderRadius: 999, background: "#E0455F",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  boxShadow: "0 8px 24px rgba(224,69,95,.35)",
                }}
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                  <path d="M21 7a4 4 0 0 1-7 2.7L9 14.7l-2-2 5-5A4 4 0 0 1 17 3a4 4 0 0 1 4 4Z" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="m6.5 13.5 4 4M3 21l5-5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: 1, lineHeight: 1 }}>
                CRYPTO<span style={{ color: GOLD }}>TIME</span>
              </div>
            </div>
            <div
              style={{
                background: GOLD, color: "#1A0F00", borderRadius: 999,
                padding: "20px 64px", fontSize: 34, fontWeight: 900, letterSpacing: 0.4,
              }}
            >
              Market overview
            </div>
            <div
              style={{
                background: CARD, borderRadius: 999, padding: "20px 40px",
                fontSize: 28, fontWeight: 700, color: TEXT, border: `1px solid ${CARD_BORDER}`,
              }}
            >
              {dateStr}
            </div>
          </div>

          {/* 3 COLUMNS */}
          <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr 1.25fr", gap: 24, flex: 1, minHeight: 0 }}>
            {/* LEFT — 4 KPI cards stacked */}
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <Kpi label="Crypto market cap" value={fmtUsd(global.data?.total_market_cap_usd, { compact: true })} pct={capChange} />
              <Kpi label="Market volume 24H" value={fmtUsd(global.data?.total_volume_usd, { compact: true })} />
              <Kpi label="BTC Dominance" value={`${btcDom.toFixed(2)}%`} />
              <Kpi label="ETH Dominance" value={`${ethDom.toFixed(2)}%`} />
            </div>

            {/* CENTER — Fear & Greed + Altseason */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div
                style={{
                  background: CARD, borderRadius: 28, border: `1px solid ${CARD_BORDER}`,
                  padding: 28, display: "flex", flexDirection: "column", alignItems: "center", flex: 1.4,
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 700, color: TEXT, marginBottom: 14 }}>Fear & Greed Index</div>
                <FgDonut value={fgVal} />
                <div
                  style={{
                    marginTop: 18, background: "rgba(255,255,255,.06)", borderRadius: 999,
                    padding: "10px 24px", fontSize: 18, fontWeight: 800, color: fgColor(fgVal), letterSpacing: 1,
                  }}
                >
                  {fgLabel(fgVal)}
                </div>
              </div>

              <div
                style={{
                  background: CARD, borderRadius: 28, border: `1px solid ${CARD_BORDER}`,
                  padding: 24, display: "flex", flexDirection: "column", alignItems: "center", flex: 1,
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: 10 }}>Altcoin Season Index</div>
                <AltseasonGauge value={altIdx} />
              </div>
            </div>

            {/* RIGHT — coins list */}
            <div
              style={{
                background: CARD, borderRadius: 28, border: `1px solid ${CARD_BORDER}`,
                padding: "22px 26px", display: "flex", flexDirection: "column", justifyContent: "space-between",
              }}
            >
              {coins.map((c) => {
                const pct = c.price_change_percentage_24h ?? 0;
                const up = pct >= 0;
                return (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 18 }}>
                    <img
                      src={c.image} crossOrigin="anonymous" width={56} height={56}
                      style={{ borderRadius: 999, flexShrink: 0 }} alt=""
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1, color: TEXT }}>{c.name}</div>
                      <div style={{ fontSize: 16, color: MUTED, fontWeight: 600, marginTop: 4, letterSpacing: 0.5 }}>
                        {c.symbol.toUpperCase()}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 26, fontWeight: 800, color: TEXT, tabularNums: true } as React.CSSProperties}>
                        {fmtUsd(c.current_price, { digits: c.current_price < 1 ? 4 : 2 })}
                      </div>
                      <div
                        style={{
                          marginTop: 6, display: "inline-flex", alignItems: "center", gap: 4,
                          background: up ? "rgba(34,197,94,.16)" : "rgba(239,68,68,.16)",
                          color: up ? GREEN : RED,
                          borderRadius: 999, padding: "4px 12px", fontSize: 15, fontWeight: 800,
                        }}
                      >
                        {up ? "↑" : "↓"} {Math.abs(pct).toFixed(2)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Kpi({ label, value, pct }: { label: string; value: string; pct?: number }) {
  const showPct = typeof pct === "number" && isFinite(pct);
  const up = (pct ?? 0) >= 0;
  return (
    <div
      style={{
        background: CARD, borderRadius: 28, border: `1px solid ${CARD_BORDER}`,
        padding: "26px 30px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center",
      }}
    >
      <div style={{ fontSize: 18, color: TEXT, opacity: 0.9, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
        <div style={{ fontSize: 46, fontWeight: 800, color: TEXT, lineHeight: 1, letterSpacing: -1 }}>{value}</div>
        {showPct && (
          <div
            style={{
              background: up ? "rgba(34,197,94,.16)" : "rgba(239,68,68,.16)",
              color: up ? GREEN : RED,
              borderRadius: 999, padding: "6px 14px", fontSize: 18, fontWeight: 800, whiteSpace: "nowrap",
            }}
          >
            {up ? "↑" : "↓"} {Math.abs(pct!).toFixed(2)}%
          </div>
        )}
      </div>
    </div>
  );
}

function FgDonut({ value }: { value: number }) {
  const size = 220;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const color = fgColor(value);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={64} fontWeight={800} fill={color}>
        {value}
      </text>
    </svg>
  );
}

function AltseasonGauge({ value }: { value: number }) {
  const size = 220;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const cx = size / 2, cy = size / 2 + 10;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  // half circle: arc length = π * r
  const arc = Math.PI * r;
  return (
    <svg width={size} height={size / 1.7} viewBox={`0 0 ${size} ${size / 1.7}`} style={{ overflow: "visible" }}>
      <path
        d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
        stroke="rgba(255,255,255,.08)" strokeWidth={stroke} fill="none" strokeLinecap="round"
      />
      <path
        d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
        stroke={GOLD} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={`${arc * pct} ${arc}`}
      />
      <text x="50%" y={cy - 8} textAnchor="middle" dominantBaseline="central" fontSize={52} fontWeight={800} fill={TEXT}>
        {value}
      </text>
    </svg>
  );
}
