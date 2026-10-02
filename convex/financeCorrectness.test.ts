/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|correctness', subject: 'correctness', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const profile = await owner.query(api.profiles.current, {});
  if (!profile) throw new Error('Missing profile');
  const accountId = await owner.mutation(api.finance.createAccount, {
    name: 'ANZ',
    type: 'checking',
    currency: 'NZD',
    mask: '1234',
  });
  const importId = await owner.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(['source']));
    return ctx.db.insert('imports', {
      ownerId: profile._id,
      accountId,
      storageId,
      fileName: 'source.ofx',
      size: 6,
      sha256: 'source',
      format: 'ofx',
      status: 'committed',
      totalRows: 30,
      readyRows: 0,
      pendingRows: 0,
      duplicateRows: 0,
      possibleDuplicateRows: 0,
      invalidRows: 0,
      committedRows: 30,
      startedAt: 1,
    });
  });
  return { t, owner, profile, accountId, importId };
}

test('a single transaction edit preserves merchant defaults and paginated filters return matching rows', async () => {
  const { owner, profile, accountId, importId } = await setup();
  const groups = await owner.query(api.finance.listCategories, {});
  const oldCategory = groups[0].categories[0];
  const newCategory = groups[1].categories[0];
  const ids = await owner.run(async (ctx) => {
    const merchant = await ctx.db.insert('counterparties', {
      ownerId: profile._id,
      name: 'Shop',
      normalizedName: 'shop',
      archived: false,
      defaultCategoryId: oldCategory._id,
    });
    const base = {
      ownerId: profile._id,
      accountId,
      postedDate: '2026-10-01',
      amountMinor: -100n,
      currency: 'NZD',
      rawDescription: 'Shop',
      normalizedDescription: 'shop',
      excluded: false,
      voided: false,
      reportingKind: 'standard' as const,
      createdByImportId: importId,
      counterpartyId: merchant,
      categoryId: oldCategory._id,
    };
    const transaction = await ctx.db.insert('transactions', base);
    await ctx.db.insert('transactions', { ...base, voided: true });
    return { merchant, transaction };
  });
  await owner.mutation(api.finance.updateTransaction, {
    transactionId: ids.transaction,
    categoryId: newCategory._id,
    scope: 'transaction',
  });
  expect(await owner.run((ctx) => ctx.db.get('counterparties', ids.merchant))).toMatchObject({
    defaultCategoryId: oldCategory._id,
  });
  const page = await owner.query(api.finance.listTransactions, {
    paginationOpts: { cursor: null, numItems: 1 },
    categoryId: newCategory._id,
  });
  expect(page.page.map((row) => row._id)).toEqual([ids.transaction]);
});

