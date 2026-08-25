(function initPageBridge(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    api.install();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function pageBridgeFactory(root) {
  "use strict";

  // Public client constants shipped in the official web bundle. They are not
  // account credentials; requests still rely on the user's existing page session.
  const PUBLIC_APP_KEY = "d053991039404237a44023da011d3e08";
  const PUBLIC_SIGNING_SALT = "Hs8yIaC/AtYoBEO6jsQuNfDM9nK6ecFaXi2CttwwKxQ=";
  const API_BASE = "https://api.game.bilibili.com";
  const REQUEST_CHANNEL = "UMA_SEED_OPTIMIZER_REQUEST_V1";
  const RESPONSE_CHANNEL = "UMA_SEED_OPTIMIZER_RESPONSE_V1";

  function rotateLeft(value, amount) {
    return (value << amount) | (value >>> (32 - amount));
  }

  function wordHex(value) {
    let result = "";
    for (let byte = 0; byte < 4; byte += 1) {
      result += ((value >>> (byte * 8)) & 0xff).toString(16).padStart(2, "0");
    }
    return result;
  }

  function md5(input) {
    const bytes = new TextEncoder().encode(String(input));
    const totalLength = Math.ceil((bytes.length + 9) / 64) * 64;
    const padded = new Uint8Array(totalLength);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const bitLength = bytes.length * 8;
    const view = new DataView(padded.buffer);
    view.setUint32(totalLength - 8, bitLength >>> 0, true);
    view.setUint32(totalLength - 4, Math.floor(bitLength / 0x100000000), true);

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;
    const shifts = [
      7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
    ];
    const constants = Array.from({ length: 64 }, (_, index) =>
      Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0
    );

    for (let offset = 0; offset < padded.length; offset += 64) {
      const words = Array.from({ length: 16 }, (_, index) =>
        view.getUint32(offset + index * 4, true)
      );
      let a = a0;
      let b = b0;
      let c = c0;
      let d = d0;

      for (let index = 0; index < 64; index += 1) {
        let mixed;
        let wordIndex;
        if (index < 16) {
          mixed = (b & c) | (~b & d);
          wordIndex = index;
        } else if (index < 32) {
          mixed = (d & b) | (~d & c);
          wordIndex = (5 * index + 1) % 16;
        } else if (index < 48) {
          mixed = b ^ c ^ d;
          wordIndex = (3 * index + 5) % 16;
        } else {
          mixed = c ^ (b | ~d);
          wordIndex = (7 * index) % 16;
        }
        const nextD = c;
        const nextC = b;
        const sum = (a + mixed + constants[index] + words[wordIndex]) >>> 0;
        const nextB = (b + rotateLeft(sum, shifts[index])) >>> 0;
        a = d;
        b = nextB;
        c = nextC;
        d = nextD;
      }

      a0 = (a0 + a) >>> 0;
      b0 = (b0 + b) >>> 0;
      c0 = (c0 + c) >>> 0;
      d0 = (d0 + d) >>> 0;
    }
    return wordHex(a0) + wordHex(b0) + wordHex(c0) + wordHex(d0);
  }

  function signingValue(value) {
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value);
  }

  function makeNonce() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") {
      return root.crypto.randomUUID();
    }
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }

  function signPayload(data, options = {}) {
    const payload = {};
    for (const [key, value] of Object.entries(data || {})) {
      if (value !== null && value !== undefined && value !== "") payload[key] = value;
    }
    payload.ts = options.timestamp ?? Date.now();
    payload.nonce = options.nonce || makeNonce();
    payload.appkey = PUBLIC_APP_KEY;
    const unsigned = Object.keys(payload)
      .sort()
      .map((key) => `${key}=${signingValue(payload[key])}`)
      .join("&");
    payload.sign = md5(`${unsigned}&secret=${PUBLIC_SIGNING_SALT}`);
    return payload;
  }

  async function parseResponse(response) {
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch (error) {
      const detail = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
      const parseError = new Error(`接口返回了非 JSON 内容（HTTP ${response.status}）：${detail || "空响应"}`);
      parseError.status = response.status;
      parseError.retryAfter = response.headers?.get?.("retry-after") || "";
      throw parseError;
    }
    if (!response.ok) {
      const httpError = new Error(body?.message || `接口请求失败（HTTP ${response.status}）`);
      httpError.status = response.status;
      httpError.retryAfter = response.headers?.get?.("retry-after") || "";
      httpError.riskControl = response.status === 403 || response.status === 429;
      throw httpError;
    }
    return body;
  }

  async function getFactors() {
    const payload = signPayload({});
    const query = new URLSearchParams(
      Object.entries(payload).map(([key, value]) => [key, String(value)])
    );
    const response = await fetch(`${API_BASE}/game/player/tools/uma/factors?${query}`, {
      method: "GET",
      credentials: "include"
    });
    return parseResponse(response);
  }

  async function getHeroCards() {
    const payload = signPayload({});
    const query = new URLSearchParams(
      Object.entries(payload).map(([key, value]) => [key, String(value)])
    );
    const response = await fetch(`${API_BASE}/game/player/tools/uma/hero_cards?${query}`, {
      method: "GET",
      credentials: "include"
    });
    return parseResponse(response);
  }

  function buildSearchPayload(input) {
    const factorFilters = Array.isArray(input.filters) ? input.filters : [];
    return signPayload({
      card_ids: Array.isArray(input.cardIds) ? input.cardIds.join(",") : "",
      filter_follow_reach_limit: input.filterFollowReachLimit === false ? 0 : 1,
      min_win_race_count: input.minWinRaceCount ?? "",
      factor_filters: factorFilters.length ? JSON.stringify(factorFilters) : "",
      page_size: Math.min(50, Math.max(1, Number(input.pageSize) || 20)),
      page_num: Math.max(1, Number(input.pageNum) || 1)
    });
  }

  async function searchPage(input) {
    const response = await fetch(`${API_BASE}/game/player/tools/uma/hero_card/search`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSearchPayload(input || {}))
    });
    return parseResponse(response);
  }

  async function handle(action, payload) {
    if (action === "GET_FACTORS") return getFactors();
    if (action === "GET_HERO_CARDS") return getHeroCards();
    if (action === "SEARCH_PAGE") return searchPage(payload);
    throw new Error(`不支持的请求：${String(action)}`);
  }

  function install() {
    if (!root.addEventListener || root.__UMA_SEED_OPTIMIZER_BRIDGE_V1__) return;
    root.__UMA_SEED_OPTIMIZER_BRIDGE_V1__ = true;
    root.addEventListener("message", async (event) => {
      const message = event.data;
      if (
        event.source !== root ||
        !message ||
        message.channel !== REQUEST_CHANNEL ||
        typeof message.requestId !== "string"
      ) {
        return;
      }
      try {
        const result = await handle(message.action, message.payload || {});
        root.postMessage({
          channel: RESPONSE_CHANNEL,
          requestId: message.requestId,
          ok: true,
          result
        }, "*");
      } catch (error) {
        root.postMessage({
          channel: RESPONSE_CHANNEL,
          requestId: message.requestId,
          ok: false,
          error: error instanceof Error ? {
            message: error.message,
            status: Number(error.status) || 0,
            retryAfter: String(error.retryAfter || ""),
            riskControl: error.riskControl === true
          } : { message: String(error) }
        }, "*");
      }
    });
  }

  return {
    PUBLIC_APP_KEY,
    PUBLIC_SIGNING_SALT,
    md5,
    signPayload,
    buildSearchPayload,
    install
  };
});
