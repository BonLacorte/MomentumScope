import type { Candle, Instrument, Ticker, Timeframe } from "../types";

const GATE_BASE = "/gate";

const timeframeToGateInterval: Record<Timeframe, string> = {
  "5m": "5m",
  "15m": "15m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
};

type GateContract = {
  name: string;
  status: string;
  contract_type?: string | null;
};

type GateTicker = {
  contract: string;
  last: string;
  change_percentage: string;
  volume_24h_quote?: string;
  volume_24h_settle?: string;
  volume_24h_usd?: string;
};

type GateCandle = {
  t: number | string;
  o: string;
  h: string;
  l: string;
  c: string;
  v: number | string;
};

let instrumentPromise: Promise<Instrument[]> | null = null;

export function fetchGateInstruments(): Promise<Instrument[]> {
  if (!instrumentPromise) {
    instrumentPromise = fetchAllGateContracts()
      .then(normalizeGateContracts)
      .catch((error) => {
        instrumentPromise = null;
        throw error;
      });
  }

  return instrumentPromise;
}

async function fetchAllGateContracts(): Promise<GateContract[]> {
  const pageSize = 100;
  const contracts: GateContract[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const page = await gateGet<GateContract[]>(
      `/api/v4/futures/usdt/contracts?limit=${pageSize}&offset=${offset}`,
    );
    contracts.push(...page);
    if (page.length < pageSize) return contracts;
  }
}

export async function fetchGateTickers(): Promise<Ticker[]> {
  const [instruments, response] = await Promise.all([
    fetchGateInstruments(),
    gateGet<GateTicker[]>("/api/v4/futures/usdt/tickers"),
  ]);
  const eligibleSymbols = new Set(instruments.map((instrument) => instrument.instId));
  return normalizeGateTickers(response).filter((ticker) => eligibleSymbols.has(ticker.instId));
}

export async function fetchGateCandles(
  instId: string,
  timeframe: Timeframe,
  limit = 160,
): Promise<Candle[]> {
  const interval = gateIntervalForTimeframe(timeframe);
  const response = await gateGet<GateCandle[]>(
    `/api/v4/futures/usdt/candlesticks?contract=${encodeURIComponent(instId)}&interval=${interval}&limit=${limit}`,
  );
  return normalizeGateCandles(response);
}

export function gateIntervalForTimeframe(timeframe: Timeframe): string {
  return timeframeToGateInterval[timeframe];
}

export function normalizeGateContracts(contracts: GateContract[]): Instrument[] {
  return contracts
    .filter((contract) => contract.status === "trading")
    .filter((contract) => contract.name.endsWith("_USDT"))
    .filter((contract) => !contract.contract_type?.trim())
    .map((contract) => ({
      instId: contract.name,
      baseCcy: contract.name.slice(0, -"_USDT".length),
      quoteCcy: "USDT",
    }))
    .sort((a, b) => a.instId.localeCompare(b.instId));
}

export function normalizeGateTickers(tickers: GateTicker[]): Ticker[] {
  return tickers
    .filter((ticker) => ticker.contract.endsWith("_USDT"))
    .map((ticker) => ({
      instId: ticker.contract,
      last: Number(ticker.last),
      change24hPct: Number(ticker.change_percentage),
      volume24hUsd: Number(ticker.volume_24h_quote ?? ticker.volume_24h_settle ?? ticker.volume_24h_usd ?? 0),
    }))
    .filter(
      (ticker) =>
        Number.isFinite(ticker.last) &&
        Number.isFinite(ticker.change24hPct) &&
        Number.isFinite(ticker.volume24hUsd),
    )
    .sort((a, b) => b.volume24hUsd - a.volume24hUsd);
}

export function normalizeGateCandles(candles: GateCandle[]): Candle[] {
  return candles
    .map((candle) => ({
      time: Number(candle.t),
      open: Number(candle.o),
      high: Number(candle.h),
      low: Number(candle.l),
      close: Number(candle.c),
      volume: Number(candle.v),
    }))
    .filter(
      (candle) =>
        Number.isFinite(candle.time) &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        Number.isFinite(candle.volume),
    )
    .sort((a, b) => a.time - b.time);
}

async function gateGet<T>(path: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${GATE_BASE}${path}`);
      if (!response.ok) {
        throw new Error(`Gate.io request failed: ${response.status} ${response.statusText}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Gate.io request failed");
      await delay(350 * (attempt + 1));
    }
  }

  throw lastError ?? new Error("Gate.io request failed");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
