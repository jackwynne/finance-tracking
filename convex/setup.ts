import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireProfile } from './lib/auth';

export const preferences = mutation({
  args: { currency: v.union(v.literal('NZD'), v.literal('AUD')), timezone: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    try {
      new Intl.DateTimeFormat('en', { timeZone: args.timezone }).format(0);
    } catch {
      throw new ConvexError('Choose a valid reporting timezone.');
    }
    await ctx.db.patch(profile._id, { baseCurrency: args.currency, timezone: args.timezone });
  },
});

export const readiness = query({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx);
    return {
      akahuConfigured: Boolean(process.env.AKAHU_APP_TOKEN && process.env.AKAHU_USER_TOKEN),
      mcpConfigured: Boolean(process.env.MCP_RESOURCE_URL && process.env.MCP_AUTHORIZATION_SERVER_URL),
    };
  },
});
