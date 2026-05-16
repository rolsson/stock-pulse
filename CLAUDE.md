# StockPulse — Project Briefing for Claude Code

## What this is
A PWA (Progressive Web App) for tracking a Swedish Avanza stock portfolio using EMA-based BUY/SELL/HOLD signals. Deployed on Cloudflare.

## Live URLs
- **Frontend**: Cloudflare Pages (auto-deploys from GitHub on push to main)
- **Worker**: https://stock-pulse-proxy.robbanolsson.workers.dev

## Architecture
```
iPhone Safari (PWA)
      ↓
Cloudflare Pages → public/index.html
      ↓
Cloudflare Worker → worker/index.js
      ↓
Yahoo Finance API (free, no key needed)
```

## Repo structure
```
stock-pulse/
├── public/
│   ├── index.html      ← Single-page app (vanilla JS, no framework)
│   ├── config.js       ← Contains WORKER_URL (already set)
│   ├── manifest.json   ← PWA manifest
│   ├── sw.js           ← Service worker (offline cache)
│   ├── icon-192.png
│   └── icon-512.png
├── worker/
│   └── index.js        ← Cloudflare Worker
├── wrangler.toml       ← Worker name: stock-pulse-proxy
└── package.json
```

## How it works

### CSV import (Avanza format)
- Semicolon-delimited export from Avanza
- Only `Typ=STOCK` rows imported (funds/ETFs/certs skipped)
- Key columns: `Namn` (full name), `Kortnamn` (short ticker), `Volym` (shares), `GAV` (cost basis), `Valuta`, `Marknad`, `Typ`
- Nordic exchange suffixes auto-applied: XSTO→.ST, XCSE→.CO, XHEL→.HE, XOSL→.OL
- Spaces in Kortnamn replaced with dashes: "ADDT B" → "ADDT-B.ST"

### Signal logic (computed in Worker)
- Fetches 120 days of daily closes from Yahoo Finance
- **BUY**: EMA10 > EMA20 AND price > EMA50
- **SELL**: EMA10 < EMA20 AND price < EMA50
- **HOLD**: everything else
- SELL signal tracks how many days it has been active

### Worker API
- `GET /api/quotes?tickers=AAPL,ADDT-B.ST,NOVO-B.CO`
- Returns: `{ "AAPL": { price, ema10, ema20, ema50, signal, currency } }`
- All tickers fetched in parallel from Yahoo Finance
- Limit: 200 tickers per request

### Frontend state (localStorage)
- Keys: `piq_port`, `piq_watch`, `piq_sell_dates`, `piq_signals`, `piq_cache_ts`
- Cache TTL: 4 hours
- Each stock object has: `{ ticker, displayName, kortnamn, shares, costBasis, valuta, marknad }`
- `ticker` is the Yahoo Finance symbol (e.g. "ADDT-B.ST") — this is the primary key

### Watchlist
- Stocks removed from a newly uploaded CSV are auto-moved to watchlist
- Watchlist stocks are also analysed for signals (re-entry BUY detection)
- Manual add via text input (enter Yahoo ticker directly)
- Stock reappears in new CSV → removed from watchlist automatically

### Deployment
- **Frontend**: `git push` → Cloudflare Pages auto-deploys
- **Worker**: `wrangler deploy` (must be run manually after worker/index.js changes)

## Current issues / next steps
- [ ] Add native iOS file picker so user can load CSV directly from iPhone Files app
- [ ] Some Nordic tickers may need manual Yahoo symbol overrides if auto-suffix doesn't match
- [ ] Tighten CORS in worker/index.js: set ALLOWED_ORIGIN to actual Pages URL instead of '*'
- [ ] Consider adding a simple price chart per stock on tap

## Key decisions made
- No Anthropic API — real-time prices from Yahoo Finance via Worker (free)
- No npm build step — plain HTML/JS served directly from public/
- Cloudflare Worker handles CORS (Yahoo Finance blocks browser requests directly)
- localStorage for persistence (no backend database needed)
- PWA with service worker for offline support and home screen install