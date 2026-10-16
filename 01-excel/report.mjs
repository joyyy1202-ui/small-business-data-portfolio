import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { Workbook, SpreadsheetFile, FileBlob } from '@oai/artifact-tool';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const headers = ['order_id', 'date', 'channel', 'product', 'quantity', 'unit_price', 'status'];
const text = x => String(x ?? '').trim();
const literal = x => typeof x === 'string' && /^[=+@-]/.test(x) ? "'" + x : x;

// ponytail: in-memory batches capped at 10,000 rows; use streaming for larger files.
export function clean(records) {
  if (records.length > 10000) throw new Error('Maximum 10,000 input rows.');
  const seen = new Map(), accepted = [], issues = [];
  for (const {values, source} of records) {
    const r = values.slice(0, 7).map(text);
    const [id, date, channel, product, qty, price, status] = r;
    let reason = '';
    if (!id || !channel || !product) reason = 'Missing ID, channel or product';
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) reason = 'Invalid date (YYYY-MM-DD required)';
    else if (!/^\d+$/.test(qty) || +qty < 1 || +qty > 100000) reason = 'Invalid quantity';
    else if (!/^\d+(\.\d{1,2})?$/.test(price) || +price > 1000000) reason = 'Invalid unit price';
    else if (!['paid', 'cancelled'].includes(status)) reason = 'Unknown status';
    if (!reason) {
      r[4] = +qty; r[5] = +price;
      if (seen.has(id)) reason = JSON.stringify(seen.get(id)) === JSON.stringify(r) ? 'Duplicate order' : 'Conflicting order ID';
      else { seen.set(id, r); if (status !== 'paid') reason = 'Excluded: cancelled'; }
    }
    if (reason) issues.push([source, id, reason, JSON.stringify(values)]);
    else accepted.push([...r, source]);
  }
  // Conflicting IDs are not guessed: remove even the first occurrence from sales.
  const conflicts = new Set(issues.filter(r => r[2] === 'Conflicting order ID').map(r => r[1]));
  const rows = accepted.filter(r => {
    if (!conflicts.has(r[0])) return true;
    issues.push([r[7], r[0], 'Conflicting order ID', JSON.stringify(r.slice(0, 7))]);
    return false;
  });
  return {rows, issues, inputCount: records.length};
}

function style(s, range, headerRow) {
  s.showGridLines = false;
  s.getRange(range).format.font = {name: 'Arial', size: 11, color: '#1C2938'};
  s.getRange(range).format.rowHeight = 24;
  s.getRange(range).format.columnWidth = 18;
  s.getRange(headerRow).format = {fill: '#263C54', font: {bold: true, color: '#FFFFFF'}, rowHeight: 30};
}

async function save(wb, file) {
  wb.recalculate();
  await fs.mkdir(path.dirname(file), {recursive: true});
  await (await SpreadsheetFile.exportXlsx(wb)).save(file);
}

async function demoInputs() {
  const rows = Array.from({length: 24}, (_, i) => [
    `ORD-${String(i + 1).padStart(3, '0')}`, `2026-10-${String(i % 12 + 1).padStart(2, '0')}`,
    ['Online', 'Retail', 'Wholesale'][i % 3], ['Notebook', 'Desk lamp', 'Canvas bag', 'Mug'][i % 4],
    i % 5 + 1, [12.5, 48, 25, 18][i % 4], i === 22 ? 'cancelled' : 'paid'
  ]);
  rows.push([...rows[0]], ['BAD-1', '2026-02-30', 'Online', 'Mug', 1, 18, 'paid'], ['BAD-2', '2026-10-04', 'Retail', 'Mug', -2, 18, 'paid']);
  for (let i = 0; i < 2; i++) {
    const wb = Workbook.create(), s = wb.worksheets.add('Orders');
    const data = [headers, ...rows.slice(i * 14, (i + 1) * 14)];
    s.getRange('A1').write(data); style(s, `A1:G${data.length}`, 'A1:G1');
    s.getRange(`F2:F${data.length}`).setNumberFormat('0.00');
    await save(wb, path.join(root, '01-excel/input', `batch-${i + 1}.xlsx`));
    const img = await wb.render({sheetName: 'Orders', range: `A1:G${Math.min(data.length, 9)}`, scale: 1.5});
    await fs.writeFile(path.join(root, 'screenshots', `excel-input-${i + 1}.png`), new Uint8Array(await img.arrayBuffer()));
  }
}

