import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { assertOwner, requireProfile } from './lib/auth';
import { parsedInvestmentRowValidator, parsedInvestmentSummaryValidator } from './lib/investmentValidators';

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: { storageId: v.id('_storage'), fileName: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    if (!args.fileName.toLowerCase().endsWith('.csv')) throw new ConvexError('Investment imports must be CSV files.');
    const metadata = await ctx.db.system.get('_storage', args.storageId);
    if (!metadata) throw new ConvexError('The uploaded file could not be found.');
    if (metadata.size > 10 * 1024 * 1024) throw new ConvexError('Files must be 10 MB or smaller.');
    const importId = await ctx.db.insert('investmentImports', {
      ownerId: profile._id,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: metadata.contentType,
      size: metadata.size,
      sha256: metadata.sha256,
      status: 'uploaded',
      totalRows: 0,
      readyRows: 0,
      duplicateRows: 0,
      invalidRows: 0,
      committedRows: 0,
      startedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.investmentImportAction.parse, { importId });
    return importId;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    return await ctx.db
      .query('investmentImports')
      .withIndex('by_ownerId_and_startedAt', (q) => q.eq('ownerId', profile._id))
      .order('desc')
      .take(100);
  },
});

export const preview = query({
  args: { importId: v.id('investmentImports') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const importJob = assertOwner(await ctx.db.get('investmentImports', args.importId), profile._id);
    const rows = await ctx.db
      .query('investmentImportRows')
      .withIndex('by_importId_and_rowNumber', (q) => q.eq('importId', importJob._id))
      .take(500);
    const account = importJob.accountId ? await ctx.db.get('investmentAccounts', importJob.accountId) : null;
    return { importJob, rows, account };
  },
});

export const sourceDownloadUrl = query({
  args: { importId: v.id('investmentImports') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const importJob = assertOwner(await ctx.db.get('investmentImports', args.importId), profile._id);
    return await ctx.storage.getUrl(importJob.storageId);
  },
});

export const listTransactions = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const transactions = await ctx.db
      .query('investmentTransactions')
      .withIndex('by_ownerId_and_effectiveDate', (q) => q.eq('ownerId', profile._id))
      .order('desc')
      .take(500);
    return await Promise.all(
      transactions
        .filter((transaction) => !transaction.voided)
        .map(async (transaction) => ({
          ...transaction,
          account: await ctx.db.get('investmentAccounts', transaction.accountId),
        })),
    );
  },
});

export const commit = mutation({
  args: { importId: v.id('investmentImports') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const importJob = assertOwner(await ctx.db.get('investmentImports', args.importId), profile._id);
    if (importJob.status !== 'ready' || !importJob.accountId)
      throw new ConvexError('Wait for parsing and duplicate checks to finish before committing.');
    await ctx.db.patch('investmentImports', importJob._id, { status: 'committing', error: undefined });
    await ctx.scheduler.runAfter(0, internal.investmentImports.commitBatch, { importId: importJob._id });
    return null;
  },
});

export const rollback = mutation({
  args: { importId: v.id('investmentImports') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const importJob = assertOwner(await ctx.db.get('investmentImports', args.importId), profile._id);
    if (importJob.status !== 'committed') throw new ConvexError('Only completed imports can be rolled back.');
    await ctx.db.patch('investmentImports', importJob._id, { status: 'committing' });
    await ctx.scheduler.runAfter(0, internal.investmentImports.rollbackBatch, { importId: importJob._id });
    return null;
  },
});

export const getForParsing = internalQuery({
  args: { importId: v.id('investmentImports') },
  handler: async (ctx, args) => await ctx.db.get('investmentImports', args.importId),
});

export const beginParsing = internalMutation({
  args: { importId: v.id('investmentImports') },
  handler: async (ctx, args) => {
    const importJob = await ctx.db.get('investmentImports', args.importId);
    if (!importJob || importJob.status === 'rolledBack') return null;
    await ctx.db.patch('investmentImports', importJob._id, { status: 'parsing', error: undefined });
    return null;
  },
});

