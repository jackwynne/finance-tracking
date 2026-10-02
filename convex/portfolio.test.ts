/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const position = {
  key: 'growth',
  name: 'Growth',
  account: 'Broker',
  instrument: 'NZX:USG',
  currency: 'NZD',
  retirement: false,
  debt: false,
  snapshotDate: '2026-09-01',
  basis: 'trade' as const,
  sameDayCovered: true,
  units: '100',
  value: '100',
  source: 'Opening statement',
  evidence: '100 units',
};
test('statement rebase retains dated history, exact valuation and separate duplicate candidates', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|portfolio', subject: 'portfolio', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const id = await owner.mutation(api.portfolio.savePosition, position);
  await owner.mutation(api.portfolio.savePrice, {
    instrument: 'NZX:USG',
    currency: 'NZD',
    date: '2026-09-01',
    price: '1',
    source: 'Official price',
  });
  const buy = {
    positionId: id,
    date: '2026-09-02',
    units: '10',
    source: 'Email',
    evidence: '10 units',
    sourceEvent: 'email1:row1',
    reference: 'trade1',
  };
  const purchaseId = await owner.mutation(api.portfolio.proposePurchase, buy);
  await owner.mutation(api.portfolio.resolvePurchase, { id: purchaseId, status: 'accepted' });
  await owner.mutation(api.portfolio.proposePurchase, { ...buy, sourceEvent: 'email2:row1' });
  await owner.mutation(api.portfolio.proposePurchase, { ...buy, sourceEvent: 'email3:row1', reference: undefined });
  let summary = await owner.query(api.portfolio.getExposure, { asOf: '2026-09-03', currency: 'NZD' });
  expect(summary.gross).toBe('110');
  expect(summary.rows[0].activities.map((a) => a.status).sort()).toEqual(['accepted', 'ambiguous', 'linked']);
  await owner.mutation(api.portfolio.savePosition, {
    ...position,
    snapshotDate: '2026-09-30',
    units: '110',
    value: '110',
  });
  summary = await owner.query(api.portfolio.getExposure, { asOf: '2026-09-30', currency: 'NZD' });
  expect(summary.gross).toBe('110');
  expect((await owner.query(api.portfolio.getExposure, { asOf: '2026-09-01', currency: 'NZD' })).gross).toBe('100');
  const other = t.withIdentity({ tokenIdentifier: 'test|other', subject: 'other', issuer: 'test' });
  await other.mutation(api.profiles.ensureCurrent, {});
  await expect(other.mutation(api.portfolio.proposePurchase, buy)).rejects.toThrow('Record not found');
});
test('newer statement first prevents counting a subsequently imported covered email', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|reverse', subject: 'reverse', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const id = await owner.mutation(api.portfolio.savePosition, {
    ...position,
    snapshotDate: '2026-09-30',
    units: '110',
    value: '110',
  });
  await owner.mutation(api.portfolio.proposePurchase, {
    positionId: id,
    date: '2026-09-02',
    units: '10',
    source: 'Email',
    evidence: '10 units',
    sourceEvent: 'mail:1',
  });
  expect((await owner.query(api.portfolio.getExposure, { asOf: '2026-09-30', currency: 'NZD' })).gross).toBe('110');
});
test('signed partial allocations do not imply full coverage and future snapshots stay unknown', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|signed', subject: 'signed', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  await owner.mutation(api.portfolio.savePosition, position);
  await owner.mutation(api.portfolio.saveAllocation, {
    instrument: position.instrument,
    dimension: 'assetClass',
    date: '2026-09-01',
    source: 'Disclosure',
    evidence: 'Includes financing offset',
    complete: false,
    weights: [
      { label: 'Equities', weight: '1.1' },
      { label: 'Financing', weight: '-0.1' },
    ],
  });
  const summary = await owner.query(api.portfolio.getExposure, { asOf: '2026-09-01', currency: 'NZD' });
  expect(summary.breakdowns.find((row) => row.dimension === 'assetClass')?.covered).toBe('0');
  expect((await owner.query(api.portfolio.getExposure, { asOf: '2026-08-31', currency: 'NZD' })).unknown).toBe(1);
});

