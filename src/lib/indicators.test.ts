import { describe, expect, it } from "vitest";
import { calculateBollingerBands, calculateMacd, calculateRsi, toHeikinAshi } from "./indicators";
import type { Candle } from "../types";

function makeCandles(values: number[]): Candle[] {
  return values.map((value, index) => ({
    time: 1_700_000_000 + index * 60,
    open: value - 0.5,
    high: value + 1,
    low: value - 1,
    close: value,
    volume: 1000 + index,
  }));
}

describe("indicators", () => {
  it("converts candles to Heiken Ashi while preserving length and time", () => {
    const candles = makeCandles([10, 12, 11]);
    const heikin = toHeikinAshi(candles);

    expect(heikin).toHaveLength(candles.length);
    expect(heikin[0].time).toBe(candles[0].time);
    expect(heikin[0].close).toBe((candles[0].open + candles[0].high + candles[0].low + candles[0].close) / 4);
    expect(heikin[1].open).toBe((heikin[0].open + heikin[0].close) / 2);
  });

  it("calculates MACD values once enough candles exist", () => {
    const candles = makeCandles(Array.from({ length: 80 }, (_, index) => 100 + index * 0.8));
    const macd = calculateMacd(candles);

    expect(macd).toHaveLength(candles.length);
    expect(macd.at(-1)?.macd).toBeTypeOf("number");
    expect(macd.at(-1)?.signal).toBeTypeOf("number");
  });

  it("calculates RSI values between 0 and 100", () => {
    const candles = makeCandles([10, 11, 12, 11, 13, 14, 13, 15, 16, 15, 17, 18, 19, 18, 20, 21, 22]);
    const rsi = calculateRsi(candles, 14);
    const latest = rsi.at(-1)?.value;

    expect(latest).not.toBeNull();
    expect(latest!).toBeGreaterThanOrEqual(0);
    expect(latest!).toBeLessThanOrEqual(100);
  });

  it("uses editable Bollinger length and stdDev", () => {
    const candles = makeCandles(Array.from({ length: 60 }, (_, index) => 100 + Math.sin(index / 3) * 4));
    const narrow = calculateBollingerBands(candles, 50, 0.2).at(-1)!;
    const wide = calculateBollingerBands(candles, 50, 2).at(-1)!;

    expect(narrow.middle).not.toBeNull();
    expect(narrow.upper! - narrow.middle!).toBeLessThan(wide.upper! - wide.middle!);
  });
});