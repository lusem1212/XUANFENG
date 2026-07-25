// calendar.js —— 月历纯逻辑（无副作用，可单测）
//
// 设计前提：note / diary / event 都是同一个 Item，只是 type 不同。
// 本模块只做「按日期聚合」的纯计算，不碰 UI 与持久化，方便直接单测。

/**
 * 把年月日格式化为 YYYY-MM-DD（与 model.js 的日期格式一致）。
 * @param {number} year  如 2026
 * @param {number} month 1-based 月份（1~12）
 * @param {number} day   日（1~31）
 * @returns {string}
 */
export function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 解析 YYYY-MM-DD 日期字符串。
 * @param {string} dateStr
 * @returns {{year:number, month:number, day:number}|null} 非法返回 null
 */
export function parseYMD(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // 校验日期真实存在（13 月、32 日等会被 Date 归一化后暴露不一致）
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  return { year, month, day };
}

/**
 * 取出某一天的全部 Item（任意 type，含 note/diary/event）。
 * 没有日期（date 为空）的便签不会出现在日历上。
 * @param {Object[]} items
 * @param {string} date YYYY-MM-DD
 * @returns {Object[]}
 */
export function itemsOnDate(items, date) {
  if (!date) return [];
  return (items || []).filter((it) => it.date === date);
}

/**
 * 取出某个月内的全部 Item。
 * 通过「年-月」前缀匹配，自动排除无日期或不在该月的条目。
 * @param {Object[]} items
 * @param {number} year
 * @param {number} month 1-based 月份
 * @returns {Object[]}
 */
export function itemsInMonth(items, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  return (items || []).filter(
    (it) => typeof it.date === 'string' && it.date.startsWith(prefix)
  );
}

/**
 * 构建 6×7 的月历矩阵（共 42 格）。
 * 每月前置空白与后置空白用 null 占位，便于渲染月格时对齐。
 * @param {number} year
 * @param {number} month 1-based 月份
 * @returns {(number|null)[]} 长度恒为 42 的数组
 */
export function buildMonthMatrix(year, month) {
  const firstDay = new Date(year, month - 1, 1);
  const startWeekday = firstDay.getDay(); // 0=周日 … 6=周六
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells = [];
  // 前置空白（上月补位）
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  // 当月日期
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // 后置空白补齐到 6×7 = 42 格
  while (cells.length < 42) cells.push(null);

  return cells;
}

/**
 * 返回某个月内有 Item 的日期（几号）。用于月格上的「有记录」标记。
 * @param {Object[]} items
 * @param {number} year
 * @param {number} month 1-based 月份
 * @returns {Set<number>} 包含「日」数字的集合
 */
export function daysWithItems(items, year, month) {
  const set = new Set();
  for (const it of itemsInMonth(items, year, month)) {
    const d = parseYMD(it.date);
    if (d && d.month === month) set.add(d.day);
  }
  return set;
}

// ----------------------------------------------------------------------------
// 时间段 & 事件排序（与「时间段」相关的唯一真相）
//
// 原先分散在 EventEditor 内部的 PERIODS / parseTitle 已统一迁移至此，
// 避免多处重复定义、保证单一来源。
// ----------------------------------------------------------------------------

// 时间段顺序（唯一真相）
export const PERIODS = ['早上', '上午', '中午', '下午', '晚上'];
// 时间段 → 排序序号
export const PERIOD_ORDER = { '早上': 0, '上午': 1, '中午': 2, '下午': 3, '晚上': 4 };

/**
 * 从 event.title 解析 period + time。
 * title 形如 "上午 09:30"；若不以时间段开头（旧数据自由标题），则整体作为 time 回退，period 置空。
 * @param {string} [title]
 * @returns {{period: string, time: string}}
 */
export function parseTitle(title = '') {
  const m = String(title).match(/^(早上|上午|中午|下午|晚上)(?:\s+(.+))?$/);
  if (m) return { period: m[1], time: (m[2] || '').trim() };
  return { period: '', time: String(title || '').trim() };
}

/**
 * 事件按「时间段序 + 段内时间」升序排序；无时间段者排末尾；返回新数组，不修改入参。
 * @param {Object[]} [events]
 * @returns {Object[]}
 */
export function sortEventsByTime(events = []) {
  const key = (ev) => {
    const { period, time } = parseTitle(ev?.title || '');
    const order = Object.prototype.hasOwnProperty.call(PERIOD_ORDER, period)
      ? PERIOD_ORDER[period]
      : Number.MAX_SAFE_INTEGER;
    return { order, time: time || '' };
  };
  return [...events].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka.order !== kb.order) return ka.order - kb.order;
    return ka.time.localeCompare(kb.time, 'zh-Hans-CN');
  });
}