test('portfolio jobs preview, apply, retry and undo without leaving positions or statements', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|job', subject: 'job', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const context = await owner.query(api.updates.getContext, {});
  const jobId = await owner.mutation(api.updates.stage, {
    version: 1,
    deployment: context.deployment,
    ownerId: context.ownerId,
    clientKey: 'position-job',
    title: 'New statement',
    questions: [],
    sources: ['Statement'],
    groups: [
      {
        kind: 'portfolioPosition',
        expectedRevision: context.emptyPositionRevision,
        reason: 'Dated opening statement',
        value: position,
      },
    ],
  });
  const preview = await owner.query(api.updates.preview, { jobId });
  await owner.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash });
  await owner.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash });
  expect((await owner.query(api.portfolio.getExposure, { asOf: '2026-09-01', currency: 'NZD' })).gross).toBe('100');
  await owner.mutation(api.updates.undo, { jobId, previewHash: preview.previewHash });
  expect((await owner.query(api.portfolio.getExposure, { asOf: '2026-09-01', currency: 'NZD' })).rows).toHaveLength(0);
});
test('portfolio proposals reject revised evidence and expose exact revisions in context', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|stalejob', subject: 'stalejob', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  await owner.mutation(api.portfolio.savePosition, position);
  const context = await owner.query(api.updates.getContext, {});
  const expectedRevision = context.portfolio.positionRevisions.find((p) => p.key === position.key)?.revision;
  if (!expectedRevision) throw new Error('Missing revision');
  const jobId = await owner.mutation(api.updates.stage, {
    version: 1,
    deployment: context.deployment,
    ownerId: context.ownerId,
    clientKey: 'stale-job',
    title: 'New statement',
    questions: [],
    sources: ['Statement'],
    groups: [
      {
        kind: 'portfolioPosition',
        expectedRevision,
        reason: 'Later statement',
        value: { ...position, snapshotDate: '2026-09-30', units: '110', value: '110' },
      },
    ],
  });
  const preview = await owner.query(api.updates.preview, { jobId });
  await owner.mutation(api.portfolio.savePosition, {
    ...position,
    snapshotDate: '2026-09-20',
    units: '105',
    value: '105',
  });
  await expect(owner.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash })).rejects.toThrow(
    'changed',
  );
  expect((await owner.query(api.portfolio.getExposure, { asOf: '2026-09-30', currency: 'NZD' })).gross).toBe('105');
});
test('dated ownership shares value only the owned portion and targets never imply observed coverage', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|share', subject: 'share', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  await owner.mutation(api.portfolio.savePosition, {
    ...position,
    key: 'property',
    instrument: 'Property:home',
    units: '0',
    value: '1000000',
    ownershipShare: '0.5',
  });
  await owner.mutation(api.portfolio.saveAllocation, {
    instrument: 'Property:home',
    dimension: 'assetClass',
    kind: 'target',
    date: '2026-09-01',
    complete: false,
    weights: [{ label: 'Property', weight: '1' }],
    source: 'Target',
    evidence: 'Desired allocation',
  });
  const summary = await owner.query(api.portfolio.getExposure, { asOf: '2026-09-01', currency: 'NZD' });
  expect(summary.gross).toBe('500000');
  expect(summary.breakdowns.find((d) => d.dimension === 'assetClass')?.covered).toBe('0');
  await expect(
    owner.mutation(api.portfolio.saveAllocation, {
      instrument: 'Property:home',
      dimension: 'country',
      kind: 'target',
      date: '2026-09-01',
      complete: true,
      weights: [{ label: 'New Zealand', weight: '1' }],
      source: 'Target',
      evidence: 'Desired allocation',
    }),
  ).rejects.toThrow('Target allocations');
});
test('a price older than a statement cannot replace its fresher valuation', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|oldprice', subject: 'oldprice', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  await owner.mutation(api.portfolio.savePosition, {
    ...position,
    snapshotDate: '2026-09-30',
    units: '100',
    value: '1000',
  });
  await owner.mutation(api.portfolio.savePrice, {
    instrument: position.instrument,
    currency: 'NZD',
    date: '2026-09-20',
    price: '8',
    source: 'Old quote',
  });
  expect((await owner.query(api.portfolio.getExposure, { asOf: '2026-09-30', currency: 'NZD' })).gross).toBe('1000');
});
test('a staged FX replacement is authoritative, single-row and undo restores the old source', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|fxjob', subject: 'fxjob', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  await owner.mutation(api.portfolio.savePosition, { ...position, currency: 'AUD' });
  await owner.mutation(api.portfolio.saveRate, {
    from: 'AUD',
    to: 'NZD',
    date: '2026-09-01',
    rate: '1.1',
    source: 'Original',
  });
  const context = await owner.query(api.updates.getContext, {});
  const expectedRevision = context.portfolio.rateRevisions.find((r) => r.from === 'AUD' && r.to === 'NZD')?.revision;
  if (!expectedRevision) throw new Error('Missing rate revision');
  const jobId = await owner.mutation(api.updates.stage, {
    version: 1,
    deployment: context.deployment,
    ownerId: context.ownerId,
    clientKey: 'fx-job',
    title: 'Correct daily FX',
    questions: [],
    sources: ['Revised source'],
    groups: [
      {
        kind: 'portfolioRate',
        expectedRevision,
        reason: 'Correct sourced rate',
        value: { from: 'AUD', to: 'NZD', date: '2026-09-01', rate: '1.2', source: 'Corrected' },
      },
    ],
  });
  const preview = await owner.query(api.updates.preview, { jobId });
  await owner.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash });
  expect((await owner.query(api.portfolio.getExposure, { asOf: '2026-09-01', currency: 'NZD' })).gross).toBe('120');
  expect((await owner.query(api.updates.getContext, {})).portfolio.rates).toHaveLength(1);
  await owner.mutation(api.updates.undo, { jobId, previewHash: preview.previewHash });
  await owner.mutation(api.updates.undo, { jobId, previewHash: preview.previewHash });
  expect((await owner.query(api.portfolio.getExposure, { asOf: '2026-09-01', currency: 'NZD' })).gross).toBe('110');
  expect((await owner.query(api.updates.getContext, {})).portfolio.rates[0].source).toBe('Original');
  await owner.mutation(api.portfolio.saveRate, {
    from: 'AUD',
    to: 'NZD',
    date: '2026-09-01',
    rate: '1.3',
    source: 'Later correction',
  });
  expect((await owner.query(api.portfolio.getExposure, { asOf: '2026-09-01', currency: 'NZD' })).gross).toBe('130');
});
test('portfolio jobs reject out-of-range ownership shares at apply without storing partial changes', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|badshare', subject: 'badshare', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const context = await owner.query(api.updates.getContext, {});
  const jobId = await owner.mutation(api.updates.stage, {
    version: 1,
    deployment: context.deployment,
    ownerId: context.ownerId,
    clientKey: 'badshare',
    title: 'Bad ownership',
    questions: [],
    sources: ['Statement'],
    groups: [
      {
        kind: 'portfolioPosition',
        expectedRevision: context.emptyPositionRevision,
        reason: 'Statement',
        value: { ...position, ownershipShare: '2' },
      },
    ],
  });
  const preview = await owner.query(api.updates.preview, { jobId });
  await expect(owner.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash })).rejects.toThrow(
    'Ownership share',
  );
  expect((await owner.query(api.portfolio.getExposure, { asOf: '2026-09-01', currency: 'NZD' })).rows).toHaveLength(0);
});

