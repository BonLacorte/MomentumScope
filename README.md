# MomentumScope

MomentumScope is a browser-based crypto momentum screener with a secondary charting workspace. It scans USDT perpetual contracts using market and multi-timeframe technical filters, then lets you inspect matching instruments on an interactive chart.

The current release uses public OKX market data. It does not connect to an exchange account, use API keys, place orders, or execute trades.

## Features

- Configurable price-change and volume filters
- Multi-timeframe MACD, RSI, and Bollinger Band conditions
- Automatic refresh and watchlist-only screening
- Candlestick and Heikin-Ashi charts
- Optional MACD, RSI, and Bollinger Band chart overlays
- Saved watchlists, indicator settings, and trendlines

## Run locally

Requirements: Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Validation

```bash
npm test
npm run build
```

## Data-source note

OKX availability can vary by network or region. Additional selectable data sources are planned so the screener is not dependent on one provider.
