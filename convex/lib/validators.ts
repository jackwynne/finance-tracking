import { v } from 'convex/values';

export const parsedImportRowValidator = v.object({
  rowNumber: v.number(),
  status: v.union(v.literal('ready'), v.literal('pending'), v.literal('invalid')),
  format: v.union(v.literal('ofx'), v.literal('xlsx')),
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
  error: v.optional(v.string()),
});

export const parsedSummaryValidator = v.object({
  detectedAccountName: v.string(),
  detectedAccountType: v.union(
    v.literal('checking'),
    v.literal('savings'),
    v.literal('creditCard'),
    v.literal('cash'),
    v.literal('loan'),
    v.literal('other'),
  ),
  detectedMask: v.string(),
  detectedSourceKeyHash: v.string(),
  currency: v.string(),
  dateFrom: v.optional(v.string()),
  dateTo: v.optional(v.string()),
  ledgerMinor: v.optional(v.int64()),
  availableMinor: v.optional(v.int64()),
  balanceDate: v.optional(v.string()),
});
