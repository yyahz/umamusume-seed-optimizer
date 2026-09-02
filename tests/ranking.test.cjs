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
  assert.equal(ranking.clampTier(4), 3);
  assert.equal(ranking.clampTier(4, 2, true), ranking.REQUIRED_TIER);
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

test("blue and red factors receive zero credit unless both thresholds are met", () => {
  const hardPreferences = {
    colorOrder: ["blue", "red", "green", "white"],
    desiredFactors: [
      { type: 1, num: 1, name: "速度", tier: 1, minStars: 7, minSelfStars: 2, colorId: "blue" },
      { type: 2, num: 31, name: "短距离", tier: 1, minStars: 5, minSelfStars: 2, colorId: "red" }
    ]
  };
  const below = candidate("below", [
    { type: 1, num: 1, stars: 6, rarity: 3 },
    { type: 2, num: 31, stars: 9, rarity: 1 }
  ]);
  const meets = candidate("meets", [
    { type: 1, num: 1, stars: 7, rarity: 2 },
    { type: 2, num: 31, stars: 5, rarity: 2 }
  ]);
  const belowScore = ranking.scoreCandidate(below, hardPreferences);
  const meetsScore = ranking.scoreCandidate(meets, hardPreferences);

  assert.equal(belowScore.breakdown.blue.score, 0);
  assert.equal(belowScore.breakdown.red.score, 0);
  assert.equal(meetsScore.breakdown.blue.score, 100);
  assert.equal(meetsScore.breakdown.red.score, 100);
});

test("equal scores use the user-selected color order before wins and ids", () => {
  const tiePreferences = {
    colorOrder: ["blue", "red", "green", "white"],
    desiredFactors: [
      { type: 1, num: 1, name: "速度", tier: 1, minStars: 7, minSelfStars: 2, colorId: "blue" },
      { type: 2, num: 31, name: "短距离", tier: 1, minStars: 5, minSelfStars: 2, colorId: "red" }
    ]
  };
  const blueBetter = candidate("999", [
    { type: 1, num: 1, stars: 9, rarity: 3 },
    { type: 2, num: 31, stars: 5, rarity: 2 }
  ], 1);
  const redBetter = candidate("111", [
    { type: 1, num: 1, stars: 7, rarity: 2 },
    { type: 2, num: 31, stars: 9, rarity: 3 }
  ], 99);

  const blueFirst = ranking.rankCandidates([redBetter, blueBetter], tiePreferences);
  const redFirst = ranking.rankCandidates([blueBetter, redBetter], {
    ...tiePreferences,
    colorOrder: ["red", "blue", "green", "white"]
  });

  assert.equal(blueFirst[0].score, 100);
  assert.equal(blueFirst[1].score, 100);
  assert.equal(blueFirst[0].candidate.role_id, "999");
  assert.equal(redFirst[0].candidate.role_id, "111");
});

test("required factors are hard thresholds and outweigh higher-color P1 factors", () => {
  const requiredPreferences = {
    colorOrder: ["blue", "red", "green", "white"],
    desiredFactors: [
      { type: 2, num: 34, name: "泥地", tier: ranking.REQUIRED_TIER, minStars: 1, minSelfStars: 0, colorId: "red" },
      { type: 1, num: 1, name: "速度", tier: 1, minStars: 9, minSelfStars: 3, colorId: "blue" }
    ]
  };
  const requiredOnly = candidate("required", [{ type: 2, num: 34, stars: 1, rarity: 0 }]);
  const p1Only = candidate("p1", [{ type: 1, num: 1, stars: 9, rarity: 3 }]);
  const requiredBelow = candidate("required-below", [{ type: 2, num: 34, stars: 0, rarity: 0 }]);
  const ranked = ranking.rankCandidates([p1Only, requiredOnly], requiredPreferences);
  const belowScore = ranking.scoreCandidate(requiredBelow, requiredPreferences);

  assert.equal(ranked[0].candidate.role_id, "required");
  assert.equal(ranked[0].requiredSatisfiedCount, 1);
  assert.equal(ranked[0].requiredRequestedCount, 1);
  assert.equal(belowScore.requiredSatisfiedCount, 0);
  assert.equal(belowScore.matches[0].meetsThreshold, false);
});

