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

export const recordedUnitActivity = query({
  args: { asOf: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    date(args.asOf);
    const accounts = await ctx.db
      .query('investmentAccounts')
      .withIndex('by_ownerId_and_archived', (q) => q.eq('ownerId', profile._id).eq('archived', false))
      .take(51);
    if (accounts.length > 50) throw new ConvexError('Unit history supports up to 50 investment accounts.');
    const series = [];
    for (const account of accounts) {
      const transactions = await ctx.db
        .query('investmentTransactions')
        .withIndex('by_ownerId_and_accountId_and_effectiveDate', (q) =>
          q.eq('ownerId', profile._id).eq('accountId', account._id).lte('effectiveDate', args.asOf),
        )
        .order('asc')
        .take(2001);
      if (transactions.length > 2000)
        throw new ConvexError(
          'Unit history exceeds 2000 transactions for an account. Export the full ledger before reporting.',
        );
      const instruments = new Map<string, Map<string, { units: bigint; types: Set<string>; count: number }>>();
      for (const transaction of transactions) {
        if (transaction.voided) continue;
        const instrument = transaction.instrumentCode ?? '';
        const days =
          instruments.get(instrument) ?? new Map<string, { units: bigint; types: Set<string>; count: number }>();
        const day = days.get(transaction.effectiveDate) ?? { units: 0n, types: new Set<string>(), count: 0 };
        day.units += decimal(transaction.units);
        day.types.add(transaction.transactionType);
        day.count += 1;
        days.set(transaction.effectiveDate, day);
        instruments.set(instrument, days);
      }
      for (const [instrument, days] of instruments) {
        let cumulative = 0n;
        const observations = [...days].map(([effectiveDate, day]) => {
          cumulative += day.units;
          return {
            date: effectiveDate,
            delta: decimalText(day.units),
            netUnits: decimalText(cumulative),
            types: [...day.types],
            count: day.count,
          };
        });
        series.push({
          id: `${account._id}:${instrument}`,
          account: account.name,
          provider: account.provider,
          instrument: instrument || null,
          observations,
        });
      }
    }
    return series;
  },
});
