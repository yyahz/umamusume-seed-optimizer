(function seedOptimizerContentScript() {
  "use strict";

  if (window.__UMA_SEED_OPTIMIZER_CONTENT_V1__) return;
  window.__UMA_SEED_OPTIMIZER_CONTENT_V1__ = true;

  const ranking = globalThis.UmaSeedRanking;
  const recognizer = globalThis.UmaFactorRecognizer;
  const goldSkillMap = globalThis.UmaGoldSkillMap;
  const traditionalNameMap = globalThis.UmaTraditionalNameMap;
  const requestGuard = globalThis.UmaRequestGuard;
  const extensionIconUrl = chrome.runtime.getURL("icons/icon-48.png");
  const REQUEST_CHANNEL = "UMA_SEED_OPTIMIZER_REQUEST_V1";
  const RESPONSE_CHANNEL = "UMA_SEED_OPTIMIZER_RESPONSE_V1";
  const STORAGE_KEY = "umaSeedOptimizerPreferencesV1";
  const MANY_FACTOR_COOLDOWN_THRESHOLD = 15;
  const searchGuard = requestGuard?.createSearchRequestGuard();
  let cooldownRenderTimer = null;
  const COLOR_META = {
    blue: { name: "蓝因子", description: "基础属性", examples: "速度、耐力", color: "#008AC5", soft: "#DFF6FD" },
    red: { name: "红因子", description: "场地、距离、跑法适性", examples: "草地、短距离、领跑", color: "#E84B85", soft: "#FFECF1" },
    green: { name: "绿因子", description: "继承固有技能", examples: "璀璨流星、胜利的鼓动", color: "#4E8E04", soft: "#E3F2C8" },
    white: { name: "白因子", description: "技能、比赛、剧本", examples: "URA剧本、顺时针○、中山大奖赛", color: "#4D5D7C", soft: "#EBEFF4" }
  };
  const WHITE_SUBTYPE_META = {
    剧本: { name: "剧本", examples: "URA剧本、青春杯剧本", color: "#AA7D00", soft: "#FFF5BF" },
    技能: { name: "技能", examples: "顺时针○、标准距离○", color: "#4D5D7C", soft: "#EBEFF4" },
    比赛: { name: "比赛", examples: "中京短途赛、中山大奖赛", color: "#4D5D7C", soft: "#EBEFF4" }
  };
  const ICONS = {
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.7 5.1L19 9l-5.3 1.9L12 16l-1.7-5.1L5 9l5.3-1.9L12 2Z"/><path d="m18.5 15 .9 2.6L22 18.5l-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    scan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H6a2 2 0 0 0-2 2v2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M8 9h8M8 13h8M8 17h5"/></svg>'
  };

  const state = {
    open: false,
    loadingFactors: true,
    loadingRoles: true,
    busy: false,
    roleQuery: "",
    roleRarity: "all",
    roleCatalogLimit: 60,
    selectedRoleIds: new Set(),
    roles: [],
    activeColor: "blue",
    activeSubtype: "剧本",
    factorQuery: "",
    catalogLimit: 60,
    colorOrder: [...ranking.DEFAULT_COLOR_ORDER],
    selected: new Map(),
    factors: [],
    factorCatalogNames: new Map(),
    factorIndex: null,
    quickFactorText: "",
    recognition: null,
    recognitionBatches: [],
    recognitionNotice: null,
    importUndo: null,
    depth: 2,
    filterFull: true,
    forceRefresh: false,
    status: "正在读取简中因子目录…",
    statusKind: "neutral",
    results: []
  };

  const pending = new Map();
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (event.source !== window || !message || message.channel !== RESPONSE_CHANNEL) return;
    const resolver = pending.get(message.requestId);
    if (!resolver) return;
    pending.delete(message.requestId);
    clearTimeout(resolver.timer);
    if (message.ok) resolver.resolve(message.result);
    else {
      const detail = message.error && typeof message.error === "object"
        ? message.error
        : { message: message.error };
      const error = new Error(detail.message || "页面接口请求失败");
      Object.assign(error, detail);
      resolver.reject(error);
    }
  });

  function bridgeRequest(action, payload = {}) {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("请求超时；请刷新吗哩吗哩页面后重试"));
      }, 30000);
      pending.set(requestId, { resolve, reject, timer });
      window.postMessage({ channel: REQUEST_CHANNEL, requestId, action, payload }, "*");
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function clampDepth(value) {
    return Math.min(3, Math.max(1, Number(value) || 2));
  }

  function cooldownSeconds() {
    return searchGuard ? Math.ceil(searchGuard.remainingCooldownMs() / 1000) : 0;
  }

  function scheduleCooldownRender() {
    if (cooldownRenderTimer) clearTimeout(cooldownRenderTimer);
    cooldownRenderTimer = null;
    const remaining = searchGuard?.remainingCooldownMs() || 0;
    if (remaining <= 0) return;
    cooldownRenderTimer = setTimeout(() => {
      cooldownRenderTimer = null;
      if (!state.busy) render();
    }, Math.min(1000, remaining + 20));
  }

  function factorVisualMeta(factorOrColor) {
    const colorId = typeof factorOrColor === "string" ? factorOrColor : factorOrColor?.colorId;
    const base = COLOR_META[colorId] || COLOR_META.white;
    if (colorId !== "white" || typeof factorOrColor === "string") return base;
    return { ...base, ...(WHITE_SUBTYPE_META[factorOrColor?.subtype] || {}) };
  }

  function catalogFactorKey(factor) {
    return String(factor?.catalogKey || factor?.key || ranking.factorKey(factor?.type, factor?.num));
  }

  function selectedFactorSubtitle(factor) {
    if (factor?.virtualGold) return `金技能 → ${factor.lowerSkillName}`;
    return factor?.subtype || "因子";
  }

  function activeFactorVisualMeta() {
    return factorVisualMeta({ colorId: state.activeColor, subtype: state.activeSubtype });
  }

  function preferenceDocument() {
    return {
      colorOrder: [...state.colorOrder],
      cardIds: [...state.selectedRoleIds],
      desiredFactors: [...state.selected.values()].map((item) => ({ ...item })),
      depth: state.depth,
      filterFull: state.filterFull
    };
  }

  function savePreferences() {
    chrome.storage.local.set({ [STORAGE_KEY]: preferenceDocument() });
  }

  async function loadPreferences() {
    const document = await chrome.storage.local.get(STORAGE_KEY);
    const stored = document[STORAGE_KEY] || {};
    state.colorOrder = ranking.normalizeColorOrder(stored.colorOrder);
    state.selectedRoleIds = new Set(
      (Array.isArray(stored.cardIds) ? stored.cardIds : [])
        .filter((cardId) => cardId !== null && cardId !== undefined)
        .map(String)
    );
    state.depth = clampDepth(stored.depth);
    state.filterFull = stored.filterFull !== false;
    for (const factor of Array.isArray(stored.desiredFactors) ? stored.desiredFactors : []) {
      if (factor && factor.type !== undefined && factor.num !== undefined) {
        state.selected.set(ranking.factorKey(factor.type, factor.num), {
          type: Number(factor.type),
          num: factor.num,
          name: String(factor.name || factor.num),
          tier: ranking.clampTier(factor.tier, 2, [4, 5, 6].includes(Number(factor.type))),
          minStars: ranking.clampFactorStars(factor.minStars),
          minSelfStars: ranking.clampSelfStars(factor.minSelfStars),
          colorId: factor.colorId,
          subtype: factor.subtype,
          virtualGold: factor.virtualGold === true,
          goldSkillName: factor.goldSkillName,
          lowerSkillName: factor.lowerSkillName,
          catalogKey: factor.catalogKey,
          key: factor.key
        });
      }
    }
  }

  const host = document.createElement("div");
  host.id = "uma-seed-optimizer-host";
  host.style.all = "initial";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { --surface:#fff; --surface-2:#f7f8f4; --ink:#17231d; --muted:#66726b; --line:#dce4dc; --brand:#0d7848; --brand-dark:#075834; --focus:#1278b4; --danger:#b42318; color:var(--ink); font-family:"Microsoft YaHei UI","PingFang SC",system-ui,sans-serif; }
      * { box-sizing:border-box; }
      [hidden] { display:none!important; }
      button,input,select { font:inherit; }
      button { cursor:pointer; }
      button:focus-visible,input:focus-visible,select:focus-visible,[draggable="true"]:focus-visible { outline:3px solid color-mix(in srgb,var(--focus) 75%,white); outline-offset:2px; }
      svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:1.9; stroke-linecap:round; stroke-linejoin:round; }
      .launcher { position:fixed; right:18px; bottom:90px; z-index:2147483646; min-height:52px; border:0; border-radius:18px; padding:0 18px; display:flex; align-items:center; gap:9px; color:#fff; background:linear-gradient(135deg,#0d7848,#075834); box-shadow:0 12px 28px #075e3638; font-weight:700; }
      .launcher:hover { filter:brightness(1.04); }
      .launcher-icon { width:30px; height:30px; flex:0 0 auto; border-radius:9px; object-fit:cover; box-shadow:0 1px 5px #053d2530; }
      .scrim { position:fixed; inset:0; z-index:2147483645; background:#0d1d1566; opacity:0; pointer-events:none; transition:opacity 180ms ease-out; }
      .scrim.open { opacity:1; pointer-events:auto; }
      .panel { position:fixed; z-index:2147483647; top:0; right:0; width:min(100vw,clamp(420px,40vw,620px)); height:100dvh; container:optimizer-panel / inline-size; display:flex; flex-direction:column; background:var(--surface-2); box-shadow:-16px 0 50px #0b291a2b; transform:translateX(102%); transition:transform 220ms ease-out; }
      .panel.open { transform:translateX(0); }
      .panel-header { position:relative; z-index:2; flex:0 0 auto; display:flex; align-items:center; justify-content:space-between; padding:18px 18px 14px; color:#fff; background:linear-gradient(145deg,#0b7144,#0d7848); }
      .title-wrap { min-width:0; display:flex; align-items:center; gap:12px; }
      .brand-mark { width:42px; height:42px; border-radius:13px; display:grid; place-items:center; overflow:hidden; background:#ffffff24; box-shadow:0 2px 8px #053d2529; }
      .brand-mark img { display:block; width:100%; height:100%; object-fit:cover; }
      h1 { margin:0; display:flex; align-items:baseline; gap:6px; font-size:20px; line-height:1.25; }
      .brand-credit { flex:0 0 auto; opacity:.68; font-size:10px; font-weight:500; letter-spacing:.02em; white-space:nowrap; }
      .subtitle { margin-top:2px; color:#e6fff1; font-size:12px; line-height:1.4; }
      .source-link { min-height:24px; display:inline-flex; align-items:center; color:inherit; font-weight:650; text-decoration:underline; text-decoration-color:#e6fff180; text-underline-offset:3px; }
      .source-link:hover { color:#fff; text-decoration-color:currentColor; }
      .source-link:focus-visible { border-radius:4px; outline:2px solid #fff; outline-offset:2px; }
      .icon-button { width:44px; height:44px; display:grid; place-items:center; border:0; border-radius:12px; background:transparent; color:inherit; }
      .icon-button:hover { background:#0000000d; }
      .panel-header .icon-button:hover { background:#ffffff20; }
      .panel-body { min-height:0; overflow:auto; overscroll-behavior:contain; padding:14px 14px 120px; }
      .section { margin-bottom:12px; padding:16px; border:1px solid var(--line); border-radius:18px; background:var(--surface); box-shadow:0 4px 12px #10251b08; }
      .section-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:12px; }
      h2 { margin:0; font-size:16px; line-height:1.35; }
      .helper { margin:4px 0 0; color:var(--muted); font-size:12px; line-height:1.55; }
      .priority-list { display:grid; gap:8px; margin:0; padding:0; list-style:none; }
      .priority-item { position:relative; min-height:58px; display:grid; grid-template-columns:36px minmax(0,1fr) 44px 44px; align-items:center; gap:6px; border:1px solid var(--line); border-left:5px solid var(--factor-color); border-radius:14px; padding:6px 6px 6px 8px; background:var(--factor-soft); user-select:none; }
      .priority-item.dragging { opacity:.55; }
      .priority-item.drop-before::before,.priority-item.drop-after::after { content:""; position:absolute; z-index:2; left:4px; right:4px; height:4px; border-radius:99px; background:var(--brand); box-shadow:0 0 0 3px #fff; pointer-events:none; }
      .priority-item.drop-before::before { top:-7px; }
      .priority-item.drop-after::after { bottom:-7px; }
      .rank-number { width:32px; height:32px; display:grid; place-items:center; border-radius:10px; color:#fff; background:var(--factor-color); font-weight:800; font-variant-numeric:tabular-nums; }
      .factor-title { font-weight:750; }
      .factor-description { overflow:hidden; color:var(--muted); font-size:12px; white-space:nowrap; text-overflow:ellipsis; }
      .grip { display:inline-flex; align-items:center; gap:7px; }
      .grip svg { color:var(--muted); }
      .role-tools { display:grid; gap:8px; }
      .role-tabs { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
      .role-tab { min-height:44px; border:1px solid var(--line); border-radius:11px; color:var(--muted); background:#fff; font-size:12px; font-weight:700; }
      .role-tab.active { color:var(--brand-dark); border-color:var(--brand); background:#e9f7ef; }
      .role-catalog-shell { margin-top:8px; overflow:hidden; border:1px solid var(--line); border-radius:14px; background:#fff; }
      .role-catalog { max-height:clamp(240px,38dvh,440px); overflow:auto; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; padding:6px; overscroll-behavior:contain; }
      .role-option { min-height:60px; display:grid; grid-template-columns:44px minmax(0,1fr); align-items:center; gap:8px; border:1px solid transparent; border-radius:11px; padding:6px; color:var(--ink); background:#fff; text-align:left; }
      .role-option:hover { border-color:var(--brand); background:#f0faf4; }
      .role-option.selected { color:var(--brand-dark); border-color:var(--brand); background:#e9f7ef; box-shadow:inset 0 0 0 1px var(--brand); }
      .role-image { width:44px; height:44px; object-fit:cover; border:1px solid var(--line); border-radius:10px; background:#eef2ed; }
      .role-image-fallback { display:grid; place-items:center; color:var(--muted); font-weight:800; }
      .role-option-name { overflow:hidden; font-size:12px; font-weight:750; line-height:1.35; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
      .role-rarity { margin-top:3px; color:#9a6700; font-size:10px; font-weight:800; letter-spacing:.04em; }
      .selected-role-summary { min-height:36px; display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:8px; border-radius:11px; padding:6px 9px; color:var(--muted); background:var(--surface-2); font-size:11px; }
      .clear-roles { min-height:44px; flex:0 0 auto; border:0; border-radius:10px; padding:0 12px; color:var(--brand-dark); background:#e9f7ef; font-size:12px; font-weight:750; }
      .section-head-actions { display:flex; flex:0 0 auto; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:7px; }
      .reset-factors { min-height:44px; border:1px solid #e7b9b4; border-radius:10px; padding:0 11px; color:var(--danger); background:#fff7f6; font-size:12px; font-weight:800; }
      .reset-factors:hover { border-color:var(--danger); background:#fff0ee; }
      .quick-recognizer { margin-bottom:12px; border:1px solid #cfe3d6; border-radius:14px; padding:12px; background:#f6fbf8; }
      .recognizer-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
      .recognizer-label { display:block; color:var(--ink); font-size:13px; font-weight:800; }
      .recognizer-helper { margin:3px 0 0; color:var(--muted); font-size:11px; line-height:1.5; }
      .recognizer-kicker { flex:0 0 auto; border-radius:999px; padding:3px 7px; color:var(--brand-dark); background:#e4f4ea; font-size:10px; font-weight:750; }
      .recognizer-textarea { width:100%; min-height:92px; margin-top:9px; resize:vertical; border:1px solid var(--line); border-radius:11px; padding:10px 11px; color:var(--ink); background:#fff; font-size:13px; line-height:1.55; }
      .recognizer-textarea::placeholder { color:#89958e; }
      .recognizer-actions { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:8px; }
      .recognizer-hint { color:var(--muted); font-size:10px; line-height:1.4; }
      .recognizer-button,.recognition-apply,.recognition-cancel,.undo-import { min-height:44px; border-radius:11px; padding:0 13px; font-size:12px; font-weight:800; }
      .recognizer-button { flex:0 0 auto; display:inline-flex; align-items:center; gap:7px; border:1px solid var(--brand); color:var(--brand-dark); background:#fff; }
      .recognizer-button:hover { background:#e9f7ef; }
      .recognizer-button:disabled { cursor:not-allowed; opacity:.48; }
      .recognizer-button svg { width:18px; height:18px; }
      .recognition-feedback { display:grid; gap:8px; margin-top:10px; }
      .recognition-draft { display:grid; gap:8px; margin-top:10px; border:1px solid #b9ddc8; border-radius:12px; padding:9px; background:#f7fcf9; }
      .recognition-details { color:var(--ink); font-size:11px; }
      .recognition-details summary { min-height:36px; display:flex; align-items:center; cursor:pointer; color:var(--brand-dark); font-weight:800; }
      .recognition-details[open] summary { margin-bottom:6px; }
      .recognition-summary { display:flex; align-items:center; justify-content:space-between; gap:8px; border-radius:10px; padding:8px 9px; color:var(--brand-dark); background:#e9f7ef; font-size:11px; font-weight:750; }
      .recognition-tier-note { border-radius:10px; padding:8px 9px; color:#31523f; background:#edf7f1; font-size:11px; line-height:1.5; }
      .recognition-list { display:grid; gap:5px; }
      .recognition-item { min-height:48px; display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:8px; border:1px solid var(--line); border-left:4px solid var(--factor-color); border-radius:10px; padding:6px 8px; background:var(--factor-soft); }
      .recognition-name { overflow:hidden; font-size:12px; font-weight:800; white-space:nowrap; text-overflow:ellipsis; }
      .recognition-kind { margin-top:2px; color:var(--muted); font-size:10px; }
      .recognition-stars { color:var(--ink); font-size:11px; font-weight:800; text-align:right; white-space:nowrap; }
      .recognition-issue { border-radius:10px; padding:8px 9px; color:#6f4f00; background:#fff6d8; font-size:11px; line-height:1.5; }
      .recognition-issue.error { color:var(--danger); background:#fff0ee; }
      .recognition-issue b { display:block; margin-bottom:2px; }
      .recognition-preview-actions { display:flex; justify-content:flex-end; gap:7px; }
      .recognition-apply { border:0; color:#fff; background:var(--brand); }
      .recognition-apply:disabled { cursor:not-allowed; opacity:.48; }
      .recognition-cancel { border:1px solid var(--line); color:var(--muted); background:#fff; }
      .recognition-notice { min-height:44px; display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:9px; border-radius:10px; padding:7px 9px; color:var(--brand-dark); background:#e9f7ef; font-size:11px; line-height:1.45; }
      .recognition-notice.error { color:var(--danger); background:#fff0ee; }
      .undo-import { flex:0 0 auto; border:1px solid currentColor; color:inherit; background:#fff; }
      .factor-tabs { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:12px; }
      .factor-tab { min-height:44px; padding:6px; border:1px solid var(--line); border-radius:12px; color:var(--muted); background:#fff; font-weight:650; }
      .factor-tab.active { color:var(--factor-color); border-color:var(--factor-color); background:var(--factor-soft); }
      .search-field { position:relative; }
      .search-field svg { position:absolute; left:13px; top:12px; color:var(--muted); }
      .search-input { width:100%; min-height:46px; border:1px solid var(--line); border-radius:13px; padding:10px 12px 10px 42px; color:var(--ink); background:#fff; }
      .subtype-tabs { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; }
      .subtype-tab { min-height:44px; border:1px solid var(--line); border-radius:999px; padding:0 13px; color:var(--muted); background:#fff; font-size:12px; font-weight:700; }
      .subtype-tab:hover,.subtype-tab.active { color:var(--factor-color); border-color:var(--factor-color); background:var(--factor-soft); }
      .catalog-shell { margin:8px 0 14px; overflow:hidden; border:1px solid var(--line); border-radius:14px; background:#fff; }
      .catalog-head { min-height:40px; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 10px; border-bottom:1px solid var(--line); color:var(--muted); font-size:11px; }
      .factor-catalog { max-height:clamp(220px,34dvh,400px); overflow:auto; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px; padding:6px; overscroll-behavior:contain; }
      .factor-option { min-height:48px; display:flex; align-items:flex-start; justify-content:space-between; gap:7px; border:1px solid transparent; border-radius:10px; padding:7px 9px; color:var(--ink); background:#fff; text-align:left; }
      .factor-option:hover { border-color:var(--factor-color); background:var(--factor-soft); }
      .factor-option.selected { color:var(--factor-color); border-color:var(--factor-color); background:var(--factor-soft); }
      .factor-option.gold-skill { border-color:#d7a72f; background:linear-gradient(135deg,#fffdf3,#fff5c8); }
      .factor-option.gold-skill:hover,.factor-option.gold-skill.selected { border-color:#b98200; background:linear-gradient(135deg,#fff8d8,#ffe99a); }
      .factor-option-name { min-width:0; overflow:visible; font-size:12px; font-weight:650; line-height:1.4; white-space:normal; overflow-wrap:anywhere; text-overflow:clip; }
      .factor-option-state { flex:0 0 auto; color:var(--factor-color); font-size:10px; font-weight:800; }
      .factor-option.gold-skill { grid-template-columns:minmax(0,1fr) auto; grid-template-areas:"name badge" "mapping mapping"; align-items:center; }
      .gold-skill .factor-option-name { grid-area:name; overflow:visible; white-space:normal; line-height:1.35; text-overflow:clip; }
      .gold-skill .factor-option-state { grid-area:badge; align-self:start; }
      .factor-option-mapping { grid-area:mapping; min-width:0; margin-top:2px; overflow:hidden; color:#806000; font-size:10px; font-weight:650; line-height:1.35; white-space:normal; overflow-wrap:anywhere; }
      .catalog-more { min-height:44px; width:100%; border:0; border-top:1px solid var(--line); color:var(--factor-color); background:var(--factor-soft); font-size:12px; font-weight:750; }
      .badge { flex:0 0 auto; border-radius:999px; padding:3px 8px; color:var(--factor-color); background:var(--factor-soft); font-size:11px; font-weight:700; }
      .selected-empty { padding:18px 10px; color:var(--muted); text-align:center; font-size:13px; }
      .tier-block { margin-top:10px; overflow:hidden; border:1px dashed color-mix(in srgb,var(--factor-color) 48%,var(--line)); border-radius:14px; background:color-mix(in srgb,var(--factor-soft) 48%,white); transition:border-color 160ms ease-out,background 160ms ease-out,box-shadow 160ms ease-out; }
      .tier-block.factor-drop-active { border-style:solid; border-color:var(--factor-color); background:var(--factor-soft); box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--factor-color) 24%,transparent); }
      .tier-block.required-tier { border-style:solid; border-width:2px; }
      .tier-block.required-tier .tier-label { background:color-mix(in srgb,var(--factor-soft) 72%,white); }
      .tier-block.required-tier .tier-label b { font-size:14px; }
      .tier-label { min-height:40px; display:flex; align-items:center; gap:8px; padding:7px 10px; border-bottom:1px solid color-mix(in srgb,var(--factor-color) 18%,var(--line)); color:var(--muted); font-size:12px; font-weight:700; }
      .tier-label b { color:var(--factor-color); font-size:13px; }
      .tier-help { margin-left:auto; font-size:10px; font-weight:600; }
      .tier-dot { width:8px; height:8px; border-radius:50%; background:var(--factor-color); opacity:var(--tier-opacity); }
      .selected-list { min-height:68px; display:grid; align-content:start; gap:6px; padding:6px; }
      .tier-empty { min-height:54px; display:grid; place-items:center; color:var(--muted); font-size:11px; text-align:center; }
      .selected-card { display:grid; grid-template-columns:28px minmax(60px,1fr) 56px 56px 52px; grid-template-areas:"drag identity total self tier"; align-items:center; gap:8px; min-height:64px; padding:5px 6px; border:1px solid var(--line); border-left:4px solid var(--factor-color); border-radius:11px; background:#fff; cursor:grab; }
      .selected-card:active { cursor:grabbing; }
      .selected-card.dragging { opacity:.5; }
      .factor-drag-handle { grid-area:drag; width:28px; height:44px; display:grid; place-items:center; color:var(--muted); }
      .selected-identity { grid-area:identity; min-width:0; }
      .selected-name { overflow:hidden; font-size:12px; font-weight:700; white-space:nowrap; text-overflow:ellipsis; }
      .selected-subtype { margin-top:2px; color:var(--muted); font-size:10px; }
      .compact-factor-field { min-width:0; display:grid; gap:2px; color:var(--muted); font-size:10px; font-weight:700; text-align:center; }
      .total-star-field { grid-area:total; }
      .self-star-field { grid-area:self; }
      .star-select { min-height:44px; width:100%; border:1px solid var(--line); border-radius:8px; padding:0 4px; color:var(--ink); background:#fff; font-size:11px; font-weight:750; }
      .tier-field { grid-area:tier; display:grid; gap:3px; color:var(--muted); font-size:10px; font-weight:700; }
      .tier-select { min-height:44px; width:100%; border:1px solid var(--line); border-radius:8px; padding:0 4px; color:var(--factor-color); background:#fff; font-size:11px; font-weight:800; }
      .factor-option,.role-option,.tier-select,.star-select { touch-action:manipulation; }
      .settings { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .field-label { display:block; color:var(--muted); font-size:12px; font-weight:650; }
      .select { width:100%; min-height:44px; margin-top:5px; border:1px solid var(--line); border-radius:11px; padding:0 10px; color:var(--ink); background:#fff; }
      .toggle { min-height:44px; display:flex; align-items:center; gap:9px; margin-top:5px; }
      .toggle input { width:20px; height:20px; accent-color:var(--brand); }
      .action-bar { position:absolute; z-index:2; left:0; right:0; bottom:0; display:grid; gap:8px; padding:12px 14px max(12px,env(safe-area-inset-bottom)); border-top:1px solid var(--line); background:#fffffff2; backdrop-filter:blur(12px); }
      .primary { min-height:50px; border:0; border-radius:14px; color:#fff; background:linear-gradient(135deg,var(--brand),var(--brand-dark)); font-weight:800; box-shadow:0 7px 16px #0c74452b; }
      .primary:disabled { cursor:not-allowed; opacity:.5; box-shadow:none; }
      .status { min-height:20px; color:var(--muted); font-size:12px; text-align:center; }
      .status.error { color:var(--danger); }
      .status.success { color:var(--brand-dark); }
      .results-head { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; margin-bottom:10px; }
      .result-count { color:var(--muted); font-size:12px; }
      .result-list { display:grid; gap:10px; }
      .result-card { overflow:hidden; border:1px solid var(--line); border-radius:16px; background:#fff; }
      .result-top { display:grid; grid-template-columns:58px minmax(0,1fr) auto; align-items:center; gap:10px; padding:12px; }
      .hero-image { width:58px; height:58px; object-fit:cover; border:1px solid var(--line); border-radius:14px; background:#eef2ed; }
      .result-name { overflow:hidden; font-weight:800; white-space:nowrap; text-overflow:ellipsis; }
      .result-meta { margin-top:4px; color:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; }
      .score { min-width:66px; text-align:right; }
      .score-value { color:var(--brand-dark); font-size:24px; font-weight:850; font-variant-numeric:tabular-nums; line-height:1; }
      .score-label { margin-top:3px; color:var(--muted); font-size:10px; }
      .score-track { height:6px; margin:0 12px; overflow:hidden; border-radius:99px; background:#e9eee9; }
      .score-fill { height:100%; border-radius:inherit; background:linear-gradient(90deg,#51b87a,#0c7445); }
      .breakdown { display:grid; grid-template-columns:repeat(4,1fr); gap:5px; padding:10px 12px 6px; }
      .breakdown-item { min-width:0; border-radius:9px; padding:6px 5px; background:var(--factor-soft); color:var(--factor-color); text-align:center; }
      .breakdown-item b { display:block; font-size:13px; font-variant-numeric:tabular-nums; }
      .breakdown-item span { font-size:10px; }
      .match-list { display:grid; gap:8px; padding:4px 12px 10px; }
      .result-factor-group { display:grid; gap:5px; }
      .result-factor-label { display:flex; align-items:center; gap:6px; color:var(--muted); font-size:10px; }
      .result-factor-label b { color:var(--ink); font-size:11px; }
      .factor-chip-list { display:flex; flex-wrap:wrap; gap:5px; }
      .match-chip { border-radius:999px; padding:4px 8px; color:var(--factor-color); background:var(--factor-soft); font-size:11px; font-weight:650; }
      .match-chip.selected-factor { box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--factor-color) 42%,transparent); font-weight:750; }
      .match-chip.other-factor { color:color-mix(in srgb,var(--factor-color) 78%,#526158); background:color-mix(in srgb,var(--factor-soft) 72%,#f3f5f3); }
      .match-chip.shortfall { border:1px dashed var(--factor-color); background:#fff; }
      .result-actions { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px 10px; border-top:1px solid #edf0ed; }
      .copy-button { min-height:44px; flex:0 0 auto; display:inline-flex; align-items:center; gap:7px; border:1px solid var(--line); border-radius:11px; padding:0 12px; color:var(--brand-dark); background:#fff; font-weight:700; white-space:nowrap; }
      .scope-note { min-width:0; color:var(--muted); font-size:11px; }
      .loading-line { height:3px; overflow:hidden; border-radius:99px; background:#dfe8e1; }
      .loading-line::after { content:""; display:block; width:38%; height:100%; background:var(--brand); animation:loading 1s ease-in-out infinite alternate; }
      @keyframes loading { from { transform:translateX(-20%); } to { transform:translateX(190%); } }
      @container optimizer-panel (min-width:560px) { .factor-catalog { grid-template-columns:repeat(3,minmax(0,1fr)); } .role-catalog { grid-template-columns:repeat(3,minmax(0,1fr)); } .panel-body { padding-inline:18px; } }
      @media (max-width:520px) { .launcher { right:12px; bottom:72px; } .launcher span { display:none; } .launcher { width:54px; padding:0; justify-content:center; border-radius:18px; } .panel-header { padding-inline:12px; } .brand-mark { width:38px; height:38px; } .title-wrap { gap:9px; } h1 { font-size:18px; } .brand-credit { font-size:9px; } .subtitle { font-size:11px; } .section { border-radius:16px; } .panel-body { padding-inline:10px; } .settings { grid-template-columns:1fr; } .factor-catalog { grid-template-columns:1fr; } .role-option { grid-template-columns:40px minmax(0,1fr); } .role-image { width:40px; height:40px; } .recognizer-head { display:block; } .recognizer-kicker { display:inline-block; margin-top:6px; } .recognizer-textarea { font-size:16px; } .recognizer-actions { align-items:stretch; flex-direction:column; } .recognizer-button { justify-content:center; } .recognition-item { align-items:start; grid-template-columns:1fr; } .recognition-stars { text-align:left; white-space:normal; } .recognition-preview-actions { display:grid; grid-template-columns:1fr 1fr; } }
      @media (max-height:700px) { .panel-header { padding-block:10px; } .panel-body { padding-top:10px; } .section { padding-block:12px; } .role-catalog { max-height:240px; } .factor-catalog { max-height:220px; } }
      @media (prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; animation-duration:.01ms!important; animation-iteration-count:1!important; transition-duration:.01ms!important; } }
    </style>
    <button class="launcher" id="launcher" type="button" aria-label="打开种马搜索器"><img class="launcher-icon" src="${extensionIconUrl}" alt="" aria-hidden="true"><span>种马搜索器</span></button>
    <div class="scrim" id="scrim"></div>
    <div class="panel" id="panel" role="dialog" aria-modal="true" aria-labelledby="optimizer-title" aria-hidden="true" inert>
      <header class="panel-header">
        <div class="title-wrap"><div class="brand-mark"><img src="${extensionIconUrl}" alt="" aria-hidden="true"></div><div><h1 id="optimizer-title">种马搜索器<span class="brand-credit">by Songe</span></h1><div class="subtitle"><a class="source-link" href="https://wiki.biligame.com/umamusume/" target="_blank" rel="noopener noreferrer" aria-label="打开赛马娘 BWIKI 数据来源（新窗口）">数据来源：BWIKI</a></div></div></div>
        <button class="icon-button" id="close" type="button" aria-label="关闭种马搜索器">${ICONS.close}</button>
      </header>
      <div class="panel-body" id="body"></div>
      <footer class="action-bar"><div class="status" id="status" aria-live="polite"></div><button class="primary" id="search-button" type="button">开始寻找合适种马</button></footer>
    </div>
  `;

  const elements = {
    launcher: shadow.getElementById("launcher"),
    scrim: shadow.getElementById("scrim"),
    panel: shadow.getElementById("panel"),
    close: shadow.getElementById("close"),
    body: shadow.getElementById("body"),
    status: shadow.getElementById("status"),
    searchButton: shadow.getElementById("search-button")
  };

  function setOpen(open) {
    state.open = Boolean(open);
    elements.panel.classList.toggle("open", state.open);
    elements.scrim.classList.toggle("open", state.open);
    elements.panel.setAttribute("aria-hidden", String(!state.open));
    if (state.open) elements.panel.removeAttribute("inert");
    else elements.panel.setAttribute("inert", "");
    elements.launcher.hidden = state.open;
    if (state.open) {
      render();
      setTimeout(() => elements.close.focus(), 0);
    } else {
      elements.launcher.hidden = false;
      elements.launcher.focus();
    }
  }

  elements.launcher.addEventListener("click", () => setOpen(true));
  elements.close.addEventListener("click", () => setOpen(false));
  elements.scrim.addEventListener("click", () => setOpen(false));
  shadow.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.open) setOpen(false);
    if (event.key === "Tab" && state.open) {
      const focusable = [...elements.panel.querySelectorAll("button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])")]
        .filter((element) => !element.hidden && element.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && shadow.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && shadow.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  function filteredRoles(query = state.roleQuery) {
    const normalized = String(query || "").trim().toLocaleLowerCase("zh-CN");
    return state.roles
      .filter((role) => state.roleRarity === "all" || role.rarity === Number(state.roleRarity))
      .filter((role) => !normalized || role.name.toLocaleLowerCase("zh-CN").includes(normalized));
  }

  function renderRoleCatalog(query = state.roleQuery) {
    const matches = filteredRoles(query);
    const visible = matches.slice(0, state.roleCatalogLimit);
    const items = visible.length
      ? visible.map((role) => {
        const cardId = String(role.card_id);
        const selected = state.selectedRoleIds.has(cardId);
        const rarity = role.rarity > 0 ? `${"★".repeat(role.rarity)} · ${role.rarity}星` : "未标星";
        return `<button class="role-option ${selected ? "selected" : ""}" type="button" data-role-id="${escapeHtml(cardId)}" aria-pressed="${selected}" title="${escapeHtml(role.name)} · ${rarity}">
          ${role.icon_url ? `<img class="role-image" src="${escapeHtml(role.icon_url)}" alt="" loading="lazy">` : `<span class="role-image role-image-fallback" aria-hidden="true">${escapeHtml(role.name.slice(0, 1))}</span>`}
          <span><span class="role-option-name">${escapeHtml(role.name)}</span><span class="role-rarity">${rarity}</span></span>
        </button>`;
      }).join("")
      : '<div class="selected-empty" style="grid-column:1/-1">没有找到符合条件的角色。</div>';
    return `<div class="catalog-head"><span>可选角色</span><span>显示 ${visible.length} / ${matches.length}</span></div>
      <div class="role-catalog" id="role-catalog">${items}</div>
      ${visible.length < matches.length ? `<button class="catalog-more" id="role-catalog-more" type="button">再显示 ${Math.min(60, matches.length - visible.length)} 项</button>` : ""}`;
  }

  function renderRoleSelector() {
    const rarityOptions = [
      { id: "all", name: "全部" },
      { id: "3", name: "三星" },
      { id: "2", name: "二星" },
      { id: "1", name: "一星" }
    ];
    const selectedNames = state.roles
      .filter((role) => state.selectedRoleIds.has(String(role.card_id)))
      .map((role) => role.name);
    return `<div class="role-tools">
      <div class="search-field">${ICONS.search}<input class="search-input" id="role-search" type="search" value="${escapeHtml(state.roleQuery)}" placeholder="搜索角色名称" aria-label="搜索角色名称" autocomplete="off"></div>
      <div class="role-tabs" role="tablist" aria-label="角色初始星级">${rarityOptions.map((option) => {
        const active = state.roleRarity === option.id;
        const count = option.id === "all" ? state.roles.length : state.roles.filter((role) => role.rarity === Number(option.id)).length;
        return `<button class="role-tab ${active ? "active" : ""}" type="button" role="tab" aria-selected="${active}" data-role-rarity="${option.id}">${option.name} ${count}</button>`;
      }).join("")}</div>
      <div class="selected-role-summary"><span>${selectedNames.length ? `已选择 ${selectedNames.length} 个：${escapeHtml(selectedNames.slice(0, 3).join("、"))}${selectedNames.length > 3 ? "…" : ""}` : "未选择角色：搜索全部角色"}</span>${selectedNames.length ? '<button class="clear-roles" id="clear-roles" type="button">清空角色</button>' : ""}</div>
      <div class="role-catalog-shell" id="role-catalog-shell">${renderRoleCatalog()}</div>
    </div>`;
  }

  function renderColorOrder() {
    return state.colorOrder.map((colorId, index) => {
      const meta = COLOR_META[colorId];
      return `
        <li class="priority-item" draggable="true" tabindex="0" data-color="${colorId}" aria-label="${meta.name}，当前第 ${index + 1} 位，可拖动排序" style="--factor-color:${meta.color};--factor-soft:${meta.soft}">
          <span class="rank-number">${index + 1}</span>
          <div><div class="factor-title"><span class="grip">${ICONS.grip}${meta.name}</span></div><div class="factor-description">${meta.description}</div></div>
          <button class="icon-button order-up" type="button" data-color="${colorId}" aria-label="提高${meta.name}优先级" ${index === 0 ? "disabled" : ""}>${ICONS.up}</button>
          <button class="icon-button order-down" type="button" data-color="${colorId}" aria-label="降低${meta.name}优先级" ${index === state.colorOrder.length - 1 ? "disabled" : ""}>${ICONS.down}</button>
        </li>`;
    }).join("");
  }

  function renderSelectedForColor(colorId) {
    const selected = [...state.selected.values()]
      .filter((item) => item.colorId === colorId)
      .filter((item) => colorId !== "white" || item.subtype === state.activeSubtype);
    const tiers = colorId === "white" ? [1, 2, 3, ranking.REQUIRED_TIER] : [1, 2, 3];
    return tiers.map((tier) => {
      const entries = selected.filter((item) => Number(item.tier) === tier);
      const required = tier === ranking.REQUIRED_TIER;
      const tierName = required ? "必须双门槛达标" : "优先级";
      const tierLabel = required ? "必需" : ["高", "中", "低"][tier - 1];
      const tierOptions = [1, 2, 3, ...(colorId === "white" ? [ranking.REQUIRED_TIER] : [])];
      return `
        <div class="tier-block ${required ? "required-tier" : ""}" data-factor-tier="${tier}">
          <div class="tier-label"><span class="tier-dot" style="--tier-opacity:${required ? 1 : 1 - (tier - 1) * .28}"></span><b>${tierLabel}</b>${tierName}<span class="tier-help">拖动因子到此处</span></div>
          <div class="selected-list">${entries.length ? entries.map((item) => {
            const key = ranking.factorKey(item.type, item.num);
            const itemMeta = factorVisualMeta(item);
            return `<div class="selected-card" role="group" draggable="true" tabindex="0" data-key="${escapeHtml(key)}" aria-label="${escapeHtml(item.name)}，当前${required ? "必需" : `${tierLabel}优先级`}，可拖动到其他优先级" style="--factor-color:${itemMeta.color};--factor-soft:${itemMeta.soft}">
              <span class="factor-drag-handle" aria-hidden="true">${ICONS.grip}</span>
              <div class="selected-identity"><div class="selected-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div><div class="selected-subtype">${escapeHtml(selectedFactorSubtitle(item))}</div></div>
              <label class="compact-factor-field total-star-field">家系至少
                <select class="star-select" data-total-star-key="${escapeHtml(key)}" aria-label="${escapeHtml(item.name)}最低家系合计星数">
                  ${Array.from({ length: ranking.MAX_FACTOR_STARS }, (_, index) => index + 1).map((stars) => `<option value="${stars}" ${stars === ranking.clampFactorStars(item.minStars) ? "selected" : ""}>${stars}★</option>`).join("")}
                </select>
              </label>
              <label class="compact-factor-field self-star-field">本体至少
                <select class="star-select" data-self-star-key="${escapeHtml(key)}" aria-label="${escapeHtml(item.name)}最低本体星数">
                  ${Array.from({ length: ranking.MAX_SELF_STARS + 1 }, (_, stars) => stars).map((stars) => `<option value="${stars}" ${stars === ranking.clampSelfStars(item.minSelfStars) ? "selected" : ""}>${stars}★${stars === 0 ? " · 本体无要求" : ""}</option>`).join("")}
                </select>
              </label>
              <label class="tier-field">优先级
                <select class="tier-select" data-tier-key="${escapeHtml(key)}" aria-label="${escapeHtml(item.name)}优先级">
                  ${tierOptions.map((value) => `<option value="${value}" ${value === tier ? "selected" : ""}>${value === ranking.REQUIRED_TIER ? "必需" : ["高", "中", "低"][value - 1]}</option>`).join("")}
                </select>
              </label>
            </div>`;
          }).join("") : `<div class="tier-empty">${selected.length ? `暂无${required ? "必需" : `${tierLabel}优先级`}因子，可拖动到这里` : "请先从上方目录选择因子"}</div>`}</div>
        </div>`;
    }).join("");
  }

  function filteredCatalogFactors(query = state.factorQuery) {
    const normalized = String(query || "").trim().toLocaleLowerCase("zh-CN");
    return state.factors
      .filter((factor) => factor.colorId === state.activeColor)
      .filter((factor) => state.activeColor !== "white" || factor.subtype === state.activeSubtype)
      .filter((factor) => !normalized || factor.name.toLocaleLowerCase("zh-CN").includes(normalized));
  }

  function renderSubtypeTabs() {
    if (state.activeColor !== "white") return "";
    const options = Object.entries(WHITE_SUBTYPE_META).map(([id, item]) => ({ id, ...item }));
    return `<div class="subtype-tabs" role="tablist" aria-label="白因子子分类">${options.map((option) => {
      const count = state.factors.filter((factor) => factor.colorId === "white" && factor.subtype === option.id).length;
      return `<button type="button" role="tab" aria-selected="${state.activeSubtype === option.id}" class="subtype-tab ${state.activeSubtype === option.id ? "active" : ""}" data-subtype="${option.id}" style="--factor-color:${option.color};--factor-soft:${option.soft}">${option.name} ${count}</button>`;
    }).join("")}</div>`;
  }

  function renderFactorCatalog(query = state.factorQuery) {
    const matches = filteredCatalogFactors(query);
    const visible = matches.slice(0, state.catalogLimit);
    const items = visible.length
      ? visible.map((factor) => {
        const key = ranking.factorKey(factor.type, factor.num);
        const selectedItem = state.selected.get(key);
        const selected = Boolean(selectedItem && catalogFactorKey(selectedItem) === catalogFactorKey(factor));
        const equivalent = Boolean(selectedItem && !selected);
        const catalogKey = catalogFactorKey(factor);
        const mapping = factor.virtualGold ? ` → ${factor.lowerSkillName}` : "";
        return `<button class="factor-option ${factor.virtualGold ? "gold-skill" : ""} ${selected ? "selected" : ""}" type="button" ${selected ? `data-selected-factor="${escapeHtml(key)}"` : `data-add-factor="${escapeHtml(catalogKey)}"`} aria-pressed="${selected}" title="${escapeHtml(factor.name)}${escapeHtml(mapping)} · ${selected ? "再次点击取消选择" : equivalent ? "点击改用此名称显示" : escapeHtml(factor.subtype)}">
          <span class="factor-option-name">${escapeHtml(factor.name)}</span>
          <span class="factor-option-state">${selected ? "再点取消" : factor.virtualGold ? "金技能" : equivalent ? "同一下位" : escapeHtml(factor.subtype)}</span>
          ${factor.virtualGold ? `<span class="factor-option-mapping">对应因子：${escapeHtml(factor.lowerSkillName)}</span>` : ""}
        </button>`;
      }).join("")
      : '<div class="selected-empty" style="grid-column:1/-1">没有找到符合条件的因子。</div>';
    return `<div class="catalog-head"><span>具体可选项</span><span>显示 ${visible.length} / ${matches.length}</span></div>
      <div class="factor-catalog" id="factor-catalog">${items}</div>
      ${visible.length < matches.length ? `<button class="catalog-more" id="catalog-more" type="button">再显示 ${Math.min(60, matches.length - visible.length)} 项</button>` : ""}`;
  }

  function recognitionMessage(value) {
    if (typeof value === "string") return value;
    return String(value?.message || value?.text || value?.code || "识别时出现未知问题");
  }

  function recognitionMatchLabel(kind) {
    if (kind === "alias") return "安全简称匹配";
    if (kind === "traditional") return "繁中名称映射";
    if (kind === "traditional-fuzzy") return "繁中名称容错";
    if (kind === "traditional-fuzzy-multi") return "繁中长名称多字容错";
    if (kind === "prefix") return "唯一简称补全";
    if (kind === "fuzzy") return "一字容错纠正";
    if (kind === "fuzzy-multi") return "长名称多字容错";
    return "目录名称匹配";
  }

  function recognitionItemKey(item) {
    const factor = item?.factor || item;
    return factor?.type === undefined || factor?.num === undefined
      ? ""
      : ranking.factorKey(factor.type, factor.num);
  }

  function mergeRecognitionItems(extraItems = []) {
    const merged = new Map();
    const source = [
      ...state.recognitionBatches.flatMap((batch) => batch.resolved || []),
      ...(Array.isArray(extraItems) ? extraItems : [])
    ];
    for (const item of source) {
      const key = recognitionItemKey(item);
      if (!key) continue;
      const current = merged.get(key);
      if (!current) {
        merged.set(key, { ...item, factor: { ...(item.factor || item) } });
        continue;
      }
      if (item.explicitTotal) {
        current.minStars = current.explicitTotal
          ? Math.max(current.minStars, item.minStars)
          : item.minStars;
        current.explicitTotal = true;
      }
      if (item.explicitSelf) {
        current.minSelfStars = current.explicitSelf
          ? Math.max(current.minSelfStars, item.minSelfStars)
          : item.minSelfStars;
        current.explicitSelf = true;
      }
    }
    return [...merged.values()];
  }

  function plannedRecognitionTiers(items) {
    const newItems = items.filter((item) => !state.selected.has(recognitionItemKey(item)));
    const planned = recognizer?.planSequentialSkillTiers?.(newItems) || [];
    return new Map(newItems.map((item, index) => [recognitionItemKey(item), planned[index] ?? 1]));
  }

  function newRecognitionSkillCount(items) {
    return items.filter((item) => {
      const factor = item.factor || item;
      return Number(factor?.type) === 4 && !state.selected.has(recognitionItemKey(item));
    }).length;
  }

  function renderRecognitionItem(item, tierByKey) {
    const factor = item.factor || item;
    const key = recognitionItemKey(item);
    const meta = factorVisualMeta(factor);
    const current = key ? state.selected.get(key) : null;
    const totalStars = item.explicitTotal ? item.minStars : current?.minStars ?? 1;
    const selfStars = item.explicitSelf ? item.minSelfStars : current?.minSelfStars ?? ranking.DEFAULT_SELF_STARS;
    const totalNote = item.explicitTotal ? "" : current ? " 保留当前" : " 默认";
    const selfNote = item.explicitSelf ? "" : current ? " 保留当前" : " 默认";
    const plannedTier = current
      ? ranking.clampTier(current.tier, 1, factor.colorId === "white")
      : tierByKey.get(key) ?? 1;
    const tierNote = current ? " 保留当前" : " 本轮预排";
    return `<div class="recognition-item" style="--factor-color:${meta.color};--factor-soft:${meta.soft}" title="${escapeHtml(item.sourceText || factor.name)}">
      <div><div class="recognition-name">${escapeHtml(factor.name)}</div><div class="recognition-kind">${escapeHtml(selectedFactorSubtitle(factor))} · ${recognitionMatchLabel(item.matchKind)}</div></div>
      <div class="recognition-stars">家系 ${totalStars}★${totalNote}<br>本体 ${selfStars}★${selfNote}<br>优先级 ${["高", "中", "低"][plannedTier - 1]}${tierNote}</div>
    </div>`;
  }

  function renderRecognitionNotice() {
    if (!state.recognitionNotice) return "";
    const kind = state.recognitionNotice.kind === "error" ? "error" : "success";
    const undoLabel = state.importUndo?.kind === "reset" ? "撤销本次重置" : "撤销本次导入";
    return `<div class="recognition-notice ${kind}" id="recognition-notice" role="status">
      <span>${escapeHtml(state.recognitionNotice.message)}</span>
      ${state.importUndo ? `<button class="undo-import" id="undo-factor-import" type="button">${undoLabel}</button>` : ""}
    </div>`;
  }

  function renderRecognitionPreview() {
    const result = state.recognition;
    if (!result) return "";
    const resolved = Array.isArray(result.resolved) ? result.resolved : [];
    const ambiguous = Array.isArray(result.ambiguous) ? result.ambiguous : [];
    const unknown = Array.isArray(result.unknown) ? result.unknown : [];
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    const errors = Array.isArray(result.errors) ? result.errors : [];
    const cumulative = mergeRecognitionItems(resolved);
    const tierByKey = plannedRecognitionTiers(cumulative);
    const skillCount = newRecognitionSkillCount(cumulative);
    const items = resolved.map((item) => renderRecognitionItem(item, tierByKey)).join("");
    const ambiguityBlocks = ambiguous.map((item) => {
      const candidates = (item.candidates || []).map((candidate) => candidate?.factor?.name || candidate?.name).filter(Boolean);
      return `<div class="recognition-issue"><b>“${escapeHtml(item.sourceText || item.text || "未命名片段")}”存在歧义</b>${candidates.length ? `可能是：${escapeHtml(candidates.join("、"))}。` : "请补全正式因子名。"}</div>`;
    }).join("");
    const unknownBlocks = unknown.map((item) => {
      const text = typeof item === "string" ? item : item?.sourceText || item?.text || item?.normalized;
      return text ? `<div class="recognition-issue"><b>未识别片段</b>${escapeHtml(text)}；请检查名称或补充分隔符。</div>` : "";
    }).join("");
    const warningBlocks = warnings.map((item) => `<div class="recognition-issue"><b>识别提示</b>${escapeHtml(recognitionMessage(item))}</div>`).join("");
    const errorBlocks = errors.map((item) => `<div class="recognition-issue error" role="alert"><b>无法应用</b>${escapeHtml(recognitionMessage(item))}</div>`).join("");
    const canApply = Boolean(result.canApply && resolved.length && !errors.length);
    return `<div class="recognition-feedback" id="recognition-feedback" aria-live="polite">
      <div class="recognition-summary"><span>识别 ${resolved.length} 项</span><span>歧义 ${ambiguous.length} · 未识别 ${unknown.length}</span></div>
      <div class="recognition-tier-note"><b>加入后的累计预排：</b>${skillCount >= 20 ? "前 10 项高，第 11–20 项中，第 21 项以后低" : `共 ${skillCount} 个新增技能，尚不足 20 个，本轮均为高`}；已有因子的手动优先级保持不变。</div>
      ${items ? `<div class="recognition-list">${items}</div>` : '<div class="recognition-issue error" role="alert"><b>没有识别到可用因子</b>请补充更完整的因子名称后重试。</div>'}
      ${ambiguityBlocks}${unknownBlocks}${warningBlocks}${errorBlocks}
      <div class="recognition-preview-actions">
        <button class="recognition-cancel" id="cancel-factor-recognition" type="button">返回修改</button>
        <button class="recognition-apply" id="stage-factor-recognition" type="button" ${canApply ? "" : "disabled"}>加入待导入 · ${resolved.length} 项</button>
      </div>
    </div>`;
  }

  function renderPendingRecognition() {
    const items = mergeRecognitionItems();
    if (!items.length) return "";
    const tierByKey = plannedRecognitionTiers(items);
    const skillCount = newRecognitionSkillCount(items);
    return `<div class="recognition-draft" id="recognition-draft" aria-live="polite">
      <div class="recognition-summary"><span>待导入 ${state.recognitionBatches.length} 段 · ${items.length} 项</span><span>新增技能 ${skillCount} 项</span></div>
      <div class="recognition-tier-note"><b>本轮累计优先级：</b>${skillCount >= 20 ? "前 10 项高，第 11–20 项中，第 21 项以后低" : "技能不足 20 个，全部为高"}；重复因子已合并。</div>
      <details class="recognition-details"><summary>查看累计清单</summary><div class="recognition-list">${items.map((item) => renderRecognitionItem(item, tierByKey)).join("")}</div></details>
      <div class="recognition-preview-actions">
        <button class="recognition-cancel" id="clear-pending-recognition" type="button">清空待导入</button>
        <button class="recognition-apply" id="apply-pending-recognition" type="button">应用全部 ${items.length} 项</button>
      </div>
    </div>`;
  }

  function renderQuickRecognizer() {
    const ready = Boolean(state.factorIndex && recognizer);
    const disabled = !ready || !state.quickFactorText.trim();
    return `<div class="quick-recognizer">
      <div class="recognizer-head"><div><label class="recognizer-label" for="bulk-factor-input">一键识别因子文本</label><p class="recognizer-helper" id="bulk-factor-help">可分多段识别并累计到待导入清单，确认后一次应用。</p></div><span class="recognizer-kicker">${ready ? "本地解析" : "尚未就绪"}</span></div>
      <textarea class="recognizer-textarea" id="bulk-factor-input" aria-describedby="bulk-factor-help" placeholder="例如：毅力9本体3，英里9本体3，心头一击，位置感打基础点燃青春智，URA剧本" ${ready ? "" : "disabled"}>${escapeHtml(state.quickFactorText)}</textarea>
      <div class="recognizer-actions"><span class="recognizer-hint">未写星级的新因子默认家系 1★、本体 0★；识别至少 20 个技能时会按原文顺序自动分为高 / 中 / 低。</span><button class="recognizer-button" id="recognize-factor-text" type="button" ${disabled ? "disabled" : ""}>${ICONS.scan}识别并预览</button></div>
      ${renderRecognitionNotice()}
      ${renderPendingRecognition()}
      ${renderRecognitionPreview()}
    </div>`;
  }

  function renderConfigurator() {
    const meta = activeFactorVisualMeta();
    const activeWhiteSubtype = state.activeColor === "white" ? WHITE_SUBTYPE_META[state.activeSubtype] : null;
    const searchLabel = activeWhiteSubtype ? `白因子·${activeWhiteSubtype.name}` : meta.name;
    const searchExamples = activeWhiteSubtype?.examples || meta.examples;
    return `
      ${renderQuickRecognizer()}
      <div class="factor-tabs" role="tablist" aria-label="因子颜色">${state.colorOrder.map((colorId) => {
        const tabMeta = COLOR_META[colorId];
        return `<button type="button" role="tab" aria-selected="${state.activeColor === colorId}" class="factor-tab ${state.activeColor === colorId ? "active" : ""}" data-tab="${colorId}" style="--factor-color:${tabMeta.color};--factor-soft:${tabMeta.soft}">${tabMeta.name.replace("因子", "")}</button>`;
      }).join("")}</div>
      <div style="--factor-color:${meta.color};--factor-soft:${meta.soft}">
        ${renderSubtypeTabs()}
        <div class="search-field">${ICONS.search}<input class="search-input" id="factor-search" type="search" value="${escapeHtml(state.factorQuery)}" placeholder="搜索${searchLabel}，如${searchExamples}" aria-label="搜索${searchLabel}，示例：${searchExamples}" autocomplete="off" ${state.loadingFactors ? "disabled" : ""}></div>
        <div class="catalog-shell" id="catalog-shell">${renderFactorCatalog()}</div>
        ${renderSelectedForColor(state.activeColor)}
      </div>`;
  }

  function renderBreakdown(item) {
    return state.colorOrder.map((colorId) => {
      const value = item.breakdown[colorId];
      if (!value) return "";
      const meta = COLOR_META[colorId];
      return `<div class="breakdown-item" style="--factor-color:${meta.color};--factor-soft:${meta.soft}"><b>${value.score.toFixed(1)}</b><span>${meta.name.replace("因子", "")} 达标 ${value.satisfied}/${value.requested}</span></div>`;
    }).join("");
  }

  function renderResultFactors(item) {
    const requestedKeys = new Set(
      item.matches.map((match) => ranking.factorKey(match.type, match.num))
    );
    const requestedBlueRed = [];
    const requestedOther = [];
    for (const match of item.matches) {
      const matchMeta = factorVisualMeta(match);
      const matchName = match.virtualGold ? `${match.name} → ${match.lowerSkillName}` : match.name;
      const chip = `<span class="match-chip selected-factor ${match.meetsThreshold ? "" : "shortfall"}" style="--factor-color:${matchMeta.color};--factor-soft:${matchMeta.soft}">${match.tier === ranking.REQUIRED_TIER ? "必需 · " : ""}${escapeHtml(matchName)} · 家系 ${match.stars}★ · 本体 ${match.selfStars}★${match.meetsThreshold ? "" : " · 未达标"}</span>`;
      if (match.colorId === "blue" || match.colorId === "red") requestedBlueRed.push(chip);
      else requestedOther.push(chip);
    }

    const typeOrder = new Map([1, 2, 3, 4, 5, 6].map((type, index) => [type, index]));
    const additional = ranking.summarizeCandidateFactors(item.candidate)
      .filter((factor) => !requestedKeys.has(ranking.factorKey(factor.type, factor.num)))
      .sort((left, right) =>
        (typeOrder.get(left.type) ?? 99) - (typeOrder.get(right.type) ?? 99)
        || left.name.localeCompare(right.name, "zh-CN")
      )
      .map((factor) => {
        const factorMeta = factorVisualMeta(factor);
        const factorName = state.factorCatalogNames.get(ranking.factorKey(factor.type, factor.num)) || factor.name;
        return `<span class="match-chip other-factor" title="该种马的其他${factorMeta.name}" style="--factor-color:${factorMeta.color};--factor-soft:${factorMeta.soft}">${escapeHtml(factorName)} · 家系 ${factor.stars}★ · 本体 ${factor.selfStars}★</span>`;
      });
    const requested = [...requestedBlueRed, ...requestedOther];
    return `${requested.length ? `<div class="result-factor-group selected-factors"><div class="result-factor-label"><b>筛选因子</b><span>${requested.length} 项，优先展示</span></div><div class="factor-chip-list">${requested.join("")}</div></div>` : ""}
      ${additional.length ? `<div class="result-factor-group other-factors"><div class="result-factor-label"><b>该种马其他因子</b><span>${additional.length} 项，全部展示</span></div><div class="factor-chip-list">${additional.join("")}</div></div>` : ""}`;
  }

  function renderResults() {
    if (!state.results.length) return "";
    return `
      <section class="section" id="results-section">
        <div class="results-head"><div><h2>推荐列表</h2><p class="helper">综合分仅用于本次偏好内的相对排序。</p></div><div class="result-count">共 ${state.results.length} 位候选</div></div>
        <div class="result-list">${state.results.slice(0, 80).map((item, index) => {
          const candidate = item.candidate || {};
          const hero = candidate.hero_card || {};
          const id = String(candidate.role_id || "未知");
          const heroName = String(hero.name || hero.card_name || "").trim();
          const displayName = heroName || `ID ${id}`;
          const resultMeta = [
            heroName ? `ID ${id}` : "",
            `${Number(hero.win_race_count || 0)} 胜`,
            `双门槛达标 ${item.satisfiedCount}/${item.requestedCount}`,
            item.requiredRequestedCount ? `必需达标 ${item.requiredSatisfiedCount}/${item.requiredRequestedCount}` : ""
          ].filter(Boolean).join(" · ");
          const image = hero.icon_url || "";
          const totalShortfallCount = item.matches.filter((match) => !match.meetsTotalThreshold).length;
          const selfShortfallCount = item.matches.filter((match) => !match.meetsSelfThreshold).length;
          return `<article class="result-card">
            <div class="result-top">
              ${image ? `<img class="hero-image" src="${escapeHtml(image)}" alt="${escapeHtml(displayName)}头像" loading="lazy">` : '<div class="hero-image" aria-hidden="true"></div>'}
              <div><div class="result-name">${escapeHtml(displayName)}</div><div class="result-meta">${escapeHtml(resultMeta)}</div></div>
              <div class="score"><div class="score-value">${item.score.toFixed(1)}</div><div class="score-label">综合匹配</div></div>
            </div>
            <div class="score-track" role="progressbar" aria-label="综合匹配" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${item.score.toFixed(1)}"><div class="score-fill" style="width:${Math.max(0, Math.min(100, item.score))}%"></div></div>
            <div class="breakdown">${renderBreakdown(item)}</div>
            <div class="match-list">${renderResultFactors(item)}</div>
            <div class="result-actions"><span class="scope-note">第 ${index + 1} 名 · 缺少 ${item.misses.length} 项 · 家系不足 ${totalShortfallCount} 项 · 本体不足 ${selfShortfallCount} 项</span><button class="copy-button" type="button" data-copy-id="${escapeHtml(id)}">${ICONS.copy}复制 ID</button></div>
          </article>`;
        }).join("")}</div>
      </section>`;
  }

  function render() {
    const selectedCount = state.selected.size;
    const hasRecognitionWork = Boolean(
      state.recognitionBatches.length || state.recognition || state.quickFactorText.trim()
    );
    const activeMeta = activeFactorVisualMeta();
    elements.body.innerHTML = `
      <section class="section">
        <div class="section-head"><div><h2>1. 选择角色</h2><p class="helper">可多选；不选时搜索全部角色。角色初始星级只用于整理目录。</p></div><span class="badge" style="--factor-color:var(--brand);--factor-soft:#e9f7ef">${state.selectedRoleIds.size} 个</span></div>
        ${state.loadingRoles ? '<div class="loading-line" aria-label="正在加载角色目录"></div>' : renderRoleSelector()}
      </section>
      <section class="section">
        <div class="section-head"><div><h2>2. 拖动颜色优先度</h2><p class="helper">可一次拖到任意位置；综合分相同时也会严格按本顺序逐色比较。触屏或键盘用户可用右侧上下按钮。</p></div></div>
        <ol class="priority-list" id="priority-list">${renderColorOrder()}</ol>
      </section>
      <section class="section">
        <div class="section-head"><div><h2>3. 选择具体因子、双星级与优先级</h2><p class="helper">星级均为最低门槛；本体 0★ 表示本体可以没有该因子。蓝、红因子未同时达到家系与本体门槛时得 0 分；白因子可设为“必需”（100权重）。</p></div><div class="section-head-actions"><span class="badge" style="--factor-color:${activeMeta.color};--factor-soft:${activeMeta.soft}">${selectedCount} 项</span>${selectedCount || hasRecognitionWork ? '<button class="reset-factors" id="reset-factors" type="button">重置因子</button>' : ""}</div></div>
        ${state.loadingFactors ? '<div class="loading-line" aria-label="正在加载因子目录"></div>' : renderConfigurator()}
      </section>
      <section class="section">
        <div class="section-head"><div><h2>4. 搜索范围</h2><p class="helper">会在已选角色内合并默认池、高优先组合与单因子候选，再统一重排。</p></div></div>
        <div class="settings">
          <label class="field-label">每组候选页数<select class="select" id="depth"><option value="1" ${state.depth === 1 ? "selected" : ""}>1 页 · 最多 20 位</option><option value="2" ${state.depth === 2 ? "selected" : ""}>2 页 · 最多 40 位（推荐）</option><option value="3" ${state.depth === 3 ? "selected" : ""}>3 页 · 最多 60 位</option></select></label>
          <label class="field-label">可借状态<span class="toggle"><input id="filter-full" type="checkbox" ${state.filterFull ? "checked" : ""}>过滤关注人数已满</span></label>
          <label class="field-label">候选缓存<span class="toggle"><input id="force-refresh" type="checkbox" ${state.forceRefresh ? "checked" : ""}>本次强制刷新</span></label>
        </div>
      </section>
      ${renderResults()}`;
    elements.status.textContent = state.status;
    elements.status.className = `status ${state.statusKind}`;
    const remainingCooldown = cooldownSeconds();
    elements.searchButton.disabled = state.busy
      || state.loadingFactors
      || state.loadingRoles
      || !state.selected.size
      || remainingCooldown > 0;
    elements.searchButton.textContent = state.busy
      ? "正在汇总并评分…"
      : remainingCooldown > 0 ? `请稍候 ${remainingCooldown} 秒` : "开始寻找合适种马";
    scheduleCooldownRender();
    bindRenderedEvents();
  }

  function moveColor(colorId, delta) {
    const current = state.colorOrder.indexOf(colorId);
    const next = Math.min(state.colorOrder.length - 1, Math.max(0, current + delta));
    if (current === next) return;
    const order = [...state.colorOrder];
    order.splice(current, 1);
    order.splice(next, 0, colorId);
    state.colorOrder = order;
    savePreferences();
    render();
  }

  function bindPriorityDrag(list) {
    let draggedColor = null;
    let dropTarget = null;
    let dropPlacement = "before";

    function clearDropIndicators() {
      list.querySelectorAll(".drop-before,.drop-after").forEach((item) => {
        item.classList.remove("drop-before", "drop-after");
      });
      dropTarget = null;
    }

    function resolveDrop(event) {
      let item = event.target.closest(".priority-item");
      if (!item || item.dataset.color === draggedColor) {
        const candidates = [...list.querySelectorAll(".priority-item")]
          .filter((candidate) => candidate.dataset.color !== draggedColor);
        item = candidates.find((candidate) => event.clientY < candidate.getBoundingClientRect().top + candidate.getBoundingClientRect().height / 2)
          || candidates[candidates.length - 1];
      }
      if (!item) return null;
      const rect = item.getBoundingClientRect();
      return {
        item,
        target: item.dataset.color,
        placement: event.clientY >= rect.top + rect.height / 2 ? "after" : "before"
      };
    }

    list.addEventListener("dragstart", (event) => {
      const item = event.target.closest(".priority-item");
      if (!item) return;
      draggedColor = item.dataset.color;
      item.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedColor);
    });
    list.addEventListener("dragend", (event) => {
      event.target.closest(".priority-item")?.classList.remove("dragging");
      clearDropIndicators();
      draggedColor = null;
    });
    list.addEventListener("dragover", (event) => {
      if (!draggedColor) return;
      event.preventDefault();
      const resolved = resolveDrop(event);
      clearDropIndicators();
      if (!resolved) return;
      dropTarget = resolved.target;
      dropPlacement = resolved.placement;
      resolved.item.classList.add(resolved.placement === "after" ? "drop-after" : "drop-before");
      event.dataTransfer.dropEffect = "move";
    });
    list.addEventListener("drop", (event) => {
      event.preventDefault();
      const source = draggedColor || event.dataTransfer.getData("text/plain");
      const resolved = dropTarget ? { target: dropTarget, placement: dropPlacement } : resolveDrop(event);
      clearDropIndicators();
      if (!resolved?.target || !source || resolved.target === source) return;
      state.colorOrder = ranking.reorderColor(state.colorOrder, source, resolved.target, resolved.placement);
      savePreferences();
      render();
    });
  }

  function updateFactorCatalog(query) {
    state.factorQuery = String(query || "");
    const shell = shadow.getElementById("catalog-shell");
    if (!shell) return;
    shell.innerHTML = renderFactorCatalog(state.factorQuery);
  }

  function updateRoleCatalog(query) {
    state.roleQuery = String(query || "");
    const shell = shadow.getElementById("role-catalog-shell");
    if (!shell) return;
    shell.innerHTML = renderRoleCatalog(state.roleQuery);
  }

  function cloneSelectedMap(source = state.selected) {
    return new Map([...source.entries()].map(([key, value]) => [key, { ...value }]));
  }

  function invalidateFactorImportUndo() {
    if (!state.importUndo) return;
    state.importUndo = null;
    state.recognitionNotice = null;
    shadow.getElementById("recognition-notice")?.remove();
  }

  function recognizeQuickFactorText() {
    const input = shadow.getElementById("bulk-factor-input");
    state.quickFactorText = String(input?.value || state.quickFactorText || "");
    if (!state.importUndo) state.recognitionNotice = null;
    if (!recognizer || !state.factorIndex) {
      state.recognition = null;
      state.recognitionNotice = { kind: "error", message: "因子识别器尚未就绪，请刷新页面后重试。" };
      render();
      return;
    }
    try {
      state.recognition = recognizer.recognizeFactorText(state.quickFactorText, state.factorIndex);
    } catch (error) {
      state.recognition = null;
      state.recognitionNotice = { kind: "error", message: error instanceof Error ? error.message : String(error) };
    }
    render();
    setTimeout(() => {
      const apply = shadow.getElementById("stage-factor-recognition");
      const target = apply && !apply.disabled ? apply : shadow.getElementById("bulk-factor-input");
      target?.focus();
      shadow.getElementById("recognition-feedback")?.scrollIntoView({ block: "nearest" });
    }, 0);
  }

  function stageRecognizedFactors() {
    const result = state.recognition;
    const resolved = Array.isArray(result?.resolved) ? result.resolved : [];
    if (!result?.canApply || !resolved.length || (result.errors || []).length) return;
    state.recognitionBatches.push({
      resolved: resolved.map((item) => ({ ...item, factor: { ...(item.factor || item) } }))
    });
    state.recognition = null;
    state.quickFactorText = "";
    state.recognitionNotice = {
      kind: "success",
      message: `已加入第 ${state.recognitionBatches.length} 段；可以继续粘贴，或应用全部待导入因子。`
    };
    render();
    setTimeout(() => shadow.getElementById("bulk-factor-input")?.focus(), 0);
  }

  function clearPendingRecognition() {
    const count = mergeRecognitionItems().length;
    state.recognitionBatches = [];
    state.recognition = null;
    state.recognitionNotice = count
      ? { kind: "success", message: `已清空 ${count} 个待导入因子，当前已选因子不受影响。` }
      : null;
    render();
    setTimeout(() => shadow.getElementById("bulk-factor-input")?.focus(), 0);
  }

  function applyPendingRecognizedFactors() {
    const resolved = mergeRecognitionItems();
    if (!resolved.length) return;
    const before = cloneSelectedMap();
    const tierByKey = plannedRecognitionTiers(resolved);
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    for (const item of resolved) {
      const factor = item.factor || item;
      if (factor?.type === undefined || factor?.num === undefined) continue;
      const key = ranking.factorKey(factor.type, factor.num);
      const current = state.selected.get(key);
      const next = {
        ...factor,
        tier: current
          ? ranking.clampTier(current.tier, 1, factor.colorId === "white")
          : tierByKey.get(key) ?? 1,
        minStars: item.explicitTotal
          ? ranking.clampFactorStars(item.minStars)
          : current ? ranking.clampFactorStars(current.minStars) : 1,
        minSelfStars: item.explicitSelf
          ? ranking.clampSelfStars(item.minSelfStars)
          : current ? ranking.clampSelfStars(current.minSelfStars) : ranking.DEFAULT_SELF_STARS
      };
      if (!current) added += 1;
      else if (
        current.minStars !== next.minStars ||
        current.minSelfStars !== next.minSelfStars ||
        current.tier !== next.tier
      ) updated += 1;
      else unchanged += 1;
      state.selected.set(key, next);
    }
    const changed = added + updated;
    state.importUndo = changed ? { kind: "import", selected: before } : null;
    const batchCount = state.recognitionBatches.length;
    state.recognitionBatches = [];
    state.recognition = null;
    state.quickFactorText = "";
    state.recognitionNotice = {
      kind: "success",
      message: `已应用 ${batchCount} 段共 ${resolved.length} 项：新增 ${added}、更新 ${updated}${unchanged ? `、保持 ${unchanged}` : ""}。`
    };
    savePreferences();
    render();
    setTimeout(() => shadow.getElementById(state.importUndo ? "undo-factor-import" : "bulk-factor-input")?.focus(), 0);
  }

  function undoRecognizedFactorImport() {
    if (!state.importUndo?.selected) return;
    const undo = state.importUndo;
    const undoKind = undo.kind;
    state.selected = cloneSelectedMap(undo.selected);
    if (undoKind === "reset") {
      state.results = Array.isArray(undo.results) ? undo.results : [];
      state.status = undo.status || "已恢复重置前的因子选择。";
      state.statusKind = undo.statusKind || "neutral";
    }
    state.importUndo = null;
    state.recognitionNotice = {
      kind: "success",
      message: undoKind === "reset" ? "已恢复重置前的因子选择。" : "已撤销上一次一键识别导入。"
    };
    savePreferences();
    render();
    setTimeout(() => shadow.getElementById("bulk-factor-input")?.focus(), 0);
  }

  function resetSelectedFactors() {
    const pendingCount = mergeRecognitionItems().length;
    const hasRecognition = Boolean(state.recognition || state.quickFactorText.trim());
    if (!state.selected.size && !pendingCount && !hasRecognition) return;
    const before = cloneSelectedMap();
    const clearedCount = state.selected.size;
    const undo = clearedCount ? {
      kind: "reset",
      selected: before,
      results: state.results,
      status: state.status,
      statusKind: state.statusKind
    } : null;
    state.selected.clear();
    state.results = [];
    state.recognition = null;
    state.recognitionBatches = [];
    state.quickFactorText = "";
    state.importUndo = undo;
    state.recognitionNotice = {
      kind: "success",
      message: `已重置 ${clearedCount} 个已选因子${pendingCount ? `及 ${pendingCount} 个待导入因子` : ""}；角色、颜色顺序和搜索范围保持不变。`
    };
    state.statusKind = "neutral";
    state.status = clearedCount
      ? "已清空因子选择；可以重新选择或撤销本次重置。"
      : "已清空识别内容，可以重新输入。";
    savePreferences();
    render();
    setTimeout(() => shadow.getElementById(undo ? "undo-factor-import" : "bulk-factor-input")?.focus(), 0);
  }

  function bindFactorTierDrag() {
    const cards = [...shadow.querySelectorAll(".selected-card[draggable='true']")];
    const blocks = [...shadow.querySelectorAll("[data-factor-tier]")];
    let draggedKey = null;

    function clearActiveBlocks() {
      blocks.forEach((block) => block.classList.remove("factor-drop-active"));
    }

    cards.forEach((card) => {
      card.addEventListener("dragstart", (event) => {
        if (event.target.closest("button,input,select")) {
          event.preventDefault();
          return;
        }
        draggedKey = card.dataset.key;
        card.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", draggedKey);
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        clearActiveBlocks();
        draggedKey = null;
      });
    });

    blocks.forEach((block) => {
      block.addEventListener("dragover", (event) => {
        if (!draggedKey) return;
        event.preventDefault();
        clearActiveBlocks();
        block.classList.add("factor-drop-active");
        event.dataTransfer.dropEffect = "move";
      });
      block.addEventListener("drop", (event) => {
        event.preventDefault();
        const key = draggedKey || event.dataTransfer.getData("text/plain");
        const item = state.selected.get(key);
        clearActiveBlocks();
        if (!item) return;
        const nextTier = ranking.clampTier(block.dataset.factorTier, item.tier, item.colorId === "white");
        if (item.tier === nextTier) return;
        invalidateFactorImportUndo();
        item.tier = nextTier;
        state.selected.set(key, item);
        savePreferences();
        render();
      });
    });
  }

  function bindRenderedEvents() {
    const bulkInput = shadow.getElementById("bulk-factor-input");
    const recognizeButton = shadow.getElementById("recognize-factor-text");
    bulkInput?.addEventListener("input", () => {
      state.quickFactorText = bulkInput.value;
      recognizeButton.disabled = !state.factorIndex || !bulkInput.value.trim();
      if (state.recognition) {
        state.recognition = null;
        shadow.getElementById("recognition-feedback")?.remove();
      }
      if (state.recognitionNotice?.kind === "error" && !state.importUndo) {
        state.recognitionNotice = null;
        shadow.getElementById("recognition-notice")?.remove();
      }
    });
    bulkInput?.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !recognizeButton?.disabled) {
        event.preventDefault();
        recognizeQuickFactorText();
      }
    });
    recognizeButton?.addEventListener("click", recognizeQuickFactorText);
    shadow.getElementById("cancel-factor-recognition")?.addEventListener("click", () => {
      state.recognition = null;
      render();
      setTimeout(() => shadow.getElementById("bulk-factor-input")?.focus(), 0);
    });
    shadow.getElementById("stage-factor-recognition")?.addEventListener("click", stageRecognizedFactors);
    shadow.getElementById("clear-pending-recognition")?.addEventListener("click", clearPendingRecognition);
    shadow.getElementById("apply-pending-recognition")?.addEventListener("click", applyPendingRecognizedFactors);
    shadow.getElementById("undo-factor-import")?.addEventListener("click", undoRecognizedFactorImport);
    shadow.getElementById("reset-factors")?.addEventListener("click", resetSelectedFactors);
    const priorityList = shadow.getElementById("priority-list");
    if (priorityList) {
      bindPriorityDrag(priorityList);
      priorityList.querySelectorAll(".order-up").forEach((button) => button.addEventListener("click", () => moveColor(button.dataset.color, -1)));
      priorityList.querySelectorAll(".order-down").forEach((button) => button.addEventListener("click", () => moveColor(button.dataset.color, 1)));
    }
    bindFactorTierDrag();
    shadow.querySelectorAll("[data-role-rarity]").forEach((button) => button.addEventListener("click", () => {
      state.roleRarity = button.dataset.roleRarity;
      state.roleCatalogLimit = 60;
      render();
      shadow.getElementById("role-search")?.focus();
    }));
    const roleSearch = shadow.getElementById("role-search");
    roleSearch?.addEventListener("input", () => {
      state.roleCatalogLimit = 60;
      updateRoleCatalog(roleSearch.value);
    });
    const roleCatalogShell = shadow.getElementById("role-catalog-shell");
    roleCatalogShell?.addEventListener("click", (event) => {
      if (event.target.closest("#role-catalog-more")) {
        state.roleCatalogLimit += 60;
        updateRoleCatalog(state.roleQuery);
        return;
      }
      const roleOption = event.target.closest("[data-role-id]");
      if (!roleOption) return;
      const cardId = roleOption.dataset.roleId;
      if (state.selectedRoleIds.has(cardId)) state.selectedRoleIds.delete(cardId);
      else state.selectedRoleIds.add(cardId);
      savePreferences();
      render();
      shadow.getElementById("role-search")?.focus();
    });
    shadow.getElementById("clear-roles")?.addEventListener("click", () => {
      state.selectedRoleIds.clear();
      savePreferences();
      render();
      shadow.getElementById("role-search")?.focus();
    });
    shadow.querySelectorAll(".factor-tab").forEach((button) => button.addEventListener("click", () => {
      state.activeColor = button.dataset.tab;
      state.activeSubtype = button.dataset.tab === "white" ? "剧本" : "all";
      state.factorQuery = "";
      state.catalogLimit = 60;
      render();
    }));
    shadow.querySelectorAll(".subtype-tab").forEach((button) => button.addEventListener("click", () => {
      state.activeSubtype = button.dataset.subtype;
      state.catalogLimit = 60;
      render();
      shadow.getElementById("factor-search")?.focus();
    }));
    const searchInput = shadow.getElementById("factor-search");
    searchInput?.addEventListener("input", () => {
      state.catalogLimit = 60;
      updateFactorCatalog(searchInput.value);
    });
    const catalogShell = shadow.getElementById("catalog-shell");
    catalogShell?.addEventListener("click", (event) => {
      if (event.target.closest("#catalog-more")) {
        state.catalogLimit += 60;
        updateFactorCatalog(state.factorQuery);
        return;
      }
      const selectedKey = event.target.closest("[data-selected-factor]")?.dataset.selectedFactor;
      if (selectedKey) {
        invalidateFactorImportUndo();
        state.selected.delete(selectedKey);
        savePreferences();
        render();
        const nextSearch = shadow.getElementById("factor-search");
        nextSearch?.focus();
        nextSearch?.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
        return;
      }
      const key = event.target.closest("[data-add-factor]")?.dataset.addFactor;
      const factor = state.factors.find((item) => catalogFactorKey(item) === key);
      if (!factor) return;
      invalidateFactorImportUndo();
      const targetKey = ranking.factorKey(factor.type, factor.num);
      const previous = state.selected.get(targetKey);
      state.selected.set(targetKey, {
        ...factor,
        tier: previous?.tier ?? 1,
        minStars: previous?.minStars ?? 1,
        minSelfStars: previous?.minSelfStars ?? ranking.DEFAULT_SELF_STARS
      });
      savePreferences();
      render();
      const nextSearch = shadow.getElementById("factor-search");
      nextSearch?.focus();
      nextSearch?.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
    });
    shadow.querySelectorAll("[data-total-star-key]").forEach((select) => select.addEventListener("change", () => {
      const item = state.selected.get(select.dataset.totalStarKey);
      if (!item) return;
      invalidateFactorImportUndo();
      item.minStars = ranking.clampFactorStars(select.value);
      state.selected.set(select.dataset.totalStarKey, item);
      savePreferences();
    }));
    shadow.querySelectorAll("[data-self-star-key]").forEach((select) => select.addEventListener("change", () => {
      const item = state.selected.get(select.dataset.selfStarKey);
      if (!item) return;
      invalidateFactorImportUndo();
      item.minSelfStars = ranking.clampSelfStars(select.value);
      state.selected.set(select.dataset.selfStarKey, item);
      savePreferences();
    }));
    shadow.querySelectorAll("[data-tier-key]").forEach((select) => select.addEventListener("change", () => {
      const item = state.selected.get(select.dataset.tierKey);
      if (!item) return;
      invalidateFactorImportUndo();
      item.tier = ranking.clampTier(select.value, item.tier, item.colorId === "white");
      state.selected.set(select.dataset.tierKey, item);
      savePreferences();
      render();
    }));
    shadow.getElementById("depth")?.addEventListener("change", (event) => {
      state.depth = clampDepth(event.target.value);
      savePreferences();
    });
    shadow.getElementById("filter-full")?.addEventListener("change", (event) => {
      state.filterFull = event.target.checked;
      savePreferences();
    });
    shadow.getElementById("force-refresh")?.addEventListener("change", (event) => {
      state.forceRefresh = event.target.checked;
    });
    shadow.querySelectorAll("[data-copy-id]").forEach((button) => button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copyId);
        button.textContent = "已复制";
      } catch (_) {
        const input = document.createElement("textarea");
        input.value = button.dataset.copyId;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
        button.textContent = "已复制";
      }
    }));
  }

  function responseRecords(response) {
    return Array.isArray(response?.data?.records) ? response.data.records : [];
  }

  function apiError(response) {
    if (response?.code === -101) return new Error("请先在吗哩吗哩页面登录 B 站账号，再开始搜索。");
    return new Error(response?.message || `接口返回错误码 ${String(response?.code)}`);
  }

  async function searchCandidates() {
    if (state.busy || !state.selected.size) return;
    if (!searchGuard) {
      state.statusKind = "error";
      state.status = "访问保护模块未加载，请重新加载扩展后刷新页面。";
      render();
      return;
    }
    const initialCooldown = cooldownSeconds();
    if (initialCooldown > 0) {
      state.statusKind = "neutral";
      state.status = `为避免接口访问过快，请等待 ${initialCooldown} 秒后再搜索。`;
      render();
      return;
    }
    state.busy = true;
    state.results = [];
    state.statusKind = "neutral";
    const forceRefresh = state.forceRefresh;
    state.forceRefresh = false;
    if (forceRefresh) searchGuard.clearCache();
    state.status = forceRefresh ? "已清空候选缓存，正在重新查询…" : "正在准备候选查询…";
    render();
    const preferences = preferenceDocument();
    const plans = ranking.planQueries(preferences, 12);
    const totalSteps = plans.length * state.depth;
    const candidates = new Map();
    let completed = 0;
    let cacheHits = 0;
    try {
      for (const plan of plans) {
        for (let page = 1; page <= state.depth; page += 1) {
          state.status = `正在搜索“${plan.label}” · ${Math.min(completed + 1, totalSteps)}/${totalSteps}`;
          render();
          const requestPayload = {
            filters: plan.filters,
            cardIds: preferences.cardIds,
            pageNum: page,
            pageSize: 20,
            filterFollowReachLimit: state.filterFull
          };
          const guarded = await searchGuard.request(
            requestPayload,
            () => bridgeRequest("SEARCH_PAGE", requestPayload)
          );
          const response = guarded.value;
          if (guarded.cached) cacheHits += 1;
          if (response?.code !== 0) throw apiError(response);
          for (const candidate of responseRecords(response)) {
            const id = String(candidate.role_id ?? "");
            if (id) candidates.set(id, candidate);
          }
          completed += 1;
          if (!response?.data?.has_next_page) break;
        }
      }
      state.results = ranking.rankCandidates([...candidates.values()], preferences);
      state.statusKind = "success";
      state.status = state.results.length
        ? cacheHits
          ? `已复用 ${cacheHits} 项候选缓存，并按新的颜色与因子优先级重新评分排序；共合并 ${candidates.size} 位候选。`
          : `已重新查询并合并 ${candidates.size} 位候选，按当前优先级完成评分排序。`
        : "没有找到带有所选因子的候选，请降低条件或增加搜索页数。";
      render();
      const resultsSection = shadow.getElementById("results-section");
      if (resultsSection) {
        const bodyTop = elements.body.getBoundingClientRect().top;
        const targetTop = resultsSection.getBoundingClientRect().top - bodyTop + elements.body.scrollTop;
        elements.body.scrollTo({
          top: Math.max(0, targetTop - 14),
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
        });
      }
    } catch (error) {
      state.statusKind = "error";
      state.status = error?.riskControl
        ? "接口提示访问过于频繁，本页搜索已暂停 60 秒，请稍后再试。"
        : error instanceof Error ? error.message : String(error);
      render();
    } finally {
      if (preferences.desiredFactors.length >= MANY_FACTOR_COOLDOWN_THRESHOLD) {
        searchGuard.finishSearch();
      }
      state.busy = false;
      render();
    }
  }

  elements.searchButton.addEventListener("click", searchCandidates);

  async function initialize() {
    try {
      await loadPreferences();
      const [factorResponse, roleResponse] = await Promise.all([
        bridgeRequest("GET_FACTORS"),
        bridgeRequest("GET_HERO_CARDS")
      ]);
      if (factorResponse?.code !== 0) throw apiError(factorResponse);
      if (roleResponse?.code !== 0) throw apiError(roleResponse);
      const liveFactors = ranking.flattenFactorResponse(factorResponse.data);
      if (!goldSkillMap?.extendFactorCatalog) throw new Error("金技能映射模块未加载，请重新加载扩展后刷新页面。");
      state.factors = goldSkillMap.extendFactorCatalog(liveFactors);
      state.factorCatalogNames = new Map(liveFactors.map((factor) => [
        ranking.factorKey(factor.type, factor.num),
        factor.name
      ]));
      state.roles = ranking.flattenHeroCardResponse(roleResponse.data);
      if (!state.factors.length) throw new Error("因子目录为空，请刷新页面重试。");
      if (!state.roles.length) throw new Error("角色目录为空，请刷新页面重试。");
      if (!recognizer?.buildCatalogIndex) throw new Error("因子识别模块未加载，请重新加载扩展后刷新页面。");
      const traditionalAliases = traditionalNameMap?.buildAliases?.(state.factors) || [];
      state.factorIndex = recognizer.buildCatalogIndex(state.factors, { aliases: traditionalAliases });
      const liveRoleIds = new Set(state.roles.map((role) => String(role.card_id)));
      state.selectedRoleIds = new Set(
        [...state.selectedRoleIds].filter((cardId) => liveRoleIds.has(cardId))
      );
      // Rehydrate persisted records against the current live catalog.
      for (const [key, selected] of state.selected.entries()) {
        const current = state.factors.find((factor) =>
          ranking.factorKey(factor.type, factor.num) === key
          && Boolean(factor.virtualGold) === Boolean(selected.virtualGold)
          && (!selected.virtualGold || factor.goldSkillName === selected.goldSkillName)
        ) || liveFactors.find((factor) => ranking.factorKey(factor.type, factor.num) === key);
        if (current) state.selected.set(key, {
          ...current,
          tier: selected.tier,
          minStars: ranking.clampFactorStars(selected.minStars),
          minSelfStars: ranking.clampSelfStars(selected.minSelfStars)
        });
        else state.selected.delete(key);
      }
      state.loadingFactors = false;
      state.loadingRoles = false;
      const goldCount = state.factors.filter((factor) => factor.virtualGold).length;
      state.status = `已读取 ${state.roles.length} 个角色、${liveFactors.length} 个简中因子，并加入 ${goldCount} 个可映射金技能；请选择偏好后搜索。`;
      savePreferences();
    } catch (error) {
      state.loadingFactors = false;
      state.loadingRoles = false;
      state.statusKind = "error";
      state.status = error instanceof Error ? error.message : String(error);
    }
    if (state.open) render();
    else {
      elements.status.textContent = state.status;
      elements.searchButton.disabled = !state.selected.size || !state.roles.length;
    }
  }

  initialize();
})();
