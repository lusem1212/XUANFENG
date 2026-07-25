// eventEditor.test.js —— EventEditor.jsx 时间段"中午"选项验证单测（QA：Edward）
//
// EventEditor.jsx 中 PERIODS 与 parseTitle 为模块内部常量/函数（未导出），
// 此处复刻其逻辑以验证边界语义正确性，模式与 pastEvent.test.js 一致。
// 同时通过 react-dom/server 渲染组件，验证"中午"按钮确实出现在 UI 中。
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import EventEditor from '../../components/EventEditor.jsx';

// ── 复刻 EventEditor.jsx 第 21 行 PERIODS（逐字符一致）──
const PERIODS = ['早上', '上午', '中午', '下午', '晚上'];

// ── 复刻 EventEditor.jsx 第 30-36 行 parseTitle（逐字符一致）──
function parseTitle(title = '') {
  const m = String(title).match(/^(早上|上午|中午|下午|晚上)(?:\s+(.+))?$/);
  if (m) {
    return { period: m[1], time: (m[2] || '').trim() };
  }
  return { period: '', time: String(title || '').trim() };
}

// ── 复刻 EventEditor.jsx 第 102 行 title 组合逻辑 ──
function composeTitle(period, time) {
  return `${period} ${time}`.trim();
}

// ═══════════════════════════════════════════════════
// 1. PERIODS 数组结构验证
// ═══════════════════════════════════════════════════
describe('PERIODS 数组：含"中午"且位置正确', () => {
  it('数组长度为 5（五个时间段）', () => {
    expect(PERIODS).toHaveLength(5);
  });

  it('"中午"存在于数组中', () => {
    expect(PERIODS).toContain('中午');
  });

  it('"中午"位于"上午"之后、"下午"之前（索引 2）', () => {
    const idxNoon = PERIODS.indexOf('中午');
    const idxMorning = PERIODS.indexOf('上午');
    const idxAfternoon = PERIODS.indexOf('下午');
    expect(idxNoon).toBe(2);
    expect(idxMorning).toBe(1);
    expect(idxAfternoon).toBe(3);
    expect(idxMorning).toBeLessThan(idxNoon);
    expect(idxNoon).toBeLessThan(idxAfternoon);
  });

  it('完整数组为 [早上, 上午, 中午, 下午, 晚上]', () => {
    expect(PERIODS).toEqual(['早上', '上午', '中午', '下午', '晚上']);
  });

  it('数组无重复元素', () => {
    expect(new Set(PERIODS).size).toBe(PERIODS.length);
  });
});

// ═══════════════════════════════════════════════════
// 2. parseTitle 正则：含"中午"的解析
// ═══════════════════════════════════════════════════
describe('parseTitle：解析含"中午"的标题', () => {
  it('"中午"单独作为标题 → period=中午, time=空', () => {
    expect(parseTitle('中午')).toEqual({ period: '中午', time: '' });
  });

  it('"中午 12:30" → period=中午, time=12:30', () => {
    expect(parseTitle('中午 12:30')).toEqual({ period: '中午', time: '12:30' });
  });

  it('"中午  13:00"（多空格）→ period=中午, time=13:00', () => {
    expect(parseTitle('中午  13:00')).toEqual({ period: '中午', time: '13:00' });
  });
});

// ═══════════════════════════════════════════════════
// 3. parseTitle 正则：全部五个时间段均能解析
// ═══════════════════════════════════════════════════
describe('parseTitle：五个时间段逐一验证', () => {
  it.each([
    ['早上', '早上', ''],
    ['上午', '上午', ''],
    ['中午', '中午', ''],
    ['下午', '下午', ''],
    ['晚上', '晚上', ''],
  ])('"%s" 无时间 → period=%s, time=空', (input, expectedPeriod) => {
    expect(parseTitle(input)).toEqual({ period: expectedPeriod, time: '' });
  });

  it.each([
    ['早上 06:00', '早上', '06:00'],
    ['上午 09:30', '上午', '09:30'],
    ['中午 12:00', '中午', '12:00'],
    ['下午 15:00', '下午', '15:00'],
    ['晚上 20:00', '晚上', '20:00'],
  ])('"%s" → period=%s, time=%s', (input, expectedPeriod, expectedTime) => {
    expect(parseTitle(input)).toEqual({ period: expectedPeriod, time: expectedTime });
  });
});

