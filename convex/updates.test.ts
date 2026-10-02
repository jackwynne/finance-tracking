/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
async function fixture() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: 'test|owner', subject: 'owner', issuer: 'test' });
  const other = t.withIdentity({ tokenIdentifier: 'test|other', subject: 'other', issuer: 'test' });
  await owner.mutation(api.profiles.ensureCurrent, {});
  await other.mutation(api.profiles.ensureCurrent, {});
  const profile = await owner.query(api.profiles.current, {});
  if (!profile) throw new Error('Missing profile');
  const accountId = await owner.mutation(api.finance.createAccount, {
    name: 'ANZ',
    type: 'checking',
    currency: 'NZD',
    mask: '1234',
  });
  const secondAccount = await owner.mutation(api.finance.createAccount, {
    name: 'Savings',
    type: 'savings',
    currency: 'NZD',
    mask: '5678',
  });
  const ids = await owner.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(['test']));
    const createdByImportId = await ctx.db.insert('imports', {
      ownerId: profile._id,
      storageId,
      fileName: 'test.ofx',
      size: 4,
      sha256: 'test',
      format: 'ofx',
      status: 'committed',
      totalRows: 2,
      readyRows: 0,
      pendingRows: 0,
      duplicateRows: 0,
      possibleDuplicateRows: 0,
      invalidRows: 0,
      committedRows: 2,
      startedAt: 1,
    });
    const base = {
      ownerId: profile._id,
      postedDate: '2026-10-01',
      currency: 'NZD',
      rawDescription: 'Purchase',
      normalizedDescription: 'purchase',
      excluded: false,
      voided: false,
      reportingKind: 'standard' as const,
      createdByImportId,
    };
    return [
      await ctx.db.insert('transactions', { ...base, accountId, amountMinor: -10000n }),
      await ctx.db.insert('transactions', { ...base, accountId: secondAccount, amountMinor: 10000n }),
    ];
  });
  const context = await owner.query(api.updates.getContext, {});
  const rows = await owner.query(api.updates.exportPage, { paginationOpts: { numItems: 100, cursor: null } });
  const edits = ids.map((id) => {
    const row = rows.page.find((item) => item._id === id);
    if (!row) throw new Error('Missing exported row');
    return { transactionId: id, expectedRevision: row.revision, notes: 'Reviewed' };
  });
  const proposal = {
    version: 1 as const,
    deployment: context.deployment,
    ownerId: context.ownerId,
    clientKey: 'one',
    title: 'Review',
    groups: [{ kind: 'transactions' as const, edits, reason: 'Review purchases' }],
    questions: [],
    sources: ['bank export'],
  };
  return { t, owner, other, ids, proposal };
}
test('staging and applying retries are idempotent and undo restores before state', async () => {
  const { owner, ids, proposal } = await fixture();
  const jobId = await owner.mutation(api.updates.stageJson, { documentJson: JSON.stringify(proposal) });
  expect(await owner.mutation(api.updates.stage, proposal)).toBe(jobId);
  const preview = await owner.query(api.updates.preview, { jobId });
  expect(preview.stale).toBe(false);
  await owner.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash });
  await owner.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash });
  expect(await owner.run((ctx) => ctx.db.get('transactions', ids[0]))).toMatchObject({ notes: 'Reviewed' });
  await owner.mutation(api.updates.undo, { jobId, previewHash: preview.previewHash });
  await owner.mutation(api.updates.undo, { jobId, previewHash: preview.previewHash });
  expect((await owner.run((ctx) => ctx.db.get('transactions', ids[0])))?.notes).toBeUndefined();
});
test('a manual edit rejects the whole job without changing another row', async () => {
  const { owner, ids, proposal } = await fixture();
  const jobId = await owner.mutation(api.updates.stage, proposal);
  const preview = await owner.query(api.updates.preview, { jobId });
  await owner.run((ctx) => ctx.db.patch('transactions', ids[1], { notes: 'Manual edit' }));
  await expect(owner.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash })).rejects.toThrow(
    'changed',
  );
  expect((await owner.run((ctx) => ctx.db.get('transactions', ids[0])))?.notes).toBeUndefined();
});
test('other owners cannot inspect, apply, undo or stage imported owner context', async () => {
  const { owner, other, proposal } = await fixture();
  const jobId = await owner.mutation(api.updates.stage, proposal);
  const preview = await owner.query(api.updates.preview, { jobId });
  await expect(other.query(api.updates.get, { jobId })).rejects.toThrow('not found');
  await expect(other.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash })).rejects.toThrow(
    'not found',
  );
  await expect(other.mutation(api.updates.undo, { jobId, previewHash: preview.previewHash })).rejects.toThrow(
    'not found',
  );
  await expect(other.mutation(api.updates.stage, proposal)).rejects.toThrow('another owner');
});
test('undo protects later edits and malformed JSON proposals are rejected', async () => {
  const { owner, ids, proposal } = await fixture();
  await expect(
    owner.mutation(api.updates.stageJson, { documentJson: '{"version":1,"groups":"bad"}' }),
  ).rejects.toThrow();
  const jobId = await owner.mutation(api.updates.stage, proposal);
  const preview = await owner.query(api.updates.preview, { jobId });
  await owner.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash });
  await owner.run((ctx) => ctx.db.patch('transactions', ids[0], { notes: 'Later edit' }));
  await expect(owner.mutation(api.updates.undo, { jobId, previewHash: preview.previewHash })).rejects.toThrow(
    'changed after',
  );
});
test('transfer groups apply both legs and splits preserve exact minor units', async () => {
  const { owner, ids, proposal } = await fixture();
  const transfer = {
    ...proposal,
    groups: [
      {
        kind: 'transfer' as const,
        reason: 'Own savings transfer',
        edits: proposal.groups[0].edits.map((edit) => ({
          ...edit,
          reportingKind: 'transfer' as const,
          reportingTreatment: 'transfer' as const,
        })),
      },
    ],
  };
  const jobId = await owner.mutation(api.updates.stage, transfer);
  const preview = await owner.query(api.updates.preview, { jobId });
  await owner.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash });
  expect((await owner.run((ctx) => ctx.db.get('transactions', ids[0])))?.reportingKind).toBe('transfer');
  expect((await owner.run((ctx) => ctx.db.get('transactions', ids[1])))?.reportingKind).toBe('transfer');
  await owner.mutation(api.updates.undo, { jobId, previewHash: preview.previewHash });
  const splitProposal = {
    ...proposal,
    clientKey: 'split',
    groups: [
      {
        kind: 'transactions' as const,
        reason: 'Split purchase',
        edits: [
          {
            ...proposal.groups[0].edits[0],
            splits: [
              { amountMinor: '-6000', reportingTreatment: 'expense' as const },
              { amountMinor: '-4000', reportingTreatment: 'investment' as const },
            ],
          },
        ],
      },
    ],
  };
  const splitJob = await owner.mutation(api.updates.stage, splitProposal);
  const splitPreview = await owner.query(api.updates.preview, { jobId: splitJob });
  await owner.mutation(api.updates.apply, { jobId: splitJob, previewHash: splitPreview.previewHash });
  expect(await owner.run((ctx) => ctx.db.query('transactionSplits').collect())).toHaveLength(1);
  await owner.mutation(api.updates.undo, { jobId: splitJob, previewHash: splitPreview.previewHash });
  expect(await owner.run((ctx) => ctx.db.query('transactionSplits').collect())).toHaveLength(0);
});

