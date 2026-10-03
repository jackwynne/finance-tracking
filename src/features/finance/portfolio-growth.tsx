import { useQuery } from 'convex/react';
import { useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { api } from '../../../convex/_generated/api';
import { combineAssetGrowth } from './asset-growth';
import { FinanceContributionChart } from './finance-charts';

export function PortfolioGrowth({ asOf, currency }: { asOf: string; currency: string }) {
  const assets = useQuery(api.portfolioPerformance.allAssets, { asOf, reportingCurrency: currency });
  const [choice, setChoice] = useState('all');
  const selected = assets?.find((asset) => asset.id === choice);
  const covered = assets?.filter((asset) => asset.observations.some((row) => row.value !== null)) ?? [];
  const rows = selected
    ? selected.observations.map((row) => ({
        date: row.date,
        capital: Number(row.capital),
        value: row.value === null ? null : Number(row.value),
      }))
    : combineAssetGrowth(covered.map((asset) => asset.observations));
  const latest = rows.filter((row) => row.value !== null).at(-1);
  const formatValue = (value: number) =>
    new Intl.NumberFormat('en-NZ', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Invested and growth</CardTitle>
          <CardDescription>
            Opening value and net contributions, with growth after income, fees and currency movements.
          </CardDescription>
        </div>
        <label className="text-sm">
          Assets
          <select
            aria-label="Invested and growth assets"
            className="mt-1 block max-w-full rounded-md border bg-background px-3 py-2"
            value={selected?.id ?? 'all'}
            onChange={(event) => setChoice(event.target.value)}
          >
            <option value="all">All assets · {currency}</option>
            {assets?.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>
      </CardHeader>
      <CardContent className="space-y-4">
        {!assets ? (
          <p className="text-sm text-muted-foreground">Loading asset history...</p>
        ) : (
          <>
            {!selected && (
              <p className="text-sm text-muted-foreground">
                {covered.length} of {assets.length} assets have contribution and valuation history. The combined chart
                includes those assets only.
              </p>
            )}
            {latest && latest.value !== null && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  { label: 'Invested capital', value: latest.capital },
                  { label: 'Growth', value: latest.value - latest.capital },
                  { label: 'Investment value', value: latest.value },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="font-heading text-xl tabular-nums">{formatValue(item.value)}</p>
                  </div>
                ))}
              </div>
            )}
            {rows.length ? (
              <FinanceContributionChart
                rows={rows}
                title={`${selected?.name ?? 'Covered assets'} invested capital and growth in ${currency}`}
                formatValue={formatValue}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Contribution amounts and dated valuations are needed to show invested capital and growth. Open History
                setup below to link an investment ledger and confirm its opening balance.
              </p>
            )}
            {!selected && rows.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Combined history starts when every included asset has recorded history. Each asset's latest observation
                is carried forward between its dates, so totals combine values recorded on different dates. Missing
                valuations leave gaps. Latest combined observation: {latest?.date ?? 'unavailable'}.
              </p>
            )}
            {selected?.issues.map((issue) => (
              <p key={issue} className="text-sm text-muted-foreground">
                {issue}
              </p>
            ))}
            {!selected && assets.some((asset) => !covered.includes(asset)) && (
              <details>
                <summary className="cursor-pointer text-sm">
                  Assets needing history · {assets.length - covered.length}
                </summary>
                <ul className="mt-3 space-y-3 text-sm">
                  {assets
                    .filter((asset) => !covered.includes(asset))
                    .map((asset) => (
                      <li key={asset.id}>
                        <p className="font-medium">{asset.name}</p>
                        <p className="text-muted-foreground">
                          {asset.issues.join(' ') || 'No dated valuations are available.'}
                        </p>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
