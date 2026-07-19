import { existsSync, readFileSync } from 'node:fs';

// @vitest-environment node
import ExcelJS from 'exceljs';
import { describe, expect, test } from 'vitest';

import { parseOfx, parseXlsx } from './importAction';

const bankOfx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20260719104509<LANGUAGE>ENG</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS><STMTRS><CURDEF>NZD
<BANKACCTFROM><BANKID>06<BRANCHID>0001<ACCTID>1234567-00<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260701<DTEND>20260719
<STMTTRN><TRNTYPE>DEP<DTPOSTED>20260716<TRNAMT>2500.00<FITID>income-1<NAME>Example Employer<MEMO>Salary</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260718<TRNAMT>-12.00<FITID>pending-1<NAME>Example Cafe Pending</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>3000.00<DTASOF>20260719</LEDGERBAL><AVAILBAL><BALAMT>2988.00<DTASOF>20260719</AVAILBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const cardOfx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20260719<LANGUAGE>ENG</SONRS></SIGNONMSGSRSV1>
<CREDITCARDMSGSRSV1><CCSTMTTRNRS><TRNUID>2<STATUS><CODE>0<SEVERITY>INFO</STATUS><CCSTMTRS><CURDEF>NZD
<CCACCTFROM><ACCTID>9999********1234</CCACCTFROM><BANKTRANLIST><DTSTART>20260601<DTEND>20260630
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260620<TRNAMT>-25.50<FITID>card-1<NAME>Example Grocer</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>-25.50<DTASOF>20260630</LEDGERBAL><AVAILBAL><BALAMT>4974.50<DTASOF>20260630</AVAILBAL>
</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;

describe('OFX parsing', () => {
  test('normalizes bank rows, pending status, IDs, and balances', () => {
    const parsed = parseOfx(bankOfx);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({
      sourceId: 'income-1',
      amountMinor: 250000n,
      status: 'ready',
      currency: 'NZD',
    });
    expect(parsed.rows[1].status).toBe('pending');
    expect(parsed.summary).toMatchObject({
      detectedAccountType: 'checking',
      ledgerMinor: 300000n,
      availableMinor: 298800n,
      balanceDate: '2026-07-19',
    });
  });

  test('normalizes credit card accounts as liabilities', () => {
    const parsed = parseOfx(cardOfx);
    expect(parsed.rows[0].sourceId).toBe('card-1');
    expect(parsed.summary.detectedAccountType).toBe('creditCard');
    expect(parsed.summary.ledgerMinor).toBe(-2550n);
  });
});

test('Excel parsing supports settled and pending rows without collapsing identical values', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Transactions');
  sheet.addRow([
    'Transaction Date',
    'Processed Date',
    'Type',
    'Details',
    'Particulars',
    'Code',
    'Reference',
    'Amount',
    'Balance',
  ]);
  sheet.addRow([
    new Date('2026-07-10T00:00:00Z'),
    new Date('2026-07-11T00:00:00Z'),
    'Eft-Pos',
    'Example Market',
    '',
    '',
    '',
    -15.25,
    1000,
  ]);
  sheet.addRow([new Date('2026-07-12T00:00:00Z'), '', 'Visa Hold', 'Example Cafe', '', '', '', -8, 992]);
  const buffer = await workbook.xlsx.writeBuffer();
  const parsed = await parseXlsx(buffer as unknown as Uint8Array, '06-0001-1234567-00_Transactions.xlsx');
  expect(parsed.rows[0]).toMatchObject({ status: 'ready', amountMinor: -1525n, processedDate: '2026-07-11' });
  expect(parsed.rows[1].status).toBe('pending');
  expect(parsed.summary.ledgerMinor).toBe(100000n);
});

const realBankOfx = 'temp/06-0574-0202090-00_Transactions_2026-06-20_2026-07-19.ofx';
const realCardOfx = 'temp/9554-xxxx-xxxx-1369_Statement_2026-06-23.ofx';
const realBankXlsx = 'temp/06-0574-0202090-00_Transactions_2026-01-01_2026-07-19.xlsx';
const realCardXlsx = 'temp/9554-xxxx-xxxx-1369_Transactions_2026-06-20_2026-07-19.xlsx';

test.skipIf(!existsSync(realBankOfx) || !existsSync(realCardOfx))('parses the ignored OFX samples end-to-end', () => {
  const bank = parseOfx(readFileSync(realBankOfx, 'latin1'));
  const card = parseOfx(readFileSync(realCardOfx, 'latin1'));
  expect(bank.rows).toHaveLength(25);
  expect(bank.rows.filter((row) => row.status === 'pending')).toHaveLength(0);
  expect(card.rows).toHaveLength(132);
  expect(card.rows.filter((row) => row.status === 'pending')).toHaveLength(7);
});

test.skipIf(!existsSync(realBankXlsx) || !existsSync(realCardXlsx))(
  'parses the ignored Excel samples end-to-end',
  async () => {
    const bank = await parseXlsx(readFileSync(realBankXlsx), realBankXlsx);
    const card = await parseXlsx(readFileSync(realCardXlsx), realCardXlsx);
    expect(bank.rows).toHaveLength(162);
    expect(bank.rows.filter((row) => row.status === 'pending')).toHaveLength(1);
    expect(card.rows).toHaveLength(113);
    expect(card.rows.filter((row) => row.status === 'pending')).toHaveLength(15);
  },
);
