
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  createChart,
  type BusinessDay,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type LogicalRange,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { BarChart3, MousePointer2, PencilLine, Plus, Settings2, Trash2, X } from "lucide-react";
import { alignPointsToChartCandles } from "../lib/chartTimeline";
import { calculateBollingerBands, calculateMacd, calculateRsi, toHeikinAshi, type MacdPoint } from "../lib/indicators";
import type {
  BollingerChartIndicator,
  Candle,
  CandleMode,
  ChartIndicator,
  IndicatorTimeframe,
  MacdChartIndicator,
  RsiChartIndicator,
  ScreenerSettings,
  Timeframe,
  Trendline,
  TrendlineMode,
} from "../types";

type Props = {
  candles: Candle[];
  candleMode: CandleMode;
  loading: boolean;
  symbol: string;
  timeframe: Timeframe;
  trendlines: Trendline[];
  settings: ScreenerSettings;
  indicators: ChartIndicator[];
  indicatorCandles: Partial<Record<Timeframe, Candle[]>>;
  onIndicatorsChange: (indicators: ChartIndicator[]) => void;
  onTrendlinesChange: (trendlines: Trendline[]) => void;
};

type PendingPoint = { time: number; price: number };
type IndicatorModalMode = "picker" | "macd";
type MacdSettingsTab = "inputs" | "style" | "visibility";
type PaneId = "price" | "macd" | "rsi";
type IndicatorRefs = {
  chart: IChartApi | null;
  histogram?: ISeriesApi<"Histogram">;
  macd?: ISeriesApi<"Line">;
  signal?: ISeriesApi<"Line">;
  zero?: ISeriesApi<"Line">;
  rsi?: ISeriesApi<"Line">;
  sync?: ISeriesApi<"Line">;
};

const PH_TIME_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const INDICATOR_TIMEFRAMES: IndicatorTimeframe[] = ["Chart", "5m", "15m", "1H", "4H", "1D"];
const RIGHT_OFFSET_BARS = 10;

