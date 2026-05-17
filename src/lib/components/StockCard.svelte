<script lang="ts">
	import type { Stock, SignalDate } from '$lib/types';

	export let stock: Stock;
	export let isWatch: boolean = false;
	export let signalDates: Record<string, SignalDate>;

	function fmt(n: number | undefined | null, dec = 2): string {
		return n != null ? n.toFixed(dec) : '--';
	}

	function signalDaysCount(ticker: string): number {
		if (!signalDates[ticker]) return 0;
		return Math.floor((Date.now() - new Date(signalDates[ticker].date).getTime()) / 86400000);
	}

	$: sig = stock.signal || 'HOLD';
	$: days = signalDaysCount(stock.ticker);
	$: cur = stock.currency || stock.valuta || '';
	$: pnl =
		stock.price != null && stock.costBasis
			? ((stock.price - stock.costBasis) / stock.costBasis) * 100
			: null;
	$: priceStr = stock.price != null ? `${cur} ${fmt(stock.price)}` : '–';
	$: sharesStr =
		stock.shares > 0
			? stock.shares.toLocaleString('sv-SE', { maximumFractionDigits: 4 })
			: '–';
	$: valueStr =
		stock.price != null && stock.shares > 0
			? `${cur} ${(stock.price * stock.shares).toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
			: '–';
	$: badge = isWatch ? 'WATCH' : sig;
	$: label = stock.displayName && stock.displayName !== stock.kortnamn ? stock.displayName : '';
	$: sigColor =
		sig === 'BUY' ? 'var(--buy)' : sig === 'SELL' ? 'var(--sell)' : 'var(--hold)';
	$: pct = Math.min(100, days * 5);
	$: e10Color = stock.ema10 != null && stock.ema20 != null && stock.ema10 > stock.ema20 ? 'var(--buy)' : 'var(--sell)';
	$: e50Color = stock.price != null && stock.ema50 != null && stock.price > stock.ema50 ? 'var(--buy)' : 'var(--sell)';
</script>

<div class="stock-card {isWatch ? 'WATCH' : sig}">
	<div class="card-top">
		<div class="card-title">
			<div class="ticker">{stock.kortnamn}</div>
			{#if label}<div class="stock-name">{label}</div>{/if}
		</div>
		<span class="signal-badge {badge}">{badge}</span>
	</div>

	<div class="card-metrics">
		<div class="metric">
			<div class="m-val">{priceStr}</div>
			<div class="m-lbl">
				Price
				{#if pnl != null}
					<span class="price-change {pnl >= 0 ? 'pos' : 'neg'}">
						{pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
					</span>
				{/if}
			</div>
		</div>
		<div class="metric">
			<div class="m-val">{sharesStr}</div>
			<div class="m-lbl">Shares</div>
		</div>
		<div class="metric">
			<div class="m-val">{valueStr}</div>
			<div class="m-lbl">Value</div>
		</div>
	</div>

	{#if stock.ema10 != null}
		<div class="ema-row">
			<span class="ema-chip">
				<span class="ema-dot" style="background:{e10Color}"></span>EMA10 {fmt(stock.ema10)}
			</span>
			<span class="ema-chip">
				<span class="ema-dot" style="background:var(--muted)"></span>EMA20 {fmt(stock.ema20)}
			</span>
			<span class="ema-chip">
				<span class="ema-dot" style="background:{e50Color}"></span>EMA50 {fmt(stock.ema50)}
			</span>
		</div>
	{:else if stock.fetchError}
		<div class="ema-row">
			<span style="color:var(--hold)">⚠ {stock.fetchError}</span>
		</div>
	{/if}

	{#if signalDates[stock.ticker]}
		<div class="signal-days" style="color:{sigColor}">
			<span>⏱ {sig} active {days === 0 ? 'today' : `${days}d`}</span>
			<div class="signal-days-bar">
				<div class="signal-days-fill" style="width:{pct}%;background:{sigColor}"></div>
			</div>
		</div>
	{/if}
</div>
