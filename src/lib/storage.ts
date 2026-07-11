import type {
  AnyStoredFilter,
  BollingerChartIndicator,
  BollingerFilter,
  ChartIndicator,
  LastScanSnapshot,
  LegacyMacdFilter,
  MacdChartIndicator,
  MacdFilter,
  MarketDataSource,
  RsiChartIndicator,
  RsiFilter,
  ScreenerFilter,
  ScreenerResult,
  ScreenerSettings,
  Trendline,
} from "../types";

const SETTINGS_KEY = "okx-screener-settings-v1";
const OKX_WATCHLIST_KEY = "okx-screener-watchlist-v1";
const GATE_WATCHLIST_KEY = "gate-screener-watchlist-v1";
const TRENDLINES_KEY = "okx-screener-trendlines-v1";
const CHART_INDICATORS_KEY = "okx-chart-indicators-v1";
const DATA_SOURCE_KEY = "momentumscope-data-source-v1";
const LAST_SCAN_KEY = "momentumscope-last-scan-v1";

export function loadSettings(defaults: ScreenerSettings): ScreenerSettings {
  const stored = loadJson<Partial<ScreenerSettings>>(SETTINGS_KEY, defaults);
  return {
    ...defaults,
    ...stored,
    filters: normalizeFilters((stored.filters ?? defaults.filters) as AnyStoredFilter[]),
  };
}

export function saveSettings(settings: ScreenerSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadDataSource(defaultSource: MarketDataSource): MarketDataSource {
  const stored = loadJson<unknown>(DATA_SOURCE_KEY, defaultSource);
  return stored === "okx" || stored === "gate" ? stored : defaultSource;
}

export function saveDataSource(source: MarketDataSource): void {
  localStorage.setItem(DATA_SOURCE_KEY, JSON.stringify(source));
}

export function loadWatchlist(source: MarketDataSource, defaults: string[]): string[] {
  return loadJson(source === "okx" ? OKX_WATCHLIST_KEY : GATE_WATCHLIST_KEY, defaults);
}

export function saveWatchlist(source: MarketDataSource, symbols: string[]): void {
  localStorage.setItem(source === "okx" ? OKX_WATCHLIST_KEY : GATE_WATCHLIST_KEY, JSON.stringify(symbols));
}

export function loadLastScanSnapshot(): LastScanSnapshot | null {
  const stored = loadJson<unknown>(LAST_SCAN_KEY, null);
  return normalizeLastScanSnapshot(stored);
}

export function saveLastScanSnapshot(snapshot: LastScanSnapshot): void {
  localStorage.setItem(LAST_SCAN_KEY, JSON.stringify(snapshot));
}

export function loadTrendlines(): Trendline[] {
  const stored = loadJson<Array<Trendline & { mode?: Trendline["mode"] }>>(TRENDLINES_KEY, []);
  return stored.map((line) => ({ ...line, mode: line.mode ?? "segment" }));
}

export function saveTrendlines(trendlines: Trendline[]): void {
  localStorage.setItem(TRENDLINES_KEY, JSON.stringify(trendlines));
}

export function loadChartIndicators(defaults: ChartIndicator[]): ChartIndicator[] {
  const stored = loadJson<unknown>(CHART_INDICATORS_KEY, defaults);
  if (!Array.isArray(stored)) return defaults;
  return stored.map((indicator) => normalizeChartIndicator(indicator)).filter((indicator): indicator is ChartIndicator => Boolean(indicator));
}

export function saveChartIndicators(indicators: ChartIndicator[]): void {
  localStorage.setItem(CHART_INDICATORS_KEY, JSON.stringify(indicators));
}

function normalizeFilters(filters: AnyStoredFilter[]): ScreenerFilter[] {
  return filters.map((filter) => normalizeFilter(filter)).filter((filter): filter is ScreenerFilter => Boolean(filter));
}

function normalizeFilter(filter: AnyStoredFilter): ScreenerFilter | null {
  if ((filter as ScreenerFilter).category === "marketData") return filter as ScreenerFilter;

  if (filter.type === "macd") {
    const legacy = filter as LegacyMacdFilter | MacdFilter;
    if ((legacy as MacdFilter).category === "technical") return legacy as MacdFilter;

    const legacyMacd = legacy as LegacyMacdFilter;
    return {
      id: legacyMacd.id,
      category: "technical",
      type: "macd",
      timeframe: legacyMacd.timeframe,
      plot: "level",
      condition: legacyMacd.mode === "crossSignal" ? "crossesUp" : legacyMacd.operator === "<" ? "below" : "above",
      target: legacyMacd.mode === "crossSignal" ? "signal" : "value",
      value: legacyMacd.value ?? 0,
    };
  }

  if (filter.type === "rsi") {
    return { ...(filter as RsiFilter), category: "technical" };
  }

  if (filter.type === "bollinger") {
    return { ...(filter as BollingerFilter), category: "technical" };
  }

  return null;
}

function normalizeChartIndicator(value: unknown): ChartIndicator | null {
  if (!value || typeof value !== "object") return null;
  const indicator = value as Partial<ChartIndicator> & { kind?: string };

  if (indicator.kind === "macd") return normalizeMacdIndicator(indicator as Partial<MacdChartIndicator>);
  if (indicator.kind === "rsi") return normalizeRsiIndicator(indicator as Partial<RsiChartIndicator>);
  if (indicator.kind === "bollinger") return normalizeBollingerIndicator(indicator as Partial<BollingerChartIndicator>);
  return null;
}

function normalizeLastScanSnapshot(value: unknown): LastScanSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<LastScanSnapshot>;
  if (snapshot.source !== "okx" && snapshot.source !== "gate") return null;
  if (typeof snapshot.savedAt !== "string" || Number.isNaN(Date.parse(snapshot.savedAt))) return null;
  if (!Array.isArray(snapshot.results)) return null;

  const results = snapshot.results.filter(isScreenerResult);
  if (results.length !== snapshot.results.length) return null;

  return {
    source: snapshot.source,
    savedAt: snapshot.savedAt,
    results,
  };
}

