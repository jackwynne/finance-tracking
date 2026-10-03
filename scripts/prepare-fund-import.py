"""Add an explicit fund identity without changing provider transaction fields."""
import argparse
import csv
import hashlib
import json
from decimal import Decimal
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--instrument', required=True)
parser.add_argument('--fund-name', required=True)
args = parser.parse_args()
if args.source.resolve() == args.output.resolve():
    parser.error('Choose an output path different from the original export.')
if not args.instrument.strip() or not args.fund_name.strip():
    parser.error('Instrument and fund name must be nonempty.')
with args.source.open(encoding='utf-8-sig', newline='') as source:
    reader = csv.DictReader(source)
    fields = reader.fieldnames
    rows = list(reader)
if not fields or not rows or not {'Units', 'Amount', 'EffectiveDate', 'TransactionDescription'}.issubset(fields):
    parser.error('Expected a nonempty Simplicity transaction export.')
if {'InstrumentCode', 'FundName'}.intersection(fields):
    parser.error('The source already contains fund identity columns.')
args.output.parent.mkdir(parents=True, exist_ok=True)
with args.output.open('w', encoding='utf-8', newline='') as output:
    writer = csv.DictWriter(output, fieldnames=fields + ['InstrumentCode', 'FundName'])
    writer.writeheader()
    writer.writerows(dict(row, InstrumentCode=args.instrument.strip(), FundName=args.fund_name.strip()) for row in rows)
with args.output.open(encoding='utf-8', newline='') as output:
    prepared = list(csv.DictReader(output))
assert [{field: row[field] for field in fields} for row in prepared] == rows
receipt = {
    'source': str(args.source.resolve()),
    'sourceSha256': hashlib.sha256(args.source.read_bytes()).hexdigest(),
    'prepared': str(args.output.resolve()),
    'preparedSha256': hashlib.sha256(args.output.read_bytes()).hexdigest(),
    'instrument': args.instrument.strip(),
    'fundName': args.fund_name.strip(),
    'rows': len(rows),
    'dateFrom': min(row['EffectiveDate'][:10] for row in rows),
    'dateTo': max(row['EffectiveDate'][:10] for row in rows),
    'netUnits': str(sum(Decimal(row['Units']) for row in rows)),
    'originalFieldsPreserved': True,
}
args.output.with_suffix('.receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
