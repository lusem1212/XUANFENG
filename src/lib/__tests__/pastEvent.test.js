// pastEvent.test.js —— 过期事件划线判定逻辑单测（QA：严过关）
// 覆盖需求1：DayDetail.jsx 中内联的 isPast 谓词
//   const isPast = type === ITEM_TYPES.EVENT && it.date && it.date < today();
// 该条件为内联表达式，这里复刻同一表达式以验证其边界语义正确性。
// 覆盖需求4：双击编辑仅对事件类型生效的语义（onDoubleClick 条件）。
import { describe, it, expect } from 'vitest';
import { ITEM_TYPES, today } from '../model.js';

// 复刻 DayDetail.jsx 第138行的 isPast 谓词（逐字符一致）
function isPast(type, it) {
  return type === ITEM_TYPES.EVENT && it.date && it.date < today();
}

// 复刻 DayDetail.jsx 第142行的双击条件
function hasDoubleClick(type) {
  return type === ITEM_TYPES.EVENT;
}

describe('过期事件划线判定 isPast', () => {
  it('昨天的事件：划线（isPast 为 truthy）', () => {
    const t = today();
    const yesterday = shiftDate(t, -1);
    expect(isPast(ITEM_TYPES.EVENT, { date: yesterday })).toBeTruthy();
  });

  it('当天事件：不划线（isPast 为 falsy）', () => {
    // today() == today() → 不满足 it.date < today()，且 && 返回 false
    expect(isPast(ITEM_TYPES.EVENT, { date: today() })).toBeFalsy();
  });

  it('未来事件：不划线（isPast 为 falsy）', () => {
    const t = today();
    const tomorrow = shiftDate(t, 1);
    expect(isPast(ITEM_TYPES.EVENT, { date: tomorrow })).toBeFalsy();
  });

  it('事件无日期：不划线（isPast 为 falsy，短路返回空串）', () => {
    // it.date='' 为 falsy，&& 短路返回 ''（falsy），三元判定不划线 → 正确
    expect(isPast(ITEM_TYPES.EVENT, { date: '' })).toBeFalsy();
    expect(isPast(ITEM_TYPES.EVENT, {})).toBeFalsy();
  });

  it('便签类型即使日期过期：不划线（isPast 为 falsy）', () => {
    const yesterday = shiftDate(today(), -1);
    expect(isPast(ITEM_TYPES.NOTE, { date: yesterday })).toBeFalsy();
  });

  it('日记类型即使日期过期：不划线（isPast 为 falsy）', () => {
    const yesterday = shiftDate(today(), -1);
    expect(isPast(ITEM_TYPES.DIARY, { date: yesterday })).toBeFalsy();
  });

  it('YYYY-MM-DD 字符串字典序与日期序一致（边界安全）', () => {
    // 跨年、跨月、补零边界
    expect('2025-12-31' < '2026-01-01').toBe(true);
    expect('2026-01-01' < '2026-01-02').toBe(true);
    expect('2026-09-30' < '2026-10-01').toBe(true);
    // 补零：'2026-1-1' 会被字典序误判，但 today() 总是补零，故安全
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('双击编辑仅事件生效（hasDoubleClick）', () => {
  it('事件类型：可双击编辑', () => {
    expect(hasDoubleClick(ITEM_TYPES.EVENT)).toBe(true);
  });

  it('便签类型：双击无反应', () => {
    expect(hasDoubleClick(ITEM_TYPES.NOTE)).toBe(false);
  });

  it('日记类型：双击无反应', () => {
    expect(hasDoubleClick(ITEM_TYPES.DIARY)).toBe(false);
  });
});

// 工具：把 YYYY-MM-DD 偏移 n 天，返回同格式字符串（本地时区）
function shiftDate(yyyyMmDd, n) {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
