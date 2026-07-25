// EventEditor.jsx —— 日历事件新建/编辑表单（弹层）
//
// 基于 NoteEditor 的结构改写，但落库 type 固定为 'event'，且「日期」为必填。
// 便签/日记/事件本质是同一份 Item，只是 type 不同，所以这里直接复用统一模型。
//
// 标题改造：取消自由标题输入框，改为「时间段（早上/上午/中午/下午/晚上）+ 具体时间」，
// 落库 title 组合为 `${period} ${time}`.trim()（如 "上午 09:30"）。
//
// props:
//   initial     —— 编辑时传入的 event 对象；新建时传 null 或 {}
//   defaultDate —— 新建时默认的日期（通常为选中的某天）；也可被 initial.date 覆盖
//   onSave      —— 保存回调，接收完整 event 对象（由父级 saveItem upsert 落库）
//   onCancel    —— 取消回调
//   onDelete    —— 删除回调（仅编辑态显示）；新建态不传
import { useState, useEffect } from 'react';
import { createId, today } from '../lib/model.js';
import TagSelect from './TagSelect.jsx';
import { DEFAULT_PRESET_SET, getSiteProjects, addSiteProjectName, removeSiteProjectName } from '../lib/siteProjects.js';
// 时间段常量与标题解析统一从 calendar.js 引入（唯一真相，避免重复定义）
import { parseTitle, PERIODS } from '../lib/calendar.js';

/**
 * 解析工地项目输入串：支持逗号 / 空格 / 中文逗号 / 全角或半角分号（，；;）分隔，
 * split 后 trim、过滤空串，返回去重后的名称数组。
 * @param {string} [raw]
 * @returns {string[]}
 */
