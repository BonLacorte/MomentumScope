# MomentumScope

MomentumScope is a browser-based crypto momentum screener with a secondary charting workspace. It scans USDT perpetual contracts using market and multi-timeframe technical filters, then lets you inspect matching instruments on an interactive chart.

The current release supports public Gate.io and OKX USDT-perpetual market data, with Gate.io selected by default. It does not connect to an exchange account, use API keys, place orders, or execute trades.

## Features

- Configurable price-change and volume filters
- Multi-timeframe MACD, RSI, and Bollinger Band conditions
- Automatic refresh and watchlist-only screening
- Mobile-friendly screener cards with latest-scan snapshot storage
- Separate Gate.io and OKX watchlists
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

## Deploy to Cloudflare Pages

Use these Cloudflare Pages build settings:

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`

The `functions/` directory provides Cloudflare Pages Functions for the production `/gate` and `/okx` market-data proxy routes. Local development still uses the Vite proxy configured in `vite.config.ts`.

## Data sources

Use the Exchange selector to switch between Gate.io and OKX. Filters and chart-indicator settings are shared, while each provider keeps its own native-symbol watchlist. Availability can vary by network or region.
