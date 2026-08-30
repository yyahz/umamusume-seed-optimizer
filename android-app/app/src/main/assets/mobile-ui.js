(function seedSearcherMobileUi() {
  "use strict";

  if (globalThis.__UMA_SEED_SEARCHER_MOBILE_UI__) return;

  const ICONS = {
    roles: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.5-4 2.7-6 6.5-6s6 2 6.5 6"/></svg>',
    factors: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="2"/><rect x="14" y="4" width="6" height="6" rx="2"/><rect x="4" y="14" width="6" height="6" rx="2"/><rect x="14" y="14" width="6" height="6" rx="2"/></svg>',
    results: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><path d="m3.5 6 .8.8L6 5M3.5 12l.8.8L6 11M3.5 18l.8.8L6 17"/></svg>'
  };
  const PAGE_ORDER = ["roles", "factors", "results"];
  const PAGE_LABELS = {
    roles: "角色",
    factors: "因子",
    results: "结果"
  };

  let activePage = "roles";
  let applyScheduled = false;
  let awaitingResults = false;
  const scrollPositions = new Map();

  function findUi() {
    const host = document.getElementById("uma-seed-optimizer-host");
    const root = host?.shadowRoot;
    const panel = root?.getElementById("panel");
    const body = root?.getElementById("body");
    return host && root && panel && body ? { host, root, panel, body } : null;
  }

  function textCount(element) {
    const match = String(element?.textContent || "").match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  function setFactorHeading(section) {
    const heading = section?.querySelector(".section-head h2");
    const helper = section?.querySelector(".section-head .helper");
    if (!heading || !helper) return;
    heading.textContent = "选择与调整因子";
    helper.textContent = "可粘贴攻略智能识别或逐项选择；已选因子的星级与优先级可在目录下方调整。";
  }

  function ensureFactorEditingHeading(section) {
    const firstTier = section?.querySelector(".tier-block");
    if (!firstTier || section.querySelector(".mobile-selected-heading")) return;
    const heading = document.createElement("div");
    heading.className = "mobile-selected-heading";
    heading.innerHTML = '<h3>已选因子设置</h3><p>设置家系、本体最低星级和高 / 中 / 低 / 必需优先级。</p>';
    firstTier.before(heading);
  }

  function updateNavigation(ui) {
    const roleSection = ui.body.querySelector(':scope > .section[data-mobile-section="roles"]');
    const factorSection = ui.body.querySelector(':scope > .section[data-mobile-section~="factors"]');
    const resultsSection = ui.root.getElementById("results-section");
    const roleCount = textCount(roleSection?.querySelector(".badge"));
    const factorCount = textCount(factorSection?.querySelector(".badge"));
    const resultCount = textCount(resultsSection?.querySelector(".result-count"));
    const counts = { roles: roleCount, factors: factorCount, results: resultCount };
    ui.host.dataset.mobileHasFactors = String(factorCount > 0);

    ui.root.querySelectorAll(".mobile-nav-button").forEach((button) => {
      const page = button.dataset.mobileTarget;
      const isActive = page === activePage;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
      const badge = button.querySelector(".mobile-nav-badge");
      const count = counts[page] || 0;
      if (badge) {
        badge.textContent = String(count);
        badge.hidden = count === 0;
      }
    });
  }

  function ensureEmptyResults(ui, hasResults) {
    let empty = ui.body.querySelector("[data-mobile-empty-results]");
    if (hasResults) {
      empty?.remove();
      return;
    }
    if (!empty) {
      empty = document.createElement("section");
      empty.className = "section mobile-results-empty";
      empty.dataset.mobileEmptyResults = "";
      empty.dataset.mobileSection = "results";
      ui.body.appendChild(empty);
    }
    empty.innerHTML = `${ICONS.results}<h2>${awaitingResults ? "正在寻找合适种马" : "还没有推荐结果"}</h2><p>${awaitingResults ? "候选正在汇总和评分，请稍候。" : "先在“因子”中选择条件、确认星级并开始搜索。"}</p>`;
  }

  function mapSections(ui) {
    const sections = [...ui.body.children].filter((element) => element.classList.contains("section"));
    const contentSections = sections.filter((section) => !section.hasAttribute("data-mobile-empty-results"));
    const roleSection = contentSections[0];
    const prioritySection = contentSections[1];
    const factorSection = contentSections[2];
    const settingsSection = contentSections[3];
    const resultsSection = ui.root.getElementById("results-section");

    if (roleSection) {
      roleSection.dataset.mobileSection = "roles";
      const heading = roleSection.querySelector(".section-head h2");
      if (heading) heading.textContent = "选择角色";
    }
    if (prioritySection) {
      prioritySection.dataset.mobileSection = "roles";
      const heading = prioritySection.querySelector(".section-head h2");
      if (heading) heading.textContent = "颜色排序";
    }
    if (factorSection) {
      factorSection.dataset.mobileSection = "factors";
      setFactorHeading(factorSection);
      ensureFactorEditingHeading(factorSection);
    }
    if (settingsSection && settingsSection !== resultsSection) {
      settingsSection.dataset.mobileSection = "factors";
      const heading = settingsSection.querySelector(".section-head h2");
      if (heading) heading.textContent = "搜索设置";
    }
    if (resultsSection) resultsSection.dataset.mobileSection = "results";

    ensureEmptyResults(ui, Boolean(resultsSection));
    updateNavigation(ui);
  }

  function activate(page, options = {}) {
    const ui = findUi();
    if (!ui || !PAGE_ORDER.includes(page)) return false;
    if (!options.skipSave) scrollPositions.set(activePage, ui.body.scrollTop);
    activePage = page;
    ui.host.dataset.mobilePage = page;
    mapSections(ui);
    const pageName = PAGE_LABELS[page];
    ui.panel.setAttribute("aria-label", `种马搜索器 · ${pageName}`);
    requestAnimationFrame(() => {
      ui.body.scrollTop = options.resetScroll ? 0 : (scrollPositions.get(page) || 0);
      const heading = ui.body.querySelector(`.section[data-mobile-section~="${page}"] h2`);
      heading?.setAttribute("tabindex", "-1");
    });
    return true;
  }

  function install() {
    const ui = findUi();
    if (!ui) {
      setTimeout(install, 50);
      return;
    }
    if (ui.root.getElementById("uma-mobile-ui-style")) return;

    globalThis.__UMA_SEED_SEARCHER_MOBILE_UI__ = {
      back() {
        const index = PAGE_ORDER.indexOf(activePage);
        if (index <= 0) return false;
        activate(PAGE_ORDER[index - 1], { resetScroll: false });
        return true;
      },
      activate
    };
    ui.host.dataset.mobileUi = "true";
    ui.host.dataset.mobilePage = activePage;

    const style = document.createElement("style");
    style.id = "uma-mobile-ui-style";
    style.textContent = `
      :host([data-mobile-ui="true"]) {
        --mobile-nav-height:68px;
        --mobile-action-height:92px;
        --surface:#fff;
        --surface-2:#f4f7f5;
        --ink:#17241d;
        --muted:#607067;
        --line:#e2e9e4;
        --brand:#16a064;
        --brand-dark:#087445;
      }
      :host([data-mobile-ui="true"]) .launcher,
      :host([data-mobile-ui="true"]) .scrim { display:none!important; }
      :host([data-mobile-ui="true"]) .panel {
        width:100vw!important;
        max-width:none!important;
        height:100vh!important;
        max-height:100vh!important;
        background:var(--surface-2);
        box-shadow:none;
      }
      :host([data-mobile-ui="true"]) .panel-header {
        min-height:64px;
        padding:10px 16px;
        color:var(--ink);
        background:#fff;
        border-bottom:1px solid var(--line);
        box-shadow:0 1px 8px #0c2d1b0a;
      }
      :host([data-mobile-ui="true"]) .title-wrap { gap:10px; }
      :host([data-mobile-ui="true"]) .brand-mark {
        width:42px;
        height:42px;
        border-radius:14px;
        background:#edf7f1;
        box-shadow:none;
      }
      :host([data-mobile-ui="true"]) h1 { font-size:18px; }
      :host([data-mobile-ui="true"]) .brand-credit { color:var(--muted); font-size:9px; opacity:.78; }
      :host([data-mobile-ui="true"]) .subtitle { margin-top:1px; color:var(--muted); font-size:11px; }
      :host([data-mobile-ui="true"]) .source-link { color:var(--brand-dark); }
      :host([data-mobile-ui="true"]) #close { display:none!important; }
      :host([data-mobile-ui="true"]) .panel-body {
        overflow-y:auto!important;
        overscroll-behavior-y:contain;
        touch-action:pan-y!important;
        -webkit-overflow-scrolling:touch;
        padding:14px 12px calc(var(--mobile-nav-height) + 18px + env(safe-area-inset-bottom));
        scroll-behavior:smooth;
      }
      :host([data-mobile-ui="true"][data-mobile-page="factors"]) .panel-body,
      :host([data-mobile-ui="true"][data-mobile-page="results"]) .panel-body {
        padding-bottom:calc(var(--mobile-nav-height) + var(--mobile-action-height) + 20px + env(safe-area-inset-bottom));
      }
      :host([data-mobile-ui="true"]) #body > .section { display:none; }
      :host([data-mobile-ui="true"][data-mobile-page="roles"]) #body > .section[data-mobile-section~="roles"],
      :host([data-mobile-ui="true"][data-mobile-page="factors"]) #body > .section[data-mobile-section~="factors"],
      :host([data-mobile-ui="true"][data-mobile-page="results"]) #body > .section[data-mobile-section~="results"] { display:block; }
      :host([data-mobile-ui="true"]) .section {
        margin-bottom:12px;
        padding:16px;
        border:0;
        border-radius:20px;
        background:#fff;
        box-shadow:0 4px 18px #1638230d;
      }
      :host([data-mobile-ui="true"]) .section-head { margin-bottom:14px; }
      :host([data-mobile-ui="true"]) h2 { font-size:19px; line-height:1.35; }
      :host([data-mobile-ui="true"]) .helper { margin-top:5px; font-size:13px; line-height:1.55; }
      :host([data-mobile-ui="true"]) .badge { padding:5px 9px; font-size:12px; }
      :host([data-mobile-ui="true"]) button,
      :host([data-mobile-ui="true"]) select,
      :host([data-mobile-ui="true"]) input { touch-action:manipulation; }
      :host([data-mobile-ui="true"]) button:active { filter:brightness(.96); }
      :host([data-mobile-ui="true"]) .role-catalog,
      :host([data-mobile-ui="true"]) .factor-catalog {
        max-height:none!important;
        overflow:visible!important;
        overscroll-behavior:auto!important;
      }
      :host([data-mobile-ui="true"]) .role-option { min-height:66px; border-radius:14px; }
      :host([data-mobile-ui="true"]) .role-option-name,
      :host([data-mobile-ui="true"]) .factor-option-name { font-size:14px; }
      :host([data-mobile-ui="true"]) .priority-item {
        min-height:60px;
        border:0;
        border-left:5px solid var(--factor-color);
        border-radius:16px;
        box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--factor-color) 20%,var(--line));
      }
      :host([data-mobile-ui="true"]) .quick-recognizer {
        padding:14px;
        border:0;
        border-radius:16px;
        background:#f1f8f4;
      }
      :host([data-mobile-ui="true"]) .recognizer-label { font-size:15px; }
      :host([data-mobile-ui="true"]) .recognizer-helper,
      :host([data-mobile-ui="true"]) .recognizer-hint { font-size:12px; }
      :host([data-mobile-ui="true"]) .recognizer-textarea {
        min-height:132px;
        border-color:#d6e4da;
        border-radius:14px;
        padding:12px;
        font-size:16px;
      }
      :host([data-mobile-ui="true"]) .recognizer-button,
      :host([data-mobile-ui="true"]) .recognition-apply { min-height:48px; background:var(--brand); color:#fff; }
      :host([data-mobile-ui="true"]) .factor-tab { min-height:48px; border-radius:14px; font-size:14px; }
      :host([data-mobile-ui="true"]) .search-input { min-height:50px; border-radius:15px; font-size:16px; }
      :host([data-mobile-ui="true"]) .factor-option { min-height:54px; border-radius:13px; padding:9px 10px; }
      :host([data-mobile-ui="true"][data-mobile-has-factors="false"]) .tier-block,
      :host([data-mobile-ui="true"][data-mobile-has-factors="false"]) .mobile-selected-heading { display:none!important; }
      :host([data-mobile-ui="true"]) .mobile-selected-heading { margin:20px 0 8px; }
      :host([data-mobile-ui="true"]) .mobile-selected-heading h3 { margin:0; font-size:17px; line-height:1.4; }
      :host([data-mobile-ui="true"]) .mobile-selected-heading p { margin:4px 0 0; color:var(--muted); font-size:12px; line-height:1.5; }
      :host([data-mobile-ui="true"]) .tier-block {
        margin-top:12px;
        border-radius:16px;
        background:#fbfcfb;
      }
      :host([data-mobile-ui="true"]) .tier-label { min-height:46px; padding:8px 12px; }
      :host([data-mobile-ui="true"]) .selected-list { gap:8px; padding:8px; }
      :host([data-mobile-ui="true"]) .selected-card {
        grid-template-columns:30px minmax(0,1fr) 104px;
        grid-template-areas:"drag identity tier" "drag total self";
        gap:9px;
        min-height:114px;
        padding:10px;
        border-radius:14px;
        cursor:default;
      }
      :host([data-mobile-ui="true"]) .factor-drag-handle { grid-row:1 / 3; height:100%; }
      :host([data-mobile-ui="true"]) .selected-name { font-size:14px; white-space:normal; line-height:1.4; }
      :host([data-mobile-ui="true"]) .selected-subtype,
      :host([data-mobile-ui="true"]) .compact-factor-field,
      :host([data-mobile-ui="true"]) .tier-field { font-size:11px; text-align:left; }
      :host([data-mobile-ui="true"]) .star-select,
      :host([data-mobile-ui="true"]) .tier-select { min-height:46px; border-radius:11px; padding-inline:8px; font-size:13px; }
      :host([data-mobile-ui="true"]) .settings { grid-template-columns:1fr; gap:12px; }
      :host([data-mobile-ui="true"]) .field-label { font-size:13px; }
      :host([data-mobile-ui="true"]) .select,
      :host([data-mobile-ui="true"]) .toggle { min-height:48px; }
      :host([data-mobile-ui="true"]) .result-card { border:0; border-radius:18px; box-shadow:inset 0 0 0 1px var(--line); }
      :host([data-mobile-ui="true"]) .result-top { grid-template-columns:54px minmax(0,1fr) auto; padding:12px; }
      :host([data-mobile-ui="true"]) .hero-image { width:54px; height:54px; }
      :host([data-mobile-ui="true"]) .result-name { font-size:15px; }
      :host([data-mobile-ui="true"]) .result-meta { white-space:normal; line-height:1.45; }
      :host([data-mobile-ui="true"]) .breakdown { grid-template-columns:repeat(2,1fr); gap:7px; }
      :host([data-mobile-ui="true"]) .breakdown-item { min-height:52px; display:grid; place-content:center; border-radius:12px; }
      :host([data-mobile-ui="true"]) .match-chip { padding:6px 9px; font-size:12px; line-height:1.45; }
      :host([data-mobile-ui="true"]) .result-actions { align-items:stretch; flex-direction:column; padding:10px 12px 12px; }
      :host([data-mobile-ui="true"]) .scope-note { text-align:center; line-height:1.5; }
      :host([data-mobile-ui="true"]) .copy-button { width:100%; justify-content:center; min-height:48px; }
      :host([data-mobile-ui="true"]) .action-bar {
        display:none!important;
        z-index:5;
        bottom:calc(var(--mobile-nav-height) + env(safe-area-inset-bottom));
        padding:8px 12px;
        border-top:1px solid var(--line);
        background:#fffffff7;
        box-shadow:0 -5px 18px #1835220d;
        backdrop-filter:none;
      }
      :host([data-mobile-ui="true"][data-mobile-page="factors"]) .action-bar,
      :host([data-mobile-ui="true"][data-mobile-page="results"]) .action-bar { display:grid!important; }
      :host([data-mobile-ui="true"]) .status { min-height:18px; overflow:hidden; font-size:11px; white-space:nowrap; text-overflow:ellipsis; }
      :host([data-mobile-ui="true"]) .primary {
        min-height:52px;
        border-radius:16px;
        background:var(--brand);
        box-shadow:0 7px 18px #16945e2b;
        font-size:15px;
      }
      :host([data-mobile-ui="true"]) .mobile-nav {
        position:absolute;
        z-index:6;
        left:0;
        right:0;
        bottom:0;
        min-height:calc(var(--mobile-nav-height) + env(safe-area-inset-bottom));
        display:grid;
        grid-template-columns:repeat(3,1fr);
        align-items:start;
        gap:4px;
        padding:7px 8px calc(6px + env(safe-area-inset-bottom));
        border-top:1px solid var(--line);
        background:#fffffff9;
        box-shadow:0 -5px 20px #1835220d;
      }
      :host([data-mobile-ui="true"]) .mobile-nav-button {
        position:relative;
        min-width:0;
        min-height:54px;
        display:grid;
        place-items:center;
        align-content:center;
        gap:2px;
        border:0;
        border-radius:15px;
        color:#718078;
        background:transparent;
        font-size:11px;
        font-weight:700;
      }
      :host([data-mobile-ui="true"]) .mobile-nav-button svg {
        width:23px;
        height:23px;
        stroke-width:1.8;
      }
      :host([data-mobile-ui="true"]) .mobile-nav-button.active { color:var(--brand-dark); background:#eaf7ef; }
      :host([data-mobile-ui="true"]) .mobile-nav-badge {
        position:absolute;
        top:3px;
        left:calc(50% + 8px);
        min-width:17px;
        height:17px;
        display:grid;
        place-items:center;
        border:2px solid #fff;
        border-radius:99px;
        padding:0 3px;
        color:#fff;
        background:var(--brand);
        font-size:9px;
        font-weight:800;
        font-variant-numeric:tabular-nums;
      }
      :host([data-mobile-ui="true"]) .mobile-results-empty {
        min-height:48vh;
        align-content:center;
        justify-items:center;
        text-align:center;
      }
      :host([data-mobile-ui="true"]) .mobile-results-empty > svg {
        width:56px;
        height:56px;
        margin-bottom:14px;
        padding:13px;
        border-radius:18px;
        color:var(--brand-dark);
        background:#eaf7ef;
      }
      :host([data-mobile-ui="true"]) .mobile-results-empty p { max-width:280px; margin:8px 0 0; color:var(--muted); font-size:14px; line-height:1.6; }
      @media (max-width:370px) {
        :host([data-mobile-ui="true"]) .panel-body { padding-inline:9px; }
        :host([data-mobile-ui="true"]) .section { padding:14px; border-radius:18px; }
        :host([data-mobile-ui="true"]) .role-catalog { grid-template-columns:1fr; }
        :host([data-mobile-ui="true"]) .selected-card { grid-template-columns:28px minmax(0,1fr) 96px; }
        :host([data-mobile-ui="true"]) .factor-description { display:none; }
      }
      @media (orientation:landscape) and (max-height:520px) {
        :host([data-mobile-ui="true"]) .panel-header { min-height:54px; padding-block:6px; }
        :host([data-mobile-ui="true"]) .brand-mark { width:38px; height:38px; }
        :host([data-mobile-ui="true"]) .section { padding:14px; }
      }
      @media (prefers-reduced-motion:reduce) {
        :host([data-mobile-ui="true"]) .panel-body { scroll-behavior:auto; }
      }
    `;
    ui.root.appendChild(style);

    const nav = document.createElement("nav");
    nav.className = "mobile-nav";
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "主要页面");
    nav.innerHTML = PAGE_ORDER.map((page) => `
      <button class="mobile-nav-button" type="button" role="tab" data-mobile-target="${page}" aria-label="${PAGE_LABELS[page]}" aria-selected="${page === activePage}">
        ${ICONS[page]}<span>${PAGE_LABELS[page]}</span><span class="mobile-nav-badge" hidden></span>
      </button>
    `).join("");
    ui.panel.appendChild(nav);

    nav.addEventListener("click", (event) => {
      const button = event.target.closest(".mobile-nav-button");
      if (button) activate(button.dataset.mobileTarget);
    });
    ui.root.addEventListener("pointerdown", () => {
      scrollPositions.set(activePage, ui.body.scrollTop);
    }, true);
    ui.root.addEventListener("change", () => {
      scrollPositions.set(activePage, ui.body.scrollTop);
    }, true);
    ui.root.addEventListener("click", (event) => {
      const searchButton = event.target.closest("#search-button");
      if (!searchButton || searchButton.disabled) return;
      awaitingResults = true;
      activate("results", { resetScroll: true });
    }, true);

    const observer = new MutationObserver(() => {
      if (applyScheduled) return;
      applyScheduled = true;
      requestAnimationFrame(() => {
        applyScheduled = false;
        const currentUi = findUi();
        if (!currentUi) return;
        const hasResults = Boolean(currentUi.root.getElementById("results-section"));
        if (hasResults) awaitingResults = false;
        mapSections(currentUi);
        requestAnimationFrame(() => {
          currentUi.body.scrollTop = scrollPositions.get(activePage) || 0;
        });
      });
    });
    observer.observe(ui.body, { childList: true });
    mapSections(ui);
  }

  install();
})();
