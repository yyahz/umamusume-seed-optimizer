const test = require("node:test");
const assert = require("node:assert/strict");
const recognizer = require("../factor-recognizer.js");
const traditionalNameMap = require("../traditional-name-map.js");

function factor(type, num, name) {
  return { type, num, name };
}

const catalog = [
  factor(1, 4, "毅力"),
  factor(1, 1, "速度"),
  factor(1, 3, "力量"),
  factor(2, 22, "英里"),
  factor(3, 301, "夏日光晕"),
  factor(4, 401, "心头一击♪啾"),
  factor(4, 402, "位置感"),
  factor(4, 403, "打基础"),
  factor(4, 404, "点燃青春·智"),
  factor(4, 405, "点燃青春·速"),
  factor(4, 406, "危险回避"),
  factor(4, 407, "顺时针○"),
  factor(6, 601, "URA剧本"),
  factor(4, 777, "777"),
  factor(4, 900, "神速闪耀王"),
  factor(4, 902, "逃脱术"),
  factor(4, 903, "抢先"),
  factor(4, 904, "沙浴○"),
  factor(4, 905, "领跑弯道○"),
  factor(4, 906, "太阳的睿智"),
  factor(4, 907, "无法阻挡的热情冲刺")
];

const index = recognizer.buildCatalogIndex(catalog, {
  aliases: traditionalNameMap.buildAliases(catalog)
});

function byName(result, name) {
  return result.resolved.find((item) => item.factor.name === name);
}

test("exports the predictable browser and CommonJS core API", () => {
  assert.equal(typeof recognizer.buildCatalogIndex, "function");
  assert.equal(typeof recognizer.recognizeFactorText, "function");
  assert.equal(typeof recognizer.normalizeWithMap, "function");
  assert.equal(recognizer.DEFAULT_ALIASES["心头一击"], "心头一击♪啾");
  assert.equal(recognizer.DEFAULT_ALIASES.URA, "URA剧本");
});

test("recognizes the user's complete concatenated example", () => {
  const result = recognizer.recognizeFactorText(
    "毅力9本体3，英里9本体3，夏日光晕，心头一击，位置感打基础点燃青春智，危险回避,URA剧本",
    index
  );

  assert.deepEqual(result.resolved.map((item) => item.factor.name), [
    "毅力",
    "英里",
    "夏日光晕",
    "心头一击♪啾",
    "位置感",
    "打基础",
    "点燃青春·智",
    "危险回避",
    "URA剧本"
  ]);
  assert.equal(byName(result, "毅力").minStars, 9);
  assert.equal(byName(result, "毅力").minSelfStars, 3);
  assert.equal(byName(result, "英里").minStars, 9);
  assert.equal(byName(result, "英里").minSelfStars, 3);
  assert.equal(byName(result, "夏日光晕").minStars, null);
  assert.equal(result.coverage, 1);
  assert.equal(result.canApply, true);
});

test("normalizes fullwidth text and ignores punctuation placed inside names and thresholds", () => {
  const result = recognizer.recognizeFactorText(
    "毅・力：９★；本、体３！！！ｕｒａ・剧本３星",
    index
  );
  assert.equal(byName(result, "毅力").minStars, 9);
  assert.equal(byName(result, "毅力").minSelfStars, 3);
  assert.equal(byName(result, "URA剧本").minStars, 3);
  assert.equal(result.unknown.length, 0);
  assert.equal(result.canApply, true);
});

test("uses dynamic programming to segment a concatenated factor list", () => {
  const result = recognizer.recognizeFactorText("位置感打基础点燃青春智", index);
  assert.deepEqual(result.resolved.map((item) => item.factor.name), [
    "位置感",
    "打基础",
    "点燃青春·智"
  ]);
  assert.equal(result.coverage, 1);
});

test("resolves an explicit alias by its target name", () => {
  const result = recognizer.recognizeFactorText("心头一击9", index);
  const match = byName(result, "心头一击♪啾");
  assert.equal(match.matchKind, "alias");
  assert.equal(match.minStars, 9);
});

test("normalization removes the middle dot but preserves meaningful circles", () => {
  const youth = recognizer.recognizeFactorText("点燃青春智", index);
  const circle = recognizer.recognizeFactorText("顺时针○", index);
  const wrongCircle = recognizer.recognizeFactorText("顺时针◎", index);
  assert.equal(byName(youth, "点燃青春·智").matchKind, "exact");
  assert.equal(byName(circle, "顺时针○").matchKind, "exact");
  assert.equal(wrongCircle.resolved.length, 0);
});

