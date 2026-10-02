import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { FinanceContributionChart } from './finance-charts';

export function PortfolioPerformance({ asOf, currency }: { asOf: string; currency: string }) {
  const options = useQuery(api.portfolioPerformance.options, {});
  const [accountId, setAccountId] = useState<Id<'investmentAccounts'> | null>(null);
  const [positionId, setPositionId] = useState<Id<'portfolioPositions'> | null | undefined>();
  const [zeroOpening, setZeroOpening] = useState<boolean | undefined>();
  const [priceSourceConfirmed, setPriceSourceConfirmed] = useState<boolean | undefined>();
  const selected =
    accountId ??
    options?.accounts.find((account) => account.performancePositionId && account.currency === currency)?.id ??
    options?.accounts.find((account) => account.performancePositionId)?.id ??
    options?.accounts.find((account) => /simplicity/i.test(account.name))?.id ??
    options?.accounts.at(0)?.id;
  const selectedAccount = options?.accounts.find((account) => account.id === selected);
  const holding = positionId === undefined ? selectedAccount?.performancePositionId : (positionId ?? undefined);
  const startsAtZero = zeroOpening ?? selectedAccount?.performanceZeroOpening ?? false;
  const confirmed =
    priceSourceConfirmed ?? (positionId === undefined && Boolean(selectedAccount?.performancePositionId));
  const configure = useMutation(api.portfolioPerformance.configure);
  const [setupMessage, setSetupMessage] = useState('');
  const history = useQuery(
    api.portfolioPerformance.history,
    selected ? { accountId: selected, asOf, reportingCurrency: currency } : 'skip',
  );
  const formatValue = (value: number) =>
    new Intl.NumberFormat('en-NZ', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  const visible = history?.observations.filter((row) => row.value !== null) ?? [];
  const latest = visible.at(-1);
  const formatExact = (value: number) =>
    `${currency} ${new Intl.NumberFormat('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <h2 className="font-semibold">Contributions and growth</h2>
        <p className="text-sm text-muted-foreground">
          See how recorded investment value compares with money added. Growth includes market changes, income, fees and
          currency movements together.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          Investment account
          <select
            className="mt-1 block rounded border bg-background p-2"
            value={selected ?? ''}
            onChange={(event) => {
              const account = options?.accounts.find((row) => row.id === event.target.value);
              if (account) {
                setAccountId(account.id);
                setPositionId(undefined);
                setPriceSourceConfirmed(undefined);
                setZeroOpening(undefined);
                setSetupMessage('');
              }
            }}
          >
            {options?.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Holding price history
          <select
            className="mt-1 block rounded border bg-background p-2"
            value={holding ?? ''}
            onChange={(event) => {
              setPositionId(options?.positions.find((row) => row.id === event.target.value)?.id ?? null);
              setPriceSourceConfirmed(false);
            }}
          >
            <option value="">Imported transaction prices only</option>
            {options?.positions
              .filter(
                (position) =>
                  position.currency === options.accounts.find((account) => account.id === selected)?.currency,
              )
              .map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name} · {position.account}
                </option>
              ))}
          </select>
        </label>
      </div>
      {holding && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setPriceSourceConfirmed(event.target.checked)}
          />
          I confirm this holding is the same fund as the imported account
        </label>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={startsAtZero} onChange={(event) => setZeroOpening(event.target.checked)} />
        This account had zero balance before the imported history
      </label>
      <button
        type="button"
        className="rounded border px-3 py-2 text-sm"
        disabled={!selected || Boolean(holding && !confirmed)}
        onClick={async () => {
          if (!selected) return;
          try {
            await configure({
              accountId: selected,
              positionId: holding,
              zeroOpening: startsAtZero,
              priceSourceConfirmed: confirmed,
            });
            setSetupMessage('History setup saved.');
          } catch (error) {
            setSetupMessage(error instanceof Error ? error.message : 'Unable to save history setup.');
          }
        }}
      >
        Save history setup
      </button>
      {setupMessage && (
        <p role="status" className="text-sm">
          {setupMessage}
        </p>
      )}
      {history && (
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <div>
            Opening value
            <p className="font-medium">
              {history.totalsAvailable ? formatValue(Number(history.opening)) : 'Unavailable'}
            </p>
          </div>
          <div>
            Your contributions
            <p className="font-medium">
              {history.totalsAvailable ? formatValue(Number(history.personal)) : 'Unavailable'}
            </p>
          </div>
          <div>
            Employer and government
            <p className="font-medium">
              {history.totalsAvailable ? formatValue(Number(history.other)) : 'Unavailable'}
            </p>
          </div>
          <div>
            Withdrawals
            <p className="font-medium">
              {history.totalsAvailable ? formatValue(Number(history.withdrawals)) : 'Unavailable'}
            </p>
          </div>
        </div>
      )}
      {latest && latest.value !== null && history?.totalsAvailable && (
        <div className="rounded border bg-muted/30 p-3 text-sm">
          <p className="mb-2 text-muted-foreground">Recorded value at {latest.date}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              Investment value<p className="font-medium">{formatExact(Number(latest.value))}</p>
            </div>
            <div>
              Opening value and net contributions<p className="font-medium">{formatExact(Number(latest.capital))}</p>
            </div>
            <div>
              Growth after costs
              <p className="font-medium">{formatExact(Number(latest.value) - Number(latest.capital))}</p>
            </div>
          </div>
        </div>
      )}
      {visible.length > 1 && history?.totalsAvailable ? (
        <FinanceContributionChart
          rows={history.observations.map((row) => ({
            date: row.date,
            capital: Number(row.capital),
            value: row.value === null ? null : Number(row.value),
          }))}
          title="Recorded value and invested capital over time"
          formatValue={formatValue}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          This history needs cash contribution amounts and at least two dated valuations to show growth.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Opening value includes any contributions and growth before the imported history. Fund switches and transfers
        need reconciliation. Transaction unit prices are provider observations, and lines between dates do not establish
        daily values. Missing currency rates leave gaps.
      </p>
      {history?.issues.map((issue) => (
        <p key={issue} className="text-sm text-muted-foreground">
          {issue}
        </p>
      ))}
    </section>
  );
}
