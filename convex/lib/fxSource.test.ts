import { expect, test } from 'vitest';

import { parsePublishedRates, refreshWindow } from './fxSource';
import { convertBooked } from './spendingMath';

const published = [
  { date: '2026-09-25', base: 'AUD', quote: 'NZD', rate: 1.2397 },
  { date: '2026-09-28', base: 'AUD', quote: 'NZD', rate: 1.239 },
];

test('accepts the preceding published boundary rate for a weekend start, retaining the seven-day limit', () => {
  const rows = [
    { date: '2026-07-24', base: 'AUD', quote: 'NZD', rate: 1.2073 },
    { date: '2026-07-27', base: 'AUD', quote: 'NZD', rate: 1.2085 },
  ];
  const rates = parsePublishedRates(JSON.stringify(rows), '2026-07-25', '2026-07-27');
  expect(convertBooked(10000n, 'AUD', 'NZD', '2026-07-25', rates)?.amountMinor).toBe(12073n);
  expect(convertBooked(10000n, 'AUD', 'NZD', '2026-07-26', rates)?.rateDate).toBe('2026-07-24');
  expect(() => parsePublishedRates(JSON.stringify([rows[0]]), '2026-08-01', '2026-08-02')).toThrow('out-of-range');
});

test('validates published rates and computes the reciprocal with fixed-point rounding', () => {
  const rates = parsePublishedRates(JSON.stringify(published), '2026-09-24', '2026-09-30');
  expect(rates).toHaveLength(4);
  expect(rates[0]).toMatchObject({ from: 'AUD', to: 'NZD', date: '2026-09-25', rate: '1.2397' });
  expect(rates[1]).toMatchObject({ from: 'NZD', to: 'AUD', rate: '0.80664676938' });
  expect(convertBooked(10000n, 'AUD', 'NZD', '2026-09-27', rates)?.amountMinor).toBe(12397n);
  expect(convertBooked(12397n, 'NZD', 'AUD', '2026-09-27', rates)?.amountMinor).toBe(10000n);
});

test('rejects duplicate dates, unrelated currencies, future data, and unsupported precision', () => {
  expect(() => parsePublishedRates(JSON.stringify([published[0], published[0]]), '2026-09-24', '2026-09-30')).toThrow();
  expect(() =>
    parsePublishedRates(JSON.stringify([{ ...published[0], base: 'USD' }]), '2026-09-24', '2026-09-30'),
  ).toThrow();
  expect(() => parsePublishedRates(JSON.stringify(published), '2026-09-24', '2026-09-26')).toThrow();
  expect(() =>
    parsePublishedRates(JSON.stringify([{ ...published[0], rate: 0.0000000000001 }]), '2026-09-24', '2026-09-30'),
  ).toThrow();
});

test('covers the prior three trend months with seven preceding days and refuses future or multi-month inputs', () => {
  expect(refreshWindow('2026-10-01', '2026-10-02', '2026-10-02')).toEqual({ from: '2026-06-24', to: '2026-10-02' });
  expect(() => refreshWindow('2026-10-01', '2026-10-03', '2026-10-02')).toThrow();
  expect(() => refreshWindow('2026-09-01', '2026-10-02', '2026-10-02')).toThrow();
});

test('validates a complete four-month refresh and makes prior comparisons convertible', () => {
  const window = refreshWindow('2026-10-01', '2026-10-02', '2026-10-02');
  const rows = Array.from({ length: 101 }, (_, index) => ({
    date: new Date(Date.parse(`${window.from}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10),
    base: 'AUD',
    quote: 'NZD',
    rate: 1.25,
  }));
  const rates = parsePublishedRates(JSON.stringify(rows), window.from, window.to);
  expect(rates).toHaveLength(202);
  for (const date of ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'])
    expect(convertBooked(10000n, 'AUD', 'NZD', date, rates)?.amountMinor).toBe(12500n);
  expect(refreshWindow('1999-01-01', '1999-01-05', '2026-10-02').from).toBe('1999-01-01');
});
