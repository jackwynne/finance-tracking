import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { assertOwner, requireProfile } from './lib/auth';
import { normalizeText } from './lib/finance';

const accountTypeValidator = v.union(
  v.literal('checking'),
  v.literal('savings'),
  v.literal('creditCard'),
  v.literal('cash'),
  v.literal('loan'),
  v.literal('other'),
);

async function ownedCategory(
  ctx: Parameters<typeof requireProfile>[0],
  categoryId: Id<'categories'>,
  ownerId: Id<'profiles'>,
) {
  return assertOwner(await ctx.db.get('categories', categoryId), ownerId);
}

export const listAccounts = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_ownerId_and_archived', (q) =>
        q.eq('ownerId', profile._id).eq('archived', args.includeArchived ? true : false),
      )
      .take(100);
    if (!args.includeArchived) return accounts;
    const active = await ctx.db
      .query('accounts')
      .withIndex('by_ownerId_and_archived', (q) => q.eq('ownerId', profile._id).eq('archived', false))
      .take(100);
    return [...active, ...accounts];
  },
});

export const createAccount = mutation({
  args: {
    name: v.string(),
    type: accountTypeValidator,
    institution: v.optional(v.string()),
    currency: v.string(),
    mask: v.string(),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    return await ctx.db.insert('accounts', {
      ownerId: profile._id,
      name: args.name.trim(),
      type: args.type,
      institution: args.institution?.trim() || undefined,
      currency: args.currency.toUpperCase(),
      mask: args.mask.trim(),
      archived: false,
    });
  },
});

export const updateAccount = mutation({
  args: {
    accountId: v.id('accounts'),
    name: v.optional(v.string()),
    type: v.optional(accountTypeValidator),
    institution: v.optional(v.string()),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    assertOwner(await ctx.db.get('accounts', args.accountId), profile._id);
    const patch: Partial<Doc<'accounts'>> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.type !== undefined) patch.type = args.type;
    if (args.institution !== undefined) patch.institution = args.institution.trim() || undefined;
    if (args.archived !== undefined) patch.archived = args.archived;
    await ctx.db.patch('accounts', args.accountId, patch);
    return null;
  },
});

export const addBalanceSnapshot = mutation({
  args: {
    accountId: v.id('accounts'),
    date: v.string(),
    ledgerMinor: v.int64(),
    availableMinor: v.optional(v.int64()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const account = assertOwner(await ctx.db.get('accounts', args.accountId), profile._id);
    const ledgerMinor =
      (account.type === 'creditCard' || account.type === 'loan') && args.ledgerMinor > 0n
        ? -args.ledgerMinor
        : args.ledgerMinor;
    const snapshotId = await ctx.db.insert('balanceSnapshots', {
      ownerId: profile._id,
      accountId: args.accountId,
      date: args.date,
      ledgerMinor,
      availableMinor: args.availableMinor,
      source: 'manual',
      note: args.note?.trim() || undefined,
      voided: false,
    });
    await ctx.db.patch('accounts', args.accountId, {
      currentLedgerMinor: ledgerMinor,
      currentAvailableMinor: args.availableMinor,
      balanceAsOf: args.date,
    });
    return snapshotId;
  },
});

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const groups = await ctx.db
      .query('categoryGroups')
      .withIndex('by_ownerId_and_sortOrder', (q) => q.eq('ownerId', profile._id))
      .take(50);
    return await Promise.all(
      groups
        .filter((group) => !group.archived)
        .map(async (group) => ({
          ...group,
          categories: (
            await ctx.db
              .query('categories')
              .withIndex('by_ownerId_and_groupId_and_sortOrder', (q) =>
                q.eq('ownerId', profile._id).eq('groupId', group._id),
              )
              .take(100)
          ).filter((category) => !category.archived),
        })),
    );
  },
});

export const createCategory = mutation({
  args: { groupId: v.id('categoryGroups'), name: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    assertOwner(await ctx.db.get('categoryGroups', args.groupId), profile._id);
    const existing = await ctx.db
      .query('categories')
      .withIndex('by_ownerId_and_normalizedName', (q) =>
        q.eq('ownerId', profile._id).eq('normalizedName', normalizeText(args.name)),
      )
      .unique();
    if (existing) throw new ConvexError('A category with that name already exists.');
    return await ctx.db.insert('categories', {
      ownerId: profile._id,
      groupId: args.groupId,
      name: args.name.trim(),
      normalizedName: normalizeText(args.name),
      sortOrder: Date.now(),
      isSystem: false,
      archived: false,
    });
  },
});

