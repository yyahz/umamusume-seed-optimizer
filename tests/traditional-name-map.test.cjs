const test = require("node:test");
const assert = require("node:assert/strict");
const traditionalNameMap = require("../traditional-name-map.js");

test("ships a substantial BWIKI Traditional-to-Simplified factor and gold-skill snapshot", () => {
  assert.ok(traditionalNameMap.TRADITIONAL_TO_SIMPLIFIED.length >= 500);
  assert.equal(traditionalNameMap.SOURCE_SNAPSHOT, "2026-08-25");
  assert.match(traditionalNameMap.SOURCE_URLS.factors, /因子一览/);
  assert.match(traditionalNameMap.SOURCE_URLS.translations, /中日文对比表/);
  assert.ok(traditionalNameMap.TRADITIONAL_TO_SIMPLIFIED.some((item) =>
    item.traditional === "夏日天空下的光暈" && item.simplified === "夏日光晕"
  ));
  assert.ok(traditionalNameMap.TRADITIONAL_TO_SIMPLIFIED.some((item) =>
    item.traditional === "太陽的睿智" && item.simplified === "太阳的睿智"
  ));
});

test("only installs aliases whose Simplified target exists in the live extended catalog", () => {
  const aliases = traditionalNameMap.buildAliases([
    { type: 3, num: 1, name: "夏日光晕" },
    { type: 4, num: 2, name: "太阳的睿智" }
  ]);

  assert.deepEqual(aliases, [
    { alias: "太陽的睿智", target: "太阳的睿智", matchKind: "traditional" },
    { alias: "夏日天空下的光暈", target: "夏日光晕", matchKind: "traditional" }
  ]);
});
