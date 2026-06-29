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
  const [tf, setTf] = useState<TF>(TIMEFRAMES[5]); // 1D default
  const [style, setStyle] = useState<ChartStyle>(STYLES[0]);
  const [showVolume, setShowVolume] = useState(true);
  const [showEMAs, setShowEMAs] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
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
      style: style.value,
      locale: "uk",
      backgroundColor: "#06141C",
      gridColor: "rgba(255,255,255,0.04)",
      toolbar_bg: "#06141C",
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      hide_legend: false,
      hide_volume: !showVolume,
      withdateranges: true,
      allow_symbol_change: false,
      details: false,
      calendar: false,
      save_image: true,
      studies: showEMAs
        ? [
            { id: "MAExp@tv-basicstudies", inputs: { length: 7 } },
            { id: "MAExp@tv-basicstudies", inputs: { length: 14 } },
            { id: "MAExp@tv-basicstudies", inputs: { length: 28 } },
          ]
        : [],
      overrides: {
        "paneProperties.background": "#06141C",
        "paneProperties.backgroundType": "solid",
        "paneProperties.vertGridProperties.color": "rgba(255,255,255,0.04)",
        "paneProperties.horzGridProperties.color": "rgba(255,255,255,0.04)",
        "scalesProperties.textColor": "rgba(255,255,255,0.55)",
        "scalesProperties.lineColor": "rgba(255,255,255,0.08)",
        "mainSeriesProperties.candleStyle.upColor": "#26A66C",
        "mainSeriesProperties.candleStyle.downColor": "#D6405C",
        "mainSeriesProperties.candleStyle.borderUpColor": "#26A66C",
        "mainSeriesProperties.candleStyle.borderDownColor": "#D6405C",
        "mainSeriesProperties.candleStyle.wickUpColor": "#26A66C",
        "mainSeriesProperties.candleStyle.wickDownColor": "#D6405C",
        "mainSeriesProperties.hollowCandleStyle.upColor": "#26A66C",
        "mainSeriesProperties.hollowCandleStyle.downColor": "#D6405C",
        "mainSeriesProperties.haStyle.upColor": "#26A66C",
        "mainSeriesProperties.haStyle.downColor": "#D6405C",
        "mainSeriesProperties.barStyle.upColor": "#26A66C",
        "mainSeriesProperties.barStyle.downColor": "#D6405C",
        "mainSeriesProperties.lineStyle.color": "#E7B650",
        "mainSeriesProperties.areaStyle.color1": "rgba(231,182,80,0.35)",
        "mainSeriesProperties.areaStyle.color2": "rgba(231,182,80,0.02)",
        "mainSeriesProperties.areaStyle.linecolor": "#E7B650",
      },
      studies_overrides: {
        "volume.volume.color.0": "rgba(214,64,92,.55)",
        "volume.volume.color.1": "rgba(38,166,108,.55)",
        "volume.volume.transparency": 65,
        "moving average exponential.plot.color": "#E7B650",
        "moving average exponential.plot.linewidth": 2,
      },
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => {
      cancelled = true;
      try { if (container) container.innerHTML = ""; } catch { /* ignore TV teardown */ }
    };
  }, [sym, tf, style, showVolume, showEMAs]);

  return (
    <div
      className={fullscreen
        ? "fixed inset-0 z-[100] flex flex-col gap-2 bg-[var(--bg-base)] p-3"
        : "surface overflow-hidden p-2"}
      style={fullscreen ? undefined : { border: "1px solid rgba(231,182,80,.18)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-0.5 pb-2">
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
          Графік · {symbol.toUpperCase()}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
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
          <span className="mx-1 h-4 w-px bg-[rgba(255,255,255,.08)]" />
          <div className="flex gap-1">
            {STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStyle(s)}
                className="chip text-[10px] px-2 py-1"
                data-active={s.id === style.id}
              >
                {s.label}
              </button>
            ))}
          </div>
          <span className="mx-1 h-4 w-px bg-[rgba(255,255,255,.08)]" />
          <button
            onClick={() => setShowVolume((v) => !v)}
            className="chip text-[10px] px-2 py-1"
            data-active={showVolume}
            title="Обʼєм"
          >
            Обʼєм
          </button>
          <button
            onClick={() => setShowEMAs((v) => !v)}
            className="chip text-[10px] px-2 py-1"
            data-active={showEMAs}
            title="EMA 7 / 14 / 28"
          >
            EMA
          </button>
          <button
            onClick={() => setFullscreen((f) => !f)}
            className="chip text-[10px] px-2 py-1"
            title={fullscreen ? "Згорнути" : "На весь екран"}
          >
            {fullscreen ? "✕" : "⛶"}
          </button>
        </div>
      </div>
      <div
        className="relative w-full overflow-hidden rounded-xl"
        style={{ height: fullscreen ? "100%" : 600, background: "#06141C", flex: fullscreen ? 1 : undefined }}
      >
        <div ref={containerRef} className="tradingview-widget-container h-full w-full" />
        {!ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[var(--text-muted)]">
            Завантаження графіку…
          </div>
        )}
      </div>
      {!fullscreen && (
        <p className="px-1 pt-2 text-[10px] text-[var(--text-muted)]">
          Індикатори, інструменти малювання та порівняння — у верхній/боковій панелі графіку TradingView.
        </p>
      )}
    </div>
  );
}
