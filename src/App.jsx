// App.jsx —— 应用整体布局：顶部 Tab（便签 / 日历）+ 内容区
import { useState, useCallback } from 'react';
import { useItems } from './hooks/useItems.js';
import { useTheme } from './hooks/useTheme.js';
import { ITEM_TYPES } from './lib/model.js';
import NoteList from './components/NoteList.jsx';
import CalendarView from './components/CalendarView.jsx';
import DataToolbar from './components/DataToolbar.jsx';

export default function App() {
  // 当前 Tab：'note' 便签 / 'calendar' 日历（日记已整合进日历，仅保留两个入口）
  const [tab, setTab] = useState('note');

  // 统一的数据 hook：加载/增删改 Item，并维护内存 state
  const { items, loading, saveItem, deleteItem, saveDiary, importItems } = useItems();

  // 主题管理：light / dark / system
  const { isDark, toggleTheme } = useTheme();

  // 仅取出便签，供便签页使用
  const notes = items.filter((it) => it.type === ITEM_TYPES.NOTE);

  // 切换便签的完成状态（供 NoteList 的 onToggleDone 使用）
  const handleToggleDone = useCallback(
    (note) => {
      saveItem({ ...note, done: !note.done });
    },
    [saveItem]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-cp-bg dark:text-cp-text">
      {/* 顶部标题 + Tab 切换 */}
      <header className="border-b border-slate-200 bg-white dark:border-cp-border dark:bg-cp-surface">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">旋风计划</h1>
            {/* 数据导出 / 导入工具栏 + 主题切换（位于标题同行右端） */}
            <div className="flex items-center gap-2">
              <DataToolbar items={items} onImport={importItems} />
              <button
                onClick={toggleTheme}
                aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {isDark ? '☀️' : '🌙'}
              </button>
            </div>
          </div>
          <nav className="mt-2 flex gap-1">
          <TabButton active={tab === 'note'} onClick={() => setTab('note')}>
            便签
          </TabButton>
          <TabButton active={tab === 'calendar'} onClick={() => setTab('calendar')}>
            日历
          </TabButton>
          </nav>
        </div>
      </header>

      {/* 内容区 */}
      <main className="mx-auto max-w-5xl px-4 py-6">
        {tab === 'note' ? (
          // C5: 便签 Tab 把 loading 透传给 NoteList，由 NoteList 自决骨架屏 vs 列表
          <NoteList
            notes={notes}
            loading={loading}
            onSave={saveItem}
            onDelete={deleteItem}
            onToggleDone={handleToggleDone}
          />
        ) : loading ? (
          // 日历 Tab 维持原样：loading 时简单文案，不受影响
          <p className="text-slate-400 dark:text-slate-500">加载中…</p>
        ) : (
          <CalendarView
            items={items}
            onSaveItem={saveItem}
            onDeleteItem={deleteItem}
            onSaveDiary={saveDiary}
          />
        )}
      </main>
    </div>
  );
}

// 内部小组件：Tab 按钮
function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={
        'rounded-md px-4 py-1.5 text-sm font-medium transition ' +
        (active
          ? 'bg-slate-900 text-white dark:bg-slate-700'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700')
      }
    >
      {children}
    </button>
  );
}
