import { IconBuildingBank, IconRefresh } from '@tabler/icons-react';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

import { api } from '../../../../convex/_generated/api';
import { aucklandToday, EmptyState, formatMoney, nzDate, PageHeading, showError } from '../finance-ui';

export function Accounts() {
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
