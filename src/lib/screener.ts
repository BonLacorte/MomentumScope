import { calculateBollingerBands, calculateMacd, calculateRsi, type MacdPoint } from "./indicators";
import type { MarketDataProvider } from "./marketData";
import type { BollingerFilter, Candle, MacdCondition, MacdFilter, MacdPlot, RangeCondition, RsiFilter, ScreenerFilter, ScreenerResult, ScreenerSettings, Ticker, Timeframe } from "../types";

const MAX_INDICATOR_CANDIDATES = 20;
const SCAN_CONCURRENCY = 4;
const RESULT_TIMEFRAMES: Timeframe[] = ["15m", "1H", "4H"];

type CandleMap = Partial<Record<Timeframe, Candle[]>>;

export async function runScreener(
  settings: ScreenerSettings,
  tickers: Ticker[],
  fetchCandles: MarketDataProvider["fetchCandles"],
): Promise<ScreenerResult[]> {
  const prefiltered = tickers
    .filter((ticker) => settings.filters.every((filter) => evaluateTickerFilter(filter, ticker)))
    .slice(0, MAX_INDICATOR_CANDIDATES);

  const results = await mapWithConcurrency(prefiltered, SCAN_CONCURRENCY, async (ticker) => {
    try {
      const technicalFilters = settings.filters.filter((filter) => filter.category === "technical");
      const candleMap = await fetchRequiredCandles(ticker.instId, technicalFilters, fetchCandles);
      const matched = technicalFilters.every((filter) => evaluateTechnicalFilter(filter, candleMap));
      const macd5m = latestMacd(candleMap["5m"]);
      const macd15m = latestMacd(candleMap["15m"]);
      const macd1H = latestMacd(candleMap["1H"]);
      const macd4H = latestMacd(candleMap["4H"]);
      const macd1D = latestMacd(candleMap["1D"]);
      const rsi15m = latestRsi(candleMap["15m"], settings.rsiLength);
      const bbPosition = latestBollingerPosition(candleMap["15m"], settings.bollingerLength, settings.bollingerStdDev);

      return {
        instId: ticker.instId,
        last: ticker.last,
        change24hPct: ticker.change24hPct,
        volume24hUsd: ticker.volume24hUsd,
        macd5m,
        macd15m,
        macd1H,
        macd4H,
        macd1D,
        rsi15m,
        bbPosition,
        matched,
        reason: matched ? "All active filters matched" : "Filtered out by technical conditions",
      };
    } catch (error) {
      return emptyResult(ticker, error instanceof Error ? error.message : "Unable to load candles");
    }
  });

  return results.filter((result) => result.matched).sort((a, b) => b.volume24hUsd - a.volume24hUsd);
}

function evaluateTickerFilter(filter: ScreenerFilter, ticker: Ticker): boolean {
  if (filter.category !== "marketData") return true;
  const value = filter.type === "priceChangePct" ? ticker.change24hPct : ticker.volume24hUsd;
  return evaluateCondition(value, filter.condition, filter.value, filter.from, filter.to);
}

function evaluateTechnicalFilter(filter: ScreenerFilter, candles: CandleMap): boolean {
  if (filter.category !== "technical") return true;
  const series = candles[filter.timeframe];
  if (!series?.length) return false;

  if (filter.type === "macd") return evaluateMacd(filter, series);
  if (filter.type === "rsi") return evaluateRsi(filter, series);
  return evaluateBollinger(filter, series);
}

function evaluateMacd(filter: MacdFilter, candles: Candle[]): boolean {
  const macd = calculateMacd(candles);
  const latest = macd[macd.length - 1];
  const previous = macd[macd.length - 2];
  const latestValue = getMacdPlotValue(latest, filter.plot);
  const previousValue = getMacdPlotValue(previous, filter.plot);
  if (latestValue === null) return false;

  if (filter.condition === "crosses" || filter.condition === "crossesUp" || filter.condition === "crossesDown") {
    const latestTarget = getMacdTargetValue(latest, filter.target, filter.value);
    const previousTarget = getMacdTargetValue(previous, filter.target, filter.value);
    if (previousValue === null || latestTarget === null || previousTarget === null) return false;
    const crossedUp = previousValue <= previousTarget && latestValue > latestTarget;
    const crossedDown = previousValue >= previousTarget && latestValue < latestTarget;
    if (filter.condition === "crossesUp") return crossedUp;
    if (filter.condition === "crossesDown") return crossedDown;
    return crossedUp || crossedDown;
  }

  if (filter.condition === "between" || filter.condition === "outside") {
    return evaluateCondition(latestValue, filter.condition, undefined, filter.from, filter.to);
  }

  const target = getMacdTargetValue(latest, filter.target, filter.value);
  if (target === null) return false;
  return evaluateCondition(latestValue, filter.condition, target);
}

