/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('performance requires ownership and values imported units at their observed date', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|performance', subject: 'performance', issuer: 'test' });
  const stranger = t.withIdentity({ tokenIdentifier: 'test|stranger', subject: 'stranger', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  await stranger.mutation(api.profiles.ensureCurrent, {});
  const profile = await owner.query(api.profiles.current, {});
  if (!profile) throw new Error('Missing profile');
  const accountId = await t.run(async (ctx) => {
    const account = await ctx.db.insert('investmentAccounts', {
      ownerId: profile._id,
      name: 'Simplicity',
      provider: 'Simplicity',
      currency: 'NZD',
      sourceKeyHash: 'source',
      archived: false,
    });
    const importId = await ctx.db.insert('investmentImports', {
      ownerId: profile._id,
      storageId: await ctx.storage.store(new Blob(['history'])),
      fileName: 'history.csv',
      size: 7,
      sha256: 'test',
      status: 'committed',
      totalRows: 2,
      readyRows: 0,
      duplicateRows: 0,
      invalidRows: 0,
      committedRows: 2,
      startedAt: 1,
    });
    for (const row of [
      { effectiveDate: '2025-01-01', transactionType: 'Switch', units: '100', unitPrice: '2', amountMinor: 20000n },
      {
        effectiveDate: '2025-02-01',
        transactionType: 'Employee Contributions',
        units: '10',
        unitPrice: '3',
        amountMinor: 3000n,
      },
    ])
      await ctx.db.insert('investmentTransactions', {
        ...row,
        ownerId: profile._id,
        accountId: account,
        description: row.transactionType,
        currency: 'NZD',
        createdByImportId: importId,
        voided: false,
      });
    return account;
  });
  const holdingId = await t.run((ctx) =>
    ctx.db.insert('portfolioPositions', {
      ownerId: profile._id,
      key: 'high-growth',
      name: 'High Growth',
      account: 'KiwiSaver',
      instrument: 'SIMPLICITY-HIGH-GROWTH',
      currency: 'NZD',
      retirement: true,
      debt: false,
      snapshotDate: '2025-02-01',
      basis: 'trade',
      sameDayCovered: true,
      units: '110',
      value: '330',
      source: 'provider',
      evidence: 'statement',
    }),
  );
  await expect(
    owner.mutation(api.portfolioPerformance.configure, {
      accountId,
      positionId: holdingId,
      zeroOpening: false,
      priceSourceConfirmed: false,
    }),
  ).rejects.toThrow('Confirm');
  await expect(
    stranger.mutation(api.portfolioPerformance.configure, {
      accountId,
      positionId: holdingId,
      zeroOpening: true,
      priceSourceConfirmed: true,
    }),
  ).rejects.toThrow('Record not found');
  for (const patch of [{ debt: true }, { debt: false, ownershipShare: '0.5' }]) {
    await t.run((ctx) => ctx.db.patch('portfolioPositions', holdingId, patch));
    await expect(
      owner.mutation(api.portfolioPerformance.configure, {
        accountId,
        positionId: holdingId,
        zeroOpening: false,
        priceSourceConfirmed: true,
      }),
    ).rejects.toThrow('fully owned');
  }
  await t.run((ctx) => ctx.db.patch('portfolioPositions', holdingId, { debt: false, ownershipShare: '1' }));
  await owner.mutation(api.portfolioPerformance.configure, {
    accountId,
    positionId: holdingId,
    zeroOpening: false,
    priceSourceConfirmed: true,
  });
  expect((await owner.query(api.portfolioPerformance.options, {})).accounts[0]?.performancePositionId).toBe(holdingId);
  const historical = await owner.query(api.portfolioPerformance.history, { accountId, asOf: '2025-01-01' });
  expect(historical.observations).toHaveLength(1);
  expect(historical.observations[0]).toMatchObject({ capital: '200', value: '200' });
  const result = await owner.query(api.portfolioPerformance.history, { accountId, asOf: '2025-02-01' });
  expect(result.observations.at(-1)).toMatchObject({ capital: '230', value: '330' });
  await expect(stranger.query(api.portfolioPerformance.history, { accountId, asOf: '2025-02-01' })).rejects.toThrow(
    'Record not found',
  );
  await expect(t.query(api.portfolioPerformance.options, {})).rejects.toThrow('signed in');
});
