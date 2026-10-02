import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const connectionTables = {
  akahuConnections: defineTable({
    ownerId: v.id('profiles'),
    status: v.union(v.literal('connected'), v.literal('disconnected')),
    eligibilityConfirmedAt: v.number(),
    lastAttemptAt: v.optional(v.number()),
    lastBankRefreshAt: v.optional(v.number()),
    lastSuccessfulSyncAt: v.optional(v.number()),
    activeRunId: v.optional(v.id('akahuSyncRuns')),
    error: v.optional(v.string()),
  }).index('by_ownerId', ['ownerId']),
  akahuAccounts: defineTable({
    ownerId: v.id('profiles'),
    providerAccountId: v.string(),
    name: v.string(),
    mask: v.string(),
    currency: v.string(),
    status: v.string(),
    accountId: v.optional(v.id('accounts')),
    refreshedAt: v.optional(v.string()),
  }).index('by_ownerId_and_providerAccountId', ['ownerId', 'providerAccountId']),
  akahuSyncRuns: defineTable({
    ownerId: v.id('profiles'),
    status: v.union(v.literal('running'), v.literal('complete'), v.literal('failed')),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    rowsSeen: v.number(),
    rowsCreated: v.number(),
    possibleDuplicates: v.number(),
  }).index('by_ownerId_and_startedAt', ['ownerId', 'startedAt']),
  akahuEvidence: defineTable({
    ownerId: v.id('profiles'),
    accountId: v.id('accounts'),
    providerTransactionId: v.string(),
    transactionId: v.optional(v.id('transactions')),
    postedDate: v.string(),
    amountMinor: v.int64(),
    currency: v.string(),
    description: v.string(),
    normalizedDescription: v.string(),
    sourceJson: v.string(),
    state: v.union(v.literal('active'), v.literal('possibleDuplicate'), v.literal('missing')),
    lastSeenRunId: v.id('akahuSyncRuns'),
  })
    .index('by_ownerId_and_providerTransactionId', ['ownerId', 'providerTransactionId'])
    .index('by_ownerId_and_state', ['ownerId', 'state'])
    .index('by_accountId_and_postedDate', ['accountId', 'postedDate'])
    .index('by_transactionId', ['transactionId']),
  mcpPrincipals: defineTable({
    ownerId: v.id('profiles'),
    tokenIdentifier: v.string(),
    enabled: v.boolean(),
    allowApply: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_tokenIdentifier', ['tokenIdentifier'])
    .index('by_ownerId', ['ownerId']),
};
