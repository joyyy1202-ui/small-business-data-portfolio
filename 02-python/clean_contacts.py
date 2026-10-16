"""Normalize a JSON list of contacts and export a CSV plus a row-level audit.
Only the Python standard library is required. Example: python3 clean_contacts.py
"""
import argparse
import csv
import json
import re
from pathlib import Path


def clean(records):
    if not isinstance(records, list) or len(records) > 10000:
        raise ValueError('Input must be a JSON list of at most 10,000 records.')
    accepted, issues, seen = [], [], set()
    for line, item in enumerate(records, 1):
        if not isinstance(item, dict):
            issues.append({'record': line, 'reason': 'Not an object', 'original': item})
            continue
        if any(not isinstance(item.get(k, ''), str) for k in ('name', 'email', 'company')):
            issues.append({'record': line, 'reason': 'Fields must be text', 'original': item})
            continue
        row = {k: item.get(k, '').strip() for k in ('name', 'email', 'company')}
        row['name'] = ' '.join(row['name'].split())
        row['email'] = row['email'].lower()
        reason = ''
        if not row['name']:
            reason = 'Missing name'
        elif not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', row['email']):
            reason = 'Invalid email format'
        elif row['email'] in seen:
            reason = 'Duplicate email (first valid record retained)'
        if reason:
            issues.append({'record': line, 'reason': reason, 'original': item})
        else:
            seen.add(row['email'])
            row['company'] = row['company'] or 'Not provided'
            accepted.append(row)
    return accepted, issues


def csv_safe(value):
    # Prevent spreadsheet formula execution when the exported CSV is opened.
    return "'" + value if value.lstrip().startswith(('=', '+', '-', '@')) else value


def run(source, output):
    source, output = Path(source), Path(output)
    if output.exists():
        raise ValueError('Output folder already exists; choose a new folder to preserve previous results.')
    records = json.loads(source.read_text(encoding='utf-8-sig'))
    rows, issues = clean(records)
    output.mkdir(parents=True)
    with (output / 'contacts.csv').open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['name', 'email', 'company'])
        writer.writeheader()
        writer.writerows({k: csv_safe(v) for k, v in row.items()} for row in rows)
    audit = {'input': len(records), 'accepted': len(rows), 'rejected': len(issues), 'issues': issues}
    (output / 'audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in audit.items() if k != 'issues'}, ensure_ascii=False))
    return rows, audit


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', nargs='?', default=Path(__file__).with_name('sample.json'))
    parser.add_argument('output', nargs='?', default=Path(__file__).parent.parent / 'outputs/demo/contacts')
    args = parser.parse_args()
    try:
        run(args.source, args.output)
    except (ValueError, OSError) as e:
        parser.exit(1, f'Error: {e}\n')
