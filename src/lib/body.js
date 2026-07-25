// body.js —— note.body 渲染兼容工具
//
// 便签正文 body 在新版中为「条目数组」：
//   [{ time: 'MM-DD HH:MM', text: string, images: string[] }, ...]
// 旧数据可能为 'HH:MM' 字符串或纯字符串。此工具把任意形态的 body 统一格式化为可展示的
// 字符串，供列表 / 详情 / 关联面板渲染（配合 line-clamp / whitespace-pre-line 使用）。
//
// 注意：body 条目可能包含 images 字段（string[]），存储引用 images store 的图片 ID。
// formatBody 仅渲染 time + text，图片由 EntryImages 组件独立管理，此处忽略 images。
//
// v3(C3) 新增：formatEntryTime(date) 统一生成 'MM-DD HH:MM' 条目时间（月日取自真实当前日期）。

/**
 * 将 body 统一格式化为可展示字符串。
 * - 数组：每条渲染为 "[time] text"（time 为空则省略时间），条目间以换行分隔；
 *   注意：body 条目可能包含 images 字段（string[]），但 formatBody 仅渲染 time+text，
 *   图片由 EntryImages 组件独立管理，此处忽略。
 * - 字符串：原样返回（兼容旧数据）；
 * - 其它（undefined / null / 空）：返回 ''。
 * @param {string|Array<{time?:string,text?:string,images?:string[]}>|*} body
 * @returns {string}
 */
export function formatBody(body) {
  if (Array.isArray(body)) {
    return body
      .map((entry) => {
        const time = typeof entry?.time === 'string' ? entry.time.trim() : '';
        const text = typeof entry?.text === 'string' ? entry.text.trim() : '';
        if (time) return `[${time}] ${text}`.trim();
        return text;
      })
      .filter((line) => line.length > 0)
      .join('\n');
  }
  if (typeof body === 'string') return body;
  return '';
}

/**
 * 将 Date 格式化为条目时间字符串 'MM-DD HH:MM'（本地时区，不足两位补零）。
 * 月日取自传入 Date 的真实当前日期；供 NoteEditor.addEntry 生成新条目时间。
 * 设计为纯函数，默认取当前时间，便于测试时传入固定 Date。
 * 注意：函数只读时间，不接收外部可改写的时区/格式参数，保持单一格式真相。
 * @param {Date} [date] 目标时间，缺省取当前时间
 * @returns {string} 如 '03-15 14:30'
 */
export function formatEntryTime(date = new Date()) {
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const DD = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${MM}-${DD} ${hh}:${mm}`;
}
