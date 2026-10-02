/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('importing older statements preserves the latest account balance and stores historical evidence', async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ tokenIdentifier: 'test|balance', subject: 'balance', issuer: 'test' });
    await owner.mutation(api.profiles.ensureCurrent, {});
    const profile = await owner.query(api.profiles.current, {});
    if (!profile) throw new Error('Missing profile');
    const accountId = await t.run((ctx) =>
      ctx.db.insert('accounts', {
        ownerId: profile._id,
        name: 'Card',
        mask: '1369',
        type: 'creditCard',
        currency: 'NZD',
        archived: false,
        currentLedgerMinor: -87438n,
        currentAvailableMinor: 912562n,
        balanceAsOf: '2026-09-23',
      }),
    );
    for (const [date, ledger] of [
      ['2026-06-23', 379449n],
      ['2026-10-01', 12000n],
    ] as const) {
      const importId = await t.run(async (ctx) =>
        ctx.db.insert('imports', {
          ownerId: profile._id,
          accountId,
          storageId: await ctx.storage.store(new Blob(['statement'])),
          fileName: 'statement.ofx',
          size: 9,
          sha256: date,
          format: 'ofx',
          status: 'committing',
          totalRows: 0,
          readyRows: 0,
          pendingRows: 0,
          duplicateRows: 0,
          possibleDuplicateRows: 0,
          invalidRows: 0,
          committedRows: 0,
          startedAt: 1,
          balanceDate: date,
          ledgerMinor: ledger,
          availableMinor: 500n,
        }),
      );
      await t.mutation(internal.imports.commitBatch, { importId });
      expect(await t.run((ctx) => ctx.db.get('accounts', accountId))).toMatchObject(
        date === '2026-06-23'
          ? { currentLedgerMinor: -87438n, currentAvailableMinor: 912562n, balanceAsOf: '2026-09-23' }
          : { currentLedgerMinor: -12000n, currentAvailableMinor: 500n, balanceAsOf: '2026-10-01' },
      );
      expect(
        await t.run((ctx) =>
          ctx.db
            .query('balanceSnapshots')
            .withIndex('by_importId', (q) => q.eq('importId', importId))
            .unique(),
        ),
      ).toMatchObject({ date, ledgerMinor: -ledger, voided: false });
    }
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  } finally {
    vi.useRealTimers();
  }
});
