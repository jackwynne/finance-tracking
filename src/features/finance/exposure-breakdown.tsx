import type { FunctionReturnType } from 'convex/server';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import type { api } from '../../../convex/_generated/api';
import { decimal, decimalText, SCALE } from '../../../convex/lib/portfolioMath';
import { exposureMoney, exposurePercent, rankedExposure } from './exposure-format';
import { FinanceBarChart } from './finance-charts';

type Exposure = FunctionReturnType<typeof api.portfolio.getExposure>;
type Dimension = Exposure['breakdowns'][number]['dimension'];

export function ExposureBreakdown({
  exposure,
  currency,
  onSelectFunds,
}: {
  exposure: Exposure;
  currency: string;
  onSelectFunds: (positionIds: Array<string>) => void;
}) {
  const [dimension, setDimension] = useState<Dimension>('country');
  const [view, setView] = useState<'bars' | 'table'>('bars');
  const group = exposure.breakdowns.find((entry) => entry.dimension === dimension);
  const ranked = group ? rankedExposure(group.allocations) : [];
  function allocations(rows: NonNullable<typeof group>['allocations']) {
    return rows.map((row) => (
      <details key={row.label} className="border-b py-3 last:border-b-0">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          <div className="min-w-0 flex-1">
            <span className="font-medium">{row.label}</span>
            <span className="ml-2 text-xs text-muted-foreground underline decoration-dotted">
              Show contributing funds
            </span>
          </div>
          <div className="shrink-0 text-right tabular-nums">
            <p>{exposureMoney(row.value, currency)}</p>
            <p className="text-xs text-muted-foreground">{exposurePercent(row.percent)} of selected gross assets</p>
          </div>
        </summary>
        <div className="mt-3 space-y-3 rounded bg-muted/40 p-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSelectFunds(row.contributions.map((item) => item.positionId))}
          >
            Filter to these holdings
          </Button>
          <p className="text-xs text-muted-foreground">
            This selects the contributing holdings across the page. Their other exposures remain included.
          </p>
          {row.contributions.map((contribution) => (
            <div key={contribution.positionId} className="text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span>{contribution.name}</span>
                <span className="tabular-nums">{exposureMoney(contribution.value, currency)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {decimal(row.value) > 0n
                  ? `${exposurePercent(decimalText((decimal(contribution.value) * 100n * SCALE) / decimal(row.value)))} of this ${dimension === 'assetClass' ? 'asset class' : dimension} exposure. `
                  : 'Net exposure is zero or negative; no share percentage. '}
                {exposurePercent(String(Number(contribution.weight) * 100))} of this holding. Disclosure{' '}
                {contribution.allocationDate}.
              </p>
              <details className="mt-1 text-xs text-muted-foreground">
                <summary className="cursor-pointer">View source</summary>
                <p className="mt-2 break-words">{contribution.source}</p>
                <p className="mt-2 whitespace-pre-wrap break-words">{contribution.evidence}</p>
              </details>
            </div>
          ))}
        </div>
      </details>
    ));
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Where your assets are exposed</CardTitle>
            <CardDescription>Choose a breakdown, then open an allocation to see the funds behind it.</CardDescription>
          </div>
          <div className="flex gap-2" aria-label="Exposure view">
            <Button
              variant={view === 'bars' ? 'default' : 'outline'}
              size="sm"
              aria-pressed={view === 'bars'}
              onClick={() => setView('bars')}
            >
              Bars
            </Button>
            <Button
              variant={view === 'table' ? 'default' : 'outline'}
              size="sm"
              aria-pressed={view === 'table'}
              onClick={() => setView('table')}
            >
              Table
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Exposure dimension">
          {exposure.breakdowns.map((entry) => (
            <Button
              key={entry.dimension}
              size="sm"
              variant={dimension === entry.dimension ? 'default' : 'outline'}
              aria-pressed={dimension === entry.dimension}
              onClick={() => setDimension(entry.dimension)}
            >
              {entry.dimension === 'country' ? 'Country' : entry.dimension === 'industry' ? 'Industry' : 'Asset class'}
            </Button>
          ))}
        </div>
      </CardHeader>
      {group && (
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            {exposureMoney(group.covered, currency)} has complete{' '}
            {dimension === 'assetClass' ? 'asset class' : dimension} coverage.{' '}
            {exposureMoney(group.unresolved, currency)} has partial or missing coverage.
          </p>
          {view === 'bars' && (
            <FinanceBarChart
              title={`${dimension === 'assetClass' ? 'Asset class' : dimension} exposure`}
              rows={ranked.slice(0, 8).map((row) => ({
                label: row.label,
                value: Number(row.value),
                detail: `${exposurePercent(row.percent)} of selected gross assets`,
              }))}
              formatValue={(value) => exposureMoney(String(value), currency)}
            />
          )}
          {allocations(ranked.slice(0, 8))}
          {ranked.length > 8 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-medium">Show {ranked.length - 8} other allocations</summary>
              <div className="mt-2">{allocations(ranked.slice(8))}</div>
            </details>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Known allocations include partial disclosures and signed offsets. Each breakdown describes the same assets;
            country and industry totals cannot be combined.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
