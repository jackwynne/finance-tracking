export const SCALE = 1000000000000n;
export function decimal(value: string): bigint {
  if (!/^-?\d+(\.\d{1,12})?$/.test(value) || value.length > 50)
    throw new Error('Use a decimal with at most 12 places.');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace('-', '').split('.');
  return (BigInt(whole) * SCALE + BigInt(fraction.padEnd(12, '0'))) * (negative ? -1n : 1n);
}
export function decimalText(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / SCALE}.${(absolute % SCALE).toString().padStart(12, '0')}`.replace(
    /\.?0+$/,
    '',
  );
}
export function multiply(a: bigint, b: bigint): bigint {
  return (a * b) / SCALE;
}
export function date(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
    throw new Error('Use a valid date in YYYY-MM-DD format.');
  return value;
}
export function uncovered(
  snapshot: { snapshotDate: string; sameDayCovered: boolean; units: string },
  activities: Array<{ date: string; units: string; status: string }>,
  asOf: string,
) {
  return activities.reduce(
    (units, activity) =>
      activity.status === 'accepted' &&
      activity.date <= asOf &&
      (activity.date > snapshot.snapshotDate || (activity.date === snapshot.snapshotDate && !snapshot.sameDayCovered))
        ? units + decimal(activity.units)
        : units,
    decimal(snapshot.units),
  );
}
export function rateFor<T extends { date: string; rate: string }>(rates: Array<T>, asOf: string) {
  const rate = rates
    .filter((row) => row.date <= asOf)
    .sort((a, b) => b.date.localeCompare(a.date))
    .at(0);
  return rate && (Date.parse(asOf) - Date.parse(rate.date)) / 86400000 <= 7 ? rate : null;
}
