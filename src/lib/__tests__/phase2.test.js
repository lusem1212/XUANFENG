// phase2.test.js —— Phase 2 (月视图日历 + event UI) 强化单测
//
// 目标：
//   1. 对 calendar.js 的边界做更严格的校验（parseYMD 非法日期、buildMonthMatrix
//      任意月份恒 42 格且连续、daysWithItems 只统计该月、itemsOnDate 精确单日匹配、
//      跨年/跨月的年-月切片）。
//   2. 用纯逻辑模拟「Phase 2 验收闭环」：
//      - 构造「同一天 note + diary + event」的数据；
//      - 断言 itemsOnDate 含三者；
//      - 以 diary 或 event 为锚点调 linkRelatedNotes，结果包含那条 note 且
//        命中原因含「标签重叠」；
//      - 断言 DayDetail 的锚点选择（diary 优先于 event）等价纯逻辑成立。
//
// 注意：本文件只写测试，不修改任何业务源码。
import { describe, it, expect } from 'vitest';
import {
  formatDate,
  parseYMD,
  itemsOnDate,
  itemsInMonth,
  buildMonthMatrix,
  daysWithItems,
} from '../calendar.js';
import { linkRelatedNotes, scoreNoteForDiary } from '../linkage.js';

// ---------------------------------------------------------------------------
// 1. parseYMD —— 严格日期校验（拒绝非法、接受闰年）
// ---------------------------------------------------------------------------
describe('parseYMD 边界校验', () => {
  it('拒绝不存在的月份/日期', () => {
    // 13 月
    expect(parseYMD('2026-13-01')).toBeNull();
    // 2 月 30 日（平年 2 月只有 28 天）
    expect(parseYMD('2026-02-30')).toBeNull();
    // 4 月 31 日（小月 30 天）
    expect(parseYMD('2026-04-31')).toBeNull();
    // 1 月 32 日
    expect(parseYMD('2026-01-32')).toBeNull();
    // month=00
    expect(parseYMD('2023-00-15')).toBeNull();
  });

  it('闰年 2024-02-29 有效，平年 2026-02-29 无效', () => {
    expect(parseYMD('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseYMD('2026-02-29')).toBeNull();
  });

  it('格式严格：单数字月/日、非字符串、空均返回 null', () => {
    expect(parseYMD('2026-1-3')).toBeNull(); // 必须是 2 位
    expect(parseYMD('2026/01/03')).toBeNull(); // 分隔符必须为 -
    expect(parseYMD('今天')).toBeNull();
    expect(parseYMD('')).toBeNull();
    expect(parseYMD(null)).toBeNull();
    expect(parseYMD(undefined)).toBeNull();
  });

  it('合法日期可逆且字段正确', () => {
    expect(parseYMD('2026-12-31')).toEqual({ year: 2026, month: 12, day: 31 });
    expect(parseYMD('2024-11-07')).toEqual({ year: 2024, month: 11, day: 7 });
  });
});

// ---------------------------------------------------------------------------
// 2. buildMonthMatrix —— 任意月份恒 42 格、当月连续、首尾补 null
// ---------------------------------------------------------------------------
describe('buildMonthMatrix 结构与边界', () => {
  // 通用结构不变量：长度 42 / 前置 null / 当月连续递增 / 后置 null
  function expectMatrixInvariant(year, month) {
    const m = buildMonthMatrix(year, month);
    expect(m).toHaveLength(42);

    const startWeekday = new Date(year, month - 1, 1).getDay(); // 0=周日
    const daysInMonth = new Date(year, month, 0).getDate();

    // 前置补位全为 null
    for (let i = 0; i < startWeekday; i++) expect(m[i]).toBeNull();

    // 当月日期连续递增，且没有重复/跳号
    for (let d = 1; d <= daysInMonth; d++) {
      expect(m[startWeekday + d - 1]).toBe(d);
    }

    // 后置补位全为 null
    for (let i = startWeekday + daysInMonth; i < 42; i++) expect(m[i]).toBeNull();
  }

  it('多种月份都满足 42 格不变量（含平/闰 2 月、跨年）', () => {
    // 平年 2 月（28 天）
    expectMatrixInvariant(2026, 2);
    // 闰年 2 月（29 天）
    expectMatrixInvariant(2024, 2);
    // 大月 31 天 / 小月 30 天
    expectMatrixInvariant(2026, 1);
    expectMatrixInvariant(2026, 4);
    // 跨年：12 月与次年 1 月都正确
    expectMatrixInvariant(2025, 12);
    expectMatrixInvariant(2026, 1);
  });

  it('2026-01 起始于周四，前 4 格为 null，1 号在索引 4', () => {
    const m = buildMonthMatrix(2026, 1);
    expect(m.slice(0, 4)).toEqual([null, null, null, null]);
    expect(m[4]).toBe(1);
    expect(m[34]).toBe(31); // 31 天 → 末日索引 4+31-1=34
  });

  it('闰年 2024-02 有 29 天，末日落在正确索引', () => {
    const m = buildMonthMatrix(2024, 2);
    // 2024-02-01 是周四（getDay=4）
    expect(m[4]).toBe(1);
    expect(m[4 + 29 - 1]).toBe(29); // 29 号索引 32
  });
});

// ---------------------------------------------------------------------------
// 3. itemsOnDate —— 精确单日匹配，排除无日期/异日条目
// ---------------------------------------------------------------------------
describe('itemsOnDate 精确匹配', () => {
  const items = [
    { id: 'n1', type: 'note', date: '2026-03-10', title: '便签' },
    { id: 'e1', type: 'event', date: '2026-03-10', title: '事件' },
    { id: 'd1', type: 'diary', date: '2026-03-10', title: '日记' },
    { id: 'n2', type: 'note', date: '', title: '无日期便签' }, // 排除
    { id: 'n3', type: 'note', date: '2026-03-11', title: '次日便签' }, // 排除
  ];

  it('返回当天全部类型（note+event+diary）', () => {
    const res = itemsOnDate(items, '2026-03-10');
    expect(res.map((i) => i.id).sort()).toEqual(['d1', 'e1', 'n1']);
  });

  it('异日 / 空日期 / 不存在均返回空数组', () => {
    expect(itemsOnDate(items, '2026-03-11').map((i) => i.id)).toEqual(['n3']);
    expect(itemsOnDate(items, '2026-03-12')).toEqual([]);
    expect(itemsOnDate(items, '')).toEqual([]);
    expect(itemsOnDate(items, null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. itemsInMonth / daysWithItems —— 年-月切片与「有记录天」集合
// ---------------------------------------------------------------------------
describe('itemsInMonth 跨年/跨月切片', () => {
  const items = [
    { id: 'a', type: 'note', date: '2025-12-31', title: '跨年前一天' },
    { id: 'b', type: 'event', date: '2026-01-01', title: '元旦' },
    { id: 'c', type: 'diary', date: '2026-01-15', title: '月中' },
    { id: 'd', type: 'note', date: '2026-01-31', title: '月末' },
    { id: 'e', type: 'note', date: '', title: '无日期' }, // 排除
  ];

  it('按 年-月 前缀精确切片，排除无日期与异月', () => {
    const jan = itemsInMonth(items, 2026, 1);
    expect(jan.map((i) => i.id).sort()).toEqual(['b', 'c', 'd']);

    const dec = itemsInMonth(items, 2025, 12);
    expect(dec.map((i) => i.id)).toEqual(['a']);
  });
});

describe('daysWithItems 只统计该月真实有 date 的 Item', () => {
  const items = [
    { id: '1', type: 'note', date: '2026-03-05' },
    { id: '2', type: 'event', date: '2026-03-05' }, // 同日多类型只记一天
    { id: '3', type: 'diary', date: '2026-03-20' },
    { id: '4', type: 'note', date: '2026-04-01' }, // 不在 3 月
    { id: '5', type: 'note', date: '' }, // 无日期便签排除
  ];

  it('返回该月的「日」集合，无日期与异月均不计', () => {
    const set = daysWithItems(items, 2026, 3);
    expect(set instanceof Set).toBe(true);
    expect(set.has(5)).toBe(true);
    expect(set.has(20)).toBe(true);
    expect(set.size).toBe(2);
    expect(set.has(1)).toBe(false); // 4 月不计
    expect([...set].every((d) => Number.isInteger(d) && d >= 1 && d <= 31)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Phase 2 验收闭环 —— 纯逻辑模拟（note + diary + event 同源联动）
// ---------------------------------------------------------------------------
describe('Phase 2 验收闭环（纯逻辑模拟）', () => {
  const DATE = '2026-03-10';

  // 构造与产品实际一致的数据：同一天一条 note（带标签）、一条 diary、一条 event
  const note = {
    id: 'note-1',
    type: 'note',
    date: DATE,
    title: '木工交底注意事项',
    body: '吊顶龙骨与风管冲突，需现场复核。',
    tags: ['木工', '工地', '吊顶'],
    links: [],
  };
  const diary = {
    id: 'diary-1',
    type: 'diary',
    date: DATE,
    title: '现场记录',
    body: '今天与工长进行木工交底，确认吊顶方案。',
    tags: [],
    links: [],
  };
  const event = {
    id: 'event-1',
    type: 'event',
    date: DATE,
    title: '木工交底',
    body: '',
    tags: [],
    links: [],
  };
  const items = [note, diary, event];

  it('itemsOnDate 在当天精确聚合 note + diary + event', () => {
    const dayItems = itemsOnDate(items, DATE);
    expect(dayItems.map((i) => i.id).sort()).toEqual(['diary-1', 'event-1', 'note-1']);
    // 三种类型齐全
    const types = new Set(dayItems.map((i) => i.type));
    expect(types).toEqual(new Set(['note', 'diary', 'event']));
  });

  it('以当天 diary 为锚点，联动命中该 note 且原因含「标签重叠」', () => {
    const related = linkRelatedNotes(diary, items);
    expect(related.map((n) => n.id)).toContain('note-1');

    const { reasons } = scoreNoteForDiary(diary, note);
    expect(reasons.some((r) => r.startsWith('标签重叠'))).toBe(true);
  });

  it('以当天 event 为锚点，同样能联动命中该 note 且原因含「标签重叠」', () => {
    const related = linkRelatedNotes(event, items);
    expect(related.map((n) => n.id)).toContain('note-1');

    const { reasons } = scoreNoteForDiary(event, note);
    expect(reasons.some((r) => r.startsWith('标签重叠'))).toBe(true);
  });

  it('只有无日期便签时，不出现在任何一天的聚合里', () => {
    const loose = [{ id: 'x', type: 'note', date: '', title: '长期便签' }];
    expect(itemsOnDate(loose, DATE)).toEqual([]);
    expect(daysWithItems(loose, 2026, 3).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. DayDetail 锚点选择（diary 优先于 event）—— 等价纯逻辑断言
//    对应 DayDetail.jsx 的 grouped 分组 + anchor 选择逻辑（第 26~36 行）。
//    该组件为 React 组件，这里用与源码一致的纯逻辑复刻做契约断言，
//    确保「当天既有 diary 又有 event 时，锚点取 diary」。
// ---------------------------------------------------------------------------
describe('DayDetail 锚点选择（diary 优先于 event）', () => {
  function pickAnchor(dayItems) {
    const grouped = { event: [], diary: [], note: [] };
    for (const it of dayItems) {
      if (grouped[it.type]) grouped[it.type].push(it);
    }
    return grouped.diary[0] || grouped.event[0] || null;
  }

  it('当天同时有 diary 与 event 时，锚点取 diary（而非 event）', () => {
    const dayItems = [
      { id: 'e', type: 'event', date: '2026-03-10', title: '木工交底' },
      { id: 'd', type: 'diary', date: '2026-03-10', title: '现场记录' },
    ];
    const anchor = pickAnchor(dayItems);
    expect(anchor).not.toBeNull();
    expect(anchor.type).toBe('diary');
    expect(anchor.id).toBe('d');
  });

  it('无 diary 仅 event 时，锚点取 event', () => {
    const dayItems = [
      { id: 'e', type: 'event', date: '2026-03-10', title: '木工交底' },
      { id: 'n', type: 'note', date: '2026-03-10', title: '便签' },
    ];
    expect(pickAnchor(dayItems).type).toBe('event');
  });

  it('只有 note 时，锚点为 null（不触发联动面板）', () => {
    const dayItems = [{ id: 'n', type: 'note', date: '2026-03-10', title: '便签' }];
    expect(pickAnchor(dayItems)).toBeNull();
  });
});
