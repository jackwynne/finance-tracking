import { ConvexError, v } from 'convex/values';

import { mutation } from './_generated/server';
import { assertOwner, requireProfile } from './lib/auth';

export const merge = mutation({
  args: { sourceId: v.id('accounts'), targetId: v.id('accounts') },
  handler: async (ctx, { sourceId, targetId }) => {
    const profile = await requireProfile(ctx);
    const source = assertOwner(await ctx.db.get('accounts', sourceId), profile._id);
    const target = assertOwner(await ctx.db.get('accounts', targetId), profile._id);
    if (source.mergedInto === targetId) return null;
    if (sourceId === targetId || source.archived || target.archived)
      throw new ConvexError('Choose two different active accounts.');
    if (
      !source.sourceKeyHash ||
      source.sourceKeyHash !== target.sourceKeyHash ||
      source.currency !== target.currency ||
      source.type !== target.type
    )
      throw new ConvexError('Accounts must have the same bank identity, currency and type.');
    if (source.providerAccountId || target.providerAccountId)
      throw new ConvexError('Disconnect and unmap bank connections before merging accounts.');
    const mappings = await ctx.db
      .query('akahuAccounts')
      .withIndex('by_ownerId_and_providerAccountId', (q) => q.eq('ownerId', profile._id))
      .take(101);
    if (mappings.length > 100 || mappings.some((row) => row.accountId === sourceId || row.accountId === targetId))
      throw new ConvexError('Unmap bank connections before merging accounts.');
    const evidence = await ctx.db
      .query('akahuEvidence')
      .withIndex('by_accountId_and_postedDate', (q) => q.eq('accountId', sourceId))
      .take(1);
    if (evidence.length) throw new ConvexError('An account with bank-feed evidence needs a separate reconciliation.');
    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_ownerId_and_accountId_and_postedDate', (q) =>
        q.eq('ownerId', profile._id).eq('accountId', sourceId),
      )
      .take(1001);
    const balances = await ctx.db
      .query('balanceSnapshots')
      .withIndex('by_ownerId_and_accountId_and_date', (q) => q.eq('ownerId', profile._id).eq('accountId', sourceId))
      .take(501);
    const imports = await ctx.db
      .query('imports')
      .withIndex('by_accountId', (q) => q.eq('accountId', sourceId))
      .take(101);
    const targetImports = await ctx.db
      .query('imports')
      .withIndex('by_accountId', (q) => q.eq('accountId', targetId))
      .take(101);
    if (transactions.length > 1000 || balances.length > 500 || imports.length > 100 || targetImports.length > 100)
      throw new ConvexError('This account is too large for an atomic merge.');
    if ([...imports, ...targetImports].some((row) => !['committed', 'rolledBack', 'failed'].includes(row.status)))
      throw new ConvexError('Finish account imports before merging.');
    if (
      source.balanceAsOf &&
      source.balanceAsOf === target.balanceAsOf &&
      source.currentLedgerMinor !== target.currentLedgerMinor
    )
      throw new ConvexError('Same-date balances disagree. Reconcile the balances before merging.');
    for (const row of transactions) await ctx.db.patch('transactions', row._id, { accountId: targetId });
    for (const row of balances) await ctx.db.patch('balanceSnapshots', row._id, { accountId: targetId });
    for (const row of imports) {
      assertOwner(row, profile._id);
      await ctx.db.patch('imports', row._id, { accountId: targetId });
    }
    if (source.balanceAsOf && (!target.balanceAsOf || source.balanceAsOf > target.balanceAsOf))
      await ctx.db.patch('accounts', targetId, {
        balanceAsOf: source.balanceAsOf,
        currentLedgerMinor: source.currentLedgerMinor,
        currentAvailableMinor: source.currentAvailableMinor,
      });
    await ctx.db.patch('accounts', sourceId, { archived: true, mergedInto: targetId });
    return null;
  },
});
