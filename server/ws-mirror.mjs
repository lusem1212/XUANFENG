/**
 * LUSEM 个人工作站 · 坚果云镜像层
 *
 * 定位:Mac 是主节点(bot 往 Mac 的 ws-server 写),坚果云是**跨网中转与备份**。
 * 两条路径并存:
 *   1. iPhone --Tailscale--> Mac:8787          实时,秒级,主路径
 *   2. Mac --WebDAV--> 坚果云                   镜像一份到云端
 *      iPhone --WebDAV--> 坚果云               Mac 离线时的兜底读
 *
 * 仲裁规则与页面同步层**完全一致**(不能各搞一套,否则数据会打架):
 *   - 整个文档用「时间戳」比新旧,不比 rev 大小
 *     (rev 只在服务端单调递增,离线攒的改动重连后 rev 反而小)
 *   - 日历按「计划 id 取并集」——这是唯一会被两处同时改的 key
 *     (bot 追加计划 vs 页面编辑),丢了就是静默丢数据
 *   - 其余 key 远端为准
 */

import { loadConfig, pullState, pushState, deviceId } from './ws-webdav.mjs';

const LS_CAL = 'workstation-v2-calendar';

/* 状态文件格式:
 *   { version, rev, updatedAt, updatedBy, deviceId, deviceName, keys: {k: "<JSON字符串>"} }
 */
const MIRROR_VERSION = 1;

let cfg = null;
let myId = null;
let pushing = false;
let pullTimer = null;
let pushTimer = null;
let lastPushedRev = -1;
let lastPushedAt = 0;

/* ---- 日历按计划 id 取并集(与页面 syncMergeRemote 同一套规则) ---- */
function mergeCalendar(remoteCal, localCal) {
  const merged = JSON.parse(JSON.stringify(remoteCal || {}));
  let addedLocal = 0;
  const local = localCal || {};
  Object.keys(local).forEach(date => {
    const list = Array.isArray(local[date]) ? local[date] : [];
    const remoteList = Array.isArray(merged[date]) ? merged[date] : (merged[date] = []);
    const ids = new Set(remoteList.map(p => p && p.id));
    list.forEach(p => {
      if (p && p.id && !ids.has(p.id)) { remoteList.push(p); addedLocal++; }
    });
  });
  return { merged, addedLocal };
}

function parseKey(raw, fallback) {
  if (raw == null) return fallback;
  try { const v = JSON.parse(raw); return v ?? fallback; } catch (e) { return fallback; }
}

/**
 * 合并远端(坚果云)与本地(磁盘真源)。
 * 返回 { keys, addedLocal, remoteAt, localAt, remoteWins }
 */
export function mergeStates(remote, local) {
  const localAt = local.updatedAt ? Date.parse(local.updatedAt) : 0;
  const remoteAt = remote.updatedAt ? Date.parse(remote.updatedAt) : 0;
  const remoteKeys = (remote && remote.keys && typeof remote.keys === 'object') ? remote.keys : {};
  const localKeys = (local.keys && typeof local.keys === 'object') ? local.keys : {};

  const localCal = parseKey(localKeys[LS_CAL], {});
  const remoteCal = parseKey(remoteKeys[LS_CAL], {});
  const { merged, addedLocal } = mergeCalendar(remoteCal, localCal);

  /* ⚠️ 仲裁规则必须与 Rust 侧 merge_states / 页面侧 nutBuildDoc 逐字一致:
   *   1. everSynced = false(本机还没跟云端对齐过)→ 远端无条件为准。
   *      否则新装设备会用本机的**空占位**(clients:"[]")覆盖云端真数据。
   *   2. key 集合取并集 —— 「整份取较新一方」会丢掉本机独有的 key。
   *   3. 日历按计划 id 取并集。 */
  const localEmpty = Object.keys(localKeys).length === 0;
  const remoteHasData = Object.keys(remoteKeys).length > 0;
  const firstJoin = !local.everSynced && remoteHasData;
  const remoteWins = firstJoin || remoteAt > localAt || (localEmpty && remoteHasData);

  const keys = Object.assign({}, localKeys);
  Object.keys(remoteKeys).forEach(k => {
    if (remoteWins || !(k in keys)) keys[k] = remoteKeys[k];
  });
  /* 合并结果永远要写回去 —— 不能只在「本地有独有计划」时才写,
   * 否则远端为 null 时 out 里没有日历这个 key,采纳后本地日历被清空。 */
  keys[LS_CAL] = JSON.stringify(merged);

  return {
    keys,
    addedLocal,
    remoteAt,
    localAt,
    remoteWins,
    firstJoin,
  };
}

