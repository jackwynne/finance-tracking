/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('initializes isolated profiles and seeded categories', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|owner', subject: 'owner', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const categories = await owner.query(api.finance.listCategories, {});
  expect(categories.map((group) => group.name)).toContain('Housing');
  expect(categories.map((group) => group.name)).toContain('Income');
  expect(categories.map((group) => group.name)).toContain('Investments');
  expect(categories.find((group) => group.name === 'Investments')?.kind).toBe('investment');
  await owner.mutation(api.profiles.ensureCurrent, {});
  const categoriesAfterSecondEnsure = await owner.query(api.finance.listCategories, {});
  expect(categoriesAfterSecondEnsure.filter((group) => group.name === 'Investments')).toHaveLength(1);
});

test('separates investment purchases from spending and cash flow', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|owner', subject: 'owner', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const profile = await owner.query(api.profiles.current, {});
  if (!profile) throw new Error('Expected a seeded profile.');
  const groups = await owner.query(api.finance.listCategories, {});
  const investmentCategory = groups
    .find((group) => group.kind === 'investment')
    ?.categories.find((category) => category.name === 'Shares & ETFs');
  if (!investmentCategory) throw new Error('Expected the shares investment category.');
  const accountId = await owner.mutation(api.finance.createAccount, {
    name: 'Everyday account',
    type: 'checking',
    currency: 'NZD',
    mask: '•••• 1234',
  });

  await owner.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(['investment-test']));
    const importId = await ctx.db.insert('imports', {
      ownerId: profile._id,
      storageId,
      fileName: 'investment-test.ofx',
      size: 15,
      sha256: 'investment-test',
      format: 'ofx',
      status: 'committed',
      totalRows: 3,
      readyRows: 0,
      pendingRows: 0,
      duplicateRows: 0,
      possibleDuplicateRows: 0,
      invalidRows: 0,
      committedRows: 3,
      startedAt: 1,
      completedAt: 2,
    });
    const baseTransaction = {
      ownerId: profile._id,
      accountId,
      postedDate: '2026-07-10',
      currency: 'NZD',
      excluded: false,
      voided: false,
      reportingKind: 'standard' as const,
      createdByImportId: importId,
    };
    await ctx.db.insert('transactions', {
      ...baseTransaction,
      amountMinor: 250_000n,
      rawDescription: 'Salary',
      normalizedDescription: 'salary',
    });
    await ctx.db.insert('transactions', {
      ...baseTransaction,
      amountMinor: -5_000n,
      rawDescription: 'Groceries',
      normalizedDescription: 'groceries',
    });
    await ctx.db.insert('transactions', {
      ...baseTransaction,
      amountMinor: -100_000n,
      rawDescription: 'Share purchase',
      normalizedDescription: 'share purchase',
      categoryId: investmentCategory._id,
    });
  });

  const dashboard = await owner.query(api.finance.dashboard, {
    dateFrom: '2026-07-01',
    dateTo: '2026-07-31',
    currentDate: '2026-07-31',
  });
  expect(dashboard.incomeMinor).toBe(250_000n);
  expect(dashboard.spendingMinor).toBe(5_000n);
  expect(dashboard.investedMinor).toBe(100_000n);
  expect(dashboard.netCashFlowMinor).toBe(145_000n);
  expect(dashboard.monthly).toEqual([
    { month: '2026-07', incomeMinor: 250_000n, spendingMinor: 5_000n, investedMinor: 100_000n },
  ]);
});

test('prevents another identity from changing an account', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|owner', subject: 'owner', issuer: 'test' });
  const stranger = t.withIdentity({ tokenIdentifier: 'test|stranger', subject: 'stranger', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  await stranger.mutation(api.profiles.ensureCurrent, {});
  const accountId = await owner.mutation(api.finance.createAccount, {
    name: 'Private account',
    type: 'checking',
    currency: 'NZD',
    mask: '•••• 1234',
  });
  await expect(stranger.mutation(api.finance.updateAccount, { accountId, name: 'Not allowed' })).rejects.toThrow(
    'Record not found',
  );
});