test('bank rollback processes more than 25 rows while retaining transactions with another source', async () => {
  vi.useFakeTimers();
  try {
    const { t, owner, profile, accountId, importId } = await setup();
    const ids = await owner.run(async (ctx) => {
      const job = await ctx.db.get('imports', importId);
      if (!job) throw new Error('Missing import');
      const { _id, _creationTime, ...jobFields } = job;
      const otherImport = await ctx.db.insert('imports', { ...jobFields, sha256: 'other' });
      const transactions = [];
      for (let rowNumber = 0; rowNumber < 30; rowNumber++) {
        const transactionId = await ctx.db.insert('transactions', {
          ownerId: profile._id,
          accountId,
          postedDate: '2026-10-01',
          amountMinor: -100n,
          currency: 'NZD',
          rawDescription: `Shop ${rowNumber}`,
          normalizedDescription: `shop ${rowNumber}`,
          excluded: false,
          voided: false,
          reportingKind: 'standard',
          createdByImportId: importId,
        });
        const fields = {
          ownerId: profile._id,
          importId,
          rowNumber,
          status: 'committed' as const,
          format: 'ofx' as const,
          dedupeKey: `row-${rowNumber}`,
          postedDate: '2026-10-01',
          amountMinor: -100n,
          currency: 'NZD',
          rawDescription: 'Shop',
          normalizedDescription: 'shop',
          sourceJson: '{}',
          transactionId,
        };
        const importRowId = await ctx.db.insert('importRows', fields);
        const source = {
          ownerId: profile._id,
          transactionId,
          importId,
          importRowId,
          format: 'ofx' as const,
          dedupeKey: fields.dedupeKey,
          sourceJson: '{}',
          voided: false,
        };
        await ctx.db.insert('transactionSources', source);
        if (rowNumber === 29) {
          const otherRow = await ctx.db.insert('importRows', { ...fields, importId: otherImport });
          await ctx.db.insert('transactionSources', { ...source, importId: otherImport, importRowId: otherRow });
        }
        transactions.push(transactionId);
      }
      return transactions;
    });
    await owner.mutation(api.imports.rollback, { importId });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const rows = await owner.run(async (ctx) => Promise.all(ids.map((id) => ctx.db.get('transactions', id))));
    expect(rows.slice(0, 29).every((row) => row?.voided)).toBe(true);
    expect(rows[29]?.voided).toBe(false);
    expect(await owner.run((ctx) => ctx.db.get('imports', importId))).toMatchObject({ status: 'rolledBack' });
  } finally {
    vi.useRealTimers();
  }
});

test('transfer suggestions require matching currency and never alter reporting before confirmation', async () => {
  const { owner, profile, accountId, importId } = await setup();
  const secondAccount = await owner.mutation(api.finance.createAccount, {
    name: 'CommBank',
    type: 'checking',
    currency: 'AUD',
    mask: '5678',
  });
  const ids = await owner.run(async (ctx) => {
    const base = {
      ownerId: profile._id,
      postedDate: '2026-10-01',
      rawDescription: 'Transfer',
      normalizedDescription: 'transfer',
      excluded: false,
      voided: false,
      reportingKind: 'standard' as const,
      createdByImportId: importId,
    };
    const outgoing = await ctx.db.insert('transactions', { ...base, accountId, amountMinor: -100n, currency: 'NZD' });
    const incoming = await ctx.db.insert('transactions', {
      ...base,
      accountId: secondAccount,
      amountMinor: 100n,
      currency: 'AUD',
    });
    const importRowId = await ctx.db.insert('importRows', {
      ownerId: profile._id,
      importId,
      rowNumber: 0,
      status: 'committed',
      format: 'ofx',
      dedupeKey: 'transfer',
      postedDate: base.postedDate,
      amountMinor: -100n,
      currency: 'NZD',
      rawDescription: base.rawDescription,
      normalizedDescription: base.normalizedDescription,
      sourceJson: '{}',
      transactionId: outgoing,
    });
    await ctx.db.insert('transactionSources', {
      ownerId: profile._id,
      importId,
      importRowId,
      transactionId: outgoing,
      format: 'ofx',
      dedupeKey: 'transfer',
      sourceJson: '{}',
      voided: false,
    });
    return { outgoing, incoming };
  });
  await owner.mutation(internal.imports.suggestLinks, { importId });
  expect(await owner.query(api.finance.listLinkSuggestions, {})).toHaveLength(0);
  await owner.run((ctx) => ctx.db.patch('transactions', ids.incoming, { currency: 'NZD' }));
  await owner.mutation(internal.imports.suggestLinks, { importId });
  expect(await owner.query(api.finance.listLinkSuggestions, {})).toHaveLength(1);
  expect(await owner.run((ctx) => ctx.db.get('transactions', ids.outgoing))).toMatchObject({
    reportingKind: 'standard',
  });
});

