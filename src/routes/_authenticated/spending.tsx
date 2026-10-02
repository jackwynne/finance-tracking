import { createFileRoute, Link } from '@tanstack/react-router';
import { useAction, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FinanceMonthlyChart } from '@/features/finance/finance-charts';
import { PageHeading } from '@/features/finance/finance-ui';
import { financeErrorMessage } from '@/lib/finance-error';

import { api } from '../../../convex/_generated/api';

export const Route = createFileRoute('/_authenticated/spending')({ component: Spending });

function Spending() {
  const profile = useQuery(api.profiles.current, {});
  const timezone = profile?.timezone ?? 'Pacific/Auckland';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (kind: string) => parts.find((item) => item.type === kind)?.value ?? '';
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const [month, setMonth] = useState(today.slice(0, 7));
  const [currencyChoice, setCurrency] = useState<'NZD' | 'AUD' | null>(null);
  const currency = currencyChoice ?? (profile?.baseCurrency === 'AUD' ? 'AUD' : 'NZD');
  const refreshRates = useAction(api.fxActions.refresh);
  const [refreshing, setRefreshing] = useState(false);
  const from = `${month}-01`;
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
  const to = month === today.slice(0, 7) ? today : lastDay;
  const data = useQuery(api.spending.summary, { from, to, currency });
  const format = (value: bigint) =>
    new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(Number(value) / 100);
  const max = Math.max(1, ...(data?.current.categories.map((item) => Math.abs(Number(item.amountMinor))) ?? []));
  return (
    <>
      <PageHeading
        eyebrow="Your cash flow"
        title="Spending"
        description="Booked expenses and refunds, with investment contributions and debt principal shown separately."
      />
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <label className="text-sm">
          Month
          <Input
            aria-label="Spending month"
            type="month"
            value={month}
            max={today.slice(0, 7)}
            onChange={(event) => {
              if (/^\d{4}-\d{2}$/.test(event.target.value)) setMonth(event.target.value);
            }}
          />
        </label>
        <label className="text-sm">
          Report currency
          <select
            className="mt-1 block rounded-md border bg-background px-3 py-2"
            aria-label="Report currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value === 'AUD' ? 'AUD' : 'NZD')}
          >
            <option>NZD</option>
            <option>AUD</option>
          </select>
        </label>
        <span className="pb-2 text-sm text-muted-foreground">
          {from} to {to} · {timezone}
        </span>
        <Button
          disabled={refreshing}
          variant="outline"
          onClick={() => {
            setRefreshing(true);
            void refreshRates({ from, to })
              .then((result) => toast.success(`Refreshed ${result.stored / 2} published daily rates.`))
              .catch((error) => toast.error(financeErrorMessage(error)))
              .finally(() => setRefreshing(false));
          }}
        >
          {refreshing ? 'Refreshing rates...' : 'Refresh exchange rates'}
        </Button>
      </div>
      {!data ? (
        <p>Loading spending...</p>
      ) : (
        <>
          {(!data.current.complete || !data.comparison.complete || data.coverageIncomplete) && (
            <div
              role="status"
              className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
            >
              This report is incomplete.{' '}
              {data.current.truncated || data.comparison.truncated
                ? 'The monthly read limit was reached. Review a complete transaction export before relying on this total.'
                : ''}{' '}
              {data.current.missingFx
                .map((item) => `${item.count} ${item.currency} transactions have no supported rate.`)
                .join(' ')}{' '}
              {data.coverageIncomplete
                ? 'Some accounts have missing dates in this or the comparison period. Check coverage below.'
                : ''}
            </div>
          )}
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <Metric
              title="Spending"
              value={format(data.current.spendingMinor)}
              detail={`${data.current.unclassifiedCount} unclassified transactions included`}
            />
            <Metric
              title="Previous comparable period"
              value={format(data.comparison.spendingMinor)}
              detail={`${data.comparison.from} to ${data.comparison.to}`}
            />
            <Metric
              title="Income"
              value={format(data.current.incomeMinor)}
              detail={`${data.current.transfers} confirmed transfer movements excluded`}
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Broad categories</CardTitle>
                <CardDescription>Refunds reduce spending in their posting month.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {data.current.categories.length ? (
                  data.current.categories.map((item) => (
                    <div key={item.name}>
                      <div className="mb-2 flex justify-between gap-4">
                        <span>
                          {item.name} <span className="text-xs text-muted-foreground">{item.count}</span>
                        </span>
                        <span>{format(item.amountMinor)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className={`h-2 rounded-full ${item.amountMinor < 0n ? 'bg-sky-500' : 'bg-primary'}`}
                          style={{ width: `${(Math.abs(Number(item.amountMinor)) / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No spending in this period.</p>
                )}
                <Link
                  to="/transactions"
                  search={{ account: undefined, category: undefined }}
                  className="inline-block text-sm underline"
                >
                  Review transactions
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Other movements</CardTitle>
                <CardDescription>These amounts do not count as consumption.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span>Investment contributions</span>
                  <span>{format(data.current.investmentMinor)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Debt principal</span>
                  <span>{format(data.current.debtPrincipalMinor)}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Interest and identifiable bank fees remain expenses. Suggested transfers remain in spending until
                  confirmed.
                </p>
                <p className="text-sm text-muted-foreground">
                  Refresh exchange rates loads public ECB reference rates through Frankfurter for this month and the
                  previous three months, without a bank connection or API key. Daily FX uses the latest published rate
                  on or before the posting date, at most seven days old. {data.current.fallbackRateCount} transactions
                  use a preceding rate. Missing rates stay outside converted totals.
                </p>
              </CardContent>
            </Card>
          </div>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Monthly trend</CardTitle>
              <CardDescription>
                Prior calendar months alongside the selected period. Missing coverage, rates and read limits remain
                visible.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MonthlyTrend month={month} currency={currency} current={data} toDate={to !== lastDay} />
            </CardContent>
          </Card>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Account coverage</CardTitle>
              <CardDescription>
                Check source dates before treating lower spending as a change in habits.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {data.coverage.map((account) => (
                <div key={account.id}>
                  <div className="font-medium">
                    {account.name} · {account.currency}
                  </div>
                  {account.ranges.length ? (
                    account.ranges.map((range, index) => (
                      <p key={`${range.source}-${index}`} className="text-sm text-muted-foreground">
                        {range.from} to {range.to} · {range.source}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No committed statement coverage recorded.</p>
                  )}
                  {account.currentGaps.length > 0 && (
                    <p className="text-sm text-amber-700">
                      Missing current-period coverage:{' '}
                      {account.currentGaps.map((gap) => `${gap.from} to ${gap.to}`).join('; ')}
                    </p>
                  )}
                  {account.comparisonGaps.length > 0 && (
                    <p className="text-sm text-amber-700">
                      Missing comparison coverage:{' '}
                      {account.comparisonGaps.map((gap) => `${gap.from} to ${gap.to}`).join('; ')}
                    </p>
                  )}
                </div>
              ))}
              {data.current.usedRates.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm">Rates used</summary>
                  {data.current.usedRates.map((rate) => (
                    <p key={`${rate.from}-${rate.date}`} className="text-sm text-muted-foreground">
                      {rate.from} to {rate.to} · {rate.date} · {rate.source}
                    </p>
                  ))}
                </details>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{detail}</CardContent>
    </Card>
  );
}

function MonthlyTrend({
  month,
  currency,
  current,
  toDate,
}: {
  month: string;
  currency: 'NZD' | 'AUD';
  current: FunctionReturnType<typeof api.spending.summary>;
  toDate: boolean;
}) {
  const periods = [3, 2, 1].map((offset) => {
    const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 - offset, 1));
    const from = date.toISOString().slice(0, 10);
    const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    return { from, to, currency };
  });
  const first = useQuery(api.spending.summary, periods[0]);
  const second = useQuery(api.spending.summary, periods[1]);
  const third = useQuery(api.spending.summary, periods[2]);
  const summaries = [first, second, third, current];
  const formatValue = (value: number) => new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(value);
  const rows = summaries.flatMap((summary, index) => {
    if (!summary) return [];
    const label = summary.current.from.slice(0, 7);
    const incomplete = !summary.current.complete || summary.coverage.some((account) => account.currentGaps.length > 0);
    return [
      {
        label: `${label}${index === 3 && toDate ? ' to date' : ''}${incomplete ? ' *' : ''}`,
        value: Number(summary.current.spendingMinor) / 100,
        detail: incomplete ? 'Incomplete coverage or conversion' : 'Recorded spending',
      },
    ];
  });
  return (
    <div className="space-y-4">
      {summaries.some((summary) => !summary) ? (
        <p className="text-sm text-muted-foreground">Loading monthly trend...</p>
      ) : (
        <FinanceMonthlyChart rows={rows} title={`Monthly recorded spending in ${currency}`} formatValue={formatValue} />
      )}
      <p className="text-sm text-muted-foreground">
        * Incomplete source coverage or conversion. The current month is shown to date. Lower recorded spending may
        reflect missing statements or fewer days.
      </p>
      <div className="grid gap-4 sm:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label}>
            <p className="text-sm text-muted-foreground">{row.label}</p>
            <p className="font-heading text-lg">{formatValue(row.value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