export const listTransactions = query({
  args: {
    paginationOpts: paginationOptsValidator,
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    accountId: v.optional(v.id('accounts')),
    categoryId: v.optional(v.id('categories')),
    counterpartyId: v.optional(v.id('counterparties')),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const result = await ctx.db
      .query('transactions')
      .withIndex('by_ownerId_and_postedDate', (q) => {
        const owned = q.eq('ownerId', profile._id);
        if (args.dateFrom && args.dateTo) return owned.gte('postedDate', args.dateFrom).lte('postedDate', args.dateTo);
        if (args.dateFrom) return owned.gte('postedDate', args.dateFrom);
        if (args.dateTo) return owned.lte('postedDate', args.dateTo);
        return owned;
      })
      .order('desc')
      .paginate(args.paginationOpts);

    const page = result.page.filter(
      (transaction) =>
        !transaction.voided &&
        (!args.accountId || transaction.accountId === args.accountId) &&
        (!args.categoryId || transaction.categoryId === args.categoryId) &&
        (!args.counterpartyId || transaction.counterpartyId === args.counterpartyId),
    );
    return {
      ...result,
      page: await Promise.all(
        page.map(async (transaction) => ({
          ...transaction,
          account: await ctx.db.get('accounts', transaction.accountId),
          counterparty: transaction.counterpartyId
            ? await ctx.db.get('counterparties', transaction.counterpartyId)
            : null,
          category: transaction.categoryId ? await ctx.db.get('categories', transaction.categoryId) : null,
        })),
      ),
    };
  },
});

export const searchTransactions = query({
  args: { search: v.string(), accountId: v.optional(v.id('accounts')), limit: v.number() },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const results = await ctx.db
      .query('transactions')
      .withSearchIndex('search_description', (q) => {
        const search = q.search('normalizedDescription', normalizeText(args.search)).eq('ownerId', profile._id);
        return args.accountId ? search.eq('accountId', args.accountId) : search;
      })
      .take(Math.min(args.limit, 100));
    return results.filter((transaction) => !transaction.voided);
  },
});

export const updateTransaction = mutation({
  args: {
    transactionId: v.id('transactions'),
    categoryId: v.optional(v.union(v.id('categories'), v.null())),
    counterpartyId: v.optional(v.union(v.id('counterparties'), v.null())),
    notes: v.optional(v.string()),
    excluded: v.optional(v.boolean()),
    scope: v.union(v.literal('transaction'), v.literal('unclassified'), v.literal('all')),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const transaction = assertOwner(await ctx.db.get('transactions', args.transactionId), profile._id);
    if (args.categoryId) await ownedCategory(ctx, args.categoryId, profile._id);
    if (args.counterpartyId) assertOwner(await ctx.db.get('counterparties', args.counterpartyId), profile._id);

    const patch: Partial<Doc<'transactions'>> = {};
    if (args.categoryId !== undefined) patch.categoryId = args.categoryId ?? undefined;
    if (args.counterpartyId !== undefined) patch.counterpartyId = args.counterpartyId ?? undefined;
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;
    if (args.excluded !== undefined) patch.excluded = args.excluded;
    await ctx.db.patch('transactions', transaction._id, patch);

    const counterpartyId = args.counterpartyId ?? transaction.counterpartyId;
    if (counterpartyId && args.categoryId) {
      await ctx.db.patch('counterparties', counterpartyId, { defaultCategoryId: args.categoryId });
      if (args.scope !== 'transaction') {
        const matches = await ctx.db
          .query('transactions')
          .withIndex('by_ownerId_and_counterpartyId_and_postedDate', (q) =>
            q.eq('ownerId', profile._id).eq('counterpartyId', counterpartyId),
          )
          .take(5000);
        for (const match of matches) {
          if (args.scope === 'all' || !match.categoryId)
            await ctx.db.patch('transactions', match._id, { categoryId: args.categoryId });
        }
      }
    }
    return null;
  },
});

