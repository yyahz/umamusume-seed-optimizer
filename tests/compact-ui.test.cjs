const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../content.js'), 'utf8');

test('search depths are 2 through 5 and legacy depth 1 migrates to 2', () => {
  const clamp = vm.runInNewContext('(' + source.match(/function clampDepth\(value\) \{[^}]+\}/)[0] + ')');
  for (const value of [undefined, null, '', 'invalid', 0, 1, -1]) assert.equal(clamp(value), 2);
  for (const value of [2, 3, 4, 5]) assert.equal(clamp(String(value)), value);
  assert.equal(clamp(99), 5);
  const options = source.match(/<select class="select" id="depth">([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...options.matchAll(/value="(\d+)"/g)].map(m => +m[1]), [2, 3, 4, 5]);
  assert.match(source, /page <= state\.depth/);
  assert.match(source, /if \(!response\?\.data\?\.has_next_page\) break/);
});

function resolve(items, target, x, y, columns = '100px 100px') {
  const start = source.indexOf('function resolveDrop(event) {');
  const end = source.indexOf('list.addEventListener("dragstart"', start);
  const fn = vm.runInNewContext('(' + source.slice(start, end).trim() + ')', {
    list: { querySelectorAll: () => items }, draggedColor: 'blue',
    getComputedStyle: () => ({ gridTemplateColumns: columns })
  });
  return fn({ target: { closest: () => target }, clientX: x, clientY: y });
}
function card(color, left, top) {
  return { dataset: { color }, getBoundingClientRect: () => ({ left, top, width: 100, height: 46 }) };
}
test('compact color drag uses horizontal halves and works between rows', () => {
  const items = [card('blue', 0, 0), card('red', 108, 0), card('green', 0, 54), card('white', 108, 54)];
  assert.equal(resolve(items, items[1], 120, 20).placement, 'before');
  assert.equal(resolve(items, items[1], 190, 20).placement, 'after');
  const bottom = resolve(items, null, 210, 80);
  assert.equal(bottom.target, 'white');
  assert.equal(bottom.placement, 'after');
  assert.equal(resolve([], null, 0, 0), null);
});
test('compact color drag also supports the four-column layout', () => {
  const items = ['blue', 'red', 'green', 'white'].map((c, i) => card(c, i * 108, 0));
  assert.equal(resolve(items, null, 430, 23, '100px 100px 100px 100px').target, 'white');
  assert.equal(resolve(items, items[2], 218, 23).placement, 'before');
});
test('theme retains desktop geometry and centers the larger remove icon', () => {
  assert.match(source, /\.selected-remove\{padding:0;margin:0;appearance:none;display:flex;align-items:center;justify-content:center/);
  assert.match(source, /\.selected-remove svg\{width:21px;height:21px/);
  assert.match(source, /\.factor-drag-handle\{display:none\}/);
  assert.match(source, /min-height:46px;grid-template-columns:24px/);
  assert.match(source, /min-width:720px.*repeat\(4,minmax\(0,1fr\)\)/);
  assert.equal(source.includes('__FACETS__'), false);
  assert.equal(source.includes('__SHOES__'), false);
});
