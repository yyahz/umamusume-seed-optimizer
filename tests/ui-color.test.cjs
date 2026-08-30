const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const contentSource = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");

test("factor UI includes the current official foreground and background palette", () => {
  const officialTokens = [
    "#008AC5", "#DFF6FD",
    "#E84B85", "#FFECF1",
    "#4E8E04", "#E3F2C8",
    "#4D5D7C", "#EBEFF4",
    "#AA7D00", "#FFF5BF"
  ];

  for (const token of officialTokens) {
    assert.ok(contentSource.includes(token), `missing official factor color ${token}`);
  }
});

test("white factor subtypes keep scenario gold separate from skill and race blue-gray", () => {
  assert.match(contentSource, /剧本:\s*\{[^}]*color:\s*"#AA7D00"[^}]*soft:\s*"#FFF5BF"/);
  assert.match(contentSource, /技能:\s*\{[^}]*color:\s*"#4D5D7C"[^}]*soft:\s*"#EBEFF4"/);
  assert.match(contentSource, /比赛:\s*\{[^}]*color:\s*"#4D5D7C"[^}]*soft:\s*"#EBEFF4"/);
});

test("result cards keep names, star values, and the copy action compact", () => {
  assert.equal(contentSource.includes("好友种马 #"), false);
  assert.equal(contentSource.includes("${match.stars}/${match.minStars}★"), false);
  assert.equal(contentSource.includes("${match.selfStars}/${match.minSelfStars}★"), false);
  assert.match(contentSource, /\.copy-button\s*\{[^}]*white-space:nowrap/);
});

test("result cards append all unrequested factors without duplicates", () => {
  assert.match(contentSource, /summarizeCandidateFactors\(item\.candidate\)/);
  assert.match(contentSource, /requestedKeys\.has\(ranking\.factorKey\(factor\.type, factor\.num\)\)/);
  assert.match(contentSource, /title="该种马的其他\$\{factorMeta\.name\}"/);
  assert.equal(contentSource.includes("item.matches.slice(0, 10)"), false);
});

