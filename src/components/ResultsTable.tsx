import type { ScreenerResult } from "../types";

type Props = {
  results: ScreenerResult[];
  selectedSymbol: string;
  formatSymbol: (symbol: string) => string;
  onSelect: (symbol: string) => void;
};

export default function ResultsTable({ results, selectedSymbol, formatSymbol, onSelect }: Props) {
  return (
    <>
      <div className="mobile-results-list">
        {results.length === 0 ? (
          <div className="empty-cell mobile-empty">
            No matches yet. Adjust filters or wait for the next refresh.
          </div>
        ) : (
          results.map((result) => (
            <button
              className={result.instId === selectedSymbol ? "result-card selected" : "result-card"}
              key={result.instId}
              type="button"
              onClick={() => onSelect(result.instId)}
            >
              <div className="result-card-topline">
                <span>
                  <strong>{formatSymbol(result.instId)}</strong>
                  <small>USDT Perp</small>
                </span>
                <span className={result.change24hPct >= 0 ? "positive" : "negative"}>
                  {result.change24hPct.toFixed(2)}%
                </span>
              </div>
              <div className="result-card-metrics">
                <Metric label="Last" value={formatNumber(result.last)} />
                <Metric label="24h Vol" value={formatUsd(result.volume24hUsd)} />
                <Metric label="RSI 15m" value={formatIndicator(result.rsi15m)} />
                <Metric label="BB 15m" value={result.bbPosition} />
              </div>
              <div className="result-card-macd">
                MACD 5m {formatIndicator(result.macd5m)} · 15m {formatIndicator(result.macd15m)} · 1h {formatIndicator(result.macd1H)}
              </div>
            </button>
          ))
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Last</th>
              <th>24h Change</th>
              <th>24h Volume</th>
              <th>MACD 5m</th>
              <th>MACD 15m</th>
              <th>MACD 1h</th>
              <th>MACD 4h</th>
              <th>MACD 1D</th>
              <th>RSI 15m</th>
              <th>BB 15m</th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td colSpan={11} className="empty-cell">
                  No matches yet. Adjust filters or wait for the next refresh.
                </td>
              </tr>
            ) : (
              results.map((result) => (
                <tr
                  className={result.instId === selectedSymbol ? "selected" : ""}
                  key={result.instId}
                  onClick={() => onSelect(result.instId)}
                >
                  <td>
                    <strong>{formatSymbol(result.instId)}</strong>
                    <small>USDT Perp</small>
                  </td>
                  <td>{formatNumber(result.last)}</td>
                  <td className={result.change24hPct >= 0 ? "positive" : "negative"}>{result.change24hPct.toFixed(2)}%</td>
                  <td>{formatUsd(result.volume24hUsd)}</td>
                  <td>{formatIndicator(result.macd5m)}</td>
                  <td>{formatIndicator(result.macd15m)}</td>
                  <td>{formatIndicator(result.macd1H)}</td>
                  <td>{formatIndicator(result.macd4H)}</td>
                  <td>{formatIndicator(result.macd1D)}</td>
                  <td>{formatIndicator(result.rsi15m)}</td>
                  <td>{result.bbPosition}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function formatNumber(value: number): string {
  if (value >= 100) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
}

function formatIndicator(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(4);
}
