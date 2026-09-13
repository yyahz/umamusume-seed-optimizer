import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {groupSkills,defaultState,selectSkill,findCardSections,findCards,paginate,familyName} from '../hint-finder/search.mjs';
const data=JSON.parse(readFileSync(new URL('../hint-finder/data/cn.json',import.meta.url)));
const groups=groupSkills(data.skills);
test('gold results separate lower-only cards from cards supplying gold',()=>{
 const gold=groups.find(s=>s.name==='百万马力');
 const result=findCardSections(data.cards,selectSkill(defaultState(),gold.id),groups);
 assert.equal(result.direct.length,2);
 assert.equal(result.lower.length,7);
 assert.deepEqual(result.lowerSkills.map(s=>s.name),['十万马力']);
 assert.ok(result.lower.every(c=>!result.direct.some(d=>d.id===c.id)));
});
test('new skill replaces selection and resets both result pages',()=>{
 const old={...defaultState(),selected:[123],page:3,lowerPage:2};
 const skill=groups.find(s=>s.name==='直线能手');
 const next=selectSkill(old,skill.id);
 assert.deepEqual(next.selected,[skill.id]);
 assert.equal(next.page,1);assert.equal(next.lowerPage,1);
 assert.equal(findCards(data.cards,next,groups).length,26);
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
