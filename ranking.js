(function initRanking(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.UmaSeedRanking = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function rankingFactory() {
  "use strict";

  const COLOR_DEFINITIONS = Object.freeze([
    { id: "blue", name: "蓝因子", types: [1] },
    { id: "red", name: "红因子", types: [2] },
    { id: "green", name: "绿因子", types: [3] },
    { id: "white", name: "白因子", types: [4, 5, 6] }
  ]);
  const DEFAULT_COLOR_ORDER = Object.freeze(COLOR_DEFINITIONS.map((item) => item.id));
  const COLOR_WEIGHTS = Object.freeze([8, 4, 2, 1]);
  const TIER_WEIGHTS = Object.freeze({ 1: 9, 2: 3, 3: 1 });
  const MIN_FACTOR_STARS = 1;
  const MAX_FACTOR_STARS = 9;
  const MIN_SELF_STARS = 1;
  const MAX_SELF_STARS = 3;
  const TYPE_TO_COLOR = new Map(
    COLOR_DEFINITIONS.flatMap((definition) =>
      definition.types.map((type) => [type, definition.id])
    )
  );
  const TYPE_NAMES = Object.freeze({
    1: "属性",
    2: "适性",
    3: "固有技能",
    4: "技能",
    5: "比赛",
    6: "剧本"
  });

  function toFiniteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function factorKey(type, num) {
    return `${Number(type)}:${String(num)}`;
  }

  function clampFactorStars(value, fallback = MIN_FACTOR_STARS) {
    return Math.min(
      MAX_FACTOR_STARS,
      Math.max(MIN_FACTOR_STARS, Math.trunc(toFiniteNumber(value, fallback)))
    );
  }

  function clampSelfStars(value, fallback = MIN_SELF_STARS) {
    return Math.min(
      MAX_SELF_STARS,
      Math.max(MIN_SELF_STARS, Math.trunc(toFiniteNumber(value, fallback)))
    );
  }

  function clampTier(value, fallback = 2) {
    return Math.min(3, Math.max(1, Math.trunc(toFiniteNumber(value, fallback))));
  }

  function candidateFactorNumber(factor) {
    return factor && (factor.num ?? factor.factor_num ?? factor.factor_id);
  }

  function candidateFactorStars(factor) {
    if (!factor) return 0;
    return Math.max(
      0,
      toFiniteNumber(factor.total_rarity, toFiniteNumber(factor.rarity, 0))
    );
  }

  function candidateFactorSelfStars(factor) {
    return factor ? Math.max(0, toFiniteNumber(factor.rarity, 0)) : 0;
  }

  function normalizeColorOrder(order) {
    const unique = [];
    for (const color of Array.isArray(order) ? order : []) {
      if (DEFAULT_COLOR_ORDER.includes(color) && !unique.includes(color)) {
        unique.push(color);
      }
    }
    for (const color of DEFAULT_COLOR_ORDER) {
      if (!unique.includes(color)) unique.push(color);
    }
    return unique;
  }

  function reorderColor(order, source, target, placement = "before") {
    const normalized = normalizeColorOrder(order);
    if (!normalized.includes(source) || !normalized.includes(target) || source === target) {
      return normalized;
    }
    const next = normalized.filter((colorId) => colorId !== source);
    const targetIndex = next.indexOf(target);
    const insertionIndex = targetIndex + (placement === "after" ? 1 : 0);
    next.splice(insertionIndex, 0, source);
    return normalizeColorOrder(next);
  }

  function normalizedPreference(raw) {
    const type = Number(raw.type);
    const colorId = TYPE_TO_COLOR.get(type);
    return {
      type,
      num: raw.num,
      name: String(raw.name || raw.num || "未命名因子"),
      tier: clampTier(raw.tier),
      minStars: clampFactorStars(raw.minStars),
      minSelfStars: clampSelfStars(raw.minSelfStars),
      colorId,
      subtype: TYPE_NAMES[type] || "其他"
    };
  }

  function indexCandidateFactors(candidate) {
    const factors = candidate?.hero_card?.factors;
    const indexed = new Map();
    for (const factor of Array.isArray(factors) ? factors : []) {
      const type = Number(factor.type);
      const num = candidateFactorNumber(factor);
      if (!Number.isFinite(type) || num === undefined || num === null) continue;
      const key = factorKey(type, num);
      const prior = indexed.get(key);
      if (!prior || candidateFactorStars(factor) > candidateFactorStars(prior)) {
        indexed.set(key, factor);
      }
    }
    return indexed;
  }

  function scoreCandidate(candidate, preferences) {
    const colorOrder = normalizeColorOrder(preferences?.colorOrder);
    const desired = (preferences?.desiredFactors || [])
      .map(normalizedPreference)
      .filter((item) => item.colorId);
    const candidateFactors = indexCandidateFactors(candidate);
    const breakdown = {};
    const matches = [];
    const misses = [];
    const shortfalls = [];
    const satisfied = [];
    let weightedScore = 0;
    let activeColorWeight = 0;

    for (const colorId of colorOrder) {
      const group = desired.filter((item) => item.colorId === colorId);
      if (!group.length) continue;
      let earned = 0;
      let available = 0;
      let matched = 0;

      for (const preference of group) {
        const tierWeight = TIER_WEIGHTS[preference.tier];
        const actual = candidateFactors.get(factorKey(preference.type, preference.num));
        const stars = candidateFactorStars(actual);
        const selfStars = candidateFactorSelfStars(actual);
        const meetsTotalThreshold = Boolean(actual) && stars >= preference.minStars;
        const meetsSelfThreshold = Boolean(actual) && selfStars >= preference.minSelfStars;
        const meetsThreshold = meetsTotalThreshold && meetsSelfThreshold;
        const totalProgress = actual ? Math.min(stars / preference.minStars, 1) : 0;
        const selfProgress = actual ? Math.min(selfStars / preference.minSelfStars, 1) : 0;
        // Reaching the selected threshold matters most. Partial progress still
        // receives credit so a near miss ranks above a completely absent factor.
        const strength = !actual
          ? 0
          : meetsThreshold
            ? 0.85
              + 0.1 * Math.min(stars, MAX_FACTOR_STARS) / MAX_FACTOR_STARS
              + 0.05 * Math.min(selfStars, MAX_SELF_STARS) / MAX_SELF_STARS
            : 0.7 * (totalProgress + selfProgress) / 2;
        available += tierWeight;
        earned += tierWeight * strength;
        if (actual) {
          matched += 1;
          const match = {
            ...preference,
            stars,
            selfStars,
            meetsTotalThreshold,
            meetsSelfThreshold,
            meetsThreshold
          };
          matches.push(match);
          if (meetsThreshold) satisfied.push(match);
          else shortfalls.push(match);
        } else {
          misses.push(preference);
        }
      }

      const groupFraction = available ? earned / available : 0;
      const colorWeight = COLOR_WEIGHTS[colorOrder.indexOf(colorId)] || 1;
      weightedScore += groupFraction * colorWeight;
      activeColorWeight += colorWeight;
      breakdown[colorId] = {
        score: Math.round(groupFraction * 1000) / 10,
        matched,
        satisfied: group.filter((preference) => {
          const actual = candidateFactors.get(factorKey(preference.type, preference.num));
          return candidateFactorStars(actual) >= preference.minStars
            && candidateFactorSelfStars(actual) >= preference.minSelfStars;
        }).length,
        totalSatisfied: group.filter((preference) => {
          const actual = candidateFactors.get(factorKey(preference.type, preference.num));
          return candidateFactorStars(actual) >= preference.minStars;
        }).length,
        selfSatisfied: group.filter((preference) => {
          const actual = candidateFactors.get(factorKey(preference.type, preference.num));
          return candidateFactorSelfStars(actual) >= preference.minSelfStars;
        }).length,
        requested: group.length,
        weight: colorWeight
      };
    }

    const score = activeColorWeight ? weightedScore / activeColorWeight * 100 : 0;
    return {
      candidate,
      score: Math.round(score * 10) / 10,
      breakdown,
      matches,
      misses,
      shortfalls,
      satisfied,
      matchedCount: matches.length,
      satisfiedCount: satisfied.length,
      requestedCount: desired.length
    };
  }

  function rankCandidates(candidates, preferences) {
    return (Array.isArray(candidates) ? candidates : [])
      .map((candidate) => scoreCandidate(candidate, preferences))
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        if (right.satisfiedCount !== left.satisfiedCount) {
          return right.satisfiedCount - left.satisfiedCount;
        }
        if (right.matchedCount !== left.matchedCount) {
          return right.matchedCount - left.matchedCount;
        }
        const rightWins = toFiniteNumber(right.candidate?.hero_card?.win_race_count, 0);
        const leftWins = toFiniteNumber(left.candidate?.hero_card?.win_race_count, 0);
        if (rightWins !== leftWins) return rightWins - leftWins;
        return String(left.candidate?.role_id || "").localeCompare(
          String(right.candidate?.role_id || "")
        );
      });
  }

  function factorFilterValue(factor, mode) {
    const totalStars = clampFactorStars(factor.minStars);
    const selfStars = clampSelfStars(factor.minSelfStars);
    if (mode === "self") return { num: factor.num, self_rarity: selfStars };
    if (mode === "discovery" && selfStars / MAX_SELF_STARS >= totalStars / MAX_FACTOR_STARS) {
      return { num: factor.num, self_rarity: selfStars };
    }
    return { num: factor.num, rarity: totalStars };
  }

  function buildFactorFilters(factors, mode = "total") {
    const byType = new Map();
    for (const factor of factors) {
      const type = Number(factor.type);
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type).push(factorFilterValue(factor, mode));
    }
    return [...byType.entries()].map(([type, values]) => ({ type, values }));
  }

  function planQueries(preferences, maxDiscoveryFactors = 12) {
    const colorOrder = normalizeColorOrder(preferences?.colorOrder);
    const desired = (preferences?.desiredFactors || [])
      .map(normalizedPreference)
      .filter((item) => item.colorId)
      .sort((left, right) => {
        const colorDelta = colorOrder.indexOf(left.colorId) - colorOrder.indexOf(right.colorId);
        if (colorDelta) return colorDelta;
        if (left.tier !== right.tier) return left.tier - right.tier;
        if (left.minStars !== right.minStars) return right.minStars - left.minStars;
        if (left.minSelfStars !== right.minSelfStars) return right.minSelfStars - left.minSelfStars;
        return left.name.localeCompare(right.name, "zh-CN");
      })
      .slice(0, Math.max(1, maxDiscoveryFactors));

    const plans = [{ id: "baseline", label: "默认推荐池", filters: [] }];
    if (!desired.length) return plans;

    const combined = desired.slice(0, 6);
    if (combined.length > 1) {
      plans.push({
        id: "combined",
        label: "高优先级组合",
        filters: buildFactorFilters(combined, "discovery")
      });
    }
    for (const factor of desired) {
      plans.push({
        id: `factor-${factorKey(factor.type, factor.num)}`,
        label: factor.name,
        filters: buildFactorFilters([factor], "discovery")
      });
    }
    return plans;
  }

  function flattenFactorResponse(data) {
    let groups = [];
    if (Array.isArray(data)) {
      groups = data[0]?.factor_groups || data;
    } else if (data && Array.isArray(data.factor_groups)) {
      groups = data.factor_groups;
    }
    return groups.flatMap((group) =>
      (group.factors || []).map((factor) => ({
        type: Number(factor.type ?? group.type),
        num: factor.num,
        name: String(factor.name || factor.num),
        colorId: TYPE_TO_COLOR.get(Number(factor.type ?? group.type)),
        subtype: TYPE_NAMES[Number(factor.type ?? group.type)] || "其他"
      }))
    ).filter((factor) => factor.colorId);
  }

  function flattenHeroCardResponse(data) {
    const cards = Array.isArray(data)
      ? data
      : Array.isArray(data?.hero_cards)
        ? data.hero_cards
        : [];
    return cards.map((card) => ({
      ...card,
      name: String(card.name || card.card_name || card.card_id),
      rarity: Math.min(3, Math.max(0, Math.trunc(toFiniteNumber(card.rarity, 0)))),
      icon_url: String(card.icon_url || card.avatar_url || "")
    })).filter((card) => card.card_id !== null && card.card_id !== undefined);
  }

  return {
    COLOR_DEFINITIONS,
    DEFAULT_COLOR_ORDER,
    COLOR_WEIGHTS,
    TIER_WEIGHTS,
    MIN_FACTOR_STARS,
    MAX_FACTOR_STARS,
    MIN_SELF_STARS,
    MAX_SELF_STARS,
    TYPE_NAMES,
    factorKey,
    clampFactorStars,
    clampSelfStars,
    clampTier,
    normalizeColorOrder,
    reorderColor,
    scoreCandidate,
    rankCandidates,
    buildFactorFilters,
    planQueries,
    flattenFactorResponse,
    flattenHeroCardResponse
  };
});
