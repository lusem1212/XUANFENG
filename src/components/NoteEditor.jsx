// NoteEditor.jsx —— 便签新建/编辑表单（弹层）
//
// props:
//   initial   —— 编辑时传入的 note 对象；新建时传 {} 或 null
//   onSave    —— 保存回调（原始 saveItem，仅落库，不负责关闭编辑器）
//   onSaved   —— 手动保存成功后关闭编辑器的回调（由父级传入）
//   onCancel  —— 取消回调
//   onDelete  —— 删除回调（仅编辑态显示）；新建态不传
//
// 改造说明（v2）：
//   - 标题 label 改为「项目名称」（仍是自由文本，存 title）。
//   - 正文改为「条目数组」：[{ time: 'MM-DD HH:MM', text: string, images: string[] }, ...]，
//     每条以时间为开头，可在此时间内增加和修改；保存时过滤掉完全为空的条目
//     （time、text 都为空且 images 为空数组才算空条目）。
//     编辑旧数据时若 note.body 是字符串，加载时归一化为 [{ time: '', text: body }]。
//   - body 条目文本输入从 <input> 改为 <textarea>，支持多行 + 自动增高。
//   - 每条目下方集成 EntryImages 组件，支持图片上传/删除/大图浏览。
//   - textarea 支持粘贴图片（clipboardData 中 image 类型 → 压缩 → 存储 → 更新 entry.images）。
//   - 增加 done 状态：编辑态可标记完成/重新激活，保存时包含 done 字段。
//   - 标签改用 TagSelect（可选标签 + 添加标签），不再自由手填。
//   - 全部颜色 className 追加 dark: 变体。
//
// v3 改造：
//   - C3：新条目时间改用 formatEntryTime 生成 'MM-DD HH:MM'；时间控件由可编辑 input 改为只读展示。
//   - C4：抽取 buildItem + 700ms 防抖自动保存（onSave=saveItem）；新增 saveStatus 轻提示；
//         onCancel / 卸载时 flush 防抖计时器（防丢数据）；保留手动"保存"按钮作兜底。
//
// v4 改造（C1 / C2-a / C3-a，见 ARCHITECTURE-uiv4.md）：
//   - C1：遮罩 div 加 onClick={handleCancel} + overflow-y-auto（点击空白关闭 + 兜底滚动）；
//         <form> 加 onClick 阻止冒泡 + max-h-[90vh] overflow-y-auto（条目多可滚动、不裁切）；
//         新增 Esc 键盘监听走 handleCancel（输入中按 Esc 也关，符合 Q4）。
//   - C2-a：条目时间从独立色块改为 textarea 下方 text-xs 小字时间戳；删除按钮弱化到条目右上角。
//   - C3-a：新增文件内局部 Section 辅助组件（border-t + 小号加粗标题），包裹 6 个区块，不套卡片。
import { useState, useEffect, useRef } from 'react';
import { createId } from '../lib/model.js';
import { compressImage } from '../lib/imageCompress.js';
import { addImage, deleteImages } from '../lib/imageStore.js';
import { formatEntryTime } from '../lib/body.js';
import TagSelect from './TagSelect.jsx';
import EntryImages from './EntryImages.jsx';
import {
  DEFAULT_PRESET_SET,
  getSiteProjects,
  addSiteProjectName,
  removeSiteProjectName,
} from '../lib/siteProjects.js';

// 自动保存防抖时长（毫秒），与 ARCHITECTURE-uiv3 约定的 AUTOSAVE_DELAY = 700 一致
const AUTOSAVE_DELAY = 700;

// 为每条目生成仅用于 React key 的稳定 id（不参与落库）
function makeEntryId() {
  return 'ent-' + Math.random().toString(36).slice(2, 9);
}

/**
 * textarea 自动增高：先重置 height 让 scrollHeight 反映真实内容高度，再设为 scrollHeight。
 * @param {HTMLElement} el textarea 元素
 */
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

/**
 * 归一化 body 为条目数组。
 * - 已是数组：清洗每个条目的 time / text / images；
 * - 字符串（旧数据）：转为单条 [{ time: '', text }]；
 * - 其它：空数组。
 * @param {string|Array<{time?:string,text?:string,images?:string[]}>|*} body
 * @returns {Array<{id:string,time:string,text:string,images:string[]}>}
 */
