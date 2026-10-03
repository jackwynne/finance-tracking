'use node';

import { createHash } from 'node:crypto';

import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { normalizeText, toMinorUnits } from './lib/finance';

type InvestmentImportFormat = 'shareRegistryCsv' | 'fundCsv';

type ParsedInvestmentRow = {
  rowNumber: number;
  status: 'ready' | 'invalid';
  format: InvestmentImportFormat;
  dedupeKey: string;
  effectiveDate: string;
  instrumentCode?: string;
  transactionType: string;
  description: string;
  units: string;
  unitPrice?: string;
  amountMinor?: bigint;
  currency: string;
  runningBalanceUnits?: string;
  sourceJson: string;
  error?: string;
};

type ParsedInvestmentSummary = {
  format: InvestmentImportFormat;
  detectedAccountName: string;
  provider: string;
  currency: string;
  sourceKeyHash: string;
  dateFrom?: string;
  dateTo?: string;
};

export type ParsedInvestmentImport = {
  rows: Array<ParsedInvestmentRow>;
  summary: ParsedInvestmentSummary;
};

function sha(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedDecimal(value: string): string {
  const trimmed = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) throw new Error(`“${value}” is not a number.`);
  const negative = trimmed.startsWith('-');
  const unsigned = trimmed.replace(/^[+-]/, '');
  const [rawWhole, rawFraction = ''] = unsigned.split('.');
  const whole = (rawWhole || '0').replace(/^0+(?=\d)/, '');
  const fraction = rawFraction.replace(/0+$/, '');
  const normalized = fraction ? `${whole}.${fraction}` : whole;
  return negative && normalized !== '0' ? `-${normalized}` : normalized;
}

function normalizedDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value.trim());
  if (!match) throw new Error(`“${value}” is not a supported date.`);
  const result = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${result}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== result)
    throw new Error(`“${value}” is not a valid date.`);
  return result;
}

export function parseCsv(text: string): Array<Array<string>> {
  const rows: Array<Array<string>> = [];
  let row: Array<string> = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('The CSV file contains an unterminated quoted field.');
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function recordFromRow(headers: Array<string>, cells: Array<string>): Record<string, string> {
  return Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? '']));
}

// Parse failures can contain any JavaScript rejection value; this boundary extracts only Error messages.
function invalidRow(
  rowNumber: number,
  format: InvestmentImportFormat,
  sourceJson: string,
  // eslint-disable-next-line anti-slop/no-unknown-parameters
  error: unknown,
): ParsedInvestmentRow {
  const message = error instanceof Error ? error.message : 'Invalid investment transaction.';
  return {
    rowNumber,
    status: 'invalid',
    format,
    dedupeKey: sha(`invalid:${format}:${rowNumber}:${sourceJson}`),
    effectiveDate: '1970-01-01',
    transactionType: 'Invalid row',
    description: 'Invalid row',
    units: '0',
    currency: 'NZD',
    sourceJson,
    error: message,
  };
}

function withOccurrences(rows: Array<Omit<ParsedInvestmentRow, 'dedupeKey'>>, sourceKey: string) {
  const occurrences = new Map<string, number>();
  return rows.map((row): ParsedInvestmentRow => {
    if (row.status === 'invalid') {
      return {
        ...row,
        dedupeKey: sha(`invalid:${sourceKey}:${row.rowNumber}:${row.sourceJson}`),
      };
    }
    const signature = [
      sourceKey,
      row.instrumentCode ?? '',
      row.effectiveDate,
      normalizeText(row.transactionType),
      normalizeText(row.description),
      row.units,
      row.unitPrice ?? '',
      row.amountMinor?.toString() ?? '',
      row.currency,
    ].join(':');
    const occurrence = (occurrences.get(signature) ?? 0) + 1;
    occurrences.set(signature, occurrence);
    return { ...row, dedupeKey: sha(`${signature}:${occurrence}`) };
  });
}

function summaryDates(rows: Array<ParsedInvestmentRow>) {
  const dates = rows
    .filter((row) => row.status === 'ready')
    .map((row) => row.effectiveDate)
    .sort();
  return { dateFrom: dates[0], dateTo: dates.at(-1) };
}

