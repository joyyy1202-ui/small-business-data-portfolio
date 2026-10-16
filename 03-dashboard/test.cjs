const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
function element() { return {value:'',hidden:false,children:[],listeners:{},style:{},dataset:{},append(...x){this.children.push(...x)},replaceChildren(){this.children=[]},setAttribute(){},addEventListener(k,f){this.listeners[k]=f},click(){}}; }
const get = id => {if (!elements.has(id)) elements.set(id,element()); return elements.get(id)};
let exported;
const context = vm.createContext({window:{},document:{getElementById:get,createElement:element,querySelectorAll:()=>[]},Intl,Blob,URL:{createObjectURL:b=>(exported=b,'blob:test'),revokeObjectURL(){}},setTimeout:f=>f()});
for (const f of ['data.js','app.js']) vm.runInContext(fs.readFileSync(`${__dirname}/dist/${f}`,'utf8'),context);
assert.equal(get('count').textContent,23); assert.equal(get('revenue').textContent,'$1,733.00');
get('channel').value='Online'; get('start').value='2026-10-01'; get('end').value='2026-10-04'; get('channel').listeners.input();
assert.equal(get('count').textContent,4); assert.equal(get('revenue').textContent,'$140.00'); assert.equal(get('units').textContent,9);
get('export').listeners.click();
(async()=>{const csv=await exported.text(); assert.equal(csv.split('\r\n').length,5); assert.ok(csv.includes('"72.00"'));
get('query').value='no-match'; get('query').listeners.input(); assert.equal(get('count').textContent,0); assert.equal(get('export').disabled,true);
get('start').value='2026-10-20'; get('start').listeners.input(); assert.equal(get('range-error').hidden,false);
get('reset').listeners.click(); assert.equal(get('count').textContent,23);
assert.equal(get('contact-table').children.length,5); assert.equal(get('issue-table').children.length,3);
console.log('Dashboard checks passed: totals, inclusive filters, CSV contents, empty/invalid ranges, reset, contacts.');})().catch(e=>{console.error(e);process.exitCode=1});
