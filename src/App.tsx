import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, RefreshCcw, Search, Star, X } from "lucide-react";
import { useRef } from "react";
import ChartPanel from "./components/ChartPanel";
import ResultsTable from "./components/ResultsTable";
import ScreenerToolbar from "./components/ScreenerToolbar";
import { getMarketDataProvider } from "./lib/marketData";
import { runScreener } from "./lib/screener";
import { loadChartIndicators, loadDataSource, loadSettings, loadTrendlines, loadWatchlist, saveChartIndicators, saveDataSource, saveSettings, saveTrendlines, saveWatchlist } from "./lib/storage";
import type { Candle, CandleMode, ChartIndicator, Instrument, MarketDataSource, ScreenerResult, ScreenerSettings, Timeframe, Trendline } from "./types";

const TIMEFRAMES: Timeframe[] = ["5m", "15m", "1H", "4H", "1D"];

const DEFAULT_SETTINGS: ScreenerSettings = {
  filters: [
    { id: "macd-1h-level", category: "technical", type: "macd", timeframe: "1H", plot: "level", condition: "above", target: "value", value: 0 },
    { id: "macd-15m-level", category: "technical", type: "macd", timeframe: "15m", plot: "level", condition: "above", target: "value", value: 0 },
    { id: "macd-15m-cross", category: "technical", type: "macd", timeframe: "15m", plot: "level", condition: "crossesUp", target: "signal", value: 0 },
    { id: "macd-4h-level", category: "technical", type: "macd", timeframe: "4H", plot: "level", condition: "above", target: "value", value: 0 },
    { id: "volume-default", category: "marketData", type: "volumeUsd", condition: "between", from: 3_000_000, to: 100_000_000, preset: "manual" },
    { id: "change-default", category: "marketData", type: "priceChangePct", condition: "between", from: 3, to: 100 },
  ],
  rsiLength: 14,
  bollingerLength: 50,
  bollingerStdDev: 0.2,
  volumeMinUsd: 3_000_000,
  volumeMaxUsd: 100_000_000,
  changeMinPct: 3,
  changeMaxPct: 100,
  refreshSeconds: 60,
};

const DEFAULT_SOURCE: MarketDataSource = "gate";
const DEFAULT_CHART_INDICATORS: ChartIndicator[] = [];

