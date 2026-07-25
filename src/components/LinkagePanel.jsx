// LinkagePanel.jsx —— 「关联注意事项」面板：展示与锚点相关的便签
//
// props:
//   anchor —— 锚点 Item（diary 或 event，可能为 null）；内部复用联动算法
//   items  —— 全部 Item（用于在其中查找相关 note）
import { useMemo } from 'react';
import { linkRelatedNotes, scoreNoteForDiary } from '../lib/linkage.js';
import { formatBody } from '../lib/body.js';

export default function LinkagePanel({ anchor, items }) {
  // 计算相关便签（纯函数，按相关性排序）
  const related = useMemo(
    () => (anchor ? linkRelatedNotes(anchor, items) : []),
    [anchor, items]
  );

  // 锚点为空（还没写过日记/事件）：提示先建立锚点
  if (!anchor) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">关联注意事项</h3>
        <p className="text-sm text-slate-400 dark:text-slate-500">
          选择或新建日记 / 事件后，这里会自动列出相关的便签（到点不遗忘）。
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
        关联注意事项
        <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">
          （按相关性排序，共 {related.length} 条）
        </span>
      </h3>

      {related.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">这一天暂无关联到的便签。</p>
      ) : (
        <ul className="space-y-2">
          {related.map((note) => {
            // 重新计算命中原因，用于展示「为什么关联」
            const { reasons } = scoreNoteForDiary(anchor, note);
            const bodyText = formatBody(note.body);
            return (
              <li
                key={note.id}
                className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-700/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {note.title || '未命名'}
                  </span>
                  {note.date && (
                    <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                      {note.date}
                    </span>
                  )}
                </div>
                {bodyText && (
                  <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">
                    {bodyText}
                  </p>
                )}
                {note.tags?.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {note.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-600"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                  关联原因：{reasons.join('；')}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
