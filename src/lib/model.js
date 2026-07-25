// model.js —— 统一数据模型与工具函数（纯函数，无副作用，可单测）
//
// 设计核心：便签(note)、日记(diary)、日历事件(event) 都是同一个 Item，
// 只是 type 不同。"联动" 是指按「日期邻近 + 标签重叠」把相关条目聚到一起。
// （v2 起联动与检索完全基于标签，不再有单独的匹配维度。）

// Item 的三种类型常量
export const ITEM_TYPES = {
  NOTE: 'note', // 便签
  DIARY: 'diary', // 日记
  EVENT: 'event', // 日历事件
};

/**
 * 生成一个唯一 id。优先使用浏览器原生 crypto.randomUUID，
 * 老环境降级为随机字符串，保证任何情况下都能拿到 id。
 * @returns {string}
 */
export function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(16).slice(2);
}

/**
 * 解析标签输入。
 * 支持用 逗号/空格/分号 分隔，并自动去掉开头的 # 号。
 * 例：parseTags("木工, 工地 吊顶") => ["木工","工地","吊顶"]
 * @param {string|string[]} input
 * @returns {string[]}
 */
export function parseTags(input) {
  if (Array.isArray(input)) {
    // 已经是数组：清洗并去空
    return input.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean);
  }
  if (!input) return [];
  return String(input)
    .split(/[\s,，;；]+/) // 按空白/逗号/中文逗号/分号切分
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean);
}

/**
 * 创建并补全一个 Item 对象。
 * 所有字段都有默认值，保证落库结构一致。
 *
 * body 字段说明：
 * - 便签(note)：条目数组 [{ time: 'HH:MM', text: string, images: string[] }, ...]
 *   其中 images 为图片 ID 数组，引用 images store 中的记录，默认 []
 * - 日记(diary)/事件(event)：字符串
 *
 * done 字段说明：
 * - 仅便签(note)使用 done 语义，标记便签是否已完成
 * - 默认 false
 *
 * @param {Object} fields
 * @returns {Object} 完整的 Item
 */
export function createItem({
  type,
  date = '',
  title = '',
  body = '',
  tags = [],
  links = [],
  done = false,
  plan = '', // 事件专属：当日工作计划（自由文本）
} = {}) {
  return {
    id: createId(),
    type, // 'note' | 'diary' | 'event'
    date: date || '', // YYYY-MM-DD；便签可为空(长期有效)
    title: title || '', // 一句话标题
    body: body || '', // 详情正文（便签为条目数组，其余为字符串）
    tags: parseTags(tags), // 标签数组（不带 # 号存储）
    links: Array.isArray(links) ? links : [], // 手动关联的其他 item id
    done: done === true, // 是否已完成（仅便签使用）
    plan: plan || '', // 当日工作计划（事件专属，默认空串）
    createdAt: Date.now(), // 创建时间戳
  };
}

/**
 * 返回今天的日期字符串 YYYY-MM-DD（本地时区）。
 * @returns {string}
 */
export function today() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