test('unclassified merchant propagation recognizes Uncategorized and preserves manual decisions', async () => {
  const { owner, profile, accountId, importId } = await setup();
  const groups = await owner.query(api.finance.listCategories, {});
  const uncategorized = groups.find((group) => group.name === 'Uncategorized')?.categories[0];
  const classified = groups.find((group) => group.name === 'Housing')?.categories[0];
  if (!uncategorized || !classified) throw new Error('Missing categories');
  const ids = await owner.run(async (ctx) => {
    const merchant = await ctx.db.insert('counterparties', {
      ownerId: profile._id,
      name: 'Shop',
      normalizedName: 'shop',
      archived: false,
    });
    const base = {
      ownerId: profile._id,
      accountId,
      postedDate: '2026-10-01',
      amountMinor: -100n,
      currency: 'NZD',
      rawDescription: 'Shop',
      normalizedDescription: 'shop',
      excluded: false,
      voided: false,
      reportingKind: 'standard' as const,
      createdByImportId: importId,
      counterpartyId: merchant,
      categoryId: uncategorized._id,
    };
    const anchor = await ctx.db.insert('transactions', base);
    const unclassified = await ctx.db.insert('transactions', base);
    const manual = await ctx.db.insert('transactions', { ...base, categoryProvenance: 'manual' });
    return { anchor, unclassified, manual };
  });
  await owner.mutation(api.finance.updateTransaction, {
    transactionId: ids.anchor,
    categoryId: classified._id,
    scope: 'unclassified',
  });
  expect(await owner.run((ctx) => ctx.db.get('transactions', ids.unclassified))).toMatchObject({
    categoryId: classified._id,
    categoryProvenance: 'merchant',
  });
  expect(await owner.run((ctx) => ctx.db.get('transactions', ids.manual))).toMatchObject({
    categoryId: uncategorized._id,
    categoryProvenance: 'manual',
  });
});

test('rolling back a file preserves transactions backed by active Akahu evidence', async () => {
  vi.useFakeTimers();
  try {
    const { t, owner, profile, accountId, importId } = await setup();
    const importedTransactionId = await owner.run(async (ctx) => {
      const transactionId = await ctx.db.insert('transactions', {
        ownerId: profile._id,
        accountId,
        postedDate: '2026-10-01',
        amountMinor: -100n,
        currency: 'NZD',
        rawDescription: 'Shop',
        normalizedDescription: 'shop',
        excluded: false,
        voided: false,
        reportingKind: 'standard',
        createdByImportId: importId,
      });
      const importRowId = await ctx.db.insert('importRows', {
        ownerId: profile._id,
        importId,
        rowNumber: 0,
        status: 'committed',
        format: 'ofx',
        dedupeKey: 'provider-backed',
        postedDate: '2026-10-01',
        amountMinor: -100n,
        currency: 'NZD',
        rawDescription: 'Shop',
        normalizedDescription: 'shop',
        sourceJson: '{}',
        transactionId,
      });
      await ctx.db.insert('transactionSources', {
        ownerId: profile._id,
        importId,
        importRowId,
        transactionId,
        format: 'ofx',
        dedupeKey: 'provider-backed',
        sourceJson: '{}',
        voided: false,
      });
      const runId = await ctx.db.insert('akahuSyncRuns', {
        ownerId: profile._id,
        status: 'complete',
        startedAt: 1,
        completedAt: 2,
        rowsSeen: 1,
        rowsCreated: 0,
        possibleDuplicates: 0,
      });
      await ctx.db.insert('akahuEvidence', {
        ownerId: profile._id,
        accountId,
        providerTransactionId: 'akahu-transaction-1',
        transactionId,
        postedDate: '2026-10-01',
        amountMinor: -100n,
        currency: 'NZD',
        description: 'Shop',
        normalizedDescription: 'shop',
        sourceJson: '{}',
        state: 'active',
        lastSeenRunId: runId,
      });
      return transactionId;
    });
    await owner.mutation(api.imports.rollback, { importId });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await owner.run((ctx) => ctx.db.get('transactions', importedTransactionId))).toMatchObject({
      voided: false,
    });
    expect(await owner.run((ctx) => ctx.db.get('imports', importId))).toMatchObject({ status: 'rolledBack' });
  } finally {
    vi.useRealTimers();
  }
});
