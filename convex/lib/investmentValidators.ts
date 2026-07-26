import { v } from 'convex/values';

export const investmentImportFormatValidator = v.union(v.literal('shareRegistryCsv'), v.literal('fundCsv'));

export const parsedInvestmentRowValidator = v.object({
  rowNumber: v.number(),
  status: v.union(v.literal('ready'), v.literal('invalid')),
  format: investmentImportFormatValidator,
  dedupeKey: v.string(),
  effectiveDate: v.string(),
  instrumentCode: v.optional(v.string()),
  transactionType: v.string(),
  description: v.string(),
  units: v.string(),
  unitPrice: v.optional(v.string()),
  amountMinor: v.optional(v.int64()),
  currency: v.string(),
  runningBalanceUnits: v.optional(v.string()),
  sourceJson: v.string(),
  error: v.optional(v.string()),
});

export const parsedInvestmentSummaryValidator = v.object({
  format: investmentImportFormatValidator,
  detectedAccountName: v.string(),
  provider: v.string(),
  currency: v.string(),
  sourceKeyHash: v.string(),
  dateFrom: v.optional(v.string()),
  dateTo: v.optional(v.string()),
});