export async function report(input, output) {
  if (!output.toLowerCase().endsWith('.xlsx')) throw new Error('Output filename must end with .xlsx');
  if (await fs.stat(output).then(() => true, () => false)) throw new Error('Output exists; choose a new filename to preserve previous results.');
  const files = (await fs.readdir(input)).filter(f => f.endsWith('.xlsx') && !f.startsWith('~$')).sort();
  if (!files.length) throw new Error('No .xlsx input files found.');
  if (files.some(f => path.resolve(input, f) === path.resolve(output))) throw new Error('Output must not overwrite an input workbook.');
  const records = [];
  for (const file of files) {
    const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(input, file)));
    for (const s of wb.worksheets.items) {
      if ((s.getUsedRange().formulas || []).some(row => row.some(v => v))) throw new Error(`${file}/${s.name}: use values-only inputs, not formulas.`);
      const data = s.getUsedRange().values;
      if (JSON.stringify(data[0]?.slice(0, 7).map(text)) !== JSON.stringify(headers)) throw new Error(`${file}/${s.name}: expected headers ${headers.join(', ')}`);
      data.slice(1).forEach((values, i) => {
        if (values.some(v => text(v))) records.push({values, source: `${file}/${s.name}:${i + 2}`});
      });
    }
  }
  const result = clean(records), {rows, issues} = result;
  if (!rows.length) throw new Error('No valid paid orders. No report was written.');
  const wb = Workbook.create(), summary = wb.worksheets.add('Summary'), detail = wb.worksheets.add('Orders'), audit = wb.worksheets.add('Exceptions');
  const n = rows.length + 1;
  detail.getRange('A1').write([['Order ID', 'Date', 'Channel', 'Product', 'Quantity', 'Unit price USD', 'Status', 'Source', 'Sales USD'], ...rows.map(r => [...r.map((v, i) => i === 1 ? new Date(v + 'T00:00:00Z') : literal(v)), null])]);
  detail.getRange(`B2:B${n}`).setNumberFormat('yyyy-mm-dd');
  detail.getRange(`F2:F${n}`).setNumberFormat('0.00');
  detail.getRange(`I2:I${n}`).formulas = rows.map((_, i) => [`=ROUND(E${i + 2}*F${i + 2},2)`]);
  detail.getRange(`I2:I${n}`).setNumberFormat('0.00');
  style(detail, `A1:I${n}`, 'A1:I1');
  detail.getRange(`H1:H${n}`).format.columnWidth = 35;
  detail.tables.add(`A1:I${n}`, true, 'PaidOrders'); detail.freezePanes.freezeRows(1);
  summary.getRange('A2').values = [['Sales report']];
  summary.getRange('A3').values = [['Demo store. USD. Paid orders only.']];
  summary.getRange('A5:B9').values = [['Metric', 'Value'], ['Input rows', records.length], ['Paid orders', rows.length], ['Excluded rows', issues.length], ['Sales USD', null]];
  summary.getRange('B9').formulas = [[`=SUM('Orders'!I2:I${n})`]];
  const channels = [...new Set(rows.map(r => r[2]))].sort();
  summary.getRange('A12').write([['Channel', 'Sales USD'], ...channels.map(c => [literal(c), null])]);
  summary.getRange(`B13:B${12 + channels.length}`).formulas = channels.map((_, i) => [`=SUMIFS('Orders'!$I$2:$I$${n},'Orders'!$C$2:$C$${n},A${13 + i})`]);
  style(summary, 'A1:D19', 'A5:B5');
  summary.getRange('A1:A19').format.columnWidth = 42;
  summary.getRange('A2').format.font = {size: 16, bold: true};
  summary.getRange('A12:B12').format = {fill: '#263C54', font: {bold: true, color: '#FFFFFF'}};
  summary.getRange('B9').setNumberFormat('"$"#,##0.00');
  summary.getRange(`B13:B${12 + channels.length}`).setNumberFormat('"$"#,##0.00');
  summary.getRange('A18').values = [['Source: synthetic demo inputs; not client work.']];
  audit.getRange('A1').write([['Source', 'Order ID', 'Reason', 'Original row'], ...issues.map(r => r.map(literal))]);
  style(audit, `A1:D${issues.length + 1}`, 'A1:D1');
  audit.getRange('A:A').format.columnWidth = 35; audit.getRange('C:C').format.columnWidth = 40; audit.getRange('D:D').format.columnWidth = 95;
  wb.recalculate();
  const expected = rows.reduce((s, r) => s + Math.round(r[4] * r[5] * 100), 0) / 100;
  assert.ok(Math.abs(summary.getRange('B9').values[0][0] - expected) < 0.00001);
  const original = detail.getRange('E2').values[0][0];
  detail.getRange('E2').values = [[original + 1]]; wb.recalculate();
  assert.ok(Math.abs(summary.getRange('B9').values[0][0] - expected - rows[0][5]) < 0.00001);
  detail.getRange('E2').values = [[original]]; wb.recalculate();
  console.log((await wb.inspect({kind: 'table', range: 'Summary!A5:B9', include: 'values,formulas', tableMaxRows: 5, tableMaxCols: 2})).ndjson);
  const scan = await wb.inspect({kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!', options: {useRegex: true, maxResults: 10}});
  console.log(scan.ndjson);
  await fs.mkdir(path.dirname(output), {recursive: true});
  await (await SpreadsheetFile.exportXlsx(wb)).save(output);
  for (const [sheetName, range] of [['Summary', 'A1:C19'], ['Orders', 'A1:I10'], ['Exceptions', `A1:D${issues.length + 1}`]]) {
    const img = await wb.render({sheetName, range, scale: 1.5});
    await fs.writeFile(path.join(root, 'screenshots', `excel-${sheetName.toLowerCase()}.png`), new Uint8Array(await img.arrayBuffer()));
  }
  const data = rows.map(r => ({id: r[0], date: r[1], channel: r[2], product: r[3], quantity: r[4], unit_price: r[5], cents: Math.round(r[4] * r[5] * 100)}));
  await fs.writeFile(output.replace(/\.xlsx$/i, '') + '.json', JSON.stringify({demo: true, orders: data, inputCount: records.length, excluded: issues.length}, null, 2));
  console.log(`Saved ${output}: ${rows.length} orders, $${expected.toFixed(2)}, ${issues.length} exceptions.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--demo')) await demoInputs();
    const args = process.argv.slice(2).filter(x => x !== '--demo');
    if (args.length !== 0 && args.length !== 2) throw new Error('Usage: node report.mjs [input-folder output.xlsx] [--demo]');
    await report(args[0] || path.join(root, '01-excel/input'), args[1] || path.join(root, 'outputs/demo/sales-report.xlsx'));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
