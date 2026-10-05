import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseTable } from './build-gold-skill-map.mjs';
import { parseCardIndex, parseCardSkillBadges, parseSkillRows, plainText } from './bwiki-source.mjs';

export function releasedCards(rows, asOf) {
  const cutoff = Date.parse(`${asOf}T23:59:59+08:00`) / 1000;
  if (!Number.isFinite(cutoff)) throw new Error('Invalid catalog date');
  return rows.filter(row => {
    if (!/^\d+$/.test(row.start_date)) throw new Error(`Missing BWIKI start date: ${row.id}`);
    return Number(row.start_date) <= cutoff;
  });
}

export async function buildCatalog(directory, asOf, previous) {
  const input = name => fs.readFile(new URL(name, directory), 'utf8');
  const texts = await Promise.all(['cards.html','effects.lua','cards.lua','skills.lua','card-skills.json'].map(input));
  const colorPage = await input('skills.html');
  const batchCount = Number(colorPage.match(/data-batches="(\d+)"/)?.[1] || 1);
  const colorParts = await Promise.all(Array.from({length:batchCount}, (_,i) => input(`colors-${i}.html`)));
  const [indexHtml, effectLua, namesLua, skillLua, semanticJson] = texts;
  const index = parseCardIndex(indexHtml), indexById = new Map(index.map(card => [card.id, card]));
  const allCards = parseTable(effectLua, 'support_card_data');
  if (allCards.length !== index.length || allCards.some(card => !indexById.has(Number(card.id)))) throw new Error('BWIKI card index/module mismatch');
  const available = releasedCards(allCards, asOf);
  const availableIds = new Set(available.map(row => Number(row.id)));
  if (previous.cards.some(card => !availableIds.has(card.id))) throw new Error('BWIKI removed a previously indexed card; review required');
  const names = new Map(parseTable(skillLua, 'text_data_47').map(row => [row.index, row.text]));
  const descriptions = new Map(parseTable(skillLua, 'text_data_48').map(row => [row.index, row.text]));
  const cardNames = new Map(parseTable(namesLua, 'text_data_75').map(row => [Number(row.index), row.text]));
  const skillRows = parseTable(skillLua, 'skill_data'), skillById = new Map(skillRows.map(row => [Number(row.id), row]));
  const semantic = new Map(Object.values(JSON.parse(semanticJson).query?.results || {}).map(page => {
    const id = page.printouts?.ID;
    if (id?.length !== 1 || !/^\d+$/.test(String(id[0]))) throw new Error('Invalid BWIKI semantic card identity');
    return [Number(id[0]),page];
  }));
  if (semantic.size !== index.length) throw new Error('Incomplete BWIKI semantic card table');
  const colors = parseSkillRows(colorParts.join(''), Number(colorPage.match(/data-total="(\d+)"/)?.[1]) || undefined);
  const oldSkills = new Map(previous.skills.map(skill => [skill.id, skill]));
  const iconUrls = new Map(previous.skills.map(skill => [skillById.get(skill.id)?.icon_id, skill.icon]));
  const used = new Set(), cards = [], revisions = [], changed = [], unknownSkills = [];
  for (const row of available.sort((a, b) => Number(a.id) - Number(b.id))) {
    const id = Number(row.id), reference = indexById.get(id);
    const page = JSON.parse(await input(`pages/${id}.json`)).parse;
    if (page?.title !== '简/' + reference.name || !page.revid) throw new Error(`Wrong BWIKI card page: ${id}`);
    const badges = parseCardSkillBadges(page.text['*']);
    const semanticPage = semantic.get(id);
    if (semanticPage?.fulltext !== page.title) throw new Error(`BWIKI semantic card name mismatch: ${id}`);
    function skillIds(property, rendered) {
      const ids = semanticPage.printouts[property];
      if (!Array.isArray(ids) || ids.some(value=>!/^\d+$/.test(String(value)) || Number(value)<=0)) throw new Error(`Invalid BWIKI card skill IDs: ${id}`);
      const result = [...new Set(ids.map(Number))].filter(skillId=>{
        if (names.has(String(skillId)) && skillById.has(skillId)) return true;
        unknownSkills.push({cardId:id,skillId,property,reason:'Not present in BWIKI CN skill module; not rendered on CN card page'});
        return false;
      });
      const expected = result.map(skillId=>({name:names.get(String(skillId)),iconId:skillById.get(skillId)?.icon_id}));
      const sorted = list=>list.map(badge=>JSON.stringify(badge)).sort();
      if (expected.some(badge=>!badge.name || !badge.iconId) || JSON.stringify(sorted(expected)) !== JSON.stringify(sorted(rendered))) throw new Error(`BWIKI ${property} disagrees with rendered card: ${id}`);
      return result;
    }
    const training = skillIds('训练技能id',badges.training), event = skillIds('事件技能id',badges.event);
    const name = cardNames.get(id), match = name?.match(/^\[([\s\S]*?)\]([\s\S]+)$/);
    if (!match || reference.name.normalize('NFKC') !== `【${match[1]}】${match[2]}`.normalize('NFKC')) throw new Error(`BWIKI card name mismatch: ${id}`);
    const type = ({ '101':'速度', '105':'耐力', '102':'力量', '103':'毅力', '106':'智力' })[row.command_id] || ({'2':'友人','3':'团队'})[row.support_card_type];
    const rarity = ({'1':'R','2':'SR','3':'SSR'})[row.rarity];
    if (!type || !rarity) throw new Error(`Unknown BWIKI card type: ${id}`);
    const old = previous.cards.find(card => card.id === id);
    if (old && JSON.stringify([...old.training, ...old.event].sort()) !== JSON.stringify([...training, ...event].sort())) changed.push(id);
    // An empty/contradictory wiki field must not erase previously verified API hints.
    const card = old && old.source !== 'bwiki' ? {...old} : { id, name, character:match[2], title:match[1], rarity, type, image:reference.image,
      training:[...new Set(training)], event, events:[], source:'bwiki', availableAt:new Date(Number(row.start_date)*1000).toISOString() };
    cards.push(card); revisions.push({id, revision:page.revid});
    for (const skillId of [...card.training, ...card.event]) used.add(skillId);
  }
  const outputSkills = new Map();
  function addSkill(id) {
    if (outputSkills.has(id)) return;
    const row = skillById.get(id), name = names.get(String(id));
    if (!row || !name || !['1','2'].includes(row.rarity)) throw new Error(`Missing CN skill: ${id}`);
    const named = colors.filter(color => color['3'] === name && color['17'] === row.icon_id);
    const colorSet = new Set(named.map(color => color['7'])), raritySet = new Set(named.map(color => color['5']));
    if (colorSet.size !== 1 || raritySet.size !== 1) throw new Error(`Missing/ambiguous BWIKI color: ${id} ${name}`);
    const color = ({绿色:'green', 黄色:'yellow', 蓝色:'blue', 红色:'red', 紫色:'purple'})[[...colorSet][0]];
    const wikiRarity = [...raritySet][0];
    if (!color || !['传说','普通'].includes(wikiRarity)) throw new Error(`Unknown BWIKI rarity: ${id}`);
    const lower = row.rarity === '2' ? skillRows.filter(other => other.group_id === row.group_id && other.rarity === '1' && Number(other.grade_value) > 0)
      .sort((a, b) => Number(b.group_rate)-Number(a.group_rate)).map(other => ({id:Number(other.id), name:names.get(other.id), groupRate:Number(other.group_rate)})) : [];
    if (lower.some(skill => !skill.name)) throw new Error(`Missing lower skill: ${id}`);
    const old = oldSkills.get(id);
    outputSkills.set(id, { id, name, rarity:Number(row.rarity), description:descriptions.get(String(id)) || plainText(named[0]['8'] || ''),
      scope:plainText(named[0]['6'] || ''), cost:old?.cost ?? null, lowerSkills:lower,
      icon:iconUrls.get(row.icon_id) || '', color, wikiRarity });
    for (const skill of lower) addSkill(skill.id);
  }
  // Preserve existing deep links even if a skill is not currently offered by any card.
  for (const id of new Set([...used, ...oldSkills.keys()])) addSkill(id);
  const hash = createHash('sha256').update([...texts,...colorParts].join('\n')).update(JSON.stringify(revisions)).digest('hex');
  const dataset = {meta:{ server:'cn', source:'吗哩吗哩工具箱归档 + BWIKI 简中服增补', sourceUrl:'https://wiki.biligame.com/umamusume/简中协助卡一览',
    snapshotAt:new Date().toISOString(), sourceDataset:'mari_archive_bwiki_supplement_cn', sourceContentHash:hash,
    originalSnapshotAt:previous.meta.originalSnapshotAt || previous.meta.snapshotAt,
    originalSourceUrl:previous.meta.originalSourceUrl || previous.meta.sourceUrl,
    originalCards:previous.meta.originalCards || previous.cards.length,
    live:false, complete:false, decisionEligible:false, cards:cards.length, skills:outputSkills.size,
    availableThrough:asOf, wikiCards:index.length, futureCardsExcluded:index.length-cards.length,
    relationSourceUrl:'https://wiki.biligame.com/umamusume/模块:技能简中数据库内容', relationSnapshotAt:asOf,
    colorSourceUrl:'https://wiki.biligame.com/umamusume/简中技能速查表', colorSnapshotAt:asOf },
    cards, skills:[...outputSkills.values()].sort((a,b)=>a.id-b.id) };
  return { dataset, report:{asOf, previousCards:previous.cards.length, cards:cards.length, skills:outputSkills.size,
    added:cards.filter(card=>!previous.cards.some(old=>old.id===card.id)).map(card=>({id:card.id,name:card.name})),
    retainedExistingCards:true, wikiDisagreements:changed, futureCardsExcluded:index.length-cards.length, unknownSkills, contentHash:hash, revisions} };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [directoryPath, asOf] = process.argv.slice(2);
  if (!directoryPath || !asOf) throw new Error('Usage: node scripts/build-hint-catalog.mjs <download directory> <YYYY-MM-DD>');
  const directory = pathToFileURL(directoryPath.replace(/[\\/]?$/, '/'));
  const output = new URL('../hint-finder/data/cn.json', import.meta.url);
  const previous = JSON.parse(await fs.readFile(output, 'utf8'));
  const {dataset,report} = await buildCatalog(directory, asOf, previous);
  await fs.writeFile(new URL('catalog-report.json',directory), JSON.stringify(report,null,2));
  await fs.writeFile(output, JSON.stringify(dataset));
  console.log(JSON.stringify({...report,revisions:undefined},null,2));
}
