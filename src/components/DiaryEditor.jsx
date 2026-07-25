// DiaryEditor.jsx —— 当天日记新建/编辑表单（弹层）
//
// 基于 EventEditor 的结构改写，但落库 type 固定为 'diary'，且保存走 useItems.saveDiary
// （一天一条：内部按 date upsert，无需在此生成 id）。
// 删除统一在 DayDetail 的条目「删除」入口处理，本编辑器只负责保存 / 取消。
//
// 改造说明（v2）：标签改用 TagSelect。
//
// props:
//   initial     —— 编辑时传入的 diary 对象；新建时传 null
//   defaultDate —— 新建时默认的日期（通常为选中的某天）；也可被 initial.date 覆盖
//   onSave      —— 保存回调，接收 { date, title, body, tags }（由父级 saveDiary 落库）
//   onCancel    —— 取消回调
import { useState, useEffect } from 'react';
import { today } from '../lib/model.js';
import TagSelect from './TagSelect.jsx';

export default function DiaryEditor({ initial, defaultDate = '', onSave, onCancel }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState([]);
  // 日记必须有日期：优先用传入日记自身的日期，其次用默认日期，最后退回今天
  const [date, setDate] = useState(initial?.date || defaultDate || today());

  const isEdit = Boolean(initial && initial.id);

  // 打开或切换 initial 时，把值同步进表单
  useEffect(() => {
    setTitle(initial?.title || '');
    setBody(initial?.body || '');
    setTags(initial?.tags || []);
    setDate(initial?.date || defaultDate || today());
  }, [initial, defaultDate]);

  function handleSubmit(e) {
    e.preventDefault();
    // 日记必须落在某个日期上，缺失则拦截
    if (!date) {
      window.alert('请先选择日记日期。');
      return;
    }
    // 落库由 useItems.saveDiary 负责（按 date upsert，一天一条）
    onSave({
      date,
      title: title.trim(),
      body,
      tags,
    });
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4 dark:bg-black/50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-slate-800"
      >
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-50">
          {isEdit ? '编辑日记' : '写今日日记'}
        </h2>

        {/* 标题 */}
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">标题</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="今天标题（可选）"
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-slate-400"
        />

        {/* 正文 */}
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">正文</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="写下今天的事…（可写 #标签 以便自动关联便签，例如 #木工）"
          rows={6}
          className="mb-3 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-slate-400"
        />

        {/* 标签 */}
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">标签</label>
        <TagSelect value={tags} onChange={setTags} />

        {/* 日期（必填） */}
        <label className="mb-1 mt-3 block text-sm font-medium text-slate-700 dark:text-slate-200">日期（必填）</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-slate-400"
        />

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            取消
          </button>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            保存
          </button>
        </div>
      </form>
    </div>
  );
}
