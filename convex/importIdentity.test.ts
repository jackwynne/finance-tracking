/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('statement account identity reuses one owned account and requires explicit selection for duplicates', async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ tokenIdentifier: 'test|account-owner', subject: 'account-owner', issuer: 'test' });
    await owner.mutation(api.profiles.ensureCurrent, {});
    const profile = await owner.query(api.profiles.current, {});
    if (!profile) throw new Error('Missing profile');
    const makeImport = async (currency = 'NZD', hash = 'bank-identity') =>
      owner.run(async (ctx) => {
        const storageId = await ctx.storage.store(new Blob(['statement']));
        return ctx.db.insert('imports', {
          ownerId: profile._id,
          storageId,
          fileName: 'statement.ofx',
          size: 9,
          sha256: 'statement',
          format: 'ofx',
          status: 'ready',
          totalRows: 0,
          readyRows: 0,
          pendingRows: 0,
          duplicateRows: 0,
          possibleDuplicateRows: 0,
          invalidRows: 0,
          committedRows: 0,
          startedAt: 1,
          currency,
          detectedSourceKeyHash: hash,
        });
      });
    const createAccount = { name: 'ANZ', type: 'checking' as const };
    const firstId = await owner.mutation(api.imports.confirmAccount, { importId: await makeImport(), createAccount });
    const secondId = await owner.mutation(api.imports.confirmAccount, { importId: await makeImport(), createAccount });
    expect(secondId).toBe(firstId);
    expect(await owner.query(api.finance.listAccounts, {})).toHaveLength(1);
    const wrongCurrencyImport = await makeImport('AUD');
    await expect(
      owner.mutation(api.imports.confirmAccount, { importId: wrongCurrencyImport, accountId: firstId }),
    ).rejects.toThrow('currency');
    expect(await owner.run((ctx) => ctx.db.get('imports', wrongCurrencyImport))).toMatchObject({ status: 'ready' });
    await expect(
      owner.mutation(api.imports.confirmAccount, {
        importId: await makeImport('NZD', 'another-bank'),
        accountId: firstId,
      }),
    ).rejects.toThrow('different bank account');
    const account = await owner.run((ctx) => ctx.db.get('accounts', firstId));
    if (!account) throw new Error('Missing account');
    await owner.run(async (ctx) => {
      const { _id, _creationTime, ...fields } = account;
      await ctx.db.insert('accounts', fields);
    });
    await expect(
      owner.mutation(api.imports.confirmAccount, { importId: await makeImport(), createAccount }),
    ).rejects.toThrow('Select the existing account explicitly');
    expect(await owner.query(api.finance.listAccounts, {})).toHaveLength(2);
    const other = t.withIdentity({ tokenIdentifier: 'test|account-other', subject: 'account-other', issuer: 'test' });
    await other.mutation(api.profiles.ensureCurrent, {});
    const otherProfile = await other.query(api.profiles.current, {});
    if (!otherProfile) throw new Error('Missing other profile');
    const templateImportId = await makeImport();
    const otherImport = await owner.run(async (ctx) => {
      const original = await ctx.db.get('imports', templateImportId);
      if (!original) throw new Error('Missing import');
      const { _id, _creationTime, ...fields } = original;
      return ctx.db.insert('imports', { ...fields, ownerId: otherProfile._id });
    });
    const otherAccount = await other.mutation(api.imports.confirmAccount, { importId: otherImport, createAccount });
    expect(otherAccount).not.toBe(firstId);
    await expect(
      other.mutation(api.imports.confirmAccount, { importId: otherImport, accountId: firstId }),
    ).rejects.toThrow();
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  } finally {
    vi.useRealTimers();
  }
});
