// NoteEditor.v4.test.jsx —— v4 增量测试（QA：严过关）
// 覆盖 v4 三处改动：
//   C1 关闭 + 滚动 + Esc：遮罩点击空白关闭、表单内点击不关（stopPropagation）、Esc 关闭；
//       并验证「取消」按钮仍走 handleCancel → flush 自动保存链路（v3 链路未被破坏）。
//   C2-a 编辑器条目时间后置小字：时间从独立色块（w-28）改为 textarea 下方 text-xs 小字。
//   C3-a 分区：文件内局部 Section 组件，border-t 分隔线 + 小号加粗标题，包裹 6 个区块。
import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import NoteEditor from '../NoteEditor.jsx';

afterEach(cleanup);

function renderEditor(props = {}) {
  const handlers = {
    onSave: vi.fn(),
    onSaved: vi.fn(),
    onCancel: vi.fn(),
    onDelete: vi.fn(),
  };
  const utils = render(<NoteEditor initial={null} {...handlers} {...props} />);
  return { ...utils, ...handlers };
}

// 判断 node 是否出现在 reference 之后（文档顺序）
function isAfter(reference, node) {
  return (
    (reference.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !==
    0
  );
}

// ───────────────────────── C1：关闭 + 滚动 + Esc ─────────────────────────

describe('NoteEditor v4(C1) — 背景点击空白关闭', () => {
  it('点击遮罩外层 div（非 form 内）触发 handleCancel → onCancel 被调用（编辑器关闭）', () => {
    const { container, onCancel } = renderEditor();

    // 最外层遮罩 div（fixed inset-0 … bg-black/30）
    const overlay = container.firstChild;
    expect(overlay).not.toBeNull();
    expect(overlay.className).toContain('fixed');
    expect(overlay.className).toContain('inset-0');

    fireEvent.click(overlay);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('NoteEditor v4(C1) — 表单内部点击不关闭', () => {
  it('点击 form 内部元素（标题输入）不触发 onCancel（onClick stopPropagation 生效）', () => {
    const { onCancel } = renderEditor();

    // 标题输入在 form 内部，其 click 冒泡到 form 后被 stopPropagation 拦截
    const titleInput = screen.getByPlaceholderText('项目名称');
    fireEvent.click(titleInput);

    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('NoteEditor v4(C1) — Esc 关闭', () => {
  it('在 window 上派发 Escape keydown → handleCancel → onCancel 被调用', () => {
    const { onCancel } = renderEditor();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('NoteEditor v4(C1) — 「取消」按钮保留 v3 flush 自动保存链路', () => {
  it('点击「取消」：flush 立即落库（防丢）并关闭编辑器（onCancel）', () => {
    const { onSave, onCancel } = renderEditor();

    const titleInput = screen.getByPlaceholderText('项目名称');
    fireEvent.change(titleInput, { target: { value: '带内容便签' } });

    // 不等防抖计时器，直接点取消 → handleCancel → flush 立即落库
    fireEvent.click(screen.getByText('取消'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].title).toBe('带内容便签');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// ───────────────────── C2-a：编辑器条目时间后置小字 ─────────────────────

describe('NoteEditor v4(C2-a) — 条目时间后置为 text-xs 小字', () => {
  it('时间渲染为 text-xs 小字、位于 textarea 之后，且不再有独立 w-28 色块', () => {
    const initial = {
      id: 'e1',
      type: 'note',
      title: '项目A',
      body: [{ time: '07-24 17:26', text: '本次巡检记录' }],
      tags: [],
      done: false,
      date: '2026-07-24',
    };
    const { container } = renderEditor({ initial });

    // 时间小字：text-xs 且文本符合 MM-DD HH:MM
    const timeSpan = screen.getByText('07-24 17:26');
    expect(timeSpan.className).toContain('text-xs');
    expect(timeSpan.textContent).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/);

    // 时间位于 textarea（条目文本）之后
    const textarea = screen.getByDisplayValue('本次巡检记录');
    expect(isAfter(textarea, timeSpan)).toBe(true);

    // 旧 v3 的独立色块（w-28）已被移除
    expect(container.querySelector('.w-28')).toBeNull();
  });
});

// ─────────────────────── C3-a：分区 Section 分隔线 ───────────────────────

describe('NoteEditor v4(C3-a) — 局部 Section 分区', () => {
  it('渲染多个 Section 区块（含 border-t 分隔线 + 小号加粗标题）', () => {
    const { container } = renderEditor();

    // 至少 5 个 Section（项目名称/正文/标签/工地项目/操作；v6 已移除「日期（可选）」）
    const sections = container.querySelectorAll('section');
    expect(sections.length).toBeGreaterThanOrEqual(5);

    // 分隔线样式：存在 border-t 类
    expect(container.querySelector('.border-t')).not.toBeNull();

    // 区块标题为小号加粗（text-sm font-semibold）
    const titleEls = container.querySelectorAll('section > h3');
    expect(titleEls.length).toBeGreaterThanOrEqual(5);
    expect(titleEls[0].className).toContain('text-sm');
    expect(titleEls[0].className).toContain('font-semibold');

    // 关键区块标题均存在（h3 + label 同文本，故用 getAllByText 容错）
    ['项目名称', '正文', '标签', '工地项目', '操作'].forEach(
      (t) => {
        expect(screen.getAllByText(t).length).toBeGreaterThanOrEqual(1);
      }
    );
  });
});
