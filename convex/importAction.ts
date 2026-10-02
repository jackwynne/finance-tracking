'use node';

import { createHash } from 'node:crypto';

import { v } from 'convex/values';
import ExcelJS from 'exceljs';
import { parseStrict } from 'ofx-js';
import { z } from 'zod';

import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { maskAccountIdentifier, normalizeDate, normalizeText, toMinorUnits } from './lib/finance';

type ParsedRow = {
  rowNumber: number;
  status: 'ready' | 'pending' | 'invalid';
  format: 'ofx' | 'xlsx';
  dedupeKey: string;
  sourceId?: string;
  postedDate: string;
  processedDate?: string;
  amountMinor: bigint;
  currency: string;
  rawDescription: string;
  normalizedDescription: string;
  transactionType?: string;
  sourceJson: string;
  balanceMinor?: bigint;
  originalCurrency?: string;
  originalAmountMinor?: bigint;
  exchangeRate?: string;
  conversionFeeMinor?: bigint;
  error?: string;
};

type ParsedSummary = {
  detectedAccountName: string;
  detectedAccountType: 'checking' | 'savings' | 'creditCard' | 'cash' | 'loan' | 'other';
  detectedMask: string;
  detectedSourceKeyHash: string;
  currency: string;
  dateFrom?: string;
  dateTo?: string;
  ledgerMinor?: bigint;
  availableMinor?: bigint;
  balanceDate?: string;
};

