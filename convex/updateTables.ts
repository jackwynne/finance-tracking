import { defineTable } from 'convex/server';
import { v } from 'convex/values';

import { portfolioGroup, portfolioRestore } from './lib/updatePortfolio';

export const reportingTreatment = v.union(
  ...(['expense', 'income', 'investment', 'debtPrincipal', 'refund', 'transfer'] as const).map((value) =>
    v.literal(value),
  ),
);
export const splitPart = v.object({
  categoryId: v.optional(v.id('categories')),
  amountMinor: v.string(),
  reportingTreatment,
});
export const transactionEdit = v.object({
  transactionId: v.id('transactions'),
  expectedRevision: v.string(),
  categoryId: v.optional(v.union(v.id('categories'), v.null())),
  reportingKind: v.optional(v.union(v.literal('standard'), v.literal('transfer'), v.literal('refund'))),
  excluded: v.optional(v.boolean()),
  reportingTreatment: v.optional(reportingTreatment),
  splits: v.optional(v.array(splitPart)),
  notes: v.optional(v.string()),
});
export const transactionUpdateGroup = v.union(
  v.object({ kind: v.literal('transactions'), edits: v.array(transactionEdit), reason: v.string() }),
  v.object({ kind: v.literal('transfer'), edits: v.array(transactionEdit), reason: v.string() }),
  v.object({
    kind: v.literal('merchantRule'),
    counterpartyId: v.id('counterparties'),
    expectedRevision: v.string(),
    categoryId: v.union(v.id('categories'), v.null()),
    reason: v.string(),
  }),
);
export const updateGroup = v.union(transactionUpdateGroup, portfolioGroup);
export const updateTables = {
  updateEvidence: defineTable({
    ownerId: v.id('profiles'),
    title: v.string(),
    text: v.optional(v.string()),
    storageId: v.optional(v.id('_storage')),
    sha256: v.string(),
    size: v.number(),
    createdAt: v.number(),
  })
    .index('by_ownerId_and_sha256', ['ownerId', 'sha256'])
    .index('by_ownerId_and_createdAt', ['ownerId', 'createdAt']),
  transactionSplits: defineTable({
    ownerId: v.id('profiles'),
    transactionId: v.id('transactions'),
    parts: v.array(splitPart),
  })
    .index('by_transactionId', ['transactionId'])
    .index('by_ownerId', ['ownerId']),
  updateJobs: defineTable({
    ownerId: v.id('profiles'),
    deployment: v.string(),
    clientKey: v.string(),
    proposalHash: v.string(),
    title: v.string(),
    groups: v.array(updateGroup),
    questions: v.array(v.string()),
    sources: v.array(v.string()),
    status: v.union(v.literal('staged'), v.literal('applied'), v.literal('undone')),
    previewHash: v.string(),
    beforeJson: v.string(),
    restoreTransactions: v.array(
      v.object({
        transactionId: v.id('transactions'),
        description: v.string(),
        postedDate: v.string(),
        currency: v.string(),
        amountMinor: v.string(),
        accountId: v.id('accounts'),
        categoryId: v.optional(v.id('categories')),
        categoryProvenance: v.optional(
          v.union(v.literal('manual'), v.literal('merchant'), v.literal('import'), v.literal('assistant')),
        ),
        reportingTreatment: v.optional(reportingTreatment),
        reportingKind: v.union(v.literal('standard'), v.literal('transfer'), v.literal('refund')),
        excluded: v.boolean(),
        notes: v.optional(v.string()),
      }),
    ),
    restoreMerchants: v.array(
      v.object({
        counterpartyId: v.id('counterparties'),
        name: v.string(),
        defaultCategoryId: v.optional(v.id('categories')),
      }),
    ),
    portfolioReceipt: v.optional(v.array(portfolioRestore)),
    createdLinks: v.optional(v.array(v.object({ id: v.id('transactionLinks'), revision: v.string() }))),
    restoreSplits: v.array(v.object({ transactionId: v.id('transactions'), parts: v.array(splitPart) })),
    afterJson: v.optional(v.string()),
    createdAt: v.number(),
    reviewedHash: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    reviewedUndoHash: v.optional(v.string()),
    reviewedUndoAt: v.optional(v.number()),
    appliedAt: v.optional(v.number()),
    undoneAt: v.optional(v.number()),
  })
    .index('by_ownerId_and_clientKey', ['ownerId', 'clientKey'])
    .index('by_ownerId_and_createdAt', ['ownerId', 'createdAt']),
};
