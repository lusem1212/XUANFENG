// DataToolbar.jsx —— 顶部数据工具栏：导出（JSON / Markdown）、导入（JSON）
//
// 受控组件：接收 items（全部记录）与 onImport(items)，点击按钮时：
//   - 导出数据：buildExport → JSON → Blob 下载 `便签日记日历-导出-YYYYMMDD.json`；
//   - 导出文本：itemsToMarkdown → Blob 下载 `.md`；
//   - 导入：选择 .json 文件 → parseImport → onImport(items) → alert 导入条数。
import { useRef } from 'react';
import { buildExport, itemsToMarkdown, parseImport } from '../lib/io.js';

// 生成当前日期的 YYYYMMDD 字符串，用于导出文件名
function dateStamp() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}${m}${day}`;
}

// 触发浏览器下载一个文本 Blob
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * @param {Object} props
 * @param {Array<Object>} props.items 全部记录
 * @param {(items: Array<Object>) => void} props.onImport 导入回调（接收一个 items 数组）
 */
export default function DataToolbar({ items, onImport }) {
  const fileRef = useRef(null);

  // 导出结构化 JSON
  function handleExportJson() {
    const payload = buildExport(items);
    downloadBlob(
      JSON.stringify(payload, null, 2),
      `便签日记日历-导出-${dateStamp()}.json`,
      'application/json'
    );
  }

  // 导出可读 Markdown 文本
  function handleExportMd() {
    const md = itemsToMarkdown(items);
    downloadBlob(md, `便签日记日历-导出-${dateStamp()}.md`, 'text/markdown;charset=utf-8');
  }

  // 选择文件后读取并导入
  async function handleFileChange(e) {
    const file = e.target.files && e.target.files[0];
    // 清空 input 值，保证同一文件可重复选择触发 onChange
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseImport(text);
      if (onImport) await onImport(imported);
      window.alert(`已导入 ${imported.length} 条记录`);
    } catch (err) {
      window.alert('导入失败：' + (err && err.message ? err.message : '文件格式错误'));
    }
  }

  const btnClass =
    'rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700';

  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btnClass} onClick={handleExportJson}>
        导出数据
      </button>
      <button type="button" className={btnClass} onClick={handleExportMd}>
        导出文本
      </button>
      <button type="button" className={btnClass} onClick={() => fileRef.current && fileRef.current.click()}>
        导入
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
