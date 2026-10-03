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
  const assets = await owner.query(api.portfolioPerformance.allAssets, {
    asOf: '2025-02-01',
    reportingCurrency: 'NZD',
  });
  expect(assets).toHaveLength(1);
  expect(assets[0]).toMatchObject({ id: accountId, name: 'Simplicity' });
  expect(assets[0]?.observations.at(-1)).toMatchObject({ capital: '230', value: '330' });
  expect(
    await stranger.query(api.portfolioPerformance.allAssets, { asOf: '2025-02-01', reportingCurrency: 'NZD' }),
  ).toEqual([]);
  await expect(
    t.query(api.portfolioPerformance.allAssets, { asOf: '2025-02-01', reportingCurrency: 'NZD' }),
  ).rejects.toThrow('signed in');
  await t.run(async (ctx) => {
    const transaction = await ctx.db.query('investmentTransactions').first();
    if (!transaction) throw new Error('Missing transaction');
    await ctx.db.patch('investmentAccounts', accountId, { performanceZeroOpening: true });
    await ctx.db.insert('investmentTransactions', {
      ownerId: profile._id,
      accountId,
      effectiveDate: '2025-02-01',
      transactionType: 'Buy',
      description: 'Buy',
      instrumentCode: 'SECOND',
      units: '10',
      unitPrice: '5',
      amountMinor: 5000n,
      currency: 'NZD',
      createdByImportId: transaction.createdByImportId,
      voided: false,
    });
    await ctx.db.insert('accounts', {
      ownerId: profile._id,
      name: 'Savings',
      type: 'savings',
      currency: 'NZD',
      mask: '1234',
      archived: false,
    });
    await ctx.db.insert('accounts', {
      ownerId: profile._id,
      name: 'Loan',
      type: 'loan',
      currency: 'NZD',
      mask: '5678',
      archived: false,
    });
  });
  const split = await owner.query(api.portfolioPerformance.allAssets, { asOf: '2025-02-01', reportingCurrency: 'NZD' });
  expect(split).toHaveLength(3);
  expect(split.find((asset) => asset.name.startsWith('SECOND'))?.observations.at(-1)).toMatchObject({
    capital: '50',
    value: '50',
  });
  expect(split.find((asset) => asset.name === 'Simplicity')?.observations.at(-1)).toMatchObject({
    capital: '230',
    value: '330',
  });
  expect(split.find((asset) => asset.name === 'Savings')?.observations).toEqual([]);
  expect(split.some((asset) => asset.name === 'Loan')).toBe(false);
  await expect(t.query(api.portfolioPerformance.options, {})).rejects.toThrow('signed in');
});

test('cash-only transactions do not fabricate a complete loss from zero placeholder units', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|cash-only', subject: 'cash-only', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const profile = await owner.query(api.profiles.current, {});
  if (!profile) throw new Error('Missing profile');
  const accountId = await t.run(async (ctx) => {
    const account = await ctx.db.insert('investmentAccounts', {
      ownerId: profile._id,
      name: 'Hostplus',
      provider: 'Hostplus',
      currency: 'AUD',
      sourceKeyHash: 'cash-only',
      archived: false,
      performanceZeroOpening: true,
    });
    const importId = await ctx.db.insert('investmentImports', {
      ownerId: profile._id,
      storageId: await ctx.storage.store(new Blob(['cash-only'])),
      fileName: 'history.csv',
      size: 9,
      sha256: 'cash-only',
      status: 'committed',
      totalRows: 1,
      readyRows: 0,
      duplicateRows: 0,
      invalidRows: 0,
      committedRows: 1,
      startedAt: 1,
    });
    await ctx.db.insert('investmentTransactions', {
      ownerId: profile._id,
      accountId: account,
      effectiveDate: '2026-08-17',
      transactionType: 'Personal contribution',
      description: 'Personal contribution · Units not supplied',
      units: '0',
      unitPrice: '1',
      amountMinor: 10000n,
      currency: 'AUD',
      createdByImportId: importId,
      voided: false,
    });
    return account;
  });
  const history = await owner.query(api.portfolioPerformance.history, { accountId, asOf: '2026-08-17' });
  expect(history).toMatchObject({ complete: false, totalsAvailable: false, personal: '100' });
  expect(history.observations[0]?.value).toBeNull();
  expect(history.issues.join(' ')).toContain('do not supply units');
});
