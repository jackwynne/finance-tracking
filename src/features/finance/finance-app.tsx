import {
  IconArrowsExchange,
  IconBuildingBank,
  IconChartDonut,
  IconChevronRight,
  IconDownload,
  IconFileUpload,
  IconLayoutDashboard,
  IconLoader2,
  IconLogout,
  IconReceipt2,
  IconRefresh,
  IconTags,
  IconTrendingDown,
  IconTrendingUp,
  IconUsers,
  IconWallet,
} from '@tabler/icons-react';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Toaster } from '@/components/ui/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

type View = 'dashboard' | 'transactions' | 'counterparties' | 'accounts' | 'imports';

type FinanceAppProps = {
  userName: string;
  onSignOut: () => void;
};

const navigation = [
  { id: 'dashboard' as const, label: 'Dashboard', icon: IconLayoutDashboard },
  { id: 'transactions' as const, label: 'Transactions', icon: IconReceipt2 },
  { id: 'counterparties' as const, label: 'Counterparties', icon: IconUsers },
  { id: 'accounts' as const, label: 'Accounts', icon: IconWallet },
  { id: 'imports' as const, label: 'Imports', icon: IconFileUpload },
];

const money = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' });

function formatMoney(value: bigint | number | undefined) {
  if (value === undefined) return '—';
  return money.format(Number(value) / 100);
}

function nzDate(value: string | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-NZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Pacific/Auckland',
  }).format(new Date(`${value}T12:00:00+12:00`));
}

function aucklandToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Pacific/Auckland',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
  const tone =
    status === 'committed'
      ? 'default'
      : status === 'failed'
        ? 'destructive'
        : status === 'rolledBack'
          ? 'secondary'
          : 'outline';
  return <Badge variant={tone}>{label}</Badge>;
}

