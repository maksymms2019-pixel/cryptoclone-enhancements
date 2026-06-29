import { useQuery } from "@tanstack/react-query";
import { fetchMarketMetrics } from "@/lib/metrics";
import { Activity, TrendingUp, TrendingDown } from "lucide-react";

function tone(score: number) {
  return score >= 58 ? "text-[var(--accent)]" : score <= 42 ? "text-[var(--danger)]" : "text-[var(--text)]";
}

export function MarketMetrics() {
  const m = useQuery({ queryKey: ["market-metrics"], queryFn: fetchMarketMetrics, staleTime: 300_000 });

  if (m.isError) return null;

  const score = m.data?.market_state_score ?? 50;
  const breadth = m.data?.breadth_up_pct ?? 50;
  const bullish = score >= 50;

  return (
    <div className="space-y-4">
      {/* Block 1 — today's market state (our own signal) */}
      <section className="surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <Activity size={14} className="text-[var(--gold)]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Стан ринку сьогодні</h2>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 text-base font-semibold ${tone(score)}`}>
            {bullish ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {m.isLoading ? "…" : m.data?.today_label}
          </span>
          <span className="text-xs text-[var(--text-muted)]">{m.data?.market_state_label}</span>
        </div>
        <p className="mt-1.5 text-sm text-[var(--text-muted)] leading-snug">
          {m.isLoading ? "Аналізуємо ринок…" : m.data?.today_summary}
        </p>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg)]">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${score}%`,
              background: "linear-gradient(90deg,#D6405C,#E7B650,#26A66C)",
            }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
          <span>Ведмеді</span>
          <span className="tabular-nums">{m.data ? `${breadth}% монет у плюсі` : ""}</span>
          <span>Бики</span>
        </div>
      </section>
    </div>
  );
}
