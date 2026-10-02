"""Prepare dated stock allocations from saved official provider downloads.

No personal data is read. Never rescales missing constituents to 100%.
"""
import argparse
import csv
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

VANGUARD = {'vug': '0967', 'vgk': '0963', 'vt': '3141'}
SMART_BASE = 'https://doc.smartinvest.co.nz/fund-updates/etf/'
SMART = {
    'USG': ('us-shares', 'us-large-growth', 'vug', '0.9989'),
    'EUF': ('international-shares', 'europe', 'vgk', '0.9992'),
    'TWF': ('international-shares', 'total-world', 'vt', '0.9992'),
    'UST': ('us-shares', 'us-technology-(nzd-hedged)', None, '1.0622'),
    'MDZ': ('nz-shares', 'nz-mid-cap', None, '1'),
}
# Explicit issuer mapping. These identifiers identify separate share classes of
# one company, or the same security in differently named provider downloads.
ISSUERS = {
    'taiwan-semiconductor-manufacturing': ('Taiwan Semiconductor Manufacturing', ['6889106', 'TW0002330008']),
    'exxonmobil': ('ExxonMobil', ['30231G102', '30233Q108']),
    'sk-hynix': ('SK Hynix', ['6450267', 'KR7000660001']),
    'royal-bank-canada': ('Royal Bank of Canada', ['780087102', 'CA7800871021']),
    'resmed': ('ResMed', ['761152107', 'AU000000RMD6']),
    'asml': ('ASML', ['N07059202', 'B929F46', 'NL0010273215']),
    'nestle': ('Nestle', ['H57312649', '7123870', 'CH0038863350']),
    'commonwealth-bank-of-australia': ('Commonwealth Bank of Australia', ['6215035', 'AU000000CBA7']),
    'novartis': ('Novartis', ['H5820Q150', '7103065', 'CH0012005267']),
    'hsbc': ('HSBC', ['0540528', 'GB0005405286']),
    'astrazeneca': ('AstraZeneca', ['0989529', 'GB0009895292']),
    'sap': ('SAP', ['D66992104', '4846288', 'DE0007164600']),
    'shell': ('Shell', ['BP6MXD8', 'BP6MXT4', 'GB00BP6MXD84']),
    'lvmh': ('LVMH', ['F58485115', '4061412', 'FR0000121014']),
    'tencent': ('Tencent', ['G87572163', 'BMMV2K8', 'KYG875721634']),
    'bhp': ('BHP', ['6144690', 'AU000000BHP4']),
    'siemens': ('Siemens', ['5727973', 'DE0007236101']),
    'siemens-energy': ('Siemens Energy', ['BMTVQK9', 'DE000ENER6Y0']),
    'siemens-healthineers': ('Siemens Healthineers', ['D6T479107', 'BD594Y4', 'DE000SHL1006']),
    'novo-nordisk': ('Novo Nordisk', ['BP6KMJ1', 'DK0062498333']),
    'alibaba': ('Alibaba', ['BK6YZP5', 'KYG017191142']),
    'rio-tinto': ('Rio Tinto', ['0718875', '6220103', 'AU000000RIO1', 'GB0007188757']),
    'schneider-electric': ('Schneider Electric', ['4834108', 'FR0000121972']),
    'toyota-motor': ('Toyota Motor', ['6900643', 'JP3633400001']),
    'nvidia': ('NVIDIA', ['67066G104', 'NVDA']),
    'apple': ('Apple', ['037833100', 'AAPL']),
    'microsoft': ('Microsoft', ['594918104', 'MSFT']),
    'alphabet': ('Alphabet', ['02079K305', '02079K107', 'GOOG', 'GOOGL']),
    'amazon': ('Amazon', ['023135106', 'AMZN']),
    'broadcom': ('Broadcom', ['11135F101', 'AVGO']),
    'meta-platforms': ('Meta Platforms', ['30303M102', 'META']),
    'tesla': ('Tesla', ['88160R101', 'TSLA']),
    'berkshire-hathaway': ('Berkshire Hathaway', ['084670108', '084670702']),
    'fisher-paykel-healthcare-ltd': ('Fisher & Paykel Healthcare', ['6340250']),
    'mercury-nz-ltd': ('Mercury NZ', ['B8W6K56']),
    'chorus-ltd': ('Chorus', ['B54F6S5']),
    'roche': ('Roche', ['BTMJD19', '7108918', 'CH1499059983', 'CH0012032113']),
    'samsung-electronics': ('Samsung Electronics', ['Y74718100', '6771720', '6773812', 'KR7005930003', 'KR7005931001']),
}
ALIASES = {key: (issuer, label) for issuer, (label, keys) in ISSUERS.items() for key in keys}


