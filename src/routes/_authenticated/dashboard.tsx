import { IconArrowsExchange, IconPigMoney, IconTrendingDown, IconTrendingUp, IconWallet } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  aucklandToday,
  EmptyState,
  formatMoney,
  money,
  nzDate,
  oneYearEarlier,
  PageHeading,
} from '@/features/finance/finance-ui';

import { api } from '../../../convex/_generated/api';

export const Route = createFileRoute('/_authenticated/dashboard')({
  validateSearch: (search: Record<string, unknown>) => ({
    from: typeof search.from === 'string' ? search.from : undefined,
    to: typeof search.to === 'string' ? search.to : undefined,
  }),
  component: DashboardRoute,
});

function DashboardRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <Dashboard
      requestedDateFrom={search.from}
      requestedDateTo={search.to}
      onDateRangeChange={(from, to) => {
        void navigate({
          search: { from: from || undefined, to: to || undefined },
          replace: true,
        });
      }}
    />
  );
}

function Dashboard({
  requestedDateFrom,
  requestedDateTo,
  onDateRangeChange,
}: {
  requestedDateFrom?: string;
  requestedDateTo?: string;
  onDateRangeChange: (dateFrom: string, dateTo: string) => void;
}) {
  const today = useMemo(() => aucklandToday(), []);
  const dateFrom = requestedDateFrom || `${today.slice(0, 7)}-01`;
  const dateTo = requestedDateTo || today;
  const ytdStart = `${today.slice(0, 4)}-01-01`;
  const last12Start = oneYearEarlier(today);
  const datePreset =
    dateTo !== today
      ? 'custom'
      : dateFrom === ytdStart
        ? 'ytd'
        : dateFrom === last12Start
          ? 'last12'
          : dateFrom === '1900-01-01'
            ? 'all'
            : 'custom';
  const data = useQuery(api.finance.dashboard, { dateFrom, dateTo, currentDate: today });
  const chartData =
    data?.monthly.map((item) => ({
      month: item.month.slice(5),
      Income: Number(item.incomeMinor) / 100,
      Spending: Number(item.spendingMinor) / 100,
      Invested: Number(item.investedMinor) / 100,
    })) ?? [];

  function applyDatePreset(preset: 'ytd' | 'last12' | 'all') {
    if (preset === 'ytd') onDateRangeChange(ytdStart, today);
    else if (preset === 'last12') onDateRangeChange(last12Start, today);
    else onDateRangeChange('1900-01-01', today);
  }

  return (
    <>
      <PageHeading
        eyebrow="Overview"
        title="Your money, clearly."
        description="Settled activity only. Confirmed transfers are removed, investments are separated from spending, and refunds reduce their original category."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <div className="flex flex-wrap gap-1.5 sm:justify-end">
              <Button
                size="sm"
                variant={datePreset === 'ytd' ? 'default' : 'outline'}
                aria-pressed={datePreset === 'ytd'}
                onClick={() => applyDatePreset('ytd')}
              >
                YTD
              </Button>
              <Button
                size="sm"
                variant={datePreset === 'last12' ? 'default' : 'outline'}
                aria-pressed={datePreset === 'last12'}
                onClick={() => applyDatePreset('last12')}
              >
                Last 12 months
              </Button>
              <Button
                size="sm"
                variant={datePreset === 'all' ? 'default' : 'outline'}
                aria-pressed={datePreset === 'all'}
                onClick={() => applyDatePreset('all')}
              >
                All time
              </Button>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:w-[19rem]">
              <Input
                aria-label="From date"
                type="date"
                value={dateFrom}
                onChange={(event) => onDateRangeChange(event.target.value, dateTo)}
              />
              <Input
                aria-label="To date"
                type="date"
                value={dateTo}
                onChange={(event) => onDateRangeChange(dateFrom, event.target.value)}
              />
            </div>
          </div>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Metric
          title="Net worth"
          value={formatMoney(data?.netWorthMinor)}
          detail={`As at ${nzDate(data?.asOf)}`}
          icon={IconWallet}
        />
        <Metric
          title="Income"
          value={formatMoney(data?.incomeMinor)}
          detail={`${data?.transactionCount ?? 0} settled transactions`}
          icon={IconTrendingUp}
          positive
        />
        <Metric
          title="Spending"
          value={formatMoney(data?.spendingMinor)}
          detail="Transfers excluded"
          icon={IconTrendingDown}
        />
        <Metric
          title="Invested"
          value={formatMoney(data?.investedMinor)}
          detail="Long-term savings and asset purchases"
          icon={IconPigMoney}
          positive
        />
        <Metric
          title="Net cash flow"
          value={formatMoney(data?.netCashFlowMinor)}
          detail="Income less spending and investments"
          icon={IconArrowsExchange}
          positive={Number(data?.netCashFlowMinor ?? 0n) >= 0}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Cash-flow trend</CardTitle>
            <CardDescription>Income, spending, and investing by month</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={chartData} barGap={6}>
                  <CartesianGrid vertical={false} stroke="#dfe5dc" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => money.format(Number(value))} cursor={{ fill: '#edf1ea' }} />
                  <Bar dataKey="Income" fill="#225c49" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="Spending" fill="#c8f46a" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="Invested" fill="#8f6f38" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No cash flow yet" detail="Import an OFX or Excel export to populate this chart." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
            <CardDescription>Refunds offset the matching category</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data?.categoryTotals.length ? (
              data.categoryTotals.map((item, index) => {
                const maximum = Number(data.categoryTotals[0]?.amountMinor ?? 1n);
                return (
                  <div key={item.id}>
                    <div className="mb-1.5 flex justify-between gap-3 text-sm">
                      <span>{item.name}</span>
                      <span className="font-heading font-medium">{formatMoney(item.amountMinor)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.max(3, (Number(item.amountMinor) / maximum) * 100)}%`,
                          opacity: 1 - index * 0.07,
                        }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState
                title="Nothing to break down"
                detail="Categories will appear as transactions are imported and classified."
              />
            )}
          </CardContent>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top counterparties</CardTitle>
            <CardDescription>Your largest sources of spending</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {data?.counterpartyTotals.length ? (
              data.counterpartyTotals.map((item) => (
                <div key={item.id} className="flex items-center justify-between border-b py-3 last:border-0">
                  <span>{item.name}</span>
                  <span className="font-heading font-medium">{formatMoney(item.amountMinor)}</span>
                </div>
              ))
            ) : (
              <EmptyState title="No counterparties yet" detail="They are learned automatically during import." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Account balances</CardTitle>
            <CardDescription>Latest ledger balance used for net worth</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {data?.accounts.length ? (
              data.accounts.map((account) => (
                <div key={account._id} className="flex items-center justify-between border-b py-3 last:border-0">
                  <div>
                    <div>{account.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {account.mask} · {nzDate(account.balanceAsOf)}
                    </div>
                  </div>
                  <span className="font-heading font-medium">{formatMoney(account.currentLedgerMinor)}</span>
                </div>
              ))
            ) : (
              <EmptyState title="No accounts yet" detail="Your first import can create one automatically." />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Metric({
  title,
  value,
  detail,
  icon: Icon,
  positive,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof IconWallet;
  positive?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-1">
        <div className="mb-8 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{title}</span>
          <div
            className={`grid size-9 place-items-center rounded-lg ${positive ? 'bg-primary/10 text-primary' : 'bg-[#e9eee5] text-foreground'}`}
          >
            <Icon className="size-4" />
          </div>
        </div>
        <div className="font-heading text-2xl font-semibold">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}