export const listCounterparties = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const counterparties = await ctx.db
      .query('counterparties')
      .withIndex('by_ownerId_and_archived', (q) => q.eq('ownerId', profile._id).eq('archived', false))
      .take(500);
    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_ownerId_and_postedDate', (q) => q.eq('ownerId', profile._id))
      .order('desc')
      .take(5000);
    return await Promise.all(
      counterparties.map(async (counterparty) => {
        const matching = transactions.filter(
          (transaction) => !transaction.voided && transaction.counterpartyId === counterparty._id,
        );
        const aliases = await ctx.db
          .query('counterpartyAliases')
          .withIndex('by_counterpartyId', (q) => q.eq('counterpartyId', counterparty._id))
          .take(100);
        return {
          ...counterparty,
          aliases,
          transactionCount: matching.length,
          moneyInMinor: matching.reduce((sum, item) => sum + (item.amountMinor > 0n ? item.amountMinor : 0n), 0n),
          moneyOutMinor: matching.reduce((sum, item) => sum + (item.amountMinor < 0n ? -item.amountMinor : 0n), 0n),
          lastSeen: matching[0]?.postedDate,
        };
      }),
    );
  },
});

export const updateCounterparty = mutation({
  args: {
    counterpartyId: v.id('counterparties'),
    name: v.optional(v.string()),
    defaultCategoryId: v.optional(v.union(v.id('categories'), v.null())),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    assertOwner(await ctx.db.get('counterparties', args.counterpartyId), profile._id);
    if (args.defaultCategoryId) await ownedCategory(ctx, args.defaultCategoryId, profile._id);
    const patch: Partial<Doc<'counterparties'>> = {};
    if (args.name !== undefined) {
      patch.name = args.name.trim();
      patch.normalizedName = normalizeText(args.name);
    }
    if (args.defaultCategoryId !== undefined) patch.defaultCategoryId = args.defaultCategoryId ?? undefined;
    await ctx.db.patch('counterparties', args.counterpartyId, patch);
    return null;
  },
});

export const mergeCounterparties = mutation({
  args: { sourceId: v.id('counterparties'), targetId: v.id('counterparties') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const source = assertOwner(await ctx.db.get('counterparties', args.sourceId), profile._id);
    assertOwner(await ctx.db.get('counterparties', args.targetId), profile._id);
    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_ownerId_and_counterpartyId_and_postedDate', (q) =>
        q.eq('ownerId', profile._id).eq('counterpartyId', args.sourceId),
      )
      .take(5000);
    for (const transaction of transactions)
      await ctx.db.patch('transactions', transaction._id, { counterpartyId: args.targetId });
    const aliases = await ctx.db
      .query('counterpartyAliases')
      .withIndex('by_counterpartyId', (q) => q.eq('counterpartyId', args.sourceId))
      .take(100);
    for (const alias of aliases)
      await ctx.db.patch('counterpartyAliases', alias._id, { counterpartyId: args.targetId });
    await ctx.db.insert('counterpartyAliases', {
      ownerId: profile._id,
      counterpartyId: args.targetId,
      alias: source.name,
      normalizedAlias: source.normalizedName,
    });
    await ctx.db.patch('counterparties', args.sourceId, { archived: true });
    return null;
  },
});

