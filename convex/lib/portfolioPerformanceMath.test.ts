import { describe, expect, it } from 'vitest';

import { contributionHistory, convertContributionHistory } from './portfolioPerformanceMath';

describe('contributed capital and growth', () => {
  it('separates opening wealth, personal and employer money, withdrawals and reinvested income', () => {
    const result = contributionHistory([
      { effectiveDate: '2025-01-01', transactionType: 'Switch', units: '100', unitPrice: '2', amountMinor: 20000n },
      {
        effectiveDate: '2025-02-01',
        transactionType: 'Employee Contributions',
        units: '10',
        unitPrice: '2',
        amountMinor: 2000n,
      },
      {
        effectiveDate: '2025-02-01',
        transactionType: 'Employer Contributions',
        units: '5',
        unitPrice: '2',
        amountMinor: 1000n,
      },
      {
        effectiveDate: '2025-03-01',
        transactionType: 'Employee Interest',
        units: '1',
        unitPrice: '3',
        amountMinor: 300n,
      },
      { effectiveDate: '2025-04-01', transactionType: 'Withdrawal', units: '-2', unitPrice: '3', amountMinor: -600n },
    ]);
    expect(result).toMatchObject({ opening: '200', personal: '20', other: '10', withdrawals: '6', complete: true });
    expect(result.observations.at(-1)).toMatchObject({ capital: '224', value: '342' });
  });
  it('keeps fees, taxes and insurance in the value residual rather than contributed capital', () => {
    const result = contributionHistory(
      [
        {
          effectiveDate: '2026-08-17',
          transactionType: 'Employer Contribution',
          units: '100',
          unitPrice: '1',
          amountMinor: 10000n,
        },
        {
          effectiveDate: '2026-08-28',
          transactionType: 'Contribution tax',
          units: '-15',
          unitPrice: '1',
          amountMinor: -1500n,
        },
        {
          effectiveDate: '2026-08-28',
          transactionType: 'Death insurance premium - Executive cover',
          units: '-2',
          unitPrice: '1',
          amountMinor: -200n,
        },
        {
          effectiveDate: '2026-08-28',
          transactionType: 'Administration fee',
          units: '-1',
          unitPrice: '1',
          amountMinor: -100n,
        },
      ],
      true,
    );
    expect(result).toMatchObject({ complete: true, personal: '0', other: '100', withdrawals: '0' });
    expect(result.observations.at(-1)).toMatchObject({ capital: '100', value: '82' });
  });
  it('subtracts signed employee and employer contribution reversals', () => {
    const result = contributionHistory([
      { effectiveDate: '2025-01-01', transactionType: 'Switch', units: '100', unitPrice: '1', amountMinor: 10000n },
      {
        effectiveDate: '2025-02-01',
        transactionType: 'Employee Contributions',
        units: '559',
        unitPrice: '1',
        amountMinor: 55900n,
      },
      {
        effectiveDate: '2025-02-01',
        transactionType: 'Employer Contributions',
        units: '374.53',
        unitPrice: '1',
        amountMinor: 37453n,
      },
      {
        effectiveDate: '2025-02-02',
        transactionType: 'Employee Contributions',
        units: '-278.2013',
        unitPrice: '1.4955',
        amountMinor: -41605n,
      },
      {
        effectiveDate: '2025-02-02',
        transactionType: 'Employer Contributions',
        units: '-186.5797',
        unitPrice: '1.4955',
        amountMinor: -27903n,
      },
    ]);
    expect(result).toMatchObject({ personal: '142.95', other: '95.5', complete: true });
    expect(result.observations.at(-1)?.capital).toBe('338.45');
  });
  it('does not invent cost basis or a zero opening', () => {
    expect(
      contributionHistory([{ effectiveDate: '2025-01-01', transactionType: 'Regular Savings Plan', units: '10' }])
        .observations[0]?.value,
    ).toBeNull();
    expect(
      contributionHistory([
        {
          effectiveDate: '2025-01-01',
          transactionType: 'Employee Contributions',
          units: '10',
          unitPrice: '2',
          amountMinor: 2000n,
        },
      ]).complete,
    ).toBe(false);
  });
  it('keeps contribution FX at its own date and includes later FX movement in residual growth', () => {
    const result = contributionHistory(
      [
        {
          effectiveDate: '2025-01-01',
          transactionType: 'Personal contribution',
          units: '100',
          unitPrice: '1',
          amountMinor: 10000n,
        },
        {
          effectiveDate: '2025-01-02',
          transactionType: 'Net Investment Earnings',
          units: '0',
          unitPrice: '1.1',
          amountMinor: 0n,
        },
      ],
      true,
    );
    const converted = convertContributionHistory(result.observations, [
      { date: '2025-01-01', rate: '1.2' },
      { date: '2025-01-02', rate: '1.3' },
    ]);
    expect(converted.observations[1]).toMatchObject({ capital: '120', value: '143' });
    expect(convertContributionHistory(result.observations, []).observations.every((row) => row.value === null)).toBe(
      true,
    );
  });
});
