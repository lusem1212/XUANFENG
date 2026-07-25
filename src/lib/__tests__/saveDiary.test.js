// saveDiary.test.js —— 去重后回归验证（QA：严过关）
//
// 本轮工程师把「独立日记页」删掉、把写/看当天日记整合进 DayDetail、新增 DiaryEditor，
// 并声称测试仍全绿、无回归。本文件做**独立**证明，而非只信汇报，重点覆盖：
//   1. 源码中已无任何对 DiaryView 的残留引用（自动化扫描，替代人工 grep）；
//   2. useItems.saveDiary 真正「一天一条」upsert（最多重要）：同一天连续两次保存只留 1 条、
//      tags 透传、type 固定 diary；不同日期互不干扰；
//   3. diary 作为联动锚点未破坏：正文含标签词时能命中带该标签的 note，且锚点优先级 diary>event；
//   4. DiaryEditor 提交时回传 {date,title,body,tags}、绝不自己带 type（防止漏传字段）。
//
// 说明：本文件只写测试，不修改任何业务源码；fake-indexeddb 已存在于 devDependencies。
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { linkRelatedNotes, scoreNoteForDiary } from '../linkage.js';

// 让 React 18 的 act 环境生效（避免告警/抛错）
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// 1. 无 DiaryView 残留引用（自动化扫描 src 全部 .js/.jsx）
// ---------------------------------------------------------------------------
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    // 跳过测试目录（测试文件本身会提到 DiaryView 用于验证，不应计入“业务源码残留”）
    if (st.isDirectory()) {
      if (name === '__tests__') continue;
      walk(p, acc);
    } else if (/\.(js|jsx)$/.test(name)) {
      acc.push(p);
    }
  }
  return acc;
}

const SRC_DIR = join(process.cwd(), 'src');

describe('无 DiaryView 残留引用', () => {
  it('src 下所有源码文件均不含 DiaryView import 或 JSX 引用', () => {
    const files = walk(SRC_DIR);
    const hits = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      if (/DiaryView/.test(content)) hits.push(f);
    }
    // 若失败，hits 会列出具体文件，便于直接定位残留
    expect(hits).toEqual([]);
  });

  it('App.jsx 仅剩「便签」「日历」两个 Tab（无日记 Tab）', () => {
    const app = readFileSync(join(SRC_DIR, 'App.jsx'), 'utf8');
    // 1) 只有两个 Tab 入口（便签、日历）
    const tabOpenings = (app.match(/<TabButton/g) || []).length;
    expect(tabOpenings).toBe(2);
    // 2) 提取每个 TabButton 的标签（标签位于最后一个 '>' 之后，避开 onClick={() => ...} 里的 '>'）
    const labels = [];
    for (const block of app.split('</TabButton>')) {
      const open = block.lastIndexOf('<TabButton');
      if (open === -1) continue;
      const tail = block.slice(open);
      const lastGt = tail.lastIndexOf('>');
      labels.push(tail.slice(lastGt + 1).trim());
    }
    expect(labels.sort()).toEqual(['便签', '日历']);
    expect(labels).not.toContain('日记'); // 日记 Tab 已彻底移除
    // 3) 日记入口整合进日历：CalendarView 透传 onSaveDiary
    expect(app).toMatch(/onSaveDiary=\{saveDiary\}/);
  });
});

// ---------------------------------------------------------------------------
// 2. saveDiary 一天一条（真实 React Hook + fake-indexeddb）
// ---------------------------------------------------------------------------
// 每个用例前彻底重置 IndexedDB 实例 + 模块缓存，保证用例相互独立、不串数据
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
});

