import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { findProfile, requireIdentity } from './lib/auth';

const seedGroups = [
  { name: 'Income', kind: 'income' as const, categories: ['Salary & wages', 'Interest', 'Other income'] },
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

export const ensureCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
      .unique();
    if (existing) return existing._id;

    const ownerId = await ctx.db.insert('profiles', {
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email,
      name: identity.name,
      baseCurrency: 'NZD',
      timezone: 'Pacific/Auckland',
      weekStartsOn: 1,
    });

    let sortOrder = 0;
    for (const seed of seedGroups) {
      const groupId: Id<'categoryGroups'> = await ctx.db.insert('categoryGroups', {
        ownerId,
        name: seed.name,
        kind: seed.kind,
        sortOrder,
        isSystem: true,
        archived: false,
      });
      let categorySort = 0;
      for (const name of seed.categories) {
        await ctx.db.insert('categories', {
          ownerId,
          groupId,
          name,
          normalizedName: name.toLowerCase(),
          sortOrder: categorySort++,
          isSystem: true,
          archived: false,
        });
      }
      sortOrder++;
    }
    return ownerId;
  },
});

export const current = query({
  args: {},
  handler: async (ctx) => await findProfile(ctx),
});
