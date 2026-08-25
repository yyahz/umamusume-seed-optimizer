const test = require("node:test");
const assert = require("node:assert/strict");

const goldSkillMap = require("../gold-skill-map.js");
const recognizer = require("../factor-recognizer.js");
const ranking = require("../ranking.js");

const liveCatalog = [
  { type: 4, num: 200352, name: "弯道恢复○", colorId: "white", subtype: "技能" },
  { type: 4, num: 200532, name: "抢先", colorId: "white", subtype: "技能" },
  { type: 4, num: 999999, name: "无对应金技能", colorId: "white", subtype: "技能" }
];

test("ships a substantial verified BWIKI gold-to-white mapping snapshot", () => {
  assert.equal(goldSkillMap.SOURCE_SNAPSHOT, "2026-08-01");
  assert.ok(goldSkillMap.GOLD_TO_WHITE.length >= 170);
  assert.ok(goldSkillMap.GOLD_TO_WHITE.some((item) =>
    item.gold === "圆弧艺术家" && item.white === "弯道恢复○"
  ));
  assert.ok(goldSkillMap.GOLD_TO_WHITE.some((item) =>
    item.gold === "先发制人" && item.white === "抢先"
  ));
});

test("only exposes gold skills whose lower white factor exists in the live catalog", () => {
  const virtual = goldSkillMap.buildGoldSkillFactors(liveCatalog);
  assert.deepEqual(virtual.map((item) => item.name).sort(), ["先发制人", "圆弧艺术家"].sort());
  const artist = virtual.find((item) => item.name === "圆弧艺术家");
  assert.equal(artist.num, 200352);
  assert.equal(artist.lowerSkillName, "弯道恢复○");
  assert.equal(artist.virtualGold, true);
  assert.equal(artist.key, "gold:20035");
});

test("recognizing a gold skill resolves to the lower white factor identifier", () => {
  const extended = goldSkillMap.extendFactorCatalog(liveCatalog);
  const index = recognizer.buildCatalogIndex(extended);
  const result = recognizer.recognizeFactorText("圆弧艺术家9本体3", index);
  assert.equal(result.canApply, true);
  assert.equal(result.resolved.length, 1);
  assert.equal(result.resolved[0].factor.name, "圆弧艺术家");
  assert.equal(result.resolved[0].factor.lowerSkillName, "弯道恢复○");
  assert.equal(result.resolved[0].factor.num, 200352);
  assert.equal(result.resolved[0].minStars, 9);
  assert.equal(result.resolved[0].minSelfStars, 3);
});

test("query planning submits the lower factor num and never a gold-only identifier", () => {
  const gold = goldSkillMap.buildGoldSkillFactors(liveCatalog)
    .find((item) => item.name === "圆弧艺术家");
  const plans = ranking.planQueries({
    colorOrder: ranking.DEFAULT_COLOR_ORDER,
    desiredFactors: [{ ...gold, tier: 1, minStars: 3, minSelfStars: 0 }]
  });
  const goldPlan = plans.find((plan) => plan.label === "圆弧艺术家");
  assert.ok(goldPlan);
  assert.equal(goldPlan.filters.length, 1);
  assert.equal(goldPlan.filters[0].type, 4);
  assert.equal(goldPlan.filters[0].values[0].num, 200352);
  assert.equal(JSON.stringify(goldPlan.filters).includes("圆弧艺术家"), false);
});

test("ranking result labels retain the visible gold-to-white explanation", () => {
  const gold = goldSkillMap.buildGoldSkillFactors(liveCatalog)
    .find((item) => item.name === "圆弧艺术家");
  const candidate = {
    role_id: "123",
    hero_card: { factors: [{ type: 4, num: 200352, rarity: 3, self_rarity: 1 }] }
  };
  const scored = ranking.scoreCandidate(candidate, {
    desiredFactors: [{ ...gold, tier: 1, minStars: 3, minSelfStars: 0 }]
  });
  assert.equal(scored.matches[0].name, "圆弧艺术家");
  assert.equal(scored.matches[0].lowerSkillName, "弯道恢复○");
  assert.equal(scored.matches[0].virtualGold, true);
});
