export const RARITIES = ['SSR', 'SR', 'R'];
export const TYPES = ['速度', '耐力', '力量', '毅力', '智力', '友人', '团队'];
export const normalize = value => String(value).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '').replace(/[〇◯]/g, '○');
// Circle grades share a hint source; gold/white names are not inferred or merged.
export const familyName = name => normalize(name).replace(/(?:○\/◎|[○◎])$/u, '');
const canonicalCache = new WeakMap();
function canonicalIndex(groups) {
  if (!canonicalCache.has(groups)) canonicalCache.set(groups,new Map(groups.flatMap(g=>g.ids.map(id=>[id,g.id]))));
  return canonicalCache.get(groups);
}
export function groupSkills(skills) {
  const groups = new Map();
  for (const skill of skills) {
    const key = familyName(skill.name);
    if (!groups.has(key)) groups.set(key, { ...skill, ids: [], names: [], name: skill.name.replace(/[○◎〇◯]$/, '') });
    const group = groups.get(key);
    group.ids.push(skill.id);
    group.names.push(skill.name);
  }
  return [...groups.values()];
}
export function defaultState() {
  return { selected: [], rarities: [...RARITIES], types: [], page: 1, lowerPage: 1 };
}
export function readState(search) {
  const params = new URLSearchParams(search);
  const state = defaultState();
  state.selected = [...new Set((params.get('skills') || '').split(',').filter(s => /^\d+$/.test(s)).map(Number))].slice(-1);
  const page = Number(params.get('page'));
  state.page = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const lowerPage = Number(params.get('lowerPage'));
  state.lowerPage = Number.isSafeInteger(lowerPage) && lowerPage > 0 ? lowerPage : 1;
  if (params.has('rar')) state.rarities = RARITIES.filter(r => params.get('rar').split(',').includes(r));
  state.types = TYPES.filter(t => (params.get('types') || '').split(',').includes(t));
  return state;
}
export function writeState(state) {
  const p = new URLSearchParams();
  if (state.selected.length) p.set('skills', state.selected.join(','));
  if (state.lowerPage > 1) p.set('lowerPage',state.lowerPage);
  if (state.page > 1) p.set('page', state.page);
  p.set('rar', state.rarities.join(',') || 'none');
  if (state.types.length) p.set('types', state.types.join(','));
  return p.toString();
}
export function skillIds(card, source = 'all', groups = []) {
  const canonical = canonicalIndex(groups);
  return new Set((source === 'training' ? card.training : source === 'event' ? card.event : [...card.training, ...card.event]).map(id=>canonical.get(id) ?? id));
}
export function findCards(cards, state, groups = []) {
  const canonical = canonicalIndex(groups);
  const selected = [...new Set(state.selected.map(id=>canonical.get(id) ?? id))];
  const availableFor = card => new Set([...card.training,...card.event].map(id=>canonical.get(id) ?? id));
  return cards.filter(card => {
    if (!state.rarities.includes(card.rarity)) return false;
    if (state.types.length && !state.types.includes(card.type)) return false;
    const available = availableFor(card);
    if (!selected.length) return true;
    return selected.some(id => available.has(id));
  }).sort((a, b) => {
    const matched = c => selected.filter(id => availableFor(c).has(id)).length;
    return matched(b) - matched(a) || RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || b.id - a.id;
  });
}
export function paginate(items, requestedPage = 1, size = 18) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.max(1, Math.min(totalPages, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  const start = (page - 1) * size;
  return { page, totalPages, items: items.slice(start, start + size), start: items.length ? start + 1 : 0, end: Math.min(start + size, items.length) };
}

export function selectSkill(state, id) {
  return {...state, selected:[id], page:1, lowerPage:1};
}
export function findCardSections(cards, state, groups = []) {
  const direct = findCards(cards, state, groups);
  const target = groups.find(g=>g.ids.includes(state.selected[0]));
  if (target?.rarity !== 2) return {target, direct, lower:[], lowerSkills:[]};
  const lowerSkills = target.lowerSkills || [];
  const ids = lowerSkills.map(s=>s.id);
  const directIds = new Set(direct.map(c=>c.id));
  const lower = ids.length ? findCards(cards,{...state,selected:ids},groups).filter(c=>!directIds.has(c.id)) : [];
  return {target, direct, lower, lowerSkills};
}
