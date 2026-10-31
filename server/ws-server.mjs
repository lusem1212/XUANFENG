#!/usr/bin/env node
/**
 * LUSEM 个人工作站 · 本地数据服务
 *
 * 解决的问题:工作站是纯前端单文件,数据全在浏览器 localStorage,
 * 外部程序(bot / 脚本)没有任何途径写入。这个服务把数据真源搬到
 * 磁盘上的 data/data.json,页面通过 localhost 读写,bot 通过同一个
 * API 写入 —— 两侧看到的是同一份数据。
 *
 * 设计要点:
 *   - 只监听 127.0.0.1,不对外暴露;静态文件服务限定在工作站内,拒绝路径穿越
 *   - 整份数据原子写入(tmp → rename),避免半截文件
 *   - 每次写入自动滚动一份备份,保留 30 份
 *   - rev 乐观锁:客户端带 rev 提交,rev 不符返回 409,由客户端决定拉还是推
 *   - 服务不可用时页面自动降级为纯 localStorage,不影响用户正常使用
 *
 * 零依赖,只用 Node 内置模块。node server/ws-server.mjs [--port 8787]
 */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { initMirror, schedulePush, mirrorStatus, mirrorOnce } from './ws-mirror.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_KEEP = 30;

const argPort = process.argv.indexOf('--port');
const PORT = argPort > -1 ? Number(process.argv[argPort + 1]) : 8787;
const argHost = process.argv.indexOf('--host');
/* 默认只绑回环(数据全在本机)。
 *
 * ⚠️ 2026-10-21 起新增 Tailscale 模式:
 *   跨网访问不再用 --host 0.0.0.0(那会把服务暴露给整个局域网,任何设备
 *   都能读到全部客户台账)。改为直接绑 Tailscale 尾网地址(100.x.x.x)——
 *   那个地址只存在于 tailscale0 网卡上,只有同一 tailnet 里的设备能到达,
 *   局域网里的其他机器根本碰不到。
 *   取法:/Applications/Tailscale.app/Contents/MacOS/Tailscale ip -4
 */
const HOST = argHost > -1 ? process.argv[argHost + 1] : '127.0.0.1';

/* ---- token 鉴权 ----
 * 服务本身无鉴权,一旦绑到任何非回环地址就等于把客户台账公开。
 * 开启后:
 *   - /api/*  必须带 X-WS-Token 头,或 ?t=<token> 查询参数
 *   - /api/health 免鉴权(只回 ok/端口,不含任何业务数据),因为页面
 *     启动时要探测服务是否在线
 *   - 静态文件免鉴权(HTML 本身不含数据),页面从地址栏 ?t= 读到 token
 *     后存进 localStorage,后续 fetch 带上头
 * token 从环境变量 WS_TOKEN 读,不写进代码,也不进日志。
 */
const TOKEN = String(process.env.WS_TOKEN || '').trim();

function authOk(req, url) {
  if (!TOKEN) return true;                    // 没配 token = 保持旧行为(仅回环)
  const h = req.headers['x-ws-token'];
  if (h && h === TOKEN) return true;
  const q = url.searchParams.get('t');
  if (q && q === TOKEN) return true;
  return false;
}

/* ---- 真源里不参与同步的 key(留 localStorage) ----
 * theme      主题是设备偏好,手机和电脑不该被互相覆盖
 * ai-key     DeepSeek 密钥,属敏感信息,不落盘共享文件
 */
const LOCAL_ONLY = new Set(['workstation-v2-theme', 'workstation-v2-ai-key']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

/* ============================ 数据层 ============================ */

function emptyState() {
  return { rev: 0, updatedAt: null, updatedBy: null, keys: {} };
}

function readStateSync() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object' || typeof s.keys !== 'object' || Array.isArray(s.keys)) {
      console.warn('[data.json] 结构异常,按空状态处理');
      return emptyState();
    }
    s.rev = Number(s.rev) || 0;
    /* 归一化:keys 的每个 value 必须是字符串(与 localStorage 的存法一致)。
     * 早期版本把对象直接存进过文件,这里做一次性修复,避免旧文件继续错下去。 */
    s.keys = Object.fromEntries(
      Object.entries(s.keys).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
    );
    return s;
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[data.json] 读取失败:', e.message);
    return emptyState();
  }
}

