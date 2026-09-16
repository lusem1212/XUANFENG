/* ═══════════════════════════════════════════════════
   工作站同步 · Background v2
   去掉 content script，全部由 background 直接操作
   ═══════════════════════════════════════════════════ */

const WEBDAV_BASE = 'https://dav.jianguoyun.com/dav/';
const BACKUP_PATH = 'LUSEM%E5%B7%A5%E4%BD%9C%E7%AB%99%E5%A4%87%E4%BB%BD/workstation-backup.json';
const STORAGE_KEY = 'sync_config';
const DEVICE_ID_KEY = 'device_id';

// ── 工具函数 ──

function getDeviceId() {
  return new Promise(resolve => {
    chrome.storage.local.get(DEVICE_ID_KEY, data => {
      if (data[DEVICE_ID_KEY]) return resolve(data[DEVICE_ID_KEY]);
      const id = 'device_' + Math.random().toString(36).slice(2, 10);
      chrome.storage.local.set({ [DEVICE_ID_KEY]: id }, () => resolve(id));
    });
  });
}

function getConfig() {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEY, data => {
      resolve(data[STORAGE_KEY] || {});
    });
  });
}

function saveConfig(cfg) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [STORAGE_KEY]: cfg }, resolve);
  });
}

function setSyncStatus(status, detail) {
  const s = { ...status, detail, time: Date.now() };
  chrome.storage.local.set({ sync_status: s });
  chrome.runtime.sendMessage({ type: 'status-update', status: s }).catch(() => {});
}

// ── 查找工作站 Tab ──

async function findWorkstationTab() {
  const tabs = await chrome.tabs.query({});
  return tabs.find(t => t.url && (
    t.url.includes('lusem1212.github.io') ||
    t.url.includes('个人工作站')
  ));
}

// ── 注入页面脚本并执行 ──

async function injectAndRun(code) {
  /** 注入 page-world.js 到 MAIN world，然后执行一段代码 */
  const tab = await findWorkstationTab();
  if (!tab) throw new Error('请先打开工作站页面');

  // 先注入 page-world.js（幂等，已注入则跳过）
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['page-world.js']
    });
  } catch (e) {
    console.warn('[工作站同步] Inject page-world.js:', e.message);
  }

  // 等一下让页面脚本初始化
  await new Promise(r => setTimeout(r, 150));

  // 执行代码（返回结果）
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: () => {
      if (!window.__wsSyncReady) {
        return { _error: 'page script not ready' };
      }
      // 读取 localStorage 数据
      const KEYS = [
        'workstation-calendar', 'workstation-notes', 'workstation-projects',
        'workstation-clients', 'workstation-client-tags', 'workstation-preset-tags',
        'workstation-tag-hidden', 'workstation-site'
      ];
      const snap = {};
      for (const k of KEYS) {
        const v = localStorage.getItem(k);
        if (v !== null) {
          try { snap[k] = JSON.parse(v); } catch { snap[k] = v; }
        }
      }
      snap._ts = Date.now();
      return snap;
    }
  });

  return results?.[0]?.result;
}

async function injectDataToPage(data) {
  /** 将云端数据注入到页面 localStorage */
  const tab = await findWorkstationTab();
  if (!tab) throw new Error('请先打开工作站页面');

  // 注入页面脚本
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['page-world.js']
    });
  } catch (e) {
    console.warn('[工作站同步] Inject page-world.js:', e.message);
  }

  await new Promise(r => setTimeout(r, 150));

  // 写入数据
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: (d) => {
      const KEYS = [
        'workstation-calendar', 'workstation-notes', 'workstation-projects',
        'workstation-clients', 'workstation-client-tags', 'workstation-preset-tags',
        'workstation-tag-hidden', 'workstation-site'
      ];
      for (const k of Object.keys(d)) {
        if (k === '_ts') continue;
        if (KEYS.includes(k)) {
          localStorage.setItem(k, typeof d[k] === 'string' ? d[k] : JSON.stringify(d[k]));
        }
      }
    },
    args: [data]
  });
}

// ── WebDAV 操作 ──

