"""Download published Smart ETF NTA prices from official NZX announcements.

Preserves the valuation date in the announcement title, rather than its release
or download date. Missing days are not interpolated. No personal data is read.
"""
import argparse
import concurrent.futures
import csv
import datetime
import json
import re
import urllib.request
from decimal import Decimal
from pathlib import Path

CODES = ('USG', 'EUF', 'TWF', 'UST', 'MDZ')
PATTERN = re.compile(r'^(?:Amended )?(USG|EUF|TWF|UST|MDZ) NTA (\d{2}-\d{2}-\d{4}) \$([0-9]+\.[0-9]+)$')


def parse_announcements(code, announcements, excluded=None):
    prices = {}
    conflicting_dates = set()
    candidates = {}
    for announcement in announcements:
        match = PATTERN.fullmatch(announcement['title'].strip())
        if not match:
            continue
        if match[1] != code or announcement['companyCode'] != code:
            raise ValueError('Announcement fund identity differs from requested fund')
        date = datetime.datetime.strptime(match[2], '%d-%m-%Y').date().isoformat()
        value = Decimal(match[3])
        if value <= 0:
            raise ValueError('Published NTA must be positive')
        row = {'instrument': code, 'date': date, 'unitPrice': format(value, 'f'),
               'currency': 'NZD', 'basis': 'NTA',
               'source': f"https://announcements.nzx.com/announcement/{announcement['id']}"}
        candidates.setdefault(date, []).append(row)
        if date in prices and prices[date]['unitPrice'] != row['unitPrice']:
            conflicting_dates.add(date)
        prices[date] = row
    if excluded is not None:
        excluded.extend({'instrument': code, 'date': date, 'candidates': candidates[date]}
                        for date in sorted(conflicting_dates))
    return sorted((row for date, row in prices.items() if date not in conflicting_dates),
                  key=lambda row: row['date'])


def monthly_prices(rows):
    monthly = {}
    for row in sorted(rows, key=lambda item: item['date']):
        monthly[(row['instrument'], row['date'][:7])] = row
    return sorted(monthly.values(), key=lambda row: (row['instrument'], row['date']))


def simplicity_prices(path):
    rows = []
    for row in csv.DictReader(path.open()):
        date = datetime.datetime.strptime(row['Date'], '%d-%m-%Y').date().isoformat()
        value = Decimal(row['Price'])
        if value <= 0:
            raise ValueError('Simplicity price must be positive')
        rows.append({'instrument': 'SIMPLICITY-HIGH-GROWTH', 'date': date,
                     'unitPrice': format(value, 'f'), 'currency': 'NZD', 'basis': 'provider unit price',
                     'source': 'https://simplicity.kiwi/api/download_prices?fund_name=High%20Growth'})
    return rows


def hostplus_prices(paths):
    prices = {}
    for path in paths:
        rows = list(csv.reader(path.open()))
        if rows[1] != ['PERIOD', '', 'Indexed High Growth'] or rows[2] != ['FROM', 'TO', 'PRICE']:
            raise ValueError('Expected Hostplus Indexed High Growth pricing export')
        for row in rows[3:]:
            if len(row) != 3 or not row[1] or not row[2]:
                continue
            date = datetime.datetime.strptime(row[1], '%d/%m/%Y').date().isoformat()
            value = Decimal(row[2])
            if value <= 0:
                raise ValueError('Hostplus price must be positive')
            if date in prices and prices[date]['unitPrice'] != format(value, 'f'):
                raise ValueError('Conflicting Hostplus overlapping pricing files')
            prices[date] = {'instrument': 'HOSTPLUS-INDEXED-HIGH-GROWTH', 'date': date,
                            'unitPrice': format(value, 'f'), 'currency': 'AUD', 'basis': 'provider unit price',
                            'source': 'Hostplus Indexed High Growth provider daily unit pricing export'}
    return sorted(prices.values(), key=lambda row: row['date'])


def fetch_year(task):
    code, year, directory = task
    url = f'https://api.nzx.com/public/company/{code}000000/announcements/{year}/all.json'
    target = directory / f'{code}-announcements-{year}.json'
    if target.exists():
        raw = target.read_bytes()
    else:
        with urllib.request.urlopen(url, timeout=30) as response:
            raw = response.read()
        target.write_bytes(raw)
    excluded = []
    rows = parse_announcements(code, json.loads(raw), excluded)
    (directory / f'{code}-excluded-conflicts-{year}.json').write_text(json.dumps(excluded, indent=2) + '\n')
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--start-year', type=int, default=2018)
    parser.add_argument('--end-year', type=int, default=datetime.date.today().year)
    parser.add_argument('--simplicity-csv', type=Path)
    parser.add_argument('--hostplus-csv', type=Path, action='append', default=[])
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    tasks = [(code, year, args.output_dir) for code in CODES
             for year in range(max(args.start_year, 2024 if code == 'UST' else args.start_year),
                               args.end_year + 1)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        datasets = list(pool.map(fetch_year, tasks))
    unique = {}
    for rows in datasets:
        for row in rows:
            key = (row['instrument'], row['date'])
            prior = unique.get(key)
            if prior and prior['unitPrice'] != row['unitPrice']:
                raise ValueError(f'Conflicting yearly records for {key}')
            unique[key] = row
    rows = sorted(unique.values(), key=lambda row: (row['instrument'], row['date']))
    (args.output_dir / 'smart-historical-prices.json').write_text(json.dumps(rows, indent=2) + '\n')
    with (args.output_dir / 'smart-historical-prices.csv').open('w', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=['instrument', 'date', 'unitPrice', 'currency', 'basis', 'source'])
        writer.writeheader()
        writer.writerows(rows)
    all_rows = list(rows)
    if args.simplicity_csv:
        all_rows.extend(simplicity_prices(args.simplicity_csv))
    if args.hostplus_csv:
        all_rows.extend(hostplus_prices(args.hostplus_csv))
    monthly = monthly_prices(all_rows)
    (args.output_dir / 'monthly-historical-prices.json').write_text(json.dumps(monthly, indent=2) + '\n')
    for code in dict.fromkeys(row['instrument'] for row in all_rows):
        fund = [row for row in all_rows if row['instrument'] == code]
        print(f"{code}: {len(fund)} published prices, {fund[0]['date']} through {fund[-1]['date']}" if fund else f'{code}: no prices found')


if __name__ == '__main__':
    main()
