import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

// ── EMA ───────────────────────────────────────────────────────────────────────

function ema(closes: number[], period: number): number | null {
	if (closes.length < period) return null;
	const k = 2 / (period + 1);
	let val = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
	for (let i = period; i < closes.length; i++) val = closes[i] * k + val * (1 - k);
	return val;
}

function emaArray(closes: number[], period: number): (number | null)[] {
	if (closes.length < period) return closes.map(() => null);
	const k = 2 / (period + 1);
	let val = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
	const out: (number | null)[] = closes.map(() => null);
	out[period - 1] = val;
	for (let i = period; i < closes.length; i++) {
		val = closes[i] * k + val * (1 - k);
		out[i] = val;
	}
	return out;
}

function computeSignal(
	price: number | null,
	e10: number | null,
	e20: number | null,
	e50: number | null
): string {
	if (price == null || e10 == null || e20 == null || e50 == null) return 'HOLD';
	if (e10 > e20 && price > e50) return 'BUY';
	if (e10 < e20 && price < e50) return 'SELL';
	return 'HOLD';
}

// ── Yahoo Finance ─────────────────────────────────────────────────────────────

async function fetchYahoo(ticker: string) {
	const base = encodeURIComponent(ticker);
	const params = '?interval=1d&range=120d';
	const headers = {
		'User-Agent': 'Mozilla/5.0 (compatible; StockPulse/1.0)',
		Accept: 'application/json'
	};

	let res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${base}${params}`, {
		headers
	});
	if (!res.ok) {
		res = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${base}${params}`, {
			headers
		});
	}
	if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
	return res.json();
}

async function quoteForTicker(ticker: string) {
	try {
		const data = await fetchYahoo(ticker);
		const result = data?.chart?.result?.[0];
		if (!result) return { ticker, error: 'No chart data returned' };

		const meta = result.meta;
		const rawCloses: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
		const rawTs: (number | null)[] = result.timestamp ?? [];

		const days = rawCloses
			.map((c, i) => ({ close: c, ts: rawTs[i] ?? null }))
			.filter((d): d is { close: number; ts: number | null } => d.close != null);

		if (days.length < 50) {
			return { ticker, error: `Only ${days.length} trading days found (need 50+)` };
		}

		const closes = days.map((d) => d.close);
		const price: number = meta.regularMarketPrice ?? closes[closes.length - 1];

		// When the market is open, price differs from the last historical close (yesterday),
		// so previousClose = closes[-1]. When closed (after hours, weekends), price equals
		// the last close bar, so we step back one more to get the prior session.
		const lastClose = closes[closes.length - 1];
		const priceMatchesLastClose = lastClose > 0 && Math.abs(price - lastClose) / lastClose < 0.0001;
		const previousClose: number = meta.regularMarketPreviousClose
			?? (priceMatchesLastClose ? closes[closes.length - 2] : lastClose)
			?? price;
		const currency: string = meta.currency ?? 'USD';
		const e10 = ema(closes, 10);
		const e20 = ema(closes, 20);
		const e50 = ema(closes, 50);
		const signal = computeSignal(price, e10, e20, e50);

		// Backdate signal: walk back to find when the current run started
		const e10s = emaArray(closes, 10);
		const e20s = emaArray(closes, 20);
		const e50s = emaArray(closes, 50);
		let runStart = days.length - 1;
		for (let i = days.length - 2; i >= 0; i--) {
			if (computeSignal(closes[i], e10s[i], e20s[i], e50s[i]) !== signal) break;
			runStart = i;
		}
		const runTs = days[runStart].ts;
		const signalSince = runTs
			? new Date(runTs * 1000).toISOString().split('T')[0]
			: null;

		return {
			ticker,
			price: +price.toFixed(4),
			previousClose: +previousClose.toFixed(4),
			ema10: +e10!.toFixed(4),
			ema20: +e20!.toFixed(4),
			ema50: +e50!.toFixed(4),
			signal,
			currency,
			signalSince
		};
	} catch (err: unknown) {
		return { ticker, error: err instanceof Error ? err.message : String(err) };
	}
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url }) => {
	const tickerParam = url.searchParams.get('tickers') || '';
	const tickers = tickerParam
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);

	if (tickers.length === 0) return json({ error: 'Provide ?tickers=AAPL,MSFT' }, { status: 400 });
	if (tickers.length > 200) return json({ error: 'Max 200 tickers per request' }, { status: 400 });

	const results = await Promise.all(tickers.map(quoteForTicker));

	const out: Record<string, unknown> = {};
	for (const r of results) out[r.ticker] = r;

	return json(out);
};
