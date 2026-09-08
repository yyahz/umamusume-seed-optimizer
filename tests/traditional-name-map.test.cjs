const test = require("node:test");
const assert = require("node:assert/strict");
const traditionalNameMap = require("../traditional-name-map.js");

test("ships a substantial BWIKI Traditional-to-Simplified factor and gold-skill snapshot", () => {
  assert.ok(traditionalNameMap.TRADITIONAL_TO_SIMPLIFIED.length >= 500);
  assert.equal(traditionalNameMap.SOURCE_SNAPSHOT, "2026-09-08");
  assert.match(traditionalNameMap.SOURCE_URLS.factors, /因子一览/);
  assert.match(traditionalNameMap.SOURCE_URLS.translations, /中日文对比表/);
  assert.ok(traditionalNameMap.TRADITIONAL_TO_SIMPLIFIED.some((item) =>
    item.traditional === "夏日天空下的光暈" && item.simplified === "夏日光晕"
  ));
  assert.ok(traditionalNameMap.TRADITIONAL_TO_SIMPLIFIED.some((item) =>
    item.traditional === "太陽的睿智" && item.simplified === "太阳的睿智"
  ));
});

test("recognizes live UAF scenario aliases and the athlete factor", () => {
  const ranking = require("../ranking.js");
  const recognizer = require("../factor-recognizer.js");
  const factors = ranking.flattenFactorResponse({ factor_groups: [
    { type: 6, factors: [
      { num: 31011, name: "U.A.F.剧本·球类项目" },
      { num: 31012, name: "U.A.F.剧本·格斗项目" },
      { num: 31013, name: "U.A.F.剧本·自由项目" }
    ] },
    { type: 4, factors: [{ num: 31014, name: "运动员之魂" }] }
  ] });
  const index = recognizer.buildCatalogIndex(factors, { aliases: traditionalNameMap.buildAliases(factors) });
  const result = recognizer.recognizeFactorText("U.A.F.劇本．球類、U.A.F.劇本．搏鬥、U.A.F.劇本．自由、運動員之魂", index);
  assert.equal(result.canApply, true);
  assert.deepEqual(result.resolved.map((item) => item.factor.num), [31011, 31012, 31013, 31014]);
});

test("factor ID aliases use the toolbox name even when the wiki translation differs", () => {
  const aliases = traditionalNameMap.buildAliases([
    { type: 6, num: 31011, name: "工具箱当前球类名称" }
  ]);
  assert.ok(aliases.some((item) => item.alias === "U.A.F.劇本．球類"
    && item.target === "工具箱当前球类名称"));
  assert.ok(aliases.every((item) => item.target === "工具箱当前球类名称"));
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