test("blue, red, green, and white factors all preserve the required tier", () => {
  const desiredFactors = [
    { type: 1, num: 1, name: "速度", tier: ranking.REQUIRED_TIER, minStars: 1, minSelfStars: 0, colorId: "blue" },
    { type: 2, num: 34, name: "泥地", tier: ranking.REQUIRED_TIER, minStars: 1, minSelfStars: 0, colorId: "red" },
    { type: 3, num: 101, name: "固有", tier: ranking.REQUIRED_TIER, minStars: 1, minSelfStars: 0, colorId: "green" },
    { type: 4, num: 201, name: "技能", tier: ranking.REQUIRED_TIER, minStars: 1, minSelfStars: 0, colorId: "white" }
  ];
  const scored = ranking.scoreCandidate(candidate("all", desiredFactors.map((factor) => ({
    type: factor.type,
    num: factor.num,
    stars: 1,
    rarity: 0
  }))), { colorOrder: ["blue", "red", "green", "white"], desiredFactors });

  assert.equal(scored.requiredRequestedCount, 4);
  assert.equal(scored.requiredSatisfiedCount, 4);
  assert.ok(scored.matches.every((match) => match.tier === ranking.REQUIRED_TIER));
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

test("required factors are discovered before P1, P2, and P3 across colors", () => {
  const plans = ranking.planQueries({
    colorOrder: ["blue", "red", "green", "white"],
    desiredFactors: [
      { type: 1, num: 40_001, name: "P1蓝", tier: 1, minStars: 1, minSelfStars: 0, colorId: "blue" },
      { type: 2, num: 40_004, name: "必需红", tier: ranking.REQUIRED_TIER, minStars: 1, minSelfStars: 0, colorId: "red" },
      { type: 3, num: 40_002, name: "P2绿", tier: 2, minStars: 1, minSelfStars: 0, colorId: "green" },
      { type: 4, num: 40_003, name: "P3白", tier: 3, minStars: 1, minSelfStars: 0, colorId: "white" }
    ]
  }, 12);
  assert.deepEqual(
    plans.filter((plan) => plan.id.startsWith("factor-")).map((plan) => plan.label),
    ["必需红", "P1蓝", "P2绿", "P3白"]
  );
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

test("every API filter group contains at most three green factors", () => {
  const greenFactors = Array.from({ length: 6 }, (_, index) => ({
    type: 3,
    num: 100_000 + index,
    name: `固有${index + 1}`,
    tier: 1,
    minStars: 9 - index,
    minSelfStars: 0,
    colorId: "green"
  }));
  const direct = ranking.buildFactorFilters(greenFactors, "discovery");
  assert.equal(ranking.MAX_GREEN_FACTORS_PER_QUERY, 3);
  assert.deepEqual(direct[0].values.map((value) => value.num), [100_000, 100_001, 100_002]);

  const plans = ranking.planQueries({
    colorOrder: ["green", "blue", "red", "white"],
    desiredFactors: greenFactors
  }, 12);
  for (const plan of plans) {
    const greenFilter = plan.filters.find((filter) => filter.type === 3);
    assert.ok(!greenFilter || greenFilter.values.length <= 3, `${plan.id} exceeded the green-factor limit`);
  }
  assert.equal(plans.filter((plan) => plan.id.startsWith("factor-")).length, 6);
});

test("self and discovery filters use the observed self_rarity encoding", () => {
  const factors = [
    { type: 1, num: 1, minStars: 9, minSelfStars: 1 },
    { type: 2, num: 31, minStars: 3, minSelfStars: 3 },
    { type: 4, num: 20001, minStars: 5, minSelfStars: 0 }
  ];
  assert.deepEqual(ranking.buildFactorFilters(factors, "self"), [
    { type: 1, values: [{ num: 1, self_rarity: 1 }] },
    { type: 2, values: [{ num: 31, self_rarity: 3 }] },
    { type: 4, values: [{ num: 20001, rarity: 5 }] }
  ]);
  assert.deepEqual(ranking.buildFactorFilters(factors, "discovery"), [
    { type: 1, values: [{ num: 1, rarity: 9 }] },
    { type: 2, values: [{ num: 31, self_rarity: 3 }] },
    { type: 4, values: [{ num: 20001, rarity: 5 }] }
  ]);
  assert.equal(ranking.clampSelfStars(0), 0);
  assert.equal(ranking.DEFAULT_SELF_STARS, 0);
  assert.equal(ranking.clampSelfStars(undefined), 0);
  assert.equal(ranking.clampSelfStars(8), 3);
});

test("zero self stars only requires the factor to exist in the family", () => {
  const familyOnly = candidate("family-only", [
    { type: 1, num: 1, name: "速度", stars: 7, rarity: 0 }
  ]);
  const [result] = ranking.rankCandidates([familyOnly], {
    colorOrder: ["blue", "red", "green", "white"],
    desiredFactors: [
      { type: 1, num: 1, name: "速度", tier: 1, minStars: 7, minSelfStars: 0, colorId: "blue" }
    ]
  });

  assert.equal(result.matches[0].selfStars, 0);
  assert.equal(result.matches[0].meetsSelfThreshold, true);
  assert.equal(result.matches[0].meetsThreshold, true);
  assert.equal(result.breakdown.blue.score, 100);
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

test("family and self star selections are minimum thresholds, not exact matches", () => {
  const aboveMinimum = candidate("above-minimum", [
    { type: 1, num: 1, name: "速度", stars: 9, rarity: 3 }
  ]);
  const [result] = ranking.rankCandidates([aboveMinimum], {
    colorOrder: ["blue", "red", "green", "white"],
    desiredFactors: [
      { type: 1, num: 1, name: "速度", tier: 1, minStars: 1, minSelfStars: 1 }
    ]
  });
  assert.equal(result.matches[0].stars, 9);
  assert.equal(result.matches[0].selfStars, 3);
  assert.equal(result.matches[0].meetsTotalThreshold, true);
  assert.equal(result.matches[0].meetsSelfThreshold, true);
  assert.equal(result.satisfiedCount, 1);
});

test("candidate summaries expose every factor color by default", () => {
  const source = candidate("factor-summary", [
    { type: 1, num: 1, name: "速度", total_rarity: 7, rarity: 2 },
    { type: 1, num: 2, name: "耐力", total_rarity: 5, rarity: 1 },
    { type: 2, num: 31, name: "英里", total_rarity: 9, rarity: 3 },
    { type: 3, num: 30001, name: "胜利的鼓动", total_rarity: 3, rarity: 1 },
    { type: 4, num: 20001, name: "顺时针○", total_rarity: 6, rarity: 2 },
    { type: 5, num: 50001, name: "中山大奖赛", total_rarity: 4, rarity: 1 },
    { type: 6, num: 60001, name: "URA剧本", total_rarity: 7, rarity: 3 }
  ]);

  assert.deepEqual(ranking.summarizeCandidateFactors(source), [
    { type: 1, num: 1, name: "速度", stars: 7, selfStars: 2, colorId: "blue", subtype: "属性" },
    { type: 1, num: 2, name: "耐力", stars: 5, selfStars: 1, colorId: "blue", subtype: "属性" },
    { type: 2, num: 31, name: "英里", stars: 9, selfStars: 3, colorId: "red", subtype: "适性" },
    { type: 3, num: 30001, name: "胜利的鼓动", stars: 3, selfStars: 1, colorId: "green", subtype: "固有技能" },
    { type: 4, num: 20001, name: "顺时针○", stars: 6, selfStars: 2, colorId: "white", subtype: "技能" },
    { type: 5, num: 50001, name: "中山大奖赛", stars: 4, selfStars: 1, colorId: "white", subtype: "比赛" },
    { type: 6, num: 60001, name: "URA剧本", stars: 7, selfStars: 3, colorId: "white", subtype: "剧本" }
  ]);
  assert.deepEqual(ranking.summarizeCandidateFactors(source, [1, 2]).map((factor) => factor.name), [
    "速度", "耐力", "英里"
  ]);
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
