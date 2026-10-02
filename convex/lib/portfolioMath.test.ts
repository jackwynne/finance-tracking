import { describe, expect, it } from 'vitest';

import { decimal, decimalText, multiply, rateFor, uncovered } from './portfolioMath';

describe('exact portfolio calculation', () => {
  it('keeps fractional units and currency exact', () => {
    expect(decimalText(multiply(decimal('13342'), decimal('17.517')))).toBe('233711.814');
    expect(decimalText(decimal('0'))).toBe('0');
    expect(decimalText(decimal('10'))).toBe('10');
  });
  it('rebases activity onto statements irrespective of import order', () => {
    const buy = { date: '2026-09-02', units: '10', status: 'accepted' };
    expect(
      decimalText(uncovered({ snapshotDate: '2026-09-01', sameDayCovered: true, units: '100' }, [buy], '2026-09-30')),
    ).toBe('110');
    expect(
      decimalText(uncovered({ snapshotDate: '2026-09-30', sameDayCovered: true, units: '110' }, [buy], '2026-09-30')),
    ).toBe('110');
  });
  it('does not count ambiguous or linked evidence as buys', () => {
    expect(
      decimalText(
        uncovered(
          { snapshotDate: '2026-09-01', sameDayCovered: true, units: '100' },
          [
            { date: '2026-09-02', units: '10', status: 'accepted' },
            { date: '2026-09-02', units: '10', status: 'ambiguous' },
            { date: '2026-09-02', units: '10', status: 'linked' },
          ],
          '2026-09-30',
        ),
      ),
    ).toBe('110');
  });
  it('never uses a future or old FX rate', () => {
    const rates = [
      { date: '2026-09-01', rate: '1.1' },
      { date: '2026-09-09', rate: '2' },
    ];
    expect(rateFor(rates, '2026-09-08')?.rate).toBe('1.1');
    expect(rateFor(rates, '2026-09-09')?.rate).toBe('2');
    expect(rateFor(rates, '2026-09-20')).toBeNull();
  });
});
