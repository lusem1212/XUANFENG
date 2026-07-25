// CalendarView.jsx —— 月视图日历主视图
//
// 顶部：‹ 上月 / 「今天」/ 下月 › 导航 + 当前年月标题
// 主体：7 列星期表头 + 月格；有 Item 的日期格内显示类型小标记
//       点击某天 → 设为 selectedDate → 右侧/下方显示该天聚合详情
// 操作：「+ 新建事件」按钮（默认用 selectedDate 或今天作为事件日期）
//
// props:
//   items        —— 全部 Item（日历只展示有 date 的条目）
//   onSaveItem   —— 保存 Item（来自 useItems，已能 upsert 任意类型）
//   onDeleteItem —— 删除 Item（来自 useItems）
//   onSaveDiary  —— 保存当天日记（来自 useItems，一天一条 upsert；透传给 DayDetail）
import { useState, useMemo } from 'react';
import { today } from '../lib/model.js';
import { buildMonthMatrix, daysWithItems, itemsOnDate, formatDate, parseYMD } from '../lib/calendar.js';
import DayDetail from './DayDetail.jsx';
import EventEditor from './EventEditor.jsx';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// 类型 → 月格上的小圆点颜色（note=琥珀, diary=蓝, event=玫红）
const TYPE_DOT = {
  note: 'bg-amber-400',
  diary: 'bg-blue-500',
  event: 'bg-rose-500',
};

export default function CalendarView({ items, onSaveItem, onDeleteItem, onSaveDiary }) {
  // 初始定位到今天所在的年/月
  const todayStr = today();
  const todayP = parseYMD(todayStr) || { year: 2026, month: 1, day: 1 };

  // 当前显示的年/月、选中的日期、事件编辑器状态
  const [year, setYear] = useState(todayP.year);
  const [month, setMonth] = useState(todayP.month);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

  // 月历矩阵（6×7）与「有记录的天」集合
  const matrix = useMemo(() => buildMonthMatrix(year, month), [year, month]);
  const markedDays = useMemo(() => daysWithItems(items, year, month), [items, year, month]);

  // 月份导航：上/下月（跨年自动处理）；回到今天
  function goPrevMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  }
  function goNextMonth() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  }
  function goToday() {
    setYear(todayP.year);
    setMonth(todayP.month);
    setSelectedDate(todayStr);
  }

  // 选中某一天（矩阵中的数字）
  function handlePickDay(day) {
    setSelectedDate(formatDate(year, month, day));
  }

  // 打开新建事件 / 编辑事件
  function openNewEvent() {
    setEditingEvent(null);
    setEditorOpen(true);
  }
  function openEditEvent(ev) {
    setEditingEvent(ev);
    setEditorOpen(true);
  }
  function closeEditor() {
    setEditorOpen(false);
    setEditingEvent(null);
  }
  function handleSaveEvent(item) {
    onSaveItem(item);
    closeEditor();
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
      {/* 左：月历 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-cp-border dark:bg-cp-surface">
        {/* 导航栏 */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <NavButton onClick={goPrevMonth} ariaLabel="上个月">‹</NavButton>
            <NavButton onClick={goToday}>今天</NavButton>
            <NavButton onClick={goNextMonth} ariaLabel="下个月">›</NavButton>
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            {year} 年 {month} 月
          </h2>
          <button
            onClick={openNewEvent}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500 dark:bg-rose-700 dark:hover:bg-rose-600"
          >
            + 新建事件
          </button>
        </div>

        {/* 星期表头 */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400 dark:text-slate-500">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">{w}</div>
          ))}
        </div>

        {/* 月格 */}
        <div className="grid grid-cols-7 gap-1">
          {matrix.map((day, idx) => {
            if (day === null) {
              // 前后补位的空格
              return <div key={`blank-${idx}`} className="h-16 rounded-md bg-slate-50/50 dark:bg-cp-surface/50" />;
            }
            const dateStr = formatDate(year, month, day);
            const hasItems = markedDays.has(day);
            const dayItems = itemsOnDate(items, dateStr);
            // 该天出现的类型（去重），用于小圆点标记
            const types = Array.from(new Set(dayItems.map((it) => it.type)));
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;

            return (
              <button
                key={dateStr}
                onClick={() => handlePickDay(day)}
                className={
                  'flex h-16 flex-col items-center justify-start rounded-md border p-1 font-mono text-sm transition ' +
                  (isSelected
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-cp-accent dark:bg-cp-surface dark:text-cp-accent'
                    : isToday
                      ? 'border-rose-400 bg-rose-50 text-slate-900 dark:border-rose-500 dark:bg-rose-900/30 dark:text-slate-50'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-cp-border dark:bg-cp-surface dark:text-slate-300 dark:hover:border-cp-accent')
                }
              >
                <span className="font-medium">{day}</span>
                {/* 类型小标记：有记录才显示 */}
                {hasItems && (
                  <span className="mt-1 flex flex-wrap justify-center gap-0.5">
                    {types.map((t) => (
                      <span
                        key={t}
                        className={'h-1.5 w-1.5 rounded-full ' + (TYPE_DOT[t] || 'bg-slate-400') +
                          (isSelected ? ' opacity-90' : '')}
                        title={t}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 图例 */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <Legend color="bg-amber-400" label="便签" />
          <Legend color="bg-blue-500" label="日记" />
          <Legend color="bg-rose-500" label="事件" />
        </div>
      </div>

      {/* 右：当天聚合详情 */}
      <DayDetail
        date={selectedDate}
        items={items}
        onEditEvent={openEditEvent}
        onDeleteItem={onDeleteItem}
        onSaveDiary={onSaveDiary}
      />

      {/* 事件编辑器弹层 */}
      {editorOpen && (
        <EventEditor
          initial={editingEvent}
          defaultDate={selectedDate}
          onSave={handleSaveEvent}
          onCancel={closeEditor}
          onDelete={(it) => {
            onDeleteItem(it.id);
            closeEditor();
          }}
        />
      )}
    </div>
  );
}

// 导航按钮（‹ / 今天 / ›）
function NavButton({ children, onClick, ariaLabel }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="min-w-[2.5rem] rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      {children}
    </button>
  );
}

// 图例小圆点
function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={'h-2 w-2 rounded-full ' + color} />
      {label}
    </span>
  );
}
