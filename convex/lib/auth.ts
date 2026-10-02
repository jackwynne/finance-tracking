import { ConvexError } from 'convex/values';
import { z } from 'zod';

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

type DatabaseCtx = QueryCtx | MutationCtx;

export async function requireIdentity(ctx: DatabaseCtx, options?: { allowMcpMutation?: boolean }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError('You must be signed in.');
  }
  if (
    identity.issuer === process.env.MCP_AUTHORIZATION_SERVER_URL &&
    'scheduler' in ctx &&
    !options?.allowMcpMutation
  ) {
    throw new ConvexError('This operation is unavailable for your ChatGPT permissions.');
  }
  return identity;
}

export async function findProfile(
  ctx: DatabaseCtx,
  options?: { mcpScope?: 'koru.propose' | 'koru.apply' },
): Promise<Doc<'profiles'> | null> {
  const identity = await requireIdentity(ctx, { allowMcpMutation: Boolean(options?.mcpScope) });
  if (process.env.MCP_AUTHORIZATION_SERVER_URL && identity.issuer === process.env.MCP_AUTHORIZATION_SERVER_URL) {
    const principal = await ctx.db
      .query('mcpPrincipals')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
      .unique();
    if (!principal?.enabled) return null;
    const granted = z.string().catch('').parse(identity.scope).split(' ');
    const required = 'scheduler' in ctx ? options?.mcpScope : 'koru.read';
    if (!required || !granted.includes(required) || (required === 'koru.apply' && !principal.allowApply)) {
      throw new ConvexError('This operation is unavailable for your ChatGPT permissions.');
    }
    return await ctx.db.get('profiles', principal.ownerId);
  }
  return await ctx.db
    .query('profiles')
    .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
    .unique();
}

export async function requireProfile(
  ctx: DatabaseCtx,
  options?: { mcpScope?: 'koru.propose' | 'koru.apply' },
): Promise<Doc<'profiles'>> {
  const profile = await findProfile(ctx, options);
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
