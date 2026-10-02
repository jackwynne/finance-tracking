import { useQuery } from 'convex/react';
import { useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { api } from '../../../convex/_generated/api';
import { FinanceObservationChart } from './finance-charts';

export function PortfolioHistory({ asOf }: { asOf: string }) {
  const series = useQuery(api.portfolioHistory.recordedBalances, { asOf });
  const [choice, setChoice] = useState('');
  const available = series?.filter((item) => item.observations.length > 0) ?? [];
  const selected =
    available.find((item) => item.id === choice) ??
    available.find((item) => item.observations.length > 1) ??
    available.at(0);
  const formatValue = (value: number) =>
    new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: selected?.currency ?? 'NZD',
      maximumFractionDigits: 0,
    }).format(value);
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Recorded balance history</CardTitle>
        <CardDescription>
          Compare dated statements for one account or holding in its original currency. Gaps between observations remain
          unfilled.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!series ? (
          <p>Loading balance history...</p>
        ) : !selected ? (
          <p className="text-sm text-muted-foreground">
            Load a dated bank statement or holding snapshot to start a history.
          </p>
        ) : (
          <>
            <label className="block text-sm">
              Account or holding
              <select
                aria-label="Balance history account or holding"
                className="mt-1 block max-w-full rounded-md border bg-background px-3 py-2"
                value={selected.id}
                onChange={(event) => setChoice(event.target.value)}
              >
                {available.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.currency}
                  </option>
                ))}
              </select>
            </label>
            <FinanceObservationChart
              rows={selected.observations.map((item) => ({ date: item.date, value: Number(item.value) }))}
              title={`${selected.name} recorded balances in ${selected.currency}`}
              formatValue={formatValue}
            />
            <p className="text-sm text-muted-foreground">
              {selected.observations.length === 1
                ? 'Only one dated observation is available. Load earlier statements to see a trend. '
                : ''}
              Balance changes include deposits, withdrawals and valuation changes. They do not measure investment
              returns or total net worth. {selected.truncated ? 'Only the latest 120 source records are shown.' : ''}
            </p>
            <details>
              <summary className="cursor-pointer text-sm">Dated observations and sources</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="p-2">Date</th>
                      <th className="p-2">Recorded balance</th>
                      <th className="p-2">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.observations.map((item) => (
                      <tr key={item.date} className="border-t">
                        <td className="p-2">{item.date}</td>
                        <td className="p-2">
                          {selected.currency} {item.value}
                        </td>
                        <td className="p-2">{item.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