function parseShareRegistry(rows: Array<Array<string>>): ParsedInvestmentImport {
  const headerIndex = rows.findIndex((row) => row[0]?.trim() === 'CSN/HRN' && row[1]?.trim() === 'Security Code');
  if (headerIndex < 0) throw new Error('The share registry CSV is missing its transaction header.');
  const headers = rows[headerIndex].map((header) => header.trim());
  const required = ['CSN/HRN', 'Security Code', 'Date', 'Transaction', 'Change', 'Running Balance'];
  for (const header of required) {
    if (!headers.includes(header)) throw new Error(`The share registry CSV is missing the “${header}” column.`);
  }
  const data = rows
    .slice(headerIndex + 1)
    .map((cells, index) => ({ cells, rowNumber: headerIndex + index + 2 }))
    .filter(({ cells }) => cells.some((cell) => cell.trim()));
  const firstRecord = data[0] ? recordFromRow(headers, data[0].cells) : null;
  if (!firstRecord?.['CSN/HRN']) throw new Error('The share registry CSV does not contain any transactions.');
  const holderId = firstRecord['CSN/HRN'];
  const sourceKey = `share-registry:${holderId}`;
  const parsedWithoutKeys = data.map(({ cells, rowNumber }): Omit<ParsedInvestmentRow, 'dedupeKey'> => {
    const raw = recordFromRow(headers, cells);
    const sourceJson = JSON.stringify(raw);
    try {
      if (raw['CSN/HRN'] !== holderId) throw new Error('The file contains more than one holder account.');
      const transactionType = raw.Transaction.trim();
      const instrumentCode = raw['Security Code'].trim().toUpperCase();
      if (!transactionType || !instrumentCode) throw new Error('Transaction type and security code are required.');
      return {
        rowNumber,
        status: 'ready',
        format: 'shareRegistryCsv',
        effectiveDate: normalizedDate(raw.Date),
        instrumentCode,
        transactionType,
        description: transactionType,
        units: normalizedDecimal(raw.Change),
        currency: 'NZD',
        runningBalanceUnits: normalizedDecimal(raw['Running Balance']),
        sourceJson,
      };
    } catch (error) {
      const invalid = invalidRow(rowNumber, 'shareRegistryCsv', sourceJson, error);
      const { dedupeKey: _dedupeKey, ...withoutKey } = invalid;
      return withoutKey;
    }
  });
  const parsedRows = withOccurrences(parsedWithoutKeys, sourceKey);
  const visibleId = holderId.slice(-4).padStart(Math.min(holderId.length, 4), '•');
  return {
    rows: parsedRows,
    summary: {
      format: 'shareRegistryCsv',
      detectedAccountName: `Smartshares •••• ${visibleId}`,
      provider: 'Smartshares',
      currency: 'NZD',
      sourceKeyHash: sha(sourceKey),
      ...summaryDates(parsedRows),
    },
  };
}

