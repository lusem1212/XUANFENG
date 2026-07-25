// io.js —— 数据导出 / 导入 / 文本化工具（纯函数，无副作用）
//
// 负责把应用内的全部 Item 导出为：
//   - 结构化 JSON（含版本、导出时间、items、统一标签池 tagPreset），便于再导入；
//   - 可读 Markdown 文本，便于人工查看与复制。
// 以及把导入的 JSON 文本解析、校验为 items 数组。
import { formatBody } from './body.js';
import { getSiteProjects } from './siteProjects.js';

// 各 type 在 Markdown 中的分组标题
const TYPE_LABEL = {
  note: '便签',
  diary: '日记',
  event: '事件',
};

/**
 * 构建导出对象（结构化，可再被 parseImport 解析）。
 * @param {Array<Object>} items 全部 Item
 * @returns {{version:number, exportedAt:string, items:Array<Object>, tagPreset:string[]}}
 */
export function buildExport(items) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    items: Array.isArray(items) ? items : [],
    tagPreset: getSiteProjects(),
  };
}

/**
 * 把全部 Item 渲染为可读 Markdown 文本。
 * 按 type 分组（便签 / 日记 / 事件）；每项展示：标题或项目名称、日期、
 * 标签、正文（用 formatBody 渲染）。
 * @param {Array<Object>} items
 * @returns {string}
 */
export function itemsToMarkdown(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    return '# 便签 · 日记 · 日历 导出\n\n（暂无记录）\n';
  }

  const groups = {
    note: [],
    diary: [],
    event: [],
  };
  for (const it of list) {
    const type = it && it.type;
    if (groups[type]) groups[type].push(it);
    else (groups.note || (groups.note = [])).push(it); // 未知类型兜底归入便签
  }

  const lines = ['# 便签 · 日记 · 日历 导出', ''];
  for (const type of ['note', 'diary', 'event']) {
    const arr = groups[type] || [];
    lines.push(`## ${TYPE_LABEL[type] || type}（${arr.length}）`, '');
    if (arr.length === 0) {
      lines.push('_无_', '');
      continue;
    }
    arr.forEach((it, idx) => {
      const title = (it.title || (type === 'note' ? '（未命名项目）' : '（无标题）')).trim();
      const date = it.date ? it.date : '—';
      const tags = Array.isArray(it.tags) && it.tags.length ? `[${it.tags.join(', ')}]` : '';
      const body = (it.body !== undefined && it.body !== null) ? formatBody(it.body) : '';
      lines.push(`### ${idx + 1}. ${title}`);
      lines.push(`- 类型：${TYPE_LABEL[type] || type}`);
      lines.push(`- 日期：${date}`);
      if (tags) lines.push(`- 标签：${tags}`);
      if (it.plan && String(it.plan).trim()) {
        lines.push(`- 工作计划：${String(it.plan).trim()}`);
      }
      if (body) {
        lines.push('- 正文：');
        body.split('\n').forEach((b) => lines.push(`  ${b}`));
      }
      lines.push('');
    });
  }
  return lines.join('\n').trimEnd() + '\n';
}

/**
 * 解析导入文本：JSON.parse → 校验 { items: Array }，过滤无效 item
 * （无 id / 无 type 的条目丢弃），返回 items 数组。
 * 解析失败或结构不符时抛错（由调用方捕获并提示）。
 * @param {string} text
 * @returns {Array<Object>}
 */
export function parseImport(text) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.items)) {
    throw new Error('导入文件格式不正确：缺少 items 数组');
  }
  return parsed.items.filter(
    (it) => it && typeof it.id !== 'undefined' && it.id !== null && typeof it.type === 'string' && it.type
  );
}
