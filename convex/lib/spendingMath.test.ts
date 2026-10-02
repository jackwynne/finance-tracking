import { expect, test } from 'vitest';

import { comparablePreviousPeriod, convertBooked, missingCoverage, summarizeSpending } from './spendingMath';
import type { SpendingRow } from './spendingMath';

const rates = [{ from: 'AUD', to: 'NZD', date: '2026-10-02', rate: '1.1', source: 'Published fixture' }];
const expense: SpendingRow = {
  postedDate: '2026-10-03',
  amountMinor: -10001n,
  currency: 'AUD',
  category: 'Groceries',
  group: 'Food & drink',
  groupKind: 'expense',
  treatment: 'standard',
};

test('uses booked native amount and preceding sourced rates, rounding once to cents', () => {
  expect(convertBooked(-10001n, 'AUD', 'NZD', '2026-10-03', rates)).toEqual({
    amountMinor: -11001n,
    rateDate: '2026-10-02',
    source: 'Published fixture',
    fallback: true,
  });
  expect(convertBooked(10001n, 'AUD', 'NZD', '2026-10-03', rates)?.amountMinor).toBe(11001n);
  expect(convertBooked(-10001n, 'NZD', 'NZD', '2026-10-03', [])?.amountMinor).toBe(-10001n);
  expect(convertBooked(-10001n, 'AUD', 'NZD', '2026-10-10', rates)).toBeNull();
  expect(convertBooked(-10001n, 'AUD', 'NZD', '2026-10-01', rates)).toBeNull();
});

test('refunds reduce their posting period, investment and debt principal stay separate, fees are spending', () => {
  const result = summarizeSpending(
    [
      expense,
      { ...expense, amountMinor: 2000n, treatment: 'refund' },
      { ...expense, currency: 'NZD', amountMinor: -5000n, treatment: 'investment' },
      { ...expense, currency: 'NZD', amountMinor: -3000n, treatment: 'debtPrincipal' },
      { ...expense, currency: 'NZD', amountMinor: -200000n, treatment: 'transfer' },
      {
        ...expense,
        currency: 'NZD',
        amountMinor: -350n,
        category: 'Bank fees',
        group: 'Financial & tax',
        treatment: 'expense',
      },
      { ...expense, currency: 'NZD', amountMinor: -400n, category: '', group: '' },
    ],
    rates,
    'NZD',
  );
  expect(result.spendingMinor).toBe(9551n);
  expect(result.investmentMinor).toBe(5000n);
  expect(result.debtPrincipalMinor).toBe(3000n);
  expect(result.transfers).toBe(1);
  expect(result.unclassifiedCount).toBe(1);
  expect(result.categories.find((item) => item.name === 'Groceries')?.amountMinor).toBe(8801n);
});

test('missing rates are explicit and refunds may leave a negative category', () => {
  const result = summarizeSpending(
    [expense, { ...expense, currency: 'NZD', amountMinor: 5000n, treatment: 'refund' }],
    [],
    'NZD',
  );
  expect(result.complete).toBe(false);
  expect(result.missingFx).toEqual([{ currency: 'AUD', amountMinor: -10001n, count: 1 }]);
  expect(result.spendingMinor).toBe(-5000n);
});

test('month-to-date comparison uses equal elapsed days and clips shorter months', () => {
  expect(comparablePreviousPeriod('2026-10-01', '2026-10-02')).toEqual({ from: '2026-09-01', to: '2026-09-02' });
  expect(comparablePreviousPeriod('2026-03-01', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
});

test('coverage merges adjacent and overlapping sources but retains real date gaps', () => {
  expect(
    missingCoverage(
      [
        { from: '2026-10-01', to: '2026-10-10' },
        { from: '2026-10-10', to: '2026-10-20' },
        { from: '2026-10-21', to: '2026-10-31' },
      ],
      '2026-10-01',
      '2026-10-31',
    ),
  ).toEqual([]);
  expect(
    missingCoverage(
      [
        { from: '2026-10-02', to: '2026-10-10' },
        { from: '2026-10-12', to: '2026-10-30' },
      ],
      '2026-10-01',
      '2026-10-31',
    ),
  ).toEqual([
    { from: '2026-10-01', to: '2026-10-01' },
    { from: '2026-10-11', to: '2026-10-11' },
    { from: '2026-10-31', to: '2026-10-31' },
  ]);
});
