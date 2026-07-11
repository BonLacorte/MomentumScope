import { describe, expect, it } from "vitest";
import { getMarketDataProvider, MARKET_DATA_PROVIDERS } from "./marketData";

describe("market-data providers", () => {
  it("registers Gate and OKX with separate defaults and native symbol formatting", () => {
    expect(Object.keys(MARKET_DATA_PROVIDERS).sort()).toEqual(["gate", "okx"]);
    expect(getMarketDataProvider("gate").defaultSymbol).toBe("BTC_USDT");
    expect(getMarketDataProvider("gate").formatSymbol("BTC_USDT")).toBe("BTC");
    expect(getMarketDataProvider("okx").defaultSymbol).toBe("BTC-USDT-SWAP");
    expect(getMarketDataProvider("okx").formatSymbol("BTC-USDT-SWAP")).toBe("BTC");
  });
});
