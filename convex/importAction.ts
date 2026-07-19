'use node';

import { createHash } from 'node:crypto';

import { v } from 'convex/values';
import ExcelJS from 'exceljs';
import { parseStrict } from 'ofx-js';

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

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('The OFX file has an unexpected structure.');
  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`The OFX file is missing ${field}.`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

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

export function parseOfx(text: string): { rows: Array<ParsedRow>; summary: ParsedSummary } {
  const parsed = parseStrict(text) as unknown;
  const root = asObject(asObject(parsed).OFX);
  const bankMessages = root.BANKMSGSRSV1 ? asObject(root.BANKMSGSRSV1) : null;
  const cardMessages = root.CREDITCARDMSGSRSV1 ? asObject(root.CREDITCARDMSGSRSV1) : null;
  const statement = bankMessages
    ? asObject(asObject(asObject(bankMessages.STMTTRNRS).STMTRS))
    : asObject(asObject(asObject(cardMessages?.CCSTMTTRNRS).CCSTMTRS));
  const isCard = Boolean(cardMessages);
  const account = asObject(isCard ? statement.CCACCTFROM : statement.BANKACCTFROM);
  const accountId = asString(account.ACCTID, 'account identifier');
  const sourceKey = isCard
    ? `card:${accountId}`
    : `bank:${optionalString(account.BANKID) ?? ''}:${optionalString(account.BRANCHID) ?? ''}:${accountId}`;
  const currency = asString(statement.CURDEF, 'currency').toUpperCase();
  const transactionList = asObject(statement.BANKTRANLIST);
  const rawTransactions = transactionList.STMTTRN;
  const transactions = Array.isArray(rawTransactions) ? rawTransactions : rawTransactions ? [rawTransactions] : [];
  const rows = transactions.map((value, index): ParsedRow => {
    const item = asObject(value);
    const name = optionalString(item.NAME) ?? '';
    const memo = optionalString(item.MEMO) ?? '';
    const rawDescription = [name, memo].filter(Boolean).join(' — ');
    const sourceId = asString(item.FITID, 'FITID');
    const postedDate = normalizeDate(asString(item.DTPOSTED, 'posted date'));
    const amountMinor = toMinorUnits(asString(item.TRNAMT, 'amount'));
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
      transactionType: optionalString(item.TRNTYPE),
      sourceJson,
      ...parseFx(`${name} ${memo}`),
    };
  });
  const ledger = statement.LEDGERBAL ? asObject(statement.LEDGERBAL) : null;
  const available = statement.AVAILBAL ? asObject(statement.AVAILBAL) : null;
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
        : optionalString(account.ACCTTYPE)?.toUpperCase() === 'SAVINGS'
          ? 'savings'
          : 'checking',
      detectedMask: maskAccountIdentifier(accountId),
      detectedSourceKeyHash: sha(sourceKey),
      currency,
      dateFrom: dates[0],
      dateTo: dates.at(-1),
      ledgerMinor: ledger ? toMinorUnits(asString(ledger.BALAMT, 'ledger balance')) : undefined,
      availableMinor: available ? toMinorUnits(asString(available.BALAMT, 'available balance')) : undefined,
      balanceDate: ledger ? normalizeDate(asString(ledger.DTASOF, 'balance date')) : undefined,
    },
  };
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') return value.text;
  if (typeof value === 'object' && 'result' in value) return String(value.result ?? '');
  return String(value);
}

function excelDate(value: ExcelJS.CellValue): string | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = cellText(value).trim();
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

export async function parseXlsx(
  buffer: Uint8Array,
  fileName: string,
): Promise<{ rows: Array<ParsedRow>; summary: ParsedSummary }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
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