test('source text and uploaded originals are owner-scoped and references reject foreign evidence', async () => {
  const { owner, other, proposal } = await fixture();
  const sourceId = await owner.mutation(api.updates.registerTextSource, {
    title: 'Monthly email',
    text: 'Bought 10 units on 1 October.',
  });
  expect(
    await owner.mutation(api.updates.registerTextSource, {
      title: 'Same email',
      text: 'Bought 10 units on 1 October.',
    }),
  ).toBe(sourceId);
  expect((await owner.query(api.updates.listSources, {}))[0]).toMatchObject({ _id: sourceId, title: 'Monthly email' });
  await expect(other.query(api.updates.getSourceEvidence, { sourceId })).rejects.toThrow('not found');
  const otherContext = await other.query(api.updates.getContext, {});
  await expect(
    other.mutation(api.updates.stage, {
      ...proposal,
      ownerId: otherContext.ownerId,
      groups: [
        {
          kind: 'portfolioRate',
          expectedRevision: otherContext.emptyRateRevision,
          reason: 'Rate',
          value: { from: 'NZD', to: 'AUD', date: '2026-10-01', rate: '0.9', source: 'test' },
        },
      ],
      sources: ['evidence:' + sourceId],
    }),
  ).rejects.toThrow('not found');
  const uploadedId = await owner.action(api.updates.uploadSource, {
    title: 'Receipt.txt',
    base64: btoa('Receipt evidence'),
    contentType: 'text/plain',
  });
  const uploaded = await owner.query(api.updates.getSourceEvidence, { sourceId: uploadedId });
  expect(uploaded.size).toBe(16);
  expect(uploaded.storageId).toBeTruthy();
  expect(uploaded.sha256).toHaveLength(64);
});