def canonical(name, *, cusip='', sedol='', isin='', ticker=''):
    # A US ISIN contains its nine-character CUSIP. This merges identical
    # securities, rather than guessing issuer identity from a similar name.
    if isin.startswith('US') and len(isin) == 12:
        cusip = isin[2:11]
    for identifier in (cusip, sedol, isin, ticker):
        if identifier in ALIASES:
            return ALIASES[identifier]
    identifier = cusip or sedol or isin or ticker
    if not identifier:
        raise ValueError(f'No security identifier for {name}')
    prefix = 'cusip' if cusip else 'sedol' if sedol else 'isin' if isin else 'ticker'
    return (f'{prefix}-{identifier.lower()}', name.strip())


def percent(value):
    return Decimal(str(value).strip().replace('%', '')) / 100


def top_weights(rows, factor=Decimal(1), limit=100):
    totals = defaultdict(Decimal)
    labels = {}
    for issuer, label, weight in rows:
        if weight < 0:
            raise ValueError('Stock constituent weight must be nonnegative')
        totals[issuer] += weight * factor
        labels.setdefault(issuer, label)
    selected = sorted(totals.items(), key=lambda row: (-row[1], row[0]))[:limit]
    return [{'issuerId': issuer, 'label': labels[issuer],
             'weight': format(weight.quantize(Decimal('0.000000000001')).normalize(), 'f')}
            for issuer, weight in selected if weight > 0]


def vanguard_rows(data):
    date = data['latestEffectiveDate']
    rows = []
    for row in data[date]['equity']:
        value = str(row['percentOfFunds']).strip()
        if value in ('', '-'):
            continue
        issuer, label = canonical(row['holdingName'], cusip=row['cusip'],
                                  sedol=row['sedol'], ticker=row['ticker'])
        rows.append((issuer, label, percent(value)))
    return date, rows


def ishares_workbook_rows(text):
    # The provider's XML workbook contains bare ampersands in company names.
    root = ET.fromstring(re.sub(r'&(?!#?[A-Za-z0-9]+;)', '&amp;', text))
    namespace = '{urn:schemas-microsoft-com:office:spreadsheet}'
    for worksheet in root.findall(namespace + 'Worksheet'):
        if worksheet.get(namespace + 'Name') == 'Holdings':
            return [[cell.findtext(namespace + 'Data', default='')
                     for cell in row.findall(namespace + 'Cell')]
                    for row in worksheet.findall('.//' + namespace + 'Row')]
    raise ValueError('No iShares Holdings worksheet found')


def ishares_rows(data, securities=None):
    if data[1] != ['as of', '30/Sept/2026']:
        raise ValueError('Confirm the iShares date before preparing a new snapshot')
    rows = []
    for row in data[3:]:
        if len(row) > 5 and row[3] == 'Equity':
            security = (securities or {}).get(row[0], {})
            issuer, label = canonical(row[1], ticker=row[0], cusip=security.get('cusip', ''))
            rows.append((issuer, label, percent(row[5])))
    return '2026-09-30', rows


def hostplus_rows(path):
    rows = []
    in_equity = False
    for row in csv.reader(path.read_text(encoding='cp1252').splitlines()):
        if row and row[0] == 'Listed Equity':
            in_equity = True
            continue
        if not in_equity or len(row) != 5:
            continue
        if row[0].startswith('Total'):
            break
        if re.fullmatch(r'[A-Z]{2}[A-Z0-9]{9}[0-9]', row[1]) and row[4].endswith('%'):
            if re.search(r'\bETF\b', row[0], re.IGNORECASE):
                continue  # A pooled fund unit is not an individual stock.
            issuer, label = canonical(row[0], isin=row[1])
            rows.append((issuer, label, percent(row[4])))
    if not rows:
        raise ValueError('No Hostplus listed equities found')
    return rows


def pdf_top_rows(text, *, simplicity=False):
    section = text.split('\fTop 10 investments', 1)[1].split('The top', 1)[0]
    rows = []
    for line in section.splitlines():
        match = re.match(r'^\s*(.*?)\s{2,}(\d+\.\d+)%\s+(.*)$', line)
        if not match:
            continue
        name, weight, rest = match.groups()
        if 'equities' not in rest:
            continue  # Simplicity Living is unlisted property, not a stock.
        explicit = {
            'NVIDIA Corp': 'nvidia', 'Apple Inc': 'apple',
            'Microsoft Corporation': 'microsoft', 'Amazon.Com Inc': 'amazon',
            'Alphabet Inc Class A': 'alphabet', 'Broadcom Inc': 'broadcom',
            'Fisher & Paykel Healthcare Ltd': 'fisher-paykel-healthcare-ltd',
            'Mercury NZ Ltd': 'mercury-nz-ltd', 'Chorus Ltd': 'chorus-ltd',
        }
        issuer = explicit.get(name)
        if issuer:
            label = ISSUERS[issuer][0]
        else:
            issuer = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
            label = name
        rows.append((issuer, label, percent(weight)))
    if len(rows) != (9 if simplicity else 10):
        raise ValueError('Expected the exact published top-stock table')
    return rows


