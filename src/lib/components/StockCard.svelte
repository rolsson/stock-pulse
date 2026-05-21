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

	function flag(ticker: string): string {
		if (ticker.endsWith('.ST')) return '🇸🇪';
		if (ticker.endsWith('.CO')) return '🇩🇰';
		if (ticker.endsWith('.HE')) return '🇫🇮';
		if (ticker.endsWith('.OL')) return '🇳🇴';
		if (ticker.endsWith('.L'))  return '🇬🇧';
		if (ticker.endsWith('.PA')) return '🇫🇷';
		if (ticker.endsWith('.DE') || ticker.endsWith('.F')) return '🇩🇪';
		if (ticker.endsWith('.AS')) return '🇳🇱';
		return '🇺🇸';
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
	$: sigColor = sig === 'BUY' ? 'var(--buy)' : sig === 'SELL' ? 'var(--sell)' : 'var(--hold)';
	$: e10gtE20 = stock.ema10 != null && stock.ema20 != null && stock.ema10 > stock.ema20;
	$: pgtE50 = stock.price != null && stock.ema50 != null && stock.price > stock.ema50;
</script>

<div class="stock-card {isWatch ? 'WATCH' : sig}">
	<!-- Line 1: flag + name (ticker) | badge -->
	<div class="card-line1">
		<div class="card-identity">
			<span class="flag">{flag(stock.ticker)}</span>
			<span class="identity-name">
				{#if label}{label} <span class="identity-ticker">({stock.kortnamn})</span>{:else}{stock.kortnamn}{/if}
			</span>
		</div>
		<span class="signal-badge {badge}">{badge}</span>
	</div>

	<!-- Line 2: price, shares, value -->
	<div class="card-metrics">
		<div class="metric">
			<div class="m-lbl">
				PRICE{#if pnl != null} <span class="pnl {pnl >= 0 ? 'pos' : 'neg'}">{pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%</span>{/if}
			</div>
			<div class="m-val">{priceStr}</div>
		</div>
		<div class="metric">
			<div class="m-lbl">SHARES</div>
			<div class="m-val">{sharesStr}</div>
		</div>
		<div class="metric">
			<div class="m-lbl">VALUE</div>
			<div class="m-val">{valueStr}</div>
		</div>
	</div>

	<!-- Line 3: signal calc | age -->
	{#if stock.ema10 != null}
		<div class="card-signal">
			<div class="signal-calcs">
				<div class="sig-group">
					<div class="m-lbl">EMA10 / EMA20</div>
					<div class="m-val">
						{fmt(stock.ema10, 1)}
						<span class="op" class:green={e10gtE20} class:red={!e10gtE20}>{e10gtE20 ? '>' : '<'}</span>
						{fmt(stock.ema20, 1)}
					</div>
				</div>
				<div class="sig-group">
					<div class="m-lbl">PRICE / EMA50</div>
					<div class="m-val">
						{fmt(stock.price, 1)}
						<span class="op" class:green={pgtE50} class:red={!pgtE50}>{pgtE50 ? '>' : '<'}</span>
						{fmt(stock.ema50, 1)}
					</div>
				</div>
			</div>
			{#if signalDates[stock.ticker]}
				<div class="sig-age">
					<div class="m-lbl">ACTIVE</div>
					<div class="m-val" style="color:{sigColor}">{days === 0 ? 'today' : `${days}d`}</div>
				</div>
			{/if}
		</div>
	{:else if stock.fetchError}
		<div class="card-error">⚠ {stock.fetchError}</div>
	{/if}
</div>
