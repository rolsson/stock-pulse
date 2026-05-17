import type { Stock } from './types';

const MARKET_SUFFIX: Record<string, string> = {
	XSTO: '.ST',
	XCSE: '.CO',
	XHEL: '.HE',
	XOSL: '.OL',
	XSAT: '.ST'
};

function buildTicker(kortnamn: string, marknad: string): string {
	const suffix = MARKET_SUFFIX[marknad] || '';
	return kortnamn.trim().replace(/\s+/g, '-') + suffix;
}

function parseSENum(s: string): number {
	if (!s) return 0;
	return parseFloat(s.trim().replace(/\./g, '').replace(',', '.')) || 0;
}

/** Returns parsed stocks or an error string. */
export function parseAvanzaCSV(text: string): Stock[] | string {
	const cleaned = text.replace(/^﻿/, '');
	const lines = cleaned.trim().split(/\r?\n/);
	if (lines.length < 2) return 'CSV appears empty';

	const sep = lines[0].indexOf(';') >= 0 ? ';' : ',';
	const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());

	const col = (name: string) => header.indexOf(name);
	const iNamn = col('namn');
	const iKort = col('kortnamn');
	const iVolym = col('volym');
	const iGAV = col('gav');
	const iValuta = col('valuta');
	const iMarknad = col('marknad');
	const iTyp = col('typ');

	if (iKort < 0 || iTyp < 0) return 'Not an Avanza export — missing Kortnamn or Typ';

	const parsed: Stock[] = [];
	for (let i = 1; i < lines.length; i++) {
		const cols = lines[i].split(sep);
		if (cols.length < 3) continue;
		const typ = (cols[iTyp] || '').trim().toUpperCase();
		if (typ !== 'STOCK') continue;

		const namn = iNamn >= 0 ? (cols[iNamn] || '').trim() : '';
		const kort = iKort >= 0 ? (cols[iKort] || '').trim() : '';
		const marknad = iMarknad >= 0 ? (cols[iMarknad] || '').trim() : '';
		const valuta = iValuta >= 0 ? (cols[iValuta] || '').trim() : '';
		const volym = iVolym >= 0 ? parseSENum(cols[iVolym]) : 0;
		const gav = iGAV >= 0 ? parseSENum(cols[iGAV]) : 0;

		if (!kort) continue;
		const ticker = buildTicker(kort, marknad);
		parsed.push({ ticker, displayName: namn, kortnamn: kort, shares: volym, costBasis: gav, valuta, marknad });
	}

	if (!parsed.length) return 'No STOCK rows found in file';
	return parsed;
}
