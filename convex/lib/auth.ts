import { ConvexError } from 'convex/values';

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

type DatabaseCtx = QueryCtx | MutationCtx;

export async function requireIdentity(ctx: DatabaseCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError('You must be signed in.');
  }
  return identity;
}

export async function findProfile(ctx: DatabaseCtx): Promise<Doc<'profiles'> | null> {
  const identity = await requireIdentity(ctx);
  return await ctx.db
    .query('profiles')
    .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
    .unique();
}

export async function requireProfile(ctx: DatabaseCtx): Promise<Doc<'profiles'>> {
  const profile = await findProfile(ctx);
  if (!profile) {
    throw new ConvexError('Your finance profile has not been initialized.');
  }
  return profile;
}

export function assertOwner<T extends { ownerId: Id<'profiles'> }>(document: T | null, ownerId: Id<'profiles'>): T {
  if (!document || document.ownerId !== ownerId) {
    throw new ConvexError('Record not found.');
  }
  return document;
}
