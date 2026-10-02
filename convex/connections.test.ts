/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import { fetchAkahuPages, parseAkahuAccount, parseAkahuTransaction } from './akahuClient';
import { verifyMcpToken } from './mcpServer';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const issuer = 'https://koru.authkit.app';
const resource = 'https://some.convex.site/mcp';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function fixture() {
  vi.stubEnv('WORKOS_CLIENT_ID', 'client_koru');
  vi.stubEnv('MCP_AUTHORIZATION_SERVER_URL', issuer);
  vi.stubEnv('MCP_RESOURCE_URL', resource);
  const t = convexTest(schema, modules);
  const normal = t.withIdentity({
    issuer: 'https://api.workos.com/',
    subject: 'user_owner',
    tokenIdentifier: 'https://api.workos.com/|user_owner',
  });
  await normal.mutation(api.profiles.ensureCurrent, {});
  const profile = await normal.query(api.profiles.current, {});
  if (!profile) throw new Error('Missing profile.');
  const accountId = await normal.mutation(api.finance.createAccount, {
    name: 'ANZ',
    type: 'checking',
    currency: 'NZD',
    mask: '1234',
  });
  const mcp = t.withIdentity({
    issuer,
    subject: 'user_owner',
    tokenIdentifier: `${issuer}|user_owner`,
    scope: 'koru.read koru.propose',
  });
  return { t, normal, profile, accountId, mcp };
}
test('personal feed rejects classic connections and payment consents and preserves NZ posted dates', () => {
  const account = {
    _id: 'acc_test',
    name: 'ANZ',
    status: 'ACTIVE',
    connection: { connection_type: 'official', name: 'ANZ' },
    balance: { current: 12.34, currency: 'NZD' },
  };
  expect(parseAkahuAccount(account).ledgerMinor).toBe(1234n);
  expect(() => parseAkahuAccount({ ...account, connection: { connection_type: 'classic', name: 'ANZ' } })).toThrow();
  expect(() => parseAkahuAccount({ ...account, payment_consents: [{ _id: 'consent_test' }] })).toThrow();
  expect(
    parseAkahuTransaction(
      {
        _id: 'trans_test',
        _account: 'acc_test',
        date: '2026-09-30T12:30:00.000Z',
        description: 'Groceries',
        amount: -12.34,
      },
      'NZD',
    ).postedDate,
  ).toBe('2026-10-01');
});
test('follows all pages with fixed query parameters and stops repeated cursors', async () => {
  const paths: Array<string> = [];
  const consumed: Array<string> = [];
  await fetchAkahuPages(
    '/accounts/acc_test/transactions?end=2026-10-01',
    (path) => {
      paths.push(path);
      return Promise.resolve({ success: true, items: [path], cursor: { next: paths.length === 1 ? 'page 2' : null } });
    },
    (items) => {
      consumed.push(JSON.stringify(items));
      return Promise.resolve();
    },
  );
  expect(paths).toEqual([
    '/accounts/acc_test/transactions?end=2026-10-01',
    '/accounts/acc_test/transactions?end=2026-10-01&cursor=page%202',
  ]);
  expect(consumed).toHaveLength(2);
  await expect(
    fetchAkahuPages(
      '/transactions',
      () => Promise.resolve({ success: true, items: [], cursor: { next: 'same' } }),
      () => Promise.resolve(),
    ),
  ).rejects.toThrow('repeated');
});
test('bank feed replay preserves classifications and ambiguous file matches need a choice', async () => {
  const { t, normal, profile, accountId } = await fixture();
  vi.stubEnv('AKAHU_OWNER_TOKEN_IDENTIFIER', profile.tokenIdentifier);
  vi.stubEnv('AKAHU_APP_TOKEN', 'fixture_app');
  vi.stubEnv('AKAHU_USER_TOKEN', 'fixture_user');
  await normal.mutation(api.akahu.connect, { personalAppConfirmed: true, officialAnzConfirmed: true });
  const runId = await t.mutation(internal.akahu.beginSync, {
    tokenIdentifier: profile.tokenIdentifier,
    requestBankRefresh: false,
  });
  const row = {
    providerTransactionId: 'trans_fixture',
    postedDate: '2026-10-01',
    amountMinor: -1200n,
    currency: 'NZD',
    description: 'Groceries',
    normalizedDescription: 'groceries',
    sourceJson: '{}',
  };
  await t.mutation(internal.akahu.ingestPage, { runId, accountId, rows: [row] });
  const transaction = await normal.run((ctx) => ctx.db.query('transactions').unique());
  if (!transaction) throw new Error('Missing transaction.');
  await normal.run((ctx) =>
    ctx.db.patch('transactions', transaction._id, { categoryProvenance: 'manual', notes: 'Keep this note' }),
  );
  await t.mutation(internal.akahu.ingestPage, {
    runId,
    accountId,
    rows: [{ ...row, description: 'Updated Groceries' }],
  });
  const kept = await normal.run((ctx) => ctx.db.get('transactions', transaction._id));
  expect(kept).toMatchObject({ categoryProvenance: 'manual', notes: 'Keep this note' });
  await t.mutation(internal.akahu.ingestPage, {
    runId,
    accountId,
    rows: [{ ...row, providerTransactionId: 'trans_second', normalizedDescription: 'updated groceries' }],
  });
  const pending = await normal.query(api.akahu.pendingDuplicates, {});
  expect(pending).toHaveLength(1);
  expect(await normal.run((ctx) => ctx.db.query('transactions').collect())).toHaveLength(1);
  const duplicate = pending.at(0);
  if (!duplicate) throw new Error('Missing duplicate.');
  await normal.mutation(api.akahu.resolveDuplicate, { evidenceId: duplicate._id });
  expect(await normal.run((ctx) => ctx.db.query('transactions').collect())).toHaveLength(2);
});
test('unbound, cross-owner, disabled and direct public mutation MCP access is denied', async () => {
  const { t, normal, mcp } = await fixture();
  await expect(mcp.query(api.updates.getContext, {})).rejects.toThrow();
  await normal.mutation(api.mcpConnections.enable, { allowApply: false });
  expect(await mcp.query(api.updates.getContext, {})).toBeTruthy();
  await expect(
    mcp.mutation(api.finance.createAccount, { name: 'No', type: 'checking', currency: 'NZD', mask: '' }),
  ).rejects.toThrow('permissions');
  await expect(mcp.mutation(api.mcpConnections.enable, { allowApply: true })).rejects.toThrow();
  const other = t.withIdentity({
    issuer,
    subject: 'user_other',
    tokenIdentifier: `${issuer}|user_other`,
    scope: 'koru.read koru.propose koru.apply',
  });
  await expect(other.query(api.updates.getContext, {})).rejects.toThrow();
  await normal.mutation(api.mcpConnections.disable, {});
  await expect(mcp.query(api.updates.getContext, {})).rejects.toThrow();
});
test('bank financial corrections remain visible and cannot silently invalidate splits or transfers', async () => {
  const { t, normal, profile, accountId } = await fixture();
  vi.stubEnv('AKAHU_OWNER_TOKEN_IDENTIFIER', profile.tokenIdentifier);
  vi.stubEnv('AKAHU_APP_TOKEN', 'fixture_app');
  vi.stubEnv('AKAHU_USER_TOKEN', 'fixture_user');
  await normal.mutation(api.akahu.connect, { personalAppConfirmed: true, officialAnzConfirmed: true });
  const runId = await t.mutation(internal.akahu.beginSync, {
    tokenIdentifier: profile.tokenIdentifier,
    requestBankRefresh: false,
  });
  const row = {
    providerTransactionId: 'trans_correction',
    postedDate: '2026-10-01',
    amountMinor: -10000n,
    currency: 'NZD',
    description: 'Purchase',
    normalizedDescription: 'purchase',
    sourceJson: '{}',
  };
  await t.mutation(internal.akahu.ingestPage, { runId, accountId, rows: [row] });
  const transaction = await normal.run((ctx) => ctx.db.query('transactions').unique());
  if (!transaction) throw new Error('Missing transaction.');
  await normal.run((ctx) =>
    ctx.db.insert('transactionSplits', {
      ownerId: profile._id,
      transactionId: transaction._id,
      parts: [
        { amountMinor: '-6000', reportingTreatment: 'expense' },
        { amountMinor: '-4000', reportingTreatment: 'expense' },
      ],
    }),
  );
  await t.mutation(internal.akahu.ingestPage, {
    runId,
    accountId,
    rows: [{ ...row, amountMinor: -12000n, postedDate: '2026-10-02' }],
  });
  const pending = (await normal.query(api.akahu.pendingDuplicates, {})).at(0);
  if (!pending) throw new Error('Missing correction.');
  expect(pending.state).toBe('pendingCorrection');
  expect(pending.existingTransaction).toMatchObject({ amountMinor: -10000n, postedDate: '2026-10-01' });
  await expect(normal.mutation(api.akahu.resolveCorrection, { evidenceId: pending._id })).rejects.toThrow('split');
  await normal.run(async (ctx) => {
    const split = await ctx.db.query('transactionSplits').unique();
    if (split) await ctx.db.delete('transactionSplits', split._id);
    await ctx.db.insert('transactionLinks', {
      ownerId: profile._id,
      type: 'transfer',
      fromTransactionId: transaction._id,
      toTransactionId: transaction._id,
      status: 'confirmed',
      confidence: 1,
      createdBy: 'user',
    });
  });
  await expect(normal.mutation(api.akahu.resolveCorrection, { evidenceId: pending._id })).rejects.toThrow('link');
  await expect(
    t.mutation(internal.akahu.ingestPage, { runId, accountId, rows: [{ ...row, currency: 'AUD' }] }),
  ).rejects.toThrow('currency');
  expect(await normal.run((ctx) => ctx.db.get('transactions', transaction._id))).toMatchObject({
    amountMinor: -10000n,
    postedDate: '2026-10-01',
  });
});
test('verified OAuth JWT and the real streamable HTTP transport serve bound scoped tools', async () => {
  const { normal, mcp } = await fixture();
  await normal.mutation(api.mcpConnections.enable, { allowApply: false });
  const keys = await generateKeyPair('RS256', { extractable: true });
  const publicKey = await exportJWK(keys.publicKey);
  publicKey.kid = 'fixture';
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(Response.json({ keys: [publicKey] })));
  const sign = (audience: string, expiration: string | number = '5m') =>
    new SignJWT({ scope: 'koru.read koru.propose koru.apply' })
      .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
      .setIssuer(issuer)
      .setSubject('user_owner')
      .setAudience(audience)
      .setExpirationTime(expiration)
      .sign(keys.privateKey);
  const token = await sign(resource);
  expect((await verifyMcpToken(token, { issuer, resource })).scopes.has('koru.read')).toBe(true);
  await expect(verifyMcpToken(await sign('https://wrong.example/mcp'), { issuer, resource })).rejects.toThrow();
  await expect(verifyMcpToken(await sign(resource, 1), { issuer, resource })).rejects.toThrow();
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  const initialized = await mcp.fetch('/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'fixture', version: '1' } },
    }),
  });
  expect(initialized.status).toBe(200);
  expect(await initialized.text()).toContain('koru-personal-finance');
  const listed = await mcp.fetch('/mcp', {
    method: 'POST',
    headers: { ...headers, 'MCP-Protocol-Version': '2025-03-26' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  });
  expect(listed.status).toBe(200);
  const tools = await listed.text();
  expect(tools).toContain('stage_updates');
  expect(tools).not.toContain('apply_updates');
  expect(tools).not.toContain('undo_updates');
  const unauthorized = await mcp.fetch('/mcp', {
    method: 'POST',
    headers: { ...headers, Authorization: 'Bearer not-a-jwt' },
    body: '{}',
  });
  expect(unauthorized.status).toBe(401);
  expect(unauthorized.headers.get('WWW-Authenticate')).toContain('oauth-protected-resource');
});
