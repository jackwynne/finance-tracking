import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';

import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { assertOwner, requireProfile } from './lib/auth';
import { normalizeText } from './lib/finance';

function configuredOwner() {
  return process.env.AKAHU_OWNER_TOKEN_IDENTIFIER;
}
export const status = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const configured = Boolean(
      process.env.AKAHU_APP_TOKEN && process.env.AKAHU_USER_TOKEN && configuredOwner() === profile.tokenIdentifier,
    );
    const connection = await ctx.db
      .query('akahuConnections')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', profile._id))
      .unique();
    const pending = await ctx.db
      .query('akahuEvidence')
      .withIndex('by_ownerId_and_state', (q) => q.eq('ownerId', profile._id).eq('state', 'possibleDuplicate'))
      .collect();
    const corrections = await ctx.db
      .query('akahuEvidence')
      .withIndex('by_ownerId_and_state', (q) => q.eq('ownerId', profile._id).eq('state', 'pendingCorrection'))
      .collect();
    const missing = await ctx.db
      .query('akahuEvidence')
      .withIndex('by_ownerId_and_state', (q) => q.eq('ownerId', profile._id).eq('state', 'missing'))
      .collect();
    return {
      configured,
      reason: configured ? null : 'Set the personal Akahu server secrets and bind them to your existing Koru profile.',
      connection,
      pendingDuplicates: pending.length + corrections.length + missing.length,
    };
  },
});
export const connect = mutation({
  args: { personalAppConfirmed: v.boolean(), officialAnzConfirmed: v.boolean() },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    if (!args.personalAppConfirmed || !args.officialAnzConfirmed)
      throw new ConvexError('Confirm personal app eligibility and official ANZ read-only connectivity first.');
    if (configuredOwner() !== profile.tokenIdentifier || !process.env.AKAHU_APP_TOKEN || !process.env.AKAHU_USER_TOKEN)
      throw new ConvexError('Akahu server configuration is unavailable for this profile.');
    const existing = await ctx.db
      .query('akahuConnections')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', profile._id))
      .unique();
    if (existing)
      await ctx.db.patch('akahuConnections', existing._id, {
        status: 'connected',
        eligibilityConfirmedAt: Date.now(),
        error: undefined,
      });
    else
      await ctx.db.insert('akahuConnections', {
        ownerId: profile._id,
        status: 'connected',
        eligibilityConfirmedAt: Date.now(),
      });
    return null;
  },
});
export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const existing = await ctx.db
      .query('akahuConnections')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', profile._id))
      .unique();
    if (existing) await ctx.db.patch('akahuConnections', existing._id, { status: 'disconnected' });
    return null;
  },
});
export const providerAccounts = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    return await ctx.db
      .query('akahuAccounts')
      .withIndex('by_ownerId_and_providerAccountId', (q) => q.eq('ownerId', profile._id))
      .collect();
  },
});
export const bindAccount = mutation({
  args: { providerAccountId: v.string(), accountId: v.id('accounts') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const account = assertOwner(await ctx.db.get('accounts', args.accountId), profile._id);
    const provider = await ctx.db
      .query('akahuAccounts')
      .withIndex('by_ownerId_and_providerAccountId', (q) =>
        q.eq('ownerId', profile._id).eq('providerAccountId', args.providerAccountId),
      )
      .unique();
    if (!provider || provider.currency !== account.currency || account.archived)
      throw new ConvexError('Choose an active account in the same currency.');
    const others = await ctx.db
      .query('akahuAccounts')
      .withIndex('by_ownerId_and_providerAccountId', (q) => q.eq('ownerId', profile._id))
      .collect();
    if (others.some((other) => other._id !== provider._id && other.accountId === account._id))
      throw new ConvexError('This Koru account is already mapped to another bank account.');
    await ctx.db.patch('akahuAccounts', provider._id, { accountId: account._id });
    await ctx.db.patch('accounts', account._id, { providerAccountId: provider.providerAccountId });
    return null;
  },
});
export const pendingDuplicates = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const rows = await ctx.db
      .query('akahuEvidence')
      .withIndex('by_ownerId_and_state', (q) => q.eq('ownerId', profile._id).eq('state', 'possibleDuplicate'))
      .collect();
    const corrections = await ctx.db
      .query('akahuEvidence')
      .withIndex('by_ownerId_and_state', (q) => q.eq('ownerId', profile._id).eq('state', 'pendingCorrection'))
      .collect();
    rows.push(...corrections);
    const missing = await ctx.db
      .query('akahuEvidence')
      .withIndex('by_ownerId_and_state', (q) => q.eq('ownerId', profile._id).eq('state', 'missing'))
      .collect();
    rows.push(...missing);
    return await Promise.all(
      rows.map(async (row) => ({
        ...row,
        existingTransaction: row.transactionId ? await ctx.db.get('transactions', row.transactionId) : null,
        candidates: (
          await ctx.db
            .query('transactions')
            .withIndex('by_ownerId_and_accountId_and_postedDate', (q) =>
              q.eq('ownerId', profile._id).eq('accountId', row.accountId).eq('postedDate', row.postedDate),
            )
            .collect()
        ).filter(
          (tx) =>
            !tx.voided &&
            tx.amountMinor === row.amountMinor &&
            tx.currency === row.currency &&
            tx.normalizedDescription === row.normalizedDescription,
        ),
      })),
    );
  },
});
export const resolveDuplicate = mutation({
  args: { evidenceId: v.id('akahuEvidence'), existingTransactionId: v.optional(v.id('transactions')) },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const row = assertOwner(await ctx.db.get('akahuEvidence', args.evidenceId), profile._id);
    if (row.state !== 'possibleDuplicate') throw new ConvexError('This bank record is already resolved.');
    let transactionId = args.existingTransactionId;
    if (transactionId) {
      const tx = assertOwner(await ctx.db.get('transactions', transactionId), profile._id);
      if (
        tx.voided ||
        tx.accountId !== row.accountId ||
        tx.postedDate !== row.postedDate ||
        tx.amountMinor !== row.amountMinor ||
        tx.currency !== row.currency
      )
        throw new ConvexError('The selected transaction does not match this bank record.');
      const evidence = await ctx.db
        .query('akahuEvidence')
        .withIndex('by_transactionId', (q) => q.eq('transactionId', tx._id))
        .collect();
      if (evidence.some((source) => source.state === 'active' && source._id !== row._id))
        throw new ConvexError('This transaction already has a different active Akahu record.');
    } else {
      transactionId = await ctx.db.insert('transactions', {
        ownerId: profile._id,
        accountId: row.accountId,
        postedDate: row.postedDate,
        amountMinor: row.amountMinor,
        currency: row.currency,
        rawDescription: row.description,
        normalizedDescription: row.normalizedDescription,
        excluded: false,
        voided: false,
        reportingKind: 'standard',
        origin: 'akahu',
        providerTransactionId: row.providerTransactionId,
        categoryProvenance: 'import',
      });
    }
    await ctx.db.patch('akahuEvidence', row._id, { transactionId, state: 'active' });
    return transactionId;
  },
});
export const resolveCorrection = mutation({
  args: { evidenceId: v.id('akahuEvidence') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const row = assertOwner(await ctx.db.get('akahuEvidence', args.evidenceId), profile._id);
    if (row.state !== 'pendingCorrection' || !row.transactionId)
      throw new ConvexError('This bank correction is already resolved.');
    const tx = assertOwner(await ctx.db.get('transactions', row.transactionId), profile._id);
    const split = await ctx.db
      .query('transactionSplits')
      .withIndex('by_transactionId', (q) => q.eq('transactionId', tx._id))
      .unique();
    const links = [
      ...(await ctx.db
        .query('transactionLinks')
        .withIndex('by_fromTransactionId', (q) => q.eq('fromTransactionId', tx._id))
        .collect()),
      ...(await ctx.db
        .query('transactionLinks')
        .withIndex('by_toTransactionId', (q) => q.eq('toTransactionId', tx._id))
        .collect()),
    ];
    if (split?.parts.length || links.some((link) => link.status === 'confirmed'))
      throw new ConvexError(
        'Review and remove the existing split or confirmed transfer/refund link before accepting this financial correction.',
      );
    if (tx.currency !== row.currency)
      throw new ConvexError('The bank changed currency. Review the account mapping before accepting this correction.');
    await ctx.db.patch('transactions', tx._id, {
      postedDate: row.postedDate,
      amountMinor: row.amountMinor,
      rawDescription: row.description,
      normalizedDescription: row.normalizedDescription,
    });
    await ctx.db.patch('akahuEvidence', row._id, { state: 'active' });
    return tx._id;
  },
});
export const beginSync = internalMutation({
  args: { tokenIdentifier: v.string(), requestBankRefresh: v.boolean() },
  handler: async (ctx, args) => {
    if (args.tokenIdentifier !== configuredOwner()) throw new ConvexError('Akahu is not configured for this profile.');
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', args.tokenIdentifier))
      .unique();
    if (!profile) throw new ConvexError('Initialize your Koru profile first.');
    const connection = await ctx.db
      .query('akahuConnections')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', profile._id))
      .unique();
    if (!connection || connection.status !== 'connected') throw new ConvexError('Enable the Akahu connection first.');
    if (connection.activeRunId && connection.lastAttemptAt && Date.now() - connection.lastAttemptAt < 15 * 60_000)
      throw new ConvexError('A bank sync is already running.');
    if (
      args.requestBankRefresh &&
      connection.lastBankRefreshAt &&
      Date.now() - connection.lastBankRefreshAt < 3_600_000
    )
      throw new ConvexError('Wait one hour between bank refresh requests.');
    const runId = await ctx.db.insert('akahuSyncRuns', {
      ownerId: profile._id,
      status: 'running',
      startedAt: Date.now(),
      rowsSeen: 0,
      rowsCreated: 0,
      possibleDuplicates: 0,
    });
    await ctx.db.patch('akahuConnections', connection._id, {
      activeRunId: runId,
      lastAttemptAt: Date.now(),
      error: undefined,
    });
    if (args.requestBankRefresh)
      await ctx.db.patch('akahuConnections', connection._id, { lastBankRefreshAt: Date.now() });
    return runId;
  },
});
export const discoverAccount = internalMutation({
  args: {
    runId: v.id('akahuSyncRuns'),
    providerAccountId: v.string(),
    name: v.string(),
    mask: v.string(),
    currency: v.string(),
    status: v.string(),
    refreshedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get('akahuSyncRuns', args.runId);
    if (!run || run.status !== 'running') throw new ConvexError('Sync is no longer active.');
    const existing = await ctx.db
      .query('akahuAccounts')
      .withIndex('by_ownerId_and_providerAccountId', (q) =>
        q.eq('ownerId', run.ownerId).eq('providerAccountId', args.providerAccountId),
      )
      .unique();
    const { runId: _runId, ...fields } = args;
    if (existing) {
      await ctx.db.patch('akahuAccounts', existing._id, fields);
      return existing.accountId ?? null;
    }
    await ctx.db.insert('akahuAccounts', { ownerId: run.ownerId, ...fields });
    return null;
  },
});
const bankRow = v.object({
  providerTransactionId: v.string(),
  postedDate: v.string(),
  amountMinor: v.int64(),
  currency: v.string(),
  description: v.string(),
  normalizedDescription: v.string(),
  sourceJson: v.string(),
});
export const ingestPage = internalMutation({
  args: { runId: v.id('akahuSyncRuns'), accountId: v.id('accounts'), rows: v.array(bankRow) },
  handler: async (ctx, args) => {
    const run = await ctx.db.get('akahuSyncRuns', args.runId);
    if (!run || run.status !== 'running') throw new ConvexError('Sync is no longer active.');
    const connection = await ctx.db
      .query('akahuConnections')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', run.ownerId))
      .unique();
    if (connection?.status !== 'connected' || connection.activeRunId !== run._id)
      throw new ConvexError('Sync was disconnected or replaced.');
    const account = assertOwner(await ctx.db.get('accounts', args.accountId), run.ownerId);
    let created = 0;
    let possible = 0;
    for (const row of args.rows) {
      if (row.currency !== account.currency) throw new ConvexError('Bank record currency does not match its account.');
      const existing = await ctx.db
        .query('akahuEvidence')
        .withIndex('by_ownerId_and_providerTransactionId', (q) =>
          q.eq('ownerId', run.ownerId).eq('providerTransactionId', row.providerTransactionId),
        )
        .unique();
      if (existing) {
        if (existing.accountId !== account._id) throw new ConvexError('Bank record moved to an unexpected account.');
        await ctx.db.patch('akahuEvidence', existing._id, {
          ...row,
          lastSeenRunId: run._id,
          state: existing.transactionId ? 'active' : 'possibleDuplicate',
        });
        if (existing.transactionId) {
          const tx = assertOwner(await ctx.db.get('transactions', existing.transactionId), run.ownerId);
          if (tx.amountMinor !== row.amountMinor || tx.postedDate !== row.postedDate || tx.currency !== row.currency) {
            await ctx.db.patch('akahuEvidence', existing._id, { state: 'pendingCorrection' });
            possible += 1;
            continue;
          }
          // Text-only corrections preserve the owner's classification and linked amounts.
          await ctx.db.patch('transactions', tx._id, {
            postedDate: row.postedDate,
            amountMinor: row.amountMinor,
            rawDescription: row.description,
            normalizedDescription: normalizeText(row.description),
          });
        }
        continue;
      }
      const candidates = (
        await ctx.db
          .query('transactions')
          .withIndex('by_ownerId_and_accountId_and_postedDate', (q) =>
            q.eq('ownerId', run.ownerId).eq('accountId', account._id).eq('postedDate', row.postedDate),
          )
          .collect()
      ).filter(
        (tx) =>
          !tx.voided &&
          tx.amountMinor === row.amountMinor &&
          tx.currency === row.currency &&
          tx.normalizedDescription === row.normalizedDescription,
      );
      let transactionId;
      if (candidates.length) possible += 1;
      else {
        transactionId = await ctx.db.insert('transactions', {
          ownerId: run.ownerId,
          accountId: account._id,
          postedDate: row.postedDate,
          amountMinor: row.amountMinor,
          currency: row.currency,
          rawDescription: row.description,
          normalizedDescription: row.normalizedDescription,
          excluded: false,
          voided: false,
          reportingKind: 'standard',
          origin: 'akahu',
          providerTransactionId: row.providerTransactionId,
          categoryProvenance: 'import',
        });
        created += 1;
      }
      await ctx.db.insert('akahuEvidence', {
        ownerId: run.ownerId,
        accountId: account._id,
        ...row,
        transactionId,
        state: transactionId ? 'active' : 'possibleDuplicate',
        lastSeenRunId: run._id,
      });
    }
    await ctx.db.patch('akahuSyncRuns', run._id, {
      rowsSeen: run.rowsSeen + args.rows.length,
      rowsCreated: run.rowsCreated + created,
      possibleDuplicates: run.possibleDuplicates + possible,
    });
    return null;
  },
});
export const markMissing = internalMutation({
  args: {
    runId: v.id('akahuSyncRuns'),
    accountId: v.id('accounts'),
    from: v.string(),
    to: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get('akahuSyncRuns', args.runId);
    if (!run || run.status !== 'running') throw new ConvexError('Sync is no longer active.');
    const connection = await ctx.db
      .query('akahuConnections')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', run.ownerId))
      .unique();
    if (connection?.status !== 'connected' || connection.activeRunId !== run._id)
      throw new ConvexError('Sync was disconnected or replaced.');
    assertOwner(await ctx.db.get('accounts', args.accountId), run.ownerId);
    const page = await ctx.db
      .query('akahuEvidence')
      .withIndex('by_accountId_and_postedDate', (q) =>
        q.eq('accountId', args.accountId).gte('postedDate', args.from).lte('postedDate', args.to),
      )
      .paginate(args.paginationOpts);
    for (const row of page.page)
      if (row.lastSeenRunId !== run._id && row.state !== 'missing' && row.state !== 'removed')
        await ctx.db.patch('akahuEvidence', row._id, { state: 'missing' });
    return { isDone: page.isDone, continueCursor: page.continueCursor };
  },
});
export const resolveMissing = mutation({
  args: { evidenceId: v.id('akahuEvidence') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const row = assertOwner(await ctx.db.get('akahuEvidence', args.evidenceId), profile._id);
    if (row.state !== 'missing' || !row.transactionId)
      throw new ConvexError('There is no linked transaction to remove.');
    const tx = assertOwner(await ctx.db.get('transactions', row.transactionId), profile._id);
    const fileSources = await ctx.db
      .query('transactionSources')
      .withIndex('by_transactionId', (q) => q.eq('transactionId', tx._id))
      .collect();
    const bankSources = await ctx.db
      .query('akahuEvidence')
      .withIndex('by_transactionId', (q) => q.eq('transactionId', tx._id))
      .collect();
    if (fileSources.some((source) => !source.voided) || bankSources.some((source) => source.state === 'active'))
      throw new ConvexError(
        'This transaction still has another active source. Keep it and link any replacement bank evidence.',
      );
    const split = await ctx.db
      .query('transactionSplits')
      .withIndex('by_transactionId', (q) => q.eq('transactionId', tx._id))
      .unique();
    const links = [
      ...(await ctx.db
        .query('transactionLinks')
        .withIndex('by_fromTransactionId', (q) => q.eq('fromTransactionId', tx._id))
        .collect()),
      ...(await ctx.db
        .query('transactionLinks')
        .withIndex('by_toTransactionId', (q) => q.eq('toTransactionId', tx._id))
        .collect()),
    ];
    if (split?.parts.length || links.some((link) => link.status === 'confirmed'))
      throw new ConvexError('Review and remove the existing split or confirmed link before removing this transaction.');
    await ctx.db.patch('transactions', tx._id, { voided: true });
    await ctx.db.patch('akahuEvidence', row._id, { state: 'removed' });
    return tx._id;
  },
});
export const saveBalance = internalMutation({
  args: {
    runId: v.id('akahuSyncRuns'),
    accountId: v.id('accounts'),
    ledgerMinor: v.int64(),
    availableMinor: v.optional(v.int64()),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get('akahuSyncRuns', args.runId);
    if (!run || run.status !== 'running') throw new ConvexError('Sync is no longer active.');
    const connection = await ctx.db
      .query('akahuConnections')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', run.ownerId))
      .unique();
    if (connection?.status !== 'connected' || connection.activeRunId !== run._id)
      throw new ConvexError('Sync was disconnected or replaced.');
    const account = assertOwner(await ctx.db.get('accounts', args.accountId), run.ownerId);
    if (!account.balanceAsOf || args.date >= account.balanceAsOf)
      await ctx.db.patch('accounts', account._id, {
        currentLedgerMinor: args.ledgerMinor,
        currentAvailableMinor: args.availableMinor,
        balanceAsOf: args.date,
      });
    const snapshots = await ctx.db
      .query('balanceSnapshots')
      .withIndex('by_ownerId_and_accountId_and_date', (q) =>
        q.eq('ownerId', run.ownerId).eq('accountId', account._id).eq('date', args.date),
      )
      .collect();
    const existing = snapshots.find((snapshot) => snapshot.source === 'akahu' && !snapshot.voided);
    if (existing)
      await ctx.db.patch('balanceSnapshots', existing._id, {
        ledgerMinor: args.ledgerMinor,
        availableMinor: args.availableMinor,
      });
    else
      await ctx.db.insert('balanceSnapshots', {
        ownerId: run.ownerId,
        accountId: account._id,
        date: args.date,
        ledgerMinor: args.ledgerMinor,
        availableMinor: args.availableMinor,
        source: 'akahu',
        voided: false,
      });
    return null;
  },
});
export const finishSync = internalMutation({
  args: { runId: v.id('akahuSyncRuns'), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const run = await ctx.db.get('akahuSyncRuns', args.runId);
    if (!run) return null;
    const connection = await ctx.db
      .query('akahuConnections')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', run.ownerId))
      .unique();
    await ctx.db.patch('akahuSyncRuns', run._id, {
      status: args.error ? 'failed' : 'complete',
      completedAt: Date.now(),
      error: args.error,
    });
    if (connection?.activeRunId === run._id) {
      await ctx.db.patch('akahuConnections', connection._id, {
        activeRunId: undefined,
        error: args.error,
      });
      if (!args.error) await ctx.db.patch('akahuConnections', connection._id, { lastSuccessfulSyncAt: Date.now() });
    }
    return null;
  },
});
export const configuredConnection = internalQuery({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = configuredOwner();
    if (!tokenIdentifier) return null;
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', tokenIdentifier))
      .unique();
    if (!profile) return null;
    const connection = await ctx.db
      .query('akahuConnections')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', profile._id))
      .unique();
    return connection?.status === 'connected' ? tokenIdentifier : null;
  },
});
