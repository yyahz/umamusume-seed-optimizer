import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTable } from '../scripts/build-gold-skill-map.mjs';
import { parseSkillRows, parseCardIndex, parseCardSkillBadges } from '../scripts/bwiki-source.mjs';
import { releasedCards } from '../scripts/build-hint-catalog.mjs';

const row = { '3':'测试技能', '17':'20011', '7':'黄色' };
const part = (batch, rows) => `<div class="jn-json-part" data-batch="${batch}">[${rows.map(JSON.stringify).join(',')}, ]</div>`;

test('BWIKI loader supports legacy trailing commas and the complete batch format',()=>{
  assert.deepEqual(parseSkillRows(`<div id="jn-json">[${JSON.stringify(row)}, ]</div>`),[row]);
  assert.equal(parseSkillRows(part(0,[row])+part(1,[row])+part(2,[row]),3).length,3);
});
test('BWIKI loader refuses missing, duplicate, unexpanded, or incomplete batches',()=>{
  assert.throws(()=>parseSkillRows(part(0,[row])+part(2,[row])),/batch/);
  assert.throws(()=>parseSkillRows(part(0,[row])+part(0,[row])),/batch/);
  assert.throws(()=>parseSkillRows(part(0,[row]),2),/Incomplete/);
  assert.throws(()=>parseSkillRows('<div class="parseLoader-manual">{{#ask:query}}</div>'),/Missing/);
});
test('flat Lua descriptions allow braces, escaped newlines, quotes, and literal tabs',()=>{
  const lua = 'p.text_data_48={\n{index="1",text="占位 {0}\\n行\t\\\"引号\\\""},\n}\n';
  assert.deepEqual(parseTable(lua,'text_data_48'),[{index:'1',text:'占位 {0}\n行\t"引号"'}]);
});
test('card index joins stable card IDs to names and original BWIKI images',()=>{
  const html='<a title="简/【测试】角色"><img alt="Support thumb 30160.png" src="https://patchwiki.biligame.com/images/umamusume/thumb/a/ab/hash.png/100px-Support.png"></a>';
  assert.deepEqual(parseCardIndex(html),[{id:30160,name:'【测试】角色',image:'https://patchwiki.biligame.com/images/umamusume/a/ab/hash.png'}]);
  assert.throws(()=>parseCardIndex(''),/Missing/);
});
test('only skill badges inside the card skill section establish hints',()=>{
  const badge=name=>`<div class="sj-an"><a title="简/${name}"><img alt="Utx ico skill 20011.png"></a></div>`;
  const html=`<div class="support_card-bt">所持技能</div><b>事件技能</b>${badge('金技能')}<b>训练技能</b>${badge('白技能')}<div class="support_card-bt">育成事件</div>${badge('其他技能')}`;
  assert.deepEqual(parseCardSkillBadges(html),{event:[{name:'金技能',iconId:'20011'}],training:[{name:'白技能',iconId:'20011'}]});
  assert.throws(()=>parseCardSkillBadges(html.replace('<b>训练技能</b>','')),/labels/);
});
test('catalog dates exclude future and placeholder dates, not today',()=>{
  const rows=['2026-10-05T12:00:00+08:00','2026-10-06T00:00:00+08:00','2048-01-01T00:00:00+08:00'].map((date,id)=>({id,start_date:String(Date.parse(date)/1000)}));
  assert.deepEqual(releasedCards(rows,'2026-10-05').map(row=>row.id),[0]);
  assert.throws(()=>releasedCards([{id:1}],'2026-10-05'),/Missing/);
});
