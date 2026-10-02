import { ConvexError, v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { query } from './_generated/server';
import { requireProfile } from './lib/auth';
import { date } from './lib/portfolioMath';
import type { SpendingRow } from './lib/spendingMath';
import { comparablePreviousPeriod, missingCoverage, summarizeSpending } from './lib/spendingMath';

const ROW_LIMIT = 2000;

async function period(ctx: QueryCtx, ownerId: Id<'profiles'>, from: string, to: string, currency: string) {
  const transactions = await ctx.db
    .query('transactions')
    .withIndex('by_ownerId_and_postedDate', (q) =>
      q.eq('ownerId', ownerId).gte('postedDate', from).lte('postedDate', to),
    )
    .take(ROW_LIMIT + 1);
  const [categories, groups, links, splits] = await Promise.all([
    ctx.db
      .query('categories')
      .withIndex('by_ownerId_and_normalizedName', (q) => q.eq('ownerId', ownerId))
      .take(501),
    ctx.db
      .query('categoryGroups')
      .withIndex('by_ownerId_and_sortOrder', (q) => q.eq('ownerId', ownerId))
      .take(101),
    ctx.db
      .query('transactionLinks')
      .withIndex('by_ownerId_and_status', (q) => q.eq('ownerId', ownerId).eq('status', 'confirmed'))
      .take(2001),
    ctx.db
      .query('transactionSplits')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', ownerId))
      .take(2001),
  ]);
  const confirmedTransfers = new Set(
    links.filter((link) => link.type === 'transfer').flatMap((link) => [link.fromTransactionId, link.toTransactionId]),
  );
  const rates: Array<Doc<'portfolioFxRates'>> = [];
  const currencies = new Set(transactions.map((row) => row.currency));
  const rateStart = new Date(Date.parse(`${from}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  let ratesTruncated = false;
  for (const nativeCurrency of currencies) {
    if (nativeCurrency === currency) continue;
    const found = await ctx.db
      .query('portfolioFxRates')
      .withIndex('by_ownerId_and_from_and_to_and_date', (q) =>
        q.eq('ownerId', ownerId).eq('from', nativeCurrency).eq('to', currency).gte('date', rateStart).lte('date', to),
      )
      .take(401);
    ratesTruncated ||= found.length > 400;
    rates.push(...found.slice(0, 400));
  }
  const rows = transactions
    .slice(0, ROW_LIMIT)
    .filter((row) => !row.voided && !row.excluded)
    .flatMap((row): Array<SpendingRow> => {
      const split = splits.find((item) => item.transactionId === row._id);
      const parts = split?.parts ?? [
        {
          categoryId: row.categoryId,
          amountMinor: String(row.amountMinor),
          reportingTreatment: row.reportingTreatment ?? row.reportingKind,
        },
      ];
      return parts.map((part) => {
        const category = categories.find((item) => item._id === part.categoryId);
        const group = groups.find((item) => item._id === category?.groupId);
        return {
          postedDate: row.postedDate,
          amountMinor: BigInt(part.amountMinor),
          currency: row.currency,
          category: category?.name ?? '',
          group: group?.name ?? '',
          groupKind: group?.kind ?? '',
          treatment:
            confirmedTransfers.has(row._id) && !split
              ? 'transfer'
              : part.reportingTreatment === 'transfer' && !row.reportingTreatment && !split
                ? 'standard'
                : part.reportingTreatment,
        };
      });
    });
  const result = summarizeSpending(rows, rates, currency);
  const truncated =
    transactions.length > ROW_LIMIT ||
    categories.length > 500 ||
    groups.length > 100 ||
    links.length > 2000 ||
    splits.length > 2000 ||
    ratesTruncated;
  return { ...result, from, to, rowCount: rows.length, truncated, complete: result.complete && !truncated };
}

export const summary = query({
  args: { from: v.string(), to: v.string(), currency: v.union(v.literal('NZD'), v.literal('AUD')) },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    date(args.from);
    date(args.to);
    if (!args.from.endsWith('-01') || args.from > args.to || args.from.slice(0, 7) !== args.to.slice(0, 7))
      throw new ConvexError('Choose a month-start date and an end date in the same month.');
    const previous = comparablePreviousPeriod(args.from, args.to);
    const [current, comparison, accounts, imports] = await Promise.all([
      period(ctx, profile._id, args.from, args.to, args.currency),
      period(ctx, profile._id, previous.from, previous.to, args.currency),
      ctx.db
        .query('accounts')
        .withIndex('by_ownerId_and_archived', (q) => q.eq('ownerId', profile._id).eq('archived', false))
        .take(101),
      ctx.db
        .query('imports')
        .withIndex('by_ownerId_and_startedAt', (q) => q.eq('ownerId', profile._id))
        .order('desc')
        .take(501),
    ]);
    const coverage = accounts.slice(0, 100).map((account) => {
      const ranges = imports
        .filter((item) => item.status === 'committed' && item.accountId === account._id && item.dateFrom && item.dateTo)
        .map((item) => ({ from: item.dateFrom ?? '', to: item.dateTo ?? '', source: item.fileName }));
      return {
        id: account._id,
        name: account.name,
        currency: account.currency,
        ranges,
        currentGaps: missingCoverage(ranges, args.from, args.to),
        comparisonGaps: missingCoverage(ranges, previous.from, previous.to),
      };
    });
    const metadataIncomplete = imports.length > 500 || accounts.length > 100 || accounts.length === 0;
    const currentCoverageIncomplete = metadataIncomplete || coverage.some((account) => account.currentGaps.length > 0);
    const comparisonCoverageIncomplete =
      metadataIncomplete || coverage.some((account) => account.comparisonGaps.length > 0);
    return {
      current: { ...current, complete: current.complete && !currentCoverageIncomplete },
      comparison: { ...comparison, complete: comparison.complete && !comparisonCoverageIncomplete },
      timezone: profile.timezone,
      policyVersion: 'booked-date-v1',
      coverageIncomplete: currentCoverageIncomplete || comparisonCoverageIncomplete,
      coverage,
    };
  },
});