test('duplicate rate targets and source occurrences reject staging before any write', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|duplicategroups', subject: 'duplicategroups', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const context = await owner.query(api.updates.getContext, {});
  const group = {
    kind: 'portfolioRate' as const,
    expectedRevision: context.emptyRateRevision,
    reason: 'Official daily source',
    value: { from: 'AUD', to: 'NZD', date: '2026-09-01', rate: '1.1', source: 'First source' },
  };
  await expect(
    owner.mutation(api.updates.stage, {
      version: 1,
      deployment: context.deployment,
      ownerId: context.ownerId,
      clientKey: 'duplicate-rates',
      title: 'Two rates',
      questions: [],
      sources: ['Source'],
      groups: [group, { ...group, value: { ...group.value, rate: '1.2' } }],
    }),
  ).rejects.toThrow('same portfolio target twice');
  expect((await owner.query(api.updates.getContext, {})).portfolio.rates).toHaveLength(0);
  const id = await owner.mutation(api.portfolio.savePosition, position);
  const revisedContext = await owner.query(api.updates.getContext, {});
  const expectedRevision = revisedContext.portfolio.positionRevisions.find((p) => p.key === position.key)?.revision;
  if (!expectedRevision) throw new Error('Missing revision');
  const purchase = {
    kind: 'portfolioPurchase' as const,
    expectedRevision,
    reason: 'Purchase email',
    value: {
      positionId: id,
      sourceEvent: 'mail:1',
      date: '2026-09-02',
      units: '10',
      source: 'Email',
      evidence: '10 units',
    },
  };
  await expect(
    owner.mutation(api.updates.stage, {
      version: 1,
      deployment: context.deployment,
      ownerId: context.ownerId,
      clientKey: 'duplicate-purchases',
      title: 'Repeated purchase',
      questions: [],
      sources: ['Email'],
      groups: [purchase, purchase],
    }),
  ).rejects.toThrow('same portfolio target twice');
  expect((await owner.query(api.updates.getContext, {})).portfolio.activities).toHaveLength(0);
});
test('duplicate bank source identities warn without deleting records or silently excluding balances', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|duplicatebanks', subject: 'duplicatebanks', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const profile = await owner.query(api.profiles.current, {});
  if (!profile) throw new Error('Missing profile');
  await owner.run(async (ctx) => {
    for (let occurrence = 0; occurrence < 2; occurrence++) {
      const accountId = await ctx.db.insert('accounts', {
        ownerId: profile._id,
        name: 'Credit card',
        type: 'creditCard',
        institution: 'ANZ NZ',
        currency: 'NZD',
        mask: '1234',
        sourceKeyHash: 'same-source-identity',
        archived: false,
      });
      await ctx.db.insert('balanceSnapshots', {
        ownerId: profile._id,
        accountId,
        date: '2026-09-01',
        ledgerMinor: -100000n,
        source: 'manual',
        voided: false,
      });
    }
    await ctx.db.insert('accounts', {
      ownerId: profile._id,
      name: 'Missing balance',
      type: 'checking',
      currency: 'NZD',
      mask: '5678',
      archived: false,
    });
  });
  const summary = await owner.query(api.portfolio.getExposure, { asOf: '2026-09-01', currency: 'NZD' });
  expect(summary.potentialDuplicateAccounts).toBe(2);
  expect(summary.duplicateAccountGroups).toHaveLength(1);
  expect(summary.totalsIncomplete).toBe(true);
  expect(summary.debt).toBe('2000');
  expect(summary.rows).toHaveLength(3);
  expect(summary.unknown).toBe(1);
  expect(summary.rows.find((row) => row.name === 'Missing balance')?.value).toBeNull();
});

