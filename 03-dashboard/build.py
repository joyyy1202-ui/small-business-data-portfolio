"""Copy locally generated results into the offline dashboard. No dependencies."""
import csv
import json
import shutil
from pathlib import Path

root = Path(__file__).resolve().parent.parent
dist = root / '03-dashboard/dist'
result = root / 'outputs/demo'
data = json.loads((result / 'sales-report.json').read_text())
audit = json.loads((result / 'contacts/audit.json').read_text())
with (result / 'contacts/contacts.csv').open(encoding='utf-8-sig', newline='') as f:
    contacts = list(csv.DictReader(f))
data['contacts'] = {'rows': contacts, 'audit': audit}
(dist / 'data.js').write_text('window.DEMO = ' + json.dumps(data, ensure_ascii=True) + ';\n', encoding='utf-8')
for source, name in [(result / 'sales-report.xlsx', 'sales-report.xlsx'), (result / 'contacts/contacts.csv', 'contacts.csv'), (root / 'screenshots/excel-summary.png', 'excel-summary.png')]:
    shutil.copyfile(source, dist / name)
print('Dashboard refreshed: 03-dashboard/dist/index.html')
