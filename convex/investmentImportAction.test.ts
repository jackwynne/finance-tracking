import { existsSync, readFileSync } from 'node:fs';

// @vitest-environment node
import { expect, test } from 'vitest';

import { parseInvestmentCsv } from './investmentImportAction';

const registryExport = `View name:,"SMRT, 335563425 (EXAMPLE HOLDER)"
Security Code:,ALL
Start date:,01/07/2014
End date:,26/07/2026

CSN/HRN,Security Code,Date,Transaction,Change,Running Balance
335563425,EUF,2026-07-03,Regular Savings Plan,161.0,2325.0
335563425,EUF,2026-06-19,Dividend Plan Allotment,15.0,2164.0
`;

const fundExport = `\uFEFF"TransactionSourceType","Units","Price","EffectiveDate","TransactionDisplayName","TransactionTypeDescription","TransactionDescription","Value","Amount","type"
"IRD",316.0356,1.5952,"2026-07-20T00:00:00","Employee Contributions","APP","115133144|EXAMPLE EMPLOYER",504.14,504.14,"default"
"Provider",-340.5606,1.4307,"2026-03-31T00:00:00","Withdrawal","ATT","Tax Attribution 31/03/2026",-487.24,-487.24,"default"
`;

test('parses share registry activity as units with an instrument code', () => {
  const parsed = parseInvestmentCsv(registryExport, 'share-history.csv');
  expect(parsed.summary).toMatchObject({
    format: 'shareRegistryCsv',
    provider: 'Smartshares',
    dateFrom: '2026-06-19',
    dateTo: '2026-07-03',
  });
  expect(parsed.rows[0]).toMatchObject({
    status: 'ready',
    instrumentCode: 'EUF',
    effectiveDate: '2026-07-03',
    units: '161',
    runningBalanceUnits: '2325',
  });
});

test('parses fund activity with fractional units, prices, and cash values', () => {
  const parsed = parseInvestmentCsv(fundExport, 'transaction-export.csv');
  expect(parsed.summary).toMatchObject({
    format: 'fundCsv',
    dateFrom: '2026-03-31',
    dateTo: '2026-07-20',
  });
  expect(parsed.rows[0]).toMatchObject({
    transactionType: 'Employee Contributions',
    units: '316.0356',
    unitPrice: '1.5952',
    amountMinor: 50414n,
  });
  expect(parsed.rows[1]).toMatchObject({
    transactionType: 'Withdrawal',
    units: '-340.5606',
    amountMinor: -48724n,
  });
});

test('generates stable dedupe keys while preserving genuinely repeated rows', () => {
  const first = parseInvestmentCsv(fundExport, 'transaction-export.csv');
  const second = parseInvestmentCsv(fundExport, 'renamed-export.csv');
  expect(second.rows.map((row) => row.dedupeKey)).toEqual(first.rows.map((row) => row.dedupeKey));

  const repeated = parseInvestmentCsv(`${fundExport}${fundExport.split('\n')[1]}\n`, 'transaction-export.csv');
  expect(repeated.rows[2].dedupeKey).not.toBe(repeated.rows[0].dedupeKey);
});

const realRegistryExport =
  'temp/invest/Transaction History_SMRT_ 335563425 (JACK MICHAEL WESTBURY WYNNE)_26-Jul-2026.csv';
const realFundExport = 'temp/invest/transaction-export.csv';

test.skipIf(!existsSync(realRegistryExport) || !existsSync(realFundExport))(
  'parses both supplied investment exports without invalid rows',
  () => {
    const registry = parseInvestmentCsv(readFileSync(realRegistryExport, 'utf8'), realRegistryExport);
    const fund = parseInvestmentCsv(readFileSync(realFundExport, 'utf8'), realFundExport);
    expect(registry.rows.length).toBeGreaterThan(250);
    expect(fund.rows.length).toBeGreaterThan(50);
    expect(registry.rows.filter((row) => row.status === 'invalid')).toHaveLength(0);
    expect(fund.rows.filter((row) => row.status === 'invalid')).toHaveLength(0);
  },
);