export const stageBatch = internalMutation({
  args: { importId: v.id('investmentImports'), rows: v.array(parsedInvestmentRowValidator) },
  handler: async (ctx, args) => {
    const importJob = await ctx.db.get('investmentImports', args.importId);
    if (!importJob) return null;
    for (const row of args.rows) {
      const existing = await ctx.db
        .query('investmentImportRows')
        .withIndex('by_importId_and_rowNumber', (q) => q.eq('importId', importJob._id).eq('rowNumber', row.rowNumber))
        .unique();
      if (existing) continue;
      await ctx.db.insert('investmentImportRows', {
        ownerId: importJob.ownerId,
        importId: importJob._id,
        ...row,
      });
    }
    return null;
  },
});

export const finishParsing = internalMutation({
  args: { importId: v.id('investmentImports'), summary: parsedInvestmentSummaryValidator },
  handler: async (ctx, args) => {
    const importJob = await ctx.db.get('investmentImports', args.importId);
    if (!importJob) return null;
    const existingAccount = await ctx.db
      .query('investmentAccounts')
      .withIndex('by_ownerId_and_sourceKeyHash', (q) =>
        q.eq('ownerId', importJob.ownerId).eq('sourceKeyHash', args.summary.sourceKeyHash),
      )
      .unique();
    const accountId =
      existingAccount?._id ??
      (await ctx.db.insert('investmentAccounts', {
        ownerId: importJob.ownerId,
        name: args.summary.detectedAccountName,
        provider: args.summary.provider,
        currency: args.summary.currency,
        sourceKeyHash: args.summary.sourceKeyHash,
        archived: false,
      }));
    await ctx.db.patch('investmentImports', importJob._id, {
      ...args.summary,
      accountId,
      status: 'parsing',
    });
    await ctx.scheduler.runAfter(0, internal.investmentImports.evaluateBatch, {
      importId: importJob._id,
      cursor: 0,
    });
    return null;
  },
});

export const failParsing = internalMutation({
  args: { importId: v.id('investmentImports'), error: v.string() },
  handler: async (ctx, args) => {
    const importJob = await ctx.db.get('investmentImports', args.importId);
    if (importJob)
      await ctx.db.patch('investmentImports', importJob._id, {
        status: 'failed',
        error: args.error.slice(0, 1000),
        completedAt: Date.now(),
      });
    return null;
  },
});

export const evaluateBatch = internalMutation({
  args: { importId: v.id('investmentImports'), cursor: v.number() },
  handler: async (ctx, args) => {
    const importJob = await ctx.db.get('investmentImports', args.importId);
    if (!importJob?.accountId) return null;
    const rows = await ctx.db
      .query('investmentImportRows')
      .withIndex('by_importId_and_rowNumber', (q) => q.eq('importId', importJob._id).gte('rowNumber', args.cursor))
      .take(40);
    for (const row of rows) {
      if (row.status !== 'ready') continue;
      const sources = await ctx.db
        .query('investmentTransactionSources')
        .withIndex('by_ownerId_and_dedupeKey', (q) => q.eq('ownerId', importJob.ownerId).eq('dedupeKey', row.dedupeKey))
        .take(10);
      const exact = sources.find((source) => !source.voided);
      if (exact)
        await ctx.db.patch('investmentImportRows', row._id, {
          status: 'duplicate',
          transactionId: exact.transactionId,
        });
    }
    const last = rows.at(-1);
    if (rows.length === 40 && last) {
      await ctx.scheduler.runAfter(0, internal.investmentImports.evaluateBatch, {
        importId: importJob._id,
        cursor: last.rowNumber + 1,
      });
    } else {
      await recountImport(ctx, importJob._id);
      await ctx.db.patch('investmentImports', importJob._id, { status: 'ready' });
    }
    return null;
  },
});