test('fund switches close the old fund and open a distinct identity atomically with historical units and undo', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|switch', subject: 'switch', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const oldId = await owner.mutation(api.portfolio.savePosition, position);
  await expect(owner.mutation(api.portfolio.savePosition, { ...position, instrument: 'FundNZ:25641' })).rejects.toThrow(
    'distinct position key',
  );
  await expect(
    owner.mutation(api.portfolio.savePosition, { ...position, account: 'Different account' }),
  ).rejects.toThrow('distinct position key');
  const context = await owner.query(api.updates.getContext, {});
  const oldRevision = context.portfolio.positionRevisions.find((p) => p.key === position.key)?.revision;
  if (!oldRevision) throw new Error('Missing old fund revision');
  const newFund = {
    ...position,
    key: 'new-high-growth',
    name: 'High Growth',
    instrument: 'FundNZ:25641',
    snapshotDate: '2026-09-30',
    units: '80',
    value: '100',
    source: 'Fund switch statement',
    evidence: 'Switch 100 old units into 80 new units',
  };
  const jobId = await owner.mutation(api.updates.stage, {
    version: 1,
    deployment: context.deployment,
    ownerId: context.ownerId,
    clientKey: 'fund-switch',
    title: 'Switch funds',
    questions: [],
    sources: ['Fund switch statement'],
    groups: [
      {
        kind: 'portfolioPosition',
        expectedRevision: oldRevision,
        reason: 'Close the old fund without renaming it',
        value: { ...position, snapshotDate: '2026-09-30', units: '0', value: '0' },
      },
      {
        kind: 'portfolioPosition',
        expectedRevision: context.emptyPositionRevision,
        reason: 'Open the new fund as a distinct identity',
        value: newFund,
      },
    ],
  });
  const preview = await owner.query(api.updates.preview, { jobId });
  await owner.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash });
  const after = await owner.query(api.portfolio.getExposure, { asOf: '2026-09-30', currency: 'NZD' });
  expect(after.rows.find((row) => row.id === oldId)).toMatchObject({
    instrument: position.instrument,
    units: '0',
    value: '0',
  });
  expect(after.rows.find((row) => row.instrument === newFund.instrument)).toMatchObject({ units: '80', value: '100' });
  expect(
    (await owner.query(api.portfolio.getExposure, { asOf: '2026-09-01', currency: 'NZD' })).rows.find(
      (row) => row.id === oldId,
    ),
  ).toMatchObject({ instrument: position.instrument, units: '100', value: '100' });
  await owner.mutation(api.updates.undo, { jobId, previewHash: preview.previewHash });
  const undone = await owner.query(api.portfolio.getExposure, { asOf: '2026-09-30', currency: 'NZD' });
  expect(undone.rows).toHaveLength(1);
  expect(undone.rows[0]).toMatchObject({ id: oldId, instrument: position.instrument, units: '100', value: '100' });
});

