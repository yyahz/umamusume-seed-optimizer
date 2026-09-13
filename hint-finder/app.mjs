import { defaultState, readState, writeState, findCards, findCardSections, selectSkill, paginate, skillIds, familyName, groupSkills, TYPES } from './search.mjs';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const colors = { 速度:'#6aaff0', 耐力:'#ef8b90', 力量:'#e9ab47', 毅力:'#e58cba', 智力:'#82b76d', 友人:'#8cb690', 团队:'#a18ade' };
let data, skills, groups = [], groupById = new Map(), state = readState(location.search), suggestions = [], activeOption = -1;
const groupId = id => groupById.get(id)?.id ?? id;
const groupLabel = id => groupById.get(id)?.name || skills.get(id)?.name || `未知技能 ${id}`;
const normalizeSelection = () => { state.selected = [...new Set(state.selected.map(groupId))].slice(-1); };
let lastFocus, toastTimeout;
let resultTier = 'gold', tierSkill = null;
const dialog = $('#detail-dialog');

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 3000);
}
function openDialog(label, content) {
  lastFocus = document.activeElement;
  $('#dialog-label').textContent = label;
  $('#dialog-content').innerHTML = content;
  if (!dialog.open) dialog.showModal();
  $('#close-dialog').focus();
  bindImageFallbacks(dialog);
}
function bindImageFallbacks(root) {
  root.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', () => { img.hidden = true; }, { once:true });
    if (img.complete && !img.naturalWidth) img.hidden = true;
  });
}
function safeImageUrl(url) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname.endsWith('.hdslb.com') ? parsed.href : ''; }
  catch { return ''; }
}
function cardHeading(card, inlineSkills = false) {
  const image = safeImageUrl(card.image);
  return `<div class="${inlineSkills ? 'result-card-body' : 'card-heading'}"><div class="portrait"><span aria-hidden="true">${escape(card.character[0])}</span>${image ? `<img src="${escape(image)}" alt="${escape(card.character)}支援卡" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</div><div class="card-identity"><h3>${escape(card.character)}</h3><p class="card-title">${escape(card.title)}</p><div class="card-badges"><span class="rarity-badge ${card.rarity.toLowerCase()}">${card.rarity}</span><span class="type-badge"><span class="type-dot" style="--type-color:${colors[card.type]}"></span>${card.type}</span></div></div>${inlineSkills ? `<div class="inline-skills skill-pills">${allCardSkills(card).slice(0,3).map(pill).join('')}</div>` : ''}</div>`;
}
function skillAppearance(skill) {
  return `skill-tone tone-${skill.color || 'unknown'} rarity-${skill.rarity === 2 ? 'gold' : 'normal'}`;
}
function skillIcon(skill) {
  const url = safeImageUrl(skill.icon);
  return `<span class="skill-icon" aria-hidden="true">${url ? `<img src="${escape(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>`;
}
function pill(id) {
  const skill = skills.get(id);
  if (!skill) return '';
  return `<button class="skill-pill ${skillAppearance(skill)}${(state.selected.includes(groupId(id)) || skills.get(state.selected[0])?.lowerSkills?.some(s=>groupId(s.id)===groupId(id))) ? ' match' : ''}" data-skill="${id}" title="${escape(skill.wikiRarity)} · ${escape(skill.name)}">${skillIcon(skill)}<span>${escape(skill.name)}</span></button>`;
}
function allCardSkills(card) {
  const lower = skills.get(state.selected[0])?.lowerSkills || [];
  const priority = id => state.selected.includes(groupId(id)) ? 2 : lower.some(s=>groupId(s.id)===groupId(id)) ? 1 : 0;
  return [...skillIds(card)].sort((a,b)=>priority(b)-priority(a) || (skills.get(b)?.rarity || 0)-(skills.get(a)?.rarity || 0));
}
function renderCard(card) {
  return `<article class="support-card" style="--card-accent:${colors[card.type]}">${cardHeading(card,true)}<div class="card-footer"><span>共 ${allCardSkills(card).length} 个技能</span><button class="text-button" data-card="${card.id}" aria-label="查看${escape(card.name)}详情">查看详情 <span aria-hidden="true">↗</span></button></div></article>`;
}
function syncFilters() {
  document.querySelectorAll('[name=rarity]').forEach(i => { i.checked = state.rarities.includes(i.value); });
  document.querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-pressed', String(state.types.includes(b.dataset.type))));
}
function render(reset = true, updateUrl = true) {
  if (reset) { state.page = 1; state.lowerPage = 1; }
  if (tierSkill !== state.selected[0]) { resultTier = 'gold'; tierSkill = state.selected[0]; }
  syncFilters();
  const sections = findCardSections(data.cards, state, groups);
  const cards = sections.direct;
  const lowerPagination = paginate(sections.lower,state.lowerPage);
  state.lowerPage = lowerPagination.page;
  const pagination = paginate(cards, state.page);
  state.page = pagination.page;
  if (updateUrl) history.replaceState(null, '', `${location.pathname}?${writeState(state)}`);
  $('#result-count').textContent = cards.length;
  $('#result-summary').textContent = `已收录 ${data.meta.cards} 张支援卡 · ${data.meta.skills} 个技能`;
  $('#active-summary').textContent = `${state.selected.length ? groupLabel(state.selected[0]) : '未限定技能'}${state.types.length ? ` · ${state.types.join(' / ')}` : ''}`;
  $('#results').innerHTML = pagination.items.map(c=>renderCard(c)).join('');
  bindImageFallbacks($('#results'));
  const isGold = sections.target?.rarity === 2;
  if (isGold) $('#result-summary').textContent = '金技能 '+cards.length+' 张 · 仅下位白技能 '+sections.lower.length+' 张';
  $('#gold-heading').hidden = !isGold;
  $('#gold-heading').innerHTML = isGold ? '<h3>可获取目标金技能 · '+escape(sections.target.name)+'</h3><p>'+cards.length+' 张支援卡 · 金技能获取仍取决于实际育成条件</p>' : '';
  $('#lower-section').hidden = !isGold;
  $('#lower-description').textContent = isGold ? (sections.lowerSkills.length ? '下位技能：'+[...new Set(sections.lowerSkills.map(s=>familyName(s.name)))].join('、')+'。以下 '+sections.lower.length+' 张卡仅收录下位白技能，不能获取目标金技能「'+sections.target.name+'」（以当前快照为准）。' : '当前资料没有收录此金技能的下位白技能关系。') : '';
  $('#lower-results').innerHTML = isGold ? lowerPagination.items.map(c=>renderCard(c,'lower')).join('') : '';
  bindImageFallbacks($('#lower-results'));
  $('#lower-empty').hidden = sections.lower.length > 0;
  document.querySelectorAll('.lower-pagination').forEach(nav=>{nav.hidden=!sections.lower.length;nav.querySelector('.lower-page-label').textContent='第 '+lowerPagination.page+' / '+lowerPagination.totalPages+' 页';});
  document.querySelectorAll('[data-lower-offset]').forEach(b=>{b.disabled=Number(b.dataset.lowerOffset)<0 ? lowerPagination.page===1 : lowerPagination.page===lowerPagination.totalPages;});
  $('#empty-state').hidden = cards.length > 0;
  $('#empty-state h3').textContent = isGold ? '没有找到可获取目标金技能的支援卡' : '没有找到符合条件的支援卡';
  $('#empty-description').textContent = !state.rarities.length ? '尚未选择稀有度，请至少勾选一种。' : (isGold && sections.lower.length ? '可在下方查看仅提供下位白技能的支援卡，也可放宽稀有度或卡片类型。' : '试试放宽稀有度或卡片类型。当前资料为快照，可能未收录新卡。');
  document.querySelectorAll('.pagination:not(.lower-pagination)').forEach(nav=>{nav.hidden = cards.length === 0;nav.querySelector('.page-label').textContent = `第 ${pagination.page} / ${pagination.totalPages} 页`;});
  document.querySelectorAll('[data-page-offset]').forEach(button=>{button.disabled = Number(button.dataset.pageOffset)<0 ? pagination.page===1 : pagination.page===pagination.totalPages;});
  updateTierView();
  $('#results-end').textContent = cards.length ? `第 ${pagination.start}–${pagination.end} 张 · 共 ${cards.length} 张支援卡` : '';

}
function updateTierView() {
  const sections=findCardSections(data.cards,state,groups);
  const isGold=sections.target?.rarity===2;
  $('#tier-switch').hidden=!isGold;
  $('#direct-section').hidden=isGold && resultTier==='lower';
  $('#lower-section').hidden=!isGold || resultTier!=='lower';
  document.querySelectorAll('[data-result-tier]').forEach(button=>{
    const selected=button.dataset.resultTier===resultTier;
    button.setAttribute('aria-selected',String(selected));
    button.tabIndex=selected?0:-1;
    button.textContent=button.dataset.resultTier==='gold'?'金技能（'+sections.direct.length+'）':'下位白技能（'+sections.lower.length+'）';
  });
  if(isGold){
    const names=[...new Set(sections.lowerSkills.map(s=>familyName(s.name)))].join('、');
    $('#lower-heading').textContent=names?'下位白技能 · '+names:'暂无下位白技能资料';
    $('#lower-description').textContent='不能获取上位金技能「'+sections.target.name+'」。';
  }
}
function closeSuggestions() {
  $('#skill-options').hidden = true;
  $('#skill-input').setAttribute('aria-expanded', 'false');
  $('#skill-input').removeAttribute('aria-activedescendant');
  activeOption = -1;
}
function suggest() {
  if (!data) return;
  const query = familyName($('#skill-input').value);
  activeOption = -1;
  $('#skill-input').removeAttribute('aria-activedescendant');
  suggestions = groups.filter(s => (!query || s.names.some(name=>familyName(name).includes(query)))).sort((a,b) => Number(familyName(b.names[0]) === query) - Number(familyName(a.names[0]) === query) || a.name.localeCompare(b.name,'zh-CN')).slice(0,24);
  $('#skill-options').innerHTML = suggestions.length ? suggestions.map(s=>`<button type="button" role="option" aria-selected="false" tabindex="-1" id="option-${s.id}" class="suggestion ${skillAppearance(s)}" data-add="${s.id}"><span class="suggestion-name">${skillIcon(s)}${escape(s.name)}</span><small>${data.cards.filter(c=>skillIds(c,'all',groups).has(s.id)).length} 张卡</small></button>`).join('') : '<div class="suggestion-empty">未找到技能。<br>可试试缩短名称；未收录技能不会自动猜测。</div>';
  $('#skill-options').hidden = false;
  $('#skill-input').setAttribute('aria-expanded', 'true');
  bindImageFallbacks($('#skill-options'));
}
function addSkill(id) {
  id = groupId(id);
  if (!skills.has(id)) return;
  state = selectSkill(state,id);
  $('#skill-input').value = '';
  closeSuggestions();
  $('#skill-feedback').textContent = `已检索${skills.get(id).name}`;
  render();
}
function showSkill(id) {
  const skill = skills.get(id);
  if (!skill) return;
  const total = data.cards.filter(c=>skillIds(c,'all',groups).has(groupId(id))).length;
  openDialog('技能详情', `<h2 class="skill-detail-name ${skillAppearance(skill)}">${skillIcon(skill)}${escape(skill.name)}</h2><div class="dialog-tags"><span>${skill.rarity === 2 ? '稀有技能' : '普通技能'}</span><span>${escape(skill.scope || '适用范围未收录')}</span>${skill.cost != null ? `<span>基础技能点 ${skill.cost}</span>` : ''}</div><p>${escape(skill.description || '暂无技能描述。')}</p><p>可提供此技能的支援卡：${total} 张</p><p class="event-caveat">同名 ○／◎ 合并查找支援卡；此处保留原始技能名称和效果。检索金技能时，下位白技能支援卡会单独列在下方。</p><button class="primary-button dialog-action" data-add-dialog="${id}" ${state.selected.includes(groupId(id)) ? 'disabled' : ''}>${state.selected.includes(groupId(id)) ? '已加入检索' : '搜索此技能'}</button>`);
}
function showCard(id) {
  const card = data.cards.find(c=>c.id === id);
  if (!card) return;
  const ids=allCardSkills(card);
  openDialog('支援卡详情', `${cardHeading(card)}<h3>技能 · ${ids.length} 项</h3><div class="skill-pills">${ids.map(pill).join('')}</div><p class="event-caveat">卡片编号 ${card.id} · 简中服快照 ${data.meta.snapshotAt.slice(0,10)}</p>`);
}
function showAbout() {
  openDialog('数据与来源', `<h2>简中服资料，清楚标注来源。</h2><p>本工具根据目标技能反查支援卡，使用<a class="source-link" href="https://game.bilibili.com/tool/pd" target="_blank" rel="noopener noreferrer">吗哩吗哩工具箱简中服资料</a>。</p>${data ? `<div class="dialog-tags"><span>${data.meta.cards} 张支援卡</span><span>${data.meta.skills} 个技能</span><span>${data.meta.snapshotAt.slice(0,10)} 快照</span></div>` : ''}<h3>资料范围</h3><p>当前使用已归档的简中服快照，并非实时全量数据库。新卡与新增技能可能缺失；“没有找到”只表示本快照中未匹配。卡图从原始图片服务加载，失败时显示角色文字占位。</p><h3>检索方式</h3><p>每次选择新技能会替换上一次检索。金技能结果分为可获取金技能与仅可获取下位白技能两组，各自翻页；同时提供两者的卡只在金技能组显示。上下位关系来自 BWIKI 简中技能资料。</p><h3>技能配色</h3><p>图标类型色与普通／传说底色参考 BWIKI 简中技能速查表。选中标记保留技能原色。</p><h3>设计与致谢</h3><p>功能参考 <a href="https://daftuyda.moe/hints?mode=AND&rar=SSR%2CSR%2CR" target="_blank" rel="noopener noreferrer">UmaTools Hint Finder</a>；色彩、几何背景与马蹄装饰沿用 <a href="https://github.com/yyahz/umamusume-seed-searcher-android" target="_blank" rel="noopener noreferrer">种马搜索器 Android 项目</a>。马蹄素材源自赛马娘官方网站，游戏图片与相关素材版权归原权利人所有。本工具为非官方项目。</p>`);
}

$('#tier-switch').addEventListener('click',event=>{const button=event.target.closest('[data-result-tier]');if(!button)return;resultTier=button.dataset.resultTier;render(false);});
$('#tier-switch').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();resultTier=event.key==='Home'?'gold':event.key==='End'?'lower':resultTier==='gold'?'lower':'gold';render(false);document.querySelector('[data-result-tier="'+resultTier+'"]').focus();});
$('#about-button').addEventListener('click',showAbout);
$('#close-dialog').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{ if (event.target === dialog) { const r=dialog.getBoundingClientRect(); if(event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
dialog.addEventListener('close',()=>{ if (lastFocus?.isConnected) lastFocus.focus(); });
$('#dialog-content').addEventListener('click',event=>{
  const add=event.target.closest('[data-add-dialog]');
  if(add){addSkill(Number(add.dataset.addDialog));dialog.close();$('#skill-input').focus();return;}
  const skill=event.target.closest('[data-skill]'); if(skill)showSkill(Number(skill.dataset.skill));
});

async function init() {
  try {
    const response = await fetch('./data/cn.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    if(data.meta?.server !== 'cn' || !Array.isArray(data.cards) || !Array.isArray(data.skills)) throw new Error('数据格式不正确');
    skills = new Map(data.skills.map(s=>[s.id,s]));
    groups = groupSkills(data.skills);
    groupById = new Map(groups.flatMap(group=>group.ids.map(id=>[id,group])));
    normalizeSelection();
    $('#snapshot-date').textContent = data.meta.snapshotAt.slice(0,10).replaceAll('-','.');
    $('#type-filters').innerHTML = TYPES.map(type=>`<button class="type-choice" data-type="${type}" aria-pressed="false"><span class="type-dot" style="--type-color:${colors[type]}" aria-hidden="true"></span>${type}</button>`).join('');
    $('#load-status').hidden = true;
    $('#workbench').hidden = false;
    render(false);
    if(state.selected.some(id=>!skills.has(id))) toast('链接含有本快照未收录的技能编号，已保留为检索条件。');
  } catch(error) {
    $('#load-status').innerHTML = '<p>支援卡资料暂时无法加载，请检查网络后重试。</p><button class="primary-button" id="retry">重新加载</button>';
    $('#retry').addEventListener('click',init,{once:true});
    console.error('CN data load failed:',error);
  }
}
$('#skill-search-button').addEventListener('mousedown',event=>event.preventDefault());
$('#skill-search-button').addEventListener('click',()=>{
  if(!data)return;
  const query=familyName($('#skill-input').value);
  if(!query){$('#skill-input').focus();suggest();return;}
  suggest();
  const exact=suggestions.find(s=>familyName(s.name)===query);
  const chosen=exact || (suggestions.length===1?suggestions[0]:null);
  if(chosen){addSkill(chosen.id);$('#skill-input').blur();}
  else {$('#skill-input').focus();suggest();toast('请从候选列表选择具体技能');}
});
$('#skill-input').addEventListener('input',suggest);
$('#skill-input').addEventListener('focus',suggest);
$('#skill-input').addEventListener('keydown',event=>{
  if(event.isComposing) return;
  if(event.key === 'Escape'){closeSuggestions();return;}
  if(event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if($('#skill-options').hidden) suggest();
    if(!suggestions.length)return;
    activeOption = (activeOption + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
    document.querySelectorAll('.suggestion').forEach((button,index)=>button.setAttribute('aria-selected',String(index===activeOption)));
    const chosen=$(`#option-${suggestions[activeOption].id}`);
    $('#skill-input').setAttribute('aria-activedescendant',chosen.id);
    chosen.scrollIntoView({block:'nearest'});
  }
  if(event.key === 'Enter') {
    event.preventDefault();
    if($('#skill-options').hidden) suggest();
    const exact = suggestions.find(s=>familyName(s.name)===familyName($('#skill-input').value));
    const chosen = activeOption >= 0 ? suggestions[activeOption] : exact || (suggestions.length === 1 ? suggestions[0] : null);
    if(chosen)addSkill(chosen.id);
    else $('#skill-feedback').textContent='请从候选列表选择准确的技能名称。';
  }
});
$('#skill-options').addEventListener('pointerdown',e=>e.preventDefault());
// Older Android WebViews still synthesize mousedown after touch; keep focus until click.
$('#skill-options').addEventListener('mousedown',e=>e.preventDefault());
$('#skill-options').addEventListener('click',event=>{const b=event.target.closest('[data-add]');if(b)addSkill(Number(b.dataset.add));});
document.addEventListener('click',event=>{if(!event.target.closest('.skill-search') && !event.target.closest('#skill-options'))closeSuggestions();});
$('#skill-input').addEventListener('blur',closeSuggestions);
document.querySelectorAll('[name=rarity]').forEach(i=>i.addEventListener('change',()=>{state.rarities=[...document.querySelectorAll('[name=rarity]:checked')].map(i=>i.value);render();}));
$('#type-filters').addEventListener('click',event=>{const b=event.target.closest('[data-type]');if(!b)return;const type=b.dataset.type;state.types=state.types.includes(type)?state.types.filter(t=>t!==type):[...state.types,type];render();});
$('#reset-filters').addEventListener('click',()=>{state={...defaultState(),selected:state.selected};render();});
$('#filter-toggle').addEventListener('click',()=>{const expanded=$('#filter-toggle').getAttribute('aria-expanded')!=='true';$('#filter-toggle').setAttribute('aria-expanded',String(expanded));$('.secondary-filters').dataset.expanded=String(expanded);$('#filter-toggle').innerHTML=expanded?'收起 <span aria-hidden="true">⌃</span>':'展开 <span aria-hidden="true">⌄</span>';});
document.querySelector('.results-section').addEventListener('click',event=>{const skill=event.target.closest('[data-skill]');if(skill){showSkill(Number(skill.dataset.skill));return;}const card=event.target.closest('[data-card]');if(card)showCard(Number(card.dataset.card));});
$('#empty-action').addEventListener('click',()=>{state=defaultState();render();});
document.querySelectorAll('[data-page-offset]').forEach(button=>button.addEventListener('click',()=>{state.page+=Number(button.dataset.pageOffset);render(false);($('#gold-heading').hidden ? $('#results') : $('#gold-heading')).scrollIntoView({block:'start'});}));
document.querySelectorAll('[data-lower-offset]').forEach(button=>button.addEventListener('click',()=>{state.lowerPage+=Number(button.dataset.lowerOffset);render(false);$('#lower-heading').scrollIntoView({block:'start'});}));
window.addEventListener('popstate',()=>{if(!data)return;state=readState(location.search);normalizeSelection();render(false);});
init();
