import { useMutation, useQuery } from 'convex/react';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { api } from '../../../convex/_generated/api';
import { ExposureBreakdown } from './exposure-breakdown';
import { exposureMoney as display } from './exposure-format';
import { PageHeading, showError } from './finance-ui';
import { PortfolioForms } from './portfolio-forms';
import { PortfolioHistory } from './portfolio-history';
import { stringField, boolField, weightsField, optionalStringField } from './portfolio-input';
import { PortfolioPerformance } from './portfolio-performance';
import { StockExposure } from './stock-exposure';

const positionExample = JSON.stringify(
  {
    key: 'kiwisaver-simplicity-high-growth',
    name: 'Simplicity KiwiSaver High Growth',
    account: 'Simplicity KiwiSaver',
    instrument: 'FundNZ:25641',
    currency: 'NZD',
    retirement: true,
    debt: false,
    snapshotDate: 'YYYY-MM-DD',
    basis: 'trade',
    sameDayCovered: true,
    units: '0',
    value: '0',
    source: 'Statement name and date',
    evidence: 'Paste the statement details here',
  },
  null,
  2,
);

export function PortfolioExposure() {
  const profile = useQuery(api.profiles.current);
  useEffect(() => {
    if (profile) {
      setCurrency(profile.baseCurrency === 'AUD' ? 'AUD' : 'NZD');
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: profile.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());
      setAsOf(
        `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}-${parts.find((p) => p.type === 'day')?.value}`,
      );
    }
  }, [profile]);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState<'NZD' | 'AUD'>('NZD');
  const [assetScope, setAssetScope] =
    useState<NonNullable<FunctionArgs<typeof api.portfolio.getExposure>['assetScope']>>('all');
  const [retirementScope, setRetirementScope] =
    useState<NonNullable<FunctionArgs<typeof api.portfolio.getExposure>['retirement']>>('all');
  const [selectedPositions, setSelectedPositions] = useState<Array<string> | null>(null);
  const [includeAssumptions, setIncludeAssumptions] = useState(true);
  const options = useQuery(api.portfolio.getExposure, { asOf, currency, includeAssumptions });
  const [filterOpen, setFilterOpen] = useState(false);
  const latestSummary = useQuery(api.portfolio.getExposure, {
    asOf,
    currency,
    assetScope,
    includeAssumptions,
    retirement: retirementScope,
    positionIds: selectedPositions ?? undefined,
  });
  const [previousResult, setPreviousResult] = useState<
    { summary: FunctionReturnType<typeof api.portfolio.getExposure>; currency: string } | undefined
  >();
  useEffect(() => {
    if (latestSummary) setPreviousResult({ summary: latestSummary, currency });
  }, [latestSummary, currency]);
  const summary = latestSummary ?? previousResult?.summary;
  const displayCurrency = latestSummary ? currency : (previousResult?.currency ?? currency);
  const updating = latestSummary === undefined;
  const filterOptions = options?.filterOptions ?? summary?.filterOptions ?? [];
  const proposePurchase = useMutation(api.portfolio.proposePurchase);
  const resolvePurchase = useMutation(api.portfolio.resolvePurchase);
  const [purchasePosition, setPurchasePosition] = useState('');
  const savePosition = useMutation(api.portfolio.savePosition);
  const saveRate = useMutation(api.portfolio.saveRate);
  const saveAllocation = useMutation(api.portfolio.saveAllocation);
  const savePrice = useMutation(api.portfolio.savePrice);
  const [draft, setDraft] = useState(positionExample);
  const [allocationKind, setAllocationKind] = useState<'holdings' | 'target' | 'assumption'>('holdings');
  const [kind, setKind] = useState('position');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const value: unknown = JSON.parse(draft);
      if (kind === 'purchase') {
        const position = summary?.positions.find((p) => p._id === purchasePosition);
        if (!position) throw new Error('Choose a portfolio position first.');
        await proposePurchase({
          positionId: position._id,
          date: stringField(value, 'date'),
          units: stringField(value, 'units'),
          sourceEvent: stringField(value, 'sourceEvent'),
          reference: stringField(value, 'reference') || undefined,
          source: stringField(value, 'source'),
          evidence: stringField(value, 'evidence'),
        });
      } else if (kind === 'position') {
        const basis = stringField(value, 'basis');
        if (basis !== 'trade' && basis !== 'settlement') throw new Error('Basis must be trade or settlement.');
        await savePosition({
          key: stringField(value, 'key'),
          name: stringField(value, 'name'),
          account: stringField(value, 'account'),
          instrument: stringField(value, 'instrument'),
          currency: stringField(value, 'currency'),
          retirement: boolField(value, 'retirement'),
          debt: boolField(value, 'debt'),
          ownershipShare: optionalStringField(value, 'ownershipShare', '1'),
          snapshotDate: stringField(value, 'snapshotDate'),
          basis,
          sameDayCovered: boolField(value, 'sameDayCovered'),
          units: stringField(value, 'units'),
          value: stringField(value, 'value'),
          source: stringField(value, 'source'),
          evidence: stringField(value, 'evidence'),
        });
      } else if (kind === 'rate') {
        await saveRate({
          from: stringField(value, 'from'),
          to: stringField(value, 'to'),
          date: stringField(value, 'date'),
          rate: stringField(value, 'rate'),
          source: stringField(value, 'source'),
        });
      } else if (kind === 'price') {
        await savePrice({
          instrument: stringField(value, 'instrument'),
          currency: stringField(value, 'currency'),
          date: stringField(value, 'date'),
          price: stringField(value, 'price'),
          source: stringField(value, 'source'),
        });
      } else {
        const dimension = stringField(value, 'dimension');
        if (dimension !== 'country' && dimension !== 'industry' && dimension !== 'assetClass' && dimension !== 'stock')
          throw new Error('Choose country, industry, assetClass or stock.');
        await saveAllocation({
          instrument: stringField(value, 'instrument'),
          dimension,
          kind: allocationKind,
          date: stringField(value, 'date'),
          source: stringField(value, 'source'),
          evidence: stringField(value, 'evidence'),
          complete: boolField(value, 'complete'),
          weights: weightsField(value),
        });
      }
      toast.success('Portfolio evidence saved.');
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="Your whole portfolio"
        title="Exposure"
        description="Bank cash, investments, retirement savings and other recorded assets. Unknown values stay visible."
      />
      <div className="mb-6 flex max-w-sm gap-3">
        <Input type="date" aria-label="Valuation date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        <select
          aria-label="Reporting currency"
          className="rounded border px-3"
          value={currency}
          onChange={(e) => setCurrency(e.target.value === 'AUD' ? 'AUD' : 'NZD')}
        >
          <option>NZD</option>
          <option>AUD</option>
        </select>
      </div>
      <div className="mb-6 flex flex-wrap items-start gap-4 rounded-lg border p-4 text-sm">
        <label className="space-y-1">
          <span className="block text-muted-foreground">Asset scope</span>
          <select
            className="rounded border p-2"
            aria-label="Asset scope"
            value={assetScope}
            onChange={(event) => {
              const value = event.target.value;
              if (value === 'all' || value === 'investments' || value === 'equities') setAssetScope(value);
            }}
          >
            <option value="all">All recorded assets</option>
            <option value="investments">Investments, excluding bank cash</option>
            <option value="equities">Equity-focused investments</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-muted-foreground">Retirement access</span>
          <select
            className="rounded border p-2"
            aria-label="Retirement access"
            value={retirementScope}
            onChange={(event) => {
              const value = event.target.value;
              if (value === 'all' || value === 'retirement' || value === 'accessible') setRetirementScope(value);
            }}
          >
            <option value="all">All holdings</option>
            <option value="retirement">Retirement savings</option>
            <option value="accessible">Outside retirement</option>
          </select>
        </label>
        <label className="flex max-w-xs items-start gap-2 py-1">
          <input
            type="checkbox"
            checked={includeAssumptions}
            onChange={(event) => setIncludeAssumptions(event.target.checked)}
          />
          <span>
            Use fund country assumptions
            <span className="mt-1 block text-xs text-muted-foreground">
              Fill undisclosed country exposure using recorded assumptions. Actual disclosures remain separate.
            </span>
          </span>
        </label>
        <details
          className="min-w-52 py-1"
          open={filterOpen}
          onToggle={(event) => setFilterOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer">
            {selectedPositions === null ? 'All funds and accounts' : `${selectedPositions.length} holdings selected`}
          </summary>
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedPositions(null)}>
                Select all
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedPositions([])}>
                Clear selection
              </Button>
            </div>
            {filterOptions.map((position) => (
              <label key={position.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedPositions === null || selectedPositions.includes(position.id)}
                  onChange={(event) => {
                    const current = selectedPositions ?? filterOptions.map((entry) => entry.id);
                    setSelectedPositions(
                      event.target.checked ? [...current, position.id] : current.filter((id) => id !== position.id),
                    );
                  }}
                />
                {position.name}
              </label>
            ))}
            <p className="max-w-xs text-xs text-muted-foreground">
              Select funds or accounts to compare their exposure. The asset and retirement filters still apply.
            </p>
          </div>
        </details>
      </div>
      {updating && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          Updating exposure. Previously loaded results remain visible until the selected scope is ready.
        </p>
      )}
      {summary && (
        <>
          {summary.potentialDuplicateAccounts > 0 && (
            <div
              role="status"
              className="mb-4 rounded-lg border border-amber-500/40 bg-amber-50 p-4 text-sm text-amber-900"
            >
              {summary.potentialDuplicateAccounts} bank account records across {summary.duplicateAccountGroups.length}{' '}
              source identities may be duplicates. Totals retain every recorded balance and may overstate assets or
              debt. Reconcile these account identities in Accounts and Imports before treating this as your net wealth.
            </div>
          )}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            {[
              [
                assetScope !== 'all' || retirementScope !== 'all' || selectedPositions !== null
                  ? 'Selected gross assets'
                  : 'Recorded gross assets',
                summary.gross,
              ],
              ['Debt', summary.debt],
              [
                summary.potentialDuplicateAccounts
                  ? 'Unreconciled recorded net total'
                  : assetScope !== 'all' || retirementScope !== 'all' || selectedPositions !== null
                    ? 'Selected assets less selected debt'
                    : 'Net recorded wealth',
                summary.net,
              ],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle>{display(value, displayCurrency)}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
          {(assetScope !== 'all' || retirementScope !== 'all' || selectedPositions !== null) && (
            <p className="mb-4 text-sm text-muted-foreground">
              Whole recorded portfolio net wealth is {display(summary.portfolioNet, displayCurrency)}. The cards and
              exposure percentages below use only the selected holdings.
            </p>
          )}
          <div className="mb-6 flex flex-wrap gap-x-8 gap-y-3 border-y py-4 text-sm">
            <div>
              <span className="text-muted-foreground">Outside retirement</span>
              <p className="font-medium tabular-nums">{display(summary.accessibleValue, displayCurrency)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Retirement savings</span>
              <p className="font-medium tabular-nums">{display(summary.retirementValue, displayCurrency)}</p>
            </div>
            <p className="max-w-xl text-xs text-muted-foreground">
              Retirement balances are part of gross assets and may have withdrawal restrictions. Outside retirement
              describes account classification, not immediate liquidity. {summary.unknown} records have an unresolved
              valuation or currency conversion.
            </p>
          </div>
          {assetScope === 'equities' && (
            <p className="mb-5 rounded border p-3 text-sm">
              Disclosed equity value is {display(summary.equitySummary.value, displayCurrency)}.{' '}
              {display(summary.equitySummary.unknownValue, displayCurrency)} has unresolved asset class coverage.
              Country and stock charts show the selected holdings' gross exposure, including any non-equity assets
              within those funds. Separate country and asset class disclosures do not establish an equity-only country
              breakdown.
            </p>
          )}
          <StockExposure exposure={summary} currency={displayCurrency} />
          <ExposureBreakdown exposure={summary} currency={displayCurrency} onSelectFunds={setSelectedPositions} />
          <div className="my-6">
            <PortfolioHistory asOf={asOf} />
            <p className="mt-5 mb-3 text-xs text-muted-foreground">
              Account history and contribution comparisons below use their own account selection, independently of
              exposure filters.
            </p>
            <PortfolioPerformance asOf={asOf} currency={currency} />
          </div>
          <Card className="my-6">
            <CardHeader>
              <CardTitle>Assets and source dates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Native value</th>
                      <th>Reporting value</th>
                      <th>Source dates</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="py-3">
                          {row.name}
                          <div className="text-xs text-muted-foreground">{row.accountIdentity}</div>
                          {row.sourceIdentity && (
                            <div className="text-xs text-muted-foreground">
                              Source identity {row.sourceIdentity.slice(-12)}
                            </div>
                          )}
                          {row.potentialDuplicate && (
                            <div className="text-xs text-amber-700">Potential duplicate account record</div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            {row.debt ? 'Debt' : row.retirement ? 'Retirement' : 'Accessible'} · {row.units} units
                          </div>
                        </td>
                        <td>{display(row.nativeValue, row.currency)}</td>
                        <td>{display(row.value, displayCurrency)}</td>
                        <td>
                          <div>Valuation {row.date || 'missing'}</div>
                          {row.holdingsDate && (
                            <div className="text-xs text-muted-foreground">Units {row.holdingsDate}</div>
                          )}
                          {row.currency !== currency && (
                            <div className="text-xs text-muted-foreground">FX {row.fxDate || 'missing'}</div>
                          )}
                          {row.futureBalanceDate && (
                            <div className="text-xs text-amber-700">
                              Newer balance dated {row.futureBalanceDate} is after this report date.
                            </div>
                          )}
                          {row.date && (Date.parse(asOf) - Date.parse(row.date)) / 86400000 > 90 && (
                            <div className="text-xs text-amber-700">Valuation more than 90 days old</div>
                          )}
                        </td>
                        <td className="max-w-xs break-words">{row.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
      {summary && summary.rows.some((row) => row.activities.some((activity) => activity.status === 'ambiguous')) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Purchase reconciliation</CardTitle>
            <CardDescription>
              Identical dates and units are candidates for review. They never silently remove a second legitimate buy.
              Trade references link repeated evidence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary.rows.flatMap((row) =>
              row.activities
                .filter((a) => a.status === 'ambiguous')
                .map((a) => (
                  <div key={a._id} className="mb-4 rounded border p-3 text-sm">
                    <p>
                      {row.name} · {a.date} · {a.units} units · {a.source}
                    </p>
                    <p className="mb-2 whitespace-pre-wrap text-muted-foreground">{a.evidence}</p>
                    {(['accepted', 'linked', 'rejected'] as const).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant="outline"
                        className="mr-2"
                        onClick={() => void resolvePurchase({ id: a._id, status }).catch(showError)}
                      >
                        {status === 'accepted'
                          ? 'Separate purchase'
                          : status === 'linked'
                            ? 'Already recorded'
                            : 'Reject evidence'}
                      </Button>
                    ))}
                  </div>
                )),
            )}
          </CardContent>
        </Card>
      )}
      <details className="my-6 rounded-lg border p-4">
        <summary className="cursor-pointer font-heading font-semibold">Manage positions and currency rates</summary>
        <div className="mt-4">
          <PortfolioForms />
        </div>
      </details>
      <details className="my-6 rounded-lg border p-4">
        <summary className="cursor-pointer font-heading font-semibold">Advanced portfolio evidence</summary>
        <Card>
          <CardHeader>
            <CardTitle>Add portfolio evidence</CardTitle>
            <CardDescription>
              Prepare this JSON from a dated statement or official allocation disclosure. Review every field before
              saving. For bulk changes with a dry run and receipt, use Updates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <select
              aria-label="Evidence type"
              className="rounded border p-2"
              value={kind}
              onChange={(e) => {
                const next = e.target.value;
                setKind(next);
                setDraft(
                  next === 'position'
                    ? positionExample
                    : JSON.stringify(
                        next === 'purchase'
                          ? {
                              date: 'YYYY-MM-DD',
                              units: '0',
                              sourceEvent: 'email-source-id:row-1',
                              reference: '',
                              source: 'Monthly purchase email',
                              evidence: 'Copied purchase email',
                            }
                          : next === 'rate'
                            ? {
                                from: 'AUD',
                                to: 'NZD',
                                date: 'YYYY-MM-DD',
                                rate: '1.1',
                                source: 'Published daily FX source',
                              }
                            : next === 'price'
                              ? {
                                  instrument: 'NZX:USG',
                                  currency: 'NZD',
                                  date: 'YYYY-MM-DD',
                                  price: '0',
                                  source: 'Dated unit price',
                                }
                              : {
                                  instrument: 'FundNZ:25641',
                                  dimension: 'country',
                                  date: 'YYYY-MM-DD',
                                  complete: false,
                                  source: 'Official disclosure',
                                  evidence: 'Copied disclosure',
                                  weights: [{ label: 'United States', weight: '0.5' }],
                                },
                        null,
                        2,
                      ),
                );
              }}
            >
              <option value="purchase">Purchase email occurrence</option>
              <option value="position">Statement position or other asset</option>
              <option value="rate">Dated FX rate</option>
              <option value="price">Dated unit price</option>
              <option value="allocation">Sourced allocation breakdown</option>
            </select>
            {kind === 'allocation' && (
              <label className="block text-sm">
                Disclosure basis{' '}
                <select
                  value={allocationKind}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'holdings' || value === 'target' || value === 'assumption') setAllocationKind(value);
                  }}
                  className="ml-2 rounded border p-2"
                >
                  <option value="holdings">Observed holdings</option>
                  <option value="assumption">Country assumption for undisclosed exposure</option>
                  <option value="target">Target allocation, excluded from actual exposure</option>
                </select>
              </label>
            )}
            {kind === 'allocation' && allocationKind === 'assumption' && (
              <p className="text-xs text-muted-foreground">
                Use dimension country and complete false. Assumption weights apply only to the positive undisclosed
                remainder of the holding.
              </p>
            )}
            {kind === 'purchase' && (
              <select
                aria-label="Purchase position"
                value={purchasePosition}
                onChange={(e) => setPurchasePosition(e.target.value)}
                className="rounded border p-2"
              >
                <option value="">Choose position</option>
                {summary?.positions.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <Input
              type="file"
              aria-label="Upload ChatGPT portfolio JSON"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.size > 100000) {
                    toast.error('Choose a JSON file under 100 KB.');
                    return;
                  }
                  void file.text().then(setDraft).catch(showError);
                }
              }}
            />
            <Textarea
              aria-label="Portfolio evidence JSON"
              className="min-h-80 font-mono text-xs"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Use the same position key for later statements. A new dated snapshot rebases purchases already included in
              it. Do not add bank accounts here, their dated balances appear automatically. Enter debts as positive
              values with debt set to true. Allocation weights use 0.5 for 50%, including signed offsets. Complete means
              all material assets and offsets are supported by the disclosure.
            </p>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save reviewed evidence'}
            </Button>
          </CardContent>
        </Card>
      </details>
    </>
  );
}