function webdavHeaders(cfg) {
  const auth = btoa(`${cfg.username}:${cfg.appPassword}`);
  return { 'Authorization': `Basic ${auth}` };
}

async function webdavCheck(cfg) {
  const url = `${WEBDAV_BASE}${BACKUP_PATH}`;
  try {
    const resp = await fetch(url, { method: 'HEAD', headers: webdavHeaders(cfg) });
    return { exists: resp.ok };
  } catch (e) {
    throw new Error(`连接坚果云失败: ${e.message}`);
  }
}

async function webdavDownload(cfg) {
  const url = `${WEBDAV_BASE}${BACKUP_PATH}`;
  const resp = await fetch(url, { method: 'GET', headers: webdavHeaders(cfg) });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`下载失败 HTTP ${resp.status}`);
  return await resp.json();
}

async function ensureWebdavDir(cfg) {
  const DIR = 'LUSEM%E5%B7%A5%E4%BD%9C%E7%AB%99%E5%A4%87%E4%BB%BD';
  const dirUrl = `${WEBDAV_BASE}${DIR}/`;
  try {
    const check = await fetch(dirUrl, {
      method: 'PROPFIND',
      headers: { ...webdavHeaders(cfg), 'Depth': '0' }
    });
    if (check.ok || check.status === 207) {
      console.log('[工作站同步] 目录已存在');
      return;
    }
    const mkcol = await fetch(dirUrl, {
      method: 'MKCOL',
      headers: webdavHeaders(cfg)
    });
    console.log('[工作站同步] MKCOL status:', mkcol.status);
  } catch (e) {
    console.warn('[工作站同步] ensureDir:', e.message);
  }
}

async function webdavUpload(cfg, data) {
  await ensureWebdavDir(cfg);
  const url = `${WEBDAV_BASE}${BACKUP_PATH}`;
  const payload = JSON.stringify(data, null, 2);
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { ...webdavHeaders(cfg), 'Content-Type': 'application/json' },
    body: payload
  });
  if (!resp.ok) throw new Error(`上传失败 HTTP ${resp.status}`);
  return true;
}

// ── 同步核心 ──

async function collectWorkstationData() {
  const data = await injectAndRun();
  if (!data || data._error) {
    throw new Error(data?._error || '无法读取工作站数据');
  }
  return data;
}

async function syncPush() {
  const cfg = await getConfig();
  if (!cfg.username || !cfg.appPassword) throw new Error('未配置坚果云账号');
  setSyncStatus({ state: 'pushing' }, '正在推送到坚果云...');

  const pageData = await collectWorkstationData();
  const deviceId = await getDeviceId();
  const deviceName = cfg.deviceName || '未知设备';

  const backup = { deviceId, deviceName, timestamp: Date.now(), version: '1.1.0', data: pageData };
  await webdavUpload(cfg, backup);
  cfg.lastSync = Date.now();
  await saveConfig(cfg);
  setSyncStatus({ state: 'idle', synced: true }, '已推送到坚果云');
  return { action: 'pushed' };
}

async function syncPull() {
  const cfg = await getConfig();
  if (!cfg.username || !cfg.appPassword) throw new Error('未配置坚果云账号');
  setSyncStatus({ state: 'pulling' }, '正在从坚果云拉取...');

  const remote = await webdavDownload(cfg);
  if (!remote || !remote.data) {
    setSyncStatus({ state: 'idle' }, '坚果云无备份数据');
    return { action: 'nothing', reason: 'remote_empty' };
  }

  const deviceId = await getDeviceId();
  if (remote.deviceId === deviceId) {
    setSyncStatus({ state: 'idle' }, '云端数据与本机一致');
    return { action: 'skip', reason: 'same_device' };
  }

  await injectDataToPage(remote.data);
  setSyncStatus({ state: 'idle', synced: true }, `已从 ${remote.deviceName || '其他设备'} 拉取`);
  return { action: 'applied', from: remote.deviceName };
}

