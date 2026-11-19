#!/usr/bin/env node
/**
 * Antigravity Periodic Model Picker · Cross-Platform Lifecycle CLI (install.mjs)
 *
 * Commands:
 *   node install.mjs doctor         [--channel auto|stable|insiders] [--target-dir <dir>]
 *   node install.mjs install        [--channel auto|stable|insiders] [--sync-user] [--target-dir <dir>]
 *   node install.mjs verify         [--safe-mode] [--channel auto|stable|insiders] [--target-dir <dir>]
 *   node install.mjs rollback       [--target-dir <dir>]
 *   node install.mjs uninstall      [--target-dir <dir>]
 *   node install.mjs build-manifest
 *   node install.mjs pack
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { execSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACKAGE_NAME = 'antigravity-periodic-model-picker';
const PACKAGE_VERSION = '1.0';

const args = process.argv.slice(2);
const subcommand = args.find((a) => !a.startsWith('-')) || 'help';
const hasFlag = (f) => args.some((a) => a === f || a.startsWith(f + '='));
function getArg(flag, fallback = null) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) return args[i + 1];
    if (args[i].startsWith(flag + '=')) return args[i].slice(flag.length + 1);
  }
  return fallback;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function canonicalPath(p) {
  const resolved = path.resolve(p);
  try {
    return fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function isSameTargetPath(a, b) {
  const pa = canonicalPath(a);
  const pb = canonicalPath(b);
  return process.platform === 'win32' || process.platform === 'darwin'
    ? pa.toLowerCase() === pb.toLowerCase()
    : pa === pb;
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function resolveGlobalInstallDir() {
  return path.join(os.homedir(), '.gemini', 'config', 'plugins', 'periodic-model-picker');
}

function resolveDefaultTargetDir() {
  const installed = resolveGlobalInstallDir();
  if (fs.existsSync(path.join(installed, 'core', 'daemon.mjs'))) {
    return installed;
  }
  const legacyDir = path.join(os.homedir(), '.gemini', 'antigravity', 'periodic-model-picker');
  if (fs.existsSync(path.join(legacyDir, 'core', 'daemon.mjs'))) {
    return legacyDir;
  }
  return __dirname;
}

function buildManifest(baseDir = __dirname) {
  const coreDir = path.join(baseDir, 'core');
  const files = ['daemon.mjs', 'runtime.js', 'periodic.css'];
  const entries = {};
  for (const name of files) {
    const p = path.join(coreDir, name);
    if (!fs.existsSync(p)) {
      throw new Error(`Missing core file: ${p}`);
    }
    const stat = fs.statSync(p);
    entries[name] = {
      sha256: sha256File(p),
      bytes: stat.size
    };
  }
  const manifest = {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    minNodeVersion: '22.0.0',
    files: entries
  };
  fs.writeFileSync(path.join(coreDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}

function verifyCoreIntegrity(baseDir = __dirname) {
  const coreDir = path.join(baseDir, 'core');
  const manifestPath = path.join(coreDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, reason: 'missing manifest.json', modified: [] };
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const modified = [];
  for (const [name, meta] of Object.entries(manifest.files || {})) {
    const p = path.join(coreDir, name);
    if (!fs.existsSync(p)) {
      modified.push({ file: name, status: 'missing' });
      continue;
    }
    let actualHash = sha256File(p);
    if (actualHash !== meta.sha256) {
      try {
        const rawText = fs.readFileSync(p, 'utf8');
        if (rawText.includes('\r\n')) {
          const lfText = rawText.replace(/\r\n/g, '\n');
          const lfHash = crypto.createHash('sha256').update(Buffer.from(lfText, 'utf8')).digest('hex');
          if (lfHash === meta.sha256) {
            fs.writeFileSync(p, lfText, 'utf8');
            actualHash = lfHash;
          }
        }
      } catch {}
    }
    if (actualHash !== meta.sha256) {
      modified.push({ file: name, status: 'modified', expected: meta.sha256, actual: actualHash });
    }
  }
  return { ok: modified.length === 0, manifest, modified };
}

function buildDistZip(baseDir = __dirname) {
  const manifest = buildManifest(baseDir);
  const distDir = path.join(baseDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const zipName = `${manifest.name}-v${manifest.version}.zip`;
  const zipPath = path.join(distDir, zipName);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  const includeItems = [
    'plugin.json',
    'SKILL.md',
    'README.md',
    'README.zh-CN.md',
    'install.mjs',
    'assets',
    'skills',
    'core',
    'user',
    'preview'
  ].filter((item) => fs.existsSync(path.join(baseDir, item)));

  const skipNames = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
  const entriesToPack = [];
  const collect = (relPosix) => {
    const full = path.join(baseDir, ...relPosix.split('/'));
    if (!fs.existsSync(full)) return;
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      for (const child of fs.readdirSync(full).sort()) {
        if (skipNames.has(child)) continue;
        collect(`${relPosix}/${child}`);
      }
    } else if (st.isFile()) {
      entriesToPack.push({ abs: full, entry: relPosix });
    }
  };
  for (const it of includeItems) collect(it.replace(/\\/g, '/'));

  if (process.platform === 'win32') {
    const listTmpPath = path.join(os.tmpdir(), `ag-pt-pack-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(listTmpPath, JSON.stringify(entriesToPack), 'utf8');
    try {
      const psScript = [
        '$ErrorActionPreference = "Stop"',
        'Add-Type -AssemblyName System.IO.Compression',
        'Add-Type -AssemblyName System.IO.Compression.FileSystem',
        `$zipPath = '${zipPath.replace(/'/g, "''")}'`,
        `$listPath = '${listTmpPath.replace(/'/g, "''")}'`,
        '$parsed = Get-Content -LiteralPath $listPath -Raw -Encoding UTF8 | ConvertFrom-Json',
        '$items = @(foreach ($x in $parsed) { if ($null -ne $x) { $x } })',
        '$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)',
        'try {',
        '  foreach ($it in $items) {',
        '    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, [string]$it.abs, [string]$it.entry, [System.IO.Compression.CompressionLevel]::Optimal)',
        '  }',
        '} finally { $zip.Dispose() }'
      ].join('; ');
      const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
        cwd: baseDir,
        encoding: 'utf8',
        windowsHide: true
      });
      if (r.status !== 0) {
        throw new Error(`ZipArchive pack failed: ${(r.stderr || r.stdout || '').trim()}`);
      }
    } finally {
      try {
        if (fs.existsSync(listTmpPath)) fs.unlinkSync(listTmpPath);
      } catch {}
    }
  } else {
    const r = spawnSync('zip', ['-q', zipPath, ...entriesToPack.map((e) => e.entry)], {
      cwd: baseDir,
      stdio: 'inherit'
    });
    if (r.status !== 0) throw new Error('zip command failed');
  }

  return { zipPath, version: manifest.version, filesPacked: entriesToPack.length };
}

function detectEnvironment(channel = 'auto') {
  const nodeVer = process.versions.node;
  const [major] = nodeVer.split('.').map((n) => parseInt(n, 10));
  const nodeBasicOk = major >= 22;
  const home = os.homedir();

  const checkSingle = (ch) => {
    const isInsiders = ch === 'insiders';
    const appDirName = isInsiders ? 'Antigravity - Insiders' : 'Antigravity';
    let portFile;
    if (process.platform === 'darwin') {
      portFile = path.join(home, 'Library', 'Application Support', appDirName, 'DevToolsActivePort');
    } else if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      portFile = path.join(appData, appDirName, 'DevToolsActivePort');
    } else {
      const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
      portFile = path.join(xdg, appDirName, 'DevToolsActivePort');
    }
    return {
      channel: ch,
      portFile,
      portFileExists: fs.existsSync(portFile),
      fallbackPort: isInsiders ? 9223 : 9222
    };
  };

  return {
    nodeVer,
    nodeBasicOk,
    platform: process.platform,
    channel,
    stable: checkSingle('stable'),
    insiders: checkSingle('insiders')
  };
}

function fetchJsonTargets(port) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/json/list', timeout: 1200 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve([]);
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(Array.isArray(parsed) ? parsed : []);
        } catch {
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
  });
}

async function inspectLiveWindow(env) {
  const candidates = [env.stable, env.insiders];
  for (const c of candidates) {
    const ports = [];
    if (c.portFileExists) {
      try {
        const p = parseInt(fs.readFileSync(c.portFile, 'utf8').trim().split(/\r?\n/)[0], 10);
        if (p > 0) ports.push(p);
      } catch {}
    }
    ports.push(c.fallbackPort);

    for (const port of ports) {
      const targets = await fetchJsonTargets(port);
      const pages = targets.filter(
        (t) =>
          t.type === 'page' &&
          t.webSocketDebuggerUrl &&
          !String(t.url || '').startsWith('devtools://') &&
          !String(t.title || '').includes('Launchpad')
      );
      if (pages.length === 0) continue;

      for (const page of pages) {
        const evalResult = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(null), 2000);
          try {
            const ws = new WebSocket(page.webSocketDebuggerUrl);
            ws.addEventListener('open', () => {
              ws.send(
                JSON.stringify({
                  id: 1,
                  method: 'Runtime.evaluate',
                  params: {
                    expression: `({
                      ready: window.__ag_pt_ready === true,
                      version: window.__ag_pt_version || null,
                      state: window.__ag_pt_api ? window.__ag_pt_api.getState() : null
                    })`,
                    returnByValue: true
                  }
                })
              );
            });
            ws.addEventListener('message', (ev) => {
              try {
                const msg = JSON.parse(String(ev.data));
                if (msg.id === 1) {
                  clearTimeout(timer);
                  ws.close();
                  resolve(msg?.result?.result?.value || null);
                }
              } catch {}
            });
            ws.addEventListener('error', () => {
              clearTimeout(timer);
              resolve(null);
            });
          } catch {
            clearTimeout(timer);
            resolve(null);
          }
        });

        if (evalResult && (evalResult.ready || evalResult.version)) {
          return {
            reachable: true,
            port,
            channel: c.channel,
            pages: pages.length,
            state: evalResult
          };
        }
      }
      return { reachable: true, port, channel: c.channel, pages: pages.length, state: null };
    }
  }
  return { reachable: false, pages: 0, state: null };
}

function stopRunningPeriodicDaemon() {
  const tmpDir = os.tmpdir();
  try {
    for (const f of fs.readdirSync(tmpDir)) {
      if (!f.startsWith('ag-periodic-model-daemon-') || !f.endsWith('.pid')) continue;
      const pFile = path.join(tmpDir, f);
      try {
        const data = JSON.parse(fs.readFileSync(pFile, 'utf8'));
        fs.writeFileSync(pFile, JSON.stringify({ ...data, stopRequested: true }), 'utf8');
        if (data && Number(data.pid) > 0) {
          try {
            process.kill(Number(data.pid), 'SIGTERM');
          } catch {}
        }
      } catch {}
      try {
        fs.unlinkSync(pFile);
      } catch {}
    }
  } catch {}
}

function ensureArgvRemoteDebugging(channel = 'auto') {
  const home = os.homedir();
  const targets =
    channel === 'insiders'
      ? [{ dir: '.antigravity-insiders', port: 9223 }]
      : channel === 'stable'
      ? [{ dir: '.antigravity', port: 9222 }]
      : [
          { dir: '.antigravity', port: 9222 },
          { dir: '.antigravity-insiders', port: 9223 }
        ];
  const updated = [];
  for (const t of targets) {
    const dotDir = path.join(home, t.dir);
    if (!fs.existsSync(dotDir)) continue;
    const argvPath = path.join(dotDir, 'argv.json');
    try {
      if (!fs.existsSync(argvPath)) {
        fs.writeFileSync(argvPath, JSON.stringify({ 'remote-debugging-port': t.port }, null, 2) + '\n', 'utf8');
        updated.push(argvPath);
      } else {
        const raw = fs.readFileSync(argvPath, 'utf8');
        if (!/"remote-debugging-port"\s*:/.test(raw)) {
          const idx = raw.lastIndexOf('}');
          if (idx !== -1) {
            const before = raw.slice(0, idx).trimEnd();
            const comma = before.endsWith('{') || before.endsWith(',') ? '' : ',';
            const next = `${before}${comma}\n\t"remote-debugging-port": ${t.port}\n}\n`;
            fs.writeFileSync(argvPath, next, 'utf8');
            updated.push(argvPath);
          }
        }
      }
    } catch {}
  }
  return { updated };
}

function registerSystemService(targetDir, wrapperDaemon) {
  const home = os.homedir();

  if (process.platform === 'darwin') {
    const launchDir = path.join(home, 'Library', 'LaunchAgents');
    fs.mkdirSync(launchDir, { recursive: true });
    const label = 'com.antigravity.periodicmodel';
    const plistPath = path.join(launchDir, `${label}.plist`);
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${wrapperDaemon}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/antigravity-periodic-model.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/antigravity-periodic-model.err</string>
</dict>
</plist>
`;
    fs.writeFileSync(plistPath, plist, 'utf8');
    const uid = process.getuid ? process.getuid() : 501;
    try {
      execSync(`launchctl bootout gui/${uid}/${label} 2>/dev/null || true`);
      execSync(`launchctl bootstrap gui/${uid} "${plistPath}" 2>/dev/null || launchctl load -w "${plistPath}"`);
    } catch {}
    return { platform: 'darwin', method: 'LaunchAgent', serviceFile: plistPath };
  }

  if (process.platform === 'linux') {
    const sysDir = path.join(home, '.config', 'systemd', 'user');
    fs.mkdirSync(sysDir, { recursive: true });
    const servicePath = path.join(sysDir, 'antigravity-periodic-model.service');
    const unit = `[Unit]
Description=Antigravity Periodic Table Model Picker Daemon
After=default.target

[Service]
ExecStart="${process.execPath}" "${wrapperDaemon}"
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
`;
    fs.writeFileSync(servicePath, unit, 'utf8');
    try {
      execSync('systemctl --user daemon-reload && systemctl --user enable --now antigravity-periodic-model.service');
    } catch {}
    return { platform: 'linux', method: 'systemd-user', serviceFile: servicePath };
  }

  if (process.platform === 'win32') {
    const localVbs = path.join(targetDir, 'AntigravityPeriodicModelDaemon.vbs');
    const escVbs = (s) => String(s).replace(/"/g, '""');
    const vbsContent = [
      'Set WshShell = CreateObject("WScript.Shell")',
      `WshShell.Run """${escVbs(process.execPath)}"" ""${escVbs(wrapperDaemon)}""", 0, False`
    ].join('\r\n');
    fs.writeFileSync(localVbs, vbsContent, 'utf16le');

    let method = 'detached-spawn';
    try {
      const tr = `wscript.exe //B //NoLogo "${localVbs}"`;
      const createRes = spawnSync(
        'schtasks',
        ['/Create', '/TN', 'AntigravityPeriodicModelDaemon', '/SC', 'ONLOGON', '/TR', tr, '/F'],
        { stdio: 'ignore', windowsHide: true, timeout: 6000 }
      );
      if (createRes.status === 0) {
        method = 'schtasks';
        spawnSync('schtasks', ['/Run', '/TN', 'AntigravityPeriodicModelDaemon'], {
          stdio: 'ignore',
          windowsHide: true,
          timeout: 5000
        });
      }
    } catch {}

    if (method !== 'schtasks') {
      try {
        spawnSync(
          'reg',
          [
            'add',
            'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
            '/v',
            'AntigravityPeriodicModelDaemon',
            '/t',
            'REG_SZ',
            '/d',
            `wscript.exe //B //NoLogo "${localVbs}"`,
            '/f'
          ],
          { stdio: 'ignore', windowsHide: true }
        );
        method = 'registry-run';
      } catch {}
    }

    try {
      const child = spawn(process.execPath, [wrapperDaemon], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();
    } catch {}

    return { platform: 'win32', method, serviceFile: localVbs };
  }

  return { platform: process.platform, method: 'none' };
}

async function runDoctor() {
  const channel = getArg('--channel', 'auto');
  const targetDir = path.resolve(getArg('--target-dir', resolveDefaultTargetDir()));
  const env = detectEnvironment(channel);
  const integrity = verifyCoreIntegrity(targetDir);
  const live = await inspectLiveWindow(env);

  console.log(
    JSON.stringify(
      {
        ok: env.nodeBasicOk && integrity.ok,
        targetDir,
        environment: env,
        coreIntegrity: integrity,
        liveWindow: live
      },
      null,
      2
    )
  );
}

async function runInstall() {
  const channel = getArg('--channel', 'auto');
  const syncUser = hasFlag('--sync-user');
  const defaultTarget = resolveGlobalInstallDir();
  const targetDir = path.resolve(getArg('--target-dir', defaultTarget));
  const isSandbox = hasFlag('--target-dir') && !isSameTargetPath(targetDir, defaultTarget);

  const env = detectEnvironment(channel);
  if (!env.nodeBasicOk) {
    console.error(`[ERROR] Node.js >= 22.0.0 is required (current: ${env.nodeVer}).`);
    process.exit(1);
  }

  buildManifest(__dirname);

  const srcCore = path.join(__dirname, 'core');
  const srcUser = path.join(__dirname, 'user');
  const targetCore = path.join(targetDir, 'core');
  const targetPrev = path.join(targetDir, 'core.prev');
  const backupsDir = path.join(targetDir, 'backups');
  const targetUser = path.join(targetDir, 'user');

  let backupCreated = null;
  if (!isSameTargetPath(__dirname, targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    const srcManifest = path.join(srcCore, 'manifest.json');
    const dstManifest = path.join(targetCore, 'manifest.json');
    const shouldBackup =
      fs.existsSync(targetCore) &&
      (!fs.existsSync(dstManifest) || sha256File(srcManifest) !== sha256File(dstManifest));

    if (shouldBackup) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const stamped = path.join(backupsDir, stamp);
      copyDirRecursive(targetCore, stamped);
      fs.rmSync(targetPrev, { recursive: true, force: true });
      copyDirRecursive(targetCore, targetPrev);
      backupCreated = stamped;
    }

    fs.rmSync(targetCore, { recursive: true, force: true });
    copyDirRecursive(srcCore, targetCore);

    fs.mkdirSync(targetUser, { recursive: true });
    for (const f of ['config.json', 'custom.css', 'custom.js']) {
      const s = path.join(srcUser, f);
      const d = path.join(targetUser, f);
      if (fs.existsSync(s) && (!fs.existsSync(d) || syncUser)) {
        fs.copyFileSync(s, d);
      }
    }

    // Migrate older default config values
    const existingUserCfgPath = path.join(targetUser, 'config.json');
    if (fs.existsSync(existingUserCfgPath) && !syncUser) {
      try {
        const parsedCfg = JSON.parse(fs.readFileSync(existingUserCfgPath, 'utf8').replace(/^\uFEFF/, ''));
        if (parsedCfg && typeof parsedCfg === 'object') {
          let changed = false;
          if (!parsedCfg.configVersion) {
            parsedCfg.configVersion = 2;
            if (parsedCfg.periodicTheme === 'dark') {
              parsedCfg.periodicTheme = 'auto';
            }
            if (Array.isArray(parsedCfg.defaultSeedElements) && !parsedCfg.defaultSeedElements.includes('Neon')) {
              parsedCfg.defaultSeedElements = ['Hydrogen', 'Carbon', 'Neon', 'Argon'];
            }
            parsedCfg.defaultSeedOtherModels = [];
            changed = true;
          }
          if (parsedCfg.configVersion < 3) {
            parsedCfg.configVersion = 3;
            if (parsedCfg.closeOnSelect === true || parsedCfg.closeOnSelect === undefined) {
              parsedCfg.closeOnSelect = 'effort';
            }
            changed = true;
          }
          if (changed) {
            fs.writeFileSync(existingUserCfgPath, JSON.stringify(parsedCfg, null, 2) + '\n', 'utf8');
          }
        }
      } catch {}
    }

    for (const doc of ['install.mjs', 'SKILL.md', 'README.md', 'README.zh-CN.md', 'plugin.json']) {
      const s = path.join(__dirname, doc);
      const d = path.join(targetDir, doc);
      if (fs.existsSync(s)) fs.copyFileSync(s, d);
    }
    for (const sub of ['assets', 'skills', 'preview']) {
      const s = path.join(__dirname, sub);
      const d = path.join(targetDir, sub);
      if (fs.existsSync(s)) copyDirRecursive(s, d);
    }
  }

  const realDaemon = path.join(targetCore, 'daemon.mjs');
  let argvStatus = { skipped: true };
  let serviceInfo = { skipped: true };

  if (!isSandbox) {
    argvStatus = ensureArgvRemoteDebugging(channel);
    const scriptsDir = path.join(os.homedir(), '.gemini', 'antigravity', 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    const wrapperDaemon = path.join(scriptsDir, 'antigravity-periodic-model-daemon.mjs');
    const daemonUrl = pathToFileURL(realDaemon).href;
    fs.writeFileSync(
      wrapperDaemon,
      `#!/usr/bin/env node\n// Auto-generated daemon entry -> ${realDaemon}\nawait import(${JSON.stringify(daemonUrl)});\n`,
      { encoding: 'utf8', mode: 0o755 }
    );
    serviceInfo = registerSystemService(targetDir, wrapperDaemon);
    spawnSync(process.execPath, [realDaemon, '--once'], { stdio: 'inherit' });
  }

  const live = isSandbox ? { skipped: true } : await inspectLiveWindow(env);
  console.log(
    '\n[Install Complete]',
    JSON.stringify(
      {
        ok: true,
        targetDir,
        backupCreated,
        argvStatus,
        serviceInfo,
        liveWindow: live
      },
      null,
      2
    )
  );
}

async function runVerify() {
  const safeMode = hasFlag('--safe-mode');
  const channel = getArg('--channel', 'auto');
  const targetDir = path.resolve(getArg('--target-dir', resolveDefaultTargetDir()));
  const daemonPath = path.join(targetDir, 'core', 'daemon.mjs');

  const dArgs = [daemonPath, '--once'];
  if (safeMode) dArgs.push('--safe-mode');
  if (channel && channel !== 'auto') dArgs.push('--channel', channel);

  spawnSync(process.execPath, dArgs, { stdio: 'inherit' });
  const env = detectEnvironment(channel);
  const live = await inspectLiveWindow(env);
  console.log(
    JSON.stringify(
      {
        ok: Boolean(live.reachable && (live.state?.ready || live.pages === 0)),
        version: live.state?.version || null,
        pickerReady: Boolean(live.state?.ready),
        safeMode,
        live
      },
      null,
      2
    )
  );
}

async function runRollback() {
  const targetDir = path.resolve(getArg('--target-dir', resolveDefaultTargetDir()));
  const targetCore = path.join(targetDir, 'core');
  const targetPrev = path.join(targetDir, 'core.prev');
  const backupsDir = path.join(targetDir, 'backups');

  let restoreSource = null;
  if (fs.existsSync(path.join(targetPrev, 'daemon.mjs'))) {
    restoreSource = targetPrev;
  } else if (fs.existsSync(backupsDir)) {
    const stamps = fs
      .readdirSync(backupsDir)
      .filter((n) => fs.existsSync(path.join(backupsDir, n, 'daemon.mjs')))
      .sort()
      .reverse();
    if (stamps.length > 0) restoreSource = path.join(backupsDir, stamps[0]);
  }
  if (!restoreSource) {
    console.error(`[ERROR] No backup found in ${targetPrev} or ${backupsDir}`);
    process.exit(1);
  }

  fs.rmSync(targetCore, { recursive: true, force: true });
  copyDirRecursive(restoreSource, targetCore);
  spawnSync(process.execPath, [path.join(targetCore, 'daemon.mjs'), '--once'], { stdio: 'inherit' });
  console.log(JSON.stringify({ ok: true, restoredFrom: restoreSource, restoredTo: targetCore }, null, 2));
}

async function runUninstall() {
  const home = os.homedir();
  const targetDir = path.resolve(getArg('--target-dir', resolveDefaultTargetDir()));
  const userConfigPath = path.join(targetDir, 'user', 'config.json');
  const realDaemon = path.join(targetDir, 'core', 'daemon.mjs');

  if (process.platform === 'darwin') {
    const uid = process.getuid ? process.getuid() : 501;
    const plist = path.join(home, 'Library', 'LaunchAgents', 'com.antigravity.periodicmodel.plist');
    try {
      execSync(`launchctl bootout gui/${uid}/com.antigravity.periodicmodel 2>/dev/null || true`);
      if (fs.existsSync(plist)) fs.unlinkSync(plist);
    } catch {}
  } else if (process.platform === 'linux') {
    try {
      execSync('systemctl --user disable --now antigravity-periodic-model.service 2>/dev/null || true');
      const unit = path.join(home, '.config', 'systemd', 'user', 'antigravity-periodic-model.service');
      if (fs.existsSync(unit)) fs.unlinkSync(unit);
      execSync('systemctl --user daemon-reload 2>/dev/null || true');
    } catch {}
  } else if (process.platform === 'win32') {
    try {
      spawnSync('schtasks', ['/Delete', '/TN', 'AntigravityPeriodicModelDaemon', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
    } catch {}
    try {
      spawnSync(
        'reg',
        ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'AntigravityPeriodicModelDaemon', '/f'],
        { stdio: 'ignore', windowsHide: true }
      );
    } catch {}
    const localVbs = path.join(targetDir, 'AntigravityPeriodicModelDaemon.vbs');
    try {
      if (fs.existsSync(localVbs)) fs.unlinkSync(localVbs);
    } catch {}
  }

  stopRunningPeriodicDaemon();

  if (fs.existsSync(userConfigPath) && fs.existsSync(realDaemon)) {
    try {
      const origRaw = fs.readFileSync(userConfigPath, 'utf8');
      const cfg = JSON.parse(origRaw.replace(/^\uFEFF/, ''));
      cfg.enabled = false;
      fs.writeFileSync(userConfigPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
      spawnSync(process.execPath, [realDaemon, '--once'], { stdio: 'ignore', windowsHide: true });
      fs.writeFileSync(userConfigPath, origRaw, 'utf8');
    } catch {}
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        stoppedDaemon: true,
        preservedUserConfig: userConfigPath
      },
      null,
      2
    )
  );
}

switch (subcommand) {
  case 'build-manifest': {
    const m = buildManifest(__dirname);
    console.log('Built core/manifest.json:', m.version, 'files:', Object.keys(m.files).length);
    break;
  }
  case 'pack': {
    const p = buildDistZip(__dirname);
    console.log('Packed dist archive:', p.zipPath, `(${p.filesPacked} files)`);
    break;
  }
  case 'doctor':
    await runDoctor();
    break;
  case 'install':
    await runInstall();
    break;
  case 'verify':
    await runVerify();
    break;
  case 'rollback':
    await runRollback();
    break;
  case 'uninstall':
    await runUninstall();
    break;
  default:
    console.log(`Usage:
  node install.mjs doctor         [--channel auto|stable|insiders]
  node install.mjs install        [--channel auto|stable|insiders] [--sync-user]
  node install.mjs verify         [--safe-mode] [--channel auto|stable|insiders]
  node install.mjs rollback
  node install.mjs uninstall
  node install.mjs build-manifest
  node install.mjs pack`);
    break;
}
