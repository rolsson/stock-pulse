<script lang="ts">
	import { onMount } from 'svelte';
	import StockCard from '$lib/components/StockCard.svelte';
	import { parseAvanzaCSV } from '$lib/csv';
	import { computeSignal } from '$lib/signals';
	import type { Stock, Signal, SignalDate, CachedSignal } from '$lib/types';

	const CACHE_TTL = 4 * 60 * 60 * 1000;

	// ── State ──────────────────────────────────────────────────────────────────
	let portfolio: Stock[] = [];
	let watchlist: Stock[] = [];
	let signalCache: Record<string, CachedSignal> = {};
	let cacheTime: Record<string, number> = {};
	let signalDates: Record<string, SignalDate> = {};

	let activeTab: 'portfolio' | 'watchlist' | 'import' = 'portfolio';
	let isLoading = false;
	let errorMsg = '';
	let watchInput = '';
	let isDragging = false;
	let updatedAt = '';

	// ── localStorage ───────────────────────────────────────────────────────────
	function save() {
		localStorage.setItem('piq_port', JSON.stringify(portfolio));
		localStorage.setItem('piq_watch', JSON.stringify(watchlist));
		localStorage.setItem('piq_signals', JSON.stringify(signalCache));
		localStorage.setItem('piq_cache_ts', JSON.stringify(cacheTime));
		localStorage.setItem('piq_signal_dates', JSON.stringify(signalDates));
	}

	function isCacheValid(ticker: string): boolean {
		const ts = cacheTime[ticker];
		return !!ts && Date.now() - ts < CACHE_TTL;
	}

	// ── Signal tracking ────────────────────────────────────────────────────────
	function signalDaysCount(ticker: string): number {
		if (!signalDates[ticker]) return 0;
		return Math.floor((Date.now() - new Date(signalDates[ticker].date).getTime()) / 86400000);
	}

	function trackSignal(ticker: string, signal: Signal, since?: string | null) {
		const today = new Date().toISOString().split('T')[0];
		const date = since || today;
		if (!signalDates[ticker] || signalDates[ticker].signal !== signal) {
			signalDates[ticker] = { signal, date };
		} else if (since && since < signalDates[ticker].date) {
			signalDates[ticker].date = since;
		}
		// Trigger reactivity
		signalDates = signalDates;
	}

	// ── API ────────────────────────────────────────────────────────────────────
	async function fetchQuotes(stocks: Stock[]) {
		const tickers = stocks.map((s) => s.ticker).join(',');
		const res = await fetch(`/api/quotes?tickers=${encodeURIComponent(tickers)}`);
		if (!res.ok) {
			const txt = await res.text();
			throw new Error(`API error ${res.status}: ${txt.slice(0, 200)}`);
		}
		return res.json() as Promise<Record<string, { price: number; ema10: number; ema20: number; ema50: number; signal: Signal; currency: string; signalSince: string | null; error?: string }>>;
	}

	// ── Load & render ──────────────────────────────────────────────────────────
	async function loadAndRender(useCache: boolean) {
		if (isLoading) return;
		isLoading = true;

		const allStocks = [...portfolio, ...watchlist];
		const toFetch = useCache ? allStocks.filter((s) => !isCacheValid(s.ticker)) : allStocks;

		// Apply cached signals first
		allStocks.forEach((s) => {
			if (isCacheValid(s.ticker) && signalCache[s.ticker]) {
				const c = signalCache[s.ticker];
				s.price = c.price;
				s.ema10 = c.ema10;
				s.ema20 = c.ema20;
				s.ema50 = c.ema50;
				s.currency = c.currency;
				s.signal = computeSignal(c.price, c.ema10, c.ema20, c.ema50);
				trackSignal(s.ticker, s.signal);
			}
		});

		if (toFetch.length > 0) {
			try {
				const quoteMap = await fetchQuotes(toFetch);
				toFetch.forEach((s) => {
					const q = quoteMap[s.ticker];
					if (!q || q.error) {
						s.fetchError = q?.error || 'No data';
						if (!s.signal) s.signal = 'HOLD';
					} else {
						s.price = q.price;
						s.ema10 = q.ema10;
						s.ema20 = q.ema20;
						s.ema50 = q.ema50;
						s.currency = q.currency;
						s.signal = q.signal;
						s.fetchError = undefined;
						signalCache[s.ticker] = {
							price: q.price,
							ema10: q.ema10,
							ema20: q.ema20,
							ema50: q.ema50,
							currency: q.currency
						};
						cacheTime[s.ticker] = Date.now();
						trackSignal(s.ticker, q.signal, q.signalSince);
					}
				});
			} catch (ex: unknown) {
				const msg = ex instanceof Error ? ex.message : String(ex);
				console.error('Fetch error:', msg);
				toFetch.forEach((s) => {
					if (!s.signal) s.signal = 'HOLD';
					s.fetchError = msg;
				});
			}
		}

		// Sort portfolio: SELL → BUY → HOLD, then by signal age ascending (most recent first)
		const order: Record<string, number> = { SELL: 0, BUY: 1, HOLD: 2 };
		portfolio = [...portfolio].sort((a, b) => {
			const sigDiff = (order[a.signal || 'HOLD'] ?? 2) - (order[b.signal || 'HOLD'] ?? 2);
			if (sigDiff !== 0) return sigDiff;
			return signalDaysCount(a.ticker) - signalDaysCount(b.ticker);
		});
		watchlist = [...watchlist];

		save();
		updatedAt = new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
		isLoading = false;
	}

	function refreshAll() {
		signalCache = {};
		cacheTime = {};
		save();
		loadAndRender(false);
	}

	// ── CSV import ─────────────────────────────────────────────────────────────
	function showError(msg: string) {
		errorMsg = msg;
		setTimeout(() => (errorMsg = ''), 6000);
	}

	function handleFile(file: File | undefined | null) {
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (e) => {
			const text = e.target?.result as string;
			const result = parseAvanzaCSV(text);
			if (typeof result === 'string') {
				showError(result);
				return;
			}
			const newTickers = new Set(result.map((s) => s.ticker));

			// Dropped stocks → watchlist
			portfolio.forEach((s) => {
				if (!newTickers.has(s.ticker) && !watchlist.find((w) => w.ticker === s.ticker)) {
					watchlist = [
						...watchlist,
						{
							ticker: s.ticker,
							displayName: s.displayName,
							kortnamn: s.kortnamn,
							shares: 0,
							costBasis: 0,
							valuta: s.valuta,
							marknad: s.marknad
						}
					];
				}
			});
			// Re-bought → remove from watchlist
			watchlist = watchlist.filter((w) => !newTickers.has(w.ticker));
			portfolio = result;
			save();
			activeTab = 'portfolio';
			loadAndRender(false);
		};
		reader.readAsText(file, 'UTF-8');
	}

	// ── Watchlist ──────────────────────────────────────────────────────────────
	async function addToWatchlist() {
		const name = watchInput.trim();
		if (!name) return;
		const id = name.toUpperCase();
		if (watchlist.find((s) => s.ticker === id)) {
			showError(`${name} already on watchlist`);
			return;
		}
		if (portfolio.find((s) => s.ticker === id)) {
			showError(`${name} is in your portfolio`);
			return;
		}
		const entry: Stock = {
			ticker: id,
			displayName: name,
			kortnamn: name,
			shares: 0,
			costBasis: 0,
			valuta: '',
			marknad: ''
		};
		watchlist = [...watchlist, entry];
		save();
		watchInput = '';
		try {
			const quoteMap = await fetchQuotes([entry]);
			const q = quoteMap[entry.ticker];
			const idx = watchlist.findIndex((s) => s.ticker === entry.ticker);
			if (idx >= 0) {
				if (q && !q.error) {
					watchlist[idx] = {
						...watchlist[idx],
						price: q.price,
						ema10: q.ema10,
						ema20: q.ema20,
						ema50: q.ema50,
						currency: q.currency,
						signal: q.signal
					};
					signalCache[entry.ticker] = {
						price: q.price,
						ema10: q.ema10,
						ema20: q.ema20,
						ema50: q.ema50,
						currency: q.currency
					};
					cacheTime[entry.ticker] = Date.now();
					trackSignal(entry.ticker, q.signal, q.signalSince);
					watchlist = [...watchlist];
					save();
				} else if (q?.error) {
					watchlist[idx] = { ...watchlist[idx], fetchError: q.error };
					watchlist = [...watchlist];
				}
			}
		} catch (ex: unknown) {
			console.error('Watchlist fetch error:', ex instanceof Error ? ex.message : ex);
		}
	}

	// ── Init ───────────────────────────────────────────────────────────────────
	onMount(() => {
		portfolio = JSON.parse(localStorage.getItem('piq_port') || '[]');
		watchlist = JSON.parse(localStorage.getItem('piq_watch') || '[]');
		signalCache = JSON.parse(localStorage.getItem('piq_signals') || '{}');
		cacheTime = JSON.parse(localStorage.getItem('piq_cache_ts') || '{}');
		signalDates = JSON.parse(localStorage.getItem('piq_signal_dates') || '{}');

		// Migrate legacy data (id field → ticker field)
		const needsReset =
			portfolio.some((s) => !s.ticker) || watchlist.some((s) => !s.ticker);
		if (needsReset) {
			console.warn('StockPulse: legacy data detected, clearing localStorage');
			portfolio = [];
			watchlist = [];
			signalCache = {};
			cacheTime = {};
			signalDates = {};
			localStorage.clear();
		} else {
			// Migrate old per-signal sellDates into unified signalDates
			const oldSellDates: Record<string, string> = JSON.parse(
				localStorage.getItem('piq_sell_dates') || '{}'
			);
			Object.entries(oldSellDates).forEach(([ticker, date]) => {
				if (!signalDates[ticker]) signalDates[ticker] = { signal: 'SELL', date };
			});
		}

		if (portfolio.length || watchlist.length) loadAndRender(true);
	});

	// ── Derived ────────────────────────────────────────────────────────────────
	$: buysP = portfolio.filter((s) => s.signal === 'BUY');
	$: sellsP = portfolio.filter((s) => s.signal === 'SELL');
	$: holdsP = portfolio.filter((s) => !s.signal || s.signal === 'HOLD');
	$: buysW = watchlist.filter((s) => s.signal === 'BUY');
	$: othersW = watchlist.filter((s) => s.signal !== 'BUY');
