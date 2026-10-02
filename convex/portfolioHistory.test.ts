/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('recorded bank observations exclude future and voided balances, use latest same-day correction and stay owned', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|history', subject: 'history', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const profile = await owner.query(api.profiles.current, {});
  if (!profile) throw new Error('Missing profile');
  await owner.run(async (ctx) => {
    const accountId = await ctx.db.insert('accounts', {
      ownerId: profile._id,
      name: 'Card',
      currency: 'NZD',
      mask: '1',
      type: 'creditCard',
      archived: false,
    });
    for (const [date, ledgerMinor, voided] of [
      ['2026-01-01', -10005n, false],
      ['2026-02-01', -20005n, false],
      ['2026-02-01', -21005n, false],
      ['2026-03-01', -50000n, true],
      ['2026-05-01', -99999n, false],
    ] satisfies Array<[string, bigint, boolean]>) {
      await ctx.db.insert('balanceSnapshots', {
        ownerId: profile._id,
        accountId,
        date,
        ledgerMinor,
        voided,
        source: 'manual',
      });
    }
  });
  const history = await owner.query(api.portfolioHistory.recordedBalances, { asOf: '2026-04-01' });
  expect(history[0].observations).toEqual([
    { date: '2026-01-01', value: '-100.05', source: 'manual' },
    { date: '2026-02-01', value: '-210.05', source: 'manual' },
  ]);
  const other = t.withIdentity({ tokenIdentifier: 'test|otherHistory', subject: 'otherHistory', issuer: 'test' });
  await other.mutation(api.profiles.ensureCurrent, {});
  expect(await other.query(api.portfolioHistory.recordedBalances, { asOf: '2026-04-01' })).toEqual([]);
});

test('holding history applies dated ownership shares and never backfills a future opening balance', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|propertyHistory', subject: 'propertyHistory', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const position = {
    key: 'property',
    name: 'Home',
    account: 'Joint',
    instrument: 'property:home',
    currency: 'NZD',
    retirement: false,
    debt: false,
    snapshotDate: '2026-09-01',
    basis: 'trade',
    sameDayCovered: true,
    units: '0',
    value: '1000000',
    ownershipShare: '0.25',
    source: 'Valuation',
    evidence: 'Quarter share',
  } satisfies Parameters<typeof owner.mutation<typeof api.portfolio.savePosition>>[1];
  await owner.mutation(api.portfolio.savePosition, position);
  expect((await owner.query(api.portfolioHistory.recordedBalances, { asOf: '2026-08-31' }))[0].observations).toEqual(
    [],
  );
  await owner.mutation(api.portfolio.savePosition, {
    ...position,
    snapshotDate: '2026-10-01',
    value: '1200000',
    ownershipShare: '0.5',
  });
  const history = await owner.query(api.portfolioHistory.recordedBalances, { asOf: '2026-10-02' });
  expect(history[0].observations.map((row) => ({ date: row.date, value: row.value }))).toEqual([
    { date: '2026-09-01', value: '250000' },
    { date: '2026-10-01', value: '600000' },
  ]);
});
