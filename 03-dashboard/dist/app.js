'use strict';
const $ = id => document.getElementById(id);
const money = cents => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(cents / 100);
const names = {Online: '线上商店', Retail: '线下零售', Wholesale: '批发'};
const data = window.DEMO;
let filtered = [];
function cell(row, value) {const td = document.createElement('td'); td.textContent = value; row.append(td);}
function tableRow(target, values) {const tr = document.createElement('tr'); values.forEach(v => cell(tr, v)); target.append(tr);}
function view(name) {
  for (const id of ['sales', 'contacts', 'projects']) $(id).hidden = id !== name;
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
  $('export').hidden = name !== 'sales';
}
function update() {
  const start = $('start').value, end = $('end').value, channel = $('channel').value, q = $('query').value.trim().toLowerCase();
  const invalid = !!(start && end && start > end);
  $('range-error').hidden = !invalid;
  filtered = invalid ? [] : data.orders.filter(r => (!start || r.date >= start) && (!end || r.date <= end) && (!channel || r.channel === channel) && `${r.id} ${r.product}`.toLowerCase().includes(q));
  const total = filtered.reduce((s, r) => s + r.cents, 0);
  $('revenue').textContent = money(total); $('count').textContent = filtered.length;
  $('average').textContent = filtered.length ? money(total / filtered.length) : '—';
  $('units').textContent = filtered.reduce((s, r) => s + r.quantity, 0);
  $('table-count').textContent = `${filtered.length} 条记录`; $('empty').hidden = filtered.length > 0;
  $('orders').replaceChildren();
  [...filtered].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)).forEach(r => tableRow($('orders'), [r.id, r.date, r.product, names[r.channel] || r.channel, r.quantity, money(r.cents)]));
  const daily = {}, channels = {};
  filtered.forEach(r => {daily[r.date] = (daily[r.date] || 0) + r.cents; channels[r.channel] = (channels[r.channel] || 0) + r.cents;});
  $('daily').replaceChildren();
  const max = Math.max(1, ...Object.values(daily));
  Object.entries(daily).sort().forEach(([date, cents]) => {
    const group = document.createElement('div'); group.className = 'bar-group'; group.title = `${date}: ${money(cents)}`;
    const bar = document.createElement('div'); bar.className = 'bar'; bar.style.height = `${cents / max * 100}%`;
    const label = document.createElement('span'); label.className = 'bar-label'; label.textContent = date.slice(5);
    group.append(bar, label); $('daily').append(group);
  });
  $('daily').setAttribute('aria-label', filtered.length ? Object.entries(daily).sort().map(([d, c]) => `${d}: ${money(c)}`).join('; ') : '没有符合条件的销售数据');
  $('channels').replaceChildren();
  Object.entries(channels).sort((a, b) => b[1] - a[1]).forEach(([name, cents]) => {
    const item = document.createElement('div'); item.className = 'channel';
    const top = document.createElement('div'); top.className = 'channel-top';
    const label = document.createElement('span'); label.textContent = names[name] || name;
    const value = document.createElement('span'); value.textContent = money(cents); top.append(label, value);
    const track = document.createElement('div'); track.className = 'track';
    const fill = document.createElement('div'); fill.className = 'fill'; fill.style.width = `${total ? cents / total * 100 : 0}%`; track.append(fill);
    item.append(top, track); $('channels').append(item);
  });
  $('export').disabled = filtered.length === 0;
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => view(b.dataset.view)));
$('back-sales').addEventListener('click', () => view('sales'));
for (const channel of [...new Set(data.orders.map(r => r.channel))].sort()) {const o = document.createElement('option'); o.value = channel; o.textContent = names[channel] || channel; $('channel').append(o);}
for (const id of ['channel', 'start', 'end', 'query']) $(id).addEventListener('input', update);
$('reset').addEventListener('click', () => {for (const id of ['channel', 'start', 'end', 'query']) $(id).value = ''; update();});
$('export').addEventListener('click', () => {
  const csvCell = v => {let s = String(v); if (/^[=+@-]/.test(s.trimStart())) s = "'" + s; return '"' + s.replaceAll('"', '""') + '"';};
  const csv = [['order_id', 'date', 'channel', 'product', 'quantity', 'sales_usd'], ...filtered.map(r => [r.id, r.date, r.channel, r.product, r.quantity, (r.cents / 100).toFixed(2)])].map(r => r.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], {type: 'text/csv;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url; a.download = 'filtered-orders.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('contact-in').textContent = data.contacts.audit.input; $('contact-ok').textContent = data.contacts.audit.accepted; $('contact-bad').textContent = data.contacts.audit.rejected;
data.contacts.rows.forEach(r => tableRow($('contact-table'), [r.name, r.email, r.company]));
const reasons = {'Invalid email format': '邮箱格式错误', 'Missing name': '缺少姓名', 'Duplicate email (first valid record retained)': '邮箱重复，保留首条有效记录'};
data.contacts.audit.issues.forEach(r => tableRow($('issue-table'), [r.record, r.original.email || '—', reasons[r.reason] || r.reason]));
update();
