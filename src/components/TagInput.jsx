// TagInput.jsx —— 标签输入控件（chip 风格）
//
// 受控组件：value 为 string[]，onChange 回传新的 string[]。
// 用户输入逗号/空格/回车时把当前草稿转成一个标签；标签以 chip 展示，可单独删除。
import { useState } from 'react';

export default function TagInput({ value = [], onChange, placeholder = '输入标签后回车，如 木工' }) {
  const [draft, setDraft] = useState('');

  // 把草稿解析成一个或多个标签并追加（去重）
  function commit() {
    const parts = draft
      .split(/[\s,，;；]+/)
      .map((s) => s.replace(/^#/, '').trim())
      .filter(Boolean);
    if (parts.length > 0) {
      const next = Array.from(new Set([...value, ...parts]));
      onChange(next);
    }
    setDraft('');
  }

  function handleKeyDown(e) {
    // 回车 / 逗号 提交当前草稿
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    }
    // 空草稿时按退格删除最后一个标签
    if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function removeTag(tag) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 focus-within:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:focus-within:border-slate-400">
      {/* 已选标签 chip */}
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-sm text-slate-700 dark:bg-slate-700 dark:text-slate-200"
        >
          #{tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400"
            aria-label={`删除标签 ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : ''}
        className="min-w-[8ch] flex-1 bg-transparent text-sm outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
      />
    </div>
  );
}
