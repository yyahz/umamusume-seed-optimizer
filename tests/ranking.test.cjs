const test = require("node:test");
const assert = require("node:assert/strict");

const ranking = require("../ranking.js");
const bridge = require("../page-bridge.js");

function candidate(roleId, factors, wins = 0) {
  return {
    role_id: roleId,
    hero_card: {
      win_race_count: wins,
      factors: factors.map((factor, index) => ({
        factor_id: index + 1,
        rarity: factor.rarity || 0,
        total_rarity: factor.stars,
        ...factor
      }))
    }
  };
}

const preferences = {
  colorOrder: ["blue", "red", "green", "white"],
  desiredFactors: [
    { type: 1, num: 1, name: "速度", tier: 1, minStars: 7, minSelfStars: 2, colorId: "blue" },
    { type: 2, num: 31, name: "短距离", tier: 1, minStars: 5, minSelfStars: 1, colorId: "red" },
    { type: 4, num: 20001, name: "顺时针○", tier: 2, minStars: 3, minSelfStars: 1, colorId: "white" }
  ]
};

test("MD5 implementation matches standard vectors", () => {
  assert.equal(bridge.md5(""), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(bridge.md5("abc"), "900150983cd24fb0d6963f7d28e17f72");
});

test("request signing stays compatible with the existing Python vector", () => {
  const payload = bridge.signPayload({
    card_ids: "",
    filter_follow_reach_limit: 1,
    min_win_race_count: null,
    factor_filters: '[{"type":2,"values":[{"num":3101,"rarity":7}]}]',
    page_size: 20,
    page_num: 1
  }, { timestamp: 1_700_000_000_000, nonce: "fixed-nonce" });
  assert.equal(payload.sign, "0c3e6077c7df0d7477c6bf4017fd7601");
});

test("search payload preserves the observed self_rarity request field", () => {
  const payload = bridge.buildSearchPayload({
    filters: [{ type: 1, values: [{ num: 1, self_rarity: 3 }] }],
    pageNum: 1,
    pageSize: 20
  });
  assert.equal(payload.factor_filters, '[{"type":1,"values":[{"num":1,"self_rarity":3}]}]');
});

test("search payload sends every selected role card id", () => {
  const payload = bridge.buildSearchPayload({
    cardIds: [100101, 100202, 100303],
    filters: [],
    pageNum: 1,
    pageSize: 20
  });
  assert.equal(payload.card_ids, "100101,100202,100303");
});

test("color drag ordering supports full-range before and after drops", () => {
  const order = ["blue", "red", "green", "white"];
  assert.deepEqual(
    ranking.reorderColor(order, "blue", "white", "after"),
    ["red", "green", "white", "blue"]
  );
  assert.deepEqual(
    ranking.reorderColor(order, "white", "blue", "before"),
    ["white", "blue", "red", "green"]
  );
  assert.deepEqual(
    ranking.reorderColor(order, "blue", "green", "before"),
    ["red", "blue", "green", "white"]
  );
  assert.equal(ranking.clampTier(0), 1);
  assert.equal(ranking.clampTier(2), 2);
  assert.equal(ranking.clampTier(9), 3);
});

test("ranking prioritizes the stronger high-priority color match", () => {
  const blueStrong = candidate("blue-strong", [
    { type: 1, num: 1, name: "速度", stars: 9, rarity: 3 },
    { type: 4, num: 20001, name: "顺时针○", stars: 9, rarity: 1 }
  ]);
  const lowerColors = candidate("lower-colors", [
    { type: 2, num: 31, name: "短距离", stars: 9, rarity: 2 },
    { type: 4, num: 20001, name: "顺时针○", stars: 9, rarity: 1 }
  ]);
  const result = ranking.rankCandidates([lowerColors, blueStrong], preferences);
  assert.equal(result[0].candidate.role_id, "blue-strong");
  assert.ok(result[0].score > result[1].score);
});

test("category normalization prevents a long white wishlist from multiplying its color weight", () => {
  const desiredFactors = [
    { type: 1, num: 1, name: "速度", tier: 1, minSelfStars: 1, colorId: "blue" },
    ...Array.from({ length: 8 }, (_, index) => ({
      type: 4,
      num: 20_000 + index,
      name: `白因子${index}`,
      tier: 1,
      minSelfStars: 1,
      colorId: "white"
    }))
  ];
  const blue = candidate("blue", [{ type: 1, num: 1, stars: 9, rarity: 1 }]);
  const whites = candidate("whites", Array.from({ length: 8 }, (_, index) => ({
    type: 4,
    num: 20_000 + index,
    stars: 9,
    rarity: 1
  })));
  const result = ranking.rankCandidates([whites, blue], {
    colorOrder: ["blue", "red", "green", "white"],
    desiredFactors
  });
  assert.equal(result[0].candidate.role_id, "blue");
});

test("query planner includes baseline, combined top six, and bounded single-factor discovery", () => {
  const many = {
    colorOrder: ["blue", "red", "green", "white"],
    desiredFactors: Array.from({ length: 20 }, (_, index) => ({
      type: 4,
      num: 30_000 + index,
      name: `因子${index}`,
      tier: (index % 3) + 1,
      minStars: (index % 9) + 1,
      minSelfStars: (index % 3) + 1,
      colorId: "white"
    }))
  };
  const plans = ranking.planQueries(many, 12);
  assert.equal(plans[0].id, "baseline");
  assert.equal(plans[1].id, "combined");
  assert.equal(plans[1].filters[0].values.length, 6);
  assert.equal(plans.filter((plan) => plan.id.startsWith("factor-")).length, 12);
});

test("factor filters preserve each selected 1-9 star threshold", () => {
  const filters = ranking.buildFactorFilters([
    { type: 1, num: 1, minStars: 9 },
    { type: 2, num: 31, minStars: 6 },
    { type: 2, num: 34, minStars: 3 }
  ]);
  assert.deepEqual(filters, [
    { type: 1, values: [{ num: 1, rarity: 9 }] },
    { type: 2, values: [{ num: 31, rarity: 6 }, { num: 34, rarity: 3 }] }
  ]);
  assert.equal(ranking.clampFactorStars(0), 1);
  assert.equal(ranking.clampFactorStars(12), 9);
});

test("self and discovery filters use the observed self_rarity encoding", () => {
  const factors = [
    { type: 1, num: 1, minStars: 9, minSelfStars: 1 },
    { type: 2, num: 31, minStars: 3, minSelfStars: 3 }
  ];
  assert.deepEqual(ranking.buildFactorFilters(factors, "self"), [
    { type: 1, values: [{ num: 1, self_rarity: 1 }] },
    { type: 2, values: [{ num: 31, self_rarity: 3 }] }
  ]);
  assert.deepEqual(ranking.buildFactorFilters(factors, "discovery"), [
    { type: 1, values: [{ num: 1, rarity: 9 }] },
    { type: 2, values: [{ num: 31, self_rarity: 3 }] }
  ]);
  assert.equal(ranking.clampSelfStars(0), 1);
  assert.equal(ranking.clampSelfStars(8), 3);
});

test("ranking requires family and self thresholds at the same time", () => {
  const familyBelow = candidate("family-below", [{ type: 1, num: 1, name: "速度", stars: 6, rarity: 3 }]);
  const selfBelow = candidate("self-below", [{ type: 1, num: 1, name: "速度", stars: 9, rarity: 1 }]);
  const meetsBoth = candidate("meets-both", [{ type: 1, num: 1, name: "速度", stars: 7, rarity: 2 }]);
  const result = ranking.rankCandidates([familyBelow, selfBelow, meetsBoth], {
    colorOrder: ["blue", "red", "green", "white"],
    desiredFactors: [{ type: 1, num: 1, name: "速度", tier: 1, minStars: 7, minSelfStars: 2 }]
  });
  assert.equal(result[0].candidate.role_id, "meets-both");
  assert.equal(result[0].satisfiedCount, 1);
  assert.equal(result[0].matches[0].meetsTotalThreshold, true);
  assert.equal(result[0].matches[0].meetsSelfThreshold, true);
  assert.ok(result.slice(1).every((item) => item.satisfiedCount === 0));
  assert.equal(result.find((item) => item.candidate.role_id === "family-below").shortfalls[0].meetsTotalThreshold, false);
  assert.equal(result.find((item) => item.candidate.role_id === "self-below").shortfalls[0].meetsSelfThreshold, false);
});

test("factor response flattener preserves the three white subtypes", () => {
  const factors = ranking.flattenFactorResponse([{ factor_groups: [
    { type: 4, factors: [{ type: 4, num: 1, name: "技能白" }] },
    { type: 5, factors: [{ type: 5, num: 2, name: "比赛白" }] },
    { type: 6, factors: [{ type: 6, num: 3, name: "剧本白" }] }
  ] }]);
  assert.deepEqual(factors.map((factor) => factor.subtype), ["技能", "比赛", "剧本"]);
  assert.ok(factors.every((factor) => factor.colorId === "white"));
});

test("live factor catalog shape exposes concrete blue and red choices", () => {
  const factors = ranking.flattenFactorResponse([{ factor_groups: [
    { type: 1, factors: [
      { type: 1, num: 1, name: "速度" },
      { type: 1, num: 2, name: "耐力" },
      { type: 1, num: 3, name: "力量" },
      { type: 1, num: 4, name: "毅力" },
      { type: 1, num: 5, name: "智力" }
    ] },
    { type: 2, factors: [
      { type: 2, num: 11, name: "草地" },
      { type: 2, num: 12, name: "泥地" },
      { type: 2, num: 31, name: "短距离" }
    ] }
  ] }]);
  assert.deepEqual(factors.filter((factor) => factor.colorId === "blue").map((factor) => factor.name), ["速度", "耐力", "力量", "毅力", "智力"]);
  assert.deepEqual(factors.filter((factor) => factor.colorId === "red").map((factor) => factor.name), ["草地", "泥地", "短距离"]);
});

test("hero card response flattener preserves selector fields", () => {
  const cards = ranking.flattenHeroCardResponse([
    { card_id: 1001, name: "特别周", rarity: 3, icon_url: "https://example.test/1001.png" },
    { card_id: 1002, card_name: "无声铃鹿", rarity: 2, avatar_url: "https://example.test/1002.png" }
  ]);
  assert.deepEqual(cards.map((card) => [card.card_id, card.name, card.rarity, card.icon_url]), [
    [1001, "特别周", 3, "https://example.test/1001.png"],
    [1002, "无声铃鹿", 2, "https://example.test/1002.png"]
  ]);
});
