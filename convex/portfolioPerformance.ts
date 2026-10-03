import type { Infer } from 'convex/values';
import { ConvexError, v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { assertOwner, requireProfile } from './lib/auth';
import { date, decimal, decimalText, multiply } from './lib/portfolioMath';
import { contributionHistory, convertContributionHistory } from './lib/portfolioPerformanceMath';

export const options = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const [accounts, positions] = await Promise.all([
      ctx.db
        .query('investmentAccounts')
        .withIndex('by_ownerId_and_archived', (q) => q.eq('ownerId', profile._id).eq('archived', false))
        .take(51),
      ctx.db
        .query('portfolioPositions')
        .withIndex('by_ownerId_and_key', (q) => q.eq('ownerId', profile._id))
        .take(51),
    ]);
    if (accounts.length > 50 || positions.length > 50)
      throw new ConvexError('Performance supports up to 50 accounts and holdings.');
    return {
      accounts: accounts.map((a) => ({
        id: a._id,
        name: a.name,
        currency: a.currency,
        performancePositionId: a.performancePositionId,
        performanceZeroOpening: a.performanceZeroOpening,
      })),
      positions: positions
        .filter((p) => !p.debt)
        .map((p) => ({ id: p._id, name: p.name, account: p.account, currency: p.currency })),
    };
  },
});

const historyArgs = v.object({
  accountId: v.id('investmentAccounts'),
  instrumentCode: v.optional(v.string()),
  positionId: v.optional(v.id('portfolioPositions')),
  reportingCurrency: v.optional(v.string()),
  zeroOpening: v.optional(v.boolean()),
  priceSourceConfirmed: v.optional(v.boolean()),
  asOf: v.string(),
});

async function accountHistory(
  ctx: QueryCtx,
  args: Infer<typeof historyArgs>,
  transactions?: Array<Doc<'investmentTransactions'>>,
) {
  const profile = await requireProfile(ctx);
  date(args.asOf);
  const account = assertOwner(await ctx.db.get('investmentAccounts', args.accountId), profile._id);
  const rows =
    transactions ??
    (await ctx.db
      .query('investmentTransactions')
      .withIndex('by_ownerId_and_accountId_and_effectiveDate', (q) =>
        q.eq('ownerId', profile._id).eq('accountId', account._id).lte('effectiveDate', args.asOf),
      )
      .take(2001));
  if (rows.length > 2000) throw new ConvexError('Performance history exceeds 2000 transactions.');
  const active = rows.filter(
    (r) => !r.voided && (args.instrumentCode === undefined || (r.instrumentCode ?? '') === args.instrumentCode),
  );
  const codes = new Set(active.map((r) => r.instrumentCode ?? ''));
  if (codes.size > 1)
    return {
      currency: account.currency,
      observations: [],
      issues: ['This account contains multiple funds. Purchase amounts and separate fund histories are required.'],
      opening: '0',
      personal: '0',
      other: '0',
      withdrawals: '0',
      complete: false,
      totalsAvailable: false,
      units: '0',
    };
  const zeroOpening = args.zeroOpening ?? account.performanceZeroOpening ?? false;
  const configuredPosition = account.performancePositionId
    ? await ctx.db.get('portfolioPositions', account.performancePositionId)
    : null;
  const positionId =
    args.positionId ??
    (args.instrumentCode === undefined || args.instrumentCode === configuredPosition?.instrument
      ? account.performancePositionId
      : undefined);
  const result = contributionHistory(active, zeroOpening);
  if (positionId) {
    const position = assertOwner(await ctx.db.get('portfolioPositions', positionId), profile._id);
    if (position.debt || decimal(position.ownershipShare ?? '1') !== decimal('1'))
      throw new ConvexError('Performance requires a fully owned investment holding.');
    if (position.currency !== account.currency)
      throw new ConvexError('Select a holding in the same currency as this investment account.');
    if (args.positionId && !args.priceSourceConfirmed)
      throw new ConvexError('Confirm the selected holding represents this investment account before using its prices.');
    const code = active.at(0)?.instrumentCode;
    if (code && code !== position.instrument)
      throw new ConvexError('Selected holding does not match the imported instrument.');
    if (result.complete) {
      const prices = await ctx.db
        .query('portfolioPrices')
        .withIndex('by_ownerId_and_instrument_and_date', (q) =>
          q.eq('ownerId', profile._id).eq('instrument', position.instrument).lte('date', args.asOf),
        )
        .order('desc')
        .take(2001);
      const first = result.observations.at(0);
      if (first)
        for (const price of prices.reverse())
          if (price.date >= first.date && price.currency === account.currency) {
            const atDate = contributionHistory(
              active.filter((row) => row.effectiveDate <= price.date),
              zeroOpening,
            );
            const observation = atDate.observations.at(-1);
            if (observation && atDate.complete)
              result.observations.push({
                ...observation,
                date: price.date,
                value: decimalText(multiply(decimal(atDate.units), decimal(price.price))),
              });
          }
      if (prices.length > 2000) result.issues.push('Only the latest 2000 recorded prices are included.');
    }
  }
  const byDate = new Map(result.observations.map((row) => [row.date, row]));
  result.observations = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const reportingCurrency = args.reportingCurrency ?? account.currency;
  let totalsAvailable = result.complete;
  if (reportingCurrency !== account.currency) {
    const rates = await ctx.db
      .query('portfolioFxRates')
      .withIndex('by_ownerId_and_from_and_to_and_date', (q) =>
        q.eq('ownerId', profile._id).eq('from', account.currency).eq('to', reportingCurrency).lte('date', args.asOf),
      )
      .order('desc')
      .take(2001);
    const converted = convertContributionHistory(result.observations, rates);
    result.observations = converted.observations;
    totalsAvailable = totalsAvailable && converted.complete;
    result.issues.push(...converted.issues);
    const last = result.observations.at(-1);
    if (last) {
      result.opening = last.opening;
      result.personal = last.personal;
      result.other = last.other;
      result.withdrawals = last.withdrawals;
    }
  }
  return { ...result, totalsAvailable, currency: reportingCurrency };
}