function normalizeBody(body) {
  if (Array.isArray(body)) {
    return body.map((e) => ({
      id: makeEntryId(),
      time: typeof e?.time === 'string' ? e.time : '',
      text: typeof e?.text === 'string' ? e.text : '',
      images: Array.isArray(e?.images) ? e.images : [],
      done: e?.done === true,
    }));
  }
  if (typeof body === 'string' && body) {
    return [{ id: makeEntryId(), time: '', text: body, images: [] }];
  }
  return [];
}

/**
 * 区块辅助组件（v4 / C3-a）：轻量分隔线 + 区块标题，不新增文件、不套卡片。
 * 仅用于编辑器内分区，不构成公共接口。
 * @param {string} title 区块标题
 * @param {React.ReactNode} children 区块内容
 */
function Section({ title, children }) {
  return (
    <section className="mt-4 border-t border-slate-200 pt-4 first:mt-0 first:border-t-0 dark:border-slate-700">
      <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function NoteEditor({ initial, onSave, onSaved, onCancel, onDelete }) {
  const [title, setTitle] = useState('');
  const [entries, setEntries] = useState([]); // 正文条目数组
  const [tags, setTags] = useState([]);
  const [done, setDone] = useState(false); // v2: 完成状态
  const [siteInput, setSiteInput] = useState('');
  // 词库候选删除后强制刷新（removeSiteProjectName 直接操作 localStorage，不会触发重渲染）
  const [forceRefresh, setForceRefresh] = useState(0);
  // v3(C4): 保存状态轻提示，仅 'idle' | 'saving' | 'saved' 三态，不进入数据结构
  const [saveStatus, setSaveStatus] = useState('idle');

  const formRef = useRef(null);
  const timerRef = useRef(null); // 防抖计时器句柄
  const savedIdRef = useRef(initial?.id || null); // 已落库 id；新建便签首次保存后才生成
  const didInitRef = useRef(false); // 跳过 initial 同步后的首次渲染（避免一打开就触发自动保存）
  const flushRef = useRef(() => {}); // 始终指向最新的 flush（供卸载 cleanup 使用，避免闭包过期）

  const isEdit = Boolean(initial && initial.id);

  // 工地项目 = tags 中不属于默认预设的子集（派生值，单一真相）。
  const siteProjects = tags.filter((t) => !DEFAULT_PRESET_SET.has(t));

  /**
   * 解析工地项目输入串：支持逗号 / 空格 / 中文逗号 / 全角或半角分号分隔，
   * trim、过滤空串，返回去重后的名称数组。
   * @param {string} [raw]
   * @returns {string[]}
   */
  function parseSiteProjects(raw) {
    return String(raw)
      .split(/[\s,，;；]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  // 添加工地项目：解析为多个名称，写入共享词库（持久化）再并入 tags（唯一真相）。
  function addSiteProject(raw) {
    const names = parseSiteProjects(raw);
    if (names.length === 0) return;
    names.forEach((n) => addSiteProjectName(n)); // 持久化到共享词库 → 事件可选
    setTags(Array.from(new Set([...tags, ...names])));
    setSiteInput('');
  }

  // 删除单个工地项目：直接从 tags 中移除该项目名（唯一真相）。
  function removeSiteProject(name) {
    setTags(tags.filter((t) => t !== name));
  }

  // 打开或切换 initial 时，把值同步进表单，并重置自动保存相关状态
  useEffect(() => {
    setTitle(initial?.title || '');
    setEntries(normalizeBody(initial?.body));
    setTags(initial?.tags || []);
    setSiteInput('');
    setDone(initial?.done === true);
    // 重置自动保存状态，避免跨条目复用旧计时器 / 旧 id
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    savedIdRef.current = initial?.id || null;
    didInitRef.current = false;
    setSaveStatus('idle');
  }, [initial]);

  // entries 变化时（包括初始加载），对所有 textarea 执行一次 autoGrow
  useEffect(() => {
    if (formRef.current) {
      formRef.current
        .querySelectorAll('textarea[data-autoresize="true"]')
        .forEach((el) => autoGrow(el));
    }
  }, [entries]);

  // 追加一条新条目，时间预填为当前时间（C3：MM-DD HH:MM，只读生成）
  function addEntry() {
    setEntries((prev) => [
      ...prev,
      { id: makeEntryId(), time: formatEntryTime(new Date()), text: '', images: [], done: false },
    ]);
  }

  // 更新某条目的部分字段
  function updateEntry(id, patch) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  // 删除某条目：先级联删除该条目的图片，再从 entries 数组移除
  async function removeEntry(id) {
    const entry = entries.find((e) => e.id === id);
    if (entry && Array.isArray(entry.images) && entry.images.length > 0) {
      try {
        await deleteImages(entry.images);
      } catch (err) {
        console.error('条目图片删除失败:', err);
      }
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  /**
   * textarea 粘贴事件处理：检测剪贴板中的图片，压缩 → 存储 → 更新 entry.images。
   * @param {ClipboardEvent} e
   * @param {Object} entry 当前条目
   */
  async function handlePaste(e, entry) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItems = Array.from(items).filter((item) =>
      item.type.startsWith('image/')
    );
    if (imageItems.length === 0) return;

    e.preventDefault(); // 阻止默认粘贴行为（仅当有图片时）

    const newIds = [];
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;
      try {
        const { blob, mimeType, width, height } = await compressImage(file);
        const id = await addImage(blob, mimeType, width, height);
        newIds.push(id);
      } catch (err) {
        console.error('图片粘贴处理失败:', err);
      }
    }
    if (newIds.length > 0) {
      updateEntry(entry.id, {
        images: [...(entry.images || []), ...newIds],
      });
    }
  }

  /**
   * 组装完整 item 对象（自动 / 手动保存共用）。
   * 过滤完全为空的条目（time、text 都为空且 images 为空数组），合并 title/tags/done/date。
   * @returns {Object} 可落库的 note item
   */
  function buildItem() {
    const body = entries
      .filter(
        (e) =>
          e.time.trim() !== '' ||
          e.text.trim() !== '' ||
          (Array.isArray(e.images) && e.images.length > 0)
      )
      .map((e) => ({
        time: e.time.trim(),
        text: e.text.trim(),
        images: Array.isArray(e.images) ? e.images : [],
        done: e.done === true,
      }));
    return {
      id: savedIdRef.current || createId(), // 新建时生成 id；编辑 / 已自动保存过则复用 id（更新而非新建）
      type: 'note',
      date: initial?.date || '', // v6：移除可选日期 UI；保留历史已存日期，避免编辑旧便签时丢失
      title: title.trim(),
      body,
      tags,
      links: initial?.links || [],
      done: done === true,
      createdAt: initial?.createdAt || Date.now(),
    };
  }

  /**
   * 是否有有效内容（用于"空便签不落库"守卫）。
   * @returns {boolean}
   */
  function hasContent() {
    return (
      title.trim() !== '' ||
      entries.some(
        (e) =>
          e.time.trim() !== '' ||
          e.text.trim() !== '' ||
          (Array.isArray(e.images) && e.images.length > 0)
      ) ||
      tags.length > 0
    );
  }

  /**
   * 立即落库（手动保存 / 提交共用）：清掉待执行防抖计时器，构建 item 并 onSave。
   * 同时更新 savedIdRef，便于后续自动保存复用同一 id（更新而非新建）。
   */
  function persist() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const item = buildItem();
    onSave(item);
    savedIdRef.current = item.id;
  }

  /**
   * flush：关闭 / 取消 / 卸载前立即保存（防丢数据），遵循"空新便签不落库"守卫。
   * 若当前无待保存计时器则直接返回，避免重复落库。
   */
  function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!hasContent() && !savedIdRef.current) return; // 空的新便签不落库
    const item = buildItem();
    onSave(item);
    savedIdRef.current = item.id;
  }
  // 始终让 flushRef 指向最新的 flush（含最新 state 闭包），供卸载 cleanup 防闭包过期
  flushRef.current = flush;

  // 防抖自动保存：监听内容变化，700ms 后落库（C4）
  useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true; // 跳过 initial 同步后的首次渲染
      return;
    }
    // 空的新便签（尚无内容且未落库）不触发自动保存
    if (!hasContent() && !savedIdRef.current) {
      setSaveStatus('idle');
      return;
    }
    setSaveStatus('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null; // 计时到点后清空句柄，避免卸载时重复 flush
      const item = buildItem();
      onSave(item);
      savedIdRef.current = item.id;
      setSaveStatus('saved');
    }, AUTOSAVE_DELAY);
    // 依赖变化 / 卸载时清掉未触发的计时器（防抖重置）
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [title, entries, tags, done]);

  // 组件卸载时，若有待保存改动立即 flush（防丢数据）
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        flushRef.current();
      }
    };
  }, []);

  // v4(C1 / Q4)：Esc 关闭 —— 与背景点击共用 handleCancel（输入中按 Esc 也关）。
  // 用 closeRef 稳定化最新 handleCancel，避免 effect 闭包过期；effect 依赖 []。
  const closeRef = useRef(handleCancel);
  closeRef.current = handleCancel;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    persist(); // 立即保存并清掉防抖计时器
    if (onSaved) onSaved(); // 手动保存成功后关闭编辑器
  }

  function handleCancel() {
    flush(); // 取消前 flush 待保存改动（防丢数据）
    if (onCancel) onCancel();
  }

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4 overflow-y-auto"
      onClick={handleCancel}
    >
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-slate-800 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">
          {isEdit ? '编辑便签' : '新建便签'}
          {saveStatus !== 'idle' && (
            <span className="ml-3 align-middle text-xs font-normal text-slate-400 dark:text-slate-500">
              {saveStatus === 'saving' ? '保存中…' : '已保存'}
            </span>
          )}
        </h2>

        {/* 项目名称（原「标题」） */}
        <Section title="项目名称">
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            项目名称
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="项目名称"
            className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
        </Section>

        {/* 正文（条目数组） */}
        <Section title="正文">
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            正文
          </label>
          <div className="mb-2 space-y-2">
            {entries.map((entry) => {
              const entryDone = entry.done === true;
              return (
              <div
                key={entry.id}
                className="rounded-md border border-slate-200 p-2 dark:border-slate-700"
              >
                {/* 删除按钮：条目右上角，弱化（v4 / C2-a） */}
                <div className="mb-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                    className="px-2 text-xs text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400"
                    aria-label="删除该条目"
                  >
                    删除
                  </button>
                </div>
                {/* 多行文本输入（自动增高） */}
                <textarea
                  data-autoresize="true"
                  rows={1}
                  value={entry.text}
                  onChange={(e) => updateEntry(entry.id, { text: e.target.value })}
                  onInput={(e) => autoGrow(e.target)}
                  onPaste={(e) => handlePaste(e, entry)}
                  placeholder="本条内容…"
                  className={
                    'min-w-0 w-full resize-none overflow-hidden rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100' +
                    (entryDone ? ' text-slate-400 dark:text-slate-500' : '')
                  }
                />
                {/* 图片管理 + 时间后置小字 + 完成开关（v7：每条正文后加完成开关，点击变灰保留信息） */}
                <div className="mt-1 flex items-center justify-between gap-2">
                  <EntryImages
                    imageIds={entry.images || []}
                    onAddImages={(ids) =>
                      updateEntry(entry.id, {
                        images: [...(entry.images || []), ...ids],
                      })
                    }
                    onRemoveImage={(imgId) =>
                      updateEntry(entry.id, {
                        images: (entry.images || []).filter((i) => i !== imgId),
                      })
                    }
                  />
                  <div className="flex items-center gap-2">
                    {entry.time && (
                      <span
                        className={
                          'shrink-0 text-xs text-slate-400 dark:text-slate-500' +
                          (entryDone ? ' text-slate-400 dark:text-slate-500' : '')
                        }
                      >
                        {entry.time}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => updateEntry(entry.id, { done: !entry.done })}
                      className={
                        'mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition ' +
                        (entryDone
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'border border-slate-300 text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700')
                      }
                    >
                      {entryDone ? '已完成 ✅' : '完成 ✅'}
                    </button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={addEntry}
            className="mb-3 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            ＋ 添加一条
          </button>
        </Section>

        {/* 标签 */}
        <Section title="标签">
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            标签
          </label>
          <TagSelect value={tags} onChange={setTags} />
        </Section>

        {/* 工地项目（自动成为便签标签） */}
        <Section title="工地项目">
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            工地项目（自动成为便签标签）
          </label>
          {/* 词库候选：跨编辑器共享的历史工地项目，点击可快速加入/移出 tags */}
          {(() => {
            void forceRefresh; // 删除词库后触发重新读取候选列表
            const candidates = getSiteProjects();
            if (candidates.length === 0) return null;
            return (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  词库候选：
                </span>
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
                            ? 'bg-amber-500 text-white hover:bg-amber-400'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600')
                        }
                      >
                        {name}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            window.confirm(`确定从工地项目词库中删除"${name}"吗？`)
                          ) {
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
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => addSiteProject(siteInput)}
              className="rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-400"
            >
              ＋ 添加
            </button>
          </div>
          {siteProjects.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {siteProjects.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
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
        </Section>

        {/* 操作按钮 */}
        <Section title="操作">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {isEdit && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(initial)}
                  className="rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  删除
                </button>
              )}
              {isEdit && (
                <button
                  type="button"
                  onClick={() => setDone(!done)}
                  className="rounded-md px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                >
                  {done ? '重新激活' : '完成'}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
              >
                保存
              </button>
            </div>
          </div>
        </Section>
      </form>
    </div>
  );
}