test("result cards place selected blue and red factors before selected green and white factors", () => {
  assert.match(contentSource, /match\.colorId === "blue" \|\| match\.colorId === "red"/);
  assert.match(contentSource, /const requested = \[\.\.\.requestedBlueRed, \.\.\.requestedOther\]/);
  assert.match(contentSource, /const typeOrder = new Map\(\[1, 2, 3, 4, 5, 6\]/);
});

test("result cards show selected factors first and every remaining factor without collapsing", () => {
  assert.match(contentSource, /<b>筛选因子<\/b><span>\$\{requested\.length\} 项，优先展示<\/span>/);
  assert.match(contentSource, /<b>该种马其他因子<\/b><span>\$\{additional\.length\} 项，全部展示<\/span>/);
  assert.match(contentSource, /ranking\.summarizeCandidateFactors\(item\.candidate\)/);
  assert.match(contentSource, /class="match-chip selected-factor/);
  assert.match(contentSource, /class="match-chip other-factor"/);
  assert.equal(contentSource.includes("展开其他因子"), false);
});

test("selected factors can be reset in one click and restored", () => {
  assert.match(contentSource, /id="reset-factors"[^>]*>重置因子<\/button>/);
  assert.match(contentSource, /function resetSelectedFactors\(\)/);
  assert.match(contentSource, /state\.selected\.clear\(\)/);
  assert.match(contentSource, /撤销本次重置/);
  assert.match(contentSource, /角色、颜色顺序和搜索范围保持不变/);
  assert.match(contentSource, /state\.results = Array\.isArray\(undo\.results\)/);
});

test("white factors expose required after high, medium, and low", () => {
  assert.match(contentSource, /\[1, 2, 3, \.\.\.\(colorId === "white" \? \[ranking\.REQUIRED_TIER\]/);
  assert.match(contentSource, /value === ranking\.REQUIRED_TIER \? "必需" : \["高", "中", "低"\]\[value - 1\]/);
  assert.match(contentSource, /必须双门槛达标/);
  assert.match(contentSource, /必需达标/);
});

test("self star selectors include zero as no self-factor requirement", () => {
  assert.match(contentSource, /MAX_SELF_STARS \+ 1/);
  assert.match(contentSource, /stars === 0 \? " · 本体无要求"/);
  assert.match(contentSource, /本体 0★ 表示本体可以没有该因子/);
});

test("color order explains its equal-score tie breaker", () => {
  assert.match(contentSource, /综合分相同时也会严格按本顺序逐色比较/);
});

test("new factors default to zero self stars", () => {
  assert.match(contentSource, /默认家系 1★、本体 0★/);
  assert.match(contentSource, /minSelfStars: previous\?\.minSelfStars \?\? ranking\.DEFAULT_SELF_STARS/);
});

test("gold skills show their mapped lower white factor in catalog and selection UI", () => {
  assert.match(contentSource, /gold-skill/);
  assert.match(contentSource, /金技能 → \$\{factor\.lowerSkillName\}/);
  assert.match(contentSource, /对应因子：\$\{escapeHtml\(factor\.lowerSkillName\)\}/);
  assert.match(contentSource, /goldSkillMap\.extendFactorCatalog\(liveFactors\)/);
});

test("long gold skill names wrap instead of appearing partially loaded", () => {
  assert.match(contentSource, /\.gold-skill \.factor-option-name\s*\{[^}]*white-space:normal/);
  assert.match(contentSource, /\.factor-option-mapping\s*\{[^}]*overflow-wrap:anywhere/);
});

test("all factor names wrap instead of being truncated with an ellipsis", () => {
  assert.match(contentSource, /\.factor-option-name\s*\{[^}]*white-space:normal/);
  assert.match(contentSource, /\.factor-option-name\s*\{[^}]*overflow-wrap:anywhere/);
  assert.equal(/\.factor-option-name\s*\{[^}]*text-overflow:ellipsis/.test(contentSource), false);
});

test("panel header uses the packaged extension icon and a safe BWIKI source link", () => {
  assert.match(contentSource, /chrome\.runtime\.getURL\("icons\/icon-48\.png"\)/);
  assert.match(contentSource, /class="brand-mark"><img/);
  assert.match(contentSource, /class="launcher-icon" src="\$\{extensionIconUrl\}"/);
  assert.match(contentSource, /\.launcher-icon\s*\{[^}]*width:30px[^}]*height:30px/);
  assert.match(contentSource, /class="source-link" href="https:\/\/wiki\.biligame\.com\/umamusume\/"/);
  assert.match(contentSource, /target="_blank" rel="noopener noreferrer"/);
  assert.match(contentSource, />数据来源：BWIKI<\/a>/);
  assert.match(contentSource, /种马搜索器<span class="brand-credit">by Songe<\/span>/);
  assert.match(contentSource, /\.brand-credit\s*\{[^}]*opacity:\.68[^}]*font-size:10px/);
});

test("product-facing text consistently uses the searcher name", () => {
  assert.match(contentSource, /aria-label="打开种马搜索器"/);
  assert.match(contentSource, /<span>种马搜索器<\/span>/);
  assert.match(contentSource, /id="optimizer-title">种马搜索器<span class="brand-credit">by Songe<\/span><\/h1>/);
  assert.equal(contentSource.includes("种马优选器"), false);
});

test("bulk recognition accumulates batches and applies sequential skill priority tiers once", () => {
  assert.match(contentSource, /recognitionBatches: \[\]/);
  assert.match(contentSource, /function mergeRecognitionItems\(extraItems = \[\]\)/);
  assert.match(contentSource, /id="stage-factor-recognition"/);
  assert.match(contentSource, /id="apply-pending-recognition"/);
  assert.match(contentSource, /id="clear-pending-recognition"/);
  assert.match(contentSource, /planSequentialSkillTiers\?\.\(newItems\)/);
  assert.match(contentSource, /前 10 项高，第 11–20 项中，第 21 项以后低/);
  assert.match(contentSource, /<span>\$\{\["高", "中", "低"\]\[plannedTier - 1\]\}\$\{tierNote\}<\/span>/);
  assert.match(contentSource, /tierByKey\.get\(key\) \?\? 1/);
  assert.match(contentSource, /state\.recognitionBatches = \[\]/);
});

test("smart recognition is an optional mode inside factor selection", () => {
  assert.match(contentSource, /smartRecognitionEnabled: false/);
  assert.match(contentSource, /id="smart-recognition-toggle"/);
  assert.match(contentSource, /不勾选时从下方目录逐项选择/);
  assert.match(contentSource, /state\.smartRecognitionEnabled \? `<div class="smart-recognition-panel"/);
});

test("role catalog uses three-row pagination instead of progressive loading", () => {
  assert.match(contentSource, /const ROLE_PAGE_SIZE = 6/);
  assert.match(contentSource, /data-role-page="previous"/);
  assert.match(contentSource, /data-role-page="next"/);
  assert.match(contentSource, /class="catalog-page-status" aria-live="polite"/);
  assert.equal(contentSource.includes("role-catalog-more"), false);
  assert.equal(contentSource.includes("roleCatalogLimit"), false);
});

test("selected white factors remain visible across subtype tabs", () => {
  assert.match(contentSource, /function renderSelectedForColor\(colorId\)[\s\S]*?\.filter\(\(item\) => item\.colorId === colorId\);/);
  assert.equal(/function renderSelectedForColor\(colorId\)[\s\S]*?item\.subtype === state\.activeSubtype[\s\S]*?function filteredCatalogFactors/.test(contentSource), false);
  assert.match(contentSource, /function filteredCatalogFactors[\s\S]*?factor\.subtype === state\.activeSubtype/);
});

test("search cache can be force-refreshed and cache hits are explicitly re-ranked", () => {
  assert.match(contentSource, /id="force-refresh"/);
  assert.match(contentSource, /searchGuard\.clearCache\(\)/);
  assert.match(contentSource, /候选缓存，并按新的颜色与因子优先级重新评分排序/);
});

test("recognition labels distinguish proportional long-name OCR correction", () => {
  assert.match(contentSource, /traditional-fuzzy-multi[^\n]+繁中长名称多字容错/);
  assert.match(contentSource, /fuzzy-multi[^\n]+长名称多字容错/);
});

test("long recognition previews stay compact and aggregate repeated notices", () => {
  assert.match(contentSource, /\.recognition-preview-list\s*\{[^}]*max-height:min\(288px,42dvh\)[^}]*overflow:auto/);
  assert.match(contentSource, /\.recognition-item\s*\{[^}]*min-height:52px/);
  assert.match(contentSource, /\.recognition-name\s*\{[^}]*font-size:13px/);
  assert.match(contentSource, /\.recognition-stars\s*\{[^}]*font-size:11px/);
  assert.match(contentSource, /function renderRecognitionProblems\(ambiguous, unknown, errors\)/);
  assert.match(contentSource, /function renderRecognitionAutoSummary\(warnings\)/);
  assert.match(contentSource, /忽略 \$\{ignored\.length\} 处无效文字/);
  assert.match(contentSource, /ignoredText\.join\("、"\)/);
  assert.equal(contentSource.includes("<b>忽略 ${ignored.length} 处无效文字</b>"), false);
  assert.equal(contentSource.includes("已自动处理 ${warnings.length} 处，不影响导入"), false);
  assert.match(contentSource, /需要修改 \$\{total\} 处，修正后才能加入/);
  assert.match(contentSource, /id="recognition-problems" role="alert" tabindex="-1"/);
  assert.equal(contentSource.includes("<b>识别提示</b>"), false);
});

test("panel distinguishes maximized and restored browser windows", () => {
  assert.match(contentSource, /width:min\(100dvw,clamp\(340px,38dvw,560px\)\)/);
  assert.match(contentSource, /:host\(\[data-window-maximized="true"\]\) \.panel \{ width:min\(100dvw,clamp\(760px,65dvw,960px\)\)/);
  assert.match(contentSource, /function updateWindowLayoutMode\(\)/);
  assert.match(contentSource, /window\.outerWidth >= window\.screen\.availWidth - tolerance/);
  assert.match(contentSource, /window\.addEventListener\("resize", updateWindowLayoutMode, \{ passive: true \}\)/);
  assert.match(contentSource, /container:optimizer-panel \/ inline-size/);
  assert.match(contentSource, /@container optimizer-panel \(min-width:560px\)/);
  assert.match(contentSource, /@container optimizer-panel \(max-width:459px\)/);
  assert.match(contentSource, /--fs-title:clamp\(18px,calc\(16px \+ \.25vw\),22px\)/);
  assert.match(contentSource, /\.factor-catalog\s*\{[^}]*max-height:clamp\(220px,34dvh,400px\)/);
  assert.match(contentSource, /\.role-catalog\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(contentSource, /\.catalog-pagination\s*\{[^}]*grid-template-columns:minmax\(88px,1fr\) auto minmax\(88px,1fr\)/);
  assert.match(contentSource, /@media \(max-height:700px\)/);
});

test("normal searches skip cooldown while fifteen-factor searches use two seconds", () => {
  assert.match(contentSource, /MANY_FACTOR_COOLDOWN_THRESHOLD\s*=\s*15/);
  assert.match(contentSource, /preferences\.desiredFactors\.length\s*>=\s*MANY_FACTOR_COOLDOWN_THRESHOLD/);
  assert.equal(contentSource.includes("访问保护：候选请求始终串行"), false);
  assert.equal(contentSource.includes("隐私提示：点击搜索后"), false);
});