test("preserves plus signs so base and enhanced factor names stay distinct", () => {
  const plusIndex = recognizer.buildCatalogIndex([
    factor(4, 1, "点燃青春·智"),
    factor(4, 2, "点燃青春·智+")
  ]);
  const base = recognizer.recognizeFactorText("点燃青春智", plusIndex);
  const enhanced = recognizer.recognizeFactorText("点燃青春智+", plusIndex);
  const fullwidth = recognizer.recognizeFactorText("点燃青春智＋", plusIndex);

  assert.deepEqual(base.resolved.map((item) => item.factor.name), ["点燃青春·智"]);
  assert.equal(base.ambiguous.length, 0);
  assert.deepEqual(enhanced.resolved.map((item) => item.factor.name), ["点燃青春·智+"]);
  assert.deepEqual(fullwidth.resolved.map((item) => item.factor.name), ["点燃青春·智+"]);
  assert.equal(recognizer.normalizeWithMap("点燃青春·智+").text, "点燃青春智+");
});

test("matches Latin factor text without case sensitivity", () => {
  for (const text of ["ura剧本", "URA剧本", "ＵｒＡ剧本"]) {
    const result = recognizer.recognizeFactorText(text, index);
    assert.equal(result.resolved[0].factor.name, "URA剧本");
  }
});

test("resolves the common URA shorthand without guessing a three-character prefix", () => {
  for (const text of ["ura", "URA", "ＵｒＡ"]) {
    const result = recognizer.recognizeFactorText(text, index);
    assert.equal(result.resolved[0].factor.name, "URA剧本");
    assert.equal(result.resolved[0].matchKind, "alias");
    assert.equal(result.canApply, true);
  }
});

test("reports an incomplete prefix when multiple catalog factors share it", () => {
  const result = recognizer.recognizeFactorText("点燃青春", index);
  assert.equal(result.resolved.length, 0);
  assert.equal(result.ambiguous.length, 1);
  assert.deepEqual(result.ambiguous[0].candidates.map((item) => item.name), [
    "点燃青春·智",
    "点燃青春·速"
  ]);
  assert.equal(result.canApply, false);
});

test("accepts only globally unique prefixes satisfying length and ratio bounds", () => {
  const result = recognizer.recognizeFactorText("神速闪耀", index);
  assert.equal(result.resolved[0].factor.name, "神速闪耀王");
  assert.equal(result.resolved[0].matchKind, "prefix");
});

test("keeps unknown residue visible and prevents one-click apply", () => {
  const result = recognizer.recognizeFactorText("毅力9火箭URA剧本", index);
  assert.deepEqual(result.resolved.map((item) => item.factor.name), ["毅力", "URA剧本"]);
  assert.deepEqual(result.unknown.map((item) => item.normalized), ["火箭"]);
  assert.ok(result.coverage < 1);
  assert.equal(result.canApply, false);
});

test("does not propagate thresholds to the next factor", () => {
  const result = recognizer.recognizeFactorText("毅力9本体3英里", index);
  assert.equal(byName(result, "毅力").minStars, 9);
  assert.equal(byName(result, "毅力").minSelfStars, 3);
  assert.equal(byName(result, "英里").minStars, null);
  assert.equal(byName(result, "英里").minSelfStars, null);
  assert.equal(byName(result, "英里").explicitTotal, false);
  assert.equal(byName(result, "英里").explicitSelf, false);
});

test("accepts zero self stars as no self-factor requirement", () => {
  const result = recognizer.recognizeFactorText("毅力9本体0", index);
  const match = byName(result, "毅力");

  assert.equal(result.canApply, true);
  assert.equal(match.minStars, 9);
  assert.equal(match.minSelfStars, 0);
  assert.equal(match.explicitSelf, true);
});

test("consolidates duplicates with maximum explicit thresholds and a warning", () => {
  const result = recognizer.recognizeFactorText("毅力3，毅力9本体2，毅力本体3", index);
  const match = byName(result, "毅力");
  assert.equal(result.resolved.length, 1);
  assert.equal(match.minStars, 9);
  assert.equal(match.minSelfStars, 3);
  assert.equal(match.occurrences.length, 3);
  assert.equal(result.warnings.filter((item) => item.code === "duplicate-factor").length, 1);
});

test("reports out-of-range thresholds without clamping", () => {
  const result = recognizer.recognizeFactorText("毅力10本体4", index);
  const match = byName(result, "毅力");
  assert.equal(match.minStars, 10);
  assert.equal(match.minSelfStars, 4);
  assert.deepEqual(result.errors.map((item) => item.code), [
    "total-stars-out-of-range",
    "self-stars-out-of-range"
  ]);
  assert.equal(result.canApply, false);
});

test("supports factor names made of digits before parsing a numeric suffix", () => {
  const exact = recognizer.recognizeFactorText("777", index);
  const threshold = recognizer.recognizeFactorText("7779本体3", index);
  assert.equal(exact.resolved[0].factor.name, "777");
  assert.equal(exact.resolved[0].minStars, null);
  assert.equal(threshold.resolved[0].factor.name, "777");
  assert.equal(threshold.resolved[0].minStars, 9);
  assert.equal(threshold.resolved[0].minSelfStars, 3);
});

test("does not auto-select exact normalized catalog collisions", () => {
  const collisionIndex = recognizer.buildCatalogIndex([
    factor(4, 1, "同名·因子"),
    factor(5, 2, "同名因子")
  ]);
  const result = recognizer.recognizeFactorText("同名因子9", collisionIndex);
  assert.equal(result.resolved.length, 0);
  assert.equal(result.ambiguous.length, 1);
  assert.equal(result.ambiguous[0].candidates.length, 2);
  assert.equal(result.ambiguous[0].minStars, 9);
});