async function rotateBackup() {
  try {
    await fsp.mkdir(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const src = path.join(BACKUP_DIR, `data-${stamp}.json`);
    await fsp.copyFile(DATA_FILE, src);
    const files = (await fsp.readdir(BACKUP_DIR))
      .filter(f => /^data-.*\.json$/.test(f))
      .sort();
    for (const f of files.slice(0, Math.max(0, files.length - BACKUP_KEEP))) {
      await fsp.unlink(path.join(BACKUP_DIR, f)).catch(() => {});
    }
  } catch (e) {
    console.warn('[backup] 轮转失败(不影响主写入):', e.message);
  }
}

/** 原子写:先写 tmp 再 rename,rename 在同一文件系统上是原子操作 */
async function writeState(state) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fsp.rename(tmp, DATA_FILE);
}

async function commit(next, by) {
  await rotateBackup();
  await writeState(next);
  console.log(`[rev ${next.rev}] 写入完成 ← ${by}`);
  /* 有坚果云配置时,异步推一份到云端(防抖 5s,失败不阻塞本地写入) */
  try { schedulePush(next); } catch (_) {}
  return next;
}

/* keys 里存的是「localStorage 的原始值」—— 也就是每个 key 的 JSON 字符串,
 * 而不是解析后的对象。页面 localStorage.setItem(k, JSON.stringify(v)) 存的就是
 * 字符串,若这里按对象处理,读回来时类型对不上,POST /api/plan 会在
 * `cal[date] = ...` 处抛 "Cannot create property on string"。
 * 所以:读时 JSON.parse,写时 JSON.stringify,类型必须始终成对。 */
function parseKey(raw, fallback) {
  if (raw == null) return fallback;
  try { const v = JSON.parse(raw); return v ?? fallback; } catch (e) { return fallback; }
}
function stringifyKeys(obj) {
  /* ⚠️ 已经是字符串的必须原样放过。
   * 页面 collectSyncPayload() 取的是 localStorage.getItem(k),那已经是
   * JSON.stringify 过的字符串了。这里再 stringify 一次就多包一层,
   * 于是 data.json 里存成「三引号」,POST /api/plan 解析到第二层还是个
   * 字符串,`cal[date] = ...` 抛 "Cannot create property on string"。
   * (字符串本身合法,所以 JSON.parse 不报错,只能靠"只包一层"这条不变量守。)
   */
  return Object.fromEntries(Object.entries(obj).map(([k, v]) =>
    typeof v === 'string' ? [k, v] : [k, JSON.stringify(v)]
  ));
}

/* 写锁:同一时刻只允许一个写入流程,避免 read-modify-write 竞态 */
let writeChain = Promise.resolve();
function withLock(fn) {
  const run = writeChain.then(fn, fn);
  writeChain = run.catch(() => {});
  return run;
}

/* ============================ HTTP ============================ */

// 页面可能以 file:// 双击打开(Origin: null),此时 fetch localhost 属跨域。
// 本服务只绑 127.0.0.1 且无鉴权,数据全在本机,放开 CORS 以兼容两种打开方式。
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-WS-Token',
};

function sendJSON(res, code, obj) {
  const buf = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, {
    ...CORS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
  });
  res.end(buf);
}

function readBody(req, limit = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('JSON 解析失败: ' + e.message)); }
    });
    req.on('error', reject);
  });
}

