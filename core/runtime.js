/**
 * Antigravity Periodic Model Picker · Browser Runtime (core/runtime.js)
 */
(function runPeriodicPickerBoot(boot, fromDcl) {
  if (window.top !== window) return;
  if (!boot || typeof boot !== 'object') return;

  if (window.__ag_pt_dcl_handler) {
    try {
      window.removeEventListener('DOMContentLoaded', window.__ag_pt_dcl_handler);
    } catch (e) {}
    window.__ag_pt_dcl_handler = null;
  }

  const isAntigravityHost = () => {
    if (window.__AG_PT_PREVIEW_HOST__ === true) return true;
    if (window.location && window.location.protocol === 'vscode-file:') return true;
    if (window.__APP_CONFIG__ && window.__APP_CONFIG__.productName === 'antigravity') return true;
    if (
      window.electronNative &&
      (typeof window.electronNative.setTitleBarOverlay === 'function' ||
        typeof window.electronNative.getZoomLevel === 'function')
    ) {
      return true;
    }
    return !!(
      typeof document !== 'undefined' &&
      typeof document.querySelector === 'function' &&
      document.querySelector(
        'link[href*="/jetbox.css"], body[data-agy-theme], body[data-newux-theme], [id="antigravity.agentSidePanelInputBox"], [data-testid="model-selector-trigger"]'
      )
    );
  };

  if (typeof document === 'undefined' || !document.documentElement || !document.body) {
    if (typeof window !== 'undefined' && !fromDcl) {
      window.__ag_pt_dcl_handler = () => {
        window.__ag_pt_dcl_handler = null;
        runPeriodicPickerBoot(boot, true);
      };
      window.addEventListener('DOMContentLoaded', window.__ag_pt_dcl_handler, { once: true });
    }
    return;
  }

  if (!isAntigravityHost()) {
    if (!fromDcl && document.readyState === 'loading') {
      window.__ag_pt_dcl_handler = () => {
        window.__ag_pt_dcl_handler = null;
        runPeriodicPickerBoot(boot, true);
      };
      window.addEventListener('DOMContentLoaded', window.__ag_pt_dcl_handler, { once: true });
      return;
    }
    window.__ag_pt_skip_non_host = true;
    return;
  }
  window.__ag_pt_skip_non_host = false;

  if (typeof window.__ag_pt_teardown === 'function') {
    try {
      window.__ag_pt_teardown();
    } catch (e) {}
  }

  // Purge legacy v1/v2 catalog caches and legacy modal dialog node
  try {
    localStorage.removeItem('ag_periodic_model_catalog_v1');
    localStorage.removeItem('ag_periodic_model_catalog_v2');
  } catch (e) {}
  const legacyDlg = document.getElementById('ag-periodic-model-dialog');
  if (legacyDlg) {
    try {
      if (legacyDlg.open) legacyDlg.close();
    } catch (e) {}
    legacyDlg.remove();
  }

  const PATCH_VERSION = boot.version || '1.0-runtime';
  const ENABLED = boot.enabled !== false;
  const MODULES = Object.assign(
    {
      periodicPicker: true,
      keyboardShortcut: true,
      customCss: true,
      customJs: true
    },
    boot.modules || {}
  );
  const CONFIG = Object.assign(
    {
      enabled: ENABLED,
      periodicTheme: 'auto', // 'auto' | 'dark' | 'light'
      closeOnSelect: 'effort', // 'effort' | 'model' | false
      shortcut: 'Alt+M',
      defaultSeedElements: ['Hydrogen', 'Carbon', 'Neon', 'Argon'],
      defaultSeedOtherModels: [],
      customElementMappings: {},
      extraOtherModels: []
    },
    boot.config || {}
  );

  function resolveCloseMode() {
    const v = CONFIG.closeOnSelect;
    if (v === false || v === 'never') return 'never';
    if (v === 'model' || v === 'immediate') return 'model';
    return 'effort';
  }

  const cleanupFns = [];
  function onCleanup(fn) {
    if (typeof fn === 'function') cleanupFns.push(fn);
  }

  function teardownAll() {
    while (cleanupFns.length > 0) {
      const fn = cleanupFns.pop();
      try {
        fn();
      } catch (e) {}
    }
    document.documentElement.removeAttribute('data-ag-pt-harvesting');
    const hostStyle = document.getElementById('ag-pt-host-style');
    if (hostStyle) hostStyle.remove();
    const userHostStyle = document.getElementById('ag-pt-user-host-style');
    if (userHostStyle) userHostStyle.remove();
    const pop = document.getElementById('ag-periodic-model-popover');
    if (pop) {
      try {
        if (typeof pop.hidePopover === 'function' && pop.matches(':popover-open')) {
          pop.hidePopover();
        }
      } catch (e) {}
      pop.remove();
    }
    const oldDlg = document.getElementById('ag-periodic-model-dialog');
    if (oldDlg) oldDlg.remove();
    delete window.__ag_pt_receive_backend;
    window.__ag_pt_ready = false;
  }

  window.__ag_pt_teardown = teardownAll;
  if (typeof boot.registerExternalCleanup === 'function') {
    boot.registerExternalCleanup(teardownAll);
  }

  if (!ENABLED || MODULES.periodicPicker === false) {
    teardownAll();
    window.__ag_pt_version = PATCH_VERSION;
    return;
  }

  // ==========================================================================
  // 1. Complete 118 IUPAC Elements Coordinate & Chemical Group Table
  // ==========================================================================
  const ELEMENTS = [
    [1, 'H', 'Hydrogen', 1, 1],
    [2, 'He', 'Helium', 1, 18],
    [3, 'Li', 'Lithium', 2, 1],
    [4, 'Be', 'Beryllium', 2, 2],
    [5, 'B', 'Boron', 2, 13],
    [6, 'C', 'Carbon', 2, 14],
    [7, 'N', 'Nitrogen', 2, 15],
    [8, 'O', 'Oxygen', 2, 16],
    [9, 'F', 'Fluorine', 2, 17],
    [10, 'Ne', 'Neon', 2, 18],
    [11, 'Na', 'Sodium', 3, 1],
    [12, 'Mg', 'Magnesium', 3, 2],
    [13, 'Al', 'Aluminium', 3, 13],
    [14, 'Si', 'Silicon', 3, 14],
    [15, 'P', 'Phosphorus', 3, 15],
    [16, 'S', 'Sulfur', 3, 16],
    [17, 'Cl', 'Chlorine', 3, 17],
    [18, 'Ar', 'Argon', 3, 18],
    [19, 'K', 'Potassium', 4, 1],
    [20, 'Ca', 'Calcium', 4, 2],
    [21, 'Sc', 'Scandium', 4, 3],
    [22, 'Ti', 'Titanium', 4, 4],
    [23, 'V', 'Vanadium', 4, 5],
    [24, 'Cr', 'Chromium', 4, 6],
    [25, 'Mn', 'Manganese', 4, 7],
    [26, 'Fe', 'Iron', 4, 8],
    [27, 'Co', 'Cobalt', 4, 9],
    [28, 'Ni', 'Nickel', 4, 10],
    [29, 'Cu', 'Copper', 4, 11],
    [30, 'Zn', 'Zinc', 4, 12],
    [31, 'Ga', 'Gallium', 4, 13],
    [32, 'Ge', 'Germanium', 4, 14],
    [33, 'As', 'Arsenic', 4, 15],
    [34, 'Se', 'Selenium', 4, 16],
    [35, 'Br', 'Bromine', 4, 17],
    [36, 'Kr', 'Krypton', 4, 18],
    [37, 'Rb', 'Rubidium', 5, 1],
    [38, 'Sr', 'Strontium', 5, 2],
    [39, 'Y', 'Yttrium', 5, 3],
    [40, 'Zr', 'Zirconium', 5, 4],
    [41, 'Nb', 'Niobium', 5, 5],
    [42, 'Mo', 'Molybdenum', 5, 6],
    [43, 'Tc', 'Technetium', 5, 7],
    [44, 'Ru', 'Ruthenium', 5, 8],
    [45, 'Rh', 'Rhodium', 5, 9],
    [46, 'Pd', 'Palladium', 5, 10],
    [47, 'Ag', 'Silver', 5, 11],
    [48, 'Cd', 'Cadmium', 5, 12],
    [49, 'In', 'Indium', 5, 13],
    [50, 'Sn', 'Tin', 5, 14],
    [51, 'Sb', 'Antimony', 5, 15],
    [52, 'Te', 'Tellurium', 5, 16],
    [53, 'I', 'Iodine', 5, 17],
    [54, 'Xe', 'Xenon', 5, 18],
    [55, 'Cs', 'Cesium', 6, 1],
    [56, 'Ba', 'Barium', 6, 2],
    [57, 'La', 'Lanthanum', 8, 3],
    [58, 'Ce', 'Cerium', 8, 4],
    [59, 'Pr', 'Praseodymium', 8, 5],
    [60, 'Nd', 'Neodymium', 8, 6],
    [61, 'Pm', 'Promethium', 8, 7],
    [62, 'Sm', 'Samarium', 8, 8],
    [63, 'Eu', 'Europium', 8, 9],
    [64, 'Gd', 'Gadolinium', 8, 10],
    [65, 'Tb', 'Terbium', 8, 11],
    [66, 'Dy', 'Dysprosium', 8, 12],
    [67, 'Ho', 'Holmium', 8, 13],
    [68, 'Er', 'Erbium', 8, 14],
    [69, 'Tm', 'Thulium', 8, 15],
    [70, 'Yb', 'Ytterbium', 8, 16],
    [71, 'Lu', 'Lutetium', 8, 17],
    [72, 'Hf', 'Hafnium', 6, 4],
    [73, 'Ta', 'Tantalum', 6, 5],
    [74, 'W', 'Tungsten', 6, 6],
    [75, 'Re', 'Rhenium', 6, 7],
    [76, 'Os', 'Osmium', 6, 8],
    [77, 'Ir', 'Iridium', 6, 9],
    [78, 'Pt', 'Platinum', 6, 10],
    [79, 'Au', 'Gold', 6, 11],
    [80, 'Hg', 'Mercury', 6, 12],
    [81, 'Tl', 'Thallium', 6, 13],
    [82, 'Pb', 'Lead', 6, 14],
    [83, 'Bi', 'Bismuth', 6, 15],
    [84, 'Po', 'Polonium', 6, 16],
    [85, 'At', 'Astatine', 6, 17],
    [86, 'Rn', 'Radon', 6, 18],
    [87, 'Fr', 'Francium', 7, 1],
    [88, 'Ra', 'Radium', 7, 2],
    [89, 'Ac', 'Actinium', 9, 3],
    [90, 'Th', 'Thorium', 9, 4],
    [91, 'Pa', 'Protactinium', 9, 5],
    [92, 'U', 'Uranium', 9, 6],
    [93, 'Np', 'Neptunium', 9, 7],
    [94, 'Pu', 'Plutonium', 9, 8],
    [95, 'Am', 'Americium', 9, 9],
    [96, 'Cm', 'Curium', 9, 10],
    [97, 'Bk', 'Berkelium', 9, 11],
    [98, 'Cf', 'Californium', 9, 12],
    [99, 'Es', 'Einsteinium', 9, 13],
    [100, 'Fm', 'Fermium', 9, 14],
    [101, 'Md', 'Mendelevium', 9, 15],
    [102, 'No', 'Nobelium', 9, 16],
    [103, 'Lr', 'Lawrencium', 9, 17],
    [104, 'Rf', 'Rutherfordium', 7, 4],
    [105, 'Db', 'Dubnium', 7, 5],
    [106, 'Sg', 'Seaborgium', 7, 6],
    [107, 'Bh', 'Bohrium', 7, 7],
    [108, 'Hs', 'Hassium', 7, 8],
    [109, 'Mt', 'Meitnerium', 7, 9],
    [110, 'Ds', 'Darmstadtium', 7, 10],
    [111, 'Rg', 'Roentgenium', 7, 11],
    [112, 'Cn', 'Copernicium', 7, 12],
    [113, 'Nh', 'Nihonium', 7, 13],
    [114, 'Fl', 'Flerovium', 7, 14],
    [115, 'Mc', 'Moscovium', 7, 15],
    [116, 'Lv', 'Livermorium', 7, 16],
    [117, 'Ts', 'Tennessine', 7, 17],
    [118, 'Og', 'Oganesson', 7, 18]
  ];

  const ELEMENT_BY_Z = new Map();
  const ELEMENT_BY_SYMBOL = new Map();
  const ELEMENT_BY_NAME_LOWER = new Map();

  for (let i = 0; i < ELEMENTS.length; i++) {
    const [z, sym, nameEn, row, col] = ELEMENTS[i];
    const meta = { z, sym, nameEn, row, col };
    ELEMENT_BY_Z.set(z, meta);
    ELEMENT_BY_SYMBOL.set(sym.toLowerCase(), meta);
    ELEMENT_BY_NAME_LOWER.set(nameEn.toLowerCase(), meta);
  }
  if (ELEMENT_BY_Z.has(13)) ELEMENT_BY_NAME_LOWER.set('aluminum', ELEMENT_BY_Z.get(13));
  if (ELEMENT_BY_Z.has(16)) ELEMENT_BY_NAME_LOWER.set('sulphur', ELEMENT_BY_Z.get(16));
  if (ELEMENT_BY_Z.has(55)) ELEMENT_BY_NAME_LOWER.set('caesium', ELEMENT_BY_Z.get(55));

  const METALLOID_Z = new Set([5, 14, 32, 33, 51, 52, 85]);
  const NONMETAL_Z = new Set([6, 7, 8, 9, 15, 16, 17, 34, 35, 53]);
  const PRECIOUS_Z = new Set([29, 47, 78, 79]);

  function getPaletteForElement(z) {
    const meta = ELEMENT_BY_Z.get(z);
    if (!meta) return 'hydrogen';
    if (z === 1) return 'hydrogen';
    if (z === 10) return 'neon';
    if (meta.col === 18) return 'noble-gas';
    if (NONMETAL_Z.has(z)) return 'nonmetal';
    if (METALLOID_Z.has(z)) return 'metalloid';
    if (meta.row === 8) return 'lanthanide';
    if (meta.row === 9) return 'actinide';
    if (meta.col === 1) return 'alkali';
    if (meta.col === 2) return 'alkaline-earth';
    if (PRECIOUS_Z.has(z)) return 'precious';
    if (meta.col >= 3 && meta.col <= 12) return 'transition';
    return 'post-transition';
  }

  // ==========================================================================
  // 2. Host & Shadow Style Mounting
  // ==========================================================================
  const rawCss = String(boot.cssText || '');
  const splitParts = rawCss.split('/* === SHADOW_CSS_SPLIT === */');
  const hostCssText = splitParts[0] || '';
  const shadowCssText = splitParts[1] || '';
  const customCssText = MODULES.customCss !== false ? String(boot.customCss || '') : '';

  const headEl = document.head || document.documentElement;
  let hostStyleEl = document.getElementById('ag-pt-host-style');
  if (!hostStyleEl) {
    hostStyleEl = document.createElement('style');
    hostStyleEl.id = 'ag-pt-host-style';
    headEl.appendChild(hostStyleEl);
  }
  hostStyleEl.textContent = hostCssText;

  if (customCssText.trim()) {
    let userHostStyle = document.getElementById('ag-pt-user-host-style');
    if (!userHostStyle) {
      userHostStyle = document.createElement('style');
      userHostStyle.id = 'ag-pt-user-host-style';
      headEl.appendChild(userHostStyle);
    }
    userHostStyle.textContent = customCssText;
  }

  // ==========================================================================
  // 3. Effort, Badge, Action & Model Name Parsing (Exact Tier Normalization)
  // ==========================================================================
  const EFFORT_NORMALIZE = {
    minimal: 'Minimal',
    min: 'Minimal',
    low: 'Low',
    medium: 'Medium',
    med: 'Medium',
    high: 'High',
    xhigh: 'XHigh',
    'extra high': 'XHigh',
    extrahigh: 'XHigh',
    extra: 'XHigh',
    max: 'Max'
  };

  const EFFORT_ORDER = ['Minimal', 'Low', 'Medium', 'High', 'XHigh', 'Max'];
  const EFFORT_SHORT = {
    Minimal: 'Min',
    Low: 'Low',
    Medium: 'Med',
    High: 'High',
    XHigh: 'XHigh',
    Max: 'Max'
  };

  function sortEffortTiers(list) {
    if (!Array.isArray(list)) return [];
    const uniq = [];
    for (const raw of list) {
      const norm = EFFORT_NORMALIZE[String(raw || '').toLowerCase()] || raw;
      if (EFFORT_ORDER.includes(norm) && !uniq.includes(norm)) {
        uniq.push(norm);
      }
    }
    return uniq.sort((a, b) => EFFORT_ORDER.indexOf(a) - EFFORT_ORDER.indexOf(b));
  }

  const UI_BADGE_SET = new Set(['new', 'fast', 'beta', 'preview', 'experimental', 'exp', 'default', 'notice']);

  const RE_USAGE_ACTION = /^(?:View\s+Usage|Models\s*&\s*Usage|Model\s+Usage)$/i;
  const RE_IGNORE_META =
    /^(?:Our most advanced|.*offload routine steps.*|.*Weekly Limit.*|.*Daily Limit.*|.*Monthly Limit.*|.*will be removed.*|.*quota.*|Select Model|Choose Model|Manage Models|Add Model|Edit Model)$/i;

  function normalizeEffortToken(raw) {
    if (!raw) return null;
    const cleaned = String(raw)
      .trim()
      .replace(/^[·•(\[]+|[)\]]+$/g, '')
      .replace(/\s*\((?:default|recommended|current)\)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+(?:thinking|effort|reasoning)$/i, '')
      .toLowerCase();
    return EFFORT_NORMALIZE[cleaned] || null;
  }

  function isUiBadgeToken(raw) {
    if (!raw) return false;
    return UI_BADGE_SET.has(String(raw).trim().toLowerCase());
  }

  function stripGluedBadgesAndEffort(inputStr) {
    let s = String(inputStr || '').replace(/\s+/g, ' ').trim();
    let extractedEffort = null;

    for (let pass = 0; pass < 2; pass++) {
      const mSpacedBadge = s.match(/^(.*?)\s+(New|Fast|Beta|Notice)$/i);
      if (mSpacedBadge && mSpacedBadge[1].trim()) {
        s = mSpacedBadge[1].trim();
        continue;
      }
      const mGluedBadge = s.match(/^(.+[a-z0-9)])(New|Fast|Beta|Notice)$/);
      if (mGluedBadge) {
        s = mGluedBadge[1].trim();
      }
    }

    const mParen = s.match(/^(.*?)\s*\((Extra\s+High|Minimal|Low|Medium|High|XHigh|Max)(?:\s+thinking)?\)\s*$/i);
    if (mParen && mParen[1].trim()) {
      s = mParen[1].trim();
      extractedEffort = normalizeEffortToken(mParen[2]);
      return { cleanBase: s, effort: extractedEffort };
    }

    const mSep = s.match(/^(.*?)\s*[·•]\s*(Extra\s+High|Minimal|Low|Medium|High|XHigh|Max)\s*$/i);
    if (mSep && mSep[1].trim()) {
      s = mSep[1].trim();
      extractedEffort = normalizeEffortToken(mSep[2]);
      return { cleanBase: s, effort: extractedEffort };
    }

    const mSpacedEff = s.match(/^(.*?)\s+(Extra\s+High|Minimal|Low|Medium|High|XHigh|Max)$/i);
    if (mSpacedEff && mSpacedEff[1].trim()) {
      s = mSpacedEff[1].trim();
      extractedEffort = normalizeEffortToken(mSpacedEff[2]);
      return { cleanBase: s, effort: extractedEffort };
    }

    const mGluedEff = s.match(/^(.+[a-z0-9)])(ExtraHigh|Minimal|Low|Medium|High|XHigh|Max)$/);
    if (mGluedEff) {
      s = mGluedEff[1].trim();
      extractedEffort = normalizeEffortToken(mGluedEff[2]);
      return { cleanBase: s, effort: extractedEffort };
    }

    return { cleanBase: s, effort: null };
  }

  function resolveCustomElementMapping(labelStr) {
    const map = CONFIG.customElementMappings;
    if (!map || typeof map !== 'object') return null;
    const targetLower = String(labelStr || '').trim().toLowerCase();
    if (!targetLower) return null;
    for (const [pattern, elemSpec] of Object.entries(map)) {
      if (!pattern || elemSpec === null || elemSpec === undefined) continue;
      const pLower = String(pattern).trim().toLowerCase();
      if (targetLower === pLower || targetLower.includes(pLower)) {
        const specStr = String(elemSpec).trim();
        const asNum = Number(specStr);
        if (Number.isInteger(asNum) && ELEMENT_BY_Z.has(asNum)) return ELEMENT_BY_Z.get(asNum);
        if (ELEMENT_BY_SYMBOL.has(specStr.toLowerCase())) return ELEMENT_BY_SYMBOL.get(specStr.toLowerCase());
        if (ELEMENT_BY_NAME_LOWER.has(specStr.toLowerCase())) return ELEMENT_BY_NAME_LOWER.get(specStr.toLowerCase());
      }
    }
    return null;
  }

  function compactOtherModelLabel(baseLabel) {
    const s = String(baseLabel || '').trim();
    if (/^gemini\s+[\d.]+\s+flash[\s-]*lite$/i.test(s) || /^flash[\s-]*lite$/i.test(s)) {
      return 'Flash-Lite';
    }
    const mGemTier = s.match(/^Gemini\s+(\d+(?:\.\d+)?\s*(?:Pro|Flash|Ultra|Nano)(?:[\s-]*Lite)?)$/i);
    if (mGemTier) return mGemTier[1].trim();
    const mOrch = s.match(/^Orchestrator\s*\(([^)]+)\)$/i);
    if (mOrch) return `Orchestrator (${mOrch[1].trim()})`;
    return s.replace(/^(?:Anthropic|OpenAI|Google|Meta|xAI)\s+/i, '');
  }

  function matchElementFromModelBase(base) {
    const normalized = String(base || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normalized) return null;

    if (/\b(?:Orchestrator|Router)\b/i.test(normalized)) {
      return null;
    }

    const gemMatch = normalized.match(
      /^(?:Google\s+)?Gemini(?:\s+(\d+(?:\.\d+)?|Next))?\s+([A-Za-z]+)(?:\s+(Lite|Mini|Pro|Ultra|Preview|Experimental|Exp))?$/i
    );
    if (gemMatch) {
      const gen = gemMatch[1] ? `Gemini ${gemMatch[1]}` : 'Gemini';
      const token = gemMatch[2];
      const byName = ELEMENT_BY_NAME_LOWER.get(token.toLowerCase());
      if (byName) {
        return { element: byName, seriesTitle: gen };
      }
      if (gemMatch[1] && token.length <= 2 && /^[A-Z][a-z]?$/.test(token) && ELEMENT_BY_SYMBOL.has(token.toLowerCase())) {
        return { element: ELEMENT_BY_SYMBOL.get(token.toLowerCase()), seriesTitle: gen };
      }
    }

    const bareMatch = normalized.match(/^([A-Za-z]+)$/);
    if (bareMatch && ELEMENT_BY_NAME_LOWER.has(bareMatch[1].toLowerCase())) {
      return {
        element: ELEMENT_BY_NAME_LOWER.get(bareMatch[1].toLowerCase()),
        seriesTitle: null
      };
    }

    return null;
  }

  function parseModelLabel(rawInput, explicitEffort = null) {
    const rawTrimmed = String(rawInput || '').replace(/\s+/g, ' ').trim();
    if (!rawTrimmed || RE_USAGE_ACTION.test(rawTrimmed) || RE_IGNORE_META.test(rawTrimmed)) {
      return null;
    }

    const { cleanBase, effort: parsedEffort } = stripGluedBadgesAndEffort(rawTrimmed);
    const effort = explicitEffort || parsedEffort || null;
    const base = cleanBase;
    if (!base) return null;

    const customElem = resolveCustomElementMapping(rawTrimmed) || resolveCustomElementMapping(base);
    if (customElem) {
      return {
        raw: effort ? `${base} (${effort})` : base,
        base,
        effort,
        seriesTitle: null,
        isElement: true,
        element: customElem,
        shortLabel: customElem.nameEn
      };
    }

    const elemHit = matchElementFromModelBase(base);
    if (elemHit) {
      const canonicalBase = elemHit.seriesTitle ? `${elemHit.seriesTitle} ${elemHit.element.nameEn}` : base;
      return {
        raw: effort ? `${canonicalBase} (${effort})` : canonicalBase,
        base: canonicalBase,
        effort,
        seriesTitle: elemHit.seriesTitle,
        isElement: true,
        element: elemHit.element,
        shortLabel: elemHit.element.nameEn
      };
    }

    return {
      raw: effort ? `${base} (${effort})` : base,
      base,
      effort,
      seriesTitle: null,
      isElement: false,
      element: null,
      shortLabel: compactOtherModelLabel(base)
    };
  }

  function parseActiveTriggerState(rawInput) {
    const rawTrimmed = String(rawInput || '').replace(/\s+/g, ' ').trim();
    if (!rawTrimmed) return null;

    const orchFam = catalogState.otherFamilies.get('orchestrator');
    const hasCompositeOrch = Boolean(orchFam && Array.isArray(orchFam.subModels) && orchFam.subModels.length > 0);
    const mOrch = rawTrimmed.match(/^Orchestrator(?:\s*[·•:\-]\s*|\s+(.+))?$/i);
    if (mOrch) {
      const remainder = (mOrch[1] || '').trim();
      const isFlatParenVariant = /^\([^)]+\)$/.test(remainder);
      if (hasCompositeOrch || !remainder || !isFlatParenVariant) {
        let subCandidate = remainder.replace(/^\((.+)\)$/, '$1').trim();
        let subBase = null;
        let subEffort = null;
        if (subCandidate) {
          const stripped = stripGluedBadgesAndEffort(subCandidate);
          subBase = stripped.cleanBase || null;
          subEffort = stripped.effort || null;
        }
        return {
          raw: 'Orchestrator',
          base: 'Orchestrator',
          effort: subEffort,
          seriesTitle: null,
          isElement: false,
          element: null,
          shortLabel: 'Orchestrator',
          isComposite: true,
          familyKey: 'orchestrator',
          activeSubModelBase: subBase,
          activeSubModelEffort: subEffort
        };
      }
    }

    return parseModelLabel(rawTrimmed);
  }

  function extractMenuRowInfo(itemEl) {
    if (!itemEl) return null;

    const hasSubmenu = itemEl.getAttribute('aria-haspopup') === 'menu';
    const orchSubEl = itemEl.querySelector ? itemEl.querySelector('[data-testid*="orchestrator-model"]') : null;
    const explicitVal = itemEl.getAttribute('data-model-value') || itemEl.getAttribute('data-model-label') || '';
    const tokens = [];
    let titleEl = null;
    let effortCtrlEl = null;
    let effortBadgeEl = null;
    let detectedEffort = null;

    const walker = document.createTreeWalker(itemEl, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const tNode = walker.currentNode;
      const txt = String(tNode.nodeValue || '').replace(/\s+/g, ' ').trim();
      if (!txt) continue;

      const parent = tNode.parentElement;
      if (!parent) continue;
      if (parent.closest('svg, style, script, [aria-hidden="true"]')) continue;

      if (tokens.length > 0 && parent.closest('.mock-sub, [class*="text-muted"], [class*="description"]')) {
        const maybeEff = normalizeEffortToken(txt);
        if (!maybeEff) continue;
      }
      if (RE_IGNORE_META.test(txt) || txt.length > 64) continue;

      if (RE_USAGE_ACTION.test(txt)) {
        return { isUsageAction: true, label: txt, itemEl };
      }

      if (isUiBadgeToken(txt)) {
        continue;
      }

      const eff = normalizeEffortToken(txt);
      if (eff && tokens.length > 0) {
        detectedEffort = eff;
        effortBadgeEl = parent;
        // Only treat an ancestor strictly inside itemEl as a dedicated inner button control
        const innerBtn = parent.closest('button, [role="button"], [role="combobox"], [data-slot*="trigger"]');
        if (innerBtn && itemEl.contains(innerBtn) && innerBtn !== itemEl) {
          effortCtrlEl = innerBtn;
        }
        continue;
      }

      tokens.push(txt);
      if (!titleEl) titleEl = parent;
    }

    const rawCandidate = explicitVal.trim() || tokens[0] || '';
    if (!rawCandidate) return null;
    if (RE_USAGE_ACTION.test(rawCandidate)) {
      return { isUsageAction: true, label: rawCandidate, itemEl };
    }

    // Detect composite nested-model row such as "Orchestrator" -> ["Gemini 4 Neon", "Gemini 4 Carbon", ...]
    if (orchSubEl || (/^orchestrator$/i.test(rawCandidate) && (hasSubmenu || tokens.length >= 2))) {
      const subRaw = orchSubEl
        ? String(orchSubEl.textContent || '').replace(/\s+/g, ' ').trim()
        : tokens.slice(1).join(' ').trim();
      const subParsed = subRaw ? stripGluedBadgesAndEffort(subRaw) : { cleanBase: '', effort: null };
      const parsedComposite = {
        raw: 'Orchestrator',
        base: 'Orchestrator',
        effort: null,
        seriesTitle: null,
        isElement: false,
        element: null,
        shortLabel: 'Orchestrator',
        isComposite: true,
        activeSubModelBase: subParsed.cleanBase || null,
        activeSubModelEffort: subParsed.effort || null
      };
      return {
        isUsageAction: false,
        isComposite: true,
        hasSubmenu,
        parsed: parsedComposite,
        currentEffort: null,
        hasEffortIndicator: false,
        effortCtrlEl: null,
        effortBadgeEl: null,
        titleEl: titleEl || itemEl,
        itemEl
      };
    }

    const parsed = parseModelLabel(rawCandidate, detectedEffort);
    if (!parsed) return null;

    return {
      isUsageAction: false,
      isComposite: false,
      hasSubmenu,
      parsed,
      currentEffort: parsed.effort,
      hasEffortIndicator: Boolean(effortCtrlEl || effortBadgeEl || parsed.effort),
      effortCtrlEl,
      effortBadgeEl,
      titleEl: titleEl || itemEl,
      itemEl
    };
  }

  // ==========================================================================
  // 4. Host Theme Detection & Native Trigger Discovery
  // ==========================================================================
  function parseRgbLuminance(cssColor) {
    const m = String(cssColor || '').match(
      /rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?/i
    );
    if (!m) return null;
    const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
    if (alpha < 0.15) return null;
    const r = parseFloat(m[1]) / 255;
    const g = parseFloat(m[2]) / 255;
    const b = parseFloat(m[3]) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function detectHostDarkMode() {
    const html = document.documentElement;
    const body = document.body;
    if (!html || !body) return true;

    const agMode = html.getAttribute('data-ag-theme-mode');
    if (agMode === 'dark') return true;
    if (agMode === 'light') return false;

    const dataTheme = (html.getAttribute('data-theme') || body.getAttribute('data-theme') || '').toLowerCase();
    if (dataTheme === 'dark') return true;
    if (dataTheme === 'light') return false;

    if (
      body.classList.contains('dark') ||
      body.classList.contains('theme-dark') ||
      body.classList.contains('dark-theme') ||
      html.classList.contains('dark')
    ) {
      return true;
    }
    if (
      body.classList.contains('light') ||
      body.classList.contains('theme-light') ||
      body.classList.contains('light-theme') ||
      html.classList.contains('light')
    ) {
      return false;
    }

    const cs = (html.style.colorScheme || body.style.colorScheme || '').toLowerCase();
    if (cs === 'dark') return true;
    if (cs === 'light') return false;

    if (window.getComputedStyle) {
      const bodyLum = parseRgbLuminance(window.getComputedStyle(body).backgroundColor);
      if (bodyLum !== null) return bodyLum < 0.5;
      const htmlLum = parseRgbLuminance(window.getComputedStyle(html).backgroundColor);
      if (htmlLum !== null) return htmlLum < 0.5;
    }

    return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function resolveCardTheme() {
    const mode = String(CONFIG.periodicTheme || 'auto').toLowerCase();
    if (mode === 'light') return 'light';
    if (mode === 'dark') return 'dark';
    return detectHostDarkMode() ? 'dark' : 'light';
  }

  const knownTriggers = new WeakSet();
  const RE_ARIA_MODEL = /^(?:Select model|Model(?:\s+selector)?|Choose model)(?:,\s*current)?\s*:?\s*(.*)$/i;
  const RE_NON_MODEL_TESTID =
    /branch|project|location|permission|send|cancel|voice|attach|upload|history|settings|new-conversation|worktree|ssh/i;

  function readRawTriggerModelName(btn) {
    if (!btn || btn.nodeType !== 1) return '';
    const ariaCandidates = [
      btn.getAttribute('data-model-name') || '',
      btn.getAttribute('data-model-label') || '',
      btn.getAttribute('aria-label') || ''
    ];
    for (let i = 0; i < btn.attributes.length; i++) {
      const attr = btn.attributes[i];
      if (attr.name.endsWith('orig-aria-label') && attr.value) {
        ariaCandidates.unshift(attr.value);
      }
    }
    for (const candidate of ariaCandidates) {
      const trimmed = candidate.trim();
      if (!trimmed) continue;
      const m = trimmed.match(RE_ARIA_MODEL);
      if (m && m[1] && !/^(select model|choose model)$/i.test(m[1].trim())) {
        return m[1].trim();
      }
    }

    const parts = [];
    const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const p = walker.currentNode.parentElement;
      if (p && p.closest('svg, style, script, [aria-hidden="true"]')) continue;
      const t = String(walker.currentNode.nodeValue || '').trim();
      if (t) parts.push(t);
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function isModelSelectorTrigger(el) {
    if (!el || el.nodeType !== 1 || el.tagName !== 'BUTTON') return false;
    if (el.closest && el.closest('#ag-periodic-model-popover')) return false;
    if (knownTriggers.has(el)) return true;

    const testId = el.getAttribute('data-testid') || '';
    if (testId && RE_NON_MODEL_TESTID.test(testId)) return false;
    if (testId === 'model-selector-trigger' || testId.includes('model-selector')) {
      knownTriggers.add(el);
      return true;
    }
    if (el.hasAttribute('data-model-label') || el.hasAttribute('data-model-name')) {
      knownTriggers.add(el);
      return true;
    }

    for (let i = 0; i < el.attributes.length; i++) {
      const a = el.attributes[i];
      if ((a.name === 'aria-label' || a.name.endsWith('orig-aria-label')) && RE_ARIA_MODEL.test(a.value.trim())) {
        knownTriggers.add(el);
        return true;
      }
    }

    const inComposer = el.closest(
      '#antigravity\\.agentSidePanelInputBox, [id="antigravity.agentSidePanelInputBox"], .surface-composer, [data-composer], .agy-composer-footer'
    );
    if (inComposer) {
      const txt = readRawTriggerModelName(el);
      if (txt && txt.length < 48 && /\b(?:Gemini|Claude|GPT|Orchestrator|Hydrogen|Carbon|Neon|Argon)\b/i.test(txt)) {
        knownTriggers.add(el);
        return true;
      }
    }
    return false;
  }

  function findAllModelTriggers() {
    const found = [];
    const seen = new Set();
    const candidates = document.querySelectorAll(
      'button[data-testid="model-selector-trigger"], button[data-testid*="model-selector"], button[data-model-label], button[data-model-name], button[aria-label], [id="antigravity.agentSidePanelInputBox"] button, .surface-composer button, .agy-composer-footer button'
    );
    for (let i = 0; i < candidates.length; i++) {
      const btn = candidates[i];
      if (!seen.has(btn) && isModelSelectorTrigger(btn)) {
        seen.add(btn);
        found.push(btn);
      }
    }
    return found;
  }

  // ==========================================================================
  // 5. Backend Capability Bridge, Exact Effort Tiers & Model Catalog
  // ==========================================================================
  const CACHE_STORAGE_KEY = 'ag_periodic_model_catalog_v4';

  const backendState = {
    data: boot.backendData && typeof boot.backendData === 'object' ? boot.backendData : null,
    refreshing: false
  };

  const catalogState = {
    lastHarvestAt: 0,
    heroSeriesTitle: 'Gemini 4',
    viewUsageLabel: 'View Usage',
    preferredEffortByZ: new Map(), // Z -> effort string
    preferredEffortByOtherKey: new Map(), // familyKey -> effort string
    preferredSubEffortByKey: new Map(), // `${familyKey}::${subKey}` -> effort string
    probedEffortsByBase: new Map(), // lower(base) -> string[] (exact probed tiers)
    elementEntries: new Map(), // Z -> { element, seriesTitle, base, hasEffortControl, currentEffort, supportedEfforts, variants }
    otherFamilies: new Map() // familyKey -> { key, shortLabel, base, hasEffortControl, currentEffort, supportedEfforts, variants, subModels, activeSubModelKey }
  };

  function matchSubModelInFamily(fam, hintOrBase) {
    if (!fam || !Array.isArray(fam.subModels) || fam.subModels.length === 0) return null;
    if (!hintOrBase) return null;
    const raw = String(hintOrBase).replace(/\s+/g, ' ').trim().toLowerCase();
    if (!raw) return null;
    const exact = fam.subModels.find(
      (s) => s.key === raw || s.base.toLowerCase() === raw || s.shortLabel.toLowerCase() === raw
    );
    if (exact) return exact;
    return (
      fam.subModels.find(
        (s) =>
          s.base.toLowerCase().includes(raw) ||
          raw.includes(s.base.toLowerCase()) ||
          s.shortLabel.toLowerCase().includes(raw)
      ) || null
    );
  }

  function hasAuthoritativeBackendCaps() {
    const caps = backendState.data && backendState.data.modelCapabilities;
    return Boolean(caps && typeof caps === 'object' && Object.keys(caps).length > 0);
  }

  function lookupBackendModelCap(baseLabel) {
    if (!baseLabel || !backendState.data || !backendState.data.modelCapabilities) return null;
    const key = String(baseLabel).trim().toLowerCase();
    return backendState.data.modelCapabilities[key] || null;
  }

  function resolveVerifiedEffortsForBase(baseLabel, variantEfforts = []) {
    const cap = lookupBackendModelCap(baseLabel);
    if (cap && Array.isArray(cap.supportedEfforts)) {
      const sorted = sortEffortTiers(cap.supportedEfforts);
      return sorted.length >= 2 ? sorted : [];
    }
    const key = String(baseLabel || '').trim().toLowerCase();
    if (key && catalogState.probedEffortsByBase.has(key)) {
      const probed = sortEffortTiers(catalogState.probedEffortsByBase.get(key));
      return probed.length >= 2 ? probed : [];
    }
    if (Array.isArray(variantEfforts) && variantEfforts.length >= 2) {
      const sortedVar = sortEffortTiers(variantEfforts);
      return sortedVar.length >= 2 ? sortedVar : [];
    }
    return [];
  }

  function syncCatalogCapabilitiesFromKnownSources() {
    for (const [, rec] of catalogState.elementEntries.entries()) {
      const varEffs = Array.isArray(rec.variants) ? rec.variants.map((v) => v.effort).filter(Boolean) : [];
      const tiers = resolveVerifiedEffortsForBase(rec.base, varEffs);
      rec.supportedEfforts = tiers;
      rec.hasEffortControl = tiers.length >= 2;
    }
    for (const [, fam] of catalogState.otherFamilies.entries()) {
      const varEffs = Array.isArray(fam.variants) ? fam.variants.map((v) => v.effort).filter(Boolean) : [];
      const tiers = resolveVerifiedEffortsForBase(fam.base, varEffs);
      fam.supportedEfforts = tiers;
      fam.hasEffortControl = tiers.length >= 2;
      if (Array.isArray(fam.subModels)) {
        for (const sub of fam.subModels) {
          const subTiers = resolveVerifiedEffortsForBase(sub.base, sub.supportedEfforts || []);
          sub.supportedEfforts = subTiers;
          sub.hasEffortControl = subTiers.length >= 2;
        }
      }
    }
  }

  function saveCatalogSnapshot() {
    try {
      const probedObj = {};
      for (const [k, v] of catalogState.probedEffortsByBase.entries()) {
        probedObj[k] = v;
      }
      const snapshot = {
        ts: Date.now(),
        heroSeriesTitle: catalogState.heroSeriesTitle,
        viewUsageLabel: catalogState.viewUsageLabel,
        probedEffortsByBase: probedObj,
        elements: Array.from(catalogState.elementEntries.entries()).map(([z, rec]) => ({
          z,
          seriesTitle: rec.seriesTitle,
          base: rec.base,
          currentEffort: rec.currentEffort,
          supportedEfforts: Array.isArray(rec.supportedEfforts) ? rec.supportedEfforts : []
        })),
        others: Array.from(catalogState.otherFamilies.values()).map((fam) => ({
          key: fam.key,
          shortLabel: fam.shortLabel,
          base: fam.base,
          currentEffort: fam.currentEffort,
          supportedEfforts: Array.isArray(fam.supportedEfforts) ? fam.supportedEfforts : [],
          activeSubModelKey: fam.activeSubModelKey || null,
          subModels: Array.isArray(fam.subModels)
            ? fam.subModels.map((sub) => ({
                key: sub.key,
                base: sub.base,
                shortLabel: sub.shortLabel,
                currentEffort: sub.currentEffort || null,
                hasSubmenu: Boolean(sub.hasSubmenu),
                supportedEfforts: Array.isArray(sub.supportedEfforts) ? sub.supportedEfforts : []
              }))
            : []
        }))
      };
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (e) {}
  }

  function restoreCatalogSnapshot() {
    try {
      const raw = localStorage.getItem(CACHE_STORAGE_KEY);
      if (!raw) return false;
      const snap = JSON.parse(raw);
      if (!snap || typeof snap !== 'object') return false;
      if (snap.heroSeriesTitle) catalogState.heroSeriesTitle = String(snap.heroSeriesTitle);
      if (snap.viewUsageLabel) catalogState.viewUsageLabel = String(snap.viewUsageLabel);

      if (snap.probedEffortsByBase && typeof snap.probedEffortsByBase === 'object') {
        for (const [k, arr] of Object.entries(snap.probedEffortsByBase)) {
          if (Array.isArray(arr)) {
            catalogState.probedEffortsByBase.set(k, sortEffortTiers(arr));
          }
        }
      }

      if (Array.isArray(snap.elements)) {
        for (const item of snap.elements) {
          const elem = ELEMENT_BY_Z.get(Number(item.z));
          if (elem) {
            const base = item.base || `Gemini 4 ${elem.nameEn}`;
            const cachedTiers = sortEffortTiers(item.supportedEfforts);
            const verified = resolveVerifiedEffortsForBase(base, cachedTiers);
            catalogState.elementEntries.set(elem.z, {
              element: elem,
              seriesTitle: item.seriesTitle || 'Gemini 4',
              base,
              hasEffortControl: verified.length >= 2,
              currentEffort: normalizeEffortToken(item.currentEffort) || item.currentEffort || null,
              supportedEfforts: verified,
              variants: []
            });
          }
        }
      }
      if (Array.isArray(snap.others)) {
        for (const fam of snap.others) {
          if (fam && fam.key) {
            const cachedTiers = sortEffortTiers(fam.supportedEfforts);
            const verified = resolveVerifiedEffortsForBase(fam.base, cachedTiers);
            const restoredSubs = Array.isArray(fam.subModels)
              ? fam.subModels
                  .filter((s) => s && s.base)
                  .map((s) => {
                    const sTiers = resolveVerifiedEffortsForBase(s.base, sortEffortTiers(s.supportedEfforts));
                    return {
                      key: s.key || s.base.toLowerCase(),
                      base: s.base,
                      shortLabel: s.shortLabel || s.base,
                      currentEffort: normalizeEffortToken(s.currentEffort) || s.currentEffort || null,
                      hasSubmenu: Boolean(s.hasSubmenu),
                      supportedEfforts: sTiers,
                      hasEffortControl: sTiers.length >= 2
                    };
                  })
              : [];
            catalogState.otherFamilies.set(fam.key, {
              key: fam.key,
              shortLabel: fam.shortLabel,
              base: fam.base,
              hasEffortControl: verified.length >= 2,
              currentEffort: normalizeEffortToken(fam.currentEffort) || fam.currentEffort || null,
              supportedEfforts: verified,
              variants: [],
              subModels: restoredSubs,
              activeSubModelKey: fam.activeSubModelKey || (restoredSubs[0] ? restoredSubs[0].key : null)
            });
          }
        }
      }
      return catalogState.elementEntries.size > 0;
    } catch (e) {
      return false;
    }
  }

  function registerModelEntry(parsed, isCurrentActive = false) {
    if (!parsed) return;

    if (parsed.isElement) {
      const z = parsed.element.z;
      if (parsed.seriesTitle && /^Gemini\s+\d/i.test(parsed.seriesTitle)) {
        catalogState.heroSeriesTitle = parsed.seriesTitle;
      }
      let rec = catalogState.elementEntries.get(z);
      if (!rec) {
        rec = {
          element: parsed.element,
          seriesTitle: parsed.seriesTitle || catalogState.heroSeriesTitle || 'Gemini 4',
          base: parsed.base,
          hasEffortControl: false,
          currentEffort: parsed.effort || null,
          supportedEfforts: [],
          variants: []
        };
        catalogState.elementEntries.set(z, rec);
      } else if (parsed.effort) {
        rec.currentEffort = parsed.effort;
      }

      if (parsed.effort && !rec.variants.some((v) => v.effort === parsed.effort)) {
        rec.variants.push({ raw: parsed.raw, effort: parsed.effort, base: parsed.base });
      }
      const tiers = resolveVerifiedEffortsForBase(
        rec.base,
        rec.variants.map((v) => v.effort)
      );
      rec.supportedEfforts = tiers;
      rec.hasEffortControl = tiers.length >= 2;

      if (isCurrentActive && parsed.effort) {
        rec.currentEffort = parsed.effort;
        catalogState.preferredEffortByZ.set(z, parsed.effort);
      }
    } else {
      const famKey = (parsed.familyKey || parsed.shortLabel).toLowerCase();
      let fam = catalogState.otherFamilies.get(famKey);
      if (!fam) {
        fam = {
          key: famKey,
          shortLabel: parsed.shortLabel,
          base: parsed.base,
          hasEffortControl: false,
          currentEffort: parsed.effort || null,
          supportedEfforts: [],
          variants: [],
          subModels: [],
          activeSubModelKey: null
        };
        catalogState.otherFamilies.set(famKey, fam);
      } else if (!parsed.isComposite && parsed.effort) {
        fam.currentEffort = parsed.effort;
      }

      if (parsed.isComposite) {
        const subHint = parsed.activeSubModelBase || null;
        const subEffort = parsed.activeSubModelEffort || parsed.effort || null;
        if (subHint) {
          let hit = matchSubModelInFamily(fam, subHint);
          if (!hit && fam.subModels.length === 0) {
            const sTiers = resolveVerifiedEffortsForBase(subHint, []);
            hit = {
              key: subHint.toLowerCase(),
              base: subHint,
              shortLabel: subHint,
              currentEffort: subEffort,
              hasSubmenu: sTiers.length >= 2,
              supportedEfforts: sTiers,
              hasEffortControl: sTiers.length >= 2
            };
            fam.subModels.push(hit);
          }
          if (hit) {
            fam.activeSubModelKey = hit.key;
            if (subEffort) {
              hit.currentEffort = subEffort;
              if (isCurrentActive) {
                catalogState.preferredSubEffortByKey.set(`${famKey}::${hit.key}`, subEffort);
              }
            }
          }
        }
        return;
      }

      if (parsed.effort && !fam.variants.some((v) => v.effort === parsed.effort)) {
        fam.variants.push({ raw: parsed.raw, effort: parsed.effort, base: parsed.base });
      }
      const tiers = resolveVerifiedEffortsForBase(
        fam.base,
        fam.variants.map((v) => v.effort)
      );
      fam.supportedEfforts = tiers;
      fam.hasEffortControl = tiers.length >= 2;

      if (isCurrentActive && parsed.effort) {
        fam.currentEffort = parsed.effort;
        catalogState.preferredEffortByOtherKey.set(famKey, parsed.effort);
      }
    }
  }

  function seedInitialCatalog(activeRaw) {
    const restored = restoreCatalogSnapshot();
    if (!restored && catalogState.elementEntries.size === 0) {
      const seeds = Array.isArray(CONFIG.defaultSeedElements)
        ? CONFIG.defaultSeedElements
        : ['Hydrogen', 'Carbon', 'Neon', 'Argon'];
      for (const name of seeds) {
        const meta =
          ELEMENT_BY_NAME_LOWER.get(String(name).toLowerCase()) ||
          ELEMENT_BY_SYMBOL.get(String(name).toLowerCase());
        if (meta) {
          const p = parseModelLabel(`Gemini 4 ${meta.nameEn}`);
          registerModelEntry(p, false);
        }
      }
    }

    const extraList = [
      ...(catalogState.otherFamilies.size === 0 && Array.isArray(CONFIG.defaultSeedOtherModels)
        ? CONFIG.defaultSeedOtherModels
        : []),
      ...(Array.isArray(CONFIG.extraOtherModels) ? CONFIG.extraOtherModels : [])
    ];
    for (const item of extraList) {
      const p = parseModelLabel(item);
      if (p) registerModelEntry(p, false);
    }

    if (activeRaw) {
      const activeParsed = parseActiveTriggerState(activeRaw);
      if (activeParsed) {
        registerModelEntry(activeParsed, true);
      }
    }

    syncCatalogCapabilitiesFromKnownSources();
  }

  function requestBackendRefresh(forceRefresh = false) {
    backendState.refreshing = true;
    if (typeof window.__agPtRequestBackend === 'function') {
      try {
        window.__agPtRequestBackend(JSON.stringify({ forceRefresh: Boolean(forceRefresh) }));
        return true;
      } catch (e) {}
    }
    if (typeof window.__agPtPreviewFetchBackend === 'function') {
      try {
        window.__agPtPreviewFetchBackend(Boolean(forceRefresh));
        return true;
      } catch (e) {}
    }
    backendState.refreshing = false;
    return false;
  }

  window.__ag_pt_receive_backend = (payload) => {
    backendState.refreshing = false;
    if (!payload || typeof payload !== 'object') return;
    backendState.data = payload;
    syncCatalogCapabilitiesFromKnownSources();
    saveCatalogSnapshot();
    refreshPanelState();
    if (cardEl && cardEl.getAttribute('data-view') === 'usage') {
      renderNativeUsageView();
    }
  };

  // ==========================================================================
  // 6. Submenu Discovery & Effort Selection
  // ==========================================================================
  let isDispatchingInternal = false;

  function isElementVisible(el) {
    if (!el || !el.isConnected || el.hidden) return false;
    if (
      el.getAttribute('data-state') === 'closed' ||
      el.getAttribute('aria-hidden') === 'true' ||
      el.hasAttribute('data-closed') ||
      el.hasAttribute('data-ending-style')
    ) {
      return false;
    }
    const cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
    return true;
  }

  function syntheticHoverHighlight(el) {
    if (!el || !el.isConnected) return;
    isDispatchingInternal = true;
    try {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + Math.max(4, rect.width * 0.45);
      const cy = rect.top + Math.max(4, rect.height * 0.5);
      const moveInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX: cx,
        clientY: cy
      };
      if (typeof PointerEvent === 'function') {
        el.dispatchEvent(
          new PointerEvent('pointerover', {
            ...moveInit,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true
          })
        );
        el.dispatchEvent(
          new PointerEvent('pointerenter', {
            bubbles: false,
            composed: true,
            view: window,
            clientX: cx,
            clientY: cy,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true
          })
        );
        el.dispatchEvent(
          new PointerEvent('pointermove', {
            ...moveInit,
            clientX: cx + 2,
            movementX: 2,
            movementY: 0,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true
          })
        );
      }
      el.dispatchEvent(new MouseEvent('mouseover', moveInit));
      el.dispatchEvent(
        new MouseEvent('mouseenter', {
          bubbles: false,
          composed: true,
          view: window,
          clientX: cx,
          clientY: cy
        })
      );
      el.dispatchEvent(
        new MouseEvent('mousemove', {
          ...moveInit,
          clientX: cx + 2,
          movementX: 2,
          movementY: 0
        })
      );
      if (typeof el.focus === 'function') {
        try {
          el.focus({ preventScroll: true });
        } catch (e) {}
      }
    } finally {
      isDispatchingInternal = false;
    }
  }

  function syntheticActivate(el) {
    if (!el || !el.isConnected) return;
    isDispatchingInternal = true;
    try {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + Math.max(2, rect.width / 2);
      const cy = rect.top + Math.max(2, rect.height / 2);
      const baseInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX: cx,
        clientY: cy,
        button: 0
      };
      if (typeof PointerEvent === 'function') {
        el.dispatchEvent(
          new PointerEvent('pointerdown', {
            ...baseInit,
            buttons: 1,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true
          })
        );
      }
      el.dispatchEvent(new MouseEvent('mousedown', { ...baseInit, buttons: 1 }));
      if (typeof PointerEvent === 'function') {
        el.dispatchEvent(
          new PointerEvent('pointerup', {
            ...baseInit,
            buttons: 0,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true
          })
        );
      }
      el.dispatchEvent(new MouseEvent('mouseup', { ...baseInit, buttons: 0 }));
      el.dispatchEvent(new MouseEvent('click', { ...baseInit, buttons: 0 }));
    } finally {
      isDispatchingInternal = false;
    }
  }

  function dispatchMenuKey(targetEl, key, keyCode) {
    if (!targetEl || !targetEl.isConnected) return;
    isDispatchingInternal = true;
    try {
      const init = {
        key,
        code: key,
        keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true,
        composed: true
      };
      targetEl.dispatchEvent(new KeyboardEvent('keydown', init));
      targetEl.dispatchEvent(new KeyboardEvent('keyup', init));
    } finally {
      isDispatchingInternal = false;
    }
  }

  function getPopupMenuItems(popupEl) {
    if (!popupEl) return [];
    return Array.from(
      popupEl.querySelectorAll(
        '[role="menuitem"], [role="menuitemradio"], [role="option"], .agy-overlay-item, [data-model-value]'
      )
    );
  }

  function isPopupActuallyOpen(p) {
    if (!p || !p.isConnected) return false;
    if (p.id === 'ag-periodic-model-popover' || (p.closest && p.closest('#ag-periodic-model-popover'))) return false;
    if (p.closest && p.closest('[id="antigravity.agentSidePanelInputBox"], .surface-composer')) return false;
    if (!isElementVisible(p)) return false;
    return getPopupMenuItems(p).length > 0;
  }

  function findAllOpenNativePopups() {
    const list = [];
    const popups = document.querySelectorAll(
      '[data-menu-popup], [data-select-popup], [data-radix-menu-content], [data-slot*="menu-content"], [data-slot*="select-content"], .agy-overlay, [role="menu"], [role="listbox"]'
    );
    for (let i = 0; i < popups.length; i++) {
      if (isPopupActuallyOpen(popups[i])) list.push(popups[i]);
    }
    return list;
  }

  function findOpenNativePopup(triggerBtn) {
    if (triggerBtn) {
      const ctrlId = triggerBtn.getAttribute('aria-controls');
      if (ctrlId) {
        const byId = document.getElementById(ctrlId);
        if (isPopupActuallyOpen(byId)) return byId;
      }
    }
    const all = findAllOpenNativePopups();
    return all.length > 0 ? all[0] : null;
  }

  function waitNextFrames(count = 1) {
    return new Promise((resolve) => {
      let left = Math.max(1, count);
      const step = () => {
        left -= 1;
        if (left <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  function extractEffortFromSubmenuOption(el) {
    if (!el) return null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const p = walker.currentNode.parentElement;
      if (p && p.closest('svg, style, script, [aria-hidden="true"]')) continue;
      const t = String(walker.currentNode.nodeValue || '').replace(/\s+/g, ' ').trim();
      if (!t) continue;
      const direct = normalizeEffortToken(t);
      if (direct) return direct;
      break;
    }
    const firstLine = String(el.innerText || el.textContent || '')
      .split(/\r?\n/)[0]
      .trim();
    return normalizeEffortToken(firstLine);
  }

  // Locate an open secondary effort submenu/popover (requiring >= 2 valid effort options in the same container)
  function findEffortOptionsInSecondaryPopup(mainPopup, mainTopItems, targetEffort = null, excludePopups = null) {
    const candidates = document.querySelectorAll(
      '[role="menuitem"], [role="menuitemradio"], [role="option"], .agy-overlay-item, [data-menu-popup] button, [data-select-popup] button, [data-popover-popup] button, [data-radix-popper-content-wrapper] button, [data-floating-ui-portal] button, body > div:not(#ag-periodic-model-popover) button'
    );

    const isExcludedPopup = (p) => Boolean(p && (p === mainPopup || (excludePopups && excludePopups.has(p))));
    const byContainer = new Map(); // containerEl -> Array<{ el, effort }>

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (!isElementVisible(el)) continue;
      if (el.closest('#ag-periodic-model-popover')) continue;
      if (el.closest('[id="antigravity.agentSidePanelInputBox"], .surface-composer')) continue;
      if (mainTopItems && mainTopItems.has(el)) continue;

      const ownerPopup = el.closest(
        '[data-menu-popup], [data-select-popup], [data-popover-popup], [data-radix-menu-content], [role="menu"], [role="listbox"], .agy-overlay, [data-floating-ui-portal]'
      );
      if (isExcludedPopup(ownerPopup)) continue;
      if (ownerPopup && !isElementVisible(ownerPopup)) continue;

      // Skip inline elements inside an excluded parent popup unless nested inside a separate submenu container
      if (!ownerPopup && mainPopup && mainPopup.contains(el)) continue;
      if (!ownerPopup && excludePopups) {
        let insideExcluded = false;
        for (const ep of excludePopups) {
          if (ep && ep.contains && ep.contains(el)) {
            insideExcluded = true;
            break;
          }
        }
        if (insideExcluded) continue;
      }

      const containerKey = ownerPopup || el.parentElement;
      if (!containerKey || isExcludedPopup(containerKey)) continue;

      const norm = extractEffortFromSubmenuOption(el);
      if (!norm) continue;

      let group = byContainer.get(containerKey);
      if (!group) {
        group = [];
        byContainer.set(containerKey, group);
      }
      if (!group.some((item) => item.effort === norm)) {
        group.push({ el, effort: norm });
      }
    }

    let bestContainer = null;
    let bestGroup = [];
    for (const [containerEl, group] of byContainer.entries()) {
      if (group.length >= 2 && group.length >= bestGroup.length) {
        bestContainer = containerEl;
        bestGroup = group;
      }
    }

    if (bestGroup.length < 2) {
      return { containerEl: null, matchedEl: null, discoveredEfforts: [], entries: [] };
    }

    const discoveredEfforts = sortEffortTiers(bestGroup.map((g) => g.effort));
    const hit = targetEffort ? bestGroup.find((g) => g.effort === targetEffort) : null;
    return {
      containerEl: bestContainer,
      matchedEl: hit ? hit.el : null,
      discoveredEfforts,
      entries: bestGroup
    };
  }

  // Locate an open secondary model-list submenu (e.g. Level-2 models inside "Orchestrator")
  function findSubmenuItemsInSecondaryPopup(excludePopups, excludeItems) {
    const popups = document.querySelectorAll(
      '[data-menu-popup], [data-select-popup], [data-popover-popup], [data-radix-menu-content], [role="menu"], [role="listbox"], .agy-overlay'
    );

    let bestContainer = null;
    let bestRows = [];

    for (let i = 0; i < popups.length; i++) {
      const p = popups[i];
      if (!isPopupActuallyOpen(p)) continue;
      if (excludePopups && excludePopups.has(p)) continue;

      const rawItems = getPopupMenuItems(p).filter(
        (el) =>
          isElementVisible(el) &&
          (!excludeItems || !excludeItems.has(el)) &&
          el.getAttribute('aria-disabled') !== 'true' &&
          !el.hasAttribute('data-disabled')
      );
      if (rawItems.length === 0) continue;

      // Ignore pure effort-only popups (those belong to Level-3 effort picker, not sub-model lists)
      const effortCount = rawItems.filter((el) => Boolean(extractEffortFromSubmenuOption(el))).length;
      if (effortCount === rawItems.length) continue;

      const parsedRows = [];
      for (const el of rawItems) {
        const info = extractMenuRowInfo(el);
        if (info && !info.isUsageAction && info.parsed && info.parsed.base) {
          parsedRows.push(info);
        }
      }

      if (parsedRows.length > bestRows.length) {
        bestContainer = p;
        bestRows = parsedRows;
      }
    }

    return { containerEl: bestContainer, rows: bestRows };
  }

  async function highlightAndArrowRightRow(parentPopup, row, parentItemsSet) {
    syntheticHoverHighlight(row.itemEl);
    await waitNextFrames(1);

    const isRowHighlighted = () =>
      row.itemEl.hasAttribute('data-highlighted') ||
      row.itemEl.getAttribute('aria-selected') === 'true' ||
      document.activeElement === row.itemEl;

    if (!isRowHighlighted()) {
      const allItems = Array.from(parentItemsSet || []);
      const maxSteps = Math.min(24, allItems.length + 2);
      for (let s = 0; s < maxSteps; s++) {
        const keyReceiver =
          document.activeElement && parentPopup.contains(document.activeElement)
            ? document.activeElement
            : parentPopup;
        dispatchMenuKey(keyReceiver, 'ArrowDown', 40);
        if (isRowHighlighted()) break;
      }
    }

    const arrowTarget =
      document.activeElement && parentPopup.contains(document.activeElement) ? document.activeElement : row.itemEl;
    dispatchMenuKey(arrowTarget, 'ArrowRight', 39);
    if (arrowTarget !== row.itemEl) {
      dispatchMenuKey(row.itemEl, 'ArrowRight', 39);
    }
  }

  async function openRowGenericSubmenu(parentPopup, row, excludePopups, excludeItems, maxPollFrames = 12) {
    if (!parentPopup || !row || !row.itemEl || !row.itemEl.isConnected) {
      return { containerEl: null, rows: [] };
    }

    await highlightAndArrowRightRow(parentPopup, row, excludeItems);

    for (let f = 0; f < maxPollFrames; f++) {
      await waitNextFrames(1);
      const found = findSubmenuItemsInSecondaryPopup(excludePopups, excludeItems);
      if (found.rows.length > 0) {
        return found;
      }
    }

    return findSubmenuItemsInSecondaryPopup(excludePopups, excludeItems);
  }

  // Highlight a model row and trigger its submenu via hover + ArrowRight without firing click
  async function openRowEffortSubmenu(
    popup,
    row,
    mainTopItems,
    targetEffort = null,
    maxPollFrames = 12,
    excludePopups = null
  ) {
    if (!popup || !row || !row.itemEl || !row.itemEl.isConnected) {
      return { containerEl: null, matchedEl: null, discoveredEfforts: [], entries: [] };
    }

    await highlightAndArrowRightRow(popup, row, mainTopItems);

    for (let f = 0; f < maxPollFrames; f++) {
      await waitNextFrames(1);
      const found = findEffortOptionsInSecondaryPopup(popup, mainTopItems, targetEffort, excludePopups);
      if (found.discoveredEfforts.length >= 2) {
        return found;
      }
      // Break early if ArrowRight stepped inline effort directly on row.itemEl
      const updated = extractMenuRowInfo(row.itemEl);
      if (updated && updated.currentEffort && updated.currentEffort !== row.currentEffort) {
        break;
      }
    }

    return findEffortOptionsInSecondaryPopup(popup, mainTopItems, targetEffort, excludePopups);
  }

  async function closeNativePopupCleanly(triggerBtn, popupEl) {
    isDispatchingInternal = true;
    try {
      if (triggerBtn && triggerBtn.isConnected && findOpenNativePopup(triggerBtn)) {
        triggerBtn.click();
        await waitNextFrames(1);
      }
      if (findOpenNativePopup(triggerBtn) && document.body) {
        const outsideInit = {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          clientX: 2,
          clientY: 2,
          button: 0
        };
        if (typeof PointerEvent === 'function') {
          document.body.dispatchEvent(
            new PointerEvent('pointerdown', { ...outsideInit, pointerId: 1, pointerType: 'mouse', isPrimary: true })
          );
          document.body.dispatchEvent(
            new PointerEvent('pointerup', { ...outsideInit, pointerId: 1, pointerType: 'mouse', isPrimary: true })
          );
        }
        document.body.dispatchEvent(new MouseEvent('mousedown', outsideInit));
        document.body.dispatchEvent(new MouseEvent('mouseup', outsideInit));
        document.body.dispatchEvent(new MouseEvent('click', outsideInit));
        await waitNextFrames(1);
      }
      if (findOpenNativePopup(triggerBtn) && popupEl && popupEl.isConnected) {
        dispatchMenuKey(popupEl, 'Escape', 27);
        await waitNextFrames(1);
      }
    } finally {
      isDispatchingInternal = false;
    }
  }

  async function openNativePopupCloaked(triggerBtn) {
    let popup = findOpenNativePopup(triggerBtn);
    if (popup) return { popup, wasAlreadyOpen: true };

    syntheticActivate(triggerBtn);
    for (let attempt = 0; attempt < 6; attempt++) {
      await waitNextFrames(1);
      popup = findOpenNativePopup(triggerBtn);
      if (popup) return { popup, wasAlreadyOpen: false };
      if (attempt === 2) {
        isDispatchingInternal = true;
        try {
          triggerBtn.click();
        } finally {
          isDispatchingInternal = false;
        }
      }
    }
    return { popup: null, wasAlreadyOpen: false };
  }

  async function harvestNativeMenu(triggerBtn, force = false) {
    if (!triggerBtn || !triggerBtn.isConnected) return false;
    const now = Date.now();
    if (!force && catalogState.lastHarvestAt > 0 && now - catalogState.lastHarvestAt < 10000) {
      return true;
    }

    document.documentElement.setAttribute('data-ag-pt-harvesting', '1');
    try {
      const { popup, wasAlreadyOpen } = await openNativePopupCloaked(triggerBtn);
      if (!popup) return false;

      const itemEls = getPopupMenuItems(popup);
      const mainTopItems = new Set(itemEls);

      if (itemEls.length > 0) {
        const prevElements = catalogState.elementEntries;
        const prevOthers = catalogState.otherFamilies;
        catalogState.elementEntries = new Map();
        catalogState.otherFamilies = new Map();

        const detectedGenerations = new Map();
        const activeRaw = readRawTriggerModelName(triggerBtn);
        const activeParsed = parseActiveTriggerState(activeRaw);
        const rowsToProbe = [];
        const compositeRowsToProbe = [];

        for (let i = 0; i < itemEls.length; i++) {
          const item = itemEls[i];
          if (item.getAttribute('aria-disabled') === 'true' || item.hasAttribute('data-disabled')) continue;

          const info = extractMenuRowInfo(item);
          if (!info) continue;

          if (info.isUsageAction) {
            catalogState.viewUsageLabel = info.label || 'View Usage';
            continue;
          }

          const { parsed } = info;
          if (parsed.isElement && parsed.seriesTitle) {
            detectedGenerations.set(parsed.seriesTitle, (detectedGenerations.get(parsed.seriesTitle) || 0) + 1);
          }

          const isActive = Boolean(
            activeParsed &&
              ((parsed.isElement && activeParsed.isElement && parsed.element.z === activeParsed.element.z) ||
                (!parsed.isElement &&
                  !activeParsed.isElement &&
                  parsed.shortLabel.toLowerCase() === activeParsed.shortLabel.toLowerCase()))
          );

          registerModelEntry(parsed, isActive);

          if (info.isComposite && info.hasSubmenu) {
            compositeRowsToProbe.push(info);
            continue;
          }

          const baseLower = parsed.base.toLowerCase();
          if (
            info.hasEffortIndicator &&
            !lookupBackendModelCap(parsed.base) &&
            !catalogState.probedEffortsByBase.has(baseLower)
          ) {
            rowsToProbe.push(info);
          }
        }

        // Always probe composite rows (such as Orchestrator) to discover live Level-2 sub-models
        for (const compInfo of compositeRowsToProbe) {
          if (!isPopupActuallyOpen(popup)) break;
          const famKey = compInfo.parsed.shortLabel.toLowerCase();
          const fam = catalogState.otherFamilies.get(famKey);
          if (!fam) continue;

          const subMenu = await openRowGenericSubmenu(popup, compInfo, new Set([popup]), mainTopItems, 10);
          if (subMenu.rows.length > 0) {
            const discoveredSubs = [];
            const seenSubKeys = new Set();
            for (const subRow of subMenu.rows) {
              const sBase = subRow.parsed.base;
              const sKey = sBase.toLowerCase();
              if (seenSubKeys.has(sKey)) continue;
              seenSubKeys.add(sKey);

              let sTiers = resolveVerifiedEffortsForBase(sBase, subRow.currentEffort ? [subRow.currentEffort] : []);
              if (sTiers.length < 2 && subRow.hasSubmenu && !hasAuthoritativeBackendCaps()) {
                const subItemsSet = new Set(subMenu.rows.map((r) => r.itemEl));
                const l3 = await openRowEffortSubmenu(
                  subMenu.containerEl,
                  subRow,
                  subItemsSet,
                  null,
                  7,
                  new Set([popup, subMenu.containerEl])
                );
                if (l3.discoveredEfforts.length >= 2) {
                  catalogState.probedEffortsByBase.set(sKey, l3.discoveredEfforts);
                  sTiers = l3.discoveredEfforts;
                  dispatchMenuKey(l3.containerEl || subRow.itemEl, 'ArrowLeft', 37);
                  await waitNextFrames(1);
                }
              }

              discoveredSubs.push({
                key: sKey,
                base: sBase,
                shortLabel: sBase,
                currentEffort: subRow.currentEffort || null,
                hasSubmenu: Boolean(subRow.hasSubmenu),
                supportedEfforts: sTiers,
                hasEffortControl: sTiers.length >= 2
              });
            }

            if (discoveredSubs.length > 0) {
              fam.subModels = discoveredSubs;
              const activeSubHint = compInfo.parsed.activeSubModelBase;
              const activeSubEff = compInfo.parsed.activeSubModelEffort;
              const matchedSub = matchSubModelInFamily(fam, activeSubHint) || discoveredSubs[0];
              fam.activeSubModelKey = matchedSub ? matchedSub.key : null;
              if (matchedSub && activeSubEff) {
                matchedSub.currentEffort = activeSubEff;
              }
            }

            dispatchMenuKey(subMenu.containerEl || compInfo.itemEl, 'ArrowLeft', 37);
            await waitNextFrames(1);
          } else {
            const prevFam = prevOthers.get(famKey);
            if (prevFam && Array.isArray(prevFam.subModels) && prevFam.subModels.length > 0) {
              fam.subModels = prevFam.subModels;
              if (!fam.activeSubModelKey) fam.activeSubModelKey = prevFam.activeSubModelKey;
            }
          }
        }

        // Fallback live submenu probing ONLY when Language Server capabilities are not yet present
        if (rowsToProbe.length > 0 && !hasAuthoritativeBackendCaps()) {
          for (const rowInfo of rowsToProbe) {
            if (!isPopupActuallyOpen(popup)) break;
            const probeRes = await openRowEffortSubmenu(popup, rowInfo, mainTopItems, null, 7);
            if (probeRes.discoveredEfforts.length >= 2) {
              catalogState.probedEffortsByBase.set(
                rowInfo.parsed.base.toLowerCase(),
                probeRes.discoveredEfforts
              );
              const closeTarget = probeRes.containerEl || rowInfo.itemEl;
              dispatchMenuKey(closeTarget, 'ArrowLeft', 37);
              await waitNextFrames(1);
            } else if (rowInfo.effortCtrlEl && rowInfo.effortCtrlEl.isConnected) {
              // Dedicated inner button fallback probe
              syntheticActivate(rowInfo.effortCtrlEl);
              await waitNextFrames(3);
              const subBtnProbe = findEffortOptionsInSecondaryPopup(popup, mainTopItems, null);
              if (subBtnProbe.discoveredEfforts.length >= 2) {
                catalogState.probedEffortsByBase.set(
                  rowInfo.parsed.base.toLowerCase(),
                  subBtnProbe.discoveredEfforts
                );
                if (subBtnProbe.containerEl) {
                  dispatchMenuKey(subBtnProbe.containerEl, 'Escape', 27);
                  await waitNextFrames(1);
                }
              }
            }
          }
        }

        if (catalogState.elementEntries.size === 0 && prevElements.size > 0) {
          catalogState.elementEntries = prevElements;
        }
        if (catalogState.otherFamilies.size === 0 && prevOthers.size > 0) {
          catalogState.otherFamilies = prevOthers;
        }

        let topGen = catalogState.heroSeriesTitle;
        let topCnt = 0;
        for (const [gen, cnt] of detectedGenerations.entries()) {
          if (cnt > topCnt) {
            topCnt = cnt;
            topGen = gen;
          }
        }
        catalogState.heroSeriesTitle = topGen;

        if (Array.isArray(CONFIG.extraOtherModels)) {
          for (const extra of CONFIG.extraOtherModels) {
            const p = parseModelLabel(extra);
            if (p) registerModelEntry(p, false);
          }
        }

        const refreshedActiveParsed = parseActiveTriggerState(activeRaw);
        if (refreshedActiveParsed) {
          registerModelEntry(refreshedActiveParsed, true);
        }

        syncCatalogCapabilitiesFromKnownSources();
        catalogState.lastHarvestAt = Date.now();
        saveCatalogSnapshot();
      }

      if (!wasAlreadyOpen) {
        await closeNativePopupCleanly(triggerBtn, popup);
      }
      return true;
    } catch (e) {
      return false;
    } finally {
      document.documentElement.removeAttribute('data-ag-pt-harvesting');
    }
  }

  function recordDiscoveredEfforts(targetSpec, discoveredEfforts) {
    if (!Array.isArray(discoveredEfforts) || discoveredEfforts.length < 2) return;
    const sorted = sortEffortTiers(discoveredEfforts);
    if (sorted.length < 2) return;
    if (targetSpec.base) {
      catalogState.probedEffortsByBase.set(String(targetSpec.base).toLowerCase(), sorted);
    }
    if (targetSpec.elementZ && catalogState.elementEntries.has(targetSpec.elementZ)) {
      const rec = catalogState.elementEntries.get(targetSpec.elementZ);
      if (!lookupBackendModelCap(rec.base)) {
        rec.supportedEfforts = sorted;
        rec.hasEffortControl = true;
      }
    } else if (targetSpec.familyKey && catalogState.otherFamilies.has(targetSpec.familyKey)) {
      const fam = catalogState.otherFamilies.get(targetSpec.familyKey);
      if (!lookupBackendModelCap(fam.base)) {
        fam.supportedEfforts = sorted;
        fam.hasEffortControl = true;
      }
    }
  }

  async function activateSubmenuEffortItem(subSearch) {
    if (!subSearch || !subSearch.matchedEl) return false;
    const optEl = subSearch.matchedEl;
    syntheticHoverHighlight(optEl);
    await waitNextFrames(1);
    syntheticActivate(optEl);
    await waitNextFrames(2);

    if (subSearch.containerEl && isElementVisible(subSearch.containerEl)) {
      dispatchMenuKey(optEl, 'Enter', 13);
      await waitNextFrames(1);
    }
    if (subSearch.containerEl && isElementVisible(subSearch.containerEl) && optEl.isConnected) {
      isDispatchingInternal = true;
      try {
        optEl.click();
      } finally {
        isDispatchingInternal = false;
      }
      await waitNextFrames(2);
    }
    return true;
  }

  async function applyModelSelectionToHost(triggerBtn, targetSpec) {
    if (!triggerBtn || !triggerBtn.isConnected || !targetSpec) return false;

    const normTargetEffort = targetSpec.effort ? normalizeEffortToken(targetSpec.effort) || targetSpec.effort : null;

    document.documentElement.setAttribute('data-ag-pt-harvesting', '1');
    try {
      const { popup } = await openNativePopupCloaked(triggerBtn);
      if (!popup) return false;

      const itemEls = getPopupMenuItems(popup);
      const mainTopItems = new Set(itemEls);
      const matchingRows = [];

      for (const item of itemEls) {
        if (item.getAttribute('aria-disabled') === 'true' || item.hasAttribute('data-disabled')) continue;
        const info = extractMenuRowInfo(item);
        if (!info || info.isUsageAction) continue;

        const { parsed } = info;
        const isSameModel = targetSpec.elementZ
          ? parsed.isElement && parsed.element.z === targetSpec.elementZ
          : !parsed.isElement && parsed.shortLabel.toLowerCase() === targetSpec.familyKey;

        if (isSameModel) {
          matchingRows.push(info);
        }
      }

      if (matchingRows.length === 0) {
        await closeNativePopupCleanly(triggerBtn, popup);
        return false;
      }

      // Case 0: Composite nested-model selection (e.g. Orchestrator -> Gemini 4 Carbon -> High)
      if (targetSpec.subModelBase) {
        const compRow = matchingRows[0];
        const level2 = await openRowGenericSubmenu(popup, compRow, new Set([popup]), mainTopItems, 14);
        const wantSubLower = String(targetSpec.subModelBase).trim().toLowerCase();
        const targetSubRow =
          level2.rows.find((r) => r.parsed.base.toLowerCase() === wantSubLower) ||
          level2.rows.find(
            (r) =>
              r.parsed.base.toLowerCase().includes(wantSubLower) ||
              wantSubLower.includes(r.parsed.base.toLowerCase())
          ) ||
          level2.rows[0] ||
          null;

        let committed = false;
        let appliedEffort = normTargetEffort || (targetSubRow ? targetSubRow.currentEffort : null);

        if (targetSubRow && level2.containerEl) {
          const level2ItemsSet = new Set(level2.rows.map((r) => r.itemEl));
          const excludeL3 = new Set([popup, level2.containerEl]);
          const desiredEffort =
            normTargetEffort ||
            catalogState.preferredSubEffortByKey.get(`${targetSpec.familyKey}::${wantSubLower}`) ||
            targetSubRow.currentEffort ||
            null;

          if (targetSubRow.hasSubmenu || normTargetEffort) {
            const level3 = await openRowEffortSubmenu(
              level2.containerEl,
              targetSubRow,
              level2ItemsSet,
              desiredEffort,
              14,
              excludeL3
            );
            if (level3.discoveredEfforts.length >= 2) {
              catalogState.probedEffortsByBase.set(targetSubRow.parsed.base.toLowerCase(), level3.discoveredEfforts);
            }

            let pickEl = level3.matchedEl;
            if (!pickEl && Array.isArray(level3.entries) && level3.entries.length > 0) {
              const fallbackEntry =
                level3.entries.find((e) => e.effort === desiredEffort) ||
                level3.entries.find((e) => e.effort === 'Medium') ||
                level3.entries[0];
              if (fallbackEntry) {
                pickEl = fallbackEntry.el;
                appliedEffort = fallbackEntry.effort;
              }
            }

            if (pickEl) {
              await activateSubmenuEffortItem({ containerEl: level3.containerEl, matchedEl: pickEl });
              committed = true;
            }
          }

          if (!committed && targetSubRow.itemEl && targetSubRow.itemEl.isConnected && isPopupActuallyOpen(popup)) {
            syntheticHoverHighlight(targetSubRow.itemEl);
            await waitNextFrames(1);
            syntheticActivate(targetSubRow.itemEl);
            await waitNextFrames(2);
            if (isPopupActuallyOpen(popup) && targetSubRow.itemEl.isConnected) {
              isDispatchingInternal = true;
              try {
                targetSubRow.itemEl.click();
              } finally {
                isDispatchingInternal = false;
              }
              await waitNextFrames(2);
            }
            committed = true;
          }
        }

        if (findOpenNativePopup(triggerBtn)) {
          await closeNativePopupCleanly(triggerBtn, popup);
        }

        const fam = targetSpec.familyKey ? catalogState.otherFamilies.get(targetSpec.familyKey) : null;
        if (fam) {
          const matchedSub = matchSubModelInFamily(fam, targetSpec.subModelBase);
          if (matchedSub) {
            fam.activeSubModelKey = matchedSub.key;
            if (appliedEffort) {
              matchedSub.currentEffort = appliedEffort;
              catalogState.preferredSubEffortByKey.set(`${fam.key}::${matchedSub.key}`, appliedEffort);
            }
          }
          saveCatalogSnapshot();
        }
        return committed;
      }

      // Case 1: Flat separate rows per effort tier
      if (matchingRows.length >= 2 && normTargetEffort) {
        const exactRow = matchingRows.find((r) => r.currentEffort === normTargetEffort) || matchingRows[0];
        syntheticHoverHighlight(exactRow.itemEl);
        await waitNextFrames(1);
        syntheticActivate(exactRow.itemEl);
        await waitNextFrames(2);
        if (findOpenNativePopup(triggerBtn)) {
          await closeNativePopupCleanly(triggerBtn, popup);
        }
        return true;
      }

      const row = matchingRows[0];
      let effortHandled = !normTargetEffort || row.currentEffort === normTargetEffort;

      // Case 2: Switch thinking effort when requested tier differs from current tier
      if (!effortHandled) {
        // Strategy 1 (Primary, Non-Destructive): Highlight row & expand submenu via Hover + ArrowRight
        const subSearch = await openRowEffortSubmenu(popup, row, mainTopItems, normTargetEffort, 14);
        if (subSearch.discoveredEfforts.length >= 2) {
          recordDiscoveredEfforts(targetSpec, subSearch.discoveredEfforts);
        }

        if (subSearch.matchedEl) {
          await activateSubmenuEffortItem(subSearch);
          effortHandled = true;
        } else {
          // Check if ArrowRight stepped inline effort directly on row.itemEl
          const afterArrow = extractMenuRowInfo(row.itemEl);
          if (afterArrow && afterArrow.currentEffort && afterArrow.currentEffort !== row.currentEffort) {
            if (afterArrow.currentEffort === normTargetEffort) {
              effortHandled = true;
            } else {
              for (let s = 0; s < 6; s++) {
                const cur = extractMenuRowInfo(row.itemEl);
                if (!cur || !cur.currentEffort) break;
                if (cur.currentEffort === normTargetEffort) {
                  effortHandled = true;
                  break;
                }
                const wantIdx = EFFORT_ORDER.indexOf(normTargetEffort);
                const curIdx = EFFORT_ORDER.indexOf(cur.currentEffort);
                const key = wantIdx >= 0 && curIdx >= 0 && wantIdx < curIdx ? 'ArrowLeft' : 'ArrowRight';
                dispatchMenuKey(row.itemEl, key, key === 'ArrowLeft' ? 37 : 39);
                await waitNextFrames(1);
              }
            }
          }
        }

        // Strategy 2 (Fallback): Single-click inline effort button/badge (secondary popover OR inline cycle)
        if (!effortHandled && isPopupActuallyOpen(popup)) {
          const inlineTarget = row.effortCtrlEl || row.effortBadgeEl;
          if (inlineTarget && inlineTarget.isConnected && inlineTarget !== row.itemEl) {
            syntheticActivate(inlineTarget);
            let btnSub = { containerEl: null, matchedEl: null, discoveredEfforts: [] };
            for (let f = 0; f < 6; f++) {
              await waitNextFrames(1);
              btnSub = findEffortOptionsInSecondaryPopup(popup, mainTopItems, normTargetEffort);
              if (btnSub.discoveredEfforts.length >= 2) break;
              const cur = extractMenuRowInfo(row.itemEl);
              if (cur && cur.currentEffort && cur.currentEffort !== row.currentEffort) break;
            }

            if (btnSub.discoveredEfforts.length >= 2) {
              recordDiscoveredEfforts(targetSpec, btnSub.discoveredEfforts);
            }

            if (btnSub.matchedEl) {
              await activateSubmenuEffortItem(btnSub);
              effortHandled = true;
            } else if (isPopupActuallyOpen(popup)) {
              const afterClick = extractMenuRowInfo(row.itemEl);
              if (afterClick && afterClick.currentEffort && afterClick.currentEffort !== row.currentEffort) {
                if (afterClick.currentEffort === normTargetEffort) {
                  effortHandled = true;
                } else {
                  for (let step = 0; step < 6; step++) {
                    const curInfo = extractMenuRowInfo(row.itemEl);
                    if (!curInfo) break;
                    if (curInfo.currentEffort === normTargetEffort) {
                      effortHandled = true;
                      break;
                    }
                    const nextCtrl = curInfo.effortCtrlEl || curInfo.effortBadgeEl;
                    if (!nextCtrl || !nextCtrl.isConnected || nextCtrl === row.itemEl) break;
                    syntheticActivate(nextCtrl);
                    await waitNextFrames(2);
                  }
                }
              }
            }
          }
        }
      }

      // Commit the primary model row if the menu is still open
      if (isPopupActuallyOpen(popup)) {
        const triggerAfterSub = parseModelLabel(readRawTriggerModelName(triggerBtn));
        const alreadyCommitted = Boolean(
          triggerAfterSub &&
            ((targetSpec.elementZ && triggerAfterSub.isElement && triggerAfterSub.element.z === targetSpec.elementZ) ||
              (targetSpec.familyKey &&
                !triggerAfterSub.isElement &&
                triggerAfterSub.shortLabel.toLowerCase() === targetSpec.familyKey)) &&
            (!normTargetEffort || triggerAfterSub.effort === normTargetEffort)
        );

        if (!alreadyCommitted) {
          const clickTarget =
            row.titleEl &&
            row.titleEl !== row.effortCtrlEl &&
            row.titleEl !== row.effortBadgeEl &&
            row.itemEl.contains(row.titleEl)
              ? row.titleEl
              : row.itemEl;
          syntheticHoverHighlight(row.itemEl);
          await waitNextFrames(1);
          syntheticActivate(clickTarget);
          await waitNextFrames(2);
          if (isPopupActuallyOpen(popup)) {
            isDispatchingInternal = true;
            try {
              row.itemEl.click();
            } finally {
              isDispatchingInternal = false;
            }
            await waitNextFrames(1);
          }
        }
      }

      if (findOpenNativePopup(triggerBtn)) {
        await closeNativePopupCleanly(triggerBtn, popup);
      }

      if (normTargetEffort) {
        if (targetSpec.elementZ) {
          catalogState.preferredEffortByZ.set(targetSpec.elementZ, normTargetEffort);
          const rec = catalogState.elementEntries.get(targetSpec.elementZ);
          if (rec) rec.currentEffort = normTargetEffort;
        } else if (targetSpec.familyKey) {
          catalogState.preferredEffortByOtherKey.set(targetSpec.familyKey, normTargetEffort);
          const fam = catalogState.otherFamilies.get(targetSpec.familyKey);
          if (fam) fam.currentEffort = normTargetEffort;
        }
        saveCatalogSnapshot();
      }

      return true;
    } finally {
      document.documentElement.removeAttribute('data-ag-pt-harvesting');
    }
  }

  // ==========================================================================
  // 7. Popover, Periodic Table & Usage View
  // ==========================================================================
  const SUPPORTS_NATIVE_POPOVER =
    typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';

  let popoverEl = null;
  let shadowRoot = null;
  let cardEl = null;
  let headerTitleEl = null;
  let tierBadgeEl = null;
  let backNavBtnEl = null;
  let refreshUsageBtnEl = null;
  let heroTitleEl = null;
  let releasedCountTextEl = null;
  let inspectorEl = null;
  let inspectorNameEl = null;
  let effortGroupEl = null;
  let otherPillsWrapEl = null;
  let subModelBarEl = null;
  let subModelLabelEl = null;
  let subModelListEl = null;
  let subModelDividerEl = null;
  let subModelEffortsEl = null;
  let viewUsageBtnEl = null;
  let usageViewEl = null;
  const tileBtnByZ = new Map();
  let activeTriggerBtn = null;
  let hoverIntentTimer = null;
  let lockedSelection = null; // { isElement: true, elementZ } | { isElement: false, familyKey, subModelKey? } | null

  function isPanelOpen() {
    if (!popoverEl || !popoverEl.isConnected) return false;
    if (SUPPORTS_NATIVE_POPOVER) {
      try {
        return popoverEl.matches(':popover-open');
      } catch (e) {}
    }
    return popoverEl.getAttribute('data-open') === '1';
  }

  function closePeriodicPanel() {
    if (hoverIntentTimer) {
      clearTimeout(hoverIntentTimer);
      hoverIntentTimer = null;
    }
    lockedSelection = null;
    if (!popoverEl || !isPanelOpen()) return;
    try {
      if (SUPPORTS_NATIVE_POPOVER) {
        popoverEl.hidePopover();
      } else {
        popoverEl.removeAttribute('data-open');
        popoverEl.style.display = 'none';
      }
    } catch (e) {}
  }

  function positionPanelNearTrigger(triggerBtn) {
    if (!popoverEl || !cardEl) return;
    const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
    const vh = window.innerHeight || document.documentElement.clientHeight || 768;
    const margin = 12;

    const cardRect = cardEl.getBoundingClientRect();
    const cw = cardRect.width || Math.min(888, vw - margin * 2);
    const ch = cardRect.height || 510;

    if (!triggerBtn || !triggerBtn.isConnected) {
      popoverEl.style.left = `${Math.max(margin, Math.round((vw - cw) / 2))}px`;
      popoverEl.style.top = `${Math.max(margin, Math.round((vh - ch) / 2))}px`;
      popoverEl.setAttribute('data-placement', 'below');
      return;
    }

    const composerBox = triggerBtn.closest(
      '#antigravity\\.agentSidePanelInputBox, [id="antigravity.agentSidePanelInputBox"], .surface-composer, [data-composer]'
    );
    const anchorRect = (composerBox || triggerBtn).getBoundingClientRect();
    const trigRect = triggerBtn.getBoundingClientRect();

    const centerX = anchorRect.left + anchorRect.width / 2;
    const left = Math.max(margin, Math.min(vw - cw - margin, Math.round(centerX - cw / 2)));

    const anchorBottom = Math.max(anchorRect.bottom, trigRect.bottom);
    const anchorTop = Math.min(anchorRect.top, trigRect.top);
    const spaceBelow = vh - anchorBottom - margin;
    const spaceAbove = anchorTop - margin;

    let top;
    let placement = 'below';
    if (spaceBelow >= ch + 4 || spaceBelow >= spaceAbove) {
      top = Math.min(vh - ch - margin, Math.max(margin, Math.round(anchorBottom + 4)));
      placement = 'below';
    } else {
      top = Math.max(margin, Math.round(anchorTop - ch - 6));
      placement = 'above';
    }

    popoverEl.setAttribute('data-placement', placement);
    popoverEl.style.left = `${left}px`;
    popoverEl.style.top = `${top}px`;
  }

  function formatResetCountdown(isoStr) {
    if (!isoStr) return '';
    const targetMs = Date.parse(isoStr);
    if (!Number.isFinite(targetMs)) return '';
    const diffMs = targetMs - Date.now();
    if (diffMs <= 0) return 'Resetting soon';

    const totalMins = Math.max(1, Math.round(diffMs / 60000));
    const d = Math.floor(totalMins / 1440);
    const h = Math.floor((totalMins % 1440) / 60);
    const m = totalMins % 60;

    let rel;
    if (d > 0) rel = `Resets in ${d}d ${h}h`;
    else if (h > 0) rel = `Resets in ${h}h ${m}m`;
    else rel = `Resets in ${m}m`;

    try {
      const abs = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(targetMs));
      return `${rel} · ${abs}`;
    } catch {
      return rel;
    }
  }

  function getQuotaLevel(fraction) {
    if (typeof fraction !== 'number') return 'ok';
    if (fraction < 0.15) return 'crit';
    if (fraction < 0.35) return 'warn';
    return 'ok';
  }

  function switchCardView(viewName) {
    if (!cardEl) return;
    const isUsage = viewName === 'usage';
    cardEl.setAttribute('data-view', isUsage ? 'usage' : 'table');

    if (headerTitleEl) {
      headerTitleEl.textContent = isUsage ? 'Usage' : 'Model periodic table';
    }
    if (backNavBtnEl) {
      backNavBtnEl.style.display = isUsage ? 'inline-flex' : 'none';
    }
    if (refreshUsageBtnEl) {
      refreshUsageBtnEl.style.display = isUsage ? 'inline-flex' : 'none';
    }

    const tierName = backendState.data?.account?.tierName || '';
    if (tierBadgeEl) {
      if (isUsage && tierName) {
        tierBadgeEl.textContent = tierName;
        tierBadgeEl.style.display = 'inline-flex';
      } else {
        tierBadgeEl.style.display = 'none';
      }
    }

    if (isUsage) {
      requestBackendRefresh(false);
      renderNativeUsageView();
    } else {
      refreshPanelState();
    }

    requestAnimationFrame(() => {
      positionPanelNearTrigger(activeTriggerBtn);
    });
  }

  function renderNativeUsageView() {
    if (!usageViewEl) return;
    usageViewEl.textContent = '';

    const tierName = backendState.data?.account?.tierName || '';
    if (tierBadgeEl) {
      if (cardEl && cardEl.getAttribute('data-view') === 'usage' && tierName) {
        tierBadgeEl.textContent = tierName;
        tierBadgeEl.style.display = 'inline-flex';
      } else {
        tierBadgeEl.style.display = 'none';
      }
    }
    if (refreshUsageBtnEl) {
      refreshUsageBtnEl.disabled = Boolean(backendState.refreshing);
      refreshUsageBtnEl.textContent = backendState.refreshing ? '↻ Refreshing...' : '↻ Refresh';
    }

    const groupsWrap = document.createElement('div');
    groupsWrap.className = 'pt-usage-groups';
    const quotaGroups = Array.isArray(backendState.data?.quota?.groups) ? backendState.data.quota.groups : [];

    if (quotaGroups.length > 0) {
      for (const grp of quotaGroups) {
        const gCard = document.createElement('div');
        gCard.className = 'pt-usage-group-card';

        const hTitle = document.createElement('h3');
        hTitle.className = 'pt-usage-group-title';
        hTitle.textContent = grp.displayName || 'Quota';
        gCard.appendChild(hTitle);

        const bucketList = document.createElement('div');
        bucketList.className = 'pt-bucket-list';
        const buckets = Array.isArray(grp.buckets) ? grp.buckets : [];

        for (const b of buckets) {
          const bItem = document.createElement('div');
          bItem.className = 'pt-bucket-item';

          const frac = typeof b.remainingFraction === 'number' ? Math.max(0, Math.min(1, b.remainingFraction)) : null;
          const pct = frac !== null ? Math.round(frac * 100) : null;
          const level = getQuotaLevel(frac);

          const bTop = document.createElement('div');
          bTop.className = 'pt-bucket-top';

          const bName = document.createElement('span');
          bName.className = 'pt-bucket-name';
          const winTag = b.window === '5h' ? '5-hour' : b.window === 'weekly' ? 'Weekly' : b.window || '';
          bName.textContent = b.displayName || winTag || 'Rate Limit';

          const bPct = document.createElement('span');
          bPct.className = 'pt-bucket-pct';
          bPct.setAttribute('data-level', level);
          bPct.textContent = pct !== null ? `${pct}%` : 'Available';

          bTop.appendChild(bName);
          bTop.appendChild(bPct);
          bItem.appendChild(bTop);

          if (pct !== null) {
            const track = document.createElement('div');
            track.className = 'pt-progress-track';
            const fill = document.createElement('div');
            fill.className = 'pt-progress-fill';
            fill.setAttribute('data-level', level);
            fill.style.width = `${pct}%`;
            track.appendChild(fill);
            bItem.appendChild(track);
          }

          const resetStr = formatResetCountdown(b.resetTime);
          if (resetStr) {
            const meta = document.createElement('div');
            meta.className = 'pt-bucket-meta';
            meta.textContent = resetStr;
            bItem.appendChild(meta);
          }

          bucketList.appendChild(bItem);
        }

        gCard.appendChild(bucketList);
        groupsWrap.appendChild(gCard);
      }
    } else {
      const infoCard = document.createElement('div');
      infoCard.className = 'pt-usage-group-card';
      const hTitle = document.createElement('h3');
      hTitle.className = 'pt-usage-group-title';
      hTitle.textContent = backendState.refreshing ? 'Loading quota...' : 'Quota unavailable';
      infoCard.appendChild(hTitle);
      groupsWrap.appendChild(infoCard);
    }

    usageViewEl.appendChild(groupsWrap);
  }

  function setInspectorTitleStrong(prefixTitle, suffixText = '') {
    if (!inspectorNameEl) return;
    inspectorNameEl.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = prefixTitle;
    inspectorNameEl.appendChild(strong);
    if (suffixText) {
      inspectorNameEl.appendChild(document.createTextNode(suffixText));
    }
  }

  function resolveSelectedSubModelForFamily(fam, activeParsed = null) {
    if (!fam || !Array.isArray(fam.subModels) || fam.subModels.length === 0) return null;
    if (
      lockedSelection &&
      !lockedSelection.isElement &&
      lockedSelection.familyKey === fam.key &&
      lockedSelection.subModelKey
    ) {
      const hitLocked = matchSubModelInFamily(fam, lockedSelection.subModelKey);
      if (hitLocked) return hitLocked;
    }
    if (
      activeParsed &&
      !activeParsed.isElement &&
      activeParsed.shortLabel.toLowerCase() === fam.key &&
      activeParsed.activeSubModelBase
    ) {
      const hitActive = matchSubModelInFamily(fam, activeParsed.activeSubModelBase);
      if (hitActive) return hitActive;
    }
    if (fam.activeSubModelKey) {
      const hitStored = matchSubModelInFamily(fam, fam.activeSubModelKey);
      if (hitStored) return hitStored;
    }
    return fam.subModels[0] || null;
  }

  function renderSubModelBar(fam, activeParsed = null) {
    if (!subModelBarEl || !subModelLabelEl || !subModelListEl || !subModelDividerEl || !subModelEffortsEl) return;

    const wasOpen = subModelBarEl.getAttribute('data-open') === '1';
    const hasSubs = Boolean(fam && Array.isArray(fam.subModels) && fam.subModels.length > 0);
    if (!hasSubs) {
      subModelBarEl.removeAttribute('data-open');
      subModelListEl.textContent = '';
      subModelEffortsEl.textContent = '';
      if (wasOpen && isPanelOpen()) {
        requestAnimationFrame(() => positionPanelNearTrigger(activeTriggerBtn));
      }
      return;
    }

    const selectedSub = resolveSelectedSubModelForFamily(fam, activeParsed);
    subModelLabelEl.textContent = fam.shortLabel;
    subModelListEl.textContent = '';
    subModelEffortsEl.textContent = '';

    for (const sub of fam.subModels) {
      const isSubActive = Boolean(selectedSub && selectedSub.key === sub.key);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pt-submodel-chip';
      chip.title = `${fam.shortLabel} · ${sub.base}`;
      chip.setAttribute('aria-pressed', isSubActive ? 'true' : 'false');
      if (isSubActive) {
        chip.setAttribute('data-active', '1');
        const dot = document.createElement('span');
        dot.className = 'pt-other-pill-dot';
        chip.appendChild(dot);
      }
      const txt = document.createElement('span');
      txt.textContent = sub.shortLabel || sub.base;
      chip.appendChild(txt);

      chip.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const mode = resolveCloseMode();
        const subTiers = Array.isArray(sub.supportedEfforts) ? sub.supportedEfforts : [];
        const alreadyLockedOnThisSub = Boolean(
          lockedSelection &&
            !lockedSelection.isElement &&
            lockedSelection.familyKey === fam.key &&
            lockedSelection.subModelKey === sub.key
        );

        if (mode === 'effort' && subTiers.length >= 2 && !alreadyLockedOnThisSub) {
          lockedSelection = { isElement: false, familyKey: fam.key, subModelKey: sub.key };
          refreshPanelState();
          const activeEff =
            subModelEffortsEl && subModelEffortsEl.querySelector('.pt-effort-chip[data-active="1"], .pt-effort-chip');
          if (activeEff && typeof activeEff.focus === 'function') {
            try {
              activeEff.focus({ preventScroll: true });
            } catch (e) {}
          }
          return;
        }

        const prefEff =
          catalogState.preferredSubEffortByKey.get(`${fam.key}::${sub.key}`) || sub.currentEffort || null;
        const btn = activeTriggerBtn;
        const keepOpen = mode === 'never';
        closePeriodicPanel();
        await applyModelSelectionToHost(btn, {
          elementZ: null,
          familyKey: fam.key,
          base: fam.base,
          subModelBase: sub.base,
          effort: prefEff
        });
        refreshPanelState();
        if (keepOpen && btn) {
          await openPeriodicPanel(btn);
        }
      });

      subModelListEl.appendChild(chip);
    }

    const subTiers = selectedSub && Array.isArray(selectedSub.supportedEfforts) ? selectedSub.supportedEfforts : [];
    if (selectedSub && subTiers.length >= 2) {
      subModelDividerEl.style.display = '';
      subModelEffortsEl.style.display = 'inline-flex';
      const isThisSubActiveInHost = Boolean(
        activeParsed &&
          !activeParsed.isElement &&
          activeParsed.shortLabel.toLowerCase() === fam.key &&
          activeParsed.activeSubModelBase &&
          matchSubModelInFamily(fam, activeParsed.activeSubModelBase)?.key === selectedSub.key
      );
      const curEff =
        (isThisSubActiveInHost && activeParsed.activeSubModelEffort) ||
        catalogState.preferredSubEffortByKey.get(`${fam.key}::${selectedSub.key}`) ||
        selectedSub.currentEffort ||
        null;

      for (const eff of subTiers) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'pt-effort-chip';
        chip.textContent = EFFORT_SHORT[eff] || eff;
        chip.title = `${fam.shortLabel} · ${selectedSub.base} (${eff})`;
        if (curEff === eff) {
          chip.setAttribute('data-active', '1');
        }
        chip.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const btn = activeTriggerBtn;
          const keepOpen = resolveCloseMode() === 'never';
          closePeriodicPanel();
          await applyModelSelectionToHost(btn, {
            elementZ: null,
            familyKey: fam.key,
            base: fam.base,
            subModelBase: selectedSub.base,
            effort: eff
          });
          refreshPanelState();
          if (keepOpen && btn) {
            await openPeriodicPanel(btn);
          }
        });
        subModelEffortsEl.appendChild(chip);
      }
    } else {
      subModelDividerEl.style.display = 'none';
      subModelEffortsEl.style.display = 'none';
    }

    subModelBarEl.setAttribute('data-open', '1');
    if (!wasOpen && isPanelOpen()) {
      requestAnimationFrame(() => positionPanelNearTrigger(activeTriggerBtn));
    }
  }

  function renderDefaultActiveInspector() {
    if (!inspectorEl) return;
    if (lockedSelection) {
      if (lockedSelection.isElement) {
        renderInspectorForElement(lockedSelection.elementZ);
        return;
      }
      const lockedFam = catalogState.otherFamilies.get(lockedSelection.familyKey);
      if (lockedFam) {
        renderInspectorForOtherFamily(lockedFam);
        return;
      }
    }
    const activeRaw = activeTriggerBtn ? readRawTriggerModelName(activeTriggerBtn) : '';
    const activeParsed = parseActiveTriggerState(activeRaw);
    if (!activeParsed) {
      inspectorEl.removeAttribute('data-visible');
      return;
    }
    if (activeParsed.isElement) {
      renderInspectorForElement(activeParsed.element.z);
      return;
    }
    const fam = catalogState.otherFamilies.get(activeParsed.shortLabel.toLowerCase());
    if (fam) {
      renderInspectorForOtherFamily(fam);
      return;
    }
    inspectorEl.removeAttribute('data-visible');
  }

  function renderInspectorForElement(z) {
    if (!inspectorEl || !inspectorNameEl || !effortGroupEl) return;
    if (!z || !ELEMENT_BY_Z.has(z)) {
      renderDefaultActiveInspector();
      return;
    }
    const elem = ELEMENT_BY_Z.get(z);
    const entry = catalogState.elementEntries.get(z);
    effortGroupEl.textContent = '';

    if (!entry) {
      setInspectorTitleStrong(`${elem.z} · ${elem.nameEn}`, ' — Coming soon');
      inspectorEl.setAttribute('data-visible', '1');
      return;
    }

    const activeRaw = activeTriggerBtn ? readRawTriggerModelName(activeTriggerBtn) : '';
    const activeParsed = parseModelLabel(activeRaw);
    const isThisActive = Boolean(activeParsed && activeParsed.isElement && activeParsed.element.z === z);
    const currentEffort =
      (isThisActive && activeParsed.effort) ||
      catalogState.preferredEffortByZ.get(z) ||
      entry.currentEffort ||
      null;

    const sTitle = entry.seriesTitle || catalogState.heroSeriesTitle || 'Gemini 4';
    setInspectorTitleStrong(`${elem.z} · ${sTitle} ${elem.nameEn}`);

    const tiers = Array.isArray(entry.supportedEfforts) ? entry.supportedEfforts : [];
    if (tiers.length >= 2) {
      for (const eff of tiers) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'pt-effort-chip';
        chip.textContent = EFFORT_SHORT[eff] || eff;
        chip.title = `${sTitle} ${elem.nameEn} (${eff})`;
        if (currentEffort === eff) {
          chip.setAttribute('data-active', '1');
        }
        chip.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const btn = activeTriggerBtn;
          const keepOpen = resolveCloseMode() === 'never';
          closePeriodicPanel();
          await applyModelSelectionToHost(btn, {
            elementZ: z,
            effort: eff,
            base: entry.base
          });
          refreshPanelState();
          if (keepOpen && btn) {
            await openPeriodicPanel(btn);
          }
        });
        effortGroupEl.appendChild(chip);
      }
    }
    inspectorEl.setAttribute('data-visible', '1');
  }

  function renderInspectorForOtherFamily(fam) {
    if (!inspectorEl || !inspectorNameEl || !effortGroupEl || !fam) return;

    effortGroupEl.textContent = '';

    if (Array.isArray(fam.subModels) && fam.subModels.length > 0) {
      const activeRaw = activeTriggerBtn ? readRawTriggerModelName(activeTriggerBtn) : '';
      const activeParsed = parseActiveTriggerState(activeRaw);
      const selectedSub = resolveSelectedSubModelForFamily(fam, activeParsed);
      if (selectedSub) {
        const effSuffix = selectedSub.currentEffort ? ` · ${EFFORT_SHORT[selectedSub.currentEffort] || selectedSub.currentEffort}` : '';
        setInspectorTitleStrong(`${fam.base} · ${selectedSub.base}`, effSuffix);
      } else {
        setInspectorTitleStrong(fam.base);
      }
      inspectorEl.setAttribute('data-visible', '1');
      return;
    }

    const tiers = Array.isArray(fam.supportedEfforts) ? fam.supportedEfforts : [];
    setInspectorTitleStrong(fam.base);

    // Only render effort chips if this model genuinely supports >= 2 effort tiers
    if (tiers.length >= 2) {
      const activeRaw = activeTriggerBtn ? readRawTriggerModelName(activeTriggerBtn) : '';
      const activeParsed = parseActiveTriggerState(activeRaw);
      const isThisActive = Boolean(
        activeParsed && !activeParsed.isElement && activeParsed.shortLabel.toLowerCase() === fam.key
      );
      const currentEffort =
        (isThisActive && activeParsed.effort) ||
        catalogState.preferredEffortByOtherKey.get(fam.key) ||
        fam.currentEffort ||
        null;

      for (const eff of tiers) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'pt-effort-chip';
        chip.textContent = EFFORT_SHORT[eff] || eff;
        chip.title = `${fam.base} (${eff})`;
        if (currentEffort === eff) {
          chip.setAttribute('data-active', '1');
        }
        chip.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const btn = activeTriggerBtn;
          const keepOpen = resolveCloseMode() === 'never';
          closePeriodicPanel();
          await applyModelSelectionToHost(btn, {
            elementZ: null,
            familyKey: fam.key,
            effort: eff,
            base: fam.base
          });
          refreshPanelState();
          if (keepOpen && btn) {
            await openPeriodicPanel(btn);
          }
        });
        effortGroupEl.appendChild(chip);
      }
    }

    inspectorEl.setAttribute('data-visible', '1');
  }

  function flashSeriesRow(seriesRow) {
    for (const [z, tile] of tileBtnByZ.entries()) {
      const meta = ELEMENT_BY_Z.get(z);
      if (meta && meta.row === seriesRow) {
        tile.setAttribute('data-series-flash', '1');
        setTimeout(() => tile.removeAttribute('data-series-flash'), 650);
      }
    }
  }

  function ensurePopoverBuilt() {
    if (popoverEl && popoverEl.isConnected && shadowRoot) return popoverEl;

    popoverEl = document.createElement('div');
    popoverEl.id = 'ag-periodic-model-popover';
    popoverEl.setAttribute('popover', 'auto');
    popoverEl.setAttribute('role', 'dialog');
    popoverEl.setAttribute('aria-label', 'Model periodic table');
    popoverEl.addEventListener('toggle', (ev) => {
      if (ev.newState === 'closed') {
        lockedSelection = null;
      }
    });

    const hostWrap = document.createElement('div');
    hostWrap.id = 'ag-pt-shadow-host';
    popoverEl.appendChild(hostWrap);
    shadowRoot = hostWrap.attachShadow({ mode: 'open' });

    const styleEl = document.createElement('style');
    styleEl.id = 'ag-pt-shadow-style';
    styleEl.textContent = shadowCssText;
    shadowRoot.appendChild(styleEl);

    if (customCssText.trim()) {
      const userShadowStyle = document.createElement('style');
      userShadowStyle.id = 'ag-pt-user-shadow-style';
      userShadowStyle.textContent = customCssText;
      shadowRoot.appendChild(userShadowStyle);
    }

    cardEl = document.createElement('div');
    cardEl.className = 'pt-card';
    cardEl.setAttribute('data-theme', resolveCardTheme());
    cardEl.setAttribute('data-view', 'table');

    // Header
    const header = document.createElement('div');
    header.className = 'pt-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'pt-title-wrap';
    titleWrap.innerHTML = `
      <svg class="pt-sparkle" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="agPtSparkleGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#8AB4F8"/>
            <stop offset="52%" stop-color="#B3CEFB"/>
            <stop offset="100%" stop-color="#C58AF9"/>
          </linearGradient>
        </defs>
        <path d="M12 2C12 7.8 16.2 12 22 12C16.2 12 12 16.2 12 22C12 16.2 7.8 12 2 12C7.8 12 12 7.8 12 2Z" fill="url(#agPtSparkleGrad)"/>
      </svg>
    `;
    headerTitleEl = document.createElement('h2');
    headerTitleEl.className = 'pt-title';
    headerTitleEl.textContent = 'Model periodic table';

    tierBadgeEl = document.createElement('span');
    tierBadgeEl.className = 'pt-tier-badge';
    tierBadgeEl.style.display = 'none';

    titleWrap.appendChild(headerTitleEl);
    titleWrap.appendChild(tierBadgeEl);

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'pt-header-actions';

    backNavBtnEl = document.createElement('button');
    backNavBtnEl.type = 'button';
    backNavBtnEl.className = 'pt-nav-pill';
    backNavBtnEl.style.display = 'none';
    backNavBtnEl.textContent = '← Periodic Table';
    backNavBtnEl.addEventListener('click', (ev) => {
      ev.stopPropagation();
      switchCardView('table');
    });

    refreshUsageBtnEl = document.createElement('button');
    refreshUsageBtnEl.type = 'button';
    refreshUsageBtnEl.className = 'pt-nav-pill';
    refreshUsageBtnEl.style.display = 'none';
    refreshUsageBtnEl.textContent = '↻ Refresh';
    refreshUsageBtnEl.addEventListener('click', (ev) => {
      ev.stopPropagation();
      requestBackendRefresh(true);
      renderNativeUsageView();
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'pt-close-btn';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    `;
    closeBtn.addEventListener('click', () => {
      closePeriodicPanel();
    });

    actionsWrap.appendChild(backNavBtnEl);
    actionsWrap.appendChild(refreshUsageBtnEl);
    actionsWrap.appendChild(closeBtn);

    header.appendChild(titleWrap);
    header.appendChild(actionsWrap);
    cardEl.appendChild(header);

    // Periodic Grid
    const grid = document.createElement('div');
    grid.className = 'pt-grid';

    for (let col = 1; col <= 18; col++) {
      const colIdx = document.createElement('div');
      colIdx.className = 'pt-col-idx';
      colIdx.style.gridRow = '1';
      colIdx.style.gridColumn = String(col + 1);
      colIdx.textContent = String(col);
      grid.appendChild(colIdx);
    }

    for (let row = 1; row <= 7; row++) {
      const rowIdx = document.createElement('div');
      rowIdx.className = 'pt-row-idx';
      rowIdx.style.gridRow = String(row + 1);
      rowIdx.style.gridColumn = '1';
      rowIdx.textContent = String(row);
      grid.appendChild(rowIdx);
    }

    // Central Hero Section
    const hero = document.createElement('div');
    hero.className = 'pt-hero';
    hero.addEventListener('mouseenter', () => {
      if (hoverIntentTimer) {
        clearTimeout(hoverIntentTimer);
        hoverIntentTimer = null;
      }
    });

    heroTitleEl = document.createElement('p');
    heroTitleEl.className = 'pt-hero-title';
    heroTitleEl.textContent = catalogState.heroSeriesTitle || 'Gemini 4';

    const legend = document.createElement('div');
    legend.className = 'pt-legend';

    const releasedItem = document.createElement('span');
    releasedItem.className = 'pt-legend-item';
    const dotReleased = document.createElement('span');
    dotReleased.className = 'pt-dot-released';
    releasedCountTextEl = document.createElement('span');
    releasedCountTextEl.textContent = '4 released';
    releasedItem.appendChild(dotReleased);
    releasedItem.appendChild(releasedCountTextEl);

    const soonItem = document.createElement('span');
    soonItem.className = 'pt-legend-item';
    const dotSoon = document.createElement('span');
    dotSoon.className = 'pt-dot-soon';
    const soonText = document.createElement('span');
    soonText.textContent = 'Coming soon';
    soonItem.appendChild(dotSoon);
    soonItem.appendChild(soonText);

    legend.appendChild(releasedItem);
    legend.appendChild(soonItem);

    inspectorEl = document.createElement('div');
    inspectorEl.className = 'pt-inspector';
    inspectorNameEl = document.createElement('span');
    inspectorNameEl.className = 'pt-inspector-name';
    effortGroupEl = document.createElement('div');
    effortGroupEl.className = 'pt-effort-group';
    inspectorEl.appendChild(inspectorNameEl);
    inspectorEl.appendChild(effortGroupEl);

    hero.appendChild(heroTitleEl);
    hero.appendChild(legend);
    hero.appendChild(inspectorEl);
    grid.appendChild(hero);

    // Lanthanide & Actinide Range Placeholders
    const lnRange = document.createElement('button');
    lnRange.type = 'button';
    lnRange.className = 'pt-range-tile';
    lnRange.style.gridRow = '7';
    lnRange.style.gridColumn = '4';
    lnRange.textContent = '57-71';
    lnRange.title = 'Lanthanides (57–71)';
    lnRange.addEventListener('click', () => flashSeriesRow(8));
    grid.appendChild(lnRange);

    const anRange = document.createElement('button');
    anRange.type = 'button';
    anRange.className = 'pt-range-tile';
    anRange.style.gridRow = '8';
    anRange.style.gridColumn = '4';
    anRange.textContent = '89-103';
    anRange.title = 'Actinides (89–103)';
    anRange.addEventListener('click', () => flashSeriesRow(9));
    grid.appendChild(anRange);

    const lnLabel = document.createElement('div');
    lnLabel.className = 'pt-series-label';
    lnLabel.style.gridRow = '10';
    lnLabel.style.gridColumn = '3';
    lnLabel.textContent = 'Ln';
    grid.appendChild(lnLabel);

    const anLabel = document.createElement('div');
    anLabel.className = 'pt-series-label';
    anLabel.style.gridRow = '11';
    anLabel.style.gridColumn = '3';
    anLabel.textContent = 'An';
    grid.appendChild(anLabel);

    // 118 Element Tiles
    tileBtnByZ.clear();
    for (let i = 0; i < ELEMENTS.length; i++) {
      const [z, sym, , row, col] = ELEMENTS[i];
      const gridRow = row <= 7 ? row + 1 : row + 2;
      const gridCol = col + 1;

      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'pt-tile';
      tile.style.gridRow = String(gridRow);
      tile.style.gridColumn = String(gridCol);
      tile.setAttribute('data-z', String(z));
      tile.setAttribute('data-sym', sym);
      tile.setAttribute('data-row', String(row));
      tile.setAttribute('data-col', String(col));

      const numSpan = document.createElement('span');
      numSpan.className = 'pt-num';
      numSpan.textContent = String(z);

      const symSpan = document.createElement('span');
      symSpan.className = 'pt-sym';
      symSpan.textContent = sym;

      tile.appendChild(numSpan);
      tile.appendChild(symSpan);

      tile.addEventListener('mouseenter', () => {
        if (lockedSelection) return;
        if (hoverIntentTimer) {
          clearTimeout(hoverIntentTimer);
          hoverIntentTimer = null;
        }
        if (catalogState.elementEntries.has(z)) {
          renderInspectorForElement(z);
        } else {
          hoverIntentTimer = setTimeout(() => {
            hoverIntentTimer = null;
            if (!lockedSelection) {
              renderInspectorForElement(z);
            }
          }, 220);
        }
      });

      tile.addEventListener('click', async () => {
        const entry = catalogState.elementEntries.get(z);
        if (!entry) {
          if (!lockedSelection) renderInspectorForElement(z);
          return;
        }
        const mode = resolveCloseMode();
        const hasEfforts = Array.isArray(entry.supportedEfforts) && entry.supportedEfforts.length >= 2;
        const alreadyLockedHere = Boolean(lockedSelection && lockedSelection.isElement && lockedSelection.elementZ === z);

        if (mode === 'effort' && hasEfforts && !alreadyLockedHere) {
          lockedSelection = { isElement: true, elementZ: z };
          refreshPanelState();
          const activeChip = effortGroupEl && effortGroupEl.querySelector('.pt-effort-chip[data-active="1"], .pt-effort-chip');
          if (activeChip && typeof activeChip.focus === 'function') {
            try {
              activeChip.focus({ preventScroll: true });
            } catch (e) {}
          }
          return;
        }

        const preferred = catalogState.preferredEffortByZ.get(z) || null;
        const btn = activeTriggerBtn;
        const keepOpen = mode === 'never';
        closePeriodicPanel();
        await applyModelSelectionToHost(btn, {
          elementZ: z,
          effort: preferred,
          base: entry.base
        });
        refreshPanelState();
        if (keepOpen && btn) {
          await openPeriodicPanel(btn);
        }
      });

      tileBtnByZ.set(z, tile);
      grid.appendChild(tile);
    }

    cardEl.addEventListener('mouseleave', () => {
      if (hoverIntentTimer) {
        clearTimeout(hoverIntentTimer);
        hoverIntentTimer = null;
      }
      if (!lockedSelection) {
        renderDefaultActiveInspector();
      }
    });

    cardEl.appendChild(grid);

    // Built-In Native Usage & Quota Panel (.pt-usage-view)
    usageViewEl = document.createElement('div');
    usageViewEl.className = 'pt-usage-view';
    cardEl.appendChild(usageViewEl);

    // Bottom Footer: Other models + Native View Usage button + Composite Sub-Model Tray
    const footer = document.createElement('div');
    footer.className = 'pt-footer';

    const footerMain = document.createElement('div');
    footerMain.className = 'pt-footer-main';

    const otherWrap = document.createElement('div');
    otherWrap.className = 'pt-other-wrap';

    const otherLabel = document.createElement('span');
    otherLabel.className = 'pt-other-label';
    otherLabel.textContent = 'Other models';

    otherPillsWrapEl = document.createElement('div');
    otherPillsWrapEl.className = 'pt-other-pills';

    otherWrap.appendChild(otherLabel);
    otherWrap.appendChild(otherPillsWrapEl);
    footerMain.appendChild(otherWrap);

    viewUsageBtnEl = document.createElement('button');
    viewUsageBtnEl.type = 'button';
    viewUsageBtnEl.className = 'pt-usage-btn';
    viewUsageBtnEl.textContent = 'View Usage';
    viewUsageBtnEl.addEventListener('click', (ev) => {
      ev.stopPropagation();
      switchCardView('usage');
    });
    footerMain.appendChild(viewUsageBtnEl);
    footer.appendChild(footerMain);

    subModelBarEl = document.createElement('div');
    subModelBarEl.className = 'pt-submodel-bar';
    subModelLabelEl = document.createElement('span');
    subModelLabelEl.className = 'pt-submodel-label';
    subModelListEl = document.createElement('div');
    subModelListEl.className = 'pt-submodel-list';
    subModelDividerEl = document.createElement('span');
    subModelDividerEl.className = 'pt-submodel-divider';
    subModelEffortsEl = document.createElement('div');
    subModelEffortsEl.className = 'pt-submodel-efforts';

    subModelBarEl.appendChild(subModelLabelEl);
    subModelBarEl.appendChild(subModelListEl);
    subModelBarEl.appendChild(subModelDividerEl);
    subModelBarEl.appendChild(subModelEffortsEl);
    footer.appendChild(subModelBarEl);

    cardEl.appendChild(footer);
    shadowRoot.appendChild(cardEl);

    // 2D Spatial Arrow Key Navigation, Backspace Return & Element Quick-Jump
    let quickJumpBuf = '';
    let quickJumpTimer = null;
    cardEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        closePeriodicPanel();
        return;
      }
      if (ev.key === 'Backspace' && cardEl.getAttribute('data-view') === 'usage') {
        ev.preventDefault();
        switchCardView('table');
        return;
      }
      if (cardEl.getAttribute('data-view') === 'usage') return;
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;

      const focused = shadowRoot.activeElement;
      if (
        focused &&
        focused.classList &&
        focused.classList.contains('pt-tile') &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)
      ) {
        ev.preventDefault();
        const curRow = Number(focused.getAttribute('data-row'));
        const curCol = Number(focused.getAttribute('data-col'));
        const dr = ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0;
        const dc = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
        let bestTile = null;
        let bestScore = Infinity;
        for (const [, candidate] of tileBtnByZ.entries()) {
          const r = Number(candidate.getAttribute('data-row'));
          const c = Number(candidate.getAttribute('data-col'));
          if (dr !== 0 && Math.sign(r - curRow) !== dr) continue;
          if (dc !== 0 && Math.sign(c - curCol) !== dc) continue;
          const distPrimary = dr !== 0 ? Math.abs(r - curRow) : Math.abs(c - curCol);
          const distSecondary = dr !== 0 ? Math.abs(c - curCol) : Math.abs(r - curRow);
          const score = distPrimary * 25 + distSecondary;
          if (score < bestScore) {
            bestScore = score;
            bestTile = candidate;
          }
        }
        if (bestTile) {
          bestTile.focus();
          renderInspectorForElement(Number(bestTile.getAttribute('data-z')));
        }
        return;
      }

      if (/^[a-zA-Z]$/.test(ev.key)) {
        quickJumpBuf = (quickJumpBuf + ev.key.toLowerCase()).slice(-2);
        if (quickJumpTimer) clearTimeout(quickJumpTimer);
        quickJumpTimer = setTimeout(() => {
          quickJumpBuf = '';
        }, 650);
        const exact2 = ELEMENT_BY_SYMBOL.get(quickJumpBuf);
        const exact1 = ELEMENT_BY_SYMBOL.get(ev.key.toLowerCase());
        const hit = exact2 || exact1;
        if (hit && tileBtnByZ.has(hit.z)) {
          const targetTile = tileBtnByZ.get(hit.z);
          targetTile.focus();
          renderInspectorForElement(hit.z);
        }
      }
    });

    document.body.appendChild(popoverEl);
    return popoverEl;
  }

  function refreshPanelState() {
    if (!cardEl) return;
    cardEl.setAttribute('data-theme', resolveCardTheme());

    const activeRaw = activeTriggerBtn ? readRawTriggerModelName(activeTriggerBtn) : '';
    const activeParsed = parseActiveTriggerState(activeRaw);
    if (activeParsed) {
      registerModelEntry(activeParsed, true);
    }

    syncCatalogCapabilitiesFromKnownSources();

    if (heroTitleEl) {
      heroTitleEl.textContent = catalogState.heroSeriesTitle || 'Gemini 4';
    }

    const releasedCount = catalogState.elementEntries.size;
    if (releasedCountTextEl) {
      releasedCountTextEl.textContent = `${releasedCount} released`;
    }

    for (const [z, tile] of tileBtnByZ.entries()) {
      const elem = ELEMENT_BY_Z.get(z);
      const entry = catalogState.elementEntries.get(z);
      const existingDot = tile.querySelector('.pt-active-dot');

      if (entry) {
        tile.setAttribute('data-released', '1');
        tile.setAttribute('data-palette', getPaletteForElement(z));
        const isLocked = Boolean(lockedSelection && lockedSelection.isElement && lockedSelection.elementZ === z);
        const isSelected = lockedSelection
          ? isLocked
          : Boolean(activeParsed && activeParsed.isElement && activeParsed.element.z === z);
        if (isLocked) {
          tile.setAttribute('data-locked', '1');
        } else {
          tile.removeAttribute('data-locked');
        }
        if (isSelected) {
          tile.setAttribute('data-selected', '1');
          tile.setAttribute('aria-current', 'true');
          if (!existingDot) {
            const dot = document.createElement('span');
            dot.className = 'pt-active-dot';
            tile.appendChild(dot);
          }
        } else {
          tile.removeAttribute('data-selected');
          tile.removeAttribute('aria-current');
          if (existingDot) existingDot.remove();
        }
        const sTitle = entry.seriesTitle || catalogState.heroSeriesTitle || 'Gemini 4';
        tile.title = `${elem.z} · ${sTitle} ${elem.nameEn}`;
      } else {
        tile.removeAttribute('data-released');
        tile.removeAttribute('data-palette');
        tile.removeAttribute('data-selected');
        tile.removeAttribute('data-locked');
        tile.removeAttribute('aria-current');
        if (existingDot) existingDot.remove();
        tile.title = `${elem.z} · ${elem.nameEn} (Coming soon)`;
      }
    }

    let expandedCompositeFam = null;
    if (lockedSelection && !lockedSelection.isElement) {
      const lockedFam = catalogState.otherFamilies.get(lockedSelection.familyKey);
      if (lockedFam && Array.isArray(lockedFam.subModels) && lockedFam.subModels.length > 0) {
        expandedCompositeFam = lockedFam;
      }
    } else if (!lockedSelection && activeParsed && !activeParsed.isElement) {
      const activeFam = catalogState.otherFamilies.get(activeParsed.shortLabel.toLowerCase());
      if (activeFam && Array.isArray(activeFam.subModels) && activeFam.subModels.length > 0) {
        expandedCompositeFam = activeFam;
      }
    }

    if (otherPillsWrapEl) {
      otherPillsWrapEl.textContent = '';
      for (const fam of catalogState.otherFamilies.values()) {
        const hasSubModels = Array.isArray(fam.subModels) && fam.subModels.length > 0;
        const selectedSub = hasSubModels ? resolveSelectedSubModelForFamily(fam, activeParsed) : null;
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'pt-other-pill';
        pill.title = selectedSub ? `${fam.base} · ${selectedSub.base}` : fam.base;

        const isLocked = Boolean(lockedSelection && !lockedSelection.isElement && lockedSelection.familyKey === fam.key);
        const isSelected = lockedSelection
          ? isLocked
          : Boolean(activeParsed && !activeParsed.isElement && activeParsed.shortLabel.toLowerCase() === fam.key);
        const isExpanded = Boolean(expandedCompositeFam && expandedCompositeFam.key === fam.key);

        if (hasSubModels) {
          pill.setAttribute('data-has-submodels', '1');
          pill.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
        }
        if (isExpanded) {
          pill.setAttribute('data-expanded', '1');
        }
        if (isLocked) {
          pill.setAttribute('data-locked', '1');
        }
        if (isSelected) {
          pill.setAttribute('data-selected', '1');
          const dot = document.createElement('span');
          dot.className = 'pt-other-pill-dot';
          pill.appendChild(dot);
        }

        const txt = document.createElement('span');
        txt.textContent = fam.shortLabel;
        pill.appendChild(txt);

        if (hasSubModels) {
          const caret = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          caret.setAttribute('class', 'pt-pill-caret');
          caret.setAttribute('viewBox', '0 0 12 12');
          caret.setAttribute('fill', 'none');
          caret.setAttribute('aria-hidden', 'true');
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', 'M3 4.5L6 7.5L9 4.5');
          path.setAttribute('stroke', 'currentColor');
          path.setAttribute('stroke-width', '1.4');
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          caret.appendChild(path);
          pill.appendChild(caret);
        }

        pill.addEventListener('mouseenter', () => {
          if (lockedSelection) return;
          if (hoverIntentTimer) {
            clearTimeout(hoverIntentTimer);
            hoverIntentTimer = null;
          }
          renderInspectorForOtherFamily(fam);
        });

        pill.addEventListener('click', async () => {
          const mode = resolveCloseMode();
          const alreadyLockedHere = Boolean(
            lockedSelection && !lockedSelection.isElement && lockedSelection.familyKey === fam.key
          );

          if (hasSubModels) {
            if (!alreadyLockedHere) {
              const initialSub = resolveSelectedSubModelForFamily(fam, activeParsed);
              lockedSelection = {
                isElement: false,
                familyKey: fam.key,
                subModelKey: initialSub ? initialSub.key : null
              };
              refreshPanelState();
              const activeSubBtn =
                subModelListEl && subModelListEl.querySelector('.pt-submodel-chip[data-active="1"], .pt-submodel-chip');
              if (activeSubBtn && typeof activeSubBtn.focus === 'function') {
                try {
                  activeSubBtn.focus({ preventScroll: true });
                } catch (e) {}
              }
              return;
            }

            const chosenSub = resolveSelectedSubModelForFamily(fam, activeParsed);
            const prefSubEff = chosenSub
              ? catalogState.preferredSubEffortByKey.get(`${fam.key}::${chosenSub.key}`) || chosenSub.currentEffort || null
              : null;
            const btn = activeTriggerBtn;
            const keepOpen = mode === 'never';
            closePeriodicPanel();
            await applyModelSelectionToHost(btn, {
              elementZ: null,
              familyKey: fam.key,
              base: fam.base,
              subModelBase: chosenSub ? chosenSub.base : null,
              effort: prefSubEff
            });
            refreshPanelState();
            if (keepOpen && btn) {
              await openPeriodicPanel(btn);
            }
            return;
          }

          const hasEfforts = Array.isArray(fam.supportedEfforts) && fam.supportedEfforts.length >= 2;
          if (mode === 'effort' && hasEfforts && !alreadyLockedHere) {
            lockedSelection = { isElement: false, familyKey: fam.key };
            refreshPanelState();
            const activeChip =
              effortGroupEl && effortGroupEl.querySelector('.pt-effort-chip[data-active="1"], .pt-effort-chip');
            if (activeChip && typeof activeChip.focus === 'function') {
              try {
                activeChip.focus({ preventScroll: true });
              } catch (e) {}
            }
            return;
          }

          const pref = catalogState.preferredEffortByOtherKey.get(fam.key) || null;
          const btn = activeTriggerBtn;
          const keepOpen = mode === 'never';
          closePeriodicPanel();
          await applyModelSelectionToHost(btn, {
            elementZ: null,
            familyKey: fam.key,
            effort: pref,
            base: fam.base
          });
          refreshPanelState();
          if (keepOpen && btn) {
            await openPeriodicPanel(btn);
          }
        });

        otherPillsWrapEl.appendChild(pill);
      }
    }

    renderSubModelBar(expandedCompositeFam, activeParsed);

    if (viewUsageBtnEl) {
      viewUsageBtnEl.textContent = catalogState.viewUsageLabel || 'View Usage';
      viewUsageBtnEl.style.display = 'inline-flex';
    }

    renderDefaultActiveInspector();
  }

  async function openPeriodicPanel(triggerBtn, initialView = 'table') {
    const resolvedTrigger = triggerBtn || findAllModelTriggers()[0] || null;
    activeTriggerBtn = resolvedTrigger;
    lockedSelection = null;

    const curRaw = resolvedTrigger ? readRawTriggerModelName(resolvedTrigger) : '';
    seedInitialCatalog(curRaw);

    if (resolvedTrigger) {
      await harvestNativeMenu(resolvedTrigger, false);
    }

    const pop = ensurePopoverBuilt();
    switchCardView(initialView === 'usage' ? 'usage' : 'table');

    if (!isPanelOpen()) {
      if (SUPPORTS_NATIVE_POPOVER) {
        pop.showPopover();
      } else {
        pop.setAttribute('data-open', '1');
        pop.style.display = 'block';
      }
    }
    positionPanelNearTrigger(resolvedTrigger);
  }

  // ==========================================================================
  // 8. Event Interception & Real-Time Host Theme Observer
  // ==========================================================================
  let suppressTriggerClickBtn = null;
  let suppressTriggerClickAt = 0;

  const onDocPointerOrMouseDown = (ev) => {
    if (isDispatchingInternal || ev.button !== 0 || ev.altKey) return;
    const targetEl = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (!targetEl || !isModelSelectorTrigger(targetEl)) return;

    // On pointerdown (or mousedown fallback), native popover="auto" light-dismiss has not
    // yet closed the popover on pointerup. Record and close immediately so the subsequent
    // click event does not re-open the panel right after light-dismiss closes it.
    const isPrimaryDown = ev.type === 'pointerdown' || typeof PointerEvent !== 'function';
    if (isPrimaryDown) {
      if (isPanelOpen() && activeTriggerBtn === targetEl) {
        suppressTriggerClickBtn = targetEl;
        suppressTriggerClickAt = Date.now();
        closePeriodicPanel();
      } else {
        suppressTriggerClickBtn = null;
        suppressTriggerClickAt = 0;
      }
    }

    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
  };

  const onDocClick = (ev) => {
    if (isDispatchingInternal || ev.altKey) return;
    const targetEl = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (!targetEl || !isModelSelectorTrigger(targetEl)) {
      if (!SUPPORTS_NATIVE_POPOVER && isPanelOpen() && popoverEl && !popoverEl.contains(ev.target)) {
        closePeriodicPanel();
      }
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    if (suppressTriggerClickBtn === targetEl && Date.now() - suppressTriggerClickAt < 2500) {
      suppressTriggerClickBtn = null;
      suppressTriggerClickAt = 0;
      if (isPanelOpen()) closePeriodicPanel();
      return;
    }
    suppressTriggerClickBtn = null;
    suppressTriggerClickAt = 0;

    if (isPanelOpen() && activeTriggerBtn === targetEl) {
      closePeriodicPanel();
    } else {
      void openPeriodicPanel(targetEl, 'table');
    }
  };

  const onDocKeyDown = (ev) => {
    if (MODULES.keyboardShortcut === false || !CONFIG.shortcut) return;
    const spec = String(CONFIG.shortcut).toLowerCase();
    const wantAlt = spec.includes('alt+');
    const wantCtrl = spec.includes('ctrl+') || spec.includes('cmdorctrl+');
    const wantShift = spec.includes('shift+');
    const keyPart = spec.split('+').pop();
    if (
      Boolean(ev.altKey) === wantAlt &&
      Boolean(ev.ctrlKey || ev.metaKey) === wantCtrl &&
      Boolean(ev.shiftKey) === wantShift &&
      String(ev.key || '').toLowerCase() === keyPart
    ) {
      ev.preventDefault();
      ev.stopPropagation();
      if (isPanelOpen()) {
        closePeriodicPanel();
      } else {
        void openPeriodicPanel(findAllModelTriggers()[0] || null, 'table');
      }
    }
  };

  const onWindowResize = () => {
    if (isPanelOpen()) {
      positionPanelNearTrigger(activeTriggerBtn);
    }
  };

  const syncThemeLive = () => {
    if (cardEl) {
      cardEl.setAttribute('data-theme', resolveCardTheme());
    }
  };

  const themeObserver = new MutationObserver(syncThemeLive);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme', 'data-agy-theme', 'data-ag-theme-mode']
  });
  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme', 'data-agy-theme', 'data-newux-theme']
  });

  const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (mediaQuery && typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', syncThemeLive);
  }

  document.addEventListener('pointerdown', onDocPointerOrMouseDown, true);
  document.addEventListener('mousedown', onDocPointerOrMouseDown, true);
  document.addEventListener('click', onDocClick, true);
  document.addEventListener('keydown', onDocKeyDown, true);
  window.addEventListener('resize', onWindowResize, { passive: true });

  onCleanup(() => {
    themeObserver.disconnect();
    if (mediaQuery && typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', syncThemeLive);
    }
    document.removeEventListener('pointerdown', onDocPointerOrMouseDown, true);
    document.removeEventListener('mousedown', onDocPointerOrMouseDown, true);
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onDocKeyDown, true);
    window.removeEventListener('resize', onWindowResize);
  });

  const initialTriggers = findAllModelTriggers();
  seedInitialCatalog(initialTriggers[0] ? readRawTriggerModelName(initialTriggers[0]) : '');
  requestBackendRefresh(false);

  // ==========================================================================
  // 9. Public Runtime API & User Extension Hook
  // ==========================================================================
  const publicApi = {
    version: PATCH_VERSION,
    config: CONFIG,
    modules: MODULES,
    open: (triggerEl, view = 'table') => openPeriodicPanel(triggerEl || null, view),
    openUsage: (triggerEl) => openPeriodicPanel(triggerEl || null, 'usage'),
    close: () => closePeriodicPanel(),
    refreshCatalog: async () => {
      const t = activeTriggerBtn || findAllModelTriggers()[0];
      requestBackendRefresh(true);
      return harvestNativeMenu(t, true);
    },
    getState: () => ({
      version: PATCH_VERSION,
      open: isPanelOpen(),
      view: cardEl ? cardEl.getAttribute('data-view') || 'table' : 'table',
      theme: resolveCardTheme(),
      heroSeriesTitle: catalogState.heroSeriesTitle,
      hasBackendData: Boolean(backendState.data),
      releasedElements: Array.from(catalogState.elementEntries.entries()).map(([z, rec]) => ({
        ...ELEMENT_BY_Z.get(z),
        supportedEfforts: rec.supportedEfforts
      })),
      otherModels: Array.from(catalogState.otherFamilies.values()).map((f) => ({
        shortLabel: f.shortLabel,
        base: f.base,
        hasEffortControl: f.hasEffortControl,
        currentEffort: f.currentEffort,
        supportedEfforts: f.supportedEfforts,
        activeSubModelKey: f.activeSubModelKey || null,
        subModels: Array.isArray(f.subModels)
          ? f.subModels.map((s) => ({
              base: s.base,
              currentEffort: s.currentEffort,
              supportedEfforts: s.supportedEfforts
            }))
          : []
      })),
      triggersFound: findAllModelTriggers().length
    }),
    onCleanup
  };

  window.__ag_pt_api = publicApi;
  window.__ag_pt_version = PATCH_VERSION;
  window.__ag_pt_ready = true;

  if (MODULES.customJs !== false && boot.customJs && String(boot.customJs).trim()) {
    try {
      const userFn = new Function('ctx', 'boot', String(boot.customJs));
      userFn(publicApi, boot);
    } catch (err) {
      console.error('[PeriodicModelPicker] user/custom.js error:', err);
    }
  }
})(__AG_PT_BOOT_PAYLOAD__);