test('stock look-through combines issuer overlap without adding wealth and keeps missing disclosures visible', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|stocks', subject: 'stocks', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  await owner.mutation(api.portfolio.savePosition, position);
  await owner.mutation(api.portfolio.savePosition, {
    ...position,
    key: 'world',
    instrument: 'VT',
    name: 'World',
    retirement: true,
    value: '200',
  });
  await owner.mutation(api.portfolio.savePosition, { ...position, key: 'missing', instrument: 'Unknown', value: '50' });
  const futureId = await owner.mutation(api.portfolio.savePosition, {
    ...position,
    key: 'future',
    instrument: 'Future',
    snapshotDate: '2026-10-01',
  });
  await owner.mutation(api.portfolio.savePosition, {
    ...position,
    key: 'loan',
    instrument: 'Loan',
    debt: true,
    value: '400',
  });
  const source = {
    dimension: 'stock' as const,
    date: '2026-08-31',
    source: 'Official holdings',
    evidence: 'Provider top holdings only',
    complete: false,
  };
  await owner.mutation(api.portfolio.saveAllocation, {
    ...source,
    instrument: position.instrument,
    weights: [{ issuerId: 'alphabet', label: 'Alphabet', weight: '0.2' }],
  });
  await owner.mutation(api.portfolio.saveAllocation, {
    ...source,
    instrument: 'VT',
    weights: [
      { issuerId: 'alphabet', label: 'Alphabet', weight: '0.1' },
      { issuerId: 'apple', label: 'Apple', weight: '0.1' },
    ],
  });
  await owner.mutation(api.portfolio.saveAllocation, {
    ...source,
    instrument: position.instrument,
    kind: 'target',
    date: '2026-09-01',
    weights: [{ issuerId: 'apple', label: 'Apple', weight: '1' }],
  });
  await owner.mutation(api.portfolio.saveAllocation, {
    ...source,
    instrument: 'VT',
    date: '2026-10-01',
    weights: [{ issuerId: 'apple', label: 'Apple', weight: '1' }],
  });
  await owner.mutation(api.portfolio.saveAllocation, {
    instrument: 'VT',
    dimension: 'country',
    date: source.date,
    source: source.source,
    evidence: source.evidence,
    complete: false,
    weights: [{ label: 'United States', weight: '0.6' }],
  });
  const summary = await owner.query(api.portfolio.getExposure, { asOf: '2026-09-01', currency: 'NZD' });
  expect(summary).toMatchObject({
    gross: '350',
    debt: '400',
    net: '-50',
    retirementValue: '200',
    accessibleValue: '150',
  });
  expect(summary.stockExposure).toMatchObject({
    investmentsValue: '350',
    reportedValue: '60',
    remainingUnknown: '290',
    sourceCoverageValue: '300',
    completeValue: '0',
    unknownPositions: [futureId],
  });
  expect(summary.stockExposure.stocks[0]).toMatchObject({ issuerId: 'alphabet', value: '40', percentOfNet: null });
  expect(summary.stockExposure.stocks[0].contributions.map((row) => row.value)).toEqual(['20', '20']);
  expect(summary.stockExposure.sources.find((row) => row.instrument === 'Unknown')?.status).toBe('missing');
  expect(summary.stockExposure.sources.find((row) => row.instrument === 'VT')).toMatchObject({
    status: 'partial',
    allocationDate: '2026-08-31',
    holdingsDate: '2026-09-01',
    valuationDate: '2026-09-01',
  });
  expect(summary.breakdowns.find((row) => row.dimension === 'country')?.allocations[0]).toMatchObject({
    label: 'United States',
    value: '120',
    contributions: [{ instrument: 'VT', weight: '0.6', allocationDate: source.date, value: '120' }],
  });
});

test('stock jobs preserve provenance, revisions, retry and undo, while enforcing issuer identities', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|stockjob', subject: 'stockjob', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  await owner.mutation(api.portfolio.savePosition, position);
  const value = {
    instrument: position.instrument,
    dimension: 'stock' as const,
    date: '2026-09-01',
    source: 'Official leveraged holdings',
    evidence: 'Gross equity exposure; financing excluded',
    complete: false,
    weights: [{ issuerId: 'nvidia', label: 'Nvidia', weight: '1.1' }],
  };
  await expect(
    owner.mutation(api.portfolio.saveAllocation, { ...value, weights: [{ label: 'Nvidia', weight: '0.1' }] }),
  ).rejects.toThrow('issuer IDs');
  await expect(
    owner.mutation(api.portfolio.saveAllocation, {
      ...value,
      weights: [{ issuerId: 'nvidia', label: 'Nvidia', weight: '-0.1' }],
    }),
  ).rejects.toThrow('positive issuer');
  await expect(
    owner.mutation(api.portfolio.saveAllocation, {
      ...value,
      weights: [
        { issuerId: 'alphabet', label: 'Class A', weight: '0.1' },
        { issuerId: 'alphabet', label: 'Class C', weight: '0.1' },
      ],
    }),
  ).rejects.toThrow('issuer IDs');
  const context = await owner.query(api.updates.getContext, {});
  const expectedRevision = context.portfolio.instrumentRevisions.find(
    (row) => row.instrument === position.instrument,
  )?.revision;
  if (!expectedRevision) throw new Error('Missing instrument revision');
  const jobId = await owner.mutation(api.updates.stage, {
    version: 1,
    deployment: context.deployment,
    ownerId: context.ownerId,
    clientKey: 'stock-job',
    title: 'Stock disclosure',
    questions: [],
    sources: [value.source],
    groups: [{ kind: 'portfolioAllocation', expectedRevision, reason: 'Provider published dated holdings', value }],
  });
  const preview = await owner.query(api.updates.preview, { jobId });
  await owner.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash });
  await owner.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash });
  const summary = await owner.query(api.portfolio.getExposure, { asOf: '2026-09-01', currency: 'NZD' });
  expect(summary.gross).toBe('100');
  expect(summary.stockExposure).toMatchObject({
    reportedValue: '110',
    remainingUnknown: '0',
    sourceCoveragePercent: '100',
    completeValue: '0',
  });
  expect(summary.stockExposure.stocks[0]).toMatchObject({
    value: '110',
    percentOfGross: '110',
    percentOfNet: '110',
    contributions: [{ source: value.source, evidence: value.evidence }],
  });
  const other = t.withIdentity({ tokenIdentifier: 'test|stock-other', subject: 'stock-other', issuer: 'test' });
  await other.mutation(api.profiles.ensureCurrent, {});
  await expect(other.query(api.updates.preview, { jobId })).rejects.toThrow('Record not found');
  await owner.mutation(api.updates.undo, { jobId, previewHash: preview.previewHash });
  expect(
    (await owner.query(api.portfolio.getExposure, { asOf: '2026-09-01', currency: 'NZD' })).stockExposure.stocks,
  ).toHaveLength(0);
});

