# StockPulse

EMA-based BUY/SELL/HOLD signal tracker for your Avanza stock portfolio. Runs as a PWA on iPhone.

## Architecture

```
iPhone Safari (PWA)
       ↓
Cloudflare Pages  ← hosts public/ (auto-deploys from GitHub)
       ↓
Cloudflare Worker ← fetches Yahoo Finance, computes EMAs
       ↓
Yahoo Finance     ← free, no API key required
```

---

## One-time Setup

### 1. Fork / clone this repo

```bash
git clone https://github.com/YOUR_USERNAME/stock-pulse.git
cd stock-pulse
```

### 2. Deploy the Cloudflare Worker

Install Wrangler (Cloudflare's CLI):

```bash
npm install -g wrangler
wrangler login
```

Deploy the Worker:

```bash
wrangler deploy
```

Note the URL printed — something like:
```
https://stock-pulse-proxy.YOUR-SUBDOMAIN.workers.dev
```

No API keys or secrets needed.

### 3. Update config.js

Open `public/config.js` and paste your Worker URL:

```js
const CONFIG = {
  WORKER_URL: 'https://stock-pulse-proxy.YOUR-SUBDOMAIN.workers.dev',
};
```

Commit and push:

```bash
git add public/config.js
git commit -m "Set Worker URL"
git push
```

### 4. Connect Cloudflare Pages to GitHub

1. Go to **Cloudflare Dashboard → Workers & Pages → Create → Pages**
2. Connect to GitHub → select this repo
3. Build settings:
   - **Framework preset**: None
   - **Build command**: *(leave empty)*
   - **Build output directory**: `public`
4. Click **Save and Deploy**

Your app is live at `https://stock-pulse.pages.dev` (or your custom domain).

### 5. Add to iPhone home screen

1. Open your Pages URL in **Safari on iPhone**
2. Tap the **Share** button
3. Tap **Add to Home Screen**
4. Done — StockPulse is on your home screen as a full-screen PWA

---

## Updating the app

Any push to `main` triggers an automatic Cloudflare Pages deploy (~60 seconds):

```bash
git add .
git commit -m "Your change"
git push
```

---

## How it works

- Upload your Avanza CSV export (semicolon-delimited, `Typ=STOCK` rows only)
- The app calls the Worker with all your tickers in one request
- The Worker fetches 120 days of daily prices from Yahoo Finance in parallel
- EMA10, EMA20, EMA50 are computed server-side
- **BUY**: EMA10 > EMA20 and price > EMA50
- **SELL**: EMA10 < EMA20 and price < EMA50
- **HOLD**: everything else
- SELL signal shows how many days it has been active
- Stocks removed from a new CSV upload are auto-moved to Watchlist
- Watchlist shows re-entry BUY signals so you know when to get back in
- Results cached locally for 4 hours — refresh is instant on revisit

---

## Ticker mapping

Nordic stocks are automatically mapped to Yahoo Finance tickers:

| Avanza exchange | Yahoo suffix | Example |
|----------------|-------------|---------|
| XSTO | .ST | ADDT-B.ST |
| XCSE | .CO | NOVO-B.CO |
| XHEL | .HE | NOKIA.HE |
| XOSL | .OL | EQNR.OL |
| XNAS / XNYS | *(none)* | AAPL, TSLA |

Spaces in Avanza short names are replaced with dashes (e.g. `ADDT B` → `ADDT-B.ST`).

---

## Project structure

```
stock-pulse/
├── public/              ← Cloudflare Pages serves this folder
│   ├── index.html       ← Single-page app
│   ├── config.js        ← Set WORKER_URL here after Worker deploy
│   ├── manifest.json    ← PWA manifest
│   ├── sw.js            ← Service worker (offline support)
│   ├── icon-192.png     ← PWA icon
│   └── icon-512.png     ← PWA icon (large)
├── worker/
│   └── index.js         ← Cloudflare Worker (Yahoo Finance proxy + EMA)
├── wrangler.toml        ← Worker config
├── package.json
└── README.md
```
