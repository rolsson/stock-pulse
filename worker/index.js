/**
 * StockPulse — Cloudflare Worker
 *
 * Fetches 120 days of daily closes from Yahoo Finance for each requested
 * ticker, computes EMA10 / EMA20 / EMA50, derives BUY/SELL/HOLD signal,
 * and returns JSON to the frontend.
 *
 * No API keys required — Yahoo Finance is free and accessible server-side.
 *
 * Endpoint:
 *   GET /api/quotes?tickers=AAPL,ADDT-B.ST,NOVO-B.CO
 *
 * Response:
 *   { "AAPL": { price, ema10, ema20, ema50, signal, currency }, ... }
 *
 * Deploy:
 *   wrangler deploy
 */

const ALLOWED_ORIGIN = '*'; // restrict to 'https://stock-pulse.pages.dev' after go-live

const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── EMA ────────────────────────────────────────────────────────────────────
function ema(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let val = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) val = closes[i] * k + val * (1 - k);
  return val;
}

function computeSignal(price, e10, e20, e50) {
  if (price == null || e10 == null || e20 == null || e50 == null) return 'HOLD';
  if (e10 > e20 && price > e50) return 'BUY';
  if (e10 < e20 && price < e50) return 'SELL';
  return 'HOLD';
}

// ── Yahoo Finance fetch ────────────────────────────────────────────────────
async function fetchQuote(ticker) {
  const base = encodeURIComponent(ticker);
  const params = '?interval=1d&range=120d';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; StockPulse/1.0)',
    'Accept': 'application/json',
  };

  let res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${base}${params}`, { headers });
  if (!res.ok) {
    res = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${base}${params}`, { headers });
  }
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  return res.json();
}

async function quoteForTicker(ticker) {
  try {
    const data = await fetchQuote(ticker);
    const result = data?.chart?.result?.[0];
    if (!result) return { ticker, error: 'No chart data returned' };

    const meta     = result.meta;
    const rawCloses = result.indicators?.quote?.[0]?.close ?? [];
    const closes   = rawCloses.filter(v => v != null);

    if (closes.length < 50) {
      return { ticker, error: `Only ${closes.length} trading days found (need 50+)` };
    }

    const price    = meta.regularMarketPrice ?? closes[closes.length - 1];
    const currency = meta.currency ?? 'USD';
    const e10 = ema(closes, 10);
    const e20 = ema(closes, 20);
    const e50 = ema(closes, 50);

    return {
      ticker,
      price:    +price.toFixed(4),
      ema10:    +e10.toFixed(4),
      ema20:    +e20.toFixed(4),
      ema50:    +e50.toFixed(4),
      signal:   computeSignal(price, e10, e20, e50),
      currency,
    };
  } catch (err) {
    return { ticker, error: err.message };
  }
}

// ── Router ─────────────────────────────────────────────────────────────────
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === '/') {
      return json({ status: 'ok', service: 'StockPulse Worker' });
    }

    // GET /api/quotes?tickers=AAPL,ADDT-B.ST,NOVO-B.CO
    if (url.pathname === '/api/quotes' && request.method === 'GET') {
      const tickerParam = url.searchParams.get('tickers') || '';
      const tickers = tickerParam.split(',').map(t => t.trim()).filter(Boolean);

      if (tickers.length === 0) return json({ error: 'Provide ?tickers=AAPL,MSFT' }, 400);
      if (tickers.length > 50) return json({ error: 'Max 50 tickers per request' }, 400);

      // All in parallel — no rate limit issue calling Yahoo from a Worker
      const results = await Promise.all(tickers.map(quoteForTicker));

      const out = {};
      for (const r of results) out[r.ticker] = r;

      return json(out);
    }

    return json({ error: 'Not found' }, 404);
  },
};
