import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const accountType = v.union(
  v.literal('checking'),
  v.literal('savings'),
  v.literal('creditCard'),
  v.literal('cash'),
  v.literal('loan'),
  v.literal('other'),
);

const importStatus = v.union(
  v.literal('uploaded'),
  v.literal('parsing'),
  v.literal('ready'),
  v.literal('committing'),
  v.literal('committed'),
  v.literal('failed'),
  v.literal('rolledBack'),
);

const importFormat = v.union(v.literal('ofx'), v.literal('xlsx'));

export default defineSchema({
  profiles: defineTable({
    tokenIdentifier: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    baseCurrency: v.string(),
    timezone: v.string(),
    weekStartsOn: v.number(),
  }).index('by_tokenIdentifier', ['tokenIdentifier']),

  categoryGroups: defineTable({
    ownerId: v.id('profiles'),
    name: v.string(),
    kind: v.union(v.literal('income'), v.literal('expense')),
    sortOrder: v.number(),
    isSystem: v.boolean(),
    archived: v.boolean(),
  }).index('by_ownerId_and_sortOrder', ['ownerId', 'sortOrder']),

  categories: defineTable({
    ownerId: v.id('profiles'),
    groupId: v.id('categoryGroups'),
    name: v.string(),
    normalizedName: v.string(),
    sortOrder: v.number(),
    isSystem: v.boolean(),
    archived: v.boolean(),
  })
    .index('by_ownerId_and_groupId_and_sortOrder', ['ownerId', 'groupId', 'sortOrder'])
    .index('by_ownerId_and_normalizedName', ['ownerId', 'normalizedName']),

  accounts: defineTable({
    ownerId: v.id('profiles'),
    name: v.string(),
    type: accountType,
    institution: v.optional(v.string()),
    currency: v.string(),
    mask: v.string(),
    sourceKeyHash: v.optional(v.string()),
    archived: v.boolean(),
    currentLedgerMinor: v.optional(v.int64()),
    currentAvailableMinor: v.optional(v.int64()),
    balanceAsOf: v.optional(v.string()),
  })
    .index('by_ownerId_and_archived', ['ownerId', 'archived'])
    .index('by_ownerId_and_sourceKeyHash', ['ownerId', 'sourceKeyHash']),

  balanceSnapshots: defineTable({
    ownerId: v.id('profiles'),
    accountId: v.id('accounts'),
    date: v.string(),
    ledgerMinor: v.int64(),
    availableMinor: v.optional(v.int64()),
    source: v.union(v.literal('import'), v.literal('manual')),
    importId: v.optional(v.id('imports')),
    note: v.optional(v.string()),
    voided: v.boolean(),
  })
    .index('by_ownerId_and_accountId_and_date', ['ownerId', 'accountId', 'date'])
    .index('by_importId', ['importId']),

  imports: defineTable({
    ownerId: v.id('profiles'),
    storageId: v.id('_storage'),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.number(),
    sha256: v.string(),
    format: importFormat,
    status: importStatus,
    accountId: v.optional(v.id('accounts')),
    detectedAccountName: v.optional(v.string()),
    detectedAccountType: v.optional(accountType),
    detectedMask: v.optional(v.string()),
    detectedSourceKeyHash: v.optional(v.string()),
    currency: v.optional(v.string()),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    ledgerMinor: v.optional(v.int64()),
    availableMinor: v.optional(v.int64()),
    balanceDate: v.optional(v.string()),
    totalRows: v.number(),
    readyRows: v.number(),
    pendingRows: v.number(),
    duplicateRows: v.number(),
    possibleDuplicateRows: v.number(),
    invalidRows: v.number(),
    committedRows: v.number(),
    error: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    rolledBackAt: v.optional(v.number()),
  })
    .index('by_ownerId_and_startedAt', ['ownerId', 'startedAt'])
    .index('by_ownerId_and_sha256', ['ownerId', 'sha256']),

  importRows: defineTable({
    ownerId: v.id('profiles'),
    importId: v.id('imports'),
    rowNumber: v.number(),
    status: v.union(
      v.literal('ready'),
      v.literal('pending'),
      v.literal('duplicate'),
      v.literal('possibleDuplicate'),
      v.literal('invalid'),
      v.literal('committed'),
      v.literal('rolledBack'),
    ),
    format: importFormat,
    dedupeKey: v.string(),
    sourceId: v.optional(v.string()),
    postedDate: v.string(),
    processedDate: v.optional(v.string()),
    amountMinor: v.int64(),
    currency: v.string(),
    rawDescription: v.string(),
    normalizedDescription: v.string(),
    transactionType: v.optional(v.string()),
    sourceJson: v.string(),
    balanceMinor: v.optional(v.int64()),
    originalCurrency: v.optional(v.string()),
    originalAmountMinor: v.optional(v.int64()),
    exchangeRate: v.optional(v.string()),
    conversionFeeMinor: v.optional(v.int64()),
    possibleDuplicateId: v.optional(v.id('transactions')),
    transactionId: v.optional(v.id('transactions')),
    error: v.optional(v.string()),
  })
    .index('by_importId_and_rowNumber', ['importId', 'rowNumber'])
    .index('by_importId_and_status', ['importId', 'status'])
    .index('by_ownerId_and_dedupeKey', ['ownerId', 'dedupeKey']),

  counterparties: defineTable({
    ownerId: v.id('profiles'),
    name: v.string(),
    normalizedName: v.string(),
    defaultCategoryId: v.optional(v.id('categories')),
    archived: v.boolean(),
  })
    .index('by_ownerId_and_normalizedName', ['ownerId', 'normalizedName'])
    .index('by_ownerId_and_archived', ['ownerId', 'archived']),

  counterpartyAliases: defineTable({
    ownerId: v.id('profiles'),
    counterpartyId: v.id('counterparties'),
    alias: v.string(),
    normalizedAlias: v.string(),
  })
    .index('by_ownerId_and_normalizedAlias', ['ownerId', 'normalizedAlias'])
    .index('by_counterpartyId', ['counterpartyId']),

  transactions: defineTable({
    ownerId: v.id('profiles'),
    accountId: v.id('accounts'),
    postedDate: v.string(),
    processedDate: v.optional(v.string()),
    amountMinor: v.int64(),
    currency: v.string(),
    rawDescription: v.string(),
    normalizedDescription: v.string(),
    transactionType: v.optional(v.string()),
    counterpartyId: v.optional(v.id('counterparties')),
    categoryId: v.optional(v.id('categories')),
    notes: v.optional(v.string()),
    excluded: v.boolean(),
    voided: v.boolean(),
    reportingKind: v.union(v.literal('standard'), v.literal('transfer'), v.literal('refund')),
    createdByImportId: v.id('imports'),
  })
    .index('by_ownerId_and_postedDate', ['ownerId', 'postedDate'])
    .index('by_ownerId_and_accountId_and_postedDate', ['ownerId', 'accountId', 'postedDate'])
    .index('by_ownerId_and_counterpartyId_and_postedDate', ['ownerId', 'counterpartyId', 'postedDate'])
    .index('by_ownerId_and_categoryId_and_postedDate', ['ownerId', 'categoryId', 'postedDate'])
    .searchIndex('search_description', {
      searchField: 'normalizedDescription',
      filterFields: ['ownerId', 'accountId'],
    }),

  transactionSources: defineTable({
    ownerId: v.id('profiles'),
    transactionId: v.id('transactions'),
    importId: v.id('imports'),
    importRowId: v.id('importRows'),
    format: importFormat,
    sourceId: v.optional(v.string()),
    dedupeKey: v.string(),
    sourceJson: v.string(),
    voided: v.boolean(),
  })
    .index('by_ownerId_and_dedupeKey', ['ownerId', 'dedupeKey'])
    .index('by_transactionId', ['transactionId'])
    .index('by_importId', ['importId']),

  transactionLinks: defineTable({
    ownerId: v.id('profiles'),
    type: v.union(v.literal('transfer'), v.literal('refund')),
    fromTransactionId: v.id('transactions'),
    toTransactionId: v.id('transactions'),
    status: v.union(v.literal('suggested'), v.literal('confirmed'), v.literal('rejected')),
    confidence: v.number(),
    createdBy: v.union(v.literal('system'), v.literal('user')),
  })
    .index('by_ownerId_and_status', ['ownerId', 'status'])
    .index('by_fromTransactionId', ['fromTransactionId'])
    .index('by_toTransactionId', ['toTransactionId']),
});
