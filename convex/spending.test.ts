/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('spending respects source coverage, suggestions, explicit treatments, splits and ownership', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|spending', subject: 'spending', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const profile = await owner.query(api.profiles.current, {});
  if (!profile) throw new Error('Profile missing');
  const accountId = await owner.mutation(api.finance.createAccount, {
    name: 'CommBank',
    currency: 'AUD',
    type: 'checking',
    mask: '1234',
  });
  const groups = await owner.query(api.finance.listCategories, {});
  const grocery = groups.flatMap((group) => group.categories).find((category) => category.name === 'Groceries');
  if (!grocery) throw new Error('Groceries missing');
  await owner.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(['spending']));
    const importId = await ctx.db.insert('imports', {
      ownerId: profile._id,
      accountId,
      storageId,
      fileName: 'commbank.ofx',
      size: 8,
      sha256: 'spending',
      format: 'ofx',
      status: 'committed',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-03',
      totalRows: 2,
      readyRows: 0,
      pendingRows: 0,
      duplicateRows: 0,
      possibleDuplicateRows: 0,
      invalidRows: 0,
      committedRows: 2,
      startedAt: 1,
    });
    const base = {
      ownerId: profile._id,
      accountId,
      postedDate: '2026-10-03',
      currency: 'AUD',
      rawDescription: 'mixed purchase',
      normalizedDescription: 'mixed purchase',
      excluded: false,
      voided: false,
      createdByImportId: importId,
    };
    const first = await ctx.db.insert('transactions', {
      ...base,
      amountMinor: -10000n,
      reportingKind: 'standard',
      categoryId: grocery._id,
    });
    const second = await ctx.db.insert('transactions', {
      ...base,
      amountMinor: -2000n,
      reportingKind: 'standard',
      categoryId: grocery._id,
    });
    await ctx.db.insert('transactionSplits', {
      ownerId: profile._id,
      transactionId: first,
      parts: [
        { amountMinor: '-7500', categoryId: grocery._id, reportingTreatment: 'expense' },
        { amountMinor: '-2500', reportingTreatment: 'investment' },
      ],
    });
    await ctx.db.insert('transactionLinks', {
      ownerId: profile._id,
      fromTransactionId: first,
      toTransactionId: second,
      type: 'transfer',
      status: 'suggested',
      confidence: 0.9,
      createdBy: 'system',
    });
    await ctx.db.insert('portfolioFxRates', {
      ownerId: profile._id,
      from: 'AUD',
      to: 'NZD',
      date: '2026-10-02',
      rate: '1.1',
      source: 'Fixture rate',
    });
  });
  const report = await owner.query(api.spending.summary, { from: '2026-10-01', to: '2026-10-03', currency: 'NZD' });
  expect(report.current.spendingMinor).toBe(10450n);
  expect(report.current.investmentMinor).toBe(2750n);
  expect(report.current.transfers).toBe(0);
  expect(report.current.complete).toBe(true);
  expect(report.coverage[0].ranges[0]).toMatchObject({ from: '2026-10-01', to: '2026-10-03' });
  const outsider = t.withIdentity({ tokenIdentifier: 'test|outsider', subject: 'outsider', issuer: 'test' });
  await outsider.mutation(api.profiles.ensureCurrent, {});
  expect(
    (await outsider.query(api.spending.summary, { from: '2026-10-01', to: '2026-10-03', currency: 'NZD' })).current
      .spendingMinor,
  ).toBe(0n);
  await owner.run(async (ctx) => {
    const row = await ctx.db
      .query('transactions')
      .withIndex('by_ownerId_and_postedDate', (q) => q.eq('ownerId', profile._id))
      .first();
    if (!row) throw new Error('Transaction missing');
    for (let index = 0; index < 2000; index++)
      await ctx.db.insert('transactions', {
        ownerId: profile._id,
        accountId,
        postedDate: '2026-10-03',
        currency: 'AUD',
        amountMinor: -100n,
        rawDescription: 'Many rows',
        normalizedDescription: 'many rows',
        excluded: false,
        voided: false,
        reportingKind: 'standard',
        categoryId: grocery._id,
        createdByImportId: row.createdByImportId,
      });
  });
  const limited = await owner.query(api.spending.summary, { from: '2026-10-01', to: '2026-10-03', currency: 'NZD' });
  expect(limited.current.truncated).toBe(true);
  expect(limited.current.complete).toBe(false);
});
