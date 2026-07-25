// WorkPlanPanel.jsx —— 当日工作计划面板
//
// 展示某一天所有「事件(event)」类型、且带有非空工作计划(plan)的条目，
// 按「时间段序 + 段内时间」升序排列（复用 calendar.js 的 sortEventsByTime）。
//
// 设计取舍：
//   - 只展示带 plan 的事件，不展示便签 / 日记，也不依赖 linkage.js / anchor；
//   - 列表项复用现有 li 视觉风格（圆角卡片 + 标签 chip），时间部分用 font-mono 科技感呈现；
//   - plan 正文保留换行（whitespace-pre-line）。
//
// props:
//   date         —— 选中的日期 YYYY-MM-DD
//   items        —— 全部 Item
//   onEditEvent  —— 点击「编辑」时回调，接收该事件对象（打开 EventEditor）
import { useMemo } from 'react';
import { itemsOnDate, sortEventsByTime, parseTitle } from '../lib/calendar.js';

export default function WorkPlanPanel({ date, items, onEditEvent }) {
  // 取当天事件 → 过滤出带非空 plan 的 → 按时间段+时间排序
  const events = useMemo(() => {
    const dayItems = itemsOnDate(items, date);
    const withPlan = dayItems.filter(
      (it) => it.type === 'event' && typeof it.plan === 'string' && it.plan.trim() !== ''
    );
    return sortEventsByTime(withPlan);
  }, [items, date]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-cp-border dark:bg-cp-surface">
      <h3 className="mb-2 text-sm font-semibold tracking-wide text-slate-700 dark:text-slate-200">
        当日工作计划
        <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">
          （共 {events.length} 条）
        </span>
      </h3>

      {events.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          这一天还没有填写工作计划的事件。
        </p>
      ) : (
        <ul className="space-y-2">
          {events.map((it) => {
            // 解析标题中的时间段与时间，时间部分用等宽字体强调
            const { period, time } = parseTitle(it.title || '');
            return (
              <li
                key={it.id}
                className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-cp-border dark:bg-cp-surface/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {period ? (
                      <>
                        {period}
                        {time ? <span className="font-mono"> {time}</span> : null}
                      </>
                    ) : time ? (
                      <span className="font-mono">{time}</span>
                    ) : (
                      (it.title || '未命名')
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => onEditEvent?.(it)}
                    className="shrink-0 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
                  >
                    编辑
                  </button>
                </div>

                {/* 工作计划正文（保留换行） */}
                <p className="mt-1 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">
                  {it.plan}
                </p>

                {/* 标签 chip（复用现有 #标签 渲染风格） */}
                {it.tags?.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {it.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-600"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
