import { IconLoader2, IconRefresh } from '@tabler/icons-react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { NativeSelect, showError, StatusBadge } from './finance-ui';
import { formatUpdateAmount } from './update-files';

export function UpdateConnections() {
  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <AkahuConnection />
      <ChatGPTConnection />
    </div>
  );
}

function AkahuConnection() {
  const status = useQuery(api.akahu.status, {});
  const providers = useQuery(api.akahu.providerAccounts, {});
  const accounts = useQuery(api.finance.listAccounts, {});
  const duplicates = useQuery(api.akahu.pendingDuplicates, {});
  const connect = useMutation(api.akahu.connect);
  const disconnect = useMutation(api.akahu.disconnect);
  const sync = useAction(api.akahuActions.sync);
  const [personalConfirmed, setPersonalConfirmed] = useState(false);
  const [anzConfirmed, setAnzConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function perform(work: () => Promise<null | Id<'akahuSyncRuns'>>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await work();
      toast.success(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bank connection request failed.');
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>ANZ NZ through Akahu</CardTitle>
        <CardDescription>
          Use your personal read-only connection. Commonwealth Bank Australia still uses file imports.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === undefined ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading connection status...
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={status.connection?.status ?? 'notConnected'} />
              <span className="text-sm text-muted-foreground">
                {status.configured ? 'Server configuration available' : 'Server setup required'}
              </span>
            </div>
            {!status.configured && (
              <p className="text-sm text-muted-foreground">
                {status.reason}{' '}
                <a href="/setup" className="text-primary underline underline-offset-4">
                  Follow the setup guide
                </a>
                .
              </p>
            )}
            {status.connection?.status !== 'connected' ? (
              <div className="space-y-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    checked={personalConfirmed}
                    onChange={(event) => setPersonalConfirmed(event.target.checked)}
                  />
                  <span>I confirmed that my Akahu personal app and this account are eligible.</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    checked={anzConfirmed}
                    onChange={(event) => setAnzConfirmed(event.target.checked)}
                  />
                  <span>I confirmed official ANZ connectivity with account data access only, without payments.</span>
                </label>
                <Button
                  disabled={!status.configured || !personalConfirmed || !anzConfirmed || busy}
                  onClick={() =>
                    void perform(
                      () => connect({ personalAppConfirmed: personalConfirmed, officialAnzConfirmed: anzConfirmed }),
                      'Akahu enabled. Sync to discover your bank accounts.',
                    )
                  }
                >
                  Enable Akahu
                </Button>
              </div>
            ) : (
              <>
                <div className="text-sm text-muted-foreground">
                  <p>
                    Last attempt:{' '}
                    {status.connection.lastAttemptAt
                      ? new Date(status.connection.lastAttemptAt).toLocaleString()
                      : 'Never'}
                  </p>
                  <p>
                    Last successful sync:{' '}
                    {status.connection.lastSuccessfulSyncAt
                      ? new Date(status.connection.lastSuccessfulSyncAt).toLocaleString()
                      : 'Never'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy || Boolean(status.connection.activeRunId)}
                    onClick={() =>
                      void perform(
                        () => sync({ requestBankRefresh: false }),
                        'Sync finished. Check account mappings and possible duplicates below.',
                      )
                    }
                  >
                    <IconRefresh className={busy ? 'animate-spin' : ''} /> Sync available bank data
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      busy ||
                      Boolean(status.connection.activeRunId) ||
                      Boolean(
                        status.connection.lastBankRefreshAt &&
                        Date.now() - status.connection.lastBankRefreshAt < 3_600_000,
                      )
                    }
                    onClick={() =>
                      void perform(
                        () => sync({ requestBankRefresh: true }),
                        'Bank refresh requested and available data synced.',
                      )
                    }
                  >
                    Request bank refresh
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  A daily job reads Akahu's available data. Bank refresh requests are limited to one an hour. First sync
                  discovers accounts; map them before syncing transactions.
                </p>
                {confirmDisconnect ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="destructive"
                      disabled={busy}
                      onClick={() =>
                        void perform(
                          () => disconnect(),
                          'Koru sync stopped. Revoke the token in Akahu to remove provider access.',
                        )
                      }
                    >
                      Confirm disconnect
                    </Button>
                    <Button variant="outline" disabled={busy} onClick={() => setConfirmDisconnect(false)}>
                      Keep connected
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" disabled={busy} onClick={() => setConfirmDisconnect(true)}>
                    Disconnect Akahu
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Disconnect stops Koru's sync. To revoke provider access, remove the connection in{' '}
                  <a href="https://my.akahu.nz" target="_blank" rel="noreferrer" className="text-primary underline">
                    Akahu
                  </a>
                  .
                </p>
              </>
            )}
            {status.connection?.error && (
              <p role="alert" className="text-sm text-destructive">
                {status.connection.error}
              </p>
            )}
            {providers === undefined || accounts === undefined ? (
              <p role="status" className="text-sm text-muted-foreground">
                Loading bank account mappings...
              </p>
            ) : (
              providers.length > 0 && (
                <div className="space-y-3 border-t pt-4">
                  <h3 className="text-sm font-medium">Match bank accounts to Koru accounts</h3>
                  <p className="text-xs text-muted-foreground">
                    Choose the existing account to preserve imported history. If needed,{' '}
                    <a href="/accounts" className="text-primary underline">
                      create an account
                    </a>{' '}
                    with the same currency, then return here.
                  </p>
                  {providers.map((provider) => (
                    <BankAccountMapping key={provider._id} provider={provider} accounts={accounts} />
                  ))}
                </div>
              )
            )}
            {duplicates === undefined ? (
              <p role="status" className="text-sm text-muted-foreground">
                Loading bank review...
              </p>
            ) : (
              duplicates.length > 0 && (
                <div className="space-y-3 border-t pt-4">
                  <h3 className="text-sm font-medium">{duplicates.length} bank records need review</h3>
                  <p className="text-xs text-muted-foreground">
                    New duplicate candidates are not counted until resolved. Bank corrections keep the previous accepted
                    amount until reviewed. Equal amounts and dates can still represent separate transactions.
                  </p>
                  {duplicates.map((row) =>
                    row.state === 'missing' ? (
                      <MissingBankRecord key={row._id} row={row} />
                    ) : row.state === 'pendingCorrection' ? (
                      <BankCorrection key={row._id} row={row} />
                    ) : (
                      <BankDuplicate key={row._id} row={row} />
                    ),
                  )}
                </div>
              )
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BankAccountMapping({
  provider,
  accounts,
}: {
  provider: Doc<'akahuAccounts'>;
  accounts: Array<Pick<Doc<'accounts'>, '_id' | 'name' | 'currency'>>;
}) {
  const bind = useMutation(api.akahu.bindAccount);
  const [accountId, setAccountId] = useState<Id<'accounts'> | null>(provider.accountId ?? null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm font-medium">
        {provider.name} · {provider.mask} · {provider.currency}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {provider.accountId ? 'Mapped' : 'Not mapped'} · Bank status {provider.status}
        {provider.refreshedAt ? ` · Updated ${provider.refreshedAt}` : ''}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <NativeSelect
          aria-label={`Koru account for ${provider.name}`}
          value={accountId ?? ''}
          disabled={busy}
          onChange={(event) =>
            setAccountId(accounts.find((account) => account._id === event.target.value)?._id ?? null)
          }
        >
          <option value="">Choose existing Koru account</option>
          {accounts
            .filter((account) => account.currency === provider.currency)
            .map((account) => (
              <option key={account._id} value={account._id}>
                {account.name} · {account._id.slice(-6)}
              </option>
            ))}
        </NativeSelect>
        <Button
          variant="outline"
          disabled={!accountId || busy || accountId === provider.accountId}
          onClick={() => {
            if (!accountId) return;
            setBusy(true);
            void bind({ providerAccountId: provider.providerAccountId, accountId })
              .then(() => toast.success('Account mapped. Sync again to import its records.'))
              .catch(showError)
              .finally(() => setBusy(false));
          }}
        >
          Save mapping
        </Button>
      </div>
    </div>
  );
}

function BankDuplicate({ row }: { row: Doc<'akahuEvidence'> & { candidates: Array<Doc<'transactions'>> } }) {
  const resolve = useMutation(api.akahu.resolveDuplicate);
  const [choice, setChoice] = useState<
    { kind: 'new' } | { kind: 'existing'; transactionId: Id<'transactions'> } | null
  >(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm font-medium">{row.description}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {row.postedDate} · {formatUpdateAmount(row.amountMinor.toString(), row.currency)} · Bank record{' '}
        {row.providerTransactionId}
      </p>
      <div className="mt-3 space-y-2">
        {row.candidates.map((candidate) => (
          <Button
            key={candidate._id}
            size="sm"
            variant="outline"
            disabled={busy}
            className="h-auto w-full justify-start whitespace-normal text-left"
            onClick={() => setChoice({ kind: 'existing', transactionId: candidate._id })}
          >
            Link to existing {candidate.rawDescription} · {candidate.origin} · {candidate._id}
          </Button>
        ))}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setChoice({ kind: 'new' })}>
          This is a separate transaction
        </Button>
      </div>
      {choice && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <p className="text-sm">
            {choice.kind === 'new'
              ? 'Create a separate ledger transaction for this bank record?'
              : 'Keep one ledger transaction and attach this bank record as evidence?'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void resolve({
                  evidenceId: row._id,
                  existingTransactionId: choice.kind === 'existing' ? choice.transactionId : undefined,
                })
                  .then(() => toast.success('Bank record resolved.'))
                  .catch(showError)
                  .finally(() => setBusy(false));
              }}
            >
              Confirm resolution
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setChoice(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatGPTConnection() {
  const status = useQuery(api.mcpConnections.status, {});
  const enable = useMutation(api.mcpConnections.enable);
  const disable = useMutation(api.mcpConnections.disable);
  const [busy, setBusy] = useState(false);
  async function save(work: () => Promise<null>, message: string) {
    setBusy(true);
    try {
      await work();
      toast.success(message);
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected ChatGPT</CardTitle>
        <CardDescription>
          Enable your personal MCP connection after server OAuth setup. File review works without it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === undefined ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading ChatGPT connection status...
          </p>
        ) : (
          <>
            <StatusBadge status={status.enabled ? 'enabled' : 'disabled'} />
            {!status.configured && (
              <p className="text-sm text-muted-foreground">
                {status.reason}{' '}
                <a href="/setup" className="text-primary underline underline-offset-4">
                  Follow the setup guide
                </a>
                .
              </p>
            )}
            {status.resourceUrl && (
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">MCP connection URL</p>
                <p className="mt-1 break-all font-mono text-xs">{status.resourceUrl}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Add this URL in ChatGPT's connector settings and authorize with your own Koru identity. Never paste a
                  bank token into ChatGPT.
                </p>
              </div>
            )}
            {status.enabled ? (
              <>
                <p className="text-sm text-muted-foreground">
                  ChatGPT can read your Koru financial data and save draft proposals.
                </p>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    checked={status.allowApply}
                    disabled={busy}
                    onChange={(event) =>
                      void save(
                        () => enable({ allowApply: event.target.checked }),
                        event.target.checked
                          ? 'Connected ChatGPT may apply jobs you explicitly approve in Koru.'
                          : 'Connected ChatGPT is limited to reading and proposing changes.',
                      )
                    }
                  />
                  <span>
                    Allow ChatGPT to apply and undo update jobs. Applying still requires approval of the exact preview
                    in Koru.
                  </span>
                </label>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void save(() => disable(), 'ChatGPT access disabled.')}
                >
                  Disable ChatGPT access
                </Button>
              </>
            ) : (
              <Button
                disabled={!status.configured || busy}
                onClick={() =>
                  void save(
                    () => enable({ allowApply: false }),
                    'ChatGPT read and proposal access enabled. Apply access is off.',
                  )
                }
              >
                {busy && <IconLoader2 className="animate-spin" />} Enable read and proposal access
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              This connection operates on Koru records. It has no payment or brokerage trading tools.{' '}
              <a href="/setup" className="text-primary underline underline-offset-4">
                Setup and monthly steps
              </a>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BankCorrection({ row }: { row: Doc<'akahuEvidence'> & { existingTransaction?: Doc<'transactions'> | null } }) {
  const resolve = useMutation(api.akahu.resolveCorrection);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-lg border p-3">
      <h4 className="text-sm font-medium">Bank correction: {row.description}</h4>
      <dl className="mt-2 space-y-1 text-sm">
        <div>
          <dt className="text-muted-foreground">Previously accepted</dt>
          <dd>
            {row.existingTransaction
              ? `${row.existingTransaction.postedDate} · ${formatUpdateAmount(row.existingTransaction.amountMinor.toString(), row.existingTransaction.currency)}`
              : 'Review the existing transaction before accepting.'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Bank now reports</dt>
          <dd>
            {row.postedDate} · {formatUpdateAmount(row.amountMinor.toString(), row.currency)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        Accepting updates this transaction's date and amount. Existing splits and confirmed transfer or refund links
        block the correction until reviewed.
      </p>
      {confirmed ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void resolve({ evidenceId: row._id })
                .then(() => toast.success('Reviewed bank correction accepted.'))
                .catch(showError)
                .finally(() => setBusy(false));
            }}
          >
            Confirm bank correction
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmed(false)}>
            Keep previous amount
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="mt-3" onClick={() => setConfirmed(true)}>
          Review and accept correction
        </Button>
      )}
    </div>
  );
}

function MissingBankRecord({
  row,
}: {
  row: Doc<'akahuEvidence'> & { existingTransaction?: Doc<'transactions'> | null };
}) {
  const remove = useMutation(api.akahu.resolveMissing);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-lg border p-3">
      <h4 className="text-sm font-medium">Bank record no longer returned</h4>
      <p className="mt-2 text-sm">
        {row.existingTransaction?.rawDescription ?? row.description} · {row.postedDate} ·{' '}
        {formatUpdateAmount(row.amountMinor.toString(), row.currency)}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        This source disappeared from a completed recent bank sync. Your accepted transaction remains counted. The bank
        may have replaced its reference. Check other pending bank records and link replacement evidence to the existing
        transaction before considering removal.
      </p>
      {confirmed ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm">
            Remove this accepted bank transaction from reporting? Other active evidence, existing splits and confirmed
            links block removal.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void remove({ evidenceId: row._id })
                  .then(() =>
                    toast.success('Missing bank transaction removed from reporting. Its audit evidence is retained.'),
                  )
                  .catch(showError)
                  .finally(() => setBusy(false));
              }}
            >
              Confirm removal
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmed(false)}>
              Keep transaction
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="mt-3" onClick={() => setConfirmed(true)}>
          Review removal of missing transaction
        </Button>
      )}
    </div>
  );
}