test("punctuation-only input is empty and cannot be applied", () => {
  const result = recognizer.recognizeFactorText("，。！？♪ · ★", index);
  assert.deepEqual(result.resolved, []);
  assert.deepEqual(result.unknown, []);
  assert.equal(result.coverage, 0);
  assert.equal(result.canApply, false);
});

test("avoids short-name prose false positives but accepts compact short lists", () => {
  const prose = recognizer.recognizeFactorText("我希望速度比较快", index);
  const list = recognizer.recognizeFactorText("速度力量毅力", index);
  assert.equal(prose.resolved.length, 0);
  assert.deepEqual(list.resolved.map((item) => item.factor.name), ["速度", "力量", "毅力"]);
  assert.equal(list.canApply, true);
});

test("multiline OCR lists correct one wrong or extra character and ignore noise lines", () => {
  const result = recognizer.recognizeFactorText(
    "愿者上钩\n领跑选学\n夏日天空下的光暈\n太陽的睿智\n位置感\n医逃脱术\n圆抢先\n园沙浴。\n领跑弯道。\n大\nb:",
    index
  );

  assert.deepEqual(result.resolved.map((item) => item.factor.name), [
    "夏日光晕",
    "太阳的睿智",
    "位置感",
    "逃脱术",
    "抢先",
    "沙浴○",
    "领跑弯道○"
  ]);
  assert.equal(byName(result, "夏日光晕").matchKind, "traditional");
  assert.equal(byName(result, "太阳的睿智").matchKind, "traditional");
  assert.equal(byName(result, "逃脱术").matchKind, "fuzzy");
  assert.equal(byName(result, "抢先").matchKind, "fuzzy");
  assert.equal(byName(result, "沙浴○").matchKind, "fuzzy");
  assert.equal(byName(result, "领跑弯道○").matchKind, "prefix");
  assert.equal(result.unknown.length, 0);
  assert.ok(result.warnings.some((item) => item.text === "领跑选学"));
  assert.ok(result.warnings.some((item) => item.text === "大"));
  assert.equal(result.canApply, true);
});

test("corrects one OCR character in a Traditional alias before mapping to Simplified Chinese", () => {
  const summer = recognizer.recognizeFactorText("夏日天空下的光量", index);
  const wisdom = recognizer.recognizeFactorText("太陽的睿慧", index);
  assert.equal(summer.resolved[0].factor.name, "夏日光晕");
  assert.equal(summer.resolved[0].matchKind, "traditional-fuzzy");
  assert.equal(summer.canApply, true);
  assert.equal(wisdom.resolved[0].factor.name, "太阳的睿智");
  assert.equal(wisdom.resolved[0].matchKind, "traditional-fuzzy");
  assert.equal(wisdom.canApply, true);
});

test("long names allow proportional multi-character OCR correction without relaxing short names", () => {
  const simplified = recognizer.recognizeFactorText("无法阻档的热清冲刺", index);
  const traditional = recognizer.recognizeFactorText("夏日天空上的光量", index);
  const tooManyErrors = recognizer.recognizeFactorText("无发阻档的热清冲刺", index);
  const shortNoise = recognizer.recognizeFactorText("领跑推荐", index);

  assert.equal(simplified.resolved[0].factor.name, "无法阻挡的热情冲刺");
  assert.equal(simplified.resolved[0].matchKind, "fuzzy-multi");
  assert.equal(traditional.resolved[0].factor.name, "夏日光晕");
  assert.equal(traditional.resolved[0].matchKind, "traditional-fuzzy-multi");
  assert.equal(tooManyErrors.resolved.length, 0);
  assert.equal(shortNoise.resolved.length, 0);
});

test("single-line unknown residue remains strict", () => {
  const result = recognizer.recognizeFactorText("毅力9火箭URA剧本", index);
  assert.deepEqual(result.unknown.map((item) => item.normalized), ["火箭"]);
  assert.equal(result.canApply, false);
});

test("auto priority tiers only activate for at least twenty recognized skills", () => {
  const skills = Array.from({ length: 30 }, (_, index) => ({
    factor: factor(4, 1000 + index, `技能${index + 1}`)
  }));
  const shortList = recognizer.planSequentialSkillTiers(skills.slice(0, 19));
  const longList = recognizer.planSequentialSkillTiers([
    { factor: factor(1, 1, "速度") },
    ...skills,
    { factor: factor(6, 1, "URA剧本") }
  ]);

  assert.deepEqual(shortList, Array(19).fill(null));
  assert.equal(longList[0], null);
  assert.deepEqual(longList.slice(1, 11), Array(10).fill(1));
  assert.deepEqual(longList.slice(11, 21), Array(10).fill(2));
  assert.deepEqual(longList.slice(21, 31), Array(10).fill(3));
  assert.equal(longList[31], null);
});
