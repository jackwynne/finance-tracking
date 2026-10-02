import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action, internalAction } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import { fetchAkahuPages, parseAkahuAccount, parseAkahuPage, parseAkahuTransaction, requestAkahu } from './akahuClient';

async function synchronize(
  ctx: ActionCtx,
  tokenIdentifier: string,
  requestBankRefresh: boolean,
): Promise<Id<'akahuSyncRuns'>> {
  const appToken = process.env.AKAHU_APP_TOKEN;
  const userToken = process.env.AKAHU_USER_TOKEN;
  if (!appToken || !userToken) throw new ConvexError('Akahu personal app secrets are not configured.');
  const runId: Id<'akahuSyncRuns'> = await ctx.runMutation(internal.akahu.beginSync, {
    tokenIdentifier,
    requestBankRefresh,
  });
  try {
    const request = (path: string) => requestAkahu(path, { appToken, userToken });
    const accounts = parseAkahuPage(await request('/accounts')).items.map(parseAkahuAccount);
    if (requestBankRefresh) await requestAkahu('/refresh', { appToken, userToken, method: 'POST' });
    const end = new Date().toISOString();
    for (const account of accounts) {
      const accountId: Id<'accounts'> | null = await ctx.runMutation(internal.akahu.discoverAccount, {
        runId,
        providerAccountId: account.providerAccountId,
        name: account.name,
        mask: account.mask,
        currency: account.currency,
        status: account.status,
        refreshedAt: account.refreshedAt,
      });
      if (!accountId || account.status !== 'ACTIVE') continue;
      await fetchAkahuPages(
        `/accounts/${encodeURIComponent(account.providerAccountId)}/transactions?end=${encodeURIComponent(end)}`,
        request,
        async (items) => {
          const rows = items.map((item) => parseAkahuTransaction(item, account.currency));
          if (rows.some((row) => row.providerAccountId !== account.providerAccountId))
            throw new Error('Akahu returned records for an unexpected account.');
          for (let offset = 0; offset < rows.length; offset += 50) {
            await ctx.runMutation(internal.akahu.ingestPage, {
              runId,
              accountId,
              rows: rows.slice(offset, offset + 50).map(({ providerAccountId: _account, ...row }) => row),
            });
          }
        },
      );
      if (account.transactionsRefreshedAt) {
        const to = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Pacific/Auckland',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(account.transactionsRefreshedAt));
        const from = new Date(Date.parse(`${to}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
        let cursor: string | null = null;
        let done = false;
        while (!done) {
          const page: { isDone: boolean; continueCursor: string } = await ctx.runMutation(internal.akahu.markMissing, {
            runId,
            accountId,
            from,
            to,
            paginationOpts: { numItems: 100, cursor },
          });
          cursor = page.continueCursor;
          done = page.isDone;
        }
      }
      if (account.refreshedAt) {
        const date = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Pacific/Auckland',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(account.refreshedAt));
        await ctx.runMutation(internal.akahu.saveBalance, {
          runId,
          accountId,
          ledgerMinor: account.ledgerMinor,
          availableMinor: account.availableMinor,
          date,
        });
      }
    }
    await ctx.runMutation(internal.akahu.finishSync, { runId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Akahu sync failed. Your existing records have been kept.';
    await ctx.runMutation(internal.akahu.finishSync, { runId, error: message });
    throw new ConvexError(message);
  }
  return runId;
}
export const sync = action({
  args: { requestBankRefresh: v.boolean() },
  handler: async (ctx, args): Promise<Id<'akahuSyncRuns'>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError('You must be signed in.');
    return await synchronize(ctx, identity.tokenIdentifier, args.requestBankRefresh);
  },
});
export const scheduledSync = internalAction({
  args: {},
  handler: async (ctx): Promise<null> => {
    const tokenIdentifier: string | null = await ctx.runQuery(internal.akahu.configuredConnection, {});
    if (tokenIdentifier) await synchronize(ctx, tokenIdentifier, false);
    return null;
  },
});