export const dashboard = query({
  args: { dateFrom: v.string(), dateTo: v.string(), currentDate: v.string(), accountId: v.optional(v.id('accounts')) },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_ownerId_and_postedDate', (q) =>
        q.eq('ownerId', profile._id).gte('postedDate', args.dateFrom).lte('postedDate', args.dateTo),
      )
      .take(5000);
    const included = transactions.filter(
      (item) =>
        !item.voided &&
        !item.excluded &&
        item.reportingKind !== 'transfer' &&
        (!args.accountId || item.accountId === args.accountId),
    );
    const categoryGroups = await ctx.db
      .query('categoryGroups')
      .withIndex('by_ownerId_and_sortOrder', (q) => q.eq('ownerId', profile._id))
      .take(50);
    const categories = await ctx.db
      .query('categories')
      .withIndex('by_ownerId_and_normalizedName', (q) => q.eq('ownerId', profile._id))
      .take(500);
    const investmentGroupIds = new Set(
      categoryGroups.filter((group) => group.kind === 'investment' && !group.archived).map((group) => group._id),
    );
    const investmentCategoryIds = new Set(
      categories
        .filter((category) => investmentGroupIds.has(category.groupId) && !category.archived)
        .map((category) => category._id),
    );
    const isInvestment = (item: (typeof included)[number]) =>
      item.categoryId !== undefined && investmentCategoryIds.has(item.categoryId);
    const incomeMinor = included.reduce(
      (sum, item) =>
        sum + (!isInvestment(item) && item.amountMinor > 0n && item.reportingKind !== 'refund' ? item.amountMinor : 0n),
      0n,
    );
    const spendingMinor = included.reduce(
      (sum, item) =>
        sum +
        (!isInvestment(item)
          ? item.amountMinor < 0n
            ? -item.amountMinor
            : item.reportingKind === 'refund'
              ? -item.amountMinor
              : 0n
          : 0n),
      0n,
    );
    const investedMinor = included.reduce((sum, item) => sum + (isInvestment(item) ? -item.amountMinor : 0n), 0n);

    const categoryTotals = new Map<string, bigint>();
    const counterpartyTotals = new Map<string, bigint>();
    const monthly = new Map<string, { income: bigint; spending: bigint; invested: bigint }>();
    for (const item of included) {
      const investment = isInvestment(item);
      if (!investment && (item.amountMinor < 0n || item.reportingKind === 'refund')) {
        const categoryKey = item.categoryId ?? 'uncategorized';
        categoryTotals.set(categoryKey, (categoryTotals.get(categoryKey) ?? 0n) + -item.amountMinor);
      }
      if (!investment && item.counterpartyId) {
        counterpartyTotals.set(
          item.counterpartyId,
          (counterpartyTotals.get(item.counterpartyId) ?? 0n) +
            (item.amountMinor < 0n ? -item.amountMinor : item.reportingKind === 'refund' ? -item.amountMinor : 0n),
        );
      }
      const month = item.postedDate.slice(0, 7);
      const point = monthly.get(month) ?? { income: 0n, spending: 0n, invested: 0n };
      if (investment) point.invested += -item.amountMinor;
      else if (item.amountMinor > 0n && item.reportingKind !== 'refund') point.income += item.amountMinor;
      else if (item.reportingKind === 'refund') point.spending -= item.amountMinor;
      else point.spending += -item.amountMinor;
      monthly.set(month, point);
    }

    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_ownerId_and_archived', (q) => q.eq('ownerId', profile._id).eq('archived', false))
      .take(100);
    const netWorthMinor = accounts.reduce((sum, account) => sum + (account.currentLedgerMinor ?? 0n), 0n);
    const counterparties = await ctx.db
      .query('counterparties')
      .withIndex('by_ownerId_and_archived', (q) => q.eq('ownerId', profile._id).eq('archived', false))
      .take(500);
    return {
      incomeMinor,
      spendingMinor,
      investedMinor,
      netCashFlowMinor: incomeMinor - spendingMinor - investedMinor,
      netWorthMinor,
      transactionCount: included.length,
      categoryTotals: [...categoryTotals.entries()]
        .filter(([, amountMinor]) => amountMinor > 0n)
        .map(([id, amountMinor]) => ({
          id,
          name: categories.find((category) => category._id === id)?.name ?? 'Uncategorized',
          amountMinor,
        }))
        .sort((a, b) => Number(b.amountMinor - a.amountMinor))
        .slice(0, 8),
      counterpartyTotals: [...counterpartyTotals.entries()]
        .filter(([, amountMinor]) => amountMinor > 0n)
        .map(([id, amountMinor]) => ({
          id,
          name: counterparties.find((counterparty) => counterparty._id === id)?.name ?? 'Unknown',
          amountMinor,
        }))
        .sort((a, b) => Number(b.amountMinor - a.amountMinor))
        .slice(0, 6),
      monthly: [...monthly.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, values]) => ({
          month,
          incomeMinor: values.income,
          spendingMinor: values.spending,
          investedMinor: values.invested,
        })),
      accounts,
      asOf: args.currentDate,
    };
  },
});

export const listLinkSuggestions = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    return await ctx.db
      .query('transactionLinks')
      .withIndex('by_ownerId_and_status', (q) => q.eq('ownerId', profile._id).eq('status', 'suggested'))
      .take(100);
  },
});

export const resolveLink = mutation({
  args: { linkId: v.id('transactionLinks'), status: v.union(v.literal('confirmed'), v.literal('rejected')) },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const link = assertOwner(await ctx.db.get('transactionLinks', args.linkId), profile._id);
    await ctx.db.patch('transactionLinks', link._id, { status: args.status, createdBy: 'user' });
    if (args.status === 'confirmed') {
      if (link.type === 'transfer') {
        await ctx.db.patch('transactions', link.fromTransactionId, { reportingKind: 'transfer' });
        await ctx.db.patch('transactions', link.toTransactionId, { reportingKind: 'transfer' });
      } else {
        const purchase = await ctx.db.get('transactions', link.fromTransactionId);
        if (purchase?.categoryId)
          await ctx.db.patch('transactions', link.toTransactionId, {
            reportingKind: 'refund',
            categoryId: purchase.categoryId,
          });
      }
    }
    return null;
  },
});
