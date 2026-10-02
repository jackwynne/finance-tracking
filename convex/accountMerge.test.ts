/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { expect, test } from 'vitest';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const merge = makeFunctionReference<'mutation', { sourceId: Id<'accounts'>; targetId: Id<'accounts'> }>(
  'accountMerge:merge',
);

test('merging the same bank identity preserves history, balances and import rollback references', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|merge', subject: 'merge', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const profile = await owner.query(api.profiles.current, {});
  if (!profile) throw new Error('Missing profile');
  const data = await t.run(async (ctx) => {
    const base = {
      ownerId: profile._id,
      name: 'Bank',
      type: 'checking' as const,
      currency: 'NZD',
      mask: '1234',
      sourceKeyHash: 'identity',
      archived: false,
    };
    const sourceId = await ctx.db.insert('accounts', { ...base, balanceAsOf: '2026-10-01', currentLedgerMinor: 200n });
    const targetId = await ctx.db.insert('accounts', { ...base, balanceAsOf: '2026-09-01', currentLedgerMinor: 100n });
    const transactionId = await ctx.db.insert('transactions', {
      ownerId: profile._id,
      accountId: sourceId,
      postedDate: '2026-10-01',
      amountMinor: 200n,
      currency: 'NZD',
      rawDescription: 'Deposit',
      normalizedDescription: 'deposit',
      excluded: false,
      voided: false,
      reportingKind: 'standard',
    });
    const balanceId = await ctx.db.insert('balanceSnapshots', {
      ownerId: profile._id,
      accountId: sourceId,
      date: '2026-10-01',
      ledgerMinor: 200n,
      source: 'manual',
      voided: false,
    });
    const storageId = await ctx.storage.store(new Blob(['ofx']));
    const importId = await ctx.db.insert('imports', {
      ownerId: profile._id,
      accountId: sourceId,
      storageId,
      fileName: 'history.ofx',
      size: 3,
      sha256: 'hash',
      format: 'ofx',
      status: 'committed',
      totalRows: 1,
      readyRows: 0,
      pendingRows: 0,
      duplicateRows: 0,
      possibleDuplicateRows: 0,
      invalidRows: 0,
      committedRows: 1,
      startedAt: 1,
    });
    return { sourceId, targetId, transactionId, balanceId, importId };
  });
  await owner.mutation(merge, { sourceId: data.sourceId, targetId: data.targetId });
  await owner.mutation(merge, { sourceId: data.sourceId, targetId: data.targetId });
  expect(await t.run((ctx) => ctx.db.get('transactions', data.transactionId))).toMatchObject({
    accountId: data.targetId,
    amountMinor: 200n,
  });
  expect(await t.run((ctx) => ctx.db.get('balanceSnapshots', data.balanceId))).toMatchObject({
    accountId: data.targetId,
  });
  expect(await t.run((ctx) => ctx.db.get('imports', data.importId))).toMatchObject({ accountId: data.targetId });
  expect(await owner.query(api.finance.listAccounts, {})).toMatchObject([
    { _id: data.targetId, currentLedgerMinor: 200n },
  ]);
  expect(await t.run((ctx) => ctx.db.get('accounts', data.sourceId))).toMatchObject({
    archived: true,
    mergedInto: data.targetId,
  });
  const other = t.withIdentity({ tokenIdentifier: 'test|other', subject: 'other', issuer: 'test' });
  await other.mutation(api.profiles.ensureCurrent, {});
  await expect(other.mutation(merge, { sourceId: data.sourceId, targetId: data.targetId })).rejects.toThrow(
    'Record not found',
  );
  await t.run((ctx) =>
    ctx.db.patch('accounts', data.sourceId, { archived: false, mergedInto: undefined, sourceKeyHash: 'different' }),
  );
  await expect(owner.mutation(merge, { sourceId: data.sourceId, targetId: data.targetId })).rejects.toThrow(
    'same bank identity',
  );
});