export const commitBatch = internalMutation({
  args: { importId: v.id('investmentImports') },
  handler: async (ctx, args) => {
    const importJob = await ctx.db.get('investmentImports', args.importId);
    if (!importJob?.accountId || importJob.status !== 'committing') return null;
    const ready = await ctx.db
      .query('investmentImportRows')
      .withIndex('by_importId_and_status', (q) => q.eq('importId', importJob._id).eq('status', 'ready'))
      .take(25);
    const duplicates = ready.length
      ? []
      : await ctx.db
          .query('investmentImportRows')
          .withIndex('by_importId_and_status', (q) => q.eq('importId', importJob._id).eq('status', 'duplicate'))
          .take(25);
    const rows = ready.length ? ready : duplicates;
    for (const row of rows) {
      let transactionId = row.transactionId;
      if (!transactionId) {
        transactionId = await ctx.db.insert('investmentTransactions', {
          ownerId: importJob.ownerId,
          accountId: importJob.accountId,
          effectiveDate: row.effectiveDate,
          instrumentCode: row.instrumentCode,
          transactionType: row.transactionType,
          description: row.description,
          units: row.units,
          unitPrice: row.unitPrice,
          amountMinor: row.amountMinor,
          currency: row.currency,
          runningBalanceUnits: row.runningBalanceUnits,
          createdByImportId: importJob._id,
          voided: false,
        });
      }
      await ctx.db.insert('investmentTransactionSources', {
        ownerId: importJob.ownerId,
        transactionId,
        importId: importJob._id,
        importRowId: row._id,
        format: row.format,
        dedupeKey: row.dedupeKey,
        sourceJson: row.sourceJson,
        voided: false,
      });
      await ctx.db.patch('investmentImportRows', row._id, { status: 'committed', transactionId });
    }
    if (rows.length) {
      await recountImport(ctx, importJob._id);
      await ctx.scheduler.runAfter(0, internal.investmentImports.commitBatch, { importId: importJob._id });
      return null;
    }
    await ctx.db.patch('investmentImports', importJob._id, { status: 'committed', completedAt: Date.now() });
    return null;
  },
});

export const rollbackBatch = internalMutation({
  args: { importId: v.id('investmentImports') },
  handler: async (ctx, args) => {
    const importJob = await ctx.db.get('investmentImports', args.importId);
    if (!importJob) return null;
    const sources = (
      await ctx.db
        .query('investmentTransactionSources')
        .withIndex('by_importId', (q) => q.eq('importId', importJob._id))
        .take(25)
    ).filter((source) => !source.voided);
    for (const source of sources) {
      await ctx.db.patch('investmentTransactionSources', source._id, { voided: true });
      await ctx.db.patch('investmentImportRows', source.importRowId, { status: 'rolledBack' });
      const otherSources = await ctx.db
        .query('investmentTransactionSources')
        .withIndex('by_transactionId', (q) => q.eq('transactionId', source.transactionId))
        .take(100);
      if (!otherSources.some((other) => other._id !== source._id && !other.voided))
        await ctx.db.patch('investmentTransactions', source.transactionId, { voided: true });
    }
    if (sources.length) {
      await ctx.scheduler.runAfter(0, internal.investmentImports.rollbackBatch, { importId: importJob._id });
      return null;
    }
    await ctx.db.patch('investmentImports', importJob._id, {
      status: 'rolledBack',
      rolledBackAt: Date.now(),
    });
    return null;
  },
});

async function recountImport(ctx: MutationCtx, importId: Id<'investmentImports'>) {
  const importJob = await ctx.db.get('investmentImports', importId);
  if (!importJob) return;
  const rows: Array<Doc<'investmentImportRows'>> = await ctx.db
    .query('investmentImportRows')
    .withIndex('by_importId_and_rowNumber', (q) => q.eq('importId', importId))
    .take(4000);
  await ctx.db.patch('investmentImports', importId, {
    totalRows: rows.length,
    readyRows: rows.filter((row) => row.status === 'ready').length,
    duplicateRows: rows.filter((row) => row.status === 'duplicate').length,
    invalidRows: rows.filter((row) => row.status === 'invalid').length,
    committedRows: rows.filter((row) => row.status === 'committed').length,
  });
}