function parseFundExport(rows: Array<Array<string>>, fileName: string): ParsedInvestmentImport {
  const headerIndex = rows.findIndex(
    (row) => row[0]?.replace(/^\uFEFF/, '').trim() === 'TransactionSourceType' && row.includes('EffectiveDate'),
  );
  if (headerIndex < 0) throw new Error('The fund CSV is missing its transaction header.');
  const headers = rows[headerIndex].map((header) => header.replace(/^\uFEFF/, '').trim());
  const required = [
    'TransactionSourceType',
    'Units',
    'Price',
    'EffectiveDate',
    'TransactionDisplayName',
    'TransactionTypeDescription',
    'TransactionDescription',
    'Amount',
  ];
  for (const header of required) {
    if (!headers.includes(header)) throw new Error(`The fund CSV is missing the “${header}” column.`);
  }
  const data = rows
    .slice(headerIndex + 1)
    .map((cells, index) => ({ cells, rowNumber: headerIndex + index + 2 }))
    .filter(({ cells }) => cells.some((cell) => cell.trim()));
  if (!data.length) throw new Error('The fund CSV does not contain any transactions.');
  const records = data.map(({ cells, rowNumber }) => ({ raw: recordFromRow(headers, cells), rowNumber }));
  const instrumentCode = headers.includes('InstrumentCode') ? records[0].raw.InstrumentCode.trim() : undefined;
  const fundName = headers.includes('FundName') ? records[0].raw.FundName.trim() : undefined;
  if (headers.includes('InstrumentCode') || headers.includes('FundName')) {
    if (!instrumentCode || !fundName)
      throw new Error('Fund-specific exports require both InstrumentCode and FundName.');
    if (records.some(({ raw }) => raw.InstrumentCode.trim() !== instrumentCode || raw.FundName.trim() !== fundName))
      throw new Error('Import each fund separately with the same InstrumentCode and FundName on every row.');
  }
  const accountIdentifier = records
    .filter(({ raw }) => raw.TransactionDescription.includes('|'))
    .map(({ raw }) => raw.TransactionDescription.split('|')[0]?.trim())
    .find(Boolean);
  const stableFallback = fileName
    .replace(/\.csv$/i, '')
    .trim()
    .toLowerCase();
  if (instrumentCode && !accountIdentifier)
    throw new Error('Fund-specific exports require a member identifier in TransactionDescription.');
  const sourceKey = `fund-export:${accountIdentifier || stableFallback || 'default'}${instrumentCode ? `:instrument:${instrumentCode}` : ''}`;
  const parsedWithoutKeys = records.map(({ raw, rowNumber }): Omit<ParsedInvestmentRow, 'dedupeKey'> => {
    const sourceJson = JSON.stringify(raw);
    try {
      const displayName = raw.TransactionDisplayName.trim();
      const typeCode = raw.TransactionTypeDescription.trim();
      if (!displayName && !typeCode) throw new Error('Transaction type is required.');
      const detail = raw.TransactionDescription.includes('|')
        ? raw.TransactionDescription.split('|').slice(1).join('|').trim()
        : instrumentCode
          ? raw.TransactionDescription.trim()
          : '';
      return {
        rowNumber,
        status: 'ready',
        format: 'fundCsv',
        effectiveDate: normalizedDate(raw.EffectiveDate),
        instrumentCode,
        transactionType: displayName || typeCode,
        description: [displayName, typeCode, detail].filter(Boolean).join(' · '),
        units: normalizedDecimal(raw.Units),
        unitPrice: normalizedDecimal(raw.Price),
        amountMinor: toMinorUnits(normalizedDecimal(raw.Amount)),
        currency: 'NZD',
        sourceJson,
      };
    } catch (error) {
      const invalid = invalidRow(rowNumber, 'fundCsv', sourceJson, error);
      const { dedupeKey: _dedupeKey, ...withoutKey } = invalid;
      return withoutKey;
    }
  });
  const parsedRows = withOccurrences(parsedWithoutKeys, sourceKey);
  const suffix = accountIdentifier ? accountIdentifier.slice(-4) : '';
  return {
    rows: parsedRows,
    summary: {
      format: 'fundCsv',
      detectedAccountName: fundName
        ? `${fundName} •••• ${suffix}`
        : suffix
          ? `Managed fund •••• ${suffix}`
          : 'Managed fund',
      provider: 'Managed fund',
      currency: 'NZD',
      sourceKeyHash: sha(sourceKey),
      ...summaryDates(parsedRows),
    },
  };
}

