import { useEffect, useRef, useState } from "react";

// TradingView embed wrapped in our visual language. We expose TV's native
// toolbars (interval, indicators, drawing tools) so power-users have the full
// experience, plus our chip-row above for one-tap timeframe switching.

const TV_MAP: Record<string, string> = {
  bitcoin: "BINANCE:BTCUSDT",
  ethereum: "BINANCE:ETHUSDT",
  tether: "BINANCE:USDTUSD",
  binancecoin: "BINANCE:BNBUSDT",
  solana: "BINANCE:SOLUSDT",
  ripple: "BINANCE:XRPUSDT",
  "usd-coin": "BINANCE:USDCUSDT",
  cardano: "BINANCE:ADAUSDT",
  dogecoin: "BINANCE:DOGEUSDT",
  "avalanche-2": "BINANCE:AVAXUSDT",
  tron: "BINANCE:TRXUSDT",
  chainlink: "BINANCE:LINKUSDT",
  polkadot: "BINANCE:DOTUSDT",
  "matic-network": "BINANCE:MATICUSDT",
  "shiba-inu": "BINANCE:SHIBUSDT",
  litecoin: "BINANCE:LTCUSDT",
  "bitcoin-cash": "BINANCE:BCHUSDT",
  uniswap: "BINANCE:UNIUSDT",
  "internet-computer": "BINANCE:ICPUSDT",
  cosmos: "BINANCE:ATOMUSDT",
  "ethereum-classic": "BINANCE:ETCUSDT",
  stellar: "BINANCE:XLMUSDT",
  filecoin: "BINANCE:FILUSDT",
  "hedera-hashgraph": "BINANCE:HBARUSDT",
  aptos: "BINANCE:APTUSDT",
  near: "BINANCE:NEARUSDT",
  vechain: "BINANCE:VETUSDT",
  arbitrum: "BINANCE:ARBUSDT",
  optimism: "BINANCE:OPUSDT",
  "the-open-network": "BINANCE:TONUSDT",
  injective: "BINANCE:INJUSDT",
  sui: "BINANCE:SUIUSDT",
  sei: "BINANCE:SEIUSDT",
  monero: "BINANCE:XMRUSDT",
  aave: "BINANCE:AAVEUSDT",
  maker: "BINANCE:MKRUSDT",
  pepe: "BINANCE:PEPEUSDT",
  "render-token": "BINANCE:RNDRUSDT",
};

function tvSymbol(coinId: string, symbol: string): string {
  if (TV_MAP[coinId]) return TV_MAP[coinId];
  return `CRYPTO:${symbol.toUpperCase()}USD`;
}

type TF = { id: string; label: string; interval: string };
const TIMEFRAMES: TF[] = [
  { id: "1m", label: "1m", interval: "1" },
  { id: "5m", label: "5m", interval: "5" },
  { id: "15m", label: "15m", interval: "15" },
  { id: "1h", label: "1h", interval: "60" },
  { id: "4h", label: "4h", interval: "240" },
  { id: "1d", label: "1D", interval: "D" },
  { id: "1w", label: "1W", interval: "W" },
  { id: "1M", label: "1M", interval: "M" },
];

type ChartStyle = { id: string; label: string; value: string };
const STYLES: ChartStyle[] = [
  { id: "candles", label: "Свічки", value: "1" },
  { id: "bars", label: "Бари", value: "0" },
  { id: "line", label: "Лінія", value: "2" },
  { id: "area", label: "Area", value: "3" },
  { id: "heikin", label: "Heikin", value: "8" },
];

export function PriceChart({ coinId, symbol = "btc" }: { coinId: string; symbol?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [tf, setTf] = useState<TF>(TIMEFRAMES[3]);
  const sym = tvSymbol(coinId, symbol);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    container.innerHTML = "";
    setReady(false);

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.onload = () => { if (!cancelled) setReady(true); };
    script.onerror = () => { if (!cancelled) setReady(true); };
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: sym,
      interval: tf.interval,
      timezone: "Europe/Kiev",
      theme: "dark",
      style: "1",
      locale: "uk",
      backgroundColor: "#06141C",
      gridColor: "rgba(231, 182, 80, 0.05)",
      toolbar_bg: "#06141C",
      // Full TradingView toolset enabled: top toolbar (chart type, indicators,
      // intervals, settings) + left drawing toolbar + date-range selector.
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      hide_legend: false,
      hide_volume: false,
      withdateranges: true,
      allow_symbol_change: false,
      details: false,
      calendar: false,
      save_image: true,
      studies: [],
      studies_overrides: {
        "volume.volume.color.0": "rgba(214,64,92,.55)",
        "volume.volume.color.1": "rgba(38,166,108,.55)",
      },
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => {
      cancelled = true;
      try { if (container) container.innerHTML = ""; } catch { /* ignore TV teardown */ }
    };
  }, [sym, tf]);

  return (
    <div
      className="surface overflow-hidden p-2"
      style={{ border: "1px solid rgba(231,182,80,.18)" }}
    >
      {/* Quick timeframe shortcut row */}
      <div className="flex items-center justify-between gap-2 px-1 pt-0.5 pb-2">
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
          Графік · {symbol.toUpperCase()}
        </div>
        <div className="flex gap-1">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTf(t)}
              className="chip text-[10px] px-2 py-1"
              data-active={t.id === tf.id}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="relative w-full overflow-hidden rounded-xl"
        style={{ height: 540, background: "#06141C" }}
      >
        <div ref={containerRef} className="tradingview-widget-container h-full w-full" />
        {!ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[var(--text-muted)]">
            Завантаження графіку…
          </div>
        )}
      </div>
      <p className="px-1 pt-2 text-[10px] text-[var(--text-muted)]">
        Тип свічок, індикатори, інструменти малювання — у верхній панелі графіку.
      </p>
    </div>
  );
}
