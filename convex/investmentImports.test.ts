/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const fundExport = `\uFEFF"TransactionSourceType","Units","Price","EffectiveDate","TransactionDisplayName","TransactionTypeDescription","TransactionDescription","Value","Amount","type"
"IRD",316.0356,1.5952,"2026-07-20T00:00:00","Employee Contributions","APP","115133144|EXAMPLE EMPLOYER",504.14,504.14,"default"
`;

test('deduplicates investment transactions across repeated imports', async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ tokenIdentifier: 'test|owner', subject: 'owner', issuer: 'test' });
    await owner.mutation(api.profiles.ensureCurrent, {});

    const upload = async (fileName: string) => {
      const storageId = await owner.run(async (ctx) => await ctx.storage.store(new Blob([fundExport])));
      const importId = await owner.mutation(api.investmentImports.create, { storageId, fileName });
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
      return importId;
    };

    const firstImportId = await upload('transaction-export.csv');
    const firstPreview = await owner.query(api.investmentImports.preview, { importId: firstImportId });
    expect(firstPreview.importJob).toMatchObject({ readyRows: 1, duplicateRows: 0, status: 'ready' });
    await owner.mutation(api.investmentImports.commit, { importId: firstImportId });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await owner.query(api.investmentImports.listTransactions, {})).toHaveLength(1);

    const secondImportId = await upload('renamed-export.csv');
    const secondPreview = await owner.query(api.investmentImports.preview, { importId: secondImportId });
    expect(secondPreview.importJob).toMatchObject({ readyRows: 0, duplicateRows: 1, status: 'ready' });
    await owner.mutation(api.investmentImports.commit, { importId: secondImportId });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    const transactions = await owner.query(api.investmentImports.listTransactions, {});
    expect(transactions).toHaveLength(1);
    const sources = await owner.run(async (ctx) =>
      ctx.db
        .query('investmentTransactionSources')
        .withIndex('by_transactionId', (q) => q.eq('transactionId', transactions[0]._id))
        .take(10),
    );
    expect(sources.filter((source) => !source.voided)).toHaveLength(2);
  } finally {
    vi.useRealTimers();
  }
});
