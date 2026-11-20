import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {groupSkills,defaultState,selectSkill,findCardSections,findCards,paginate,familyName,safeImageUrl} from '../hint-finder/search.mjs';
const data=JSON.parse(readFileSync(new URL('../hint-finder/data/cn.json',import.meta.url)));
const groups=groupSkills(data.skills);
test('gold results separate lower-only cards from cards supplying gold',()=>{
 const gold=groups.find(s=>s.name==='百万马力');
 const result=findCardSections(data.cards,selectSkill(defaultState(),gold.id),groups);
 assert.ok(result.direct.some(card=>card.id===30064));
 assert.ok(result.lower.some(card=>card.id===30046));
 assert.deepEqual(result.lowerSkills.map(s=>s.name),['十万马力']);
 assert.ok(result.lower.every(c=>!result.direct.some(d=>d.id===c.id)));
});
test('new skill replaces selection and resets both result pages',()=>{
 const old={...defaultState(),selected:[123],page:3,lowerPage:2};
 const skill=groups.find(s=>s.name==='直线能手');
 const next=selectSkill(old,skill.id);
 assert.deepEqual(next.selected,[skill.id]);
 assert.equal(next.page,1);assert.equal(next.lowerPage,1);
 assert.ok(findCards(data.cards,next,groups).some(card=>card.id===30072));
 assert.deepEqual(old.selected,[123]);
});
test('circle skill grades resolve to identical support sources',()=>{
 assert.equal(familyName('顺时针◎'),familyName('顺时针○'));
 const sample=groupSkills([{id:1,name:'顺时针○'},{id:2,name:'顺时针◎'}]);
 const cards=[{id:1,rarity:'SSR',training:[1],event:[]},{id:2,rarity:'SR',training:[],event:[2]}];
 const results=[1,2].map(id=>findCards(cards,selectSkill(defaultState(),id),sample).map(c=>c.id));
 assert.deepEqual(results[0],[1,2]);assert.deepEqual(results[1],results[0]);
});
test('pagination clamps after filtering and never overlaps pages',()=>{
 const first=paginate(data.cards,1),second=paginate(data.cards,2);
 assert.ok(first.items.every(c=>!second.items.some(d=>d.id===c.id)));
 assert.equal(paginate([],99).page,1);
 assert.equal(paginate(data.cards.slice(0,2),99).page,1);
});

test('BWIKI supplement preserves verified archive cards and excludes forecast cards',()=>{
 assert.equal(data.cards.length,data.meta.cards);
 assert.equal(data.skills.length,data.meta.skills);
 const original=data.cards.filter(card=>card.source!=='bwiki').sort((a,b)=>a.id-b.id);
 assert.equal(original.length,300);
 assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'),'577e82ddce03aa97949f7b13f5b26f86650dd870811c73e78adad5ff9598c189');
 const cutoff=Date.parse(data.meta.availableThrough+'T23:59:59+08:00');
 assert.ok(cutoff>=Date.parse('2026-11-20T23:59:59+08:00'));
 const supplemental=data.cards.filter(card=>card.source==='bwiki');
 assert.ok(supplemental.length>=41);
 assert.ok(supplemental.every(card=>Date.parse(card.availableAt)<=cutoff));
 const ids=new Set(data.skills.map(skill=>skill.id));
 assert.ok(data.cards.every(card=>[...card.training,...card.event].every(id=>ids.has(id))));
});

test('October releases are searchable with complete skill colors and lower gold relationships',()=>{
 for(const id of [20069,30169,30170,30171,30172]) {
  const card=data.cards.find(card=>card.id===id);
  assert.ok(card,`Missing released card: ${id}`);
  assert.equal(card.source,'bwiki');
  assert.ok(Date.parse(card.availableAt)<=Date.parse('2026-10-22T23:59:59+08:00'));
  for(const skillId of [...card.training,...card.event]) {
   const skill=data.skills.find(skill=>skill.id===skillId);
   assert.ok(skill,`Missing skill: ${skillId}`);
   assert.ok(['green','blue','yellow','red','purple'].includes(skill.color));
   assert.ok(safeImageUrl(skill.icon),`Missing skill icon: ${skill.name}`);
  }
 }
 const target=groups.find(skill=>skill.name==='打飞它吧！');
 assert.ok(target);
 const sections=findCardSections(data.cards,selectSkill(defaultState(),target.id),groups);
 assert.ok(sections.direct.some(card=>card.id===30172));
 assert.deepEqual(sections.lowerSkills.map(skill=>skill.name),['迈向胜利']);
 assert.ok(sections.lower.every(card=>card.id!==30172));
});

test('new mid-distance gold skill keeps existing white-only support results',()=>{
 const target=groups.find(skill=>skill.name==='瞬息万变');
 assert.ok(target);
 const sections=findCardSections(data.cards,selectSkill(defaultState(),target.id),groups);
 assert.ok(sections.direct.some(card=>card.id===30169));
 assert.ok(sections.lower.length>0);
 assert.ok(sections.lowerSkills.every(skill=>familyName(skill.name)==='中距离直线'));
 assert.ok(sections.lower.every(card=>card.id!==30169));
});
test('new gold hint resolves to its new card and separates lower white hints',()=>{
 const target=groups.find(skill=>skill.name==='迫近的暗影');
 const sections=findCardSections(data.cards,selectSkill(defaultState(),target.id),groups);
 assert.ok(sections.direct.some(card=>card.id===30164));
 assert.deepEqual(sections.lowerSkills.map(skill=>skill.name),['一鼓作气']);
 assert.ok(sections.lower.some(card=>card.id===30168));
 assert.ok(sections.lower.every(card=>card.id!==30164));
 const sharedGold=groups.find(skill=>skill.name==='永不言弃');
 const sources=findCards(data.cards,selectSkill(defaultState(),sharedGold.id),groups);
 assert.ok(sources.some(card=>card.id===30160), '佐岳鸣 still supplies 永不言弃');
 assert.ok(sources.some(card=>card.id===30178), '鸣声雷动 supplies 永不言弃');
});
test('冬日寒风 finds the new 目白拉莫娜 card and both grades of the lower white skill',()=>{
 const target=groups.find(skill=>skill.name==='冬日寒风');
 assert.equal(target.color,'green');
 assert.ok(safeImageUrl(target.icon));
 const sections=findCardSections(data.cards,selectSkill(defaultState(),target.id),groups);
 assert.ok(sections.direct.some(card=>card.id===30175));
 assert.deepEqual(sections.lowerSkills.map(skill=>skill.name),['冬季优俊少女◎','冬季优俊少女○']);
 assert.ok(sections.lower.length>0);
 assert.ok(sections.lower.every(card=>!sections.direct.some(direct=>direct.id===card.id)));
});
test('images permit only HTTPS on the original service and exact BWIKI image host',()=>{
 assert.ok(safeImageUrl('https://i0.hdslb.com/image.png'));
 assert.ok(safeImageUrl('https://patchwiki.biligame.com/images/card.png'));
 for(const url of ['http://patchwiki.biligame.com/card.png','https://patchwiki.biligame.com.evil.example/card.png','https://evil.patchwiki.biligame.com/card.png','https://user:pass@patchwiki.biligame.com/card.png','javascript:alert(1)','file:///private.png'])assert.equal(safeImageUrl(url),'');
});
