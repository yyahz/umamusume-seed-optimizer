(function initRequestGuard(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.UmaRequestGuard = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function requestGuardFactory() {
  "use strict";

  const DEFAULTS = Object.freeze({
    minimumIntervalMs: 350,
    intervalJitterMs: 150,
    cacheTtlMs: 5 * 60_000,
    searchCooldownMs: 2_000,
    riskCooldownMs: 60_000,
    maximumRetries: 2,
    retryBaseMs: 800
  });

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function riskText(value) {
    return /请求.{0,4}(频繁|过快)|访问.{0,4}频繁|操作.{0,4}频繁|风控|稍后再试/i.test(String(value || ""));
  }

  function isRiskResponse(value) {
    const status = Number(value?.status);
    return status === 403
      || status === 429
      || value?.riskControl === true
      || riskText(value?.message)
      || riskText(value?.error);
  }

  function isTransientError(error) {
    const status = Number(error?.status);
    if (isRiskResponse(error)) return false;
    if (status >= 500) return true;
    if (status > 0) return false;
    return /超时|timeout|network|fetch|网络|连接/i.test(String(error?.message || error || ""));
  }

  function cacheKey(payload) {
    return JSON.stringify(payload || {});
  }

  function createSearchRequestGuard(options = {}) {
    const settings = { ...DEFAULTS, ...options };
    const now = options.now || (() => Date.now());
    const sleep = options.sleep || wait;
    const random = options.random || Math.random;
    const cache = new Map();
    let lastRequestAt = null;
    let cooldownUntil = 0;

    function remainingCooldownMs() {
      return Math.max(0, cooldownUntil - now());
    }

    function extendCooldown(milliseconds) {
      cooldownUntil = Math.max(cooldownUntil, now() + Math.max(0, Number(milliseconds) || 0));
      return remainingCooldownMs();
    }

    function finishSearch() {
      return extendCooldown(settings.searchCooldownMs);
    }

    function clearCache() {
      cache.clear();
    }

    async function pace() {
      if (lastRequestAt !== null) {
        const targetGap = settings.minimumIntervalMs
          + Math.floor(random() * (settings.intervalJitterMs + 1));
        const remaining = lastRequestAt + targetGap - now();
        if (remaining > 0) await sleep(remaining);
      }
      lastRequestAt = now();
    }

    function cached(key) {
      const record = cache.get(key);
      if (!record) return null;
      if (record.expiresAt <= now()) {
        cache.delete(key);
        return null;
      }
      return record.value;
    }

    async function request(payload, operation) {
      const key = cacheKey(payload);
      const cachedValue = cached(key);
      if (cachedValue !== null) return { value: cachedValue, cached: true };

      for (let attempt = 0; attempt <= settings.maximumRetries; attempt += 1) {
        await pace();
        try {
          const value = await operation();
          if (isRiskResponse(value)) {
            extendCooldown(settings.riskCooldownMs);
            const error = new Error(value?.message || "接口提示访问过于频繁，请稍后再试。");
            error.riskControl = true;
            throw error;
          }
          if (value?.code === 0) {
            cache.set(key, { value, expiresAt: now() + settings.cacheTtlMs });
          }
          return { value, cached: false };
        } catch (error) {
          if (isRiskResponse(error)) {
            extendCooldown(settings.riskCooldownMs);
            error.riskControl = true;
            throw error;
          }
          if (attempt >= settings.maximumRetries || !isTransientError(error)) throw error;
          const backoff = settings.retryBaseMs * (2 ** attempt)
            + Math.floor(random() * settings.intervalJitterMs);
          await sleep(backoff);
        }
      }
      throw new Error("候选请求重试次数已用尽。");
    }

    return {
      settings: { ...settings },
      request,
      finishSearch,
      clearCache,
      extendCooldown,
      remainingCooldownMs,
      cacheSize: () => cache.size
    };
  }

  return { DEFAULTS, cacheKey, isRiskResponse, isTransientError, createSearchRequestGuard };
});
