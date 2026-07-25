// siteProjects.js —— 「工地项目」独立词库（localStorage 持久化）
//
// 该模块被 EventEditor（日历事件）、NoteEditor（便签）共用，提供工地项目候选词库的
// 读写与历史同步。工地项目词库独立存储在 localStorage 键 `nd_site_projects`，
// 与 TagSelect 的标签池 `nd_preset_tags` 完全分离、互不污染：
//   - 用户在任一编辑器新增的工地项目，只写进 `nd_site_projects`；
//   - TagSelect 只读写 `nd_preset_tags`，不会出现工地项目词；
//   - 日历事件与便签共用同一份 `nd_site_projects`，实现跨编辑器工地项目词库互通。
//
// 设计要点：
//   - DEFAULT_PRESET 为「标准分类」标签（木工/水电/...），既会出现在 TagSelect 池里，
//     也可能出现在 item.tags 里，但不会被当作「工地项目」候选词。
//   - 工地项目候选词 = item.tags 中「非默认预设」的项，去重后存入 nd_site_projects。
//   - syncTagsFromItems 还兼任一次性迁移：清理上一轮误写入 nd_preset_tags 的工地项目词，
//     使 TagSelect 标签池恢复纯净（只保留默认预设 + 用户在 TagSelect 手动加且未在
//     任何 item 用过的标签）。迁移幂等，多次调用不重复、不丢数据。

// 标准分类标签：属于“标准分类”的词，不会作为“工地项目”候选词展示，
// 但依旧是普通 tag，保留在 tags / TagSelect 池中。
export const DEFAULT_PRESET = [
  '木工', '工地', '水电', '泥工', '油漆', '吊顶', '材料',
  '交底', '采购', '验收', '设计', '软装', '预算', '工期',
];
export const DEFAULT_PRESET_SET = new Set(DEFAULT_PRESET);

// 工地项目独立词库在 localStorage 中的键名（与 TagSelect 的 nd_preset_tags 分离）。
const SITE_PROJECTS_KEY = 'nd_site_projects';

/**
 * 安全读取某个 localStorage 键下的字符串数组。
 * 读取失败 / 解析异常 / 非数组时安全降级为空数组；并过滤掉非字符串项以保证健壮性。
 * @param {string} key
 * @returns {string[]}
 */
function readArray(key) {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * 读取工地项目词库（只读 nd_site_projects，独立词库）。
 * 用于“工地项目”候选行，供日历事件 / 便签编辑器共用。
 * 任何读取失败或数据异常都安全降级为空数组。
 * @returns {string[]}
 */
export function getSiteProjects() {
  return readArray(SITE_PROJECTS_KEY);
}

/**
 * 把一个新工地项目名写入独立词库（去重），返回最新数组。
 * 只写 nd_site_projects，不碰 nd_preset_tags。
 * @param {string} name
 * @returns {string[]}
 */
export function addSiteProjectName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    return getSiteProjects();
  }
  const list = getSiteProjects();
  if (!list.includes(name)) {
    const next = [...list, name];
    try {
      localStorage.setItem(SITE_PROJECTS_KEY, JSON.stringify(next));
    } catch {
      // 忽略写入异常（如隐私模式禁用 localStorage）
    }
    return next;
  }
  return list;
}

/**
 * 从工地项目词库中永久删除一个名称（写入 nd_site_projects）。
 * 只删词库，不影响已在 item.tags 中的同名标签（那是 item 自身的数据）。
 * @param {string} name
 * @returns {string[]} 删除后的最新词库数组
 */
export function removeSiteProjectName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    return getSiteProjects();
  }
  const list = getSiteProjects();
  const next = list.filter((t) => t !== name);
  try {
    localStorage.setItem(SITE_PROJECTS_KEY, JSON.stringify(next));
  } catch {
    // 忽略写入异常
  }
  return next;
}

/**
 * 把一批历史 Item 的标签同步进工地项目独立词库（合并去重后写回 nd_site_projects），
 * 并顺带清理上一轮误写入 nd_preset_tags 的工地项目词（一次性迁移，幂等）。
 *
 * 同步规则：只把「非默认预设」的标签当作工地项目词写入 nd_site_projects；
 * 默认预设词（木工/水电/...）不进工地项目词库。
 *
 * 迁移清理规则（保守、幂等）：从 nd_preset_tags 中移除「非默认预设 且 在历史
 * item.tags 中出现过」的项；保留默认预设项与「用户在 TagSelect 手动加但未在任何
 * item 用过」的标签，避免误删。
 *
 * 供 useItems 的 refresh() 在加载/写库后调用。
 * @param {Array<{tags?: *}>} items
 * @returns {string[]} 同步后的工地项目词库
 */
export function syncTagsFromItems(items) {
  // 1) 收集历史 item.tags 中所有合法、非空的标签
  const historicTags = new Set();
  if (Array.isArray(items)) {
    for (const it of items) {
      if (it && Array.isArray(it.tags)) {
        for (const t of it.tags) {
          if (typeof t === 'string' && t.trim()) {
            historicTags.add(t.trim());
          }
        }
      }
    }
  }

  // 2) 「非默认预设」的历史标签 → 工地项目词库（合并去重写回 nd_site_projects）
  const historicNonPreset = new Set();
  for (const t of historicTags) {
    if (!DEFAULT_PRESET_SET.has(t)) {
      historicNonPreset.add(t);
    }
  }
  const existingSite = readArray(SITE_PROJECTS_KEY);
  const mergedSite = Array.from(new Set([...existingSite, ...historicNonPreset]));
  try {
    localStorage.setItem(SITE_PROJECTS_KEY, JSON.stringify(mergedSite));
  } catch {
    // 忽略写入异常
  }

  // 3) 迁移清理 nd_preset_tags：移除「非默认预设 且 在历史 item.tags 中出现过」的项
  //    （保守策略：不误删默认预设，也不误删用户手动加但未在 item 用过的标签）
  //    仅用于清理上一轮把工地项目误并入 TagSelect 池的污染，与工地项目存储无关。
  const PRESET_TAGS_KEY = 'nd_preset_tags';
  const presetTags = readArray(PRESET_TAGS_KEY);
  if (presetTags.length > 0) {
    const cleanedPreset = presetTags.filter(
      (t) => DEFAULT_PRESET_SET.has(t) || !historicNonPreset.has(t)
    );
    // 仅在确实有变化时才写回，减少无谓写入，并保证幂等
    if (cleanedPreset.length !== presetTags.length) {
      try {
        localStorage.setItem(PRESET_TAGS_KEY, JSON.stringify(cleanedPreset));
      } catch {
        // 忽略写入异常
      }
    }
  }

  return mergedSite;
}
