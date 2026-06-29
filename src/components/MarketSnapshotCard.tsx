import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toPng } from "html-to-image";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchGlobal, fetchFearGreed, fetchMarkets } from "@/lib/markets";
import { fetchMarketMetrics } from "@/lib/metrics";
import { fmtUsd, fmtPct } from "@/lib/format";

function fgLabel(v: number): string {
  if (v <= 24) return "Сильний страх";
  if (v <= 44) return "Страх";
  if (v <= 55) return "Нейтрально";
  if (v <= 74) return "Жадібність";
  return "Сильна жадібність";
}

// Tiny inline sparkline as SVG path
function sparkPath(values: number[], width: number, height: number): string {
  if (!values?.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1 || 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

const GREEN = "#26A66C";
const RED = "#E0455F";
const GOLD = "#E7B650";
const CYAN = "#5AC8E0";
const TEXT = "#F8FAFC";
const MUTED = "#8A9BA8";
const BG = "#06141C";

export function MarketSnapshotCard() {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);

  const global = useQuery({ queryKey: ["global"], queryFn: fetchGlobal });
  const fg = useQuery({ queryKey: ["fg"], queryFn: fetchFearGreed });
  const metrics = useQuery({ queryKey: ["market-metrics"], queryFn: fetchMarketMetrics, staleTime: 300_000 });
  const top = useQuery({ queryKey: ["markets", "snapshot", 5], queryFn: () => fetchMarkets({ perPage: 5, sparkline: true }) });

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
  const capUp = capChange >= 0;
  const fgVal = fg.data?.value ?? 50;
  const altIdx = metrics.data?.altseason_index ?? 0;
  const btcDom = global.data?.btc_dominance ?? 0;

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

      {/* Off-screen shareable card — 1920×1080 landscape: hero on left, top
          movers on right. Two clear focal zones, generous spacing — scans in
          one glance like a news-channel lower-third. */}
      <div style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none" }} aria-hidden>
        <div
          ref={cardRef}
          style={{
            width: 1920,
            height: 1080,
            background: capUp
              ? `radial-gradient(1400px 900px at 75% -10%, rgba(38,166,108,.22) 0%, ${BG} 55%, #03090d 100%)`
              : `radial-gradient(1400px 900px at 75% -10%, rgba(224,69,95,.22) 0%, ${BG} 55%, #03090d 100%)`,
            color: TEXT,
            fontFamily: "Inter, system-ui, sans-serif",
            boxSizing: "border-box",
            padding: 64,
            display: "grid",
            gridTemplateColumns: "1.05fr 1fr",
            gridTemplateRows: "auto 1fr auto",
            columnGap: 56,
            rowGap: 28,
          }}
        >
          {/* HEADER spans both columns */}
          <div style={{ gridColumn: "1 / 3", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <img src="/icon-512.png" crossOrigin="anonymous" width={64} height={64} style={{ borderRadius: 999 }} alt="" />
              <div>
                <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 1.5, lineHeight: 1 }}>
                  CRYPTO<span style={{ color: GOLD }}>TIME</span>
                </div>
                <div style={{ fontSize: 16, color: MUTED, marginTop: 6, letterSpacing: 0.5, fontWeight: 600 }}>
                  Огляд крипторинку
                </div>
              </div>
            </div>
            <div style={{ fontSize: 20, color: MUTED, fontWeight: 700, letterSpacing: 0.3 }}>{dateStr}</div>
          </div>

          {/* LEFT — HERO: huge 24h change + KPI grid */}
          <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
            <div
              style={{
                borderRadius: 32,
                padding: "40px 44px",
                background: capUp
                  ? "linear-gradient(135deg, rgba(38,166,108,.26), rgba(38,166,108,.04))"
                  : "linear-gradient(135deg, rgba(224,69,95,.26), rgba(224,69,95,.04))",
                border: `2px solid ${capUp ? "rgba(38,166,108,.45)" : "rgba(224,69,95,.45)"}`,
              }}
            >
              <div style={{ fontSize: 15, color: MUTED, textTransform: "uppercase", letterSpacing: 1.6, fontWeight: 800 }}>
                Ринок сьогодні · 24h
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 14 }}>
                <div
                  style={{
                    width: 132, height: 132, borderRadius: 36, flexShrink: 0,
                    background: capUp ? GREEN : RED,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: `0 24px 60px ${capUp ? "rgba(38,166,108,.45)" : "rgba(224,69,95,.45)"}`,
                  }}
                >
                  <svg width="76" height="76" viewBox="0 0 24 24" fill="none">
                    {capUp ? (
                      <path d="M5 17 L12 9 L19 17" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                    ) : (
                      <path d="M5 7 L12 15 L19 7" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                    )}
                  </svg>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 128, fontWeight: 900, lineHeight: 0.95, color: capUp ? GREEN : RED, letterSpacing: -3 }}>
                    {capChange >= 0 ? "+" : ""}{capChange.toFixed(2)}%
                  </div>
                  {metrics.data?.today_label && (
                    <div style={{ marginTop: 14, fontSize: 22, fontWeight: 700, color: TEXT, lineHeight: 1.3, maxWidth: 540 }}>
                      {metrics.data.today_label}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 2×2 KPI GRID */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Kpi
                label="Капіталізація"
                value={fmtUsd(global.data?.total_market_cap_usd, { compact: true })}
                sub="усього ринку"
              />
              <Kpi
                label="Об'єм 24h"
                value={fmtUsd(global.data?.total_volume_usd, { compact: true })}
                sub={`${global.data?.active_cryptocurrencies?.toLocaleString() ?? "—"} монет`}
              />
              <Kpi
                label="Страх / Жадібність"
                value={String(fgVal)}
                sub={fgLabel(fgVal)}
                bar={{ pct: fgVal, color: fgVal <= 44 ? RED : fgVal <= 55 ? GOLD : GREEN }}
              />
              <Kpi
                label="BTC Dominance"
                value={`${btcDom.toFixed(1)}%`}
                sub={`Альтсезон ${altIdx}/100`}
                bar={{ pct: btcDom, color: GOLD }}
                secondBar={{ pct: altIdx, color: CYAN }}
              />
            </div>
          </div>

          {/* RIGHT — TOP-5 COINS */}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ fontSize: 15, color: MUTED, textTransform: "uppercase", letterSpacing: 1.6, fontWeight: 800, marginBottom: 14 }}>
              Топ-5 монет · 24h
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
              {top.data?.map((c) => {
                const pct = c.price_change_percentage_24h ?? 0;
                const up = pct >= 0;
                const intensity = Math.min(1, Math.abs(pct) / 8);
                const bgAlpha = 0.12 + intensity * 0.22;
                const accent = up ? GREEN : RED;
                const spark = c.sparkline_in_7d?.price ?? [];
                return (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 20,
                      background: up
                        ? `linear-gradient(90deg, rgba(38,166,108,${bgAlpha}) 0%, rgba(38,166,108,.05) 100%)`
                        : `linear-gradient(90deg, rgba(224,69,95,${bgAlpha}) 0%, rgba(224,69,95,.05) 100%)`,
                      border: `1px solid ${up ? "rgba(38,166,108,.30)" : "rgba(224,69,95,.30)"}`,
                      borderLeft: `5px solid ${accent}`,
                      borderRadius: 18,
                      padding: "20px 24px",
                      flex: 1,
                    }}
                  >
                    <img src={c.image} crossOrigin="anonymous" width={64} height={64} style={{ borderRadius: 999, flexShrink: 0 }} alt="" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 0.3, lineHeight: 1.05 }}>{c.symbol.toUpperCase()}</div>
                      <div style={{ fontSize: 18, color: TEXT, opacity: .85, fontWeight: 600, marginTop: 4 }}>
                        {fmtUsd(c.current_price, { digits: c.current_price < 1 ? 4 : 2 })}
                      </div>
                    </div>
                    {spark.length > 1 && (
                      <svg width="160" height="44" viewBox="0 0 160 44" style={{ opacity: 0.85, flexShrink: 0 }}>
                        <path d={sparkPath(spark, 160, 44)} stroke={accent} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        {up ? (
                          <path d="M5 17 L12 9 L19 17" stroke={accent} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                        ) : (
                          <path d="M5 7 L12 15 L19 7" stroke={accent} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                        )}
                      </svg>
                      <div style={{ fontSize: 30, fontWeight: 900, color: accent, minWidth: 120, textAlign: "right" }}>
                        {fmtPct(pct)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* FOOTER spans both columns */}
          <div style={{ gridColumn: "1 / 3", display: "flex", justifyContent: "space-between", fontSize: 15, color: "#5d6b75", fontWeight: 600 }}>
            <span>cryptotime.app · @cryptotime_tg</span>
            <span>Не фінансова порада · DYOR</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Kpi({
  label, value, sub, bar, secondBar,
}: {
  label: string;
  value: string;
  sub?: string;
  bar?: { pct: number; color: string };
  secondBar?: { pct: number; color: string };
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,.04)",
        borderRadius: 18,
        padding: "20px 22px",
        border: "1px solid rgba(255,255,255,.06)",
      }}
    >
      <div style={{ fontSize: 12, color: MUTED, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 900, marginTop: 6, color: TEXT, lineHeight: 1, letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: MUTED, marginTop: 6, fontWeight: 600 }}>{sub}</div>}
      {bar && (
        <div style={{ marginTop: 12, height: 6, borderRadius: 999, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, bar.pct)}%`, height: "100%", background: bar.color }} />
        </div>
      )}
      {secondBar && (
        <div style={{ marginTop: 6, height: 6, borderRadius: 999, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, secondBar.pct)}%`, height: "100%", background: secondBar.color }} />
        </div>
      )}
    </div>
  );
}
