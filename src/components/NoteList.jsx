// NoteList.jsx —— 便签列表 + 筛选栏
//
// props:
//   notes         —— 全部便签数组
//   onSave        —— 保存便签（来自 useItems）
//   onDelete      —— 删除便签（来自 useItems）
//   onToggleDone  —— 切换完成状态回调（可选，未传入时降级为 onSave）
//
// v2 增强：
//   - 正文 line-clamp-3 → line-clamp-5
//   - 显示条目数量（body 数组长度 > 0 时显示"共 N 条"）
//   - 完成态灰显（opacity-60） + 标题 line-through + 沉底排序
//   - 状态筛选栏（全部 / 进行中 / 已完成）
//   - NoteCard 增加 onToggleDone 回调 + 完成按钮
//   - 全部颜色 className 追加 dark: 变体
//
// v4 改造（C2-b / C3-b，见 ARCHITECTURE-uiv4.md）：
//   - C2-b：NoteCard 正文区按条目数组逐条渲染"文本 + 时间后置小字"；旧字符串 body 回退 formatBody。
//   - C3-b：NoteCard 层级优化——标题加粗突出；操作区加 border-t 分隔线 + mt-auto 沉底；保留双击编辑与 stopPropagation。
import { useState, useMemo } from 'react';
import { filterNotes } from '../lib/search.js';
import { parseTags } from '../lib/model.js';
import { formatBody } from '../lib/body.js';
import NoteEditor from './NoteEditor.jsx';
import NoteSkeleton from './NoteSkeleton.jsx';

