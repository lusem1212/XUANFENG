// NoteEditor.entryDone.test.jsx —— v7 增量测试（QA：严过关）
// 覆盖「每条正文后加完成开关」：
//   - 点击「完成」→ 该 entry 的 textarea 获得灰色 class + 按钮文案变「已完成 ✅」
//   - 再次点击「已完成 ✅」→ textarea 恢复非灰 + 按钮文案变回「完成」
//   - 历史已完成条目（done:true）初始即灰显 + 按钮显示「已完成 ✅」
import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import NoteEditor from '../NoteEditor.jsx';

afterEach(cleanup);

// 注意：initial 不带 id（新建态），使「操作」区的便签级完成按钮不渲染，
// 仅条目级「完成」开关出现，避免 getByText('完成') 多匹配。
function renderEditor(initial) {
  const handlers = {
    onSave: vi.fn(),
    onSaved: vi.fn(),
    onCancel: vi.fn(),
    onDelete: vi.fn(),
  };
  const utils = render(<NoteEditor initial={initial} {...handlers} />);
  return { ...utils, ...handlers };
}

const entryBase = {
  type: 'note',
  title: '项目A',
  body: [{ time: '07-24 17:26', text: '本次巡检记录', done: false }],
  tags: [],
  done: false,
  date: '2026-07-24',
};

describe('NoteEditor v7 — 条目完成开关：点击完成变灰', () => {
  it('点击「完成」→ textarea 获得灰色 class 且按钮文案变「已完成 ✅」', () => {
    renderEditor(entryBase);

    const textarea = screen.getByDisplayValue('本次巡检记录');
    expect(textarea.className).not.toContain('text-slate-400');

    fireEvent.click(screen.getByText('完成 ✅'));

    const updated = screen.getByDisplayValue('本次巡检记录');
    expect(updated.className).toContain('text-slate-400');
    expect(updated.className).toContain('dark:text-slate-500');
    expect(screen.getByText('已完成 ✅')).toBeInTheDocument();
  });
});

describe('NoteEditor v7 — 条目完成开关：再次点击恢复', () => {
  it('再次点击「已完成 ✅」→ textarea 恢复非灰且按钮文案变回「完成」', () => {
    renderEditor(entryBase);

    fireEvent.click(screen.getByText('完成 ✅'));
    expect(screen.getByText('已完成 ✅')).toBeInTheDocument();

    fireEvent.click(screen.getByText('已完成 ✅'));
    const restored = screen.getByDisplayValue('本次巡检记录');
    expect(restored.className).not.toContain('text-slate-400');
    expect(screen.getByText('完成 ✅')).toBeInTheDocument();
  });
});

describe('NoteEditor v7 — 历史已完成条目初始灰显', () => {
  it('done:true 的历史条目初始即 textarea 灰显 + 按钮显示「已完成 ✅」', () => {
    renderEditor({
      ...entryBase,
      body: [{ time: '07-24 18:00', text: '已完成的历史条目', done: true }],
    });

    const textarea = screen.getByDisplayValue('已完成的历史条目');
    expect(textarea.className).toContain('text-slate-400');
    expect(textarea.className).toContain('dark:text-slate-500');
    expect(screen.getByText('已完成 ✅')).toBeInTheDocument();
  });
});