test('asset filters recompute exposure without inventing country and equity intersections', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|filtered', subject: 'filtered', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const profile = await owner.query(api.profiles.current, {});
  if (!profile) throw new Error('Missing profile');
  const fundId = await owner.mutation(api.portfolio.savePosition, position);
  const retirementId = await owner.mutation(api.portfolio.savePosition, {
    ...position,
    key: 'retirement',
    instrument: 'RET',
    value: '200',
    retirement: true,
  });
  await owner.mutation(api.portfolio.savePosition, { ...position, key: 'cashfund', instrument: 'CASH', value: '50' });
  await owner.mutation(api.portfolio.savePosition, {
    ...position,
    key: 'unknownmix',
    instrument: 'UNKNOWN',
    value: '30',
  });
  const bankId = await owner.run(async (ctx) => {
    const id = await ctx.db.insert('accounts', {
      ownerId: profile._id,
      name: 'ANZ cash',
      type: 'checking',
      institution: 'ANZ',
      currency: 'NZD',
      mask: '1234',
      archived: false,
      balanceAsOf: '2026-10-05',
    });
    await ctx.db.insert('balanceSnapshots', {
      ownerId: profile._id,
      accountId: id,
      date: '2026-09-01',
      ledgerMinor: 50000n,
      source: 'manual',
      voided: false,
    });
    return id;
  });
  const source = {
    date: '2026-09-01',
    source: 'Official asset mix',
    evidence: 'Observed net asset classes',
    complete: true,
  };
  for (const instrument of [position.instrument, 'RET']) {
    await owner.mutation(api.portfolio.saveAllocation, {
      ...source,
      instrument,
      dimension: 'assetClass',
      weights: [
        { label: 'International equities', weight: '0.8' },
        { label: 'Cash', weight: '0.2' },
      ],
    });
    await owner.mutation(api.portfolio.saveAllocation, {
      ...source,
      instrument,
      dimension: 'country',
      complete: false,
      weights: [{ label: 'United States', weight: '0.6' }],
    });
  }
  await owner.mutation(api.portfolio.saveAllocation, {
    ...source,
    instrument: 'UNKNOWN',
    dimension: 'assetClass',
    weights: [{ label: 'Growth assets', weight: '1' }],
  });
  await owner.mutation(api.portfolio.saveAllocation, {
    ...source,
    instrument: 'CASH',
    dimension: 'assetClass',
    weights: [{ label: 'Cash', weight: '1' }],
  });
  await owner.mutation(api.portfolio.saveAllocation, {
    ...source,
    instrument: position.instrument,
    dimension: 'stock',
    complete: false,
    weights: [{ issuerId: 'nvidia', label: 'Nvidia', weight: '0.2' }],
  });
  const all = await owner.query(api.portfolio.getExposure, { asOf: source.date, currency: 'NZD' });
  expect(all.gross).toBe('880');
  expect(all.rows.find((row) => row.id === bankId)?.futureBalanceDate).toBe('2026-10-05');
  const equities = await owner.query(api.portfolio.getExposure, {
    asOf: source.date,
    currency: 'NZD',
    assetScope: 'equities',
  });
  expect(equities).toMatchObject({
    gross: '330',
    portfolioGross: '880',
    portfolioNet: '880',
    equitySummary: { value: '240', unknownValue: '30' },
  });
  expect(equities.rows.map((row) => row.instrument).sort()).toEqual(['NZX:USG', 'RET', 'UNKNOWN']);
  expect(equities.breakdowns.find((row) => row.dimension === 'country')?.allocations[0].value).toBe('180');
  expect(equities.filterOptions).toHaveLength(5);
  const selected = await owner.query(api.portfolio.getExposure, {
    asOf: source.date,
    currency: 'NZD',
    positionIds: [fundId],
    assetScope: 'equities',
  });
  expect(selected).toMatchObject({ gross: '100', equitySummary: { value: '80' } });
  expect(selected.stockExposure.stocks[0]).toMatchObject({
    value: '20',
    percentOfNet: '20',
    percentOfPortfolioNet: '2.272727272727',
  });
  expect(selected.breakdowns.find((row) => row.dimension === 'country')?.allocations[0].value).toBe('60');
  const retired = await owner.query(api.portfolio.getExposure, {
    asOf: source.date,
    currency: 'NZD',
    retirement: 'retirement',
  });
  expect(retired.rows.map((row) => row.id)).toEqual([retirementId]);
  const empty = await owner.query(api.portfolio.getExposure, { asOf: source.date, currency: 'NZD', positionIds: [] });
  expect(empty).toMatchObject({ rows: [], gross: '0', equitySummary: { value: '0' }, stockExposure: { stocks: [] } });
});