def smart_url(code):
    category, slug, _, _ = SMART[code]
    return f'{SMART_BASE}{category}/2026/Q2/smart-exchange-traded-funds-fund-update-smart-{slug}-etf.pdf'


def allocation(code, date, rows, source, evidence, factor=Decimal(1)):
    return {'instrument': code, 'dimension': 'stock', 'kind': 'holdings',
            'date': date, 'source': source, 'evidence': evidence,
            'complete': False, 'weights': top_weights(rows, factor)}


def prepare(directory):
    result = []
    us_securities = {}
    for code in ('USG', 'EUF', 'TWF'):
        _, _, ticker, factor = SMART[code]
        data = json.loads((directory / f'{ticker}-holdings.json').read_text())
        date, rows = vanguard_rows(data)
        for security in data[date]['equity']:
            if security['country'] == 'US' and security['cusip'] and security['ticker']:
                prior = us_securities.get(security['ticker'])
                if prior and prior['cusip'] != security['cusip']:
                    raise ValueError('Ambiguous US ticker identity')
                us_securities[security['ticker']] = security
        url = f'https://advisors.vanguard.com/investments/products/api/funds/{VANGUARD[ticker]}/holdings/latest'
        result.append(allocation(code, date, rows, url,
            f'Top 100 disclosed issuers after explicit share-class grouping. Underlying fund holdings dated {date}, scaled by Smart wrapper ETF weight {Decimal(factor)*100}% of net assets on 2026-06-30 ({smart_url(code)}). Mixed-date estimate. Missing/unreported weights and cash remain unattributed. No normalization.', Decimal(factor)))
    date, rows = ishares_rows(ishares_workbook_rows((directory / 'iuit-product-data.xls').read_text()), us_securities)
    result.append(allocation('UST', date, rows,
        'https://www.ishares.com/uk/individual/en/products/280510',
        f'iShares disclosed equity weights dated {date}, scaled by Smart gross ETF weight 106.22% of net assets on 2026-06-30 ({smart_url("UST")}). Mixed-date gross exposure estimate. Cash, hedges and liabilities omitted; gross attributed stocks may exceed fund net assets.', Decimal('1.0622')))
    result.append(allocation('MDZ', '2026-06-30', pdf_top_rows((directory / 'MDZ-2026-Q2.txt').read_text()),
        smart_url('MDZ'), 'Published top ten investments, 56.01% of net assets. Other holdings remain unattributed.'))
    result.append(allocation('SIMPLICITY-HIGH-GROWTH', '2026-06-30',
        pdf_top_rows((directory / 'simplicity-2026-Q2.txt').read_text(), simplicity=True),
        'https://simplicity.kiwi/assets/Uploads/Simplicity-High-Growth-Fund-update-30-June-2026.pdf',
        'Nine listed stocks in published top ten investments, 24.10% of fund net assets. Simplicity Living 6.59% is unlisted property and excluded from stock exposure. Other holdings remain unattributed.'))
    result.append(allocation('HOSTPLUS-INDEXED-HIGH-GROWTH', '2026-06-30',
        hostplus_rows(directory / 'hostplus-holdings-2026-06.csv'),
        'https://hostplus.com.au/content/dam/hostplus-program/site/resources/investments/investment-holdings/accumulation-investment-holdings/Indexed%20High%20Growth.csv',
        'Top 100 disclosed listed-equity issuers after explicit share-class grouping. Provider snapshot dated 2026-06-30. Published weights rounded to 0.01%; cash, derivatives, zero-rounded, pooled ETFs and remaining equities excluded. No normalization.'))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--refresh-vanguard', action='store_true')
    args = parser.parse_args()
    if args.refresh_vanguard:
        args.sources.mkdir(parents=True, exist_ok=True)
        for ticker, fund_id in VANGUARD.items():
            url = f'https://advisors.vanguard.com/investments/products/api/funds/{fund_id}/holdings/latest'
            with urllib.request.urlopen(url, timeout=30) as response:
                (args.sources / f'{ticker}-holdings.json').write_bytes(response.read())
    result = prepare(args.sources)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    for row in result:
        total = sum(Decimal(weight['weight']) for weight in row['weights'])
        print(f"{row['instrument']}: {len(row['weights'])} issuers, {total*100}% attributed, {row['date']}")


if __name__ == '__main__':
    main()