</script>

<svelte:head>
	<title>StockPulse</title>
</svelte:head>

<!-- Header -->
<div class="app-header">
	<div>
		<div class="app-title">StockPulse</div>
		<div class="app-subtitle">EMA Signal Tracker</div>
	</div>
	<button class="refresh-btn" class:spinning={isLoading} on:click={refreshAll}>
		{isLoading ? '⟳ Loading…' : '↻ Refresh'}
	</button>
</div>

<!-- Tabs -->
<div class="tabs">
	<button
		class="tab"
		class:active={activeTab === 'portfolio'}
		on:click={() => (activeTab = 'portfolio')}
	>
		Portfolio <span class="tab-count">{portfolio.length}</span>
	</button>
	<button
		class="tab"
		class:active={activeTab === 'watchlist'}
		on:click={() => (activeTab = 'watchlist')}
	>
		Watchlist <span class="tab-count">{watchlist.length}</span>
	</button>
	<button
		class="tab"
		class:active={activeTab === 'import'}
		on:click={() => (activeTab = 'import')}
	>
		Import
	</button>
</div>

<!-- Portfolio panel -->
<div class="panel" class:active={activeTab === 'portfolio'}>
	{#if errorMsg}
		<div class="error-bar">⚠ {errorMsg}</div>
	{/if}

	{#if isLoading}
		<div class="progress-bar-wrap">
			<div>Fetching live prices from Yahoo Finance…</div>
			<div class="progress-bar"><div class="progress-fill" style="width:60%"></div></div>
		</div>
	{:else if portfolio.length === 0}
		<div class="empty">
			<div class="empty-icon">📊</div>
			Import your Avanza CSV to get started<br />
			<span style="color:var(--accent)">Typ=STOCK rows are loaded automatically</span>
		</div>
	{:else}
		{#if updatedAt}
			<div class="last-updated">Updated {updatedAt}</div>
		{/if}
		<div class="summary-bar">
			<div class="summary-pill buy"><div class="val">{buysP.length}</div><div class="lbl">Buy</div></div>
			<div class="summary-pill hold"><div class="val">{holdsP.length}</div><div class="lbl">Hold</div></div>
			<div class="summary-pill sell"><div class="val">{sellsP.length}</div><div class="lbl">Sell</div></div>
		</div>
		{#if sellsP.length}
			<div class="section-header">🔴 Sell Signals</div>
			{#each sellsP as stock (stock.ticker)}
				<StockCard {stock} {signalDates} />
			{/each}
		{/if}
		{#if buysP.length}
			<div class="section-header" style="margin-top:{sellsP.length ? '12px' : '0'}">🟢 Buy Signals</div>
			{#each buysP as stock (stock.ticker)}
				<StockCard {stock} {signalDates} />
			{/each}
		{/if}
		{#if holdsP.length}
			<div class="section-header" style="margin-top:{sellsP.length || buysP.length ? '12px' : '0'}">🟠 Hold</div>
			{#each holdsP as stock (stock.ticker)}
				<StockCard {stock} {signalDates} />
			{/each}
		{/if}
	{/if}
</div>

<!-- Watchlist panel -->
<div class="panel" class:active={activeTab === 'watchlist'}>
	<div class="add-watch-bar">
		<input
			type="text"
			placeholder="Add ticker (e.g. AAPL, NOVO-B.CO)"
			maxlength="30"
			bind:value={watchInput}
			on:keydown={(e) => e.key === 'Enter' && addToWatchlist()}
		/>
		<button class="btn" on:click={addToWatchlist}>+ Add</button>
	</div>

	{#if watchlist.length === 0}
		<div class="empty">
			<div class="empty-icon">👁</div>
			No stocks on watchlist<br />Stocks removed from CSV auto-appear here
		</div>
	{:else}
		{#if buysW.length}
			<div class="section-header">🟢 Re-entry Signals</div>
			{#each buysW as stock (stock.ticker)}
				<StockCard {stock} isWatch={true} {signalDates} />
			{/each}
		{/if}
		{#if othersW.length}
			<div class="section-header" style="margin-top:{buysW.length ? '12px' : '0'}">Watching</div>
			{#each othersW as stock (stock.ticker)}
				<StockCard {stock} isWatch={true} {signalDates} />
			{/each}
		{/if}
	{/if}
</div>

<!-- Import panel -->
<div class="panel" class:active={activeTab === 'import'}>
	<div class="section-header">Upload Avanza Portfolio Export</div>

	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
	<div
		class="upload-zone"
		class:drag={isDragging}
		on:click={() => document.getElementById('csvFile')?.click()}
		on:dragover|preventDefault={() => (isDragging = true)}
		on:dragleave={() => (isDragging = false)}
		on:drop|preventDefault={(e) => {
			isDragging = false;
			handleFile(e.dataTransfer?.files[0]);
		}}
	>
		<input
			type="file"
			id="csvFile"
			accept=".csv"
			style="display:none"
			on:change={(e) => handleFile((e.target as HTMLInputElement).files?.[0])}
		/>
		<div class="upload-icon">📂</div>
		<div class="upload-label">
			<strong>Tap to upload CSV</strong><br />
			Avanza semicolon-delimited export<br />
			<span style="color:var(--text)">Only Typ=STOCK rows imported</span>
		</div>
	</div>

	<div class="section-header" style="margin-top:16px">How It Works</div>
	<div style="font-size:10px;color:var(--muted);line-height:1.9;">
		Only <strong style="color:var(--text)">Typ=STOCK</strong> rows are imported — funds, ETFs and
		certificates are skipped.<br /><br />
		Prices are fetched live from <strong style="color:var(--text)">Yahoo Finance</strong>. All
		stocks load in parallel — no batching, no delays.<br /><br />
		<strong style="color:var(--buy)">BUY</strong>: EMA10 &gt; EMA20 and price &gt; EMA50<br />
		<strong style="color:var(--sell)">SELL</strong>: EMA10 &lt; EMA20 and price &lt; EMA50<br />
		<strong style="color:var(--hold)">HOLD</strong>: everything else<br /><br />
		The SELL day counter starts from the first date the signal was triggered.<br /><br />
		When you upload a new CSV after selling, missing tickers are auto-moved to the Watchlist. If a
		watchlist stock reappears in a new CSV, it is removed from the Watchlist.
	</div>
</div>
