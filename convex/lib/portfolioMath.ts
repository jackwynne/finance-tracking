import type { Infer } from 'convex/values';

import type { portfolioTables } from '../portfolioTables';

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

type ExposurePosition = {
  id: string;
  name: string;
  instrument: string;
  debt: boolean;
  value: string | null;
  date: string;
  holdingsDate: string | null;
};
type StockAllocation = Omit<Infer<typeof portfolioTables.portfolioAllocations.validator>, 'ownerId'> & {
  _creationTime: number;
};
export function stockExposure({
  rows,
  allocations,
  asOf,
  gross,
  net,
  portfolioNet = net,
  portfolioGross = gross,
}: {
  rows: Array<ExposurePosition>;
  allocations: Array<StockAllocation>;
  asOf: string;
  gross: bigint;
  net: bigint;
  portfolioNet?: bigint;
  portfolioGross?: bigint;
}) {
  const contributions = new Map<
    string,
    {
      label: string;
      value: bigint;
      contributions: Array<{
        positionId: string;
        name: string;
        instrument: string;
        value: string;
        weight: string;
        allocationDate: string;
        source: string;
        evidence: string;
      }>;
    }
  >();
  let investmentsValue = 0n;
  let reportedValue = 0n;
  let remainingUnknown = 0n;
  let sourceCoverageValue = 0n;
  let completeValue = 0n;
  const eligible = rows.filter((row) => !row.debt && !row.instrument.startsWith('bank:'));
  const sources = eligible
    .filter((row) => row.value !== null)
    .map((row) => {
      const value = decimal(row.value ?? '0');
      investmentsValue += value;
      const allocation = allocations
        .filter(
          (a) => a.dimension === 'stock' && a.instrument === row.instrument && a.kind !== 'target' && a.date <= asOf,
        )
        .sort((a, b) => b.date.localeCompare(a.date) || b._creationTime - a._creationTime)
        .at(0);
      let attributed = 0n;
      let reportedWeight = 0n;
      if (allocation) {
        sourceCoverageValue += value;
        if (allocation.complete) completeValue += value;
        for (const weight of allocation.weights) {
          if (!weight.issuerId) throw new Error('Stock source is missing a canonical issuer ID.');
          const amount = multiply(value, decimal(weight.weight));
          attributed += amount;
          reportedWeight += decimal(weight.weight);
          const bucket = contributions.get(weight.issuerId) ?? { label: weight.label, value: 0n, contributions: [] };
          bucket.value += amount;
          bucket.contributions.push({
            positionId: row.id,
            name: row.name,
            instrument: row.instrument,
            value: decimalText(amount),
            weight: weight.weight,
            allocationDate: allocation.date,
            source: allocation.source,
            evidence: allocation.evidence,
          });
          contributions.set(weight.issuerId, bucket);
        }
      }
      reportedValue += attributed;
      if (value > attributed) remainingUnknown += value - attributed;
      const status: 'missing' | 'partial' | 'complete' = allocation
        ? allocation.complete
          ? 'complete'
          : 'partial'
        : 'missing';
      return {
        positionId: row.id,
        name: row.name,
        instrument: row.instrument,
        value: decimalText(value),
        valuationDate: row.date,
        holdingsDate: row.holdingsDate,
        status,
        allocationDate: allocation?.date ?? null,
        source: allocation?.source ?? null,
        evidence: allocation?.evidence ?? null,
        reportedWeight: decimalText(reportedWeight),
        reportedValue: decimalText(attributed),
      };
    });
  return {
    stocks: [...contributions]
      .sort(([, a], [, b]) => (a.value === b.value ? a.label.localeCompare(b.label) : a.value > b.value ? -1 : 1))
      .map(([issuerId, bucket]) => ({
        issuerId,
        label: bucket.label,
        value: decimalText(bucket.value),
        percentOfGross: gross > 0n ? decimalText((bucket.value * 100n * SCALE) / gross) : '0',
        percentOfNet: net > 0n ? decimalText((bucket.value * 100n * SCALE) / net) : null,
        percentOfPortfolioNet: portfolioNet > 0n ? decimalText((bucket.value * 100n * SCALE) / portfolioNet) : null,
        percentOfPortfolioGross:
          portfolioGross > 0n ? decimalText((bucket.value * 100n * SCALE) / portfolioGross) : '0',
        contributions: bucket.contributions.sort((a, b) =>
          decimal(a.value) > decimal(b.value)
            ? -1
            : decimal(a.value) < decimal(b.value)
              ? 1
              : a.positionId.localeCompare(b.positionId),
        ),
      })),
    investmentsValue: decimalText(investmentsValue),
    reportedValue: decimalText(reportedValue),
    remainingUnknown: decimalText(remainingUnknown),
    sourceCoverageValue: decimalText(sourceCoverageValue),
    sourceCoveragePercent:
      investmentsValue > 0n ? decimalText((sourceCoverageValue * 100n * SCALE) / investmentsValue) : '0',
    completeValue: decimalText(completeValue),
    unknownPositions: eligible.filter((row) => row.value === null).map((row) => row.id),
    sources,
  };
}

export function equityExposure({
  rows,
  allocations,
  asOf,
}: {
  rows: Array<ExposurePosition>;
  allocations: Array<StockAllocation>;
  asOf: string;
}) {
  let value = 0n;
  let unknownValue = 0n;
  let completeValue = 0n;
  const eligible = rows.filter((row) => !row.debt && !row.instrument.startsWith('bank:'));
  const sources = eligible
    .filter((row) => row.value !== null)
    .map((row) => {
      const positionValue = decimal(row.value ?? '0');
      const allocation = allocations
        .filter(
          (a) =>
            a.instrument === row.instrument && a.dimension === 'assetClass' && a.kind !== 'target' && a.date <= asOf,
        )
        .sort((a, b) => b.date.localeCompare(a.date) || b._creationTime - a._creationTime)
        .at(0);
      const equityLabels = /\bequit(?:y|ies)\b|\bstocks?\b|\bshares?\b/i;
      const nonEquityLabels =
        /\bcash\b|\bbonds?\b|\bfixed income\b|\bproperty\b|\breal estate\b|\bcommodities\b|\bfinancing\b/i;
      const classified =
        allocation?.complete &&
        allocation.weights.every((weight) => equityLabels.test(weight.label) || nonEquityLabels.test(weight.label));
      const equityWeight = (allocation?.weights ?? [])
        .filter((weight) => equityLabels.test(weight.label))
        .reduce((sum, weight) => sum + decimal(weight.weight), 0n);
      const equityValue = multiply(positionValue, equityWeight);
      value += equityValue;
      if (classified) completeValue += positionValue;
      else unknownValue += positionValue;
      const status: 'missing' | 'partial' | 'complete' = allocation ? (classified ? 'complete' : 'partial') : 'missing';
      return {
        positionId: row.id,
        name: row.name,
        instrument: row.instrument,
        value: decimalText(positionValue),
        equityValue: decimalText(equityValue),
        allocationDate: allocation?.date ?? null,
        source: allocation?.source ?? null,
        evidence: allocation?.evidence ?? null,
        status,
      };
    });
  return {
    value: decimalText(value),
    unknownValue: decimalText(unknownValue),
    completeValue: decimalText(completeValue),
    unknownPositions: eligible.filter((row) => row.value === null).map((row) => row.id),
    sources,
  };
}
