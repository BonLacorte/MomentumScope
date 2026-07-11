import {
  fetchGateCandles,
  fetchGateInstruments,
  fetchGateTickers,
} from "./gate";
import {
  fetchCandles as fetchOkxCandles,
  fetchSwapTickers as fetchOkxTickers,
  fetchUsdtSwapInstruments as fetchOkxInstruments,
} from "./okx";
import type { Candle, Instrument, MarketDataSource, Ticker, Timeframe } from "../types";

export type MarketDataProvider = {
  id: MarketDataSource;
  label: string;
  marketLabel: string;
  defaultSymbol: string;
  defaultWatchlist: string[];
  fetchInstruments: () => Promise<Instrument[]>;
  fetchTickers: () => Promise<Ticker[]>;
  fetchCandles: (instId: string, timeframe: Timeframe, limit?: number) => Promise<Candle[]>;
  formatSymbol: (instId: string) => string;
};

export const MARKET_DATA_PROVIDERS: Record<MarketDataSource, MarketDataProvider> = {
  gate: {
    id: "gate",
    label: "Gate.io",
    marketLabel: "Gate.io Perpetual",
    defaultSymbol: "BTC_USDT",
    defaultWatchlist: ["BTC_USDT", "ETH_USDT", "SOL_USDT"],
    fetchInstruments: fetchGateInstruments,
    fetchTickers: fetchGateTickers,
    fetchCandles: fetchGateCandles,
    formatSymbol: (instId) => instId.replace(/_USDT$/, ""),
  },
  okx: {
    id: "okx",
    label: "OKX",
    marketLabel: "OKX Perpetual",
    defaultSymbol: "BTC-USDT-SWAP",
    defaultWatchlist: ["BTC-USDT-SWAP", "ETH-USDT-SWAP", "SOL-USDT-SWAP"],
    fetchInstruments: fetchOkxInstruments,
    fetchTickers: fetchOkxTickers,
    fetchCandles: fetchOkxCandles,
    formatSymbol: (instId) => instId.replace(/-USDT-SWAP$/, ""),
  },
};

export function getMarketDataProvider(source: MarketDataSource): MarketDataProvider {
  return MARKET_DATA_PROVIDERS[source];
}
