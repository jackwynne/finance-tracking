import { ConvexError, v } from 'convex/values';

import { api, internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { action, internalMutation } from './_generated/server';
import { FX_SOURCE_URL, parsePublishedRates, refreshWindow } from './lib/fxSource';

export const storeRates = internalMutation({
  args: {
    ownerId: v.id('profiles'),
    rates: v.array(
      v.object({ from: v.string(), to: v.string(), date: v.string(), rate: v.string(), source: v.string() }),
    ),
  },
  handler: async (ctx, args) => {
    for (const rate of args.rates) {
      const existing = await ctx.db
        .query('portfolioFxRates')
        .withIndex('by_ownerId_and_from_and_to_and_date', (q) =>
          q.eq('ownerId', args.ownerId).eq('from', rate.from).eq('to', rate.to).eq('date', rate.date),
        )
        .take(101);
      if (existing.length > 100) throw new ConvexError('Too many duplicate rates for this date.');
      const first = existing[0];
      if (existing.length > 0) {
        await ctx.db.patch(first._id, rate);
        for (const duplicate of existing.slice(1)) await ctx.db.delete(duplicate._id);
      } else await ctx.db.insert('portfolioFxRates', { ...rate, ownerId: args.ownerId });
    }
    return args.rates.length;
  },
});

export const refresh = action({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args): Promise<{ stored: number; from: string; to: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError('Sign in to refresh exchange rates.');
    if (identity.issuer === process.env.MCP_AUTHORIZATION_SERVER_URL)
      throw new ConvexError('Refresh exchange rates in Koru. This operation is unavailable through ChatGPT.');
    const profile: Doc<'profiles'> | null = await ctx.runQuery(api.profiles.current, {});
    if (!profile) throw new ConvexError('Sign in and initialize your finance profile first.');
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: profile.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
    const today = `${part('year')}-${part('month')}-${part('day')}`;
    try {
      const window = refreshWindow(args.from, args.to, today);
      const url = new URL(FX_SOURCE_URL);
      url.search = new URLSearchParams({ from: window.from, to: window.to, base: 'AUD', quotes: 'NZD' }).toString();
      const result = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
        headers: { Accept: 'application/json' },
      });
      if (!result.ok) throw new Error('The exchange-rate source is unavailable.');
      const body = await result.text();
      if (body.length > 50_000) throw new Error('The exchange-rate response was too large.');
      const rates = parsePublishedRates(body, window.from, window.to);
      const stored: number = await ctx.runMutation(internal.fxActions.storeRates, { ownerId: profile._id, rates });
      return { stored, from: window.from, to: window.to };
    } catch (error) {
      throw new ConvexError(
        `${error instanceof Error ? error.message : 'Exchange-rate refresh failed.'} Your previous rates have been kept.`,
      );
    }
  },
});
