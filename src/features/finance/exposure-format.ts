import { decimal, decimalText, SCALE } from '../../../convex/lib/portfolioMath';

export function exposureMoney(value: string | null, currency: string) {
  if (value === null) return 'Unresolved';
  const raw = decimal(value);
  const negative = raw < 0n;
  const absolute = negative ? -raw : raw;
  const cents = (absolute + SCALE / 200n) / (SCALE / 100n);
  return `${currency} ${negative ? '-' : ''}${new Intl.NumberFormat('en-NZ').format(cents / 100n)}.${(cents % 100n).toString().padStart(2, '0')}`;
}

export function exposurePercent(value: string) {
  return `${new Intl.NumberFormat('en-NZ', { maximumFractionDigits: 2 }).format(Number(value))}%`;
}

export function rankedExposure<T extends { value: string }>(rows: ReadonlyArray<T>): Array<T> {
  return [...rows].sort((left, right) => {
    const difference = decimal(right.value) - decimal(left.value);
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  });
}

export function attributedExposurePercent(value: string, rows: ReadonlyArray<{ value: string }>): string | null {
  const total = rows.reduce((sum, row) => sum + decimal(row.value), 0n);
  return total > 0n ? decimalText((decimal(value) * 100n * SCALE) / total) : null;
}
