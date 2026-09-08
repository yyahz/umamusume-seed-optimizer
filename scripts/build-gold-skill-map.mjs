import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const SOURCE_MODULE = "https://wiki.biligame.com/umamusume/index.php?title="
  + encodeURIComponent("模块:技能简中数据库内容") + "&action=raw";

// Read only the flat string records used by these two Lua tables. Never execute
// downloaded Lua/JavaScript. Fail if the upstream format changes.
export function parseTable(source, name) {
  const body = source.match(new RegExp(`p\\.${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!body) throw new Error(`Missing BWIKI table: ${name}`);
  return [...body.matchAll(/\{([^{}]*)\}/g)].map((row) => {
    const fields = [...row[1].matchAll(/(\w+)="((?:\\.|[^"\\])*)"/g)];
    if (!fields.length) throw new Error(`Invalid BWIKI row in ${name}`);
    return Object.fromEntries(fields.map(([, key, value]) => [key, JSON.parse(`"${value}"`)]));
  });
}

export function buildMappings(source) {
  const names = new Map(parseTable(source, "text_data_47").map((row) => [row.index, row.text]));
  const groups = new Map();
  for (const row of parseTable(source, "skill_data")) {
    if (!groups.has(row.group_id)) groups.set(row.group_id, []);
    groups.get(row.group_id).push(row);
  }
  const mappings = [];
  for (const [groupId, rows] of groups) {
    const golds = rows.filter((row) => row.rarity === "2");
    const whites = rows.filter((row) => row.rarity === "1" && Number(row.grade_value) > 0)
      .sort((a, b) => Number(b.group_rate) - Number(a.group_rate) || Number(a.id) - Number(b.id));
    if (!golds.length || !whites.length) continue;
    const whiteNames = [...new Set(whites.map((row) => names.get(row.id)))];
    if (whiteNames.some((name) => !name)) throw new Error(`Missing lower skill name: ${groupId}`);
    for (const gold of golds) {
      const name = names.get(gold.id);
      if (!name) throw new Error(`Missing gold skill name: ${gold.id}`);
      mappings.push({ groupId: Number(groupId), gold: name, white: whiteNames[0],
        ...(whiteNames.length > 1 ? { whiteVariants: whiteNames } : {}) });
    }
  }
  return mappings.sort((a, b) => a.groupId - b.groupId || a.gold.localeCompare(b.gold, "zh-CN"));
}

async function main() {
  const response = await fetch(SOURCE_MODULE, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`BWIKI request failed: ${response.status}`);
  const mappings = buildMappings(await response.text());
  if (mappings.length < 170) throw new Error(`Unexpected mapping count: ${mappings.length}`);
  const output = new URL("../gold-skill-map.js", import.meta.url);
  const oldSource = await fs.readFile(output, "utf8");
  const oldArray = oldSource.match(/const GOLD_TO_WHITE = Object\.freeze\((\[[^\n]*\])\);/);
  if (!oldArray) throw new Error("Cannot locate output mapping array");
  const oldMappings = JSON.parse(oldArray[1]);
  const removed = oldMappings.filter((old) => !mappings.some((item) => item.gold === old.gold));
  if (removed.length) throw new Error(`Review removed/renamed gold skills first: ${removed.map((x) => x.gold).join("、")}`);
  const updated = oldSource.replace(/const SOURCE_SNAPSHOT = "[^"]+";/,
    `const SOURCE_SNAPSHOT = "${new Date().toISOString().slice(0, 10)}";`)
    .replace(oldArray[0], `const GOLD_TO_WHITE = Object.freeze(${JSON.stringify(mappings)});`);
  await fs.writeFile(output, updated, "utf8");
  console.log(JSON.stringify({ count: mappings.length,
    added: mappings.filter((item) => !oldMappings.some((old) => old.gold === item.gold)),
    changed: mappings.filter((item) => oldMappings.some((old) => old.gold === item.gold && old.white !== item.white)) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