export function FinanceApp({ userName, onSignOut }: FinanceAppProps) {
  const [view, setView] = useState<View>('dashboard');
  const profile = useQuery(api.profiles.current);
  const ensureProfile = useMutation(api.profiles.ensureCurrent);

  useEffect(() => {
    if (profile === null)
      void ensureProfile().catch((error) =>
        toast.error(error instanceof Error ? error.message : 'Could not initialize your profile.'),
      );
  }, [profile, ensureProfile]);

  if (profile === undefined || profile === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f6f8f4]">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <IconLoader2 className="size-5 animate-spin text-primary" />
          Preparing your finance workspace…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7f2] text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto border-r border-black/8 bg-[#10241d] p-5 text-white lg:flex lg:flex-col">
          <div className="mb-9 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#c8f46a] text-[#10241d]">
              <IconChartDonut className="size-5" />
            </div>
            <div>
              <div className="font-heading text-lg font-semibold">Koru</div>
              <div className="text-xs text-white/55">Personal finance</div>
            </div>
          </div>
          <nav className="space-y-1">
            {navigation.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${view === item.id ? 'bg-white/12 text-white' : 'text-white/65 hover:bg-white/7 hover:text-white'}`}
              >
                <item.icon className="size-4" />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-auto border-t border-white/10 pt-5">
            <div className="mb-3 truncate text-xs text-white/55">{userName}</div>
            <Button
              variant="ghost"
              className="w-full justify-start text-white/70 hover:bg-white/10 hover:text-white"
              onClick={onSignOut}
            >
              <IconLogout />
              Sign out
            </Button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-black/7 bg-[#f5f7f2]/90 px-4 py-3 backdrop-blur md:px-8 lg:hidden">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-heading font-semibold">Koru</div>
              <Button variant="ghost" size="icon-sm" onClick={onSignOut}>
                <IconLogout />
              </Button>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {navigation.map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={view === item.id ? 'default' : 'ghost'}
                  onClick={() => setView(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </header>
          <div className="p-4 md:p-8 lg:p-10">
            {view === 'dashboard' && <Dashboard />}
            {view === 'transactions' && <Transactions />}
            {view === 'counterparties' && <Counterparties />}
            {view === 'accounts' && <Accounts />}
            {view === 'imports' && <Imports />}
          </div>
        </main>
      </div>
      <Toaster richColors position="top-right" />
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 font-heading text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

function Dashboard() {
  const today = useMemo(() => aucklandToday(), []);
  const [dateFrom, setDateFrom] = useState(`${today.slice(0, 7)}-01`);
  const [dateTo, setDateTo] = useState(today);
  const data = useQuery(api.finance.dashboard, { dateFrom, dateTo, currentDate: today });
  const chartData =
    data?.monthly.map((item) => ({
      month: item.month.slice(5),
      Income: Number(item.incomeMinor) / 100,
      Spending: Number(item.spendingMinor) / 100,
    })) ?? [];
  return (
    <>
      <PageHeading
        eyebrow="Overview"
        title="Your money, clearly."
        description="Settled activity only. Confirmed transfers are removed from cash-flow totals and refunds reduce their original spending category."
        action={
          <div className="flex gap-2">
            <Input
              aria-label="From date"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <Input
              aria-label="To date"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
          title="Net cash flow"
          value={formatMoney(data?.netCashFlowMinor)}
          detail="Income less spending"
          icon={IconArrowsExchange}
          positive={Number(data?.netCashFlowMinor ?? 0n) >= 0}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Cash-flow trend</CardTitle>
            <CardDescription>Income and spending by month</CardDescription>
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

function Transactions() {
  const categories = useQuery(api.finance.listCategories);
  const accounts = useQuery(api.finance.listAccounts, {});
  const update = useMutation(api.finance.updateTransaction);
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const { results, status, loadMore } = usePaginatedQuery(
    api.finance.listTransactions,
    {
      accountId: accountId ? (accountId as Id<'accounts'>) : undefined,
      categoryId: categoryId ? (categoryId as Id<'categories'>) : undefined,
    },
    { initialNumItems: 50 },
  );
  const flatCategories =
    categories?.flatMap((group) => group.categories.map((category) => ({ ...category, groupName: group.name }))) ?? [];
  return (
    <>
      <PageHeading
        eyebrow="Ledger"
        title="Transactions"
        description="Review every settled transaction, classify it, and preserve the original bank record underneath."
      />
      <Card>
        <CardHeader className="border-b sm:flex sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>All activity</CardTitle>
            <CardDescription>{results.length} loaded transactions</CardDescription>
          </div>
          <div className="mt-3 flex gap-2 sm:mt-0">
            <NativeSelect
              aria-label="Filter by account"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">All accounts</option>
              {accounts?.map((account) => (
                <option key={account._id} value={account._id}>
                  {account.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Filter by category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">All categories</option>
              {flatCategories.map((category) => (
                <option key={category._id} value={category._id}>
                  {category.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {results.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Date</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="pr-4 text-right">Report</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((transaction) => (
                  <TableRow key={transaction._id} className={transaction.excluded ? 'opacity-50' : ''}>
                    <TableCell className="pl-4 text-muted-foreground">{nzDate(transaction.postedDate)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{transaction.counterparty?.name ?? transaction.rawDescription}</div>
                      <div className="max-w-72 truncate text-xs text-muted-foreground">
                        {transaction.rawDescription}
                      </div>
                    </TableCell>
                    <TableCell>{transaction.account?.name}</TableCell>
                    <TableCell>
                      <NativeSelect
                        aria-label={`Category for ${transaction.rawDescription}`}
                        value={transaction.categoryId ?? ''}
                        onChange={(event) =>
                          void update({
                            transactionId: transaction._id,
                            categoryId: event.target.value ? (event.target.value as Id<'categories'>) : null,
                            scope: 'transaction',
                          }).catch(showError)
                        }
                      >
                        <option value="">Uncategorized</option>
                        {flatCategories.map((category) => (
                          <option key={category._id} value={category._id}>
                            {category.groupName} · {category.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </TableCell>
                    <TableCell
                      className={`text-right font-heading font-semibold ${transaction.amountMinor >= 0n ? 'text-primary' : ''}`}
                    >
                      {formatMoney(transaction.amountMinor)}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() =>
                          void update({
                            transactionId: transaction._id,
                            excluded: !transaction.excluded,
                            scope: 'transaction',
                          }).catch(showError)
                        }
                      >
                        {transaction.excluded ? 'Include' : 'Exclude'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="No transactions yet" detail="Upload an OFX or Excel export from the Imports screen." />
          )}
          {status === 'CanLoadMore' && (
            <div className="border-t p-4 text-center">
              <Button variant="outline" onClick={() => loadMore(50)}>
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Counterparties() {
  const counterparties = useQuery(api.finance.listCounterparties);
  const categories = useQuery(api.finance.listCategories);
  const update = useMutation(api.finance.updateCounterparty);
  const flatCategories =
    categories?.flatMap((group) => group.categories.map((category) => ({ ...category, groupName: group.name }))) ?? [];
  return (
    <>
      <PageHeading
        eyebrow="Classification"
        title="Counterparties"
        description="Classify a merchant or payer once. Confirmed defaults are reused automatically on future imports."
      />
      <Card>
        <CardContent className="px-0 pt-0">
          {counterparties?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Aliases</TableHead>
                  <TableHead>Default category</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                  <TableHead className="pr-4 text-right">Money out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {counterparties.map((counterparty) => (
                  <TableRow key={counterparty._id}>
                    <TableCell className="pl-4 font-medium">{counterparty.name}</TableCell>
                    <TableCell className="text-muted-foreground">{counterparty.aliases.length}</TableCell>
                    <TableCell>
                      <NativeSelect
                        aria-label={`Default category for ${counterparty.name}`}
                        value={counterparty.defaultCategoryId ?? ''}
                        onChange={(event) =>
                          void update({
                            counterpartyId: counterparty._id,
                            defaultCategoryId: event.target.value ? (event.target.value as Id<'categories'>) : null,
                          }).catch(showError)
                        }
                      >
                        <option value="">No default</option>
                        {flatCategories.map((category) => (
                          <option key={category._id} value={category._id}>
                            {category.groupName} · {category.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </TableCell>
                    <TableCell className="text-right">{counterparty.transactionCount}</TableCell>
                    <TableCell className="pr-4 text-right font-heading font-medium">
                      {formatMoney(counterparty.moneyOutMinor)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No counterparties yet"
              detail="Distinct merchants and payers are created during import."
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Accounts() {
  const accounts = useQuery(api.finance.listAccounts, {});
  const createAccount = useMutation(api.finance.createAccount);
  const addBalance = useMutation(api.finance.addBalanceSnapshot);
  const updateAccount = useMutation(api.finance.updateAccount);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  return (
    <>
      <PageHeading
        eyebrow="Net worth"
        title="Accounts"
        description="Ledger balances drive net worth; available balances show what is currently spendable."
        action={
          <Button onClick={() => setShowCreate((value) => !value)}>
            <IconBuildingBank />
            Add account
          </Button>
        }
      />
      {showCreate && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create an account</CardTitle>
            <CardDescription>Imports can also detect and create accounts for you.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                void createAccount({ name, type: 'other', currency: 'NZD', mask: 'Manual' })
                  .then(() => {
                    setName('');
                    setShowCreate(false);
                    toast.success('Account created.');
                  })
                  .catch(showError);
              }}
            >
              <Input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Account name"
              />
              <Button type="submit">Create account</Button>
            </form>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {accounts?.length ? (
          accounts.map((account) => (
            <AccountCard
              key={account._id}
              account={account}
              onBalance={(date, ledgerMinor) => addBalance({ accountId: account._id, date, ledgerMinor })}
              onArchive={() => updateAccount({ accountId: account._id, archived: true })}
            />
          ))
        ) : (
          <Card className="md:col-span-2 xl:col-span-3">
            <EmptyState
              title="No accounts yet"
              detail="Create one manually or confirm the account detected during your first import."
            />
          </Card>
        )}
      </div>
    </>
  );
}

function AccountCard({
  account,
  onBalance,
  onArchive,
}: {
  account: NonNullable<ReturnType<typeof useQuery<typeof api.finance.listAccounts>>>[number];
  onBalance: (date: string, ledgerMinor: bigint) => Promise<unknown>;
  onArchive: () => Promise<unknown>;
}) {
  const [balance, setBalance] = useState('');
  const [date, setDate] = useState(aucklandToday());
  return (
    <Card>
      <CardHeader>
        <div className="mb-4 flex items-start justify-between">
          <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <IconBuildingBank />
          </div>
          <Badge variant="outline">{account.type}</Badge>
        </div>
        <CardTitle>{account.name}</CardTitle>
        <CardDescription>
          {account.institution ? `${account.institution} · ` : ''}
          {account.mask}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-5 font-heading text-2xl font-semibold">{formatMoney(account.currentLedgerMinor)}</div>
        <div className="mb-4 flex justify-between text-xs text-muted-foreground">
          <span>Available {formatMoney(account.currentAvailableMinor)}</span>
          <span>{nzDate(account.balanceAsOf)}</span>
        </div>
        <form
          className="grid grid-cols-[1fr_1fr_auto] gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void onBalance(date, BigInt(Math.round(Number(balance) * 100)))
              .then(() => {
                setBalance('');
                toast.success('Balance updated.');
              })
              .catch(showError);
          }}
        >
          <Input
            aria-label={`Balance for ${account.name}`}
            type="number"
            step="0.01"
            placeholder="Balance"
            value={balance}
            onChange={(event) => setBalance(event.target.value)}
            required
          />
          <Input
            aria-label={`Balance date for ${account.name}`}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
          <Button type="submit" size="icon">
            <IconRefresh />
          </Button>
        </form>
        <Button className="mt-3 w-full" variant="ghost" size="sm" onClick={() => void onArchive().catch(showError)}>
          Archive account
        </Button>
      </CardContent>
    </Card>
  );
}

function Imports() {
  const fileRef = useRef<HTMLInputElement>(null);
  const imports = useQuery(api.imports.list);
  const accounts = useQuery(api.finance.listAccounts, {});
  const generateUrl = useMutation(api.imports.generateUploadUrl);
  const createImport = useMutation(api.imports.create);
  const confirmAccount = useMutation(api.imports.confirmAccount);
  const commit = useMutation(api.imports.commit);
  const rollback = useMutation(api.imports.rollback);
  const resolveDuplicate = useMutation(api.imports.resolvePossibleDuplicate);
  const [selectedId, setSelectedId] = useState<Id<'imports'> | null>(null);
  const [accountId, setAccountId] = useState('');
  const [uploading, setUploading] = useState(false);
  const preview = useQuery(api.imports.preview, selectedId ? { importId: selectedId } : 'skip');
  const downloadUrl = useQuery(api.imports.sourceDownloadUrl, selectedId ? { importId: selectedId } : 'skip');
  const selected = preview?.importJob;

  async function upload(file: File) {
    if (!/\.(ofx|xlsx)$/i.test(file.name)) return toast.error('Choose an OFX or XLSX file.');
    setUploading(true);
    try {
      const url = await generateUrl();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!response.ok) throw new Error('The file upload failed.');
      const { storageId } = (await response.json()) as { storageId: Id<'_storage'> };
      const importId = await createImport({ storageId, fileName: file.name });
      setSelectedId(importId);
      toast.success('File uploaded. Parsing has started.');
    } catch (error) {
      showError(error);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Source data"
        title="Imports"
        description="Upload, review, and commit settled transactions. Original files stay private in Convex Storage for audit and rollback."
        action={
          <>
            <input
              ref={fileRef}
              className="hidden"
              type="file"
              accept=".ofx,.xlsx"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = '';
              }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <IconLoader2 className="animate-spin" /> : <IconFileUpload />}Upload file
            </Button>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Import history</CardTitle>
            <CardDescription>Newest first</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {imports?.length ? (
              imports.map((item) => (
                <button
                  type="button"
                  key={item._id}
                  onClick={() => {
                    setSelectedId(item._id);
                    setAccountId('');
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${selectedId === item._id ? 'border-primary bg-primary/5' : 'hover:bg-muted/60'}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{item.fileName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(item.startedAt).toLocaleString('en-NZ')}
                    </div>
                  </div>
                  <StatusBadge status={item.status} />
                  <IconChevronRight className="size-4 text-muted-foreground" />
                </button>
              ))
            ) : (
              <EmptyState
                title="No imports yet"
                detail="OFX is recommended; the supplied Excel layouts are also supported."
              />
            )}
          </CardContent>
        </Card>
        <Card>
          {!selected ? (
            <EmptyState
              title="Choose an import"
              detail="Select an earlier file or upload a new one to review its status."
            />
          ) : (
            <>
              <CardHeader className="border-b">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <CardTitle>{selected.fileName}</CardTitle>
                    <CardDescription>
                      {selected.dateFrom && selected.dateTo
                        ? `${nzDate(selected.dateFrom)} – ${nzDate(selected.dateTo)}`
                        : 'Waiting for transaction dates'}{' '}
                      · {selected.format.toUpperCase()}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={selected.status} />
                    {downloadUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<a href={downloadUrl} download={selected.fileName} />}
                      >
                        <IconDownload />
                        Source
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {(selected.status === 'uploaded' ||
                  selected.status === 'parsing' ||
                  selected.status === 'committing') && (
                  <div className="space-y-3 py-6 text-center">
                    <IconLoader2 className="mx-auto size-7 animate-spin text-primary" />
                    <div className="font-heading font-medium">
                      {selected.status === 'committing' ? 'Applying your import…' : 'Reading your bank export…'}
                    </div>
                    <Progress value={selected.totalRows ? (selected.committedRows / selected.totalRows) * 100 : 35} />
                  </div>
                )}
                {selected.error && (
                  <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
                    {selected.error}
                  </div>
                )}
                {selected.totalRows > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <ImportStat label="Ready" value={selected.readyRows} />
                    <ImportStat label="Pending skipped" value={selected.pendingRows} />
                    <ImportStat label="Exact duplicates" value={selected.duplicateRows} />
                    <ImportStat label="Review" value={selected.possibleDuplicateRows} />
                    <ImportStat label="Invalid" value={selected.invalidRows} />
                  </div>
                )}
                {selected.status === 'ready' && !selected.accountId && (
                  <div className="rounded-xl border bg-muted/35 p-4">
                    <div className="mb-1 font-heading font-medium">Confirm the account</div>
                    <p className="mb-4 text-sm text-muted-foreground">
                      Detected {selected.detectedAccountName} ({selected.detectedMask}) in {selected.currency}.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <NativeSelect
                        aria-label="Existing account"
                        value={accountId}
                        onChange={(event) => setAccountId(event.target.value)}
                      >
                        <option value="">Create “{selected.detectedAccountName}”</option>
                        {accounts?.map((account) => (
                          <option key={account._id} value={account._id}>
                            {account.name} · {account.mask}
                          </option>
                        ))}
                      </NativeSelect>
                      <Button
                        onClick={() =>
                          void confirmAccount(
                            accountId
                              ? { importId: selected._id, accountId: accountId as Id<'accounts'> }
                              : {
                                  importId: selected._id,
                                  createAccount: {
                                    name: selected.detectedAccountName ?? 'Imported account',
                                    type: selected.detectedAccountType ?? 'other',
                                    institution: 'ANZ',
                                  },
                                },
                          )
                            .then(() => toast.success('Account confirmed. Checking for duplicates…'))
                            .catch(showError)
                        }
                      >
                        Confirm account
                      </Button>
                    </div>
                  </div>
                )}
                {selected.possibleDuplicateRows > 0 && (
                  <div>
                    <div className="mb-3 font-heading font-medium">Possible duplicates</div>
                    <div className="space-y-2">
                      {preview.rows
                        .filter((row) => row.status === 'possibleDuplicate')
                        .map((row) => (
                          <div
                            key={row._id}
                            className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{row.rawDescription}</div>
                              <div className="text-xs text-muted-foreground">
                                {nzDate(row.postedDate)} · {formatMoney(row.amountMinor)}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void resolveDuplicate({ importRowId: row._id, resolution: 'merge' }).catch(showError)
                                }
                              >
                                Merge
                              </Button>
                              <Button
                                size="sm"
                                onClick={() =>
                                  void resolveDuplicate({ importRowId: row._id, resolution: 'keep' }).catch(showError)
                                }
                              >
                                Keep both
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                {selected.status === 'ready' && selected.accountId && selected.possibleDuplicateRows === 0 && (
                  <div className="flex flex-col justify-between gap-4 rounded-xl border bg-[#eef5e9] p-4 sm:flex-row sm:items-center">
                    <div>
                      <div className="font-heading font-medium">Ready to commit</div>
                      <div className="text-sm text-muted-foreground">
                        {selected.readyRows} new and {selected.duplicateRows} previously seen rows will be linked to the
                        audit record.
                      </div>
                    </div>
                    <Button
                      onClick={() =>
                        void commit({ importId: selected._id })
                          .then(() => toast.success('Import is being committed.'))
                          .catch(showError)
                      }
                    >
                      Commit import
                    </Button>
                  </div>
                )}
                {selected.status === 'committed' && (
                  <div className="flex flex-col justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center">
                    <div>
                      <div className="font-heading font-medium">Import complete</div>
                      <div className="text-sm text-muted-foreground">
                        {selected.committedRows} source rows are stored with full provenance.
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (window.confirm('Roll back this import? The source file and audit trail will remain.'))
                          void rollback({ importId: selected._id })
                            .then(() => toast.success('Rollback started.'))
                            .catch(showError);
                      }}
                    >
                      Roll back
                    </Button>
                  </div>
                )}
                {preview.rows.length > 0 && (
                  <div>
                    <div className="mb-3 font-heading font-medium">Preview</div>
                    <div className="max-h-80 overflow-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.rows.slice(0, 50).map((row) => (
                            <TableRow key={row._id}>
                              <TableCell>{nzDate(row.postedDate)}</TableCell>
                              <TableCell>
                                <div className="max-w-md truncate">{row.rawDescription}</div>
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={row.status} />
                              </TableCell>
                              <TableCell className="text-right font-heading font-medium">
                                {formatMoney(row.amountMinor)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

function ImportStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="font-heading text-xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-8 max-w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40 ${props.className ?? ''}`}
    />
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="grid min-h-40 place-items-center p-6 text-center">
      <div>
        <IconChartDonut className="mx-auto mb-3 size-7 text-muted-foreground/50" />
        <div className="font-heading font-medium">{title}</div>
        <div className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function showError(error: unknown) {
  toast.error(error instanceof Error ? error.message : 'Something went wrong.');
}
