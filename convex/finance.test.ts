/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('initializes isolated profiles and seeded categories', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|owner', subject: 'owner', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  const categories = await owner.query(api.finance.listCategories, {});
  expect(categories.map((group) => group.name)).toContain('Housing');
  expect(categories.map((group) => group.name)).toContain('Income');
});

test('prevents another identity from changing an account', async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|owner', subject: 'owner', issuer: 'test' });
  const stranger = t.withIdentity({ tokenIdentifier: 'test|stranger', subject: 'stranger', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  await stranger.mutation(api.profiles.ensureCurrent, {});
  const accountId = await owner.mutation(api.finance.createAccount, {
    name: 'Private account',
    type: 'checking',
    currency: 'NZD',
    mask: '•••• 1234',
  });
  await expect(stranger.mutation(api.finance.updateAccount, { accountId, name: 'Not allowed' })).rejects.toThrow(
    'Record not found',
  );
});
