#!/usr/bin/env node
/**
 * 把旧版导出格式(用户数据备份-*.json)迁成 V4 真源格式(data.json)。
 *
 * 旧格式(工作站「导出备份」出来的):
 *   { app, version, exportedAt, calendar, notes, projects, clients, site, hiddenTags }
 * V4 真源格式:
 *   { rev, updatedAt, updatedBy, keys: { "workstation-v2-calendar": "<JSON字符串>", ... } }
 *
 * ⚠️ keys 里的每个 value 必须是「字符串」(localStorage 的存法)。
 *    服务端 parseKey/stringifyKeys 只包一层,这里必须直接写成字符串。
 *
 * 用法: node tools/migrate-backup.mjs [备份文件路径]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'data.json');

/* 旧字段 → V4 的 key */
const FIELD_TO_KEY = [
  ['calendar', 'workstation-v2-calendar'],
  ['notes', 'workstation-v2-notes'],
  ['projects', 'workstation-v2-projects'],
  ['clients', 'workstation-v2-clients'],
  ['site', 'workstation-v2-site'],
  ['hiddenTags', 'workstation-v2-tag-hidden'],
  ['clientTags', 'workstation-v2-client-tags'],
  ['presetTags', 'workstation-v2-preset-tags'],
];

const arg = process.argv[2];
const backupFile = arg
  ? path.resolve(arg)
  : (() => {
      const dir = path.join(ROOT, 'data');
      const cands = fs.readdirSync(dir).filter(f => /^用户数据备份-.*\.json$/.test(f)).sort();
      if (!cands.length) { console.error('找不到备份文件'); process.exit(1); }
      return path.join(dir, cands[cands.length - 1]);
    })();

console.log('备份文件:', backupFile);
const src = JSON.parse(fs.readFileSync(backupFile, 'utf8'));

/* 已经是 V4 格式就跳过 */
if (src && src.keys && typeof src.keys === 'object') {
  console.log('这个文件已经是 V4 真源格式,无需迁移');
  process.exit(0);
}

const keys = {};
for (const [field, key] of FIELD_TO_KEY) {
  if (!(field in src)) continue;
  const v = src[field];
  if (v === undefined || v === null) continue;
  keys[key] = JSON.stringify(v);
  const size = keys[key].length;
  console.log(`  ${key.padEnd(30)} ${String(size).padStart(8)} B`);
}

/* 现有真源里已有的 key 别被覆盖 */
let cur = { rev: 0, updatedAt: null, updatedBy: null, keys: {} };
if (fs.existsSync(DATA_FILE)) {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (raw && typeof raw.keys === 'object') cur = raw;
  } catch (e) { console.warn('现有 data.json 读不了,按空处理:', e.message); }
}
const before = Object.keys(cur.keys).length;
const merged = Object.assign({}, cur.keys, keys);

const next = {
  rev: (Number(cur.rev) || 0) + 1,
  updatedAt: new Date().toISOString(),
  updatedBy: 'migrate-backup',
  keys: merged,
};

/* 备份现有真源 */
if (before) {
  const bak = path.join(ROOT, 'data', 'backups', `pre-migrate-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(path.dirname(bak), { recursive: true });
  fs.copyFileSync(DATA_FILE, bak);
  console.log('迁移前真源已备份:', bak);
}

const tmp = DATA_FILE + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
fs.renameSync(tmp, DATA_FILE);

const total = Object.values(next.keys).reduce((a, s) => a + (typeof s === 'string' ? s.length : 0), 0);
console.log('');
console.log(`✅ 迁移完成 → ${DATA_FILE}`);
console.log(`   key 数 ${before} → ${Object.keys(next.keys).length}`);
console.log(`   载荷总大小 ${(total / 1024).toFixed(1)} KB`);
console.log(`   rev = ${next.rev}`);
