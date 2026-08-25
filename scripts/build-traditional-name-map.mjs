import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SOURCE_URLS = Object.freeze({
  factors: "https://wiki.biligame.com/umamusume/因子一览",
  translations: "https://wiki.biligame.com/umamusume/中日文对比表"
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
const [factorHtml, translationHtml] = await Promise.all(responses.map((response) => response.text()));
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

  function factorName(factor) {
    return String(factor?.name ?? factor?.factor_name ?? "").trim();
  }

  function buildAliases(factors) {
    const available = new Set((Array.isArray(factors) ? factors : []).map(factorName).filter(Boolean));
    return TRADITIONAL_TO_SIMPLIFIED
      .filter((item) => available.has(item.simplified))
      .map((item) => ({ alias: item.traditional, target: item.simplified, matchKind: "traditional" }));
  }

  return { SOURCE_URLS, SOURCE_SNAPSHOT, TRADITIONAL_TO_SIMPLIFIED, buildAliases };
});
`;

await fs.writeFile(outputPath, source, "utf8");
console.log(`Wrote ${mappings.length} unique BWIKI mappings to ${outputPath}`);
