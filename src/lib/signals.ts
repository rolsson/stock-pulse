import type { Signal } from './types';

export function computeSignal(
	price: number | null | undefined,
	e10: number | null | undefined,
	e20: number | null | undefined,
	e50: number | null | undefined
): Signal {
	if (price == null || e10 == null || e20 == null || e50 == null) return 'HOLD';
	if (e10 > e20 && price > e50) return 'BUY';
	if (e10 < e20 && price < e50) return 'SELL';
	return 'HOLD';
}
