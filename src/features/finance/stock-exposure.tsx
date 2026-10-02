import type { FunctionReturnType } from 'convex/server';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import type { api } from '../../../convex/_generated/api';
import { exposureMoney, exposurePercent } from './exposure-format';
import { FinanceBarChart } from './finance-charts';

type Exposure = FunctionReturnType<typeof api.portfolio.getExposure>;

export function StockExposure({ exposure, currency }: { exposure: Exposure; currency: string }) {
  const stock = exposure.stockExposure;
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Stocks you own through your funds</CardTitle>
        <CardDescription>
          The same company can appear in several funds. These amounts combine its disclosed weights across your
          investments, using each fund's recorded value.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 border-y py-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Attributed to disclosed stocks</p>
            <p className="mt-1 font-heading text-xl font-semibold">{exposureMoney(stock.reportedValue, currency)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Investment value with a stock disclosure</p>
            <p className="mt-1 font-heading text-xl font-semibold">{exposurePercent(stock.sourceCoveragePercent)}</p>
            <p className="text-xs text-muted-foreground">
              {exposureMoney(stock.sourceCoverageValue, currency)} of {exposureMoney(stock.investmentsValue, currency)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Not attributed to named stocks</p>
            <p className="mt-1 font-heading text-xl font-semibold">{exposureMoney(stock.remainingUnknown, currency)}</p>
            <p className="text-xs text-muted-foreground">Partial lists leave other stocks and assets unknown.</p>
          </div>
        </div>
        {stock.stocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add a dated stock holdings disclosure for each fund through Updates to see which companies account for your
            investments. Country and industry disclosures do not identify individual stocks.
          </p>
        ) : (
          <>
            <FinanceBarChart
              title="Top disclosed stock exposures"
              rows={stock.stocks.slice(0, 10).map((row) => ({
                label: row.label,
                value: Number(row.value),
                detail: `${exposurePercent(row.percentOfGross)} of selected gross assets`,
              }))}
              formatValue={(value) => exposureMoney(String(value), currency)}
            />
            <div className="divide-y">
              {stock.stocks.slice(0, 10).map((row) => (
                <details key={row.issuerId} className="group py-3">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{row.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.contributions.length} {row.contributions.length === 1 ? 'holding' : 'holdings'}{' '}
                        contributing
                        <span className="ml-2 underline decoration-dotted">Show funds</span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <p className="font-medium">{exposureMoney(row.value, currency)}</p>
                      <p className="text-xs text-muted-foreground">
                        {exposurePercent(row.percentOfGross)} of selected gross assets
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.percentOfPortfolioNet === null
                          ? 'Whole net wealth share unavailable'
                          : `${exposurePercent(row.percentOfPortfolioNet)} of whole net wealth`}
                      </p>
                    </div>
                  </summary>
                  <div className="mt-3 space-y-3 rounded bg-muted/40 p-3 text-sm">
                    {row.contributions.map((contribution) => (
                      <div key={contribution.positionId}>
                        <div className="flex flex-wrap justify-between gap-2">
                          <span>{contribution.name}</span>
                          <span className="tabular-nums">{exposureMoney(contribution.value, currency)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Fund weight {exposurePercent(String(Number(contribution.weight) * 100))}. Composition dated{' '}
                          {contribution.allocationDate}.
                        </p>
                        <p className="mt-1 break-words text-xs text-muted-foreground">{contribution.source}</p>
                        <details className="mt-1 text-xs text-muted-foreground">
                          <summary className="cursor-pointer">Source evidence</summary>
                          <p className="mt-2 whitespace-pre-wrap break-words">{contribution.evidence}</p>
                        </details>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
            {stock.stocks.length > 10 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">
                  Show {stock.stocks.length - 10} other disclosed stocks
                </summary>
                <div className="mt-3 divide-y">
                  {stock.stocks.slice(10).map((row) => (
                    <div key={row.issuerId} className="flex justify-between gap-3 py-2">
                      <span>{row.label}</span>
                      <span className="tabular-nums">{exposureMoney(row.value, currency)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
        <p className="text-xs text-muted-foreground">
          These are attributed exposures within your existing assets. Partial disclosures can change the ranking when
          more holdings are added. Fund leverage can make disclosed exposure exceed the fund's value.
        </p>
        {stock.unknownPositions.length > 0 && (
          <p className="text-xs text-amber-700">
            {stock.unknownPositions.length} investment positions cannot be valued and are excluded from the stock
            amounts and coverage above.
          </p>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Disclosure coverage and dates</summary>
          <div className="mt-3 divide-y">
            {stock.sources.map((source) => (
              <div key={source.positionId} className="py-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{source.name}</span>
                  <span>
                    {source.status === 'missing'
                      ? 'No stock disclosure'
                      : source.status === 'complete'
                        ? 'Complete disclosure'
                        : 'Partial disclosure'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {exposureMoney(source.reportedValue, currency)} attributed of {exposureMoney(source.value, currency)}.
                  {source.allocationDate && ` Composition ${source.allocationDate}.`}
                  {source.valuationDate && ` Valuation ${source.valuationDate}.`}
                  {source.holdingsDate && ` Units ${source.holdingsDate}.`}
                </p>
                {source.source && <p className="mt-1 break-words text-xs text-muted-foreground">{source.source}</p>}
              </div>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