test('MCP direct mutations enforce scopes and app approval for apply and undo', async () => {
  vi.stubEnv('MCP_AUTHORIZATION_SERVER_URL', 'https://mcp.example.test');
  try {
    const { t, owner, ids, proposal } = await fixture();
    const mcp = t.withIdentity({
      tokenIdentifier: 'mcp|client',
      subject: 'client',
      issuer: 'https://mcp.example.test',
      scope: 'koru.read koru.propose koru.apply',
    });
    const readOnly = t.withIdentity({
      tokenIdentifier: 'mcp|readonly',
      subject: 'readonly',
      issuer: 'https://mcp.example.test',
      scope: 'koru.read',
    });
    await owner.run(async (ctx) => {
      await ctx.db.insert('mcpPrincipals', {
        ownerId: proposal.ownerId,
        tokenIdentifier: 'mcp|client',
        enabled: true,
        allowApply: true,
        createdAt: 1,
      });
      await ctx.db.insert('mcpPrincipals', {
        ownerId: proposal.ownerId,
        tokenIdentifier: 'mcp|readonly',
        enabled: true,
        allowApply: false,
        createdAt: 1,
      });
    });
    await expect(readOnly.mutation(api.updates.stage, proposal)).rejects.toThrow('permissions');
    const jobId = await mcp.mutation(api.updates.stage, proposal);
    const preview = await mcp.query(api.updates.preview, { jobId });
    await expect(mcp.mutation(api.updates.review, { jobId, previewHash: preview.previewHash })).rejects.toThrow(
      'permissions',
    );
    await expect(mcp.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash })).rejects.toThrow(
      'approve',
    );
    await owner.mutation(api.updates.review, { jobId, previewHash: preview.previewHash });
    await mcp.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash });
    const undoPreview = await mcp.query(api.updates.prepareUndo, { jobId });
    await expect(
      mcp.mutation(api.updates.undo, { jobId, previewHash: preview.previewHash, undoHash: undoPreview.undoHash }),
    ).rejects.toThrow('approve');
    await expect(mcp.mutation(api.updates.reviewUndo, { jobId, undoHash: undoPreview.undoHash })).rejects.toThrow(
      'permissions',
    );
    await owner.mutation(api.updates.reviewUndo, { jobId, undoHash: undoPreview.undoHash });
    await owner.run((ctx) => ctx.db.patch('transactions', ids[0], { notes: 'A later edit' }));
    await expect(
      mcp.mutation(api.updates.undo, { jobId, previewHash: preview.previewHash, undoHash: undoPreview.undoHash }),
    ).rejects.toThrow('changed');
    await owner.run((ctx) => ctx.db.patch('transactions', ids[0], { notes: 'Reviewed' }));
    await mcp.mutation(api.updates.undo, { jobId, previewHash: preview.previewHash, undoHash: undoPreview.undoHash });
    await mcp.mutation(api.updates.undo, { jobId, previewHash: preview.previewHash, undoHash: undoPreview.undoHash });
    expect((await owner.query(api.updates.get, { jobId })).status).toBe('undone');
  } finally {
    vi.unstubAllEnvs();
  }
});

