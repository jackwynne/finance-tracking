import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { assertOwner, requireProfile } from './lib/auth';
import { daysBetween } from './lib/finance';
import { parsedImportRowValidator, parsedSummaryValidator } from './lib/validators';

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
    const lower = args.fileName.toLowerCase();
    const format = lower.endsWith('.ofx') ? 'ofx' : lower.endsWith('.xlsx') ? 'xlsx' : null;
    if (!format) throw new ConvexError('Only OFX and XLSX files are supported in this version.');
    const metadata = await ctx.db.system.get('_storage', args.storageId);
    if (!metadata) throw new ConvexError('The uploaded file could not be found.');
    if (metadata.size > 10 * 1024 * 1024) throw new ConvexError('Files must be 10 MB or smaller.');
    const importId = await ctx.db.insert('imports', {
      ownerId: profile._id,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: metadata.contentType,
      size: metadata.size,
      sha256: metadata.sha256,
      format,
      status: 'uploaded',
      totalRows: 0,
      readyRows: 0,
      pendingRows: 0,
      duplicateRows: 0,
      possibleDuplicateRows: 0,
      invalidRows: 0,
      committedRows: 0,
      startedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.importAction.parse, { importId });
    return importId;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    return await ctx.db
      .query('imports')
      .withIndex('by_ownerId_and_startedAt', (q) => q.eq('ownerId', profile._id))
      .order('desc')
      .take(100);
  },
});

export const preview = query({
  args: { importId: v.id('imports') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const importJob = assertOwner(await ctx.db.get('imports', args.importId), profile._id);
    const rows = await ctx.db
      .query('importRows')
      .withIndex('by_importId_and_rowNumber', (q) => q.eq('importId', importJob._id))
      .take(500);
    return { importJob, rows, account: importJob.accountId ? await ctx.db.get('accounts', importJob.accountId) : null };
  },
});

export const sourceDownloadUrl = query({
  args: { importId: v.id('imports') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const importJob = assertOwner(await ctx.db.get('imports', args.importId), profile._id);
    return await ctx.storage.getUrl(importJob.storageId);
  },
});

