import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseTable, SOURCE_MODULE } from "./build-gold-skill-map.mjs";

const SOURCE_URLS = Object.freeze({
  factors: "https://wiki.biligame.com/umamusume/因子一览",
  translations: "https://wiki.biligame.com/umamusume/中日文对比表",
  translationModule: "https://wiki.biligame.com/umamusume/index.php?title=" + encodeURIComponent("模块:翻译数据库") + "&action=raw",
  simplifiedSkillModule: SOURCE_MODULE
});
const SOURCE_SNAPSHOT = new Date().toISOString().slice(0, 10);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(scriptDirectory, "..", "traditional-name-map.js");
const require = createRequire(import.meta.url);
const goldSkillMap = require(path.resolve(scriptDirectory, "..", "gold-skill-map.js"));
const simplifiedGoldNames = new Set(goldSkillMap.GOLD_TO_WHITE.map((item) => item.gold));

function decodeHtml(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&#(x?[0-9a-f]+);/gi, (_, raw) =>
      String.fromCodePoint(Number.parseInt(raw[0].toLowerCase() === "x" ? raw.slice(1) : raw, raw[0].toLowerCase() === "x" ? 16 : 10)))
    .replace(/&([a-z]+);/gi, (entity, name) => named[name.toLowerCase()] ?? entity)
    .trim();
}

const responses = await Promise.all(Object.values(SOURCE_URLS).map((url) => fetch(url)));
for (const response of responses) {
  if (!response.ok) throw new Error(`BWIKI request failed: ${response.status} ${response.url}`);
}
const [factorHtml, translationHtml, translationModule, skillModule] = await Promise.all(responses.map((response) => response.text()));
const candidates = new Map();

function addCandidate(id, traditional, simplified) {
  if (!traditional || !simplified || traditional === simplified) return;
  if (!candidates.has(traditional)) candidates.set(traditional, new Map());
  candidates.get(traditional).set(simplified, id);
}

for (const rowMatch of factorHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
  const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
    .map((match) => decodeHtml(match[1]));
  if (cells.length < 4 || !/^\d+$/.test(cells[1])) continue;
  addCandidate(cells[1], cells[2], cells[3]);
}

for (const rowMatch of translationHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
  const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
    .map((match) => decodeHtml(match[1]));
  if (cells.length !== 4 || !/^\d+$/.test(cells[0]) || !simplifiedGoldNames.has(cells[3])) continue;
  addCandidate(cells[0], cells[2], cells[3]);
}

// The comparison page's CN column can lag behind the CN skill database.
// Join verified TW names to current CN names by skill ID, never by a guessed
// character conversion. Runtime still installs only live selectable targets.
const simplifiedSkills = new Map(parseTable(skillModule, "text_data_47")
  .map((row) => [row.index, row.text]));
for (const row of parseTable(translationModule, "text_data_47")) {
  addCandidate(row.index, row.text_TW, simplifiedSkills.get(row.index) || row.text_CN);
}
const factorTranslations = parseTable(translationModule, "text_data_147");
const factorIdAliases = [...new Map(factorTranslations.filter((row) => row.text_TW)
  .map((row) => {
    const item = { num: Math.floor(Number(row.index) / 100), traditional: row.text_TW };
    return [`${item.num}:${item.traditional}`, item];
  })).values()].filter((item) => item.num >= 10000);
for (const row of factorTranslations) {
  // Verified against the live toolbox factor directory on 2026-09-08.
  // BWIKI factor IDs append the two-digit star variant to the toolbox num.
  const liveScenarioNames = {
    31011: "U.A.F.剧本·球类项目",
    31012: "U.A.F.剧本·格斗项目",
    31013: "U.A.F.剧本·自由项目"
  };
  addCandidate(row.index, row.text_TW, row.text_CN || liveScenarioNames[Math.floor(Number(row.index) / 100)]);
}

const mappings = [...candidates.entries()]
  .filter(([, targets]) => targets.size === 1)
  .map(([traditional, targets]) => {
    const [[simplified, id]] = targets;
    return { id, traditional, simplified };
  })
  .sort((left, right) => left.traditional.localeCompare(right.traditional, "zh-CN"));

if (mappings.length < 400) {
  throw new Error(`BWIKI mapping count is unexpectedly small: ${mappings.length}`);
}
for (const [traditional, simplified] of [
  ["夏日天空下的光暈", "夏日光晕"],
  ["太陽的睿智", "太阳的睿智"]
]) {
  if (!mappings.some((item) => item.traditional === traditional && item.simplified === simplified)) {
    throw new Error(`Required BWIKI mapping is missing: ${traditional} -> ${simplified}`);
  }
}

const source = `(function initTraditionalNameMap(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.UmaTraditionalNameMap = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function traditionalNameMapFactory() {
  "use strict";

  // Generated from BWIKI's Traditional/Simplified/Japanese comparison table.
  // Only aliases whose Simplified target exists in the live factor catalog are
  // installed, so unrelated character and item translations remain inert.
  const SOURCE_URLS = Object.freeze(${JSON.stringify(SOURCE_URLS)});
  const SOURCE_SNAPSHOT = ${JSON.stringify(SOURCE_SNAPSHOT)};
  const TRADITIONAL_TO_SIMPLIFIED = Object.freeze(${JSON.stringify(mappings)});
  const FACTOR_ID_ALIASES = Object.freeze(${JSON.stringify(factorIdAliases)});

  function factorName(factor) {
    return String(factor?.name ?? factor?.factor_name ?? "").trim();
  }

  function buildAliases(factors) {
    const live = Array.isArray(factors) ? factors : [];
    const available = new Set(live.map(factorName).filter(Boolean));
    const byNumber = new Map(live.filter((factor) => !factor.virtualGold)
      .map((factor) => [String(factor.num), factorName(factor)]));
    const verified = new Map();
    for (const item of FACTOR_ID_ALIASES) {
      const target = byNumber.get(String(item.num));
      if (!target) continue;
      if (!verified.has(item.traditional)) verified.set(item.traditional, new Set());
      verified.get(item.traditional).add(target);
    }
    const aliases = TRADITIONAL_TO_SIMPLIFIED
      .filter((item) => available.has(item.simplified) && !verified.has(item.traditional))
      .map((item) => ({ alias: item.traditional, target: item.simplified, matchKind: "traditional" }));
    for (const [alias, targets] of verified) {
      if (targets.size === 1) aliases.push({ alias, target: [...targets][0], matchKind: "traditional" });
    }
    return aliases;
  }

  return { SOURCE_URLS, SOURCE_SNAPSHOT, TRADITIONAL_TO_SIMPLIFIED, FACTOR_ID_ALIASES, buildAliases };
});
`;

await fs.writeFile(outputPath, source, "utf8");
console.log(`Wrote ${mappings.length} unique BWIKI mappings to ${outputPath}`);
