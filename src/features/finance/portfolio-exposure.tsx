import { useMutation, useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { api } from '../../../convex/_generated/api';
import { decimal, SCALE } from '../../../convex/lib/portfolioMath';
import { PageHeading, showError } from './finance-ui';
import { PortfolioForms } from './portfolio-forms';
import { stringField, boolField, weightsField, optionalStringField } from './portfolio-input';

function display(value: string | null, currency: string) {
  if (value === null) return 'Unresolved';
  const raw = decimal(value);
  const negative = raw < 0n;
  const absolute = negative ? -raw : raw;
  const cents = (absolute + SCALE / 200n) / (SCALE / 100n);
  return `${currency} ${negative ? '-' : ''}${new Intl.NumberFormat('en-NZ').format(cents / 100n)}.${(cents % 100n).toString().padStart(2, '0')}`;
}
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
  const summary = useQuery(api.portfolio.getExposure, { asOf, currency });
  const proposePurchase = useMutation(api.portfolio.proposePurchase);
  const resolvePurchase = useMutation(api.portfolio.resolvePurchase);
  const [purchasePosition, setPurchasePosition] = useState('');
  const savePosition = useMutation(api.portfolio.savePosition);
  const saveRate = useMutation(api.portfolio.saveRate);
  const saveAllocation = useMutation(api.portfolio.saveAllocation);
  const savePrice = useMutation(api.portfolio.savePrice);
  const [draft, setDraft] = useState(positionExample);
  const [allocationKind, setAllocationKind] = useState<'holdings' | 'target'>('holdings');
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
        if (dimension !== 'country' && dimension !== 'industry' && dimension !== 'assetClass')
          throw new Error('Choose country, industry or assetClass.');
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
      <div className="mb-6 flex gap-3">
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
              ['Recorded gross assets', summary.gross],
              ['Debt', summary.debt],
              [
                summary.potentialDuplicateAccounts ? 'Unreconciled recorded net total' : 'Net recorded wealth',
                summary.net,
              ],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle>{display(value, currency)}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
          <p className="mb-6 text-sm text-muted-foreground">
            {summary.unknown} records have an unresolved valuation or currency conversion. These totals cover recorded,
            valued assets only. Retirement access restrictions are shown separately from asset class.
          </p>
          <div className="grid gap-4 lg:grid-cols-3">
            {summary.breakdowns.map((group) => (
              <Card key={group.dimension}>
                <CardHeader>
                  <CardTitle>
                    {group.dimension === 'assetClass'
                      ? 'Asset class'
                      : group.dimension === 'country'
                        ? 'Country'
                        : 'Industry'}
                  </CardTitle>
                  <CardDescription>
                    {display(group.covered, currency)} fully resolved of {display(summary.gross, currency)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {group.allocations.map((row) => (
                    <div key={row.label} className="space-y-1 text-sm">
                      <div className="flex justify-between gap-2">
                        <span>{row.label}</span>
                        <span className="font-mono">
                          {display(row.value, currency)} ·{' '}
                          {row.percent.slice(
                            0,
                            row.percent.indexOf('.') < 0 ? row.percent.length : row.percent.indexOf('.') + 3,
                          )}
                          %
                        </span>
                      </div>
                      <div className="h-1.5 rounded bg-muted">
                        <div
                          className="h-full rounded bg-primary"
                          style={{ width: `${Math.min(100, Math.max(0, Number(row.percent)))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Unresolved coverage is {display(group.unresolved, currency)}. Known allocations above may be partial
                    or signed. Coverage and allocation are separate measures and must not be added together. Country and
                    industry are separate breakdowns, so their intersection is unavailable.
                  </p>
                </CardContent>
              </Card>
            ))}
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
                      <th>Valuation / FX date</th>
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
                        <td>{display(row.value, currency)}</td>
                        <td>
                          {row.date || 'Missing'} /{' '}
                          {row.currency === currency ? 'No FX required' : row.fxDate || 'Missing FX'}
                          {row.date && (Date.parse(asOf) - Date.parse(row.date)) / 86400000 > 90 && (
                            <div className="text-xs text-amber-700">Valuation more than 90 days old</div>
                          )}
                        </td>
                        <td>{row.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
      {summary && (
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
      <PortfolioForms />
      <details className="my-6 rounded-lg border p-4">
        <summary className="cursor-pointer font-heading font-semibold">Upload prepared evidence from ChatGPT</summary>
        <Card>
          <CardHeader>
            <CardTitle>Add portfolio evidence</CardTitle>
            <CardDescription>
              Ask ChatGPT to prepare this JSON from a dated statement or official allocation disclosure. Review every
              field here before saving. The earlier undated screenshot is not a verified valuation.
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
                  onChange={(e) => setAllocationKind(e.target.value === 'target' ? 'target' : 'holdings')}
                  className="ml-2 rounded border p-2"
                >
                  <option value="holdings">Observed holdings</option>
                  <option value="target">Target allocation, excluded from actual exposure</option>
                </select>
              </label>
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