function parseHostplusExport(rows: Array<Array<string>>): ParsedInvestmentImport {
  const headerIndex = rows.findIndex((row) => row[0]?.trim() === 'Received' && row[1]?.trim() === 'Transaction Type');
  const headers = rows[headerIndex].map((header) => header.trim());
  for (const header of ['Transaction ID', 'Total ($)']) {
    if (!headers.includes(header)) throw new Error(`The Hostplus CSV is missing the "${header}" column.`);
  }
  const data = rows
    .slice(headerIndex + 1)
    .map((cells, index) => ({ cells, rowNumber: headerIndex + index + 2 }))
    .filter(({ cells }) => cells.slice(0, 12).some((cell) => cell.trim()));
  if (!data.length) throw new Error('The Hostplus CSV does not contain any transactions.');
  const parsedRows = data.map(({ cells, rowNumber }): ParsedInvestmentRow => {
    const raw = recordFromRow(headers.slice(0, 12), cells);
    const sourceJson = JSON.stringify({ ...raw, cells });
    try {
      const sourceType = raw['Transaction Type'];
      const transactionType =
        / contribution$/i.test(sourceType) &&
        /^\d{2}\/\d{2}\/\d{4} - \d{2}\/\d{2}\/\d{4}$/.test(raw['Payment period'] ?? '')
          ? 'Employer Contribution'
          : sourceType;
      const transactionId = raw['Transaction ID'];
      if (!transactionType || !transactionId) throw new Error('Transaction type and transaction ID are required.');
      const dateParts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.Received);
      if (!dateParts) throw new Error('Hostplus dates must use DD/MM/YYYY.');
      const effectiveDate = normalizedDate(`${dateParts[3]}-${dateParts[2]}-${dateParts[1]}`);
      const amountMinor = toMinorUnits(normalizedDecimal(raw['Total ($)'].replace(/,/g, '')));
      // Some exports include calculated units and a price in the two unnamed columns after Total ($).
      const suppliedPrice = cells[12]?.trim();
      const suppliedUnits = cells[13]?.trim();
      const units = suppliedUnits ? normalizedDecimal(suppliedUnits) : '0';
      const unitPrice = suppliedPrice ? normalizedDecimal(suppliedPrice) : undefined;
      if (unitPrice && unitPrice.startsWith('-')) throw new Error('The unit price must be positive.');
      if (unitPrice === '0') throw new Error('The unit price must be positive.');
      if (
        suppliedUnits &&
        ((amountMinor < 0n && !units.startsWith('-')) || (amountMinor > 0n && units.startsWith('-')))
      )
        throw new Error('The units and cash amount have different signs.');
      return {
        rowNumber,
        status: 'ready',
        format: 'fundCsv',
        dedupeKey: sha(
          ['hostplus', transactionId, normalizeText(sourceType), effectiveDate, amountMinor.toString()].join(':'),
        ),
        effectiveDate,
        transactionType,
        description: suppliedUnits ? sourceType : `${sourceType} · Units not supplied`,
        units,
        unitPrice,
        amountMinor,
        currency: 'AUD',
        sourceJson,
      };
    } catch (error) {
      return { ...invalidRow(rowNumber, 'fundCsv', sourceJson, error), currency: 'AUD' };
    }
  });
  return {
    rows: parsedRows,
    summary: {
      format: 'fundCsv',
      detectedAccountName: 'Hostplus',
      provider: 'Hostplus',
      currency: 'AUD',
      sourceKeyHash: sha('hostplus:unidentified-member'),
      ...summaryDates(parsedRows),
    },
  };
}

export function parseInvestmentCsv(text: string, fileName: string): ParsedInvestmentImport {
  const rows = parseCsv(text);
  if (rows.some((row) => row[0]?.trim() === 'CSN/HRN' && row[1]?.trim() === 'Security Code'))
    return parseShareRegistry(rows);
  if (
    rows.some(
      (row) => row[0]?.replace(/^\uFEFF/, '').trim() === 'TransactionSourceType' && row.includes('EffectiveDate'),
    )
  )
    return parseFundExport(rows, fileName);
  if (rows.some((row) => row[0]?.trim() === 'Received' && row[1]?.trim() === 'Transaction Type'))
    return parseHostplusExport(rows);
  throw new Error('This CSV does not match a supported Smart, Simplicity or Hostplus transaction export.');
}

export const parse = internalAction({
  args: { importId: v.id('investmentImports') },
  handler: async (ctx, args) => {
    const importJob = await ctx.runQuery(internal.investmentImports.getForParsing, { importId: args.importId });
    if (!importJob) return null;
    await ctx.runMutation(internal.investmentImports.beginParsing, { importId: importJob._id });
    try {
      const blob = await ctx.storage.get(importJob.storageId);
      if (!blob) throw new Error('The uploaded file is no longer available.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const parsed = parseInvestmentCsv(new TextDecoder('utf-8').decode(bytes), importJob.fileName);
      if (parsed.rows.length > 4_000) throw new Error('Imports are limited to 4,000 investment transactions.');
      for (let index = 0; index < parsed.rows.length; index += 40) {
        await ctx.runMutation(internal.investmentImports.stageBatch, {
          importId: importJob._id,
          rows: parsed.rows.slice(index, index + 40),
        });
      }
      await ctx.runMutation(internal.investmentImports.finishParsing, {
        importId: importJob._id,
        summary: parsed.summary,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown investment parsing error.';
      await ctx.runMutation(internal.investmentImports.failParsing, { importId: importJob._id, error: message });
    }
    return null;
  },
});
