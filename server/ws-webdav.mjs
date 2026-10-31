/**
 * LUSEM 个人工作站 · 坚果云 WebDAV 客户端
 *
 * 零依赖,只用 Node 内置 fetch(>=18)。四条方法就够:
 *   PROPFIND  检查目录/文件是否存在
 *   MKCOL     建目录(坚果云 PUT 到不存在的目录会返 409)
 *   GET       读
 *   PUT       写
 *
 * ⚠️ 为什么不放在页面里做?
 *   坚果云 WebDAV 不返 CORS 头,浏览器页面直接 fetch 会被同源策略拦。
 *   这正是当初要写 Chrome 扩展的原因。但:
 *     - 服务端(Node)fetch 没有同源策略 → 不需要扩展
 *     - Tauri 原生 App 里也没有 CORS 问题 → 扩展那层可以整个删掉
 *   所以 WebDAV 这一层统一放在 Node 侧做中继。
 *
 * 配置从 .config/nutstore.json 读(见 tools/setup-nutstore.mjs):
 *   { "username": "...", "appPassword": "...", "deviceName": "..." }
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

export const DAV_BASE = 'https://dav.jianguoyun.com/dav/';
/* 目录名用 URL 编码,避免中文路径在某些客户端上出问题 */
export const DAV_DIR = 'LUSEM%E5%B7%A5%E4%BD%9C%E7%AB%99%E5%A4%87%E4%BB%BD';
export const DAV_FILE = 'workstation-v4-state.json';
export const DAV_PATH = DAV_DIR + '/' + DAV_FILE;

const CONF_FILE = path.join(ROOT, '.config', 'nutstore.json');

export function loadConfig() {
  try {
    const raw = fs.readFileSync(CONF_FILE, 'utf8');
    const cfg = JSON.parse(raw);
    if (!cfg.username || !cfg.appPassword) return null;
    return cfg;
  } catch (e) {
    return null;
  }
}

export function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONF_FILE), { recursive: true });
  fs.writeFileSync(CONF_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  fs.chmodSync(CONF_FILE, 0o600);
  return CONF_FILE;
}

function authHeader(cfg) {
  const raw = `${cfg.username}:${cfg.appPassword}`;
  return 'Basic ' + Buffer.from(raw, 'utf8').toString('base64');
}

/** 单次 WebDAV 请求。返回 { ok, status, body } */
async function dav(cfg, method, davPath, body, extraHeaders) {
  const url = DAV_BASE + davPath;
  const headers = Object.assign({ Authorization: authHeader(cfg) }, extraHeaders || {});
  let payload;
  if (body != null) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    payload = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const resp = await fetch(url, { method, headers, body: payload, signal: ctl.signal });
    const text = resp.status === 204 ? '' : await resp.text();
    return { ok: resp.ok, status: resp.status, body: text };
  } catch (e) {
    return { ok: false, status: 0, body: '', error: e.message };
  } finally {
    clearTimeout(t);
  }
}

/** 确保备份目录存在(坚果云 MKCOL: 201=建成, 405=已存在) */
export async function ensureDir(cfg) {
  const check = await dav(cfg, 'PROPFIND', DAV_DIR + '/', null, { Depth: '0' });
  if (check.ok || check.status === 207) return true;
  const mk = await dav(cfg, 'MKCOL', DAV_DIR + '/');
  /* 201=创建成功 / 405=已存在 / 409=父目录问题 */
  if (mk.status === 201 || mk.status === 405) return true;
  return false;
}

/** 读云端状态。返回解析后的对象;不存在返回 null */
export async function pullState(cfg) {
  const r = await dav(cfg, 'GET', DAV_PATH);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`坚果云读取失败 HTTP ${r.status}${r.error ? ':' + r.error : ''}`);
  try {
    const j = JSON.parse(r.body);
    if (!j || typeof j !== 'object') return null;
    return j;
  } catch (e) {
    throw new Error('坚果云返回的数据不是合法 JSON:' + e.message);
  }
}

/** 写云端状态 */
export async function pushState(cfg, state) {
  await ensureDir(cfg);
  const r = await dav(cfg, 'PUT', DAV_PATH, state);
  if (!r.ok) throw new Error(`坚果云写入失败 HTTP ${r.status}${r.error ? ':' + r.error : ''}`);
  return true;
}

/** 连通性自检(给设置界面用) */
export async function testConnection(cfg) {
  const r = await dav(cfg, 'PROPFIND', DAV_DIR + '/', null, { Depth: '0' });
  if (r.status === 401 || r.status === 403) return { ok: false, error: '账号或应用密码不正确' };
  if (r.status === 0) return { ok: false, error: '网络不通:' + (r.error || '未知错误') };
  if (r.ok || r.status === 207) return { ok: true, dirExists: true };
  return { ok: false, error: `意外状态 HTTP ${r.status}` };
}

/* ---- 设备标识:用来判断「云端这份是不是我自己推的」 ---- */
export function deviceId(cfg) {
  const id = 'mac_' + Buffer.from(cfg.username).toString('base64url').slice(0, 8);
  return id;
}
