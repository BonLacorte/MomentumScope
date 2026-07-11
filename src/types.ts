export type Timeframe = "5m" | "15m" | "1H" | "4H" | "1D";
export type CandleMode = "normal" | "heikin";
export type MarketDataSource = "okx" | "gate";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Instrument = {
  instId: string;
  baseCcy: string;
  quoteCcy: string;
};

export type Ticker = {
  instId: string;
  last: number;
  change24hPct: number;
  volume24hUsd: number;
};

export type RangeCondition = "above" | "aboveOrEqual" | "below" | "belowOrEqual" | "between" | "outside" | "equal";
export type MacdCondition = RangeCondition | "crosses" | "crossesUp" | "crossesDown";
export type MacdPlot = "level" | "signal";
export type MacdTarget = "value" | "level" | "signal";
export type TrendlineMode = "segment" | "extended";
export type IndicatorTimeframe = "Chart" | Timeframe;
export type ChartIndicatorKind = "macd" | "rsi" | "bollinger";

export type MacdChartIndicator = {
  id: "macd";
  kind: "macd";
  source: "close";
  fastLength: number;
  slowLength: number;
  signalLength: number;
  oscillatorMaType: "EMA";
  signalMaType: "EMA";
  timeframe: IndicatorTimeframe;
  waitForTimeframeClose: boolean;
  visible: boolean;
  histogramVisible: boolean;
  macdVisible: boolean;
  signalVisible: boolean;
  zeroVisible: boolean;
  colors: {
    histogramPositiveRising: string;
    histogramPositiveFalling: string;
    histogramNegativeRising: string;
    histogramNegativeFalling: string;
    macd: string;
    signal: string;
    zero: string;
  };
  precision: "default";
};

export type RsiChartIndicator = {
  id: "rsi";
  kind: "rsi";
  length: number;
  timeframe: IndicatorTimeframe;
  visible: boolean;
  color: string;
};

export type BollingerChartIndicator = {
  id: "bollinger";
  kind: "bollinger";
  length: number;
  stdDev: number;
  timeframe: "Chart";
  visible: boolean;
  upperColor: string;
  middleColor: string;
  lowerColor: string;
};

export type ChartIndicator = MacdChartIndicator | RsiChartIndicator | BollingerChartIndicator;

export type PriceChangeFilter = {
  id: string;
  category: "marketData";
  type: "priceChangePct";
  condition: RangeCondition;
  value?: number;
  from?: number;
  to?: number;
};

export type VolumeUsdFilter = {
  id: string;
  category: "marketData";
  type: "volumeUsd";
  condition: RangeCondition;
  value?: number;
  from?: number;
  to?: number;
  preset?: "1bAbove" | "100mAbove" | "10mAbove" | "1mAbove" | "1mBelow" | "manual";
};

export type MacdFilter = {
  id: string;
  category: "technical";
  type: "macd";
  timeframe: Timeframe;
  plot: MacdPlot;
  condition: MacdCondition;
  target: MacdTarget;
  value?: number;
  from?: number;
  to?: number;
};

export type RsiFilter = {
  id: string;
  category: "technical";
  type: "rsi";
  timeframe: Timeframe;
  mode: "level" | "cross";
  operator: ">" | "<";
  value: number;
  length: number;
};

export type BollingerFilter = {
  id: string;
  category: "technical";
  type: "bollinger";
  timeframe: Timeframe;
  mode: "aboveUpper" | "belowLower" | "inside" | "crossUpper" | "crossLower";
  length: number;
  stdDev: number;
};

export type LegacyMacdFilter = {
  id: string;
  type: "macd";
  timeframe: Timeframe;
  mode: "level" | "crossSignal";
  operator: ">" | "<";
  value: number;
};

export type ScreenerFilter = PriceChangeFilter | VolumeUsdFilter | MacdFilter | RsiFilter | BollingerFilter;
export type AnyStoredFilter = ScreenerFilter | LegacyMacdFilter | (RsiFilter | BollingerFilter) & { category?: "technical" };

export type ScreenerSettings = {
  filters: ScreenerFilter[];
  rsiLength: number;
  bollingerLength: number;
  bollingerStdDev: number;
  volumeMinUsd: number;
  volumeMaxUsd: number;
  changeMinPct: number;
  changeMaxPct: number;
  refreshSeconds: number;
};

export type ScreenerResult = {
  instId: string;
  last: number;
  change24hPct: number;
  volume24hUsd: number;
  macd5m: number | null;
  macd15m: number | null;
  macd1H: number | null;
  macd4H: number | null;
  macd1D: number | null;
  rsi15m: number | null;
  bbPosition: string;
  matched: boolean;
  reason: string;
};

export type LastScanSnapshot = {
  source: MarketDataSource;
  savedAt: string;
  results: ScreenerResult[];
};

export type TrendlinePoint = {
  time: number;
  price: number;
};

export type Trendline = {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  mode: TrendlineMode;
  points: [TrendlinePoint, TrendlinePoint];
};
