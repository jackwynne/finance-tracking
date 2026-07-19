import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { findProfile, requireIdentity } from './lib/auth';
import { normalizeText } from './lib/finance';

const CATEGORY_SEED_VERSION = 2;

const seedGroups = [
  { name: 'Income', kind: 'income' as const, categories: ['Salary & wages', 'Interest', 'Other income'] },
  {
    name: 'Investments',
    kind: 'investment' as const,
    categories: ['Shares & ETFs', 'Managed funds', 'KiwiSaver', 'Cryptocurrency', 'Other investments'],
  },
  {
    name: 'Housing',
    kind: 'expense' as const,
    categories: ['Rent & mortgage', 'Utilities', 'Internet & phone', 'Home maintenance'],
  },
  { name: 'Food & drink', kind: 'expense' as const, categories: ['Groceries', 'Dining out', 'Cafes & takeaways'] },
  {
    name: 'Transport',
    kind: 'expense' as const,
    categories: ['Public transport', 'Rideshare & taxis', 'Fuel', 'Parking & tolls', 'Vehicle costs'],
  },
  { name: 'Health & wellbeing', kind: 'expense' as const, categories: ['Healthcare', 'Pharmacy', 'Fitness'] },
  {
    name: 'Shopping & personal',
    kind: 'expense' as const,
    categories: ['Clothing', 'Personal care', 'Household goods', 'Electronics'],
  },
  {
    name: 'Entertainment & subscriptions',
    kind: 'expense' as const,
    categories: ['Entertainment', 'Subscriptions', 'Travel'],
  },
  { name: 'Financial & tax', kind: 'expense' as const, categories: ['Bank fees', 'Interest & charges', 'Taxes'] },
  { name: 'Gifts & giving', kind: 'expense' as const, categories: ['Gifts', 'Donations'] },
  { name: 'Uncategorized', kind: 'expense' as const, categories: ['Uncategorized'] },
];

async function ensureSeedGroups(ctx: MutationCtx, ownerId: Id<'profiles'>) {
  const existingGroups = await ctx.db
    .query('categoryGroups')
    .withIndex('by_ownerId_and_sortOrder', (q) => q.eq('ownerId', ownerId))
    .take(50);

  let nextGroupSortOrder = existingGroups.reduce((maximum, group) => Math.max(maximum, group.sortOrder + 1), 0);
  for (const seed of seedGroups) {
    const existingGroup = existingGroups.find((group) => group.name === seed.name && !group.archived);
    const groupId: Id<'categoryGroups'> = existingGroup
      ? existingGroup._id
      : await ctx.db.insert('categoryGroups', {
          ownerId,
          name: seed.name,
          kind: seed.kind,
          sortOrder: nextGroupSortOrder++,
          isSystem: true,
          archived: false,
        });
    const existingCategories = await ctx.db
      .query('categories')
      .withIndex('by_ownerId_and_groupId_and_sortOrder', (q) => q.eq('ownerId', ownerId).eq('groupId', groupId))
      .take(100);
    let nextCategorySortOrder = existingCategories.reduce(
      (maximum, category) => Math.max(maximum, category.sortOrder + 1),
      0,
    );
    for (const name of seed.categories) {
      if (existingCategories.some((category) => category.name === name && !category.archived)) continue;
      await ctx.db.insert('categories', {
        ownerId,
        groupId,
        name,
        normalizedName: normalizeText(name),
        sortOrder: nextCategorySortOrder++,
        isSystem: true,
        archived: false,
      });
    }
  }
}

export const ensureCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
      .unique();
    if (existing) {
      if ((existing.categorySeedVersion ?? 0) < CATEGORY_SEED_VERSION) {
        await ensureSeedGroups(ctx, existing._id);
        await ctx.db.patch('profiles', existing._id, { categorySeedVersion: CATEGORY_SEED_VERSION });
      }
      return existing._id;
    }

    const ownerId = await ctx.db.insert('profiles', {
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email,
      name: identity.name,
      baseCurrency: 'NZD',
      timezone: 'Pacific/Auckland',
      weekStartsOn: 1,
      categorySeedVersion: CATEGORY_SEED_VERSION,
    });
    await ensureSeedGroups(ctx, ownerId);
    return ownerId;
  },
});

export const current = query({
  args: {},
  handler: async (ctx) => await findProfile(ctx),
});
