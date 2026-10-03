import { expect, test } from 'vitest';

import { combineAssetGrowth } from './asset-growth';

test('combined growth starts at common coverage and carries recorded values between dates', () => {
  expect(
    combineAssetGrowth([
      [
        { date: '2025-01-01', capital: '100', value: '110' },
        { date: '2025-03-01', capital: '150', value: '180' },
      ],
      [
        { date: '2025-02-01', capital: '200', value: '220' },
        { date: '2025-04-01', capital: '200', value: '190' },
      ],
    ]),
  ).toEqual([
    { date: '2025-02-01', capital: 300, value: 330 },
    { date: '2025-03-01', capital: 350, value: 400 },
    { date: '2025-04-01', capital: 350, value: 370 },
  ]);
});

test('missing valuations break totals until that asset has another valuation', () => {
  expect(
    combineAssetGrowth([
      [
        { date: '2025-01-01', capital: '100', value: '110' },
        { date: '2025-02-01', capital: '100', value: null },
        { date: '2025-04-01', capital: '100', value: '90' },
      ],
      [
        { date: '2025-01-01', capital: '200', value: '220' },
        { date: '2025-03-01', capital: '200', value: '230' },
      ],
    ]),
  ).toEqual([
    { date: '2025-01-01', capital: 300, value: 330 },
    { date: '2025-02-01', capital: 300, value: null },
    { date: '2025-03-01', capital: 300, value: null },
    { date: '2025-04-01', capital: 300, value: 320 },
  ]);
  expect(combineAssetGrowth([])).toEqual([]);
});
