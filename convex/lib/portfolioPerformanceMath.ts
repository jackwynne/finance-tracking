import { decimal, decimalText, multiply, SCALE } from './portfolioMath';

type Activity = {
  effectiveDate: string;
  transactionType: string;
  units: string;
  unitPrice?: string;
  amountMinor?: bigint;
};
export function contributionHistory(activities: ReadonlyArray<Activity>, zeroOpening = false) {
  let units = 0n;
  let opening = 0n;
  let personal = 0n;
  let other = 0n;
  let withdrawals = 0n;
  let complete = zeroOpening || activities.at(0)?.transactionType.toLowerCase().trim() === 'switch';
  const observations = new Map<
    string,
    {
      date: string;
      capital: string;
      value: string | null;
      opening: string;
      personal: string;
      other: string;
      withdrawals: string;
    }
  >();
  const issues = new Set<string>();
  if (!complete)
    issues.add('Confirm the account started at zero, or import its opening value, before calculating growth.');
  for (const row of activities) {
    const amount = row.amountMinor === undefined ? null : (row.amountMinor * SCALE) / 100n;
    const type = row.transactionType
      .toLowerCase()
      .trim()
      .replace(/^(death|tpd) insurance premium.*$/, '$1 insurance premium');
    const delta = decimal(row.units);
    if (type === 'switch' && units === 0n && observations.size === 0 && amount !== null) {
      opening = amount < 0n ? -amount : amount;
    } else if (
      /^(employee contributions|member contribution|personal contribution|regular savings plan|purchase|buy)$/.test(
        type,
      )
    ) {
      if (amount === null) complete = false;
      else personal += amount < 0n ? -amount : amount;
    } else if (/^(employer contributions|employer contribution|government contributions)$/.test(type)) {
      if (amount === null) complete = false;
      else other += amount < 0n ? -amount : amount;
    } else if (/^(withdrawal|withdrawals|sell|sale)$/.test(type)) {
      if (amount === null) complete = false;
      else withdrawals += amount < 0n ? -amount : amount;
    } else if (
      !/^(employee interest|employer interest|interest|dividend|reinvested dividend|distribution|fee|fees|tax|insurance premium|net investment earnings|contribution tax|administration fee|death insurance premium|tpd insurance premium)$/.test(
        type,
      )
    ) {
      complete = false;
      issues.add(`Unclassified activity: ${row.transactionType}`);
    }
    if (amount === null && !/interest|dividend|distribution|fee|tax|insurance/.test(type))
      issues.add('Purchase or withdrawal cash amounts are missing.');
    units += delta;
    const value = complete && row.unitPrice !== undefined ? decimalText(multiply(units, decimal(row.unitPrice))) : null;
    observations.set(row.effectiveDate, {
      date: row.effectiveDate,
      capital: decimalText(opening + personal + other - withdrawals),
      value,
      opening: decimalText(opening),
      personal: decimalText(personal),
      other: decimalText(other),
      withdrawals: decimalText(withdrawals),
    });
  }
  return {
    observations: [...observations.values()],
    units: decimalText(units),
    opening: decimalText(opening),
    personal: decimalText(personal),
    other: decimalText(other),
    withdrawals: decimalText(withdrawals),
    complete,
    issues: [...issues],
  };
}

export function convertContributionHistory(
  observations: ReturnType<typeof contributionHistory>['observations'],
  rates: ReadonlyArray<{ date: string; rate: string }>,
) {
  const previous = { opening: 0n, personal: 0n, other: 0n, withdrawals: 0n };
  const capital = { opening: 0n, personal: 0n, other: 0n, withdrawals: 0n };
  let complete = true;
  const issues = new Set<string>();
  const converted = observations.map((row) => {
    const rate = [...rates]
      .filter((r) => r.date <= row.date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .at(0);
    const usable = rate && (Date.parse(row.date) - Date.parse(rate.date)) / 86400000 <= 7;
    for (const field of ['opening', 'personal', 'other', 'withdrawals'] as const) {
      const amount = decimal(row[field]);
      const delta = amount - previous[field];
      previous[field] = amount;
      if (delta !== 0n) {
        if (usable) capital[field] += multiply(delta, decimal(rate.rate));
        else {
          complete = false;
          issues.add(
            'Historical currency rates are missing for some contributions. Growth is unavailable after that gap.',
          );
        }
      }
    }
    return {
      ...row,
      opening: decimalText(capital.opening),
      personal: decimalText(capital.personal),
      other: decimalText(capital.other),
      withdrawals: decimalText(capital.withdrawals),
      capital: decimalText(capital.opening + capital.personal + capital.other - capital.withdrawals),
      value:
        complete && usable && row.value !== null ? decimalText(multiply(decimal(row.value), decimal(rate.rate))) : null,
    };
  });
  return { observations: converted, issues: [...issues], complete };
}