function evaluateRsi(filter: RsiFilter, candles: Candle[]): boolean {
  const rsi = calculateRsi(candles, filter.length);
  const latest = rsi[rsi.length - 1];
  const previous = rsi[rsi.length - 2];
  if (!latest || latest.value === null) return false;

  if (filter.mode === "cross") {
    if (!previous || previous.value === null) return false;
    return filter.operator === ">"
      ? previous.value <= filter.value && latest.value > filter.value
      : previous.value >= filter.value && latest.value < filter.value;
  }

  return filter.operator === ">" ? latest.value > filter.value : latest.value < filter.value;
}

function evaluateBollinger(filter: BollingerFilter, candles: Candle[]): boolean {
  const bands = calculateBollingerBands(candles, filter.length, filter.stdDev);
  const latest = bands[bands.length - 1];
  const previous = bands[bands.length - 2];
  const latestCandle = candles[candles.length - 1];
  const previousCandle = candles[candles.length - 2];
  if (!latest || latest.upper === null || latest.lower === null) return false;

  switch (filter.mode) {
    case "aboveUpper":
      return latestCandle.close > latest.upper;
    case "belowLower":
      return latestCandle.close < latest.lower;
    case "inside":
      return latestCandle.close <= latest.upper && latestCandle.close >= latest.lower;
    case "crossUpper":
      return Boolean(previous?.upper !== null && previousCandle?.close <= previous!.upper! && latestCandle.close > latest.upper);
    case "crossLower":
      return Boolean(previous?.lower !== null && previousCandle?.close >= previous!.lower! && latestCandle.close < latest.lower);
    default:
      return false;
  }
}

async function fetchRequiredCandles(
  instId: string,
  filters: ScreenerFilter[],
  fetchCandles: MarketDataProvider["fetchCandles"],
): Promise<CandleMap> {
  const requiredTimeframes = Array.from(
    new Set<Timeframe>([...RESULT_TIMEFRAMES, ...filters.map((filter) => filter.category === "technical" ? filter.timeframe : "15m")]),
  );
  const entries = await Promise.all(
    requiredTimeframes.map(async (timeframe) => [timeframe, await fetchCandles(instId, timeframe)] as const),
  );

  return Object.fromEntries(entries) as CandleMap;
}

function evaluateCondition(value: number, condition: RangeCondition | MacdCondition, target?: number, from?: number, to?: number): boolean {
  switch (condition) {
    case "above":
      return target !== undefined && value > target;
    case "aboveOrEqual":
      return target !== undefined && value >= target;
    case "below":
      return target !== undefined && value < target;
    case "belowOrEqual":
      return target !== undefined && value <= target;
    case "between": {
      const min = Math.min(from ?? 0, to ?? 0);
      const max = Math.max(from ?? 0, to ?? 0);
      return value >= min && value <= max;
    }
    case "outside": {
      const min = Math.min(from ?? 0, to ?? 0);
      const max = Math.max(from ?? 0, to ?? 0);
      return value < min || value > max;
    }
    case "equal":
      return target !== undefined && Math.abs(value - target) < 0.0000001;
    default:
      return false;
  }
}

function getMacdPlotValue(point: MacdPoint | undefined, plot: MacdPlot): number | null {
  if (!point) return null;
  return plot === "level" ? point.macd : point.signal;
}

function getMacdTargetValue(point: MacdPoint | undefined, target: "value" | "level" | "signal", value?: number): number | null {
  if (target === "value") return value ?? 0;
  return getMacdPlotValue(point, target);
}

function latestMacd(candles?: Candle[]): number | null {
  if (!candles?.length) return null;
  const latest = calculateMacd(candles).at(-1);
  return latest?.macd ?? null;
}

function latestRsi(candles: Candle[] | undefined, length: number): number | null {
  if (!candles?.length) return null;
  const latest = calculateRsi(candles, length).at(-1);
  return latest?.value ?? null;
}

function latestBollingerPosition(candles: Candle[] | undefined, length: number, stdDev: number): string {
  if (!candles?.length) return "n/a";
  const latest = calculateBollingerBands(candles, length, stdDev).at(-1);
  const close = candles.at(-1)?.close;
  if (!latest || latest.upper === null || latest.lower === null || close === undefined) return "n/a";
  if (close > latest.upper) return "above upper";
  if (close < latest.lower) return "below lower";
  return "inside";
}

function emptyResult(ticker: Ticker, reason: string): ScreenerResult {
  return {
    instId: ticker.instId,
    last: ticker.last,
    change24hPct: ticker.change24hPct,
    volume24hUsd: ticker.volume24hUsd,
    macd5m: null,
    macd15m: null,
    macd1H: null,
    macd4H: null,
    macd1D: null,
    rsi15m: null,
    bbPosition: "n/a",
    matched: false,
    reason,
  };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