function App() {
  const [source, setSource] = useState<MarketDataSource>(() => loadDataSource(DEFAULT_SOURCE));
  const provider = getMarketDataProvider(source);
  const [settings, setSettings] = useState<ScreenerSettings>(() => loadSettings(DEFAULT_SETTINGS));
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState(() => provider.defaultSymbol);
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [candleMode, setCandleMode] = useState<CandleMode>("normal");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [trendlines, setTrendlines] = useState<Trendline[]>(() => loadTrendlines());
  const [chartIndicators, setChartIndicators] = useState<ChartIndicator[]>(() => loadChartIndicators(DEFAULT_CHART_INDICATORS));
  const [indicatorCandles, setIndicatorCandles] = useState<Record<string, Candle[]>>({});
  const [watchlist, setWatchlist] = useState<string[]>(() => loadWatchlist(source, provider.defaultWatchlist));
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [screening, setScreening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const activeSourceRef = useRef(source);
  const scanRequestRef = useRef(0);

  useEffect(() => {
    saveDataSource(source);
  }, [source]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveTrendlines(trendlines);
  }, [trendlines]);

  useEffect(() => {
    saveChartIndicators(chartIndicators);
  }, [chartIndicators]);

  useEffect(() => {
    saveWatchlist(source, watchlist);
  }, [source, watchlist]);

  useEffect(() => {
    let cancelled = false;

    provider.fetchInstruments()
      .then((data) => {
        if (cancelled) return;
        setInstruments(data);
        const liveSymbols = new Set(data.map((instrument) => instrument.instId));
        setWatchlist((current) => {
          const validated = current.filter((symbol) => liveSymbols.has(symbol));
          const fallback = provider.defaultWatchlist.filter((symbol) => liveSymbols.has(symbol));
          return validated.length ? validated : fallback;
        });
        setSelectedSymbol((current) => {
          if (liveSymbols.has(current)) return current;
          const currentBase = baseCurrencyFromSymbol(current);
          const equivalent = data.find((instrument) => instrument.baseCcy === currentBase);
          return equivalent?.instId ?? (liveSymbols.has(provider.defaultSymbol) ? provider.defaultSymbol : data[0]?.instId ?? current);
        });
      })
      .catch((requestError) => {
        if (!cancelled) setError(toMessage(requestError, provider.label));
      });

    return () => {
      cancelled = true;
    };
  }, [provider]);

  const refreshScreener = useCallback(async () => {
    const requestId = ++scanRequestRef.current;
    const requestedSource = source;
    setScreening(true);
    setError(null);

    try {
      const tickers = await provider.fetchTickers();
      const nextResults = await runScreener(settings, tickers, provider.fetchCandles);
      if (activeSourceRef.current !== requestedSource || scanRequestRef.current !== requestId) return;
      setResults(nextResults);
      setLastUpdated(new Date());
    } catch (requestError) {
      if (activeSourceRef.current === requestedSource && scanRequestRef.current === requestId) {
        setError(toMessage(requestError, provider.label));
      }
    } finally {
      if (activeSourceRef.current === requestedSource && scanRequestRef.current === requestId) {
        setScreening(false);
      }
    }
  }, [provider, settings, source]);

  useEffect(() => {
    refreshScreener();
    const interval = window.setInterval(refreshScreener, settings.refreshSeconds * 1000);
    return () => window.clearInterval(interval);
  }, [refreshScreener, settings.refreshSeconds]);

  useEffect(() => {
    let cancelled = false;
    setLoadingChart(true);
    setError(null);
    setCandles([]);

    provider.fetchCandles(selectedSymbol, timeframe, timeframe === "1D" ? 260 : 220)
      .then((data) => {
        if (!cancelled) setCandles(data);
      })
      .catch((requestError) => {
        if (!cancelled) setError(toMessage(requestError, provider.label));
      })
      .finally(() => {
        if (!cancelled) setLoadingChart(false);
      });

    return () => {
      cancelled = true;
    };
  }, [provider, selectedSymbol, timeframe]);

  useEffect(() => {
    let cancelled = false;
    const requiredTimeframes = Array.from(
      new Set(
        chartIndicators
          .filter((indicator) => indicator.visible && (indicator.kind === "macd" || indicator.kind === "rsi"))
          .map((indicator) => indicator.timeframe)
          .filter((indicatorTimeframe): indicatorTimeframe is Timeframe => indicatorTimeframe !== "Chart" && indicatorTimeframe !== timeframe),
      ),
    );

    requiredTimeframes.forEach((indicatorTimeframe) => {
      const cacheKey = getIndicatorCandleKey(source, selectedSymbol, indicatorTimeframe);
      if (indicatorCandles[cacheKey]) return;

      provider.fetchCandles(selectedSymbol, indicatorTimeframe, indicatorTimeframe === "1D" ? 260 : 220)
        .then((data) => {
          if (!cancelled) {
            setIndicatorCandles((current) => ({ ...current, [cacheKey]: data }));
          }
        })
        .catch((requestError) => {
          if (!cancelled) setError(toMessage(requestError, provider.label));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [chartIndicators, indicatorCandles, provider, selectedSymbol, source, timeframe]);

  const selectedTrendlines = useMemo(
    () => trendlines.filter((line) => line.symbol === selectedSymbol && line.timeframe === timeframe),
    [selectedSymbol, timeframe, trendlines],
  );

  const selectedInstrument = useMemo(
    () => instruments.find((instrument) => instrument.instId === selectedSymbol),
    [instruments, selectedSymbol],
  );

  const symbolOptions = useMemo(
    () =>
      instruments.length
        ? instruments
        : watchlist.map((symbol) => ({ instId: symbol, baseCcy: baseCurrencyFromSymbol(symbol), quoteCcy: "USDT" })),
    [instruments, watchlist],
  );

  const displayedResults = useMemo(
    () => (watchlistOnly ? results.filter((result) => watchlist.includes(result.instId)) : results),
    [results, watchlist, watchlistOnly],
  );

  function toggleWatchlist(symbol: string) {
    setWatchlist((current) =>
      current.includes(symbol) ? current.filter((item) => item !== symbol) : [symbol, ...current],
    );
  }

  function removeFromWatchlist(symbol: string) {
    setWatchlist((current) => current.filter((item) => item !== symbol));
  }

  function changeSource(nextSource: MarketDataSource) {
    if (nextSource === source) return;
    const nextProvider = getMarketDataProvider(nextSource);
    const currentBase = baseCurrencyFromSymbol(selectedSymbol);
    activeSourceRef.current = nextSource;
    scanRequestRef.current += 1;
    setSource(nextSource);
    setInstruments([]);
    setResults([]);
    setCandles([]);
    setIndicatorCandles({});
    setWatchlist(loadWatchlist(nextSource, nextProvider.defaultWatchlist));
    setSelectedSymbol(toProviderSymbol(nextSource, currentBase));
    setScreening(false);
    setLoadingChart(false);
    setError(null);
    setLastUpdated(null);
  }

  const selectedIsWatched = watchlist.includes(selectedSymbol);

  return (
    <main className="shell">
      <header className="topbar utilitybar">
        <div className="status-strip">
          <span className={screening ? "status-dot spinning" : "status-dot"} />
          <span>{screening ? `Scanning ${provider.label}` : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Ready"}</span>
          <button className="icon-button" type="button" onClick={refreshScreener} aria-label="Refresh screener">
            <RefreshCcw size={17} />
          </button>
        </div>
      </header>

      <ScreenerToolbar
        settings={settings}
        watchlistOnly={watchlistOnly}
        watchlistCount={watchlist.length}
        source={source}
        onChange={setSettings}
        onSourceChange={changeSource}
        onWatchlistOnlyChange={setWatchlistOnly}
      />

      {error ? (
        <div className="error-banner" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="workspace">
        <aside className="sidebar" aria-label="Watchlist and markets">
          <label className="search-box">
            <Search size={16} />
            <select value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}>
              {symbolOptions.map((instrument) => (
                <option key={instrument.instId} value={instrument.instId}>
                  {instrument.instId}
                </option>
              ))}
            </select>
          </label>

          <div className="panel-heading">
            <span>Watchlist</span>
            <Star size={15} />
          </div>
          <div className="watchlist">
            {watchlist.map((symbol) => (
              <div className={symbol === selectedSymbol ? "watch-row active" : "watch-row"} key={symbol}>
                <button className="watch-select" type="button" onClick={() => setSelectedSymbol(symbol)}>
                  <span>{provider.formatSymbol(symbol)}</span>
                  <small>USDT Perp</small>
                </button>
                <button className="watch-remove" type="button" onClick={() => removeFromWatchlist(symbol)} aria-label={`Remove ${symbol} from watchlist`}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          <button className="secondary-button" type="button" onClick={() => toggleWatchlist(selectedSymbol)}>
            <Star size={15} />
            {selectedIsWatched ? "Remove Selected" : "Add Selected"}
          </button>
        </aside>

        <section className="chart-area">
          <div className="chart-header">
            <div>
              <span className="eyebrow">{provider.marketLabel}</span>
              <h2>{selectedInstrument?.instId ?? selectedSymbol}</h2>
            </div>
            <button className={selectedIsWatched ? "icon-button star-button active" : "icon-button star-button"} type="button" onClick={() => toggleWatchlist(selectedSymbol)} aria-label="Toggle selected symbol in watchlist">
              <Star size={17} />
            </button>
            <div className="segmented" aria-label="Timeframe">
              {TIMEFRAMES.map((item) => (
                <button
                  key={item}
                  className={timeframe === item ? "active" : ""}
                  type="button"
                  onClick={() => setTimeframe(item)}
                >
                  {formatTimeframe(item)}
                </button>
              ))}
            </div>
            <div className="segmented" aria-label="Candle mode">
              <button className={candleMode === "normal" ? "active" : ""} type="button" onClick={() => setCandleMode("normal")}>
                Candle
              </button>
              <button className={candleMode === "heikin" ? "active" : ""} type="button" onClick={() => setCandleMode("heikin")}>
                Heiken Ashi
              </button>
            </div>
          </div>

          <ChartPanel
            candles={candles}
            candleMode={candleMode}
            loading={loadingChart}
            symbol={selectedSymbol}
            timeframe={timeframe}
            trendlines={selectedTrendlines}
            settings={settings}
            indicators={chartIndicators}
            indicatorCandles={buildIndicatorCandleSets(source, selectedSymbol, timeframe, candles, indicatorCandles)}
            onIndicatorsChange={setChartIndicators}
            onTrendlinesChange={(nextLines) => {
              setTrendlines((current) => [
                ...current.filter((line) => !(line.symbol === selectedSymbol && line.timeframe === timeframe)),
                ...nextLines,
              ]);
            }}
          />
        </section>
      </section>

      <section className="results-section">
        <div className="results-header">
          <div>
            <span className="eyebrow">Crypto Screener</span>
            <h2>{watchlistOnly ? "Matching Watchlist Perpetuals" : "Matching USDT Perpetuals"}</h2>
          </div>
          <div className="result-count">
            <Activity size={16} />
            {displayedResults.length} matches
          </div>
        </div>
        <ResultsTable
          results={displayedResults}
          selectedSymbol={selectedSymbol}
          formatSymbol={provider.formatSymbol}
          onSelect={(symbol) => setSelectedSymbol(symbol)}
        />
      </section>
    </main>
  );
}

function buildIndicatorCandleSets(
  source: MarketDataSource,
  symbol: string,
  chartTimeframe: Timeframe,
  chartCandles: Candle[],
  cachedCandles: Record<string, Candle[]>,
): Partial<Record<Timeframe, Candle[]>> {
  return {
    "5m": chartTimeframe === "5m" ? chartCandles : cachedCandles[getIndicatorCandleKey(source, symbol, "5m")],
    "15m": chartTimeframe === "15m" ? chartCandles : cachedCandles[getIndicatorCandleKey(source, symbol, "15m")],
    "1H": chartTimeframe === "1H" ? chartCandles : cachedCandles[getIndicatorCandleKey(source, symbol, "1H")],
    "4H": chartTimeframe === "4H" ? chartCandles : cachedCandles[getIndicatorCandleKey(source, symbol, "4H")],
    "1D": chartTimeframe === "1D" ? chartCandles : cachedCandles[getIndicatorCandleKey(source, symbol, "1D")],
  };
}

function getIndicatorCandleKey(source: MarketDataSource, symbol: string, timeframe: Timeframe): string {
  return `${source}|${symbol}|${timeframe}`;
}

function baseCurrencyFromSymbol(symbol: string): string {
  return symbol.replace(/-USDT-SWAP$/, "").replace(/_USDT$/, "");
}

function toProviderSymbol(source: MarketDataSource, baseCurrency: string): string {
  return source === "gate" ? `${baseCurrency}_USDT` : `${baseCurrency}-USDT-SWAP`;
}

function formatTimeframe(timeframe: Timeframe): string {
  if (timeframe === "1D") return "1D";
  return timeframe === "5m" || timeframe === "15m" ? timeframe : timeframe.toLowerCase();
}

function toMessage(error: unknown, providerLabel: string): string {
  return error instanceof Error ? error.message : `Something went wrong while loading ${providerLabel} data.`;
}

export default App;


