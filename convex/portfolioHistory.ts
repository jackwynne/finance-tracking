import { ConvexError, v } from 'convex/values';

import { query } from './_generated/server';
import { requireProfile } from './lib/auth';
import { date, decimal, decimalText, multiply, SCALE } from './lib/portfolioMath';

export const recordedBalances = query({
  args: { asOf: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    date(args.asOf);
    const [accounts, positions] = await Promise.all([
      ctx.db
        .query('accounts')
        .withIndex('by_ownerId_and_archived', (q) => q.eq('ownerId', profile._id).eq('archived', false))
        .take(51),
      ctx.db
        .query('portfolioPositions')
        .withIndex('by_ownerId_and_key', (q) => q.eq('ownerId', profile._id))
        .take(51),
    ]);
    if (accounts.length > 50 || positions.length > 50)
      throw new ConvexError('Recorded history supports up to 50 accounts and 50 holdings.');
    const series = [];
    for (const account of accounts) {
      const snapshots = await ctx.db
        .query('balanceSnapshots')
        .withIndex('by_ownerId_and_accountId_and_date', (q) =>
          q.eq('ownerId', profile._id).eq('accountId', account._id).lte('date', args.asOf),
        )
        .order('desc')
        .take(121);
      const observations = new Map<string, { date: string; value: string; source: string }>();
      for (const row of snapshots.slice(0, 120)) {
        if (!row.voided && !observations.has(row.date))
          observations.set(row.date, {
            date: row.date,
            value: decimalText((row.ledgerMinor * SCALE) / 100n),
            source: row.source,
          });
      }
      series.push({
        id: account._id,
        name: account.name,
        currency: account.currency,
        kind: 'account',
        truncated: snapshots.length > 120,
        observations: [...observations.values()].reverse(),
      });
    }
    for (const position of positions) {
      const snapshots = await ctx.db
        .query('portfolioSnapshots')
        .withIndex('by_positionId_and_snapshotDate', (q) =>
          q.eq('positionId', position._id).lte('snapshotDate', args.asOf),
        )
        .order('desc')
        .take(121);
      const observations = new Map<string, { date: string; value: string; source: string }>();
      for (const row of snapshots.slice(0, 120)) {
        if (!observations.has(row.snapshotDate))
          observations.set(row.snapshotDate, {
            date: row.snapshotDate,
            value: decimalText(multiply(decimal(row.value), decimal(row.ownershipShare ?? '1'))),
            source: row.source,
          });
      }
      if (!snapshots.length && position.snapshotDate <= args.asOf)
        observations.set(position.snapshotDate, {
          date: position.snapshotDate,
          value: decimalText(multiply(decimal(position.value), decimal(position.ownershipShare ?? '1'))),
          source: position.source,
        });
      series.push({
        id: position._id,
        name: `${position.name} · ${position.account}`,
        currency: position.currency,
        kind: 'holding',
        truncated: snapshots.length > 120,
        observations: [...observations.values()].reverse(),
      });
    }
    return series;
  },
});
