import type { Candle } from "../types";

export function alignPointsToChartCandles<T extends { time: number }>(
  points: T[],
  chartCandles: Candle[],
): Array<T & { time: number }> {
  if (!points.length || !chartCandles.length) return [];

  const interval = inferChartInterval(chartCandles);
  const aligned: Array<T & { time: number }> = [];
  let pointIndex = 0;
  let latestPoint: T | undefined;

  chartCandles.forEach((candle, candleIndex) => {
    const nextTime = chartCandles[candleIndex + 1]?.time ?? candle.time + interval;
    while (pointIndex < points.length && points[pointIndex].time < nextTime) {
      latestPoint = points[pointIndex];
      pointIndex += 1;
    }
    if (latestPoint) aligned.push({ ...latestPoint, time: candle.time });
  });

  return aligned;
}

function inferChartInterval(candles: Candle[]): number {
  if (candles.length < 2) return 1;
  return Math.max(1, candles[1].time - candles[0].time);
}