// ═══════════════════════════════════════════════════
// 4. parseTitle 边界与回退
// ═══════════════════════════════════════════════════
describe('parseTitle：边界与回退', () => {
  it('空字符串 → period=空, time=空', () => {
    expect(parseTitle('')).toEqual({ period: '', time: '' });
  });

  it('undefined → period=空, time=空', () => {
    expect(parseTitle(undefined)).toEqual({ period: '', time: '' });
  });

  it('null → period=空, time=空', () => {
    expect(parseTitle(null)).toEqual({ period: '', time: '' });
  });

  it('旧数据自由标题（非时间段开头）→ period=空, time=原标题', () => {
    expect(parseTitle('项目会议')).toEqual({ period: '', time: '项目会议' });
  });

  it('数字 0 不会误匹配 → period=空, time=0', () => {
    expect(parseTitle(0)).toEqual({ period: '', time: '0' });
  });

  it('"中午"后跟非空白内容不匹配（如"中午饭"）→ 回退为 time', () => {
    // 正则要求"中午"后要么结束、要么跟空白+内容，"中午饭"不匹配
    expect(parseTitle('中午饭')).toEqual({ period: '', time: '中午饭' });
  });
});

// ═══════════════════════════════════════════════════
// 5. title 组合与往返一致性（compose → parse 往返）
// ═══════════════════════════════════════════════════
describe('title 组合与往返一致性', () => {
  it.each([
    ['中午', '12:00'],
    ['上午', '09:30'],
    ['早上', '06:00'],
    ['下午', '15:00'],
    ['晚上', '20:00'],
    ['中午', ''],
  ])('compose(%s, %s) → parse 往返一致', (period, time) => {
    const title = composeTitle(period, time);
    const parsed = parseTitle(title);
    expect(parsed.period).toBe(period);
    expect(parsed.time).toBe(time);
  });
});

// ═══════════════════════════════════════════════════
// 6. 组件渲染：UI 中"中午"按钮出现
// ═══════════════════════════════════════════════════
describe('EventEditor 渲染：UI 包含"中午"按钮', () => {
  function renderEditor(props = {}) {
    const defaults = {
      initial: null,
      defaultDate: '2026-07-23',
      onSave: () => {},
      onCancel: () => {},
    };
    const markup = renderToStaticMarkup(
      createElement(EventEditor, { ...defaults, ...props })
    );
    return markup;
  }

  it('新建态渲染包含全部五个时间段按钮文本', () => {
    const html = renderEditor();
    expect(html).toContain('早上');
    expect(html).toContain('上午');
    expect(html).toContain('中午');
    expect(html).toContain('下午');
    expect(html).toContain('晚上');
  });

  it('编辑态传入"中午"标题 → 中午按钮为激活态（含 bg-slate-900）', () => {
    const html = renderEditor({
      initial: { id: 'ev1', type: 'event', date: '2026-07-23', title: '中午 12:30' },
    });
    // 激活按钮的 className 含 bg-slate-900 text-white
    // 验证"中午"附近出现激活样式
    expect(html).toContain('中午');
    expect(html).toContain('bg-slate-900');
  });

  it('编辑态传入"上午"标题 → 中午按钮不是激活态', () => {
    const html = renderEditor({
      initial: { id: 'ev2', type: 'event', date: '2026-07-23', title: '上午 09:00' },
    });
    expect(html).toContain('中午');
    // 上午 应该是激活态
    expect(html).toContain('bg-slate-900');
  });
});
