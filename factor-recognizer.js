(function initFactorRecognizer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.UmaFactorRecognizer = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function factorRecognizerFactory() {
  "use strict";

  const DEFAULT_ALIASES = Object.freeze({
    "心头一击": "心头一击♪啾",
    "URA": "URA剧本"
  });

  const MATCH_PRIORITY = Object.freeze({ exact: 3, alias: 2, prefix: 1 });
  const MIN_PREFIX_LENGTH = 4;
  const MAX_PREFIX_MISSING = 2;
  const MIN_PREFIX_RATIO = 0.75;
  const SHORT_FACTOR_LENGTH = 3;

  function isMeaningfulCharacter(character) {
    return character === "○" || character === "◎" || /[\p{L}\p{N}]/u.test(character);
  }

  /**
   * NFKC-normalize input while retaining a map back to UTF-16 offsets in the
   * original string. Decorative punctuation is discarded, except ○ and ◎,
   * which are meaningful parts of several factor names.
   */
  function normalizeWithMap(input) {
    const source = String(input ?? "");
    let normalized = "";
    const map = [];
    let sourceOffset = 0;

    for (const sourceCharacter of source) {
      const sourceStart = sourceOffset;
      const sourceEnd = sourceStart + sourceCharacter.length;
      sourceOffset = sourceEnd;
      const folded = sourceCharacter.normalize("NFKC").toLocaleLowerCase("en-US");

      for (const character of folded) {
        if (!isMeaningfulCharacter(character)) continue;
        normalized += character;
        // Algorithms below index strings by UTF-16 code unit. Repeat the map
        // entry for the uncommon retained astral character so offsets remain
        // aligned with String.prototype.slice/indexing.
        for (let unit = 0; unit < character.length; unit += 1) {
          map.push({ start: sourceStart, end: sourceEnd });
        }
      }
    }

    return { text: normalized, normalized, map, source };
  }

  function normalizeText(input) {
    return normalizeWithMap(input).text;
  }

  function factorKey(factor, normalizedName, ordinal) {
    if (factor && factor.key !== undefined && factor.key !== null) {
      return String(factor.key);
    }
    const type = factor?.type;
    const num = factor?.num ?? factor?.factor_num ?? factor?.factor_id;
    if (type !== undefined && type !== null && num !== undefined && num !== null) {
      return `${Number(type)}:${String(num)}`;
    }
    if (num !== undefined && num !== null) return `?:${String(num)}`;
    return `name:${normalizedName}:${ordinal}`;
  }

  function flattenFactorRecords(factors) {
    const source = Array.isArray(factors) ? factors : [];
    const flattened = [];
    for (const item of source) {
      if (item && Array.isArray(item.factors)) {
        for (const factor of item.factors) {
          flattened.push({ ...factor, type: factor.type ?? item.type });
        }
      } else {
        flattened.push(item);
      }
    }
    return flattened;
  }

  function createTrieNode() {
    return { children: new Map(), terminals: [] };
  }

  function insertSurface(trie, surface, entry, matchKind) {
    if (!surface) return;
    let node = trie;
    for (const character of surface) {
      if (!node.children.has(character)) {
        node.children.set(character, createTrieNode());
      }
      node = node.children.get(character);
    }
    node.terminals.push({ entry, matchKind, surface });
  }

  function iterableAliases(customAliases) {
    if (customAliases instanceof Map) return [...customAliases.entries()];
    if (Array.isArray(customAliases)) {
      return customAliases.flatMap((item) => {
        if (Array.isArray(item) && item.length >= 2) return [[item[0], item[1]]];
        if (item && typeof item === "object" && item.alias !== undefined) {
          return [[item.alias, item.target ?? item.name ?? item.key]];
        }
        return [];
      });
    }
    if (customAliases && typeof customAliases === "object") {
      return Object.entries(customAliases);
    }
    return [];
  }

  function distinctEntries(terminals) {
    const byKey = new Map();
    for (const terminal of terminals) {
      const current = byKey.get(terminal.entry.key);
      if (!current || MATCH_PRIORITY[terminal.matchKind] > MATCH_PRIORITY[current.matchKind]) {
        byKey.set(terminal.entry.key, terminal);
      }
    }
    return [...byKey.values()].sort((left, right) =>
      left.entry.key.localeCompare(right.entry.key, "zh-CN")
    );
  }

  /** Build a reusable recognition index from the current live factor catalog. */
  function buildCatalogIndex(factors, options = {}) {
    const records = flattenFactorRecords(factors);
    const entries = [];
    const canonicalByName = new Map();
    const entryByKey = new Map();
    const trie = createTrieNode();
    const issues = [];

    records.forEach((factor, ordinal) => {
      if (!factor || typeof factor !== "object") return;
      const name = String(factor.name ?? factor.factor_name ?? "").trim();
      const normalizedName = normalizeText(name);
      if (!normalizedName) return;
      const entry = {
        factor,
        key: factorKey(factor, normalizedName, ordinal),
        name,
        normalizedName
      };
      entries.push(entry);
      if (!canonicalByName.has(normalizedName)) canonicalByName.set(normalizedName, []);
      canonicalByName.get(normalizedName).push(entry);
      if (!entryByKey.has(entry.key)) entryByKey.set(entry.key, entry);
      insertSurface(trie, normalizedName, entry, "exact");
    });

    const mergedAliases = new Map(Object.entries(DEFAULT_ALIASES));
    for (const [alias, target] of iterableAliases(options.aliases)) {
      mergedAliases.set(String(alias), target);
    }

    const installedAliases = [];
    for (const [aliasName, targetReference] of mergedAliases) {
      const alias = normalizeText(aliasName);
      if (!alias) continue;
      let targets = [];
      if (targetReference !== undefined && targetReference !== null) {
        const direct = entryByKey.get(String(targetReference));
        if (direct) targets = [direct];
        else targets = canonicalByName.get(normalizeText(targetReference)) || [];
      }
      const uniqueTargets = new Map(targets.map((entry) => [entry.key, entry]));
      if (uniqueTargets.size !== 1) {
        issues.push({
          code: "alias-target-not-unique",
          alias: String(aliasName),
          target: String(targetReference ?? ""),
          message: `别名“${String(aliasName)}”没有唯一对应的目录因子，已忽略。`
        });
        continue;
      }
      const entry = [...uniqueTargets.values()][0];
      insertSurface(trie, alias, entry, "alias");
      installedAliases.push({ alias: String(aliasName), normalizedAlias: alias, target: entry });
    }

    // Precompute all permitted canonical prefixes. Keeping collisions in the
    // map is intentional: the recognizer reports them instead of guessing.
    const prefixMap = new Map();
    for (const entry of entries) {
      const length = entry.normalizedName.length;
      const minimum = Math.max(
        MIN_PREFIX_LENGTH,
        length - MAX_PREFIX_MISSING,
        Math.ceil(length * MIN_PREFIX_RATIO)
      );
      for (let prefixLength = minimum; prefixLength < length; prefixLength += 1) {
        const prefix = entry.normalizedName.slice(0, prefixLength);
        if (!prefixMap.has(prefix)) prefixMap.set(prefix, new Map());
        prefixMap.get(prefix).set(entry.key, entry);
      }
    }

    const prefixLengths = [...new Set([...prefixMap.keys()].map((prefix) => prefix.length))]
      .sort((left, right) => right - left);

    return {
      entries,
      trie,
      prefixMap,
      prefixLengths,
      aliases: installedAliases,
      issues,
      options: { ...options }
    };
  }

  function readDigits(text, start) {
    let end = start;
    while (end < text.length && /[0-9]/.test(text[end])) end += 1;
    if (end === start) return null;
    return { value: Number(text.slice(start, end)), raw: text.slice(start, end), end };
  }

  function parseThresholdSuffix(text, start) {
    let cursor = start;
    let total = null;
    let self = null;
    let explicitTotal = false;
    let explicitSelf = false;
    const validationErrors = [];

    let totalDigits = null;
    if (text[cursor] === "星") {
      const digits = readDigits(text, cursor + 1);
      if (digits) {
        cursor = digits.end;
        totalDigits = digits;
      }
    } else {
      totalDigits = readDigits(text, cursor);
      if (totalDigits) {
        cursor = totalDigits.end;
        if (text[cursor] === "星") cursor += 1;
      }
    }

    if (totalDigits) {
      explicitTotal = true;
      total = totalDigits.value;
      if (!Number.isInteger(total) || total < 1 || total > 9) {
        validationErrors.push({
          code: "total-stars-out-of-range",
          field: "minStars",
          value: total,
          message: `总星数 ${totalDigits.raw} 超出 1–9 星范围。`
        });
      }
    }

    if (text.startsWith("本体", cursor)) {
      const markerStart = cursor;
      cursor += 2;
      if (text[cursor] === "星") cursor += 1;
      const selfDigits = readDigits(text, cursor);
      if (selfDigits) {
        explicitSelf = true;
        self = selfDigits.value;
        cursor = selfDigits.end;
        if (text[cursor] === "星") cursor += 1;
        if (!Number.isInteger(self) || self < 1 || self > 3) {
          validationErrors.push({
            code: "self-stars-out-of-range",
            field: "minSelfStars",
            value: self,
            message: `本体星数 ${selfDigits.raw} 超出 1–3 星范围。`
          });
        }
      } else {
        validationErrors.push({
          code: "self-stars-missing",
          field: "minSelfStars",
          value: null,
          message: "“本体”后缺少 1–3 星数字。"
        });
        // Consuming the marker lets the global segmenter report a focused
        // error. A no-suffix candidate is also retained as an alternative.
        cursor = markerStart + 2;
      }
    }

    return {
      end: cursor,
      minStars: total,
      minSelfStars: self,
      explicitTotal,
      explicitSelf,
      validationErrors
    };
  }

  function originalSpan(normalizedInput, start, end) {
    if (end <= start || !normalizedInput.map[start]) return { start: 0, end: 0 };
    return {
      start: normalizedInput.map[start].start,
      end: normalizedInput.map[end - 1].end
    };
  }

  function isOriginalBoundary(source, offset, direction) {
    if (direction < 0) {
      if (offset <= 0) return true;
      const previous = Array.from(source.slice(0, offset)).pop();
      return !previous || !isMeaningfulCharacter(previous.normalize("NFKC"));
    }
    if (offset >= source.length) return true;
    const next = Array.from(source.slice(offset))[0];
    return !next || !isMeaningfulCharacter(next.normalize("NFKC"));
  }

  function makeAction(normalizedInput, start, nameEnd, terminalInfo, thresholds) {
    const end = thresholds ? thresholds.end : nameEnd;
    const parsed = thresholds || {
      minStars: null,
      minSelfStars: null,
      explicitTotal: false,
      explicitSelf: false,
      validationErrors: []
    };
    const span = originalSpan(normalizedInput, start, end);
    const sourceText = normalizedInput.source.slice(span.start, span.end);
    const explicitThreshold = parsed.explicitTotal || parsed.explicitSelf;
    const boundarySafe = isOriginalBoundary(normalizedInput.source, span.start, -1)
      && isOriginalBoundary(normalizedInput.source, span.end, 1);

    if (terminalInfo.ambiguous) {
      const canonicalLength = Math.max(
        ...terminalInfo.entries.map((entry) => entry.entry.normalizedName.length)
      );
      const confidence = terminalInfo.matchKind === "prefix"
        ? Math.min(0.9, (nameEnd - start) / canonicalLength * 0.9)
        : 1;
      return {
        type: "ambiguous",
        start,
        nameEnd,
        end,
        entries: terminalInfo.entries.map((item) => item.entry),
        matchKind: terminalInfo.matchKind,
        confidence,
        ...parsed,
        span,
        sourceText,
        shortUnsafe: nameEnd - start <= SHORT_FACTOR_LENGTH
          && !explicitThreshold
          && !boundarySafe
      };
    }

    const terminal = terminalInfo.terminal;
    const canonicalLength = terminal.entry.normalizedName.length;
    const matchedLength = nameEnd - start;
    const confidence = terminal.matchKind === "exact"
      ? 1
      : terminal.matchKind === "alias"
        ? 0.97
        : Math.min(0.9, matchedLength / canonicalLength * 0.9);
    return {
      type: "resolved",
      start,
      nameEnd,
      end,
      entry: terminal.entry,
      matchKind: terminal.matchKind,
      confidence,
      ...parsed,
      span,
      sourceText,
      shortUnsafe: matchedLength <= SHORT_FACTOR_LENGTH
        && !explicitThreshold
        && !boundarySafe
    };
  }

  function addActionVariants(target, normalizedInput, start, nameEnd, terminalInfo) {
    target.push(makeAction(normalizedInput, start, nameEnd, terminalInfo, null));
    const thresholds = parseThresholdSuffix(normalizedInput.text, nameEnd);
    if (thresholds.end > nameEnd) {
      target.push(makeAction(normalizedInput, start, nameEnd, terminalInfo, thresholds));
    }
  }

  function enumerateCandidates(normalizedInput, index) {
    const text = normalizedInput.text;
    const byStart = Array.from({ length: text.length }, () => []);

    for (let start = 0; start < text.length; start += 1) {
      let node = index.trie;
      for (let cursor = start; cursor < text.length; cursor += 1) {
        node = node.children.get(text[cursor]);
        if (!node) break;
        if (!node.terminals.length) continue;
        const terminals = distinctEntries(node.terminals);
        if (terminals.length === 1) {
          addActionVariants(byStart[start], normalizedInput, start, cursor + 1, {
            ambiguous: false,
            terminal: terminals[0]
          });
        } else {
          addActionVariants(byStart[start], normalizedInput, start, cursor + 1, {
            ambiguous: true,
            entries: terminals,
            matchKind: "exact"
          });
        }
      }

      for (const prefixLength of index.prefixLengths) {
        const end = start + prefixLength;
        if (end > text.length) continue;
        const entriesByKey = index.prefixMap.get(text.slice(start, end));
        if (!entriesByKey) continue;
        const entries = [...entriesByKey.values()]
          .sort((left, right) => left.key.localeCompare(right.key, "zh-CN"));
        if (entries.length === 1) {
          addActionVariants(byStart[start], normalizedInput, start, end, {
            ambiguous: false,
            terminal: { entry: entries[0], matchKind: "prefix" }
          });
        } else {
          addActionVariants(byStart[start], normalizedInput, start, end, {
            ambiguous: true,
            entries: entries.map((entry) => ({ entry })),
            matchKind: "prefix"
          });
        }
      }

      // Stable de-duplication also prevents a canonical exact name and a
      // weaker prefix/alias for the same factor from producing duplicate DP
      // branches with identical semantics.
      const deduplicated = new Map();
      for (const action of byStart[start]) {
        const identity = action.type === "resolved"
          ? `${action.end}|${action.entry.key}|${action.minStars}|${action.minSelfStars}`
          : `${action.end}|ambiguous|${action.entries.map((entry) => entry.key).join(",")}|${action.minStars}|${action.minSelfStars}`;
        const current = deduplicated.get(identity);
        if (!current || MATCH_PRIORITY[action.matchKind] > MATCH_PRIORITY[current.matchKind]) {
          deduplicated.set(identity, action);
        }
      }
      byStart[start] = [...deduplicated.values()].sort((left, right) => {
        if (right.end !== left.end) return right.end - left.end;
        if (left.type !== right.type) return left.type === "resolved" ? -1 : 1;
        const priorityDelta = MATCH_PRIORITY[right.matchKind] - MATCH_PRIORITY[left.matchKind];
        if (priorityDelta) return priorityDelta;
        const leftKey = left.entry?.key || left.entries.map((entry) => entry.key).join(",");
        const rightKey = right.entry?.key || right.entries.map((entry) => entry.key).join(",");
        return leftKey.localeCompare(rightKey, "zh-CN");
      });
    }

    return byStart;
  }

  function emptyMetrics() {
    return {
      knownChars: 0,
      resolvedChars: 0,
      errors: 0,
      ambiguous: 0,
      quality: 0,
      matches: 0,
      prefixes: 0
    };
  }

  function addMetrics(base, action) {
    if (!action) return { ...base };
    const length = action.end - action.start;
    return {
      knownChars: base.knownChars + length,
      resolvedChars: base.resolvedChars + (action.type === "resolved" ? length : 0),
      errors: base.errors + action.validationErrors.length,
      ambiguous: base.ambiguous + (action.type === "ambiguous" ? 1 : 0),
      quality: base.quality + Math.round(action.confidence * 1000 * length),
      matches: base.matches + 1,
      prefixes: base.prefixes + (action.matchKind === "prefix" ? 1 : 0)
    };
  }

  function compareMetrics(left, right) {
    const comparisons = [
      left.knownChars - right.knownChars,
      right.errors - left.errors,
      left.resolvedChars - right.resolvedChars,
      right.ambiguous - left.ambiguous,
      left.quality - right.quality,
      right.prefixes - left.prefixes,
      right.matches - left.matches
    ];
    return comparisons.find((value) => value !== 0) || 0;
  }

  function segment(text, candidatesByStart, allowUnsafeShort) {
    const length = text.length;
    const dp = Array(length + 1);
    dp[length] = { metrics: emptyMetrics(), step: null };

    for (let position = length - 1; position >= 0; position -= 1) {
      let best = {
        metrics: { ...dp[position + 1].metrics },
        step: { type: "unknown", start: position, end: position + 1, next: position + 1 }
      };
      for (const action of candidatesByStart[position]) {
        if (!allowUnsafeShort && action.shortUnsafe) continue;
        const suffix = dp[action.end];
        if (!suffix) continue;
        const candidate = {
          metrics: addMetrics(suffix.metrics, action),
          step: { type: "match", action, next: action.end }
        };
        if (compareMetrics(candidate.metrics, best.metrics) > 0) best = candidate;
      }
      dp[position] = best;
    }

    const steps = [];
    let position = 0;
    while (position < length) {
      const step = dp[position].step;
      steps.push(step);
      position = step.next;
    }
    return { steps, metrics: dp[0].metrics };
  }

  function bestMatchKind(left, right) {
    return MATCH_PRIORITY[right] > MATCH_PRIORITY[left] ? right : left;
  }

  function consolidateResolved(actions) {
    const byKey = new Map();
    const duplicateCounts = new Map();

    for (const action of actions) {
      const occurrence = {
        sourceText: action.sourceText,
        span: action.span,
        minStars: action.minStars,
        minSelfStars: action.minSelfStars,
        explicitTotal: action.explicitTotal,
        explicitSelf: action.explicitSelf,
        matchKind: action.matchKind,
        confidence: action.confidence
      };
      const current = byKey.get(action.entry.key);
      if (!current) {
        byKey.set(action.entry.key, {
          factor: action.entry.factor,
          key: action.entry.key,
          minStars: action.minStars,
          minSelfStars: action.minSelfStars,
          explicitTotal: action.explicitTotal,
          explicitSelf: action.explicitSelf,
          matchKind: action.matchKind,
          confidence: action.confidence,
          sourceText: action.sourceText,
          span: action.span,
          occurrences: [occurrence]
        });
        continue;
      }

      duplicateCounts.set(action.entry.key, (duplicateCounts.get(action.entry.key) || 1) + 1);
      current.occurrences.push(occurrence);
      current.explicitTotal ||= action.explicitTotal;
      current.explicitSelf ||= action.explicitSelf;
      if (action.explicitTotal) {
        current.minStars = current.minStars === null
          ? action.minStars
          : Math.max(current.minStars, action.minStars);
      }
      if (action.explicitSelf) {
        current.minSelfStars = current.minSelfStars === null
          ? action.minSelfStars
          : Math.max(current.minSelfStars, action.minSelfStars);
      }
      current.matchKind = bestMatchKind(current.matchKind, action.matchKind);
      current.confidence = Math.max(current.confidence, action.confidence);
    }

    const warnings = [...duplicateCounts.entries()].map(([key, count]) => {
      const record = byKey.get(key);
      const name = String(record.factor?.name ?? record.factor?.factor_name ?? key);
      return {
        code: "duplicate-factor",
        key,
        count,
        message: `因子“${name}”出现 ${count} 次，已合并并采用最高的显式星级要求。`
      };
    });

    return { resolved: [...byKey.values()], warnings };
  }

  function collectUnknown(steps, normalizedInput) {
    const unknown = [];
    let runStart = null;
    let runEnd = null;
    const flush = () => {
      if (runStart === null) return;
      const span = originalSpan(normalizedInput, runStart, runEnd);
      unknown.push({
        text: normalizedInput.source.slice(span.start, span.end),
        normalized: normalizedInput.text.slice(runStart, runEnd),
        span
      });
      runStart = null;
      runEnd = null;
    };

    for (const step of steps) {
      if (step.type === "unknown") {
        if (runStart === null) runStart = step.start;
        runEnd = step.end;
      } else {
        flush();
      }
    }
    flush();
    return unknown;
  }

  /**
   * Recognize a punctuation-tolerant, concatenated factor request.
   *
   * The returned thresholds remain null when omitted. Invalid values are kept
   * verbatim and surfaced through errors; callers must respect canApply.
   */
  function recognizeFactorText(text, index) {
    if (!index || !index.trie || !index.prefixMap) {
      throw new TypeError("recognizeFactorText requires an index from buildCatalogIndex().");
    }
    const normalizedInput = normalizeWithMap(text);
    if (!normalizedInput.text) {
      return {
        resolved: [],
        ambiguous: [],
        unknown: [],
        warnings: [],
        errors: [],
        coverage: 0,
        canApply: false
      };
    }

    const candidatesByStart = enumerateCandidates(normalizedInput, index);
    let segmentation = segment(normalizedInput.text, candidatesByStart, true);
    const preliminaryCoverage = segmentation.metrics.knownChars / normalizedInput.text.length;
    if (preliminaryCoverage < 0.75) {
      segmentation = segment(normalizedInput.text, candidatesByStart, false);
    }

    const resolvedActions = [];
    const ambiguous = [];
    const errors = [];
    for (const step of segmentation.steps) {
      if (step.type !== "match") continue;
      const action = step.action;
      for (const validationError of action.validationErrors) {
        const factor = action.type === "resolved" ? action.entry.factor : null;
        errors.push({
          ...validationError,
          key: action.type === "resolved" ? action.entry.key : null,
          factor,
          sourceText: action.sourceText,
          span: action.span
        });
      }
      if (action.type === "resolved") {
        resolvedActions.push(action);
      } else {
        ambiguous.push({
          sourceText: action.sourceText,
          span: action.span,
          minStars: action.minStars,
          minSelfStars: action.minSelfStars,
          explicitTotal: action.explicitTotal,
          explicitSelf: action.explicitSelf,
          matchKind: action.matchKind,
          confidence: action.confidence,
          candidates: action.entries.map((entry) => ({
            factor: entry.factor,
            key: entry.key,
            name: entry.name
          }))
        });
      }
    }

    const consolidated = consolidateResolved(resolvedActions);
    const unknown = collectUnknown(segmentation.steps, normalizedInput);
    // Catalog/alias setup diagnostics remain available as index.issues. They
    // are not input warnings and therefore must not appear on every parse.
    const warnings = consolidated.warnings;
    const coverage = Math.round(
      segmentation.metrics.knownChars / normalizedInput.text.length * 10000
    ) / 10000;
    const canApply = consolidated.resolved.length > 0
      && ambiguous.length === 0
      && unknown.length === 0
      && errors.length === 0;

    return {
      resolved: consolidated.resolved,
      ambiguous,
      unknown,
      warnings,
      errors,
      coverage,
      canApply
    };
  }

  return {
    DEFAULT_ALIASES,
    normalizeWithMap,
    buildCatalogIndex,
    recognizeFactorText
  };
});
