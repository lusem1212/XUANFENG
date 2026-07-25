// DayDetail.jsx —— 某天详情：聚合当天所有 Item，并展示当日工作计划面板
//
// 日记的「写 / 看」已整合进此处（去掉独立「日记」页）：
//   - 当天没有日记时，提供「✍️ 写今日日记」入口（空状态与有内容但无日记时都会出现）；
//   - 当天已有日记时，在分组里照常展示，并可直接「编辑」（复用 DiaryEditor，预填内容）；
//   - 日记条目同样支持「删除」（走已有的 onDeleteItem）。
// 当日工作计划面板(WorkPlanPanel) 取代原 LinkagePanel，汇总当天带 plan 的事件。
//
// props:
//   date         —— 选中的日期 YYYY-MM-DD
//   items        —— 全部 Item
//   onEditEvent  —— 编辑某条事件（打开 EventEditor）
//   onDeleteItem —— 删除某条 Item（来自 useItems）
//   onSaveDiary  —— 保存当天日记（来自 useItems，一天一条 upsert）
import { useState, useMemo } from 'react';
import { itemsOnDate, sortEventsByTime } from '../lib/calendar.js';
import { ITEM_TYPES, today } from '../lib/model.js';
import { formatBody } from '../lib/body.js';
import WorkPlanPanel from './WorkPlanPanel.jsx';
import DiaryEditor from './DiaryEditor.jsx';

// 分组顺序与中文标签
const GROUP_ORDER = [ITEM_TYPES.EVENT, ITEM_TYPES.DIARY, ITEM_TYPES.NOTE];
const TYPE_LABEL = {
  [ITEM_TYPES.EVENT]: '事件',
  [ITEM_TYPES.DIARY]: '日记',
  [ITEM_TYPES.NOTE]: '便签',
};

export default function DayDetail({ date, items, onEditEvent, onDeleteItem, onSaveDiary }) {
  // 当天所有 Item（含任意 type）
  const dayItems = useMemo(() => itemsOnDate(items, date), [items, date]);

  // 按 type 分组
  const grouped = useMemo(() => {
    const map = { [ITEM_TYPES.EVENT]: [], [ITEM_TYPES.DIARY]: [], [ITEM_TYPES.NOTE]: [] };
    for (const it of dayItems) {
      if (map[it.type]) map[it.type].push(it);
    }
    return map;
  }, [dayItems]);

  // 当天是否已有日记（一天一条日记）
  const existingDiary = grouped[ITEM_TYPES.DIARY][0] || null;

  // 日记编辑器状态：diaryEditorOpen 控制弹层；editingDiary 为 null 表示新建，否则为待编辑的日记
  const [diaryEditorOpen, setDiaryEditorOpen] = useState(false);
  const [editingDiary, setEditingDiary] = useState(null);

  function openWriteDiary() {
    setEditingDiary(null); // 新建：不预填
    setDiaryEditorOpen(true);
  }
  function openEditDiary(diary) {
    setEditingDiary(diary); // 编辑：预填该日记
    setDiaryEditorOpen(true);
  }
  function closeDiaryEditor() {
    setDiaryEditorOpen(false);
    setEditingDiary(null);
  }
  function handleSaveDiary(payload) {
    // payload: { date, title, body, tags }；由 useItems.saveDiary 保证一天一条
    onSaveDiary(payload);
    closeDiaryEditor();
  }

  // 没有任何记录：友好空状态（仍提供写日记入口）
  if (dayItems.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-slate-400 dark:border-cp-border dark:bg-cp-surface dark:text-slate-500">
          <p className="text-sm">{date} 还没有记录。</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            在左侧点「+ 新建事件」，或写下今天的日记。
          </p>
        </div>

        {/* 空状态也展示当日工作计划面板（空提示） */}
        <WorkPlanPanel date={date} items={items} onEditEvent={onEditEvent} />

        {/* 日记编辑器弹层 */}
        {diaryEditorOpen && (
          <DiaryEditor
            initial={editingDiary}
            defaultDate={date}
            onSave={handleSaveDiary}
            onCancel={closeDiaryEditor}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          当日工作计划列表
          <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">
            共 {dayItems.length} 条
          </span>
        </h2>
      </div>

      {/* 各类型分组列表 */}
      {GROUP_ORDER.map((type) =>
        grouped[type].length === 0 ? null : (
          <section key={type} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-cp-border dark:bg-cp-surface">
            <h3 className="mb-2 text-sm font-semibold tracking-wide text-slate-700 dark:text-slate-200">
              {TYPE_LABEL[type]}
              <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">
                （{grouped[type].length}）
              </span>
            </h3>
            <ul className="space-y-2">
              {(type === ITEM_TYPES.EVENT ? sortEventsByTime(grouped[type]) : grouped[type]).map((it) => {
                const bodyText = formatBody(it.body);
                const isPast = type === ITEM_TYPES.EVENT && it.date && it.date < today();
                return (
                  <li
                    key={it.id}
                    onDoubleClick={type === ITEM_TYPES.EVENT ? () => onEditEvent(it) : undefined}
                    title={type === ITEM_TYPES.EVENT ? '双击编辑' : undefined}
                    className={
                      'rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-cp-border dark:bg-cp-surface/50 ' +
                      (type === ITEM_TYPES.EVENT ? 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-600' : '') +
                      (isPast ? ' opacity-60' : '')
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={'font-medium ' + (isPast ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-800 dark:text-slate-100')}>
                        {it.title || '未命名'}
                      </span>
                    </div>
                    {bodyText && (
                      <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">
                        {bodyText}
                      </p>
                    )}
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
                    {/* 操作：事件 / 日记可编辑，所有条目可删除 */}
                    <div className="mt-2 flex gap-3 text-sm">
                      {type === ITEM_TYPES.EVENT && (
                        <button
                          onClick={() => onEditEvent(it)}
                          className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
                        >
                          编辑
                        </button>
                      )}
                      {type === ITEM_TYPES.DIARY && (
                        <button
                          onClick={() => openEditDiary(it)}
                          className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
                        >
                          编辑
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (window.confirm(`确定删除这条${TYPE_LABEL[type]}吗？`)) {
                            onDeleteItem(it.id);
                          }
                        }}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        删除
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )
      )}

      {/* 当日工作计划面板：汇总当天带工作计划(plan)的事件 */}
      <WorkPlanPanel date={date} items={items} onEditEvent={onEditEvent} />

      {/* 日记编辑器弹层 */}
      {diaryEditorOpen && (
        <DiaryEditor
          initial={editingDiary}
          defaultDate={date}
          onSave={handleSaveDiary}
          onCancel={closeDiaryEditor}
        />
      )}
    </div>
  );
}