test('each breakdown reports per-fund disclosure gaps without letting gross leverage hide another fund', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|disclosure-gaps', subject: 'disclosure-gaps', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  await owner.mutation(api.portfolio.savePosition, position);
  for (const instrument of ['LEVERAGED', 'SIGNED', 'MISSING'])
    await owner.mutation(api.portfolio.savePosition, { ...position, key: instrument, instrument });
  const source = {
    dimension: 'country' as const,
    date: '2026-08-31',
    source: 'Official country disclosure',
    evidence: 'Net asset weights',
    complete: false,
  };
  await owner.mutation(api.portfolio.saveAllocation, {
    ...source,
    instrument: position.instrument,
    weights: [{ label: 'United States', weight: '0.4' }],
  });
  await owner.mutation(api.portfolio.saveAllocation, {
    ...source,
    instrument: 'LEVERAGED',
    weights: [{ label: 'United States', weight: '1.1' }],
  });
  await owner.mutation(api.portfolio.saveAllocation, {
    ...source,
    instrument: 'SIGNED',
    complete: true,
    weights: [
      { label: 'United States', weight: '1.1' },
      { label: 'Financing offset', weight: '-0.1' },
    ],
  });
  const summary = await owner.query(api.portfolio.getExposure, { asOf: '2026-09-01', currency: 'NZD' });
  const country = summary.breakdowns.find((row) => row.dimension === 'country');
  expect(country).toMatchObject({
    reportedValue: '250',
    unmappedValue: '160',
    covered: '100',
    unresolved: '300',
    reportedPercent: '62.5',
  });
  expect(country?.sources.find((row) => row.instrument === position.instrument)).toMatchObject({
    value: '100',
    reportedWeight: '0.4',
    reportedValue: '40',
    unmappedValue: '60',
    status: 'partial',
    allocationDate: source.date,
    source: source.source,
    evidence: source.evidence,
    hasSignedOffsets: false,
    grossExposure: false,
  });
  expect(country?.sources.find((row) => row.instrument === 'LEVERAGED')).toMatchObject({
    reportedValue: '110',
    unmappedValue: '0',
    status: 'partial',
    grossExposure: true,
    hasSignedOffsets: false,
  });
  expect(country?.sources.find((row) => row.instrument === 'SIGNED')).toMatchObject({
    reportedValue: '100',
    unmappedValue: '0',
    status: 'complete',
    grossExposure: true,
    hasSignedOffsets: true,
  });
  expect(country?.sources.find((row) => row.instrument === 'MISSING')).toMatchObject({
    reportedWeight: '0',
    reportedValue: '0',
    unmappedValue: '100',
    status: 'missing',
    allocationDate: null,
    source: null,
    evidence: null,
  });
});