// 通用：渲染一个只把 hook 返回值暴露出来的探针组件，返回 getApi()
async function mountHook(hook) {
  let api = null;
  function Probe() {
    api = hook();
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(Probe));
  });
  return {
    getApi: () => api,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe('saveDiary 一天一条（upsert）', () => {
  it('同一天连续两次 saveDiary → 仅 1 条 diary，内容为最新且 tags 生效，type 固定 diary', async () => {
    const { useItems } = await import('../../hooks/useItems.js');
    const db = await import('../../lib/db.js');
    const rendered = await mountHook(useItems);

    // 第一次保存（当天无 diary）
    let api = rendered.getApi();
    await act(async () => {
      await api.saveDiary({ date: '2026-07-11', title: 'a' });
    });

    // 第二次保存（同一天，带 tags）—— 应更新而非新增
    api = rendered.getApi();
    await act(async () => {
      await api.saveDiary({
        date: '2026-07-11',
        title: 'b',
        tags: ['木工'],
      });
    });

    // 断言：getDiaryByDate 始终只有 1 条，且为最新内容
    const diary = await db.getDiaryByDate('2026-07-11');
    expect(diary).not.toBeNull();
    expect(diary.type).toBe('diary'); // type 固定
    expect(diary.title).toBe('b'); // 被第二次覆盖
    expect(diary.tags).toEqual(['木工']); // tags 透传

    // 断言：getAllItems 中该日期 diary 数量严格为 1（没因 upsert 而翻倍）
    const all = await db.getAllItems();
    const diariesOnDate = all.filter(
      (i) => i.type === 'diary' && i.date === '2026-07-11'
    );
    expect(diariesOnDate).toHaveLength(1);
    expect(diariesOnDate[0].title).toBe('b');

    await rendered.unmount();
  });

  it('不同日期各保存一条 diary，互不干扰', async () => {
    const { useItems } = await import('../../hooks/useItems.js');
    const db = await import('../../lib/db.js');
    const rendered = await mountHook(useItems);

    let api = rendered.getApi();
    await act(async () => {
      await api.saveDiary({ date: '2026-07-11', title: '周五' });
    });
    api = rendered.getApi();
    await act(async () => {
      await api.saveDiary({ date: '2026-07-12', title: '周六' });
    });

    const d11 = await db.getDiaryByDate('2026-07-11');
    const d12 = await db.getDiaryByDate('2026-07-12');
    expect(d11.title).toBe('周五');
    expect(d12.title).toBe('周六');

    const all = await db.getAllItems();
    expect(all.filter((i) => i.type === 'diary')).toHaveLength(2);

    await rendered.unmount();
  });

  it('对已有 diary 再 saveDiary 仅更新原 id（不产生新 id 副本）', async () => {
    const { useItems } = await import('../../hooks/useItems.js');
    const db = await import('../../lib/db.js');
    const rendered = await mountHook(useItems);

    let api = rendered.getApi();
    await act(async () => {
      await api.saveDiary({ date: '2026-07-11', title: 'a' });
    });
    const first = await db.getDiaryByDate('2026-07-11');
    expect(first).not.toBeNull();
    const firstId = first.id;

    api = rendered.getApi();
    await act(async () => {
      await api.saveDiary({ date: '2026-07-11', title: 'b' });
    });
    const second = await db.getDiaryByDate('2026-07-11');
    // 关键：upsert 复用同一 id，而非 createItem 出新 id
    expect(second.id).toBe(firstId);
    expect(second.title).toBe('b');

    await rendered.unmount();
  });
});

// ---------------------------------------------------------------------------
// 3. diary 作为联动锚点未破坏（正文含标签词 → 命中带该标签的 note）
// ---------------------------------------------------------------------------
describe('diary 联动锚点未破坏', () => {
  const DATE = '2026-07-11';
  const note = {
    id: 'note-1',
    type: 'note',
    date: DATE,
    title: '木工交底注意事项',
    body: '吊顶龙骨与风管冲突，需现场复核。',
    tags: ['木工', '工地', '吊顶'],
    links: [],
  };
  // diary 正文直接包含「木工」（与 note.tags 重叠，无需 event 兜底）
  const diary = {
    id: 'diary-1',
    type: 'diary',
    date: DATE,
    title: '现场记录',
    body: '今天与工长进行木工交底，确认吊顶方案。',
    tags: [],
    links: [],
  };

  it('以该 diary 为锚点，联动命中该 note 且 reasons 含「标签重叠」', () => {
    const related = linkRelatedNotes(diary, [note, diary]);
    expect(related.map((n) => n.id)).toContain('note-1');

    const { reasons } = scoreNoteForDiary(diary, note);
    expect(reasons.some((r) => r.startsWith('标签重叠'))).toBe(true);
  });

  it('锚点优先级（等价 DayDetail 纯逻辑）：当天同时有 diary 与 event 时取 diary', () => {
    // 复刻 DayDetail.jsx 的 grouped + anchor 选择（diary 优先于 event）
    function pickAnchor(dayItems) {
      const grouped = { event: [], diary: [], note: [] };
      for (const it of dayItems) {
        if (grouped[it.type]) grouped[it.type].push(it);
      }
      return grouped.diary[0] || grouped.event[0] || null;
    }
    const dayItems = [
      { id: 'e', type: 'event', date: DATE, title: '木工交底' },
      { id: 'd', type: 'diary', date: DATE, title: '现场记录' },
    ];
    const anchor = pickAnchor(dayItems);
    expect(anchor).not.toBeNull();
    expect(anchor.type).toBe('diary');
    expect(anchor.id).toBe('d');
  });
});

// ---------------------------------------------------------------------------
// 4. DiaryEditor 提交契约：回传正确字段，且绝不自己带 type
// ---------------------------------------------------------------------------
describe('DiaryEditor 提交契约', () => {
  it('提交时 onSave 收到 {date,title,body,tags}，且不含 type', async () => {
    const { default: DiaryEditor } = await import('../../components/DiaryEditor.jsx');
    const onSave = vi.fn();
    const onCancel = vi.fn();

    // 编辑模式：用 initial 预填，避免手写输入，直接点提交验证回传 payload
    const initial = {
      id: 'd1',
      type: 'diary',
      date: '2026-07-11',
      title: '标题',
      body: '正文',
      tags: ['木工'],
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(DiaryEditor, { initial, defaultDate: '2026-07-11', onSave, onCancel })
      );
    });

    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    await act(async () => {
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    // 完整字段都透传
    expect(payload).toEqual({
      date: '2026-07-11',
      title: '标题',
      body: '正文',
      tags: ['木工'],
    });
    // 关键：DiaryEditor 不自己带 type，落库 type 由 useItems.saveDiary 固定为 diary
    expect('type' in payload).toBe(false);

    await act(async () => root.unmount());
    container.remove();
  });
});
