// search.js —— 便签筛选（纯函数，可单测）
//
// filterNotes 根据 关键词 / 标签 两个条件对便签列表做过滤。
// （v2 起关键词对 body 同时兼容「字符串」与「条目数组」。）

/**
 * 按条件筛选便签。
 *
 * @param {Object[]} notes 便签数组（type==='note' 的 Item）
 * @param {Object} opts
 * @param {string} [opts.keyword] 关键词，匹配 标题/正文/标签（大小写不敏感）
 * @param {string[]} [opts.tags] 标签数组，note 命中其中任意一个即保留
 * @returns {Object[]} 过滤后的便签数组
 */
export function filterNotes(notes, { keyword = '', tags = [] } = {}) {
  const kw = (keyword || '').trim().toLowerCase();
  const tagList = (tags || []).filter(Boolean);

  return (notes || []).filter((note) => {
    // 关键词：任一字段包含即过
    if (kw) {
      // body 兼容数组 / 字符串：数组时把各条目 text 拼起来
      const bodyText = Array.isArray(note.body)
        ? note.body.map((e) => (e && e.text) || '').join(' ')
        : note.body || '';
      const haystack = [
        note.title,
        bodyText,
        (note.tags || []).join(' '),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(kw)) return false;
    }

    // 标签：命中任意一个即过（满足「或」关系，更符合检索直觉）
    if (tagList.length > 0) {
      const noteTags = note.tags || [];
      const hit = tagList.some((t) => noteTags.includes(t));
      if (!hit) return false;
    }

    return true;
  });
}