test('reviewed country assumptions fill only residual exposure, remain distinct and undo cleanly', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({
    tokenIdentifier: 'test|country-assumptions',
    subject: 'country-assumptions',
    issuer: 'test',
  });
  await owner.mutation(api.profiles.ensureCurrent, {});
  for (const instrument of [position.instrument, 'MISSING', 'LEVERAGED'])
    await owner.mutation(api.portfolio.savePosition, { ...position, key: instrument, instrument });
  const source = {
    dimension: 'country' as const,
    date: '2026-09-01',
    source: 'Actual provider holdings',
    evidence: 'Partial observed country weights',
    complete: false,
  };
  await owner.mutation(api.portfolio.saveAllocation, {
    ...source,
    instrument: position.instrument,
    weights: [{ label: 'United States', weight: '0.4' }],
  });
  await owner.mutation(api.portfolio.saveAllocation, {
    ...source,
    instrument: 'LEVERAGED',
    weights: [{ label: 'United States', weight: '1.1' }],
  });
  const assumption = {
    ...source,
    kind: 'assumption' as const,
    date: '2026-09-02',
    source: 'User fund-country default',
    evidence: 'Assign only unknown residual to New Zealand; not a provider disclosure',
    weights: [{ label: 'New Zealand', weight: '1' }],
  };
  await expect(
    owner.mutation(api.portfolio.saveAllocation, { ...assumption, instrument: 'MISSING', complete: true }),
  ).rejects.toThrow('Country assumptions');
  await expect(
    owner.mutation(api.portfolio.saveAllocation, { ...assumption, instrument: 'MISSING', dimension: 'industry' }),
  ).rejects.toThrow('Country assumptions');
  await expect(
    owner.mutation(api.portfolio.saveAllocation, {
      ...assumption,
      instrument: 'MISSING',
      weights: [{ label: 'New Zealand', weight: '0.5' }],
    }),
  ).rejects.toThrow('Country assumptions');
  await expect(
    owner.mutation(api.portfolio.saveAllocation, {
      ...assumption,
      instrument: 'MISSING',
      weights: [
        { label: 'New Zealand', weight: '1.1' },
        { label: 'Australia', weight: '-0.1' },
      ],
    }),
  ).rejects.toThrow('Country assumptions');
  await owner.mutation(api.portfolio.saveAllocation, {
    ...assumption,
    instrument: 'MISSING',
    date: '2026-10-01',
    weights: [{ label: 'Australia', weight: '1' }],
  });
  const context = await owner.query(api.updates.getContext, {});
  const groups = [position.instrument, 'MISSING', 'LEVERAGED'].map((instrument) => {
    const expectedRevision = context.portfolio.instrumentRevisions.find(
      (row) => row.instrument === instrument,
    )?.revision;
    if (!expectedRevision) throw new Error('Missing instrument revision');
    return {
      kind: 'portfolioAllocation' as const,
      expectedRevision,
      reason: 'User requested residual country defaults',
      value: { ...assumption, instrument },
    };
  });
  const jobId = await owner.mutation(api.updates.stage, {
    version: 1,
    deployment: context.deployment,
    ownerId: context.ownerId,
    clientKey: 'country-assumption-job',
    title: 'Country defaults',
    questions: [],
    sources: [assumption.source],
    groups,
  });
  const preview = await owner.query(api.updates.preview, { jobId });
  await owner.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash });
  await owner.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash });
  const before = await owner.query(api.portfolio.getExposure, { asOf: '2026-09-01', currency: 'NZD' });
  expect(before.breakdowns.find((row) => row.dimension === 'country')?.assumedValue).toBe('0');
  const summary = await owner.query(api.portfolio.getExposure, { asOf: '2026-09-02', currency: 'NZD' });
  expect(summary.gross).toBe('300');
  const country = summary.breakdowns.find((row) => row.dimension === 'country');
  expect(country).toMatchObject({
    reportedValue: '150',
    assumedValue: '160',
    attributedValue: '310',
    unmappedValue: '160',
    remainingUnmappedValue: '0',
    covered: '0',
    unresolved: '300',
  });
  expect(country?.sources.find((row) => row.instrument === position.instrument)).toMatchObject({
    status: 'partial',
    reportedValue: '40',
    assumedValue: '60',
    unmappedValue: '60',
    remainingUnmappedValue: '0',
    assumptionDate: assumption.date,
    assumptionSource: assumption.source,
  });
  expect(country?.sources.find((row) => row.instrument === 'MISSING')).toMatchObject({
    status: 'missing',
    reportedValue: '0',
    assumedValue: '100',
    allocationDate: null,
    source: null,
  });
  expect(country?.sources.find((row) => row.instrument === 'LEVERAGED')?.assumedValue).toBe('0');
  expect(
    country?.allocations
      .find((row) => row.label === 'New Zealand')
      ?.contributions.find((row) => row.instrument === position.instrument),
  ).toMatchObject({ basis: 'assumed', value: '60', weight: '0.6', source: assumption.source });
  expect(
    country?.allocations
      .find((row) => row.label === 'United States')
      ?.contributions.every((row) => row.basis === 'disclosed'),
  ).toBe(true);
  const disabled = await owner.query(api.portfolio.getExposure, {
    asOf: '2026-09-02',
    currency: 'NZD',
    includeAssumptions: false,
  });
  expect(disabled.breakdowns.find((row) => row.dimension === 'country')).toMatchObject({
    assumedValue: '0',
    remainingUnmappedValue: '160',
    attributedValue: '150',
  });
  expect(disabled.breakdowns.find((row) => row.dimension === 'country')?.sources[0].assumptionSource).toBe(
    assumption.source,
  );
  await owner.mutation(api.updates.undo, { jobId, previewHash: preview.previewHash });
  expect(
    (await owner.query(api.portfolio.getExposure, { asOf: '2026-09-02', currency: 'NZD' })).breakdowns.find(
      (row) => row.dimension === 'country',
    )?.assumedValue,
  ).toBe('0');
});