test('a transfer must explicitly clear an existing split and undo restores it', async () => {
  const { owner, ids, proposal } = await fixture();
  await owner.run((ctx) =>
    ctx.db.insert('transactionSplits', {
      ownerId: proposal.ownerId,
      transactionId: ids[0],
      parts: [{ amountMinor: '-10000', reportingTreatment: 'expense' }],
    }),
  );
  const rows = await owner.query(api.updates.exportPage, { paginationOpts: { numItems: 100, cursor: null } });
  const edits = ids.map((transactionId) => {
    const row = rows.page.find((item) => item._id === transactionId);
    if (!row) throw new Error('Missing row');
    return { transactionId, expectedRevision: row.revision, reportingKind: 'transfer' as const };
  });
  const transfer = { ...proposal, groups: [{ kind: 'transfer' as const, reason: 'Savings transfer', edits }] };
  await expect(owner.mutation(api.updates.stage, transfer)).rejects.toThrow('Clear existing splits');
  const cleared = {
    ...transfer,
    groups: [{ ...transfer.groups[0], edits: edits.map((edit) => ({ ...edit, splits: [] })) }],
  };
  const jobId = await owner.mutation(api.updates.stage, cleared);
  const preview = await owner.query(api.updates.preview, { jobId });
  await owner.mutation(api.updates.apply, { jobId, previewHash: preview.previewHash });
  expect(await owner.run((ctx) => ctx.db.query('transactionSplits').collect())).toHaveLength(0);
  expect(await owner.run((ctx) => ctx.db.query('transactionLinks').collect())).toHaveLength(1);
  await owner.mutation(api.updates.undo, { jobId, previewHash: preview.previewHash });
  expect(await owner.run((ctx) => ctx.db.query('transactionSplits').collect())).toHaveLength(1);
  expect(await owner.run((ctx) => ctx.db.query('transactionLinks').collect())).toHaveLength(0);
});

test('overlapping classification and transfer groups are rejected before any write', async () => {
  const { owner, ids, proposal } = await fixture();
  const transfer = {
    kind: 'transfer' as const,
    reason: 'Own transfer',
    edits: proposal.groups[0].edits.map((edit) => ({ ...edit, reportingKind: 'transfer' as const })),
  };
  await expect(
    owner.mutation(api.updates.stage, { ...proposal, groups: [proposal.groups[0], transfer] }),
  ).rejects.toThrow('only one group');
  expect(await owner.query(api.updates.list, {})).toHaveLength(0);
  expect((await owner.run((ctx) => ctx.db.get('transactions', ids[0])))?.reportingKind).toBe('standard');
});

test('two future rules for the same merchant cannot produce an undo with competing before states', async () => {
  const { owner, proposal } = await fixture();
  const counterpartyId = await owner.run((ctx) =>
    ctx.db.insert('counterparties', {
      ownerId: proposal.ownerId,
      name: 'Market',
      normalizedName: 'market',
      archived: false,
    }),
  );
  const context = await owner.query(api.updates.getContext, {});
  const merchant = context.merchants.find((item) => item._id === counterpartyId);
  if (!merchant) throw new Error('Missing merchant');
  const group = {
    kind: 'merchantRule' as const,
    counterpartyId,
    expectedRevision: merchant.revision,
    categoryId: null,
    reason: 'Future rule',
  };
  await expect(owner.mutation(api.updates.stage, { ...proposal, groups: [group, group] })).rejects.toThrow(
    'only one group',
  );
  expect(await owner.query(api.updates.list, {})).toHaveLength(0);
});
