<script lang="ts">
	import type { Stock, SignalDate } from '$lib/types';

	export let stock: Stock;
	export let isWatch: boolean = false;
	export let signalDates: Record<string, SignalDate>;

	function fmt(n: number | undefined | null, dec = 2): string {
		return n != null ? n.toFixed(dec) : '--';
	}

	function fmtSigned(n: number, dec = 2): string {
		return (n >= 0 ? '+' : '') + n.toFixed(dec);
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
	$: label = stock.displayName && stock.displayName !== stock.kortnamn ? stock.displayName : '';
	$: badge = isWatch ? 'WATCH' : sig;
	$: sigColor = sig === 'BUY' ? 'var(--buy)' : sig === 'SELL' ? 'var(--sell)' : 'var(--hold)';
	$: e10gtE20 = stock.ema10 != null && stock.ema20 != null && stock.ema10 > stock.ema20;
	$: pgtE50 = stock.price != null && stock.ema50 != null && stock.price > stock.ema50;

	// Today's change
	$: todayChangePct = stock.price != null && stock.previousClose != null && stock.previousClose !== 0
		? (stock.price - stock.previousClose) / stock.previousClose * 100
		: null;
	$: todayChangeAbs = stock.price != null && stock.previousClose != null
		? stock.price - stock.previousClose
		: null;
	$: todayClass = todayChangePct == null ? '' : todayChangePct >= 0 ? 'pos' : 'neg';

	// P&L
	$: pnlPct = stock.price != null && stock.costBasis
		? (stock.price - stock.costBasis) / stock.costBasis * 100
		: null;
	$: pnlAbs = stock.price != null && stock.costBasis && stock.shares > 0
		? (stock.price - stock.costBasis) * stock.shares
		: null;
	$: pnlClass = pnlPct == null ? '' : pnlPct >= 0 ? 'pos' : 'neg';

	// Holdings
	$: valueStr = stock.price != null && stock.shares > 0
		? (stock.price * stock.shares).toLocaleString('sv-SE', { maximumFractionDigits: 0 })
		: '–';
	$: sharesStr = stock.shares > 0
		? stock.shares.toLocaleString('sv-SE', { maximumFractionDigits: 4 })
		: '–';
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

	<!-- Line 2: 4-column metrics -->
	<div class="card-metrics">
		<div class="metric">
			<div class="m-lbl">TODAY</div>
			{#if todayChangePct != null}
				<div class="m-val {todayClass}">{fmtSigned(todayChangePct)}%</div>
				<div class="m-val2 {todayClass}">{fmtSigned(todayChangeAbs ?? 0)} {cur}</div>
			{:else}
				<div class="m-val">–</div>
			{/if}
		</div>
		<div class="metric">
			<div class="m-lbl">PRICE / COST</div>
			<div class="m-val">{fmt(stock.price)} {cur}</div>
			{#if stock.costBasis}
				<div class="m-val2">{fmt(stock.costBasis)} {cur}</div>
			{/if}
		</div>
		<div class="metric">
			<div class="m-lbl">SINCE BUY</div>
			{#if pnlPct != null}
				<div class="m-val {pnlClass}">{fmtSigned(pnlPct)}%</div>
				{#if pnlAbs != null}
					<div class="m-val2 {pnlClass}">{fmtSigned(pnlAbs, 0)} {cur}</div>
				{/if}
			{:else}
				<div class="m-val">–</div>
			{/if}
		</div>
		<div class="metric">
			<div class="m-lbl">VALUE / QTY</div>
			<div class="m-val">{valueStr} {stock.shares > 0 ? cur : ''}</div>
			{#if stock.shares > 0}
				<div class="m-val2">{sharesStr} st</div>
			{/if}
		</div>
	</div>

	<!-- Line 3: signal calc | age -->
	{#if stock.ema10 != null}
		<div class="card-signal">
			<div class="signal-calcs">
				<div class="sig-group">
					<div class="m-lbl">EMA10 / EMA20</div>
					<div class="m-val">
						{fmt(stock.ema10)}
						<span class="op" class:green={e10gtE20} class:red={!e10gtE20}>{e10gtE20 ? '>' : '<'}</span>
						{fmt(stock.ema20)}
					</div>
				</div>
				<div class="sig-group">
					<div class="m-lbl">PRICE / EMA50</div>
					<div class="m-val">
						{fmt(stock.price)}
						<span class="op" class:green={pgtE50} class:red={!pgtE50}>{pgtE50 ? '>' : '<'}</span>
						{fmt(stock.ema50)}
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