export const history = query({ args: historyArgs.fields, handler: (ctx, args) => accountHistory(ctx, args) });

export const allAssets = query({
  args: { asOf: v.string(), reportingCurrency: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    date(args.asOf);
    const [accounts, positions] = await Promise.all([
      ctx.db
        .query('investmentAccounts')
        .withIndex('by_ownerId_and_archived', (q) => q.eq('ownerId', profile._id).eq('archived', false))
        .take(51),
      ctx.db
        .query('portfolioPositions')
        .withIndex('by_ownerId_and_key', (q) => q.eq('ownerId', profile._id))
        .take(51),
    ]);
    if (accounts.length > 50 || positions.length > 50)
      throw new ConvexError('Performance supports up to 50 accounts and holdings.');
    const assets = [];
    for (const account of accounts) {
      const transactions = await ctx.db
        .query('investmentTransactions')
        .withIndex('by_ownerId_and_accountId_and_effectiveDate', (q) =>
          q.eq('ownerId', profile._id).eq('accountId', account._id).lte('effectiveDate', args.asOf),
        )
        .take(2001);
      if (transactions.length > 2000) throw new ConvexError('Performance history exceeds 2000 transactions.');
      const instruments = [
        ...new Set(transactions.filter((row) => !row.voided).map((row) => row.instrumentCode ?? '')),
      ];
      if (!instruments.length) instruments.push('');
      for (const instrumentCode of instruments) {
        const result = await accountHistory(ctx, { accountId: account._id, instrumentCode, ...args }, transactions);
        assets.push({
          id: instrumentCode ? `${account._id}:${instrumentCode}` : account._id,
          name: instrumentCode ? `${instrumentCode} · ${account.name}` : account.name,
          observations: result.totalsAvailable ? result.observations : [],
          issues: result.issues,
        });
      }
    }
    const linked = new Set(accounts.map((account) => account.performancePositionId));
    for (const position of positions) {
      if (position.debt || linked.has(position._id)) continue;
      assets.push({
        id: position._id,
        name: `${position.name} · ${position.account}`,
        observations: [],
        issues: [
          'Link this asset to its investment ledger in History setup. Contribution history is required to separate invested capital from growth.',
        ],
      });
    }
    const bankAccounts = await ctx.db
      .query('accounts')
      .withIndex('by_ownerId_and_archived', (q) => q.eq('ownerId', profile._id).eq('archived', false))
      .take(51);
    if (bankAccounts.length > 50) throw new ConvexError('Performance supports up to 50 bank accounts.');
    for (const account of bankAccounts) {
      if (account.type === 'creditCard' || account.type === 'loan') continue;
      assets.push({
        id: account._id,
        name: account.name,
        observations: [],
        issues: [
          'Bank balances include deposits and withdrawals. A balance history alone cannot separate invested capital from growth.',
        ],
      });
    }
    return assets;
  },
});

export const configure = mutation({
  args: {
    accountId: v.id('investmentAccounts'),
    positionId: v.optional(v.id('portfolioPositions')),
    zeroOpening: v.boolean(),
    priceSourceConfirmed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const account = assertOwner(await ctx.db.get('investmentAccounts', args.accountId), profile._id);
    if (args.positionId) {
      if (!args.priceSourceConfirmed) throw new ConvexError('Confirm the holding represents the imported account.');
      const position = assertOwner(await ctx.db.get('portfolioPositions', args.positionId), profile._id);
      if (position.debt || decimal(position.ownershipShare ?? '1') !== decimal('1'))
        throw new ConvexError('Performance requires a fully owned investment holding.');
      if (position.currency !== account.currency)
        throw new ConvexError('The holding and investment account must use the same currency.');
      const rows = await ctx.db
        .query('investmentTransactions')
        .withIndex('by_ownerId_and_accountId_and_effectiveDate', (q) =>
          q.eq('ownerId', profile._id).eq('accountId', account._id),
        )
        .take(2001);
      if (rows.length > 2000) throw new ConvexError('History setup exceeds 2000 transactions.');
      const codes = new Set(rows.filter((row) => !row.voided && row.instrumentCode).map((row) => row.instrumentCode));
      if (codes.size > 1 || (codes.size === 1 && !codes.has(position.instrument)))
        throw new ConvexError('Holding does not match the imported instrument.');
    }
    await ctx.db.patch('investmentAccounts', account._id, {
      performancePositionId: args.positionId,
      performanceZeroOpening: args.zeroOpening,
    });
  },
});
