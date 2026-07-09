import type { Candle } from "../types";

export type MacdPoint = {
  time: number;
  macd: number | null;
  signal: number | null;
  histogram: number | null;
};

export type RsiPoint = {
  time: number;
  value: number | null;
};

export type BollingerPoint = {
  time: number;
  middle: number | null;
  upper: number | null;
  lower: number | null;
};

export function toHeikinAshi(candles: Candle[]): Candle[] {
  const output: Candle[] = [];

  candles.forEach((candle, index) => {
    const close = (candle.open + candle.high + candle.low + candle.close) / 4;
    const open =
      index === 0
        ? (candle.open + candle.close) / 2
        : (output[index - 1].open + output[index - 1].close) / 2;
    const high = Math.max(candle.high, open, close);
    const low = Math.min(candle.low, open, close);

    output.push({
      time: candle.time,
      open,
      high,
      low,
      close,
      volume: candle.volume,
    });
  });

  return output;
}

export function ema(values: number[], period: number): Array<number | null> {
  if (period <= 0) {
    throw new Error("EMA period must be greater than 0.");
  }

  const output: Array<number | null> = new Array(values.length).fill(null);
  if (values.length < period) return output;

  const multiplier = 2 / (period + 1);
  let previous = average(values.slice(0, period));
  output[period - 1] = previous;

  for (let index = period; index < values.length; index += 1) {
    previous = (values[index] - previous) * multiplier + previous;
    output[index] = previous;
  }

  return output;
}

export function calculateMacd(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): MacdPoint[] {
  const closes = candles.map((candle) => candle.close);
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const macdLine = closes.map((_, index) => {
    if (fastEma[index] === null || slowEma[index] === null) return null;
    return fastEma[index]! - slowEma[index]!;
  });

  const firstMacdIndex = macdLine.findIndex((value) => value !== null);
  const signalLine: Array<number | null> = new Array(closes.length).fill(null);

  if (firstMacdIndex >= 0) {
    const denseMacd = macdLine.slice(firstMacdIndex).filter((value): value is number => value !== null);
    const denseSignal = ema(denseMacd, signalPeriod);
    denseSignal.forEach((value, denseIndex) => {
      signalLine[firstMacdIndex + denseIndex] = value;
    });
  }

  return candles.map((candle, index) => {
    const macd = macdLine[index];
    const signal = signalLine[index];
    return {
      time: candle.time,
      macd,
      signal,
      histogram: macd !== null && signal !== null ? macd - signal : null,
    };
  });
}

export function calculateRsi(candles: Candle[], period = 14): RsiPoint[] {
  if (period <= 0) {
    throw new Error("RSI period must be greater than 0.");
  }

  const output: RsiPoint[] = candles.map((candle) => ({ time: candle.time, value: null }));
  if (candles.length <= period) return output;

  let gain = 0;
  let loss = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    if (change >= 0) gain += change;
    else loss += Math.abs(change);
  }

  let averageGain = gain / period;
  let averageLoss = loss / period;
  output[period].value = toRsi(averageGain, averageLoss);

  for (let index = period + 1; index < candles.length; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    const currentGain = Math.max(change, 0);
    const currentLoss = Math.max(-change, 0);
    averageGain = (averageGain * (period - 1) + currentGain) / period;
    averageLoss = (averageLoss * (period - 1) + currentLoss) / period;
    output[index].value = toRsi(averageGain, averageLoss);
  }

  return output;
}

export function calculateBollingerBands(
  candles: Candle[],
  length = 50,
  stdDev = 0.2,
): BollingerPoint[] {
  if (length <= 0) {
    throw new Error("Bollinger length must be greater than 0.");
  }

  const closes = candles.map((candle) => candle.close);
  return candles.map((candle, index) => {
    if (index + 1 < length) {
      return { time: candle.time, middle: null, upper: null, lower: null };
    }

    const window = closes.slice(index + 1 - length, index + 1);
    const middle = average(window);
    const standardDeviation = Math.sqrt(
      window.reduce((sum, value) => sum + (value - middle) ** 2, 0) / window.length,
    );

    return {
      time: candle.time,
      middle,
      upper: middle + standardDeviation * stdDev,
      lower: middle - standardDeviation * stdDev,
    };
  });
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toRsi(averageGain: number, averageLoss: number): number {
  if (averageLoss === 0) return 100;
  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}
