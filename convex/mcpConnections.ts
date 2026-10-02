import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireIdentity, requireProfile } from './lib/auth';

export function mcpConfiguration() {
  const issuer = process.env.MCP_AUTHORIZATION_SERVER_URL;
  const resource = process.env.MCP_RESOURCE_URL;
  if (!issuer || !resource) return null;
  try {
    const issuerUrl = new URL(issuer);
    const resourceUrl = new URL(resource);
    if (
      issuerUrl.protocol !== 'https:' ||
      resourceUrl.protocol !== 'https:' ||
      issuerUrl.search ||
      issuerUrl.hash ||
      resourceUrl.search ||
      resourceUrl.hash ||
      issuerUrl.username ||
      resourceUrl.username
    )
      return null;
    if (
      issuerUrl.pathname !== '/' ||
      resourceUrl.pathname !== '/mcp' ||
      issuer !== issuerUrl.origin ||
      resource !== resourceUrl.href
    )
      return null;
    return { issuer: issuerUrl.origin, resource: resourceUrl.href };
  } catch {
    return null;
  }
}
export const status = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const principal = await ctx.db
      .query('mcpPrincipals')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', profile._id))
      .unique();
    const configuration = mcpConfiguration();
    return {
      configured: configuration !== null,
      resourceUrl: configuration?.resource ?? null,
      enabled: principal?.enabled ?? false,
      allowApply: principal?.allowApply ?? false,
      reason: configuration ? null : 'Configure WorkOS Connect and the MCP authorization server and resource URLs.',
    };
  },
});
export const enable = mutation({
  args: { allowApply: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const profile = await requireProfile(ctx);
    const config = mcpConfiguration();
    if (!config) throw new ConvexError('MCP OAuth configuration is unavailable.');
    // Only the ordinary app session can grant an assistant access or apply permission.
    if (identity.issuer === config.issuer)
      throw new ConvexError('Enable ChatGPT access from your signed-in Koru settings.');
    const clientId = process.env.WORKOS_CLIENT_ID;
    const allowedIssuers = ['https://api.workos.com/', `https://api.workos.com/user_management/${clientId}`];
    if (!allowedIssuers.includes(identity.issuer))
      throw new ConvexError('Sign in to Koru with the configured WorkOS account.');
    const tokenIdentifier = `${config.issuer}|${identity.subject}`;
    const existing = await ctx.db
      .query('mcpPrincipals')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', profile._id))
      .unique();
    const collision = await ctx.db
      .query('mcpPrincipals')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', tokenIdentifier))
      .unique();
    if (collision && collision.ownerId !== profile._id)
      throw new ConvexError('This identity is already bound to another profile.');
    if (existing)
      await ctx.db.patch('mcpPrincipals', existing._id, {
        tokenIdentifier,
        enabled: true,
        allowApply: args.allowApply,
      });
    else
      await ctx.db.insert('mcpPrincipals', {
        ownerId: profile._id,
        tokenIdentifier,
        enabled: true,
        allowApply: args.allowApply,
        createdAt: Date.now(),
      });
    return null;
  },
});
export const disable = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const profile = await requireProfile(ctx);
    if (identity.issuer === mcpConfiguration()?.issuer)
      throw new ConvexError('Manage ChatGPT access in Koru settings.');
    const principal = await ctx.db
      .query('mcpPrincipals')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', profile._id))
      .unique();
    if (principal) await ctx.db.patch('mcpPrincipals', principal._id, { enabled: false, allowApply: false });
    return null;
  },
});
export const permission = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const principal = await ctx.db
      .query('mcpPrincipals')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
      .unique();
    if (!principal?.enabled) throw new ConvexError('Enable ChatGPT access in Koru first.');
    return { allowApply: principal.allowApply };
  },
});
