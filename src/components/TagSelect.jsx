// TagSelect.jsx —— 可选择的标签控件（chip 风格，无需手填）
//
// 受控组件：value 为 string[]，onChange 回传新的 string[]。
// 维护一个预设标签池（默认一组装修/工程常用标签），并合并用户新增的标签
// （持久化在 localStorage key `nd_preset_tags`，挂载时读取，新增时写回）。
// 预设标签以可点选 chip 展示：已选 → 填充态（bg-slate-900 text-white），
// 未选 → bg-slate-100；点击切换是否选中。
// 另提供一个「＋ 添加标签」按钮，通过 window.prompt 输入（支持逗号/空格/；分隔多个），
// 把新标签加入预设池（持久化）并选中。
import { useState } from 'react';

// 默认预设标签池（装修 / 工程常见分类）
const DEFAULT_PRESET = [
  '木工',
  '工地',
  '水电',
  '泥工',
  '油漆',
  '吊顶',
  '材料',
  '交底',
  '采购',
  '验收',
  '设计',
  '软装',
  '预算',
  '工期',
];

// localStorage 持久化键
const STORAGE_KEY = 'nd_preset_tags';

/**
 * 读取持久化的预设标签池，并与默认池合并、去重。
 * 读取失败（无 localStorage / 解析异常）时回退为默认池。
 * @returns {string[]}
 */
function readPreset() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return Array.from(new Set([...DEFAULT_PRESET, ...parsed.map(String)]));
      }
    }
  } catch {
    // 忽略读取 / 解析异常，回退默认池
  }
  return [...DEFAULT_PRESET];
}

/**
 * 把预设池持久化到 localStorage。
 * @param {string[]} preset
 */
function writePreset(preset) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preset));
  } catch {
    // 忽略写入异常（如隐私模式禁用 localStorage）
  }
}

export default function TagSelect({ value = [], onChange }) {
  const [preset, setPreset] = useState(() => readPreset());

  // 切换某个标签的选中态（增删到 value 数组）
  function toggle(tag) {
    if (value.includes(tag)) {
      onChange(value.filter((t) => t !== tag));
    } else {
      onChange([...value, tag]);
    }
  }

  // 「＋ 添加标签」：prompt 输入，逗号/空格/； 切分并 trim，加入预设池并选中
  function handleAdd() {
    const input = window.prompt('输入标签名称（可用逗号 / 空格 / ；分隔多个）');
    if (!input) return;
    const parts = input
      .split(/[\s,，;；]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    // 新标签并入预设池并持久化
    const merged = Array.from(new Set([...preset, ...parts]));
    setPreset(merged);
    writePreset(merged);

    // 同时选中这些新标签
    const next = Array.from(new Set([...value, ...parts]));
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {preset.map((tag) => {
          const selected = value.includes(tag);
          return (
            <button
              type="button"
              key={tag}
              onClick={() => toggle(tag)}
              className={
                'rounded-full px-3 py-1 text-sm transition ' +
                // C2: 选中态深色下改为浅底深字（与全站主按钮一致），确保深浅均明显区分
                (selected
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600')
              }
            >
              {tag}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={handleAdd}
        className="rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        ＋ 添加标签
      </button>
    </div>
  );
}