function isScreenerResult(value: unknown): value is ScreenerResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<ScreenerResult>;
  return (
    typeof result.instId === "string" &&
    isFiniteNumber(result.last) &&
    isFiniteNumber(result.change24hPct) &&
    isFiniteNumber(result.volume24hUsd) &&
    isNullableFiniteNumber(result.macd5m) &&
    isNullableFiniteNumber(result.macd15m) &&
    isNullableFiniteNumber(result.macd1H) &&
    isNullableFiniteNumber(result.macd4H) &&
    isNullableFiniteNumber(result.macd1D) &&
    isNullableFiniteNumber(result.rsi15m) &&
    typeof result.bbPosition === "string" &&
    typeof result.matched === "boolean" &&
    typeof result.reason === "string"
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function normalizeMacdIndicator(indicator: Partial<MacdChartIndicator>): MacdChartIndicator {
  return {
    id: "macd",
    kind: "macd",
    source: "close",
    fastLength: normalizePositiveInteger(indicator.fastLength, 12),
    slowLength: normalizePositiveInteger(indicator.slowLength, 26),
    signalLength: normalizePositiveInteger(indicator.signalLength, 9),
    oscillatorMaType: "EMA",
    signalMaType: "EMA",
    timeframe: normalizeIndicatorTimeframe(indicator.timeframe),
    waitForTimeframeClose: indicator.waitForTimeframeClose ?? true,
    visible: indicator.visible ?? true,
    histogramVisible: indicator.histogramVisible ?? true,
    macdVisible: indicator.macdVisible ?? true,
    signalVisible: indicator.signalVisible ?? true,
    zeroVisible: indicator.zeroVisible ?? true,
    colors: {
      histogramPositiveRising: indicator.colors?.histogramPositiveRising ?? "#26a69a",
      histogramPositiveFalling: indicator.colors?.histogramPositiveFalling ?? "#b2dfdb",
      histogramNegativeRising: indicator.colors?.histogramNegativeRising ?? "#ffcdd2",
      histogramNegativeFalling: indicator.colors?.histogramNegativeFalling ?? "#ff5252",
      macd: indicator.colors?.macd ?? "#2962ff",
      signal: indicator.colors?.signal ?? "#ff6d00",
      zero: indicator.colors?.zero ?? "#787b86",
    },
    precision: "default",
  };
}

function normalizeRsiIndicator(indicator: Partial<RsiChartIndicator>): RsiChartIndicator {
  return {
    id: "rsi",
    kind: "rsi",
    length: normalizePositiveInteger(indicator.length, 14),
    timeframe: normalizeIndicatorTimeframe(indicator.timeframe),
    visible: indicator.visible ?? true,
    color: indicator.color ?? "#7e57c2",
  };
}

function normalizeBollingerIndicator(indicator: Partial<BollingerChartIndicator>): BollingerChartIndicator {
  return {
    id: "bollinger",
    kind: "bollinger",
    length: normalizePositiveInteger(indicator.length, 50),
    stdDev: normalizePositiveNumber(indicator.stdDev, 0.2),
    timeframe: "Chart",
    visible: indicator.visible ?? true,
    upperColor: indicator.upperColor ?? "#6ee7f9",
    middleColor: indicator.middleColor ?? "#facc15",
    lowerColor: indicator.lowerColor ?? "#6ee7f9",
  };
}

function normalizeIndicatorTimeframe(value: unknown): ChartIndicator["timeframe"] {
  return value === "5m" || value === "15m" || value === "1H" || value === "4H" || value === "1D" || value === "Chart"
    ? value
    : "Chart";
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
