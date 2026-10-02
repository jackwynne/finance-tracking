import { ConvexError, v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { query, mutation } from './_generated/server';
import { requireProfile, assertOwner } from './lib/auth';
import { decimal, decimalText, date, multiply, rateFor, SCALE, uncovered } from './lib/portfolioMath';
import {
  validatePosition,
  validateAllocation,
  validateRate,
  validatePrice,
  validatePurchase,
} from './lib/portfolioValidation';
import { portfolioTables } from './portfolioTables';

export const savePosition = mutation({
  args: portfolioTables.portfolioPositions.validator.omit('ownerId').fields,
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    validatePosition(args);
    const existing = await ctx.db
      .query('portfolioPositions')
      .withIndex('by_ownerId_and_key', (q) => q.eq('ownerId', profile._id).eq('key', args.key))
      .unique();
    const id = existing ? existing._id : await ctx.db.insert('portfolioPositions', { ...args, ownerId: profile._id });
    if (existing) {
      if (existing.currency !== args.currency || existing.instrument !== args.instrument)
        throw new ConvexError('Keep currency and instrument stable for an existing position.');
      await ctx.db.patch(id, {
        name: args.name,
        account: args.account,
        retirement: args.retirement,
        debt: args.debt,
        ownershipShare: args.ownershipShare,
      });
    }
    await ctx.db.insert('portfolioSnapshots', {
      ownerId: profile._id,
      positionId: id,
      ownershipShare: args.ownershipShare,
      snapshotDate: args.snapshotDate,
      basis: args.basis,
      sameDayCovered: args.sameDayCovered,
      units: args.units,
      value: args.value,
      source: args.source,
      evidence: args.evidence,
    });
    return id;
  },
});
export const savePrice = mutation({
  args: portfolioTables.portfolioPrices.validator.omit('ownerId').fields,
  handler: async (ctx, args) => {
    const p = await requireProfile(ctx);
    validatePrice(args);
    return ctx.db.insert('portfolioPrices', { ...args, ownerId: p._id });
  },
});
export const saveRate = mutation({
  args: portfolioTables.portfolioFxRates.validator.omit('ownerId').fields,
  handler: async (ctx, args) => {
    const p = await requireProfile(ctx);
    validateRate(args);
    const existing = await ctx.db
      .query('portfolioFxRates')
      .withIndex('by_ownerId_and_from_and_to_and_date', (q) =>
        q.eq('ownerId', p._id).eq('from', args.from).eq('to', args.to).eq('date', args.date),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return ctx.db.insert('portfolioFxRates', { ...args, ownerId: p._id });
  },
});
export const saveAllocation = mutation({
  args: portfolioTables.portfolioAllocations.validator.omit('ownerId').fields,
  handler: async (ctx, args) => {
    const p = await requireProfile(ctx);
    validateAllocation(args);
    return ctx.db.insert('portfolioAllocations', { ...args, ownerId: p._id });
  },
});
export const proposePurchase = mutation({
  args: {
    positionId: v.id('portfolioPositions'),
    sourceEvent: v.string(),
    reference: v.optional(v.string()),
    date: v.string(),
    units: v.string(),
    source: v.string(),
    evidence: v.string(),
  },
  handler: async (ctx, args) => {
    const p = await requireProfile(ctx);
    const position = assertOwner(await ctx.db.get(args.positionId), p._id);
    validatePurchase(args);
    const occurrence = await ctx.db
      .query('portfolioActivities')
      .withIndex('by_ownerId_and_sourceEvent', (q) => q.eq('ownerId', p._id).eq('sourceEvent', args.sourceEvent))
      .unique();
    if (occurrence) {
      if (
        occurrence.positionId !== args.positionId ||
        occurrence.date !== args.date ||
        decimal(occurrence.units) !== decimal(args.units)
      )
        throw new ConvexError(
          'Source occurrence already has different recorded contents. Use a correction rather than retrying changed evidence.',
        );
      return occurrence._id;
    }
    const existing = await ctx.db
      .query('portfolioActivities')
      .withIndex('by_positionId', (q) => q.eq('positionId', position._id))
      .take(1001);
    if (existing.length > 1000)
      throw new ConvexError('Position activity history exceeds the 1000-record matching limit.');

    const sameReference =
      args.reference && existing.find((row) => row.reference === args.reference && row.status === 'accepted');
    const status =
      sameReference && sameReference.date === args.date && decimal(sameReference.units) === decimal(args.units)
        ? 'linked'
        : 'ambiguous';
    return ctx.db.insert('portfolioActivities', { ...args, ownerId: p._id, status });
  },
});
export const resolvePurchase = mutation({
  args: {
    id: v.id('portfolioActivities'),
    status: v.union(v.literal('accepted'), v.literal('linked'), v.literal('rejected')),
  },
  handler: async (ctx, args) => {
    const p = await requireProfile(ctx);
    assertOwner(await ctx.db.get(args.id), p._id);
    await ctx.db.patch(args.id, { status: args.status });
  },
});
export const getExposure = query({
  args: { asOf: v.string(), currency: v.union(v.literal('NZD'), v.literal('AUD')) },
  handler: async (ctx, args) => {
    const p = await requireProfile(ctx);
    date(args.asOf);
    const positions = await ctx.db
      .query('portfolioPositions')
      .withIndex('by_ownerId_and_key', (q) => q.eq('ownerId', p._id))
      .take(1001);
    const rates = await ctx.db
      .query('portfolioFxRates')
      .withIndex('by_ownerId_and_from_and_to_and_date', (q) => q.eq('ownerId', p._id))
      .take(1001);
    const allocations = await ctx.db
      .query('portfolioAllocations')
      .withIndex('by_ownerId_and_instrument_and_date', (q) => q.eq('ownerId', p._id))
      .take(1001);
    const prices = await ctx.db
      .query('portfolioPrices')
      .withIndex('by_ownerId_and_instrument_and_date', (q) => q.eq('ownerId', p._id))
      .take(1001);
    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_ownerId_and_archived', (q) => q.eq('ownerId', p._id).eq('archived', false))
      .take(1001);
    const accountGroups = new Map<string, Array<Doc<'accounts'>>>();
    for (const account of accounts) {
      if (!account.sourceKeyHash) continue;
      const key = `${account.sourceKeyHash}:${account.currency}:${(account.institution ?? '').trim().toLowerCase()}`;
      const grouped = accountGroups.get(key) ?? [];
      grouped.push(account);
      accountGroups.set(key, grouped);
    }
    const duplicateAccountGroups = [...accountGroups.values()]
      .filter((group) => group.length > 1)
      .map((group) => ({
        sourceIdentity: group[0].sourceKeyHash ?? '',
        currency: group[0].currency,
        institution: group[0].institution ?? '',
        accounts: group.map((account) => ({ id: account._id, name: account.name, mask: account.mask })),
      }));
    const duplicateAccountIds = new Set(
      duplicateAccountGroups.flatMap((group) => group.accounts.map((account) => account.id)),
    );
    const rows: Array<{
      id: string;
      name: string;
      accountIdentity: string;
      instrument: string;
      currency: string;
      debt: boolean;
      retirement: boolean;
      source: string;
      date: string;
      units: string;
      nativeValue: string | null;
      value: string | null;
      fxDate: string | null;
      activities: Array<Doc<'portfolioActivities'>>;
      country?: string;
      sourceIdentity?: string;
      potentialDuplicate?: boolean;
    }> = [];
    if ([positions, rates, allocations, prices, accounts].some((records) => records.length > 1000))
      throw new ConvexError(
        'Portfolio report exceeds the 1000-record query limit. Archive or export older evidence before reporting.',
      );
    for (const position of positions) {
      const activities = await ctx.db
        .query('portfolioActivities')
        .withIndex('by_positionId', (q) => q.eq('positionId', position._id))
        .take(1001);
      const snapshots = await ctx.db
        .query('portfolioSnapshots')
        .withIndex('by_positionId_and_snapshotDate', (q) =>
          q.eq('positionId', position._id).lte('snapshotDate', args.asOf),
        )
        .order('desc')
        .take(1001);
      if (activities.length > 1000 || snapshots.length > 1000)
        throw new ConvexError('Position history exceeds the 1000-record report limit.');
      const snapshot = snapshots.at(0) ?? (position.snapshotDate <= args.asOf ? position : null);
      const eligible = snapshot !== null;
      const units = snapshot ? uncovered(snapshot, activities, args.asOf) : 0n;
      const price = prices
        .filter(
          (row) =>
            row.instrument === position.instrument &&
            row.currency === position.currency &&
            row.date <= args.asOf &&
            row.date >= (snapshot?.snapshotDate ?? args.asOf),
        )
        .sort((a, b) => b.date.localeCompare(a.date) || b._creationTime - a._creationTime)
        .at(0);
      const changed = snapshot ? units !== decimal(snapshot.units) : false;
      const basisUnresolved =
        snapshot?.basis === 'settlement' &&
        activities.some((a) => a.status === 'accepted' && a.date > snapshot.snapshotDate && a.date <= args.asOf);
      const recordedNative =
        eligible && !basisUnresolved && units >= 0n
          ? price
            ? multiply(units, decimal(price.price))
            : changed
              ? null
              : decimal(snapshot.value)
          : null;
      const native =
        recordedNative === null ? null : multiply(recordedNative, decimal(snapshot?.ownershipShare ?? '1'));
      const rate =
        position.currency === args.currency
          ? { rate: '1', date: args.asOf }
          : rateFor(
              rates.filter((row) => row.from === position.currency && row.to === args.currency),
              args.asOf,
            );
      rows.push({
        id: position._id,
        name: position.name,
        accountIdentity: `${position.account} · ${position.key} · ${position._id.slice(-6)}`,
        instrument: position.instrument,
        currency: position.currency,
        debt: position.debt,
        retirement: position.retirement,
        source: price?.source ?? snapshot?.source ?? position.source,
        date: price?.date ?? snapshot?.snapshotDate ?? position.snapshotDate,
        units: decimalText(units),
        nativeValue: native === null ? null : decimalText(native),
        value: native !== null && rate ? decimalText(multiply(native, decimal(rate.rate))) : null,
        fxDate: position.currency === args.currency ? null : (rate?.date ?? null),
        activities,
      });
    }
    for (const account of accounts) {
      const snapshots = await ctx.db
        .query('balanceSnapshots')
        .withIndex('by_ownerId_and_accountId_and_date', (q) =>
          q.eq('ownerId', p._id).eq('accountId', account._id).lte('date', args.asOf),
        )
        .order('desc')
        .take(1001);
      if (snapshots.length > 1000) throw new ConvexError('Bank balance history exceeds the 1000-record report limit.');
      const balance = snapshots.find((row) => !row.voided);
      const native = balance ? (balance.ledgerMinor * SCALE) / 100n : null;
      const rate =
        account.currency === args.currency
          ? { rate: '1', date: args.asOf }
          : rateFor(
              rates.filter((row) => row.from === account.currency && row.to === args.currency),
              args.asOf,
            );
      const debt = account.type === 'loan' || (native !== null && native < 0n);
      rows.push({
        id: account._id,
        name: account.name,
        accountIdentity: `${account.institution ?? 'Account'} · ${account.mask} · ${account._id.slice(-6)}`,
        instrument: `bank:${account._id}`,
        sourceIdentity: account.sourceKeyHash,
        potentialDuplicate: duplicateAccountIds.has(account._id),
        currency: account.currency,
        debt,
        retirement: false,
        source: balance?.source ?? 'No dated balance',
        date: balance?.date ?? '',
        units: '',
        nativeValue: native === null ? null : decimalText(native < 0n ? -native : native),
        value:
          native !== null && rate ? decimalText(multiply(native < 0n ? -native : native, decimal(rate.rate))) : null,
        fxDate: account.currency === args.currency ? null : (rate?.date ?? null),
        activities: [],
        country: /commonwealth|commbank/i.test(account.institution ?? account.name)
          ? 'Australia'
          : /anz/i.test(account.institution ?? account.name) && account.currency === 'NZD'
            ? 'New Zealand'
            : undefined,
      });
    }
    let gross = 0n,
      debt = 0n;
    for (const row of rows) {
      if (row.value !== null) {
        if (row.debt) debt += decimal(row.value);
        else gross += decimal(row.value);
      }
    }
    const breakdowns = ['country', 'industry', 'assetClass'].map((kind) => {
      let covered = 0n;
      const buckets = new Map<string, bigint>();
      for (const row of rows) {
        if (row.debt || row.value === null) continue;
        const value = decimal(row.value);
        const allocation = allocations
          .filter(
            (a) =>
              a.instrument === row.instrument && a.dimension === kind && a.date <= args.asOf && a.kind !== 'target',
          )
          .sort((a, b) => b.date.localeCompare(a.date) || b._creationTime - a._creationTime)
          .at(0);
        const weights =
          allocation?.weights ??
          (row.instrument.startsWith('bank:') && kind === 'assetClass'
            ? [{ label: 'Cash', weight: '1' }]
            : row.country && kind === 'country'
              ? [{ label: row.country, weight: '1' }]
              : []);
        if (allocation?.complete || (weights.length > 0 && !allocation)) covered += value;
        for (const weight of weights)
          buckets.set(weight.label, (buckets.get(weight.label) ?? 0n) + multiply(value, decimal(weight.weight)));
      }
      return {
        dimension: kind,
        covered: decimalText(covered),
        unresolved: decimalText(gross - covered),
        coveredPercent: gross > 0n ? decimalText((covered * 100n * SCALE) / gross) : '0',
        allocations: [...buckets].map(([label, value]) => ({
          label,
          value: decimalText(value),
          percent: gross > 0n ? decimalText((value * 100n * SCALE) / gross) : '0',
        })),
      };
    });
    return {
      rows,
      breakdowns,
      gross: decimalText(gross),
      debt: decimalText(debt),
      net: decimalText(gross - debt),
      unknown: rows.filter((row) => row.value === null).length,
      duplicateAccountGroups,
      potentialDuplicateAccounts: duplicateAccountIds.size,
      totalsIncomplete: duplicateAccountIds.size > 0 || rows.some((row) => row.value === null),
      positions,
      rates,
      targets: allocations.filter((row) => row.kind === 'target' && row.date <= args.asOf),
    };
  },
});