// C5: loading 为 true 时渲染骨架屏（由 App 透传 useItems.loading）；默认 false（日历 Tab 走 App 的短路文案）
export default function NoteList({ notes, onSave, onDelete, onToggleDone, loading = false }) {
  // 筛选条件（v2 起仅有关键词与标签筛选）
  const [keyword, setKeyword] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  // 状态筛选：'all' | 'active' | 'done'
  const [statusFilter, setStatusFilter] = useState('all');

  // 编辑器状态：null 关闭；{} 新建；note 对象 编辑
  const [editor, setEditor] = useState(null);

  // 根据筛选条件计算展示列表
  const filtered = useMemo(() => {
    let result = filterNotes(notes, {
      keyword,
      tags: parseTags(tagFilter),
    });

    // 状态筛选
    if (statusFilter === 'active') {
      result = result.filter((n) => !n.done);
    } else if (statusFilter === 'done') {
      result = result.filter((n) => n.done);
    }

    // v5 排序：先按 done 沉底（未完成在前、已完成在后），同组内再按 createdAt 降序（最新在前）；
    //         createdAt 缺失用 || 0 兜底（老数据排到最后）。
    return [...result].sort((a, b) => {
      const aDone = a.done ? 1 : 0;
      const bDone = b.done ? 1 : 0;
      if (aDone !== bDone) {
        // done 的排后面：aDone 更大（a 已完成）时返回正值，置于 b 之后
        return aDone - bDone;
      }
      // 同组：createdAt 降序（最新在前）；缺失兜底 0
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [notes, keyword, tagFilter, statusFilter]);

  // 确认删除
  function handleDelete(note) {
    if (window.confirm(`确定删除便签「${note.title || '未命名'}」吗？`)) {
      onDelete(note.id);
    }
  }

  // 切换完成状态：优先使用 onToggleDone，未传入时降级为 onSave
  function handleToggleDone(note) {
    if (onToggleDone) {
      onToggleDone(note);
    } else {
      onSave({ ...note, done: !note.done });
    }
  }

  // 状态筛选按钮配置
  const statusButtons = [
    { key: 'all', label: '全部' },
    { key: 'active', label: '进行中' },
    { key: 'done', label: '已完成' },
  ];

  return (
    <div>
      {/* 顶部：新建按钮 + 筛选栏 */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <button
          onClick={() => setEditor({})}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          + 新建便签
        </button>

        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索关键词"
          className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        <input
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          placeholder="按标签筛选（空格分隔）"
          className="w-48 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />

        {/* 状态筛选栏 */}
        <div className="flex gap-1">
          {statusButtons.map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              className={
                'rounded-md px-3 py-2 text-sm font-medium transition ' +
                (statusFilter === s.key
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700')
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 列表区 */}
      {loading ? (
        // C5: 加载中渲染骨架屏占位（顶部新建/筛选栏保持可见）
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <NoteSkeleton key={i} />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <EmptyState text="还没有便签，点「新建便签」开始记录吧。" />
      ) : filtered.length === 0 ? (
        <EmptyState text="没有匹配的便签，试试调整筛选条件。" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onEdit={() => setEditor(note)}
              onDelete={() => handleDelete(note)}
              onToggleDone={() => handleToggleDone(note)}
            />
          ))}
        </div>
      )}

      {/* 编辑器弹层 */}
      {editor && (
        <NoteEditor
          initial={editor}
          // C4: 传入原始 saveItem（onSave），自动保存与手动保存共用、且不在此关闭编辑器
          onSave={onSave}
          // 手动"保存"成功后由 NoteEditor 调用此回调关闭编辑器（保持原 v2 关闭行为）
          onSaved={() => setEditor(null)}
          onCancel={() => setEditor(null)}
          onDelete={(item) => {
            onDelete(item.id);
            setEditor(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * 便签卡片
 * @param {Object} note 便签 Item
 * @param {Function} onEdit 编辑回调
 * @param {Function} onDelete 删除回调
 * @param {Function} onToggleDone 切换完成状态回调
 */
function NoteCard({ note, onEdit, onDelete, onToggleDone }) {
  const bodyText = formatBody(note.body);
  const isDone = note.done === true;
  const entryCount = Array.isArray(note.body) ? note.body.length : 0;

  return (
    <div
      // C1: 双击卡片进入编辑态（复用 onEdit + preventDefault 防文本选中/缩放）
      onDoubleClick={(e) => {
        e.preventDefault();
        onEdit();
      }}
      className={
        'flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 ' +
        (isDone ? 'opacity-60' : '')
      }
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        {/* v4(C3-b): 标题加粗突出 */}
        <h3
          className={
            'text-base font-semibold text-slate-900 dark:text-slate-100 ' +
            (isDone ? 'line-through' : '')
          }
        >
          {note.title || '未命名'}
        </h3>
        {note.date && (
          <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
            {note.date}
          </span>
        )}
      </div>

      {/* v4(C2-b): 正文区 —— 数组 body 逐条渲染"文本 + 时间后置小字"；旧字符串 body 回退 formatBody */}
      {Array.isArray(note.body) ? (
        <div className="mb-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
          {note.body
            .filter(
              (e) =>
                e?.text?.trim() || e?.time?.trim() || e?.images?.length
            )
            .map((e, i) => (
              <div
                key={i}
                className={
                  'flex flex-wrap items-baseline gap-x-2' +
                  (e?.done === true ? ' text-slate-400 dark:text-slate-500' : '')
                }
              >
                <span className="whitespace-pre-line">{e.text}</span>
                {e.time && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {e.time}
                  </span>
                )}
              </div>
            ))}
        </div>
      ) : (
        bodyText && (
          <p className="mb-2 line-clamp-5 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">
            {bodyText}
          </p>
        )
      )}

      {/* 条目数量（>0 才显示） */}
      {entryCount > 0 && (
        <div className="mb-2 text-xs text-slate-400 dark:text-slate-500">
          共 {entryCount} 条
        </div>
      )}

      {note.tags?.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {note.tags.map((t) => (
            <span
              key={t}
              className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-400"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* v4(C3-b): 操作区加 border-t 分隔线 + mt-auto 沉底；保留双击编辑 stopPropagation */}
      <div
        className="mt-auto flex gap-3 border-t border-slate-200 pt-3 text-sm dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onEdit}
          className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          编辑
        </button>
        <button
          onClick={onToggleDone}
          className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
        >
          {isDone ? '重新激活' : '完成'}
        </button>
        <button
          onClick={onDelete}
          className="text-red-500 hover:text-red-700 dark:text-red-400"
        >
          删除
        </button>
      </div>
    </div>
  );
}

// 空状态提示
function EmptyState({ text }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500">
      {text}
    </div>
  );
}
