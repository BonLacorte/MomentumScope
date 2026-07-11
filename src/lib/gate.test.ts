import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchGateCandles,
  fetchGateInstruments,
  gateIntervalForTimeframe,
  normalizeGateCandles,
  normalizeGateContracts,
  normalizeGateTickers,
} from "./gate";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Gate.io market-data adapter", () => {
  it("loads the complete contract universe using Gate's 100-item pages", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      name: `COIN${index}_USDT`,
      status: "trading",
    }));
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => firstPage } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ name: "LAST_USDT", status: "trading" }],
      } as Response);

    await expect(fetchGateInstruments()).resolves.toHaveLength(101);
    expect(request).toHaveBeenNthCalledWith(
      1,
      "/gate/api/v4/futures/usdt/contracts?limit=100&offset=0",
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/gate/api/v4/futures/usdt/contracts?limit=100&offset=100",
    );
  });

  it("keeps only live crypto USDT perpetual contracts", () => {
    const instruments = normalizeGateContracts([
      { name: "BTC_USDT", status: "trading" },
      { name: "ETH_USDT", status: "trading", contract_type: "" },
      { name: "AAL_USDT", status: "trading", contract_type: "stocks" },
      { name: "BTC_USD", status: "trading" },
      { name: "OLD_USDT", status: "delisted" },
    ]);

    expect(instruments).toEqual([
      { instId: "BTC_USDT", baseCcy: "BTC", quoteCcy: "USDT" },
      { instId: "ETH_USDT", baseCcy: "ETH", quoteCcy: "USDT" },
    ]);
  });

  it("maps Gate ticker change and quote volume and sorts by volume", () => {
    const tickers = normalizeGateTickers([
      {
        contract: "ETH_USDT",
        last: "3500",
        change_percentage: "2.5",
        volume_24h_quote: "5000000",
      },
      {
        contract: "BTC_USDT",
        last: "65000",
        change_percentage: "-1.25",
        volume_24h_quote: "9000000",
      },
      {
        contract: "BROKEN_USDT",
        last: "not-a-number",
        change_percentage: "1",
        volume_24h_quote: "10",
      },
    ]);

    expect(tickers).toEqual([
      { instId: "BTC_USDT", last: 65000, change24hPct: -1.25, volume24hUsd: 9000000 },
      { instId: "ETH_USDT", last: 3500, change24hPct: 2.5, volume24hUsd: 5000000 },
    ]);
  });

  it("translates every supported timeframe to Gate intervals", () => {
    expect(gateIntervalForTimeframe("5m")).toBe("5m");
    expect(gateIntervalForTimeframe("15m")).toBe("15m");
    expect(gateIntervalForTimeframe("1H")).toBe("1h");
    expect(gateIntervalForTimeframe("4H")).toBe("4h");
    expect(gateIntervalForTimeframe("1D")).toBe("1d");
  });

  it("normalizes valid candles, drops invalid rows, and orders them chronologically", () => {
    const candles = normalizeGateCandles([
      { t: 200, o: "2", h: "4", l: "1", c: "3", v: "20" },
      { t: 100, o: "1", h: "3", l: "0.5", c: "2", v: "10" },
      { t: 300, o: "bad", h: "4", l: "1", c: "3", v: "30" },
    ]);

    expect(candles).toEqual([
      { time: 100, open: 1, high: 3, low: 0.5, close: 2, volume: 10 },
      { time: 200, open: 2, high: 4, low: 1, close: 3, volume: 20 },
    ]);
  });

  it("requests the translated candle interval and surfaces API errors after retries", async () => {
    const successFetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => [{ t: 100, o: "1", h: "2", l: "0.5", c: "1.5", v: "5" }],
    } as Response);

    await expect(fetchGateCandles("BTC_USDT", "1H", 220)).resolves.toHaveLength(1);
    expect(successFetch).toHaveBeenCalledWith(
      "/gate/api/v4/futures/usdt/candlesticks?contract=BTC_USDT&interval=1h&limit=220",
    );

    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Unavailable",
    } as Response);

    const request = fetchGateCandles("BTC_USDT", "15m");
    const rejection = expect(request).rejects.toThrow("Gate.io request failed: 503 Unavailable");
    await vi.runAllTimersAsync();
    await rejection;
  });
});