export const confirmAccount = mutation({
  args: {
    importId: v.id('imports'),
    accountId: v.optional(v.id('accounts')),
    createAccount: v.optional(
      v.object({
        name: v.string(),
        type: v.union(
          v.literal('checking'),
          v.literal('savings'),
          v.literal('creditCard'),
          v.literal('cash'),
          v.literal('loan'),
          v.literal('other'),
        ),
        institution: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const importJob = assertOwner(await ctx.db.get('imports', args.importId), profile._id);
    if (importJob.status !== 'ready')
      throw new ConvexError('Wait for parsing to finish before confirming the account.');
    let accountId = args.accountId;
    if (accountId) {
      assertOwner(await ctx.db.get('accounts', accountId), profile._id);
    } else if (args.createAccount) {
      accountId = await ctx.db.insert('accounts', {
        ownerId: profile._id,
        name: args.createAccount.name.trim(),
        type: args.createAccount.type,
        institution: args.createAccount.institution?.trim() || undefined,
        currency: importJob.currency ?? 'NZD',
        mask: importJob.detectedMask ?? 'Account',
        sourceKeyHash: importJob.detectedSourceKeyHash,
        archived: false,
      });
    } else {
      throw new ConvexError('Choose an account or provide details for a new one.');
    }
    await ctx.db.patch('imports', importJob._id, { accountId, status: 'parsing' });
    await ctx.scheduler.runAfter(0, internal.imports.evaluateBatch, { importId: importJob._id, cursor: 0 });
    return accountId;
  },
});

export const resolvePossibleDuplicate = mutation({
  args: { importRowId: v.id('importRows'), resolution: v.union(v.literal('keep'), v.literal('merge')) },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const row = assertOwner(await ctx.db.get('importRows', args.importRowId), profile._id);
    if (row.status !== 'possibleDuplicate' || !row.possibleDuplicateId)
      throw new ConvexError('This row is not awaiting a duplicate decision.');
    await ctx.db.patch('importRows', row._id, {
      status: args.resolution === 'keep' ? 'ready' : 'duplicate',
      transactionId: args.resolution === 'merge' ? row.possibleDuplicateId : undefined,
      possibleDuplicateId: undefined,
    });
    const importJob = assertOwner(await ctx.db.get('imports', row.importId), profile._id);
    await recountImport(ctx, importJob._id);
    return null;
  },
});

export const commit = mutation({
  args: { importId: v.id('imports') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const importJob = assertOwner(await ctx.db.get('imports', args.importId), profile._id);
    if (importJob.status !== 'ready' || !importJob.accountId)
      throw new ConvexError('Confirm the account and resolve possible duplicates before committing.');
    const unresolved = await ctx.db
      .query('importRows')
      .withIndex('by_importId_and_status', (q) => q.eq('importId', importJob._id).eq('status', 'possibleDuplicate'))
      .take(1);
    if (unresolved.length) throw new ConvexError('Resolve possible duplicates before committing.');
    await ctx.db.patch('imports', importJob._id, { status: 'committing', error: undefined });
    await ctx.scheduler.runAfter(0, internal.imports.commitBatch, { importId: importJob._id });
    return null;
  },
});

export const rollback = mutation({
  args: { importId: v.id('imports') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const importJob = assertOwner(await ctx.db.get('imports', args.importId), profile._id);
    if (importJob.status !== 'committed') throw new ConvexError('Only completed imports can be rolled back.');
    await ctx.db.patch('imports', importJob._id, { status: 'committing' });
    await ctx.scheduler.runAfter(0, internal.imports.rollbackBatch, { importId: importJob._id });
    return null;
  },
});

export const getForParsing = internalQuery({
  args: { importId: v.id('imports') },
  handler: async (ctx, args) => await ctx.db.get('imports', args.importId),
});

export const beginParsing = internalMutation({
  args: { importId: v.id('imports') },
  handler: async (ctx, args) => {
    const importJob = await ctx.db.get('imports', args.importId);
    if (!importJob || importJob.status === 'rolledBack') return null;
    await ctx.db.patch('imports', importJob._id, { status: 'parsing', error: undefined });
    return null;
  },
});

export const stageBatch = internalMutation({
  args: { importId: v.id('imports'), rows: v.array(parsedImportRowValidator) },
  handler: async (ctx, args) => {
    const importJob = await ctx.db.get('imports', args.importId);
    if (!importJob) return null;
    for (const row of args.rows) {
      const existing = await ctx.db
        .query('importRows')
        .withIndex('by_importId_and_rowNumber', (q) => q.eq('importId', importJob._id).eq('rowNumber', row.rowNumber))
        .unique();
      if (existing) continue;
      await ctx.db.insert('importRows', { ownerId: importJob.ownerId, importId: importJob._id, ...row });
    }
    return null;
  },
});

export const finishParsing = internalMutation({
  args: { importId: v.id('imports'), summary: parsedSummaryValidator },
  handler: async (ctx, args) => {
    const importJob = await ctx.db.get('imports', args.importId);
    if (!importJob) return null;
    await ctx.db.patch('imports', importJob._id, {
      ...args.summary,
      accountId: undefined,
      status: 'ready',
    });
    await recountImport(ctx, importJob._id);
    return null;
  },
});

export const failParsing = internalMutation({
  args: { importId: v.id('imports'), error: v.string() },
  handler: async (ctx, args) => {
    const importJob = await ctx.db.get('imports', args.importId);
    if (importJob)
      await ctx.db.patch('imports', importJob._id, {
        status: 'failed',
        error: args.error.slice(0, 1000),
        completedAt: Date.now(),
      });
    return null;
  },
});

export const evaluateBatch = internalMutation({
  args: { importId: v.id('imports'), cursor: v.number() },
  handler: async (ctx, args) => {
    const importJob = await ctx.db.get('imports', args.importId);
    if (!importJob?.accountId) return null;
    const rows = await ctx.db
      .query('importRows')
      .withIndex('by_importId_and_rowNumber', (q) => q.eq('importId', importJob._id).gte('rowNumber', args.cursor))
      .take(25);
    for (const row of rows) {
      if (row.status !== 'ready') continue;
      const exactSources = await ctx.db
        .query('transactionSources')
        .withIndex('by_ownerId_and_dedupeKey', (q) => q.eq('ownerId', importJob.ownerId).eq('dedupeKey', row.dedupeKey))
        .take(10);
      const exact = exactSources.find((source) => !source.voided);
      if (exact) {
        await ctx.db.patch('importRows', row._id, { status: 'duplicate', transactionId: exact.transactionId });
        continue;
      }
      const from = new Date(`${row.postedDate}T00:00:00Z`);
      from.setUTCDate(from.getUTCDate() - 3);
      const to = new Date(`${row.postedDate}T00:00:00Z`);
      to.setUTCDate(to.getUTCDate() + 3);
      const candidates = await ctx.db
        .query('transactions')
        .withIndex('by_ownerId_and_accountId_and_postedDate', (q) =>
          q
            .eq('ownerId', importJob.ownerId)
            .eq('accountId', importJob.accountId!)
            .gte('postedDate', from.toISOString().slice(0, 10))
            .lte('postedDate', to.toISOString().slice(0, 10)),
        )
        .take(50);
      const fuzzy = candidates.find(
        (candidate) =>
          !candidate.voided &&
          candidate.amountMinor === row.amountMinor &&
          candidate.normalizedDescription === row.normalizedDescription,
      );
      if (fuzzy)
        await ctx.db.patch('importRows', row._id, { status: 'possibleDuplicate', possibleDuplicateId: fuzzy._id });
    }
    const last = rows.at(-1);
    if (rows.length === 25 && last) {
      await ctx.scheduler.runAfter(0, internal.imports.evaluateBatch, {
        importId: importJob._id,
        cursor: last.rowNumber + 1,
      });
    } else {
      await recountImport(ctx, importJob._id);
      await ctx.db.patch('imports', importJob._id, { status: 'ready' });
    }
    return null;
  },
});

async function getOrCreateCounterparty(ctx: MutationCtx, ownerId: Id<'profiles'>, raw: string, normalized: string) {
  const alias = await ctx.db
    .query('counterpartyAliases')
    .withIndex('by_ownerId_and_normalizedAlias', (q) => q.eq('ownerId', ownerId).eq('normalizedAlias', normalized))
    .unique();
  if (alias) return assertOwner(await ctx.db.get('counterparties', alias.counterpartyId), ownerId);
  const existing = await ctx.db
    .query('counterparties')
    .withIndex('by_ownerId_and_normalizedName', (q) => q.eq('ownerId', ownerId).eq('normalizedName', normalized))
    .unique();
  if (existing) return existing;
  const counterpartyId = await ctx.db.insert('counterparties', {
    ownerId,
    name: raw.trim(),
    normalizedName: normalized,
    archived: false,
  });
  await ctx.db.insert('counterpartyAliases', {
    ownerId,
    counterpartyId,
    alias: raw.trim(),
    normalizedAlias: normalized,
  });
  return (await ctx.db.get('counterparties', counterpartyId))!;
}

export const commitBatch = internalMutation({
  args: { importId: v.id('imports') },
  handler: async (ctx, args) => {
    const importJob = await ctx.db.get('imports', args.importId);
    if (!importJob?.accountId || importJob.status !== 'committing') return null;
    const ready = await ctx.db
      .query('importRows')
      .withIndex('by_importId_and_status', (q) => q.eq('importId', importJob._id).eq('status', 'ready'))
      .take(20);
    const duplicates = ready.length
      ? []
      : await ctx.db
          .query('importRows')
          .withIndex('by_importId_and_status', (q) => q.eq('importId', importJob._id).eq('status', 'duplicate'))
          .take(20);
    const rows = ready.length ? ready : duplicates;
    for (const row of rows) {
      let transactionId = row.transactionId;
      if (!transactionId) {
        const counterparty = await getOrCreateCounterparty(
          ctx,
          importJob.ownerId,
          row.rawDescription,
          row.normalizedDescription,
        );
        transactionId = await ctx.db.insert('transactions', {
          ownerId: importJob.ownerId,
          accountId: importJob.accountId,
          postedDate: row.postedDate,
          processedDate: row.processedDate,
          amountMinor: row.amountMinor,
          currency: row.currency,
          rawDescription: row.rawDescription,
          normalizedDescription: row.normalizedDescription,
          transactionType: row.transactionType,
          counterpartyId: counterparty._id,
          categoryId: counterparty.defaultCategoryId,
          excluded: false,
          voided: false,
          reportingKind: 'standard',
          createdByImportId: importJob._id,
        });
      }
      await ctx.db.insert('transactionSources', {
        ownerId: importJob.ownerId,
        transactionId,
        importId: importJob._id,
        importRowId: row._id,
        format: row.format,
        sourceId: row.sourceId,
        dedupeKey: row.dedupeKey,
        sourceJson: row.sourceJson,
        voided: false,
      });
      await ctx.db.patch('importRows', row._id, { status: 'committed', transactionId });
    }
    if (rows.length) {
      await recountImport(ctx, importJob._id);
      await ctx.scheduler.runAfter(0, internal.imports.commitBatch, { importId: importJob._id });
      return null;
    }

    if (importJob.ledgerMinor !== undefined && importJob.balanceDate) {
      const account = await ctx.db.get('accounts', importJob.accountId);
      const ledgerMinor =
        account && (account.type === 'creditCard' || account.type === 'loan') && importJob.ledgerMinor > 0n
          ? -importJob.ledgerMinor
          : importJob.ledgerMinor;
      await ctx.db.insert('balanceSnapshots', {
        ownerId: importJob.ownerId,
        accountId: importJob.accountId,
        date: importJob.balanceDate,
        ledgerMinor,
        availableMinor: importJob.availableMinor,
        source: 'import',
        importId: importJob._id,
        voided: false,
      });
      await ctx.db.patch('accounts', importJob.accountId, {
        currentLedgerMinor: ledgerMinor,
        currentAvailableMinor: importJob.availableMinor,
        balanceAsOf: importJob.balanceDate,
      });
    }
    await ctx.db.patch('imports', importJob._id, { status: 'committed', completedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.imports.suggestLinks, { importId: importJob._id });
    return null;
  },
});

export const suggestLinks = internalMutation({
  args: { importId: v.id('imports') },
  handler: async (ctx, args) => {
    const importJob = await ctx.db.get('imports', args.importId);
    if (!importJob) return null;
    const sources = await ctx.db
      .query('transactionSources')
      .withIndex('by_importId', (q) => q.eq('importId', importJob._id))
      .take(5000);
    const imported = (
      await Promise.all(
        sources.filter((source) => !source.voided).map((source) => ctx.db.get('transactions', source.transactionId)),
      )
    ).filter(Boolean) as Array<Doc<'transactions'>>;
    const all = await ctx.db
      .query('transactions')
      .withIndex('by_ownerId_and_postedDate', (q) => q.eq('ownerId', importJob.ownerId))
      .take(5000);
    for (const current of imported) {
      if (current.reportingKind !== 'standard') continue;
      const candidates = all.filter(
        (candidate) =>
          candidate._id !== current._id &&
          !candidate.voided &&
          candidate.reportingKind === 'standard' &&
          candidate.amountMinor === -current.amountMinor &&
          daysBetween(candidate.postedDate, current.postedDate) <=
            (candidate.accountId === current.accountId ? 120 : 3),
      );
      const transferCandidates = candidates.filter((candidate) => candidate.accountId !== current.accountId);
      const refundCandidates = candidates.filter(
        (candidate) =>
          candidate.accountId === current.accountId &&
          current.amountMinor > 0n &&
          candidate.amountMinor < 0n &&
          candidate.normalizedDescription === current.normalizedDescription,
      );
      const matches =
        transferCandidates.length === 1 ? transferCandidates : refundCandidates.length === 1 ? refundCandidates : [];
      if (matches.length !== 1) continue;
      const match = matches[0];
      const type = match.accountId === current.accountId ? 'refund' : 'transfer';
      const from = match.amountMinor < 0n ? match : current;
      const to = match.amountMinor > 0n ? match : current;
      const prior = await ctx.db
        .query('transactionLinks')
        .withIndex('by_fromTransactionId', (q) => q.eq('fromTransactionId', from._id))
        .take(10);
      if (prior.some((link) => link.toTransactionId === to._id && link.type === type)) continue;
      await ctx.db.insert('transactionLinks', {
        ownerId: importJob.ownerId,
        type,
        fromTransactionId: from._id,
        toTransactionId: to._id,
        status: 'confirmed',
        confidence: 1,
        createdBy: 'system',
      });
      if (type === 'transfer') {
        await ctx.db.patch('transactions', from._id, { reportingKind: 'transfer' });
        await ctx.db.patch('transactions', to._id, { reportingKind: 'transfer' });
      } else {
        await ctx.db.patch('transactions', to._id, { reportingKind: 'refund', categoryId: from.categoryId });
      }
    }
    return null;
  },
});

export const rollbackBatch = internalMutation({
  args: { importId: v.id('imports') },
  handler: async (ctx, args) => {
    const importJob = await ctx.db.get('imports', args.importId);
    if (!importJob) return null;
    const sources = (
      await ctx.db
        .query('transactionSources')
        .withIndex('by_importId', (q) => q.eq('importId', importJob._id))
        .take(25)
    ).filter((source) => !source.voided);
    for (const source of sources) {
      await ctx.db.patch('transactionSources', source._id, { voided: true });
      await ctx.db.patch('importRows', source.importRowId, { status: 'rolledBack' });
      const otherSources = await ctx.db
        .query('transactionSources')
        .withIndex('by_transactionId', (q) => q.eq('transactionId', source.transactionId))
        .take(100);
      if (!otherSources.some((other) => other._id !== source._id && !other.voided))
        await ctx.db.patch('transactions', source.transactionId, { voided: true });
    }
    if (sources.length) {
      await ctx.scheduler.runAfter(0, internal.imports.rollbackBatch, { importId: importJob._id });
      return null;
    }
    const snapshots = await ctx.db
      .query('balanceSnapshots')
      .withIndex('by_importId', (q) => q.eq('importId', importJob._id))
      .take(100);
    for (const snapshot of snapshots) await ctx.db.patch('balanceSnapshots', snapshot._id, { voided: true });
    if (importJob.accountId) {
      const active = await ctx.db
        .query('balanceSnapshots')
        .withIndex('by_ownerId_and_accountId_and_date', (q) =>
          q.eq('ownerId', importJob.ownerId).eq('accountId', importJob.accountId!),
        )
        .order('desc')
        .take(100);
      const latest = active.find((snapshot) => !snapshot.voided);
      await ctx.db.patch('accounts', importJob.accountId, {
        currentLedgerMinor: latest?.ledgerMinor,
        currentAvailableMinor: latest?.availableMinor,
        balanceAsOf: latest?.date,
      });
    }
    await ctx.db.patch('imports', importJob._id, { status: 'rolledBack', rolledBackAt: Date.now() });
    return null;
  },
});

async function recountImport(ctx: MutationCtx, importId: Id<'imports'>) {
  const importJob = await ctx.db.get('imports', importId);
  if (!importJob) return;
  const rows: Array<Doc<'importRows'>> = await ctx.db
    .query('importRows')
    .withIndex('by_importId_and_rowNumber', (q) => q.eq('importId', importId))
    .take(4000);
  await ctx.db.patch('imports', importId, {
    totalRows: rows.length,
    readyRows: rows.filter((row) => row.status === 'ready').length,
    pendingRows: rows.filter((row) => row.status === 'pending').length,
    duplicateRows: rows.filter((row) => row.status === 'duplicate').length,
    possibleDuplicateRows: rows.filter((row) => row.status === 'possibleDuplicate').length,
    invalidRows: rows.filter((row) => row.status === 'invalid').length,
    committedRows: rows.filter((row) => row.status === 'committed').length,
  });
}