/** 把当前真源格式(state)转成镜像文档格式 */
function toMirrorDoc(state, cfg, myId) {
  return {
    version: MIRROR_VERSION,
    rev: state.rev || 0,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy || '页面',
    deviceId: myId,
    deviceName: (cfg && cfg.deviceName) || 'Mac',
    /* Mac 端只要有数据就说明它已经是云端的一份(它是种子端)。
     * 置 true 才能参与「谁更新」的时间戳仲裁,否则永远推不上去。 */
    everSynced: true,
    keys: state.keys || {},
  };
}

/** 把镜像文档转回真源格式 */
function fromMirrorDoc(doc) {
  return {
    rev: Number(doc.rev) || 0,
    updatedAt: doc.updatedAt || null,
    updatedBy: doc.updatedBy || '坚果云',
    everSynced: doc.everSynced !== false,
    keys: doc.keys || {},
  };
}

/**
 * 初始化镜像层。
 * @param readState   () => 当前真源(与 ws-server 共用同一个读函数)
 * @param writeState  (next, by) => 写入新真源(带 rev 乐观锁的写)
 * @returns { ok, reason }
 */
export function initMirror({ readState, writeState }) {
  cfg = loadConfig();
  if (!cfg) {
    return { ok: false, reason: '未配置坚果云(缺少 .config/nutstore.json)' };
  }
  myId = deviceId(cfg);

  /* 启动时先对一次:云端更新就采纳,本地更新就推上去 */
  mirrorOnce({ readState, writeState }).catch(e => {
    console.warn('[mirror] 启动同步失败:', e.message);
  });

  /* 定期拉取(检测「另一台设备改了云端这份」) */
  pullTimer = setInterval(() => {
    mirrorOnce({ readState, writeState }).catch(e => {
      console.warn('[mirror] 定期同步失败:', e.message);
    });
  }, 60000);

  return { ok: true, deviceId: myId };
}

/** 收到本地写入后调用:防抖推一份到云端 */
export function schedulePush(state) {
  if (!cfg) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    doPush(state).catch(e => console.warn('[mirror] 推送失败:', e.message));
  }, 5000);
}

async function doPush(state) {
  if (!cfg || pushing) return;
  /* 云端刚拉下来的一份,不要再原样推回去(会打转) */
  const doc = toMirrorDoc(state, cfg, myId);
  if (state.rev === lastPushedRev && Date.parse(state.updatedAt || 0) === lastPushedAt) return;
  pushing = true;
  try {
    await pushState(cfg, doc);
    lastPushedRev = state.rev;
    lastPushedAt = Date.parse(state.updatedAt || 0);
    console.log(`[mirror] 已推送 rev ${state.rev} → 坚果云`);
  } finally {
    pushing = false;
  }
}

/** 完整的一次「拉取 + 仲裁 + 回推」 */
export async function mirrorOnce({ readState, writeState }) {
  if (!cfg) return { action: 'disabled' };
  const local = readState();
  let remote;
  try {
    remote = await pullState(cfg);
  } catch (e) {
    return { action: 'error', error: e.message };
  }

  /* 云端还没有这份数据 → 播种 */
  if (!remote || !remote.keys || !Object.keys(remote.keys).length) {
    await doPush(local);
    return { action: 'seeded' };
  }

  const m = mergeStates(remote, local);

  /* 云端更新 → 采纳(带上本地独有的计划) */
  if (m.remoteWins) {
    const next = {
      rev: (local.rev || 0) + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: '坚果云',
      keys: m.keys,
    };
    await writeState(next, '坚果云');
    console.log(`[mirror] 已采纳云端更新(保留本地 ${m.addedLocal} 条计划)`);
    /* 采纳后把合并结果推回去,让两端一致 */
    await doPush({ rev: next.rev, updatedAt: next.updatedAt, updatedBy: '坚果云', keys: m.keys });
    return { action: 'pulled', addedLocal: m.addedLocal };
  }

  /* 本地更新 → 推上去 */
  await doPush(local);
  return { action: 'pushed' };
}

export function stopMirror() {
  clearTimeout(pushTimer);
  clearInterval(pullTimer);
}

export function mirrorStatus() {
  return {
    enabled: !!cfg,
    deviceId: myId,
    deviceName: (cfg && cfg.deviceName) || '',
    lastPushedRev: lastPushedRev,
    lastPushedAt: lastPushedAt,
  };
}
