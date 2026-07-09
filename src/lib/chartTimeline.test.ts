import { describe, expect, it } from "vitest";
import type { Candle } from "../types";
import { alignPointsToChartCandles } from "./chartTimeline";

function candles(times: number[]): Candle[] {
  return times.map((time) => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
}

describe("alignPointsToChartCandles", () => {
  it("uses the latest lower-timeframe value inside each chart candle", () => {
    const result = alignPointsToChartCandles(
      [
        { time: 0, value: 1 },
        { time: 5, value: 2 },
        { time: 10, value: 3 },
        { time: 15, value: 4 },
      ],
      candles([0, 10, 20]),
    );

    expect(result).toEqual([
      { time: 0, value: 2 },
      { time: 10, value: 4 },
      { time: 20, value: 4 },
    ]);
  });

  it("carries a higher-timeframe value across chart candles", () => {
    const result = alignPointsToChartCandles(
      [
        { time: 0, value: 10 },
        { time: 30, value: 20 },
      ],
      candles([0, 10, 20, 30, 40]),
    );

    expect(result.map(({ time, value }) => ({ time, value }))).toEqual([
      { time: 0, value: 10 },
      { time: 10, value: 10 },
      { time: 20, value: 10 },
      { time: 30, value: 20 },
      { time: 40, value: 20 },
    ]);
  });
});