function sha(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

const optionalOfxText = z.string().optional().catch(undefined);
const ofxBalanceSchema = z.object({ BALAMT: z.string(), DTASOF: z.string() });
const ofxAccountSchema = z.object({
  ACCTID: z.string(),
  BANKID: optionalOfxText,
  BRANCHID: optionalOfxText,
  ACCTTYPE: optionalOfxText,
});
const ofxTransactionSchema = z
  .object({
    FITID: z.string(),
    DTPOSTED: z.string(),
    TRNAMT: z.string(),
    NAME: optionalOfxText,
    MEMO: optionalOfxText,
    TRNTYPE: optionalOfxText,
  })
  .passthrough();
const ofxStatementSchema = z.object({
  CURDEF: z.string(),
  BANKACCTFROM: ofxAccountSchema.optional(),
  CCACCTFROM: ofxAccountSchema.optional(),
  BANKTRANLIST: z.object({ STMTTRN: z.union([ofxTransactionSchema, z.array(ofxTransactionSchema)]).optional() }),
  LEDGERBAL: ofxBalanceSchema.optional(),
  AVAILBAL: ofxBalanceSchema.optional(),
});
const ofxDocumentSchema = z.object({
  OFX: z.object({
    BANKMSGSRSV1: z.object({ STMTTRNRS: z.object({ STMTRS: ofxStatementSchema }) }).optional(),
    CREDITCARDMSGSRSV1: z.object({ CCSTMTTRNRS: z.object({ CCSTMTRS: ofxStatementSchema }) }).optional(),
  }),
});

type ParsedBankImport = { rows: Array<ParsedRow>; summary: ParsedSummary };

function parseFx(text: string) {
  const amount = /FXAmnt=([\d.]+)/i.exec(text)?.[1] ?? /([A-Z]{3})\s+([\d.]+)\s+converted/i.exec(text)?.[2];
  const currency = /FXCurr=([A-Z]{3})/i.exec(text)?.[1] ?? /([A-Z]{3})\s+[\d.]+\s+converted/i.exec(text)?.[1];
  const rate = /FXRate=([\d.]+)/i.exec(text)?.[1] ?? /converted at\s+([\d.]+)/i.exec(text)?.[1];
  const fee = /conversion charge of \$([\d.]+)/i.exec(text)?.[1];
  return {
    originalCurrency: currency,
    originalAmountMinor: amount ? toMinorUnits(amount) : undefined,
    exchangeRate: rate,
    conversionFeeMinor: fee ? toMinorUnits(fee) : undefined,
  };
}

export function parseOfx(text: string): ParsedBankImport {
  const root = ofxDocumentSchema.parse(parseStrict(text)).OFX;
  const isCard = Boolean(root.CREDITCARDMSGSRSV1);
  const statement = root.BANKMSGSRSV1?.STMTTRNRS.STMTRS ?? root.CREDITCARDMSGSRSV1?.CCSTMTTRNRS.CCSTMTRS;
  if (!statement) throw new Error('The OFX file does not contain a bank or credit-card statement.');
  const account = isCard ? statement.CCACCTFROM : statement.BANKACCTFROM;
  if (!account) throw new Error('The OFX file is missing its account identifier.');
  const accountId = account.ACCTID.trim();
  const sourceKey = isCard
    ? `card:${accountId}`
    : `bank:${account.BANKID?.trim() ?? ''}:${account.BRANCHID?.trim() ?? ''}:${accountId}`;
  const currency = statement.CURDEF.trim().toUpperCase();
  const rawTransactions = statement.BANKTRANLIST.STMTTRN;
  const transactions = Array.isArray(rawTransactions) ? rawTransactions : rawTransactions ? [rawTransactions] : [];
  const rows = transactions.map((value, index): ParsedRow => {
    const item = value;
    const name = item.NAME?.trim() ?? '';
    const memo = item.MEMO?.trim() ?? '';
    const rawDescription = [name, memo].filter(Boolean).join(' — ');
    const sourceId = item.FITID.trim();
    const postedDate = normalizeDate(item.DTPOSTED.trim());
    const amountMinor = toMinorUnits(item.TRNAMT.trim());
    const status = /\bpending\b/i.test(rawDescription) ? 'pending' : 'ready';
    const sourceJson = JSON.stringify(item);
    return {
      rowNumber: index + 1,
      status,
      format: 'ofx',
      dedupeKey: sha(`${sourceKey}:ofx:${sourceId}`),
      sourceId,
      postedDate,
      amountMinor,
      currency,
      rawDescription,
      normalizedDescription: normalizeText(rawDescription),
      transactionType: item.TRNTYPE?.trim() || undefined,
      sourceJson,
      ...parseFx(`${name} ${memo}`),
    };
  });
  const ledger = statement.LEDGERBAL;
  const available = statement.AVAILBAL;
  const dates = rows
    .filter((row) => row.status === 'ready')
    .map((row) => row.postedDate)
    .sort();
  return {
    rows,
    summary: {
      detectedAccountName: isCard ? `Credit card ${accountId.slice(-4)}` : `Everyday account ${accountId.slice(-4)}`,
      detectedAccountType: isCard
        ? 'creditCard'
        : account.ACCTTYPE?.trim().toUpperCase() === 'SAVINGS'
          ? 'savings'
          : 'checking',
      detectedMask: maskAccountIdentifier(accountId),
      detectedSourceKeyHash: sha(sourceKey),
      currency,
      dateFrom: dates[0],
      dateTo: dates.at(-1),
      ledgerMinor: ledger ? toMinorUnits(ledger.BALAMT.trim()) : undefined,
      availableMinor: available ? toMinorUnits(available.BALAMT.trim()) : undefined,
      balanceDate: ledger ? normalizeDate(ledger.DTASOF.trim()) : undefined,
    },
  };
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  const textCell = z.object({ text: z.string() }).safeParse(value);
  if (textCell.success) return textCell.data.text;
  const formulaCell = z
    .object({ result: z.union([z.string(), z.number(), z.boolean(), z.date(), z.null()]).optional() })
    .safeParse(value);
  if (formulaCell.success && value instanceof Object && 'result' in value) return String(formulaCell.data.result ?? '');
  return String(value);
}

function excelDate(value: ExcelJS.CellValue): string | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = cellText(value).trim();
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

export async function parseXlsx(buffer: Uint8Array, fileName: string): Promise<ParsedBankImport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(buffer).buffer);
  if (workbook.worksheets.length === 0) throw new Error('The workbook does not contain a Transactions worksheet.');
  const sheet = workbook.getWorksheet('Transactions') ?? workbook.worksheets[0];
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => headers.set(cellText(cell.value).trim(), column));
  for (const required of ['Transaction Date', 'Processed Date', 'Details', 'Amount']) {
    if (!headers.has(required)) throw new Error(`The workbook is missing the “${required}” column.`);
  }
  const isCard = headers.has('Card');
  const fileAccount = fileName.split('_')[0] ?? fileName;
  const sourceKey = `${isCard ? 'card' : 'bank'}:${fileAccount}`;
  const signatureCounts = new Map<string, number>();
  const rows: Array<ParsedRow> = [];
  let latestBalance: { amount: bigint; date: string } | undefined;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw: Record<string, string> = {};
    for (const [header, column] of headers) raw[header] = cellText(row.getCell(column).value).trim();
    if (!raw['Transaction Date'] && !raw.Amount && !raw.Details) return;
    const transactionDate = excelDate(row.getCell(headers.get('Transaction Date')!).value);
    const processedDate = excelDate(row.getCell(headers.get('Processed Date')!).value);
    const amountText = raw.Amount;
    if (!transactionDate || !amountText || !Number.isFinite(Number(amountText))) {
      rows.push({
        rowNumber,
        status: 'invalid',
        format: 'xlsx',
        dedupeKey: sha(`${sourceKey}:invalid:${rowNumber}`),
        postedDate: transactionDate ?? '1970-01-01',
        amountMinor: 0n,
        currency: 'NZD',
        rawDescription: raw.Details || 'Invalid row',
        normalizedDescription: normalizeText(raw.Details || 'Invalid row'),
        sourceJson: JSON.stringify(raw),
        error: 'Missing or invalid transaction date/amount.',
      });
      return;
    }
    const description = [raw.Details, raw.Particulars, raw.Code, raw.Reference].filter(Boolean).join(' — ');
    const pending = !processedDate || /\bpending\b/i.test(description) || /^visa hold$/i.test(raw.Type);
    const sourceJson = JSON.stringify(raw);
    const baseSignature = sha(`${sourceKey}:xlsx:${sourceJson}`);
    const occurrence = (signatureCounts.get(baseSignature) ?? 0) + 1;
    signatureCounts.set(baseSignature, occurrence);
    const balanceMinor = raw.Balance && Number.isFinite(Number(raw.Balance)) ? toMinorUnits(raw.Balance) : undefined;
    if (!pending && balanceMinor !== undefined && (!latestBalance || transactionDate > latestBalance.date))
      latestBalance = { amount: balanceMinor, date: transactionDate };
    rows.push({
      rowNumber,
      status: pending ? 'pending' : 'ready',
      format: 'xlsx',
      dedupeKey: sha(`${baseSignature}:${occurrence}`),
      postedDate: transactionDate,
      processedDate,
      amountMinor: toMinorUnits(amountText),
      currency: 'NZD',
      rawDescription: description || raw.Details,
      normalizedDescription: normalizeText(description || raw.Details),
      transactionType: raw.Type || undefined,
      sourceJson,
      balanceMinor,
      ...parseFx(`${raw['Conversion Charge'] ?? ''} ${raw['Foreign Currency Amount'] ?? ''}`),
    });
  });
  const dates = rows
    .filter((row) => row.status === 'ready')
    .map((row) => row.postedDate)
    .sort();
  return {
    rows,
    summary: {
      detectedAccountName: isCard
        ? `Credit card ${fileAccount.slice(-4)}`
        : `Everyday account ${fileAccount.slice(-4)}`,
      detectedAccountType: isCard ? 'creditCard' : 'checking',
      detectedMask: maskAccountIdentifier(fileAccount),
      detectedSourceKeyHash: sha(sourceKey),
      currency: 'NZD',
      dateFrom: dates[0],
      dateTo: dates.at(-1),
      ledgerMinor: latestBalance?.amount,
      balanceDate: latestBalance?.date,
    },
  };
}

export const parse = internalAction({
  args: { importId: v.id('imports') },
  handler: async (ctx, args) => {
    const importJob = await ctx.runQuery(internal.imports.getForParsing, { importId: args.importId });
    if (!importJob) return null;
    await ctx.runMutation(internal.imports.beginParsing, { importId: importJob._id });
    try {
      const blob = await ctx.storage.get(importJob.storageId);
      if (!blob) throw new Error('The uploaded file is no longer available.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const parsed =
        importJob.format === 'ofx'
          ? parseOfx(new TextDecoder('windows-1252').decode(bytes))
          : await parseXlsx(bytes, importJob.fileName);
      if (parsed.rows.length > 4_000) throw new Error('Imports are limited to 4,000 transaction rows.');
      for (let index = 0; index < parsed.rows.length; index += 40) {
        await ctx.runMutation(internal.imports.stageBatch, {
          importId: importJob._id,
          rows: parsed.rows.slice(index, index + 40),
        });
      }
      await ctx.runMutation(internal.imports.finishParsing, { importId: importJob._id, summary: parsed.summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown parsing error.';
      await ctx.runMutation(internal.imports.failParsing, { importId: importJob._id, error: message });
    }
    return null;
  },
});
