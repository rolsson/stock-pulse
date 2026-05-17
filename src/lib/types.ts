export type Signal = 'BUY' | 'SELL' | 'HOLD';

export interface Stock {
	ticker: string;
	displayName: string;
	kortnamn: string;
	shares: number;
	costBasis: number;
	valuta: string;
	marknad: string;
	// Runtime fields (not persisted to localStorage)
	price?: number;
	ema10?: number;
	ema20?: number;
	ema50?: number;
	currency?: string;
	signal?: Signal;
	fetchError?: string;
}

export interface SignalDate {
	signal: Signal;
	date: string; // ISO date string YYYY-MM-DD
}

export interface CachedSignal {
	price: number;
	ema10: number;
	ema20: number;
	ema50: number;
	currency: string;
}

export interface QuoteResult {
	ticker: string;
	price?: number;
	ema10?: number;
	ema20?: number;
	ema50?: number;
	signal?: Signal;
	currency?: string;
	signalSince?: string | null;
	error?: string;
}