async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/LUSEM的个人工作站-V4.html';
  const target = path.resolve(ROOT, '.' + rel);
  // 路径穿越防护:解析后必须仍在 ROOT 之内
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    return sendJSON(res, 403, { ok: false, error: '路径越界' });
  }
  let st;
  try { st = await fsp.stat(target); }
  catch { return sendJSON(res, 404, { ok: false, error: '文件不存在: ' + rel }); }
  if (st.isDirectory()) return sendJSON(res, 404, { ok: false, error: '目录' });

  const ext = path.extname(target).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(target).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const p = url.pathname;

  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...CORS, 'Content-Length': 0 });
      return res.end();
    }
    /* ---------- 健康检查 ---------- */
    if (p === '/api/health') {
      /* 免鉴权:页面启动要探测服务是否在线。只回 ok/端口,不含任何业务数据。 */
      const s = readStateSync();
      return sendJSON(res, 200, { ok: true, port: PORT, auth: !!TOKEN });
    }

    /* ---------- 其余接口一律要 token ---------- */
    if (p.startsWith('/api/') && !authOk(req, url)) {
      return sendJSON(res, 401, { ok: false, error: '未授权:缺少或错误的 token' });
    }

    /* ---------- 接收备份文件(iOS 端) ----------
     * iOS 的 WKWebView 里 a.download 不落盘,备份改为 POST 上来,
     * 由服务端写进 data/backups/,与桌面端下载的结果等价。 */
    if (p === '/api/backup' && req.method === 'POST') {
      const body = await readBody(req);
      const payload = body && body.payload;
      if (!payload || typeof payload !== 'object') {
        return sendJSON(res, 400, { ok: false, error: 'payload 必须是对象' });
      }
      await fsp.mkdir(BACKUP_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const raw = String(body.filename || 'backup.json');
      const safe = raw.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
      const target = path.join(BACKUP_DIR, `upload-${stamp}-${safe}`);
      await fsp.writeFile(target, JSON.stringify(payload, null, 2), 'utf8');
      console.log(`[backup] 收到上传备份 → ${path.basename(target)}`);
      return sendJSON(res, 200, { ok: true, path: target, name: path.basename(target) });
    }

    /* ---------- 读全量状态 ---------- */
    if (p === '/api/state' && req.method === 'GET') {
      const s = readStateSync();
      return sendJSON(res, 200, { ok: true, rev: s.rev, updatedAt: s.updatedAt, updatedBy: s.updatedBy, keys: s.keys });
    }

    /* ---------- 写全量状态(页面保存走这条) ---------- */
    if (p === '/api/state' && req.method === 'PUT') {
      const body = await readBody(req);
      const keys = body.keys;
      if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
        return sendJSON(res, 400, { ok: false, error: 'keys 必须是对象' });
      }
      const by = String(body.by || '页面').slice(0, 40);
      // 页面可能送来解析后的对象(首次播种时手工拼的),统一序列化成字符串再存
      const incoming = stringifyKeys(keys);
      const result = await withLock(async () => {
        const cur = readStateSync();
        // baseRev 为 0/undefined 表示无条件覆盖(首次播种用)
        if (body.baseRev != null && Number(body.baseRev) !== cur.rev) {
          return { conflict: true, cur };
        }
        const next = {
          rev: cur.rev + 1,
          updatedAt: new Date().toISOString(),
          updatedBy: by,
          keys: Object.fromEntries(
            Object.entries(incoming).filter(([k]) => !LOCAL_ONLY.has(k))
          ),
        };
        return { conflict: false, state: await commit(next, by) };
      });
      if (result.conflict) {
        return sendJSON(res, 409, { ok: false, conflict: true, rev: result.cur.rev, updatedAt: result.cur.updatedAt, keys: result.cur.keys });
      }
      return sendJSON(res, 200, { ok: true, rev: result.state.rev, updatedAt: result.state.updatedAt });
    }

    /* ---------- 增量加一条计划(bot 走这条,不用传全量) ---------- */
    if (p === '/api/plan' && req.method === 'POST') {
      const body = await readBody(req);
      const items = Array.isArray(body) ? body : (Array.isArray(body.plans) ? body.plans : [body]);
      if (!items.length) return sendJSON(res, 400, { ok: false, error: '没有计划内容:请求体为空或格式不对' });

      const out = await withLock(async () => {
        const cur = readStateSync();
        // ⚠️ 必须是 parseKey,不能直接 JSON.parse(raw) 后当对象用 ——
        // cur.keys 里存的是字符串,这是之前 POST 全部失败的根因
        const cal = JSON.parse(JSON.stringify(parseKey(cur.keys['workstation-v2-calendar'], {})));
        if (typeof cal !== 'object' || Array.isArray(cal)) throw new Error('日历数据被破坏,已中止写入');
        const added = [];
        for (const it of items) {
          const date = String(it.date || '').trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`日期格式不合法: "${date}"(应为 YYYY-MM-DD)`);
          const text = String(it.text || '').trim();
          if (!text) throw new Error('计划内容为空');
          const list = (cal[date] = Array.isArray(cal[date]) ? cal[date] : []);
          const plan = {
            id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            time: String(it.time || '').trim(),
            text,
            tags: Array.isArray(it.tags) ? it.tags.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim()) : [],
            done: false,
            images: [],
          };
          if (it.project) plan.project = String(it.project).trim();
          if (it.priority) plan.priority = String(it.priority).trim();
          if (it.source) plan.source = String(it.source).trim();
          list.push(plan);
          added.push({ date, plan });
        }
        const next = {
          rev: cur.rev + 1,
          updatedAt: new Date().toISOString(),
          updatedBy: 'bot',
          keys: { ...cur.keys, 'workstation-v2-calendar': JSON.stringify(cal) },
        };
        return { added, state: await commit(next, `bot ×${items.length}`) };
      });
      return sendJSON(res, 200, { ok: true, rev: out.state.rev, added: out.added.length, items: out.added });
    }

    /* ---------- 只看版本号(页面轮询用,轻量) ---------- */
    if (p === '/api/rev' && req.method === 'GET') {
      const s = readStateSync();
      return sendJSON(res, 200, { ok: true, rev: s.rev, updatedAt: s.updatedAt, updatedBy: s.updatedBy });
    }

    /* ---------- 坚果云镜像状态 ---------- */
    if (p === '/api/mirror' && req.method === 'GET') {
      const st = mirrorStatus();
      return sendJSON(res, 200, { ok: true, ...st });
    }
    /* 手动触发一次镜像同步(设置界面「立即同步」按钮) */
    if (p === '/api/mirror' && req.method === 'POST') {
      const r = await mirrorOnce({ readState: readStateSync, writeState: commit });
      return sendJSON(res, 200, { ok: true, ...r });
    }

    /* ---------- 静态文件 ---------- */
    if (req.method === 'GET') return await serveStatic(req, res, p);

    return sendJSON(res, 405, { ok: false, error: '方法不支持' });
  } catch (e) {
    console.error('[error]', e.message);
    return sendJSON(res, 400, { ok: false, error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  const s = readStateSync();
  console.log('');
  console.log('  LUSEM 个人工作站 · 数据服务');
  console.log('  ─────────────────────────────');
  console.log(`  地址    http://${HOST}:${PORT}/`);
  if (HOST === '0.0.0.0' || HOST === '::') {
    const nets = os.networkInterfaces();
    const lan = Object.values(nets).flat()
      .filter(n => n && n.family === 'IPv4' && !n.internal)
      .map(n => n.address);
    for (const ip of lan) console.log(`  局域网  http://${ip}:${PORT}/   (iPhone 填这个)`);
  }
  console.log(`  数据    ${DATA_FILE}`);
  console.log(`  版本    rev ${s.rev}${s.updatedAt ? ` (${s.updatedAt})` : ' (空)'}`);
  console.log(`  不参与同步 ${[...LOCAL_ONLY].join(', ')}`);
  console.log(`  鉴权    ${TOKEN ? '已开启(token 必需)' : '未开启(仅回环安全)'}`);

  /* 坚果云镜像层:有配置就启动,没配置就跳过(不影响主功能) */
  const m = initMirror({ readState: readStateSync, writeState: commit });
  if (m.ok) {
    console.log(`  坚果云  已连接(设备 ${m.deviceId})· 每 60 秒对一次`);
  } else {
    console.log(`  坚果云  未启用 —— ${m.reason}`);
    console.log('         配置: node tools/setup-nutstore.mjs');
  }
  console.log('  停止    Ctrl+C');
  console.log('');
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`✗ 端口 ${PORT} 已被占用。换端口:node server/ws-server.mjs --port 8899`);
    process.exit(1);
  }
  throw e;
});