export default function ChartPanel({
  candles,
  candleMode,
  loading,
  symbol,
  timeframe,
  trendlines,
  indicators,
  indicatorCandles,
  onIndicatorsChange,
  onTrendlinesChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const macdContainerRef = useRef<HTMLDivElement | null>(null);
  const rsiContainerRef = useRef<HTMLDivElement | null>(null);
  const paneStackRef = useRef<HTMLDivElement | null>(null);
  const crosshairLineRef = useRef<HTMLDivElement | null>(null);
  const crosshairLabelRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlaySeriesRef = useRef<Array<ISeriesApi<"Line">>>([]);
  const macdRefs = useRef<IndicatorRefs>({ chart: null });
  const rsiRefs = useRef<IndicatorRefs>({ chart: null });
  const paneReadyRef = useRef<Record<PaneId, boolean>>({ price: false, macd: false, rsi: false });
  const sharedRangeRef = useRef<LogicalRange | null>(null);
  const syncingRangeRef = useRef(false);
  const lastPriceLoadKeyRef = useRef<string | null>(null);
  const lastCandleCountRef = useRef(0);
  const lastCaptureAtRef = useRef(0);
  const [drawing, setDrawing] = useState(false);
  const [pendingPoint, setPendingPoint] = useState<PendingPoint | null>(null);
  const [trendlineMode, setTrendlineMode] = useState<TrendlineMode>("segment");
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const [modalMode, setModalMode] = useState<IndicatorModalMode | null>(null);
  const [macdDraft, setMacdDraft] = useState<MacdChartIndicator>(() => createDefaultMacdIndicator());
  const [macdTab, setMacdTab] = useState<MacdSettingsTab>("inputs");

  const visibleCandles = useMemo(() => (candleMode === "heikin" ? toHeikinAshi(candles) : candles), [candleMode, candles]);
  const macdIndicator = indicators.find((indicator): indicator is MacdChartIndicator => indicator.kind === "macd");
  const rsiIndicator = indicators.find((indicator): indicator is RsiChartIndicator => indicator.kind === "rsi");
  const bollingerIndicator = indicators.find((indicator): indicator is BollingerChartIndicator => indicator.kind === "bollinger");
  const latestCandle = candles.at(-1);
  const countdownSeconds = latestCandle ? Math.max(0, latestCandle.time + timeframeToSeconds(timeframe) - nowSeconds) : null;
  const resolvedMacdCandles = useMemo(() => (macdIndicator ? resolveIndicatorCandles(macdIndicator, candles, timeframe, indicatorCandles, nowSeconds) : []), [candles, indicatorCandles, macdIndicator, nowSeconds, timeframe]);
  const resolvedRsiCandles = useMemo(() => (rsiIndicator ? resolveIndicatorCandles(rsiIndicator, candles, timeframe, indicatorCandles, nowSeconds) : []), [candles, indicatorCandles, nowSeconds, rsiIndicator, timeframe]);
  const macdSeriesData = useMemo(() => (macdIndicator ? buildMacdSeriesData(macdIndicator, resolvedMacdCandles, candles) : null), [candles, macdIndicator, resolvedMacdCandles]);
  const rsiSeriesData = useMemo(() => (rsiIndicator ? buildRsiSeriesData(rsiIndicator, resolvedRsiCandles, candles) : []), [candles, resolvedRsiCandles, rsiIndicator]);

  useEffect(() => {
    const interval = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || isTextEntryTarget(event.target)) return;
      event.preventDefault();
      openIndicatorPicker();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [indicators]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, createBaseChartOptions(430));
    const candleSeries = chart.addCandlestickSeries({
      upColor: "#16c784",
      downColor: "#ea3943",
      borderUpColor: "#16c784",
      borderDownColor: "#ea3943",
      wickUpColor: "#16c784",
      wickDownColor: "#ea3943",
    });
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    const unsubscribe = subscribePaneRange("price", chart);
    return () => {
      unsubscribe();
      paneReadyRef.current.price = false;
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      overlaySeriesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) return;
    paneReadyRef.current.price = false;
    const loadKey = `${symbol}|${timeframe}`;
    const shouldFitContent = lastPriceLoadKeyRef.current !== loadKey;
    const previousCandleCount = lastCandleCountRef.current;
    const previousRange = sharedRangeRef.current;
    const addedCandleCount = visibleCandles.length - previousCandleCount;
    const wasAtRealtime = Boolean(
      previousRange &&
      previousCandleCount > 0 &&
      previousRange.to - (previousCandleCount - 1) >= RIGHT_OFFSET_BARS - 1,
    );

    candleSeries.setData(visibleCandles.map((candle) => ({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })));

    overlaySeriesRef.current.forEach((series) => chart.removeSeries(series));
    overlaySeriesRef.current = [];

    if (bollingerIndicator?.visible) {
      const bands = calculateBollingerBands(candles, bollingerIndicator.length, bollingerIndicator.stdDev);
      const upper = bands.filter((point) => point.upper !== null).map((point) => ({ time: point.time as UTCTimestamp, value: point.upper! }));
      const middle = bands.filter((point) => point.middle !== null).map((point) => ({ time: point.time as UTCTimestamp, value: point.middle! }));
      const lower = bands.filter((point) => point.lower !== null).map((point) => ({ time: point.time as UTCTimestamp, value: point.lower! }));
      overlaySeriesRef.current.push(addLine(chart, upper, bollingerIndicator.upperColor));
      overlaySeriesRef.current.push(addLine(chart, middle, bollingerIndicator.middleColor));
      overlaySeriesRef.current.push(addLine(chart, lower, bollingerIndicator.lowerColor));
    }

    trendlines.forEach((line) => {
      overlaySeriesRef.current.push(addLine(chart, buildTrendlineData(line, visibleCandles, timeframe), "#f97316", 2));
    });

    if (shouldFitContent && visibleCandles.length > 0) {
      chart.timeScale().fitContent();
      chart.timeScale().scrollToPosition(RIGHT_OFFSET_BARS, false);
      lastPriceLoadKeyRef.current = loadKey;
    } else if (previousRange) {
      const rangeToRestore = wasAtRealtime && addedCandleCount > 0
        ? shiftLogicalRange(previousRange, addedCandleCount)
        : previousRange;
      setVisibleLogicalRange(chart, rangeToRestore);
    }
    lastCandleCountRef.current = visibleCandles.length;
    paneReadyRef.current.price = true;
    const range = chart.timeScale().getVisibleLogicalRange();
    if (range) syncPaneRange("price", range);
  }, [bollingerIndicator, candles, symbol, visibleCandles, trendlines, timeframe]);

  useEffect(() => {
    if (!macdIndicator?.visible || !macdContainerRef.current) return;
    const chart = createChart(macdContainerRef.current, createIndicatorChartOptions(185));
    const histogram = chart.addHistogramSeries({ priceFormat: { type: "price", precision: 5, minMove: 0.00001 }, priceLineVisible: false, lastValueVisible: false });
    const macd = chart.addLineSeries({ color: macdIndicator.colors.macd, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const signal = chart.addLineSeries({ color: macdIndicator.colors.signal, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const zero = chart.addLineSeries({ color: macdIndicator.colors.zero, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    const sync = chart.addLineSeries({ visible: false, priceLineVisible: false, lastValueVisible: false });
    macdRefs.current = { chart, histogram, macd, signal, zero, sync };
    const unsubscribe = subscribePaneRange("macd", chart);
    return () => {
      unsubscribe();
      paneReadyRef.current.macd = false;
      chart.remove();
      macdRefs.current = { chart: null };
    };
  }, [Boolean(macdIndicator?.visible)]);

  useEffect(() => {
    const refs = macdRefs.current;
    if (!macdIndicator?.visible || !refs.chart || !macdSeriesData) return;
    paneReadyRef.current.macd = false;
    refs.histogram?.setData(macdIndicator.histogramVisible ? macdSeriesData.histogram : []);
    refs.macd?.applyOptions({ color: macdIndicator.colors.macd });
    refs.macd?.setData(macdIndicator.macdVisible ? macdSeriesData.macd : []);
    refs.signal?.applyOptions({ color: macdIndicator.colors.signal });
    refs.signal?.setData(macdIndicator.signalVisible ? macdSeriesData.signal : []);
    refs.zero?.applyOptions({ color: macdIndicator.colors.zero });
    refs.zero?.setData(macdIndicator.zeroVisible ? macdSeriesData.zero : []);
    refs.sync?.setData(visibleCandles.map((candle) => ({ time: candle.time as UTCTimestamp })));
    paneReadyRef.current.macd = true;
    syncPaneToSharedRange("macd", refs.chart);
  }, [macdIndicator, macdSeriesData, visibleCandles]);

  useEffect(() => {
    if (!rsiIndicator?.visible || !rsiContainerRef.current) return;
    const chart = createChart(rsiContainerRef.current, createIndicatorChartOptions(150));
    const rsi = chart.addLineSeries({ color: rsiIndicator.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const sync = chart.addLineSeries({ visible: false, priceLineVisible: false, lastValueVisible: false });
    rsiRefs.current = { chart, rsi, sync };
    const unsubscribe = subscribePaneRange("rsi", chart);
    return () => {
      unsubscribe();
      paneReadyRef.current.rsi = false;
      chart.remove();
      rsiRefs.current = { chart: null };
    };
  }, [Boolean(rsiIndicator?.visible)]);

  useEffect(() => {
    const refs = rsiRefs.current;
    if (!rsiIndicator?.visible || !refs.chart) return;
    paneReadyRef.current.rsi = false;
    refs.rsi?.applyOptions({ color: rsiIndicator.color });
    refs.rsi?.setData(rsiSeriesData);
    refs.sync?.setData(visibleCandles.map((candle) => ({ time: candle.time as UTCTimestamp })));
    paneReadyRef.current.rsi = true;
    syncPaneToSharedRange("rsi", refs.chart);
  }, [rsiIndicator, rsiSeriesData, visibleCandles]);

  useEffect(() => {
    setPendingPoint(null);
    setDrawing(false);
  }, [symbol, timeframe]);

  function subscribePaneRange(paneId: PaneId, chart: IChartApi): () => void {
    const handler = (range: LogicalRange | null) => {
      if (!range || !paneReadyRef.current[paneId] || syncingRangeRef.current) return;
      if (logicalRangesEqual(range, sharedRangeRef.current)) return;
      syncPaneRange(paneId, range);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
  }

  function syncPaneRange(sourcePaneId: PaneId, range: LogicalRange) {
    sharedRangeRef.current = range;
    syncingRangeRef.current = true;
    try {
      paneCharts().forEach(({ id, chart }) => {
        if (id !== sourcePaneId && paneReadyRef.current[id]) setVisibleLogicalRange(chart, range);
      });
    } finally {
      syncingRangeRef.current = false;
    }
  }

  function syncPaneToSharedRange(paneId: PaneId, chart: IChartApi) {
    const range = sharedRangeRef.current ?? chartRef.current?.timeScale().getVisibleLogicalRange();
    if (!range) return;
    setVisibleLogicalRange(chart, range);
    if (!sharedRangeRef.current) syncPaneRange(paneId, range);
  }

  function paneCharts(): Array<{ id: PaneId; chart: IChartApi | null }> {
    return [
      { id: "price", chart: chartRef.current },
      { id: "macd", chart: macdRefs.current.chart },
      { id: "rsi", chart: rsiRefs.current.chart },
    ];
  }
  function handleStackPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target;
    const paneElement = target instanceof Element ? target.closest<HTMLElement>("[data-pane-chart]") : null;
    const stack = paneStackRef.current;
    const line = crosshairLineRef.current;
    const label = crosshairLabelRef.current;
    if (!paneElement || !stack || !line || !label || !stack.contains(paneElement)) {
      clearSharedCrosshair();
      return;
    }

    const paneId = paneElement.dataset.paneChart as PaneId | undefined;
    const paneChart = paneId ? chartForPane(paneId) : null;
    const priceChart = chartRef.current;
    const priceContainer = containerRef.current;
    if (!paneChart || !priceChart || !priceContainer) {
      clearSharedCrosshair();
      return;
    }

    const paneRect = paneElement.getBoundingClientRect();
    const stackRect = stack.getBoundingClientRect();
    const plotWidth = paneChart.paneSize().width;
    const paneX = event.clientX - paneRect.left;
    if (paneX < 0 || paneX > plotWidth) {
      clearSharedCrosshair();
      return;
    }

    const left = paneRect.left - stackRect.left + paneX;
    line.style.display = "block";
    line.style.left = `${left}px`;

    const priceRect = priceContainer.getBoundingClientRect();
    const priceX = left - (priceRect.left - stackRect.left);
    const time = priceChart.timeScale().coordinateToTime(priceX);
    const timestamp = toTimestamp(time);
    if (timestamp === null) {
      label.style.display = "none";
      return;
    }
    const labelHalfWidth = 56;
    const plotLeft = paneRect.left - stackRect.left;
    const labelLeft = Math.max(plotLeft + labelHalfWidth, Math.min(left, plotLeft + plotWidth - labelHalfWidth));
    label.textContent = formatSecondsAsPhTime(timestamp);
    label.style.display = "block";
    label.style.left = `${labelLeft}px`;
  }

  function clearSharedCrosshair() {
    if (crosshairLineRef.current) crosshairLineRef.current.style.display = "none";
    if (crosshairLabelRef.current) crosshairLabelRef.current.style.display = "none";
  }

  function chartForPane(paneId: PaneId): IChartApi | null {
    if (paneId === "price") return chartRef.current;
    if (paneId === "macd") return macdRefs.current.chart;
    return rsiRefs.current.chart;
  }
  function openIndicatorPicker() {
    setModalMode("picker");
  }

  function openMacdSettings(indicator = macdIndicator ?? createDefaultMacdIndicator()) {
    setMacdDraft(indicator);
    setMacdTab("inputs");
    setModalMode("macd");
  }

  function upsertIndicator(nextIndicator: ChartIndicator) {
    onIndicatorsChange([nextIndicator, ...indicators.filter((indicator) => indicator.kind !== nextIndicator.kind)]);
  }

  function removeIndicator(kind: ChartIndicator["kind"]) {
    onIndicatorsChange(indicators.filter((indicator) => indicator.kind !== kind));
  }

  function addRsi() {
    upsertIndicator(createDefaultRsiIndicator());
    setModalMode(null);
  }

  function addBollinger() {
    upsertIndicator(createDefaultBollingerIndicator());
    setModalMode(null);
  }

  function saveMacdDraft() {
    upsertIndicator(macdDraft);
    setModalMode(null);
  }

  function captureDrawingPoint(event: ReactMouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement>) {
    if (!drawing) return;
    const now = Date.now();
    if (now - lastCaptureAtRef.current < 80) return;
    lastCaptureAtRef.current = now;
    event.preventDefault();
    event.stopPropagation();
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const priceFromScale = candleSeries.coordinateToPrice(y);
    const timeFromScale = toTimestamp(chart.timeScale().coordinateToTime(x));
    const price = priceFromScale ?? estimatePriceFromClick(y, rect.height, visibleCandles);
    const time = timeFromScale ?? estimateTimeFromClick(x, rect.width, visibleCandles);
    if (price === null || time === null) return;
    const point = { time, price };
    if (!pendingPoint) {
      setPendingPoint(point);
      return;
    }
    onTrendlinesChange([...trendlines, { id: `trendline-${Date.now()}`, symbol, timeframe, mode: trendlineMode, points: [pendingPoint, point] }]);
    setPendingPoint(null);
    setDrawing(false);
  }

  function clearTrendlines() {
    onTrendlinesChange([]);
    setPendingPoint(null);
    setDrawing(false);
  }

  return (
    <div className="chart-panel">
      <div className="chart-tools">
        <button className="tool-button" type="button" onClick={openIndicatorPicker} title="Add indicators">
          <BarChart3 size={16} />
          Indicators
        </button>
        <button
          className={drawing ? "tool-button active" : "tool-button"}
          type="button"
          onClick={() => {
            setDrawing((current) => !current);
            setPendingPoint(null);
          }}
          title="Draw trendline"
        >
          {drawing ? <MousePointer2 size={16} /> : <PencilLine size={16} />}
          Trendline
        </button>
        <div className="segmented compact" aria-label="Trendline mode">
          <button className={trendlineMode === "segment" ? "active" : ""} type="button" onClick={() => setTrendlineMode("segment")}>Segment</button>
          <button className={trendlineMode === "extended" ? "active" : ""} type="button" onClick={() => setTrendlineMode("extended")}>Extended</button>
        </div>
        <button className="tool-button" type="button" onClick={clearTrendlines} title="Clear trendlines">
          <Trash2 size={16} />
          Clear
        </button>
        <span className="chart-status">{drawing ? (pendingPoint ? "Click the second point" : "Click the first point") : `${trendlines.length} trendline${trendlines.length === 1 ? "" : "s"} saved`}</span>
        <span className="chart-meta">PH {latestCandle ? formatSecondsAsPhTime(latestCandle.time) : "--"} · Next {formatCountdown(countdownSeconds)}</span>
      </div>
      <div className="chart-pane-stack" ref={paneStackRef} onPointerMove={handleStackPointerMove} onPointerLeave={clearSharedCrosshair}>
        <div className="price-chart-wrap">
          <div className="chart-container" ref={containerRef} data-pane-chart="price">
            {drawing ? <div className="drawing-capture" onMouseDown={captureDrawingPoint} onPointerDown={captureDrawingPoint} /> : null}
            {loading ? <div className="chart-loading">Loading candles...</div> : null}
          </div>
        </div>
        {macdIndicator?.visible ? (
          <IndicatorPane title={`MACD ${macdIndicator.fastLength} ${macdIndicator.slowLength} ${macdIndicator.signalLength}`} onSettings={() => openMacdSettings(macdIndicator)} onRemove={() => removeIndicator("macd")}>
            <div className="indicator-chart-container" ref={macdContainerRef} data-pane-chart="macd" />
          </IndicatorPane>
        ) : null}
        {rsiIndicator?.visible ? (
          <IndicatorPane title={`RSI ${rsiIndicator.length}`} onRemove={() => removeIndicator("rsi")}>
            <div className="indicator-chart-container small" ref={rsiContainerRef} data-pane-chart="rsi" />
          </IndicatorPane>
        ) : null}
        <div className="shared-crosshair-line" ref={crosshairLineRef} aria-hidden="true" />
        <div className="shared-crosshair-time" ref={crosshairLabelRef} aria-hidden="true" />
      </div>
      {bollingerIndicator?.visible ? (
        <div className="overlay-indicator-chip">
          <span>BB {bollingerIndicator.length} {bollingerIndicator.stdDev}</span>
          <button type="button" onClick={() => removeIndicator("bollinger")} aria-label="Remove Bollinger Bands"><X size={13} /></button>
        </div>
      ) : null}
      {modalMode === "picker" ? (
        <IndicatorPicker hasMacd={Boolean(macdIndicator)} hasRsi={Boolean(rsiIndicator)} hasBollinger={Boolean(bollingerIndicator)} onClose={() => setModalMode(null)} onMacd={() => openMacdSettings()} onRsi={addRsi} onBollinger={addBollinger} />
      ) : null}
      {modalMode === "macd" ? (
        <MacdSettingsModal draft={macdDraft} activeTab={macdTab} onTabChange={setMacdTab} onChange={setMacdDraft} onCancel={() => setModalMode(null)} onSave={saveMacdDraft} onDefaults={() => setMacdDraft(createDefaultMacdIndicator())} />
      ) : null}
    </div>
  );
}

function IndicatorPane({ title, children, onSettings, onRemove }: { title: string; children: ReactNode; onSettings?: () => void; onRemove: () => void }) {
  return (
    <div className="indicator-pane">
      <div className="indicator-pane-header">
        <strong>{title}</strong>
        <div>
          {onSettings ? <button type="button" onClick={onSettings} aria-label={`Open ${title} settings`}><Settings2 size={14} /></button> : null}
          <button type="button" onClick={onRemove} aria-label={`Remove ${title}`}><X size={14} /></button>
        </div>
      </div>
      {children}
    </div>
  );
}

function IndicatorPicker({ hasMacd, hasRsi, hasBollinger, onClose, onMacd, onRsi, onBollinger }: { hasMacd: boolean; hasRsi: boolean; hasBollinger: boolean; onClose: () => void; onMacd: () => void; onRsi: () => void; onBollinger: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="indicator-picker-modal" role="dialog" aria-modal="true" aria-label="Indicators">
        <div className="modal-title-row"><h3>Indicators</h3><button type="button" onClick={onClose} aria-label="Close indicators"><X size={20} /></button></div>
        <button className="indicator-choice" type="button" onClick={onMacd}><BarChart3 size={18} /><span>Moving Average Convergence Divergence</span><small>{hasMacd ? "Edit MACD" : "Add MACD"}</small></button>
        <button className="indicator-choice" type="button" onClick={onRsi}><Plus size={18} /><span>Relative Strength Index</span><small>{hasRsi ? "Replace RSI" : "Add simple RSI"}</small></button>
        <button className="indicator-choice" type="button" onClick={onBollinger}><Plus size={18} /><span>Bollinger Bands</span><small>{hasBollinger ? "Replace BB" : "Add simple BB"}</small></button>
      </div>
    </div>
  );
}

function MacdSettingsModal({ draft, activeTab, onTabChange, onChange, onCancel, onSave, onDefaults }: { draft: MacdChartIndicator; activeTab: MacdSettingsTab; onTabChange: (tab: MacdSettingsTab) => void; onChange: (draft: MacdChartIndicator) => void; onCancel: () => void; onSave: () => void; onDefaults: () => void }) {
  function update(patch: Partial<MacdChartIndicator>) {
    onChange({ ...draft, ...patch });
  }
  function updateColor(key: keyof MacdChartIndicator["colors"], value: string) {
    onChange({ ...draft, colors: { ...draft.colors, [key]: value } });
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="tv-settings-modal" role="dialog" aria-modal="true" aria-label="MACD settings">
        <div className="modal-title-row"><h3>MACD</h3><button type="button" onClick={onCancel} aria-label="Close MACD settings"><X size={22} /></button></div>
        <div className="tv-tabs" role="tablist" aria-label="MACD settings tabs">
          {(["inputs", "style", "visibility"] as MacdSettingsTab[]).map((tab) => <button className={activeTab === tab ? "active" : ""} type="button" key={tab} onClick={() => onTabChange(tab)}>{titleCase(tab)}</button>)}
        </div>
        <div className="tv-settings-body">
          {activeTab === "inputs" ? (
            <>
              <SettingsRow label="Source"><select value={draft.source} onChange={() => update({ source: "close" })}><option value="close">Close</option></select></SettingsRow>
              <SettingsRow label="Fast length"><NumberSetting value={draft.fastLength} onChange={(fastLength) => update({ fastLength })} /></SettingsRow>
              <SettingsRow label="Slow length"><NumberSetting value={draft.slowLength} onChange={(slowLength) => update({ slowLength })} /></SettingsRow>
              <SettingsRow label="Signal length"><NumberSetting value={draft.signalLength} onChange={(signalLength) => update({ signalLength })} /></SettingsRow>
              <SettingsRow label="Oscillator MA type"><select value={draft.oscillatorMaType} onChange={() => update({ oscillatorMaType: "EMA" })}><option value="EMA">EMA</option></select></SettingsRow>
              <SettingsRow label="Signal MA type"><select value={draft.signalMaType} onChange={() => update({ signalMaType: "EMA" })}><option value="EMA">EMA</option></select></SettingsRow>
              <div className="settings-section-label">CALCULATION</div>
              <SettingsRow label="Timeframe"><select value={draft.timeframe} onChange={(event) => update({ timeframe: event.target.value as IndicatorTimeframe })}>{INDICATOR_TIMEFRAMES.map((item) => <option key={item} value={item}>{formatIndicatorTimeframe(item)}</option>)}</select></SettingsRow>
              <label className="tv-checkbox"><input type="checkbox" checked={draft.waitForTimeframeClose} onChange={(event) => update({ waitForTimeframeClose: event.target.checked })} />Wait for timeframe closes</label>
            </>
          ) : null}
          {activeTab === "style" ? (
            <>
              <StyleToggle checked={draft.histogramVisible} label="Histogram" onChange={(histogramVisible) => update({ histogramVisible })} />
              <ColorRow label="Color 0" value={draft.colors.histogramPositiveRising} onChange={(value) => updateColor("histogramPositiveRising", value)} />
              <ColorRow label="Color 1" value={draft.colors.histogramPositiveFalling} onChange={(value) => updateColor("histogramPositiveFalling", value)} />
              <ColorRow label="Color 2" value={draft.colors.histogramNegativeRising} onChange={(value) => updateColor("histogramNegativeRising", value)} />
              <ColorRow label="Color 3" value={draft.colors.histogramNegativeFalling} onChange={(value) => updateColor("histogramNegativeFalling", value)} />
              <StyleToggle checked={draft.macdVisible} label="MACD" onChange={(macdVisible) => update({ macdVisible })} />
              <ColorRow label="MACD line" value={draft.colors.macd} onChange={(value) => updateColor("macd", value)} />
              <StyleToggle checked={draft.signalVisible} label="Signal line" onChange={(signalVisible) => update({ signalVisible })} />
              <ColorRow label="Signal line" value={draft.colors.signal} onChange={(value) => updateColor("signal", value)} />
              <StyleToggle checked={draft.zeroVisible} label="Zero" onChange={(zeroVisible) => update({ zeroVisible })} />
              <ColorRow label="Zero line" value={draft.colors.zero} onChange={(value) => updateColor("zero", value)} />
              <div className="settings-section-label">OUTPUT VALUES</div>
              <SettingsRow label="Precision"><select value={draft.precision} onChange={() => update({ precision: "default" })}><option value="default">Default</option></select></SettingsRow>
            </>
          ) : null}
          {activeTab === "visibility" ? <label className="tv-checkbox"><input type="checkbox" checked={draft.visible} onChange={(event) => update({ visible: event.target.checked })} />Show MACD on chart</label> : null}
        </div>
        <div className="modal-footer"><button className="defaults-button" type="button" onClick={onDefaults}>Defaults</button><div><button className="cancel-button" type="button" onClick={onCancel}>Cancel</button><button className="ok-button" type="button" onClick={onSave}>Ok</button></div></div>
      </div>
    </div>
  );
}

function SettingsRow({ label, children }: { label: string; children: ReactNode }) {
  return <label className="settings-row"><span>{label}</span>{children}</label>;
}
function NumberSetting({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <input type="number" min="1" step="1" value={value} onChange={(event) => onChange(Math.max(1, Math.round(Number(event.target.value) || 1)))} />;
}
function StyleToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="tv-checkbox style-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="color-row"><span>{label}</span><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function addLine(chart: IChartApi, data: LineData[], color: string, lineWidth: 1 | 2 | 3 | 4 = 1): ISeriesApi<"Line"> {
  const series = chart.addLineSeries({ color, lineWidth, priceLineVisible: false, lastValueVisible: false });
  series.setData(data);
  return series;
}

function buildMacdSeriesData(indicator: MacdChartIndicator, indicatorCandles: Candle[], chartCandles: Candle[]): { histogram: HistogramData[]; macd: LineData[]; signal: LineData[]; zero: LineData[] } {
  const points = alignPointsToChartCandles(
    calculateMacd(indicatorCandles, indicator.fastLength, indicator.slowLength, indicator.signalLength),
    chartCandles,
  );
  const histogram = points.map((point, index) => toHistogramPoint(point, points[index - 1], indicator)).filter((point): point is HistogramData => point !== null);
  const macd = points.filter((point) => point.macd !== null).map((point) => ({ time: point.time as UTCTimestamp, value: point.macd! }));
  const signal = points.filter((point) => point.signal !== null).map((point) => ({ time: point.time as UTCTimestamp, value: point.signal! }));
  const zero = points.filter((point) => point.macd !== null || point.signal !== null).map((point) => ({ time: point.time as UTCTimestamp, value: 0 }));
  return { histogram, macd, signal, zero };
}

function toHistogramPoint(point: MacdPoint, previous: MacdPoint | undefined, indicator: MacdChartIndicator): HistogramData | null {
  if (point.histogram === null) return null;
  const previousValue = previous?.histogram ?? 0;
  const rising = point.histogram >= previousValue;
  const color = point.histogram >= 0
    ? rising ? indicator.colors.histogramPositiveRising : indicator.colors.histogramPositiveFalling
    : rising ? indicator.colors.histogramNegativeRising : indicator.colors.histogramNegativeFalling;
  return { time: point.time as UTCTimestamp, value: point.histogram, color };
}

function buildRsiSeriesData(indicator: RsiChartIndicator, indicatorCandles: Candle[], chartCandles: Candle[]): LineData[] {
  return alignPointsToChartCandles(calculateRsi(indicatorCandles, indicator.length), chartCandles)
    .filter((point) => point.value !== null)
    .map((point) => ({ time: point.time as UTCTimestamp, value: point.value! }));
}

function resolveIndicatorCandles(indicator: MacdChartIndicator | RsiChartIndicator, chartCandles: Candle[], chartTimeframe: Timeframe, indicatorCandles: Partial<Record<Timeframe, Candle[]>>, nowSeconds: number): Candle[] {
  if (indicator.timeframe === "Chart") return chartCandles;
  const candles = indicator.timeframe === chartTimeframe ? chartCandles : indicatorCandles[indicator.timeframe] ?? [];
  if (indicator.kind === "macd" && indicator.waitForTimeframeClose) return withoutOpenCandle(candles, indicator.timeframe, nowSeconds);
  return candles;
}

function withoutOpenCandle(candles: Candle[], timeframe: Timeframe, nowSeconds: number): Candle[] {
  const latest = candles.at(-1);
  if (!latest) return candles;
  return latest.time + timeframeToSeconds(timeframe) > nowSeconds ? candles.slice(0, -1) : candles;
}

function setVisibleLogicalRange(chart: IChartApi | null, range: LogicalRange) {
  if (!chart) return;
  const currentRange = chart.timeScale().getVisibleLogicalRange();
  if (!currentRange || logicalRangesEqual(currentRange, range)) return;
  chart.timeScale().setVisibleLogicalRange(range);
}

function logicalRangesEqual(first: LogicalRange | null, second: LogicalRange | null): boolean {
  if (!first || !second) return false;
  return Math.abs(first.from - second.from) < 0.001 && Math.abs(first.to - second.to) < 0.001;
}

function shiftLogicalRange(range: LogicalRange, bars: number): LogicalRange {
  return { from: range.from + bars, to: range.to + bars } as LogicalRange;
}
function createBaseChartOptions(height: number) {
  return {
    autoSize: true,
    height,
    layout: { background: { color: "#050608" }, textColor: "#aab3c2" },
    localization: { timeFormatter: (time: Time) => formatPhTime(time) },
    grid: { vertLines: { color: "#111722" }, horzLines: { color: "#111722" } },
    crosshair: { mode: 1, vertLine: { visible: false, labelVisible: false }, horzLine: { visible: true, labelVisible: true } },
    rightPriceScale: { borderColor: "#1b2431", minimumWidth: 84 },
    timeScale: { borderColor: "#1b2431", timeVisible: true, secondsVisible: false, rightOffset: RIGHT_OFFSET_BARS, barSpacing: 6, minBarSpacing: 1, fixLeftEdge: false, fixRightEdge: false, shiftVisibleRangeOnNewBar: true },
  };
}

function createIndicatorChartOptions(height: number) {
  return { ...createBaseChartOptions(height), layout: { background: { color: "#080b10" }, textColor: "#aab3c2" } };
}

function createDefaultMacdIndicator(): MacdChartIndicator {
  return {
    id: "macd",
    kind: "macd",
    source: "close",
    fastLength: 12,
    slowLength: 26,
    signalLength: 9,
    oscillatorMaType: "EMA",
    signalMaType: "EMA",
    timeframe: "Chart",
    waitForTimeframeClose: true,
    visible: true,
    histogramVisible: true,
    macdVisible: true,
    signalVisible: true,
    zeroVisible: true,
    colors: { histogramPositiveRising: "#26a69a", histogramPositiveFalling: "#b2dfdb", histogramNegativeRising: "#ffcdd2", histogramNegativeFalling: "#ff5252", macd: "#2962ff", signal: "#ff6d00", zero: "#787b86" },
    precision: "default",
  };
}
function createDefaultRsiIndicator(): RsiChartIndicator {
  return { id: "rsi", kind: "rsi", length: 14, timeframe: "Chart", visible: true, color: "#7e57c2" };
}
function createDefaultBollingerIndicator(): BollingerChartIndicator {
  return { id: "bollinger", kind: "bollinger", length: 50, stdDev: 0.2, timeframe: "Chart", visible: true, upperColor: "#6ee7f9", middleColor: "#facc15", lowerColor: "#6ee7f9" };
}

function buildTrendlineData(line: Trendline, candles: Candle[], timeframe: Timeframe): LineData[] {
  const [firstPoint, secondPoint] = normalizeTrendlinePoints(line.points, timeframe);
  if (line.mode !== "extended" || candles.length < 2) return toLineData(firstPoint, secondPoint);
  const startTime = candles[0].time;
  const endTime = candles[candles.length - 1].time;
  if (startTime === endTime) return toLineData(firstPoint, secondPoint);
  const slope = (secondPoint.price - firstPoint.price) / (secondPoint.time - firstPoint.time);
  return toLineData({ time: startTime, price: firstPoint.price + slope * (startTime - firstPoint.time) }, { time: endTime, price: firstPoint.price + slope * (endTime - firstPoint.time) });
}
function normalizeTrendlinePoints(points: [PendingPoint, PendingPoint], timeframe: Timeframe): [PendingPoint, PendingPoint] {
  const [firstPoint, secondPoint] = points;
  if (firstPoint.time === secondPoint.time) return [firstPoint, { ...secondPoint, time: secondPoint.time + timeframeToSeconds(timeframe) }];
  return firstPoint.time < secondPoint.time ? [firstPoint, secondPoint] : [secondPoint, firstPoint];
}
function toLineData(firstPoint: PendingPoint, secondPoint: PendingPoint): LineData[] {
  return [{ time: firstPoint.time as UTCTimestamp, value: firstPoint.price }, { time: secondPoint.time as UTCTimestamp, value: secondPoint.price }];
}
function estimateTimeFromClick(x: number, width: number, candles: Candle[]): number | null {
  if (!candles.length || width <= 0) return null;
  return candles[Math.round(Math.max(0, Math.min(1, x / width)) * (candles.length - 1))]?.time ?? null;
}
function estimatePriceFromClick(y: number, height: number, candles: Candle[]): number | null {
  if (!candles.length || height <= 0) return null;
  const high = Math.max(...candles.map((candle) => candle.high));
  const low = Math.min(...candles.map((candle) => candle.low));
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;
  return high - (high - low) * Math.max(0, Math.min(1, y / height));
}
function formatIndicatorTimeframe(timeframe: IndicatorTimeframe): string {
  if (timeframe === "Chart") return "Chart";
  if (timeframe === "1H") return "1 hour";
  if (timeframe === "4H") return "4 hours";
  if (timeframe === "1D") return "1 day";
  return timeframe;
}
function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
function formatPhTime(time: Time): string {
  const timestamp = toTimestamp(time);
  return timestamp === null ? "" : formatSecondsAsPhTime(timestamp);
}
function formatSecondsAsPhTime(seconds: number): string {
  return PH_TIME_FORMATTER.format(new Date(seconds * 1000));
}
function formatCountdown(seconds: number | null): string {
  if (seconds === null) return "--:--";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
function timeframeToSeconds(timeframe: Timeframe): number {
  switch (timeframe) {
    case "5m": return 5 * 60;
    case "15m": return 15 * 60;
    case "1H": return 60 * 60;
    case "4H": return 4 * 60 * 60;
    case "1D": return 24 * 60 * 60;
  }
}
function toTimestamp(time: Time | undefined | null): number | null {
  if (typeof time === "number") return time;
  if (typeof time === "string") {
    const parsed = Date.parse(time);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
  }
  if (isBusinessDay(time)) return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
  return null;
}
function isBusinessDay(time: Time | undefined | null): time is BusinessDay {
  return Boolean(time && typeof time === "object" && "year" in time && "month" in time && "day" in time);
}
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "select" || tagName === "textarea" || target.isContentEditable;
}


















