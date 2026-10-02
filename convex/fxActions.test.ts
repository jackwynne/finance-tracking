/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('rate retries converge to one observation and revised rates replace only the owner pair/date', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|fx', subject: 'fx', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const profile = await owner.query(api.profiles.current, {});
  if (!profile) throw new Error('Missing profile');
  const rate = { from: 'AUD', to: 'NZD', date: '2026-10-01', rate: '1.23', source: 'ECB via Frankfurter fixture' };
  await t.mutation(internal.fxActions.storeRates, { ownerId: profile._id, rates: [rate] });
  await t.mutation(internal.fxActions.storeRates, { ownerId: profile._id, rates: [rate] });
  await t.mutation(internal.fxActions.storeRates, { ownerId: profile._id, rates: [{ ...rate, rate: '1.24' }] });
  const rows = await t.run((ctx) =>
    ctx.db
      .query('portfolioFxRates')
      .withIndex('by_ownerId_and_from_and_to_and_date', (q) =>
        q.eq('ownerId', profile._id).eq('from', 'AUD').eq('to', 'NZD').eq('date', '2026-10-01'),
      )
      .collect(),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].rate).toBe('1.24');
  await expect(t.action(api.fxActions.refresh, { from: '2026-10-01', to: '2026-10-02' })).rejects.toThrow();
});

test('every ChatGPT scope is denied direct FX refresh before any write or network request', async () => {
  vi.stubEnv('MCP_AUTHORIZATION_SERVER_URL', 'https://connect.example.test');
  try {
    const t = convexTest(schema, modules);
    for (const scope of ['koru.read', 'koru.propose', 'koru.apply']) {
      const connected = t.withIdentity({
        tokenIdentifier: `connect|${scope}`,
        subject: scope,
        issuer: 'https://connect.example.test',
        scope,
      });
      await expect(connected.action(api.fxActions.refresh, { from: '2026-10-01', to: '2026-10-02' })).rejects.toThrow(
        'unavailable through ChatGPT',
      );
    }
    expect(await t.run((ctx) => ctx.db.query('portfolioFxRates').collect())).toEqual([]);
  } finally {
    vi.unstubAllEnvs();
  }
});
