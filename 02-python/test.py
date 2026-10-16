import csv
import json
import tempfile
from pathlib import Path
from clean_contacts import clean, csv_safe, run

sample = Path(__file__).with_name('sample.json')
rows, issues = clean(json.loads(sample.read_text()))
assert len(rows) == 5 and len(issues) == 3
assert rows[0]['name'] == 'Alex Chen' and rows[0]['email'] == 'alex@example.com'
assert rows[1]['company'] == 'Not provided'
assert csv_safe(' =1+1').startswith("'") and csv_safe('normal') == 'normal'
assert len(clean([{'name': 123}, None])[1]) == 2
assert clean([]) == ([], [])
try:
    clean({})
    raise AssertionError('Expected input error')
except ValueError:
    pass
with tempfile.TemporaryDirectory() as tmp:
    dest = Path(tmp) / 'result'
    run(sample, dest)
    with (dest / 'contacts.csv').open(encoding='utf-8-sig', newline='') as f:
        saved = list(csv.DictReader(f))
    assert saved[3]['name'] == "'=SUM(1,1)"
    assert saved[-1]['company'] == 'Atelier, East'
    assert len(saved) == 5
    try:
        run(sample, dest)
        raise AssertionError('Must not overwrite an existing output folder')
    except ValueError:
        pass
print('Python checks passed: normalization, rejection, deduplication, CSV escaping, Unicode, overwrite protection.')
