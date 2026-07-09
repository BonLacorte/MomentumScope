import type { Candle, Instrument, Ticker, Timeframe } from "../types";

const OKX_BASE = "/okx";

const timeframeToOkxBar: Record<Timeframe, string> = {
  "5m": "5m",
  "15m": "15m",
  "1H": "1H",
  "4H": "4H",
  "1D": "1D",
};

type OkxResponse<T> = {
  code: string;
  msg: string;
  data: T;
};

type OkxInstrument = {
  instId: string;
  baseCcy: string;
  quoteCcy: string;
  state: string;
};

type OkxTicker = {
  instId: string;
  last: string;
  open24h: string;
  volCcy24h?: string;
  vol24h?: string;
};

export async function fetchUsdtSwapInstruments(): Promise<Instrument[]> {
  const response = await okxGet<OkxInstrument[]>("/api/v5/public/instruments?instType=SWAP");
  return response
    .filter((instrument) => instrument.state === "live")
    .filter((instrument) => instrument.instId.endsWith("-USDT-SWAP"))
    .map((instrument) => ({
      instId: instrument.instId,
      baseCcy: instrument.baseCcy,
      quoteCcy: instrument.quoteCcy || "USDT",
    }))
    .sort((a, b) => a.instId.localeCompare(b.instId));
}

export async function fetchSwapTickers(): Promise<Ticker[]> {
  const response = await okxGet<OkxTicker[]>("/api/v5/market/tickers?instType=SWAP");
  return response
    .filter((ticker) => ticker.instId.endsWith("-USDT-SWAP"))
    .map((ticker) => {
      const last = Number(ticker.last);
      const open24h = Number(ticker.open24h);
      const quoteVolume = Number(ticker.volCcy24h ?? 0);
      const contractVolume = Number(ticker.vol24h ?? 0);
      const volume24hUsd = quoteVolume > 0 ? quoteVolume : contractVolume * last;
      const change24hPct = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;

      return {
        instId: ticker.instId,
        last,
        change24hPct,
        volume24hUsd,
      };
    })
    .filter((ticker) => Number.isFinite(ticker.last))
    .sort((a, b) => b.volume24hUsd - a.volume24hUsd);
}

export async function fetchCandles(
  instId: string,
  timeframe: Timeframe,
  limit = 160,
): Promise<Candle[]> {
  const bar = timeframeToOkxBar[timeframe];
  const response = await okxGet<string[][]>(
    `/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=${bar}&limit=${limit}`,
  );

  return response
    .map((row) => ({
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }))
    .filter((candle) => Number.isFinite(candle.time) && Number.isFinite(candle.close))
    .sort((a, b) => a.time - b.time);
}

async function okxGet<T>(path: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${OKX_BASE}${path}`);
      if (!response.ok) {
        throw new Error(`OKX request failed: ${response.status} ${response.statusText}`);
      }

      const payload = (await response.json()) as OkxResponse<T>;
      if (payload.code !== "0") {
        throw new Error(`OKX error ${payload.code}: ${payload.msg}`);
      }

      return payload.data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("OKX request failed");
      await delay(350 * (attempt + 1));
    }
  }

  throw lastError ?? new Error("OKX request failed");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
