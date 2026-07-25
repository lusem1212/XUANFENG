// linkage.js —— 联动核心：根据日记(或任意 date+正文) 找出相关便签
//
// 这是一个「纯函数模块」：只依赖输入参数，不读写数据库、不修改外部状态，
// 因此 QA 可以直接对这里写单元测试。

/**
 * 从文本中提取 #标签（去掉 # 号）。
 * 例：extractTags("周六去 #木工 交底") => ["木工"]
 * @param {string} text
 * @returns {string[]}
 */
export function extractTags(text) {
  if (!text) return [];
  const matches = text.match(/#([^\s#,，。.!?；;：:]+)/g) || [];
  return matches.map((m) => m.slice(1));
}

/**
 * 计算两个日期相差的天数（绝对值）。非法输入返回 null。
 * @param {string} dateA YYYY-MM-DD
 * @param {string} dateB YYYY-MM-DD
 * @returns {number|null}
 */
export function dateDiffDays(dateA, dateB) {
  if (!dateA || !dateB) return null;
  const a = new Date(dateA + 'T00:00:00');
  const b = new Date(dateB + 'T00:00:00');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const ms = Math.abs(a.getTime() - b.getTime());
  return ms / (1000 * 60 * 60 * 24);
}

/**
 * 判断一条 note 与给定 diary 的相关度并给出命中的原因。
 *
 * 命中规则（满足任一即相关）：
 *   1) 标签重叠：diary 正文中出现的标签 或 diary 自身的 tags(锚点标签)
 *      与 note.tags 有交集
 *      —— 既支持 #标签 写法，也支持正文直接包含 note.tags 中的词，
 *         并额外支持 anchor.tags(如事件的「工地项目」标签) 参与匹配
 *   2) 日期邻近（加分）：note.date 存在且与 diary.date 相差 ≤ 7 天
 *
 * 打分：命中越多分越高；日期邻近在已命中的基础上再加分，用于排序。
 * （v2 起匹配完全基于标签。）
 *
 * @param {Object} diary 至少包含 { date, title, body }
 * @param {Object} note  至少包含 { tags, date }
 * @returns {{score: number, reasons: string[]}}
 */
export function scoreNoteForDiary(diary, note) {
  let score = 0;
  const reasons = [];

  // 把日记正文与标题拼到一起作为检索文本
  const diaryText = `${diary.body || ''} ${diary.title || ''}`;
  // 从正文提取 #标签
  const diaryTags = extractTags(diary.body || '');
  // 锚点自身的标签(如便签/事件里的「工地项目」等,存在 item.tags 而非正文的 #标签)
  // 也要参与匹配 —— 否则共享同一工地项目标签的便签与事件无法联动。
  const anchorTags = Array.isArray(diary.tags) ? diary.tags : [];
  const anchorTagSet = new Set([...diaryTags, ...anchorTags]);

  // 规则 1：标签重叠
  const noteTags = note.tags || [];
  const overlap = noteTags.filter(
    (t) => anchorTagSet.has(t) || diaryText.includes(t)
  );
  if (overlap.length > 0) {
    score += overlap.length * 3; // 每命中一个标签 +3
    reasons.push(`标签重叠：${overlap.join('、')}`);
  }

  // 规则 2：日期邻近（加分项）
  const diff = dateDiffDays(note.date, diary.date);
  if (diff !== null && diff <= 7) {
    score += 2; // 日期临近，在已命中的基础上加成
    reasons.push(`日期邻近：${Math.round(diff)} 天`);
  }

  return { score, reasons };
}

/**
 * 联动主函数：返回与 diary 相关的 note 列表（按相关性从高到低排序）。
 *
 * @param {Object} diary 至少包含 { date, title, body }
 * @param {Object[]} items 全部 Item（函数内部会过滤出 type==='note'）
 * @returns {Object[]} 相关的 note 对象数组（已排序）
 */
export function linkRelatedNotes(diary, items) {
  if (!diary || !items) return [];
  const notes = items.filter((it) => it.type === 'note');

  return notes
    .map((note) => ({ note, ...scoreNoteForDiary(diary, note) }))
    .filter((entry) => entry.score > 0) // 只保留相关（score>0）的
    .sort((a, b) => b.score - a.score) // 分数高的排前面
    .map((entry) => entry.note);
}
