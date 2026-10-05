import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readWiki, parseCardIndex, decodeText } from './bwiki-source.mjs';
import { parseTable } from './build-gold-skill-map.mjs';
import { buildCatalog, releasedCards } from './build-hint-catalog.mjs';

const [asOf, cachePath] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf || '') || !cachePath) throw new Error('Usage: node scripts/refresh-hint-catalog.mjs YYYY-MM-DD <cache directory>');
const directory = pathToFileURL(resolve(cachePath) + '/');
await fs.mkdir(directory,{recursive:true});
await fs.mkdir(new URL('pages/',directory),{recursive:true});
const modules = {'模块:简中数据库内容':'cards.lua','模块:简中支援卡效果数据库内容':'effects.lua',
  '模块:技能简中数据库内容':'skills.lua'};
const response = await readWiki({action:'query',prop:'revisions',rvprop:'content|ids|timestamp',rvslots:'main',titles:Object.keys(modules).join('|')});
const moduleRevisions = [];
for (const page of Object.values(response.query?.pages || {})) {
  const revision = page.revisions?.[0], source = revision?.slots?.main?.['*'];
  if (!source || !modules[page.title]) throw new Error('Missing BWIKI module');
  await fs.writeFile(new URL(modules[page.title],directory),source);
  moduleRevisions.push({title:page.title,revision:revision.revid,timestamp:revision.timestamp});
}
if (moduleRevisions.length !== Object.keys(modules).length) throw new Error('Incomplete BWIKI module response');
const semantic=await readWiki({action:'ask',query:'[[分类:简中支援卡]]|?ID|?训练技能id|?事件技能id|limit=500'});
await fs.writeFile(new URL('card-skills.json',directory),JSON.stringify(semantic));
for (const [title,file] of [['简中协助卡一览','cards.html'],['简中技能速查表','skills.html']]) {
  const page = await readWiki({action:'parse',page:title,prop:'text|revid'});
  await fs.writeFile(new URL(file,directory),page.parse.text['*']);
}
const colorPage = await fs.readFile(new URL('skills.html',directory),'utf8');
const batches = [...colorPage.matchAll(/<div class="parseLoader-manual"[^>]*>([\s\S]*?)<\/div>/g)].map(([,body])=>decodeText(body).trim());
if (batches.length) {
  if (batches.length !== Number(colorPage.match(/data-batches="(\d+)"/)?.[1])) throw new Error('Incomplete BWIKI batch loader');
  for (let i=0;i<batches.length;i++) {
    const page = await readWiki({action:'parse',text:batches[i],contentmodel:'wikitext',prop:'text',title:'简中技能速查表'});
    await fs.writeFile(new URL(`colors-${i}.html`,directory),page.parse.text['*']);
  }
} else { await fs.writeFile(new URL('colors-0.html',directory),colorPage); }
const all = parseCardIndex(await fs.readFile(new URL('cards.html',directory),'utf8'));
const released = new Set(releasedCards(parseTable(await fs.readFile(new URL('effects.lua',directory),'utf8'),'support_card_data'),asOf).map(row=>Number(row.id)));
const cards = all.filter(card=>released.has(card.id));
let cursor=0, completed=0;
await Promise.all(Array.from({length:2},async()=>{
  while(cursor<cards.length) {
    const card=cards[cursor++];
    const page=await readWiki({action:'parse',page:'简/'+card.name,prop:'text|revid'});
    await fs.writeFile(new URL(`pages/${card.id}.json`,directory),JSON.stringify(page));
    if(++completed%20===0) console.log(`BWIKI cards: ${completed}/${cards.length}`);
  }
}));
const output=new URL('../hint-finder/data/cn.json',import.meta.url);
const previous=JSON.parse(await fs.readFile(output,'utf8'));
const {dataset,report}=await buildCatalog(directory,asOf,previous);
await fs.writeFile(new URL('catalog-report.json',directory),JSON.stringify({...report,moduleRevisions},null,2));
// All pages, names, hints, dates, and colors have passed validation before touching the packaged dataset.
await fs.writeFile(output,JSON.stringify(dataset));
console.log(JSON.stringify({...report,revisions:undefined,moduleRevisions},null,2));
