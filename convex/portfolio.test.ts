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
