import { decimal, rateFor, SCALE } from './portfolioMath';

export type SpendingTreatment =
  | 'standard'
  | 'expense'
  | 'income'
  | 'investment'
  | 'debtPrincipal'
  | 'refund'
  | 'transfer';
export type SpendingRow = {
  postedDate: string;
  amountMinor: bigint;
  currency: string;
  category: string;
  group: string;
  groupKind: string;
  treatment: SpendingTreatment;
};
export type SpendingRate = { from: string; to: string; date: string; rate: string; source: string };

export function convertBooked(
  amount: bigint,
  currency: string,
  target: string,
  postedDate: string,
  rates: Array<SpendingRate>,
) {
  if (currency === target)
    return { amountMinor: amount, rateDate: postedDate, source: 'Native booked amount', fallback: false };
  const rate = rateFor(
    rates.filter((row) => row.from === currency && row.to === target),
    postedDate,
  );
  if (!rate) return null;
  const factor = decimal(rate.rate);
  if (factor <= 0n) return null;
  const product = amount * factor;
  const sign = product < 0n ? -1n : 1n;
  return {
    amountMinor: sign * ((product * sign + SCALE / 2n) / SCALE),
    rateDate: rate.date,
    source:
      rates.find((row) => row.from === currency && row.to === target && row.date === rate.date)?.source ??
      'Recorded rate',
    fallback: rate.date !== postedDate,
  };
}

export function broadCategory(category: string, group: string) {
  const name = category.toLowerCase();
  const parent = group.toLowerCase();
  if (!category || name === 'uncategorized') return 'Unclassified';
  if (name.includes('grocer')) return 'Groceries';
  if (/dining|cafe|takeaway/.test(name)) return 'Dining';
  if (/travel|holiday|flight|accommodation/.test(name)) return 'Travel';
  if (/housing/.test(parent) || /rent|mortgage|utilities|internet|phone/.test(name)) return 'Housing & bills';
  if (/transport/.test(parent)) return 'Transport';
  if (/health/.test(parent)) return 'Health';
  if (/shopping/.test(parent)) return 'Shopping';
  return 'Other';
}

export function summarizeSpending(rows: Array<SpendingRow>, rates: Array<SpendingRate>, currency: string) {
  const categories = new Map<string, { name: string; amountMinor: bigint; count: number }>();
  const native = new Map<string, bigint>();
  const missingFx = new Map<string, { currency: string; amountMinor: bigint; count: number }>();
  let spendingMinor = 0n;
  let incomeMinor = 0n;
  let investmentMinor = 0n;
  let debtPrincipalMinor = 0n;
  let transfers = 0;
  let fallbackRateCount = 0;
  let unclassifiedCount = 0;
  const usedRates = new Map<string, { from: string; to: string; date: string; source: string }>();
  for (const row of rows) {
    if (row.treatment === 'transfer') {
      transfers++;
      continue;
    }
    const kind =
      row.treatment === 'standard'
        ? row.groupKind === 'investment'
          ? 'investment'
          : row.amountMinor > 0n
            ? 'income'
            : 'expense'
        : row.treatment;
    if (kind === 'expense' || kind === 'refund')
      native.set(row.currency, (native.get(row.currency) ?? 0n) - row.amountMinor);
    const converted = convertBooked(row.amountMinor, row.currency, currency, row.postedDate, rates);
    if (!converted) {
      const key = row.currency;
      const entry = missingFx.get(key) ?? { currency: key, amountMinor: 0n, count: 0 };
      entry.amountMinor += row.amountMinor;
      entry.count++;
      missingFx.set(key, entry);
      continue;
    }
    if (converted.fallback) fallbackRateCount++;
    if (row.currency !== currency)
      usedRates.set(`${row.currency}:${converted.rateDate}`, {
        from: row.currency,
        to: currency,
        date: converted.rateDate,
        source: converted.source,
      });
    if (kind === 'income') {
      incomeMinor += converted.amountMinor;
      continue;
    }
    if (kind === 'investment') {
      investmentMinor -= converted.amountMinor;
      continue;
    }
    if (kind === 'debtPrincipal') {
      debtPrincipalMinor -= converted.amountMinor;
      continue;
    }
    const amountMinor = -converted.amountMinor;
    spendingMinor += amountMinor;
    const name = broadCategory(row.category, row.group);
    const entry = categories.get(name) ?? { name, amountMinor: 0n, count: 0 };
    entry.amountMinor += amountMinor;
    entry.count++;
    categories.set(name, entry);
    if (name === 'Unclassified') unclassifiedCount++;
  }
  return {
    currency,
    spendingMinor,
    incomeMinor,
    investmentMinor,
    debtPrincipalMinor,
    transfers,
    fallbackRateCount,
    unclassifiedCount,
    categories: [...categories.values()].sort((a, b) =>
      a.amountMinor === b.amountMinor ? a.name.localeCompare(b.name) : a.amountMinor > b.amountMinor ? -1 : 1,
    ),
    nativeSpending: [...native].map(([nativeCurrency, amountMinor]) => ({ currency: nativeCurrency, amountMinor })),
    missingFx: [...missingFx.values()],
    usedRates: [...usedRates.values()],
    complete: missingFx.size === 0,
  };
}

export function comparablePreviousPeriod(from: string, to: string) {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const previousStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const previousLast = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0));
  const elapsedDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const previousEnd = new Date(
    Math.min(previousLast.getTime(), previousStart.getTime() + (elapsedDays - 1) * 86_400_000),
  );
  return { from: previousStart.toISOString().slice(0, 10), to: previousEnd.toISOString().slice(0, 10) };
}

export function missingCoverage(ranges: Array<{ from: string; to: string }>, from: string, to: string) {
  const overlapping = ranges
    .filter((range) => range.to >= from && range.from <= to)
    .sort((a, b) => a.from.localeCompare(b.from));
  const gaps: Array<{ from: string; to: string }> = [];
  const nextDay = (value: string, offset: number) =>
    new Date(Date.parse(`${value}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
  let next = from;
  for (const range of overlapping) {
    if (range.from > next) gaps.push({ from: next, to: nextDay(range.from, -1) });
    if (range.to >= next) next = nextDay(range.to, 1);
    if (next > to) break;
  }
  if (next <= to) gaps.push({ from: next, to });
  return gaps;
}
