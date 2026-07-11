import { ChevronDown, Plus, Settings, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { BollingerFilter, MacdCondition, MacdFilter, MacdPlot, MacdTarget, MarketDataSource, RangeCondition, RsiFilter, ScreenerFilter, ScreenerSettings, Timeframe, VolumeUsdFilter } from "../types";

type Props = {
  settings: ScreenerSettings;
  watchlistOnly: boolean;
  watchlistCount: number;
  source: MarketDataSource;
  onChange: (settings: ScreenerSettings) => void;
  onSourceChange: (source: MarketDataSource) => void;
  onWatchlistOnlyChange: (value: boolean) => void;
};

type BuilderCategory = "marketData" | "technical";
type MarketBuilderType = "priceChangePct" | "volumeUsd";
type TechnicalBuilderType = "macd" | "rsi" | "bollinger";
type VolumePreset = NonNullable<VolumeUsdFilter["preset"]>;

const TIMEFRAMES: Timeframe[] = ["5m", "15m", "1H", "4H", "1D"];
const RANGE_CONDITIONS: RangeCondition[] = ["above", "aboveOrEqual", "below", "belowOrEqual", "between", "outside", "equal"];
const MACD_CONDITIONS: MacdCondition[] = [...RANGE_CONDITIONS, "crosses", "crossesUp", "crossesDown"];

const VOLUME_PRESETS: Array<{ value: VolumePreset; label: string; filter: Omit<VolumeUsdFilter, "id" | "category" | "type" | "preset"> }> = [
  { value: "1bAbove", label: "1B USD and above", filter: { condition: "aboveOrEqual", value: 1_000_000_000 } },
  { value: "100mAbove", label: "100M USD and above", filter: { condition: "aboveOrEqual", value: 100_000_000 } },
  { value: "10mAbove", label: "10M USD and above", filter: { condition: "aboveOrEqual", value: 10_000_000 } },
  { value: "1mAbove", label: "1M USD and above", filter: { condition: "aboveOrEqual", value: 1_000_000 } },
  { value: "1mBelow", label: "1M USD and below", filter: { condition: "belowOrEqual", value: 1_000_000 } },
  { value: "manual", label: "Manual setup", filter: { condition: "between", from: 0, to: 100_000_000 } },
];

export default function ScreenerToolbar({ settings, watchlistOnly, watchlistCount, source, onChange, onSourceChange, onWatchlistOnlyChange }: Props) {
  const [showBuilder, setShowBuilder] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [builderCategory, setBuilderCategory] = useState<BuilderCategory>("marketData");
  const [marketType, setMarketType] = useState<MarketBuilderType>("priceChangePct");
  const [marketCondition, setMarketCondition] = useState<RangeCondition>("above");
  const [marketValue, setMarketValue] = useState(3);
  const [marketFrom, setMarketFrom] = useState(3);
  const [marketTo, setMarketTo] = useState(100);
  const [volumePreset, setVolumePreset] = useState<VolumePreset>("100mAbove");
  const [volumeFrom, setVolumeFrom] = useState(3_000_000);
  const [volumeTo, setVolumeTo] = useState(100_000_000);
  const [technicalType, setTechnicalType] = useState<TechnicalBuilderType>("macd");
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [macdPlot, setMacdPlot] = useState<MacdPlot>("level");
  const [macdCondition, setMacdCondition] = useState<MacdCondition>("above");
  const [macdTarget, setMacdTarget] = useState<MacdTarget>("value");
  const [macdValue, setMacdValue] = useState(0);
  const [macdFrom, setMacdFrom] = useState(0);
  const [macdTo, setMacdTo] = useState(0);
  const [rsiValue, setRsiValue] = useState(70);
  const [bollingerMode, setBollingerMode] = useState<BollingerFilter["mode"]>("aboveUpper");

  const activeChips = useMemo(() => settings.filters.map((filter) => ({ id: filter.id, label: formatFilterChip(filter) })), [settings]);

  function removeFilter(id: string) {
    onChange({ ...settings, filters: settings.filters.filter((filter) => filter.id !== id) });
  }

  function addFilter() {
    const nextFilter = builderCategory === "marketData" ? buildMarketFilter() : buildTechnicalFilter();
    onChange({ ...settings, filters: [...settings.filters, nextFilter] });
  }

  function buildMarketFilter(): ScreenerFilter {
    if (marketType === "priceChangePct") {
      return {
        id: `change-${Date.now()}`,
        category: "marketData",
        type: "priceChangePct",
        condition: marketCondition,
        value: needsSingleValue(marketCondition) ? marketValue : undefined,
        from: needsRange(marketCondition) ? marketFrom : undefined,
        to: needsRange(marketCondition) ? marketTo : undefined,
      };
    }

    const preset = VOLUME_PRESETS.find((item) => item.value === volumePreset) ?? VOLUME_PRESETS[1];
    return {
      id: `volume-${Date.now()}`,
      category: "marketData",
      type: "volumeUsd",
      preset: volumePreset,
      ...preset.filter,
      from: volumePreset === "manual" ? volumeFrom : preset.filter.from,
      to: volumePreset === "manual" ? volumeTo : preset.filter.to,
    };
  }

  function buildTechnicalFilter(): ScreenerFilter {
    if (technicalType === "macd") {
      return {
        id: `macd-${timeframe}-${Date.now()}`,
        category: "technical",
        type: "macd",
        timeframe,
        plot: macdPlot,
        condition: macdCondition,
        target: normalizeMacdTarget(macdPlot, macdTarget),
        value: needsSingleValue(macdCondition) && normalizeMacdTarget(macdPlot, macdTarget) === "value" ? macdValue : undefined,
        from: needsRange(macdCondition) ? macdFrom : undefined,
        to: needsRange(macdCondition) ? macdTo : undefined,
      };
    }

    if (technicalType === "rsi") {
      const nextFilter: RsiFilter = {
        id: `rsi-${timeframe}-${Date.now()}`,
        category: "technical",
        type: "rsi",
        timeframe,
        mode: "level",
        operator: ">",
        value: rsiValue,
        length: settings.rsiLength,
      };
      return nextFilter;
    }

    const nextFilter: BollingerFilter = {
      id: `bb-${timeframe}-${Date.now()}`,
      category: "technical",
      type: "bollinger",
      timeframe,
      mode: bollingerMode,
      length: settings.bollingerLength,
      stdDev: settings.bollingerStdDev,
    };
    return nextFilter;
  }

  const normalizedMacdTarget = normalizeMacdTarget(macdPlot, macdTarget);

  return (
    <section className="screener-toolbar" aria-label="Screener filters">
      <div className="screener-title-row">
        <div>
          <span className="eyebrow">Crypto Momentum Screener</span>
          <h1>MomentumScope</h1>
        </div>
      </div>

      <div className="primary-filter-row">
        <label className="dropdown-pill">
          <span>Watchlist</span>
          <select value={watchlistOnly ? "watchlist" : "all"} onChange={(event) => onWatchlistOnlyChange(event.target.value === "watchlist")}>
            <option value="all">All pairs</option>
            <option value="watchlist">Watchlist ({watchlistCount})</option>
          </select>
          <ChevronDown size={15} />
        </label>
        <label className="dropdown-pill">
          <span>Exchange</span>
          <select value={source} onChange={(event) => onSourceChange(event.target.value as MarketDataSource)}>
            <option value="gate">Gate.io</option>
            <option value="okx">OKX</option>
          </select>
          <ChevronDown size={15} />
        </label>
        <FilterButton label="Symbol type" value="Perpetual" />
        <FilterButton label="Base currency" value="All" />
        <FilterButton label="Quote currency" value="USDT" />
        <button className="square-filter-button" type="button" onClick={() => setShowBuilder((current) => !current)} title="Add filter">
          <Plus size={21} />
        </button>
        <button className="square-filter-button" type="button" onClick={() => setShowSettings((current) => !current)} title="Filter settings">
          <Settings size={18} />
        </button>
      </div>

      <div className="active-filter-row">
        {activeChips.map((chip) => (
          <button className="filter-chip light" key={chip.id} type="button" onClick={() => removeFilter(chip.id)}>
            {chip.label}
            <X size={15} />
          </button>
        ))}
      </div>

      {showSettings ? <SettingsPanel settings={settings} onChange={onChange} /> : null}

      {showBuilder ? (
        <div className="indicator-builder filter-builder-panel">
          <SlidersHorizontal size={17} />
          <select value={builderCategory} onChange={(event) => setBuilderCategory(event.target.value as BuilderCategory)}>
            <option value="marketData">Market data</option>
            <option value="technical">Technicals</option>
          </select>

          {builderCategory === "marketData" ? (
            <>
              <select value={marketType} onChange={(event) => setMarketType(event.target.value as MarketBuilderType)}>
                <option value="priceChangePct">Price change %</option>
                <option value="volumeUsd">Volume in USD</option>
              </select>
              {marketType === "priceChangePct" ? (
                <>
                  <select value={marketCondition} onChange={(event) => setMarketCondition(event.target.value as RangeCondition)}>
                    {RANGE_CONDITIONS.map((condition) => <option key={condition} value={condition}>{formatCondition(condition)}</option>)}
                  </select>
                  {needsRange(marketCondition) ? <RangeInputs from={marketFrom} to={marketTo} onFrom={setMarketFrom} onTo={setMarketTo} /> : <NumberInput value={marketValue} onChange={setMarketValue} suffix="%" />}
                </>
              ) : (
                <>
                  <select value={volumePreset} onChange={(event) => setVolumePreset(event.target.value as VolumePreset)}>
                    {VOLUME_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
                  </select>
                  {volumePreset === "manual" ? <RangeInputs from={volumeFrom} to={volumeTo} onFrom={setVolumeFrom} onTo={setVolumeTo} /> : null}
                </>
              )}
            </>
          ) : (
            <>
              <select value={technicalType} onChange={(event) => setTechnicalType(event.target.value as TechnicalBuilderType)}>
                <option value="macd">Moving average convergence divergence</option>
                <option value="rsi">Relative strength index</option>
                <option value="bollinger">Bollinger band</option>
              </select>
              <select value={timeframe} onChange={(event) => setTimeframe(event.target.value as Timeframe)}>
                {TIMEFRAMES.map((item) => <option key={item} value={item}>{formatTimeframe(item)}</option>)}
              </select>
              {technicalType === "macd" ? (
                <>
                  <select value={macdPlot} onChange={(event) => setMacdPlot(event.target.value as MacdPlot)}>
                    <option value="level">Level</option>
                    <option value="signal">Signal</option>
                  </select>
                  <select value={macdCondition} onChange={(event) => setMacdCondition(event.target.value as MacdCondition)}>
                    {MACD_CONDITIONS.map((condition) => <option key={condition} value={condition}>{formatCondition(condition)}</option>)}
                  </select>
                  {needsRange(macdCondition) ? (
                    <RangeInputs from={macdFrom} to={macdTo} onFrom={setMacdFrom} onTo={setMacdTo} />
                  ) : (
                    <>
                      <select value={normalizedMacdTarget} onChange={(event) => setMacdTarget(event.target.value as MacdTarget)}>
                        <option value="value">Value</option>
                        <option value={macdPlot === "level" ? "signal" : "level"}>{macdPlot === "level" ? "Signal" : "Level"}</option>
                      </select>
                      {normalizedMacdTarget === "value" ? <NumberInput value={macdValue} onChange={setMacdValue} /> : null}
                    </>
                  )}
                </>
              ) : null}
              {technicalType === "rsi" ? <NumberInput value={rsiValue} onChange={setRsiValue} /> : null}
              {technicalType === "bollinger" ? (
                <select value={bollingerMode} onChange={(event) => setBollingerMode(event.target.value as BollingerFilter["mode"])}>
                  <option value="aboveUpper">Close above upper</option>
                  <option value="belowLower">Close below lower</option>
                  <option value="inside">Close inside bands</option>
                  <option value="crossUpper">Cross upper band</option>
                  <option value="crossLower">Cross lower band</option>
                </select>
              ) : null}
            </>
          )}
          <button className="primary-button" type="button" onClick={addFilter}>
            <Plus size={16} />
            Add Filter
          </button>
        </div>
      ) : null}
    </section>
  );
}

function SettingsPanel({ settings, onChange }: Pick<Props, "settings" | "onChange">) {
  return (
    <div className="settings-grid compact-settings">
      <label><span>RSI Length</span><input type="number" value={settings.rsiLength} onChange={(event) => onChange({ ...settings, rsiLength: Number(event.target.value) })} /></label>
      <label><span>BB Length</span><input type="number" value={settings.bollingerLength} onChange={(event) => onChange({ ...settings, bollingerLength: Number(event.target.value) })} /></label>
      <label><span>BB StdDev</span><input step="0.1" type="number" value={settings.bollingerStdDev} onChange={(event) => onChange({ ...settings, bollingerStdDev: Number(event.target.value) })} /></label>
      <label><span>Refresh Sec</span><input min="15" type="number" value={settings.refreshSeconds} onChange={(event) => onChange({ ...settings, refreshSeconds: Number(event.target.value) })} /></label>
    </div>
  );
}

function FilterButton({ label, value }: { label: string; value: string }) {
  return <button className="dropdown-pill" type="button"><span>{label}</span><strong>{value}</strong><ChevronDown size={15} /></button>;
}

function RangeInputs({ from, to, onFrom, onTo }: { from: number; to: number; onFrom: (value: number) => void; onTo: (value: number) => void }) {
  return <><input aria-label="From" type="number" value={from} onChange={(event) => onFrom(Number(event.target.value))} /><input aria-label="To" type="number" value={to} onChange={(event) => onTo(Number(event.target.value))} /></>;
}

function NumberInput({ value, onChange, suffix }: { value: number; onChange: (value: number) => void; suffix?: string }) {
  return <label className="inline-input"><input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />{suffix ? <span>{suffix}</span> : null}</label>;
}

function formatFilterChip(filter: ScreenerFilter): string {
  if (filter.category === "marketData") {
    if (filter.type === "priceChangePct") return `Change 24h ${formatCondition(filter.condition)} ${formatFilterValue(filter, "%")}`;
    return `Volume 24h ${formatVolumeFilter(filter)}`;
  }
  if (filter.type === "macd") return `MACD (12,26,9) ${formatTimeframe(filter.timeframe)} ${formatPlot(filter.plot)} ${formatCondition(filter.condition)} ${formatMacdTarget(filter)}`;
  if (filter.type === "rsi") return `RSI (${filter.length}) ${formatTimeframe(filter.timeframe)} Level ${filter.operator} ${filter.value}`;
  return `BB (${filter.length}, ${filter.stdDev}) ${formatTimeframe(filter.timeframe)} ${formatBollingerMode(filter.mode)}`;
}

function formatFilterValue(filter: { value?: number; from?: number; to?: number; condition: RangeCondition }, suffix = ""): string {
  if (needsRange(filter.condition)) return `${filter.from ?? 0}${suffix} to ${filter.to ?? 0}${suffix}`;
  return `${filter.value ?? 0}${suffix}`;
}

function formatVolumeFilter(filter: VolumeUsdFilter): string {
  const preset = VOLUME_PRESETS.find((item) => item.value === filter.preset);
  if (preset && filter.preset !== "manual") return preset.label;
  return `${formatUsd(filter.from ?? 0)} to ${formatUsd(filter.to ?? 0)}`;
}

function formatMacdTarget(filter: MacdFilter): string {
  if (needsRange(filter.condition)) return `${filter.from ?? 0} to ${filter.to ?? 0}`;
  if (filter.target === "value") return `${filter.value ?? 0}`;
  return formatPlot(filter.target);
}

function formatCondition(condition: RangeCondition | MacdCondition): string {
  const labels: Record<string, string> = {
    above: "above",
    aboveOrEqual: "above or equal",
    below: "below",
    belowOrEqual: "below or equal",
    between: "between",
    outside: "outside",
    equal: "equal",
    crosses: "crosses",
    crossesUp: "crosses up",
    crossesDown: "crosses down",
  };
  return labels[condition];
}

function formatPlot(plot: MacdPlot | MacdTarget): string {
  return plot === "level" ? "Level" : plot === "signal" ? "Signal" : "Value";
}

function formatTimeframe(timeframe: Timeframe): string {
  if (timeframe === "1D") return "1D";
  return timeframe === "15m" || timeframe === "5m" ? timeframe : timeframe.toLowerCase();
}

function formatBollingerMode(mode: BollingerFilter["mode"]): string {
  const labels: Record<BollingerFilter["mode"], string> = { aboveUpper: "Close > Upper", belowLower: "Close < Lower", inside: "Inside Bands", crossUpper: "Cross Upper", crossLower: "Cross Lower" };
  return labels[mode];
}

function normalizeMacdTarget(plot: MacdPlot, target: MacdTarget): MacdTarget {
  if (target === "value") return target;
  return plot === "level" ? "signal" : "level";
}

function needsRange(condition: RangeCondition | MacdCondition): boolean {
  return condition === "between" || condition === "outside";
}

function needsSingleValue(condition: RangeCondition | MacdCondition): boolean {
  return !needsRange(condition);
}

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `${value / 1_000_000_000} B USD`;
  if (value >= 1_000_000) return `${value / 1_000_000} M USD`;
  if (value >= 1_000) return `${value / 1_000} K USD`;
  return `${value} USD`;
}