async function syncBidirectional() {
  const cfg = await getConfig();
  if (!cfg.username || !cfg.appPassword) throw new Error('未配置坚果云账号');
  setSyncStatus({ state: 'syncing' }, '双向同步中...');

  try {
    const check = await webdavCheck(cfg);
    const localData = await collectWorkstationData();
    const deviceId = await getDeviceId();
    const deviceName = cfg.deviceName || '未知设备';

    if (!check.exists) {
      const backup = { deviceId, deviceName, timestamp: Date.now(), version: '1.1.0', data: localData };
      await webdavUpload(cfg, backup);
      cfg.lastSync = Date.now();
      await saveConfig(cfg);
      setSyncStatus({ state: 'idle', synced: true }, '首次同步完成，已上传到坚果云');
      return { action: 'first_push' };
    }

    const remote = await webdavDownload(cfg);
    if (remote.deviceId === deviceId) {
      const backup = { deviceId, deviceName, timestamp: Date.now(), version: '1.1.0', data: localData };
      await webdavUpload(cfg, backup);
      cfg.lastSync = Date.now();
      await saveConfig(cfg);
      setSyncStatus({ state: 'idle', synced: true }, '本机数据已更新到云端');
      return { action: 'pushed_same_device' };
    }

    // 不同设备 → 后同步者赢
    const remoteTime = remote.timestamp || 0;
    let localTime = 0;
    for (const k of Object.keys(localData)) {
      const items = localData[k];
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item.ts && item.ts > localTime) localTime = item.ts;
        }
      }
    }

    if (remoteTime > localTime) {
      await injectDataToPage(remote.data);
      cfg.lastSync = Date.now();
      await saveConfig(cfg);
      setSyncStatus({ state: 'idle', synced: true }, `已同步 ${remote.deviceName} 的最新数据`);
      return { action: 'pulled', from: remote.deviceName };
    } else {
      const backup = { deviceId, deviceName, timestamp: Date.now(), version: '1.1.0', data: localData };
      await webdavUpload(cfg, backup);
      cfg.lastSync = Date.now();
      await saveConfig(cfg);
      setSyncStatus({ state: 'idle', synced: true }, '本地数据已同步到云端');
      return { action: 'pushed' };
    }
  } catch (e) {
    setSyncStatus({ state: 'error' }, e.message);
    throw e;
  }
}

// ── 消息处理 ──

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'webdav-test') {
    getConfig().then(cfg => {
      if (!cfg.username || !cfg.appPassword) return sendResponse({ ok: false, error: '未配置坚果云账号' });
      return webdavCheck(cfg).then(r => sendResponse({ ok: true, ...r }));
    }).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'sync-pull') {
    syncPull().then(r => sendResponse({ ok: true, ...r })).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'sync-push') {
    syncPush().then(r => sendResponse({ ok: true, ...r })).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'sync-bidirectional') {
    syncBidirectional().then(r => sendResponse({ ok: true, ...r })).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'get-status') {
    chrome.storage.local.get(['sync_status', STORAGE_KEY], data => {
      sendResponse({
        status: data.sync_status || { state: 'idle', detail: '未同步' },
        config: data[STORAGE_KEY] || {}
      });
    });
    return true;
  }

  if (msg.type === 'save-config') {
    saveConfig(msg.config).then(() => {
      setupAlarm(msg.config);
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'data-changed') {
    getConfig().then(cfg => {
      if (cfg.autoSync && cfg.username && cfg.appPassword) {
        syncPush().catch(e => console.warn('Auto push failed:', e));
      }
    });
    sendResponse({ ok: true });
    return false;
  }
});

// ── 定时同步 ──

function setupAlarm(cfg) {
  chrome.alarms.clear('workstation-sync');
  if (cfg.autoSync && cfg.syncInterval) {
    chrome.alarms.create('workstation-sync', { periodInMinutes: cfg.syncInterval || 5 });
  }
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'workstation-sync') {
    getConfig().then(cfg => {
      if (cfg.autoSync && cfg.username && cfg.appPassword) {
        syncBidirectional().catch(e => console.warn('Alarm sync failed:', e));
      }
    });
  }
});

chrome.storage.local.get(STORAGE_KEY, data => {
  const cfg = data[STORAGE_KEY] || {};
  if (cfg.autoSync) setupAlarm(cfg);
});

console.log('[工作站同步] Background v2 loaded (no content script)');
