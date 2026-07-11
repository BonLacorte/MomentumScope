import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadLastScanSnapshot, loadSettings, saveLastScanSnapshot } from "./storage";
import type { LastScanSnapshot, ScreenerSettings } from "../types";

const defaultSettings: ScreenerSettings = {
  filters: [],
  rsiLength: 14,
  bollingerLength: 50,
  bollingerStdDev: 0.2,
  volumeMinUsd: 3_000_000,
  volumeMaxUsd: 100_000_000,
  changeMinPct: 3,
  changeMaxPct: 100,
  refreshSeconds: 60,
};

const snapshot: LastScanSnapshot = {
  source: "gate",
  savedAt: "2026-07-11T07:30:00.000Z",
  results: [
    {
      instId: "BTC_USDT",
      last: 112000,
      change24hPct: 4.2,
      volume24hUsd: 123000000,
      macd5m: 1,
      macd15m: 2,
      macd1H: 3,
      macd4H: 4,
      macd1D: null,
      rsi15m: 62.5,
      bbPosition: "inside",
      matched: true,
      reason: "Matched all filters",
    },
  ],
};

beforeEach(() => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
  });
});

afterEach(() => {
  delete (globalThis as Partial<typeof globalThis>).localStorage;
});

describe("latest scan snapshot storage", () => {
  it("saves and restores a successful scan snapshot", () => {
    saveLastScanSnapshot(snapshot);

    expect(loadLastScanSnapshot()).toEqual(snapshot);
  });

  it("ignores invalid or corrupt stored snapshot data", () => {
    localStorage.setItem("momentumscope-last-scan-v1", "{not-json");
    expect(loadLastScanSnapshot()).toBeNull();

    localStorage.setItem(
      "momentumscope-last-scan-v1",
      JSON.stringify({ ...snapshot, source: "unknown" }),
    );
    expect(loadLastScanSnapshot()).toBeNull();

    localStorage.setItem(
      "momentumscope-last-scan-v1",
      JSON.stringify({ ...snapshot, results: [{ instId: "BTC_USDT" }] }),
    );
    expect(loadLastScanSnapshot()).toBeNull();
  });

  it("restores saved scan results without changing screener settings", () => {
    localStorage.setItem(
      "okx-screener-settings-v1",
      JSON.stringify({ ...defaultSettings, refreshSeconds: 120 }),
    );
    saveLastScanSnapshot(snapshot);

    expect(loadSettings(defaultSettings).refreshSeconds).toBe(120);
    expect(loadLastScanSnapshot()?.results).toEqual(snapshot.results);
  });
});
