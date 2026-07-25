// NoteList.entryDone.test.jsx —— v7 增量测试（QA：严过关）
// 覆盖：条目 done:true 时，列表卡片正文条目 div 整体变灰（text-slate-400），且保留文本信息。
import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import NoteList from '../NoteList.jsx';

afterEach(cleanup);

function renderNoteList(notes) {
  const handlers = {
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onToggleDone: vi.fn(),
  };
  const utils = render(<NoteList notes={notes} {...handlers} />);
  return { ...utils, ...handlers };
}

describe('NoteList v7 — 条目完成态灰显', () => {
  it('body 含 {text:"x", done:true} 的 note → 该条正文 div 含 text-slate-400 灰色 class', () => {
    renderNoteList([
      {
        id: 'n1',
        type: 'note',
        title: '测试便签',
        body: [{ text: 'x', done: true }],
        tags: [],
        done: false,
        date: '2026-07-24',
      },
    ]);

    const text = screen.getByText('x');
    expect(text).toBeInTheDocument();
    const entryDiv = text.closest('div');
    expect(entryDiv.className).toContain('text-slate-400');
    expect(entryDiv.className).toContain('dark:text-slate-500');
  });

  it('body 条目 done 为 false → 条目 div 不变灰', () => {
    renderNoteList([
      {
        id: 'n2',
        type: 'note',
        title: '进行中便签',
        body: [{ text: '进行中条目', done: false }],
        tags: [],
        done: false,
        date: '2026-07-24',
      },
    ]);

    const text = screen.getByText('进行中条目');
    const entryDiv = text.closest('div');
    expect(entryDiv.className).not.toContain('text-slate-400');
  });
});
