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

const hostplusExport = `Received,Transaction Type,Transaction ID,Payment period,Direct Investment,Employer,Insurance Credit,Member,Rollover,Salary Sacrifice,Spouse,Total ($),,,,01/08/2025,1.3368
17/09/2026,Example Employer Contribution,123,01/09/2026 - 30/09/2026,0,100,0,0,0,0,0,100,1.5,66.666666667,,04/08/2025,1.3439
28/08/2026,Death insurance premium,456,NA,0,-3,0,0,0,0,0,-3,1.5,-2,,05/08/2025,1.3501
28/08/2026,TPD insurance premium,456,NA,0,-6,0,0,0,0,0,-6,1.5,-4,,06/08/2025,1.3572
,,,,,,,,,,,,,,,07/08/2025,1.3573
`;

test('parses Hostplus signed cash and units without importing the appended price history', () => {
  const parsed = parseInvestmentCsv(hostplusExport, 'hostplus.csv');
  expect(parsed.summary).toMatchObject({
    provider: 'Hostplus',
    currency: 'AUD',
    dateFrom: '2026-08-28',
    dateTo: '2026-09-17',
  });
  expect(parsed.rows).toHaveLength(3);
  expect(parsed.rows[0]).toMatchObject({
    transactionType: 'Employer Contribution',
    description: 'Example Employer Contribution',
    amountMinor: 10000n,
    units: '66.666666667',
    unitPrice: '1.5',
    currency: 'AUD',
  });
  expect(parsed.rows[1]).toMatchObject({ amountMinor: -300n, units: '-2' });
  expect(parsed.rows[2].dedupeKey).not.toBe(parsed.rows[1].dedupeKey);
  expect(JSON.parse(parsed.rows[0].sourceJson)).toHaveProperty('Transaction ID', '123');
  expect(parseInvestmentCsv(hostplusExport, 'renamed.csv').rows.map((row) => row.dedupeKey)).toEqual(
    parsed.rows.map((row) => row.dedupeKey),
  );
});

test('retains cash-only Hostplus activity without inventing units or prices', () => {
  const parsed = parseInvestmentCsv(
    'Received,Transaction Type,Transaction ID,Total ($)\n17/08/2026,Personal contribution,789,10\n',
    'hostplus.csv',
  );
  expect(parsed.rows[0]).toMatchObject({
    amountMinor: 1000n,
    units: '0',
    description: 'Personal contribution · Units not supplied',
  });
  expect(parsed.rows[0].unitPrice).toBeUndefined();
});

const suppliedHostplusPath = process.env.KORU_HOSTPLUS_CSV;
test.skipIf(!suppliedHostplusPath)('parses a supplied Hostplus export without invalid transactions', () => {
  if (!suppliedHostplusPath) throw new Error('Set KORU_HOSTPLUS_CSV to the export path.');
  const parsed = parseInvestmentCsv(readFileSync(suppliedHostplusPath, 'utf8'), 'hostplus.csv');
  expect(parsed.rows.length).toBeGreaterThan(0);
  expect(parsed.rows.filter((row) => row.status === 'invalid')).toHaveLength(0);
  expect(parsed.rows.every((row) => row.currency === 'AUD')).toBe(true);
});

test('marks Hostplus dates and inconsistent unit signs invalid without losing source currency', () => {
  const invalid = hostplusExport
    .replace('28/08/2026,Death insurance', '31/02/2026,Death insurance')
    .replace('-6,1.5,-4', '-6,1.5,4');
  const parsed = parseInvestmentCsv(invalid, 'hostplus.csv');
  expect(parsed.rows.slice(1).map((row) => [row.status, row.currency])).toEqual([
    ['invalid', 'AUD'],
    ['invalid', 'AUD'],
  ]);
  expect(parsed.rows[1].error).toContain('not a valid date');
  expect(parsed.rows[2].error).toContain('different signs');
});
