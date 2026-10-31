#!/usr/bin/env node
/**
 * 配置坚果云(WebDAV)账号。
 *
 *   node tools/setup-nutstore.mjs                     # 交互式
 *   node tools/setup-nutstore.mjs <账号> <应用密码> [设备名]
 *
 * 应用密码获取:坚果云网页版 → 账户信息 → 安全选项 → 第三方应用授权 →
 *   添加应用 → 勾选「WebDAV」→ 生成密码(一串随机字符)。
 *   ⚠️ 不是你的登录密码,是一个单独的应用密码,可以随时撤销。
 *
 * 配置写到 .config/nutstore.json(权限 600)。
 */
import { saveConfig, testConnection, loadConfig } from '../server/ws-webdav.mjs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const args = process.argv.slice(2);

async function ask(label, def) {
  const rl = readline.createInterface({ input, output });
  const v = (await rl.question(def ? `${label} [${def}]: ` : `${label}: `)).trim();
  rl.close();
  return v || def;
}

let username = args[0] || '';
let appPassword = args[1] || '';
let deviceName = args[2] || '';

if (!username || !appPassword) {
  console.log('');
  console.log('  坚果云 WebDAV 配置');
  console.log('  ─────────────────────────────');
  console.log('  账号     你的坚果云登录邮箱');
  console.log('  应用密码 账户信息 → 安全选项 → 第三方应用授权 → 添加应用(勾 WebDAV)');
  console.log('');
  username = await ask('  账号', username);
  appPassword = await ask('  应用密码', appPassword);
  deviceName = await ask('  设备名', deviceName || 'Mac');
}

if (!username || !appPassword) {
  console.error('账号和应用密码都不能为空');
  process.exit(1);
}
if (!deviceName) deviceName = 'Mac';

const cfg = { username, appPassword, deviceName };
console.log('');
console.log('  正在测试连接...');
const r = await testConnection(cfg);
if (!r.ok) {
  console.error('  ✗ 连接失败:' + r.error);
  process.exit(1);
}

const file = saveConfig(cfg);
console.log('  ✓ 连接成功');
console.log('  配置已存:' + file);
console.log('');
console.log('  下一步:重启数据服务即生效(启动工作站.command)');
console.log('');