function parseSiteProjects(raw) {
  return String(raw)
    .split(/[\s,，;；]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export default function EventEditor({ initial, defaultDate = '', onSave, onCancel, onDelete }) {
  const parsed = parseTitle(initial?.title || '');
  const [period, setPeriod] = useState(parsed.period);
  const [time, setTime] = useState(parsed.time);
  const [body, setBody] = useState(initial?.body || '');
  // tags 是“唯一真相”来源：工地项目只是 tags 中“非默认预设”的一部分，不单独存储。
  const [tags, setTags] = useState(initial?.tags || []);
  // 当日工作计划（事件专属字段）；旧数据无 plan 时回退为空串
  const [plan, setPlan] = useState(initial?.plan || '');
  const [siteInput, setSiteInput] = useState('');
  // 事件必须有日期：优先用传入事件自身的日期，其次用默认日期，最后退回今天
  const [date, setDate] = useState(initial?.date || defaultDate || today());
  // 词库候选删除后强制刷新（removeSiteProjectName 直接操作 localStorage，不会触发重渲染）
  const [forceRefresh, setForceRefresh] = useState(0);

  // 工地项目 = tags 中不属于默认预设的子集（派生值，不单独维护 state，避免双写去同步）。
  const siteProjects = tags.filter((t) => !DEFAULT_PRESET_SET.has(t));

  const isEdit = Boolean(initial && initial.id);

  // 打开或切换 initial 时，把值同步进表单
  useEffect(() => {
    const p = parseTitle(initial?.title || '');
    setPeriod(p.period);
    setTime(p.time);
    setBody(initial?.body || '');
    setTags(initial?.tags || []);
    setPlan(initial?.plan || '');
    setSiteInput('');
    setDate(initial?.date || defaultDate || today());
  }, [initial, defaultDate]);

  // 添加工地项目：解析为多个名称，写入共享词库（持久化）再并入 tags（唯一真相）。
  function addSiteProject(raw) {
    const names = parseSiteProjects(raw);
    if (names.length === 0) return;
    names.forEach((n) => addSiteProjectName(n)); // 持久化到共享词库 → 便签可选
    setTags(Array.from(new Set([...tags, ...names])));
    setSiteInput('');
  }

  // 删除单个工地项目：直接从 tags 中移除该项目名（唯一真相）。
  function removeSiteProject(name) {
    setTags(tags.filter((t) => t !== name));
  }

  function handleSubmit(e) {
    e.preventDefault();
    // 事件必须有日期，缺失则拦截（这也是日历事件存在的必要条件）
    if (!date) {
      window.alert('请先选择事件日期。');
      return;
    }
    // 组合标题：时间段 + 具体时间
    const title = `${period} ${time}`.trim();
    // tags 已是唯一真相（工地项目已并入），这里再做一次去重合并并作为 item.tags 落库。
    const mergedTags = Array.from(new Set([...tags, ...siteProjects]));
    const item = {
      id: initial?.id || createId(), // 新建时生成 id
      type: 'event',
      date, // 必填：事件必须落在某个日期上
      title,
      body,
      plan: (plan || '').trim(),
      tags: mergedTags,
      links: initial?.links || [], // 暂未开放手动关联，保留结构兼容
      createdAt: initial?.createdAt || Date.now(),
    };
    onSave(item);
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4 dark:bg-black/50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-cp-surface"
      >
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-50">
          {isEdit ? '编辑事件' : '新建事件'}
        </h2>

        {/* 时间段 */}
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">时间段</label>
        <div className="mb-3 flex gap-2">
          {PERIODS.map((p) => {
            const active = period === p;
            return (
              <button
                type="button"
                key={p}
                onClick={() => setPeriod(p)}
                className={
                  'flex-1 rounded-md border px-3 py-2 text-sm transition ' +
                  (active
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-cp-accent dark:bg-cp-surface dark:text-cp-accent'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700')
                }
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* 具体时间 */}
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">具体时间</label>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-slate-500 dark:border-cp-border dark:bg-cp-surface dark:text-cp-text dark:focus:border-cp-accent"
        />

        {/* 正文 */}
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">正文</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="详细说明…（可写 #标签 以便自动关联相关便签，例如 #木工）"
          rows={4}
          className="mb-3 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-cp-border dark:bg-cp-surface dark:text-cp-text dark:focus:border-cp-accent"
        />

        {/* 当日工作计划 */}
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">当日工作计划</label>
        <textarea
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          placeholder="今天这趟要落实的工作，例如：上午和木工确认吊顶标高；下午材料进场验收"
          rows={3}
          className="mb-3 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-cp-border dark:bg-cp-surface dark:text-cp-text dark:focus:border-cp-accent"
        />

        {/* 事件 */}
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">事件</label>
        <TagSelect value={tags} onChange={setTags} />

        {/* 工地项目（快捷输入框：所填名称会自动作为 tag 并入） */}
        <label className="mb-1 mt-3 block text-sm font-medium text-slate-700 dark:text-slate-200">
          工地项目
          <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">
            （自动成为事件标签）
          </span>
        </label>
        {/* 词库候选：跨编辑器共享的历史工地项目，点击可快速加入/移出 tags */}
        {(() => {
          void forceRefresh; // 删除词库后触发重新读取候选列表
          const candidates = getSiteProjects();
          if (candidates.length === 0) return null;
          return (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 dark:text-slate-500">词库候选：</span>
              {candidates.map((name) => {
                const selected = tags.includes(name);
                return (
                  <span key={name} className="inline-flex items-center">
                    <button
                      type="button"
                      onClick={() =>
                        selected
                          ? setTags(tags.filter((t) => t !== name))
                          : setTags(Array.from(new Set([...tags, name])))
                      }
                      className={
                        'rounded-full px-2.5 py-1 text-xs transition ' +
                        (selected
                          ? 'bg-amber-500 text-white hover:bg-amber-400 dark:bg-amber-600 dark:hover:bg-amber-500'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600')
                      }
                    >
                      {name}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`确定从工地项目词库中删除"${name}"吗？`)) {
                          removeSiteProjectName(name);
                          setForceRefresh((v) => v + 1);
                        }
                      }}
                      className="ml-0.5 text-xs text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400"
                      aria-label={`从词库删除 ${name}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          );
        })()}
        <div className="mb-2 flex gap-2">
          <input
            type="text"
            value={siteInput}
            onChange={(e) => setSiteInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSiteProject(siteInput);
              }
            }}
            placeholder="输入工地项目，用逗号/空格分隔，可一次添加多个"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-cp-border dark:bg-cp-surface dark:text-cp-text dark:focus:border-cp-accent"
          />
          <button
            type="button"
            onClick={() => addSiteProject(siteInput)}
            className="rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-400 dark:bg-amber-600 dark:hover:bg-amber-500"
          >
            ＋ 添加
          </button>
        </div>
        {siteProjects.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {siteProjects.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
              >
                {name}
                <button
                  type="button"
                  onClick={() => removeSiteProject(name)}
                  className="leading-none text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
                  aria-label={`删除工地项目 ${name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* 日期（必填） */}
        <label className="mb-1 mt-3 block text-sm font-medium text-slate-700 dark:text-slate-200">日期（必填）</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-cp-border dark:bg-cp-surface dark:text-cp-text dark:focus:border-cp-accent"
        />

        {/* 操作按钮 */}
        <div className="flex items-center justify-between">
          <div>
            {isEdit && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(initial)}
                className="rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
              >
                删除
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-md bg-cp-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-cp-accent dark:hover:opacity-90"
            >
              保存
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
