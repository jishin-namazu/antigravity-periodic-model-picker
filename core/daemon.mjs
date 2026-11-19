#!/usr/bin/env node
/**
 * Antigravity Periodic Model Picker · Local CDP & Language Server Bridge Daemon (core/daemon.mjs)
 *
 * Responsibilities:
 * 1. Connects to local 127.0.0.1 Chrome DevTools Protocol via DevToolsActivePort (fallback 9222/9223).
 * 2. Discovers the local Language Server via ~/.gemini/antigravity/daemon/hub_*.json to query
 *    read-only model capabilities (GetAvailableModels) and live quota summaries (RetrieveUserQuotaSummary, GetUserStatus).
 * 3. Pushes exact per-model thinking effort tiers and native Usage panel data to the browser runtime.
 * 4. Watches user/config.json, user/custom.css, and user/custom.js every 2.5s for live hot-reload.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CORE_DIR = path.join(ROOT_DIR, 'core');
const USER_DIR = path.join(ROOT_DIR, 'user');

const args = process.argv.slice(2);
const hasFlag = (f) => args.some((a) => a === f || a.startsWith(f + '='));
function getArg(flag, fallback = null) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) return args[i + 1];
    if (args[i].startsWith(flag + '=')) return args[i].slice(flag.length + 1);
  }
  return fallback;
}

const SAFE_MODE = hasFlag('--safe-mode');
const RUN_ONCE = hasFlag('--once');
const CLI_CHANNEL = getArg('--channel', null);
const BASE_VERSION = '20261119-v1.0';

function readJsonSafe(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function readTextSafe(filePath, fallback = '') {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function getFileMtimeSig(filePath) {
  try {
    const st = fs.statSync(filePath, { throwIfNoEntry: false });
    return st ? `${st.mtimeMs}:${st.size}` : '0:0';
  } catch {
    return '0:0';
  }
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === 'EPERM';
  }
}

// ============================================================================
// 1. Read-Only Local Language Server Discovery & Quota/Model Capability Fetch
// ============================================================================
let cachedLsEndpoint = null; // { proto, port, csrfToken, discoveredAt }
let cachedBackendPayload = null;
let cachedBackendAt = 0;

function postLsConnectRpc(endpoint, method, body = {}, timeoutMs = 3500) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const mod = endpoint.proto === 'https' ? https : http;
    const req = mod.request(
      {
        hostname: '127.0.0.1',
        port: endpoint.port,
        path: `/exa.language_server_pb.LanguageServerService/${method}`,
        method: 'POST',
        rejectUnauthorized: false,
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-codeium-csrf-token': endpoint.csrfToken || ''
        }
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(raw || '{}'));
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.write(payload);
    req.end();
  });
}

async function discoverLanguageServerEndpoint(force = false) {
  const now = Date.now();
  if (!force && cachedLsEndpoint && now - cachedLsEndpoint.discoveredAt < 30000) {
    return cachedLsEndpoint;
  }

  const candidates = [];
  if (process.env.ANTIGRAVITY_LS_ADDRESS && process.env.ANTIGRAVITY_CSRF_TOKEN) {
    const m = String(process.env.ANTIGRAVITY_LS_ADDRESS).match(/:(\d+)$/);
    if (m) {
      candidates.push({
        port: Number(m[1]),
        protos: ['http', 'https'],
        csrfToken: process.env.ANTIGRAVITY_CSRF_TOKEN,
        mtimeMs: Infinity
      });
    }
  }

  const home = os.homedir();
  const daemonDirs = [
    path.join(home, '.gemini', 'antigravity', 'daemon'),
    path.join(home, '.gemini', 'antigravity-insiders', 'daemon')
  ];

  for (const dir of daemonDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const name of fs.readdirSync(dir)) {
        if (!/^hub_.*\.json$/i.test(name)) continue;
        const full = path.join(dir, name);
        try {
          const st = fs.statSync(full);
          const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
          const pid = Number(parsed?.pid) || 0;
          if (pid > 0 && !isPidAlive(pid)) continue;
          const csrfToken = String(parsed?.csrfToken || parsed?.csrf_token || '').trim();
          const httpPort = Number(parsed?.httpPort || parsed?.port) || 0;
          const httpsPort = Number(parsed?.httpsPort) || 0;
          if (!csrfToken) continue;
          if (httpPort > 0) {
            candidates.push({ port: httpPort, protos: ['http', 'https'], csrfToken, mtimeMs: st.mtimeMs });
          } else if (httpsPort > 0) {
            candidates.push({ port: httpsPort, protos: ['https', 'http'], csrfToken, mtimeMs: st.mtimeMs });
          }
        } catch {}
      }
    } catch {}
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const c of candidates.slice(0, 8)) {
    for (const proto of c.protos) {
      const ep = { proto, port: c.port, csrfToken: c.csrfToken, discoveredAt: Date.now() };
      try {
        await postLsConnectRpc(ep, 'GetUserStatus', {}, 1500);
        cachedLsEndpoint = ep;
        return ep;
      } catch {}
    }
  }

  cachedLsEndpoint = null;
  return null;
}

const EFFORT_NORM = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'XHigh',
  'extra high': 'XHigh',
  max: 'Max'
};
const EFFORT_SORT_ORDER = ['Minimal', 'Low', 'Medium', 'High', 'XHigh', 'Max'];

function parseBackendDisplayName(displayName) {
  const s = String(displayName || '').trim();
  if (!s) return null;
  // Ignore internal worker aliases such as "Gemini 4 Hydrogen (Orchestrator)"
  if (/\(Orchestrator\)$/i.test(s) && !/^Orchestrator\b/i.test(s)) {
    return null;
  }
  const m = s.match(/^(.*?)\s*\((Minimal|Low|Medium|High|XHigh|Extra\s+High|Max)\)\s*$/i);
  if (m) {
    const rawEff = m[2].replace(/\s+/g, ' ').toLowerCase();
    return {
      base: m[1].trim(),
      effort: EFFORT_NORM[rawEff] || m[2]
    };
  }
  return { base: s, effort: null };
}

async function fetchBackendData(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedBackendPayload && now - cachedBackendAt < 15000) {
    return cachedBackendPayload;
  }

  let ep = await discoverLanguageServerEndpoint(false);
  if (!ep) return cachedBackendPayload;

  try {
    const [modelsRes, quotaRes, userRes] = await Promise.all([
      postLsConnectRpc(ep, 'GetAvailableModels', {}, 3000).catch(() => null),
      postLsConnectRpc(ep, 'RetrieveUserQuotaSummary', { forceRefresh: Boolean(forceRefresh) }, 4500).catch(() => null),
      postLsConnectRpc(ep, 'GetUserStatus', {}, 2500).catch(() => null)
    ]);

    if (!modelsRes && !quotaRes && !userRes) {
      ep = await discoverLanguageServerEndpoint(true);
      if (!ep) return cachedBackendPayload;
    }

    const rawModels = modelsRes?.response?.models || modelsRes?.models || {};
    const familyMap = new Map();

    for (const [, info] of Object.entries(rawModels)) {
      if (!info || typeof info !== 'object' || info.isInternal) continue;
      if (!info.displayName) continue;
      const parsed = parseBackendDisplayName(info.displayName);
      if (!parsed) continue;

      const key = parsed.base.toLowerCase();
      let entry = familyMap.get(key);
      if (!entry) {
        entry = {
          base: parsed.base,
          effortsSet: new Set(),
          maxTokens: Number(info.maxTokens) || 0,
          maxOutputTokens: Number(info.maxOutputTokens) || 0,
          tagTitle: info.tagTitle || '',
          provider: info.modelProvider || '',
          remainingFraction:
            typeof info.quotaInfo?.remainingFraction === 'number' ? info.quotaInfo.remainingFraction : null,
          resetTime: info.quotaInfo?.resetTime || null
        };
        familyMap.set(key, entry);
      }
      if (parsed.effort) {
        entry.effortsSet.add(parsed.effort);
      }
      if (Number(info.maxTokens) > entry.maxTokens) {
        entry.maxTokens = Number(info.maxTokens);
      }
      if (info.tagTitle && !entry.tagTitle) {
        entry.tagTitle = info.tagTitle;
      }
      if (typeof info.quotaInfo?.remainingFraction === 'number') {
        entry.remainingFraction = info.quotaInfo.remainingFraction;
      }
      if (info.quotaInfo?.resetTime && !entry.resetTime) {
        entry.resetTime = info.quotaInfo.resetTime;
      }
    }

    const modelCapabilities = {};
    for (const [key, entry] of familyMap.entries()) {
      const sortedEfforts = Array.from(entry.effortsSet).sort(
        (a, b) => EFFORT_SORT_ORDER.indexOf(a) - EFFORT_SORT_ORDER.indexOf(b)
      );
      // Only expose effort switcher when the model genuinely supports 2 or more distinct effort tiers
      modelCapabilities[key] = {
        base: entry.base,
        supportedEfforts: sortedEfforts.length >= 2 ? sortedEfforts : [],
        singleFixedEffort: sortedEfforts.length === 1 ? sortedEfforts[0] : null,
        maxTokens: entry.maxTokens,
        maxOutputTokens: entry.maxOutputTokens,
        tagTitle: entry.tagTitle,
        remainingFraction: entry.remainingFraction,
        resetTime: entry.resetTime
      };
    }

    const rawQuota = quotaRes?.response || quotaRes || {};
    const quotaGroups = Array.isArray(rawQuota.groups)
      ? rawQuota.groups.map((g) => ({
          displayName: g.displayName || '',
          description: g.description || '',
          buckets: Array.isArray(g.buckets)
            ? g.buckets.map((b) => ({
                bucketId: b.bucketId || '',
                displayName: b.displayName || '',
                description: b.description || '',
                window: b.window || '',
                remainingFraction: typeof b.remainingFraction === 'number' ? b.remainingFraction : null,
                resetTime: b.resetTime || null
              }))
            : []
        }))
      : [];

    const us = userRes?.userStatus || {};
    const account = {
      tierName: us.userTier?.name || us.planStatus?.planInfo?.planName || '',
      upgradeText: us.userTier?.upgradeSubscriptionText || '',
      promptCredits:
        typeof us.planStatus?.availablePromptCredits === 'number' ? us.planStatus.availablePromptCredits : null,
      flowCredits:
        typeof us.planStatus?.availableFlowCredits === 'number' ? us.planStatus.availableFlowCredits : null
    };

    cachedBackendPayload = {
      fetchedAtMs: Date.now(),
      modelCapabilities,
      quota: {
        groups: quotaGroups,
        description: rawQuota.description || ''
      },
      account
    };
    cachedBackendAt = Date.now();
    return cachedBackendPayload;
  } catch {
    return cachedBackendPayload;
  }
}

// ============================================================================
// 2. Channel Endpoints & Cooperative Single-Instance Lock
// ============================================================================
function resolveChannelPaths(singleChannel = 'stable', userCfg = {}) {
  const home = os.homedir();
  const isInsiders = singleChannel === 'insiders';
  const appDirName = isInsiders ? 'Antigravity - Insiders' : 'Antigravity';

  let defaultPortFile;
  if (process.platform === 'darwin') {
    defaultPortFile = path.join(home, 'Library', 'Application Support', appDirName, 'DevToolsActivePort');
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    defaultPortFile = path.join(appData, appDirName, 'DevToolsActivePort');
  } else {
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    defaultPortFile = path.join(xdgConfig, appDirName, 'DevToolsActivePort');
  }

  const dotDir = path.join(home, isInsiders ? '.antigravity-insiders' : '.antigravity');
  const argvPath = path.join(dotDir, 'argv.json');
  let fallbackPort = isInsiders ? 9223 : 9222;
  try {
    if (fs.existsSync(argvPath)) {
      const stripped = fs.readFileSync(argvPath, 'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
      const m = stripped.match(/"remote-debugging-port"\s*:\s*(\d+)/);
      if (m && parseInt(m[1], 10) > 0) fallbackPort = parseInt(m[1], 10);
    }
  } catch {}

  const portFile = getArg('--port-file', userCfg.portFile || defaultPortFile);
  const channelInstalled =
    fs.existsSync(portFile) || fs.existsSync(path.dirname(defaultPortFile)) || fs.existsSync(dotDir);

  return {
    channel: singleChannel,
    portFile,
    fallbackPort: Number(userCfg.fallbackPort) > 0 ? Number(userCfg.fallbackPort) : fallbackPort,
    channelInstalled
  };
}

function resolveActiveEndpoints(channelMode = 'auto', userCfg = {}) {
  if (getArg('--port-file', userCfg.portFile || '')) {
    return [resolveChannelPaths(channelMode === 'insiders' ? 'insiders' : 'stable', userCfg)];
  }
  if (channelMode === 'stable') return [resolveChannelPaths('stable', userCfg)];
  if (channelMode === 'insiders') return [resolveChannelPaths('insiders', userCfg)];
  return [resolveChannelPaths('stable', userCfg), resolveChannelPaths('insiders', userCfg)];
}

const PID_HASH = crypto.createHash('md5').update(ROOT_DIR.toLowerCase()).digest('hex').slice(0, 8);
const PID_FILE = path.join(os.tmpdir(), `ag-periodic-model-daemon-${PID_HASH}.pid`);

if (!RUN_ONCE) {
  try {
    if (fs.existsSync(PID_FILE)) {
      const raw = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
      if (raw && raw.pid && raw.pid !== process.pid && isPidAlive(Number(raw.pid))) {
        try {
          process.kill(Number(raw.pid), 'SIGTERM');
        } catch {}
      }
    }
    fs.writeFileSync(
      PID_FILE,
      JSON.stringify({ pid: process.pid, startedAt: Date.now(), rootDir: ROOT_DIR }),
      'utf8'
    );
  } catch {}
}

function checkPidOwnership() {
  if (RUN_ONCE) return;
  try {
    if (!fs.existsSync(PID_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
    if (raw.stopRequested) process.exit(0);
    if (raw.pid && Number(raw.pid) !== process.pid && isPidAlive(Number(raw.pid))) {
      process.exit(0);
    }
  } catch {}
}

// ============================================================================
// 3. Bundle Builder & CDP Runtime Injection
// ============================================================================
let cachedBundleSig = '';
let cachedInjectScript = '';
let cachedPatchVersion = '';

let activeConfig = {
  enabled: true,
  channel: 'auto',
  allowedOrigins: [
    'http://127.0.0.1',
    'https://127.0.0.1',
    'http://localhost',
    'https://localhost',
    'vscode-file://'
  ],
  endpoints: []
};

async function rebuildBundleIfNeeded() {
  const coreFiles = [path.join(CORE_DIR, 'periodic.css'), path.join(CORE_DIR, 'runtime.js')];
  const userFiles = SAFE_MODE
    ? []
    : [path.join(USER_DIR, 'config.json'), path.join(USER_DIR, 'custom.css'), path.join(USER_DIR, 'custom.js')];

  const sig = [...coreFiles, ...userFiles].map(getFileMtimeSig).join('|') + `|safe:${SAFE_MODE}|cli:${CLI_CHANNEL || ''}`;
  if (sig === cachedBundleSig && cachedInjectScript) {
    return false;
  }

  const backendData = await fetchBackendData(false);

  const userCfg = SAFE_MODE ? {} : readJsonSafe(path.join(USER_DIR, 'config.json'), {});
  const enabled = SAFE_MODE ? true : userCfg.enabled !== false;
  const channel = CLI_CHANNEL || userCfg.channel || 'auto';

  const modules = Object.assign(
    {
      periodicPicker: true,
      keyboardShortcut: true,
      customCss: true,
      customJs: true
    },
    userCfg.modules || {}
  );

  const baseCss = readTextSafe(path.join(CORE_DIR, 'periodic.css'), '');
  const customCss = !SAFE_MODE && modules.customCss !== false ? readTextSafe(path.join(USER_DIR, 'custom.css'), '') : '';
  const customJs = !SAFE_MODE && modules.customJs !== false ? readTextSafe(path.join(USER_DIR, 'custom.js'), '') : '';
  const runtimeTemplate = readTextSafe(path.join(CORE_DIR, 'runtime.js'), '');

  const cleanConfig = {
    enabled,
    channel,
    periodicTheme: userCfg.periodicTheme || 'auto',
    closeOnSelect: userCfg.closeOnSelect !== undefined ? userCfg.closeOnSelect : 'effort',
    shortcut: userCfg.shortcut !== undefined ? userCfg.shortcut : 'Alt+M',
    defaultSeedElements: Array.isArray(userCfg.defaultSeedElements)
      ? userCfg.defaultSeedElements
      : ['Hydrogen', 'Carbon', 'Neon', 'Argon'],
    defaultSeedOtherModels: Array.isArray(userCfg.defaultSeedOtherModels)
      ? userCfg.defaultSeedOtherModels
      : [],
    customElementMappings:
      userCfg.customElementMappings && typeof userCfg.customElementMappings === 'object'
        ? userCfg.customElementMappings
        : {},
    extraOtherModels: Array.isArray(userCfg.extraOtherModels) ? userCfg.extraOtherModels : []
  };

  const hash = crypto
    .createHash('sha256')
    .update(String(enabled))
    .update(runtimeTemplate)
    .update(baseCss)
    .update(customCss)
    .update(customJs)
    .update(JSON.stringify({ cleanConfig, modules }))
    .digest('hex')
    .slice(0, 8);

  cachedPatchVersion = `${BASE_VERSION}-${hash}`;

  const bootPayload = {
    version: cachedPatchVersion,
    platform: process.platform,
    enabled,
    cssText: baseCss,
    customCss,
    modules,
    config: cleanConfig,
    backendData: backendData || null,
    customJs
  };

  cachedInjectScript = runtimeTemplate.replace(
    '})(__AG_PT_BOOT_PAYLOAD__);',
    () => `})(${JSON.stringify(bootPayload)});`
  );
  cachedBundleSig = sig;

  const defaultOrigins = [
    'http://127.0.0.1',
    'https://127.0.0.1',
    'http://localhost',
    'https://localhost',
    'vscode-file://'
  ];

  activeConfig = {
    enabled,
    channel,
    allowedOrigins: Array.isArray(userCfg.allowedOrigins)
      ? Array.from(new Set([...defaultOrigins, ...userCfg.allowedOrigins]))
      : defaultOrigins,
    endpoints: resolveActiveEndpoints(channel, userCfg)
  };

  return true;
}

const HOST_PROBE_EXPRESSION = `(function() {
  try {
    if (window.top !== window) return 'non_host';
    if (window.location && window.location.protocol === 'vscode-file:') return 'host';
    if (window.__APP_CONFIG__ && window.__APP_CONFIG__.productName === 'antigravity') return 'host';
    if (window.electronNative && (typeof window.electronNative.setTitleBarOverlay === 'function' || typeof window.electronNative.getZoomLevel === 'function')) return 'host';
    if (typeof document !== 'undefined' && document.querySelector) {
      if (document.querySelector('link[href*="/jetbox.css"], body[data-agy-theme], body[data-newux-theme], [id="antigravity.agentSidePanelInputBox"]')) return 'host';
      if (document.readyState === 'complete') return 'non_host';
    }
    return 'pending';
  } catch (e) {
    return 'non_host';
  }
})()`;

function readPortFromFile(portFile) {
  try {
    if (!portFile || !fs.existsSync(portFile)) return null;
    const lines = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
    const p = parseInt(lines[0], 10);
    return Number.isInteger(p) && p > 0 && p < 65536 ? p : null;
  } catch {
    return null;
  }
}

function fetchTargets(port) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: '127.0.0.1',
        port,
        path: '/json/list',
        timeout: 1200
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve([]);
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve(Array.isArray(parsed) ? parsed : []);
          } catch {
            resolve([]);
          }
        });
      }
    );
    req.on('error', () => resolve([]));
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
  });
}

function isAllowedOrigin(urlStr) {
  const u = String(urlStr || '');
  return activeConfig.allowedOrigins.some((prefix) => u.startsWith(prefix));
}

const attachedTargets = new Map();
const skippedTargets = new Map();

function attachTarget(target, endpoint) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const timeout = setTimeout(() => finish(false), 4500);

    try {
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      let msgId = 0;
      const pending = new Map();
      let evalScriptId = null;
      let hostConfirmed = false;

      const send = (method, params = {}) =>
        new Promise((res) => {
          if (ws.readyState !== WebSocket.OPEN) {
            res(null);
            return;
          }
          const id = ++msgId;
          const timer = setTimeout(() => {
            pending.delete(id);
            res(null);
          }, 3000);
          pending.set(id, (msg) => {
            clearTimeout(timer);
            res(msg);
          });
          ws.send(JSON.stringify({ id, method, params }));
        });

      const pushBackendData = async (forceRefresh = false) => {
        const data = await fetchBackendData(forceRefresh);
        if (!data || ws.readyState !== WebSocket.OPEN) return;
        await send('Runtime.evaluate', {
          expression: `window.__ag_pt_receive_backend && window.__ag_pt_receive_backend(${JSON.stringify(data)})`,
          returnByValue: false
        });
      };

      const updateNewDocScript = async () => {
        if (evalScriptId) {
          try {
            await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: evalScriptId });
          } catch {}
          evalScriptId = null;
        }
        if (activeConfig.enabled && cachedInjectScript) {
          const added = await send('Page.addScriptToEvaluateOnNewDocument', {
            source: cachedInjectScript
          });
          evalScriptId = added?.result?.identifier || null;
        }
      };

      const inject = async () => {
        if (!cachedInjectScript) return false;
        const res = await send('Runtime.evaluate', {
          expression: cachedInjectScript,
          returnByValue: false
        });
        const ok = Boolean(res && !res.error && !res.result?.exceptionDetails);
        if (ok && activeConfig.enabled) {
          await pushBackendData(false);
        }
        return ok;
      };

      const checkAndInject = async () => {
        const res = await send('Runtime.evaluate', {
          expression: `({
            injected: window.__ag_pt_version === ${JSON.stringify(cachedPatchVersion)} && (${JSON.stringify(!activeConfig.enabled)} || window.__ag_pt_ready === true),
            kind: ${HOST_PROBE_EXPRESSION}
          })`,
          returnByValue: true
        });
        const val = res?.result?.result?.value;
        if (!val || val.kind === 'non_host') {
          skippedTargets.set(target.id, target.url);
          try {
            ws.close();
          } catch {}
          return;
        }
        if (val.kind === 'host' && !val.injected) {
          await inject();
        }
      };

      ws.addEventListener('open', async () => {
        await send('Runtime.enable');
        const probeRes = await send('Runtime.evaluate', {
          expression: HOST_PROBE_EXPRESSION,
          returnByValue: true
        });
        const kind = probeRes?.result?.result?.value;
        if (kind === 'non_host') {
          skippedTargets.set(target.id, target.url);
          clearTimeout(timeout);
          try {
            ws.close();
          } catch {}
          finish(false);
          return;
        }

        hostConfirmed = true;
        await send('Page.enable');
        await send('Runtime.addBinding', { name: '__agPtRequestBackend' });
        await updateNewDocScript();
        const ok = await inject();
        clearTimeout(timeout);
        console.log(
          `[PeriodicModelDaemon] Injected target ${target.id} (${target.title || 'Antigravity'}) [${endpoint.channel}]`
        );
        finish(ok);
      });

      ws.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.id && pending.has(msg.id)) {
            const cb = pending.get(msg.id);
            pending.delete(msg.id);
            cb(msg);
            return;
          }
          if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === '__agPtRequestBackend') {
            let force = false;
            try {
              const p = JSON.parse(msg.params.payload || '{}');
              force = Boolean(p.forceRefresh);
            } catch {}
            void pushBackendData(force);
            return;
          }
          if (
            hostConfirmed &&
            (msg.method === 'Page.frameNavigated' ||
              msg.method === 'Page.domContentEventFired' ||
              msg.method === 'Page.loadEventFired')
          ) {
            if (!msg.params?.frame?.parentId) {
              setTimeout(() => {
                void checkAndInject();
              }, 120);
            }
          }
        } catch {}
      });

      const onClose = () => {
        clearTimeout(timeout);
        for (const [, cb] of pending) cb(null);
        pending.clear();
        if (attachedTargets.get(target.id)?.ws === ws) {
          attachedTargets.delete(target.id);
        }
        finish(false);
      };

      ws.addEventListener('close', onClose);
      ws.addEventListener('error', onClose);

      attachedTargets.set(target.id, {
        ws,
        get hostConfirmed() {
          return hostConfirmed;
        },
        updateNewDocScript,
        inject,
        checkAndInject,
        pushBackendData
      });
    } catch {
      clearTimeout(timeout);
      finish(false);
    }
  });
}

let isSyncing = false;
let syncTick = 0;
const fallbackBackoff = new Map();

async function sync() {
  checkPidOwnership();
  if (isSyncing) return;
  isSyncing = true;
  syncTick = (syncTick + 1) % 6000;
  try {
    const bundleChanged = await rebuildBundleIfNeeded();
    const shouldHeartbeat = bundleChanged || syncTick % 6 === 1;
    const shouldRefreshQuota = syncTick % 12 === 1;
    const activeIds = new Set();
    const probedPorts = new Set();
    const now = Date.now();

    for (const ep of activeConfig.endpoints) {
      const port = readPortFromFile(ep.portFile);
      let targets = [];
      if (port && !probedPorts.has(port)) {
        probedPorts.add(port);
        targets = await fetchTargets(port);
      }
      if (
        targets.length === 0 &&
        ep.channelInstalled &&
        ep.fallbackPort &&
        !probedPorts.has(ep.fallbackPort) &&
        (RUN_ONCE || now >= (fallbackBackoff.get(ep.fallbackPort) || 0))
      ) {
        probedPorts.add(ep.fallbackPort);
        targets = await fetchTargets(ep.fallbackPort);
        if (targets.length === 0) fallbackBackoff.set(ep.fallbackPort, now + 10000);
        else fallbackBackoff.delete(ep.fallbackPort);
      }

      const pages = targets.filter(
        (t) =>
          t.type === 'page' &&
          t.webSocketDebuggerUrl &&
          !String(t.url || '').startsWith('devtools://') &&
          !String(t.title || '').includes('Launchpad') &&
          isAllowedOrigin(t.url) &&
          skippedTargets.get(t.id) !== t.url
      );

      const tasks = [];
      for (const p of pages) {
        activeIds.add(p.id);
        if (!attachedTargets.has(p.id)) {
          tasks.push(attachTarget(p, ep));
        } else {
          const entry = attachedTargets.get(p.id);
          if (entry.hostConfirmed) {
            if (bundleChanged) await entry.updateNewDocScript();
            if (bundleChanged) await entry.inject();
            else {
              if (shouldHeartbeat) await entry.checkAndInject();
              if (shouldRefreshQuota) await entry.pushBackendData(false);
            }
          }
        }
      }
      if (tasks.length > 0) {
        await Promise.allSettled(tasks);
      }
    }

    for (const [id, entry] of attachedTargets.entries()) {
      if (!activeIds.has(id)) {
        try {
          entry.ws.close();
        } catch {}
        attachedTargets.delete(id);
      }
    }
  } finally {
    isSyncing = false;
  }
}

await rebuildBundleIfNeeded();
console.log(
  `[PeriodicModelDaemon] Started (${cachedPatchVersion}) | channel=${activeConfig.channel} | safeMode=${SAFE_MODE}`
);

await sync();
if (RUN_ONCE) {
  for (const [, entry] of attachedTargets.entries()) {
    try {
      entry.ws.close();
    } catch {}
  }
  process.exit(0);
} else {
  setInterval(sync, 2500);
}
